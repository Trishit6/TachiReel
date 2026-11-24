import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { TachiReelMark, TachiReelWordmark } from '../components/Brand';
import { ClayButton, ClayCard, ClayInput, IconButton, Notice } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/theme';

export default function ResetPasswordScreen() {
  const { colors, type, resolved, toggleTheme } = useTheme();
  const [checking, setChecking] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    void (async () => {
      const { data } = await client.auth.getSession();
      if (active) {
        setHasRecoverySession(Boolean(data.session));
        setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const submit = async () => {
    setError(null);
    if (password.length < 8) {
      setError('Use at least 8 characters for your new password.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    if (!supabase) return;
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update your password.');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    await supabase?.auth.signOut();
    router.replace('/auth');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }} keyboardShouldPersistTaps="handled">
          <View style={{ width: '100%', maxWidth: 460, alignSelf: 'center', gap: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Pressable onPress={() => router.replace('/')} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <TachiReelMark size={34} />
                <TachiReelWordmark size={22} />
              </Pressable>
              <IconButton icon={resolved === 'dark' ? 'sun' : 'moon'} label="Toggle theme" variant="ghost" size={36} onPress={toggleTheme} />
            </View>

            <ClayCard style={{ padding: 28 }} elevated="lifted" radius={28}>
              {!supabase ? (
                <View style={{ gap: 12 }}>
                  <Text style={[type.h1, { color: colors.ink }]}>Password reset unavailable.</Text>
                  <Notice text="Connect your Supabase project in .env to enable password reset emails." />
                  <ClayButton label="Back to log in" variant="secondary" onPress={() => router.replace('/auth')} />
                </View>
              ) : checking ? (
                <Text style={[type.body, { color: colors.muted }]}>Checking your reset link…</Text>
              ) : done ? (
                <View style={{ gap: 14, alignItems: 'center' }}>
                  <View style={{ width: 70, height: 70, borderRadius: 25, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="check" size={28} color={colors.success} />
                  </View>
                  <Text style={[type.h1, { color: colors.ink, textAlign: 'center' }]}>Password updated.</Text>
                  <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>Log in with your new password to get back to your corner.</Text>
                  <ClayButton label="Go to log in" full iconRight="arrow-right" onPress={() => void finish()} />
                </View>
              ) : !hasRecoverySession ? (
                <View style={{ gap: 12 }}>
                  <Text style={[type.h1, { color: colors.ink }]}>This link has expired.</Text>
                  <Text style={[type.body, { color: colors.muted }]}>
                    Password reset links are single-use and time-limited. Request a fresh one from the log-in screen.
                  </Text>
                  <ClayButton label="Request a new link" full onPress={() => router.replace('/auth')} />
                </View>
              ) : (
                <>
                  <Text style={[type.tiny, { color: colors.accent, marginBottom: 6 }]}>One small step</Text>
                  <Text style={[type.h1, { color: colors.ink }]}>Choose a new password.</Text>
                  <Text style={[type.body, { color: colors.muted, marginTop: 8, marginBottom: 18 }]}>
                    Make it something only you would know. At least 8 characters.
                  </Text>
                  <View style={{ gap: 12 }}>
                    <ClayInput
                      label="NEW PASSWORD"
                      value={password}
                      onChangeText={setPassword}
                      placeholder="At least 8 characters"
                      secureTextEntry={!show}
                      autoComplete="new-password"
                      icon="lock"
                      rightAccessory={
                        <Pressable onPress={() => setShow((value) => !value)} accessibilityLabel={show ? 'Hide password' : 'Show password'} hitSlop={8}>
                          <Feather name={show ? 'eye-off' : 'eye'} size={17} color={colors.muted} />
                        </Pressable>
                      }
                    />
                    <ClayInput
                      label="CONFIRM PASSWORD"
                      value={confirm}
                      onChangeText={setConfirm}
                      placeholder="Type it again"
                      secureTextEntry={!show}
                      autoComplete="new-password"
                      icon="lock"
                    />
                  </View>
                  {error ? <View style={{ marginTop: 12 }}><Notice text={error} tone="error" /></View> : null}
                  <View style={{ marginTop: 18 }}>
                    <ClayButton label="Update password" full size="lg" loading={busy} onPress={() => void submit()} />
                  </View>
                </>
              )}
            </ClayCard>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
