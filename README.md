# DeyPocket Sprint 18 — SQLite Backup Export & Inspect

**Kanal:** APK Beta  
**Status sebenarnya:** RESTORE BELUM AKTIF — membutuhkan root SQLiteProvider dan desain cutover database.

## Cakupan

Ekspor database SQLite mentah + pemeriksaan file backup; tidak mengganti database aktif.

## File siap paste

```text
src/features/deypocket/database-backup.ts
src/app/backup-review.tsx
src/app/(tabs)/settings.tsx
```

## Cara pasang (tanpa installer)

1. Commit/backup proyek v1.0.3 yang sudah bekerja.
2. Extract ZIP di luar proyek, kemudian copy path yang tercantum ke root DeyPocket; **jangan** menghapus modul sprint sebelumnya.
3. Untuk `settings.tsx`, bandingkan dengan perubahan lokal sebelum replace.
4. Jalankan validasi dan QA di Android sebelum distribusi.

**Native:** pasang modul melalui `npx expo install` (Expo memilih versi SDK kompatibel). Konfirmasi `eas.json` build preview menghasilkan APK, lalu rebuild. Source ini menyediakan ekspor dan inspeksi backup saja; **tidak** menyediakan restore langsung ke DB aktif.

## Prasyarat/verifikasi wajib

- [ ] Expo SDK/versi modul native yang kompatibel
- [ ] SQLiteProvider & lokasi nama DB
- [ ] Restore aman + backup terenkripsi sebelum klaim feature complete

## Perintah distribusi (jalankan hanya sesudah semua gate PASS)

```cmd
cd /d C:\laragon\project\deypocket
npx expo install expo-file-system expo-document-picker expo-sharing
npm run validate
npx tsc --noEmit
npx eas-cli@latest build --platform android --profile preview
```

**Channel preview** hanya untuk pengujian. OTA tidak akan diterima APK dengan runtime tidak kompatibel. Setelah native module atau app version/runtime berubah, build APK baru terlebih dahulu. `production` jangan dipakai untuk preview.
