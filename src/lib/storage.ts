import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const BRAND_PREFIX = 'tachireel.';

// Older local preferences used a different brand prefix. Copy any matching
// value forward once so a branding change does not reset the user's choices.
function migrateLegacyWebPreference(key: string): void {
  if (typeof localStorage === 'undefined' || !key.startsWith(BRAND_PREFIX)) return;

  try {
    if (localStorage.getItem(key) !== null) return;

    const suffix = key.slice(BRAND_PREFIX.length);
    const marker = `.${suffix}`;
    for (let index = 0; index < localStorage.length; index += 1) {
      const legacyKey = localStorage.key(index);
      if (!legacyKey || legacyKey === key || !legacyKey.endsWith(marker)) continue;

      const legacyPrefix = legacyKey.slice(0, -marker.length);
      if (!legacyPrefix || legacyPrefix.includes('.')) continue;

      const value = localStorage.getItem(legacyKey);
      if (value === null) continue;

      localStorage.setItem(key, value);
      localStorage.removeItem(legacyKey);
      return;
    }
  } catch {
    // Storage may be unavailable or full; the preference is only a convenience.
  }
}

// SecureStore is not available in browsers, and localStorage is not available on native.
export async function readPreference(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage === 'undefined') return null;
      migrateLegacyWebPreference(key);
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function writePreference(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch {
      // Private browsing can reject writes; the preference simply will not persist.
    }
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Ignore unsupported storage; preferences are a convenience, not required state.
  }
}

// Supabase Auth must not use the web SecureStore shim: it has no browser
// implementation. Native keeps Keychain/Keystore; web uses localStorage.
export const authStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try {
        return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      } catch {
        // Private browsing can reject writes; sign-in will still work in memory.
      }
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Ignore unsupported storage; the SDK still keeps the session in memory.
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      } catch {
        // Nothing to remove when storage is unavailable.
      }
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore unsupported storage.
    }
  },
};

export function readPreferenceSync(key: string): string | null {
  if (Platform.OS !== 'web') return null;
  try {
    if (typeof localStorage === 'undefined') return null;
    migrateLegacyWebPreference(key);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
