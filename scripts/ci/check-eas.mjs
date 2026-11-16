import fs from 'node:fs';
const profile = process.argv[2] || 'preview';
const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
const visited = new Set();
function resolveProfile(key) {
  if (visited.has(key)) throw new Error(`Circular EAS build profile: ${key}`);
  visited.add(key);
  const own = eas.build?.[key];
  if (!own) throw new Error(`Missing EAS build profile: ${key}`);
  if (!own.extends) return own;
  const parent = resolveProfile(own.extends);
  return {
    ...parent, ...own,
    android: { ...(parent.android || {}), ...(own.android || {}) },
  };
}
const p = resolveProfile(profile);
const problems = [];
if (eas.cli?.appVersionSource !== 'remote') problems.push('cli.appVersionSource must be "remote"');
if (p.autoIncrement !== true) problems.push(`build.${profile}.autoIncrement must be true`);
if (p.android?.buildType !== 'apk' && p.distribution !== 'internal') {
  problems.push(`build.${profile} must produce an APK (android.buildType "apk" or distribution "internal")`);
}
if (problems.length) {
  throw new Error(`EAS release configuration needs one-time setup:\n- ${problems.join('\n- ')}`);
}
console.log(`EAS profile '${profile}' supports APK build and remote versionCode autoIncrement.`);
console.log('Ensure EAS remote Android build number was initialized from the last installed APK.');
