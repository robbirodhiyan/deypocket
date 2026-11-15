
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

const SUPPORTED_VERSION = 2;

const BACKUP_OPTIONS = {
  sourceDatabaseName: 'main',
  destDatabaseName: 'main',
};

async function validateDatabase(
  db: SQLiteDatabase
): Promise<void> {
  const version = await db.getFirstAsync<{
    user_version: number;
  }>('PRAGMA user_version');

  if (version?.user_version !== SUPPORTED_VERSION) {
    throw new Error(
      `Backup harus menggunakan schema v${SUPPORTED_VERSION}.`
    );
  }

  const tables = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table'
       AND name IN ('items', 'app_settings')`
  );

  const tableNames = new Set(tables.map((row) => row.name));

  if (
    !tableNames.has('items') ||
    !tableNames.has('app_settings')
  ) {
    throw new Error(
      'Struktur database tidak sesuai dengan Debiyan Builder.'
    );
  }

  const itemColumns = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(items)'
  );

  const columnNames = new Set(
    itemColumns.map((column) => column.name)
  );

  for (const required of [
    'id',
    'name',
    'sku',
    'created_at',
    'updated_at',
  ]) {
    if (!columnNames.has(required)) {
      throw new Error(
        `Kolom wajib tidak ditemukan: ${required}`
      );
    }
  }

  const integrity = await db.getAllAsync<{
    integrity_check: string;
  }>('PRAGMA integrity_check');

  if (
    integrity.length !== 1 ||
    integrity[0]?.integrity_check !== 'ok'
  ) {
    throw new Error(
      'Integritas database tidak valid.'
    );
  }
}

export async function restoreDatabaseBackup(
  activeDb: SQLiteDatabase
): Promise<boolean> {
  if (Platform.OS !== 'android') {
    throw new Error(
      'Restore saat ini hanya didukung pada Android.'
    );
  }

  const selection = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    multiple: false,
    copyToCacheDirectory: true,
  });

  if (selection.canceled) {
    return false;
  }

  const selected = selection.assets[0];

  if (
    !selected ||
    !/^debiyan-backup-.*\.db$/i.test(selected.name)
  ) {
    throw new Error(
      'Pilih file .db hasil Export Backup Debiyan Builder.'
    );
  }

  const uniqueId =
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const stagingName = `restore-staging-${uniqueId}.db`;
  const safetyName = `restore-safety-${uniqueId}.db`;

  let stagingDb: SQLiteDatabase | null = null;
  let safetyDb: SQLiteDatabase | null = null;

  let safetyReady = false;
  let restoreStarted = false;
  let restoreSucceeded = false;
  let rollbackSucceeded = false;

  try {
    // Jangan mengubah database aktif saat validasi file.
    const sourceFile = new File(selected.uri);

    const stagingFile = new File(
      SQLite.defaultDatabaseDirectory,
      stagingName
    );

    await sourceFile.copy(stagingFile);

    stagingDb = await SQLite.openDatabaseAsync(stagingName);

    await validateDatabase(stagingDb);

    // Snapshot database aktif sebelum mengganti data.
    safetyDb = await SQLite.openDatabaseAsync(safetyName);

    await SQLite.backupDatabaseAsync({
      ...BACKUP_OPTIONS,
      sourceDatabase: activeDb,
      destDatabase: safetyDb,
    });

    await safetyDb.closeAsync();
    safetyDb = null;

    safetyReady = true;

    // Restore: salin backup terpilih ke database aktif.
    restoreStarted = true;

    await SQLite.backupDatabaseAsync({
      ...BACKUP_OPTIONS,
      sourceDatabase: stagingDb,
      destDatabase: activeDb,
    });

    await validateDatabase(activeDb);

    restoreSucceeded = true;
    return true;
  } catch (error) {
    // Jika restore sudah dimulai, coba kembalikan
    // database asli dari safety snapshot.
    if (restoreStarted && safetyReady) {
      let rollbackDb: SQLiteDatabase | null = null;

      try {
        rollbackDb = await SQLite.openDatabaseAsync(
          safetyName
        );

        await SQLite.backupDatabaseAsync({
          ...BACKUP_OPTIONS,
          sourceDatabase: rollbackDb,
          destDatabase: activeDb,
        });

        await validateDatabase(activeDb);

        rollbackSucceeded = true;
      } catch {
        throw new Error(
          'Restore dan pemulihan otomatis gagal. ' +
          `Safety backup tersimpan sebagai ${safetyName}. ` +
          'Jangan uninstall atau menghapus data aplikasi.'
        );
      } finally {
        await rollbackDb?.closeAsync().catch(() => {});
      }
    }

    throw error;
  } finally {
    await stagingDb?.closeAsync().catch(() => {});
    await safetyDb?.closeAsync().catch(() => {});

    await SQLite.deleteDatabaseAsync(
      stagingName
    ).catch(() => {});

    // Pertahankan snapshot jika rollback gagal.
    if (
      !safetyReady ||
      restoreSucceeded ||
      rollbackSucceeded
    ) {
      await SQLite.deleteDatabaseAsync(
        safetyName
      ).catch(() => {});
    }
  }
}
