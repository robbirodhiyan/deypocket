# DeyPocket — Sprint 9.1 Unified Goals (Ready Paste)

Menggunakan source Sprint 9 sebagai dasar. Tidak ada installer.

## Yang berubah

- Kartu Target: **Setor**, **Ambil**, **Lihat Riwayat**. Tidak ada menu terpisah “Transfer & Setor” atau “Kurangi Tabungan”.
- **Jika rekening target terhubung**: Setor = transfer masuk + catatan deposit, Ambil = transfer keluar + catatan withdrawal. Keduanya memakai `withExclusiveTransactionAsync` (Android/iOS) dengan validasi saldo serta penguncian duplikasi operasi.
- **Jika tidak terhubung**: tombol tetap mencatat setoran/pengurangan virtual dan **tidak mengubah saldo** rekening. Teks pada form menerangkan perbedaannya.
- Riwayat lama tidak dihapus. Pengurangan dibatasi oleh saldo target tercatat; pengambilan dari rekening juga memeriksa saldo rekening asal.
- Menu tiga titik hanya untuk edit, kaitan rekening, arsip, dan hapus permanen sesuai aturan Sprint 7.
- Link rekening bersifat satu-target-satu-rekening berdasarkan tabel Sprint 8; rekening yang belum memiliki transaksi target tidak otomatis disinkronkan dari saldo historis.

## Pasang

1. Ekstrak ZIP di luar folder proyek.
2. Cadangkan file lama, lalu copy folder `src` ke root proyek DeyPocket.
3. Ganti tiga file:
   - `src/app/goals/index.tsx`
   - `src/app/goals/manage.tsx`
   - `src/features/deypocket/goal-transfer.ts`
4. Dependensi Sprint 7, 8 dan `finance-repository.ts` asli harus tetap tersedia.

```
cd /d C:\laragon\project\deypocket
npm run validate
npx tsc --noEmit
npx expo start --clear
```

## Uji wajib sebelum OTA

- Target tanpa rekening: Setor/Ambil mengubah progres dan riwayat tetapi **tidak** mengubah saldo.
- Target dengan rekening: Setor dari akun A -> rekening target B, saldo A turun, saldo B naik, progres bertambah satu kali.
- Ambil dari B -> A: saldo B turun, saldo A naik, progres turun, riwayat pengambilan tercatat.
- Saldo tujuan/asal dan histori dengan gagal-query harus rollback. Tombol simpan tidak boleh menimbulkan transaksi ganda.
- Uji rekening asal saldo tidak cukup, target saldo tidak cukup, rekening sama, target arsip, dan web unsupported.
- Transfer langsung melalui menu Transaksi *tidak* otomatis menambah/mengurangi progres Target; gunakan tombol Setor/Ambil di kartu.

**Peringatan:** `createTransfer()` asli dari `finance-repository.ts` belum tersedia dalam paket input untuk diuji end-to-end. Fitur ini menyimpan transaksi keuangan; **jangan publikasi OTA** sampai `npm run validate` dan uji Android nyata dengan data uji dan rollback berhasil. Repo ini mereuse fungsi transfer yang sudah dipakai Sprint 9.
