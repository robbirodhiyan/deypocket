/** Privacy helpers for user-visible errors / logs; no external services. */
export function redactTechnicalError(message: string): string {
  return message
    .replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]')
    .replace(/(token|secret|password|apikey|api_key)\s*[:=]\s*\S+/gi,'$1=[REDACTED]')
    .replace(/\b[A-Za-z]:\\(?:[^\s]+\\)*[^\s]+/g,'[LOCAL_PATH]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[IP]');
}
export function formatStorageExplanation(): string {
  return 'Data keuangan tersimpan pada perangkat. Tidak ada sinkronisasi cloud otomatis. Simpan backup di tempat pribadi dan jangan membagikan file SQLite kepada pihak lain.';
}
