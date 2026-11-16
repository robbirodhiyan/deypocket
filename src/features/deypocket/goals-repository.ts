import type { SQLiteDatabase } from 'expo-sqlite';

export type GoalEntryKind = 'deposit' | 'withdrawal';

export type SavingsGoal = {
  id: number;
  title: string;
  target_rupiah: number;
  target_date: string | null;
  note: string;
  archived_at: string | null;
  created_at: string;
  saved_rupiah: number;
  entry_count: number;
};

export type GoalEntry = {
  id: number;
  goal_id: number;
  kind: GoalEntryKind;
  amount_rupiah: number;
  occurred_on: string;
  note: string;
  created_at: string;
};

export type GoalInput = {
  title: string;
  targetRupiah: number;
  targetDate: string | null;
  note: string;
};

const MAX_AMOUNT = 999_999_999_999;

function validMoney(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_AMOUNT;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function ensureGoalsSchema(db: SQLiteDatabase): Promise<void> {
  // Idempotent: tidak menyentuh tabel finance yang sudah ada.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS dp_savings_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      target_rupiah INTEGER NOT NULL CHECK(target_rupiah > 0),
      target_date TEXT,
      note TEXT NOT NULL DEFAULT '',
      archived_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dp_goal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL REFERENCES dp_savings_goals(id) ON DELETE RESTRICT,
      kind TEXT NOT NULL CHECK(kind IN ('deposit', 'withdrawal')),
      amount_rupiah INTEGER NOT NULL CHECK(amount_rupiah > 0),
      occurred_on TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dp_goal_entries_goal
      ON dp_goal_entries(goal_id, occurred_on DESC, id DESC);
  `);
}

const GOAL_SELECT = `
  SELECT g.id, g.title, g.target_rupiah, g.target_date, g.note,
         g.archived_at, g.created_at,
         COALESCE((SELECT SUM(CASE WHEN e.kind = 'deposit'
           THEN e.amount_rupiah ELSE -e.amount_rupiah END)
           FROM dp_goal_entries e WHERE e.goal_id = g.id), 0) AS saved_rupiah,
         (SELECT COUNT(*) FROM dp_goal_entries e WHERE e.goal_id = g.id) AS entry_count
  FROM dp_savings_goals g
`;

export async function getSavingsGoals(db: SQLiteDatabase, archived = false): Promise<SavingsGoal[]> {
  await ensureGoalsSchema(db);
  return db.getAllAsync<SavingsGoal>(
    `${GOAL_SELECT} WHERE g.archived_at IS ${archived ? 'NOT NULL' : 'NULL'} ORDER BY g.created_at DESC, g.id DESC`
  );
}

export async function getSavingsGoal(db: SQLiteDatabase, id: number): Promise<SavingsGoal | null> {
  await ensureGoalsSchema(db);
  return db.getFirstAsync<SavingsGoal>(`${GOAL_SELECT} WHERE g.id = ?`, [id]);
}

function validateGoal(input: GoalInput): GoalInput {
  const title = input.title.trim();
  const note = input.note.trim();
  if (title.length < 2 || title.length > 60) throw new Error('Nama target harus 2–60 karakter.');
  if (!validMoney(input.targetRupiah)) throw new Error('Nominal target tidak valid.');
  if (input.targetDate && !validDate(input.targetDate)) throw new Error('Tanggal harus valid (YYYY-MM-DD).');
  if (note.length > 250) throw new Error('Catatan maksimal 250 karakter.');
  return { ...input, title, note, targetDate: input.targetDate || null };
}

export async function saveSavingsGoal(db: SQLiteDatabase, input: GoalInput, id?: number): Promise<void> {
  await ensureGoalsSchema(db);
  const data = validateGoal(input);
  if (id === undefined) {
    await db.runAsync(
      `INSERT INTO dp_savings_goals (title, target_rupiah, target_date, note, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [data.title, data.targetRupiah, data.targetDate, data.note, new Date().toISOString()]
    );
  } else {
    const result = await db.runAsync(
      `UPDATE dp_savings_goals SET title = ?, target_rupiah = ?, target_date = ?, note = ?
       WHERE id = ? AND archived_at IS NULL`,
      [data.title, data.targetRupiah, data.targetDate, data.note, id]
    );
    if (!result.changes) throw new Error('Target tidak ditemukan atau sudah diarsipkan.');
  }
}

