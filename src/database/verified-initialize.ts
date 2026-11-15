
import type { SQLiteDatabase } from 'expo-sqlite';

import { initializeDatabase } from './initialize';
import { validateDatabaseSchema } from './validate-schema';

// ============================================================
// INITIALIZE + VALIDATE SQLITE DATABASE
// ============================================================

export async function initializeVerifiedDatabase(
  db: SQLiteDatabase
): Promise<void> {
  // Jalankan seluruh migrasi yang sudah ada.
  await initializeDatabase(db);

  // Verifikasi schema setelah migrasi berhasil.
  await validateDatabaseSchema(db);

  if (__DEV__) {
    console.log(
      '[DeyKit] SQLite migration and schema validation OK'
    );
  }
}
