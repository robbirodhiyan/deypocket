# DeyPocket — Sprint 13: Riwayat Target Pintar (Production)

Patch **siap paste tanpa installer**, dibuat dari source `DeyPocket_Sprint12_Goal_Insights_ReadyPaste` (yang meneruskan Sprint 11 Production Cleanup). Tidak membawa data dummy maupun tombol pengetesan.

## Fitur

1. **Filter riwayat per target**: Semua, Setoran, Pengambilan, Koreksi.
2. **Koreksi ditampilkan terpisah** dari filter Setoran/Pengambilan. Jurnal asli dan jurnal pembalikan tetap ditampilkan bersama ketika filter Koreksi dipilih; tidak ada penghapusan atau perubahan data.
3. **Timeline bulanan**, mengelompokkan aktivitas sesuai `occurred_on` (tanggal transaksi/catatan).
4. **Ringkasan terfilter**: jumlah aktivitas dan perubahan bersih setoran minus pengambilan untuk **seluruh hasil filter**, bukan hanya 30 baris yang saat ini dimuat.
5. **Pemuatan bertahap**: 30 baris pertama, kemudian `Muat 30 berikutnya` supaya halaman riwayat lebih ringan.
6. Mode **Aktif/Arsip**, Setor, Ambil, pembatalan catatan manual, pengaitan rekening, audit target, dan analisis ritme Sprint 12 tetap dipertahankan.

### Penting mengenai progres/saldo

- Modul `goal-history.ts` **hanya mengolah array riwayat yang sudah dibaca**; tidak melakukan `INSERT/UPDATE/DELETE` dan tidak mengubah saldo Dompet/Rekening.
- Koreksi sudah tercatat sebagai jurnal baru dari Sprint 11. Filter Koreksi hanya mengubah cara menampilkan jurnal itu.
- Sinkronisasi otomatis edit/hapus transfer melalui menu Transaksi belum tersedia pada source ini. Jangan anggap filter ini memperbaiki integrasi transfer.
- Ringkasan berlabel **Perubahan bersih** menyajikan penjumlahan nominal untuk catatan dalam filter. Untuk filter Setoran, Pengambilan, atau Koreksi, angka tersebut **bukan saldo tabungan keseluruhan**.

## Isi paket

```
src/
├── app/
│   └── goals/
│       └── index.tsx              REPLACE (berbasis Sprint 12)
└── features/
    └── deypocket/
        └── goal-history.ts        BARU
README.md
```

## Cara pasang

1. Sebelum replace, commit/backup source yang sudah berjalan.
2. Ekstrak ZIP **di luar** direktori proyek, lalu copy folder `src` ke root proyek DeyPocket; pilih **replace** hanya untuk `src/app/goals/index.tsx`.
3. File `src/features/deypocket/goal-history.ts` adalah file baru.
4. **Jangan hapus** file Sprint 9–12 seperti `goal-corrections.ts`, `goal-audit.ts`, `goal-insights.ts`, `goals-repository.ts`, atau `goal-transfer.ts`.
5. Pastikan file `goal-demo-data.ts` dari sprint demo sebelumnya sudah tidak ada di production.

```cmd
cd /d C:\laragon\project\deypocket
npm run validate
npx tsc --noEmit
npx expo start --clear
```

## Checklist uji di Android

- Buka Target Tabungan, buka Riwayat pada target yang memiliki beberapa aktivitas.
- Filter **Setoran** hanya menampilkan aktivitas Setor biasa (tidak termasuk koreksi yang jenis jurnalnya `deposit`).
- Filter **Pengambilan** hanya menampilkan aktivitas Ambil biasa (tidak termasuk koreksi yang jenis jurnalnya `withdrawal`).
- Filter **Koreksi** menampilkan jurnal yang dibatalkan beserta jurnal pembaliknya.
- Filter **Semua** menampilkan seluruh aktivitas; saldo bersih seharusnya cocok dengan progres target jika jurnal datanya konsisten.
- Lihat riwayat lintas bulan; setiap catatan masuk ke kelompok bulan berdasarkan tanggalnya.
- Jika riwayat >30, `Muat 30 berikutnya` menampilkan tambahan aktivitas, tanpa mengubah nominal ringkasan semua hasil filter.
- Setelah membatalkan satu catatan manual, riwayat dan ringkasan diperbarui.
- Tes juga tab Arsip serta navigasi Setor/Ambil.

## Yang sudah diuji di lingkungan pengembangan

- 17 pengujian unit pure TypeScript untuk filter, pengelompokan tanggal, jurnal koreksi, ringkasan neto, sorting, pagination, dan immutability: **PASS**.
- TypeScript `strict` untuk modul baru dengan definisi tipe yang cocok dengan source Sprint 11–12: **PASS**.
- Pemeriksaan sintaks/transpilasi `index.tsx` dan `goal-history.ts`: **PASS**.
- **Belum** menjalankan `npm run validate` di proyek DeyPocket lengkap dan **belum** menguji APK Android. Jalankan pemeriksaan tersebut sebelum OTA.

Tidak perlu package native, perubahan database, ataupun izin Android baru.
