import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Sprint 10 – read-only reconciliation for DeyPocket's savings-goal ledger.
 * This checks relationships between goal entries and the two Goal transfer
 * metadata tables. It does NOT claim to verify the underlying finance ledger:
 * legacy createTransfer() does not return a stable finance transaction ID.
 */
export type GoalAuditProblem = {
  code: 'negative_balance' | 'invalid_target' | 'orphan_entry' |
    'orphan_transfer' | 'wrong_kind' | 'different_amount' |
    'different_date' | 'wrong_goal' | 'duplicate_reference';
  goalId: number | null;
  goalName: string;
  description: string;
};

export type GoalAuditReport = {
  checkedAt: string;
  goalCount: number;
  entryCount: number;
  linkedDeposits: number;
  linkedWithdrawals: number;
  manualEntries: number;
  problems: GoalAuditProblem[];
  financeLedgerVerified: false;
};

export type GoalEntrySource = 'rekening' | 'manual';

export type GoalEntrySourceMap = Record<number, GoalEntrySource>;

type GoalRow = { id: number; title: string; target_rupiah: number };
type EntryRow = {
  id: number;
  goal_id: number;
  kind: string;
  amount_rupiah: number;
  occurred_on: string;
};
type RecordRow = {
  id: number;
  goal_entry_id: number;
  goal_id: number;
  amount_rupiah: number;
  occurred_on: string;
};

type DatabaseTable = 'dp_savings_goals' | 'dp_goal_entries' |
  'dp_goal_transfer_records' | 'dp_goal_withdrawal_records';

