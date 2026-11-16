import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// Desain portrait asli (9:16). Metro perlu path require yang statis.
const SPLASH_ART = require('../../assets/images/splash-icon.png');

const BACKGROUND_COLOR = '#F0FDFA';
const FADE_DURATION_MS = 250;

type Props = {
  children: ReactNode;
  /** Set true setelah inisialisasi penting (mis. SQLite) selesai. */
  ready?: boolean;
  /** Lama minimum CUSTOM splash terlihat setelah native splash ditutup. */
  minVisibleMs?: number;
};

/**
 * Native splash -> gambar portrait -> halaman utama.
 * Letakkan di luar SQLiteProvider pada root layout.
 */
export default function FullscreenStartupSplash({
  children,
  ready = true,
  minVisibleMs = 850,
}: Props) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [contentLaidOut, setContentLaidOut] = useState(false);
  const [nativeHidden, setNativeHidden] = useState(false);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [coverVisible, setCoverVisible] = useState(true);

  const fadeStarted = useRef(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const imageReady = imageLoaded || imageFailed;

  // Waktu minimum dihitung sesudah native splash hilang, bukan sejak mount.
  useEffect(() => {
    if (!nativeHidden) return;

    const timeout = setTimeout(
      () => setMinimumElapsed(true),
      Math.max(0, minVisibleMs),
    );
    return () => clearTimeout(timeout);
  }, [nativeHidden, minVisibleMs]);

  // Jangan menutup native splash sampai gambar berhasil dimuat, atau
  // fallback tersedia jika asset gagal dibaca.
  useEffect(() => {
    if (!imageReady) return;

    let active = true;
    void SplashScreen.hideAsync()
      .catch((error: unknown) => {
        console.warn('[Splash] Failed to hide native splash:', error);
      })
      .finally(() => {
        if (active) setNativeHidden(true);
      });

    return () => {
      active = false;
    };
  }, [imageReady]);

  // Tampilkan dashboard hanya setelah database siap dan waktu minimum lewat.
  useEffect(() => {
    if (
      !ready ||
      !imageReady ||
      !contentLaidOut ||
      !nativeHidden ||
      !minimumElapsed ||
      fadeStarted.current
    ) {
      return;
    }

    fadeStarted.current = true;
    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_DURATION_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setCoverVisible(false);
    });
  }, [ready, imageReady, contentLaidOut, nativeHidden, minimumElapsed, opacity]);

  return (
    <View style={styles.root}>
      <View style={styles.content} onLayout={() => setContentLaidOut(true)}>
        {children}
      </View>

      {coverVisible && (
        <Animated.View
          style={[styles.cover, { opacity }]}
          pointerEvents="auto"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <StatusBar hidden />

          {imageFailed ? (
            <View style={styles.fallback}>
              <Text style={styles.fallbackTitle}>DeyPocket</Text>
            </View>
          ) : (
            <Image
              source={SPLASH_ART}
              resizeMode="contain"
              style={styles.image}
              fadeDuration={0}
              onLoad={() => setImageLoaded(true)}
              onError={(event) => {
                console.warn(
                  '[Splash] Failed to load portrait image:',
                  event.nativeEvent.error,
                );
                setImageFailed(true);
              }}
            />
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
  },
  content: {
    flex: 1,
  },
  cover: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BACKGROUND_COLOR,
    zIndex: 1000,
    elevation: 1000,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackTitle: {
    color: '#115E59',
    fontSize: 28,
    fontWeight: '800',
  },
});
