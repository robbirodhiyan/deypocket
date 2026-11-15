import { Platform } from 'react-native';
import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

/**
 * Sprint 4C — Backup / Restore data DeyPocket.
 * - Tidak mengubah schema atau nama database.
 * - Tidak membuka database kedua (menggunakan SQLiteProvider yang sudah ada).
 * - Restore atomik, menolak skema yang berbeda, dan mengecek foreign key.
 * - Backup adalah JSON tanpa enkripsi: simpan di lokasi tepercaya.
 */

const FORMAT = 'deypocket.sqlite-json';
const FORMAT_VERSION = 1;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TABLES = 100;
const MAX_ROWS = 150_000;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

type BackupValue = string | number | null | { blobBase64: string };

type BackupTable = {
  name: string;
  createSql: string;
  columns: string[];
  rows: BackupValue[][];
};

type BackupDocument = {
  format: typeof FORMAT;
  version: typeof FORMAT_VERSION;
  createdAt: string;
  schemaVersion: number;
  tables: BackupTable[];
  totalRows: number;
};

type TableShape = Omit<BackupTable, 'rows'>;

type SqlExecutor = Pick<SQLiteDatabase, 'execAsync' | 'getAllAsync' | 'getFirstAsync' | 'runAsync'>;

export type RestorePreview = {
  createdAt: string;
  totalRows: number;
  tableCount: number;
  schemaVersion: number;
  /** Jangan ubah dokumen ini secara manual; hasil validasi tidak boleh diedit. */
  document: BackupDocument;
};

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function quoted(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function encodeBase64(bytes: Uint8Array): string {
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const hasB = i + 1 < bytes.length;
    const hasC = i + 2 < bytes.length;
    const b = hasB ? bytes[i + 1] : 0;
    const c = hasC ? bytes[i + 2] : 0;
    output += B64[a >> 2];
    output += B64[((a & 3) << 4) | (b >> 4)];
    output += hasB ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    output += hasC ? B64[c & 63] : '=';
  }
  return output;
}

function decodeBase64(text: string): Uint8Array {
  assert(text.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text),
    'File backup berisi data BLOB yang tidak valid.');
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((text.length / 4) * 3 - padding);
  let pos = 0;
  for (let i = 0; i < text.length; i += 4) {
    const a = B64.indexOf(text[i]);
    const b = B64.indexOf(text[i + 1]);
    const c = text[i + 2] === '=' ? 0 : B64.indexOf(text[i + 2]);
    const d = text[i + 3] === '=' ? 0 : B64.indexOf(text[i + 3]);
    bytes[pos++] = (a << 2) | (b >> 4);
    if (pos < bytes.length) bytes[pos++] = ((b & 15) << 4) | (c >> 2);
    if (pos < bytes.length) bytes[pos++] = ((c & 3) << 6) | d;
  }
  return bytes;
}

function encodeValue(value: unknown): BackupValue {
  if (value === null || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Uint8Array) return { blobBase64: encodeBase64(value) };
  return fail('Ada tipe data SQLite yang tidak didukung dalam backup.');
}

function validateValue(value: unknown): value is BackupValue {
  if (value === null || typeof value === 'string') return true;
  if (typeof value === 'number' && Number.isFinite(value)) return true;
  return (
    isRecord(value) &&
    Object.keys(value).length === 1 &&
    typeof value.blobBase64 === 'string' &&
    value.blobBase64.length <= MAX_FILE_BYTES * 2 &&
    value.blobBase64.length % 4 === 0 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.blobBase64)
  );
}

function decodeValue(value: BackupValue): SQLiteBindValue {
  if (value !== null && typeof value === 'object') {
    return decodeBase64(value.blobBase64);
  }
  return value;
}

