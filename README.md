# DeyPocket — Goals & Manage Stability v2

Paket **siap paste, tanpa installer**. Berdasarkan source Sprint 7 sebelumnya dan dua screenshot tampilan pada 16 November 2026.

## Perbaikan

1. `src/app/goals/index.tsx`
   - Kartu dirender menggunakan `View` dengan alur vertikal normal, bukan nested `Card.Content` yang berpotensi memunculkan tinggi/overlap tak terduga pada web.
   - Angka terkumpul memiliki warna teks eksplisit, tidak lagi berisiko tidak terlihat pada dark theme.
   - Nominal TARGET/SISA berada dalam panel terpisah **di atas** tombol Setor/Riwayat, bukan bertumpuk di belakangnya.
   - Menu tiga titik diganti bottom-sheet `Modal`, tidak menambah tinggi kartu maupun menimpa tombol.
   - Konfirmasi Arsip, Aktifkan, Hapus menggunakan `Modal` lintas Android/web, **bukan `Alert.alert`** yang mungkin tidak tampil pada web.
   - Error/sukses operasi tampil sebagai pesan pada halaman.
   - Pembaruan list langsung setelah operasi selesai.

2. `src/app/goals/manage.tsx`
   - Form ringkas dengan pemisah informasi utama dan detail opsional.
   - Input nominal, preset, dan preview tidak saling bertumpuk.
   - Tindakan buat/edit/setor/kurangi dipisahkan menurut `mode` URL; validasi aman dan tombol Simpan bisa disentuh saat keyboard terbuka.

3. `src/features/deypocket/goals-repository.ts`
   - Tetap menggunakan query atomic delete, dengan pengecekan ulang langsung di SQLite: hanya target tanpa *satu pun* baris riwayat yang boleh dihapus permanen.
   - Tidak mengubah tabel transaksi lama atau perlu migration baru.

## Instalasi (tanpa installer)

1. Ekstrak ZIP di folder lain, misalnya `Downloads\\DeyPocketGoalsFix`.
2. Backup ketiga file lama jika perlu.
3. Copy folder `src` dari ZIP ke folder proyek DeyPocket yang berisi `package.json` dan pilih **Replace files**.
4. Buka CMD di folder proyek:

```cmd
npm run validate
npx tsc --noEmit
npx expo start --clear
```

Pastikan Metro memuat build terbaru. Jika aplikasi web masih tampil lama, lakukan hard refresh. Jika menggunakan APK, reload aplikasi atau publikasikan OTA setelah validasi berhasil.

## Tes penerimaan yang penting

1. Buat target `Tes Hapus` tanpa setoran.
2. Pada kartu target, tekan **tiga titik → Hapus Permanen → Hapus**. Target hilang dari daftar.
3. Buat target lain, tekan **tiga titik → Arsipkan Target → Arsipkan**. Target pindah ke tab **Arsip**.
4. Pada tab Arsip, tekan **Aktifkan**, lalu konfirmasi. Target kembali ke tab **Aktif**.
5. Pada target dengan setoran, tindakan **Hapus Permanen** tidak ditampilkan. Jika setor lalu kurangi sampai Rp0, riwayat tetap ada sehingga hapus permanen tetap dilarang.
6. Cek layar kecil: nominal Terkumpul, panel TARGET/SISA, dan tombol Setor/Riwayat harus tampil secara berurutan tanpa overlap.
7. Pada Manage, buat target, ubah nominal, catat setoran, kurangi sebagian setoran, lalu cek Riwayat.

## Catatan

- Tidak menambah npm dependency atau mengubah native Expo config.
- Tidak memodifikasi saldo rekening saat catat setoran; hanya pencatatan progres tabungan.
- Source baru telah diperiksa secara sintaks TypeScript/TSX. Query penghapusan diuji pada SQLite dengan kasus target kosong dan target yang memiliki riwayat tetapi saldonya kembali nol.
- Pengujian `npm run validate` pada proyek Windows serta uji visual Android/web nyata masih harus dilakukan di proyek DeyPocket pengguna.
