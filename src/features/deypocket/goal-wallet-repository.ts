import type { SQLiteDatabase } from 'expo-sqlite';
import { getWallets } from './finance-management';
import { ensureGoalsSchema } from './goals-repository';

export type GoalWalletLinks = Record<number, number>;

function validId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0;
}

async function ensureLinkTable(db: SQLiteDatabase): Promise<void> {
  await ensureGoalsSchema(db);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS dp_goal_wallet_links (
      goal_id INTEGER PRIMARY KEY NOT NULL
        REFERENCES dp_savings_goals(id) ON DELETE CASCADE,
      wallet_id INTEGER NOT NULL UNIQUE,
      updated_at TEXT NOT NULL
    );
  `);
  // Clean up legacy orphans on databases where FK enforcement was disabled.
  // Never delete actual wallets or goal entries.
  await db.runAsync(`
    DELETE FROM dp_goal_wallet_links
    WHERE NOT EXISTS (
      SELECT 1 FROM dp_savings_goals AS g
      WHERE g.id = dp_goal_wallet_links.goal_id
    )
  `);
}

/** Metadata only: does not modify account balance or goal contributions. */
export async function getGoalWalletLinks(db: SQLiteDatabase): Promise<GoalWalletLinks> {
  await ensureLinkTable(db);
  const rows = await db.getAllAsync<{ goal_id: number; wallet_id: number }>(
    'SELECT goal_id, wallet_id FROM dp_goal_wallet_links'
  );
  const result: GoalWalletLinks = {};
  for (const row of rows) result[row.goal_id] = row.wallet_id;
  return result;
}

/**
 * Link at most one wallet to a goal, and at most one goal to a wallet.
 * Wallet balance is displayed independently of the manual goal ledger.
 */
export async function setGoalWalletLink(
  db: SQLiteDatabase,
  goalId: number,
  walletId: number | null
): Promise<void> {
  if (!validId(goalId)) throw new Error('ID target tidak valid.');
  if (walletId !== null && !validId(walletId)) throw new Error('ID rekening tidak valid.');
  await ensureLinkTable(db);

  const goal = await db.getFirstAsync<{ id: number; archived_at: string | null }>(
    'SELECT id, archived_at FROM dp_savings_goals WHERE id = ?', [goalId]
  );
  if (!goal) throw new Error('Target tidak ditemukan.');
  if (goal.archived_at) throw new Error('Aktifkan target sebelum mengubah rekening terkait.');

  if (walletId === null) {
    await db.runAsync('DELETE FROM dp_goal_wallet_links WHERE goal_id = ?', [goalId]);
    return;
  }

  const wallets = await getWallets(db);
  if (!wallets.some(item => item.id === walletId)) {
    throw new Error('Rekening tidak tersedia. Periksa daftar Dompet & Rekening.');
  }

  const other = await db.getFirstAsync<{ goal_id: number }>(
    'SELECT goal_id FROM dp_goal_wallet_links WHERE wallet_id = ? AND goal_id <> ?',
    [walletId, goalId]
  );
  if (other) {
    throw new Error('Rekening ini sudah terhubung ke target lain. Gunakan rekening berbeda.');
  }

  try {
    await db.runAsync(
      `INSERT INTO dp_goal_wallet_links (goal_id, wallet_id, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(goal_id) DO UPDATE SET
         wallet_id = excluded.wallet_id,
         updated_at = excluded.updated_at`,
      [goalId, walletId, new Date().toISOString()]
    );
  } catch (err) {
    // Another user/action may have bound this wallet after the pre-check.
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      throw new Error('Rekening sudah digunakan target lain. Muat ulang dan pilih rekening berbeda.');
    }
    throw err;
  }
}
