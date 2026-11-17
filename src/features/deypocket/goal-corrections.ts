import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { ensureGoalsSchema, localDate } from './goals-repository';

/**
 * Sprint 11 — pembatalan jurnal Target *manual* dengan jurnal kebalikan.
 * - Tidak mengedit/menghapus dp_goal_entries lama.
 * - Tidak memanggil fungsi finance, tidak mengubah saldo rekening.
 * - Catatan yang memiliki referensi transfer rekening tidak boleh dibatalkan di sini.
 * - Satu catatan hanya dapat dibatalkan sekali, dilindungi UNIQUE di SQLite.
 */

export type GoalCorrectionStatus = 'cancelled' | 'reversal';
export type GoalCorrectionMap = Record<number, GoalCorrectionStatus>;

type Entry = {
  id: number;
  goal_id: number;
  kind: 'deposit' | 'withdrawal';
  amount_rupiah: number;
  occurred_on: string;
  note: string;
};

type TxnConnection = Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>;

function validId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export async function ensureGoalCorrectionsSchema(db: SQLiteDatabase): Promise<void> {
  await ensureGoalsSchema(db);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS dp_goal_entry_corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_entry_id INTEGER NOT NULL UNIQUE
        REFERENCES dp_goal_entries(id) ON DELETE RESTRICT,
      reversal_entry_id INTEGER NOT NULL UNIQUE
        REFERENCES dp_goal_entries(id) ON DELETE RESTRICT,
      goal_id INTEGER NOT NULL
        REFERENCES dp_savings_goals(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      CHECK (original_entry_id <> reversal_entry_id)
    );
    CREATE INDEX IF NOT EXISTS idx_dp_goal_entry_corrections_goal
      ON dp_goal_entry_corrections(goal_id);
  `);
}

/** Status yang ditampilkan pada tiap baris riwayat. */
export async function getGoalCorrectionMap(
  db: SQLiteDatabase,
  goalId: number
): Promise<GoalCorrectionMap> {
  if (!validId(goalId)) throw new Error('ID target tidak valid.');
  await ensureGoalCorrectionsSchema(db);
  const rows = await db.getAllAsync<{
    original_entry_id: number;
    reversal_entry_id: number;
  }>(
    `SELECT original_entry_id, reversal_entry_id
     FROM dp_goal_entry_corrections WHERE goal_id = ?`,
    [goalId]
  );
  const map: GoalCorrectionMap = {};
  for (const row of rows) {
    map[row.original_entry_id] = 'cancelled';
    map[row.reversal_entry_id] = 'reversal';
  }
  return map;
}

async function hasLinkedFinanceRecord(
  db: TxnConnection,
  entryId: number
): Promise<boolean> {
  // Tabel lama bersifat opsional. Nama tabel tetap hardcoded.
  const available = await db.getFirstAsync<{ has_deposit: number; has_withdrawal: number }>(
    `SELECT
       EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'dp_goal_transfer_records') AS has_deposit,
       EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'dp_goal_withdrawal_records') AS has_withdrawal`
  );
  if (available?.has_deposit) {
    const linked = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM dp_goal_transfer_records WHERE goal_entry_id = ? LIMIT 1',
      [entryId]
    );
    if (linked) return true;
  }
  if (available?.has_withdrawal) {
    const linked = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM dp_goal_withdrawal_records WHERE goal_entry_id = ? LIMIT 1',
      [entryId]
    );
    if (linked) return true;
  }
  return false;
}

/**
 * Membatalkan *satu* entri manual dengan entri kebalikan senilai sama.
 * Pengurangan deposito hanya dapat dilakukan jika neto sesudahnya >= 0.
 * Semua validasi ulang terjadi dalam transaksi native eksklusif.
 */
export async function cancelManualGoalEntry(
  db: SQLiteDatabase,
  goalId: number,
  entryId: number
): Promise<void> {
  if (!validId(goalId) || !validId(entryId)) {
    throw new Error('Target atau catatan tidak valid.');
  }
  await ensureGoalCorrectionsSchema(db);

  const work = async (txn: TxnConnection): Promise<void> => {
    const goal = await txn.getFirstAsync<{ id: number; archived_at: string | null }>(
      'SELECT id, archived_at FROM dp_savings_goals WHERE id = ?',
      [goalId]
    );
    if (!goal) throw new Error('Target tidak ditemukan.');
    if (goal.archived_at !== null) {
      throw new Error('Aktifkan kembali target dari Arsip sebelum membatalkan catatan.');
    }

    const original = await txn.getFirstAsync<Entry>(
      `SELECT id, goal_id, kind, amount_rupiah, occurred_on, note
       FROM dp_goal_entries WHERE id = ? AND goal_id = ?`,
      [entryId, goalId]
    );
    if (!original) throw new Error('Catatan sudah tidak ditemukan.');
    if (original.kind !== 'deposit' && original.kind !== 'withdrawal') {
      throw new Error('Jenis catatan tidak dikenal.');
    }
    if (!Number.isSafeInteger(original.amount_rupiah) || original.amount_rupiah <= 0) {
      throw new Error('Nominal catatan tidak valid.');
    }

    const reversed = await txn.getFirstAsync<{ id: number }>(
      `SELECT id FROM dp_goal_entry_corrections
       WHERE original_entry_id = ? OR reversal_entry_id = ? LIMIT 1`,
      [entryId, entryId]
    );
    if (reversed) throw new Error('Catatan ini sudah dibatalkan atau merupakan jurnal pembatalan.');

    if (await hasLinkedFinanceRecord(txn, entryId)) {
      throw new Error('Catatan dari transfer rekening tidak dapat dibatalkan manual. Gunakan fitur transaksi terintegrasi.');
    }

    const balance = await txn.getFirstAsync<{ saved: number }>(
      `SELECT COALESCE(SUM(CASE WHEN kind = 'deposit' THEN amount_rupiah
         ELSE -amount_rupiah END), 0) AS saved
       FROM dp_goal_entries WHERE goal_id = ?`,
      [goalId]
    );
    if (!Number.isSafeInteger(balance?.saved) || (balance?.saved ?? 0) < 0) {
      throw new Error('Jumlah catatan target tidak konsisten. Jalankan pemeriksaan terlebih dahulu.');
    }
    if (original.kind === 'deposit' && (balance?.saved ?? 0) < original.amount_rupiah) {
      throw new Error('Setoran ini tidak dapat dibatalkan karena sebagian dananya sudah digunakan. Periksa pengambilan setelah setoran tersebut.');
    }

    const reverseKind = original.kind === 'deposit' ? 'withdrawal' : 'deposit';
    const createdAt = new Date().toISOString();
    const referenceNote = original.kind === 'deposit' ? 'setoran' : 'pengambilan';
    const label = `Koreksi: batalkan ${referenceNote} manual #${original.id}`;
    const inserted = await txn.runAsync(
      `INSERT INTO dp_goal_entries
         (goal_id, kind, amount_rupiah, occurred_on, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [goalId, reverseKind, original.amount_rupiah, localDate(), label, createdAt]
    );
    if (!validId(inserted.lastInsertRowId)) {
      throw new Error('Gagal menyimpan jurnal koreksi.');
    }

    // UNIQUE constraints protect against duplicate reversals even after retries.
    await txn.runAsync(
      `INSERT INTO dp_goal_entry_corrections
         (original_entry_id, reversal_entry_id, goal_id, created_at)
       VALUES (?, ?, ?, ?)`,
      [entryId, inserted.lastInsertRowId, goalId, createdAt]
    );
  };

  if (Platform.OS === 'web') {
    // Web does not support exclusive transaction. Local-development fallback.
    await db.withTransactionAsync(async () => work(db));
  } else {
    await db.withExclusiveTransactionAsync(async (txn) => work(txn));
  }
}
