/** Optional explicit writer: changes ONLY eas.json build.preview. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filename = path.join(root, 'eas.json');
if (!fs.existsSync(filename)) throw new Error('eas.json tidak ditemukan. Jalankan eas build:configure terlebih dahulu.');
const original = fs.readFileSync(filename, 'utf8');
const eas = JSON.parse(original);
eas.build ??= {};
const preview = eas.build.preview ?? {};
if (preview.developmentClient === true) throw new Error('Profil preview saat ini developmentClient=true. Tinjau dahulu sebelum diubah.');
if (preview.android?.gradleCommand) throw new Error('Ada android.gradleCommand kustom; periksa output build sebelum memakai konfigurasi otomatis.');
const next = {
  ...preview,
  distribution: 'internal',
  android: { ...(preview.android ?? {}), buildType: 'apk' },
};
eas.build.preview = next;
const serialized = JSON.stringify(eas, null, 2) + '\n';
if (original === serialized) {
  console.log('eas.json sudah sesuai profil Android Preview APK.');
} else {
  fs.writeFileSync(filename + '.before-sprint5.bak', original, { flag: 'w' });
  fs.writeFileSync(filename, serialized);
  console.log('Profil build.preview diperbarui. Backup lama: eas.json.before-sprint5.bak');
}
