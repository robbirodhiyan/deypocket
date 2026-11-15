
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import {
    ActivityIndicator,
    Button,
    Card,
    HelperText,
    Menu,
    Text,
    TextInput,
    useTheme,
} from 'react-native-paper';

import {
    createWallet,
    getWallets,
    updateWallet,
    type WalletKind,
    type WalletRecord,
} from '../../features/deypocket/finance-management';

import { formatRupiah } from '../../features/deypocket/format';

const WALLET_TYPES: { value: WalletKind; label: string }[] = [
  { value: 'cash', label: 'Tunai' },
  { value: 'bank', label: 'Bank' },
  { value: 'ewallet', label: 'E-Wallet' },
  { value: 'other', label: 'Lainnya' },
];

export default function AccountsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();

  const savingRef = useRef(false);

  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<WalletKind>('cash');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [typeMenuVisible, setTypeMenuVisible] = useState(false);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const selectedWallet = wallets.find(
    (wallet) => wallet.id === editingId
  );

  const isOpeningBalanceLocked =
    !!selectedWallet && selectedWallet.usage_count > 0;

  const loadWallets = useCallback(async () => {
    const rows = await getWallets(db);
    setWallets(rows);
  }, [db]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const rows = await getWallets(db);

        if (active) {
          setWallets(rows);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Gagal membaca daftar dompet.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [db]);

  function resetForm() {
    setEditingId(null);
    setName('');
    setKind('cash');
    setOpeningBalance('0');
    setError('');
    setMessage('');
  }

  function startEditing(wallet: WalletRecord) {
    setEditingId(wallet.id);
    setName(wallet.name);
    setKind(wallet.kind);
    setOpeningBalance(
      String(wallet.opening_balance_rupiah)
    );
    setError('');
    setMessage('');
  }

  async function handleSave() {
    if (savingRef.current) return;

    savingRef.current = true;
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const openingBalanceRupiah = Number(
        openingBalance || '0'
      );

      const input = {
        name,
        kind,
        openingBalanceRupiah,
      };

      if (editingId === null) {
        await createWallet(db, input);
        setMessage('Dompet baru berhasil ditambahkan.');
      } else {
        await updateWallet(db, editingId, input);
        setMessage('Dompet berhasil diperbarui.');
      }

      await loadWallets();

      setEditingId(null);
      setName('');
      setKind('cash');
      setOpeningBalance('0');
    } catch (err) {
      const detail =
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan dompet.';

      setError(
        detail.includes('UNIQUE constraint failed')
          ? 'Nama dompet sudah digunakan.'
          : detail
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const totalBalance = wallets.reduce(
    (total, wallet) => total + wallet.balance_rupiah,
    0
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Dompet & Rekening',
          headerShown: true,
        }}
      />

      <ScrollView
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
        }}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 60,
          gap: 18,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 4 }}>
          <Text variant="headlineSmall" style={{ fontWeight: '700' }}>
            Dompet & Rekening
          </Text>
          <Text
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            Kelola sumber uang yang kamu catat di DeyPocket.
          </Text>
        </View>

        <Card
          mode="contained"
          style={{
            backgroundColor: theme.colors.primaryContainer,
          }}
        >
          <Card.Content style={{ gap: 6 }}>
            <Text
              style={{ color: theme.colors.onPrimaryContainer }}
            >
              Total Seluruh Dompet
            </Text>
            <Text
              variant="headlineMedium"
              style={{
                fontWeight: '700',
                color: theme.colors.onPrimaryContainer,
              }}
            >
              {formatRupiah(totalBalance)}
            </Text>
          </Card.Content>
        </Card>

        <Text variant="titleMedium">Daftar Dompet</Text>

        {loading && <ActivityIndicator />}

        {!loading &&
          wallets.map((wallet) => (
            <Card key={wallet.id} mode="outlined">
              <Card.Content style={{ gap: 10 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text variant="titleMedium">
                      {wallet.name}
                    </Text>

                    <Text
                      variant="bodySmall"
                      style={{
                        color: theme.colors.onSurfaceVariant,
                      }}
                    >
                      {WALLET_TYPES.find(
                        (item) => item.value === wallet.kind
                      )?.label ?? wallet.kind}
                    </Text>
                  </View>

                  <Button
                    mode="outlined"
                    compact
                    disabled={saving}
                    onPress={() => startEditing(wallet)}
                  >
                    Ubah
                  </Button>
                </View>

                <Text
                  variant="titleLarge"
                  style={{ fontWeight: '700' }}
                >
                  {formatRupiah(wallet.balance_rupiah)}
                </Text>

                <Text
                  variant="bodySmall"
                  style={{
                    color: theme.colors.onSurfaceVariant,
                  }}
                >
                  Saldo awal:{' '}
                  {formatRupiah(wallet.opening_balance_rupiah)}
                </Text>
              </Card.Content>
            </Card>
          ))}

        <Card mode="outlined">
          <Card.Content style={{ gap: 16 }}>
            <Text variant="titleLarge">
              {editingId === null
                ? 'Tambah Dompet'
                : 'Ubah Dompet'}
            </Text>

            <TextInput
              mode="outlined"
              label="Nama Dompet"
              value={name}
              onChangeText={setName}
              maxLength={50}
              placeholder="Contoh: BCA, GoPay, Dompet Harian"
            />

            <Menu
              visible={typeMenuVisible}
              onDismiss={() => setTypeMenuVisible(false)}
              anchor={
                <Button
                  mode="outlined"
                  icon="chevron-down"
                  onPress={() => setTypeMenuVisible(true)}
                >
                  Jenis: {WALLET_TYPES.find(
                    (item) => item.value === kind
                  )?.label}
                </Button>
              }
            >
              {WALLET_TYPES.map((item) => (
                <Menu.Item
                  key={item.value}
                  title={item.label}
                  onPress={() => {
                    setKind(item.value);
                    setTypeMenuVisible(false);
                  }}
                />
              ))}
            </Menu>

            <TextInput
              mode="outlined"
              label="Saldo Awal (Rp)"
              value={openingBalance}
              onChangeText={(value) => {
                setOpeningBalance(
                  value.replace(/[^0-9]/g, '')
                );
              }}
              keyboardType="number-pad"
              editable={!isOpeningBalanceLocked}
            />

            {isOpeningBalanceLocked && (
              <HelperText type="info" visible>
                Saldo awal dikunci karena dompet sudah
                digunakan dalam transaksi atau transfer.
              </HelperText>
            )}

            <Text
              variant="bodySmall"
              style={{
                color: theme.colors.onSurfaceVariant,
              }}
            >
              Gunakan saldo awal hanya untuk nominal
              yang dimiliki sebelum mulai mencatat.
              Setelah ada histori, penyesuaian dilakukan
              melalui transaksi yang dapat ditelusuri.
            </Text>

            {!!error && (
              <HelperText type="error" visible>
                {error}
              </HelperText>
            )}

            {!!message && (
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.primary }}
              >
                {message}
              </Text>
            )}

            <Button
              mode="contained"
              icon="content-save"
              loading={saving}
              disabled={saving || name.trim().length < 2}
              onPress={() => void handleSave()}
            >
              {editingId === null
                ? 'Tambah Dompet'
                : 'Simpan Perubahan'}
            </Button>

            {editingId !== null && (
              <Button
                mode="text"
                disabled={saving}
                onPress={resetForm}
              >
                Batal Mengubah
              </Button>
            )}
          </Card.Content>
        </Card>
      </ScrollView>
    </>
  );
}
