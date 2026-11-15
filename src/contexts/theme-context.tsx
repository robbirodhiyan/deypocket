
import {
    createContext,
    useContext,
    useMemo,
    useState,
    type PropsWithChildren,
} from 'react';

import Constants from 'expo-constants';
import { useColorScheme } from 'react-native';

import {
    MD3DarkTheme,
    MD3LightTheme,
    PaperProvider,
} from 'react-native-paper';

// ============================================================
// TYPES
// ============================================================

export type ThemeMode = 'system' | 'light' | 'dark';

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  isDark: boolean;
};

// ============================================================
// THEME CONTEXT
// ============================================================

const ThemeContext = createContext<ThemeContextValue | null>(
  null
);

// ============================================================
// DYNAMIC BRANDING CONFIGURATION
// ============================================================

const projectConfig = Constants.expoConfig?.extra?.project;

const DEFAULT_PRIMARY_COLOR = '#2563EB';
const DEFAULT_BACKGROUND_COLOR = '#FFFFFF';

function getValidHexColor(
  value: unknown,
  fallback: string
): string {
  if (
    typeof value === 'string' &&
    /^#[0-9A-Fa-f]{6}$/.test(value)
  ) {
    return value.toUpperCase();
  }

  return fallback;
}

const BRAND_PRIMARY_COLOR = getValidHexColor(
  projectConfig?.primaryColor,
  DEFAULT_PRIMARY_COLOR
);

const BRAND_BACKGROUND_COLOR = getValidHexColor(
  projectConfig?.backgroundColor,
  DEFAULT_BACKGROUND_COLOR
);

// ============================================================
// COLOR UTILITIES
// ============================================================

function mixColors(
  first: string,
  second: string,
  amount: number
): string {
  const blend = Math.max(0, Math.min(1, amount));

  const parse = (color: string) => [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16),
  ];

  const a = parse(first);
  const b = parse(second);

  const result = a.map((value, index) => {
    const mixed = Math.round(
      value * (1 - blend) + b[index] * blend
    );

    return mixed.toString(16).padStart(2, '0');
  });

  return `#${result.join('')}`.toUpperCase();
}

function getContrastColor(
  background: string
): string {
  const channels = [
    parseInt(background.slice(1, 3), 16),
    parseInt(background.slice(3, 5), 16),
    parseInt(background.slice(5, 7), 16),
  ].map((value) => {
    const channel = value / 255;

    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });

  const luminance =
    channels[0] * 0.2126 +
    channels[1] * 0.7152 +
    channels[2] * 0.0722;

  return luminance > 0.179
    ? '#000000'
    : '#FFFFFF';
}

// ============================================================
// APP THEME PROVIDER
// ============================================================

export function AppThemeProvider({
  children,
}: PropsWithChildren) {
  const systemScheme = useColorScheme();

  const [mode, setMode] = useState<ThemeMode>(
    'system'
  );

  // ----------------------------------------------------------
  // Determine active theme mode
  // ----------------------------------------------------------

  const isDark =
    mode === 'system'
      ? systemScheme === 'dark'
      : mode === 'dark';

  // ----------------------------------------------------------
  // Generate dynamic Material Design 3 theme
  // ----------------------------------------------------------

  const theme = useMemo(() => {
    const base = isDark
      ? MD3DarkTheme
      : MD3LightTheme;

    // Dark Mode menggunakan warna brand yang lebih terang.
    const primary = isDark
      ? mixColors(
          BRAND_PRIMARY_COLOR,
          '#FFFFFF',
          0.35
        )
      : BRAND_PRIMARY_COLOR;

    const background = isDark
      ? base.colors.background
      : BRAND_BACKGROUND_COLOR;

    const primaryContainer = isDark
      ? mixColors(
          BRAND_PRIMARY_COLOR,
          '#000000',
          0.65
        )
      : mixColors(
          BRAND_PRIMARY_COLOR,
          '#FFFFFF',
          0.85
        );

    const secondary = isDark
      ? '#CBD5E1'
      : '#475569';

    return {
      ...base,

      colors: {
        ...base.colors,

        // Brand identity
        primary,
        onPrimary: getContrastColor(primary),

        primaryContainer,
        onPrimaryContainer:
          getContrastColor(primaryContainer),

        // Supporting color
        secondary,

        // Application background
        background,
        onBackground: getContrastColor(background),
      },
    };
  }, [isDark]);

  // ----------------------------------------------------------
  // Context value
  // ----------------------------------------------------------

  const contextValue = useMemo(
    () => ({
      mode,
      setMode,
      isDark,
    }),
    [mode, isDark]
  );

  // ----------------------------------------------------------
  // Provider
  // ----------------------------------------------------------

  return (
    <ThemeContext.Provider value={contextValue}>
      <PaperProvider theme={theme}>
        {children}
      </PaperProvider>
    </ThemeContext.Provider>
  );
}

// ============================================================
// CUSTOM THEME HOOK
// ============================================================

export function useAppTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error(
      'AppThemeProvider is required'
    );
  }

  return context;
}
