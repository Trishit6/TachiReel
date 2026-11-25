import { adminPageMetadata } from '../../lib/seo';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Href, router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as Linking from 'expo-linking';
import { SemanticHeading } from '../../components/SemanticHeading';
import { TachiReelMark, TachiReelWordmark } from '../../components/Brand';
import { ClayButton, ClayCard, ClayInput, IconButton, Notice } from '../../components/ui';
import { adminApi, type AdminAccess, type AdminPermission } from '../../lib/admin';
import { absoluteUrl } from '../../lib/site';
import { useSession } from '../../lib/session';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { brand } from '../../theme/brand';
import { useTheme } from '../../theme/theme';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+$/;

function resetRedirect(): string {
  if (process.env.EXPO_PUBLIC_APP_URL?.trim()) return absoluteUrl('/reset-password');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/reset-password`;
  return Linking.createURL('/reset-password');
}

// Staff without analytics access must not land on a restricted dashboard.
const LANDING_ROUTES: { permission: AdminPermission; href: Href }[] = [
  { permission: 'analytics.view', href: '/admin/dashboard' },
  { permission: 'tickets.view', href: '/admin/tickets' },
  { permission: 'reports.view', href: '/admin/reports' },
  { permission: 'posts.view', href: '/admin/posts' },
  { permission: 'users.view', href: '/admin/users' },
  { permission: 'notifications.view', href: '/admin/notifications' },
  { permission: 'settings.view', href: '/admin/settings' },
];

function landingRoute(access: AdminAccess): Href {
  return LANDING_ROUTES.find((route) => access.permissions.includes(route.permission))?.href ?? '/admin/profile';
}

export default function AdminLoginScreen() {
  const { colors, type, resolved, toggleTheme } = useTheme();
  const { width } = useWindowDimensions();
  const { refresh, userId, loading: sessionLoading } = useSession();
  const compact = width < 720;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // An already-approved admin session should never linger on the sign-in form.
  useEffect(() => {
    if (sessionLoading || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [access] = await adminApi.access();
        if (!cancelled && access?.role) router.replace(landingRoute(access));
      } catch {
        // A normal member or an offline client stays on the sign-in form.
      }
    })();
    return () => { cancelled = true; };
  }, [sessionLoading, userId]);

  const authenticate = async () => {
    setError(null);
    setNotice(null);

    if (!isSupabaseConfigured || !supabase) {
      setError('Administrator sign in needs a connected Supabase project. Preview mode never grants staff access.');
      return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Enter the email address assigned to your administrator account.');
      return;
    }
    if (!password) {
      setError('Enter your password to continue.');
      return;
    }

    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;

      // Trust only the server-side RPC: it reads the active role from Postgres.
      const [access] = await adminApi.access();
      if (!access?.role) {
        // Do not leave a valid member session behind on a failed admin login.
        await supabase.auth.signOut({ scope: 'local' });
        await refresh();
        setError('This account does not have an active administrator role. Ask a Super Admin to assign one.');
        return;
      }

      await adminApi.logAuthEvent('login').catch(() => {
        // Auditing is best effort; the server still enforces every admin RPC.
      });
      await refresh();
      router.replace(landingRoute(access));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '';
      setError(
        /invalid login credentials/i.test(message)
          ? 'That email and password combination is not recognised.'
          : /email not confirmed/i.test(message)
            ? 'Confirm your email address before signing in.'
            : 'Could not sign in right now. Check your details and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const forgotPassword = async () => {
    setError(null);
    setNotice(null);
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Enter your administrator email first, then request a reset link.');
      return;
    }
    if (!supabase) {
      setError('Password reset needs a connected Supabase project.');
      return;
    }
    setBusy(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: resetRedirect(),
      });
      if (resetError) throw resetError;
      setNotice('If that email belongs to a staff account, a password reset link is on its way.');
    } catch {
      setError('Could not send a reset link right now. Please try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ position: 'absolute', top: 18, right: 20, zIndex: 2 }}>
          <IconButton
            icon={resolved === 'dark' ? 'sun' : 'moon'}
            label="Toggle appearance"
            variant="ghost"
            onPress={toggleTheme}
          />
        </View>

        <View
          style={{
            flex: 1,
            flexDirection: compact ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: compact ? 24 : 56,
            paddingHorizontal: compact ? 20 : 48,
            paddingVertical: compact ? 48 : 64,
            maxWidth: 1080,
            width: '100%',
            alignSelf: 'center',
          }}
        >
          {!compact ? (
            <View style={{ flex: 1, maxWidth: 420, gap: 18 }}>
              <View style={{ width: 54, height: 54, borderRadius: 18, backgroundColor: brand.reelRed, alignItems: 'center', justifyContent: 'center' }}>
                <TachiReelMark size={34} />
              </View>
              <TachiReelWordmark size={34} />
              <SemanticHeading level={2} style={[type.h2, { color: colors.ink }]}>
                A calmer place to run the community.
              </SemanticHeading>
              <Text style={[type.body, { color: colors.muted, maxWidth: 380 }]}>
                This workspace is for assigned TachiReel staff only. Roles and permissions are verified in the database on every action.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <Feather name="lock" size={14} color={colors.success} />
                <Text style={[type.small, { color: colors.muted }]}>No public administrator sign-up.</Text>
              </View>
            </View>
          ) : null}

          <ClayCard style={{ width: '100%', maxWidth: 420, padding: compact ? 22 : 28, gap: 16 }} elevated="floating" radius={28}>
            {compact ? (
              <View style={{ alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <TachiReelMark size={46} />
                <TachiReelWordmark size={26} />
              </View>
            ) : null}

            <View style={{ gap: 4 }}>
              <Text style={[type.overline, { color: brand.reelRed, letterSpacing: 1.2 }]}>ADMIN WORKSPACE</Text>
              <SemanticHeading level={1} style={[type.h2, { color: colors.ink }]}>
                Administrator sign in
              </SemanticHeading>
              <Text style={[type.small, { color: colors.muted }]}>
                Use the staff account assigned to you. Normal member accounts cannot open this workspace.
              </Text>
            </View>

            {error ? <Notice text={error} tone="error" /> : null}
            {notice ? <Notice text={notice} tone="success" /> : null}

            <ClayInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@tachireel.app"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              icon="mail"
              returnKeyType="next"
            />

            <ClayInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              icon="key"
              returnKeyType="go"
              onSubmitEditing={() => void authenticate()}
              rightAccessory={
                <Pressable
                  onPress={() => setShowPassword((current) => !current)}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  accessibilityRole="button"
                  hitSlop={10}
                >
                  <Feather name={showPassword ? 'eye-off' : 'eye'} size={17} color={colors.muted} />
                </Pressable>
              }
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <Pressable onPress={() => void forgotPassword()} accessibilityRole="button" disabled={busy}>
                <Text style={[type.small, { color: colors.accent, opacity: busy ? 0.6 : 1 }]}>Forgot password?</Text>
              </Pressable>
            </View>

            <ClayButton
              label="Sign in to admin"
              size="lg"
              full
              loading={busy}
              iconRight="arrow-right"
              onPress={() => void authenticate()}
            />

            <View style={{ height: 1, backgroundColor: colors.line }} />
            <Pressable
              onPress={() => router.replace('/')}
              accessibilityRole="button"
              style={{ alignSelf: 'center' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="arrow-left" size={13} color={colors.muted} />
                <Text style={[type.small, { color: colors.muted }]}>Back to TachiReel</Text>
              </View>
            </Pressable>
          </ClayCard>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function generateMetadata() {
  return adminPageMetadata('Administrator Sign In', '/admin/login');
}
