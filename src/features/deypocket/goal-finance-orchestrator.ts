import type { SQLiteDatabase } from 'expo-sqlite';
import { assertGoalMovement, type GoalFinanceMovement, type FinanceTransferAdapter } from './goal-finance-contract';
import { ensureGoalFinanceLinksSchema, insertGoalFinanceLinkTxn } from './goal-finance-links';

/**
 * Sprint 16: atomic coordinator. NOT attached to existing screens until the
 * actual finance-repository adapter can produce a stable transaction ID.
 * Calling createTransfer() that returns void is forbidden here.
 */
export async function postLinkedGoalMovement(
  db: SQLiteDatabase,
  adapter: FinanceTransferAdapter,
  input: GoalFinanceMovement
): Promise<{ goalEntryId: number; financeReference: string }> {
  assertGoalMovement(input);
  await ensureGoalFinanceLinksSchema(db);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS dp_goal_finance_operations (
      operation_id TEXT PRIMARY KEY NOT NULL,
      goal_entry_id INTEGER NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
  `);
  let created: { goalEntryId: number; financeReference: string } | null = null;

  // All finance writes must use txn and must NOT open nested transactions.
  await db.withExclusiveTransactionAsync(async txn => {
    const already = await txn.getFirstAsync<{ operation_id: string }>(
      'SELECT operation_id FROM dp_goal_finance_operations WHERE operation_id=?', [input.operationId]
    );
    if (already) throw new Error('Operasi sudah tercatat; jangan ulangi transaksi.');
    const goal = await txn.getFirstAsync<{title: string; archived_at: string|null}>(
      'SELECT title, archived_at FROM dp_savings_goals WHERE id=?', [input.goalId]
    );
    if (!goal || goal.archived_at !== null) throw new Error('Target tidak aktif.');
    const linked = await txn.getFirstAsync<{wallet_id:number}>(
      'SELECT wallet_id FROM dp_goal_wallet_links WHERE goal_id=?', [input.goalId]
    );
    if (!linked) throw new Error('Target belum ditautkan ke rekening.');
    if (linked.wallet_id === input.walletId) throw new Error('Rekening asal dan tujuan harus berbeda.');

    const fromId = input.direction === 'deposit' ? input.walletId : linked.wallet_id;
    const toId = input.direction === 'deposit' ? linked.wallet_id : input.walletId;
    const balance = await adapter.getWalletBalance(txn, fromId);
    if (!Number.isSafeInteger(balance) || balance < input.amountRupiah) {
      throw new Error('Saldo rekening asal tidak mencukupi.');
    }
    if (input.direction === 'withdrawal') {
      const s = await txn.getFirstAsync<{saved:number|null}>(
        `SELECT COALESCE(SUM(CASE WHEN kind='deposit' THEN amount_rupiah ELSE -amount_rupiah END),0) AS saved
         FROM dp_goal_entries WHERE goal_id=?`, [input.goalId]
      );
      if ((s?.saved ?? 0) < input.amountRupiah) throw new Error('Saldo Target tidak mencukupi.');
    }

    const ref = await adapter.createTransferWithReference(txn, {
      fromAccountId: fromId, toAccountId: toId,
      amountRupiah: input.amountRupiah, occurredOn: input.occurredOn,
      note: `Target ${goal.title}: ${input.note}`.slice(0,200),
    });
    if (typeof ref !== 'string' || ref.trim().length < 1 || ref.length > 160) {
      throw new Error('Repository transaksi tidak mengembalikan ID yang stabil. Seluruh operasi dibatalkan.');
    }
    const stamp = new Date().toISOString();
    const saved = await txn.runAsync(
      `INSERT INTO dp_goal_entries (goal_id,kind,amount_rupiah,occurred_on,note,created_at)
       VALUES (?,?,?,?,?,?)`,
      [input.goalId,input.direction,input.amountRupiah,input.occurredOn,input.note,stamp]
    );
    const entryId = saved.lastInsertRowId;
    if (!Number.isSafeInteger(entryId) || entryId <= 0) throw new Error('ID jurnal Target gagal dibuat.');
    await insertGoalFinanceLinkTxn(txn, {
      goal_entry_id:entryId, goal_id:input.goalId, direction:input.direction,
      finance_reference:ref,operation_id:input.operationId,created_at:stamp
    });
    await txn.runAsync('INSERT INTO dp_goal_finance_operations VALUES(?,?,?)',
      [input.operationId,entryId,stamp]);
    created = {goalEntryId:entryId,financeReference:ref};
  });
  if (!created) throw new Error('Operasi belum dikonfirmasi oleh database.');
  return created;
}
