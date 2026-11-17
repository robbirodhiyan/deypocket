import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Dialog,
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
  checkOtaSession,
  downloadOtaSession,
  reloadOtaSession,
  useOtaSession,
} from '../features/deypocket/ota-session';

type ApkPhase = 'idle' | 'checking' | 'none' | 'available' | 'error';

function UpdateStatus({
  icon,
  message,
  danger = false,
}: {
  icon: 'check-circle-outline' | 'information-outline' | 'alert-circle-outline';
  message: string;
  danger?: boolean;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 9,
        padding: 12,
        borderRadius: 13,
        backgroundColor: danger
          ? theme.colors.errorContainer
          : theme.colors.surfaceVariant,
      }}
    >
      <MaterialCommunityIcons
        name={icon}
        size={19}
        color={danger ? theme.colors.onErrorContainer : theme.colors.onSurfaceVariant}
      />
      <Text
        variant="bodySmall"
        style={{
          flex: 1,
          lineHeight: 19,
          color: danger ? theme.colors.onErrorContainer : theme.colors.onSurfaceVariant,
        }}
      >
        {message}
      </Text>
    </View>
  );
}

export default function UpdateManagerScreen() {
  const theme = useTheme();
  const mounted = useRef(false);
  const checkingApk = useRef(false);

  // Gunakan sesi OTA yang sama dengan dialog pembaruan saat startup.
  const otaSession = useOtaSession();
  const otaPhase = otaSession.phase;
  const otaState = Updates.useUpdates();
  const rawProgress = (otaState as { downloadProgress?: number }).downloadProgress;
  const hasProgress = typeof rawProgress === 'number' && Number.isFinite(rawProgress);
  const progress = hasProgress
    ? Math.min(1, Math.max(0, rawProgress))
    : 0;

  const [apkPhase, setApkPhase] = useState<ApkPhase>('idle');
  const [apkRelease, setApkRelease] = useState<PublicApkRelease | null>(null);
  const [confirmReload, setConfirmReload] = useState(false);
  const [confirmApk, setConfirmApk] = useState(false);

  const appVersion =
    Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0';

  const owner = project.release?.owner?.trim() ?? '';
  const repository = project.release?.repository?.trim() ?? '';
  const canCheckApk = Platform.OS === 'android' && !!owner && !!repository;
  const otaBusy = otaPhase === 'checking' || otaPhase === 'downloading';
  const busy = otaBusy || apkPhase === 'checking';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const checkOta = useCallback(async () => {
    await checkOtaSession(false);
  }, []);

  const downloadOta = useCallback(async () => {
    await downloadOtaSession();
  }, []);

  const applyOta = useCallback(async () => {
    setConfirmReload(false);
    await reloadOtaSession();
  }, []);

  const checkApk = useCallback(async () => {
    if (!canCheckApk || checkingApk.current) return;

    checkingApk.current = true;
    setApkPhase('checking');
    setApkRelease(null);

    try {
      const result = await fetchPublicApkRelease(owner, repository, appVersion);
      if (!mounted.current) return;

      if (
        result.kind === 'available' &&
        compareVersions(result.release.version, appVersion) > 0
      ) {
        setApkRelease(result.release);
        setApkPhase('available');
      } else {
        setApkPhase('none');
      }
    } catch (error) {
      console.warn('[Updates] APK check failed:', error);
      if (mounted.current) setApkPhase('error');
    } finally {
      checkingApk.current = false;
    }
  }, [appVersion, canCheckApk, owner, repository]);

  const openApk = useCallback(async () => {
    setConfirmApk(false);
    if (!apkRelease) return;

    try {
      await Linking.openURL(apkRelease.url);
    } catch (error) {
      console.warn('[Updates] Could not open APK download:', error);
      if (mounted.current) setApkPhase('error');
    }
  }, [apkRelease]);

  const otaDescription = (() => {
    switch (otaPhase) {
      case 'checking':
        return 'Sedang memeriksa pembaruan...';
      case 'downloading':
        return 'Sedang mengunduh pembaruan...';
      case 'available':
        return 'Pembaruan fitur baru tersedia.';
      case 'ready':
        // Pesan sesi juga mencakup peringatan jika ada transaksi yang belum disimpan.
        return otaSession.message || 'Pembaruan siap dipasang.';
      case 'up-to-date':
        return 'Fitur DeyPocket sudah terbaru.';
      case 'offline':
        return 'Tidak ada koneksi internet. Periksa jaringan lalu coba lagi.';
      case 'error':
        return 'Pembaruan belum dapat diperiksa. Silakan coba lagi.';
      case 'unsupported':
        return 'Pembaruan langsung tidak tersedia pada versi aplikasi ini.';
      default:
        return '';
    }
  })();

  return (
    <>
      <Stack.Screen options={{ title: 'Pembaruan', headerShown: true }} />

      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          width: '100%',
          maxWidth: 650,
          alignSelf: 'center',
          paddingHorizontal: 18,
          paddingTop: 22,
          paddingBottom: 70,
          gap: 18,
        }}
      >
        <View style={{ gap: 8 }}>
          <Text
            variant="headlineSmall"
            style={{ fontWeight: '800', letterSpacing: -0.5 }}
          >
            Pembaruan Aplikasi
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, lineHeight: 21 }}
          >
            Nikmati fitur dan perbaikan terbaru untuk DeyPocket.
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              alignSelf: 'flex-start',
              borderRadius: 10,
              paddingHorizontal: 11,
              paddingVertical: 7,
              backgroundColor: theme.colors.surfaceVariant,
            }}
          >
            <MaterialCommunityIcons
              name="cellphone"
              size={15}
              color={theme.colors.onSurfaceVariant}
            />
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Versi {appVersion}
            </Text>
          </View>
        </View>

        <Card
          mode="outlined"
          style={{
            borderRadius: 20,
            borderColor: theme.colors.outlineVariant,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Card.Content style={{ padding: 18, gap: 15 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 13 }}>
              <View
                style={{
                  height: 45,
                  width: 45,
                  borderRadius: 15,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.primaryContainer,
                }}
              >
                <MaterialCommunityIcons
                  name="auto-fix"
                  size={23}
                  color={theme.colors.onPrimaryContainer}
                />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="titleMedium" style={{ fontWeight: '800' }}>
                  Pembaruan Fitur
                </Text>
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant, lineHeight: 19 }}
                >
                  Perbarui fitur tanpa menginstal ulang aplikasi.
                </Text>
              </View>
            </View>

            {!!otaDescription && otaPhase !== 'checking' && otaPhase !== 'downloading' && (
              <UpdateStatus
                icon={
                  otaPhase === 'error' || otaPhase === 'offline'
                    ? 'alert-circle-outline'
                    : otaPhase === 'available' || otaPhase === 'ready' || otaPhase === 'unsupported'
                      ? 'information-outline'
                      : 'check-circle-outline'
                }
                danger={otaPhase === 'error' || otaPhase === 'offline'}
                message={otaDescription}
              />
            )}

            {otaPhase === 'downloading' && (
              <View style={{ gap: 9 }}>
                {hasProgress ? (
                  <ProgressBar progress={progress} color={theme.colors.primary} />
                ) : (
                  <ActivityIndicator size="small" />
                )}
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {hasProgress
                    ? `Mengunduh... ${Math.round(progress * 100)}%`
                    : 'Sedang mengunduh pembaruan...'}
                </Text>
              </View>
            )}

            {otaPhase === 'available' && otaSession.changelog.length > 0 && (
              <View style={{ gap: 5 }}>
                {otaSession.changelog.slice(0, 3).map((line, index) => (
                  <Text
                    key={`${index}-${line}`}
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant, lineHeight: 19 }}
                  >
                    • {line}
                  </Text>
                ))}
              </View>
            )}

            {otaPhase === 'ready' ? (
              <Button
                mode="contained"
                icon="restart"
                disabled={busy}
                contentStyle={{ minHeight: 48 }}
                style={{ borderRadius: 13 }}
                onPress={() => setConfirmReload(true)}
              >
                Pasang Pembaruan
              </Button>
            ) : otaPhase === 'available' ? (
              <Button
                mode="contained"
                icon="download"
                disabled={busy}
                contentStyle={{ minHeight: 48 }}
                style={{ borderRadius: 13 }}
                onPress={() => void downloadOta()}
              >
                Unduh Pembaruan
              </Button>
            ) : otaPhase !== 'unsupported' && otaPhase !== 'downloading' ? (
              <Button
                mode="contained-tonal"
                icon="refresh"
                loading={otaPhase === 'checking'}
                disabled={busy}
                contentStyle={{ minHeight: 48 }}
                style={{ borderRadius: 13 }}
                onPress={() => void checkOta()}
              >
                {otaPhase === 'error' || otaPhase === 'offline'
                  ? 'Coba Lagi'
                  : otaPhase === 'checking'
                    ? 'Memeriksa...'
                    : 'Periksa Pembaruan'}
              </Button>
            ) : null}
          </Card.Content>
        </Card>

        {canCheckApk && (
          <Card
            mode="outlined"
            style={{
              borderRadius: 20,
              borderColor: theme.colors.outlineVariant,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Card.Content style={{ padding: 18, gap: 15 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 13 }}>
                <View
                  style={{
                    height: 45,
                    width: 45,
                    borderRadius: 15,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.secondaryContainer,
                  }}
                >
                  <MaterialCommunityIcons
                    name="cellphone-arrow-down"
                    size={23}
                    color={theme.colors.onSecondaryContainer}
                  />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="titleMedium" style={{ fontWeight: '800' }}>
                    Versi Android Terbaru
                  </Text>
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant, lineHeight: 19 }}
                  >
                    Cek apakah tersedia versi aplikasi yang lebih baru.
                  </Text>
                </View>
              </View>

              {apkPhase === 'checking' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator size="small" />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Memeriksa versi terbaru...
                  </Text>
                </View>
              )}
              {apkPhase === 'none' && (
                <UpdateStatus icon="check-circle-outline" message="Versi Android sudah terbaru." />
              )}
              {apkPhase === 'error' && (
                <UpdateStatus
                  icon="alert-circle-outline"
                  danger
                  message="Belum bisa memeriksa versi Android. Periksa internet lalu coba lagi."
                />
              )}
              {apkPhase === 'available' && apkRelease && (
                <UpdateStatus
                  icon="information-outline"
                  message={`Versi ${apkRelease.version} tersedia untuk diunduh.`}
                />
              )}

              {apkPhase === 'available' && apkRelease ? (
                <Button
                  mode="contained"
                  icon="download"
                  disabled={busy}
                  contentStyle={{ minHeight: 48 }}
                  style={{ borderRadius: 13 }}
                  onPress={() => setConfirmApk(true)}
                >
                  Unduh Versi {apkRelease.version}
                </Button>
              ) : (
                <Button
                  mode="outlined"
                  icon="refresh"
                  loading={apkPhase === 'checking'}
                  disabled={busy}
                  contentStyle={{ minHeight: 48 }}
                  style={{ borderRadius: 13 }}
                  onPress={() => void checkApk()}
                >
                  {apkPhase === 'error' ? 'Coba Lagi' : 'Periksa Versi Android'}
                </Button>
              )}
            </Card.Content>
          </Card>
        )}
      </ScrollView>

      <Portal>
        <Dialog
          visible={confirmReload}
          onDismiss={() => setConfirmReload(false)}
          style={{ borderRadius: 22, backgroundColor: theme.colors.surface }}
        >
          <Dialog.Title>Pasang pembaruan?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ lineHeight: 21 }}>
              Simpan dulu transaksi atau perubahan yang sedang kamu kerjakan. DeyPocket akan dimuat ulang.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmReload(false)}>Batal</Button>
            <Button mode="contained" onPress={() => void applyOta()}>
              Pasang
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={confirmApk}
          onDismiss={() => setConfirmApk(false)}
          style={{ borderRadius: 22, backgroundColor: theme.colors.surface }}
        >
          <Dialog.Title>Unduh versi terbaru?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ lineHeight: 21 }}>
              Halaman unduhan akan dibuka. Jangan hapus aplikasi lama agar data keuangan yang tersimpan di perangkat tidak ikut terhapus.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmApk(false)}>Batal</Button>
            <Button mode="contained" onPress={() => void openApk()}>
              Lanjutkan
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}
