import type { ConfigContext, ExpoConfig } from 'expo/config';

import project from './project.config.json';

export default ({ config }: ConfigContext): ExpoConfig => {
  const { brand, app, branding, release } = project;

  // ============================================================
  // 1. VALIDASI IDENTITAS APLIKASI
  // ============================================================

  if (!/^[a-z][a-z0-9_]*$/.test(app.key)) {
    throw new Error('Invalid app key');
  }

  if (!/^[a-z][a-z0-9-]*$/.test(app.slug)) {
    throw new Error('Invalid Expo slug');
  }

  if (!/^[a-z0-9_-]+\.db$/.test(app.databaseName)) {
    throw new Error('Invalid database name');
  }

  if (app.androidPackage !== `app.debiyan.${app.key}`) {
    throw new Error('Android package tidak sesuai app key');
  }

  const hex = /^#[a-fA-F0-9]{6}$/;

  if (
    !hex.test(branding.primaryColor) ||
    !hex.test(branding.backgroundColor)
  ) {
    throw new Error('Warna branding harus #RRGGBB');
  }

  // ============================================================
  // 2. NATIVE SPLASH
  // ============================================================
  // Android native splash menampilkan LOGO persegi, bukan desain
  // portrait 9:16. Desain 9:16 ditampilkan oleh komponen React Native
  // FullscreenStartupSplash setelah native splash ditutup.

  const nativeSplashImage =
    './assets/images/android-icon-foreground.png';

  const plugins: NonNullable<ExpoConfig['plugins']> = [
    ...(config.plugins ?? []),
  ];

  const splashIndex = plugins.findIndex(
    (plugin) =>
      plugin === 'expo-splash-screen' ||
      (Array.isArray(plugin) && plugin[0] === 'expo-splash-screen')
  );

  const existingPlugin =
    splashIndex >= 0 ? plugins[splashIndex] : undefined;

  const previousSplashOptions =
    Array.isArray(existingPlugin) &&
    typeof existingPlugin[1] === 'object' &&
    existingPlugin[1] !== null &&
    !Array.isArray(existingPlugin[1])
      ? existingPlugin[1]
      : {};

  const splashPlugin: NonNullable<ExpoConfig['plugins']>[number] = [
    'expo-splash-screen',
    {
      ...previousSplashOptions,
      backgroundColor: branding.backgroundColor,
      image: nativeSplashImage,
      imageWidth: 120,
      resizeMode: 'contain',
      dark: {
        backgroundColor: branding.backgroundColor,
        image: nativeSplashImage,
      },
    },
  ];

  if (splashIndex < 0) {
    plugins.push(splashPlugin);
  } else {
    plugins[splashIndex] = splashPlugin;
  }

  // ============================================================
  // 3. EXPO CONFIG
  // ============================================================

  return {
    ...config,

    name: app.name,
    slug: app.slug,
    scheme: app.scheme,

    icon: branding.icon,
    plugins,

    android: {
      ...config.android,
      package: app.androidPackage,
      adaptiveIcon: {
        foregroundImage: nativeSplashImage,
        backgroundColor: branding.backgroundColor,
      },
    },

    ios: {
      ...config.ios,
      bundleIdentifier: app.iosBundleIdentifier,
      icon: branding.icon,
    },

    web: {
      ...config.web,
      favicon: branding.icon,
    },

    extra: {
      ...config.extra,
      project: {
        brandName: brand.name,
        appName: app.name,
        appKey: app.key,
        databaseName: app.databaseName,
        primaryColor: branding.primaryColor.toUpperCase(),
        backgroundColor: branding.backgroundColor.toUpperCase(),
        apkPrefix: release.apkPrefix,
        releaseOwner: release.owner,
        releaseRepository: release.repository,
      },
    },
  };
};
