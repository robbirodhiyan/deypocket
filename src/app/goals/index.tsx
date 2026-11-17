import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { formatRupiah } from '../../features/deypocket/format';
import { getWallets, type WalletRecord } from '../../features/deypocket/finance-management';
import { getGoalWalletLinks, setGoalWalletLink } from '../../features/deypocket/goal-wallet-repository';
import { calculateGoalPlan } from '../../features/deypocket/goal-planner';
import { buildGoalHistoryView, type GoalHistoryFilter } from '../../features/deypocket/goal-history';
import { calculateGoalInsights, getGoalActivityMap, type GoalActivityMap } from '../../features/deypocket/goal-insights';
import {
  cancelManualGoalEntry, getGoalCorrectionMap, type GoalCorrectionMap,
} from '../../features/deypocket/goal-corrections';
import {
  auditSavingsGoals, getGoalEntrySourceMap,
  type GoalAuditReport, type GoalEntrySourceMap,
} from '../../features/deypocket/goal-audit';
import {
  deleteSavingsGoal,
  getGoalEntries,
  getSavingsGoals,
  setGoalArchived,
  type GoalEntry,
  type SavingsGoal,
} from '../../features/deypocket/goals-repository';

type Filter = 'active' | 'archived';
type DialogAction = 'actions' | 'archive' | 'restore' | 'delete' | 'wallet';
type DialogState = { goal: SavingsGoal; action: DialogAction };
type CorrectionPrompt = { goal: SavingsGoal; entry: GoalEntry };
type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

function progress(saved: number, target: number): number {
  return target > 0 ? Math.min(1, Math.max(0, saved / target)) : 0;
}

function progressText(saved: number, target: number): string {
  if (target <= 0) return '0%';
  return `${Math.round((saved / target) * 100)}%`;
}

function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function rupiah(value: number): string {
  return formatRupiah(Math.max(0, value));
}

type ActionProps = {
  title: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'outline' | 'subtle' | 'danger';
  compact?: boolean;
  flex?: number;
};

function Action({
  title, icon, onPress, disabled = false,
  variant = 'outline', compact = false, flex,
}: ActionProps) {
  const theme = useTheme();
  const primary = variant === 'primary';
  const danger = variant === 'danger';
  const subtle = variant === 'subtle';
  const color = danger ? theme.colors.error : primary ? theme.colors.onPrimary : theme.colors.onSurface;
  const backgroundColor = primary ? theme.colors.primary : subtle ? theme.colors.surfaceVariant : 'transparent';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        compact ? styles.compactAction : styles.normalAction,
        { flex, backgroundColor, borderColor: primary || subtle ? 'transparent' : theme.colors.outlineVariant },
        pressed && !disabled && { opacity: 0.7 },
        disabled && { opacity: 0.45 },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={compact ? 19 : 20} color={color} />
      <Text numberOfLines={1} style={[styles.actionLabel, { color }]}>{title}</Text>
    </Pressable>
  );
}