async function readSchema(db: SqlExecutor): Promise<{
  schemaVersion: number;
  tables: TableShape[];
}> {
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const candidates = await db.getAllAsync<{ name: string; sql: string | null }>(
    "SELECT name, sql FROM sqlite_master " +
    "WHERE type = 'table' AND name NOT GLOB 'sqlite_*' " +
    "AND name <> 'android_metadata' ORDER BY name ASC"
  );
  assert(candidates.length > 0, 'Database masih kosong atau migrasi belum selesai.');
  assert(candidates.length <= MAX_TABLES, 'Jumlah tabel database melebihi batas backup.');

  const tables: TableShape[] = [];
  for (const candidate of candidates) {
    assert(typeof candidate.sql === 'string' && candidate.sql.length > 0,
      `Definisi tabel ${candidate.name} tidak didukung.`);
    // PRAGMA table_info hanya mengembalikan kolom yang dapat ditulis.
    const columns = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(${quoted(candidate.name)})`
    );
    assert(columns.length > 0, `Tabel ${candidate.name} tidak memiliki kolom biasa.`);
    tables.push({
      name: candidate.name,
      createSql: candidate.sql,
      columns: columns.map((item) => item.name),
    });
  }
  return { schemaVersion: version?.user_version ?? 0, tables };
}

function parseBackup(json: string): BackupDocument {
  assert(json.length > 0 && json.length <= MAX_FILE_BYTES,
    'Ukuran atau isi backup tidak valid (maksimum 20 MB).');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return fail('File tidak berisi JSON backup yang valid.');
  }
  assert(isRecord(parsed), 'Format file backup tidak valid.');
  assert(parsed.format === FORMAT && parsed.version === FORMAT_VERSION,
    'File bukan backup DeyPocket dengan format yang didukung.');
  assert(typeof parsed.createdAt === 'string' && Number.isFinite(Date.parse(parsed.createdAt)),
    'Tanggal backup tidak valid.');
  assert(typeof parsed.schemaVersion === 'number' && Number.isSafeInteger(parsed.schemaVersion),
    'Versi skema backup tidak valid.');
  assert(typeof parsed.totalRows === 'number' && Number.isSafeInteger(parsed.totalRows) && parsed.totalRows >= 0,
    'Total baris backup tidak valid.');
  assert(Array.isArray(parsed.tables) && parsed.tables.length > 0 && parsed.tables.length <= MAX_TABLES,
    'Daftar tabel backup tidak valid.');

  const seen = new Set<string>();
  let total = 0;
  for (const rawTable of parsed.tables as unknown[]) {
    assert(isRecord(rawTable), 'Ada struktur tabel backup yang tidak valid.');
    assert(typeof rawTable.name === 'string' && rawTable.name.length > 0 && !seen.has(rawTable.name),
      'Terdapat nama tabel kosong atau duplikat pada backup.');
    seen.add(rawTable.name);
    assert(typeof rawTable.createSql === 'string' && rawTable.createSql.length > 0,
      'Definisi tabel backup tidak valid.');
    assert(Array.isArray(rawTable.columns) && rawTable.columns.length > 0 &&
      rawTable.columns.every((column: unknown) => typeof column === 'string' && column.length > 0) &&
      new Set(rawTable.columns).size === rawTable.columns.length,
    'Daftar kolom backup tidak valid.');
    assert(Array.isArray(rawTable.rows), 'Data baris tabel backup tidak valid.');
    total += rawTable.rows.length;
    assert(total <= MAX_ROWS, `Backup melebihi ${MAX_ROWS.toLocaleString('id-ID')} baris.`);
    for (const row of rawTable.rows as unknown[]) {
      assert(Array.isArray(row) && row.length === rawTable.columns.length && row.every(validateValue),
        `Ada isi baris yang tidak valid pada tabel ${rawTable.name}.`);
    }
  }
  assert(total === parsed.totalRows, 'Total baris tidak cocok dengan metadata backup.');
  return parsed as BackupDocument;
}

async function checkCompatibility(db: SqlExecutor, document: BackupDocument): Promise<void> {
  const live = await readSchema(db);
  assert(live.schemaVersion === document.schemaVersion,
    `Versi database berbeda. Backup: ${document.schemaVersion}, perangkat: ${live.schemaVersion}.`);
  assert(live.tables.length === document.tables.length,
    'Jumlah tabel tidak cocok. Gunakan versi aplikasi dan migrasi yang sama.');
  for (let i = 0; i < live.tables.length; i++) {
    const current = live.tables[i];
    const restored = document.tables[i];
    assert(current.name === restored.name && current.createSql === restored.createSql &&
      JSON.stringify(current.columns) === JSON.stringify(restored.columns),
      `Skema tabel ${current.name} berbeda. Restore dibatalkan demi keamanan data.`);
  }
}

export async function createBackup(db: SQLiteDatabase): Promise<{ fileName: string; json: string; totalRows: number }> {
  let result: BackupDocument | null = null;
  // Membaca semua tabel dalam satu transaksi agar snapshot konsisten.
  await db.withTransactionAsync(async () => {
    const { schemaVersion, tables: definitions } = await readSchema(db);
    const tables: BackupTable[] = [];
    let totalRows = 0;
    for (const table of definitions) {
      const selection = table.columns.map(quoted).join(', ');
      const rows = await db.getAllAsync<Record<string, unknown>>(
        `SELECT ${selection} FROM ${quoted(table.name)}`
      );
      totalRows += rows.length;
      assert(totalRows <= MAX_ROWS, `Jumlah data melebihi ${MAX_ROWS.toLocaleString('id-ID')} baris.`);
      tables.push({
        ...table,
        rows: rows.map((row) => table.columns.map((column) => encodeValue(row[column]))),
      });
    }
    result = {
      format: FORMAT,
      version: FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      schemaVersion,
      tables,
      totalRows,
    };
  });
  assert(result, 'Gagal membuat backup.');
  const document: BackupDocument = result;
  const json = JSON.stringify(document);
  assert(json.length <= MAX_FILE_BYTES,
    'Ukuran backup melebihi batas 20 MB. Ekspor tidak dilakukan.');
  const fileName = `DeyPocket-backup-${document.createdAt.slice(0, 10)}-${document.createdAt.slice(11, 19).replace(/:/g, '-')}.json`;
  return { fileName, json, totalRows: document.totalRows };
}

export async function inspectBackup(db: SQLiteDatabase, json: string): Promise<RestorePreview> {
  const document = parseBackup(json);
  await checkCompatibility(db, document);
  return {
    createdAt: document.createdAt,
    totalRows: document.totalRows,
    tableCount: document.tables.length,
    schemaVersion: document.schemaVersion,
    document,
  };
}

/** Topological ordering: parent rows first for inserts, children first for deletes. */
async function orderTablesByForeignKeys(tx: SqlExecutor, tables: BackupTable[]): Promise<BackupTable[]> {
  const lookup = new Map(tables.map((table) => [table.name, table]));
  const state = new Map<string, 'visiting' | 'done'>();
  const ordered: BackupTable[] = [];

  async function visit(table: BackupTable): Promise<void> {
    const status = state.get(table.name);
    if (status === 'done') return;
    assert(status !== 'visiting',
      `Database memiliki relasi tabel melingkar (${table.name}); restore otomatis tidak didukung.`);
    state.set(table.name, 'visiting');
    const parents = await tx.getAllAsync<{ table: string }>(
      `PRAGMA foreign_key_list(${quoted(table.name)})`
    );
    for (const parent of parents) {
      if (parent.table === table.name) continue; // self-reference ditangani SQLite.
      const dependency = lookup.get(parent.table);
      if (dependency) await visit(dependency);
    }
    state.set(table.name, 'done');
    ordered.push(table);
  }

  for (const table of tables) await visit(table);
  return ordered;
}

export async function restoreBackup(db: SQLiteDatabase, preview: RestorePreview): Promise<void> {
  // Ulangi validasi terhadap database aktif tepat sebelum penulisan.
  await checkCompatibility(db, preview.document);

  const restoreInsideTransaction = async (tx: SqlExecutor) => {
    // Penundaan constraint memperbolehkan pemulihan tabel yang saling berelasi.
    await tx.execAsync('PRAGMA defer_foreign_keys = ON;');
    const insertOrder = await orderTablesByForeignKeys(tx, preview.document.tables);
    for (const table of [...insertOrder].reverse()) {
      await tx.runAsync(`DELETE FROM ${quoted(table.name)}`);
    }
    for (const table of insertOrder) {
      const sql = `INSERT INTO ${quoted(table.name)} (${table.columns.map(quoted).join(', ')}) ` +
        `VALUES (${table.columns.map(() => '?').join(', ')})`;
      for (const row of table.rows) {
        await tx.runAsync(sql, row.map(decodeValue));
      }
    }
    // Periksa seluruh tabel setelah seluruh trigger/relasi selesai berjalan.
    for (const table of preview.document.tables) {
      const count = await tx.getFirstAsync<{ total: number }>(
        `SELECT COUNT(*) AS total FROM ${quoted(table.name)}`
      );
      assert(count?.total === table.rows.length,
        `Jumlah data tabel ${table.name} berubah ketika restore.`);
    }
    const fkErrors = await tx.getAllAsync('PRAGMA foreign_key_check');
    assert(fkErrors.length === 0,
      'Hubungan antar tabel tidak valid. Semua perubahan dibatalkan.');
    const quick = await tx.getFirstAsync<{ quick_check: string }>('PRAGMA quick_check');
    assert(quick?.quick_check === 'ok',
      'Pemeriksaan integritas SQLite gagal. Semua perubahan dibatalkan.');
  };

  if (Platform.OS === 'web') {
    // Expo SQLite belum mendukung withExclusiveTransactionAsync pada web.
    await db.withTransactionAsync(async () => restoreInsideTransaction(db));
  } else {
    await db.withExclusiveTransactionAsync(async (txn) => restoreInsideTransaction(txn));
  }
}

export async function saveBackupFile(fileName: string, json: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    return;
  }
  const available = await Sharing.isAvailableAsync();
  assert(available, 'Fitur berbagi file tidak tersedia pada perangkat ini.');
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  await file.write(json);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Simpan backup DeyPocket',
  });
}

export async function pickBackupFile(): Promise<{ name: string; json: string } | null> {
  const selected = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    multiple: false,
    copyToCacheDirectory: true,
    base64: false,
  });
  if (selected.canceled) return null;
  const asset = selected.assets[0];
  assert(asset && asset.name.toLowerCase().endsWith('.json'),
    'Pilih berkas backup DeyPocket berekstensi .json.');
  if (asset.size !== undefined) {
    assert(asset.size > 0 && asset.size <= MAX_FILE_BYTES,
      'Ukuran backup harus lebih dari 0 dan tidak melebihi 20 MB.');
  }
  let json: string;
  if (Platform.OS === 'web') {
    // FileList adalah hasil asli input browser saat tersedia.
    const browserFile = selected.output?.item(0);
    json = browserFile ? await browserFile.text() : await (await fetch(asset.uri)).text();
  } else {
    json = await new File(asset.uri).text();
  }
  assert(json.length > 0 && json.length <= MAX_FILE_BYTES,
    'Ukuran atau isi backup tidak valid (maksimum 20 MB).');
  return { name: asset.name, json };
}
