import type { Metadata } from 'expo-router/server';
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SHARE_IMAGE_PATH } from './site';

type PageSeoOptions = {
  title?: string;
  description: string;
  path: string;
  keywords?: string[];
  image?: string;
  type?: 'website' | 'article';
  noindex?: boolean;
};

function pageMetadata({
  title,
  description,
  path,
  keywords,
  image = SHARE_IMAGE_PATH,
  type = 'website',
  noindex = false,
}: PageSeoOptions): Metadata {
  const canonical = absoluteUrl(path);
  const shareTitle = title ? `${title} · ${SITE_NAME}` : `${SITE_NAME} — ${SITE_TAGLINE} Capture and share small moments.`;
  const imageUrl = absoluteUrl(image);

  return {
    title: shareTitle,
    description,
    applicationName: SITE_NAME,
    generator: SITE_NAME,
    referrer: 'strict-origin-when-cross-origin',
    keywords,
    alternates: { canonical },
    openGraph: {
      title: shareTitle,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale: 'en_US',
      type,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: `${SITE_NAME} social sharing card` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: shareTitle,
      description,
      images: [{ url: imageUrl, alt: `${SITE_NAME} social sharing card` }],
    },
    robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
    manifest: '/manifest.json',
    appleWebApp: { title: SITE_NAME, statusBarStyle: 'default' },
    formatDetection: { telephone: false, date: false, address: false, email: false, url: false },
  };
}

export function publicPageMetadata(options: Omit<PageSeoOptions, 'noindex'>): Metadata {
  return pageMetadata({ ...options, noindex: false });
}

export function privatePageMetadata(options: Omit<PageSeoOptions, 'noindex'>): Metadata {
  return pageMetadata({ ...options, noindex: true });
}

export function adminPageMetadata(title: string, path: string): Metadata {
  return privatePageMetadata({ title, description: `${title} in the ${SITE_NAME} admin workspace.`, path });
}

export const HOME_METADATA_DESCRIPTION = SITE_DESCRIPTION;
