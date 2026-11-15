import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Pressable,
    ScrollView,
    SectionList,
    StyleSheet,
    useWindowDimensions,
    View,
} from 'react-native';
import {
    ActivityIndicator,
    Button,
    Card,
    Chip,
    Dialog,
    Divider,
    FAB,
    HelperText,
    Portal,
    Searchbar,
    Text,
    TextInput,
    useTheme,
} from 'react-native-paper';

import { formatRupiah, getLocalDate } from '../../features/deypocket/format';
import {
    getHistoryOptions,
    getHistoryPage,
    getHistorySummary,
    HISTORY_PAGE_SIZE,
    type HistoryActivity,
    type HistoryFilter,
    type HistoryKind,
    type HistoryOptions,
    type HistorySummary,
} from '../../features/deypocket/transaction-history-repository';

// Only the transaction history screen is changed in this sprint.
// Icons in Paper controls use the same Expo MaterialCommunityIcons renderer.
type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type Period = 'month' | 'last30' | 'all' | 'custom';
type Picker = 'accounts' | 'categories' | null;
type Section = { title: string; data: HistoryActivity[] };

type KindOption = { value: HistoryKind; label: string; icon: IconName };
const KINDS: KindOption[] = [
  { value: 'all', label: 'Semua', icon: 'view-list' },
  { value: 'expense', label: 'Pengeluaran', icon: 'arrow-up-right' },
  { value: 'income', label: 'Pemasukan', icon: 'arrow-down-left' },
  { value: 'transfer', label: 'Transfer', icon: 'swap-horizontal' },
];

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 'month', label: 'Bulan ini' },
  { value: 'last30', label: '30 hari' },
  { value: 'all', label: 'Semua waktu' },
  { value: 'custom', label: 'Rentang' },
];

const ZERO_SUMMARY: HistorySummary = {
  total_count: 0,
  income: 0,
  expense: 0,
  transfer: 0,
  net: 0,
};

const POSITIVE = '#19815B';

function paperIcon(name: IconName) {
  return ({ size, color }: { size: number; color: string }) => (
    <MaterialCommunityIcons name={name} size={size} color={color} />
  );
}

