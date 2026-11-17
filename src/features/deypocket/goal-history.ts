import type { GoalEntry } from './goals-repository';
import type { GoalCorrectionMap } from './goal-corrections';

/** Sprint 13 — filter + timeline riwayat, hanya mengolah data yang sudah dibaca.
 * Tidak menulis ke SQLite dan tidak mengubah saldo rekening.
 */
export type GoalHistoryFilter = 'all' | 'deposit' | 'withdrawal' | 'correction';

export type GoalHistoryMonth = {
  key: string;
  label: string;
  entries: GoalEntry[];
  netRupiah: number;
};

export type GoalHistoryView = {
  totalCount: number;
  matchedCount: number;
  displayedCount: number;
  hasMore: boolean;
  netRupiah: number;
  months: GoalHistoryMonth[];
};

function signedAmount(entry: GoalEntry): number {
  return entry.kind === 'deposit' ? entry.amount_rupiah : -entry.amount_rupiah;
}

function matchesFilter(
  entry: GoalEntry,
  corrections: GoalCorrectionMap,
  filter: GoalHistoryFilter,
): boolean {
  if (filter === 'all') return true;
  const isCorrection = corrections[entry.id] !== undefined;
  if (filter === 'correction') return isCorrection;
  return !isCorrection && entry.kind === filter;
}

function monthKey(occurredOn: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) return 'unknown';
  const year = Number(occurredOn.slice(0, 4));
  const month = Number(occurredOn.slice(5, 7));
  const day = Number(occurredOn.slice(8, 10));
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return 'unknown';
  }
  return occurredOn.slice(0, 7);
}

function monthLabel(key: string): string {
  if (key === 'unknown') return 'Tanggal tidak diketahui';
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1));
}

/** Perhitungan neto menggunakan seluruh entri terfilter, bukan hanya yang tampil.
 * Jurnal pembatalan tetap dianggap aktivitas tersendiri, bukan dihapus/disembunyikan.
 */
export function buildGoalHistoryView(
  entries: readonly GoalEntry[],
  correctionMap: GoalCorrectionMap,
  filter: GoalHistoryFilter,
  visibleLimit: number = 30,
): GoalHistoryView {
  const filtered = entries
    .filter(entry => matchesFilter(entry, correctionMap, filter))
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.id - a.id);
  const safeLimit = Number.isFinite(visibleLimit)
    ? Math.min(filtered.length, Math.max(1, Math.floor(visibleLimit)))
    : 30;
  const visible = filtered.slice(0, safeLimit);
  const netRupiah = filtered.reduce((sum, entry) => sum + signedAmount(entry), 0);
  const months: GoalHistoryMonth[] = [];
  for (const entry of visible) {
    const key = monthKey(entry.occurred_on);
    let month = months.find(item => item.key === key);
    if (!month) {
      month = { key, label: monthLabel(key), entries: [], netRupiah: 0 };
      months.push(month);
    }
    month.entries.push(entry);
    month.netRupiah += signedAmount(entry);
  }
  return {
    totalCount: entries.length,
    matchedCount: filtered.length,
    displayedCount: visible.length,
    hasMore: filtered.length > visible.length,
    netRupiah,
    months,
  };
}
