# DeyPocket — Android Beta Test Checklist

Jalankan seluruh pengujian menggunakan **transaksi dummy**, dan simpan backup `.dpk` di luar perangkat sebelum melakukan pengujian restore/uninstall.

| Pengujian | Hasil (PASS/FAIL) | Catatan |
|---|---|---|
| APK preview terpasang dan terbuka tanpa Metro | | |
| Splash screen, ikon, tema dan navigasi benar | | |
| Buat dompet + saldo awal | | |
| Catat pemasukan dan pengeluaran | | |
| Transfer antar dompet menjaga saldo gabungan | | |
| Edit dan hapus transaksi dengan saldo terhitung ulang | | |
| Kategori dan anggaran bisa diatur | | |
| Insight menampilkan pemasukan dan pengeluaran gabungan | | |
| Pencarian/filter transaksi bekerja | | |
| Buat backup terenkripsi `.dpk` dan ekspor keluar perangkat | | |
| Salah password ditolak, data tetap utuh | | |
| Restore backup benar menggunakan data dummy | | |
| Diagnostik: SQLite dan foreign key OK | | |
| Mode pesawat: fitur keuangan tetap berjalan | | |
| Force close lalu buka kembali: data tersimpan | | |
| Versi APK pembaruan terpasang tanpa kehilangan data | | |

## Release gate

- [ ] `npm run beta:test` lulus
- [ ] `npm run beta:check` tanpa FAIL
- [ ] `npm run validate` lulus
- [ ] APK Android `preview` berhasil dibangun menggunakan EAS
- [ ] Android beta checklist selesai pada perangkat fisik
- [ ] Tidak ada token, backup, database, atau signing key dalam `git ls-files`
- [ ] GitHub Actions DeyPocket Validation hijau pada branch `master`
- [ ] Catat versi APK, versionCode, perangkat, dan masalah yang ditemukan

**Ketentuan:** pembaruan APK dengan package ID yang sama membutuhkan signing key yang kompatibel. Jangan mereset/menukar keystore EAS tanpa alasan dan rencana migrasi; perangkat akan menolak update yang ditandatangani kunci berbeda.
