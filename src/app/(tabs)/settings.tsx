import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ClayButton, ClayCard, ClayInput, Dialog, Notice, PageHeader, PressableScale } from '../../components/ui';
import { isDemoMode } from '../../lib/demo-data';
import { useSession } from '../../lib/session';
import { readPreference, writePreference } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { useTheme, type ThemeMode } from '../../theme/theme';

type Visibility = 'public' | 'followers' | 'private';
type NotificationPrefs = { likes: boolean; comments: boolean; follows: boolean; email: boolean };

const DEFAULT_PREFS: NotificationPrefs = { likes: true, comments: true, follows: true, email: false };

export default function SettingsScreen() {
  const { colors, type, mode, setMode, resolved } = useTheme();
  const { width } = useWindowDimensions();
  const twoColumn = width >= 1000;

  const {
    profile,
    email,
    userId,
    isDemo,
    refresh,
    signOut,
  } = useSession();

  const [visibility, setVisibility] = useState<Visibility>(profile?.profile_visibility ?? 'public');
  const [sensitive, setSensitive] = useState(Boolean(profile?.sensitive_content_opt_in));
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [globalOpen, setGlobalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const raw = await readPreference('tachireel.notifications');
      if (!active || !raw) return;
      try {
        setPrefs({ ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<NotificationPrefs>) });
      } catch {
        // Ignore a malformed local preference and keep the defaults.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const savePrivacy = async (key: string, patch: { profile_visibility?: Visibility; sensitive_content_opt_in?: boolean }) => {
    setSaving(key);
    setNotice(null);
    if (isDemoMode) {
      setNotice({ tone: 'info', text: 'Preview mode: privacy changes are validated but need a connected Supabase project to save.' });
      setSaving(null);
      return;
    }
    if (!supabase || !userId) {
      setNotice({ tone: 'error', text: 'Log in to change privacy settings.' });
      setSaving(null);
      return;
    }
    try {
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
      if (error) throw error;
      await refresh();
      setNotice({ tone: 'success', text: 'Privacy settings updated.' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not update privacy settings.' });
    } finally {
      setSaving(null);
    }
  };

  const changeVisibility = (value: Visibility) => {
    if (profile?.is_minor && value === 'public') {
      setNotice({ tone: 'error', text: 'Teen accounts cannot be public. Choose followers or private.' });
      return;
    }
    setVisibility(value);
    void savePrivacy('visibility', { profile_visibility: value });
  };

  const toggleSensitive = () => {
    if (profile?.is_minor) {
      setNotice({ tone: 'error', text: 'Sensitive content stays off for teen accounts.' });
      return;
    }
    const next = !sensitive;
    setSensitive(next);
    void savePrivacy('sensitive', { sensitive_content_opt_in: next });
  };

  const savePrefs = (next: NotificationPrefs) => {
    setPrefs(next);
    void writePreference('tachireel.notifications', JSON.stringify(next));
  };

  const updatePassword = async () => {
    setNotice(null);
    if (newPassword.length < 8) {
      setNotice({ tone: 'error', text: 'Use at least 8 characters for your new password.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice({ tone: 'error', text: 'The two passwords do not match.' });
      return;
    }
    if (isDemoMode) {
      setNotice({ tone: 'info', text: 'Preview mode: password changes need a connected Supabase project.' });
      return;
    }
    if (!supabase) return;
    setSaving('password');
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      setNotice({ tone: 'success', text: 'Password updated.' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not update your password.' });
    } finally {
      setSaving(null);
    }
  };

  const signOutEverywhere = async () => {
    setGlobalOpen(false);
    if (supabase) await supabase.auth.signOut({ scope: 'global' });
    await signOut();
  };

  const modeOptions: { value: ThemeMode; label: string; icon: keyof typeof Feather.glyphMap }[] = [
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
    { value: 'system', label: 'System', icon: 'smartphone' },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ width: '100%', maxWidth: 1080, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 96, gap: 18 }}
      showsVerticalScrollIndicator={false}
    >
      <PageHeader
        eyebrow="Your space, your rules"
        title="Settings."
        subtitle="Account, privacy, appearance, and the small details."
        actions={<ClayButton label="Back to profile" variant="ghost" size="sm" icon="arrow-left" onPress={() => router.push('/(tabs)/profile')} />}
      />

      {notice ? <Notice text={notice.text} tone={notice.tone} /> : null}

      <View style={{ flexDirection: twoColumn ? 'row' : 'column', alignItems: 'flex-start', gap: 18 }}>
        <View style={{ flex: 1, width: twoColumn ? undefined : '100%', gap: 18, minWidth: 0 }}>
          <SettingsCard icon="user" title="Account" subtitle="The basics of who you are here.">
            <SettingRow
              icon="mail"
              title={email ?? 'Email hidden'}
              description="The address used to sign in."
              right={<View style={{ backgroundColor: colors.backgroundAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}><Text style={[type.tiny, { color: colors.muted, fontSize: 8 }]}>Protected</Text></View>}
            />
            <SettingRow
              icon="at-sign"
              title={profile?.username ? `@${profile.username}` : 'No username'}
              description={profile?.display_name ?? 'Your display name'}
              right={<ClayButton label="Edit" size="sm" variant="secondary" onPress={() => router.push('/(tabs)/edit-profile')} />}
            />
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <ClayButton label="Edit profile" size="sm" variant="soft" icon="edit-2" onPress={() => router.push('/(tabs)/edit-profile')} />
              <ClayButton label="Log out" size="sm" variant="danger" icon="log-out" onPress={() => setLogoutOpen(true)} />
            </View>
          </SettingsCard>

          <SettingsCard icon="shield" title="Privacy" subtitle="Who sees your moments, and what you see.">
            <Text style={[type.tiny, { color: colors.muted, marginBottom: 8 }]}>PROFILE VISIBILITY</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {([
                { value: 'public', label: 'Everyone', icon: 'globe' as const },
                { value: 'followers', label: 'Followers', icon: 'users' as const },
                { value: 'private', label: 'Only me', icon: 'lock' as const },
              ] as const).map((option) => {
                const active = visibility === option.value;
                const disabled = Boolean(profile?.is_minor && option.value === 'public');
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => changeVisibility(option.value)}
                    disabled={disabled || saving === 'visibility'}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active, disabled }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 13,
                      paddingVertical: 9,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: active ? colors.accent : colors.line,
                      backgroundColor: active ? colors.accentSoft : colors.surface,
                      opacity: disabled ? 0.4 : 1,
                    }}
                  >
                    <Feather name={option.icon} size={13} color={active ? colors.accent : colors.muted} />
                    <Text style={[type.buttonSmall, { color: active ? colors.accent : colors.inkSoft }]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[type.small, { color: colors.muted, fontSize: 10, marginTop: 8 }]}>
              {visibility === 'public' ? 'Anyone on TachiReel can find your profile and public posts.' : visibility === 'followers' ? 'Only people who follow you can see your moments.' : 'Your profile and posts are visible only to you.'}
            </Text>
            <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 14 }} />
            <ToggleRow
              icon="eye"
              title="Sensitive content"
              description={profile?.is_minor ? 'Always off for teen accounts.' : 'Allow mature content from people you follow.'}
              value={sensitive}
              onToggle={toggleSensitive}
              disabled={Boolean(profile?.is_minor) || saving === 'sensitive'}
            />
          </SettingsCard>

          <SettingsCard icon="lock" title="Security" subtitle="Passwords and active sessions.">
            <View style={{ gap: 10 }}>
              <ClayInput
                label="NEW PASSWORD"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="At least 8 characters"
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                icon="lock"
                rightAccessory={
                  <Pressable onPress={() => setShowPassword((value) => !value)} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} hitSlop={8}>
                    <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={colors.muted} />
                  </Pressable>
                }
              />
              <ClayInput
                label="CONFIRM NEW PASSWORD"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Type it again"
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                icon="lock"
              />
              <ClayButton label="Update password" size="sm" variant="secondary" icon="shield" loading={saving === 'password'} onPress={() => void updatePassword()} />
            </View>
            <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 14 }} />
            <SettingRow
              icon="log-out"
              title="Sign out everywhere"
              description="End every session, on every device."
              right={<ClayButton label="Sign out all" size="sm" variant="danger" onPress={() => setGlobalOpen(true)} />}
            />
          </SettingsCard>
        </View>

        <View style={{ flex: 1, width: twoColumn ? undefined : '100%', gap: 18, minWidth: 0 }}>
          <SettingsCard icon="sun" title="Appearance" subtitle={`Currently using ${resolved} mode.`}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {modeOptions.map((option) => {
                const active = mode === option.value;
                return (
                  <PressableScale key={option.value} onPress={() => setMode(option.value)} accessibilityLabel={`Use ${option.label} theme`} style={{ flex: 1 }}>
                    <View
                      style={{
                        alignItems: 'center',
                        gap: 7,
                        paddingVertical: 14,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: active ? colors.accent : colors.line,
                        backgroundColor: active ? colors.accentSoft : colors.surface,
                      }}
                    >
                      <Feather name={option.icon} size={17} color={active ? colors.accent : colors.muted} />
                      <Text style={[type.buttonSmall, { color: active ? colors.accent : colors.inkSoft, fontSize: 11 }]}>{option.label}</Text>
                    </View>
                  </PressableScale>
                );
              })}
            </View>
            <Text style={[type.small, { color: colors.muted, fontSize: 10, marginTop: 10, lineHeight: 15 }]}>
              Your choice is saved on this device and follows you across every screen.
            </Text>
          </SettingsCard>

          <SettingsCard icon="bell" title="Notifications" subtitle="What you want to hear about.">
            <ToggleRow icon="heart" title="Likes" description="When someone likes your post." value={prefs.likes} onToggle={() => savePrefs({ ...prefs, likes: !prefs.likes })} />
            <ToggleRow icon="message-circle" title="Comments" description="Replies on your moments." value={prefs.comments} onToggle={() => savePrefs({ ...prefs, comments: !prefs.comments })} />
            <ToggleRow icon="user-plus" title="New followers" description="When someone joins your circle." value={prefs.follows} onToggle={() => savePrefs({ ...prefs, follows: !prefs.follows })} />
            <ToggleRow icon="mail" title="Email summaries" description="A gentle weekly recap." value={prefs.email} onToggle={() => savePrefs({ ...prefs, email: !prefs.email })} />
            <Text style={[type.small, { color: colors.mutedLight, fontSize: 9, marginTop: 10, lineHeight: 14 }]}>
              In-app toggles are stored on this device. Email delivery needs a notifications preference table and an email provider.
            </Text>
          </SettingsCard>

          <SettingsCard icon="help-circle" title="Help & Support" subtitle="Answers, private tickets and the assistant.">
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <ClayButton label="Open help centre" size="sm" variant="soft" icon="book-open" onPress={() => router.push('/(tabs)/support')} />
              <ClayButton label="New ticket" size="sm" variant="secondary" icon="plus" onPress={() => router.push('/(tabs)/support/new')} />
              <ClayButton label="Ask assistant" size="sm" variant="ghost" icon="message-square" onPress={() => router.push('/(tabs)/support/chat')} />
            </View>
            <Text style={[type.small, { color: colors.mutedLight, fontSize: 9, marginTop: 10, lineHeight: 14 }]}>
              Tickets are private to your account. The assistant answers only from TachiReel behaviour and can hand off to the team.
            </Text>
          </SettingsCard>

          <SettingsCard icon="link" title="Connected accounts" subtitle="Bring your other corners with you.">
            <View style={{ alignItems: 'flex-start', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="link" size={14} color={colors.muted} />
                </View>
                <View>
                  <Text style={[type.smallMedium, { color: colors.ink }]}>No connected accounts</Text>
                  <Text style={[type.small, { color: colors.muted, fontSize: 10 }]}>Social sign-in is not configured yet.</Text>
                </View>
              </View>
              <Text style={[type.small, { color: colors.mutedLight, fontSize: 9, lineHeight: 14 }]}>
                Connecting Google or Apple needs an OAuth provider configured in Supabase Auth. Until then, email and password is the supported sign-in method.
              </Text>
            </View>
          </SettingsCard>

          <SettingsCard icon="alert-triangle" title="Your data" subtitle="A clear view of what you control.">
            <Text style={[type.small, { color: colors.muted, lineHeight: 19 }]}>
              Your posts, comments, likes, follows, and messages are stored in your Supabase project. You can edit or delete your own posts and comments at any time. Account deletion needs a server-side cleanup function and is not enabled in this build.
            </Text>
            <View style={{ marginTop: 12 }}>
              <ClayButton label="Log out" variant="secondary" size="sm" icon="log-out" onPress={() => setLogoutOpen(true)} />
            </View>
          </SettingsCard>
        </View>
      </View>

      <Text style={[type.small, { color: colors.mutedLight, fontSize: 9, textAlign: 'center' }]}>
        TachiReel · {Platform.OS === 'web' ? 'Web' : Platform.OS} · {isDemo ? 'Preview mode' : 'Connected to Supabase'}
      </Text>

      <Dialog
        visible={logoutOpen}
        title="Log out of TachiReel?"
        message="Your drafts and preferences stay on this device. You can log back in any time."
        confirmLabel="Log out"
        cancelLabel="Stay"
        onConfirm={() => { setLogoutOpen(false); void signOut(); }}
        onCancel={() => setLogoutOpen(false)}
        destructive
      />
      <Dialog
        visible={globalOpen}
        title="Sign out everywhere?"
        message="This ends every active session for your account, including this one."
        confirmLabel="Sign out everywhere"
        cancelLabel="Cancel"
        onConfirm={() => void signOutEverywhere()}
        onCancel={() => setGlobalOpen(false)}
        destructive
      />
    </ScrollView>
  );
}

