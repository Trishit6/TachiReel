import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useRouter } from 'expo-router';
import { AppState } from 'react-native';
import { adminApi } from './admin';
import { DEMO_PROFILE, isDemoMode } from './demo-data';
import { endDemoSession, hasDemoSession } from './demo-session';
import { supabase } from './supabase';

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  is_minor: boolean;
  account_status: 'pending_guardian' | 'active' | 'suspended';
  profile_visibility: 'public' | 'followers' | 'private';
  sensitive_content_opt_in: boolean;
  guardian_consent_status: 'required' | 'pending' | 'verified' | 'rejected' | 'not_required';
  created_at?: string;
};

type SessionValue = {
  loading: boolean;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  isDemo: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    if (isDemoMode && hasDemoSession()) {
      setUserId(DEMO_PROFILE.id);
      setEmail('admin@admin.com');
      setProfile(DEMO_PROFILE as Profile);
      setLoading(false);
      return;
    }

    const client = supabase;
    if (!client) {
      setUserId(null);
      setEmail(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      // getUser() validates the token with the Auth server, not just the local
      // session copy, so revoked or expired sessions are rejected.
      const { data: { user }, error } = await client.auth.getUser();
      if (error || !user) {
        setUserId(null);
        setEmail(null);
        setProfile(null);
        return;
      }

      const { data } = await client
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio, is_minor, account_status, profile_visibility, sensitive_content_opt_in, guardian_consent_status, created_at')
        .eq('id', user.id)
        .maybeSingle();

      setUserId(user.id);
      setEmail(user.email ?? null);
      setProfile((data as Profile | null) ?? null);
    } catch {
      // Offline or an invalid token: treat as signed out and let the UI decide.
      setUserId(null);
      setEmail(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void load();
      }
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      subscription.unsubscribe();
      appState.remove();
    };
  }, [load]);

  const signOut = useCallback(async () => {
    if (isDemoMode) endDemoSession();
    // Audit before dropping the token; the RPC is a no-op for non-staff users.
    try {
      await adminApi.logAuthEvent('logout');
    } catch {
      // Auditing must never block the user from signing out.
    }
    await supabase?.auth.signOut();
    setUserId(null);
    setEmail(null);
    setProfile(null);
    router.replace('/');
  }, [router]);

  const value = useMemo<SessionValue>(
    () => ({
      loading,
      userId,
      email,
      profile,
      isDemo: isDemoMode && hasDemoSession(),
      refresh: load,
      signOut,
    }),
    [loading, userId, email, profile, load, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
