import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, isTrustedApkUrl, parseVersion, selectLatestPublicApk } from '../src/features/deypocket/update-release.ts';
import { inspectUpdateConfig } from './update-preflight-core.mjs';

const owner = 'example-org';
const repo = 'deypocket';
const apk = (version, extra = {}) => ({ tag_name: `v${version}`, draft: false, prerelease: false,
  name: `Release ${version}`, assets: [{ name: 'deypocket.apk', browser_download_url: `https://github.com/${owner}/${repo}/releases/download/v${version}/deypocket.apk`, state: 'uploaded' }], ...extra });

test('semantic version compare', () => {
  assert.deepEqual(parseVersion('v1.2.3'), [1, 2, 3]);
  assert.equal(parseVersion('1.2.3-beta'), null);
  assert.equal(compareVersions('1.11.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.1'), -1);
});
test('select latest valid public APK, independent of API order', () => {
  const r = selectLatestPublicApk([apk('1.1.0'), apk('1.3.0'), apk('1.2.0')], '1.0.0', owner, repo);
  assert.equal(r.kind, 'available');
  if (r.kind === 'available') assert.equal(r.release.version, '1.3.0');
});
test('skip prerelease, drafts and assets not belonging to expected repo', () => {
  const forged = apk('9.9.9');
  forged.assets[0].browser_download_url = 'https://evil.example/a.apk';
  const r = selectLatestPublicApk([apk('1.2.0', { prerelease: true }), apk('1.3.0', { draft: true }), forged, apk('1.1.0')], '1.0.0', owner, repo);
  assert.equal(r.kind, 'available');
  if (r.kind === 'available') assert.equal(r.release.version, '1.1.0');
});
test('up-to-date for matching or newer installed version', () => {
  assert.equal(selectLatestPublicApk([apk('1.1.0')], '1.1.0', owner, repo).kind, 'up-to-date');
  assert.equal(selectLatestPublicApk([apk('1.1.0')], '1.2.0', owner, repo).kind, 'up-to-date');
});
test('reject malicious or wrong host URL', () => {
  assert.equal(isTrustedApkUrl('https://github.com.evil.com/example-org/deypocket/releases/download/v1.2.0/a.apk', owner, repo), false);
  assert.equal(isTrustedApkUrl('https://github.com/example-org/another/releases/download/v1.2.0/a.apk', owner, repo), false);
  assert.equal(isTrustedApkUrl('https://github.com/example-org/deypocket/releases/download/v1.2.0/a.apk', owner, repo), true);
});
test('reject invalid GitHub response', () => {
  assert.throws(() => selectLatestPublicApk({}, '1.0.0', owner, repo));
});
const id = 'a8bb3cae-ff72-4de1-a174-d5d65bb11223';
const config = { version: '1.0.0', extra: { eas: { projectId: id } }, updates: { url: `https://u.expo.dev/${id}` }, runtimeVersion: { policy: 'appVersion' } };
const eas = { build: { preview: { channel: 'preview', android: { buildType: 'apk' } } } };
test('EAS preflight accepts valid final Expo config', () => assert.deepEqual(inspectUpdateConfig(config, eas).errors, []));
test('EAS preflight fails missing id, runtime and channel', () => {
  assert.ok(inspectUpdateConfig({}, {}).errors.length >= 4);
});
test('EAS preflight catches mismatched url', () => {
  assert.ok(inspectUpdateConfig({ ...config, updates: { url: 'https://u.expo.dev/wrong' } }, eas).errors.some(e => e.includes('updates.url')));
});
