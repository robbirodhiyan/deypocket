import { Stack } from 'expo-router';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Dialog,
  Divider,
  HelperText,
  Portal,
  ProgressBar,
  Text,
  useTheme,
} from 'react-native-paper';

import project from '../../project.config.json';
import {
  compareVersions,
  fetchPublicApkRelease,
  type PublicApkRelease,
} from '../features/deypocket/update-release';
import {
  getOtaEnvironment,
  type OtaEnvironment,
} from '../features/deypocket/update-ota';
import { checkOtaSession, downloadOtaSession, reloadOtaSession, useOtaSession } from '../features/deypocket/ota-session';

type Phase = 'idle' | 'checking' | 'downloading' | 'ready' | 'none' | 'available' | 'unsupported' | 'error';

const EMPTY_OTA: OtaEnvironment = {
  supported: false,
  description: 'Memeriksa dukungan OTA...',
  channel: null,
  runtimeVersion: null,
  updateId: null,
  embedded: null,
};

function ErrorLine({ message }: { message: string }) {
  if (!message) return null;
  return <HelperText type="error" visible>{message}</HelperText>;
}

export default function UpdateManagerScreen() {
  const theme = useTheme();
  const mounted = useRef(true);
  const busy = useRef(false);
  const [environment, setEnvironment] = useState<OtaEnvironment>(EMPTY_OTA);
  const otaSession = useOtaSession();
  const otaPhase = otaSession.phase;
  const otaMessage = otaSession.message;
  const updateState = Updates.useUpdates();
  const progress = (updateState as { downloadProgress?: number }).downloadProgress;
  const hasProgress = typeof progress === 'number' && Number.isFinite(progress);
  const safeProgress = typeof progress === 'number' && Number.isFinite(progress)
    ? Math.max(0, Math.min(1, progress)) : 0;
  const [apkPhase, setApkPhase] = useState<Phase>('idle');
  const [apkMessage, setApkMessage] = useState('');
  const [apkRelease, setApkRelease] = useState<PublicApkRelease | null>(null);
  const [confirmReload, setConfirmReload] = useState(false);
  const [confirmApk, setConfirmApk] = useState(false);

  // Installed/native version is deliberately used instead of OTA-bundle version.
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0';
  const build = Application.nativeBuildVersion ?? '—';
  const configuredRelease = project.release;
  const owner = configuredRelease?.owner?.trim() ?? '';
  const repository = configuredRelease?.repository?.trim() ?? '';
  const canCheckPublicApk = Platform.OS === 'android' && !!owner && !!repository;

  useEffect(() => {
    mounted.current = true;
    void getOtaEnvironment().then((info) => {
      if (mounted.current) {
        setEnvironment(info);
      }
    });
    return () => { mounted.current = false; };
  }, []);

  const safeError = (error: unknown) => error instanceof Error ? error.message : 'Terjadi kesalahan tak terduga.';

  // Same shared session is used by the startup dialog and Settings.
  const doCheckOta = useCallback(async () => {
    await checkOtaSession(false);
  }, []);

  const doDownloadOta = useCallback(async () => {
    await downloadOtaSession();
  }, []);

  const doReloadOta = useCallback(async () => {
    setConfirmReload(false);
    await reloadOtaSession();
  }, []);

  const doCheckApk = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setApkPhase('checking');
    setApkMessage('');
    setApkRelease(null);
    try {
      const result = await fetchPublicApkRelease(owner, repository, version);
      if (!mounted.current) return;
      if (result.kind === 'available' && compareVersions(result.release.version, version) > 0) {
        setApkRelease(result.release);
        setApkPhase('available');
        setApkMessage(`APK versi ${result.release.version} tersedia.`);
      } else {
        setApkPhase('none');
        setApkMessage('Tidak ada APK publik yang lebih baru dari versi terpasang.');
      }
    } catch (error) {
      if (!mounted.current) return;
      setApkPhase('error');
      setApkMessage(safeError(error));
    } finally { busy.current = false; }
  }, [owner, repository, version]);

  const openRelease = useCallback(async () => {
    setConfirmApk(false);
    if (!apkRelease) return;
    try {
      await Linking.openURL(apkRelease.url);
    } catch (error) {
      setApkPhase('error');
      setApkMessage(safeError(error));
    }
  }, [apkRelease]);

  const updating = otaPhase === 'checking' || otaPhase === 'downloading' || apkPhase === 'checking';

  return (
    <>
      <Stack.Screen options={{ title: 'Pembaruan Aplikasi', headerShown: true }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={{ width: '100%', maxWidth: 780, alignSelf: 'center', padding: 20, paddingBottom: 65, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 5 }}>
          <Text variant="labelLarge" style={{ color: theme.colors.primary, fontWeight: '800', letterSpacing: 1 }}>DEYPOCKET</Text>
          <Text variant="headlineMedium" style={{ fontWeight: '800' }}>Pembaruan Aplikasi</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            Cek pembaruan fitur tanpa instal ulang, atau cari APK versi terbaru.
          </Text>
        </View>

        <Card mode="contained" style={{ borderRadius: 22 }}>
          <Card.Content style={{ gap: 12, padding: 19 }}>
            <Text variant="titleMedium" style={{ fontWeight: '800' }}>Versi terpasang</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <Text variant="headlineMedium" style={{ fontWeight: '800' }}>v{version}</Text>
              <Chip compact icon="cellphone">Build {build}</Chip>
            </View>
            <Divider />
            <View style={{ gap: 5 }}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Channel: {environment.channel ?? 'Tidak tersedia'}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Runtime: {environment.runtimeVersion ?? 'Tidak tersedia'}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Sumber: {environment.embedded === null ? 'Tidak diketahui' : environment.embedded ? 'APK bawaan' : 'OTA terunduh'}
              </Text>
            </View>
          </Card.Content>
        </Card>

        <Card mode="outlined" style={{ borderRadius: 22, borderColor: theme.colors.outlineVariant }}>
          <Card.Content style={{ gap: 14, padding: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primaryContainer }}>
                <Text variant="titleMedium" style={{ color: theme.colors.onPrimaryContainer }}>OTA</Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="titleMedium" style={{ fontWeight: '800' }}>Update Fitur</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Tampilan, JavaScript dan aset melalui Expo EAS</Text>
              </View>
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{environment.description}</Text>
            {otaPhase === 'checking' && <ActivityIndicator />}
            {otaPhase === 'downloading' && (
              <View style={{ gap: 8 }}>
                {hasProgress ? <ProgressBar progress={safeProgress} /> : <ActivityIndicator />}
                <Text variant="bodySmall">
                  {hasProgress ? `Mengunduh ${Math.round(safeProgress * 100)}%` : 'Mengunduh pembaruan...'}
                </Text>
              </View>
            )}
            {otaPhase !== 'error' && otaPhase !== 'offline' && !!otaMessage ? <Text variant="bodyMedium">{otaMessage}</Text> : null}
            {(otaPhase === 'error' || otaPhase === 'offline') && <ErrorLine message={otaMessage} />}
            {otaPhase === 'available' && (
              <View style={{ gap: 7, padding: 12, borderRadius: 12, backgroundColor: theme.colors.surfaceVariant }}>
                <Text variant="titleSmall" style={{ fontWeight: '700' }}>{otaSession.changelogTitle}</Text>
                {otaSession.changelog.map((line, i) =>
                  <Text key={`${i}-${line}`} variant="bodySmall">• {line}</Text>
                )}
              </View>
            )}
            {otaPhase === 'ready' ? (
              <Button mode="contained" icon="restart" onPress={() => setConfirmReload(true)} disabled={updating}>Terapkan & Muat Ulang</Button>
            ) : otaPhase === 'available' ? (
              <Button mode="contained" icon="download" onPress={() => void doDownloadOta()} disabled={updating}>Unduh Update</Button>
            ) : (
              <Button mode="contained-tonal" icon="refresh" onPress={() => void doCheckOta()} disabled={!environment.supported || updating} loading={otaPhase === 'checking'}>
                {otaPhase === 'offline' || otaPhase === 'error' ? 'Coba Lagi' : 'Cek Pembaruan OTA'}
              </Button>
            )}
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              OTA memerlukan koneksi internet untuk mengunduh. Data transaksi SQLite tidak dihapus saat update JavaScript.
            </Text>
          </Card.Content>
        </Card>

        <Card mode="outlined" style={{ borderRadius: 22, borderColor: theme.colors.outlineVariant }}>
          <Card.Content style={{ gap: 13, padding: 18 }}>
            <View style={{ gap: 4 }}>
              <Text variant="titleMedium" style={{ fontWeight: '800' }}>Update APK Android</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Dibutuhkan jika ada perubahan modul native, Expo SDK, atau runtime.
              </Text>
            </View>
            <View style={{ gap: 4 }}>
              <Text variant="bodySmall">Sumber: GitHub Releases publik</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {owner && repository ? `${owner}/${repository}` : 'Repository release belum disetel'}
              </Text>
            </View>
            {apkPhase === 'checking' && <ActivityIndicator />}
            {apkPhase !== 'error' && !!apkMessage && <Text variant="bodyMedium">{apkMessage}</Text>}
            {apkPhase === 'error' && <ErrorLine message={apkMessage} />}
            {apkRelease && apkPhase === 'available' && (
              <View style={{ gap: 9, backgroundColor: theme.colors.surfaceVariant, borderRadius: 14, padding: 12 }}>
                <Text variant="titleSmall" style={{ fontWeight: '700' }}>{apkRelease.name}</Text>
                {!!apkRelease.releaseNotes && (
                  <Text variant="bodySmall" numberOfLines={5}>{apkRelease.releaseNotes}</Text>
                )}
                <Button mode="contained" icon="open-in-new" onPress={() => setConfirmApk(true)}>
                  Buka Unduhan APK
                </Button>
              </View>
            )}
            <Button mode="outlined" icon="cellphone-arrow-down" onPress={() => void doCheckApk()}
              disabled={!canCheckPublicApk || updating} loading={apkPhase === 'checking'}>
              Cek APK Terbaru
            </Button>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Repository GitHub privat tidak dapat diperiksa tanpa autentikasi. Gunakan link unduhan privat melalui browser terautentikasi; jangan menyimpan token akses dalam APK. Android meminta persetujuan pengguna untuk instalasi.
            </Text>
          </Card.Content>
        </Card>

        <Card mode="contained" style={{ borderRadius: 18 }}>
          <Card.Content style={{ gap: 8 }}>
            <Text variant="titleSmall" style={{ fontWeight: '700' }}>Informasi penting</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Git branch master berbeda dari EAS channel preview. Update OTA hanya dikirim ke APK dengan channel dan runtime yang kompatibel. Untuk update APK, gunakan signing key dan Android package yang sama agar data lokal tetap dipertahankan.
            </Text>
          </Card.Content>
        </Card>
      </ScrollView>

      <Portal>
        <Dialog visible={confirmReload} onDismiss={() => setConfirmReload(false)}>
          <Dialog.Title>Muat ulang DeyPocket?</Dialog.Title>
          <Dialog.Content>
            <Text>Pastikan transaksi atau form yang sedang diedit sudah disimpan. Aplikasi akan memuat ulang untuk menjalankan pembaruan OTA.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmReload(false)}>Batal</Button>
            <Button onPress={() => void doReloadOta()}>Muat Ulang</Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={confirmApk} onDismiss={() => setConfirmApk(false)}>
          <Dialog.Title>Buka halaman unduhan?</Dialog.Title>
          <Dialog.Content>
            <Text>Unduh APK dari GitHub Releases lalu setujui proses instalasi di Android. Pastikan APK ditandatangani dengan signing key yang sama dan lakukan backup data terlebih dahulu.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmApk(false)}>Batal</Button>
            <Button onPress={() => void openRelease()}>Lanjutkan</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}
