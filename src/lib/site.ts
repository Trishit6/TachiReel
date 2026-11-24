/**
 * Single source of truth for public URLs and discovery metadata.
 *
 * The default origin is local so SEO/share links work during development.
 * Set EXPO_PUBLIC_APP_URL to the production origin when the custom domain is
 * ready; no other file needs to change.
 */
export const SITE_NAME = 'TachiReel';
export const SITE_TAGLINE = 'Capture. Share. Explore.';
export const SITE_DESCRIPTION =
  'TachiReel is a gentle photo and short-video social app for sharing everyday moments with a small circle.';
export const SHARE_IMAGE_PATH = '/og-image.png';

const configuredOrigin = process.env.EXPO_PUBLIC_APP_URL?.trim().replace(/\/+$/, '');

export const SITE_ORIGIN = configuredOrigin || 'http://localhost:8081';

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_ORIGIN}${normalized === '/' && SITE_ORIGIN.endsWith('/') ? '' : normalized}`;
}

export function webUrl(path: string, params?: Record<string, string | number | undefined>): string {
  const url = new URL(absoluteUrl(path));
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export const PUBLIC_SITE_ROUTES = [
  { path: '/', priority: '1.0', changeFrequency: 'weekly' },
  { path: '/support', priority: '0.8', changeFrequency: 'weekly' },
] as const;

export const PUBLIC_ARTICLE_SLUGS = [
  'getting-started',
  'community-guidelines',
  'post-review',
  'reelyx',
  'privacy',
  'teen-safety',
  'messages',
  'attachments',
  'voice-support',
] as const;
