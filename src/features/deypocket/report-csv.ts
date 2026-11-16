import type {
  HistoryActivity,
  HistorySummary,
} from './transaction-history-repository';

export type MonthlyReportRow = {
  month: string; // YYYY-MM
  summary: HistorySummary;
};

const CSV_DELIMITER = ';';
const CSV_BOM = '\uFEFF';

/**
 * Escapes a spreadsheet cell, including formula injection from user-controlled
 * notes, wallet names and category names. Never pass any user text unchecked
 * to an Excel-compatible CSV.
 */
export function csvCell(value: string | number | null | undefined): string {
  let text = value == null ? '' : String(value).replace(/\u0000/g, '');
  // Excel/Sheets may interpret leading =, +, -, @ as a formula (even after whitespace).
  // Only text values enter this path from report labels; numeric amounts remain numeric.
  if (typeof value !== 'number' && /^[\s\uFEFF]*[=+@-]/u.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: Array<string | number | null | undefined>): string {
  return values.map(csvCell).join(CSV_DELIMITER);
}

export function makeHistoryCsv(rows: HistoryActivity[]): string {
  const headers = [
    'Tanggal', 'Jenis', 'Kategori / Aktivitas', 'Dompet / Rekening',
    'Nominal (Rp)', 'Catatan', 'ID Transaksi',
  ];
  const records = rows.map((entry) => csvRow([
    entry.occurred_on,
    entry.kind === 'income' ? 'Pemasukan' : entry.kind === 'expense' ? 'Pengeluaran' : 'Transfer',
    entry.title,
    entry.account_name,
    entry.amount_rupiah,
    entry.note,
    entry.id,
  ]));
  return CSV_BOM + [csvRow(headers), ...records].join('\r\n') + '\r\n';
}

export function makeMonthlyCsv(rows: MonthlyReportRow[]): string {
  const headers = [
    'Bulan', 'Jumlah Transaksi', 'Pemasukan (Rp)', 'Pengeluaran (Rp)',
    'Selisih (Rp)', 'Transfer Internal (Rp)',
  ];
  const records = rows.map(({ month, summary }) => csvRow([
    month, summary.total_count, summary.income, summary.expense, summary.net,
    summary.transfer,
  ]));
  return CSV_BOM + [csvRow(headers), ...records].join('\r\n') + '\r\n';
}

export function localDay(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function monthBounds(date: Date, monthOffset = 0): { from: string; to: string } {
  const y = date.getFullYear();
  const m = date.getMonth() + monthOffset;
  return {
    from: localDay(new Date(y, m, 1)),
    to: localDay(new Date(y, m + 1, 0)),
  };
}

export function monthKey(date: Date, monthOffset = 0): string {
  const d = new Date(date.getFullYear(), date.getMonth() + monthOffset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function validDay(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return (
    date.getFullYear() === Number(y) &&
    date.getMonth() === Number(m) - 1 &&
    date.getDate() === Number(d) &&
    Number(y) >= 2000 && Number(y) <= 2100
  );
}

export function reportFileStamp(date: Date): string {
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((v) => String(v).padStart(2, '0'))
    .join('');
  return `${localDay(date).replace(/-/g, '')}-${time}`;
}
