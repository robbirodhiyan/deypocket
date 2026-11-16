import { Platform } from 'react-native';

export type OtaEnvironment = {
  supported: boolean;
  description: string;
  channel: string | null;
  runtimeVersion: string | null;
  updateId: string | null;
  embedded: boolean | null;
};

export type OtaCheckResult = 'available' | 'up-to-date';

/** Import lazily so web can render without initializing the native update module. */
async function loadUpdates() {
  return import('expo-updates');
}

export async function getOtaEnvironment(): Promise<OtaEnvironment> {
  const unavailable = (description: string): OtaEnvironment => ({
    supported: false, description, channel: null, runtimeVersion: null,
    updateId: null, embedded: null,
  });
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return unavailable('OTA hanya dapat diperiksa melalui build Android/iOS.');
  }
  if (__DEV__) {
    return unavailable('Expo Go / development mode tidak mendukung pemeriksaan OTA manual. Uji menggunakan APK preview EAS.');
  }
  try {
    const Updates = await loadUpdates();
    if (!Updates.isEnabled) {
      return unavailable('Expo Updates belum aktif pada APK ini. Konfigurasi EAS Update lalu buat APK baru.');
    }
    return {
      supported: true,
      description: 'OTA tersedia pada build ini.',
      channel: Updates.channel ?? null,
      runtimeVersion: Updates.runtimeVersion ?? null,
      updateId: Updates.updateId ?? null,
      embedded: Updates.isEmbeddedLaunch,
    };
  } catch {
    return unavailable('Modul OTA belum tersedia pada build ini. Instal expo-updates dan build APK baru.');
  }
}

export async function checkOta(): Promise<OtaCheckResult> {
  const environment = await getOtaEnvironment();
  if (!environment.supported) throw new Error(environment.description);
  const Updates = await loadUpdates();
  const result = await Updates.checkForUpdateAsync();
  return result.isAvailable ? 'available' : 'up-to-date';
}

export async function downloadOta(): Promise<boolean> {
  const environment = await getOtaEnvironment();
  if (!environment.supported) throw new Error(environment.description);
  const Updates = await loadUpdates();
  const result = await Updates.fetchUpdateAsync();
  return result.isNew;
}

export async function applyDownloadedOta(): Promise<void> {
  const environment = await getOtaEnvironment();
  if (!environment.supported) throw new Error(environment.description);
  const Updates = await loadUpdates();
  await Updates.reloadAsync();
}
