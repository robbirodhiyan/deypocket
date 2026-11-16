const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function inspectUpdateConfig(expo, eas) {
  const errors = [];
  const warnings = [];
  const id = expo?.extra?.eas?.projectId;
  if (typeof id !== 'string' || !UUID.test(id)) errors.push('extra.eas.projectId belum berisi EAS Project ID yang valid. Jalankan eas init.');
  const targetUrl = typeof id === 'string' ? `https://u.expo.dev/${id}` : '';
  if (!targetUrl || expo?.updates?.url !== targetUrl) errors.push('updates.url tidak cocok dengan extra.eas.projectId. Jalankan eas update:configure.');
  if (expo?.updates?.enabled === false) errors.push('updates.enabled=false. Aktifkan expo-updates untuk APK release.');
  const runtime = expo?.runtimeVersion;
  if (!(typeof runtime === 'string' && runtime.trim()) && runtime?.policy !== 'appVersion') {
    errors.push('runtimeVersion belum disetel. Rekomendasi: { policy: "appVersion" }.');
  }
  if (eas?.build?.preview?.channel !== 'preview') errors.push('eas.json build.preview.channel harus "preview".');
  if (eas?.build?.preview?.android?.buildType !== 'apk') errors.push('eas.json build.preview.android.buildType harus "apk".');
  if (!expo?.version || !/^\d+\.\d+\.\d+$/.test(expo.version)) warnings.push('expo.version harus semantic version, misalnya 1.0.0.');
  if (expo?.updates?.checkAutomatically === 'NEVER') warnings.push('Pemeriksaan OTA otomatis saat startup nonaktif; gunakan tombol cek manual.');
  return { errors, warnings };
}
