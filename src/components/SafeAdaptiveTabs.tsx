import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = ComponentProps<typeof Tabs>;

/**
 * Drop-in wrapper for Expo Router JavaScript Tabs.
 * Keeps existing Tabs.Screen definitions, colors, labels, icons and callbacks.
 * Avoids the system cutout and Android gesture-navigation area.
 */
export default function SafeAdaptiveTabs({ screenOptions, ...props }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      {...props}
      screenOptions={(args) => {
        const previous =
          typeof screenOptions === 'function'
            ? screenOptions(args)
            : (screenOptions ?? {});

        const originalTabStyle = StyleSheet.flatten(previous.tabBarStyle) ?? {};
        const originalSceneStyle = StyleSheet.flatten(previous.sceneStyle) ?? {};
        const originalLabelStyle = StyleSheet.flatten(previous.tabBarLabelStyle) ?? {};

        const bottom = Platform.OS === 'web' ? 0 : Math.max(0, insets.bottom);
        const top = Platform.OS === 'web' ? 0 : Math.max(0, insets.top);
        const hasTabHeader = previous.headerShown === true;

        return {
          ...previous,
          tabBarHideOnKeyboard: true,
          tabBarLabelPosition: 'below-icon' as const,
          tabBarLabelStyle: {
            ...originalLabelStyle,
            fontSize: originalLabelStyle.fontSize ?? 10,
          },
          sceneStyle: {
            ...originalSceneStyle,
            paddingTop: hasTabHeader ? 0 : top,
          },
          tabBarStyle: {
            ...originalTabStyle,
            // A floating/absolute tab bar can cover last rows and the system bar.
            position: 'relative' as const,
            height: 60 + bottom,
            paddingTop: 6,
            paddingBottom: bottom,
          },
        };
      }}
    />
  );
}