async function existingTables(db: SQLiteDatabase): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table'
       AND name IN ('dp_savings_goals', 'dp_goal_entries',
         'dp_goal_transfer_records', 'dp_goal_withdrawal_records')`
  );
  return new Set(rows.map((row) => row.name));
}

async function recordsFrom(
  db: SQLiteDatabase,
  tables: Set<string>,
  name: DatabaseTable,
  goalId?: number
): Promise<RecordRow[]> {
  if (!tables.has(name)) return [];
  // The table name comes only from a hardcoded allowlist – no dynamic SQL from input.
  if (goalId === undefined) {
    return db.getAllAsync<RecordRow>(
      `SELECT id, goal_entry_id, goal_id, amount_rupiah, occurred_on FROM ${name}`
    );
  }
  return db.getAllAsync<RecordRow>(
    `SELECT id, goal_entry_id, goal_id, amount_rupiah, occurred_on FROM ${name} WHERE goal_id = ?`,
    [goalId]
  );
}

/** Returns the source of each entry. Manual entries are not automatically errors. */
export async function getGoalEntrySourceMap(
  db: SQLiteDatabase,
  goalId: number
): Promise<GoalEntrySourceMap> {
  if (!Number.isSafeInteger(goalId) || goalId <= 0) {
    throw new Error('ID target tidak valid.');
  }
  const tables = await existingTables(db);
  const [deposits, withdrawals] = await Promise.all([
    recordsFrom(db, tables, 'dp_goal_transfer_records', goalId),
    recordsFrom(db, tables, 'dp_goal_withdrawal_records', goalId),
  ]);
  const result: GoalEntrySourceMap = {};
  for (const record of [...deposits, ...withdrawals]) {
    result[record.goal_entry_id] = 'rekening';
  }
  return result;
}

/** Reads only, never edits finance balances or goals. */
export async function auditSavingsGoals(db: SQLiteDatabase): Promise<GoalAuditReport> {
  const tables = await existingTables(db);
  const empty: GoalAuditReport = {
    checkedAt: new Date().toISOString(),
    goalCount: 0,
    entryCount: 0,
    linkedDeposits: 0,
    linkedWithdrawals: 0,
    manualEntries: 0,
    problems: [],
    financeLedgerVerified: false,
  };

  if (!tables.has('dp_savings_goals') && !tables.has('dp_goal_entries')) {
    return empty;
  }
  if (!tables.has('dp_savings_goals') || !tables.has('dp_goal_entries')) {
    return {
      ...empty,
      problems: [{
        code: 'orphan_entry', goalId: null, goalName: 'Database Target',
        description: 'Struktur tabel Target belum lengkap. Jangan melakukan perubahan data sebelum diperiksa.',
      }],
    };
  }

  // One coherent read snapshot where possible: all queries are SELECTs.
  const goals = await db.getAllAsync<GoalRow>(
    'SELECT id, title, target_rupiah FROM dp_savings_goals'
  );
  const entries = await db.getAllAsync<EntryRow>(
    'SELECT id, goal_id, kind, amount_rupiah, occurred_on FROM dp_goal_entries'
  );
  const depositRecords = await recordsFrom(db, tables, 'dp_goal_transfer_records');
  const withdrawalRecords = await recordsFrom(db, tables, 'dp_goal_withdrawal_records');

  const goalById = new Map(goals.map((goal) => [goal.id, goal]));
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const balances = new Map<number, number>();
  const problems: GoalAuditProblem[] = [];
  const linkedEntries = new Map<number, 'deposit' | 'withdrawal'>();

  function issue(
    code: GoalAuditProblem['code'], goalId: number | null,
    description: string
  ) {
    problems.push({
      code,
      goalId,
      goalName: goalId !== null ? goalById.get(goalId)?.title ?? `Target #${goalId}` : 'Catatan Target',
      description,
    });
  }

  for (const goal of goals) {
    balances.set(goal.id, 0);
    if (!Number.isSafeInteger(goal.target_rupiah) || goal.target_rupiah <= 0) {
      issue('invalid_target', goal.id, 'Nominal target tidak valid.');
    }
  }

  for (const entry of entries) {
    if (!goalById.has(entry.goal_id)) {
      issue('orphan_entry', entry.goal_id, `Catatan #${entry.id} tidak memiliki target.`);
      continue;
    }
    if (entry.kind !== 'deposit' && entry.kind !== 'withdrawal') {
      issue('wrong_kind', entry.goal_id, `Jenis catatan #${entry.id} tidak dikenal.`);
      continue;
    }
    if (!Number.isSafeInteger(entry.amount_rupiah) || entry.amount_rupiah <= 0) {
      issue('different_amount', entry.goal_id, `Nominal catatan #${entry.id} tidak valid.`);
      continue;
    }
    balances.set(
      entry.goal_id,
      (balances.get(entry.goal_id) ?? 0) +
        (entry.kind === 'deposit' ? entry.amount_rupiah : -entry.amount_rupiah)
    );
  }

  function inspectRecord(record: RecordRow, expectedKind: 'deposit' | 'withdrawal') {
    const entry = entryById.get(record.goal_entry_id);
    if (!entry) {
      issue('orphan_transfer', record.goal_id,
        `Referensi transfer #${record.id} (${expectedKind}) tidak memiliki catatan Target.`);
      return;
    }
    const previous = linkedEntries.get(entry.id);
    if (previous) {
      issue('duplicate_reference', entry.goal_id,
        `Catatan #${entry.id} ditautkan ke lebih dari satu referensi transfer.`);
    }
    linkedEntries.set(entry.id, expectedKind);
    if (entry.kind !== expectedKind) {
      issue('wrong_kind', entry.goal_id,
        `Jenis catatan #${entry.id} berbeda dari referensi transfer.`);
    }
    if (record.goal_id !== entry.goal_id) {
      issue('wrong_goal', entry.goal_id,
        `Referensi transfer #${record.id} menunjuk target yang berbeda.`);
    }
    if (record.amount_rupiah !== entry.amount_rupiah) {
      issue('different_amount', entry.goal_id,
        `Nominal transfer #${record.id} berbeda dari catatan #${entry.id}.`);
    }
    if (record.occurred_on !== entry.occurred_on) {
      issue('different_date', entry.goal_id,
        `Tanggal transfer #${record.id} berbeda dari catatan #${entry.id}.`);
    }
  }

  for (const record of depositRecords) inspectRecord(record, 'deposit');
  for (const record of withdrawalRecords) inspectRecord(record, 'withdrawal');

  for (const goal of goals) {
    const balance = balances.get(goal.id) ?? 0;
    if (!Number.isSafeInteger(balance) || balance < 0) {
      issue('negative_balance', goal.id,
        'Jumlah tabungan hasil perhitungan riwayat bernilai negatif atau tidak valid.');
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    goalCount: goals.length,
    entryCount: entries.length,
    linkedDeposits: depositRecords.length,
    linkedWithdrawals: withdrawalRecords.length,
    manualEntries: entries.filter((entry) => !linkedEntries.has(entry.id)).length,
    problems,
    financeLedgerVerified: false,
  };
}
