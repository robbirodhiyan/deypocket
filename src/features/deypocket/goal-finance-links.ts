import type { SQLiteDatabase } from 'expo-sqlite';
import type { GoalMovementDirection } from './goal-finance-contract';

/** Additional linkage metadata; never changes finance/account balances. */
export type GoalFinanceLink = {
  goal_entry_id: number;
  goal_id: number;
  direction: GoalMovementDirection;
  finance_reference: string;
  operation_id: string;
  created_at: string;
};

export async function ensureGoalFinanceLinksSchema(db: SQLiteDatabase): Promise<void> {
  // dp_goal_entries must already exist (Sprint 7+); do not touch legacy data.
  const base = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='dp_goal_entries'`
  );
  if (!base) throw new Error('Skema Target belum tersedia. Inisialisasi Goals dahulu.');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS dp_goal_finance_links (
      goal_entry_id INTEGER PRIMARY KEY NOT NULL REFERENCES dp_goal_entries(id) ON DELETE RESTRICT,
      goal_id INTEGER NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('deposit','withdrawal')),
      finance_reference TEXT NOT NULL UNIQUE,
      operation_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dp_goal_finance_links_goal
      ON dp_goal_finance_links(goal_id);
  `);
}

/** Call only inside caller-owned atomic transaction; schema must exist. */
export async function insertGoalFinanceLinkTxn(
  txn: SQLiteDatabase,
  value: GoalFinanceLink
): Promise<void> {
  if (!Number.isSafeInteger(value.goal_entry_id) || value.goal_entry_id <= 0 ||
      !Number.isSafeInteger(value.goal_id) || value.goal_id <= 0 ||
      !value.finance_reference.trim() || !value.operation_id.trim()) {
    throw new Error('Referensi jurnal Target tidak lengkap.');
  }
  const entry = await txn.getFirstAsync<{
    id: number; goal_id: number; kind: string;
  }>('SELECT id, goal_id, kind FROM dp_goal_entries WHERE id = ?', [value.goal_entry_id]);
  if (!entry || entry.goal_id !== value.goal_id || entry.kind !== value.direction) {
    throw new Error('Catatan Target tidak sesuai dengan referensi transaksi.');
  }
  await txn.runAsync(
    `INSERT INTO dp_goal_finance_links
      (goal_entry_id, goal_id, direction, finance_reference, operation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [value.goal_entry_id, value.goal_id, value.direction,
     value.finance_reference, value.operation_id, value.created_at]
  );
}

export async function getGoalFinanceLinks(db: SQLiteDatabase, goalId?: number): Promise<GoalFinanceLink[]> {
  const exists = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='dp_goal_finance_links'`
  );
  if (!exists) return [];
  if (goalId === undefined) {
    return db.getAllAsync<GoalFinanceLink>(
      'SELECT * FROM dp_goal_finance_links ORDER BY goal_entry_id DESC'
    );
  }
  if (!Number.isSafeInteger(goalId) || goalId <= 0) throw new Error('ID target tidak valid.');
  return db.getAllAsync<GoalFinanceLink>(
    'SELECT * FROM dp_goal_finance_links WHERE goal_id=? ORDER BY goal_entry_id DESC', [goalId]
  );
}
