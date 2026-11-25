import { privatePageMetadata } from '../lib/seo';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import Feather from '@expo/vector-icons/Feather';
import { TachiReelMark, TachiReelWordmark } from '../components/Brand';
import { SemanticHeading } from '../components/SemanticHeading';
import { ClayButton, ClayCard, ClayInput, Notice, useToast } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/theme';

type ConsentStatus = 'pending' | 'approved' | 'declined' | 'expired';
type ConsentRequest = { token: string; status: ConsentStatus; guardian_email: string; expires_at: string; created_at: string };
type ConsentState = { active: boolean; request: ConsentRequest | null };

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function consentLinkFor(token: string): string {
  const configuredBase = process.env.EXPO_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (configuredBase) return `${configuredBase}/guardian-consent?token=${encodeURIComponent(token)}`;
  return Linking.createURL('/guardian-consent', { queryParams: { token } });
}

function formatExpiry(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function withExpiry(request: ConsentRequest | null): ConsentRequest | null {
  if (!request || request.status !== 'pending') return request;
  return new Date(request.expires_at).getTime() <= Date.now() ? { ...request, status: 'expired' } : request;
}

export default function GuardianPendingScreen() {
  const { colors, type } = useTheme();
  const { show } = useToast();
  const [guardianEmail, setGuardianEmail] = useState('');
  const [request, setRequest] = useState<ConsentRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchConsentState = useCallback(async (): Promise<ConsentState | null> => {
    const client = supabase;
    if (!client) throw new Error('Supabase is not configured.');
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError) throw userError;
    if (!user) return null;
    const [{ data: profile, error: profileError }, { data: latest, error: requestError }] = await Promise.all([
      client.from('profiles').select('account_status').eq('id', user.id).maybeSingle(),
      client.from('guardian_consent_requests').select('token, status, guardian_email, expires_at, created_at').eq('minor_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (profileError) throw profileError;
    if (requestError) throw requestError;
    return { active: profile?.account_status === 'active', request: withExpiry((latest as ConsentRequest | null) ?? null) };
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const state = await fetchConsentState();
      if (!state) {
        router.replace('/auth');
        return;
      }
      if (state.active) {
        router.replace('/(tabs)/home');
        return;
      }
      setRequest(state.request);
      if (state.request && state.request.status !== 'pending') setShowForm(true);
    } catch {
      // Background polling is best-effort; the manual button surfaces errors.
    }
  }, [fetchConsentState]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void (async () => {
      try {
        const state = await fetchConsentState();
        if (!active) return;
        if (!state) {
          router.replace('/auth');
          return;
        }
        if (state.active) {
          router.replace('/(tabs)/home');
          return;
        }
        setRequest(state.request);
        if (state.request && state.request.status !== 'pending') setShowForm(true);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load your consent status.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    const interval = setInterval(() => { void refreshStatus(); }, 8000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [fetchConsentState, refreshStatus]);

  const sendRequest = async () => {
    const client = supabase;
    if (!client) return;
    const email = guardianEmail.trim();
    if (!EMAIL_PATTERN.test(email)) {
      setError('Enter a valid guardian email address.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const { data, error: rpcError } = await client.rpc('request_guardian_consent', { guardian_email_input: email });
      if (rpcError) throw rpcError;
      const created = (data as { request_token: string; request_expires_at: string }[] | null)?.[0];
      if (!created) throw new Error('Could not create a consent request.');
      setRequest({ token: created.request_token, status: 'pending', guardian_email: email, expires_at: created.request_expires_at, created_at: new Date().toISOString() });
      setGuardianEmail('');
      setShowForm(false);
      setNotice('Consent request created. Share the private link with your guardian.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not create the consent request.');
    } finally {
      setSubmitting(false);
    }
  };

  const shareLink = async () => {
    if (!request) return;
    const link = consentLinkFor(request.token);
    const message = `Please review and approve my guardian consent request for TachiReel:\n${link}`;
    if (Platform.OS === 'web') {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(link);
          setNotice('Link copied. Send it to your guardian.');
          return;
        }
      } catch {
        // Clipboard can be unavailable outside a secure context; show the link instead.
      }
      setNotice('Copy the link below and send it to your guardian.');
      return;
    }
    try {
      await Share.share({ message });
    } catch {
      // The user dismissed the share sheet.
    }
  };

  const signOut = async () => {
    const { error: signOutError } = await supabase?.auth.signOut() ?? { error: null };
    if (signOutError) {
      show(`Could not log out: ${signOutError.message}`, 'error');
      return;
    }
    router.replace('/auth');
  };

  const isWaiting = request?.status === 'pending' && !showForm;
  const wasDeclined = request?.status === 'declined';
  const wasExpired = request?.status === 'expired';
  const link = request ? consentLinkFor(request.token) : '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20 }} showsVerticalScrollIndicator={false}>
        <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', flex: 1, gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={() => router.replace('/')} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <TachiReelMark size={34} />
              <TachiReelWordmark size={22} />
            </Pressable>
            <Pressable onPress={() => void signOut()} accessibilityLabel="Log out" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
              <Feather name="log-out" size={14} color={colors.muted} />
              <Text style={[type.smallMedium, { color: colors.muted, fontSize: 10 }]}>Log out</Text>
            </Pressable>
          </View>

          {!supabase ? (
            <ClayCard style={{ padding: 24, alignItems: 'center', gap: 12 }}>
              <View style={{ width: 66, height: 66, borderRadius: 24, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="shield" size={28} color={colors.success} />
              </View>
              <SemanticHeading style={[type.h2, { color: colors.ink, textAlign: 'center' }]}>Consent needs a backend.</SemanticHeading>
              <Text style={[type.small, { color: colors.muted, textAlign: 'center' }]}>
                Add your Supabase URL and anon key to the .env file to manage guardian consent requests.
              </Text>
              <ClayButton label="Back to log in" variant="secondary" onPress={() => router.replace('/auth')} />
            </ClayCard>
          ) : loading ? (
            <ClayCard style={{ padding: 24, alignItems: 'center', gap: 10 }}>
              <SemanticHeading visuallyHidden>Guardian consent status</SemanticHeading>
              <ActivityIndicator color={colors.accent} />
              <Text style={[type.small, { color: colors.muted }]}>Checking your consent status…</Text>
            </ClayCard>
          ) : (
            <>
              <View style={{ alignItems: 'center', paddingTop: 4 }}>
                <View style={{ width: 108, height: 108, borderRadius: 38, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-6deg' }], borderWidth: 1, borderColor: colors.mint }}>
                  <View style={{ width: 78, height: 78, borderRadius: 27, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="shield" size={34} color={colors.success} />
                  </View>
                  <View style={{ position: 'absolute', right: 4, bottom: 2, width: 34, height: 34, borderRadius: 12, backgroundColor: colors.butter, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background }}>
                    <Feather name="lock" size={14} color={colors.ink} />
                  </View>
                </View>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={[type.tiny, { color: colors.success, marginBottom: 7 }]}>One last safety step</Text>
                <SemanticHeading style={[type.h1, { color: colors.ink, textAlign: 'center' }]}>
                  {isWaiting ? 'Waiting for your guardian.' : wasDeclined ? 'A new request is okay.' : wasExpired ? 'That link has expired.' : 'A little safety first.'}
                </SemanticHeading>
                <Text style={[type.body, { color: colors.muted, textAlign: 'center', marginTop: 8, maxWidth: 440 }]}>
                  {isWaiting
                    ? 'Share your private consent link with your parent or guardian. Your account activates as soon as they approve.'
                    : wasDeclined
                      ? 'Your guardian declined the request. You can send a new one to a different guardian.'
                      : wasExpired
                        ? 'Consent links are valid for 7 days. Send a fresh request when you are ready.'
                        : 'Your account is waiting for parent or guardian consent before it can become active.'}
                </Text>
              </View>

              {isWaiting && request ? (
                <ClayCard style={{ padding: 20 }} elevated="soft">
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="mail" size={15} color={colors.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.smallMedium, { color: colors.ink }]}>Consent requested</Text>
                      <Text style={[type.small, { color: colors.muted, fontSize: 10 }]}>
                        For {request.guardian_email}{formatExpiry(request.expires_at) ? ` · expires ${formatExpiry(request.expires_at)}` : ''}
                      </Text>
                    </View>
                  </View>
                  <Text selectable style={[type.small, { color: colors.success, backgroundColor: colors.backgroundAlt, borderRadius: 10, padding: 10, marginTop: 12, fontSize: 9 }]}>{link}</Text>
                  <View style={{ marginTop: 12 }}>
                    <ClayButton label={Platform.OS === 'web' ? 'Copy consent link' : 'Share consent link'} icon={Platform.OS === 'web' ? 'clipboard' : 'share-2'} full onPress={() => void shareLink()} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <ClayButton label="Check status" variant="secondary" size="sm" icon="refresh-cw" onPress={() => void refreshStatus()} />
                    <ClayButton label="Change email" variant="ghost" size="sm" icon="edit-3" onPress={() => { setShowForm(true); setError(null); setNotice(null); }} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 }}>
                    <Feather name="info" size={11} color={colors.muted} />
                    <Text style={[type.small, { color: colors.muted, fontSize: 9 }]}>This screen checks automatically every few seconds.</Text>
                  </View>
                </ClayCard>
              ) : (
                <ClayCard style={{ padding: 20 }} elevated="soft">
                  <Text style={[type.h3, { color: colors.ink }]}>{wasDeclined || wasExpired ? 'Send a new request' : 'Who should we ask?'}</Text>
                  <Text style={[type.small, { color: colors.muted, marginTop: 4, marginBottom: 14 }]}>
                    Enter the email of your parent or guardian. We will create a private link you can share with them.
                  </Text>
                  <ClayInput
                    value={guardianEmail}
                    onChangeText={setGuardianEmail}
                    placeholder="guardian@example.com"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    icon="mail"
                  />
                  <View style={{ marginTop: 12 }}>
                    <ClayButton label={submitting ? 'Creating request…' : 'Create consent link'} full iconRight="arrow-right" loading={submitting} onPress={() => void sendRequest()} />
                  </View>
                  <Text style={[type.small, { color: colors.mutedLight, fontSize: 9, marginTop: 12, textAlign: 'center' }]}>
                    Your account stays private, keeps sensitive content off, and cannot be used until consent is recorded.
                  </Text>
                </ClayCard>
              )}

              {notice ? <Notice text={notice} tone="success" /> : null}
              {error ? <Notice text={error} tone="error" /> : null}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

export function generateMetadata() {
  return privatePageMetadata({
    title: "Guardian consent status",
    description: "Check the status of a TachiReel guardian consent request.",
    path: "/guardian-pending",
  });
}
