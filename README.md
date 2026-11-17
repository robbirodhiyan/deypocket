# DeyPocket — Sprint 9: Transfer & Setor Target (Atomic)

**ZIP siap paste, tanpa installer, tanpa dependency baru.** Dibangun dari source Sprint 8 (Goals + rekening target + planner) serta form Manage dari perbaikan Sprint 7 terakhir.

## Fitur

- Target yang telah dihubungkan ke rekening melalui **⋮ → Hubungkan Rekening** sekarang memiliki pilihan **⋮ → Transfer & Setor**.
- Pilih rekening asal (saldo tersedia), nominal, tanggal, dan keterangan; rekening tujuan diambil otomatis dari rekening terkait Target.
- Transfer dilakukan menggunakan fungsi transaksi DeyPocket yang sudah ada: `createTransfer()` dari `finance-repository.ts`.
- Dalam **satu transaksi SQLite eksklusif**, dibuat (1) transfer rekening, (2) setoran di `dp_goal_entries`, dan (3) jejak audit `dp_goal_transfer_records`. Jika ada tahap gagal, seluruh operasi di-**rollback**.
- Ada konfirmasi sebelum transfer, pemeriksaan saldo asal, larangan rekening asal = rekening tujuan, pencegahan simpan ganda selama form aktif, dan identitas operasi yang unik.
- Fitur Setor manual, Kurangi, Edit, Arsip, Hapus Permanen, Riwayat, dan planner tetap ada.
- **Tidak ada perubahan tabel finance**. `dp_goal_transfer_records` adalah tabel baru yang hanya menyimpan referensi pencatatan target dan metadata rekening/nominal; tidak menyimpan informasi rahasia.
- Tidak ada route baru: masih menggunakan `/goals/manage?mode=transfer`.

## Struktur ZIP

```text
src/
├── app/goals/
│   ├── index.tsx                    REPLACE (dari Sprint 8)
│   └── manage.tsx                   REPLACE (dari Sprint 7)
└── features/deypocket/
    └── goal-transfer.ts            NEW
README.md
```

**Pastikan file dari Sprint 7 dan 8 masih ada:**

- `src/features/deypocket/goals-repository.ts`
- `src/features/deypocket/goal-wallet-repository.ts`
- `src/features/deypocket/goal-planner.ts`
- `src/features/deypocket/finance-repository.ts` (punya fungsi `createTransfer`)
- `src/features/deypocket/finance-management.ts` (punya `getWallets`)

## Pemasangan tanpa installer

1. Cadangkan source yang akan di-replace, terutama `src/app/goals/index.tsx` dan `manage.tsx`.
2. Ekstrak ZIP di **luar** folder proyek.
3. Salin folder `src` ke root proyek DeyPocket yang berisi `package.json`; pilih **Replace** jika diminta.
4. Validasi dari CMD:

```cmd
cd /d C:\laragon\project\deypocket
npm run validate
npx tsc --noEmit
npx expo start --clear
```

**Jangan langsung publish OTA sebelum validasi dan tes APK.** Source `finance-repository.ts` yang asli tidak termasuk paket-paket yang tersedia di sesi ini. Sprint 9 mengintegrasikan `createTransfer(db, draft)` berdasarkan signature yang telah digunakan di halaman Transaksi, tetapi masih perlu tes terhadap kode finance asli di proyek pengguna.

## Cara pakai

1. Buat/aktifkan target.
2. Di kartu Target, tekan **⋮ → Hubungkan Rekening**; pilih rekening tujuan khusus menabung.
3. Tekan **⋮ → Transfer & Setor**.
4. Pilih rekening asal berbeda, isi nominal (saldo harus cukup), tanggal, dan keterangan.
5. Tekan **Transfer & Catat Setoran**, tinjau ringkasan konfirmasi, lalu pilih **Transfer**.
6. Setelah kembali ke halaman Goals, cek **progres target**, **saldo rekening terkait**, dan **Riwayat**.
7. Periksa juga menu Transaksi untuk memastikan transfer tercatat tepat satu kali.

Perbedaan dari tombol **Setor** biasa: tombol Setor hanya menambahkan catatan target virtual. **Transfer & Setor** menambah catatan target **dan** membuat transfer rekening sungguhan di aplikasi.

## Batasan keamanan dan akuntansi

- **Hanya Android/iOS.** `withExclusiveTransactionAsync` Expo SQLite tidak didukung di web. Tombol simpan mode terintegrasi dinonaktifkan pada web; gunakan APK untuk tes.
- Karena `createTransfer()` yang asli belum dapat diperiksa di sesi ini, pengujian rollback dilakukan menggunakan adapter finance simulasi, bukan terhadap skema keuangan aktual. Jangan pakai transaksi riil hingga uji end-to-end pada APK berhasil.
- **Jangan mengedit/menghapus transaksi transfer yang terkait Target secara terpisah** sebelum fitur sinkronisasi balik transfer↔setoran ditambahkan. Sprint ini hanya menjamin dua perubahan atomik **saat dibuat**, belum menjaga perubahan setelah transaksi diedit/dihapus dari layar Transaksi.
- Rekening yang ditautkan tidak otomatis didedikasikan secara eksklusif pada level database transaksi. Pengeluaran/transfer lain pada rekening target tetap mungkin dan akan memengaruhi saldo rekening, tetapi tidak otomatis mengubah catatan progres Goal.
- Jangan membuat setoran virtual sekali lagi setelah menjalankan Transfer & Setor; itu akan menggandakan progres target.
- Jangan hapus data aplikasi untuk troubleshooting, karena transaksi dan target tersimpan pada SQLite lokal.

## Pengujian yang sudah dilakukan

- Sintaks TypeScript/TSX ketiga file: lolos transpile pemeriksaan sintaks.
- SQLite simulasi: 9 kasus PASS: commit transfer dan setoran bersama, key duplikat ditolak, saldo asal tidak cukup, asal = tujuan ditolak, target arsip ditolak, rekening target belum ada, dua jenis kegagalan finance rollback, dan kegagalan setoran rollback transaksi finance.
- **Belum** menjalankan `npm run validate` terhadap keseluruhan proyek pengguna, belum menguji Android nyata, dan belum memeriksa implementasi asli `finance-repository.ts`.

## OTA (setelah tes APK berhasil)

```cmd
npx eas-cli@latest update --channel preview --environment preview --platform android --message "feat: atomic wallet transfer with savings goal deposit"
```

Tidak ada native dependency baru. Namun perubahan ini menyentuh transaksi keuangan; prioritas utama adalah validasi dan pengujian aman dengan data uji.
