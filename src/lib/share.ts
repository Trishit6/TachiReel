import { Platform, Share } from 'react-native';
import * as Linking from 'expo-linking';

export function appBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (configured) return configured;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return Linking.createURL('/');
}

export function postLink(postId: string): string {
  const base = appBaseUrl();
  return `${base}${base.includes('?') ? '&' : '?'}post=${encodeURIComponent(postId)}`;
}

export function profileLink(username: string): string {
  const base = appBaseUrl();
  return `${base}${base.includes('?') ? '&' : '?'}profile=${encodeURIComponent(username)}`;
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