function localIso(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return (
    year >= 2000 &&
    year <= 2100 &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function displayDate(value: string): string {
  if (!isValidDate(value)) return value;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function groupByDate(items: HistoryActivity[]): Section[] {
  const result: Section[] = [];
  for (const item of items) {
    const last = result[result.length - 1];
    if (last?.title === item.occurred_on) {
      last.data.push(item);
    } else {
      result.push({ title: item.occurred_on, data: [item] });
    }
  }
  return result;
}

function ActivityRow({ item }: { item: HistoryActivity }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 375;
  const isIncome = item.kind === 'income';
  const isExpense = item.kind === 'expense';
  const color = isIncome ? POSITIVE : isExpense ? theme.colors.error : theme.colors.primary;
  const icon: IconName = isIncome
    ? 'arrow-down-left'
    : isExpense
      ? 'arrow-up-right'
      : 'swap-horizontal';
  const sign = isIncome ? '+' : isExpense ? '−' : '';
  const amount = `${sign}${formatRupiah(item.amount_rupiah)}`;
  const description = item.account_name || 'Dompet tidak tersedia';
  const note = item.note?.trim() ?? '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${amount}, ${description}. Buka detail transaksi`}
      onPress={() =>
        router.push({
          pathname: '/transaction/detail',
          params: { id: String(item.id), kind: item.kind },
        })
      }
      style={({ pressed }) => [
        styles.activity,
        { opacity: pressed ? 0.62 : 1, backgroundColor: theme.colors.surface },
      ]}
    >
      <View
        style={[
          styles.activityIcon,
          { backgroundColor: isIncome
            ? theme.colors.primaryContainer
            : isExpense
              ? theme.colors.errorContainer
              : theme.colors.secondaryContainer },
        ]}
      >
        <MaterialCommunityIcons name={icon} color={color} size={22} />
      </View>

      <View style={styles.activityDetails}>
        <View style={styles.activityTitleRow}>
          <Text
            variant="titleSmall"
            numberOfLines={2}
            style={[styles.activityTitle, { color: theme.colors.onSurface }]}
          >
            {item.title}
          </Text>
          {!compact && (
            <Text
              variant="titleSmall"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.77}
              style={[styles.activityAmount, { color }]}
            >
              {amount}
            </Text>
          )}
        </View>
        <Text
          variant="bodySmall"
          numberOfLines={1}
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {description}
        </Text>
        {Boolean(note) && (
          <Text
            variant="bodySmall"
            numberOfLines={1}
            style={{ color: theme.colors.onSurfaceVariant, opacity: 0.8 }}
          >
            {note}
          </Text>
        )}
        {compact && (
          <Text variant="titleSmall" style={{ color, fontWeight: '800', marginTop: 2 }}>
            {amount}
          </Text>
        )}
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        size={18}
        color={theme.colors.onSurfaceVariant}
      />
    </Pressable>
  );
}

function SummaryPanel({ summary, loading }: { summary: HistorySummary; loading: boolean }) {
  const theme = useTheme();
  return (
    <Card
      mode="contained"
      style={[styles.summary, { backgroundColor: theme.colors.surfaceVariant }]}
    >
      <Card.Content style={styles.summaryContent}>
        <View style={styles.between}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Selisih pemasukan & pengeluaran
            </Text>
            <Text
              variant="headlineMedium"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                fontWeight: '800',
                letterSpacing: -0.7,
                color: summary.net < 0 ? theme.colors.error : theme.colors.onSurface,
              }}
            >
              {summary.net < 0 ? '−' : summary.net > 0 ? '+' : ''}
              {formatRupiah(Math.abs(summary.net))}
            </Text>
          </View>
          {loading ? (
            <ActivityIndicator size="small" />
          ) : (
            <View style={[styles.summaryIcon, { backgroundColor: theme.colors.primaryContainer }]}>
              <MaterialCommunityIcons name="chart-line" color={theme.colors.primary} size={21} />
            </View>
          )}
        </View>
        <Divider style={{ backgroundColor: theme.colors.outlineVariant }} />
        <View style={styles.summaryMetrics}>
          <View style={styles.metric}>
            <View style={styles.metricLabel}>
              <MaterialCommunityIcons name="arrow-down-left" size={17} color={POSITIVE} />
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Pemasukan
              </Text>
            </View>
            <Text
              variant="titleMedium"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ color: POSITIVE, fontWeight: '800' }}
            >
              {formatRupiah(summary.income)}
            </Text>
          </View>
          <View style={[styles.metric, styles.metricRight]}>
            <View style={styles.metricLabel}>
              <MaterialCommunityIcons name="arrow-up-right" size={17} color={theme.colors.error} />
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Pengeluaran
              </Text>
            </View>
            <Text
              variant="titleMedium"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ color: theme.colors.error, fontWeight: '800' }}
            >
              {formatRupiah(summary.expense)}
            </Text>
          </View>
        </View>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Transfer antar dompet tidak dihitung sebagai pemasukan atau pengeluaran.
        </Text>
      </Card.Content>
    </Card>
  );
}

