import { privatePageMetadata } from '../../../../lib/seo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { SemanticHeading } from '../../../../components/SemanticHeading';
import {
  Avatar,
  Badge,
  ClayButton,
  ClayCard,
  ClayInput,
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
} from '../../../../components/ui';
import { formatRelativeTime } from '../../../../lib/format';
import { isDemoMode } from '../../../../lib/demo-data';
import { useSession } from '../../../../lib/session';
import {
  addSupportReply,
  fetchSupportTicketDetail,
  setSupportTicketStatus,
  type SupportStatus,
  type SupportTicketMessage,
} from '../../../../lib/support';
import { supabase } from '../../../../lib/supabase';
import { useTheme } from '../../../../theme/theme';

const STATUS_LABEL: Record<SupportStatus, string> = {
  open: 'Open',
  pending: 'Pending',
  resolved: 'Resolved',
  closed: 'Closed',
};

export default function SupportTicketDetailScreen() {
  const { colors, type } = useTheme();
  const { id, uploadError } = useLocalSearchParams<{ id?: string; uploadError?: string }>();
  const { userId, profile } = useSession();
  const canUseBackend = !isDemoMode && Boolean(supabase && userId && id);

  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchSupportTicketDetail>> | null>(null);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(Boolean(canUseBackend));
  const [sending, setSending] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !id) return;
    try {
      setDetail(await fetchSupportTicketDetail(supabase, id));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load this ticket.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!canUseBackend || loadedRef.current === id) return;
    loadedRef.current = id ?? null;
    void load();
  }, [canUseBackend, id, load]);

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !supabase || !userId || !id) return;
    setSending(true);
    setError(null);
    try {
      await addSupportReply(supabase, { userId, ticketId: id, body: text });
      setReply('');
      await load();
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : 'Could not send your reply.');
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (status: 'open' | 'resolved' | 'closed') => {
    if (!supabase || !id) return;
    setStatusBusy(true);
    setError(null);
    try {
      await setSupportTicketStatus(supabase, id, status);
      await load();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Could not change the ticket status.');
    } finally {
      setStatusBusy(false);
    }
  };

  if (!canUseBackend) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <SemanticHeading visuallyHidden>Support ticket</SemanticHeading>
        <ClayCard style={{ width: '100%', maxWidth: 520, padding: 12 }}>
          <EmptyState icon="file-text" title="Tickets need a connected backend." description="Connect Supabase and apply the support schema to open and read private tickets." />
        </ClayCard>
        <View style={{ marginTop: 14 }}>
          <ClayButton label="Back to Help & Support" icon="arrow-left" onPress={() => router.push('/(tabs)/support')} />
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SemanticHeading visuallyHidden>Support ticket</SemanticHeading>
        <LoadingState label="Opening your ticket…" />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <SemanticHeading visuallyHidden>Support ticket</SemanticHeading>
        <ClayCard style={{ width: '100%', maxWidth: 520, padding: 12 }}>
          <EmptyState icon="alert-circle" title="This ticket is not available." description={error ?? 'It may belong to another account, or the support schema is not set up yet.'} />
        </ClayCard>
        <View style={{ marginTop: 14 }}>
          <ClayButton label="Back to your tickets" icon="arrow-left" onPress={() => router.push('/(tabs)/support')} />
        </View>
      </View>
    );
  }

  const status = detail.ticket.status;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ width: '100%', maxWidth: 840, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 80, gap: 18 }}
      showsVerticalScrollIndicator={false}
    >
      <PageHeader
        eyebrow="Support ticket"
        title={detail.ticket.subject}
        subtitle={`Opened ${formatRelativeTime(detail.ticket.created_at)} · updated ${formatRelativeTime(detail.ticket.updated_at)}`}
        actions={<ClayButton label="All tickets" icon="arrow-left" size="sm" variant="secondary" onPress={() => router.push('/(tabs)/support')} />}
      />

      {error ? <Notice tone="error" text={error} /> : null}
      {uploadError ? <Notice tone="error" text={`Some attachments were not uploaded: ${uploadError}`} /> : null}

      <ClayCard style={{ padding: 18, gap: 12 }} elevated="soft">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Badge label={STATUS_LABEL[status]} tone={status === 'open' ? 'butter' : status === 'resolved' ? 'mint' : status === 'closed' ? 'muted' : 'sage'} />
          <Text style={[type.small, { color: colors.muted }]}>Category: {detail.ticket.category}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {status !== 'resolved' && status !== 'closed' ? (
            <ClayButton label="Mark resolved" icon="check-circle" size="sm" variant="secondary" loading={statusBusy} onPress={() => void changeStatus('resolved')} />
          ) : null}
          {status !== 'closed' ? (
            <ClayButton label="Close ticket" icon="lock" size="sm" variant="ghost" loading={statusBusy} onPress={() => void changeStatus('closed')} />
          ) : null}
          {status === 'closed' || status === 'resolved' ? (
            <ClayButton label="Reopen" icon="refresh-cw" size="sm" variant="soft" loading={statusBusy} onPress={() => void changeStatus('open')} />
          ) : null}
        </View>
      </ClayCard>

      <ClayCard style={{ padding: 18, gap: 16 }} elevated="soft">
        <Text style={[type.h3, { color: colors.ink }]}>Conversation</Text>
        {detail.messages.map((message) => <MessageBubble key={message.id} message={message} isOwn={message.author_role === 'user'} displayName={message.author?.display_name ?? (message.author_role === 'support' ? 'TachiReel Support' : profile?.display_name ?? 'You')} />)}
      </ClayCard>

      <ClayCard style={{ padding: 18, gap: 10 }} elevated="soft">
        <Text style={[type.h3, { color: colors.ink }]}>Reply to support</Text>
        <ClayInput
          value={reply}
          onChangeText={setReply}
          placeholder="Add more detail or answer a question…"
          multiline
          maxLength={4000}
          accessibilityLabel="Ticket reply"
          inputStyle={{ minHeight: 110 }}
        />
        <ClayButton label={sending ? 'Sending…' : 'Send reply'} icon="send" size="sm" loading={sending} disabled={!reply.trim() || status === 'closed'} onPress={() => void sendReply()} />
        {status === 'closed' ? <Text style={[type.tiny, { color: colors.muted }]}>Reopen the ticket to send another reply.</Text> : null}
      </ClayCard>

      <ClayCard style={{ padding: 18, gap: 10 }} elevated="soft">
        <Text style={[type.h3, { color: colors.ink }]}>Attachments</Text>
        {detail.attachments.length === 0 ? (
          <Text style={[type.small, { color: colors.muted }]}>No files were added to this ticket.</Text>
        ) : (
          detail.attachments.map((attachment) => (
            <Pressable
              key={attachment.id}
              disabled={!attachment.signed_url}
              onPress={() => attachment.signed_url && void Linking.openURL(attachment.signed_url)}
              accessibilityLabel={`Open attachment ${attachment.file_name}`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, opacity: pressed || !attachment.signed_url ? 0.6 : 1 })}
            >
              <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="paperclip" size={14} color={colors.muted} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[type.smallMedium, { color: colors.ink }]}>{attachment.file_name}</Text>
                <Text style={[type.tiny, { color: colors.mutedLight, fontSize: 9 }]}>{Math.max(1, Math.round(attachment.byte_size / 1024))} KB</Text>
              </View>
              <Feather name="external-link" size={14} color={colors.accent} />
            </Pressable>
          ))
        )}
      </ClayCard>
    </ScrollView>
  );
}

function MessageBubble({ message, isOwn, displayName }: { message: SupportTicketMessage; isOwn: boolean; displayName: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Avatar uri={isOwn ? undefined : null} name={displayName} size={32} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <Text style={[type.smallMedium, { color: colors.ink }]}>{displayName}</Text>
          <Text style={[type.tiny, { color: colors.mutedLight, fontSize: 9 }]}>{formatRelativeTime(message.created_at)}</Text>
        </View>
        <View style={{ backgroundColor: isOwn ? colors.accentSoft : colors.backgroundAlt, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 }}>
          <Text style={[type.small, { color: colors.ink }]}>{message.body}</Text>
        </View>
      </View>
    </View>
  );
}

export function generateMetadata() {
  return privatePageMetadata({
    title: "Support ticket",
    description: "View a private TachiReel support ticket.",
    path: "/support/tickets/[id]",
  });
}

export function generateStaticParams() {
  return [];
}
