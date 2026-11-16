import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useFocusEffect } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import {
  ActivityIndicator, Button, Card, Chip, Dialog, Divider,
  HelperText, List, Portal, Text, TextInput, useTheme,
} from 'react-native-paper';
import {
  getHistoryOptions, getHistoryPage, getHistorySummary,
  type HistoryActivity, type HistoryFilter, type HistoryKind,
  type HistoryOptions, type HistorySummary,
} from '../features/deypocket/transaction-history-repository';
import {
  makeHistoryCsv, makeMonthlyCsv, monthBounds, monthKey,
  reportFileStamp, validDay, type MonthlyReportRow,
} from '../features/deypocket/report-csv';
import { formatRupiah, getLocalDate } from '../features/deypocket/format';

type Period = 'current' | 'previous' | 'all' | 'custom';
const PAGE_SIZE = 100;
const MAX_REPORT_ROWS = 20000;
const EMPTY_SUMMARY: HistorySummary = {
  total_count: 0, income: 0, expense: 0, transfer: 0, net: 0,
};
const PERIODS: Array<{ key: Period; label: string }> = [
  { key: 'current', label: 'Bulan ini' },
  { key: 'previous', label: 'Bulan lalu' },
  { key: 'all', label: 'Semua' },
  { key: 'custom', label: 'Rentang' },
];
const KINDS: Array<{ key: HistoryKind; label: string }> = [
  { key: 'all', label: 'Semua' },
  { key: 'income', label: 'Masuk' },
  { key: 'expense', label: 'Keluar' },
  { key: 'transfer', label: 'Transfer' },
];

function getErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : 'Terjadi kesalahan saat membuat laporan.';
}

/** Exports locally; no upload and no cloud account required. */
async function exportCsv(filename: string, content: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      // Allow the browser to read the Blob before releasing the object URL.
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
    return;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Menu berbagi tidak tersedia. Coba jalankan aplikasi di Android.');
  }
  // Expo SDK 58: File.write returns a Promise.
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  await file.write(content);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Simpan laporan DeyPocket',
    UTI: 'public.comma-separated-values-text',
  });
}

async function loadAllFiltered(
  db: ReturnType<typeof useSQLiteContext>,
  filter: HistoryFilter,
  expectedCount: number
): Promise<HistoryActivity[]> {
  if (expectedCount > MAX_REPORT_ROWS) {
    throw new Error(`Terdapat ${expectedCount.toLocaleString('id-ID')} transaksi. Gunakan rentang lebih kecil (maksimal ${MAX_REPORT_ROWS.toLocaleString('id-ID')}).`);
  }
  const result: HistoryActivity[] = [];
  for (let offset = 0; offset < expectedCount; offset += PAGE_SIZE) {
    const page = await getHistoryPage(db, filter, offset, PAGE_SIZE);
    if (page.length === 0) break;
    result.push(...page);
  }
  if (result.length !== expectedCount) {
    throw new Error('Jumlah transaksi berubah saat ekspor. Silakan ulangi agar laporan lengkap.');
  }
  return result;
}

