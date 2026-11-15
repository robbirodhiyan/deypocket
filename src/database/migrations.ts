
import Constants from 'expo-constants';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

/**
 * ============================================================
 * DATABASE CONFIGURATION
 * ============================================================
 *
 * Nama database diambil dari:
 *
 * project.config.json
 *        ↓
 * app.config.ts
 *        ↓
 * expo.extra.project.databaseName
 *
 * Fallback untuk menjaga kompatibilitas database lama.
 */

const configuredDatabaseName: unknown =
  Constants.expoConfig?.extra?.project?.databaseName;

export const DATABASE_NAME: string =
  typeof configuredDatabaseName === 'string' &&
  /^[a-zA-Z0-9_-]+\.db$/.test(configuredDatabaseName)
    ? configuredDatabaseName
    : 'appbuilder.db';

/**
 * Versi khusus Migration V1.
 *
 * Jangan mengubahnya menjadi 2 atau lebih.
 * Migration berikutnya dikelola oleh initialize.ts.
 */
export const DATABASE_VERSION = 1;

/**
 * ============================================================
 * DATABASE MIGRATION V1
 * ============================================================
 *
 * Membuat tabel:
 * - items
 *
 * Fitur:
 * - SQLite offline
 * - Foreign key enforcement
 * - WAL mode pada Android / iOS
 * - Kompatibel dengan Expo Web
 * - Aman dijalankan berulang kali
 * - Tidak menghapus data lama
 * - Tidak menurunkan versi database
 */

export async function migrateDbIfNeeded(
  db: SQLiteDatabase
): Promise<void> {
  /**
   * 1. DATABASE CONFIGURATION
   */

  await db.execAsync('PRAGMA foreign_keys = ON;');

  if (Platform.OS !== 'web') {
    await db.execAsync('PRAGMA journal_mode = WAL;');
  }

  /**
   * 2. CHECK DATABASE VERSION
   */

  const result = await db.getFirstAsync<{
    user_version: number;
  }>('PRAGMA user_version;');

  if (!result) {
    throw new Error(
      '[SQLite] Gagal membaca versi database.'
    );
  }

  const currentVersion = result.user_version;

  /**
   * 3. SKIP EXISTING MIGRATION
   *
   * Jika database sudah V1, V2, V3, dst.,
   * jangan menjalankan ulang Migration V1.
   *
   * Pemeriksaan versi maksimum dilakukan
   * oleh initializeDatabase().
   */

  if (currentVersion >= DATABASE_VERSION) {
    console.log(
      `[SQLite] Migration V1 skipped. Current v${currentVersion}`
    );

    return;
  }

  /**
   * 4. EXECUTE DATABASE MIGRATION V1
   */

  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sku TEXT NOT NULL COLLATE NOCASE UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_items_name
      ON items(name);
    `);

    /**
     * 5. UPDATE DATABASE VERSION
     *
     * Dilakukan setelah SQL migration berhasil.
     */

    await db.execAsync(
      `PRAGMA user_version = ${DATABASE_VERSION};`
    );
  });

  /**
   * 6. MIGRATION LOG
   */

  console.log(
    `[SQLite] Migration v${currentVersion} -> v${DATABASE_VERSION} OK`
  );
}
