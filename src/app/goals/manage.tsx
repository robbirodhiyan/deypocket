import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text, TextInput, useTheme } from 'react-native-paper';

import { formatRupiah } from '../../features/deypocket/format';
import {
  addGoalEntry,
  getSavingsGoal,
  localDate,
  saveSavingsGoal,
  type GoalEntryKind,
  type SavingsGoal,
} from '../../features/deypocket/goals-repository';

type Mode = 'create' | 'edit' | 'deposit' | 'withdrawal';
const MAX_AMOUNT = 999_999_999_999;
const GOAL_PRESETS = [
  { label: '1 juta', value: '1000000' },
  { label: '5 juta', value: '5000000' },
  { label: '10 juta', value: '10000000' },
];
const ENTRY_PRESETS = [
  { label: '50 rb', value: '50000' },
  { label: '100 rb', value: '100000' },
  { label: '250 rb', value: '250000' },
  { label: '500 rb', value: '500000' },
];

function toDigits(value: string): string {
  return value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12);
}
function grouping(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function validAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_AMOUNT;
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const actual = new Date(year, month - 1, day);
  return actual.getFullYear() === year && actual.getMonth() === month - 1 && actual.getDate() === day;
}
function plusMonths(months: number): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + months;
  const date = new Date(y, m, Math.min(now.getDate(), new Date(y, m + 1, 0).getDate()));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function progress(value: number, target: number): number {
  return target > 0 ? Math.max(0, Math.min(1, value / target)) : 0;
}

