import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Divider, Text, useTheme } from 'react-native-paper';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type SettingLink = {
  title: string;
  description: string;
  icon: IconName;
  href: Href;
};

const FINANCE_LINKS: SettingLink[] = [
  {
    title: 'Dompet & Rekening',
    description: 'Atur rekening dan saldo awal',
    icon: 'wallet-outline',
    href: '/accounts',
  },
  {
    title: 'Anggaran Bulanan',
    description: 'Kelola batas pengeluaran',
    icon: 'chart-donut',
    href: '/budgets',
  },
  {
    title: 'Kategori Transaksi',
    description: 'Atur kategori pemasukan dan pengeluaran',
    icon: 'shape-outline',
    href: '/categories',
  },
  {
    title: 'Target Tabungan',
    description: 'Lihat dan kelola target keuangan',
    icon: 'bullseye-arrow',
    href: '/goals' as Href,
  },
];

const APP_LINKS: SettingLink[] = [
  {
    title: 'Backup Data',
    description: 'Ekspor dan periksa file backup lokal',
    icon: 'database-export',
    href: '/backup-review' as Href,
  },
  {
    title: 'Privasi & Penyimpanan',
    description: 'Informasi keamanan dan data offline',
    icon: 'shield-lock-outline',
    href: '/privacy' as Href,
  },
  {
    title: 'Pembaruan Aplikasi',
    description: 'Periksa fitur dan versi terbaru',
    icon: 'update',
    href: '/updates' as Href,
  },
];

function SettingsRow({
  item,
}: {
  item: SettingLink;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      accessibilityHint={item.description}
      android_ripple={{ color: theme.colors.surfaceVariant }}
      onPress={() => router.push(item.href)}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: theme.colors.surfaceVariant },
      ]}
    >
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: theme.colors.primaryContainer },
        ]}
      >
        <MaterialCommunityIcons
          name={item.icon}
          size={23}
          color={theme.colors.onPrimaryContainer}
        />
      </View>

      <View style={styles.rowText}>
        <Text
          variant="titleSmall"
          style={[styles.rowTitle, { color: theme.colors.onSurface }]}
        >
          {item.title}
        </Text>
        <Text
          variant="bodySmall"
          style={[styles.rowDescription, { color: theme.colors.onSurfaceVariant }]}
        >
          {item.description}
        </Text>
      </View>

      <MaterialCommunityIcons
        name="chevron-right"
        size={23}
        color={theme.colors.onSurfaceVariant}
      />
    </Pressable>
  );
}

function SettingsGroup({
  heading,
  items,
}: {
  heading: string;
  items: SettingLink[];
}) {
  const theme = useTheme();

  return (
    <View style={styles.group}>
      <Text
        variant="titleMedium"
        style={[styles.groupHeading, { color: theme.colors.onSurface }]}
      >
        {heading}
      </Text>

      <Card
        mode="outlined"
        style={[
          styles.groupCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <View>
          {items.map((item, index) => (
            <View key={item.title}>
              {index > 0 && (
                <Divider
                  style={{
                    marginLeft: 74,
                    backgroundColor: theme.colors.outlineVariant,
                  }}
                />
              )}
              <SettingsRow item={item} />
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

export default function SettingsScreen() {
  const theme = useTheme();

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text
          variant="headlineMedium"
          style={[styles.heading, { color: theme.colors.onBackground }]}
        >
          Pengaturan
        </Text>
        <Text
          variant="bodyMedium"
          style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
        >
          Semua yang kamu perlukan untuk mengelola keuanganmu.
        </Text>
      </View>

      <SettingsGroup heading="Keuangan" items={FINANCE_LINKS} />
      <SettingsGroup heading="Aplikasi" items={APP_LINKS} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 96,
    gap: 27,
  },
  header: {
    gap: 7,
  },
  heading: {
    fontWeight: '800',
    letterSpacing: -0.65,
  },
  subtitle: {
    lineHeight: 22,
  },
  group: {
    gap: 12,
  },
  groupHeading: {
    fontWeight: '800',
    letterSpacing: -0.3,
    paddingHorizontal: 2,
  },
  groupCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  row: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 15,
    gap: 13,
  },
  iconContainer: {
    width: 45,
    height: 45,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowTitle: {
    fontWeight: '700',
    flexShrink: 1,
  },
  rowDescription: {
    lineHeight: 18,
    flexShrink: 1,
  },
});