export async function setGoalArchived(db: SQLiteDatabase, id: number, archived: boolean): Promise<void> {
  await ensureGoalsSchema(db);
  const result = await db.runAsync(
    'UPDATE dp_savings_goals SET archived_at = ? WHERE id = ?',
    [archived ? new Date().toISOString() : null, id]
  );
  if (!result.changes) throw new Error('Target tidak ditemukan.');
}

export async function getGoalEntries(db: SQLiteDatabase, id: number): Promise<GoalEntry[]> {
  await ensureGoalsSchema(db);
  return db.getAllAsync<GoalEntry>(
    'SELECT * FROM dp_goal_entries WHERE goal_id = ? ORDER BY occurred_on DESC, id DESC', [id]
  );
}

export async function addGoalEntry(
  db: SQLiteDatabase,
  goalId: number,
  kind: GoalEntryKind,
  amount: number,
  occurredOn: string,
  note: string
): Promise<void> {
  await ensureGoalsSchema(db);
  if (kind !== 'deposit' && kind !== 'withdrawal') throw new Error('Jenis alokasi tidak valid.');
  if (!validMoney(amount)) throw new Error('Nominal harus lebih dari nol.');
  if (!validDate(occurredOn)) throw new Error('Tanggal alokasi tidak valid.');
  if (note.trim().length > 250) throw new Error('Catatan maksimal 250 karakter.');

  await db.withTransactionAsync(async () => {
    const goal = await db.getFirstAsync<{ archived_at: string | null }>(
      'SELECT archived_at FROM dp_savings_goals WHERE id = ?', [goalId]
    );
    if (!goal || goal.archived_at) throw new Error('Target tidak aktif.');
    const balance = await db.getFirstAsync<{ saved: number }>(
      `SELECT COALESCE(SUM(CASE WHEN kind = 'deposit' THEN amount_rupiah
       ELSE -amount_rupiah END), 0) AS saved FROM dp_goal_entries WHERE goal_id = ?`, [goalId]
    );
    if (kind === 'withdrawal' && amount > (balance?.saved ?? 0)) {
      throw new Error('Pengurangan melebihi alokasi yang tersedia.');
    }
    await db.runAsync(
      `INSERT INTO dp_goal_entries (goal_id, kind, amount_rupiah, occurred_on, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [goalId, kind, amount, occurredOn, note.trim(), new Date().toISOString()]
    );
  });
}

/**
 * Hapus permanen hanya untuk target tanpa riwayat sama sekali.
 * Satu perintah DELETE atomik mencegah penghapusan target yang memiliki
 * setoran atau pengurangan, termasuk jika saldo akhirnya kembali Rp0.
 * Tidak ada operasi CASCADE atau perubahan pada tabel transaksi utama.
 */
export async function deleteSavingsGoal(db: SQLiteDatabase, id: number): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('ID target tidak valid.');
  }

  await ensureGoalsSchema(db);

  const result = await db.runAsync(
    `DELETE FROM dp_savings_goals
     WHERE id = ?
       AND NOT EXISTS (
         SELECT 1
         FROM dp_goal_entries
         WHERE goal_id = dp_savings_goals.id
       )`,
    [id]
  );

  if (result.changes > 0) return;

  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM dp_savings_goals WHERE id = ?',
    [id]
  );

  if (!row) throw new Error('Target sudah tidak ditemukan.');
  throw new Error('Target tidak dapat dihapus permanen karena sudah memiliki riwayat setoran/pengurangan. Gunakan Arsipkan.');
}
