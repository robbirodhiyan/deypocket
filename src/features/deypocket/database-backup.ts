import type { SQLiteDatabase } from 'expo-sqlite';
import * as SQLite from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** BACKUP EXPORT + RESTORE PREFLIGHT. It does NOT replace the live DB. */
export type BackupInspection = { bytes: number; tables: number; integrity: string; appTables: string[] };
const MAX_FILE_BYTES = 150 * 1024 * 1024;
function isSQLite(bytes: Uint8Array): boolean {
  const magic = [83,81,76,105,116,101,32,102,111,114,109,97,116,32,51,0];
  return bytes.length >= 100 && magic.every((v,i) => bytes[i] === v);
}

export async function inspectDatabaseBytes(bytes: Uint8Array): Promise<BackupInspection> {
  if (bytes.length > MAX_FILE_BYTES) throw new Error('File backup terlalu besar untuk pemeriksaan aman.');
  if (!isSQLite(bytes)) throw new Error('File bukan database SQLite yang valid.');
  const staging = await SQLite.deserializeDatabaseAsync(bytes);
  try {
    const status = await staging.getFirstAsync<{integrity_check: string}>('PRAGMA integrity_check');
    if (!status || status.integrity_check !== 'ok') throw new Error('Integritas backup tidak valid.');
    const tables = await staging.getAllAsync<{name:string}>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );
    if (!tables.length) throw new Error('Backup tidak berisi tabel aplikasi.');
    return {
      bytes: bytes.length, tables: tables.length, integrity:'ok',
      appTables: tables.map(t=>t.name),
    };
  } finally {
    await staging.closeAsync();
  }
}

/** Exports a raw, UNENCRYPTED SQLite backup. User must store it privately. */
export async function shareDatabaseBackup(db: SQLiteDatabase): Promise<BackupInspection> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Berbagi file tidak tersedia pada perangkat ini.');
  const data = await db.serializeAsync();
  const report = await inspectDatabaseBytes(data);
  const timestamp = new Date().toISOString().replace(/[:.]/g,'-');
  const target = new File(Paths.cache, `DeyPocket-${timestamp}.sqlite`);
  await target.write(data);
  await Sharing.shareAsync(target.uri, { mimeType:'application/vnd.sqlite3', dialogTitle:'Simpan backup DeyPocket' });
  return report;
}

/** Selection and validation only; NEVER overwrites live storage. */
export async function selectAndInspectBackup(): Promise<BackupInspection | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*', copyToCacheDirectory: true, multiple:false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new Error('File tidak ditemukan.');
  if (asset.size && asset.size > MAX_FILE_BYTES) throw new Error('File melebihi batas 150 MB.');
  const file = new File(asset.uri);
  return inspectDatabaseBytes(await file.bytes());
}
