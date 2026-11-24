/**
 * TachiReel — Warm Editorial × Modern Social design tokens.
 *
 * One source of truth for both themes. Components should use semantic
 * tokens (background, surface, ink, muted, accent, input, ...) instead of
 * hardcoding colours. Legacy aliases are kept so older screens keep working.
 */

export const light = {
  // Core surfaces
  mainBackground: '#F5F1E9',
  secondaryBackground: '#EEEAE1',
  surface: '#FFFFFF',
  elevatedSurface: '#FAF8F3',
  surfaceRaised: '#FFFFFF',
  surfaceDeep: '#EEEAE1',
  card: '#FFFFFF',
  nav: '#FFFFFF',
  navActive: '#E7EBDD',
  input: '#FFFFFF',
  inputBorder: '#E4DED3',
  disabled: '#EEEAE1',
  disabledText: '#B8B3A8',

  // Text
  primaryText: '#292B28',
  secondaryText: '#77766E',
  mutedText: '#99968D',

  // Lines and states
  border: '#E4DED3',
  borderStrong: '#D6CFC2',
  line: '#E4DED3',
  lineStrong: '#D6CFC2',
  focus: '#899579',
  highlight: '#E4DED3',
  skeleton: '#EAE5DB',

  // Brand accents
  accent: '#899579',
  accentHover: '#748366',
  accentSoft: '#E7EBDD',
  accentContrast: '#20221F',
  secondaryAccent: '#C98269',
  secondaryAccentSoft: '#F3E2DA',
  success: '#748366',
  successSoft: '#E7EBDD',
  danger: '#B85C4A',
  dangerContrast: '#FFFFFF',
  dangerSoft: '#F6E1DB',

  // Legacy / compatibility aliases
  background: '#F5F1E9',
  backgroundAlt: '#EEEAE1',
  ink: '#292B28',
  inkSoft: '#77766E',
  muted: '#99968D',
  mutedLight: '#A8A499',
  sage: '#899579',
  sageSoft: '#E7EBDD',
  mint: '#8FA39A',
  mintSoft: '#E6ECE6',
  peach: '#C98269',
  peachSoft: '#F3E2DA',
  butter: '#C6A66B',
  butterSoft: '#F3EBDD',
  glassSurface: 'rgba(255,255,255,0.55)',
  glassBorder: '#E4DED3',
  overlay: 'rgba(41,43,40,0.42)',
  mediaOverlay: 'rgba(20,22,19,0.58)',
  white: '#FFFFFF',
} as const;

export const dark = {
  // Core surfaces
  mainBackground: '#20221F',
  secondaryBackground: '#272A25',
  surface: '#30332E',
  elevatedSurface: '#363A34',
  surfaceRaised: '#363A34',
  surfaceDeep: '#272A25',
  card: '#30332E',
  nav: '#272A25',
  navActive: '#343A31',
  input: '#292C27',
  inputBorder: '#41453D',
  disabled: '#2B2E29',
  disabledText: '#6F7269',

  // Text
  primaryText: '#F5F1E9',
  secondaryText: '#B9B8AC',
  mutedText: '#92958A',

  // Lines and states
  border: '#41453D',
  borderStrong: '#4F554A',
  line: '#41453D',
  lineStrong: '#4F554A',
  focus: '#A5B294',
  highlight: '#41453D',
  skeleton: '#2B2E29',

  // Brand accents
  accent: '#A5B294',
  accentHover: '#B8C5A5',
  accentSoft: '#343A31',
  accentContrast: '#20221F',
  secondaryAccent: '#D2947D',
  secondaryAccentSoft: '#3A2E29',
  success: '#A5B294',
  successSoft: '#343A31',
  danger: '#D2947D',
  dangerContrast: '#20221F',
  dangerSoft: '#3A2E29',

  // Legacy / compatibility aliases
  background: '#20221F',
  backgroundAlt: '#272A25',
  ink: '#F5F1E9',
  inkSoft: '#B9B8AC',
  muted: '#92958A',
  mutedLight: '#75786E',
  sage: '#A5B294',
  sageSoft: '#343A31',
  mint: '#9DB3AB',
  mintSoft: '#2D3633',
  peach: '#D2947D',
  peachSoft: '#3A2E29',
  butter: '#D6B77E',
  butterSoft: '#3B3529',
  glassSurface: 'rgba(255,255,255,0.055)',
  glassBorder: '#41453D',
  overlay: 'rgba(12,13,11,0.58)',
  mediaOverlay: 'rgba(12,13,11,0.62)',
  white: '#FFFFFF',
} as const;

export type ColorPalette = typeof dark | typeof light;
export const isDarkTheme = (theme: string) => theme === 'dark';

// === HANDWRITTEN ACCENT TEXTS ===
export const handwritten = {
  welcomeBack: 'Welcome back!',
  goodVibes: 'Good vibes.',
  yourLittleCorner: 'Your little corner.',
  madeWithMoments: 'Made with moments.',
} as const;
