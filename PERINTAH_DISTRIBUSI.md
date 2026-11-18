# Sprint 18 — APK Beta

```cmd
cd /d C:\laragon\project\deypocket
npx expo install expo-file-system expo-document-picker expo-sharing
npm run validate
npx tsc --noEmit
npx eas-cli@latest build --platform android --profile preview
```

Prasyarat: validasi+pengujian device lulus. Jangan publish jika masih ada blocker integrasi.