function ValueMetric({
  label, amount, color,
}: { label: string; amount: number; color: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
      <Text variant="bodySmall" style={{ opacity: 0.8 }}>{label}</Text>
      <Text
        variant="titleMedium"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color, fontWeight: '800' }}
      >
        {formatRupiah(amount)}
      </Text>
    </View>
  );
}

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const busyRef = useRef(false);

  const [period, setPeriod] = useState<Period>('current');
  const [kind, setKind] = useState<HistoryKind>('all');
  const [from, setFrom] = useState(getLocalDate);
  const [to, setTo] = useState(getLocalDate);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accountsDialog, setAccountsDialog] = useState(false);
  const [options, setOptions] = useState<HistoryOptions>({ accounts: [], categories: [] });
  const [summary, setSummary] = useState<HistorySummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const dateError = useMemo(() => {
    if (period !== 'custom') return '';
    if (!validDay(from) || !validDay(to)) {
      return 'Masukkan tanggal valid dengan format YYYY-MM-DD.';
    }
    if (from > to) return 'Tanggal awal tidak boleh melewati tanggal akhir.';
    return '';
  }, [period, from, to]);

  const filter = useMemo<HistoryFilter>(() => {
    const today = new Date();
    const dates = period === 'current'
      ? monthBounds(today)
      : period === 'previous'
        ? monthBounds(today, -1)
        : period === 'custom'
          ? { from, to }
          : { from: null, to: null };
    return {
      kind, accountId, dateFrom: dates.from, dateTo: dates.to,
    };
  }, [period, kind, accountId, from, to]);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (dateError) {
      setLoading(false);
      setSummary(EMPTY_SUMMARY);
      return () => { active = false; };
    }
    setLoading(true);
    setError('');
    void Promise.all([
      getHistorySummary(db, filter),
      getHistoryOptions(db),
    ]).then(([totals, foundOptions]) => {
      if (!active) return;
      setSummary(totals);
      setOptions(foundOptions);
    }).catch((reason: unknown) => {
      if (active) setError(getErrorMessage(reason));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [db, filter, dateError]));

  const selectedAccount = options.accounts.find((item) => item.id === accountId);

  async function runExport(job: () => Promise<void>): Promise<void> {
    if (busyRef.current || loading || !!dateError) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await job();
      setNotice(Platform.OS === 'web'
        ? 'Pengunduhan CSV dimulai. Periksa folder Unduhan browser.'
        : 'Menu berbagi sudah ditampilkan. Pastikan file tersimpan di lokasi yang kamu pilih.');
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function exportDetail(): void {
    void runExport(async () => {
      // Always refresh summary before exporting to avoid stale count.
      const totals = await getHistorySummary(db, filter);
      const rows = await loadAllFiltered(db, filter, totals.total_count);
      const csv = makeHistoryCsv(rows);
      await exportCsv(`deypocket-transaksi-${reportFileStamp(new Date())}.csv`, csv);
    });
  }

  function exportMonthly(): void {
    void runExport(async () => {
      const today = new Date();
      const results: MonthlyReportRow[] = [];
      // Deliberately independent of UI filters: always full-book last 12 months.
      for (let offset = -11; offset <= 0; offset += 1) {
        const dates = monthBounds(today, offset);
        const totals = await getHistorySummary(db, {
          kind: 'all', dateFrom: dates.from, dateTo: dates.to,
        });
        results.push({ month: monthKey(today, offset), summary: totals });
      }
      const csv = makeMonthlyCsv(results);
      await exportCsv(`deypocket-rekap-12bulan-${reportFileStamp(today)}.csv`, csv);
    });
  }

  const canExport = !busy && !loading && !dateError;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ title: 'Laporan Keuangan', headerShown: true }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ width: '100%', maxWidth: 780, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 22, paddingBottom: 80, gap: 17 }}
      >
        <View style={{ gap: 7 }}>
          <Text variant="labelLarge" style={{ fontWeight: '800', color: theme.colors.primary, letterSpacing: 1 }}>DEYPOCKET · OFFLINE</Text>
          <Text variant="headlineMedium" style={{ fontWeight: '800' }}>Laporan Keuangan</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Ringkas transaksi dan ekspor CSV untuk Excel tanpa mengunggah data ke server.
          </Text>
        </View>

        <Card mode="outlined" style={{ borderRadius: 20, backgroundColor: theme.colors.surface }}>
          <Card.Content style={{ gap: 14, paddingVertical: 18 }}>
            <Text variant="titleSmall" style={{ fontWeight: '800' }}>Periode laporan</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
              {PERIODS.map((choice) => (
                <Chip key={choice.key} selected={period === choice.key} onPress={() => setPeriod(choice.key)} showSelectedCheck={false}>
                  {choice.label}
                </Chip>
              ))}
            </ScrollView>
            {period === 'custom' && (
              <View style={{ gap: 8 }}>
                <TextInput mode="outlined" dense label="Dari (YYYY-MM-DD)" value={from}
                  keyboardType="numbers-and-punctuation" autoCapitalize="none" onChangeText={setFrom} error={!!dateError} />
                <TextInput mode="outlined" dense label="Sampai (YYYY-MM-DD)" value={to}
                  keyboardType="numbers-and-punctuation" autoCapitalize="none" onChangeText={setTo} error={!!dateError} />
                {!!dateError && <HelperText type="error">{dateError}</HelperText>}
              </View>
            )}
            <Divider />
            <Text variant="titleSmall" style={{ fontWeight: '800' }}>Jenis transaksi</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
              {KINDS.map((choice) => (
                <Chip key={choice.key} selected={kind === choice.key} onPress={() => setKind(choice.key)} showSelectedCheck={false}>
                  {choice.label}
                </Chip>
              ))}
            </ScrollView>
            <Button mode="outlined" icon="wallet-outline" onPress={() => setAccountsDialog(true)} contentStyle={{ justifyContent: 'flex-start' }}>
              {selectedAccount?.name ?? 'Semua dompet & rekening'}
            </Button>
          </Card.Content>
        </Card>

        <Card mode="contained" style={{ borderRadius: 22 }}>
          <Card.Content style={{ gap: 15, padding: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>Selisih pemasukan − pengeluaran</Text>
              <MaterialCommunityIcons name="chart-line" size={22} color={theme.colors.primary} />
            </View>
            {loading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator /><Text>Memuat ringkasan…</Text>
              </View>
            ) : (
              <>
                <Text variant="headlineMedium" numberOfLines={1} adjustsFontSizeToFit
                  style={{ color: summary.net < 0 ? theme.colors.error : theme.colors.primary, fontWeight: '800' }}>
                  {summary.net > 0 ? '+' : summary.net < 0 ? '−' : ''}{formatRupiah(Math.abs(summary.net))}
                </Text>
                <Divider />
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <ValueMetric label="Pemasukan" amount={summary.income} color={theme.colors.primary} />
                  <ValueMetric label="Pengeluaran" amount={summary.expense} color={theme.colors.error} />
                </View>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <MaterialCommunityIcons name="information-outline" size={17} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>
                    {summary.total_count.toLocaleString('id-ID')} transaksi · Transfer internal {formatRupiah(summary.transfer)} tidak mengubah selisih.
                  </Text>
                </View>
              </>
            )}
          </Card.Content>
        </Card>

        {!!error && (
          <Card mode="outlined" style={{ borderColor: theme.colors.error }}>
            <Card.Content><Text style={{ color: theme.colors.error }}>{error}</Text></Card.Content>
          </Card>
        )}
        {!!notice && (
          <Card mode="outlined"><Card.Content><Text>{notice}</Text></Card.Content></Card>
        )}

        <Card mode="outlined" style={{ borderRadius: 20 }}>
          <Card.Content style={{ gap: 12, paddingVertical: 18 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <MaterialCommunityIcons name="file-export-outline" size={27} color={theme.colors.primary} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="titleMedium" style={{ fontWeight: '800' }}>Ekspor Detail Transaksi</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Mengikuti periode, jenis, dan dompet terpilih.
                </Text>
              </View>
            </View>
            <Button icon="download-outline" mode="contained" disabled={!canExport} loading={busy}
              onPress={exportDetail}>
              Ekspor CSV Transaksi
            </Button>
            <HelperText type="info">Batas 20.000 transaksi per ekspor untuk menjaga performa perangkat.</HelperText>
          </Card.Content>
        </Card>

        <Card mode="outlined" style={{ borderRadius: 20 }}>
          <Card.Content style={{ gap: 12, paddingVertical: 18 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <MaterialCommunityIcons name="calendar-month-outline" size={27} color={theme.colors.primary} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="titleMedium" style={{ fontWeight: '800' }}>Rekap 12 Bulan Terakhir</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Selalu seluruh dompet dan semua jenis transaksi; tidak mengikuti filter di atas.
                </Text>
              </View>
            </View>
            <Button icon="file-delimited-outline" mode="outlined" disabled={!canExport}
              onPress={exportMonthly}>Ekspor CSV Rekap Bulanan</Button>
          </Card.Content>
        </Card>

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingHorizontal: 3 }}>
          <MaterialCommunityIcons name="shield-lock-outline" size={19} color={theme.colors.onSurfaceVariant} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>
            Laporan CSV tidak dienkripsi. Simpan dengan aman dan jangan unggah ke repository GitHub.
          </Text>
        </View>
      </ScrollView>

      <Portal>
        <Dialog visible={accountsDialog} onDismiss={() => setAccountsDialog(false)} style={{ borderRadius: 22 }}>
          <Dialog.Title>Pilih Dompet</Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
            <ScrollView style={{ maxHeight: 390 }} keyboardShouldPersistTaps="handled">
              <List.Item title="Semua dompet & rekening" left={(p) => <List.Icon {...p} icon="wallet-outline" />}
                onPress={() => { setAccountId(null); setAccountsDialog(false); }} />
              {options.accounts.map((account) => (
                <List.Item key={account.id} title={account.name}
                  left={(p) => <List.Icon {...p} icon={accountId === account.id ? 'check-circle-outline' : 'wallet-outline'} />}
                  onPress={() => { setAccountId(account.id); setAccountsDialog(false); }} />
              ))}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions><Button onPress={() => setAccountsDialog(false)}>Tutup</Button></Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}
