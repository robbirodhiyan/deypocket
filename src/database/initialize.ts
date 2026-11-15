
import type { SQLiteDatabase } from 'expo-sqlite';

import { migrateDbIfNeeded } from './migrations';
import { migrateDatabaseV2 } from './migrations-v2';

export const LATEST_DATABASE_VERSION = 2;

export async function initializeDatabase(
  db: SQLiteDatabase
): Promise<void> {
  const result = await db.getFirstAsync<{
    user_version: number;
  }>('PRAGMA user_version;');

  if (!result) {
    throw new Error(
      '[SQLite] Gagal membaca versi database.'
    );
  }

  const currentVersion = result.user_version;

  // Cegah aplikasi lama membuka database versi lebih baru.
  if (currentVersion > LATEST_DATABASE_VERSION) {
    throw new Error(
      `Database v${currentVersion} lebih baru dari aplikasi.`
    );
  }

  // Jalankan migration berurutan.
  await migrateDbIfNeeded(db);
  await migrateDatabaseV2(db);

  // Validasi versi akhir.
  const finalResult = await db.getFirstAsync<{
    user_version: number;
  }>('PRAGMA user_version;');

  if (
    finalResult?.user_version !==
    LATEST_DATABASE_VERSION
  ) {
    throw new Error(
      '[SQLite] Database migration belum selesai.'
    );
  }

  console.log(
    `[SQLite] Database initialized successfully. Version: ${LATEST_DATABASE_VERSION}`
  );
}
