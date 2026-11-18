# DeyPocket Sprint 21 — Release Candidate APK

**Kanal:** APK RC  
**Status sebenarnya:** BUILD GUIDE — bukan APK ter-compile otomatis.

## Cakupan

Validasi profil EAS dan checklist rilis kandidat.

## File siap paste

```text
scripts/deypocket-check-eas.mjs
EAS_PROFILE_REFERENCE.json
RC_CHECKLIST.md
```

## Cara pasang (tanpa installer)

1. Commit/backup proyek v1.0.3 yang sudah bekerja.
2. Extract ZIP di luar proyek, kemudian copy path yang tercantum ke root DeyPocket; **jangan** menghapus modul sprint sebelumnya.
3. Untuk `settings.tsx`, bandingkan dengan perubahan lokal sebelum replace.
4. Jalankan validasi dan QA di Android sebelum distribusi.

**PENTING:** Script pemeriksaan merupakan gerbang statis, bukan pengganti pengujian end-to-end. Jika integrasi finance atau restore masih belum selesai, jangan launching stable sekalipun script lulus.

## Prasyarat/verifikasi wajib

- [ ] eas.json profil APK benar
- [ ] Keystore sama dengan v1.0.3
- [ ] Android versionCode meningkat

## Perintah distribusi (jalankan hanya sesudah semua gate PASS)

```cmd
cd /d C:\laragon\project\deypocket
node scripts/deypocket-check-eas.mjs
npm run validate
npx tsc --noEmit
npx eas-cli@latest build --platform android --profile preview
```

**Channel preview** hanya untuk pengujian. OTA tidak akan diterima APK dengan runtime tidak kompatibel. Setelah native module atau app version/runtime berubah, build APK baru terlebih dahulu. `production` jangan dipakai untuk preview.
