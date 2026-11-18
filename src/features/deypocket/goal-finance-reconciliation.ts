import type { SQLiteDatabase } from 'expo-sqlite';
import { getGoalFinanceLinks } from './goal-finance-links';

export type GoalFinanceIssue = {
  code: 'missing_entry'|'amount_mismatch'|'kind_mismatch'|'goal_mismatch'|'old_unverified'|'finance_not_found';
  goalId: number; entryId: number; description: string;
};
export type GoalReconciliationReport = {
  checkedAt: string; checkedLinks: number; unverifiedLegacyEntries: number;
  financeVerified: boolean; issues: GoalFinanceIssue[];
};
export type FinanceReferenceInspector = (reference: string) => Promise<{
  amountRupiah: number; occurredOn: string;
} | null>;

/** Read-only. No assumptions about the finance SQL schema. */
export async function reconcileLinkedGoals(
  db: SQLiteDatabase, inspector?: FinanceReferenceInspector
): Promise<GoalReconciliationReport> {
  const links = await getGoalFinanceLinks(db);
  const tables = await db.getAllAsync<{name:string}>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name IN
      ('dp_goal_entries','dp_goal_transfer_records','dp_goal_withdrawal_records')`
  );
  const available = new Set(tables.map(t => t.name));
  const issues: GoalFinanceIssue[] = [];
  const base = available.has('dp_goal_entries')
    ? await db.getAllAsync<{id:number;goal_id:number;kind:string;amount_rupiah:number;occurred_on:string}>(
      `SELECT id,goal_id,kind,amount_rupiah,occurred_on FROM dp_goal_entries`
    ) : [];
  const byId = new Map(base.map(e=>[e.id,e]));
  for (const link of links) {
    const item = byId.get(link.goal_entry_id);
    if (!item) {issues.push({code:'missing_entry',goalId:link.goal_id,entryId:link.goal_entry_id,description:'Jurnal tidak ditemukan.'});continue;}
    if (item.goal_id!==link.goal_id) issues.push({code:'goal_mismatch',goalId:link.goal_id,entryId:item.id,description:'Target pada referensi berbeda.'});
    if (item.kind!==link.direction) issues.push({code:'kind_mismatch',goalId:item.goal_id,entryId:item.id,description:'Jenis jurnal berbeda.'});
    if (inspector) {
      const finance = await inspector(link.finance_reference);
      if (!finance) issues.push({code:'finance_not_found',goalId:item.goal_id,entryId:item.id,description:'Transaksi keuangan tidak ditemukan.'});
      else if (finance.amountRupiah!==item.amount_rupiah || finance.occurredOn!==item.occurred_on)
        issues.push({code:'amount_mismatch',goalId:item.goal_id,entryId:item.id,description:'Nominal/tanggal transaksi dan Target tidak cocok.'});
    }
  }
  const linked = new Set(links.map(e=>e.goal_entry_id));
  const deposits = available.has('dp_goal_transfer_records')
    ? await db.getAllAsync<{goal_entry_id:number}>('SELECT goal_entry_id FROM dp_goal_transfer_records') : [];
  const withdrawals = available.has('dp_goal_withdrawal_records')
    ? await db.getAllAsync<{goal_entry_id:number}>('SELECT goal_entry_id FROM dp_goal_withdrawal_records') : [];
  const legacyIds = new Set([...deposits,...withdrawals].map(r=>r.goal_entry_id));
  let oldCount = 0;
  for(const entryId of legacyIds){if(!linked.has(entryId)){oldCount++; const entry=byId.get(entryId);issues.push({code:'old_unverified',goalId:entry?.goal_id??0,entryId,description:'Transfer lama belum punya referensi transaksi keuangan.'});}}
  return {checkedAt:new Date().toISOString(),checkedLinks:links.length,unverifiedLegacyEntries:oldCount,financeVerified:Boolean(inspector),issues};
}
