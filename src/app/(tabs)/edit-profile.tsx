import { useState } from 'react';
import { Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar, ClayButton, ClayCard, ClayInput, EmptyState, Notice, PageHeader, PressableScale } from '../../components/ui';
import { isDemoMode } from '../../lib/demo-data';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { uploadAsset, validateAsset } from '../../lib/upload';
import { useTheme } from '../../theme/theme';

const USERNAME_PATTERN = /^[A-Za-z0-9._]{3,30}$/;

export default function EditProfileScreen() {
  const { colors, type } = useTheme();
  const { width } = useWindowDimensions();
  const { profile, userId, email, refresh } = useSession();
  const wide = width >= 900;
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [avatar, setAvatar] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!profile) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <ClayCard style={{ width: '100%', maxWidth: 520, padding: 10 }}>
          <EmptyState
            icon="user"
            title="Log in to edit your profile."
            description="Your profile is only editable from your own account."
            action={<ClayButton label="Go to log in" onPress={() => router.push('/auth')} />}
          />
        </ClayCard>
      </View>
    );
  }

  const chooseAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const problem = validateAsset(result.assets[0]);
    if (problem) {
      setError(problem);
      return;
    }
    setAvatar(result.assets[0]);
    setError(null);
    setSuccess(null);
  };

  const save = async () => {
    setError(null);
    setSuccess(null);
    if (displayName.trim().length < 1) {
      setError('Add a display name.');
      return;
    }
    if (displayName.trim().length > 60) {
      setError('Display names can be up to 60 characters.');
      return;
    }
    if (!USERNAME_PATTERN.test(username.trim())) {
      setError('Usernames are 3–30 characters using letters, numbers, dots or underscores.');
      return;
    }
    if (bio.length > 160) {
      setError('Your bio can be up to 160 characters.');
      return;
    }

    if (isDemoMode) {
      setSuccess('Preview mode: your edits are validated but need a connected Supabase project to save.');
      return;
    }
    const client = supabase;
    if (!client || !userId) {
      setError('Log in to save your profile.');
      return;
    }

    setBusy(true);
    try {
      let avatarUrl = profile.avatar_url;
      if (avatar) {
        const uploaded = await uploadAsset(client, userId, avatar, 'avatars');
        const { data: signed, error: signError } = await client.storage.from('avatars').createSignedUrl(uploaded.path, 60 * 60 * 24 * 365);
        if (signError) throw signError;
        avatarUrl = signed.signedUrl;
      }

      const { error: updateError } = await client
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          username: username.trim().toLowerCase(),
          bio: bio.trim(),
          avatar_url: avatarUrl,
        })
        .eq('id', userId);
      if (updateError) {
        if (updateError.code === '23505') throw new Error('That username is already taken. Try another one.');
        throw updateError;
      }
      await refresh();
      setAvatar(null);
      setSuccess('Profile updated. Your corner looks good.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  };

  const avatarUri = avatar?.uri ?? (profile.avatar_url?.startsWith('http') ? profile.avatar_url : undefined);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ width: '100%', maxWidth: 980, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 96, gap: 18 }}
      showsVerticalScrollIndicator={false}
    >
      <PageHeader
        eyebrow="A little refresh"
        title="Edit profile."
        subtitle="Keep it you. Change what feels right."
        actions={<ClayButton label="Back" variant="ghost" size="sm" icon="arrow-left" onPress={() => router.push('/(tabs)/profile')} />}
      />

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
        <View style={{ width: wide ? 330 : '100%', gap: 14 }}>
          <ClayCard style={{ padding: 0, overflow: 'hidden' }} radius={28}>
            <View style={{ height: 150, overflow: 'hidden' }}>
              <LinearGradient colors={[colors.accentSoft, colors.mintSoft, colors.peachSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
              <View style={{ position: 'absolute', width: 120, height: 120, borderRadius: 42, backgroundColor: colors.surface, opacity: 0.35, top: -30, right: -20 }} />
              <View style={{ position: 'absolute', width: 46, height: 46, borderRadius: 16, backgroundColor: colors.butter, top: 24, left: 24, transform: [{ rotate: '9deg' }] }} />
            </View>
            <View style={{ padding: 18, alignItems: 'center', marginTop: -48 }}>
              <PressableScale onPress={() => void chooseAvatar()} accessibilityLabel="Change profile photo">
                <View style={{ position: 'relative' }}>
                  {avatarUri ? (
                    <View style={{ width: 104, height: 104, borderRadius: 52, overflow: 'hidden', borderWidth: 3, borderColor: colors.accent }}>
                      <Image source={{ uri: avatarUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    </View>
                  ) : (
                    <Avatar uri={profile.avatar_url} name={displayName || profile.display_name} size={98} ring />
                  )}
                  <View style={{ position: 'absolute', right: -2, bottom: 0, width: 34, height: 34, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface }}>
                    <Feather name="camera" size={14} color={colors.accentContrast} />
                  </View>
                </View>
              </PressableScale>
              <Text style={[type.smallMedium, { color: colors.ink, marginTop: 12 }]}>{displayName || profile.display_name}</Text>
              <Text style={[type.small, { color: colors.muted, fontSize: 10 }]}>@{username || profile.username}</Text>
              <Text style={[type.small, { color: colors.mutedLight, fontSize: 9, marginTop: 10, textAlign: 'center' }]}>
                Tap the photo to choose a new one. JPG, PNG or WEBP up to 5 MB.
              </Text>
            </View>
          </ClayCard>

          <ClayCard style={{ padding: 16, backgroundColor: colors.butterSoft }} elevated="soft">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <Feather name="image" size={13} color={colors.inkSoft} />
              <Text style={[type.smallMedium, { color: colors.inkSoft, fontSize: 11 }]}>Cover image</Text>
            </View>
            <Text style={[type.small, { color: colors.muted, fontSize: 10, lineHeight: 16 }]}>
              A generated clay cover is used for now. Custom cover uploads need a cover_url column in profiles.
            </Text>
          </ClayCard>

          <Text style={[type.small, { color: colors.mutedLight, fontSize: 9, textAlign: 'center', lineHeight: 14 }]}>
            Website, location, and pronouns need additional profile columns. The current schema keeps profiles focused on safety.
          </Text>
        </View>

        <View style={{ flex: 1, width: wide ? undefined : '100%', gap: 14, minWidth: 0 }}>
          <ClayCard style={{ padding: 22 }} elevated="soft">
            <Text style={[type.h3, { color: colors.ink }]}>The basics</Text>
            <Text style={[type.small, { color: colors.muted, marginTop: 3, marginBottom: 16 }]}>How people see you around TachiReel</Text>
            <View style={{ gap: 13 }}>
              <ClayInput label="DISPLAY NAME" value={displayName} onChangeText={setDisplayName} placeholder="Your name" maxLength={60} autoComplete="name" />
              <ClayInput
                label="USERNAME"
                value={username}
                onChangeText={(value) => setUsername(value.toLowerCase().replace(/\s/g, ''))}
                placeholder="your.handle"
                autoCapitalize="none"
                autoCorrect={false}
                icon="at-sign"
                maxLength={30}
              />
              <ClayInput
                label="BIO"
                value={bio}
                onChangeText={setBio}
                placeholder="A little about you"
                multiline
                maxLength={160}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <Text style={[type.small, { color: colors.mutedLight, fontSize: 9 }]}>{bio.length}/160</Text>
              </View>
            </View>
          </ClayCard>

          <ClayCard style={{ padding: 22 }} elevated="soft">
            <Text style={[type.h3, { color: colors.ink }]}>Account</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="mail" size={15} color={colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.smallMedium, { color: colors.ink }]}>{email ?? 'Email hidden'}</Text>
                <Text style={[type.small, { color: colors.muted, fontSize: 10 }]}>Used to sign in. Change it from Settings.</Text>
              </View>
            </View>
            <Text style={[type.small, { color: colors.mutedLight, fontSize: 9, marginTop: 12, lineHeight: 15 }]}>
              {Platform.OS === 'web' ? 'On the web, profile photos are stored in the private avatars bucket and shown through signed URLs.' : 'Profile photos upload to the private avatars bucket.'}
            </Text>
          </ClayCard>

          {error ? <Notice text={error} tone="error" /> : null}
          {success ? <Notice text={success} tone="success" /> : null}

          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <ClayButton label="Save changes" icon="check" loading={busy} onPress={() => void save()} />
            <ClayButton label="Cancel" variant="ghost" onPress={() => router.push('/(tabs)/profile')} />
          </View>
          {success ? <ClayButton label="Back to profile" variant="secondary" onPress={() => router.push('/(tabs)/profile')} /> : null}
        </View>
      </View>
    </ScrollView>
  );
}
