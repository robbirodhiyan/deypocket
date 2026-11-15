import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Sprint 4B: Transaction History (offline SQLite)
 *
 * Matches Sprint 1-4A schema, including the existing active-book convention.
 * Intentionally read-only. No migration or new dependency is necessary.
 */

const BOOK_ID = 1;
export const HISTORY_PAGE_SIZE = 40;

export type HistoryKind = 'all' | 'expense' | 'income' | 'transfer';
export type ActivityKind = Exclude<HistoryKind, 'all'>;

export type HistoryFilter = {
  query?: string;
  kind?: HistoryKind;
  dateFrom?: string | null; // YYYY-MM-DD, inclusive
  dateTo?: string | null; // YYYY-MM-DD, inclusive
  accountId?: number | null;
  categoryId?: number | null;
};

export type HistoryActivity = {
  id: number;
  kind: ActivityKind;
  title: string;
  account_name: string;
  account_id: number | null;
  to_account_id: number | null;
  category_id: number | null;
  amount_rupiah: number;
  occurred_on: string;
  note: string;
};

export type HistorySummary = {
  total_count: number;
  income: number;
  expense: number;
  transfer: number;
  net: number;
};

export type HistoryOption = { id: number; name: string };
export type HistoryCategoryOption = HistoryOption & { kind: 'income' | 'expense' };
export type HistoryOptions = {
  accounts: HistoryOption[];
  categories: HistoryCategoryOption[];
};

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return (
    year >= 2000 && year <= 2100 &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function validateHistoryFilter(filter: HistoryFilter): void {
  if (filter.dateFrom && !isIsoDate(filter.dateFrom)) {
    throw new Error('Tanggal mulai tidak valid (YYYY-MM-DD).');
  }
  if (filter.dateTo && !isIsoDate(filter.dateTo)) {
    throw new Error('Tanggal akhir tidak valid (YYYY-MM-DD).');
  }
  if (filter.dateFrom && filter.dateTo && filter.dateFrom > filter.dateTo) {
    throw new Error('Tanggal mulai tidak boleh setelah tanggal akhir.');
  }
  for (const value of [filter.accountId, filter.categoryId]) {
    if (value != null && (!Number.isSafeInteger(value) || value <= 0)) {
      throw new Error('ID filter tidak valid.');
    }
  }
  if (filter.kind && !['all', 'expense', 'income', 'transfer'].includes(filter.kind)) {
    throw new Error('Jenis transaksi tidak valid.');
  }
}

// Order is important: first two bind parameters are BOOK_ID (transactions, transfers).
// Keep this CTE shared by the list and summary so filtering always remains consistent.
const HISTORY_CTE = `
WITH history AS (
  SELECT
    t.id AS id,
    t.kind AS kind,
    COALESCE(c.name, 'Tanpa kategori') AS title,
    COALESCE(a.name, 'Dompet tidak tersedia') AS account_name,
    t.account_id AS account_id,
    NULL AS to_account_id,
    t.category_id AS category_id,
    t.amount_rupiah AS amount_rupiah,
    t.occurred_on AS occurred_on,
    COALESCE(t.note, '') AS note,
    t.created_at AS sort_created,
    1 AS sort_type
  FROM dp_transactions AS t
  LEFT JOIN dp_accounts AS a ON a.id = t.account_id AND a.book_id = t.book_id
  LEFT JOIN dp_categories AS c ON c.id = t.category_id AND c.book_id = t.book_id
  WHERE t.book_id = ?

  UNION ALL

  SELECT
    tr.id AS id,
    'transfer' AS kind,
    'Transfer dompet' AS title,
    COALESCE(af.name, 'Dompet tidak tersedia') || ' → ' ||
      COALESCE(at.name, 'Dompet tidak tersedia') AS account_name,
    tr.from_account_id AS account_id,
    tr.to_account_id AS to_account_id,
    NULL AS category_id,
    tr.amount_rupiah AS amount_rupiah,
    tr.occurred_on AS occurred_on,
    COALESCE(tr.note, '') AS note,
    tr.created_at AS sort_created,
    2 AS sort_type
  FROM dp_transfers AS tr
  LEFT JOIN dp_accounts AS af ON af.id = tr.from_account_id AND af.book_id = tr.book_id
  LEFT JOIN dp_accounts AS at ON at.id = tr.to_account_id AND at.book_id = tr.book_id
  WHERE tr.book_id = ?
)
`;

function escapeLike(value: string): string {
  // Escape backslash FIRST, then SQL LIKE wildcard characters.
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function getWhere(filter: HistoryFilter): { sql: string; params: Array<string | number> } {
  validateHistoryFilter(filter);
  const clauses: string[] = [];
  const params: Array<string | number> = [BOOK_ID, BOOK_ID];

  if (filter.kind && filter.kind !== 'all') {
    clauses.push('h.kind = ?');
    params.push(filter.kind);
  }
  if (filter.dateFrom) {
    clauses.push('h.occurred_on >= ?');
    params.push(filter.dateFrom);
  }
  if (filter.dateTo) {
    clauses.push('h.occurred_on <= ?');
    params.push(filter.dateTo);
  }
  if (filter.accountId != null) {
    // For transfers, either the source or destination wallet is a match.
    clauses.push('(h.account_id = ? OR h.to_account_id = ?)');
    params.push(filter.accountId, filter.accountId);
  }
  if (filter.categoryId != null) {
    clauses.push('h.category_id = ?');
    params.push(filter.categoryId);
  }

  const query = filter.query?.trim();
  if (query) {
    // Parameterized search, treating % and _ as literal user input.
    const term = `%${escapeLike(query)}%`;
    clauses.push(`(
      h.title LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      h.account_name LIKE ? ESCAPE '\\' COLLATE NOCASE OR
      h.note LIKE ? ESCAPE '\\' COLLATE NOCASE
    )`);
    params.push(term, term, term);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export async function getHistorySummary(
  db: SQLiteDatabase,
  filter: HistoryFilter = {}
): Promise<HistorySummary> {
  const { sql, params } = getWhere(filter);
  const row = await db.getFirstAsync<{
    total_count: number;
    income: number;
    expense: number;
    transfer: number;
  }>(
    `${HISTORY_CTE}
     SELECT
       COUNT(*) AS total_count,
       COALESCE(SUM(CASE WHEN h.kind = 'income' THEN h.amount_rupiah ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN h.kind = 'expense' THEN h.amount_rupiah ELSE 0 END), 0) AS expense,
       COALESCE(SUM(CASE WHEN h.kind = 'transfer' THEN h.amount_rupiah ELSE 0 END), 0) AS transfer
     FROM history AS h ${sql}`,
    params
  );
  const income = row?.income ?? 0;
  const expense = row?.expense ?? 0;
  return {
    total_count: row?.total_count ?? 0,
    income,
    expense,
    transfer: row?.transfer ?? 0,
    net: income - expense,
  };
}

export async function getHistoryPage(
  db: SQLiteDatabase,
  filter: HistoryFilter = {},
  offset = 0,
  limit = HISTORY_PAGE_SIZE
): Promise<HistoryActivity[]> {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error('Offset histori tidak valid.');
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Ukuran halaman histori tidak valid.');
  }
  const { sql, params } = getWhere(filter);
  return db.getAllAsync<HistoryActivity>(
    `${HISTORY_CTE}
     SELECT h.id, h.kind, h.title, h.account_name,
            h.account_id, h.to_account_id, h.category_id,
            h.amount_rupiah, h.occurred_on, h.note
     FROM history AS h ${sql}
     ORDER BY h.occurred_on DESC, h.sort_created DESC,
              h.sort_type DESC, h.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
}

/** Includes archived categories and wallets so past transactions stay filterable. */
export async function getHistoryOptions(db: SQLiteDatabase): Promise<HistoryOptions> {
  const [accounts, categories] = await Promise.all([
    db.getAllAsync<HistoryOption>(
      'SELECT id, name FROM dp_accounts WHERE book_id = ? ORDER BY name COLLATE NOCASE, id',
      [BOOK_ID]
    ),
    db.getAllAsync<HistoryCategoryOption>(
      `SELECT id, name, kind FROM dp_categories
       WHERE book_id = ? AND kind IN ('expense', 'income')
       ORDER BY kind, name COLLATE NOCASE, id`,
      [BOOK_ID]
    ),
  ]);
  return { accounts, categories };
}
