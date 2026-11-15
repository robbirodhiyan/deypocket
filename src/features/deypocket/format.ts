
export function formatRupiah(amount: number): string {
  if (!Number.isFinite(amount)) return 'Rp 0';

  return `Rp ${Math.trunc(amount).toLocaleString('id-ID')}`;
}

export function getLocalDate(): string {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
