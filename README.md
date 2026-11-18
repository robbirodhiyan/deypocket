# DeyPocket Sprint 20 — Quality & Release Gate

**Kanal:** OTA  
**Status sebenarnya:** GATE STATIS — pengujian Android dan end-to-end tetap manual.

## Cakupan

Pemeriksaan release statis dan matriks QA transaksi, backup, upgrade APK.

## File siap paste

```text
scripts/deypocket-quality-gate.mjs
QA_MATRIX.md
```

## Cara pasang (tanpa installer)

1. Commit/backup proyek v1.0.3 yang sudah bekerja.
2. Extract ZIP di luar proyek, kemudian copy path yang tercantum ke root DeyPocket; **jangan** menghapus modul sprint sebelumnya.
3. Untuk `settings.tsx`, bandingkan dengan perubahan lokal sebelum replace.
4. Jalankan validasi dan QA di Android sebelum distribusi.

**PENTING:** Script pemeriksaan merupakan gerbang statis, bukan pengganti pengujian end-to-end. Jika integrasi finance atau restore masih belum selesai, jangan launching stable sekalipun script lulus.

## Prasyarat/verifikasi wajib

- [ ] Semua pengujian QA matrix PASS
- [ ] Integrasi edit/hapus finance selesai
- [ ] Restore teruji atau keluarkan dari scope release

## Perintah distribusi (jalankan hanya sesudah semua gate PASS)

```cmd
cd /d C:\laragon\project\deypocket
npm run validate
npx tsc --noEmit
node scripts/deypocket-quality-gate.mjs
npx eas-cli@latest update --channel preview --environment preview --platform android --message "DeyPocket Sprint 20 - Quality & Release Gate"
```

**Channel preview** hanya untuk pengujian. OTA tidak akan diterima APK dengan runtime tidak kompatibel. Setelah native module atau app version/runtime berubah, build APK baru terlebih dahulu. `production` jangan dipakai untuk preview.
