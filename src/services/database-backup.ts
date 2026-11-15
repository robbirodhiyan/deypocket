
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

export async function exportDatabaseBackup(
  db: SQLiteDatabase
): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw new Error(
      'Export backup saat ini hanya tersedia pada Android/iOS.'
    );
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(
      'Fitur berbagi file tidak tersedia di perangkat ini.'
    );
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

  const filename = `debiyan-backup-${timestamp}.db`;

  // Database tujuan sementara, terpisah dari database aktif.
  const backupDb = await SQLite.openDatabaseAsync(filename);

  try {
    // Menghasilkan salinan SQLite yang konsisten.
    await SQLite.backupDatabaseAsync({
      sourceDatabase: db,
      sourceDatabaseName: 'main',
      destDatabase: backupDb,
      destDatabaseName: 'main',
    });
  } finally {
    await backupDb.closeAsync();
  }

  // Salin hasil backup ke cache agar bisa dibagikan.
  const sourceFile = new File(
    SQLite.defaultDatabaseDirectory,
    filename
  );

  const shareFile = new File(Paths.cache, filename);

  await sourceFile.copy(shareFile);

  // Pengguna menentukan sendiri lokasi penyimpanan backup.
  await Sharing.shareAsync(shareFile.uri, {
    dialogTitle: 'Simpan Backup SQLite',
    mimeType: 'application/octet-stream',
  });
}
