/** Pure project configuration checks. No external service calls. */
export function evaluateBetaConfig({ project, expo, eas, githubRepository = '' }) {
  const result = [];
  const add = (level, id, message) => result.push({ level, id, message });
  const app = project?.app ?? {};
  const release = project?.release ?? {};
  const actualRepo = `${String(release.owner ?? '').trim()}/${String(release.repository ?? '').trim()}`;
  const expectedRepo = String(githubRepository).trim();

  if (!release.owner || !release.repository) {
    add('fail', 'repository', 'project.config.json: release.owner/repository belum lengkap.');
  } else if (expectedRepo && actualRepo.toLowerCase() !== expectedRepo.toLowerCase()) {
    add('fail', 'repository', `Repository berbeda: konfigurasi=${actualRepo}, GitHub=${expectedRepo}.`);
  } else {
    add('pass', 'repository', `Identitas repository ${actualRepo} valid${expectedRepo ? ' untuk workflow ini' : ''}.`);
  }

  const projectId = expo?.extra?.eas?.projectId;
  if (typeof projectId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(projectId)) {
    add('fail', 'eas-project', 'EAS projectId tidak valid/terbaca. Jalankan eas init lalu cek app.config.ts dan npx expo config --json.');
  } else {
    add('pass', 'eas-project', 'EAS projectId tersedia pada konfigurasi Expo yang sudah di-resolve.');
  }

  if (app.slug && expo?.slug !== app.slug) {
    add('fail', 'slug', `Slug berbeda: project.config=${app.slug}, Expo=${expo?.slug ?? '(tidak ada)'}.`);
  } else if (typeof expo?.slug !== 'string' || expo.slug.length === 0) {
    add('fail', 'slug', 'Expo slug belum diatur.');
  } else {
    add('pass', 'slug', `Expo slug: ${expo.slug}.`);
  }

  if (!expo?.android?.package || (app.androidPackage && expo.android.package !== app.androidPackage)) {
    add('fail', 'android-id', `Android package berbeda/belum ada. Expo=${expo?.android?.package ?? '(tidak ada)'}, project.config=${app.androidPackage ?? '(tidak diatur)'}.`);
  } else {
    add('pass', 'android-id', `Android package: ${expo.android.package}.`);
  }

  if (typeof expo?.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(expo.version)) {
    add('fail', 'version', 'expo.version harus memakai versi semver seperti 1.0.0.');
  } else {
    add('pass', 'version', `Versi aplikasi: ${expo.version}.`);
  }

  const preview = eas?.build?.preview;
  if (!preview || typeof preview !== 'object') {
    add('fail', 'preview', 'eas.json tidak memiliki profil build.preview.');
  } else {
    if (preview.developmentClient === true) {
      add('fail', 'preview-client', 'Build preview beta jangan menggunakan developmentClient=true.');
    }
    if (preview.distribution !== 'internal') {
      add('fail', 'preview-distribution', 'eas.json build.preview.distribution harus "internal" untuk distribusi beta.');
    } else {
      add('pass', 'preview-distribution', 'Internal distribution aktif.');
    }
    if (typeof preview.android?.gradleCommand === 'string') {
      add('warn', 'gradle-command', 'Custom android.gradleCommand aktif. Pastikan Gradle menghasilkan APK; buildType tidak selalu menentukan output.');
    } else if (preview.android?.buildType !== 'apk') {
      add('fail', 'preview-apk', 'eas.json build.preview.android.buildType harus "apk".');
    } else {
      add('pass', 'preview-apk', 'Preview menghasilkan APK installable.');
    }
  }

  const versionSource = eas?.cli?.appVersionSource;
  const versionCode = expo?.android?.versionCode;
  if (versionSource === 'remote') {
    add('warn', 'version-code', 'Version code dikelola oleh EAS remote. Pastikan nilainya meningkat untuk build baru.');
  } else if (typeof versionCode !== 'number' || !Number.isInteger(versionCode) || versionCode < 1) {
    add('warn', 'version-code', 'expo.android.versionCode belum berupa integer positif. Periksa sebelum membuat APK distribusi.');
  } else {
    add('pass', 'version-code', `Android versionCode: ${versionCode}.`);
  }

  return result;
}

export function sensitiveTrackedFile(file) {
  const p = String(file).replaceAll('\\', '/').toLowerCase();
  const name = p.split('/').at(-1) ?? '';
  return (
    /(?:^|\/)\.env(?:\..+)?$/.test(p) ||
    /\.(?:db|sqlite|sqlite3|dpk|apk|aab|keystore|jks|p12|pfx|pem|p8|key)$/.test(name) ||
    name === 'credentials.json' || name === 'google-services.json' || name === 'googleservice-info.plist' ||
    /(?:^|\/)(?:private|secrets)\/.*\.(?:json|txt|yaml|yml)$/.test(p)
  );
}
