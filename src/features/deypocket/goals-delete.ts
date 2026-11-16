import type { SQLiteDatabase } from 'expo-sqlite';
import { ensureGoalsSchema } from './goals-repository';

/**
 * Permanently delete a savings goal and its allocation history.
 * Goal allocations are independent of wallet transactions.
 * SQLite transaction prevents orphan entries / partial deletion.
 */
export async function deleteSavingsGoal(db: SQLiteDatabase, goalId: number): Promise<void> {
  if (!Number.isSafeInteger(goalId) || goalId <= 0) {
    throw new Error('ID target tidak valid.');
  }
  await ensureGoalsSchema(db);
  await db.withTransactionAsync(async () => {
    const goal = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM dp_savings_goals WHERE id = ?', [goalId]
    );
    if (!goal) throw new Error('Target sudah tidak ditemukan.');
    // dp_goal_entries has ON DELETE RESTRICT; delete child records first.
    await db.runAsync('DELETE FROM dp_goal_entries WHERE goal_id = ?', [goalId]);
    const result = await db.runAsync('DELETE FROM dp_savings_goals WHERE id = ?', [goalId]);
    if (result.changes !== 1) throw new Error('Gagal menghapus target.');
  });
}
