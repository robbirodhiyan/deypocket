
import type { SQLiteDatabase } from 'expo-sqlite';

import type {
    ActivityKind,
    TransactionKind,
} from './finance-repository';

const BOOK_ID = 1;
const MAX_RUPIAH = 1_000_000_000_000;

// =====================================================
// TYPES
// =====================================================

export type WalletKind =
  | 'cash'
  | 'bank'
  | 'ewallet'
  | 'other';

export type WalletRecord = {
  id: number;
  name: string;
  kind: WalletKind;
  opening_balance_rupiah: number;
  balance_rupiah: number;
  usage_count: number;
};

export type WalletInput = {
  name: string;
  kind: WalletKind;
  openingBalanceRupiah: number;
};

export type EditableEntry = {
  id: number;
  kind: ActivityKind;
  account_id: number | null;
  category_id: number | null;
  from_account_id: number | null;
  to_account_id: number | null;
  amount_rupiah: number;
  occurred_on: string;
  note: string;
};

type EntryBase = {
  id: number;
  amountRupiah: number;
  occurredOn: string;
  note?: string;
};

export type UpdateEntryInput =
  | (EntryBase & {
      kind: TransactionKind;
      accountId: number;
      categoryId: number;
    })
  | (EntryBase & {
      kind: 'transfer';
      fromAccountId: number;
      toAccountId: number;
    });

// =====================================================
// VALIDATION
// =====================================================

function assertId(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('ID tidak valid.');
  }
}

function assertAmount(
  value: number,
  allowZero = false
): void {
  if (
    !Number.isSafeInteger(value) ||
    value < (allowZero ? 0 : 1) ||
    value > MAX_RUPIAH
  ) {
    throw new Error(
      'Nominal harus berupa rupiah bulat dan ' +
      'maksimal Rp1 triliun.'
    );
  }
}

function assertDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Format tanggal: YYYY-MM-DD.');
  }

  const [year, month, day] = value.split('-').map(Number);

  if (year < 2000 || year > 2100) {
    throw new Error('Tahun harus antara 2000 dan 2100.');
  }

  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error('Tanggal tidak valid.');
  }
}

function normalizeName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ');

  if (name.length < 2 || name.length > 50) {
    throw new Error(
      'Nama dompet harus 2 sampai 50 karakter.'
    );
  }

  return name;
}

function normalizeNote(value?: string): string | null {
  const text = (value ?? '').trim();

  return text ? text.slice(0, 500) : null;
}

function assertWalletKind(value: WalletKind): void {
  if (!['cash', 'bank', 'ewallet', 'other'].includes(value)) {
    throw new Error('Jenis dompet tidak valid.');
  }
}

function assertActivityKind(value: string): asserts value is ActivityKind {
  if (!['income', 'expense', 'transfer'].includes(value)) {
    throw new Error('Jenis transaksi tidak valid.');
  }
}

// =====================================================
// WALLET: LIST
// =====================================================

export async function getWallets(
  db: SQLiteDatabase
): Promise<WalletRecord[]> {
  return db.getAllAsync<WalletRecord>(
    `
    SELECT
      a.id,
      a.name,
      a.kind,
      a.opening_balance_rupiah,

      a.opening_balance_rupiah

      + COALESCE((
        SELECT SUM(
          CASE
            WHEN t.kind = 'income'
              THEN t.amount_rupiah
            ELSE -t.amount_rupiah
          END
        )
        FROM dp_transactions t
        WHERE t.account_id = a.id
      ), 0)

      + COALESCE((
        SELECT SUM(tr.amount_rupiah)
        FROM dp_transfers tr
        WHERE tr.to_account_id = a.id
      ), 0)

      - COALESCE((
        SELECT SUM(tr.amount_rupiah)
        FROM dp_transfers tr
        WHERE tr.from_account_id = a.id
      ), 0)

      AS balance_rupiah,

      (
        SELECT COUNT(*)
        FROM dp_transactions t
        WHERE t.account_id = a.id
      )

      + (
        SELECT COUNT(*)
        FROM dp_transfers tr
        WHERE tr.from_account_id = a.id
           OR tr.to_account_id = a.id
      )

      AS usage_count

    FROM dp_accounts a
    WHERE a.book_id = ?
      AND a.is_active = 1

    ORDER BY a.id ASC
    `,
    [BOOK_ID]
  );
}

// =====================================================
// WALLET: CREATE
// =====================================================

export async function createWallet(
  db: SQLiteDatabase,
  input: WalletInput
): Promise<number> {
  const name = normalizeName(input.name);

  assertWalletKind(input.kind);
  assertAmount(input.openingBalanceRupiah, true);

  const result = await db.runAsync(
    `
    INSERT INTO dp_accounts (
      book_id,
      name,
      kind,
      opening_balance_rupiah,
      is_active
    )
    VALUES (?, ?, ?, ?, 1)
    `,
    [
      BOOK_ID,
      name,
      input.kind,
      input.openingBalanceRupiah,
    ]
  );

  return result.lastInsertRowId;
}

// =====================================================
// WALLET: UPDATE
// =====================================================

