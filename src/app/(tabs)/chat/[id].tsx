import { privatePageMetadata } from '../../../lib/seo';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SemanticHeading } from '../../../components/SemanticHeading';
import { ClayCard, ErrorState, LoadingState } from '../../../components/ui';
import { ChatWindow } from '../../../components/ChatWindow';
import { DEMO_CONVERSATIONS, isDemoMode } from '../../../lib/demo-data';
import { fetchConversation, type Conversation } from '../../../lib/messages';
import { useSession } from '../../../lib/session';
import { readPreference, writePreference } from '../../../lib/storage';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../theme/theme';

export default function ChatScreen() {
  const { colors, type } = useTheme();
  const params = useLocalSearchParams<{ id?: string; demo?: string; name?: string; username?: string }>();
  const { userId } = useSession();
  const id = params.id ?? '';
  const demoConversation = DEMO_CONVERSATIONS.find((conversation) => conversation.id === id);
  const [conversation, setConversation] = useState<Conversation | null>(
    isDemoMode && demoConversation
      ? {
          id,
          peerId: demoConversation.peer.id,
          name: demoConversation.peer.display_name,
          username: demoConversation.peer.username,
          avatarUrl: demoConversation.peer.avatar_url,
          lastMessage: demoConversation.last_message,
          lastMessageAt: demoConversation.last_message_at,
          lastSenderId: demoConversation.peer.id,
        }
      : isDemoMode && params.name
        ? {
            id,
            peerId: null,
            name: params.name,
            username: params.username ?? null,
            avatarUrl: null,
            lastMessage: 'No messages yet',
            lastMessageAt: new Date().toISOString(),
            lastSenderId: null,
          }
        : null,
  );
  const [loading, setLoading] = useState(!isDemoMode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoMode || !supabase || !userId) return;
    let active = true;
    void (async () => {
      try {
        const row = await fetchConversation(supabase, userId, id);
        if (!active) return;
        if (!row) setError('This conversation is not available.');
        else setConversation(row);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load this conversation.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, userId]);

  const markRead = useCallback(() => {
    const key = `tachireel.read.${userId ?? 'demo'}`;
    void (async () => {
      const raw = await readPreference(key);
      let map: Record<string, string> = {};
      if (raw) {
        try {
          map = JSON.parse(raw) as Record<string, string>;
        } catch {
          map = {};
        }
      }
      if (!map[id]) {
        map[id] = new Date().toISOString();
        await writePreference(key, JSON.stringify(map));
      }
    })();
  }, [id, userId]);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/inbox');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 0 }}>
      <View style={{ width: '100%', maxWidth: 980, alignSelf: 'center', flex: 1, minHeight: 0 }}>
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
            <SemanticHeading style={[type.h3, { color: colors.ink, textAlign: 'center' }]}>Conversation</SemanticHeading>
            <LoadingState label="Opening your conversation…" />
          </View>
        ) : error ? (
          <View style={{ flex: 1, justifyContent: 'center', padding: 20, gap: 12 }}>
            <SemanticHeading style={[type.h3, { color: colors.ink, textAlign: 'center' }]}>Conversation unavailable</SemanticHeading>
            <ClayCard style={{ padding: 12 }}>
              <ErrorState message={error} onRetry={back} />
            </ClayCard>
          </View>
        ) : !conversation ? (
          <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
            <SemanticHeading style={[type.h3, { color: colors.muted, textAlign: 'center' }]}>This conversation could not be found.</SemanticHeading>
          </View>
        ) : (
          <ChatWindow
            conversationId={conversation.id}
            peer={{ name: conversation.name, username: conversation.username, avatarUrl: conversation.avatarUrl }}
            demoMessages={demoConversation?.messages}
            lastActivity={conversation.lastMessageAt}
            onBack={back}
            onRead={markRead}
          />
        )}
      </View>
    </View>
  );
}

export function generateMetadata() {
  return privatePageMetadata({
    title: "Conversation",
    description: "View a private TachiReel conversation.",
    path: "/chat/[id]",
  });
}

export function generateStaticParams() {
  return [];
}
