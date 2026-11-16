import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { ComponentProps } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Divider,
  HelperText,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  createWallet,
  getWallets,
  updateWallet,
  type WalletKind,
  type WalletRecord,
} from '../../features/deypocket/finance-management';
import { formatRupiah } from '../../features/deypocket/format';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type WalletFilter = WalletKind | 'all';

type WalletType = {
  value: WalletKind;
  label: string;
  icon: IconName;
  hint: string;
};

const WALLET_TYPES: WalletType[] = [
  { value: 'cash', label: 'Tunai', icon: 'cash', hint: 'Uang tunai dan kas harian' },
  { value: 'bank', label: 'Bank', icon: 'bank-outline', hint: 'Tabungan dan rekening bank' },
  { value: 'ewallet', label: 'E-Wallet', icon: 'cellphone', hint: 'Saldo dompet digital' },
  { value: 'other', label: 'Lainnya', icon: 'wallet-outline', hint: 'Sumber dana lainnya' },
];

function getWalletType(kind: WalletKind): WalletType {
  return WALLET_TYPES.find((type) => type.value === kind) ?? WALLET_TYPES[3];
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function dataSnapshot(name: string, kind: WalletKind, balance: string): string {
  return JSON.stringify([name, kind, balance]);
}

export default function AccountsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const savingRef = useRef(false);
  const initialSnapshot = useRef('');

  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState('');
  const [filter, setFilter] = useState<WalletFilter>('all');

  const [editorVisible, setEditorVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<WalletKind>('cash');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [snackbar, setSnackbar] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function load() {
        setLoading(true);
        try {
          const rows = await getWallets(db);
          if (!active) return;
          setWallets(rows);
          setListError('');
        } catch (error) {
          if (active) {
            setListError(errorMessage(error, 'Gagal membaca daftar dompet.'));
          }
        } finally {
          if (active) setLoading(false);
        }
      }

      void load();
      return () => { active = false; };
    }, [db])
  );

  const totalBalance = useMemo(
    () => wallets.reduce((sum, wallet) => sum + wallet.balance_rupiah, 0),
    [wallets]
  );
  const filteredWallets = useMemo(
    () => filter === 'all' ? wallets : wallets.filter((wallet) => wallet.kind === filter),
    [wallets, filter]
  );
  const selectedWallet = wallets.find((wallet) => wallet.id === editingId);
  const openingBalanceLocked = !!selectedWallet && selectedWallet.usage_count > 0;
  const dirty = editorVisible &&
    initialSnapshot.current !== dataSnapshot(name, kind, openingBalance);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      setWallets(await getWallets(db));
      setListError('');
    } catch (error) {
      setListError(errorMessage(error, 'Gagal memperbarui daftar dompet.'));
    } finally {
      setRefreshing(false);
    }
  }

  function openNew() {
    if (savingRef.current) return;
    setEditingId(null);
    setName('');
    setKind('cash');
    setOpeningBalance('0');
    setEditorError('');
    initialSnapshot.current = dataSnapshot('', 'cash', '0');
    setEditorVisible(true);
  }

  function openEdit(wallet: WalletRecord) {
    if (savingRef.current) return;
    const balance = String(wallet.opening_balance_rupiah);
    setEditingId(wallet.id);
    setName(wallet.name);
    setKind(wallet.kind);
    setOpeningBalance(balance);
    setEditorError('');
    initialSnapshot.current = dataSnapshot(wallet.name, wallet.kind, balance);
    setEditorVisible(true);
  }

  function closeEditor() {
    setEditorVisible(false);
    setEditorError('');
  }

  function requestClose() {
    if (savingRef.current) return;
    if (!dirty) {
      closeEditor();
      return;
    }
    Alert.alert(
      'Buang perubahan?',
      'Perubahan pada dompet ini belum disimpan.',
      [
        { text: 'Lanjut Mengedit', style: 'cancel' },
        { text: 'Buang', style: 'destructive', onPress: closeEditor },
      ]
    );
  }

  async function handleSave() {
    if (savingRef.current) return;

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setEditorError('Nama dompet minimal 2 karakter.');
      return;
    }

    const openingBalanceRupiah = Number(openingBalance || '0');
    if (!Number.isSafeInteger(openingBalanceRupiah) || openingBalanceRupiah < 0) {
      setEditorError('Saldo awal harus berupa angka rupiah yang valid.');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setEditorError('');

    try {
      const input = { name: trimmedName, kind, openingBalanceRupiah };
      const isNew = editingId === null;

      if (isNew) {
        await createWallet(db, input);
      } else {
        await updateWallet(db, editingId, input);
      }

      const rows = await getWallets(db);
      setWallets(rows);
      setListError('');
      if (isNew) setFilter('all');
      closeEditor();
      setSnackbar(isNew ? 'Dompet berhasil ditambahkan.' : 'Perubahan dompet berhasil disimpan.');
    } catch (error) {
      const detail = errorMessage(error, 'Gagal menyimpan dompet.');
      setEditorError(
        detail.includes('UNIQUE constraint failed')
          ? 'Nama dompet sudah digunakan.'
          : detail
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ title: 'Dompet & Rekening', headerShown: true }} />

      <ScrollView
        contentContainerStyle={[
          styles.page,
          { paddingBottom: Math.max(insets.bottom, 12) + 32 },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heading}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="labelMedium" style={{ color: theme.colors.primary, fontWeight: '800' }}>
              DEYPOCKET
            </Text>
            <Text variant="headlineSmall" style={styles.bold}>Dompet & Rekening</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Semua saldo, lebih mudah dipantau.
            </Text>
          </View>
        </View>

        <View style={[styles.hero, { backgroundColor: theme.colors.primaryContainer }]}>
          <View style={styles.heroTop}>
            <View style={[styles.heroIcon, { backgroundColor: theme.colors.primary }]}>
              <MaterialCommunityIcons name="wallet" size={24} color={theme.colors.onPrimary} />
            </View>
            <Text variant="labelLarge" style={{ color: theme.colors.onPrimaryContainer }}>
              Total Saldo
            </Text>
          </View>
          <Text
            variant="headlineMedium"
            numberOfLines={2}
            adjustsFontSizeToFit
            style={[styles.heroAmount, { color: theme.colors.onPrimaryContainer }]}
          >
            {formatRupiah(totalBalance)}
          </Text>
          <View style={styles.heroBottom}>
            <MaterialCommunityIcons
              name="layers-outline"
              size={16}
              color={theme.colors.onPrimaryContainer}
            />
            <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer }}>
              {wallets.length} dompet terdaftar
            </Text>
          </View>
        </View>

        <Button
          mode="contained"
          icon="plus"
          contentStyle={styles.addButtonContent}
          style={styles.addButton}
          onPress={openNew}
          disabled={saving}
        >
          Tambah Dompet Baru
        </Button>

        <View style={styles.sectionHeading}>
          <View style={{ gap: 3 }}>
            <Text variant="titleLarge" style={styles.bold}>Dompet Saya</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Ketuk dompet untuk mengubah detailnya.
            </Text>
          </View>
          <Text variant="labelLarge" style={{ color: theme.colors.primary, fontWeight: '700' }}>
            {filteredWallets.length} dompet
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {([
            { value: 'all', label: 'Semua' },
            ...WALLET_TYPES.map(({ value, label }) => ({ value, label })),
          ] as { value: WalletFilter; label: string }[]).map((option) => {
            const active = option.value === filter;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(option.value)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? theme.colors.primaryContainer : theme.colors.surface,
                    borderColor: active ? theme.colors.primary : theme.colors.outlineVariant,
                  },
                ]}
              >
                <Text
                  variant="labelMedium"
                  style={{ color: active ? theme.colors.primary : theme.colors.onSurfaceVariant, fontWeight: active ? '800' : '600' }}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" />
            <Text style={{ color: theme.colors.onSurfaceVariant }}>Memuat daftar dompet...</Text>
          </View>
        ) : listError ? (
          <Card mode="outlined">
            <Card.Content style={styles.stateBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={30} color={theme.colors.error} />
              <Text style={{ color: theme.colors.error, textAlign: 'center' }}>{listError}</Text>
              <Button mode="outlined" onPress={() => void refresh()}>Coba Lagi</Button>
            </Card.Content>
          </Card>
        ) : filteredWallets.length === 0 ? (
          <Card mode="outlined">
            <Card.Content style={styles.stateBox}>
              <MaterialCommunityIcons name="wallet-plus-outline" size={40} color={theme.colors.primary} />
              <Text variant="titleMedium" style={styles.bold}>
                {wallets.length === 0 ? 'Belum ada dompet' : 'Tidak ada dompet di kategori ini'}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
                {wallets.length === 0
                  ? 'Mulai catat keuangan dengan menambahkan dompet pertama.'
                  : 'Pilih kategori lain atau lihat semua dompet.'}
              </Text>
              {wallets.length === 0 ? (
                <Button mode="contained-tonal" onPress={openNew}>Buat Dompet</Button>
              ) : (
                <Button mode="text" onPress={() => setFilter('all')}>Lihat Semua</Button>
              )}
            </Card.Content>
          </Card>
        ) : (
          <View style={styles.walletList}>
            {filteredWallets.map((wallet) => {
              const type = getWalletType(wallet.kind);
              return (
                <Pressable
                  key={wallet.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Ubah ${wallet.name}`}
                  onPress={() => openEdit(wallet)}
                  style={({ pressed }) => [
                    styles.walletCard,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.outlineVariant,
                      opacity: pressed ? 0.78 : 1,
                    },
                  ]}
                >
                  <View style={styles.walletCardTop}>
                    <View style={[styles.walletIcon, { backgroundColor: theme.colors.primaryContainer }]}>
                      <MaterialCommunityIcons name={type.icon} size={23} color={theme.colors.primary} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="titleMedium" numberOfLines={1} style={styles.bold}>{wallet.name}</Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{type.label}</Text>
                    </View>
                    <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.colors.onSurfaceVariant} />
                  </View>
                  <Text variant="headlineSmall" style={styles.walletAmount} numberOfLines={1} adjustsFontSizeToFit>
                    {formatRupiah(wallet.balance_rupiah)}
                  </Text>
                  <Divider />
                  <View style={styles.walletFoot}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      Saldo awal: {formatRupiah(wallet.opening_balance_rupiah)}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {wallet.usage_count} aktivitas
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar('')}
        duration={3000}
        action={{ label: 'Tutup', onPress: () => setSnackbar('') }}
        style={{ marginBottom: insets.bottom + 12 }}
      >
        {snackbar}
      </Snackbar>

      <Modal
        visible={editorVisible}
        animationType="slide"
        onRequestClose={requestClose}
        presentationStyle="fullScreen"
      >
        <SafeAreaView
          style={[styles.modalRoot, { backgroundColor: theme.colors.background }]}
          edges={['top', 'bottom']}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >
            <View style={[styles.modalHeader, { borderBottomColor: theme.colors.outlineVariant }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tutup editor dompet"
                hitSlop={10}
                disabled={saving}
                onPress={requestClose}
                style={styles.closeButton}
              >
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.onSurface} />
              </Pressable>
              <View style={{ flex: 1, gap: 1 }}>
                <Text variant="titleMedium" numberOfLines={1} style={styles.bold}>
                  {editingId === null ? 'Tambah Dompet' : 'Ubah Dompet'}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {editingId === null ? 'Atur sumber uang baru' : 'Perbarui detail dompet'}
                </Text>
              </View>
              <Button
                mode="contained"
                compact
                loading={saving}
                disabled={saving || name.trim().length < 2}
                onPress={() => void handleSave()}
              >
                Simpan
              </Button>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.formBody,
                { paddingBottom: Math.max(insets.bottom, 16) + 40 },
              ]}
            >
              <View style={[styles.formIntro, { backgroundColor: theme.colors.primaryContainer }]}>
                <MaterialCommunityIcons
                  name={getWalletType(kind).icon}
                  size={26}
                  color={theme.colors.primary}
                />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="titleMedium" style={{ color: theme.colors.onPrimaryContainer, fontWeight: '800' }}>
                    {editingId === null ? 'Dompet baru' : name || 'Dompet'}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer }}>
                    {getWalletType(kind).hint}
                  </Text>
                </View>
              </View>

              <Text variant="titleMedium" style={styles.bold}>Informasi Dompet</Text>
              <TextInput
                mode="outlined"
                label="Nama Dompet"
                placeholder="Contoh: BCA, GoPay, Dompet Harian"
                value={name}
                onChangeText={(value) => { setName(value); setEditorError(''); }}
                maxLength={50}
                returnKeyType="done"
                left={<TextInput.Icon icon="wallet-outline" />}
              />

              <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
                Jenis Dompet
              </Text>
              <View style={styles.typeGrid}>
                {WALLET_TYPES.map((type) => {
                  const active = type.value === kind;
                  return (
                    <Pressable
                      key={type.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setKind(type.value)}
                      style={[
                        styles.typeOption,
                        {
                          borderColor: active ? theme.colors.primary : theme.colors.outlineVariant,
                          backgroundColor: active ? theme.colors.primaryContainer : theme.colors.surface,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={type.icon}
                        size={21}
                        color={active ? theme.colors.primary : theme.colors.onSurfaceVariant}
                      />
                      <Text variant="labelLarge" style={{ color: active ? theme.colors.primary : theme.colors.onSurface, fontWeight: active ? '800' : '600' }}>
                        {type.label}
                      </Text>
                      {active && (
                        <MaterialCommunityIcons name="check-circle" size={17} color={theme.colors.primary} />
                      )}
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                mode="outlined"
                label="Saldo Awal (Rp)"
                value={openingBalance}
                onChangeText={(value) => {
                  setOpeningBalance(value.replace(/[^0-9]/g, ''));
                  setEditorError('');
                }}
                keyboardType="number-pad"
                editable={!openingBalanceLocked && !saving}
                left={<TextInput.Icon icon="cash-multiple" />}
              />

              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Saldo awal: {formatRupiah(Number(openingBalance || '0'))}
              </Text>

              {openingBalanceLocked ? (
                <HelperText type="info" visible>
                  Saldo awal tidak bisa diubah karena dompet telah digunakan dalam transaksi atau transfer.
                </HelperText>
              ) : (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                  Isi dengan nominal yang sudah dimiliki sebelum mulai menggunakan DeyPocket. Perubahan berikutnya dicatat melalui transaksi.
                </Text>
              )}

              {!!editorError && (
                <HelperText type="error" visible>{editorError}</HelperText>
              )}

              <Button
                mode="contained-tonal"
                icon="content-save-outline"
                contentStyle={{ minHeight: 48 }}
                loading={saving}
                disabled={saving || name.trim().length < 2}
                onPress={() => void handleSave()}
              >
                {editingId === null ? 'Simpan Dompet' : 'Simpan Perubahan'}
              </Button>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: {
    width: '100%', maxWidth: 760, alignSelf: 'center',
    paddingHorizontal: 18, paddingTop: 20, gap: 18,
  },
  heading: { flexDirection: 'row', alignItems: 'center' },
  bold: { fontWeight: '800' },
  hero: { borderRadius: 25, padding: 22, gap: 14 },
  heroTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  heroIcon: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  heroAmount: { fontWeight: '900', letterSpacing: -0.5 },
  heroBottom: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  addButton: { borderRadius: 16 },
  addButtonContent: { minHeight: 54 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 },
  filterRow: { gap: 9, paddingVertical: 2 },
  filterChip: { minHeight: 36, paddingHorizontal: 15, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  walletList: { gap: 12 },
  walletCard: { borderWidth: 1, borderRadius: 20, padding: 17, gap: 14 },
  walletCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  walletIcon: { height: 46, width: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  walletAmount: { fontWeight: '800' },
  walletFoot: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  stateBox: { paddingVertical: 35, paddingHorizontal: 18, alignItems: 'center', gap: 12 },
  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  closeButton: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  formBody: { width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 18, gap: 16 },
  formIntro: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, padding: 18 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeOption: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 50, borderRadius: 14, borderWidth: 1, width: '48%' },
});
