import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { SemanticHeading } from './SemanticHeading';
import { Avatar, EmptyState, ErrorState, Notice, PressableScale } from './ui';
import { activeRecently, fetchMessages, messageDay, messageTime, sendMessage, type Message } from '../lib/messages';
import { useSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { surfaceTransition, useTheme } from '../theme/theme';

const EMOJIS = ['😊', '🌿', '✨', '💛', '☕', '🌙', '🫶', '🌼'];

export type DemoChatMessage = { id: string; sender: 'me' | 'peer'; body: string; created_at: string };

export function ChatWindow({
  conversationId,
  peer,
  demoMessages,
  onBack,
  onSent,
  onRead,
  lastActivity,
}: {
  conversationId: string;
  peer: { name: string; username: string | null; avatarUrl: string | null };
  demoMessages?: DemoChatMessage[];
  onBack?: () => void;
  onSent?: (message: string) => void;
  onRead?: () => void;
  lastActivity?: string;
}) {
  const { colors, type } = useTheme();
  const { userId, isDemo } = useSession();
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const me = userId ?? 'demo-me';
  const initial = demoMessages
    ? demoMessages.map((message) => ({
        id: message.id,
        sender_id: message.sender === 'me' ? me : 'peer',
        body: message.body,
        created_at: message.created_at,
      }))
    : [];

  const [messages, setMessages] = useState<Message[]>(initial);
  const [loading, setLoading] = useState(!demoMessages && Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [composing, setComposing] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || isDemo) return;
    const next = await fetchMessages(supabase, conversationId);
    setMessages(next);
    setError(null);
  }, [conversationId, isDemo]);

  useEffect(() => {
    if (!supabase || demoMessages) return;
    let active = true;
    void (async () => {
      try {
        const next = await fetchMessages(supabase, conversationId);
        if (!active) return;
        setMessages(next);
        setError(null);
        onRead?.();
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load this conversation.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    const interval = setInterval(() => {
      void load().catch(() => undefined);
    }, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [conversationId, demoMessages, load, onRead]);

  useEffect(() => {
    if (demoMessages) onRead?.();
  }, [demoMessages, onRead]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    if (body.length > 4000) {
      setNotice('Messages can be up to 4,000 characters.');
      return;
    }
    setText('');
    setEmojiOpen(false);
    setNotice(null);
    const createdAt = new Date().toISOString();

    if (isDemo || !supabase) {
      setMessages((current) => [...current, { id: `demo-${Date.now()}`, sender_id: me, body, created_at: createdAt }]);
      onSent?.(body);
      return;
    }

    const tempId = `temp-${Date.now()}`;
    setMessages((current) => [...current, { id: tempId, sender_id: me, body, created_at: createdAt }]);
    setSending(true);
    try {
      const saved = await sendMessage(supabase, conversationId, me, body);
      setMessages((current) => current.map((message) => (message.id === tempId ? saved : message)));
      onSent?.(body);
    } catch (sendError) {
      setMessages((current) => current.filter((message) => message.id !== tempId));
      setText(body);
      setNotice(sendError instanceof Error ? sendError.message : 'Could not send that message.');
    } finally {
      setSending(false);
    }
  };

  const again = async () => {
    setError(null);
    setLoading(true);
    try {
      await load();
      onRead?.();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load this conversation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, minHeight: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.surface }}>
        {onBack ? (
          <Pressable onPress={onBack} accessibilityLabel="Back to messages" style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundAlt }}>
            <Feather name="chevron-left" size={20} color={colors.ink} />
          </Pressable>
        ) : null}
        <Avatar uri={peer.avatarUrl} name={peer.name} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <SemanticHeading level={2} numberOfLines={1} style={[type.smallMedium, { color: colors.ink }]}>{peer.name}</SemanticHeading>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {lastActivity && activeRecently(lastActivity) ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.success }} /> : null}
            <Text numberOfLines={1} style={[type.small, { color: colors.muted, fontSize: 10 }]}>
              {peer.username ? `@${peer.username}` : 'Conversation'}
              {lastActivity && activeRecently(lastActivity) ? ' · active recently' : ''}
            </Text>
          </View>
        </View>
        <Feather name="lock" size={13} color={colors.mutedLight} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[type.small, { color: colors.muted }]}>Loading messages…</Text>
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={() => void again()} />
      ) : messages.length === 0 ? (
        <EmptyState
          icon="message-circle"
          title="Say hello."
          description="This is the beginning of your conversation. Keep it kind and keep it yours."
        />
      ) : (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 3, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.map((message, index) => {
            const mine = message.sender_id === me;
            const previous = messages[index - 1];
            const newDay = !previous || messageDay(previous.created_at) !== messageDay(message.created_at);
            const grouped = Boolean(previous && previous.sender_id === message.sender_id && !newDay);
            return (
              <View key={message.id}>
                {newDay ? (
                  <View style={{ alignItems: 'center', marginVertical: 12 }}>
                    <Text style={[type.tiny, { color: colors.mutedLight, fontSize: 8, backgroundColor: colors.backgroundAlt, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 }]}>
                      {messageDay(message.created_at)}
                    </Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', gap: 7, marginTop: grouped ? 2 : 8, alignItems: 'flex-end' }}>
                  {!mine ? (
                    grouped ? <View style={{ width: 26 }} /> : <Avatar uri={peer.avatarUrl} name={peer.name} size={26} />
                  ) : null}
                  <View style={{ maxWidth: '78%' }}>
                    <View
                      style={{
                        backgroundColor: mine ? colors.accent : colors.backgroundAlt,
                        borderRadius: 18,
                        borderBottomRightRadius: mine ? 6 : 18,
                        borderBottomLeftRadius: mine ? 18 : 6,
                        paddingHorizontal: 13,
                        paddingVertical: 9,
                        borderWidth: mine ? 0 : 1,
                        borderColor: colors.line,
                      }}
                    >
                      <Text style={[type.small, { color: mine ? colors.accentContrast : colors.ink }]}>{message.body}</Text>
                    </View>
                    <Text style={[type.small, { color: colors.mutedLight, fontSize: 8, marginTop: 3, textAlign: mine ? 'right' : 'left' }]}>
                      {messageTime(message.created_at)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {notice ? <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}><Notice text={notice} tone="error" /></View> : null}

      {emojiOpen ? (
        <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 14, paddingBottom: 8, flexWrap: 'wrap' }}>
          {EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => { setText((value) => `${value}${emoji}`); setEmojiOpen(false); }}
              accessibilityLabel={`Add ${emoji}`}
              style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundAlt }}
            >
              <Text style={{ fontSize: 16 }}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 7, padding: 12, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface }}>
        <Pressable
          onPress={() => setNotice('Attachments need a messages attachment column and a private chat bucket. They are not available yet.')}
          accessibilityLabel="Attach a file"
          style={{ width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundAlt }}
        >
          <Feather name="paperclip" size={17} color={colors.muted} />
        </Pressable>
        <Pressable
          onPress={() => setEmojiOpen((open) => !open)}
          accessibilityLabel="Add an emoji"
          style={{ width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: emojiOpen ? colors.accentSoft : colors.backgroundAlt }}
        >
          <Feather name="smile" size={17} color={emojiOpen ? colors.accent : colors.muted} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={(value) => { setText(value); if (notice) setNotice(null); }}
          placeholder="Write a message…"
          placeholderTextColor={colors.mutedLight}
          multiline
          maxLength={4000}
          onSubmitEditing={() => void send()}
          onFocus={() => setComposing(true)}
          onBlur={() => setComposing(false)}
          onKeyPress={(event) => {
            if (Platform.OS === 'web' && event.nativeEvent.key === 'Enter' && !(event.nativeEvent as { shiftKey?: boolean }).shiftKey) {
              void send();
            }
          }}
          style={[
            type.small,
            surfaceTransition(),
            {
              flex: 1,
              minHeight: 38,
              maxHeight: 110,
              color: colors.ink,
              backgroundColor: colors.backgroundAlt,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: composing ? colors.focus : colors.line,
              paddingHorizontal: 12,
              paddingVertical: 9,
              outlineStyle: 'solid' as const,
              outlineWidth: 0,
              outlineColor: 'transparent',
            },
          ]}
        />
        <PressableScale onPress={() => void send()} disabled={!text.trim() || sending} accessibilityLabel="Send message">
          <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: !text.trim() ? 0.45 : 1 }}>
            {sending ? <ActivityIndicator size="small" color={colors.accentContrast} /> : <Feather name="arrow-up" size={18} color={colors.accentContrast} />}
          </View>
        </PressableScale>
      </View>
      <Text style={[type.small, { color: colors.mutedLight, fontSize: 9, textAlign: 'center', paddingBottom: 8 }]}>
        Messages are private to this conversation.
      </Text>
    </View>
  );
}
