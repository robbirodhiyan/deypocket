
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import SafeAdaptiveTabs from '../../components/SafeAdaptiveTabs';

export default function DeyPocketTabLayout() {
  const theme = useTheme();

  // =====================================================
  // THEME COLORS
  // =====================================================
  const activeColor = theme.colors.primary;
  const inactiveColor = theme.colors.onSurfaceVariant;

  return (
    <SafeAdaptiveTabs
      screenOptions={{
        // =================================================
        // GENERAL
        // =================================================
        headerShown: false,

        tabBarPosition: 'bottom',
        tabBarShowLabel: true,
        tabBarLabelPosition: 'below-icon',
        tabBarHideOnKeyboard: true,

        // =================================================
        // COLORS
        // =================================================
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,

        tabBarActiveBackgroundColor: theme.colors.surface,
        tabBarInactiveBackgroundColor: theme.colors.surface,

        // =================================================
        // TAB BAR STYLE
        // =================================================
        tabBarStyle: {
          backgroundColor: theme.colors.surface,

          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.outlineVariant,

          paddingTop: 6,

          ...(Platform.OS === 'web'
            ? { paddingBottom: 6 }
            : {}),

          elevation: 6,

          shadowColor: theme.colors.shadow,
          shadowOffset: {
            width: 0,
            height: -2,
          },
          shadowOpacity: theme.dark ? 0.16 : 0.08,
          shadowRadius: 8,
        },

        // =================================================
        // ICON & LABEL
        // =================================================
        tabBarIconStyle: {
          marginTop: 2,
        },

        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },

        tabBarItemStyle: {
          paddingVertical: 2,
        },
      }}
    >
      {/* =================================================
          1. BERANDA
      ================================================= */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Beranda',
          tabBarLabel: 'Beranda',
          tabBarAccessibilityLabel: 'Buka Beranda',

          tabBarIcon: ({ focused, size }) => (
            <MaterialCommunityIcons
              name={focused ? 'home' : 'home-outline'}
              size={size}
              color={focused ? activeColor : inactiveColor}
            />
          ),
        }}
      />

      {/* =================================================
          2. TRANSAKSI
      ================================================= */}
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transaksi',
          tabBarLabel: 'Transaksi',
          tabBarAccessibilityLabel: 'Buka Transaksi',

          tabBarIcon: ({ focused, size }) => (
            <MaterialCommunityIcons
              name={focused ? 'text-box' : 'text-box-outline'}
              size={size}
              color={focused ? activeColor : inactiveColor}
            />
          ),
        }}
      />

      {/* =================================================
          3. INSIGHT
      ================================================= */}
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insight',
          tabBarLabel: 'Insight',
          tabBarAccessibilityLabel: 'Buka Insight',

          tabBarIcon: ({ focused, size }) => (
            <MaterialCommunityIcons
              name={focused ? 'chart-box' : 'chart-box-outline'}
              size={size}
              color={focused ? activeColor : inactiveColor}
            />
          ),
        }}
      />

      {/* =================================================
          4. PENGATURAN
      ================================================= */}
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Pengaturan',
          tabBarLabel: 'Pengaturan',
          tabBarAccessibilityLabel: 'Buka Pengaturan',

          tabBarIcon: ({ focused, size }) => (
            <MaterialCommunityIcons
              name={focused ? 'cog' : 'cog-outline'}
              size={size}
              color={focused ? activeColor : inactiveColor}
            />
          ),
        }}
      />
    </SafeAdaptiveTabs>
  );
}
