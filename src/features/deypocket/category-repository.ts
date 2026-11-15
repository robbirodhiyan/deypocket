
import type { SQLiteDatabase } from 'expo-sqlite';

import type {
    TransactionKind,
} from './finance-repository';

const BOOK_ID = 1;

export type ManagedCategory = {
  id: number;
  kind: TransactionKind;
  name: string;
  icon: string | null;
  is_active: number;
  transaction_count: number;
  budget_count: number;
};

export type CategoryInput = {
  kind: TransactionKind;
  name: string;
  icon: string;
};

function assertId(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('ID kategori tidak valid.');
  }
}

function assertKind(kind: string): void {
  if (kind !== 'income' && kind !== 'expense') {
    throw new Error('Jenis kategori tidak valid.');
  }
}

function normalizeName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ');

  if (name.length < 2 || name.length > 50) {
    throw new Error(
      'Nama kategori harus 2 sampai 50 karakter.'
    );
  }

  return name;
}

function normalizeIcon(value: string): string {
  const icon = value.trim();

  if (!/^[a-z0-9-]{2,50}$/.test(icon)) {
    throw new Error('Ikon kategori tidak valid.');
  }

  return icon;
}

function normalizeError(error: unknown): Error {
  if (
    error instanceof Error &&
    error.message.includes('UNIQUE constraint failed')
  ) {
    return new Error(
      'Nama kategori sudah digunakan untuk jenis transaksi ini.'
    );
  }

  return error instanceof Error
    ? error
    : new Error('Operasi kategori gagal.');
}

// =====================================================
// READ CATEGORIES
// =====================================================

export async function getManagedCategories(
  db: SQLiteDatabase
): Promise<ManagedCategory[]> {
  return db.getAllAsync<ManagedCategory>(
    `
    SELECT
      c.id,
      c.kind,
      c.name,
      c.icon,
      c.is_active,

      (
        SELECT COUNT(*)
        FROM dp_transactions t
        WHERE t.category_id = c.id
          AND t.book_id = c.book_id
      ) AS transaction_count,

      (
        SELECT COUNT(*)
        FROM dp_budgets b
        WHERE b.category_id = c.id
          AND b.book_id = c.book_id
      ) AS budget_count

    FROM dp_categories c

    WHERE c.book_id = ?

    ORDER BY
      c.kind,
      c.is_active DESC,
      c.name COLLATE NOCASE ASC
    `,
    [BOOK_ID]
  );
}

// =====================================================
// DUPLICATE CHECK
// =====================================================

async function assertUniqueName(
  db: SQLiteDatabase,
  kind: TransactionKind,
  name: string,
  excludedId = 0
): Promise<void> {
  const duplicate = await db.getFirstAsync<{
    id: number;
  }>(
    `
    SELECT id
    FROM dp_categories
    WHERE book_id = ?
      AND kind = ?
      AND name = ? COLLATE NOCASE
      AND id <> ?
    LIMIT 1
    `,
    [BOOK_ID, kind, name, excludedId]
  );

  if (duplicate) {
    throw new Error(
      'Nama kategori sudah digunakan untuk jenis transaksi ini.'
    );
  }
}

// =====================================================
// CREATE
// =====================================================

export async function createCategory(
  db: SQLiteDatabase,
  input: CategoryInput
): Promise<number> {
  assertKind(input.kind);

  const name = normalizeName(input.name);
  const icon = normalizeIcon(input.icon);

  await assertUniqueName(
    db,
    input.kind,
    name
  );

  try {
    const result = await db.runAsync(
      `
      INSERT INTO dp_categories (
        book_id,
        kind,
        name,
        icon,
        is_active
      )
      VALUES (?, ?, ?, ?, 1)
      `,
      [
        BOOK_ID,
        input.kind,
        name,
        icon,
      ]
    );

    return result.lastInsertRowId;
  } catch (error) {
    throw normalizeError(error);
  }
}

// =====================================================
// UPDATE
// =====================================================

