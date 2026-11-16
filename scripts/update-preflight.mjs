import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectUpdateConfig } from './update-preflight-core.mjs';

const root = path.resolve(import.meta.dirname, '..');
const easFile = path.join(root, 'eas.json');
if (!fs.existsSync(easFile)) throw new Error('eas.json tidak ditemukan.');
const eas = JSON.parse(fs.readFileSync(easFile, 'utf8'));
let expo;
try {
  // Call the installed Expo CLI directly. This reads the final dynamic app.config.ts.
  const cli = path.join(root, 'node_modules/expo/bin/cli');
  if (!fs.existsSync(cli)) throw new Error('Expo CLI lokal tidak ditemukan. Jalankan npm install terlebih dahulu.');
  const output = execFileSync(process.execPath, [cli, 'config', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  expo = JSON.parse(output);
} catch (error) {
  console.error('Gagal membaca konfigurasi Expo final:', error instanceof Error ? error.message : error);
  process.exit(1);
}
const result = inspectUpdateConfig(expo, eas);
console.log('\nDeyPocket — Sprint 6.1 Update Preflight');
for (const message of result.errors) console.log('[FAIL]', message);
for (const message of result.warnings) console.log('[WARN]', message);
if (result.errors.length) {
  console.log('\nPerbaiki konfigurasi dan buat APK baru sebelum menerbitkan OTA.');
  process.exitCode = 1;
} else {
  console.log('[PASS] Runtime EAS Update, channel preview, dan konfigurasi APK.');
}
