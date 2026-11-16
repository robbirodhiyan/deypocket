import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as Network from 'expo-network';
import project from '../../../project.config.json';
import { applyDownloadedOta, downloadOta, getOtaEnvironment } from './update-ota';
import { hasUnsavedFinanceDraft } from './ota-draft-guard';

export type OtaPhase =
  | 'idle'
  | 'checking'
  | 'offline'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'unsupported'
  | 'error';

export type OtaSession = {
  phase: OtaPhase;
  message: string;
  showStartupDialog: boolean;
  changelogTitle: string;
  changelog: readonly string[];
  updateId: string | null;
};

const initialState: OtaSession = {
  phase: 'idle',
  message: '',
  showStartupDialog: false,
  changelogTitle: 'Pembaruan DeyPocket tersedia',
  changelog: ['Peningkatan dan perbaikan aplikasi.'],
  updateId: null,
};

let current: OtaSession = initialState;
let startupChecked = false;
let startupDismissed = false;
let running = false;
const listeners = new Set<() => void>();

function publish(next: Partial<OtaSession>): void {
  current = { ...current, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function snapshot(): OtaSession { return current; }

export function useOtaSession(): OtaSession {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

function getError(error: unknown): string {
  return error instanceof Error ? error.message : 'Terjadi kesalahan tidak terduga.';
}

function isConnectionError(message: string): boolean {
  return /network request failed|network is unreachable|internet|offline|timed?\s*out|cannot connect|dns|failed to fetch|connectivity|socket/i.test(message);
}

async function assertOnline(): Promise<void> {
  const status = await Network.getNetworkStateAsync();
  // null means "unknown": allow the real server request to decide.
  if (status.isConnected === false || status.isInternetReachable === false) {
    throw new Error('OFFLINE: Perangkat tidak terhubung ke internet.');
  }
}

function manifestUpdateId(manifest: unknown): string | null {
  if (!manifest || typeof manifest !== 'object') return null;
  const id = (manifest as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 5 ? id : null;
}

// Optional public JSON changelog. Private GitHub credentials are never used.
async function loadChangelog(updateId: string | null): Promise<void> {
  const urlValue = (project as unknown as { updateNotesUrl?: unknown }).updateNotesUrl;
  if (!updateId || typeof urlValue !== 'string') return;

  try {
    const url = new URL(urlValue);
    if (url.protocol !== 'https:') return;
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object') return;
    const entries = (data as { updates?: unknown }).updates;
    if (!Array.isArray(entries)) return;

    const match = entries.find((entry: unknown) =>
      !!entry && typeof entry === 'object' &&
      (entry as { updateId?: unknown }).updateId === updateId
    ) as { title?: unknown; changes?: unknown } | undefined;
    if (!match) return;
    const changes = Array.isArray(match.changes)
      ? match.changes.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 6)
      : [];
    if (changes.length === 0) return;
    if (current.updateId !== updateId) return;
    publish({
      changelogTitle: typeof match.title === 'string' && match.title.trim() ? match.title.trim() : current.changelogTitle,
      changelog: changes,
    });
  } catch {
    // Changelog failures must never prevent using DeyPocket or receiving OTA.
  }
}

export async function checkOtaSession(showStartupDialog = false): Promise<void> {
  if (running || current.phase === 'downloading' || current.phase === 'ready') return;
  running = true;
  publish({ phase: 'checking', message: 'Memeriksa pembaruan...', showStartupDialog: false });
  try {
    const environment = await getOtaEnvironment();
    if (!environment.supported) {
      publish({ phase: 'unsupported', message: environment.description });
      return;
    }
    await assertOnline();
    // One request is enough: the returned manifest may identify the update
    // whose public changelog can be loaded.
    const Updates = await import('expo-updates');
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) {
      const id = manifestUpdateId('manifest' in result ? result.manifest : null);
      publish({
        phase: 'available',
        message: 'Pembaruan fitur tersedia.',
        showStartupDialog: showStartupDialog && !startupDismissed,
        updateId: id,
        changelogTitle: 'Pembaruan DeyPocket tersedia',
        changelog: ['Peningkatan dan perbaikan aplikasi.'],
      });
      void loadChangelog(id);
    } else {
      publish({ phase: 'up-to-date', message: 'DeyPocket sudah menggunakan pembaruan terbaru.', showStartupDialog: false });
    }
  } catch (error) {
    const message = getError(error);
    const offline = message.startsWith('OFFLINE:') || isConnectionError(message);
    publish({
      phase: offline ? 'offline' : 'error',
      message: offline ? 'Tidak ada koneksi internet. Periksa jaringan lalu coba lagi.' : `Gagal memeriksa pembaruan: ${message}`,
      showStartupDialog: false,
    });
  } finally {
    running = false;
  }
}

export async function checkAtStartup(): Promise<void> {
  if (startupChecked || Platform.OS !== 'android') return;
  startupChecked = true;
  // The app is never blocked by startup checking; errors remain silent here.
  await checkOtaSession(true);
}

export function dismissStartupOta(): void {
  startupDismissed = true;
  publish({ showStartupDialog: false });
}

/** Reflect an update already downloaded automatically by the native updater. */
export function markNativeOtaReady(): void {
  if (current.phase === 'downloading' || current.phase === 'ready') return;
  publish({
    phase: 'ready',
    message: 'Pembaruan sudah diunduh. Muat ulang hanya saat siap.',
    showStartupDialog: !startupDismissed,
  });
}

export async function downloadOtaSession(): Promise<void> {
  if (running || current.phase !== 'available') return;
  running = true;
  publish({ phase: 'downloading', message: 'Mengunduh pembaruan...' });
  try {
    await assertOnline();
    const success = await downloadOta();
    if (success) {
      publish({ phase: 'ready', message: 'Pembaruan berhasil diunduh. Simpan pekerjaan sebelum memuat ulang.' });
    } else {
      publish({ phase: 'up-to-date', message: 'Tidak ada paket baru untuk diunduh.', showStartupDialog: false });
    }
  } catch (error) {
    const message = getError(error);
    const offline = message.startsWith('OFFLINE:') || isConnectionError(message);
    publish({
      phase: offline ? 'offline' : 'error',
      message: offline ? 'Koneksi terputus saat mengunduh. Coba lagi setelah online.' : `Gagal mengunduh pembaruan: ${message}`,
      showStartupDialog: false,
    });
  } finally {
    running = false;
  }
}

export async function reloadOtaSession(): Promise<boolean> {
  if (running || current.phase !== 'ready') return false;
  if (hasUnsavedFinanceDraft()) {
    publish({ message: 'Ada transaksi yang belum disimpan. Selesaikan atau batalkan transaksi sebelum memuat ulang.' });
    return false;
  }
  running = true;
  try {
    await applyDownloadedOta();
    return true;
  } catch (error) {
    publish({ phase: 'error', message: `Gagal memuat ulang: ${getError(error)}`, showStartupDialog: false });
    return false;
  } finally {
    running = false;
  }
}

// Used by plain JavaScript tests for UI state transitions.
export function getOtaSessionSnapshot(): OtaSession { return current; }