export default function ManageGoalScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const params = useLocalSearchParams<{ mode?: string; goalId?: string }>();
  const mode: Mode = params.mode === 'edit' || params.mode === 'deposit' || params.mode === 'withdrawal'
    ? params.mode : 'create';
  const id = Number(params.goalId);
  const editing = mode === 'edit';
  const isEntry = mode === 'deposit' || mode === 'withdrawal';
  const needsGoal = editing || isEntry;
  const entryKind: GoalEntryKind = mode === 'withdrawal' ? 'withdrawal' : 'deposit';

  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const [loading, setLoading] = useState(needsGoal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);

  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [goalNote, setGoalNote] = useState('');
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState(localDate);
  const [entryNote, setEntryNote] = useState('');

  useEffect(() => {
    if (!needsGoal) { setLoading(false); setGoal(null); return; }
    let active = true;
    setLoading(true);
    setError('');
    if (!Number.isSafeInteger(id) || id <= 0) {
      setError('Target tidak valid. Silakan kembali ke daftar target.');
      setLoading(false);
      return;
    }
    void getSavingsGoal(db, id)
      .then(row => {
        if (!active) return;
        if (!row || row.archived_at) throw new Error('Target tidak ditemukan atau telah diarsipkan.');
        setGoal(row);
        if (editing) {
          setTitle(row.title);
          setTarget(String(row.target_rupiah));
          setDueDate(row.target_date ?? '');
          setGoalNote(row.note);
        } else {
          setAmount('');
          setOccurredOn(localDate());
          setEntryNote('');
        }
      })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Target tidak dapat dimuat.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db, id, needsGoal, editing]);

  function goBack() {
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else router.replace('/goals');
  }

  const targetValue = Number(target || '0');
  const entryValue = Number(amount || '0');
  const validTitle = title.trim().length >= 2 && title.trim().length <= 60;
  const validTarget = validAmount(targetValue);
  const validGoalDate = !dueDate.trim() || validDate(dueDate.trim());
  const validEntryValue = validAmount(entryValue);
  const validEntryDate = validDate(occurredOn.trim());
  const balance = goal?.saved_rupiah ?? 0;
  const enoughBalance = entryKind !== 'withdrawal' || entryValue <= balance;
  const canSave = !loading && !saving && (!needsGoal || goal !== null) && (
    isEntry ? validEntryValue && validEntryDate && enoughBalance : validTitle && validTarget && validGoalDate
  );
  const nextSaved = Math.max(0, balance + (entryKind === 'deposit' ? entryValue : -entryValue));
  const screenTitle = mode === 'create' ? 'Buat Target' : mode === 'edit' ? 'Edit Target' : mode === 'deposit' ? 'Catat Setoran' : 'Kurangi Tabungan';
  const submitTitle = mode === 'create' ? 'Buat Target' : mode === 'edit' ? 'Simpan Perubahan' : mode === 'deposit' ? 'Simpan Setoran' : 'Simpan Pengurangan';
  const presets = isEntry ? ENTRY_PRESETS : GOAL_PRESETS;
  const rawAmount = isEntry ? amount : target;
  const setRawAmount = isEntry ? setAmount : setTarget;

  async function save() {
    if (!canSave || lock.current) return;
    lock.current = true;
    setSaving(true);
    setError('');
    Keyboard.dismiss();
    try {
      if (isEntry) {
        await addGoalEntry(db, id, entryKind, entryValue, occurredOn.trim(), entryNote.trim());
      } else {
        await saveSavingsGoal(db, {
          title: title.trim(), targetRupiah: targetValue,
          targetDate: dueDate.trim() || null, note: goalNote.trim(),
        }, editing ? id : undefined);
      }
      goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan. Silakan coba kembali.');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: screenTitle, headerShown: true }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'}
      >
        <View style={styles.heading}>
          <View style={[styles.headerIcon, { backgroundColor: theme.colors.primaryContainer }]}>
            <MaterialCommunityIcons name={isEntry ? 'piggy-bank-outline' : 'bullseye-arrow'} color={theme.colors.primary} size={25} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="titleLarge" style={[styles.bold, { color: theme.colors.onSurface }]} numberOfLines={2}>
              {isEntry ? goal?.title ?? 'Tabungan Target' : editing ? 'Perbarui Target' : 'Tujuan Baru'}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 19 }}>
              {isEntry ? 'Catat uang yang disisihkan atau digunakan.' : 'Isi nama dan jumlah uang yang ingin dikumpulkan.'}
            </Text>
          </View>
        </View>

        {loading && <View style={styles.loading}><ActivityIndicator color={theme.colors.primary} /><Text style={{ color: theme.colors.onSurfaceVariant }}>Memuat target...</Text></View>}

        {!!error && (
          <View style={[styles.notice, { backgroundColor: theme.colors.errorContainer }]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={20} color={theme.colors.onErrorContainer} />
            <Text style={{ flex: 1, color: theme.colors.onErrorContainer }}>{error}</Text>
          </View>
        )}

        {!loading && (!needsGoal || goal !== null) && (
          <>
            {isEntry && goal && (
              <View style={[styles.balanceCard, { backgroundColor: theme.colors.primaryContainer }]}>
                <Text variant="labelMedium" style={{ color: theme.colors.onPrimaryContainer }}>Tabungan saat ini</Text>
                <Text style={[styles.balanceNumber, { color: theme.colors.onPrimaryContainer }]}>{formatRupiah(balance)}</Text>
                <View style={[styles.barTrack, { backgroundColor: theme.colors.surfaceVariant }]}>
                  <View style={[styles.barFill, { backgroundColor: theme.colors.primary, width: `${Math.round(progress(balance, goal.target_rupiah) * 100)}%` as `${number}%` }]} />
                </View>
                <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer, marginTop: 7 }}>
                  Target {formatRupiah(goal.target_rupiah)}
                </Text>
              </View>
            )}

            <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
              <Text variant="titleMedium" style={[styles.bold, { color: theme.colors.onSurface }]}>
                {isEntry ? (entryKind === 'deposit' ? 'Jumlah Setoran' : 'Jumlah Pengurangan') : 'Informasi Target'}
              </Text>

              {!isEntry && (
                <View style={styles.field}>
                  <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Nama target *</Text>
                  <TextInput
                    mode="outlined" value={title} onChangeText={setTitle}
                    placeholder="Contoh: Dana Darurat" maxLength={60}
                    autoCapitalize="sentences" disabled={saving}
                    outlineStyle={styles.inputOutline}
                    textColor={theme.colors.onSurface}
                  />
                  {!!title && !validTitle && <Text variant="bodySmall" style={{ color: theme.colors.error }}>Minimal 2 karakter.</Text>}
                </View>
              )}

              <View style={styles.field}>
                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  {isEntry ? 'Nominal (Rp) *' : 'Nominal target (Rp) *'}
                </Text>
                <TextInput
                  mode="outlined" value={grouping(rawAmount)}
                  onChangeText={value => setRawAmount(toDigits(value))}
                  keyboardType="number-pad" placeholder="0"
                  disabled={saving} outlineStyle={styles.inputOutline}
                  textColor={theme.colors.onSurface}
                  accessibilityLabel="Nominal rupiah"
                />
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {isEntry ? 'Ketik nominal atau pilih jumlah cepat.' : 'Jumlah total yang ingin dikumpulkan.'}
                </Text>
                <View style={styles.presets}>
                  {presets.map(preset => (
                    <Pressable
                      key={preset.value}
                      accessibilityRole="button"
                      disabled={saving}
                      onPress={() => setRawAmount(preset.value)}
                      style={[
                        styles.preset,
                        { borderColor: rawAmount === preset.value ? theme.colors.primary : theme.colors.outlineVariant,
                          backgroundColor: rawAmount === preset.value ? theme.colors.primaryContainer : theme.colors.surface },
                      ]}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.onSurface }}>{preset.label}</Text>
                    </Pressable>
                  ))}
                </View>
                {!!rawAmount && !validAmount(Number(rawAmount)) && (
                  <Text variant="bodySmall" style={{ color: theme.colors.error }}>Nominal harus lebih dari Rp0.</Text>
                )}
                {isEntry && !enoughBalance && (
                  <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                    Pengurangan maksimal {formatRupiah(balance)}.
                  </Text>
                )}
              </View>

              {!isEntry && (
                <View style={[styles.amountPreview, { backgroundColor: theme.colors.background }]}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>NOMINAL TARGET</Text>
                  <Text style={[styles.previewAmount, { color: theme.colors.onSurface }]}>{formatRupiah(targetValue)}</Text>
                </View>
              )}
              {isEntry && (
                <View style={[styles.amountPreview, { backgroundColor: theme.colors.background }]}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>SETELAH DISIMPAN</Text>
                  <Text style={[styles.previewAmount, { color: theme.colors.onSurface }]}>{formatRupiah(nextSaved)}</Text>
                  {goal && <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {Math.round(progress(nextSaved, goal.target_rupiah) * 100)}% dari target
                  </Text>}
                </View>
              )}
            </View>

            <View style={[styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
              <View style={styles.sectionHeading}>
                <Text variant="titleMedium" style={[styles.bold, { color: theme.colors.onSurface }]}>
                  {isEntry ? 'Detail Catatan' : 'Rencana Tambahan'}
                </Text>
                {!isEntry && <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Opsional, bisa diubah nanti.</Text>}
              </View>

              <View style={styles.field}>
                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  {isEntry ? 'Tanggal setoran (YYYY-MM-DD) *' : 'Tanggal target (YYYY-MM-DD)'}
                </Text>
                <TextInput
                  mode="outlined" value={isEntry ? occurredOn : dueDate}
                  onChangeText={isEntry ? setOccurredOn : setDueDate}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                  keyboardType="numbers-and-punctuation"
                  disabled={saving} outlineStyle={styles.inputOutline}
                  textColor={theme.colors.onSurface}
                />
                <View style={styles.presets}>
                  {(isEntry ? [
                    { label: 'Hari ini', value: localDate() },
                  ] : [
                    { label: '3 bulan', value: plusMonths(3) },
                    { label: '6 bulan', value: plusMonths(6) },
                    { label: '12 bulan', value: plusMonths(12) },
                    { label: 'Tanpa batas', value: '' },
                  ]).map(item => (
                    <Pressable
                      key={item.label} accessibilityRole="button"
                      onPress={() => isEntry ? setOccurredOn(item.value) : setDueDate(item.value)}
                      style={[styles.preset, { borderColor: theme.colors.outlineVariant }]}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.onSurface }}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
                {isEntry && !validEntryDate && <Text variant="bodySmall" style={{ color: theme.colors.error }}>Tanggal tidak valid.</Text>}
                {!isEntry && !validGoalDate && <Text variant="bodySmall" style={{ color: theme.colors.error }}>Gunakan tanggal YYYY-MM-DD yang valid.</Text>}
              </View>

              <View style={styles.field}>
                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Keterangan (opsional)</Text>
                <TextInput
                  mode="outlined" multiline numberOfLines={3}
                  value={isEntry ? entryNote : goalNote}
                  onChangeText={isEntry ? setEntryNote : setGoalNote}
                  maxLength={250} placeholder={isEntry ? 'Contoh: Dari gaji bulanan' : 'Contoh: Disisihkan setiap gajian'}
                  disabled={saving} outlineStyle={styles.inputOutline}
                  textColor={theme.colors.onSurface}
                />
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={!canSave}
              onPress={() => { void save(); }}
              style={({ pressed }) => [
                styles.submit,
                { backgroundColor: theme.colors.primary },
                (!canSave || pressed) && { opacity: 0.55 },
              ]}
            >
              {saving ? <ActivityIndicator color={theme.colors.onPrimary} /> : <MaterialCommunityIcons name="check" size={21} color={theme.colors.onPrimary} />}
              <Text style={{ color: theme.colors.onPrimary, fontWeight: '800', fontSize: 15 }}>{submitTitle}</Text>
            </Pressable>

            {!canSave && !saving && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', lineHeight: 19 }}>
                {isEntry ? 'Isi nominal dan tanggal yang valid untuk menyimpan.' : 'Lengkapi nama target dan nominal lebih dari Rp0.'}
              </Text>
            )}

            <View style={styles.info}>
              <MaterialCommunityIcons name="information-outline" size={18} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurfaceVariant, lineHeight: 19 }}>
                Catatan target tidak otomatis memindahkan uang atau mengubah saldo rekening.
              </Text>
            </View>
          </>
        )}

        <Pressable accessibilityRole="button" onPress={goBack} style={styles.back}>
          <MaterialCommunityIcons name="arrow-left" size={19} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Kembali ke Target</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 100 },
  heading: { flexDirection: 'row', alignItems: 'center', marginBottom: 19 },
  headerIcon: { width: 48, height: 48, borderRadius: 15, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  bold: { fontWeight: '800' },
  loading: { alignItems: 'center', paddingVertical: 35 },
  notice: { flexDirection: 'row', padding: 14, alignItems: 'center', borderRadius: 13, marginBottom: 14 },
  balanceCard: { borderRadius: 18, padding: 18, marginBottom: 15 },
  balanceNumber: { fontSize: 26, lineHeight: 36, fontWeight: '800', marginTop: 7, marginBottom: 12, includeFontPadding: false },
  barTrack: { width: '100%', height: 7, borderRadius: 7, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 7 },
  section: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },
  sectionHeading: { marginBottom: 12 },
  field: { marginTop: 15 },
  inputOutline: { borderRadius: 12 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  preset: { borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, marginRight: 7, marginBottom: 7 },
  amountPreview: { padding: 14, borderRadius: 13, marginTop: 16 },
  previewAmount: { fontSize: 21, lineHeight: 29, fontWeight: '800', marginTop: 5, includeFontPadding: false },
  submit: { minHeight: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 7 },
  info: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18 },
  back: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, marginTop: 12 },
});
