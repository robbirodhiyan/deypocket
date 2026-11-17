/**
 * Advisory savings plan only. Does not debit wallets or create transactions.
 * Month periods include the current month and the goal month.
 */
export type GoalPlan =
  | { status: 'completed'; monthlyAmount: 0; monthsRemaining: 0 }
  | { status: 'no-date'; monthlyAmount: 0; monthsRemaining: 0 }
  | { status: 'overdue'; monthlyAmount: 0; monthsRemaining: 0 }
  | { status: 'active'; monthlyAmount: number; monthsRemaining: number };

type GoalPlanInput = {
  saved: number;
  target: number;
  targetDate: string | null;
  today?: string;
};

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(year, month - 1, day);
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
}

function todayLocal(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function calculateGoalPlan({ saved, target, targetDate, today }: GoalPlanInput): GoalPlan {
  if (!Number.isFinite(target) || target <= 0) return { status: 'no-date', monthlyAmount: 0, monthsRemaining: 0 };
  if (saved >= target) return { status: 'completed', monthlyAmount: 0, monthsRemaining: 0 };
  if (!targetDate || !isValidIsoDate(targetDate)) return { status: 'no-date', monthlyAmount: 0, monthsRemaining: 0 };
  const current = today ?? todayLocal();
  if (!isValidIsoDate(current)) return { status: 'no-date', monthlyAmount: 0, monthsRemaining: 0 };
  if (targetDate < current) return { status: 'overdue', monthlyAmount: 0, monthsRemaining: 0 };

  const startYear = Number(current.slice(0, 4));
  const startMonth = Number(current.slice(5, 7));
  const endYear = Number(targetDate.slice(0, 4));
  const endMonth = Number(targetDate.slice(5, 7));
  const monthsRemaining = (endYear - startYear) * 12 + endMonth - startMonth + 1;
  const monthlyAmount = Math.ceil(Math.max(0, target - Math.max(0, saved)) / monthsRemaining);
  return { status: 'active', monthlyAmount, monthsRemaining };
}
