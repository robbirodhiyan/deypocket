import type { SQLiteDatabase } from 'expo-sqlite';
import { ensureGoalsSchema } from './goals-repository';
import { calculateGoalPlan } from './goal-planner';

/**
 * Sprint 12: analisis yang hanya membaca jurnal Target Tabungan.
 * Tidak membuat transaksi, tidak mengubah saldo dompet, dan tidak mengubah skema.
 * Total riwayat termasuk jurnal koreksi, sehingga pembatalan diperhitungkan.
 */
export type GoalActivity = {
  goalId: number;
  createdAt: string;
  deposits90Days: number;
  withdrawals90Days: number;
  entryCount90Days: number;
};

export type GoalInsights = {
  status: 'completed' | 'no-data' | 'growing' | 'stalled' | 'declining';
  net90Days: number;
  monthlyPaceRupiah: number;
  projectedDate: string | null;
  monthlyGapRupiah: number;
  suggestedMonthlyRupiah: number;
  onSchedule: boolean | null;
  observedDays: number;
};

type GoalActivityRow = {
  goal_id: number;
  created_at: string;
  deposits_90_days: number;
  withdrawals_90_days: number;
  entries_90_days: number;
};

export type GoalActivityMap = Record<number, GoalActivity>;

function isoTodayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  return d;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayDifference(first: Date, second: Date): number {
  return Math.floor((second.getTime() - first.getTime()) / 86_400_000);
}

function addCalendarMonths(date: Date, count: number): string {
  const totalMonths = date.getUTCFullYear() * 12 + date.getUTCMonth() + count;
  const year = Math.floor(totalMonths / 12);
  const month = totalMonths % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return isoDay(new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay))));
}

/** One aggregate SQL query, not an N+1 read for every Goal card. */
export async function getGoalActivityMap(
  db: SQLiteDatabase,
  today: string = isoTodayLocal()
): Promise<GoalActivityMap> {
  const todayDate = parseDay(today);
  if (!todayDate) throw new Error('Tanggal pemeriksaan tidak valid.');
  const startDate = new Date(todayDate.getTime() - 89 * 86_400_000);
  await ensureGoalsSchema(db);
  const rows = await db.getAllAsync<GoalActivityRow>(
    `SELECT g.id AS goal_id, g.created_at,
       COALESCE(SUM(CASE WHEN e.kind = 'deposit' THEN e.amount_rupiah ELSE 0 END), 0) AS deposits_90_days,
       COALESCE(SUM(CASE WHEN e.kind = 'withdrawal' THEN e.amount_rupiah ELSE 0 END), 0) AS withdrawals_90_days,
       COUNT(e.id) AS entries_90_days
     FROM dp_savings_goals g
     LEFT JOIN dp_goal_entries e
       ON e.goal_id = g.id
       AND e.occurred_on >= ? AND e.occurred_on <= ?
     WHERE g.archived_at IS NULL
     GROUP BY g.id, g.created_at`,
    [isoDay(startDate), today]
  );
  const byGoal: GoalActivityMap = {};
  for (const row of rows) {
    byGoal[row.goal_id] = {
      goalId: row.goal_id,
      createdAt: row.created_at,
      deposits90Days: row.deposits_90_days,
      withdrawals90Days: row.withdrawals_90_days,
      entryCount90Days: row.entries_90_days,
    };
  }
  return byGoal;
}

/**
 * Perkiraan konservatif berdasarkan saldo dan setoran bersih 90 hari terakhir.
 * Untuk target baru, laju dibagi minimal 30 hari agar setoran di hari pertama
 * tidak langsung diasumsikan berlangsung setiap hari sepanjang bulan.
 */
export function calculateGoalInsights(input: {
  savedRupiah: number;
  targetRupiah: number;
  targetDate: string | null;
  activity: GoalActivity;
  today?: string;
}): GoalInsights {
  const todayString = input.today ?? isoTodayLocal();
  const today = parseDay(todayString);
  if (!today) throw new Error('Tanggal analisis tidak valid.');
  const createdDay = parseDay(input.activity.createdAt.slice(0, 10));
  const observed = createdDay ? dayDifference(createdDay, today) + 1 : 90;
  const observedDays = Math.max(30, Math.min(90, Math.max(1, observed)));
  const net90Days = input.activity.deposits90Days - input.activity.withdrawals90Days;
  const monthlyPaceRupiah = Math.max(0, Math.round(net90Days * 30 / observedDays));
  const remaining = Math.max(0, input.targetRupiah - Math.max(0, input.savedRupiah));
  const plan = calculateGoalPlan({
    saved: input.savedRupiah,
    target: input.targetRupiah,
    targetDate: input.targetDate,
    today: todayString,
  });
  const suggestedMonthlyRupiah = plan.status === 'active' ? plan.monthlyAmount : 0;
  const monthlyGapRupiah = plan.status === 'active'
    ? Math.max(0, suggestedMonthlyRupiah - monthlyPaceRupiah)
    : 0;
  const onSchedule = plan.status === 'active'
    ? monthlyPaceRupiah >= suggestedMonthlyRupiah
    : null;
  let projectedDate: string | null = null;
  if (remaining > 0 && monthlyPaceRupiah > 0) {
    const months = Math.ceil(remaining / monthlyPaceRupiah);
    // Very distant projections are not useful and can be misleading.
    if (months <= 120) projectedDate = addCalendarMonths(today, months);
  }
  const status: GoalInsights['status'] = remaining === 0
    ? 'completed'
    : input.activity.entryCount90Days === 0
      ? 'no-data'
      : net90Days < 0
        ? 'declining'
        : net90Days === 0
          ? 'stalled'
          : 'growing';

  return {
    status,
    net90Days,
    monthlyPaceRupiah,
    projectedDate,
    monthlyGapRupiah,
    suggestedMonthlyRupiah,
    onSchedule,
    observedDays,
  };
}