export async function updateCategory(
  db: SQLiteDatabase,
  id: number,
  input: CategoryInput
): Promise<void> {
  assertId(id);
  assertKind(input.kind);

  const name = normalizeName(input.name);
  const icon = normalizeIcon(input.icon);

  const current = await db.getFirstAsync<{
    id: number;
    kind: TransactionKind;
  }>(
    `
    SELECT id, kind
    FROM dp_categories
    WHERE id = ?
      AND book_id = ?
    `,
    [id, BOOK_ID]
  );

  if (!current) {
    throw new Error('Kategori tidak ditemukan.');
  }

  if (current.kind !== input.kind) {
    throw new Error(
      'Jenis kategori tidak boleh diubah.'
    );
  }

  await assertUniqueName(
    db,
    input.kind,
    name,
    id
  );

  try {
    const result = await db.runAsync(
      `
      UPDATE dp_categories
      SET
        name = ?,
        icon = ?
      WHERE id = ?
        AND book_id = ?
        AND kind = ?
      `,
      [
        name,
        icon,
        id,
        BOOK_ID,
        input.kind,
      ]
    );

    if (result.changes !== 1) {
      throw new Error(
        'Gagal memperbarui kategori.'
      );
    }
  } catch (error) {
    throw normalizeError(error);
  }
}

// =====================================================
// ARCHIVE / RESTORE
// =====================================================

export async function setCategoryActive(
  db: SQLiteDatabase,
  id: number,
  active: boolean
): Promise<void> {
  assertId(id);

  const current = await db.getFirstAsync<ManagedCategory>(
    `
    SELECT
      c.id,
      c.kind,
      c.name,
      c.icon,
      c.is_active,

      (
        SELECT COUNT(*)
        FROM dp_transactions t
        WHERE t.category_id = c.id
          AND t.book_id = c.book_id
      ) AS transaction_count,

      (
        SELECT COUNT(*)
        FROM dp_budgets b
        WHERE b.category_id = c.id
          AND b.book_id = c.book_id
      ) AS budget_count

    FROM dp_categories c
    WHERE c.id = ?
      AND c.book_id = ?
    `,
    [id, BOOK_ID]
  );

  if (!current) {
    throw new Error('Kategori tidak ditemukan.');
  }

  if (active) {
    const result = await db.runAsync(
      `
      UPDATE dp_categories
      SET is_active = 1
      WHERE id = ?
        AND book_id = ?
        AND is_active = 0
      `,
      [id, BOOK_ID]
    );

    if (result.changes !== 1 && current.is_active !== 1) {
      throw new Error(
        'Gagal mengaktifkan kategori.'
      );
    }

    return;
  }

  if (current.is_active === 0) {
    return;
  }

  if (current.transaction_count > 0) {
    throw new Error(
      'Kategori sudah digunakan dalam histori transaksi.'
    );
  }

  if (current.budget_count > 0) {
    throw new Error(
      'Kategori sudah digunakan pada anggaran.'
    );
  }

  const result = await db.runAsync(
    `
    UPDATE dp_categories
    SET is_active = 0

    WHERE id = ?
      AND book_id = ?
      AND is_active = 1

      AND NOT EXISTS (
        SELECT 1
        FROM dp_transactions t
        WHERE t.category_id = dp_categories.id
          AND t.book_id = dp_categories.book_id
      )

      AND NOT EXISTS (
        SELECT 1
        FROM dp_budgets b
        WHERE b.category_id = dp_categories.id
          AND b.book_id = dp_categories.book_id
      )

      AND (
        SELECT COUNT(*)
        FROM dp_categories other
        WHERE other.book_id = dp_categories.book_id
          AND other.kind = dp_categories.kind
          AND other.is_active = 1
      ) > 1
    `,
    [id, BOOK_ID]
  );

  if (result.changes !== 1) {
    throw new Error(
      'Kategori tidak dapat dinonaktifkan. ' +
      'Pastikan tidak digunakan dan masih ada ' +
      'kategori aktif lainnya.'
    );
  }
}
