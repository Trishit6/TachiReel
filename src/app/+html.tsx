import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';
import { SUPPORT_ARTICLES } from '../lib/support-content';
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_ORIGIN } from '../lib/site';

type RootProps = PropsWithChildren<{
  pathname?: string;
  params?: Record<string, string | string[]>;
}>;

const BREADCRUMB_LABELS: Record<string, string> = {
  discover: 'Explore',
  reelyx: 'Reelyx',
  support: 'Help & Support',
  articles: 'Help articles',
  tickets: 'Support tickets',
  post: 'Posts',
  comments: 'Comments',
  user: 'Profiles',
  chat: 'Messages',
};

const NO_STRUCTURED_DATA_PREFIXES = ['/admin', '/auth', '/guardian', '/reset-password', '/chat', '/inbox'];
const NOT_FOUND_PATHS = ['/404', '/+not-found'];

const WEB_FONTS = [
  { family: 'PlusJakartaSans_400Regular', file: 'PlusJakartaSans-400Regular.woff2' },
  { family: 'PlusJakartaSans_500Medium', file: 'PlusJakartaSans-500Medium.woff2' },
  { family: 'PlusJakartaSans_600SemiBold', file: 'PlusJakartaSans-600SemiBold.woff2' },
  { family: 'PlusJakartaSans_700Bold', file: 'PlusJakartaSans-700Bold.woff2' },
  { family: 'PlusJakartaSans_800ExtraBold', file: 'PlusJakartaSans-800ExtraBold.woff2' },
  { family: 'BricolageGrotesque_800ExtraBold', file: 'BricolageGrotesque-800ExtraBold.woff2' },
] as const;

const FONT_CSS = WEB_FONTS.map(
  (font) =>
    `@font-face{font-family:'${font.family}';src:url('/fonts/${font.file}') format('woff2');font-style:normal;font-display:block;}`,
).join('');

function safeJsonLd(value: unknown[]): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function breadcrumbSchema(pathname: string) {
  if (NO_STRUCTURED_DATA_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
  const segments = pathname.split('/').filter(Boolean);
  if (!segments.length) return null;

  const items = segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join('/')}`;
    const label = BREADCRUMB_LABELS[segment] ?? decodeURIComponent(segment).replace(/[-_]/g, ' ');
    return {
      '@type': 'ListItem',
      position: index + 1,
      name: label.charAt(0).toUpperCase() + label.slice(1),
      item: absoluteUrl(href),
    };
  });

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  };
}

function articleSchema(pathname: string) {
  const match = pathname.match(/^\/support\/articles\/([^/]+)$/);
  if (!match) return null;
  const slug = decodeURIComponent(match[1]);
  const article = SUPPORT_ARTICLES.find((item) => item.slug === slug);
  if (!article) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: article.title,
    description: article.summary,
    mainEntityOfPage: absoluteUrl(pathname),
    url: absoluteUrl(pathname),
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
    keywords: article.keywords.join(', '),
  };
}

function structuredData(pathname: string) {
  if (NO_STRUCTURED_DATA_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return [];
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_ORIGIN,
    description: SITE_DESCRIPTION,
    logo: absoluteUrl('/icon-512.png'),
  };
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_ORIGIN,
    description: SITE_DESCRIPTION,
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
    inLanguage: 'en',
  };
  const app = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    applicationCategory: 'SocialNetworkingApplication',
    operatingSystem: 'Web, iOS, Android',
    url: SITE_ORIGIN,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
  return [organization, website, app, breadcrumbSchema(pathname), articleSchema(pathname)].filter(Boolean);
}

// Mirrors the provider's saved preference before first paint. It runs only in
// the browser, never during static rendering.
const THEME_SCRIPT = `
(function () {
  try {
    var themeKey = 'tachireel.theme';
    var saved = window.localStorage.getItem(themeKey);
    if (saved === null) {
      var suffix = '.theme';
      for (var i = 0; i < window.localStorage.length; i += 1) {
        var legacyKey = window.localStorage.key(i);
        if (!legacyKey || legacyKey === themeKey || legacyKey.slice(-suffix.length) !== suffix) continue;
        var prefix = legacyKey.slice(0, -suffix.length);
        if (!prefix || prefix.indexOf('.') !== -1) continue;
        var legacyValue = window.localStorage.getItem(legacyKey);
        if (legacyValue === null) continue;
        window.localStorage.setItem(themeKey, legacyValue);
        window.localStorage.removeItem(legacyKey);
        saved = legacyValue;
        break;
      }
    }
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = saved === 'dark' || ((saved === 'system' || !saved) && prefersDark);
    var root = document.documentElement;
    root.classList.toggle('tachireel-dark', dark);
    root.classList.toggle('tachireel-light', !dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    root.style.backgroundColor = dark ? '#20221F' : '#F5F1E9';
    if (document.body) {
      document.body.style.backgroundColor = root.style.backgroundColor;
      document.body.style.color = dark ? '#F5F1E9' : '#292B28';
    }
  } catch (error) {}
})();
`;

// Video elements can reject play() when media is interrupted before Expo's web
// error handler attaches. Ignore only those known benign abortions.
const MEDIA_SCRIPT = `
(function () {
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    if (
      reason &&
      reason.name === 'AbortError' &&
      /play\\(\\) request was interrupted|media was removed|paused to save power/i.test(String(reason.message || ''))
    ) {
      event.preventDefault();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    }
  });
})();
`;

export default function Root({ children, pathname = '/' }: RootProps) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();
  const isNotFound = NOT_FOUND_PATHS.includes(pathname);
  const jsonLd = structuredData(pathname);

  return (
    <html lang="en" {...htmlAttributes} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#F8F0E6" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {WEB_FONTS.map((font) => (
          <link key={font.file} rel="preload" href={`/fonts/${font.file}`} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
        <style id="tachireel-fonts" dangerouslySetInnerHTML={{ __html: FONT_CSS }} />
        <ScrollViewStyleReset />
        {headNodes}
        {isNotFound ? (
          <>
            <title>{`Page not found · ${SITE_NAME}`}</title>
            <meta name="description" content="The page you were looking for is not available on TachiReel." />
            <link rel="canonical" href={absoluteUrl('/404')} />
            <meta name="robots" content="noindex" />
          </>
        ) : null}
        {jsonLd.length ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
        ) : null}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body {...bodyAttributes} suppressHydrationWarning>
        <noscript>You need to enable JavaScript to run this app.</noscript>
        {children}
        <script dangerouslySetInnerHTML={{ __html: MEDIA_SCRIPT }} />
        {bodyNodes}
      </body>
    </html>
  );
}