export async function updateWallet(
  db: SQLiteDatabase,
  id: number,
  input: WalletInput
): Promise<void> {
  assertId(id);

  const name = normalizeName(input.name);

  assertWalletKind(input.kind);
  assertAmount(input.openingBalanceRupiah, true);

  // Saldo awal tidak boleh diubah jika dompet
  // sudah memiliki transaksi atau transfer.
  // Nama dan jenis dompet tetap boleh diubah.
  const result = await db.runAsync(
    `
    UPDATE dp_accounts
    SET
      name = ?,
      kind = ?,
      opening_balance_rupiah = ?

    WHERE id = ?
      AND book_id = ?
      AND is_active = 1

      AND (
        opening_balance_rupiah = ?

        OR (
          NOT EXISTS (
            SELECT 1
            FROM dp_transactions t
            WHERE t.account_id = dp_accounts.id
          )

          AND NOT EXISTS (
            SELECT 1
            FROM dp_transfers tr
            WHERE tr.from_account_id = dp_accounts.id
               OR tr.to_account_id = dp_accounts.id
          )
        )
      )
    `,
    [
      name,
      input.kind,
      input.openingBalanceRupiah,
      id,
      BOOK_ID,
      input.openingBalanceRupiah,
    ]
  );

  if (result.changes !== 1) {
    throw new Error(
      'Dompet tidak ditemukan atau saldo awal ' +
      'tidak boleh diubah karena sudah ada histori.'
    );
  }
}

// =====================================================
// TRANSACTION: GET DETAIL
// =====================================================

export async function getEditableEntry(
  db: SQLiteDatabase,
  kind: ActivityKind,
  id: number
): Promise<EditableEntry | null> {
  assertId(id);
  assertActivityKind(kind);

  if (kind === 'transfer') {
    return db.getFirstAsync<EditableEntry>(
      `
      SELECT
        id,
        'transfer' AS kind,
        NULL AS account_id,
        NULL AS category_id,
        from_account_id,
        to_account_id,
        amount_rupiah,
        occurred_on,
        COALESCE(note, '') AS note

      FROM dp_transfers

      WHERE id = ?
        AND book_id = ?
      `,
      [id, BOOK_ID]
    );
  }

  return db.getFirstAsync<EditableEntry>(
    `
    SELECT
      id,
      kind,
      account_id,
      category_id,
      NULL AS from_account_id,
      NULL AS to_account_id,
      amount_rupiah,
      occurred_on,
      COALESCE(note, '') AS note

    FROM dp_transactions

    WHERE id = ?
      AND book_id = ?
      AND kind = ?
    `,
    [id, BOOK_ID, kind]
  );
}

// =====================================================
// TRANSACTION: UPDATE
// =====================================================

export async function updateFinanceEntry(
  db: SQLiteDatabase,
  input: UpdateEntryInput
): Promise<void> {
  assertId(input.id);
  assertAmount(input.amountRupiah);
  assertDate(input.occurredOn);
  assertActivityKind(input.kind);

  const note = normalizeNote(input.note);

  if (input.kind === 'transfer') {
    assertId(input.fromAccountId);
    assertId(input.toAccountId);

    if (input.fromAccountId === input.toAccountId) {
      throw new Error(
        'Dompet asal dan tujuan harus berbeda.'
      );
    }

    const result = await db.runAsync(
      `
      UPDATE dp_transfers
      SET
        from_account_id = ?,
        to_account_id = ?,
        amount_rupiah = ?,
        occurred_on = ?,
        note = ?

      WHERE id = ?
        AND book_id = ?

        AND EXISTS (
          SELECT 1
          FROM dp_accounts a
          INNER JOIN dp_accounts b
            ON a.book_id = b.book_id
          WHERE a.id = ?
            AND b.id = ?
            AND a.book_id = ?
            AND a.is_active = 1
            AND b.is_active = 1
        )
      `,
      [
        input.fromAccountId,
        input.toAccountId,
        input.amountRupiah,
        input.occurredOn,
        note,
        input.id,
        BOOK_ID,
        input.fromAccountId,
        input.toAccountId,
        BOOK_ID,
      ]
    );

    if (result.changes !== 1) {
      throw new Error(
        'Gagal mengubah transfer. Periksa kedua dompet.'
      );
    }

    return;
  }

  assertId(input.accountId);
  assertId(input.categoryId);

  const result = await db.runAsync(
    `
    UPDATE dp_transactions
    SET
      account_id = ?,
      category_id = ?,
      amount_rupiah = ?,
      occurred_on = ?,
      note = ?,
      updated_at = CURRENT_TIMESTAMP

    WHERE id = ?
      AND book_id = ?
      AND kind = ?

      AND EXISTS (
        SELECT 1
        FROM dp_accounts a
        INNER JOIN dp_categories c
          ON a.book_id = c.book_id

        WHERE a.id = ?
          AND c.id = ?
          AND a.book_id = ?
          AND c.kind = ?
          AND a.is_active = 1
          AND c.is_active = 1
      )
    `,
    [
      input.accountId,
      input.categoryId,
      input.amountRupiah,
      input.occurredOn,
      note,
      input.id,
      BOOK_ID,
      input.kind,
      input.accountId,
      input.categoryId,
      BOOK_ID,
      input.kind,
    ]
  );

  if (result.changes !== 1) {
    throw new Error(
      'Gagal mengubah transaksi. ' +
      'Periksa dompet dan kategori.'
    );
  }
}

// =====================================================
// TRANSACTION: DELETE
// =====================================================

export async function deleteFinanceEntry(
  db: SQLiteDatabase,
  kind: ActivityKind,
  id: number
): Promise<void> {
  assertId(id);
  assertActivityKind(kind);

  if (kind === 'transfer') {
    const result = await db.runAsync(
      `
      DELETE FROM dp_transfers
      WHERE id = ?
        AND book_id = ?
      `,
      [id, BOOK_ID]
    );

    if (result.changes !== 1) {
      throw new Error('Transfer tidak ditemukan.');
    }

    return;
  }

  const result = await db.runAsync(
    `
    DELETE FROM dp_transactions
    WHERE id = ?
      AND book_id = ?
      AND kind = ?
    `,
    [id, BOOK_ID, kind]
  );

  if (result.changes !== 1) {
    throw new Error('Transaksi tidak ditemukan.');
  }
}
