import type {
  ConfigContext,
  ExpoConfig,
} from 'expo/config';

import project from './project.config.json';

export default ({
  config,
}: ConfigContext): ExpoConfig => {
  const {
    brand,
    app,
    branding,
    release,
  } = project;

  if (!/^[a-z][a-z0-9_]*$/.test(app.key)) {
    throw new Error('Invalid app key');
  }

  if (!/^[a-z][a-z0-9-]*$/.test(app.slug)) {
    throw new Error('Invalid Expo slug');
  }

  if (!/^[a-z0-9_-]+\.db$/.test(
    app.databaseName
  )) {
    throw new Error('Invalid database name');
  }

  if (
    app.androidPackage !==
    'app.debiyan.' + app.key
  ) {
    throw new Error(
      'Android package tidak sesuai app key'
    );
  }

  const hex = /^#[a-fA-F0-9]{6}$/;

  if (
    !hex.test(branding.primaryColor) ||
    !hex.test(branding.backgroundColor)
  ) {
    throw new Error(
      'Warna branding harus #RRGGBB'
    );
  }

  const plugins = [
    ...(config.plugins ?? []),
  ];

  const index = plugins.findIndex(
    (plugin) =>
      plugin === 'expo-splash-screen' ||
      (
        Array.isArray(plugin) &&
        plugin[0] === 'expo-splash-screen'
      )
  );

  const previous =
    index >= 0 &&
    Array.isArray(plugins[index])
      ? plugins[index][1] ?? {}
      : {};

  const splash:
    NonNullable<ExpoConfig['plugins']>[number] = [
      'expo-splash-screen',
      {
        ...previous,
        backgroundColor:
          branding.backgroundColor,

        image:
          branding.splashImage,

        imageWidth: 120,
      },
    ];

  if (index < 0) {
    plugins.push(splash);
  } else {
    plugins[index] = splash;
  }

  return {
    ...config,

    name: app.name,
    slug: app.slug,
    scheme: app.scheme,

    icon: branding.icon,

    plugins,

    android: {
      ...config.android,

      package:
        app.androidPackage,

      adaptiveIcon: {
        foregroundImage:
          './assets/images/android-icon-foreground.png',

        backgroundColor:
          branding.backgroundColor,
      },
    },

    ios: {
      ...config.ios,

      bundleIdentifier:
        app.iosBundleIdentifier,

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

        databaseName:
          app.databaseName,

        primaryColor:
          branding.primaryColor.toUpperCase(),

        backgroundColor:
          branding.backgroundColor.toUpperCase(),

        apkPrefix:
          release.apkPrefix,

        releaseOwner:
          release.owner,

        releaseRepository:
          release.repository,
      },
    },
  };
};
