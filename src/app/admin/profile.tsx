import { adminPageMetadata } from '../../lib/seo';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Avatar, ClayButton, ClayInput, ConfirmDialog, Notice, useToast } from '../../components/ui';
import { useAdmin } from '../../components/admin/AdminProvider';
import { AdminCard, AdminPage, KeyValue, StatusBadge } from '../../components/admin/AdminUI';
import {
  PERMISSION_LABELS,
  ROLE_LABELS,
  formatDateTime,
  friendlyError,
  titleCase,
  type AdminPermission,
} from '../../lib/admin';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { uploadAsset, validateAsset } from '../../lib/upload';
import { useTheme } from '../../theme/theme';

const USERNAME_PATTERN = /^[A-Za-z0-9._]{3,30}$/;

export default function AdminProfileScreen() {
  const { access } = useAdmin();
  const { profile, userId, email, refresh, signOut } = useSession();
  const { colors, type, resolved, toggleTheme } = useTheme();
  const toast = useToast();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [avatar, setAvatar] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const chooseAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const problem = validateAsset(result.assets[0]);
    if (problem) { toast.show(problem, 'error'); return; }
    setAvatar(result.assets[0]);
  };

  const save = async () => {
    setError(null);
    if (!profile) { setError('Your account profile could not be loaded.'); return; }
    if (displayName.trim().length < 1 || displayName.trim().length > 60) {
      setError('Display names must be between 1 and 60 characters.'); return;
    }
    if (!USERNAME_PATTERN.test(username.trim())) {
      setError('Usernames are 3–30 characters using letters, numbers, dots or underscores.'); return;
    }
    if (bio.length > 160) { setError('Your bio can be up to 160 characters.'); return; }
    const client = supabase;
    if (!client || !userId) { setError('A connected Supabase account is required to save.'); return; }

    setBusy(true);
    try {
      let avatarUrl = profile.avatar_url;
      if (avatar) {
        const uploaded = await uploadAsset(client, userId, avatar, 'avatars');
        const { data: signed, error: signError } = await client.storage.from('avatars').createSignedUrl(uploaded.path, 60 * 60 * 24 * 365);
        if (signError) throw signError;
        avatarUrl = signed.signedUrl;
      }
      const { error: updateError } = await client.from('profiles').update({
        display_name: displayName.trim(), username: username.trim().toLowerCase(), bio: bio.trim(), avatar_url: avatarUrl,
      }).eq('id', userId);
      if (updateError) {
        if (updateError.code === '23505') throw new Error('That username is already taken.');
        throw updateError;
      }
      await refresh();
      setAvatar(null);
      toast.show('Admin profile updated.', 'success');
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      toast.show('Could not sign out. Please try again.', 'error');
    }
  };

  const avatarUri = avatar?.uri ?? (profile?.avatar_url?.startsWith('http') ? profile.avatar_url : undefined);

  return (
    <AdminPage
      title="Admin Profile"
      subtitle="Your staff identity, permissions and appearance settings."
      actions={<ClayButton label="Log out" variant="outline" size="sm" icon="log-out" onPress={() => setLogoutOpen(true)} />}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        <View style={{ flex: 1, minWidth: 320 }}>
          <AdminCard>
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 6 }}>
              <Avatar uri={avatarUri ?? null} name={displayName || email || 'Admin'} size={72} />
              <ClayButton label="Change photo" size="sm" variant="outline" icon="camera" onPress={() => void chooseAvatar()} />
              <Text style={[type.h3, { color: colors.ink }]}>{profile?.display_name ?? 'Administrator'}</Text>
              <Text style={[type.small, { color: colors.muted }]}>@{profile?.username ?? 'unknown'} · {email ?? 'No email'}</Text>
              {access ? <StatusBadge status={access.role} /> : null}
            </View>
            <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 8 }} />
            <ClayInput label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={60} />
            <ClayInput label="Username" value={username} onChangeText={setUsername} maxLength={30} autoCapitalize="none" />
            <ClayInput label="Bio" value={bio} onChangeText={setBio} maxLength={160} multiline />
            {error ? <Notice text={error} tone="error" /> : null}
            <ClayButton label="Save profile" icon="save" loading={busy} onPress={() => void save()} />
          </AdminCard>
        </View>

        <View style={{ flex: 1, minWidth: 320 }}>
          <AdminCard>
            <Text style={[type.h3, { color: colors.ink }]}>Staff access</Text>
            <KeyValue label="Role" value={access ? ROLE_LABELS[access.role] : 'Not assigned'} />
            <KeyValue label="User ID" value={userId ?? '—'} />
            <KeyValue label="Account status" value={profile?.account_status ? <StatusBadge status={profile.account_status} /> : '—'} />
            <KeyValue label="Age classification" value={profile?.is_minor ? 'Minor' : 'Adult'} />
            <KeyValue label="Joined" value={formatDateTime(profile?.created_at)} />
            <Notice text="Role changes can only be made by a Super Admin in Roles & Permissions. There is no public admin registration." tone="info" />
          </AdminCard>

          <AdminCard>
            <Text style={[type.h3, { color: colors.ink }]}>Your permissions</Text>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator>
              {(access?.permissions ?? []).map((permission) => (
                <View key={permission} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                  <StatusBadge status="verified" />
                  <Text style={[type.small, { color: colors.inkSoft, flex: 1 }]}>{PERMISSION_LABELS[permission as AdminPermission] ?? titleCase(permission)}</Text>
                </View>
              ))}
            </ScrollView>
          </AdminCard>

          <AdminCard>
            <Text style={[type.h3, { color: colors.ink }]}>Appearance</Text>
            <Text style={[type.small, { color: colors.muted }]}>Currently using the {resolved} theme. Your preference applies across the app.</Text>
            <ClayButton label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'}`} variant="outline" size="sm" icon={resolved === 'dark' ? 'sun' : 'moon'} onPress={toggleTheme} />
          </AdminCard>
        </View>
      </View>

      <ConfirmDialog
        visible={logoutOpen}
        title="Log out of admin?"
        message="You will return to the TachiReel sign-in screen."
        confirmLabel="Log out"
        onConfirm={() => void handleSignOut()}
        onCancel={() => setLogoutOpen(false)}
      />
    </AdminPage>
  );
}

export function generateMetadata() {
  return adminPageMetadata("Admin Profile", "/admin/profile");
}