export default function GoalsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { height: viewportHeight } = useWindowDimensions();

  const [filter, setFilter] = useState<Filter>('active');
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [activity, setActivity] = useState<GoalActivityMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [history, setHistory] = useState<GoalEntry[]>([]);
  const [historyFilter, setHistoryFilter] = useState<GoalHistoryFilter>('all');
  const [historyVisibleLimit, setHistoryVisibleLimit] = useState(30);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [entrySources, setEntrySources] = useState<GoalEntrySourceMap>({});
  const [correctionMap, setCorrectionMap] = useState<GoalCorrectionMap>({});
  const [correctionPrompt, setCorrectionPrompt] = useState<CorrectionPrompt | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditReport, setAuditReport] = useState<GoalAuditReport | null>(null);
  const [auditError, setAuditError] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [walletLinks, setWalletLinks] = useState<Record<number, number>>({});
  const [walletError, setWalletError] = useState('');

  const historyRequest = useRef(0);
  const lock = useRef(false);

  const reload = useCallback(async (nextFilter: Filter) => {
    setGoals(await getSavingsGoals(db, nextFilter === 'archived'));
    if (nextFilter === 'active') {
      try { setActivity(await getGoalActivityMap(db)); } catch { setActivity({}); }
    } else {
      setActivity({});
    }
    // Membership is only metadata. Failure here must not block Goals.
    try {
      setWalletLinks(await getGoalWalletLinks(db));
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Rekening terkait belum dapat dimuat.');
    }
  }, [db]);

  const reloadWallets = useCallback(async () => {
    try {
      const [walletRows, links] = await Promise.all([
        getWallets(db), getGoalWalletLinks(db),
      ]);
      setWallets(walletRows);
      setWalletLinks(links);
      setWalletError('');
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Rekening terkait belum dapat dimuat.');
    }
  }, [db]);

  async function chooseWallet(goalId: number, walletId: number | null) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setWalletError('');
    try {
      await setGoalWalletLink(db, goalId, walletId);
      await reloadWallets();
      setDialog(null);
      setNotice(walletId === null
        ? 'Kaitan rekening berhasil dilepas. Catatan target tetap aman.'
        : 'Rekening berhasil dihubungkan ke target.');
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Gagal menghubungkan rekening.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  useFocusEffect(useCallback(() => {
    let active = true;
    ++historyRequest.current;
    setDialog(null);
    setHistoryId(null);
    setHistory([]);
    setHistoryFilter('all');
    setHistoryVisibleLimit(30);
    setEntrySources({});
    setCorrectionMap({});
    setCorrectionPrompt(null);
    setError('');
    setActivity({});
    setLoading(true);
    // Wallet metadata is loaded independently, so target cards remain usable
    // if the optional wallet feature cannot be initialized.
    void Promise.all([getWallets(db), getGoalWalletLinks(db)])
      .then(([walletRows, links]) => {
        if (!active) return;
        setWallets(walletRows);
        setWalletLinks(links);
        setWalletError('');
      })
      .catch(err => {
        if (active) setWalletError(err instanceof Error ? err.message : 'Rekening terkait belum dapat dimuat.');
      });

    if (filter === 'active') {
      void getGoalActivityMap(db)
        .then(rows => { if (active) setActivity(rows); })
        .catch(() => { if (active) setActivity({}); });
    }

    void getSavingsGoals(db, filter === 'archived')
      .then(rows => { if (active) setGoals(rows); })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Gagal memuat daftar target.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; ++historyRequest.current; };
  }, [db, filter]));

  function openManage(mode: 'create' | 'edit' | 'deposit' | 'withdrawal' | 'transfer', id?: number) {
    if (lock.current) return;
    setDialog(null);
    if (id === undefined) {
      router.push('/goals/manage');
    } else {
      router.push({ pathname: '/goals/manage', params: { mode, goalId: String(id) } });
    }
  }

  async function toggleHistory(id: number) {
    if (lock.current) return;
    const request = ++historyRequest.current;
    if (historyId === id) {
      setHistoryFilter('all');
      setHistoryVisibleLimit(30);
      setHistoryId(null);
      setHistory([]);
      setEntrySources({});
      setCorrectionMap({});
      setHistoryLoading(false);
      return;
    }
    setHistoryFilter('all');
    setHistoryVisibleLimit(30);
    setHistoryId(id);
    setHistory([]);
    setEntrySources({});
    setCorrectionMap({});
    setHistoryLoading(true);
    try {
      const [entries, sources, corrections] = await Promise.all([
        getGoalEntries(db, id), getGoalEntrySourceMap(db, id), getGoalCorrectionMap(db, id),
      ]);
      if (request === historyRequest.current) {
        setHistory(entries);
        setEntrySources(sources);
        setCorrectionMap(corrections);
      }
    } catch (err) {
      if (request === historyRequest.current) {
        setNotice(err instanceof Error ? err.message : 'Riwayat gagal dimuat.');
        setHistoryId(null);
      }
    } finally {
      if (request === historyRequest.current) setHistoryLoading(false);
    }
  }

  async function applyManualCorrection(goalId: number, entryId: number) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setCorrectionPrompt(null);
    setNotice('');
    try {
      await cancelManualGoalEntry(db, goalId, entryId);
      const request = ++historyRequest.current;
      const [entries, sources, corrections] = await Promise.all([
        getGoalEntries(db, goalId), getGoalEntrySourceMap(db, goalId),
        getGoalCorrectionMap(db, goalId),
      ]);
      if (request === historyRequest.current) {
        setHistoryId(goalId);
        setHistory(entries);
        setEntrySources(sources);
        setCorrectionMap(corrections);
        setHistoryLoading(false);
      }
      await reload(filter);
      setNotice('Catatan manual dibatalkan. Koreksi tercatat di riwayat; saldo rekening tidak berubah.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Pembatalan catatan gagal.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function runAudit() {
    setAuditOpen(true);
    setAuditLoading(true);
    setAuditReport(null);
    setAuditError('');
    try {
      setAuditReport(await auditSavingsGoals(db));
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Pemeriksaan catatan gagal.');
    } finally {
      setAuditLoading(false);
    }
  }

  async function applyConfirmedAction(goal: SavingsGoal, action: 'archive' | 'restore' | 'delete') {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setDialog(null);
    setNotice('');
    try {
      if (action === 'delete') {
        await deleteSavingsGoal(db, goal.id);
      } else {
        await setGoalArchived(db, goal.id, action === 'archive');
      }
      ++historyRequest.current;
      setHistoryId(null);
      setHistory([]);
      await reload(filter);
      setNotice(action === 'delete'
        ? 'Target berhasil dihapus permanen.'
        : action === 'archive' ? 'Target dipindahkan ke Arsip.' : 'Target berhasil diaktifkan kembali.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Tindakan gagal. Coba lagi.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const isActive = filter === 'active';
  const totalSaved = goals.reduce((sum, goal) => sum + goal.saved_rupiah, 0);
  const totalTarget = goals.reduce((sum, goal) => sum + goal.target_rupiah, 0);
  const completed = goals.filter(goal => goal.saved_rupiah >= goal.target_rupiah).length;
  const currentDialogGoal = dialog?.goal;
  const currentDialogAction = dialog?.action;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ title: 'Target Tabungan', headerShown: true }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text variant="titleLarge" style={[styles.bold, { color: theme.colors.onSurface }]}>Target Tabungan</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 21 }}>
            Rencanakan tujuan dan catat tabunganmu dengan mudah.
          </Text>
        </View>

        {isActive && !loading && !error && goals.length > 0 && (
          <View style={[styles.summaryCard, { backgroundColor: theme.colors.primaryContainer }]}>
            <View style={styles.summaryTitle}>
              <Text variant="labelLarge" style={{ flexShrink: 1, color: theme.colors.onPrimaryContainer }}>Total terkumpul</Text>
              <MaterialCommunityIcons name="piggy-bank-outline" size={22} color={theme.colors.primary} />
            </View>
            <Text style={[styles.summaryMoney, { color: theme.colors.onPrimaryContainer }]}>{rupiah(totalSaved)}</Text>
            <View style={[styles.barTrack, { backgroundColor: theme.colors.surfaceVariant }]}>
              <View style={[styles.barFill, { width: `${Math.round(progress(totalSaved, totalTarget) * 100)}%` as `${number}%`, backgroundColor: theme.colors.primary }]} />
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer }}>
              Total target {rupiah(totalTarget)} · {completed}/{goals.length} tercapai
            </Text>
          </View>
        )}

        {isActive && (
          <Action title="Buat Target Baru" icon="plus" variant="primary" onPress={() => openManage('create')} disabled={busy} />
        )}

        <View style={styles.sectionHeader}>
          <Text variant="titleMedium" style={[styles.bold, { color: theme.colors.onSurface }]}>Daftar Target</Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {isActive ? 'Target yang sedang kamu kumpulkan' : 'Target yang tersimpan di Arsip'}
          </Text>
        </View>

        <View style={[styles.tabs, { backgroundColor: theme.colors.surfaceVariant }]}>
          {(['active', 'archived'] as Filter[]).map(value => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === value }}
              onPress={() => { if (!busy) { setNotice(''); setFilter(value); } }}
              style={[styles.tab, filter === value && { backgroundColor: theme.colors.primaryContainer }]}
            >
              <MaterialCommunityIcons
                name={value === 'active' ? 'flag-outline' : 'archive-outline'}
                size={18}
                color={filter === value ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant}
              />
              <Text style={{ fontWeight: '700', color: filter === value ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant }}>
                {value === 'active' ? 'Aktif' : 'Arsip'}
              </Text>
            </Pressable>
          ))}
        </View>

        {!!notice && (
          <View style={[styles.message, { backgroundColor: theme.colors.surfaceVariant }]}>
            <Text style={{ flex: 1, color: theme.colors.onSurface }}>{notice}</Text>
            <Pressable onPress={() => setNotice('')} accessibilityRole="button" accessibilityLabel="Tutup pesan">
              <MaterialCommunityIcons name="close" size={20} color={theme.colors.onSurface} />
            </Pressable>
          </View>
        )}

        {loading && <View style={styles.loading}><ActivityIndicator color={theme.colors.primary} /><Text style={{ color: theme.colors.onSurfaceVariant }}>Memuat target...</Text></View>}

        {!loading && !!error && (
          <View style={[styles.message, { backgroundColor: theme.colors.errorContainer }]}>
            <Text style={{ flex: 1, color: theme.colors.onErrorContainer }}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => { setError(''); setLoading(true); void reload(filter).catch(err => setError(String(err))).finally(() => setLoading(false)); }}>
              <MaterialCommunityIcons name="refresh" size={24} color={theme.colors.onErrorContainer} />
            </Pressable>
          </View>
        )}

        {!loading && !error && goals.length === 0 && (
          <View style={[styles.empty, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
            <MaterialCommunityIcons name={isActive ? 'bullseye-arrow' : 'archive-outline'} size={35} color={theme.colors.primary} />
            <Text variant="titleMedium" style={[styles.bold, { color: theme.colors.onSurface }]}>{isActive ? 'Belum ada target' : 'Arsip masih kosong'}</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', lineHeight: 22 }}>
              {isActive ? 'Buat target pertama, lalu tekan Setor untuk mencatat tabunganmu.' : 'Target yang diarsipkan akan ditampilkan di sini.'}
            </Text>
          </View>
        )}

        {!loading && !error && goals.map(goal => {
          const archived = goal.archived_at !== null;
          const finished = goal.saved_rupiah >= goal.target_rupiah;
          const remaining = Math.max(0, goal.target_rupiah - goal.saved_rupiah);
          const historyOpen = historyId === goal.id;
          const historyView = historyOpen && !historyLoading
            ? buildGoalHistoryView(history, correctionMap, historyFilter, historyVisibleLimit)
            : null;
          const barWidth = `${Math.round(progress(goal.saved_rupiah, goal.target_rupiah) * 100)}%` as `${number}%`;
          const relatedWallet = wallets.find(item => item.id === walletLinks[goal.id]);
          const monthlyPlan = calculateGoalPlan({
            saved: goal.saved_rupiah,
            target: goal.target_rupiah,
            targetDate: goal.target_date,
          });
          const insight = !archived && activity[goal.id]
            ? calculateGoalInsights({
                savedRupiah: goal.saved_rupiah,
                targetRupiah: goal.target_rupiah,
                targetDate: goal.target_date,
                activity: activity[goal.id],
              })
            : null;
          return (
            <View key={goal.id} style={[styles.goalCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.goalIcon, { backgroundColor: theme.colors.primaryContainer }]}>
                  <MaterialCommunityIcons name={finished ? 'check-circle-outline' : 'flag-outline'} size={22} color={theme.colors.primary} />
                </View>
                <View style={styles.cardTitle}>
                  <Text style={[styles.goalTitle, { color: theme.colors.onSurface }]} numberOfLines={2}>{goal.title}</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>
                    {archived ? 'Diarsipkan' : finished ? 'Target tercapai' : goal.target_date ? `Target ${displayDate(goal.target_date)}` : 'Tanpa batas waktu'}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Opsi target ${goal.title}`}
                  disabled={busy}
                  onPress={() => setDialog({ goal, action: 'actions' })}
                  style={({ pressed }) => [styles.moreButton, pressed && { opacity: 0.55 }]}
                >
                  <MaterialCommunityIcons name="dots-vertical" size={23} color={theme.colors.onSurface} />
                </Pressable>
              </View>

              <View style={styles.progressSection}>
                <View style={styles.progressLabel}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Sudah terkumpul</Text>
                  <Text variant="labelLarge" style={{ color: theme.colors.primary, fontWeight: '800' }}>{progressText(goal.saved_rupiah, goal.target_rupiah)}</Text>
                </View>
                <Text style={[styles.savedAmount, { color: theme.colors.onSurface }]} numberOfLines={1} adjustsFontSizeToFit>
                  {rupiah(goal.saved_rupiah)}
                </Text>
                <View style={[styles.barTrack, { backgroundColor: theme.colors.surfaceVariant }]}>
                  <View style={[styles.barFill, { width: barWidth, backgroundColor: theme.colors.primary }]} />
                </View>
              </View>

              <View style={[styles.amountsPanel, { backgroundColor: theme.colors.background }]}>
                <View style={styles.amountsCol}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>TARGET</Text>
                  <Text style={[styles.amountsValue, { color: theme.colors.onSurface }]} numberOfLines={2}>{rupiah(goal.target_rupiah)}</Text>
                </View>
                <View style={[styles.amountsCol, { alignItems: 'flex-end' }]}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{finished ? 'STATUS' : 'SISA'}</Text>
                  <Text style={[styles.amountsValue, { color: theme.colors.onSurface, textAlign: 'right' }]} numberOfLines={2}>
                    {finished ? 'Tercapai' : rupiah(remaining)}
                  </Text>
                </View>
              </View>

              {!!goal.note && (
                <Text variant="bodySmall" numberOfLines={3} style={{ color: theme.colors.onSurfaceVariant, lineHeight: 19, marginTop: 13 }}>{goal.note}</Text>
              )}

              {!archived && monthlyPlan.status === 'active' && (
                <View style={[styles.planRow, { borderColor: theme.colors.outlineVariant }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Rencana menabung per bulan</Text>
                    <Text variant="titleSmall" style={{ fontWeight: '800', color: theme.colors.onSurface }}>
                      {rupiah(monthlyPlan.monthlyAmount)}
                    </Text>
                  </View>
                  <Text variant="labelSmall" style={{ color: theme.colors.primary, textAlign: 'right' }}>
                    {monthlyPlan.monthsRemaining} bulan tersisa
                  </Text>
                </View>
              )}
              {!archived && monthlyPlan.status === 'overdue' && (
                <View style={[styles.planRow, { borderColor: theme.colors.error }]}>
                  <MaterialCommunityIcons name="calendar-alert" size={20} color={theme.colors.error} />
                  <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.error }}>
                    Tenggat terlewati. Ubah tanggal target agar rencana bulanan dihitung ulang.
                  </Text>
                </View>
              )}

              {!archived && insight && !finished && (
                <View style={[styles.insightBox, {
                  backgroundColor: theme.colors.surfaceVariant,
                }]}>
                  <View style={styles.insightHeader}>
                    <View style={styles.insightTitleRow}>
                      <MaterialCommunityIcons
                        name={insight.status === 'declining' ? 'trending-down' : insight.status === 'growing' ? 'trending-up' : 'chart-timeline-variant'}
                        size={19}
                        color={insight.status === 'declining' ? theme.colors.error : theme.colors.primary}
                      />
                      <Text variant="labelLarge" style={{ fontWeight: '800', color: theme.colors.onSurface }}>
                        Ritme tabungan
                      </Text>
                    </View>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      90 hari terakhir
                    </Text>
                  </View>
                  <View style={styles.insightStatRow}>
                    <View style={styles.insightStat}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Bersih 90 hari</Text>
                      <Text style={[styles.insightAmount, { color: insight.net90Days < 0 ? theme.colors.error : theme.colors.onSurface }]}>
                        {insight.net90Days < 0 ? '−' : '+'}{rupiah(Math.abs(insight.net90Days))}
                      </Text>
                    </View>
                    <View style={[styles.insightStat, styles.insightStatRight]}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Rata-rata / 30 hari</Text>
                      <Text style={[styles.insightAmount, { color: theme.colors.onSurface }]}>
                        {rupiah(insight.monthlyPaceRupiah)}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.insightFooter, { borderTopColor: theme.colors.outlineVariant }]}>
                    <MaterialCommunityIcons
                      name={insight.onSchedule === false ? 'information-outline' : insight.status === 'growing' ? 'calendar-check-outline' : 'calendar-clock-outline'}
                      size={17}
                      color={insight.onSchedule === false ? theme.colors.error : theme.colors.primary}
                    />
                    <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurfaceVariant, lineHeight: 19 }}>
                      {insight.onSchedule === false
                        ? `Agar sesuai tenggat, perlu tambahan sekitar ${rupiah(insight.monthlyGapRupiah)} per bulan dari ritme sekarang.`
                        : insight.onSchedule === true
                          ? 'Ritme saat ini mencukupi rencana bulanan.'
                          : insight.projectedDate
                            ? `Perkiraan tercapai ${displayDate(insight.projectedDate)} jika ritme berlanjut.`
                            : insight.status === 'declining'
                              ? 'Pengambilan lebih besar dari setoran dalam 90 hari terakhir.'
                              : 'Mulai setor secara rutin untuk melihat perkiraan selesai.'}
                    </Text>
                  </View>
                  {!!insight.projectedDate && insight.onSchedule === false && (
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6, paddingLeft: 22 }}>
                      Proyeksi saat ini: {displayDate(insight.projectedDate)}
                    </Text>
                  )}
                </View>
              )}
              {relatedWallet && (
                <View style={[styles.walletRow, { backgroundColor: theme.colors.surfaceVariant }]}>
                  <MaterialCommunityIcons name="bank-outline" size={20} color={theme.colors.primary} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Rekening terkait</Text>
                    <Text variant="bodyMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }} numberOfLines={1}>
                      {relatedWallet.name}
                    </Text>
                  </View>
                  <View style={{ maxWidth: '44%', alignItems: 'flex-end' }}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Saldo rekening</Text>
                    <Text variant="bodySmall" numberOfLines={1} style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                      {formatRupiah(relatedWallet.balance_rupiah)}
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.buttonsRow}>
                {archived ? (
                  <Action title="Aktifkan" icon="restore" variant="primary" flex={1} disabled={busy} onPress={() => setDialog({ goal, action: 'restore' })} />
                ) : (
                  <>
                    <Action title="Setor" icon="plus" variant="primary" flex={1} disabled={busy} onPress={() => openManage('deposit', goal.id)} />
                    <Action title="Ambil" icon="arrow-up-right" flex={1} disabled={busy || goal.saved_rupiah <= 0} onPress={() => openManage('withdrawal', goal.id)} />
                  </>
                )}
              </View>
              <View style={styles.historyButton}>
                <Action
                  title={historyOpen ? 'Tutup Riwayat' : `Lihat Riwayat (${goal.entry_count})`}
                  icon={historyOpen ? 'chevron-up' : 'history'}
                  variant="subtle"
                  compact
                  disabled={busy}
                  onPress={() => { void toggleHistory(goal.id); }}
                />
              </View>

              {historyOpen && (
                <View style={[styles.historySection, { borderTopColor: theme.colors.outlineVariant }]}>
                  <View style={styles.historyHeading}>
                    <View style={{ flex: 1 }}>
                      <Text variant="titleSmall" style={[styles.bold, { color: theme.colors.onSurface }]}>Riwayat Tabungan</Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 3 }}>
                        Setoran, pengambilan, dan koreksi tercatat di sini.
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="history" size={22} color={theme.colors.primary} />
                  </View>
                  {historyLoading && <ActivityIndicator color={theme.colors.primary} />}
                  {!historyLoading && history.length === 0 && (
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, paddingVertical: 12 }}>Belum ada catatan.</Text>
                  )}
                  {!historyLoading && history.length > 0 && historyView && (
                    <>
                      <View style={styles.historyFilters}>
                        {([
                          ['all', 'Semua'],
                          ['deposit', 'Setoran'],
                          ['withdrawal', 'Pengambilan'],
                          ['correction', 'Koreksi'],
                        ] as const).map(([value, label]) => (
                          <Pressable
                            key={value}
                            accessibilityRole="button"
                            accessibilityLabel={`Filter riwayat ${label}`}
                            accessibilityState={{ selected: historyFilter === value }}
                            onPress={() => { setHistoryFilter(value); setHistoryVisibleLimit(30); }}
                            style={[
                              styles.historyChip,
                              {
                                backgroundColor: historyFilter === value ? theme.colors.primaryContainer : theme.colors.surfaceVariant,
                                borderColor: historyFilter === value ? theme.colors.primary : theme.colors.outlineVariant,
                              },
                            ]}
                          >
                            <Text variant="labelMedium" style={{ fontWeight: '700', color: historyFilter === value ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant }}>
                              {label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <View style={[styles.historySummary, { backgroundColor: theme.colors.surfaceVariant }]}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Jumlah aktivitas</Text>
                          <Text variant="titleSmall" style={{ fontWeight: '800', color: theme.colors.onSurface }}>
                            {historyView.matchedCount} catatan
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', minWidth: 0, flex: 1 }}>
                          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Perubahan bersih</Text>
                          <Text variant="titleSmall" style={{ fontWeight: '800', color: historyView.netRupiah < 0 ? theme.colors.error : theme.colors.primary }}>
                            {historyView.netRupiah < 0 ? '−' : '+'}{rupiah(Math.abs(historyView.netRupiah))}
                          </Text>
                        </View>
                      </View>
                      {historyView.matchedCount === 0 && (
                        <View style={styles.historyEmptyFilter}>
                          <MaterialCommunityIcons name="filter-variant-remove" size={23} color={theme.colors.onSurfaceVariant} />
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
                            Belum ada aktivitas untuk filter ini.
                          </Text>
                        </View>
                      )}
                      {historyView.months.map(month => (
                        <View key={month.key}>
                          <View style={[styles.historyMonthHeader, { borderBottomColor: theme.colors.outlineVariant }]}>
                            <Text variant="labelLarge" style={{ fontWeight: '800', flex: 1, color: theme.colors.onSurface }}>
                              {month.label}
                            </Text>
                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                              {month.entries.length} aktivitas
                            </Text>
                          </View>
                          {month.entries.map(entry => {
                            const correctionStatus = correctionMap[entry.id];
                            const linkedToWallet = entrySources[entry.id] === 'rekening';
                            return (
                              <View key={entry.id} style={[styles.historyItem, { borderBottomColor: theme.colors.outlineVariant }]}>
                                <View style={styles.historyTopRow}>
                                  <MaterialCommunityIcons
                                    name={correctionStatus ? 'backup-restore' : entry.kind === 'deposit' ? 'arrow-down-left' : 'arrow-up-right'}
                                    size={20}
                                    color={correctionStatus ? theme.colors.onSurfaceVariant : entry.kind === 'deposit' ? theme.colors.primary : theme.colors.error}
                                  />
                                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                                    <Text style={{ color: theme.colors.onSurface, fontWeight: '600' }} numberOfLines={2}>
                                      {entry.note || (entry.kind === 'deposit' ? 'Setoran' : 'Pengambilan')}
                                    </Text>
                                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                      {displayDate(entry.occurred_on)} · {linkedToWallet ? 'Melalui rekening' : 'Catatan manual'}
                                    </Text>
                                    {!!correctionStatus && (
                                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700' }}>
                                        {correctionStatus === 'cancelled' ? 'Telah dibatalkan' : 'Jurnal pembatalan'}
                                      </Text>
                                    )}
                                  </View>
                                  <Text style={{ color: entry.kind === 'deposit' ? theme.colors.primary : theme.colors.error, fontWeight: '700', textAlign: 'right', maxWidth: '39%', flexShrink: 1 }}>
                                    {entry.kind === 'deposit' ? '+' : '−'}{rupiah(entry.amount_rupiah)}
                                  </Text>
                                </View>
                                {!archived && !linkedToWallet && !correctionStatus && (
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`Batalkan catatan ${entry.id}`}
                                    disabled={busy}
                                    onPress={() => setCorrectionPrompt({ goal, entry })}
                                    style={({ pressed }) => [styles.correctionAction, pressed && { opacity: 0.55 }]}
                                  >
                                    <MaterialCommunityIcons name="backup-restore" size={17} color={theme.colors.primary} />
                                    <Text variant="labelMedium" style={{ color: theme.colors.primary, fontWeight: '700' }}>Batalkan catatan</Text>
                                  </Pressable>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      ))}
                      {historyView.hasMore && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Tampilkan riwayat berikutnya"
                          onPress={() => setHistoryVisibleLimit(limit => limit + 30)}
                          style={[styles.historyShowMore, { borderColor: theme.colors.outlineVariant }]}
                        >
                          <MaterialCommunityIcons name="chevron-down" size={18} color={theme.colors.primary} />
                          <Text variant="labelLarge" style={{ color: theme.colors.primary, fontWeight: '800' }}>
                            Muat 30 berikutnya
                          </Text>
                        </Pressable>
                      )}
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', paddingTop: 8 }}>
                        {historyView.displayedCount} dari {historyView.matchedCount} catatan ditampilkan
                      </Text>
                    </>
                  )}
                </View>
              )}
            </View>
          );
        })}

        <View style={styles.help}>
          <MaterialCommunityIcons name="information-outline" size={20} color={theme.colors.onSurfaceVariant} />
          <View style={{ flex: 1 }}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
              Setor dan Ambil dapat langsung memindahkan uang jika target terhubung ke rekening. Tanpa rekening, keduanya hanya mencatat progres target.
            </Text>
            <Pressable accessibilityRole="button" onPress={() => { void runAudit(); }} style={{ paddingVertical: 10, alignSelf: 'flex-start' }}>
              <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Periksa Catatan Target</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setGuideOpen(open => !open)} style={{ paddingVertical: 9, alignSelf: 'flex-start' }}>
              <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>{guideOpen ? 'Tutup panduan' : 'Cara menggunakan'}</Text>
            </Pressable>
          </View>
        </View>
        {guideOpen && (
          <View style={[styles.guide, { backgroundColor: theme.colors.surfaceVariant }]}>
            <Text style={{ color: theme.colors.onSurface }}>1. Buat target dan tentukan nominal.</Text>
            <Text style={{ color: theme.colors.onSurface }}>2. Hubungkan rekening khusus lewat menu tiga titik jika ingin memindahkan uang sungguhan.</Text>
            <Text style={{ color: theme.colors.onSurface }}>3. Tekan Setor atau Ambil. Progres target dan transfer rekening dicatat sekaligus bila terhubung.</Text>
            <Text style={{ color: theme.colors.onSurface }}>4. Tekan Riwayat untuk melihat semua setoran dan pengambilan.</Text>
            <Text style={{ color: theme.colors.onSurface }}>5. Bagian Ritme Tabungan menampilkan perkiraan dari riwayat 90 hari, bukan perintah pemindahan uang.</Text>
            <Text style={{ color: theme.colors.onSurface }}>6. Transfer biasa di menu Transaksi tidak otomatis menjadi setoran target.</Text>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={auditOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setAuditOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFill, styles.backdrop]}
            accessibilityRole="button"
            accessibilityLabel="Tutup pemeriksaan"
            onPress={() => setAuditOpen(false)}
          />
          <View style={[styles.sheet, { backgroundColor: theme.colors.surface, maxHeight: viewportHeight * 0.84 }]}>
            <View style={styles.sheetHeading}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="titleLarge" style={[styles.bold, { color: theme.colors.onSurface }]}>Pemeriksaan Catatan</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Meninjau konsistensi catatan Target Tabungan.</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Tutup" onPress={() => setAuditOpen(false)} style={styles.sheetClose}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.onSurface} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 16, gap: 12 }}>
              {auditLoading && <View style={styles.loading}><ActivityIndicator color={theme.colors.primary} /><Text style={{ color: theme.colors.onSurfaceVariant }}>Memeriksa catatan...</Text></View>}
              {!!auditError && <Text style={{ color: theme.colors.error }}>{auditError}</Text>}
              {auditReport && (
                <>
                  <View style={[styles.auditHighlight, { backgroundColor: auditReport.problems.length ? theme.colors.errorContainer : theme.colors.primaryContainer }]}>
                    <MaterialCommunityIcons
                      name={auditReport.problems.length ? 'alert-circle-outline' : 'check-circle-outline'}
                      size={27}
                      color={auditReport.problems.length ? theme.colors.onErrorContainer : theme.colors.onPrimaryContainer}
                    />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text variant="titleMedium" style={{ fontWeight: '800', color: auditReport.problems.length ? theme.colors.onErrorContainer : theme.colors.onPrimaryContainer }}>
                        {auditReport.problems.length ? `${auditReport.problems.length} catatan perlu diperiksa` : 'Catatan Target konsisten'}
                      </Text>
                      <Text variant="bodySmall" style={{ color: auditReport.problems.length ? theme.colors.onErrorContainer : theme.colors.onPrimaryContainer }}>
                        {auditReport.goalCount} target · {auditReport.entryCount} aktivitas
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.auditStats, { borderColor: theme.colors.outlineVariant }]}>
                    <View style={{ flex: 1 }}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Lewat rekening</Text>
                      <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '800' }}>
                        {auditReport.linkedDeposits + auditReport.linkedWithdrawals}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Catatan manual</Text>
                      <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '800' }}>
                        {auditReport.manualEntries}
                      </Text>
                    </View>
                  </View>
                  {auditReport.problems.map((problem, index) => (
                    <View key={`${problem.code}-${index}`} style={[styles.auditProblem, { borderColor: theme.colors.error }]}>
                      <MaterialCommunityIcons name="alert-outline" size={20} color={theme.colors.error} />
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text variant="titleSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>{problem.goalName}</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 19 }}>{problem.description}</Text>
                      </View>
                    </View>
                  ))}
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                    Pemeriksaan ini hanya membandingkan riwayat Target dan catatan penghubung.
                    Transaksi di menu Keuangan belum dapat diverifikasi karena belum memiliki ID referensi bersama.
                    Tidak ada saldo atau riwayat yang diubah.
                  </Text>
                </>
              )}
              <Action title="Periksa Ulang" icon="refresh" variant="outline" disabled={auditLoading} onPress={() => { void runAudit(); }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={dialog !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => { if (!busy) setDialog(null); }}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tutup dialog"
            onPress={() => { if (!busy) setDialog(null); }}
            style={[StyleSheet.absoluteFill, styles.backdrop]}
          />
          <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
            {currentDialogGoal && currentDialogAction === 'actions' && (
              <>
                <View style={styles.sheetHeading}>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium" style={[styles.bold, { color: theme.colors.onSurface }]}>Tindakan Target</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>{currentDialogGoal.title}</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Tutup" onPress={() => setDialog(null)} style={styles.sheetClose}>
                    <MaterialCommunityIcons name="close" size={24} color={theme.colors.onSurface} />
                  </Pressable>
                </View>
                {!currentDialogGoal.archived_at ? (
                  <>
                    <Action title="Edit Target" icon="pencil-outline" onPress={() => openManage('edit', currentDialogGoal.id)} />
                    <Action title="Hubungkan Rekening" icon="bank-outline" onPress={() => { setWalletError(''); setDialog({ goal: currentDialogGoal, action: 'wallet' }); }} />
                    <Action title="Arsipkan Target" icon="archive-outline" onPress={() => setDialog({ goal: currentDialogGoal, action: 'archive' })} />
                  </>
                ) : (
                  <Action title="Aktifkan Kembali" icon="restore" onPress={() => setDialog({ goal: currentDialogGoal, action: 'restore' })} />
                )}
                {currentDialogGoal.entry_count === 0 ? (
                  <Action title="Hapus Permanen" icon="delete-outline" variant="danger" onPress={() => setDialog({ goal: currentDialogGoal, action: 'delete' })} />
                ) : (
                  <Text variant="bodySmall" style={{ marginTop: 6, color: theme.colors.onSurfaceVariant, lineHeight: 19 }}>
                    Hapus permanen tidak tersedia karena target sudah memiliki riwayat setoran.
                  </Text>
                )}
              </>
            )}

            {currentDialogGoal && currentDialogAction === 'wallet' && (
              <ScrollView
                style={{ maxHeight: Math.max(260, viewportHeight * 0.76) }}
                contentContainerStyle={{ gap: 10, paddingBottom: 6 }}
                keyboardShouldPersistTaps="always"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.sheetHeading}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="titleMedium" style={[styles.bold, { color: theme.colors.onSurface }]}>Rekening untuk Target</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>
                      {currentDialogGoal.title}
                    </Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Tutup" onPress={() => setDialog(null)} disabled={busy} style={styles.sheetClose}>
                    <MaterialCommunityIcons name="close" size={24} color={theme.colors.onSurface} />
                  </Pressable>
                </View>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20, marginBottom: 12 }}>
                  Pilih rekening khusus target. Setelah terhubung, tombol Setor dan Ambil juga memindahkan uang antar-rekening. Menghubungkan rekening tidak mengubah saldo atau riwayat sebelumnya.
                </Text>
                {!!walletError && (
                  <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 10 }}>{walletError}</Text>
                )}
                <View style={{ gap: 8 }}>
                  {wallets.length === 0 && (
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, paddingVertical: 12 }}>
                      Belum ada rekening. Tambahkan terlebih dahulu melalui Dompet & Rekening.
                    </Text>
                  )}
                  {wallets.map(wallet => {
                    const selected = walletLinks[currentDialogGoal.id] === wallet.id;
                    const used = Object.entries(walletLinks).some(([linkedGoalId, id]) => Number(linkedGoalId) !== currentDialogGoal.id && id === wallet.id);
                    return (
                      <Pressable
                        key={wallet.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Pilih rekening ${wallet.name}`}
                        accessibilityState={{ disabled: busy || used, selected }}
                        disabled={busy || used}
                        onPress={() => { void chooseWallet(currentDialogGoal.id, wallet.id); }}
                        style={({ pressed }) => [
                          styles.walletOption,
                          { borderColor: selected ? theme.colors.primary : theme.colors.outlineVariant, backgroundColor: selected ? theme.colors.primaryContainer : theme.colors.surface },
                          pressed && { opacity: 0.7 },
                          used && { opacity: 0.45 },
                        ]}
                      >
                        <MaterialCommunityIcons name="bank-outline" size={22} color={theme.colors.primary} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text variant="bodyMedium" numberOfLines={1} style={{ fontWeight: '700', color: theme.colors.onSurface }}>{wallet.name}</Text>
                          <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
                            {used ? 'Dipakai target lain' : formatRupiah(wallet.balance_rupiah)}
                          </Text>
                        </View>
                        {selected && <MaterialCommunityIcons name="check-circle" size={22} color={theme.colors.primary} />}
                      </Pressable>
                    );
                  })}
                </View>
                {walletLinks[currentDialogGoal.id] !== undefined && (
                  <Action title="Lepas Kaitan Rekening" icon="link-off" variant="outline" disabled={busy}
                    onPress={() => { void chooseWallet(currentDialogGoal.id, null); }} />
                )}
                <Action title="Kelola Dompet & Rekening" icon="wallet-outline" disabled={busy}
                  onPress={() => { setDialog(null); router.push('/accounts'); }} />
              </ScrollView>
            )}

            {currentDialogGoal && currentDialogAction && currentDialogAction !== 'actions' && currentDialogAction !== 'wallet' && (
              <>
                <View style={styles.confirmIcon}>
                  <MaterialCommunityIcons
                    name={currentDialogAction === 'delete' ? 'delete-alert-outline' : currentDialogAction === 'archive' ? 'archive-outline' : 'restore'}
                    size={28}
                    color={currentDialogAction === 'delete' ? theme.colors.error : theme.colors.primary}
                  />
                </View>
                <Text variant="titleLarge" style={[styles.bold, { color: theme.colors.onSurface }]}>
                  {currentDialogAction === 'delete' ? 'Hapus target permanen?' : currentDialogAction === 'archive' ? 'Arsipkan target?' : 'Aktifkan kembali?'}
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22 }}>
                  {currentDialogAction === 'delete'
                    ? `“${currentDialogGoal.title}” akan dihapus selamanya. Ini hanya diperbolehkan jika belum ada riwayat setoran.`
                    : currentDialogAction === 'archive'
                      ? `“${currentDialogGoal.title}” dipindahkan ke Arsip. Semua riwayat tetap tersimpan.`
                      : `“${currentDialogGoal.title}” kembali menjadi target aktif.`}
                </Text>
                <View style={styles.confirmButtons}>
                  <Action title="Batal" icon="close" flex={1} disabled={busy} onPress={() => setDialog(null)} />
                  <Action
                    title={currentDialogAction === 'delete' ? 'Hapus' : currentDialogAction === 'archive' ? 'Arsipkan' : 'Aktifkan'}
                    icon={currentDialogAction === 'delete' ? 'delete-outline' : 'check'}
                    variant={currentDialogAction === 'delete' ? 'danger' : 'primary'}
                    flex={1}
                    disabled={busy}
                    onPress={() => { void applyConfirmedAction(currentDialogGoal, currentDialogAction); }}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={correctionPrompt !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => { if (!busy) setCorrectionPrompt(null); }}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tutup konfirmasi pembatalan"
            onPress={() => { if (!busy) setCorrectionPrompt(null); }}
            style={[StyleSheet.absoluteFill, styles.backdrop]}
          />
          <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.confirmIcon}>
              <MaterialCommunityIcons name="backup-restore" size={28} color={theme.colors.primary} />
            </View>
            <Text variant="titleLarge" style={[styles.bold, { color: theme.colors.onSurface }]}>
              Batalkan catatan manual?
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22, marginTop: 8 }}>
              {correctionPrompt
                ? `Catatan ${correctionPrompt.entry.kind === 'deposit' ? 'setoran' : 'pengambilan'} sebesar ${rupiah(correctionPrompt.entry.amount_rupiah)} akan dibatalkan melalui jurnal koreksi. Catatan lama tetap tersimpan, dan saldo rekening tidak berubah.`
                : ''}
            </Text>
            <View style={styles.confirmButtons}>
              <Action title="Kembali" icon="close" flex={1} disabled={busy} onPress={() => setCorrectionPrompt(null)} />
              <Action
                title="Ya, Batalkan"
                icon="backup-restore"
                variant="primary"
                flex={1}
                disabled={busy}
                onPress={() => {
                  if (correctionPrompt) {
                    void applyManualCorrection(correctionPrompt.goal.id, correctionPrompt.entry.id);
                  }
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 90 },
  intro: { marginBottom: 20 },
  bold: { fontWeight: '800' },
  summaryCard: { borderRadius: 20, padding: 18, marginBottom: 16 },
  summaryTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryMoney: { fontSize: 27, lineHeight: 36, fontWeight: '800', marginTop: 8, marginBottom: 12, includeFontPadding: false },
  barTrack: { width: '100%', height: 8, borderRadius: 8, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 8 },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, minWidth: 0 },
  normalAction: { minHeight: 48 },
  compactAction: { minHeight: 42 },
  actionLabel: { fontSize: 14, fontWeight: '700', marginLeft: 7, flexShrink: 1, includeFontPadding: false },
  sectionHeader: { marginTop: 22, marginBottom: 12 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 14, marginBottom: 16 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 11, minHeight: 42 },
  message: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, marginBottom: 14 },
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
  empty: { alignItems: 'center', padding: 28, borderWidth: 1, borderRadius: 20, marginBottom: 14 },
  goalCard: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  goalIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardTitle: { flex: 1, minWidth: 0 },
  goalTitle: { fontWeight: '800', fontSize: 16, lineHeight: 22, includeFontPadding: false },
  moreButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  progressSection: { marginTop: 20 },
  progressLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  savedAmount: { fontSize: 24, lineHeight: 33, fontWeight: '800', marginTop: 8, marginBottom: 12, includeFontPadding: false },
  amountsPanel: { flexDirection: 'row', paddingVertical: 13, paddingHorizontal: 12, borderRadius: 13, marginTop: 15 },
  amountsCol: { flex: 1, minWidth: 0 },
  amountsValue: { fontSize: 14, lineHeight: 21, fontWeight: '700', marginTop: 3, includeFontPadding: false },
  buttonsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  historyButton: { marginTop: 10 },
  planRow: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 13 },
  insightBox: { marginTop: 12, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 13 },
  insightHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  insightTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  insightStatRow: { flexDirection: 'row', gap: 12, marginTop: 14, marginBottom: 12 },
  insightStat: { flex: 1, minWidth: 0 },
  insightStatRight: { alignItems: 'flex-end' },
  insightAmount: { fontSize: 14, lineHeight: 21, fontWeight: '800', marginTop: 3, includeFontPadding: false },
  insightFooter: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  walletRow: { borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 12 },
  walletOption: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 12, minHeight: 64 },
  historySection: { borderTopWidth: 1, marginTop: 16, paddingTop: 16 },
  historyHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  historyFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  historyChip: { borderRadius: 30, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, minHeight: 38, justifyContent: 'center' },
  historySummary: { flexDirection: 'row', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 13, gap: 10, marginBottom: 8 },
  historyMonthHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 16, paddingBottom: 9, borderBottomWidth: 1 },
  historyShowMore: { borderRadius: 13, borderWidth: 1, minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 13 },
  historyEmptyFilter: { alignItems: 'center', paddingVertical: 22, gap: 9 },
  historyItem: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 11, gap: 7 },
  historyTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  correctionAction: { alignSelf: 'flex-start', marginLeft: 30, paddingVertical: 7, paddingHorizontal: 3, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34 },
  auditHighlight: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 14 },
  auditStats: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 14 },
  auditProblem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  help: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 8, paddingHorizontal: 5 },
  guide: { borderRadius: 14, padding: 16, marginTop: 8 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.58)' },
  sheet: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: Platform.OS === 'ios' ? 36 : 24, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  sheetClose: { padding: 6 },
  confirmIcon: { marginBottom: 13 },
  confirmButtons: { flexDirection: 'row', gap: 10, marginTop: 24 },
});
