import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBetaConfig, sensitiveTrackedFile } from './beta-checks.mjs';
const base = () => ({
  project: { app: { slug: 'deypocket', androidPackage: 'app.debiyan.deypocket' }, release: { owner: 'owner', repository: 'deypocket' } },
  expo: { slug: 'deypocket', version: '1.0.0', android: { package: 'app.debiyan.deypocket', versionCode: 2 }, extra: { eas: { projectId: '00000000-0000-4000-8000-000000000001' } } },
  eas: { build: { preview: { distribution: 'internal', android: { buildType: 'apk' } } } },
  githubRepository: 'OWNER/DEYPOCKET',
});
const failures = v => evaluateBetaConfig(v).filter(x => x.level === 'fail');
test('valid project passes', () => assert.deepEqual(failures(base()), []));
test('missing EAS project ID fails', () => { const f=base();delete f.expo.extra.eas.projectId;assert.ok(failures(f).some(x=>x.id==='eas-project')); });
test('incorrect GitHub repo fails', () => { const f=base();f.githubRepository='another/repo';assert.ok(failures(f).some(x=>x.id==='repository')); });
test('missing release owner fails', () => { const f=base();f.project.release.owner='';assert.ok(failures(f).some(x=>x.id==='repository')); });
test('preview must be internal', () => { const f=base();f.eas.build.preview.distribution='store';assert.ok(failures(f).some(x=>x.id==='preview-distribution')); });
test('preview must produce APK', () => { const f=base();f.eas.build.preview.android.buildType='app-bundle';assert.ok(failures(f).some(x=>x.id==='preview-apk')); });
test('preview must not enable development client', () => { const f=base();f.eas.build.preview.developmentClient=true;assert.ok(failures(f).some(x=>x.id==='preview-client')); });
test('app identity mismatch is blocked', () => { const f=base();f.expo.android.package='app.wrong';assert.ok(failures(f).some(x=>x.id==='android-id')); });
test('app version must be semver', () => { const f=base();f.expo.version='beta';assert.ok(failures(f).some(x=>x.id==='version')); });
test('remote version source is permitted with warning', () => { const f=base();f.eas.cli={appVersionSource:'remote'};delete f.expo.android.versionCode;assert.equal(failures(f).length,0);assert.ok(evaluateBetaConfig(f).some(x=>x.id==='version-code'&&x.level==='warn')); });
test('tracked secrets detection',()=> {
 for(const path of ['prod.sqlite','backup.dpk','.env.production','keys/android.jks','credentials.json','GoogleService-Info.plist']) assert.equal(sensitiveTrackedFile(path),true,path);
 for(const path of ['app.json','project.config.json','eas.json','src/app/index.tsx','README.md'])assert.equal(sensitiveTrackedFile(path),false,path);
});
