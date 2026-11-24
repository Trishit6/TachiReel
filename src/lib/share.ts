import { Platform, Share } from 'react-native';
import { SITE_ORIGIN, webUrl } from './site';

export function appBaseUrl(): string {
  // One configured origin for canonical URLs, share links and discovery files.
  return SITE_ORIGIN;
}

export function postLink(postId: string): string {
  return webUrl(`/post/${encodeURIComponent(postId)}`);
}

export function profileLink(username: string): string {
  return webUrl(`/user/${encodeURIComponent(username)}`);
}

export async function copyText(text: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }
  try {
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareLink(options: { url: string; message: string }): Promise<'shared' | 'copied' | 'dismissed'> {
  if (Platform.OS === 'web') {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'TachiReel', text: options.message, url: options.url });
        return 'shared';
      }
    } catch {
      return 'dismissed';
    }
    return (await copyText(options.url)) ? 'copied' : 'dismissed';
  }
  try {
    await Share.share({ message: `${options.message}\n${options.url}` });
    return 'shared';
  } catch {
    return 'dismissed';
  }
}
