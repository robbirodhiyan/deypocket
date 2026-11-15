
import type { SQLiteDatabase } from 'expo-sqlite';

export type Item = {
  id: number;
  name: string;
  sku: string;
  created_at: string;
  updated_at: string;
};

export type ItemInput = {
  name: string;
  sku: string;
};

// Ambil semua data, termasuk pencarian.
export async function getItems(
  db: SQLiteDatabase,
  search = ''
): Promise<Item[]> {
  const keyword = search.trim();

  return db.getAllAsync<Item>(
    `
      SELECT id, name, sku, created_at, updated_at
      FROM items
      WHERE
        ? = ''
        OR instr(lower(name), lower(?)) > 0
        OR instr(lower(sku), lower(?)) > 0
      ORDER BY id DESC
    `,
    [keyword, keyword, keyword]
  );
}

// Ambil satu data berdasarkan ID.
export async function getItemById(
  db: SQLiteDatabase,
  id: number
): Promise<Item | null> {
  return db.getFirstAsync<Item>(
    'SELECT * FROM items WHERE id = ?',
    [id]
  );
}

// Tambah data.
export async function createItem(
  db: SQLiteDatabase,
  input: ItemInput
): Promise<number> {
  const result = await db.runAsync(
    `
      INSERT INTO items (name, sku)
      VALUES (?, ?)
    `,
    [input.name.trim(), input.sku.trim()]
  );

  return result.lastInsertRowId;
}

// Update data.
export async function updateItem(
  db: SQLiteDatabase,
  id: number,
  input: ItemInput
): Promise<void> {
  const result = await db.runAsync(
    `
      UPDATE items
      SET
        name = ?,
        sku = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [input.name.trim(), input.sku.trim(), id]
  );

  if (result.changes === 0) {
    throw new Error('Data tidak ditemukan.');
  }
}

// Hapus data.
export async function deleteItem(
  db: SQLiteDatabase,
  id: number
): Promise<void> {
  const result = await db.runAsync(
    'DELETE FROM items WHERE id = ?',
    [id]
  );

  if (result.changes === 0) {
    throw new Error('Data tidak ditemukan.');
  }
}
