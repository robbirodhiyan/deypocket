import { useEffect } from 'react';

import {
  Alert,
  Linking,
  Platform,
} from 'react-native';

import Constants from 'expo-constants';

import {
  checkForAppUpdate,
} from '@/services/app-update';

export default function AutoUpdateChecker() {
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    let cancelled = false;

    const appName = String(
      Constants.expoConfig?.extra?.project?.appName ??
      Constants.expoConfig?.name ??
      'Aplikasi'
    );

    async function check() {
      try {
        const update =
          await checkForAppUpdate();

        if (
          cancelled ||
          !update.hasUpdate ||
          !update.downloadUrl
        ) {
          return;
        }

        const url =
          update.downloadUrl;

        Alert.alert(
          'Pembaruan Tersedia',

          appName + ' v' +
          update.latestVersion +
          ' tersedia.\n' +
          'Versi terpasang: v' +
          update.currentVersion,

          [
            {
              text: 'Nanti',
              style: 'cancel',
            },
            {
              text: 'Update Sekarang',

              onPress: () => {
                Linking.openURL(url).catch(
                  () => {
                    Alert.alert(
                      'Gagal',
                      'Tidak dapat membuka APK.'
                    );
                  }
                );
              },
            },
          ],

          {
            cancelable: true,
          }
        );
      } catch {
        // Aplikasi tetap berjalan saat offline.
      }
    }

    void check();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
