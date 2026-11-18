import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const issues=[]; const good=[];
const exists=p=>fs.existsSync(path.join(root,p));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const required=[
  'package.json','src/features/deypocket/goal-finance-contract.ts',
  'src/features/deypocket/goal-finance-links.ts',
  'src/features/deypocket/goal-finance-orchestrator.ts',
  'src/features/deypocket/goal-finance-reconciliation.ts',
  'src/features/deypocket/database-backup.ts',
];
for(const p of required){(exists(p)?good:issues).push(`${exists(p)?'OK':'MISSING'} ${p}`);}
if(exists('src/features/deypocket/goal-demo-data.ts')) issues.push('Data dummy developer masih berada di src produksi.');
const pkg=exists('package.json')?JSON.parse(read('package.json')):{};
if(!pkg.scripts?.validate) issues.push('npm run validate belum terdaftar di package.json.');
const deps={...pkg.dependencies,...pkg.devDependencies};
for(const dependency of ['expo-sqlite','expo-file-system','expo-document-picker','expo-sharing']){
  if(!deps[dependency]) issues.push(`Dependency belum ada: ${dependency}`);
}
if(!exists('src/app/backup-review.tsx')) issues.push('Halaman backup belum terpasang.');
if(!exists('src/app/privacy.tsx')) issues.push('Halaman privasi belum terpasang.');
for(const line of good) console.log(line);
for(const line of issues) console.error('CHECK:',line);
console.log(`Release static gate: ${issues.length?'FAILED':'PASS'}. Ini bukan pengganti pengujian perangkat.`);
process.exitCode=issues.length?1:0;
