import { privatePageMetadata } from '../../../lib/seo';
import { useCallback, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import {
  Badge,
  ClayButton,
  ClayCard,
  ClayInput,
  FileUpload,
  Notice,
  PageHeader,
  Select,
  type IconName,
} from '../../../components/ui';
import { isDemoMode } from '../../../lib/demo-data';
import { useSession } from '../../../lib/session';
import {
  createSupportTicket,
  uploadSupportFile,
  uploadSupportImageAsset,
  validateTicketInput,
  type SupportCategory,
} from '../../../lib/support';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../theme/theme';

const CATEGORIES: { label: string; value: SupportCategory; icon: IconName }[] = [
  { label: 'Account & sign in', value: 'account', icon: 'user' },
  { label: 'Safety or a minor account', value: 'safety', icon: 'shield' },
  { label: 'A post, comment or like', value: 'content', icon: 'image' },
  { label: 'Reelyx video', value: 'reelyx', icon: 'film' },
  { label: 'Something else', value: 'other', icon: 'help-circle' },
];

type PendingFile = { name: string; size: number; file?: File; asset?: ImagePicker.ImagePickerAsset };

export default function NewSupportTicketScreen() {
  const { colors, type } = useTheme();
  const { userId } = useSession();
  const canUseBackend = !isDemoMode && Boolean(supabase && userId);

  const [category, setCategory] = useState<SupportCategory>('account');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onWebFiles = useCallback((picked: File[]) => {
    setFiles((current) => [...current, ...picked.map((file) => ({ name: file.name, size: file.size, file }))]);
  }, []);

  const pickNativeImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo access was blocked. You can still send the ticket without an attachment.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setFiles((current) => [...current, { name: asset.fileName ?? `image-${Date.now()}.jpg`, size: asset.fileSize ?? 0, asset }]);
  };

  const submit = async () => {
    setError(null);
    const invalid = validateTicketInput({ subject, body });
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!canUseBackend || !supabase || !userId) {
      setError('Tickets need a connected Supabase project. You are currently in Preview mode.');
      return;
    }

    setSaving(true);
    try {
      const ticket = await createSupportTicket({ client: supabase, userId, subject, category, body });
      const uploadFailures: string[] = [];
      for (const item of files) {
        try {
          if (item.file) await uploadSupportFile({ client: supabase, userId, ticketId: ticket.id, file: item.file });
          else if (item.asset) await uploadSupportImageAsset({ client: supabase, userId, ticketId: ticket.id, asset: item.asset });
        } catch (uploadError) {
          uploadFailures.push(uploadError instanceof Error ? uploadError.message : `${item.name} could not be attached.`);
        }
      }
      router.push({ pathname: '/(tabs)/support/tickets/[id]', params: { id: ticket.id, uploadError: uploadFailures.join(' ') } });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not open your ticket.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ width: '100%', maxWidth: 820, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 80, gap: 18 }}
      showsVerticalScrollIndicator={false}
    >
      <PageHeader
        eyebrow="Private with the team"
        title="New ticket."
        subtitle="Tell us what happened. Only you and support can see this conversation."
        actions={<ClayButton label="Cancel" icon="x" size="sm" variant="ghost" onPress={() => router.back()} />}
      />

      {isDemoMode ? (
        <Notice tone="info" text="Preview mode: this form is ready, but tickets are not stored until Supabase is connected and the support schema is applied." />
      ) : null}
      {error ? <Notice tone="error" text={error} /> : null}

      <ClayCard style={{ padding: 20, gap: 16 }} elevated="soft">
        <Select
          label="WHAT IS THIS ABOUT?"
          value={category}
          options={CATEGORIES}
          onValueChange={(value) => setCategory(value as SupportCategory)}
          disabled={saving}
        />
        <ClayInput
          label="SUBJECT"
          value={subject}
          onChangeText={setSubject}
          placeholder="A short summary of the problem"
          maxLength={140}
          accessibilityLabel="Ticket subject"
          icon="edit-2"
        />
        <ClayInput
          label="WHAT HAPPENED?"
          value={body}
          onChangeText={setBody}
          placeholder="What were you trying to do, and what happened instead?"
          multiline
          maxLength={4000}
          accessibilityLabel="Ticket description"
          inputStyle={{ minHeight: 140 }}
        />
        <Text style={[type.tiny, { color: colors.mutedLight, fontSize: 9 }]}>{body.length}/4,000 characters</Text>
      </ClayCard>

      <ClayCard style={{ padding: 20, gap: 12 }} elevated="soft">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name="paperclip" size={16} color={colors.accent} />
          <Text style={[type.h3, { color: colors.ink }]}>Attachments</Text>
          <Badge label="Optional" tone="muted" />
        </View>
        <Text style={[type.small, { color: colors.muted, fontSize: 11 }]}>
          Images, PDFs and text files up to 10 MB. Files are stored in a private bucket and linked only to your ticket. Never include passwords or private links.
        </Text>
        <FileUpload
          label={Platform.OS === 'web' ? 'Choose a screenshot or file' : 'Choose a photo'}
          description="Up to 10 MB · private to your ticket"
          accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
          disabled={saving}
          onFiles={onWebFiles}
          onPickNative={() => void pickNativeImage()}
        />
        {files.length > 0 ? (
          <View style={{ gap: 6 }}>
            {files.map((item, index) => (
              <View key={`${item.name}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                <Feather name="file" size={14} color={colors.muted} />
                <Text numberOfLines={1} style={[type.small, { color: colors.inkSoft, flex: 1 }]}>{item.name}</Text>
                <Text style={[type.tiny, { color: colors.mutedLight, fontSize: 9 }]}>{Math.max(1, Math.round(item.size / 1024))} KB</Text>
                <Feather name="x" size={14} color={colors.mutedLight} onPress={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} />
              </View>
            ))}
          </View>
        ) : null}
      </ClayCard>

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <ClayButton label={saving ? 'Opening ticket…' : 'Submit ticket'} icon="send" full loading={saving} onPress={() => void submit()} />
      </View>
    </ScrollView>
  );
}

export function generateMetadata() {
  return privatePageMetadata({
    title: "New support ticket",
    description: "Open a private support ticket with TachiReel.",
    path: "/support/new",
  });
}
