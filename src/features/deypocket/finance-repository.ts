
import type { SQLiteDatabase } from 'expo-sqlite';

export type TransactionKind = 'income' | 'expense';
export type ActivityKind = TransactionKind | 'transfer';

export type FinanceAccount = {
  id: number;
  name: string;
  kind: string;
  balance_rupiah: number;
};

export type FinanceCategory = {
  id: number;
  name: string;
  kind: TransactionKind;
  icon: string | null;
};

export type FinanceSummary = {
  balance: number;
  income: number;
  expense: number;
};

export type FinanceActivity = {
  id: number;
  kind: ActivityKind;
  title: string;
  account_name: string;
  amount_rupiah: number;
  occurred_on: string;
  note: string;
};

type CreateTransactionInput = {
  kind: TransactionKind;
  accountId: number;
  categoryId: number;
  amountRupiah: number;
  occurredOn: string;
  note?: string;
};

type CreateTransferInput = {
  fromAccountId: number;
  toAccountId: number;
  amountRupiah: number;
  occurredOn: string;
  note?: string;
};

const BOOK_ID = 1;
const MAX_AMOUNT = 1_000_000_000_000;

function assertAmount(amount: number): void {
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > MAX_AMOUNT
  ) {
    throw new Error(
      'Nominal harus berupa rupiah bulat, lebih dari nol, ' +
      'dan maksimal Rp1 triliun.'
    );
  }
}

function assertId(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('ID data tidak valid.');
  }
}

function assertDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Format tanggal harus YYYY-MM-DD.');
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error('Tanggal transaksi tidak valid.');
  }
}

function normalizeNote(note?: string): string | null {
  const value = (note ?? '').trim();
  return value ? value.slice(0, 500) : null;
}

export async function getAccounts(
  db: SQLiteDatabase
): Promise<FinanceAccount[]> {
  return db.getAllAsync<FinanceAccount>(
    `
    SELECT
      a.id,
      a.name,
      a.kind,

      a.opening_balance_rupiah

      + COALESCE((
        SELECT SUM(
          CASE
            WHEN t.kind = 'income' THEN t.amount_rupiah
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

      AS balance_rupiah

    FROM dp_accounts a
    WHERE a.book_id = ?
      AND a.is_active = 1

    ORDER BY a.id ASC
    `,
    [BOOK_ID]
  );
}

export async function getCategories(
  db: SQLiteDatabase,
  kind: TransactionKind
): Promise<FinanceCategory[]> {
  return db.getAllAsync<FinanceCategory>(
    `
    SELECT id, name, kind, icon
    FROM dp_categories
    WHERE book_id = ?
      AND kind = ?
      AND is_active = 1
    ORDER BY id ASC
    `,
    [BOOK_ID, kind]
  );
}

export async function createTransaction(
  db: SQLiteDatabase,
  input: CreateTransactionInput
): Promise<number> {
  assertAmount(input.amountRupiah);
  assertId(input.accountId);
  assertId(input.categoryId);
  assertDate(input.occurredOn);

  if (
    input.kind !== 'income' &&
    input.kind !== 'expense'
  ) {
    throw new Error('Jenis transaksi tidak valid.');
  }

  // INSERT ... SELECT memastikan akun dan kategori
  // aktif, berada dalam buku yang sama, dan jenis
  // kategori cocok dengan transaksi.
  const result = await db.runAsync(
    `
    INSERT INTO dp_transactions (
      book_id,
      account_id,
      category_id,
      kind,
      amount_rupiah,
      occurred_on,
      note
    )
    SELECT
      a.book_id,
      a.id,
      c.id,
      ?,
      ?,
      ?,
      ?
    FROM dp_accounts a
    INNER JOIN dp_categories c
      ON c.book_id = a.book_id
    WHERE a.id = ?
      AND c.id = ?
      AND a.book_id = ?
      AND a.is_active = 1
      AND c.is_active = 1
      AND c.kind = ?
    `,
    [
      input.kind,
      input.amountRupiah,
      input.occurredOn,
      normalizeNote(input.note),
      input.accountId,
      input.categoryId,
      BOOK_ID,
      input.kind,
    ]
  );

  if (result.changes !== 1) {
    throw new Error(
      'Transaksi gagal: dompet atau kategori tidak valid.'
    );
  }

  return result.lastInsertRowId;
}

