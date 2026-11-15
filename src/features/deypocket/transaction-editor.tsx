import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { ComponentProps } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
    KeyboardAvoidingView,
    TextInput as NativeTextInput,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';
import {
    ActivityIndicator,
    Button,
    Card,
    Dialog,
    Divider,
    HelperText,
    Portal,
    Text,
    TextInput,
    useTheme,
} from 'react-native-paper';

import type { EditableEntry } from './finance-management';
import {
    getAccounts,
    getCategories,
    type ActivityKind,
    type FinanceAccount,
    type FinanceCategory,
    type TransactionKind,
} from './finance-repository';
import { formatRupiah, getLocalDate } from './format';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type PickerKind = 'account' | 'category' | 'from' | 'to';

export type TransactionDraft =
  | {
      kind: TransactionKind;
      amountRupiah: number;
      occurredOn: string;
      note: string;
      accountId: number;
      categoryId: number;
    }
  | {
      kind: 'transfer';
      amountRupiah: number;
      occurredOn: string;
      note: string;
      fromAccountId: number;
      toAccountId: number;
    };

type Props = {
  mode: 'add' | 'edit';
  initialEntry?: EditableEntry;
  onSave: (draft: TransactionDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
};

const KIND_OPTIONS: {
  value: ActivityKind;
  label: string;
  icon: IconName;
}[] = [
  { value: 'expense', label: 'Keluar', icon: 'arrow-up-right' },
  { value: 'income', label: 'Masuk', icon: 'arrow-down-left' },
  { value: 'transfer', label: 'Transfer', icon: 'swap-horizontal' },
];

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100) return false;
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function yesterdayLocal(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function getKindTitle(kind: ActivityKind): string {
  if (kind === 'income') return 'Pemasukan';
  if (kind === 'expense') return 'Pengeluaran';
  return 'Transfer dompet';
}

type SelectRowProps = {
  label: string;
  value: string;
  description?: string;
  icon: IconName;
  onPress: () => void;
  last?: boolean;
};

function SelectRow({
  label,
  value,
  description,
  icon,
  onPress,
  last = false,
}: SelectRowProps) {
  const theme = useTheme();

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.selectRow,
          { opacity: pressed ? 0.65 : 1 },
        ]}
      >
        <View
          style={[
            styles.selectIcon,
            { backgroundColor: theme.colors.primaryContainer },
          ]}
        >
          <MaterialCommunityIcons
            name={icon}
            size={22}
            color={theme.colors.primary}
          />
        </View>

        <View style={{ flex: 1, gap: 4 }}>
          <Text
            variant="labelMedium"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {label}
          </Text>
          <Text variant="titleMedium" numberOfLines={1}>
            {value}
          </Text>
          {!!description && (
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
              numberOfLines={1}
            >
              {description}
            </Text>
          )}
        </View>

        <MaterialCommunityIcons
          name="chevron-right"
          size={22}
          color={theme.colors.onSurfaceVariant}
        />
      </Pressable>
      {!last && <Divider />}
    </>
  );
}

