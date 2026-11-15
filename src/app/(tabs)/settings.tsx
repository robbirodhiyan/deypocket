
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import {
  Card,
  Divider,
  List,
  Text,
  useTheme,
} from 'react-native-paper';

export default function SettingsScreen() {
  const theme = useTheme();

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
      }}
      contentContainerStyle={{
        width: '100%',
        maxWidth: 780,
        alignSelf: 'center',
        padding: 20,
        paddingBottom: 60,
        gap: 18,
      }}
    >
      {/* HEADER */}

      <View style={{ gap: 5 }}>
        <Text
          variant="labelLarge"
          style={{
            color: theme.colors.primary,
            fontWeight: '800',
            letterSpacing: 1,
          }}
        >
          DEYPOCKET
        </Text>

        <Text
          variant="headlineMedium"
          style={{ fontWeight: '800' }}
        >
          Pengaturan
        </Text>

        <Text
          variant="bodyMedium"
          style={{
            color: theme.colors.onSurfaceVariant,
          }}
        >
          Kelola preferensi dan data keuanganmu.
        </Text>
      </View>

      {/* PENGELOLAAN KEUANGAN */}

      <Text
        variant="titleMedium"
        style={{ fontWeight: '700', marginTop: 6 }}
      >
        Pengelolaan Keuangan
      </Text>

      <Card
        mode="outlined"
        style={{
          borderRadius: 20,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
        }}
      >
        <Card.Content style={{ paddingVertical: 4 }}>
          <List.Item
            title="Dompet & Rekening"
            description="Kelola dompet dan saldo awal"
            left={(props) => (
              <List.Icon
                {...props}
                icon="wallet-outline"
                color={theme.colors.primary}
              />
            )}
            right={(props) => (
              <List.Icon
                {...props}
                icon="chevron-right"
              />
            )}
            onPress={() => router.push('/accounts')}
          />

          <Divider />

          <List.Item
            title="Anggaran Bulanan"
            description="Atur batas pengeluaran"
            left={(props) => (
              <List.Icon
                {...props}
                icon="chart-donut"
                color={theme.colors.primary}
              />
            )}
            right={(props) => (
              <List.Icon
                {...props}
                icon="chevron-right"
              />
            )}
            onPress={() => router.push('/budgets')}
          />

          <Divider />

          <List.Item
            title="Kategori Transaksi"
            description="Tambah, edit, dan kelola kategori"
            left={(props) => (
              <List.Icon
                {...props}
                icon="shape-outline"
                color={theme.colors.primary}
              />
            )}
            right={(props) => (
              <List.Icon
                {...props}
                icon="chevron-right"
              />
            )}
            onPress={() => router.push('/categories')}
          />
        </Card.Content>
      </Card>

      {/* DATA & PRIVASI */}

      <Text
        variant="titleMedium"
        style={{ fontWeight: '700', marginTop: 6 }}
      >
        Data & Privasi
      </Text>

      <Card
        mode="outlined"
        style={{
          borderRadius: 20,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
        }}
      >
        <Card.Content style={{ paddingVertical: 4 }}>
          <List.Item
            title="Backup & Restore"
            description="Integrasi backup keuangan menyusul"
            left={(props) => (
              <List.Icon
                {...props}
                icon="database-outline"
                color={theme.colors.onSurfaceVariant}
              />
            )}
          />

          <Divider />

          <List.Item
            title="Penyimpanan Lokal"
            description="Data tersimpan di perangkat"
            left={(props) => (
              <List.Icon
                {...props}
                icon="shield-check-outline"
                color={theme.colors.primary}
              />
            )}
          />
        </Card.Content>
      </Card>

      {/* INFORMATION */}

      <Card
        mode="contained"
        style={{ borderRadius: 20 }}
      >
        <Card.Content style={{ gap: 7 }}>
          <Text
            variant="titleMedium"
            style={{ fontWeight: '800' }}
          >
            DeyPocket
          </Text>

          <Text variant="bodyMedium">
            Version 1.0.0 — Development
          </Text>

          <Text
            variant="bodySmall"
            style={{
              color: theme.colors.onSurfaceVariant,
            }}
          >
            Powered by DeyKit · Debiyan
          </Text>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}
