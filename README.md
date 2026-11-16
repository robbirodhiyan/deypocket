# DeyPocket — Sprint 6.1: Application Update Manager

## Ruang lingkup

- Menu **Pengaturan → Pembaruan Aplikasi** dengan tampilan versi APK, build number, EAS channel, dan runtime.
- **Update OTA**: cek update, unduh, lalu konfirmasi untuk memuat ulang (tidak otomatis memutus form yang belum disimpan).
- **Update APK**: cari aset APK release stabil dari **GitHub repository publik**, lalu buka link unduhan HTTPS resmi setelah konfirmasi; instalasi tetap disetujui pengguna Android.
- Umpan balik yang jelas pada Expo Go, web, mode development, OTA nonaktif, internet terputus, dan GitHub repository privat.
- CLI preflight yang membaca **konfigurasi Expo final** agar `app.config.ts` tidak menyembunyikan EAS Project ID.
- Tidak mengubah migrasi SQLite, tabel transaksi, workflow GitHub, ataupun branch `master`.

**Batasan penting:** GitHub repository privat tidak dapat dibaca oleh aplikasi tanpa autentikasi. Jangan menyimpan PAT/token GitHub atau kunci distribusi di source maupun APK. Gunakan EAS OTA dan jalur distribusi APK terautentikasi untuk repositori privat. Fitur pencarian APK publik memang tidak bekerja untuk private repo.

## Instalasi Windows

Ekstrak folder `DeyPocket_Sprint6_1_UpdateManager` tepat di root proyek, contohnya:

```cmd
cd /d C:\projects\deypocket
DeyPocket_Sprint6_1_UpdateManager\install.cmd
npx expo install expo-updates expo-application
npm run update:test
npm run validate
```

> **Penting:** Installer tidak mengubah `app.config.ts`, `app.json`, `eas.json`, ataupun GitHub Actions. Ini disengaja karena file konfigurasi yang ada menggunakan generator Debiyan dan tidak boleh ditimpa sembarangan. Installer juga tidak memodifikasi file update checker lama.

## Aktivasi EAS OTA — dijalankan satu kali sebelum build baru

Jika belum dikonfigurasi:

```cmd
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest update:configure
```

Verifikasi **hasil akhir** (karena memakai `app.config.ts` dinamis):

```cmd
npx expo config --type public
npm run update:check
```

Konfigurasi final harus memiliki:

- `extra.eas.projectId` = UUID EAS proyek dari `eas init`.
- `updates.url` = `https://u.expo.dev/<PROJECT_ID>`.
- `runtimeVersion` = `{ "policy": "appVersion" }` (direkomendasikan Expo) atau runtime string yang sengaja dikelola.
- `updates.enabled` tidak `false`.
- `eas.json` → `build.preview.channel = "preview"`, `build.preview.android.buildType = "apk"` dan konfigurasi existing lain tetap dipertahankan.

Jika `app.config.ts` memakai `extra: { ...config.extra, project: ... }`, periksa agar `extra.eas` hasil `eas init` **tidak hilang**. Jangan membuat dua `extra` dengan saling menimpa. Jangan hardcode ID palsu.

Contoh **bagian kecil** `eas.json` (jangan menimpa seluruh file):

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "android": { "buildType": "apk" }
    }
  }
}
```

Setelah `npm run update:check` lulus, **harus membuat APK baru** supaya `expo-updates` ikut dalam binary. Instal APK tersebut pada perangkat uji.

```cmd
npx eas-cli@latest build --platform android --profile preview
```

Hanya setelah APK preview baru terpasang, publish **OTA yang tidak mengubah kode native**:

```cmd
npx eas-cli@latest update --channel preview --message "DeyPocket Sprint 6.1 OTA test"
```

Dari APK preview, buka **Pengaturan → Pembaruan Aplikasi → Cek Pembaruan OTA → Unduh Update → Terapkan & Muat Ulang**. Perubahan OTA hanya akan ditemukan bila channel dan runtime versi sama dengan APK.

**Jangan menjalankan publikasi OTA dari source yang menambah/mengubah modul native tanpa membuat APK baru terlebih dahulu.** Menginstall `expo-updates` sendiri sudah memerlukan APK baru.

## GitHub Release APK

- File `project.config.json` → `release.owner` dan `release.repository` harus menunjuk ke repo yang benar.
- APK terpasang dibandingkan dengan release tag semver `v1.1.0` atau `1.1.0` (release stabil, bukan prerelease/draft).
- Release harus memiliki aset berakhiran `.apk` dari URL `https://github.com/<owner>/<repo>/releases/download/...`.
- Jika repo privat, GitHub API anonim mengembalikan 404: ini **keterbatasan yang disengaja**. Jangan mengganti dengan hardcoded PAT. Browser yang sudah login bisa dipakai untuk mengunduh versi baru secara manual.
- Pastikan `expo.version` pada APK berikutnya meningkat (misal 1.0.0 → 1.1.0), `android.versionCode` meningkat, signing key dan Android package konsisten. Tanpa itu Android dapat menolak update, atau pengguna harus uninstall yang berisiko menghapus data SQLite.
- Periksa release dan signing key sebelum mendistribusikan APK. Tombol aplikasi hanya membuka browser unduhan, bukan menginstal otomatis.

## Pengujian

```cmd
npm run update:test
npm run validate
npm run update:check
```

Skenario:

1. **Expo Go / web**: halaman tetap dapat dibuka; tombol OTA manual tidak aktif dan alasan ditampilkan.
2. **APK preview dengan channel preview**: cek OTA; jika belum publish, tampil tidak ada update.
3. **Publish update JS-only**: cek → unduh → konfirmasi → reload; data SQLite tetap ada.
4. **Offline**: aplikasi dapat dibuka dan data transaksi tetap bisa diakses; cek update memunculkan error informatif.
5. **GitHub private**: pemeriksaan APK menampilkan pesan tidak dapat diakses; tidak meminta PAT.
6. **Public APK Release**: release `v1.1.0` dengan APK valid akan terdeteksi dari APK `1.0.0`.
7. **Keamanan data**: buat backup terenkripsi sebelum instalasi APK baru; uji ulang saldo dan transaksi setelah update.

## Commit ke GitHub master

```cmd
git add .
git status
```

Periksa bahwa file sensitif/database tidak ter-stage. Lalu:

```cmd
git commit -m "feat: add EAS OTA and APK update manager"
git push origin master
```

Gunakan `github` jika itulah nama remote GitHub. Tidak ada workflow tambahan dalam paket ini.

## Status validasi paket

Unit test pure JS (parser release, filter URL, dan preflight) serta simulasi installer dijalankan saat penyusunan. `npm run validate` pada proyek asli dan tes APK di Android harus dilakukan pada komputer pengguna.

Dokumentasi Expo/GitHub:
- https://docs.expo.dev/eas-update/getting-started/
- https://docs.expo.dev/eas-update/runtime-versions/
- https://docs.expo.dev/versions/latest/sdk/updates/
- https://docs.github.com/en/rest/releases/releases