export default function TransactionsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();

  const [iconsReady, setIconsReady] = useState(false);
  const [iconError, setIconError] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [kind, setKind] = useState<HistoryKind>('all');
  const [period, setPeriod] = useState<Period>('month');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [customFrom, setCustomFrom] = useState(getLocalDate);
  const [customTo, setCustomTo] = useState(getLocalDate);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const [options, setOptions] = useState<HistoryOptions>({ accounts: [], categories: [] });
  const [items, setItems] = useState<HistoryActivity[]>([]);
  const [summary, setSummary] = useState<HistorySummary>(ZERO_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const requestRef = useRef(0);
  const moreRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    // Avoid blank glyphs on first render (especially in Expo Web).
    void MaterialCommunityIcons.loadFont()
      .then(() => { if (mounted) setIconsReady(true); })
      .catch(() => { if (mounted) setIconError(true); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => clearTimeout(timer);
  }, [search]);

  const dateError = useMemo(() => {
    if (period !== 'custom') return '';
    if (!isValidDate(customFrom) || !isValidDate(customTo)) {
      return 'Gunakan format tanggal YYYY-MM-DD yang valid.';
    }
    if (customFrom > customTo) return 'Tanggal mulai tidak boleh setelah tanggal akhir.';
    return '';
  }, [period, customFrom, customTo]);

  const filter = useMemo<HistoryFilter>(() => {
    const today = new Date();
    let dateFrom: string | null = null;
    let dateTo: string | null = null;

    if (period === 'month') {
      dateFrom = localIso(new Date(today.getFullYear(), today.getMonth(), 1));
      dateTo = localIso(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    } else if (period === 'last30') {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      start.setDate(start.getDate() - 29);
      dateFrom = localIso(start);
      dateTo = localIso(today);
    } else if (period === 'custom' && !dateError) {
      dateFrom = customFrom;
      dateTo = customTo;
    }
    return { query: debouncedSearch, kind, dateFrom, dateTo, categoryId, accountId };
  }, [period, kind, debouncedSearch, customFrom, customTo, dateError, categoryId, accountId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getHistoryOptions(db)
        .then((result) => { if (active) setOptions(result); })
        .catch((e: unknown) => {
          if (active) setError(e instanceof Error ? e.message : 'Gagal memuat opsi filter.');
        });
      return () => { active = false; };
    }, [db])
  );

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    moreRef.current = false;
    setLoadingMore(false);
    if (dateError) {
      setItems([]);
      setSummary(ZERO_SUMMARY);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [nextItems, nextSummary] = await Promise.all([
        getHistoryPage(db, filter, 0),
        getHistorySummary(db, filter),
      ]);
      if (request !== requestRef.current) return;
      setItems(nextItems);
      setSummary(nextSummary);
    } catch (e) {
      if (request !== requestRef.current) return;
      setItems([]);
      setSummary(ZERO_SUMMARY);
      setError(e instanceof Error ? e.message : 'Gagal memuat histori transaksi.');
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [db, filter, dateError]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      return () => { requestRef.current += 1; };
    }, [refresh])
  );

  const loadMore = useCallback(async () => {
    if (
      loading || loadingMore || moreRef.current || dateError ||
      items.length >= summary.total_count
    ) return;
    moreRef.current = true;
    setLoadingMore(true);
    const request = requestRef.current;
    try {
      const next = await getHistoryPage(db, filter, items.length, HISTORY_PAGE_SIZE);
      if (request === requestRef.current) {
        setItems((current) => [...current, ...next]);
      }
    } catch (e) {
      if (request === requestRef.current) {
        setError(e instanceof Error ? e.message : 'Gagal memuat transaksi selanjutnya.');
      }
    } finally {
      if (request === requestRef.current) setLoadingMore(false);
      moreRef.current = false;
    }
  }, [db, filter, items.length, loading, loadingMore, summary.total_count, dateError]);

  const sections = useMemo(() => groupByDate(items), [items]);
  const categoryOptions = options.categories.filter(
    (c) => kind === 'all' || kind === 'transfer' || c.kind === kind
  );
  const selectedAccount = options.accounts.find((a) => a.id === accountId);
  const selectedCategory = options.categories.find((c) => c.id === categoryId);
  const hasActiveFilters =
    Boolean(search.trim()) || kind !== 'all' || period !== 'month' ||
    categoryId !== null || accountId !== null;
  const advancedCount = Number(categoryId !== null) + Number(accountId !== null) + Number(period === 'custom');
  const periodLabel = PERIODS.find((row) => row.value === period)?.label ?? 'Bulan ini';

  function changeKind(value: HistoryKind) {
    setKind(value);
    if (value === 'transfer') {
      setCategoryId(null);
    } else if (categoryId !== null && value !== 'all') {
      const selected = options.categories.find((row) => row.id === categoryId);
      if (selected?.kind !== value) setCategoryId(null);
    }
  }

  function resetFilters() {
    setSearch('');
    setDebouncedSearch('');
    setKind('all');
    setPeriod('month');
    setAccountId(null);
    setCategoryId(null);
    setCustomFrom(getLocalDate());
    setCustomTo(getLocalDate());
    setPicker(null);
  }

  // Show the screen only after the icon font is loaded: no invisible icons on first view.
  if (!iconsReady) {
    return (
      <View style={[styles.iconLoading, { backgroundColor: theme.colors.background }]}>
        {iconError ? (
          <Card mode="outlined" style={{ margin: 20, maxWidth: 440 }}>
            <Card.Content style={{ gap: 10 }}>
              <Text variant="titleMedium">Ikon tidak dapat dimuat</Text>
              <Text variant="bodyMedium">
                Periksa instalasi @expo/vector-icons, lalu jalankan npx expo start --clear.
              </Text>
            </Card.Content>
          </Card>
        ) : (
          <>
            <ActivityIndicator size="large" />
            <Text variant="bodyMedium">Menyiapkan tampilan transaksi...</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        refreshing={loading && items.length > 0}
        onRefresh={() => void refresh()}
        ListHeaderComponent={
          <View style={{ gap: 16, paddingBottom: 6 }}>
            <View style={styles.topHeader}>
              <View style={{ flex: 1, gap: 5 }}>
                <Text variant="labelLarge" style={{ color: theme.colors.primary, fontWeight: '800', letterSpacing: 0.9 }}>
                  DEYPOCKET
                </Text>
                <Text variant="headlineMedium" style={{ fontWeight: '800', letterSpacing: -0.5 }}>
                  Transaksi
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Cari dan kelola riwayat keuanganmu.
                </Text>
              </View>
              <View style={[styles.headerIcon, { backgroundColor: theme.colors.primaryContainer }]}>
                <MaterialCommunityIcons name="history" size={25} color={theme.colors.primary} />
              </View>
            </View>

            <SummaryPanel summary={summary} loading={loading} />

            <Searchbar
              placeholder="Cari transaksi, catatan, dompet..."
              value={search}
              onChangeText={setSearch}
              icon={paperIcon('magnify')}
              clearIcon={paperIcon('close')}
              style={[styles.search, { backgroundColor: theme.colors.surface }]}
              inputStyle={{ fontSize: 14 }}
              elevation={0}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.chips}
            >
              {KINDS.map((option) => (
                <Chip
                  key={option.value}
                  selected={kind === option.value}
                  showSelectedCheck={false}
                  icon={paperIcon(option.icon)}
                  onPress={() => changeKind(option.value)}
                  style={{
                    borderRadius: 14,
                    backgroundColor: kind === option.value
                      ? theme.colors.primaryContainer
                      : theme.colors.surface,
                  }}
                  textStyle={{ fontWeight: kind === option.value ? '700' : '500' }}
                >
                  {option.label}
                </Chip>
              ))}
            </ScrollView>

            <View style={styles.toolbar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Filter lanjutan, ${advancedCount} filter dipilih`}
                onPress={() => setFiltersOpen((v) => !v)}
                style={[
                  styles.filterToggle,
                  { backgroundColor: filtersOpen ? theme.colors.primaryContainer : theme.colors.surface,
                    borderColor: theme.colors.outlineVariant },
                ]}
              >
                <MaterialCommunityIcons
                  name="tune-variant"
                  size={19}
                  color={filtersOpen ? theme.colors.primary : theme.colors.onSurface}
                />
                <Text variant="labelLarge" style={{ fontWeight: '700' }}>
                  Filter
                  {advancedCount > 0 ? ` (${advancedCount})` : ''}
                </Text>
                <MaterialCommunityIcons
                  name={filtersOpen ? 'chevron-up' : 'chevron-down'}
                  size={17}
                  color={theme.colors.onSurfaceVariant}
                />
              </Pressable>
              <View style={{ flex: 1 }} />
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {periodLabel}
              </Text>
              {hasActiveFilters && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Reset semua filter"
                  onPress={resetFilters}
                  style={styles.resetButton}
                >
                  <MaterialCommunityIcons name="refresh" size={16} color={theme.colors.primary} />
                  <Text variant="labelMedium" style={{ color: theme.colors.primary }}>Reset</Text>
                </Pressable>
              )}
            </View>

            {filtersOpen && (
              <Card mode="outlined" style={[styles.filterCard, { borderColor: theme.colors.outlineVariant }]}>
                <Card.Content style={{ gap: 16 }}>
                  <View style={styles.filterTitle}>
                    <MaterialCommunityIcons name="calendar-month-outline" size={19} color={theme.colors.primary} />
                    <Text variant="titleSmall" style={{ fontWeight: '800' }}>Periode</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {PERIODS.map((option) => (
                      <Chip
                        key={option.value}
                        selected={period === option.value}
                        showSelectedCheck={false}
                        onPress={() => setPeriod(option.value)}
                        style={{ borderRadius: 12 }}
                      >
                        {option.label}
                      </Chip>
                    ))}
                  </ScrollView>
                  {period === 'custom' && (
                    <View style={{ gap: 8 }}>
                      <TextInput
                        mode="outlined"
                        dense
                        label="Dari (YYYY-MM-DD)"
                        value={customFrom}
                        onChangeText={setCustomFrom}
                        autoCapitalize="none"
                        keyboardType="numbers-and-punctuation"
                        error={Boolean(dateError)}
                      />
                      <TextInput
                        mode="outlined"
                        dense
                        label="Sampai (YYYY-MM-DD)"
                        value={customTo}
                        onChangeText={setCustomTo}
                        autoCapitalize="none"
                        keyboardType="numbers-and-punctuation"
                        error={Boolean(dateError)}
                      />
                      {Boolean(dateError) && <HelperText type="error">{dateError}</HelperText>}
                    </View>
                  )}
                  <Divider />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setPicker('accounts')}
                    style={styles.optionRow}
                  >
                    <MaterialCommunityIcons name="wallet-outline" size={21} color={theme.colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Dompet</Text>
                      <Text variant="titleSmall" numberOfLines={1} style={{ fontWeight: '700' }}>
                        {selectedAccount?.name ?? 'Semua dompet'}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
                  </Pressable>
                  {kind !== 'transfer' && (
                    <>
                      <Divider />
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setPicker('categories')}
                        style={styles.optionRow}
                      >
                        <MaterialCommunityIcons name="shape-outline" size={21} color={theme.colors.primary} />
                        <View style={{ flex: 1 }}>
                          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Kategori</Text>
                          <Text variant="titleSmall" numberOfLines={1} style={{ fontWeight: '700' }}>
                            {selectedCategory?.name ?? 'Semua kategori'}
                          </Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
                      </Pressable>
                    </>
                  )}
                </Card.Content>
              </Card>
            )}

            <View style={styles.listHeading}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="titleLarge" style={{ fontWeight: '800' }}>Daftar transaksi</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {summary.total_count.toLocaleString('id-ID')} transaksi sesuai filter
                </Text>
              </View>
              {loading && items.length > 0 && <ActivityIndicator size="small" />}
            </View>

            {Boolean(dateError) && !filtersOpen && (
              <HelperText type="error">{dateError}</HelperText>
            )}
            {Boolean(error) && (
              <Card mode="outlined" style={{ borderColor: theme.colors.error }}>
                <Card.Content style={{ gap: 8 }}>
                  <Text variant="bodyMedium" style={{ color: theme.colors.error }}>{error}</Text>
                  <Button icon={paperIcon('refresh')} onPress={() => void refresh()} mode="text">
                    Coba lagi
                  </Button>
                </Card.Content>
              </Card>
            )}
            {loading && items.length === 0 && (
              <View style={styles.center}>
                <ActivityIndicator size="large" />
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  Memuat transaksi...
                </Text>
              </View>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dateHeader}>
            <Text variant="labelLarge" style={{ fontWeight: '800', flex: 1 }}>
              {displayDate(section.title)}
            </Text>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {section.data.length} ditampilkan
            </Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <View style={[styles.rowContainer, { backgroundColor: theme.colors.surface }]}>
            <ActivityRow item={item} />
            {index < section.data.length - 1 && (
              <Divider style={{ marginLeft: 70, backgroundColor: theme.colors.outlineVariant }} />
            )}
          </View>
        )}
        ListEmptyComponent={
          !loading && !error && !dateError ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.colors.surfaceVariant }]}>
                <MaterialCommunityIcons name="magnify" size={30} color={theme.colors.onSurfaceVariant} />
              </View>
              <Text variant="titleMedium" style={{ fontWeight: '800' }}>Belum ada transaksi</Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
                Belum ada transaksi untuk pencarian dan filter yang dipilih.
              </Text>
              {hasActiveFilters && (
                <Button mode="outlined" icon={paperIcon('refresh')} onPress={resetFilters}>
                  Atur ulang filter
                </Button>
              )}
            </View>
          ) : undefined
        }
        ListFooterComponent={
          items.length > 0 && items.length < summary.total_count ? (
            <Button
              mode="outlined"
              icon={paperIcon('chevron-down')}
              style={{ marginTop: 20, marginBottom: 6 }}
              loading={loadingMore}
              disabled={loading || loadingMore}
              onPress={() => void loadMore()}
            >
              Muat lebih banyak ({items.length}/{summary.total_count})
            </Button>
          ) : undefined
        }
      />

      <Portal>
        <Dialog
          visible={picker !== null}
          onDismiss={() => setPicker(null)}
          style={styles.pickerDialog}
        >
          <Dialog.Title>
            {picker === 'accounts' ? 'Pilih Dompet' : 'Pilih Kategori'}
          </Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
            <ScrollView style={{ maxHeight: 350 }} keyboardShouldPersistTaps="handled">
              <Pressable
                onPress={() => {
                  if (picker === 'accounts') setAccountId(null);
                  if (picker === 'categories') setCategoryId(null);
                  setPicker(null);
                }}
                style={styles.dialogRow}
              >
                <Text variant="bodyLarge" style={{ flex: 1 }}>Semua {picker === 'accounts' ? 'dompet' : 'kategori'}</Text>
                <MaterialCommunityIcons
                  name={(picker === 'accounts' ? accountId : categoryId) === null ? 'check-circle' : 'circle-outline'}
                  size={21}
                  color={theme.colors.primary}
                />
              </Pressable>
              {(picker === 'accounts' ? options.accounts : categoryOptions).map((option) => {
                const isSelected = picker === 'accounts' ? accountId === option.id : categoryId === option.id;
                const category = picker === 'categories'
                  ? options.categories.find((row) => row.id === option.id)
                  : undefined;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      if (picker === 'accounts') setAccountId(option.id);
                      if (picker === 'categories') setCategoryId(option.id);
                      setPicker(null);
                    }}
                    style={styles.dialogRow}
                  >
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text variant="bodyLarge" numberOfLines={2}>{option.name}</Text>
                      {category && (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {category.kind === 'income' ? 'Pemasukan' : 'Pengeluaran'}
                        </Text>
                      )}
                    </View>
                    <MaterialCommunityIcons
                      name={isSelected ? 'check-circle' : 'circle-outline'}
                      size={21}
                      color={isSelected ? theme.colors.primary : theme.colors.outline}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setPicker(null)}>Tutup</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <FAB
        icon={paperIcon('plus')}
        label="Tambah"
        accessibilityLabel="Tambah transaksi"
        onPress={() => router.push('/transaction/add')}
        style={[styles.fab, { backgroundColor: theme.colors.primaryContainer }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 780,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 130,
  },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  topHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  summary: { borderRadius: 22 },
  summaryContent: { padding: 18, gap: 15 },
  summaryIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  summaryMetrics: { flexDirection: 'row', alignItems: 'flex-start' },
  metric: { flex: 1, minWidth: 0, gap: 7 },
  metricRight: { paddingLeft: 15, marginLeft: 15, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(128,128,128,0.35)' },
  metricLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  search: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(128,128,128,0.30)' },
  chips: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 2 },
  toolbar: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  filterToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 42, borderRadius: 13, borderWidth: 1 },
  resetButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 38 },
  filterCard: { borderRadius: 18 },
  filterTitle: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 5 },
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 5 },
  dateHeader: { flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'space-between', paddingTop: 20, paddingBottom: 11 },
  rowContainer: { borderRadius: 15, overflow: 'hidden', marginBottom: 2 },
  activity: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 14, gap: 12, minHeight: 76 },
  activityIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  activityDetails: { flex: 1, minWidth: 0, gap: 5 },
  activityTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  activityTitle: { flex: 1, minWidth: 0, fontWeight: '700' },
  activityAmount: { maxWidth: '48%', textAlign: 'right', fontWeight: '800' },
  center: { padding: 30, alignItems: 'center', gap: 12 },
  empty: { marginTop: 14, borderRadius: 18, alignItems: 'center', paddingVertical: 36, paddingHorizontal: 22, gap: 11 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  pickerDialog: { borderRadius: 20, alignSelf: 'center', width: '92%', maxWidth: 480 },
  dialogRow: { minHeight: 54, paddingHorizontal: 20, paddingVertical: 11, flexDirection: 'row', gap: 12, alignItems: 'center' },
  fab: { position: 'absolute', right: 20, bottom: 22, borderRadius: 16 },
  iconLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 15 },
});
