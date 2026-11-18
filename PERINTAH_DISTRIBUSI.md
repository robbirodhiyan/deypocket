# Sprint 21 — APK RC

```cmd
cd /d C:\laragon\project\deypocket
node scripts/deypocket-check-eas.mjs
npm run validate
npx tsc --noEmit
npx eas-cli@latest build --platform android --profile preview
```

Prasyarat: validasi+pengujian device lulus. Jangan publish jika masih ada blocker integrasi.
