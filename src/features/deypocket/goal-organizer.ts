import type { SavingsGoal } from './goals-repository';

/** Sprint 14 — Pengelolaan daftar Target Tabungan.
 * Murni mengolah array target hasil SQLite: tidak mengubah transaksi/progres.
 */
export type GoalDisplayStatus = 'all' | 'in_progress' | 'completed';
export type GoalSortKey = 'newest' | 'deadline' | 'progress' | 'remaining';

export type GoalOrganizerOptions = {
  query: string;
  status: GoalDisplayStatus;
  sort: GoalSortKey;
  archived: boolean;
};

function normalizeQuery(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('id-ID').trim();
}

function compareNewest(a: SavingsGoal, b: SavingsGoal): number {
  return b.created_at.localeCompare(a.created_at) || b.id - a.id;
}

function remaining(goal: SavingsGoal): number {
  return Math.max(0, goal.target_rupiah - goal.saved_rupiah);
}

function completionRatio(goal: SavingsGoal): number {
  return goal.target_rupiah > 0 ? goal.saved_rupiah / goal.target_rupiah : 0;
}

/**
 * Pencarian mencakup nama target dan catatan.
 * Status hanya berlaku pada tab Aktif; arsip selalu dapat ditelusuri.
 * Peringkat sama memakai created_at/id supaya hasil stabil dan deterministik.
 */
export function organizeSavingsGoals(
  goals: readonly SavingsGoal[],
  options: GoalOrganizerOptions,
): SavingsGoal[] {
  const needle = normalizeQuery(options.query);
  const matched = goals.filter(goal => {
    const textMatches = !needle || normalizeQuery(`${goal.title} ${goal.note || ''}`).includes(needle);
    if (!textMatches) return false;
    if (options.archived || options.status === 'all') return true;
    const completed = goal.saved_rupiah >= goal.target_rupiah;
    return options.status === 'completed' ? completed : !completed;
  });

  // Selalu salin, agar array state dan urutan dari DB tidak pernah dimutasi.
  return matched.sort((a, b) => {
    switch (options.sort) {
      case 'deadline': {
        // Target yang belum mempunyai tanggal tenggat berada paling akhir.
        if (!a.target_date && !b.target_date) return compareNewest(a, b);
        if (!a.target_date) return 1;
        if (!b.target_date) return -1;
        return a.target_date.localeCompare(b.target_date) || compareNewest(a, b);
      }
      case 'progress':
        return completionRatio(b) - completionRatio(a) || compareNewest(a, b);
      case 'remaining':
        return remaining(a) - remaining(b) || compareNewest(a, b);
      default:
        return compareNewest(a, b);
    }
  });
}
