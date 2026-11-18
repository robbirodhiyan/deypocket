/** DeyPocket v1.1 — interface, not a replacement for the finance ledger. */
import type { SQLiteDatabase } from 'expo-sqlite';

export type GoalMovementDirection = 'deposit' | 'withdrawal';
export type GoalFinanceMovement = {
  operationId: string; goalId: number; walletId: number;
  amountRupiah: number; occurredOn: string; note: string;
  direction: GoalMovementDirection;
};
export type FinanceTransferDraft = {
  fromAccountId: number; toAccountId: number;
  amountRupiah: number; occurredOn: string; note: string;
};
export type FinanceTransferAdapter = {
  // Must read from the actual finance ledger, within the supplied transaction.
  getWalletBalance(txn: SQLiteDatabase, walletId: number): Promise<number>;
  // Must use txn for every SQL statement. Must return an immutable finance ID.
  // A createTransfer that returns void is NOT suitable until adapted.
  createTransferWithReference(txn: SQLiteDatabase, draft: FinanceTransferDraft): Promise<string>;
};

export function assertGoalMovement(input: GoalFinanceMovement): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{11,119}$/.test(input.operationId)) {
    throw new Error('ID operasi tidak valid. Gunakan ID yang stabil dan unik untuk setiap aksi.');
  }
  if (!Number.isSafeInteger(input.goalId) || input.goalId <= 0 ||
      !Number.isSafeInteger(input.walletId) || input.walletId <= 0) {
    throw new Error('ID target atau rekening tidak valid.');
  }
  if (!Number.isSafeInteger(input.amountRupiah) ||
      input.amountRupiah <= 0 || input.amountRupiah > 999_999_999_999) {
    throw new Error('Nominal rupiah tidak valid.');
  }
  if (input.direction !== 'deposit' && input.direction !== 'withdrawal') {
    throw new Error('Jenis transaksi target tidak valid.');
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.occurredOn);
  if (!m) throw new Error('Tanggal tidak valid.');
  const d = new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2])-1 ||
      d.getDate() !== Number(m[3])) throw new Error('Tanggal tidak valid.');
  if (input.note.length > 250) throw new Error('Catatan maksimal 250 karakter.');
}
