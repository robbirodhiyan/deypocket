
import type { SQLiteDatabase } from 'expo-sqlite';

const BOOK_ID = 1;
const MAX_RUPIAH = 1_000_000_000_000;

export type CategoryBudget = {
  category_id: number;
  name: string;
  is_active: number;
  limit_rupiah: number | null;
  spent_rupiah: number;
};

export type BudgetOverview = {
  month: string;
  income: number;
  expense: number;
  overall_limit_rupiah: number | null;
  remaining_rupiah: number | null;
  categories: CategoryBudget[];
};

export type MonthlyTrend = {
  month: string;
  income: number;
  expense: number;
};

export type BudgetInput = {
  categoryId: number | null;
  limitRupiah: number | null;
};

// =====================================================
// MONTH HELPERS
// =====================================================

function assertMonth(month: string): void {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);

  if (!match) {
    throw new Error('Format bulan harus YYYY-MM.');
  }

  const year = Number(match[1]);

  if (year < 2000 || year > 2100) {
    throw new Error('Tahun harus antara 2000 dan 2100.');
  }
}

export function getCurrentMonth(): string {
  const now = new Date();

  return (
    `${now.getFullYear()}-` +
    `${String(now.getMonth() + 1).padStart(2, '0')}`
  );
}

export function moveMonth(
  month: string,
  offset: number
): string {
  assertMonth(month);

  if (!Number.isSafeInteger(offset)) {
    throw new Error('Offset bulan tidak valid.');
  }

  const [year, monthNumber] = month.split('-').map(Number);

  const target = new Date(
    year,
    monthNumber - 1 + offset,
    1
  );

  return (
    `${target.getFullYear()}-` +
    `${String(target.getMonth() + 1).padStart(2, '0')}`
  );
}

export function formatMonthLabel(month: string): string {
  assertMonth(month);

  const [year, monthNumber] = month.split('-').map(Number);

  return new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, monthNumber - 1, 1));
}

function monthBounds(month: string) {
  assertMonth(month);

  return {
    start: `${month}-01`,
    end: `${moveMonth(month, 1)}-01`,
  };
}

// =====================================================
// MONTHLY OVERVIEW
// =====================================================

export async function getBudgetOverview(
  db: SQLiteDatabase,
  month: string
): Promise<BudgetOverview> {
  const { start, end } = monthBounds(month);

  const [total, budget, categories] = await Promise.all([
    db.getFirstAsync<{
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
    ),

    db.getFirstAsync<{
      limit_rupiah: number;
    }>(
      `
      SELECT limit_rupiah
      FROM dp_budgets
      WHERE book_id = ?
        AND month = ?
        AND category_id IS NULL
      `,
      [BOOK_ID, month]
    ),

    db.getAllAsync<CategoryBudget>(
      `
      SELECT
        c.id AS category_id,
        c.name,
        c.is_active,
        b.limit_rupiah,

        COALESCE(
          SUM(t.amount_rupiah),
          0
        ) AS spent_rupiah

      FROM dp_categories c

      LEFT JOIN dp_budgets b
        ON b.book_id = c.book_id
        AND b.month = ?
        AND b.category_id = c.id

      LEFT JOIN dp_transactions t
        ON t.book_id = c.book_id
        AND t.category_id = c.id
        AND t.kind = 'expense'
        AND t.occurred_on >= ?
        AND t.occurred_on < ?

      WHERE c.book_id = ?
        AND c.kind = 'expense'

      GROUP BY
        c.id,
        c.name,
        c.is_active,
        b.limit_rupiah

      ORDER BY
        spent_rupiah DESC,
        c.name ASC
      `,
      [month, start, end, BOOK_ID]
    ),
  ]);

  const income = total?.income ?? 0;
  const expense = total?.expense ?? 0;

  const overallLimit = budget?.limit_rupiah ?? null;

  return {
    month,
    income,
    expense,
    overall_limit_rupiah: overallLimit,
    remaining_rupiah:
      overallLimit === null
        ? null
        : overallLimit - expense,
    categories,
  };
}

// =====================================================
// SAVE MONTHLY BUDGETS
// =====================================================

