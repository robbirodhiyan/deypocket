
import type { SQLiteDatabase } from 'expo-sqlite';

// ============================================================
// DEBIYAN SQLITE SCHEMA VALIDATOR
// ============================================================

type TableRow = {
  name: string;
};

type ColumnRow = {
  name: string;
};

export type SchemaValidationResult = {
  valid: boolean;
  tables: string[];
};

// Schema dasar DeyKit sampai migration v2.
const REQUIRED_SCHEMA: Record<string, string[]> = {
  items: [
    'id',
    'name',
    'sku',
    'created_at',
    'updated_at',
  ],
  app_settings: [],
};

export async function validateDatabaseSchema(
  db: SQLiteDatabase
): Promise<SchemaValidationResult> {
  // ----------------------------------------------------------
  // 1. Check required tables
  // ----------------------------------------------------------

  const rows = await db.getAllAsync<TableRow>(
    `SELECT name
     FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'`
  );

  const existingTables = new Set(
    rows.map((row) => row.name)
  );

  for (const tableName of Object.keys(REQUIRED_SCHEMA)) {
    if (!existingTables.has(tableName)) {
      throw new Error(
        `[SQLite] Required table missing: ${tableName}`
      );
    }
  }

  // ----------------------------------------------------------
  // 2. Check required columns
  // ----------------------------------------------------------

  for (const [tableName, requiredColumns] of
    Object.entries(REQUIRED_SCHEMA)) {
    // Table names berasal dari konstanta internal,
    // bukan input pengguna.
    const columns = await db.getAllAsync<ColumnRow>(
      `PRAGMA table_info("${tableName}")`
    );

    const existingColumns = new Set(
      columns.map((column) => column.name)
    );

    for (const columnName of requiredColumns) {
      if (!existingColumns.has(columnName)) {
        throw new Error(
          `[SQLite] Missing column: ${tableName}.${columnName}`
        );
      }
    }
  }

  return {
    valid: true,
    tables: Object.keys(REQUIRED_SCHEMA),
  };
}
