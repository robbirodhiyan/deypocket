# DeyPocket — Sprint 20 QA Matrix (v1.1.0 RC)

Checklist manual: semua kasus berikut diuji pada APK Android, bukan hanya Expo Go.

- [ ] Saldo rekening awal sesuai data sebelum pembaruan.
- [ ] Setor dari rekening A ke Target B: transfer, saldo, progres, dan riwayat sesuai.
- [ ] Ambil dari Target B ke A: saldo, progres, dan riwayat sesuai.
- [ ] Saldo kurang: tidak ada mutasi sebagian pada jurnal/rekening.
- [ ] Operasi dengan operationId sama tidak diproses dua kali.
- [ ] Edit/hapus transfer di menu Transaksi: Target mengikuti dengan benar; jika masih belum terintegrasi, BLOKIR RILIS.
- [ ] Setor manual dan koreksi manual tidak mengubah saldo rekening.
- [ ] Backup export ke file SQLite, file dapat dibuka dan diperiksa.
- [ ] Restore end-to-end di perangkat lain berhasil; jika restore belum terintegrasi, BLOKIR RILIS fitur restore dan klaim v1.1.0 yang menjanjikannya.
- [ ] Seluruh data Sprint 7–14 aman setelah migrasi.
- [ ] Tutup paksa aplikasi pada saat penyimpanan, validasi tidak ada saldo parsial.
- [ ] Mode pesawat: transaksi tetap berjalan lokal.
- [ ] Offline OTA: aplikasi tetap membuka versi tertanam.
- [ ] OTA preview terpasang hanya pada runtime yang kompatibel.
- [ ] APK baru meng-upgrade APK lama tanpa menghapus data.
- [ ] Tidak ada data dummy atau rahasia yang tertinggal.
- [ ] Signing key konsisten; versionCode APK baru meningkat.

**Batas:** Source keuangan asli dan root SQLite Provider belum tersedia di paket. Semua butir terkait integrasi tetap berstatus belum diverifikasi sampai diuji di proyek pengguna.
