# DeyPocket

Aplikasi offline berbasis DeyKit by Debiyan.

## Identitas

- Android Package: `app.debiyan.deypocket`
- Database: `deypocket.db`
- Version: `1.0.0`

## Menjalankan aplikasi

```cmd
npm ci
npm run validate
npx expo start --web
```

## Build Android

```cmd
npx eas-cli@latest init
npx eas-cli@latest build --platform android --profile preview
```

## GitHub Release

Atur `release.owner` dan `release.repository` dalam `project.config.json`.

Simpan `EXPO_TOKEN` di GitHub Actions Secrets.

Jalankan `npm run validate:release` sebelum rilis.

Jangan mengganti Android Package, nama database SQLite, atau signing key setelah APK didistribusikan.