export async function createTransfer(
  db: SQLiteDatabase,
  input: CreateTransferInput
): Promise<number> {
  assertAmount(input.amountRupiah);
  assertId(input.fromAccountId);
  assertId(input.toAccountId);
  assertDate(input.occurredOn);

  if (input.fromAccountId === input.toAccountId) {
    throw new Error(
      'Dompet asal dan tujuan harus berbeda.'
    );
  }

  // Satu transfer = satu record.
  // Saldo kedua dompet dihitung dari record yang sama.
  const result = await db.runAsync(
    `
    INSERT INTO dp_transfers (
      book_id,
      from_account_id,
      to_account_id,
      amount_rupiah,
      occurred_on,
      note
    )
    SELECT
      a.book_id,
      a.id,
      b.id,
      ?,
      ?,
      ?
    FROM dp_accounts a
    INNER JOIN dp_accounts b
      ON b.book_id = a.book_id
    WHERE a.id = ?
      AND b.id = ?
      AND a.book_id = ?
      AND a.is_active = 1
      AND b.is_active = 1
    `,
    [
      input.amountRupiah,
      input.occurredOn,
      normalizeNote(input.note),
      input.fromAccountId,
      input.toAccountId,
      BOOK_ID,
    ]
  );

  if (result.changes !== 1) {
    throw new Error(
      'Transfer gagal: rekening asal atau tujuan tidak valid.'
    );
  }

  return result.lastInsertRowId;
}

export async function getFinanceSummary(
  db: SQLiteDatabase,
  referenceDate: Date = new Date()
): Promise<FinanceSummary> {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;

  const next = new Date(year, month + 1, 1);

  const end =
    `${next.getFullYear()}-` +
    `${String(next.getMonth() + 1).padStart(2, '0')}-01`;

  const accounts = await getAccounts(db);

  const balance = accounts.reduce(
    (total, account) => total + account.balance_rupiah,
    0
  );

  const totals = await db.getFirstAsync<{
    income: number;
    expense: number;
  }>(
    `
    SELECT
      COALESCE(SUM(
        CASE WHEN kind = 'income'
          THEN amount_rupiah ELSE 0 END
      ), 0) AS income,

      COALESCE(SUM(
        CASE WHEN kind = 'expense'
          THEN amount_rupiah ELSE 0 END
      ), 0) AS expense

    FROM dp_transactions
    WHERE book_id = ?
      AND occurred_on >= ?
      AND occurred_on < ?
    `,
    [BOOK_ID, start, end]
  );

  return {
    balance,
    income: totals?.income ?? 0,
    expense: totals?.expense ?? 0,
  };
}


export async function getActivities(
  db: SQLiteDatabase,
  limit = 100
): Promise<FinanceActivity[]> {
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(Math.trunc(limit), 500))
    : 100;

  return db.getAllAsync<FinanceActivity>(
    `
    SELECT
      activity.id,
      activity.kind,
      activity.title,
      activity.account_name,
      activity.amount_rupiah,
      activity.occurred_on,
      activity.note

    FROM (

      -- ================================================
      -- PEMASUKAN DAN PENGELUARAN
      -- ================================================
      SELECT
        t.id AS id,
        t.kind AS kind,
        c.name AS title,
        a.name AS account_name,
        t.amount_rupiah AS amount_rupiah,
        t.occurred_on AS occurred_on,
        COALESCE(t.note, '') AS note,
        t.created_at AS sort_created,
        0 AS sort_type

      FROM dp_transactions AS t

      INNER JOIN dp_categories AS c
        ON c.id = t.category_id

      INNER JOIN dp_accounts AS a
        ON a.id = t.account_id

      WHERE t.book_id = ?

      UNION ALL

      -- ================================================
      -- TRANSFER ANTAR DOMPET
      -- ================================================
      SELECT
        tr.id AS id,
        'transfer' AS kind,

        'Transfer: ' || a.name || ' → ' || b.name
          AS title,

        a.name AS account_name,
        tr.amount_rupiah AS amount_rupiah,
        tr.occurred_on AS occurred_on,
        COALESCE(tr.note, '') AS note,
        tr.created_at AS sort_created,
        1 AS sort_type

      FROM dp_transfers AS tr

      INNER JOIN dp_accounts AS a
        ON a.id = tr.from_account_id

      INNER JOIN dp_accounts AS b
        ON b.id = tr.to_account_id

      WHERE tr.book_id = ?

    ) AS activity

    -- ================================================
    -- SORTING DILAKUKAN DI QUERY TERLUAR
    -- ================================================
    ORDER BY
      activity.occurred_on DESC,
      activity.sort_created DESC,
      activity.sort_type DESC,
      activity.id DESC

    LIMIT ?
    `,
    [BOOK_ID, BOOK_ID, safeLimit]
  );
}

