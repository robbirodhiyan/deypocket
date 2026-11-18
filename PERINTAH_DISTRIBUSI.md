# Sprint 20 — OTA

```cmd
cd /d C:\laragon\project\deypocket
npm run validate
npx tsc --noEmit
node scripts/deypocket-quality-gate.mjs
npx eas-cli@latest update --channel preview --environment preview --platform android --message "DeyPocket Sprint 20 - Quality & Release Gate"
```

Prasyarat: validasi+pengujian device lulus. Jangan publish jika masih ada blocker integrasi.