export async function saveMonthlyBudgets(
  db: SQLiteDatabase,
  month: string,
  entries: BudgetInput[]
): Promise<void> {
  assertMonth(month);

  if (!Array.isArray(entries) || entries.length > 300) {
    throw new Error('Jumlah anggaran tidak valid.');
  }

  const keys = new Set<string>();

  for (const entry of entries) {
    const key =
      entry.categoryId === null
        ? 'overall'
        : `category:${entry.categoryId}`;

    if (keys.has(key)) {
      throw new Error('Anggaran kategori duplikat.');
    }

    keys.add(key);

    if (
      entry.categoryId !== null &&
      (!Number.isSafeInteger(entry.categoryId) ||
        entry.categoryId <= 0)
    ) {
      throw new Error('ID kategori tidak valid.');
    }

    if (
      entry.limitRupiah !== null &&
      (
        !Number.isSafeInteger(entry.limitRupiah) ||
        entry.limitRupiah < 0 ||
        entry.limitRupiah > MAX_RUPIAH
      )
    ) {
      throw new Error(
        'Anggaran harus berupa rupiah bulat ' +
        'antara Rp0 dan Rp1 triliun.'
      );
    }
  }

  // Transaksi bersama: jika satu perubahan gagal,
  // seluruh perubahan anggaran dibatalkan.
  await db.withTransactionAsync(async () => {
    for (const entry of entries) {
      if (entry.categoryId !== null) {
        const category = await db.getFirstAsync<{
          id: number;
        }>(
          `
          SELECT id
          FROM dp_categories
          WHERE id = ?
            AND book_id = ?
            AND kind = 'expense'
          `,
          [entry.categoryId, BOOK_ID]
        );

        if (!category) {
          throw new Error(
            'Kategori anggaran tidak ditemukan.'
          );
        }
      }

      if (entry.limitRupiah === null) {
        // IS ? dapat membandingkan NULL dengan NULL.
        await db.runAsync(
          `
          DELETE FROM dp_budgets
          WHERE book_id = ?
            AND month = ?
            AND category_id IS ?
          `,
          [BOOK_ID, month, entry.categoryId]
        );

        continue;
      }

      await db.runAsync(
        `
        INSERT INTO dp_budgets (
          book_id,
          month,
          category_id,
          limit_rupiah
        )
        VALUES (?, ?, ?, ?)

        ON CONFLICT DO UPDATE SET
          limit_rupiah = excluded.limit_rupiah
        `,
        [
          BOOK_ID,
          month,
          entry.categoryId,
          entry.limitRupiah,
        ]
      );
    }
  });
}

// =====================================================
// SIX MONTH EXPENSE / INCOME TREND
// =====================================================

export async function getSixMonthTrend(
  db: SQLiteDatabase,
  endMonth: string
): Promise<MonthlyTrend[]> {
  assertMonth(endMonth);

  const months = Array.from(
    { length: 6 },
    (_, index) => moveMonth(endMonth, index - 5)
  );

  const firstDay = `${months[0]}-01`;
  const lastDay = `${moveMonth(endMonth, 1)}-01`;

  const rows = await db.getAllAsync<{
    month: string;
    kind: 'income' | 'expense';
    total: number;
  }>(
    `
    SELECT
      SUBSTR(occurred_on, 1, 7) AS month,
      kind,
      SUM(amount_rupiah) AS total

    FROM dp_transactions

    WHERE book_id = ?
      AND occurred_on >= ?
      AND occurred_on < ?

    GROUP BY
      SUBSTR(occurred_on, 1, 7),
      kind
    `,
    [BOOK_ID, firstDay, lastDay]
  );

  const trend = new Map<string, MonthlyTrend>(
    months.map((month) => [
      month,
      {
        month,
        income: 0,
        expense: 0,
      },
    ])
  );

  for (const row of rows) {
    const item = trend.get(row.month);

    if (!item) continue;

    if (row.kind === 'income') {
      item.income = row.total;
    } else {
      item.expense = row.total;
    }
  }

  return months.map(
    (month) => trend.get(month)!
  );
}
