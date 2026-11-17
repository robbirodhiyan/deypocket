# DeyPocket — Updates Screen Modern

Pembaruan UI/UX `src/app/updates.tsx`, tanpa installer dan tanpa dependency baru.

## Pemasangan

1. Ekstrak ZIP di luar direktori proyek.
2. Salin folder `src` ke root DeyPocket (folder yang berisi `package.json`).
3. Replace `src/app/updates.tsx`.
4. Validasi dari CMD:

```cmd
cd /d C:\laragon\project\deypocket
npm run validate
npx tsc --noEmit
```

## Perubahan

- Informasi teknis (channel, runtime, build, sumber GitHub, SDK, dan developer notes) tidak lagi tampil.
- Tidak ada pengulangan label "DEYPOCKET" dan kartu informasi tidak penting.
- Menampilkan versi ringkas dan dua pilihan pembaruan yang mudah dipahami.
- Tombol OTA masih memanggil `checkOtaSession`, `downloadOtaSession`, dan `reloadOtaSession`.
- Tombol APK masih memeriksa GitHub Release publik dan membuka tautan resmi yang dikembalikan oleh service `update-release`.
- Komponen OTA menggunakan state global yang sama dengan dialog update saat startup.
- Menampilkan status hanya bila ada hasil yang perlu diketahui pengguna.
- Dialog konfirmasi ringkas dan mempertahankan peringatan terkait data lokal.
- Kartu APK hanya muncul pada Android jika konfigurasi release tersedia.

## Uji fungsional

- Tanpa update: status "sudah terbaru" sesudah pemeriksaan.
- Ada update OTA: unduh -> pasang -> konfirmasi -> reload.
- Offline: menampilkan pesan singkat dan tombol "Coba Lagi".
- APK lebih baru: tampil versi baru -> konfirmasi -> membuka tautan unduhan.
- Selama proses OTA/cek APK, tombol tidak menyebabkan operasi paralel.

Catatan: file telah diuji sintaks TSX, tetapi pemeriksaan tipe dan uji Android penuh dilakukan di proyek DeyPocket.
