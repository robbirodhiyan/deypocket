
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

// ============================================================
// DEBIYAN PROJECT VALIDATOR
// ============================================================

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const releaseMode = process.argv.includes('--release');

let passed = 0;
let failed = 0;

function file(relative) {
  return path.join(ROOT, relative);
}

function exists(relative) {
  return fs.existsSync(file(relative));
}

function readJson(relative) {
  return JSON.parse(
    fs.readFileSync(file(relative), 'utf8')
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function test(name, callback) {
  try {
    callback();
    passed++;

    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed++;

    console.error(
      `[FAIL] ${name}: ${error.message}`
    );
  }
}

console.log('');
console.log('========================================');
console.log(' DEBIYAN PROJECT VALIDATION');
console.log('========================================');

console.log(
  'Mode:',
  releaseMode ? 'RELEASE' : 'DEVELOPMENT'
);

console.log('');

const project = readJson('project.config.json');
const appJson = readJson('app.json');
const packageJson = readJson('package.json');
const easJson = readJson('eas.json');

const { app, brand, branding, release } = project;

const isStarter =
  app.key === 'deykit' &&
  app.slug === 'appBuilder';

// ============================================================
// 1. APPLICATION IDENTITY
// ============================================================

test('Application key', () => {
  assert(
    /^[a-z][a-z0-9_]*$/.test(app.key),
    'App key tidak valid'
  );
});

test('Expo slug', () => {
  assert(
    /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(app.slug),
    'Expo slug tidak valid'
  );
});

test('Android Application ID', () => {
  const expected = `app.debiyan.${app.key}`;

  const legacy =
    isStarter &&
    app.androidPackage === 'app.debiyan.builder';

  assert(
    app.androidPackage === expected || legacy,
    `Android package tidak sesuai: ${app.androidPackage}`
  );
});

test('SQLite database identity', () => {
  assert(
    /^[a-zA-Z0-9_-]+\.db$/.test(app.databaseName),
    'Nama database tidak valid'
  );

  if (!isStarter) {
    assert(
      app.databaseName === `${app.key}.db`,
      'Database tidak sesuai app key'
    );
  }
});

test('Brand identity', () => {
  assert(
    brand.name === 'Debiyan',
    'Brand harus Debiyan'
  );

  assert(
    typeof app.name === 'string' &&
    app.name.trim().length > 0,
    'App name kosong'
  );
});

// ============================================================
// 2. BRANDING
// ============================================================

test('Branding colors', () => {
  const pattern = /^#[0-9a-fA-F]{6}$/;

  assert(
    pattern.test(branding.primaryColor),
    'primaryColor tidak valid'
  );

  assert(
    pattern.test(branding.backgroundColor),
    'backgroundColor tidak valid'
  );
});

test('Branding assets', () => {
  assert(
    exists(branding.icon),
    `Icon tidak ditemukan: ${branding.icon}`
  );

  assert(
    exists(branding.splashImage),
    `Splash tidak ditemukan: ${branding.splashImage}`
  );
});

// ============================================================
// 3. EXPO CONFIG
// ============================================================

test('Expo resolved configuration', () => {
  const output = execSync(
    'npx expo config --json',
    {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 5 * 1024 * 1024,
    }
  );

  const expo = JSON.parse(output);

  assert(
    expo.name === app.name,
    'Expo name tidak sesuai'
  );

  assert(
    expo.slug === app.slug,
    'Expo slug tidak sesuai'
  );

  assert(
    expo.android?.package === app.androidPackage,
    'Expo Android package tidak sesuai'
  );

  assert(
    expo.extra?.project?.databaseName ===
      app.databaseName,
    'Expo database tidak sesuai'
  );

  assert(
    expo.extra?.project?.primaryColor?.toUpperCase() ===
      branding.primaryColor.toUpperCase(),
    'Expo primaryColor tidak sesuai'
  );

  assert(
    expo.extra?.project?.releaseRepository ===
      release.repository,
    'Expo releaseRepository tidak sesuai'
  );

  if (releaseMode) {
    assert(
      typeof expo.extra?.eas?.projectId === 'string' &&
      expo.extra.eas.projectId.length > 0,
      'EAS Project ID belum dikonfigurasi'
    );
  }
});

// ============================================================
// 4. SQLITE MIGRATIONS
// ============================================================

test('SQLite migration files', () => {
  const required = [
    'src/database/migrations.ts',
    'src/database/migrations-v2.ts',
    'src/database/initialize.ts',
    'src/database/validate-schema.ts',
    'src/database/verified-initialize.ts',
  ];

  for (const filename of required) {
    assert(
      exists(filename),
      `Migration file hilang: ${filename}`
    );
  }
});

test('SQLite migration definitions', () => {
  const v1 = fs.readFileSync(
    file('src/database/migrations.ts'),
    'utf8'
  );

  const v2 = fs.readFileSync(
    file('src/database/migrations-v2.ts'),
    'utf8'
  );

  assert(
    /\bitems\b/.test(v1),
    'Migration v1 tidak memuat items'
  );

  assert(
    /\bapp_settings\b/.test(v2),
    'Migration v2 tidak memuat app_settings'
  );
});

test('SQLite runtime verification', () => {
  const source = fs.readFileSync(
    file('src/database/verified-initialize.ts'),
    'utf8'
  );

  assert(
    source.includes('initializeDatabase('),
    'Database initialization belum dipanggil'
  );

  assert(
    source.includes('validateDatabaseSchema('),
    'Schema validation belum dipanggil'
  );
});

// ============================================================
// 5. EAS BUILD CONFIGURATION
// ============================================================

test('EAS preview build profile', () => {
  const preview = easJson.build?.preview;

  assert(
    preview,
    'EAS preview profile tidak tersedia'
  );

  assert(
    preview.android?.buildType === undefined ||
    preview.android.buildType === 'apk',
    'Preview build harus menghasilkan APK'
  );
});

// ============================================================
// 6. GITHUB RELEASE CONFIGURATION
// ============================================================

test('GitHub release settings', () => {
  assert(
    /^[A-Za-z0-9._-]+$/.test(release.repository),
    'Repository tidak valid'
  );

  assert(
    /^[a-z][a-z0-9_-]*$/.test(release.apkPrefix),
    'APK prefix tidak valid'
  );

  if (releaseMode) {
    assert(
      typeof release.owner === 'string' &&
      release.owner.trim().length > 0,
      'GitHub release owner masih kosong'
    );

    assert(
      appJson.expo?.version === packageJson.version,
      'Versi app.json dan package.json berbeda'
    );

    if (process.env.GITHUB_REPOSITORY) {
      const expected =
        `${release.owner}/${release.repository}`;

      assert(
        expected.toLowerCase() ===
          process.env.GITHUB_REPOSITORY.toLowerCase(),
        'GitHub repository tidak sesuai konfigurasi'
      );
    }
  }
});

// ============================================================
// 7. GITHUB WORKFLOW
// ============================================================

test('GitHub Actions workflow', () => {
  const workflow = isStarter
    ? 'scripts/templates/release-android.yml'
    : '.github/workflows/release-android.yml';

  assert(
    exists(workflow),
    'Release workflow tidak ditemukan'
  );

  const content = fs.readFileSync(
    file(workflow),
    'utf8'
  );

  const document = YAML.parseDocument(content, {
    uniqueKeys: true,
  });

  assert(
    document.errors.length === 0,
    document.errors.map((e) => e.message).join('; ')
  );

  const parsed = document.toJS();

  assert(
    parsed?.jobs &&
    Object.keys(parsed.jobs).length > 0,
    'Workflow belum memiliki jobs'
  );

  assert(
    parsed.on &&
    Object.hasOwn(parsed.on, 'workflow_dispatch'),
    'workflow_dispatch belum dikonfigurasi'
  );

  assert(
    content.includes('EXPO_TOKEN'),
    'EXPO_TOKEN belum digunakan'
  );

  assert(
    content.includes('eas build'),
    'EAS Build command tidak ditemukan'
  );

  assert(
    content.includes('gh release create'),
    'GitHub Release command tidak ditemukan'
  );

  assert(
    content.includes('npm run validate:release'),
    'Release validation belum dipanggil dari CI'
  );
});

// ============================================================
// 8. GENERATOR CLEANUP
// ============================================================

if (!isStarter) {
  test('Generated project cleanup', () => {
    assert(
      !exists('scripts/create-app.mjs'),
      'Generator masih ikut tersalin'
    );

    assert(
      !exists('scripts/templates'),
      'Template generator masih ikut tersalin'
    );

    assert(
      !packageJson.scripts?.['create:app'],
      'Script create:app masih tersedia'
    );
  });
}

// ============================================================
// RESULT
// ============================================================

console.log('');
console.log('========================================');

console.log(`PASSED : ${passed}`);
console.log(`FAILED : ${failed}`);

console.log('========================================');

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log('Debiyan validation successful.');
}

console.log('');
