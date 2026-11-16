import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const bump = process.env.BUMP_KIND || 'patch';
if (!['patch', 'minor', 'major'].includes(bump)) {
  throw new Error(`Invalid release increment: ${bump}`);
}

const appPath = 'app.json';
const pkgPath = 'package.json';
const lockPath = 'package-lock.json';
const configPath = 'project.config.json';

const read = (name) => JSON.parse(fs.readFileSync(name, 'utf8'));
const app = read(appPath);
const pkg = read(pkgPath);
const lock = read(lockPath);
const project = read(configPath);

const parse = (v) => {
  const m = /^(?:v)?(\d+)\.(\d+)\.(\d+)$/.exec(v ?? '');
  return m ? m.slice(1).map(Number) : null;
};
const current = parse(app?.expo?.version);
if (!current) throw new Error('expo.version must be X.Y.Z in app.json');

const tags = execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .map(parse)
  .filter(Boolean);
const versionCmp = (a, b) => {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
};
const newest = [...tags, current].sort(versionCmp).at(-1);
const [major, minor, patch] = newest;
const next = bump === 'major'
  ? [major + 1, 0, 0]
  : bump === 'minor'
    ? [major, minor + 1, 0]
    : [major, minor, patch + 1];
const previous = app.expo.version;
const version = next.join('.');
const tag = `v${version}`;

const apkPrefix = String(project?.release?.apkPrefix || project?.app?.key || 'app');
if (!/^[a-zA-Z0-9._-]+$/.test(apkPrefix)) {
  throw new Error('Invalid release APK filename prefix');
}
const apkName = `${apkPrefix}-${tag}.apk`;

app.expo.version = version;
pkg.version = version;
lock.version = version;
if (lock.packages?.['']) lock.packages[''].version = version;

for (const [path, value] of [[appPath, app], [pkgPath, pkg], [lockPath, lock]]) {
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\ntag=${tag}\napk_name=${apkName}\n`);
}
console.log(`Release: ${previous} -> ${version}, artifact ${apkName}`);
console.log('Android versionCode is handled by EAS remote autoIncrement.');
