import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ActivityIndicator, Button, Card, Divider, Text, useTheme } from 'react-native-paper';

type CheckResult = {
  checkedAt: string;
  sqliteOk: boolean;
  foreignKeysOk: boolean;
  tables: number;
  schemaVersion: number;
  sqliteVersion: string;
  problem: string | null;
};

function StatusLine({ title, detail, ok }: { title: string; detail: string; ok: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 }}>
      <MaterialCommunityIcons
        name={ok ? 'check-circle-outline' : 'alert-circle-outline'}
        size={23}
        color={ok ? theme.colors.primary : theme.colors.error}
      />
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="titleSmall">{title}</Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{detail}</Text>
      </View>
    </View>
  );
}

export default function DiagnosticsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState('');

  const config = Constants.expoConfig;
  const appName = config?.name ?? 'DeyPocket';
  const version = config?.version ?? 'Tidak tersedia';
  const packageName = config?.android?.package ?? 'Tidak tersedia pada platform ini';
  const buildCode = config?.android?.versionCode;

  async function checkDatabase() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setResult(null);
    setError('');
    try {
      // Read-only diagnostics: no table changes and no transaction data is exported.
      const [quick, fkViolation, tableCount, userVersion, sqlite] = await Promise.all([
        db.getFirstAsync<{ quick_check: string }>('PRAGMA quick_check(1)'),
        db.getFirstAsync<{ table: string; rowid: number | null }>('PRAGMA foreign_key_check'),
        db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"),
        db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'),
        db.getFirstAsync<{ version: string }>('SELECT sqlite_version() AS version'),
      ]);
      const sqliteOk = quick?.quick_check === 'ok';
      const foreignKeysOk = fkViolation == null;
      setResult({
        checkedAt: new Date().toLocaleString('id-ID'),
        sqliteOk,
        foreignKeysOk,
        tables: tableCount?.count ?? 0,
        schemaVersion: userVersion?.user_version ?? 0,
        sqliteVersion: sqlite?.version ?? 'Tidak diketahui',
        problem: !sqliteOk
          ? `SQLite mengembalikan: ${quick?.quick_check ?? 'hasil tidak tersedia'}`
          : !foreignKeysOk
            ? 'Ditemukan pelanggaran foreign key. Simpan backup sebelum melakukan perbaikan.'
            : null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pemeriksaan database gagal.');
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Diagnostik Aplikasi', headerShown: true }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={{ padding: 20, paddingBottom: 70, gap: 18, width: '100%', maxWidth: 780, alignSelf: 'center' }}
      >
        <View style={{ gap: 6 }}>
          <Text variant="headlineSmall" style={{ fontWeight: '800' }}>Kesehatan Aplikasi</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Pemeriksaan lokal tanpa mengirim data ke internet atau mengubah isi database.
          </Text>
        </View>

        <Card mode="outlined" style={{ borderRadius: 20 }}>
          <Card.Content style={{ gap: 10 }}>
            <Text variant="titleMedium" style={{ fontWeight: '800' }}>Informasi Aplikasi</Text>
            <Text variant="bodyMedium">Aplikasi: {appName}</Text>
            <Text variant="bodyMedium">Versi konfigurasi: {version}</Text>
            <Text variant="bodyMedium">Android package: {packageName}</Text>
            <Text variant="bodyMedium">Android versionCode (konfigurasi): {buildCode ?? 'Tidak tersedia'}</Text>
            <Divider />
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Versi di atas berasal dari konfigurasi Expo dan dapat berbeda dari versi native saat memakai Expo Go.
            </Text>
          </Card.Content>
        </Card>

        <Card mode="outlined" style={{ borderRadius: 20 }}>
          <Card.Content style={{ gap: 13 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MaterialCommunityIcons name="database-outline" size={25} color={theme.colors.primary} />
              <Text variant="titleMedium" style={{ fontWeight: '800', flex: 1 }}>Diagnostik SQLite</Text>
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Memeriksa integritas database, foreign key, dan versi skema. Tidak menampilkan nominal atau catatan transaksi.
            </Text>
            <Button mode="contained" icon="shield-check-outline" loading={busy} disabled={busy} onPress={() => void checkDatabase()}>
              Periksa Database
            </Button>
            {busy && <ActivityIndicator size="small" />}
            {!!error && <Text style={{ color: theme.colors.error }}>{error}</Text>}
            {result && (
              <View style={{ gap: 8 }}>
                <Divider />
                <StatusLine title="Integritas SQLite" detail={result.sqliteOk ? 'Pemeriksaan quick_check berhasil' : 'Ada masalah integritas database'} ok={result.sqliteOk} />
                <StatusLine title="Relasi Foreign Key" detail={result.foreignKeysOk ? 'Tidak ditemukan pelanggaran relasi' : 'Ditemukan relasi tidak konsisten'} ok={result.foreignKeysOk} />
                <Text variant="bodySmall">Jumlah tabel aplikasi: {result.tables}</Text>
                <Text variant="bodySmall">Versi migrasi SQLite: {result.schemaVersion}</Text>
                <Text variant="bodySmall">Versi SQLite: {result.sqliteVersion}</Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Diperiksa: {result.checkedAt}</Text>
                {result.problem && <Text style={{ color: theme.colors.error }}>{result.problem}</Text>}
              </View>
            )}
          </Card.Content>
        </Card>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
          Pemeriksaan ini tidak menggantikan backup terenkripsi sebelum uji restore atau upgrade.
        </Text>
      </ScrollView>
    </>
  );
}
