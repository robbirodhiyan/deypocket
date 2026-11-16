import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { evaluateBetaConfig, sensitiveTrackedFile } from './beta-checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const findings = [];
const add = (level, id, message) => findings.push({ level, id, message });

function loadJson(name) {
  try { return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')); }
  catch (error) {
    add('fail', name, `Tidak bisa membaca ${name}: ${error.message}`);
    return null;
  }
}

function resolvedExpo() {
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['--no-install', 'expo', 'config', '--json'],
    { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 10 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0) {
    add('fail', 'expo-config', `Tidak dapat menjalankan Expo CLI lokal. Jalankan npm ci jika dependensi belum terpasang. ${result.error?.message ?? result.stderr?.trim() ?? ''}`);
    return null;
  }
  try { return JSON.parse(result.stdout.trim()); }
  catch { add('fail', 'expo-config', 'Output expo config --json tidak valid. Periksa app.config.ts secara manual.'); return null; }
}

const project = loadJson('project.config.json');
const eas = loadJson('eas.json');
const expo = resolvedExpo();
if (project && eas && expo) {
  findings.push(...evaluateBetaConfig({ project, eas, expo, githubRepository: process.env.GITHUB_REPOSITORY }));
}

// Only inspect tracked path names, never print file contents or credentials.
const git = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
if (git.status === 0) {
  const sensitive = git.stdout.split('\0').filter(Boolean).filter(sensitiveTrackedFile);
  if (sensitive.length) add('fail', 'tracked-secrets', `File sensitif sedang di-track Git: ${sensitive.join(', ')}. .gitignore tidak menghapus yang sudah ter-commit.`);
  else add('pass', 'tracked-secrets', 'Tidak terdeteksi file sensitif berdasarkan nama file dalam indeks Git.');
} else {
  add('warn', 'tracked-secrets', 'Audit file Git tidak tersedia (git ls-files gagal).');
}

console.log('\n=== DEYPOCKET / SPRINT 5 ANDROID BETA PREFLIGHT ===');
for (const item of findings) console.log(`[${item.level.toUpperCase()}] ${item.id}: ${item.message}`);
const failed = findings.filter(f => f.level === 'fail').length;
const warned = findings.filter(f => f.level === 'warn').length;
console.log(`\nFAIL=${failed} WARN=${warned} PASS=${findings.filter(f => f.level === 'pass').length}`);
if (failed) {
  console.error('Perbaiki pemeriksaan di atas sebelum build APK beta.');
  process.exitCode = 1;
} else console.log('Preflight lulus. Lanjutkan npm run validate lalu build preview EAS.');
