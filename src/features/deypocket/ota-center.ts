import * as Network from 'expo-network';
import * as Updates from 'expo-updates';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import project from '../../../project.config.json';

type Phase =
  | 'idle'
  | 'checking'
  | 'offline'
  | 'current'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'unsupported'
  | 'error';

export type UpdateCenterState = {
  phase: Phase;
  message: string;
  showDialog: boolean;
  title: string;
  changelog: string[];
  lastChecked: string | null;
  updateId: string | null;
};

let state: UpdateCenterState = {
  phase: 'idle',
  message: '',
  showDialog: false,
  title: 'Pembaruan DeyPocket tersedia',
  changelog: [
    'Peningkatan stabilitas dan pengalaman aplikasi.',
  ],
  lastChecked: null,
  updateId: null,
};

let busy = false;
let checkedOnStartup = false;
let dismissedId: string | null = null;

const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => state;

function setState(patch: Partial<UpdateCenterState>) {
  state = { ...state, ...patch };
  listeners.forEach(listener => listener());
}

export function useUpdateCenter() {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot
  );
}

export function otaIsSupported(): boolean {
  return (
    (Platform.OS === 'android' ||
      Platform.OS === 'ios') &&
    !__DEV__ &&
    Updates.isEnabled
  );
}

const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Kesalahan tidak diketahui.';

function isNetworkError(message: string): boolean {
  return /network|offline|internet|socket|fetch|timeout|timed out|connect|dns/i.test(
    message
  );
}

async function ensureOnline() {
  const network = await Network.getNetworkStateAsync();

  if (
    network.isConnected === false ||
    network.isInternetReachable === false
  ) {
    throw new Error('OFFLINE');
  }
}

function readUpdateId(manifest: unknown): string | null {
  if (
    manifest &&
    typeof manifest === 'object' &&
    'id' in manifest
  ) {
    const id = (manifest as { id: unknown }).id;

    if (typeof id === 'string' && id.length > 5) {
      return id;
    }
  }

  return null;
}

async function loadPublicNotes(id: string | null) {
  if (!id) return;

  const value = (
    project as unknown as {
      updateNotesUrl?: string;
    }
  ).updateNotesUrl;

  if (!value || !/^https:\/\//i.test(value)) {
    return;
  }

  try {
    const response = await fetch(value, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) return;

    const json: unknown = await response.json();

    if (
      !json ||
      typeof json !== 'object' ||
      !('updates' in json)
    ) {
      return;
    }

    const list = (json as { updates: unknown }).updates;

    if (!Array.isArray(list)) return;

    const match = list.find(
      item =>
        item &&
        typeof item === 'object' &&
        'updateId' in item &&
        item.updateId === id
    ) as
      | {
          title?: unknown;
          changes?: unknown;
        }
      | undefined;

    if (!match || !Array.isArray(match.changes)) {
      return;
    }

    const changes = match.changes
      .filter(
        (item): item is string =>
          typeof item === 'string' &&
          item.length > 0 &&
          item.length <= 140
      )
      .slice(0, 6);

    if (
      changes.length &&
      state.updateId === id
    ) {
      setState({
        title:
          typeof match.title === 'string'
            ? match.title.slice(0, 90)
            : state.title,
        changelog: changes,
      });
    }
  } catch {
    // Changelog opsional.
    // Jika gagal, update tetap dapat digunakan.
  }
}

export async function checkUpdate(
  showStartupDialog = false
): Promise<void> {
  if (
    busy ||
    state.phase === 'downloading' ||
    state.phase === 'ready'
  ) {
    return;
  }

  if (!otaIsSupported()) {
    setState({
      phase: 'unsupported',
      message:
        'OTA hanya aktif pada APK release/preview yang sudah dikonfigurasi EAS Update.',
      showDialog: false,
    });

    return;
  }

  busy = true;

  setState({
    phase: 'checking',
    message: 'Memeriksa pembaruan...',
    showDialog: false,
  });

  try {
    await ensureOnline();

    const result = await Updates.checkForUpdateAsync();
    const time = new Date().toISOString();

    if (!result.isAvailable) {
      setState({
        phase: 'current',
        message:
          'DeyPocket sudah menggunakan pembaruan terbaru.',
        showDialog: false,
        lastChecked: time,
      });

      return;
    }

    const id = readUpdateId(
      'manifest' in result
        ? result.manifest
        : null
    );

    setState({
      phase: 'available',
      message: 'Pembaruan siap diunduh.',
      showDialog:
        showStartupDialog &&
        dismissedId !== (id ?? 'unknown'),
      lastChecked: time,
      updateId: id,
      title: 'Pembaruan DeyPocket tersedia',
      changelog: [
        'Peningkatan stabilitas dan pengalaman aplikasi.',
      ],
    });

    void loadPublicNotes(id);
  } catch (error) {
    const message = errorMessage(error);

    const offline =
      message === 'OFFLINE' ||
      isNetworkError(message);

    setState({
      phase: offline ? 'offline' : 'error',
      showDialog: false,
      message: offline
        ? 'Tidak ada koneksi internet. Coba lagi ketika online.'
        : `Gagal memeriksa pembaruan: ${message}`,
    });
  } finally {
    busy = false;
  }
}

export async function checkAtStartup(): Promise<void> {
  if (
    checkedOnStartup ||
    Platform.OS !== 'android'
  ) {
    return;
  }

  checkedOnStartup = true;

  await checkUpdate(true);
}

export function dismissUpdateDialog() {
  dismissedId = state.updateId ?? 'unknown';

  setState({
    showDialog: false,
  });
}

export function markDownloadedUpdate() {
  if (state.phase === 'ready') return;

  setState({
    phase: 'ready',
    message:
      'Pembaruan telah diunduh. Muat ulang saat pekerjaan selesai.',
    showDialog:
      dismissedId !== (state.updateId ?? 'unknown'),
  });
}

export async function downloadUpdate(): Promise<void> {
  if (
    busy ||
    state.phase !== 'available'
  ) {
    return;
  }

  busy = true;

  setState({
    phase: 'downloading',
    message: 'Mengunduh pembaruan...',
  });

  try {
    await ensureOnline();

    const result = await Updates.fetchUpdateAsync();

    if (result.isNew) {
      setState({
        phase: 'ready',
        message:
          'Pembaruan siap diterapkan. Simpan seluruh pekerjaan sebelum muat ulang.',
      });
    } else {
      setState({
        phase: 'current',
        message:
          'Tidak ada paket baru yang perlu diunduh.',
        showDialog: false,
      });
    }
  } catch (error) {
    const message = errorMessage(error);

    const offline =
      message === 'OFFLINE' ||
      isNetworkError(message);

    setState({
      phase: offline ? 'offline' : 'error',
      showDialog: false,
      message: offline
        ? 'Koneksi terputus. Coba lagi ketika online.'
        : `Download gagal: ${message}`,
    });
  } finally {
    busy = false;
  }
}

/**
 * Hanya dipanggil setelah konfirmasi pengguna.
 * Jangan panggil dari form transaksi.
 */
export async function applyUpdate(): Promise<void> {
  if (
    busy ||
    state.phase !== 'ready'
  ) {
    return;
  }

  busy = true;

  try {
    await Updates.reloadAsync();
  } catch (error) {
    setState({
      phase: 'error',
      message:
        `Muat ulang gagal: ${errorMessage(error)}`,
      showDialog: false,
    });
  } finally {
    busy = false;
  }
}