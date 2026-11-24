import { privatePageMetadata } from '../lib/seo';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { TachiReelMark, TachiReelWordmark } from '../components/Brand';
import { SemanticHeading } from '../components/SemanticHeading';
import { Avatar, ClayButton, ClayCard, ClayInput, Notice } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/theme';

type ConsentStatus = 'pending' | 'approved' | 'declined' | 'expired';
type ConsentView = {
  minor_display_name: string;
  minor_username: string;
  guardian_email: string;
  request_status: ConsentStatus;
  request_expires_at: string;
  responded_at: string | null;
};
type ConsentOutcome = 'approved' | 'declined' | null;

function formatExpiry(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function GuardianConsentScreen() {
  const { colors, type } = useTheme();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const initialToken = Array.isArray(params.token) ? params.token[0] ?? '' : params.token ?? '';

  const [tokenInput, setTokenInput] = useState(initialToken);
  const [lookupToken, setLookupToken] = useState(initialToken);
  const [attempt, setAttempt] = useState(0);
  const [request, setRequest] = useState<ConsentView | null>(null);
  const [guardianName, setGuardianName] = useState('');
  const [loading, setLoading] = useState(Boolean(initialToken));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ConsentOutcome>(null);

  useEffect(() => {
    const client = supabase;
    if (!lookupToken || !client) return;
    let active = true;
    void (async () => {
      try {
        const { data, error: rpcError } = await client.rpc('get_guardian_consent', { token_input: lookupToken });
        if (rpcError) throw rpcError;
        if (!active) return;
        const row = (data as ConsentView[] | null)?.[0] ?? null;
        setRequest(row);
        if (!row) setError('This consent link is invalid or has expired.');
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load this consent request.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [lookupToken, attempt]);

  const review = () => {
    const trimmed = tokenInput.trim();
    if (!trimmed) {
      setError('Enter the consent code from the link.');
      return;
    }
    setError(null);
    setOutcome(null);
    setRequest(null);
    setLoading(true);
    setLookupToken(trimmed);
    setAttempt((current) => current + 1);
  };

  const reset = () => {
    setTokenInput('');
    setLookupToken('');
    setRequest(null);
    setGuardianName('');
    setOutcome(null);
    setError(null);
    setLoading(false);
  };

  const respond = async (decision: 'approve' | 'decline') => {
    const client = supabase;
    if (!client || !lookupToken) return;
    if (decision === 'approve' && guardianName.trim().length < 2) {
      setError('Enter your full name to confirm consent.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: rpcError } = await client.rpc('respond_to_guardian_consent', {
        token_input: lookupToken,
        decision_input: decision,
        guardian_name_input: guardianName.trim(),
      });
      if (rpcError) throw rpcError;
      const result = (data as { request_status: 'approved' | 'declined'; minor_display_name: string }[] | null)?.[0];
      if (!result) throw new Error('Could not record this response.');
      setOutcome(result.request_status);
      setRequest((current) => (current ? { ...current, request_status: result.request_status } : current));
    } catch (responseError) {
      setError(responseError instanceof Error ? responseError.message : 'Could not record your response.');
    } finally {
      setSubmitting(false);
    }
  };

  const status = outcome ?? request?.request_status ?? null;
  const minorName = request?.minor_display_name ?? 'this teen';

  const resultCard = (icon: keyof typeof Feather.glyphMap, tone: 'success' | 'danger', title: string, copy: string, action?: React.ReactNode) => (
    <ClayCard style={{ padding: 24, alignItems: 'center', gap: 12 }} elevated="lifted">
      <View style={{ width: 70, height: 70, borderRadius: 25, backgroundColor: tone === 'success' ? colors.successSoft : colors.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={30} color={tone === 'success' ? colors.success : colors.danger} />
      </View>
      <SemanticHeading style={[type.h2, { color: colors.ink, textAlign: 'center' }]}>{title}</SemanticHeading>
      <Text style={[type.body, { color: colors.muted, textAlign: 'center', lineHeight: 21 }]}>{copy}</Text>
      {action}
    </ClayCard>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, justifyContent: 'center' }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ width: '100%', maxWidth: 540, alignSelf: 'center', gap: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Pressable onPress={() => router.replace('/')} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <TachiReelMark size={34} />
                <TachiReelWordmark size={22} />
              </Pressable>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.successSoft, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 }}>
                <Feather name="shield" size={11} color={colors.success} />
                <Text style={[type.tiny, { color: colors.success, fontSize: 8 }]}>Guardian review</Text>
              </View>
            </View>

            {!supabase ? (
              <ClayCard style={{ padding: 24, alignItems: 'center', gap: 12 }}>
                <View style={{ width: 66, height: 66, borderRadius: 24, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="shield" size={28} color={colors.success} />
                </View>
                <SemanticHeading style={[type.h2, { color: colors.ink, textAlign: 'center' }]}>Consent review is offline.</SemanticHeading>
                <Text style={[type.small, { color: colors.muted, textAlign: 'center', lineHeight: 19 }]}>
                  Add your Supabase URL and anon key to the .env file to review guardian consent requests.
                </Text>
                <ClayButton label="Back to sign in" variant="secondary" onPress={() => router.replace('/auth')} />
              </ClayCard>
            ) : !lookupToken ? (
              <>
                <View style={{ alignItems: 'center' }}>
                  <View style={{ width: 104, height: 104, borderRadius: 37, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-6deg' }], borderWidth: 1, borderColor: colors.mint }}>
                    <View style={{ width: 74, height: 74, borderRadius: 26, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="shield" size={32} color={colors.success} />
                    </View>
                    <View style={{ position: 'absolute', right: 2, bottom: 0, width: 32, height: 32, borderRadius: 11, backgroundColor: colors.butter, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background }}>
                      <Feather name="lock" size={13} color={colors.ink} />
                    </View>
                  </View>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={[type.tiny, { color: colors.success, marginBottom: 7 }]}>A safer start</Text>
                  <SemanticHeading style={[type.h1, { color: colors.ink, textAlign: 'center' }]}>Review a consent request.</SemanticHeading>
                  <Text style={[type.body, { color: colors.muted, textAlign: 'center', marginTop: 8 }]}>
                    Enter the consent code from the link your teen shared. You will be able to review the account and approve or decline.
                  </Text>
                </View>
                <ClayCard style={{ padding: 20 }} elevated="soft">
                  <ClayInput
                    label="CONSENT CODE"
                    value={tokenInput}
                    onChangeText={setTokenInput}
                    placeholder="Paste the code from the link"
                    autoCapitalize="none"
                    autoCorrect={false}
                    icon="key"
                  />
                  {error ? <View style={{ marginTop: 10 }}><Notice text={error} tone="error" /></View> : null}
                  <View style={{ marginTop: 12 }}>
                    <ClayButton label="Review request" full iconRight="arrow-right" onPress={review} />
                  </View>
                </ClayCard>
                <Pressable onPress={() => router.replace('/auth')} style={{ alignItems: 'center', padding: 6 }}>
                  <Text style={[type.smallMedium, { color: colors.success, fontSize: 11 }]}>Back to sign in</Text>
                </Pressable>
              </>
            ) : loading ? (
              <ClayCard style={{ padding: 24, alignItems: 'center', gap: 10 }}>
                <SemanticHeading visuallyHidden>Guardian consent request</SemanticHeading>
                <ActivityIndicator color={colors.accent} />
                <Text style={[type.small, { color: colors.muted }]}>Loading consent request…</Text>
              </ClayCard>
            ) : !request ? (
              resultCard(
                'alert-circle',
                'danger',
                'Link not found.',
                'This consent link is invalid or has expired. Ask your teen to send a new one.',
                <ClayButton label="Try a different link" variant="secondary" onPress={reset} />,
              )
            ) : status === 'approved' ? (
              resultCard(
                'check',
                'success',
                'Consent recorded.',
                `${minorName}'s account is now active. It stays private, with sensitive content disabled.`,
                <ClayButton label="Done" onPress={() => router.replace('/auth')} />,
              )
            ) : status === 'declined' ? (
              resultCard(
                'x',
                'danger',
                'Consent declined.',
                `${minorName}'s account will stay inactive. They can send a new request if needed.`,
                <ClayButton label="Done" variant="secondary" onPress={() => router.replace('/auth')} />,
              )
            ) : status === 'expired' ? (
              resultCard(
                'clock',
                'danger',
                'Link expired.',
                'This consent link is no longer valid. Ask your teen to send a fresh request.',
                <ClayButton label="Try a different link" variant="secondary" onPress={reset} />,
              )
            ) : (
              <>
                <View style={{ alignItems: 'center' }}>
                  <Text style={[type.tiny, { color: colors.success, marginBottom: 7 }]}>A safer start</Text>
                  <SemanticHeading style={[type.h1, { color: colors.ink, textAlign: 'center' }]}>Consent for {request.minor_display_name}.</SemanticHeading>
                  <Text style={[type.body, { color: colors.muted, textAlign: 'center', marginTop: 6 }]}>Please review the request below before deciding.</Text>
                </View>

                <ClayCard style={{ padding: 20 }} elevated="soft">
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar name={request.minor_display_name} size={44} ring />
                    <View style={{ flex: 1 }}>
                      <Text style={[type.smallMedium, { color: colors.ink }]}>{request.minor_display_name}</Text>
                      <Text style={[type.small, { color: colors.muted, fontSize: 10 }]}>@{request.minor_username}</Text>
                    </View>
                    <View style={{ backgroundColor: colors.accentSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={[type.tiny, { color: colors.accent, fontSize: 8 }]}>Teen account</Text>
                    </View>
                  </View>
                  <View style={{ gap: 7, marginTop: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <Feather name="mail" size={12} color={colors.muted} />
                      <Text style={[type.small, { color: colors.muted, fontSize: 10 }]}>Guardian email · {request.guardian_email}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <Feather name="clock" size={12} color={colors.muted} />
                      <Text style={[type.small, { color: colors.muted, fontSize: 10 }]}>Link expires {formatExpiry(request.request_expires_at)}</Text>
                    </View>
                  </View>
                  <Text style={[type.small, { color: colors.inkSoft, backgroundColor: colors.backgroundAlt, borderRadius: 10, padding: 11, marginTop: 13, lineHeight: 18, fontSize: 10 }]}>
                    By approving, you confirm that you are this teen&apos;s parent or legal guardian and that they may use TachiReel. Their account stays private and sensitive content remains off.
                  </Text>
                </ClayCard>

                <ClayCard style={{ padding: 20 }} elevated="soft">
                  <ClayInput
                    label="YOUR FULL NAME"
                    value={guardianName}
                    onChangeText={setGuardianName}
                    placeholder="Parent or guardian name"
                    autoCapitalize="words"
                    icon="user"
                  />
                  {error ? <View style={{ marginTop: 10 }}><Notice text={error} tone="error" /></View> : null}
                  <View style={{ marginTop: 12, gap: 8 }}>
                    <ClayButton label={submitting ? 'Recording…' : 'Approve consent'} full iconRight="check" loading={submitting} onPress={() => void respond('approve')} />
                    <ClayButton label="Decline request" full variant="danger" onPress={() => void respond('decline')} />
                  </View>
                  <Text style={[type.small, { color: colors.mutedLight, fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 10 }]}>
                    Declining keeps the account inactive. You can ask your teen for a new link if you change your mind.
                  </Text>
                </ClayCard>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function generateMetadata() {
  return privatePageMetadata({
    title: "Review guardian consent",
    description: "Review a TachiReel guardian consent request from a private link.",
    path: "/guardian-consent",
  });
}
