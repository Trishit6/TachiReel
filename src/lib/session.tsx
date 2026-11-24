import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useRouter } from 'expo-router';
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

    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      setUserId(null);
      setEmail(null);
      setProfile(null);
      setLoading(false);
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
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const signOut = useCallback(async () => {
    if (isDemoMode) endDemoSession();
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
