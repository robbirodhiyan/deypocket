
import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_VERSION_V2 = 2;

/**
 * Database Migration V2
 *
 * Menambahkan tabel:
 * - app_settings
 *
 * Tidak mengubah atau menghapus data items.
 */
export async function migrateDatabaseV2(
  db: SQLiteDatabase
): Promise<void> {
  // Baca versi database.
  const result = await db.getFirstAsync<{
    user_version: number;
  }>('PRAGMA user_version;');

  if (!result) {
    throw new Error(
      '[SQLite] Gagal membaca versi database untuk V2.'
    );
  }

  const currentVersion = result.user_version;

  // Migration V2 tidak dijalankan jika
  // database sudah versi 2 atau lebih tinggi.
  if (currentVersion >= DATABASE_VERSION_V2) {
    console.log(
      `[SQLite] Migration V2 skipped. Current v${currentVersion}`
    );
    return;
  }

  // V1 wajib selesai sebelum menjalankan V2.
  if (currentVersion < 1) {
    throw new Error(
      '[SQLite] Migration V1 harus dijalankan terlebih dahulu.'
    );
  }

  // Jalankan migration V2 secara transaksional.
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Update versi jika migration berhasil.
    await db.execAsync(
      `PRAGMA user_version = ${DATABASE_VERSION_V2};`
    );
  });

  console.log(
    `[SQLite] Migration v${currentVersion} -> v${DATABASE_VERSION_V2} OK`
  );
}
