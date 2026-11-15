import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import {
  ActivityIndicator, Button, Card, Dialog, Divider, HelperText,
  IconButton, List, Portal, Text, TextInput, useTheme,
} from 'react-native-paper';
import {
  createBackup, inspectBackup, restoreBackup, saveBackupFile,
  type RestorePreview,
} from '../features/deypocket/backup-service';
import {
  decryptBackupJson, encryptBackupJson, encryptedFileName,
  ensureBackupPassword, pickProtectedBackupFile,
  type SelectedBackupFile,
} from '../features/deypocket/secure-backup';
import {
  listEncryptedBackups, readEncryptedBackup, removeEncryptedBackup,
  shareEncryptedBackup, storeEncryptedBackup,
  type VaultBackup,
} from '../features/deypocket/backup-vault';

type Task = 'creating' | 'reading' | 'unlocking' | 'restoring' | 'sharing' | 'deleting' | null;

const dateText = (date: string) => new Date(date).toLocaleString('id-ID', {
  dateStyle: 'medium', timeStyle: 'short',
});
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Terjadi kesalahan.';

export default function BackupScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const working = useRef(false);
  const [task, setTask] = useState<Task>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [selected, setSelected] = useState<SelectedBackupFile | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [vault, setVault] = useState<VaultBackup[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const refreshVault = useCallback(async () => {
    if (Platform.OS === 'web') return;
    setVault(await listEncryptedBackups());
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    void refreshVault().catch((reason: unknown) => {
      if (active) setError(messageOf(reason));
    });
    return () => { active = false; };
  }, [refreshVault]));

  function resetCandidate(): void {
    setSelected(null);
    setPreview(null);
    setUnlockPassword('');
    setConfirmation('');
  }

  async function withTask(name: Exclude<Task, null>, fn: () => Promise<void>): Promise<void> {
    if (working.current) return;
    working.current = true;
    setTask(name); setError(''); setNotice('');
    try { await fn(); }
    catch (reason) { setError(messageOf(reason)); }
    finally { working.current = false; setTask(null); }
  }

  function createProtected(): void {
    void withTask('creating', async () => {
      ensureBackupPassword(password);
      if (password !== passwordAgain) throw new Error('Konfirmasi password tidak cocok.');
      const current = await createBackup(db);
      const encrypted = await encryptBackupJson(current.json, password);
      const name = encryptedFileName();
      if (Platform.OS !== 'web') {
        await storeEncryptedBackup(name, encrypted);
        await refreshVault();
      }
      setPassword(''); setPasswordAgain('');
      try {
        await saveBackupFile(name, encrypted);
        setNotice('Backup terenkripsi dibuat. Pastikan kamu menyimpan salinan di luar aplikasi.');
      } catch (e) {
        setNotice('Backup terenkripsi tersimpan di arsip aplikasi, tetapi proses berbagi gagal atau dibatalkan.');
        if (Platform.OS === 'web') throw e;
      }
    });
  }

  function chooseExternal(): void {
    void withTask('reading', async () => {
      resetCandidate();
      const result = await pickProtectedBackupFile();
      if (!result) return;
      setSelected(result);
      if (!result.encrypted) {
        setPreview(await inspectBackup(db, result.content));
      }
    });
  }

  function chooseVault(name: string): void {
    void withTask('reading', async () => {
      resetCandidate();
      const content = await readEncryptedBackup(name);
      setSelected({ name, content, encrypted: true });
    });
  }

  function unlock(): void {
    void withTask('unlocking', async () => {
      if (!selected?.encrypted) return;
      const plaintext = await decryptBackupJson(selected.content, unlockPassword);
      const checked = await inspectBackup(db, plaintext);
      setPreview(checked);
      setUnlockPassword('');
    });
  }

  function restore(): void {
    void withTask('restoring', async () => {
      if (!preview || confirmation !== 'PULIHKAN') return;
      setRestoreOpen(false);
      await restoreBackup(db, preview);
      resetCandidate();
      router.replace('/');
    });
  }

  function shareFromVault(name: string): void {
    void withTask('sharing', async () => {
      await shareEncryptedBackup(name);
      setNotice('Pilih tempat penyimpanan eksternal dan pastikan berkas berhasil tersimpan.');
    });
  }

  function confirmDelete(): void {
    void withTask('deleting', async () => {
      if (!deleteTarget) return;
      await removeEncryptedBackup(deleteTarget);
      setDeleteTarget(null);
      await refreshVault();
      setNotice('Salinan backup lokal dihapus. File eksternal tidak terpengaruh.');
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ title: 'Backup Aman', headerShown: true }} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{
        width: '100%', maxWidth: 780, alignSelf: 'center', padding: 18, paddingBottom: 70, gap: 16,
      }}>
        <View style={{ gap: 5 }}>
          <Text variant="labelLarge" style={{ color: theme.colors.primary, fontWeight: '800' }}>DEYPOCKET · PRIVASI</Text>
          <Text variant="headlineMedium" style={{ fontWeight: '800' }}>Backup & Pemulihan</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            Lindungi data keuangan dengan backup berpassword yang dapat dipindahkan antarperangkat.
          </Text>
        </View>

        {!!task && <Card mode="outlined"><Card.Content style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ActivityIndicator /><Text>{task === 'creating' ? 'Mengenkripsi backup…' : task === 'unlocking' ? 'Membuka dan memeriksa backup…' : task === 'restoring' ? 'Memulihkan database…' : 'Memproses…'}</Text>
        </Card.Content></Card>}
        {!!error && <Card mode="outlined" style={{ borderColor: theme.colors.error }}><Card.Content>
          <Text style={{ color: theme.colors.error }}>{error}</Text>
        </Card.Content></Card>}
        {!!notice && <Card mode="outlined"><Card.Content><Text>{notice}</Text></Card.Content></Card>}

        <Card mode="outlined" style={{ borderRadius: 22 }}>
          <Card.Content style={{ gap: 13, paddingVertical: 20 }}>
            <View style={{ gap: 3 }}>
              <Text variant="titleLarge" style={{ fontWeight: '800' }}>Buat backup terenkripsi</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                AES-256-GCM • password tidak disimpan oleh aplikasi
              </Text>
            </View>
            <TextInput mode="outlined" label="Password backup (min. 12 karakter)"
              value={password} onChangeText={setPassword} secureTextEntry={!showPassword}
              autoCapitalize="none" autoCorrect={false}
              right={<TextInput.Icon icon={showPassword ? 'eye-off-outline' : 'eye-outline'} onPress={() => setShowPassword(v => !v)} />}
            />
            <TextInput mode="outlined" label="Ulangi password backup"
              value={passwordAgain} onChangeText={setPasswordAgain} secureTextEntry={!showPassword}
              autoCapitalize="none" autoCorrect={false}
            />
            <Button mode="contained" icon="shield-lock-outline" disabled={!!task || password.length < 12 || password !== passwordAgain}
              onPress={createProtected}>Enkripsi & Simpan Backup</Button>
            <HelperText type="info">Simpan password di tempat aman. Tidak ada fitur reset password backup.</HelperText>
          </Card.Content>
        </Card>

        <Card mode="outlined" style={{ borderRadius: 22 }}>
          <Card.Content style={{ gap: 13, paddingVertical: 20 }}>
            <Text variant="titleLarge" style={{ fontWeight: '800' }}>Pulihkan data</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>
              Impor file .dpk (terenkripsi) atau backup .json lama dari Sprint 4C.
            </Text>
            <Button mode="outlined" icon="file-import-outline" disabled={!!task} onPress={chooseExternal}>Pilih File Backup</Button>
            {selected && <View style={{ gap: 11 }}>
              <Divider />
              <Text variant="titleSmall" style={{ fontWeight: '700' }} numberOfLines={2}>{selected.name}</Text>
              {selected.encrypted && !preview && <>
                <TextInput mode="outlined" label="Password file backup" value={unlockPassword}
                  onChangeText={setUnlockPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} />
                <Button mode="contained-tonal" icon="lock-open-outline" disabled={!!task || !unlockPassword}
                  onPress={unlock}>Buka & Periksa</Button>
              </>}
              {!selected.encrypted && <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                Backup lama tidak terenkripsi. Hindari menyimpannya di lokasi publik.
              </Text>}
              {preview && <View style={{ gap: 7 }}>
                <Text variant="titleSmall" style={{ fontWeight: '800' }}>File valid & kompatibel</Text>
                <Text>Tanggal: {dateText(preview.createdAt)}</Text>
                <Text>Tabel: {preview.tableCount} · Baris: {preview.totalRows.toLocaleString('id-ID')}</Text>
                <Text>Versi skema: {preview.schemaVersion}</Text>
                <Button mode="contained" buttonColor={theme.colors.error} disabled={!!task}
                  icon="database-sync-outline" onPress={() => { setConfirmation(''); setRestoreOpen(true); }}>
                  Lanjutkan Restore
                </Button>
              </View>}
            </View>}
          </Card.Content>
        </Card>

        {Platform.OS !== 'web' && <Card mode="outlined" style={{ borderRadius: 22 }}>
          <Card.Content style={{ gap: 10, paddingVertical: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}><Text variant="titleLarge" style={{ fontWeight: '800' }}>Arsip perangkat</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Maks. 10 backup terenkripsi terakhir</Text></View>
              <IconButton icon="refresh" onPress={() => void refreshVault().catch(e => setError(messageOf(e)))} />
            </View>
            {!vault.length && <Text style={{ color: theme.colors.onSurfaceVariant }}>Belum ada backup yang tersimpan dalam aplikasi.</Text>}
            {vault.map((file) => <View key={file.name}>
              <List.Item title={file.name.replace('DeyPocket-secure-', '').replace('.dpk', '').replace('T', ' · ')}
                description={`${(file.size / 1024).toFixed(1)} KB · Terenkripsi`}
                left={props => <List.Icon {...props} icon="file-lock-outline" color={theme.colors.primary} />}
                titleNumberOfLines={1} />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 5 }}>
                <Button compact disabled={!!task} onPress={() => chooseVault(file.name)}>Pulihkan</Button>
                <Button compact disabled={!!task} onPress={() => shareFromVault(file.name)}>Simpan di luar</Button>
                <Button compact textColor={theme.colors.error} disabled={!!task}
                  onPress={() => setDeleteTarget(file.name)}>Hapus</Button>
              </View>
              <Divider style={{ marginTop: 9 }} />
            </View>)}
          </Card.Content>
        </Card>}

        <Card mode="contained" style={{ borderRadius: 20 }}><Card.Content style={{ gap: 8 }}>
          <Text variant="titleMedium" style={{ fontWeight: '800' }}>Sebelum memulihkan data</Text>
          <Text>Restore mengganti seluruh data transaksi dan master keuangan saat ini. Simpan backup terbaru terlebih dahulu.</Text>
          <Divider />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            File backup pada arsip aplikasi ikut hilang jika aplikasi dihapus. Simpan salinan ke penyimpanan pribadi di luar aplikasi.
          </Text>
        </Card.Content></Card>
      </ScrollView>

      <Portal>
        <Dialog visible={restoreOpen} onDismiss={() => setRestoreOpen(false)}>
          <Dialog.Title>Ganti seluruh data?</Dialog.Title>
          <Dialog.Content style={{ gap: 10 }}>
            <Text>Semua data aktif akan diganti dengan isi file yang dipilih. Proses dibatalkan jika validasi database gagal.</Text>
            <TextInput mode="outlined" label="Ketik PULIHKAN" value={confirmation}
              onChangeText={setConfirmation} autoCapitalize="characters" autoCorrect={false} />
          </Dialog.Content>
          <Dialog.Actions><Button onPress={() => setRestoreOpen(false)}>Batal</Button>
            <Button textColor={theme.colors.error} disabled={!!task || confirmation !== 'PULIHKAN'} onPress={restore}>Pulihkan</Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={!!deleteTarget} onDismiss={() => setDeleteTarget(null)}>
          <Dialog.Title>Hapus backup lokal?</Dialog.Title>
          <Dialog.Content><Text>File yang disimpan di luar aplikasi tidak akan dihapus. Salinan lokal ini tidak bisa dipulihkan setelah dihapus.</Text></Dialog.Content>
          <Dialog.Actions><Button onPress={() => setDeleteTarget(null)}>Batal</Button>
            <Button textColor={theme.colors.error} disabled={!!task} onPress={confirmDelete}>Hapus</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}
