/**
 * TachiReel — Warm Editorial theme provider.
 *
 * A single provider owns the selected preference and the resolved palette.
 * Every `useTheme()` call reads the same context, so switching appearance in
 * the navbar updates every route, modal and toast immediately.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Easing, Platform, useColorScheme, type ViewStyle } from 'react-native';
import { readPreferenceSync } from '../lib/storage';
import { dark, light, handwritten } from './colors';

// ============================
// TYPOGRAPHY SYSTEM
// ============================

const fontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
} as const;

const typography = {
  h1: {
    fontFamily: fontFamily.bold,
    fontSize: 32,
    letterSpacing: -0.5,
    fontWeight: 700,
  },
  h2: {
    fontFamily: fontFamily.semiBold,
    fontSize: 24,
    letterSpacing: -0.4,
    fontWeight: 600,
  },
  h3: {
    fontFamily: fontFamily.medium,
    fontSize: 19,
    letterSpacing: -0.25,
    fontWeight: 600,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    letterSpacing: 0.15,
    fontWeight: 400,
  },
  bodySmall: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    letterSpacing: 0.1,
    fontWeight: 400,
  },
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    letterSpacing: 0.3,
    fontWeight: 400,
  },
  overline: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  },
  tiny: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 0.5,
    fontWeight: 500,
  },
  small: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    letterSpacing: 0.1,
    fontWeight: 500,
  },
  smallMedium: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    letterSpacing: 0.1,
    fontWeight: 500,
  },
  bodyMedium: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    letterSpacing: 0.1,
    fontWeight: 500,
  },
  buttonLarge: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    letterSpacing: 0.3,
    fontWeight: 600,
  },
  buttonMedium: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    letterSpacing: 0.3,
    fontWeight: 600,
  },
  buttonSmall: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    letterSpacing: 0.3,
    fontWeight: 600,
  },
  button: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    letterSpacing: 0.3,
    fontWeight: 600,
  },
  display: {
    fontFamily: fontFamily.bold,
    fontSize: 32,
    letterSpacing: -0.6,
    fontWeight: 700,
  },
  displaySm: {
    fontFamily: fontFamily.semiBold,
    fontSize: 22,
    letterSpacing: -0.35,
    fontWeight: 600,
  },
} as const;

// ============================
// THEME PERSISTENCE
// ============================

const THEME_KEY = 'tachireel.theme';

export type ThemeMode = 'light' | 'dark' | 'system';

function readSavedMode(): ThemeMode {
  const saved = readPreferenceSync(THEME_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  return 'system';
}

// useSyncExternalStore keeps the first client render identical to the static
// HTML (light/system), then applies the saved preference immediately after
// hydration. This avoids a React hydration mismatch for dark-mode visitors.
let currentMode: ThemeMode | undefined;
const themeListeners = new Set<() => void>();

function subscribeThemeMode(listener: () => void): () => void {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

function getThemeModeSnapshot(): ThemeMode {
  if (currentMode === undefined) currentMode = readSavedMode();
  return currentMode;
}

function getThemeModeServerSnapshot(): ThemeMode {
  return 'system';
}

function setThemeModeSnapshot(mode: ThemeMode): void {
  currentMode = mode;
  themeListeners.forEach((listener) => listener());
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function systemPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// ============================
// CONTEXT
// ============================

type ThemeValue = {
  theme: ThemeMode;
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  colors: any;
  type: typeof typography;
  shadows: any;
  radii: any;
  spacing: typeof spacing;
  motion: typeof motion;
  reduceMotion: boolean;
  handwritten: typeof handwritten;
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
};

const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

const shadows = {
  none: {},
  sm: { shadowColor: '#1B1C19', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1 },
  md: { shadowColor: '#1B1C19', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 },
  lg: { shadowColor: '#1B1C19', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 24, elevation: 6 },
  soft: { shadowColor: '#1B1C19', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  floating: { shadowColor: '#1B1C19', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 28, elevation: 8 },
  clay: { shadowColor: '#1B1C19', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 9, elevation: 2 },
  lifted: { shadowColor: '#1B1C19', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.07, shadowRadius: 14, elevation: 4 },
} as const;

const radii = { xs: 8, sm: 10, md: 14, lg: 20, xl: 28, input: 14, pill: 999, control: 12, card: 18, floating: 20 } as const;

/**
 * One motion vocabulary for the whole app. Timings are deliberately tiered so
 * a button tap never feels as slow as a dialog, and every curve is the same
 * gentle ease-out. Native animations use `easing`; the web layer uses
 * `cssEasing` so hover/colour transitions match the Animated ones exactly.
 */
const motion = {
  duration: {
    instant: 120,
    fast: 160,
    standard: 220,
    panel: 280,
    page: 300,
  },
  easing: Easing.bezier(0.22, 1, 0.36, 1),
  cssEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

/** CSS transition metadata for surfaces whose colour/border changes on hover. */
export function surfaceTransition(duration = motion.duration.fast): ViewStyle | undefined {
  if (Platform.OS !== 'web') return undefined;
  // ThemeProvider re-renders the tree on preference changes, so checking the
  // same media query here keeps CSS transitions aligned with Animated ones.
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
  return {
    transitionProperty: 'background-color, border-color, color, opacity, box-shadow',
    transitionDuration: `${duration}ms`,
    transitionTimingFunction: motion.cssEasing,
  } as unknown as ViewStyle;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const colorScheme = useColorScheme();
  const mode = useSyncExternalStore(subscribeThemeMode, getThemeModeSnapshot, getThemeModeServerSnapshot);
  const [reduceMotion, setReduceMotion] = useState(false);

  const resolved: 'light' | 'dark' =
    mode === 'system' ? (colorScheme === 'dark' || (colorScheme == null && systemPrefersDark()) ? 'dark' : 'light') : mode;

  const colors: any = resolved === 'dark' ? dark : light;

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(systemPrefersReducedMotion());
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.toggle('tachireel-dark', resolved === 'dark');
    root.classList.toggle('tachireel-light', resolved === 'light');
    root.style.colorScheme = resolved;
    root.style.backgroundColor = colors.background;
    document.body.style.backgroundColor = colors.background;
    document.body.style.color = colors.ink;
  }, [colors.background, colors.ink, resolved]);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setThemeModeSnapshot(nextMode);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(THEME_KEY, nextMode);
    } catch {
      // The preference simply will not persist if storage is unavailable.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setMode]);

  const value = useMemo<ThemeValue>(
    () => ({
      theme: mode,
      mode,
      resolved,
      colors,
      type: typography,
      shadows,
      radii,
      spacing,
      motion,
      reduceMotion,
      handwritten,
      toggleTheme,
      setMode,
    }),
    [colors, mode, reduceMotion, resolved, setMode, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}

export const getTypography = (key: keyof typeof typography) => typography[key];

export { dark, light };
export default ThemeProvider;
