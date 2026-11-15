
import { useState } from 'react';
import { Linking, View } from 'react-native';

import {
    Button,
    Card,
    Text,
    useTheme,
} from 'react-native-paper';

import {
    Download,
    RefreshCw,
} from 'lucide-react-native';

import {
    checkForAppUpdate,
    getInstalledVersion,
    type AppUpdateInfo,
} from '@/services/app-update';

export default function AppUpdateCard() {
  const theme = useTheme();

  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);
  const [message, setMessage] = useState('');

  async function handleCheck() {
    setLoading(true);
    setMessage('');

    try {
      const result = await checkForAppUpdate();
      setInfo(result);

      if (!result.latestVersion) {
        setMessage('Belum ada rilis APK yang tersedia.');
      } else if (!result.hasUpdate) {
        setMessage('Aplikasi sudah menggunakan versi terbaru.');
      } else {
        setMessage('Versi terbaru tersedia untuk diunduh.');
      }
    } catch (error) {
      setInfo(null);
      setMessage(
        error instanceof Error
          ? error.message
          : 'Tidak dapat memeriksa update.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    if (!info?.downloadUrl || !info.hasUpdate) return;

    try {
      await Linking.openURL(info.downloadUrl);
    } catch {
      setMessage('Gagal membuka tautan unduhan APK.');
    }
  }

  return (
    <Card mode="outlined">
      <Card.Title
        title="Application Update"
        subtitle="GitHub Releases"
      />

      <Card.Content style={{ gap: 14 }}>
        <View>
          <Text variant="bodySmall">Installed Version</Text>
          <Text variant="titleMedium">
            v{getInstalledVersion()}
          </Text>
        </View>

        <View>
          <Text variant="bodySmall">Latest Version</Text>
          <Text variant="titleMedium">
            {info?.latestVersion
              ? `v${info.latestVersion}`
              : 'Belum diperiksa'}
          </Text>
        </View>

        {info?.prerelease && (
          <Text style={{ color: theme.colors.secondary }}>
            Versi pengujian (Pre-release)
          </Text>
        )}

        {Boolean(message) && (
          <Text variant="bodyMedium">{message}</Text>
        )}

        <Button
          mode="outlined"
          loading={loading}
          disabled={loading}
          icon={({ size, color }) => (
            <RefreshCw size={size} color={color} />
          )}
          onPress={handleCheck}
        >
          Check for Updates
        </Button>

        {info?.hasUpdate && info.downloadUrl && (
          <Button
            mode="contained"
            icon={({ size, color }) => (
              <Download size={size} color={color} />
            )}
            onPress={handleDownload}
          >
            Download APK
          </Button>
        )}
      </Card.Content>
    </Card>
  );
}
