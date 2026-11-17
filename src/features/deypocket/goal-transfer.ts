import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { createTransfer } from './finance-repository';
import { getWallets } from './finance-management';
import { getGoalWalletLinks } from './goal-wallet-repository';
import { ensureGoalsSchema } from './goals-repository';

/**
 * Sprint 9: atomic transfer + savings-goal ledger entry.
 * This uses the existing finance-repository.createTransfer implementation;
 * it never constructs or guesses the finance SQL schema.
 * Android / iOS only. No web fallback: an exclusive transaction is required.
 */

export type GoalTransferInput = {
  goalId: number;
  fromWalletId: number;
  amountRupiah: number;
  occurredOn: string;
  note: string;
  operationId: string;
};

export type GoalTransferRecord = {
  id: number;
  goal_entry_id: number;
  goal_id: number;
  from_wallet_id: number;
  to_wallet_id: number;
  amount_rupiah: number;
  occurred_on: string;
  created_at: string;
};

const MAX_RUPIAH = 999_999_999_999;

function isValidDate(value: string): boolean {
  const found = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!found) return false;
  const year = Number(found[1]);
  const month = Number(found[2]);
  const day = Number(found[3]);
  if (year < 2000 || year > 2100) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function validId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/** Used once per save attempt; reuse the same id if reattempting an uncertain request. */
export function newGoalTransferOperationId(): string {
  const entropy = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return `goal-transfer-${Date.now().toString(36)}-${entropy}`;
}

/**
 * A transaction-bound SQLiteDatabase interface for *existing* helpers that
 * already wrap writes in db.withTransactionAsync(). Nested transactions are
 * flattened to the caller-owned exclusive transaction, NEVER opened again.
 * All reads/writes still execute using Expo's txn connection.
 */
