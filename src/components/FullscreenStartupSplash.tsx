import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Image,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';

// The existing 9:16 splash file. Keep this path static so Metro bundles it.
const SPLASH_ART = require('../../assets/images/splash-icon.png');

const BACKGROUND_COLOR = '#F0FDFA';
const FADE_DURATION_MS = 250;

interface FullscreenStartupSplashProps {
  children: ReactNode;
  /** True once the app's required startup initialization is complete. */
  ready?: boolean;
  /** Short minimum display to prevent an imperceptible flash on fast devices. */
  minVisibleMs?: number;
}

/**
 * Fullscreen 9:16 React Native startup cover.
 *
 * Native Android splash screen cannot display an arbitrary portrait poster.
 * Keep a small square logo in the native splash, then present this cover
 * as soon as React Native can render an image.
 *
 * Place this outside your SQLiteProvider / navigation tree in the root layout.
 * The children are mounted beneath the cover, so they initialize normally.
 */
export default function FullscreenStartupSplash({
  children,
  ready = true,
  minVisibleMs = 850,
}: FullscreenStartupSplashProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [contentLaidOut, setContentLaidOut] = useState(false);
  const [nativeHidden, setNativeHidden] = useState(false);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [coverVisible, setCoverVisible] = useState(true);

  const fadeStarted = useRef(false);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timeout = setTimeout(
      () => setMinimumElapsed(true),
      Math.max(0, minVisibleMs),
    );
    return () => clearTimeout(timeout);
  }, [minVisibleMs]);

  // Do not dismiss the native splash until the portrait image is loaded.
  useEffect(() => {
    if (!imageLoaded) return;

    let mounted = true;
    void SplashScreen.hideAsync()
      .catch((error: unknown) => {
        console.warn('[Splash] Failed to dismiss native splash:', error);
      })
      .finally(() => {
        if (mounted) setNativeHidden(true);
      });

    return () => {
      mounted = false;
    };
  }, [imageLoaded]);

  // Fade only when the first screen is laid out AND initialization is ready.
  useEffect(() => {
    if (
      !ready ||
      !imageLoaded ||
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
  }, [
    ready,
    imageLoaded,
    contentLaidOut,
    nativeHidden,
    minimumElapsed,
    opacity,
  ]);

  return (
    <View style={styles.root}>
      <View
        style={styles.content}
        onLayout={() => setContentLaidOut(true)}
      >
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
          <Image
            source={SPLASH_ART}
            resizeMode="cover"
            style={styles.image}
            fadeDuration={0}
            onLoadEnd={() => setImageLoaded(true)}
            onError={(event) => {
              console.warn(
                '[Splash] Failed to load portrait splash image:',
                event.nativeEvent.error,
              );
            }}
          />
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
});
