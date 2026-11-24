import { useMemo } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { FontDisplay, loadAsync, useFonts } from 'expo-font';
import { SessionProvider } from '../lib/session';
import { TachiReelMark } from '../components/Brand';
import { ToastProvider } from '../components/ui';
import { ThemeProvider, useTheme } from '../theme/theme';
import { dark, light } from '../theme/colors';

const FEATHER_FAMILY = Feather.getFontFamily();
const FEATHER_SOURCE = Feather.font[FEATHER_FAMILY];

/**
 * Text fonts are declared in src/app/+html.tsx as small, preloaded WOFF2 files.
 * Calling useFonts on web would inject a second set of @font-face rules at
 * runtime and trigger Chrome's "slow network / fallback font" intervention.
 * The Feather icon font still loads through expo-font, so register it during
 * render with font-display:block before vector-icons can load it with auto.
 * Native needs expo-font to load the bundled TTF assets.
 */
export default function RootLayout() {
  useMemo(() => {
    if (Platform.OS !== 'web') return;
    void loadAsync({
      [FEATHER_FAMILY]: { uri: FEATHER_SOURCE, display: FontDisplay.BLOCK },
    });
  }, []);

  if (Platform.OS === 'web') return <AppProviders />;
  return <NativeFontGate />;
}

function NativeFontGate() {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? dark : light;
  const [loaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    BricolageGrotesque_800ExtraBold,
  });

  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, backgroundColor: palette.background }}>
        <TachiReelMark size={56} />
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  return <AppProviders />;
}

function AppProviders() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionProvider>
          <ToastProvider>
            <RootStack />
          </ToastProvider>
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootStack() {
  const { resolved, colors, motion, reduceMotion } = useTheme();
  return (
    <>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade',
          animationDuration: reduceMotion ? 0 : motion.duration.page,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="guardian-pending" />
        <Stack.Screen name="guardian-consent" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