function SettingsCard({ icon, title, subtitle, children }: { icon: keyof typeof Feather.glyphMap; title: string; subtitle: string; children: ReactNode }) {
  const { colors, type } = useTheme();
  return (
    <ClayCard style={{ padding: 20 }} elevated="soft">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <View style={{ width: 38, height: 38, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={icon} size={17} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.h3, { color: colors.ink }]}>{title}</Text>
          <Text style={[type.small, { color: colors.muted, fontSize: 10, marginTop: 1 }]}>{subtitle}</Text>
        </View>
      </View>
      {children}
    </ClayCard>
  );
}

function SettingRow({ icon, title, description, right }: { icon: keyof typeof Feather.glyphMap; title: string; description: string; right?: ReactNode }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
      <Feather name={icon} size={15} color={colors.muted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.smallMedium, { color: colors.ink }]}>{title}</Text>
        <Text numberOfLines={1} style={[type.small, { color: colors.muted, fontSize: 10 }]}>{description}</Text>
      </View>
      {right}
    </View>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  value,
  onToggle,
  disabled = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const { colors, type } = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, opacity: disabled ? 0.5 : 1 }}
    >
      <Feather name={icon} size={15} color={colors.muted} />
      <View style={{ flex: 1 }}>
        <Text style={[type.smallMedium, { color: colors.ink }]}>{title}</Text>
        <Text style={[type.small, { color: colors.muted, fontSize: 10 }]}>{description}</Text>
      </View>
      <View style={{ width: 42, height: 24, borderRadius: 12, backgroundColor: value ? colors.accent : colors.lineStrong, padding: 2, justifyContent: 'center', alignItems: value ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white }} />
      </View>
    </Pressable>
  );
}
