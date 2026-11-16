
import AutoUpdateChecker from '@/components/auto-update-checker';
import { AppThemeProvider } from '@/contexts/theme-context';
import { DATABASE_NAME } from '@/database/migrations';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import FullscreenStartupSplash from '../components/FullscreenStartupSplash';
import { initializeDeyPocketDatabase } from '../database/deypocket-initialize';

// Native splash tetap aktif sampai custom splash siap.
void SplashScreen.preventAutoHideAsync().catch((error: unknown) => {
  console.warn('[Splash] Cannot keep native splash visible:', error);
});

export default function RootLayout() {
  const [databaseReady, setDatabaseReady] = useState(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);

  const handleDatabaseInit = useCallback(async (db: SQLiteDatabase) => {
    // Pertahankan proses inisialisasi database yang sudah ada.
    await initializeDeyPocketDatabase(db);

    // Custom splash boleh ditutup setelah database siap.
    setDatabaseReady(true);
  }, []);

  const handleDatabaseError = useCallback((error: Error) => {
    console.error('[Database] Initialization failed:', error);

    setDatabaseError(
      error.message || 'Database tidak dapat diinisialisasi.',
    );
  }, []);

  return (
    <FullscreenStartupSplash
      ready={databaseReady || databaseError !== null}
      minVisibleMs={850}
    >
      <SafeAreaProvider>
        <AppThemeProvider>
          {databaseError ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorTitle}>
                Gagal Memulai DeyPocket
              </Text>

              <Text style={styles.errorDescription}>
                {databaseError}
              </Text>

              <Text style={styles.errorHint}>
                Tutup dan buka kembali aplikasi. Jangan hapus data aplikasi
                karena transaksi tersimpan secara lokal.
              </Text>
            </View>
          ) : (
            <SQLiteProvider
              databaseName={DATABASE_NAME}
              onInit={handleDatabaseInit}
              onError={handleDatabaseError}
            >
              <AutoUpdateChecker />

              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen
                  name="(tabs)"
                  options={{ headerShown: false }}
                />
              </Stack>
            </SQLiteProvider>
          )}
        </AppThemeProvider>
      </SafeAreaProvider>
    </FullscreenStartupSplash>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: '#F0FDFA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  errorTitle: {
    color: '#115E59',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  errorDescription: {
    color: '#334155',
    fontSize: 14,
    textAlign: 'center',
  },
  errorHint: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
