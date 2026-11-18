# Sprint 19 — OTA

```cmd
cd /d C:\laragon\project\deypocket
npm run validate
npx tsc --noEmit
npx eas-cli@latest update --channel preview --environment preview --platform android --message "DeyPocket Sprint 19 - Production Privacy UX"
```

Prasyarat: validasi+pengujian device lulus. Jangan publish jika masih ada blocker integrasi.