export default function TransactionEditor({
  mode,
  initialEntry,
  onSave,
  onDelete,
}: Props) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const savingRef = useRef(false);

  const [kind, setKind] = useState<ActivityKind>(
    initialEntry?.kind ?? 'expense'
  );
  const [amount, setAmount] = useState(
    initialEntry ? String(initialEntry.amount_rupiah) : ''
  );
  const [occurredOn, setOccurredOn] = useState(
    initialEntry?.occurred_on ?? getLocalDate()
  );
  const [note, setNote] = useState(initialEntry?.note ?? '');

  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [accountId, setAccountId] = useState<number | null>(
    initialEntry?.account_id ?? null
  );
  const [categoryId, setCategoryId] = useState<number | null>(
    initialEntry?.category_id ?? null
  );
  const [fromAccountId, setFromAccountId] = useState<number | null>(
    initialEntry?.from_account_id ?? null
  );
  const [toAccountId, setToAccountId] = useState<number | null>(
    initialEntry?.to_account_id ?? null
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState<PickerKind | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadMaster() {
      setLoading(true);
      setError('');
      try {
        const [walletRows, expenseRows, incomeRows] = await Promise.all([
          getAccounts(db),
          getCategories(db, 'expense'),
          getCategories(db, 'income'),
        ]);
        if (!active) return;
        setAccounts(walletRows);
        setCategories([...expenseRows, ...incomeRows]);

        if (mode === 'add') {
          setAccountId(walletRows[0]?.id ?? null);
          setFromAccountId(walletRows[0]?.id ?? null);
          setToAccountId(walletRows[1]?.id ?? null);
          setCategoryId(expenseRows[0]?.id ?? null);
        }
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : 'Gagal memuat pilihan.'
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadMaster();
    return () => {
      active = false;
    };
  }, [db, mode, reloadKey]);

  const numericAmount = Number(amount || 0);
  const amountValid =
    /^\d+$/.test(amount) &&
    Number.isSafeInteger(numericAmount) &&
    numericAmount > 0 &&
    numericAmount <= 1_000_000_000_000;
  const dateValid = validDate(occurredOn);

  const filteredCategories = categories.filter(
    (category) => category.kind === kind
  );

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const selectedCategory = filteredCategories.find(
    (c) => c.id === categoryId
  );
  const selectedFrom = accounts.find((a) => a.id === fromAccountId);
  const selectedTo = accounts.find((a) => a.id === toAccountId);

  const selectionValid =
    kind === 'transfer'
      ? !!selectedFrom && !!selectedTo && selectedFrom.id !== selectedTo.id
      : !!selectedAccount && !!selectedCategory;

  const canSave =
    !loading &&
    !saving &&
    amountValid &&
    dateValid &&
    selectionValid;

  function changeKind(next: ActivityKind) {
    if (mode === 'edit') return;
    setKind(next);
    setError('');
    if (next !== 'transfer') {
      setCategoryId(
        categories.find((category) => category.kind === next)?.id ?? null
      );
    }
  }

  async function handleSave() {
    if (!canSave || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');

    try {
      if (kind === 'transfer') {
        if (!selectedFrom || !selectedTo) {
          throw new Error('Pilih dua dompet berbeda.');
        }
        await onSave({
          kind,
          amountRupiah: numericAmount,
          occurredOn,
          note,
          fromAccountId: selectedFrom.id,
          toAccountId: selectedTo.id,
        });
      } else {
        if (!selectedAccount || !selectedCategory) {
          throw new Error('Pilih dompet dan kategori.');
        }
        await onSave({
          kind,
          amountRupiah: numericAmount,
          occurredOn,
          note,
          accountId: selectedAccount.id,
          categoryId: selectedCategory.id,
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal menyimpan transaksi.'
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      await onDelete();
      setDeleteVisible(false);
    } catch (err) {
      setDeleteVisible(false);
      setError(
        err instanceof Error ? err.message : 'Gagal menghapus transaksi.'
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const pickerOptions =
    picker === 'category'
      ? filteredCategories.map((category) => ({
          id: category.id,
          label: category.name,
          caption: getKindTitle(kind),
        }))
      : picker === 'from' || picker === 'to' || picker === 'account'
        ? accounts.map((account) => ({
              id: account.id,
              label: account.name,
              caption: `Saldo ${formatRupiah(account.balance_rupiah)}`,
            }))
        : [];

  const pickerSelected =
    picker === 'category'
      ? categoryId
      : picker === 'account'
        ? accountId
        : picker === 'from'
          ? fromAccountId
          : picker === 'to'
            ? toAccountId
            : null;

  const pickerTitle =
    picker === 'category'
      ? 'Pilih kategori'
      : picker === 'from'
        ? 'Dompet asal'
        : picker === 'to'
          ? 'Dompet tujuan'
          : 'Pilih dompet';

  function selectOption(id: number) {
    if (picker === 'account') setAccountId(id);
    if (picker === 'category') setCategoryId(id);
    if (picker === 'from') {
      if (id === toAccountId) setToAccountId(fromAccountId);
      setFromAccountId(id);
    }
    if (picker === 'to') {
      if (id === fromAccountId) setFromAccountId(toAccountId);
      setToAccountId(id);
    }
    setPicker(null);
    setError('');
  }

  const kindIcon = KIND_OPTIONS.find((option) => option.value === kind)?.icon ?? 'swap-horizontal';
  const heroBackground = theme.colors.primaryContainer;
  const heroForeground = theme.colors.onPrimaryContainer;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.page}
      >
        <View style={{ gap: 5 }}>
          <Text
            variant="labelMedium"
            style={{ color: theme.colors.primary, fontWeight: '800', letterSpacing: 1.1 }}
          >
            DEYPOCKET
          </Text>
          <Text variant="headlineSmall" style={{ fontWeight: '800' }}>
            {mode === 'add' ? 'Transaksi baru' : 'Ubah transaksi'}
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {mode === 'add'
              ? 'Catat sekarang, kelola lebih tenang.'
              : 'Perbarui rincian tanpa kehilangan histori.'}
          </Text>
        </View>

        {mode === 'add' ? (
          <View style={styles.kindRow}>
            {KIND_OPTIONS.map((option) => {
              const selected = option.value === kind;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => changeKind(option.value)}
                  style={({ pressed }) => [
                    styles.kindButton,
                    {
                      backgroundColor: selected
                        ? theme.colors.primaryContainer
                        : theme.colors.surface,
                      borderColor: selected
                        ? theme.colors.primary
                        : theme.colors.outlineVariant,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={option.icon}
                    size={21}
                    color={selected ? theme.colors.primary : theme.colors.onSurfaceVariant}
                  />
                  <Text
                    variant="labelMedium"
                    numberOfLines={1}
                    style={{
                      fontWeight: selected ? '800' : '600',
                      color: selected ? theme.colors.primary : theme.colors.onSurface,
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={{ flexDirection: 'row' }}>
            <View
              style={[
                styles.editKind,
                { backgroundColor: theme.colors.primaryContainer },
              ]}
            >
              <MaterialCommunityIcons name={kindIcon} size={19} color={theme.colors.primary} />
              <Text variant="labelLarge" style={{ color: theme.colors.onPrimaryContainer }}>
                {getKindTitle(kind)}
              </Text>
              <MaterialCommunityIcons name="lock-outline" size={15} color={theme.colors.onPrimaryContainer} />
            </View>
          </View>
        )}

        <Card mode="contained" style={[styles.amountCard, { backgroundColor: heroBackground }]}>
          <Card.Content style={{ paddingVertical: 23, gap: 12 }}>
            <View style={styles.amountHeader}>
              <Text variant="labelLarge" style={{ color: heroForeground }}>
                Nominal {getKindTitle(kind).toLowerCase()}
              </Text>
              <MaterialCommunityIcons name="cash-edit" size={23} color={heroForeground} />
            </View>
            <View style={styles.amountInputRow}>
              <Text style={[styles.amountPrefix, { color: heroForeground }]}>Rp</Text>
              <NativeTextInput
                value={amount}
                onChangeText={(value) => {
                  setAmount(value.replace(/\D/g, '').slice(0, 16));
                  setError('');
                }}
                placeholder="0"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                keyboardType="number-pad"
                selectionColor={theme.colors.primary}
                style={[styles.amountInput, { color: heroForeground }]}
                accessibilityLabel="Jumlah uang dalam rupiah"
              />
            </View>
            <View style={[styles.amountFooter, { borderTopColor: theme.colors.outlineVariant }]}>
              <Text variant="bodySmall" style={{ color: heroForeground, opacity: 0.85 }}>
                {amountValid ? 'Nominal tercatat' : 'Masukkan nominal rupiah'}
              </Text>
              <Text
                variant="titleSmall"
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ color: heroForeground, fontWeight: '800', flexShrink: 1 }}
              >
                {amountValid ? formatRupiah(numericAmount) : '—'}
              </Text>
            </View>
            {!!amount && !amountValid && (
              <HelperText type="error" visible>
                Nominal harus lebih dari Rp0 dan maksimal Rp1 triliun.
              </HelperText>
            )}
          </Card.Content>
        </Card>

        <View style={{ gap: 11 }}>
          <Text variant="titleLarge" style={styles.sectionTitle}>Rincian transaksi</Text>

          {loading ? (
            <Card mode="outlined" style={styles.mainCard}>
              <Card.Content style={{ padding: 24, alignItems: 'center', gap: 12 }}>
                <ActivityIndicator />
                <Text variant="bodySmall">Memuat dompet dan kategori...</Text>
              </Card.Content>
            </Card>
          ) : (
            <Card mode="outlined" style={[styles.mainCard, { borderColor: theme.colors.outlineVariant }]}>
              <Card.Content style={{ paddingVertical: 1 }}>
                {kind === 'transfer' ? (
                  <>
                    <SelectRow
                      label="Dari dompet"
                      value={selectedFrom?.name ?? 'Pilih dompet asal'}
                      description={selectedFrom ? `Saldo ${formatRupiah(selectedFrom.balance_rupiah)}` : undefined}
                      icon="wallet-outline"
                      onPress={() => setPicker('from')}
                    />
                    <SelectRow
                      label="Ke dompet"
                      value={selectedTo?.name ?? 'Pilih dompet tujuan'}
                      description={selectedTo ? `Saldo ${formatRupiah(selectedTo.balance_rupiah)}` : undefined}
                      icon="bank-transfer"
                      onPress={() => setPicker('to')}
                      last
                    />
                  </>
                ) : (
                  <>
                    <SelectRow
                      label="Kategori"
                      value={selectedCategory?.name ?? 'Pilih kategori'}
                      icon="shape-outline"
                      onPress={() => setPicker('category')}
                    />
                    <SelectRow
                      label="Dompet / rekening"
                      value={selectedAccount?.name ?? 'Pilih dompet'}
                      description={selectedAccount ? `Saldo ${formatRupiah(selectedAccount.balance_rupiah)}` : undefined}
                      icon="wallet-outline"
                      onPress={() => setPicker('account')}
                      last
                    />
                  </>
                )}
              </Card.Content>
            </Card>
          )}
          {kind === 'transfer' && accounts.length >= 2 && (
            <Button
              mode="text"
              icon="swap-vertical"
              onPress={() => {
                setFromAccountId(toAccountId);
                setToAccountId(fromAccountId);
                setError('');
              }}
            >
              Tukar arah transfer
            </Button>
          )}
        </View>

        {accounts.length === 0 && !loading && (
          <Card mode="outlined" style={styles.mainCard}>
            <Card.Content style={{ gap: 10 }}>
              <Text variant="bodyMedium">Belum ada dompet aktif untuk transaksi.</Text>
              <Button mode="outlined" onPress={() => router.push('/accounts')}>
                Kelola dompet
              </Button>
            </Card.Content>
          </Card>
        )}
        {kind === 'transfer' && accounts.length === 1 && !loading && (
          <Text variant="bodySmall" style={{ color: theme.colors.error }}>
            Transfer membutuhkan minimal dua dompet aktif.
          </Text>
        )}
        {kind !== 'transfer' && filteredCategories.length === 0 && !loading && (
          <Text variant="bodySmall" style={{ color: theme.colors.error }}>
            Belum ada kategori aktif untuk jenis transaksi ini.
          </Text>
        )}

        <View style={{ gap: 11 }}>
          <Text variant="titleLarge" style={styles.sectionTitle}>Informasi tambahan</Text>
          <Card mode="outlined" style={[styles.mainCard, { borderColor: theme.colors.outlineVariant }]}>
            <Card.Content style={{ gap: 15 }}>
              <TextInput
                mode="outlined"
                label="Tanggal transaksi"
                value={occurredOn}
                onChangeText={(value) => {
                  setOccurredOn(value);
                  setError('');
                }}
                placeholder="YYYY-MM-DD"
                maxLength={10}
                error={occurredOn.length > 0 && !dateValid}
                right={
                  <TextInput.Icon icon="calendar-today" onPress={() => setOccurredOn(getLocalDate())} />
                }
              />
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Button compact mode="outlined" onPress={() => setOccurredOn(getLocalDate())}>
                  Hari ini
                </Button>
                <Button compact mode="outlined" onPress={() => setOccurredOn(yesterdayLocal())}>
                  Kemarin
                </Button>
              </View>
              {occurredOn.length > 0 && !dateValid && (
                <HelperText type="error" visible>Gunakan tanggal valid dengan format YYYY-MM-DD.</HelperText>
              )}
              <TextInput
                mode="outlined"
                label="Catatan (opsional)"
                value={note}
                onChangeText={setNote}
                placeholder="Contoh: belanja makan siang"
                multiline
                numberOfLines={3}
                maxLength={500}
                style={{ minHeight: 94 }}
              />
            </Card.Content>
          </Card>
        </View>

        {mode === 'edit' && onDelete && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setDeleteVisible(true)}
            style={[styles.deleteAction, { borderColor: theme.colors.error }]}
          >
            <MaterialCommunityIcons name="delete-outline" size={20} color={theme.colors.error} />
            <Text variant="labelLarge" style={{ color: theme.colors.error }}>
              Hapus transaksi ini
            </Text>
          </Pressable>
        )}

        {!!error && !loading && (
          <Card mode="outlined" style={{ borderColor: theme.colors.error, borderRadius: 16 }}>
            <Card.Content style={{ gap: 10 }}>
              <Text variant="bodyMedium" style={{ color: theme.colors.error }}>{error}</Text>
              {accounts.length === 0 && (
                <Button mode="outlined" onPress={() => setReloadKey((value) => value + 1)}>
                  Muat ulang pilihan
                </Button>
              )}
            </Card.Content>
          </Card>
        )}

        <View style={styles.privacyRow}>
          <MaterialCommunityIcons name="shield-lock-outline" size={17} color={theme.colors.onSurfaceVariant} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>
            Catatan tersimpan di SQLite lokal perangkatmu.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.stickyFooter, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outlineVariant }]}>
        <Button
          mode="contained"
          icon="check-circle-outline"
          loading={saving}
          disabled={!canSave}
          onPress={() => void handleSave()}
          contentStyle={{ paddingVertical: 8 }}
        >
          {mode === 'add' ? 'Simpan Transaksi' : 'Simpan Perubahan'}
        </Button>
      </View>

      <Portal>
        <Dialog
          visible={picker !== null}
          onDismiss={() => setPicker(null)}
          style={{ width: '92%', maxWidth: 440, alignSelf: 'center', borderRadius: 20 }}
        >
          <Dialog.Title>{pickerTitle}</Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {pickerOptions.length === 0 ? (
                <Text style={{ padding: 18 }}>Belum ada pilihan tersedia.</Text>
              ) : (
                pickerOptions.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() => selectOption(option.id)}
                    style={({ pressed }) => [
                      styles.pickerItem,
                      { backgroundColor: pressed ? theme.colors.surfaceVariant : 'transparent' },
                    ]}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text variant="titleSmall">{option.label}</Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {option.caption}
                      </Text>
                    </View>
                    {option.id === pickerSelected && (
                      <MaterialCommunityIcons name="check-circle" size={22} color={theme.colors.primary} />
                    )}
                  </Pressable>
                ))
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setPicker(null)}>Tutup</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={deleteVisible} onDismiss={() => { if (!saving) setDeleteVisible(false); }}>
          <Dialog.Icon icon="alert-circle-outline" color={theme.colors.error} size={36} />
          <Dialog.Title style={{ textAlign: 'center' }}>Hapus transaksi?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ textAlign: 'center' }}>
              Data ini akan dihapus permanen. Saldo dompet dan laporan anggaran akan dihitung ulang.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button disabled={saving} onPress={() => setDeleteVisible(false)}>Batal</Button>
            <Button textColor={theme.colors.error} disabled={saving} loading={saving} onPress={() => void handleDelete()}>
              Hapus
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 42,
    gap: 19,
  },
  sectionTitle: { fontWeight: '800', letterSpacing: -0.3 },
  kindRow: { flexDirection: 'row', gap: 9 },
  kindButton: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1.4,
    borderRadius: 17,
    paddingHorizontal: 6,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
  },
  editKind: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 100,
    paddingHorizontal: 13,
    paddingVertical: 9,
    gap: 8,
  },
  amountCard: { borderRadius: 24, overflow: 'hidden' },
  amountHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  amountInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  amountPrefix: { fontSize: 23, fontWeight: '700' },
  amountInput: { flex: 1, minWidth: 0, padding: 0, fontSize: 33, fontWeight: '800', letterSpacing: -0.6 },
  amountFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  mainCard: { borderRadius: 20, overflow: 'hidden' },
  selectRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, gap: 13 },
  selectIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  deleteAction: { borderWidth: 1, borderRadius: 16, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  privacyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  stickyFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 22 : 15 },
  pickerItem: { paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
