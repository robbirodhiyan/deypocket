# DeyPocket Sprint 10 — Perbaikan TS2353 goal-transfer.ts

Perbaikan khusus error `Object literal may only specify known properties, and 'kind' does not exist in type 'CreateTransferInput'`.

## Pemasangan tanpa installer

1. Ekstrak ZIP di luar folder proyek.
2. Salin folder `src` ke root `C:\laragon\project\deypocket`, lalu replace hanya `src/features/deypocket/goal-transfer.ts`.
3. Jalankan di CMD:

```cmd
cd /d C:\laragon\project\deypocket
npm run validate
npx tsc --noEmit
```

## Perubahan

- Menghapus properti `kind: 'transfer'` pada pemanggilan `createTransfer()` saat Ambil.
- Menghapus properti yang sama dari objek draft saat Setor, agar konsisten dengan `CreateTransferInput`.
- Tidak mengubah skema SQLite, alur saldo, nominal, validasi, atau riwayat target.

`createTransfer()` sudah merupakan fungsi khusus transfer, sehingga properti `kind` tidak diperlukan di argumennya. Jangan ubah `kind` yang dipakai ledger `dp_goal_entries` (deposit/withdrawal).

**Pengujian**: verifikasi source dan ZIP; belum diuji dengan keseluruhan dependensi asli pengguna atau runtime Android. **Sebelum OTA**, uji Setor/Ambil dan rollback menggunakan data percobaan karena transaksi keuangan terdampak.
