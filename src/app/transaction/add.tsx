import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import {
    createTransaction,
    createTransfer,
} from '../../features/deypocket/finance-repository';
import TransactionEditor, {
    type TransactionDraft,
} from '../../features/deypocket/transaction-editor';

export default function AddTransactionScreen() {
  const db = useSQLiteContext();

  async function handleSave(draft: TransactionDraft): Promise<void> {
    if (draft.kind === 'transfer') {
      await createTransfer(db, draft);
    } else {
      await createTransaction(db, draft);
    }

    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Tambah Transaksi',
          headerShown: true,
        }}
      />
      <TransactionEditor mode="add" onSave={handleSave} />
    </>
  );
}
