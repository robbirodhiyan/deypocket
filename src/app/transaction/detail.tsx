import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
    ActivityIndicator,
    Button,
    Card,
    Text,
    useTheme,
} from 'react-native-paper';

import {
    deleteFinanceEntry,
    getEditableEntry,
    updateFinanceEntry,
    type EditableEntry,
} from '../../features/deypocket/finance-management';
import type { ActivityKind } from '../../features/deypocket/finance-repository';
import TransactionEditor, {
    type TransactionDraft,
} from '../../features/deypocket/transaction-editor';

export default function TransactionDetailScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const params = useLocalSearchParams<{ id?: string; kind?: string }>();

  const entryId = Number(params.id);
  const entryKind: ActivityKind | null =
    params.kind === 'expense' ||
    params.kind === 'income' ||
    params.kind === 'transfer'
      ? params.kind
      : null;

  const [entry, setEntry] = useState<EditableEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadEntry() {
      setLoading(true);
      setError('');
      setEntry(null);
      try {
        if (!entryKind || !Number.isSafeInteger(entryId) || entryId <= 0) {
          throw new Error('Parameter transaksi tidak valid.');
        }
        const current = await getEditableEntry(db, entryKind, entryId);
        if (!current) throw new Error('Transaksi tidak ditemukan.');
        if (active) setEntry(current);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : 'Gagal membaca transaksi.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadEntry();
    return () => {
      active = false;
    };
  }, [db, entryId, entryKind]);

  function goBackToHistory() {
    router.replace('/transactions');
  }

  async function handleSave(draft: TransactionDraft): Promise<void> {
    if (!entry) throw new Error('Transaksi tidak ditemukan.');

    if (draft.kind === 'transfer') {
      await updateFinanceEntry(db, { ...draft, id: entry.id });
    } else {
      await updateFinanceEntry(db, { ...draft, id: entry.id });
    }
    goBackToHistory();
  }

  async function handleDelete(): Promise<void> {
    if (!entry) throw new Error('Transaksi tidak ditemukan.');
    await deleteFinanceEntry(db, entry.kind, entry.id);
    goBackToHistory();
  }

  return (
    <>
      <Stack.Screen
        options={{ title: 'Detail Transaksi', headerShown: true }}
      />
      {loading ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            backgroundColor: theme.colors.background,
          }}
        >
          <ActivityIndicator size="large" />
          <Text variant="bodyMedium">Memuat detail transaksi...</Text>
        </View>
      ) : entry ? (
        <TransactionEditor
          key={`${entry.kind}-${entry.id}`}
          mode="edit"
          initialEntry={entry}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      ) : (
        <View style={{ flex: 1, padding: 20, backgroundColor: theme.colors.background }}>
          <Card mode="outlined" style={{ borderRadius: 18 }}>
            <Card.Content style={{ gap: 15 }}>
              <Text variant="titleMedium">Transaksi tidak tersedia</Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
                {error}
              </Text>
              <Button mode="contained" onPress={goBackToHistory}>
                Kembali ke histori
              </Button>
            </Card.Content>
          </Card>
        </View>
      )}
    </>
  );
}
