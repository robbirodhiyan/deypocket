
import type { SQLiteDatabase } from 'expo-sqlite';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS dp_schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dp_books (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL
    CHECK (kind IN ('personal', 'business')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dp_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL
    CHECK (kind IN ('cash', 'bank', 'ewallet', 'other')),
  opening_balance_rupiah INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
    CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id) REFERENCES dp_books(id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_dp_accounts_name
  ON dp_accounts(book_id, name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS dp_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  kind TEXT NOT NULL
    CHECK (kind IN ('income', 'expense')),
  name TEXT NOT NULL,
  icon TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
    CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id) REFERENCES dp_books(id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_dp_categories_name
  ON dp_categories(book_id, kind, name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS dp_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  kind TEXT NOT NULL
    CHECK (kind IN ('income', 'expense')),
  amount_rupiah INTEGER NOT NULL
    CHECK (amount_rupiah > 0),
  occurred_on TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id) REFERENCES dp_books(id)
    ON DELETE RESTRICT,
  FOREIGN KEY (account_id) REFERENCES dp_accounts(id)
    ON DELETE RESTRICT,
  FOREIGN KEY (category_id) REFERENCES dp_categories(id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_dp_transactions_date
  ON dp_transactions(book_id, occurred_on DESC);

CREATE INDEX IF NOT EXISTS ix_dp_transactions_account
  ON dp_transactions(account_id, occurred_on DESC);

CREATE INDEX IF NOT EXISTS ix_dp_transactions_category
  ON dp_transactions(category_id, occurred_on DESC);

CREATE TABLE IF NOT EXISTS dp_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  from_account_id INTEGER NOT NULL,
  to_account_id INTEGER NOT NULL,
  amount_rupiah INTEGER NOT NULL
    CHECK (amount_rupiah > 0),
  occurred_on TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id) REFERENCES dp_books(id)
    ON DELETE RESTRICT,
  FOREIGN KEY (from_account_id) REFERENCES dp_accounts(id)
    ON DELETE RESTRICT,
  FOREIGN KEY (to_account_id) REFERENCES dp_accounts(id)
    ON DELETE RESTRICT,
  CHECK (from_account_id <> to_account_id)
);

CREATE INDEX IF NOT EXISTS ix_dp_transfers_date
  ON dp_transfers(book_id, occurred_on DESC);

CREATE TABLE IF NOT EXISTS dp_budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  category_id INTEGER,
  limit_rupiah INTEGER NOT NULL
    CHECK (limit_rupiah >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id) REFERENCES dp_books(id)
    ON DELETE RESTRICT,
  FOREIGN KEY (category_id) REFERENCES dp_categories(id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_dp_budgets_total
  ON dp_budgets(book_id, month)
  WHERE category_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_dp_budgets_category
  ON dp_budgets(book_id, month, category_id)
  WHERE category_id IS NOT NULL;
`;

const DEFAULT_ACCOUNTS = [
  ['Tunai', 'cash'],
  ['Bank', 'bank'],
  ['E-Wallet', 'ewallet'],
] as const;

const DEFAULT_CATEGORIES = [
  ['expense', 'Makanan & Minuman', 'food'],
  ['expense', 'Transportasi', 'car'],
  ['expense', 'Belanja', 'shopping'],
  ['expense', 'Tagihan', 'receipt'],
  ['expense', 'Hiburan', 'movie'],
  ['expense', 'Kesehatan', 'medical'],
  ['expense', 'Pendidikan', 'school'],
  ['expense', 'Lainnya', 'dots-horizontal'],

  ['income', 'Gaji', 'cash'],
  ['income', 'Bonus', 'gift'],
  ['income', 'Usaha Sampingan', 'store'],
  ['income', 'Hadiah', 'gift-outline'],
  ['income', 'Pengembalian Dana', 'cash-refund'],
  ['income', 'Lainnya', 'dots-horizontal'],
] as const;

export async function migrateDeyPocketV3(
  db: SQLiteDatabase
): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await db.withTransactionAsync(async () => {
    await db.execAsync(SCHEMA_SQL);

    const applied = await db.getFirstAsync<{
      version: number;
    }>(
      `SELECT version
       FROM dp_schema_migrations
       WHERE version = 3`
    );

    if (!applied) {
      await db.runAsync(
        `INSERT OR IGNORE INTO dp_books
          (id, name, kind)
         VALUES (1, 'Pribadi', 'personal')`
      );

      for (const [name, kind] of DEFAULT_ACCOUNTS) {
        await db.runAsync(
          `INSERT OR IGNORE INTO dp_accounts
            (book_id, name, kind, opening_balance_rupiah)
           VALUES (1, ?, ?, 0)`,
          [name, kind]
        );
      }

      for (const [
        kind,
        name,
        icon,
      ] of DEFAULT_CATEGORIES) {
        await db.runAsync(
          `INSERT OR IGNORE INTO dp_categories
            (book_id, kind, name, icon)
           VALUES (1, ?, ?, ?)`,
          [kind, name, icon]
        );
      }

      await db.runAsync(
        `INSERT INTO dp_schema_migrations (version)
         VALUES (3)`
      );
    }
  });

  const requiredTables = [
    'dp_books',
    'dp_accounts',
    'dp_categories',
    'dp_transactions',
    'dp_transfers',
    'dp_budgets',
    'dp_schema_migrations',
  ];

  const tables = await db.getAllAsync<{ name: string }>(
    `SELECT name
     FROM sqlite_master
     WHERE type = 'table'
       AND name LIKE 'dp_%'`
  );

  const existing = new Set(tables.map((row) => row.name));

  for (const table of requiredTables) {
    if (!existing.has(table)) {
      throw new Error(
        `DeyPocket migration failed: ${table} missing`
      );
    }
  }

  const version = await db.getFirstAsync<{
    version: number;
  }>(
    `SELECT version
     FROM dp_schema_migrations
     WHERE version = 3`
  );

  if (!version) {
    throw new Error('DeyPocket migration v3 not applied');
  }
}
