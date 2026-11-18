import fs from 'node:fs';
const fail=[];
const json=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return null}};
const eas=json('eas.json'), pkg=json('package.json'), app=json('app.json');
if(!eas) fail.push('eas.json tidak tersedia atau JSON invalid.');
if(!pkg) fail.push('package.json tidak tersedia atau JSON invalid.');
for(const name of ['preview','production']){
  const profile=eas?.build?.[name];
  if(!profile){fail.push(`build.${name} belum tersedia.`);continue;}
  if(profile.channel!==name) fail.push(`build.${name}.channel harus '${name}' untuk roadmap ini.`);
  if(profile.android?.buildType!=='apk') fail.push(`build.${name}.android.buildType harus 'apk' untuk distribusi APK langsung.`);
}
if(app?.expo?.version && app.expo.version!=='1.1.0'){
  console.warn(`NOTE: app.json expo.version=${app.expo.version}; pastikan versi 1.1.0 saat RC.`);
}
if(!app && !fs.existsSync('app.config.js') && !fs.existsSync('app.config.ts')) fail.push('Konfigurasi app Expo tidak ditemukan.');
if(fail.length){for(const f of fail)console.error('ERROR:',f);process.exitCode=1;}
else console.log('EAS static profile check PASS. Belum memverifikasi signing, keystore, atau native runtime terpasang.');
