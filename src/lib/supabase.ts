import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { authStorage } from './storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
        // PKCE keeps recovery/authorization codes out of the URL fragment.
        flowType: 'pkce',
        storage: authStorage,
      },
    })
  : null;

export function isTeen(dateOfBirth: string, now = new Date()): boolean {
  const birthDate = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birthDate.getTime()) || birthDate > now) return true;

  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDifference = now.getMonth() - birthDate.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && now.getDate() < birthDate.getDate())) age -= 1;
  return age < 18;
}

export function canViewSensitiveContent(dateOfBirth: string, sensitiveContentReviewed: boolean): boolean {
  return !isTeen(dateOfBirth) && sensitiveContentReviewed;
}
