import { privatePageMetadata } from '../lib/seo';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import * as Linking from 'expo-linking';
import { ClayHeart } from '../components/ClayIllustration';
import { TachiReelMark, TachiReelWordmark } from '../components/Brand';
import { SemanticHeading } from '../components/SemanticHeading';
import { ClayButton, ClayCard, ClayInput, Dialog, IconButton, Notice } from '../components/ui';
import { DEMO_EMAIL, DEMO_PASSWORD, isDemoCredentials, startDemoSession } from '../lib/demo-session';
import { isSupabaseConfigured, isTeen as checkIsTeen, supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import { writePreference } from '../lib/storage';
import { useTheme } from '../theme/theme';

type Mode = 'signIn' | 'signUp';
type View_ = 'form' | 'forgot' | 'verify';

const USERNAME_PATTERN = /^[A-Za-z0-9._]{3,30}$/;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

function resetRedirect(): string {
  const base = process.env.EXPO_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (base) return `${base}/reset-password`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/reset-password`;
  return Linking.createURL('/reset-password');
}

export default function AuthScreen() {
  const { colors, type, radii, resolved, toggleTheme } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const params = useLocalSearchParams<{ mode?: string }>();
  const { refresh } = useSession();

  const [mode, setMode] = useState<Mode>(params.mode === 'signup' && isSupabaseConfigured ? 'signUp' : isSupabaseConfigured ? 'signIn' : 'signIn');
  const [view, setView] = useState<View_>('form');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(isSupabaseConfigured ? '' : DEMO_EMAIL);
  const [password, setPassword] = useState(isSupabaseConfigured ? '' : DEMO_PASSWORD);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [legal, setLegal] = useState<'terms' | 'privacy' | null>(null);

  const teenAccount = birthDate.length === 10 && checkIsTeen(birthDate);

  const switchMode = (next: Mode) => {
    setMode(next);
    setView('form');
    setError(null);
    setSuccess(null);
  };

  const finishSignIn = async (userId: string) => {
    const client = supabase;
    if (!client) return;
    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('account_status')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.account_status === 'pending_guardian') router.replace('/guardian-pending');
    else if (profile?.account_status === 'active') router.replace('/(tabs)/home');
    else throw new Error('Your account is not active. Contact support for help.');
  };

  const authenticate = async () => {
    setError(null);
    setSuccess(null);

    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Enter your password to continue.');
      return;
    }

    if (mode === 'signUp') {
      if (fullName.trim().length < 2) {
        setError('Add your full name so people know who they are following.');
        return;
      }
      if (!USERNAME_PATTERN.test(username.trim())) {
        setError('Usernames are 3–30 characters using letters, numbers, dots or underscores.');
        return;
      }
      if (password.length < 8) {
        setError('Use at least 8 characters for your password.');
        return;
      }
      if (password !== confirmPassword) {
        setError('The two passwords do not match.');
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
        setError('Enter your date of birth in YYYY-MM-DD format.');
        return;
      }
      if (Number.isNaN(new Date(`${birthDate}T00:00:00`).getTime())) {
        setError('That date of birth is not valid.');
        return;
      }
    }

    if (!supabase) {
      if (mode === 'signIn' && isDemoCredentials(email, password)) {
        startDemoSession();
        await writePreference('tachireel.remember', remember ? '1' : '0');
        await refresh();
        router.replace('/(tabs)/home');
        return;
      }
      setError('Connect a Supabase project in .env to create accounts. The demo login above works without one.');
      return;
    }

    setBusy(true);
    try {
      await writePreference('tachireel.remember', remember ? '1' : '0');

      if (mode === 'signUp') {
        const result = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              date_of_birth: birthDate,
              display_name: fullName.trim(),
              username: username.trim().toLowerCase(),
              country: 'IN',
              profile_visibility: teenAccount ? 'private' : 'public',
              sensitive_content_enabled: false,
              guardian_consent_status: teenAccount ? 'required' : 'not_required',
            },
          },
        });
        if (result.error) throw result.error;
        if (result.data.session?.user) {
          await finishSignIn(result.data.session.user.id);
        } else {
          setView('verify');
        }
        return;
      }

      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (!result.data.user) throw new Error('Sign-in succeeded without a user session.');
      await finishSignIn(result.data.user.id);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not continue. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async () => {
    setError(null);
    setSuccess(null);
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Enter the email address on your account.');
      return;
    }
    if (!supabase) {
      setError('Password reset needs a connected Supabase project.');
      return;
    }
    setBusy(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: resetRedirect() });
      if (resetError) throw resetError;
      setSuccess('If that email has a TachiReel account, a secure reset link is on its way.');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Could not send the reset email.');
    } finally {
      setBusy(false);
    }
  };

  const resendVerification = async () => {
    setError(null);
    setSuccess(null);
    if (!supabase) return;
    setBusy(true);
    try {
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
      if (resendError) throw resendError;
      setSuccess('Verification email sent. Check your inbox and spam folder.');
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'Could not resend the email.');
    } finally {
      setBusy(false);
    }
  };

  const form = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <View>
          <Text style={[type.tiny, { color: colors.accent, marginBottom: 6 }]}>{mode === 'signUp' ? 'A fresh start' : 'Good to see you'}</Text>
          <SemanticHeading style={[type.h1, { color: colors.ink }]}>{mode === 'signUp' ? 'Create your corner.' : 'Welcome back.'}</SemanticHeading>
        </View>
        <IconButton icon="help-circle" label="Why we ask for your age" variant="ghost" size={38} onPress={() => setLegal('privacy')} />
      </View>

      <View style={{ flexDirection: 'row', backgroundColor: colors.backgroundAlt, borderRadius: radii.input, padding: 4, marginBottom: 16 }}>
        {(['signIn', 'signUp'] as const).map((item) => {
          const active = mode === item;
          return (
            <Pressable
              key={item}
              onPress={() => switchMode(item)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={{
                flex: 1,
                height: 40,
                borderRadius: radii.control,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? colors.surface : 'transparent',
                borderWidth: 1,
                borderColor: active ? colors.line : 'transparent',
              }}
            >
              <Text style={[type.buttonSmall, { color: active ? colors.ink : colors.muted }]}>{item === 'signIn' ? 'Log in' : 'Create account'}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: 12 }}>
        {mode === 'signUp' ? (
          <>
            <ClayInput label="FULL NAME" value={fullName} onChangeText={setFullName} placeholder="Aanya Sharma" autoComplete="name" />
            <ClayInput
              label="USERNAME"
              value={username}
              onChangeText={setUsername}
              placeholder="aanya.somewhere"
              autoCapitalize="none"
              autoCorrect={false}
              icon="at-sign"
            />
          </>
        ) : null}

        <ClayInput
          label="EMAIL ADDRESS"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          icon="mail"
        />
        <ClayInput
          label="PASSWORD"
          value={password}
          onChangeText={setPassword}
          placeholder={mode === 'signUp' ? 'At least 8 characters' : 'Your password'}
          secureTextEntry={!showPassword}
          autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
          icon="lock"
          rightAccessory={
            <Pressable onPress={() => setShowPassword((visible) => !visible)} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} hitSlop={8}>
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={17} color={colors.muted} />
            </Pressable>
          }
        />
        {mode === 'signUp' ? (
          <>
            <ClayInput
              label="CONFIRM PASSWORD"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Type it again"
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              icon="lock"
            />
            <ClayInput
              label="DATE OF BIRTH"
              value={birthDate}
              onChangeText={setBirthDate}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              icon="calendar"
            />
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7, paddingHorizontal: 2 }}>
              <Feather name="shield" size={13} color={colors.success} style={{ marginTop: 2 }} />
              <Text style={[type.small, { color: colors.muted, flex: 1, fontSize: 11 }]}>
                Your birthday stays private. It helps us apply age-appropriate privacy and safety controls.
              </Text>
            </View>
            {teenAccount ? (
              <Notice text="Teen accounts start private, have sensitive content turned off, and need a parent or guardian to approve them before activation." />
            ) : null}
          </>
        ) : null}
      </View>

      {mode === 'signIn' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', gap: 10 }}>
          <Pressable onPress={() => setRemember((value) => !value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityRole="checkbox" accessibilityState={{ checked: remember }}>
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: remember ? colors.accent : colors.lineStrong,
                backgroundColor: remember ? colors.accent : colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {remember ? <Feather name="check" size={11} color={colors.white} /> : null}
            </View>
            <Text style={[type.small, { color: colors.muted }]}>Keep me signed in</Text>
          </Pressable>
          <Pressable onPress={() => { setView('forgot'); setError(null); setSuccess(null); }}>
            <Text style={[type.smallMedium, { color: colors.accent }]}>Forgot password?</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <View style={{ marginTop: 10 }}><Notice text={error} tone="error" /></View> : null}
      {success ? <View style={{ marginTop: 10 }}><Notice text={success} tone="success" /></View> : null}

      <View style={{ marginTop: 16 }}>
        <ClayButton
          label={mode === 'signUp' ? 'Create your account' : 'Log in to TachiReel'}
          size="lg"
          full
          iconRight="arrow-right"
          loading={busy}
          onPress={() => void authenticate()}
        />
      </View>

      {!isSupabaseConfigured && mode === 'signIn' ? (
        <View style={{ marginTop: 12, backgroundColor: colors.butterSoft, borderRadius: radii.control, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Feather name="zap" size={12} color={colors.inkSoft} />
          <Text style={[type.small, { color: colors.inkSoft, fontSize: 10, flex: 1 }]}>
            Demo login is prefilled: {DEMO_EMAIL} / {DEMO_PASSWORD}
          </Text>
        </View>
      ) : null}

      <Text style={[type.small, { color: colors.mutedLight, fontSize: 10, textAlign: 'center', marginTop: 10, lineHeight: 16 }]}>
        By continuing, you agree to our <Text onPress={() => setLegal('terms')} style={{ color: colors.accent, textDecorationLine: 'underline' }}>Terms of Service</Text> and <Text onPress={() => setLegal('privacy')} style={{ color: colors.accent, textDecorationLine: 'underline' }}>Privacy Policy</Text>.
      </Text>

      <Pressable onPress={() => router.push('/guardian-consent')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, padding: 4 }}>
        <Feather name="shield" size={12} color={colors.success} />
        <Text style={[type.smallMedium, { color: colors.success, fontSize: 11 }]}>Parent or guardian? Review a request</Text>
      </Pressable>
    </>
  );

  const forgot = (
    <>
      <Pressable onPress={() => { setView('form'); setError(null); setSuccess(null); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 18 }}>
        <Feather name="arrow-left" size={15} color={colors.muted} />
        <Text style={[type.smallMedium, { color: colors.muted }]}>Back to log in</Text>
      </Pressable>
      <Text style={[type.tiny, { color: colors.accent, marginBottom: 6 }]}>A way back in</Text>
      <SemanticHeading style={[type.h1, { color: colors.ink }]}>Reset your password.</SemanticHeading>
      <Text style={[type.body, { color: colors.muted, marginTop: 8, marginBottom: 16 }]}>
        Enter the email on your account and we will send a secure link to choose a new password.
      </Text>
      <ClayInput label="EMAIL ADDRESS" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" icon="mail" />
      {error ? <View style={{ marginTop: 10 }}><Notice text={error} tone="error" /></View> : null}
      {success ? <View style={{ marginTop: 10 }}><Notice text={success} tone="success" /></View> : null}
      <View style={{ marginTop: 16 }}>
        <ClayButton label="Send reset link" size="lg" full iconRight="send" loading={busy} onPress={() => void sendReset()} />
      </View>
      <Text style={[type.small, { color: colors.mutedLight, fontSize: 10, textAlign: 'center', marginTop: 10 }]}>
        For your safety, we do not reveal whether an email is registered.
      </Text>
    </>
  );

  const verify = (
    <View style={{ alignItems: 'center', paddingVertical: 8 }}>
      <View style={{ width: 78, height: 78, borderRadius: 28, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderWidth: 1, borderColor: colors.mint }}>
        <Feather name="mail" size={30} color={colors.success} />
      </View>
      <SemanticHeading style={[type.h1, { color: colors.ink, textAlign: 'center' }]}>Check your inbox.</SemanticHeading>
      <Text style={[type.body, { color: colors.muted, textAlign: 'center', marginTop: 8, marginBottom: 16 }]}>
        We sent a verification link to {email.trim() || 'your email'}. Confirm it, then come back and log in.
      </Text>
      {error ? <View style={{ alignSelf: 'stretch', marginBottom: 12 }}><Notice text={error} tone="error" /></View> : null}
      {success ? <View style={{ alignSelf: 'stretch', marginBottom: 12 }}><Notice text={success} tone="success" /></View> : null}
      <ClayButton label="Resend verification email" variant="secondary" full loading={busy} onPress={() => void resendVerification()} />
      <View style={{ height: 8 }} />
      <ClayButton label="Back to log in" variant="ghost" full onPress={() => { setView('form'); setMode('signIn'); setError(null); setSuccess(null); }} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', minHeight: wide ? 760 : undefined }}>
            {wide ? (
              <View
                style={{
                  flex: 0.92,
                  backgroundColor: colors.accentSoft,
                  padding: 48,
                  justifyContent: 'space-between',
                  overflow: 'hidden',
                }}
              >
                <Pressable onPress={() => router.replace('/')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start' }}>
                  <TachiReelMark size={38} />
                  <TachiReelWordmark size={26} />
                </Pressable>
                <View style={{ alignItems: 'center' }}>
                  <ClayHeart size={330} />
                  <SemanticHeading level={2} style={[type.h2, { color: colors.ink, textAlign: 'center', marginTop: 10, maxWidth: 340 }]}>
                    A softer place to be online.
                  </SemanticHeading>
                  <Text style={[type.body, { color: colors.inkSoft, textAlign: 'center', marginTop: 8, maxWidth: 330 }]}>
                    Capture the little things, share them with your circle, and keep the noise out.
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center' }}>
                  {[
                    { icon: 'lock' as const, label: 'Private by default' },
                    { icon: 'heart' as const, label: 'Kind by design' },
                    { icon: 'users' as const, label: 'Small circles' },
                  ].map((item) => (
                    <View key={item.label} style={{ alignItems: 'center', gap: 6, flex: 1 }}>
                      <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name={item.icon} size={15} color={colors.accent} />
                      </View>
                      <Text style={[type.small, { color: colors.inkSoft, fontSize: 10, textAlign: 'center' }]}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={{ flex: 1, paddingHorizontal: wide ? 48 : 20, paddingVertical: wide ? 32 : 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: wide ? 24 : 18 }}>
                {!wide ? (
                  <Pressable onPress={() => router.replace('/')} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                    <TachiReelMark size={34} />
                    <TachiReelWordmark size={22} />
                  </Pressable>
                ) : (
                  <Text style={[type.tiny, { color: colors.muted }]}>Welcome to your little corner</Text>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <IconButton icon={resolved === 'dark' ? 'sun' : 'moon'} label="Toggle theme" variant="ghost" size={36} onPress={toggleTheme} />
                  <IconButton icon="x" label="Back to landing page" variant="ghost" size={36} onPress={() => router.replace('/')} />
                </View>
              </View>

              {!wide ? (
                <View style={{ alignItems: 'center', marginBottom: 4 }}>
                  <ClayHeart size={190} />
                </View>
              ) : null}

              <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center' }}>
                <ClayCard style={{ padding: wide ? 30 : 20 }} radius={28} elevated="lifted">
                  {view === 'form' ? form : view === 'forgot' ? forgot : verify}
                </ClayCard>
                {isSupabaseConfigured ? (
                  <Text style={[type.small, { color: colors.mutedLight, fontSize: 10, textAlign: 'center', marginTop: 10 }]}>
                    Protected by Supabase Auth · Your data stays yours.
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Dialog
        visible={legal !== null}
        title={legal === 'terms' ? 'Terms of Service' : 'Privacy and age safety'}
        message={
          legal === 'terms'
            ? 'Use TachiReel kindly. Do not harass, impersonate, or post content that harms others. You are responsible for the media you upload, and we may remove content that breaks these rules.'
            : 'Your date of birth is used only to apply age-appropriate privacy and safety controls, and is protected from client-side edits. Teen accounts start private, keep sensitive content off, and need verified guardian consent before activation.'
        }
        confirmLabel="Got it"
        cancelLabel="Close"
        onConfirm={() => setLegal(null)}
        onCancel={() => setLegal(null)}
      />
    </View>
  );
}

export function generateMetadata() {
  return privatePageMetadata({
    title: "Sign in or create an account",
    description: "Sign in to TachiReel or create your corner for photos, short videos and quiet conversations.",
    path: "/auth",
  });
}
