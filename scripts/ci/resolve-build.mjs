import fs from 'node:fs';
const filepath = process.argv[2] || 'eas-build.json';
const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
const builds = Array.isArray(data) ? data : Array.isArray(data.builds) ? data.builds : [data];
const build = builds.find(b => String(b.platform).toUpperCase() === 'ANDROID') || builds[0];
if (!build || !build.id) throw new Error('EAS did not return an identifiable build.');
if (build.status && String(build.status).toUpperCase() !== 'FINISHED') {
  throw new Error(`EAS build status was ${build.status}, expected FINISHED.`);
}
const url = build.artifacts?.buildUrl || build.artifacts?.applicationArchiveUrl || build.applicationArchiveUrl;
if (typeof url !== 'string' || !url.startsWith('https://')) {
  throw new Error('No downloadable APK artifact URL found in EAS output.');
}
if (!process.env.GITHUB_OUTPUT) throw new Error('Missing GITHUB_OUTPUT');
fs.appendFileSync(process.env.GITHUB_OUTPUT, `url=${url}\n`);
console.log(`Found completed Android build ID ${build.id}; APK URL written to GitHub output.`);
