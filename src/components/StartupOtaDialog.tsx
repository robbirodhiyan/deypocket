import { router, usePathname, type Href } from 'expo-router';
import * as Updates from 'expo-updates';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import {
  ActivityIndicator, Button, Dialog, Portal, ProgressBar, Text, useTheme,
} from 'react-native-paper';

import { hasUnsavedFinanceDraft } from '../features/deypocket/ota-draft-guard';
import {
  checkAtStartup, dismissStartupOta, downloadOtaSession, markNativeOtaReady,
  reloadOtaSession, useOtaSession,
} from '../features/deypocket/ota-session';

// Compatible with both legacy AutoUpdateChecker and direct mounting in _layout.tsx.
// If both are mounted, only the first instance displays a dialog.
let activeDialogOwner: symbol | null = null;

/** Mount inside the root PaperProvider (see README). */
export default function StartupOtaDialog() {
  const instanceId = useRef(Symbol('deypocket-ota-dialog'));
  const [isDialogOwner, setIsDialogOwner] = useState(false);
  const theme = useTheme();
  const pathname = usePathname();
  const state = useOtaSession();
  const updates = Updates.useUpdates();
  const [confirmReload, setConfirmReload] = useState(false);
  const [guardWarning, setGuardWarning] = useState(false);
  const progress = (updates as { downloadProgress?: number }).downloadProgress;
  const knownProgress = typeof progress === 'number' && Number.isFinite(progress);
  const percentage = typeof progress === 'number' && Number.isFinite(progress)
    ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : null;

  useEffect(() => {
    if (activeDialogOwner === null) {
      activeDialogOwner = instanceId.current;
      setIsDialogOwner(true);
    }
    return () => {
      if (activeDialogOwner === instanceId.current) activeDialogOwner = null;
    };
  }, []);

  useEffect(() => {
    if (isDialogOwner && Platform.OS === 'android') void checkAtStartup();
  }, [isDialogOwner]);

  useEffect(() => {
    if (updates.isUpdatePending) markNativeOtaReady();
  }, [updates.isUpdatePending]);

  // Never interrupt a transaction screen. Startup dialogs only appear on Home.
  const onHome = pathname === '/' || pathname === '/index';
  const visible = isDialogOwner && onHome && state.showStartupDialog &&
    (state.phase === 'available' || state.phase === 'downloading' || state.phase === 'ready');

  function dismiss(): void {
    dismissStartupOta();
    setConfirmReload(false);
    setGuardWarning(false);
  }

  return (
    <Portal>
      <Dialog visible={visible && !confirmReload} onDismiss={dismiss}>
        <Dialog.Icon icon="update" />
        <Dialog.Title>{state.changelogTitle}</Dialog.Title>
        <Dialog.Content>
          <View style={{ gap: 12 }}>
            <Text variant="bodyMedium">
              {state.phase === 'downloading'
                ? 'Mengunduh pembaruan aplikasi...'
                : state.phase === 'ready'
                  ? 'Update siap diterapkan. Pastikan pekerjaan sudah disimpan.'
                  : 'Tersedia pembaruan fitur DeyPocket.'}
            </Text>
            {state.phase === 'available' && (
              <View style={{ gap: 7, padding: 12, backgroundColor: theme.colors.surfaceVariant, borderRadius: 12 }}>
                <Text variant="titleSmall">Apa yang baru?</Text>
                {state.changelog.map((line, index) => (
                  <Text key={`${index}-${line}`} variant="bodySmall">• {line}</Text>
                ))}
              </View>
            )}
            {state.phase === 'downloading' && (
              <View style={{ gap: 8 }}>
                {percentage !== null ? <ProgressBar progress={percentage / 100} /> : <ActivityIndicator />}
                <Text variant="bodySmall">
                  {percentage === null ? 'Sedang mengunduh... ' : `Mengunduh ${percentage}%`}
                </Text>
              </View>
            )}
            {state.phase === 'ready' && (
              <Text variant="bodySmall" style={{ color: theme.colors.primary }}>
                File pembaruan sudah diunduh. Tidak perlu instal ulang APK.
              </Text>
            )}
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              DeyPocket tetap dapat digunakan offline. Backup tetap disarankan sebelum pembaruan besar.
            </Text>
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={dismiss}>Nanti Saja</Button>
          {state.phase === 'available' && (
            <Button onPress={() => void downloadOtaSession()}>Perbarui Sekarang</Button>
          )}
          {state.phase === 'ready' && (
            <Button onPress={() => setConfirmReload(true)}>Muat Ulang</Button>
          )}
          {state.phase === 'downloading' && (
            <Button onPress={() => { dismiss(); router.push('/updates' as Href); }}>
              Lihat Status
            </Button>
          )}
        </Dialog.Actions>
      </Dialog>
      <Dialog visible={visible && confirmReload} onDismiss={() => setConfirmReload(false)}>
        <Dialog.Title>Terapkan update sekarang?</Dialog.Title>
        <Dialog.Content>
          <View style={{ gap: 8 }}>
            <Text>Periksa kembali seluruh transaksi dan pastikan tidak ada form yang belum disimpan. Aplikasi akan dimuat ulang.</Text>
            {guardWarning && <Text style={{ color: theme.colors.error }}>Ada perubahan transaksi yang belum disimpan. Simpan atau batalkan form terlebih dahulu.</Text>}
          </View>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={dismiss}>Nanti Saja</Button>
          <Button onPress={() => {
            if (hasUnsavedFinanceDraft()) { setGuardWarning(true); return; }
            setConfirmReload(false);
            dismissStartupOta();
            void reloadOtaSession();
          }}>
            Muat Ulang
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
