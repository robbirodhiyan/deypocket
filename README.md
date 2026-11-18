# DeyPocket Sprint 19 — Production Privacy UX

**Kanal:** OTA  
**Status sebenarnya:** UI AKTIF bila settings file dari sprint sebelumnya digunakan.

## Cakupan

Halaman privasi lokal dan keterangan backup mentah yang belum terenkripsi.

## File siap paste

```text
src/features/deypocket/release-privacy.ts
src/app/privacy.tsx
src/app/(tabs)/settings.tsx
```

## Cara pasang (tanpa installer)

1. Commit/backup proyek v1.0.3 yang sudah bekerja.
2. Extract ZIP di luar proyek, kemudian copy path yang tercantum ke root DeyPocket; **jangan** menghapus modul sprint sebelumnya.
3. Untuk `settings.tsx`, bandingkan dengan perubahan lokal sebelum replace.
4. Jalankan validasi dan QA di Android sebelum distribusi.

Source `settings.tsx` di paket ini memuat menu Backup dari Sprint 18 dan Privasi dari Sprint 19. Pasang setelah Sprint 18.

## Prasyarat/verifikasi wajib

- [ ] Tidak ada telemetri/izin tak diperlukan
- [ ] Tidak ada data demo di production
- [ ] Review teks privasi sesuai fitur nyata

## Perintah distribusi (jalankan hanya sesudah semua gate PASS)

```cmd
cd /d C:\laragon\project\deypocket
npm run validate
npx tsc --noEmit
npx eas-cli@latest update --channel preview --environment preview --platform android --message "DeyPocket Sprint 19 - Production Privacy UX"
```

**Channel preview** hanya untuk pengujian. OTA tidak akan diterima APK dengan runtime tidak kompatibel. Setelah native module atau app version/runtime berubah, build APK baru terlebih dahulu. `production` jangan dipakai untuk preview.