function createTransactionBoundDatabase(txn: SQLiteDatabase): SQLiteDatabase {
  let facade!: SQLiteDatabase;
  facade = new Proxy(txn, {
    get(target, property) {
      if (property === 'withTransactionAsync') {
        return async (work: () => Promise<unknown>) => { await work(); };
      }
      if (property === 'withExclusiveTransactionAsync') {
        return async (work: (connection: SQLiteDatabase) => Promise<unknown>) => {
          await work(facade);
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as SQLiteDatabase;
  return facade;
}

async function ensureTransferRecords(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS dp_goal_transfer_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id TEXT NOT NULL UNIQUE,
      goal_entry_id INTEGER NOT NULL UNIQUE
        REFERENCES dp_goal_entries(id) ON DELETE RESTRICT,
      goal_id INTEGER NOT NULL,
      from_wallet_id INTEGER NOT NULL,
      to_wallet_id INTEGER NOT NULL,
      amount_rupiah INTEGER NOT NULL CHECK (amount_rupiah > 0),
      occurred_on TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dp_goal_transfer_records_goal
      ON dp_goal_transfer_records(goal_id, occurred_on DESC, id DESC);
  `);
}

export async function transferToSavingsGoal(
  db: SQLiteDatabase,
  input: GoalTransferInput
): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw new Error('Transfer target terintegrasi tersedia pada aplikasi Android/iOS, bukan web.');
  }
  if (!validId(input.goalId) || !validId(input.fromWalletId)) {
    throw new Error('Target atau rekening asal tidak valid.');
  }
  if (!Number.isSafeInteger(input.amountRupiah) || input.amountRupiah <= 0 || input.amountRupiah > MAX_RUPIAH) {
    throw new Error('Nominal transfer tidak valid.');
  }
  if (!isValidDate(input.occurredOn)) throw new Error('Tanggal transfer tidak valid.');
  if (input.note.trim().length > 250) throw new Error('Keterangan maksimal 250 karakter.');
  if (!/^goal-transfer-[A-Za-z0-9-]{12,120}$/.test(input.operationId)) {
    throw new Error('Identitas operasi transfer tidak valid.');
  }

  // Idempotent schema initialization OUTSIDE the transaction.
  await ensureGoalsSchema(db);
  await getGoalWalletLinks(db);
  await getWallets(db);
  await ensureTransferRecords(db);

  await db.withExclusiveTransactionAsync(async (txn) => {
    // Pass every query through txn (including queries inside createTransfer).
    const atomicDb = createTransactionBoundDatabase(txn as unknown as SQLiteDatabase);

    const duplicate = await atomicDb.getFirstAsync<{ id: number }>(
      'SELECT id FROM dp_goal_transfer_records WHERE operation_id = ?',
      [input.operationId]
    );
    if (duplicate) {
      throw new Error('Transfer ini sudah tercatat. Periksa riwayat sebelum mencoba lagi.');
    }

    const goal = await atomicDb.getFirstAsync<{ title: string; archived_at: string | null }>(
      'SELECT title, archived_at FROM dp_savings_goals WHERE id = ?',
      [input.goalId]
    );
    if (!goal || goal.archived_at !== null) throw new Error('Target tidak ditemukan atau sudah diarsipkan.');

    const link = await atomicDb.getFirstAsync<{ wallet_id: number }>(
      'SELECT wallet_id FROM dp_goal_wallet_links WHERE goal_id = ?',
      [input.goalId]
    );
    if (!link || !validId(link.wallet_id)) {
      throw new Error('Target belum memiliki rekening tujuan. Hubungkan rekening terlebih dahulu.');
    }
    if (input.fromWalletId === link.wallet_id) {
      throw new Error('Rekening asal dan rekening target harus berbeda.');
    }

    const wallets = await getWallets(atomicDb);
    const source = wallets.find(item => item.id === input.fromWalletId);
    const destination = wallets.find(item => item.id === link.wallet_id);
    if (!source || !destination) throw new Error('Rekening asal atau rekening target tidak ditemukan.');
    if (!Number.isSafeInteger(source.balance_rupiah) || source.balance_rupiah < input.amountRupiah) {
      throw new Error('Saldo rekening asal tidak mencukupi untuk transfer ini.');
    }

    const transferNote = `Tabungan: ${goal.title}`.slice(0, 200);
    // IMPORTANT: reuse DeyPocket's existing finance business logic.
    // Its optional nested transaction wrappers are flattened by atomicDb.
    const transferDraft = {
      kind: 'transfer' as const,
      fromAccountId: input.fromWalletId,
      toAccountId: link.wallet_id,
      amountRupiah: input.amountRupiah,
      occurredOn: input.occurredOn,
      note: transferNote,
    };
    await createTransfer(atomicDb, transferDraft);

    const entryNote = input.note.trim()
      ? `Transfer dari ${source.name}: ${input.note.trim()}`
      : `Transfer dari ${source.name}`;
    const createdAt = new Date().toISOString();
    const inserted = await atomicDb.runAsync(
      `INSERT INTO dp_goal_entries
         (goal_id, kind, amount_rupiah, occurred_on, note, created_at)
       VALUES (?, 'deposit', ?, ?, ?, ?)`,
      [input.goalId, input.amountRupiah, input.occurredOn, entryNote.slice(0, 250), createdAt]
    );
    if (!validId(inserted.lastInsertRowId)) throw new Error('Gagal mendapatkan ID setoran target.');

    await atomicDb.runAsync(
      `INSERT INTO dp_goal_transfer_records
         (operation_id, goal_entry_id, goal_id, from_wallet_id,
          to_wallet_id, amount_rupiah, occurred_on, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.operationId, inserted.lastInsertRowId, input.goalId,
       input.fromWalletId, link.wallet_id, input.amountRupiah,
       input.occurredOn, createdAt]
    );
  });
}

/** An audit view; does not join against the finance transfer schema. */
export async function getGoalTransferRecords(
  db: SQLiteDatabase,
  goalId: number
): Promise<GoalTransferRecord[]> {
  if (!validId(goalId)) throw new Error('ID target tidak valid.');
  await ensureGoalsSchema(db);
  await ensureTransferRecords(db);
  return db.getAllAsync<GoalTransferRecord>(
    `SELECT id, goal_entry_id, goal_id, from_wallet_id,
            to_wallet_id, amount_rupiah, occurred_on, created_at
     FROM dp_goal_transfer_records
     WHERE goal_id = ? ORDER BY occurred_on DESC, id DESC`,
    [goalId]
  );
}


/**
 * Ambil dari target yang terhubung: transfer balik + ledger withdrawal.
 * Tidak mengubah setoran lama; riwayat mencatat pengambilan terpisah.
 * Gagal pada salah satu query membatalkan seluruh transaksi.
 */
export type GoalWithdrawalInput = {
  goalId: number;
  toWalletId: number;
  amountRupiah: number;
  occurredOn: string;
  note: string;
  operationId: string;
};

export async function withdrawFromSavingsGoal(
  db: SQLiteDatabase,
  input: GoalWithdrawalInput
): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw new Error('Pengambilan dari rekening target hanya tersedia pada Android/iOS.');
  }
  if (!validId(input.goalId) || !validId(input.toWalletId)) {
    throw new Error('Target atau rekening tujuan tidak valid.');
  }
  if (!Number.isSafeInteger(input.amountRupiah) || input.amountRupiah <= 0 || input.amountRupiah > MAX_RUPIAH) {
    throw new Error('Nominal pengambilan tidak valid.');
  }
  if (!isValidDate(input.occurredOn)) throw new Error('Tanggal pengambilan tidak valid.');
  if (input.note.trim().length > 250) throw new Error('Keterangan maksimal 250 karakter.');
  if (!/^goal-transfer-[A-Za-z0-9-]{12,120}$/.test(input.operationId)) {
    throw new Error('Identitas transaksi tidak valid.');
  }

  await ensureGoalsSchema(db);
  await getGoalWalletLinks(db);
  await getWallets(db);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS dp_goal_withdrawal_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id TEXT NOT NULL UNIQUE,
      goal_entry_id INTEGER NOT NULL UNIQUE REFERENCES dp_goal_entries(id) ON DELETE RESTRICT,
      goal_id INTEGER NOT NULL,
      from_wallet_id INTEGER NOT NULL,
      to_wallet_id INTEGER NOT NULL,
      amount_rupiah INTEGER NOT NULL CHECK(amount_rupiah > 0),
      occurred_on TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dp_goal_withdrawal_records_goal
      ON dp_goal_withdrawal_records(goal_id, occurred_on DESC, id DESC);
  `);

  await db.withExclusiveTransactionAsync(async (txn) => {
    const atomicDb = createTransactionBoundDatabase(txn as unknown as SQLiteDatabase);
    const duplicate = await atomicDb.getFirstAsync<{ id: number }>(
      'SELECT id FROM dp_goal_withdrawal_records WHERE operation_id = ?',
      [input.operationId]
    );
    if (duplicate) throw new Error('Pengambilan ini sudah tercatat. Periksa riwayat dahulu.');

    const goal = await atomicDb.getFirstAsync<{ title: string; archived_at: string | null }>(
      'SELECT title, archived_at FROM dp_savings_goals WHERE id = ?', [input.goalId]
    );
    if (!goal || goal.archived_at) throw new Error('Target tidak aktif.');
    const linked = await atomicDb.getFirstAsync<{ wallet_id: number }>(
      'SELECT wallet_id FROM dp_goal_wallet_links WHERE goal_id = ?', [input.goalId]
    );
    if (!linked || !validId(linked.wallet_id)) throw new Error('Rekening target belum terhubung.');
    if (linked.wallet_id === input.toWalletId) throw new Error('Rekening tujuan harus berbeda dari rekening tabungan.');

    const saved = await atomicDb.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(CASE WHEN kind = 'deposit' THEN amount_rupiah
         ELSE -amount_rupiah END), 0) AS total
       FROM dp_goal_entries WHERE goal_id = ?`, [input.goalId]
    );
    if (!Number.isSafeInteger(saved?.total) || (saved?.total ?? 0) < input.amountRupiah) {
      throw new Error('Nominal pengambilan melebihi tabungan yang tercatat.');
    }

    const wallets = await getWallets(atomicDb);
    const source = wallets.find(item => item.id === linked.wallet_id);
    const target = wallets.find(item => item.id === input.toWalletId);
    if (!source || !target) throw new Error('Rekening tabungan atau tujuan tidak ditemukan.');
    if (!Number.isSafeInteger(source.balance_rupiah) || source.balance_rupiah < input.amountRupiah) {
      throw new Error('Saldo rekening tabungan tidak mencukupi.');
    }

    await createTransfer(atomicDb, {
      kind: 'transfer',
      fromAccountId: linked.wallet_id,
      toAccountId: input.toWalletId,
      amountRupiah: input.amountRupiah,
      occurredOn: input.occurredOn,
      note: `Ambil tabungan: ${goal.title}`.slice(0, 200),
    });

    const createdAt = new Date().toISOString();
    const note = input.note.trim()
      ? `Ambil ke ${target.name}: ${input.note.trim()}`
      : `Ambil ke ${target.name}`;
    const result = await atomicDb.runAsync(
      `INSERT INTO dp_goal_entries
         (goal_id, kind, amount_rupiah, occurred_on, note, created_at)
       VALUES (?, 'withdrawal', ?, ?, ?, ?)`,
      [input.goalId, input.amountRupiah, input.occurredOn, note.slice(0, 250), createdAt]
    );
    if (!validId(result.lastInsertRowId)) throw new Error('Catatan pengambilan gagal disimpan.');

    await atomicDb.runAsync(
      `INSERT INTO dp_goal_withdrawal_records
        (operation_id, goal_entry_id, goal_id, from_wallet_id,
         to_wallet_id, amount_rupiah, occurred_on, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.operationId, result.lastInsertRowId, input.goalId, linked.wallet_id,
       input.toWalletId, input.amountRupiah, input.occurredOn, createdAt]
    );
  });
}
