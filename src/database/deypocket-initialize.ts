
import type { SQLiteDatabase } from 'expo-sqlite';

import { migrateDeyPocketV3 } from './migrations-v3';
import { initializeVerifiedDatabase } from './verified-initialize';

export async function initializeDeyPocketDatabase(
  db: SQLiteDatabase
): Promise<void> {
  // 1. Jalankan migration dan schema validator DeyKit.
  await initializeVerifiedDatabase(db);

  // 2. Tambahkan schema keuangan DeyPocket.
  await migrateDeyPocketV3(db);

  // 3. Periksa integritas relasi.
  const foreignKeyErrors = await db.getAllAsync(
    'PRAGMA foreign_key_check'
  );

  if (foreignKeyErrors.length > 0) {
    throw new Error(
      'DeyPocket database foreign key check failed'
    );
  }
}
