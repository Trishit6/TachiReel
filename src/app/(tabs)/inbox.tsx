import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Avatar, ClayButton, ClayCard, ClayInput, Dialog, EmptyState, ErrorState, LoadingState, PageHeader, SearchField } from '../../components/ui';
import { ChatWindow } from '../../components/ChatWindow';
import { DEMO_CONVERSATIONS, DEMO_PEOPLE, isDemoMode } from '../../lib/demo-data';
import { activeRecently, fetchConversations, startConversation, type Conversation } from '../../lib/messages';
import { fetchSuggestedPeople } from '../../lib/posts';
import { formatRelativeTime } from '../../lib/format';
import { useSession } from '../../lib/session';
import { readPreference, writePreference } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/theme';

type Person = { id: string; username: string; display_name: string; avatar_url: string | null };
type ReadMap = Record<string, string>;

export default function InboxScreen() {
  const { colors, type, radii } = useTheme();
  const { width } = useWindowDimensions();
  const { userId } = useSession();
  const wide = width >= 1024;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readMap, setReadMap] = useState<ReadMap>({});
  const [composeOpen, setComposeOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [composeSearch, setComposeSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const readKey = `tachireel.read.${userId ?? 'demo'}`;

  const load = useCallback(async () => {
    if (isDemoMode) {
      const mapped: Conversation[] = DEMO_CONVERSATIONS.map((conversation) => ({
        id: conversation.id,
        peerId: conversation.peer.id,
        name: conversation.peer.display_name,
        username: conversation.peer.username,
        avatarUrl: conversation.peer.avatar_url,
        lastMessage: conversation.last_message,
        lastMessageAt: conversation.last_message_at,
        lastSenderId: conversation.last_message.startsWith('You:') ? 'demo-me' : conversation.peer.id,
      }));
      setConversations(mapped);
      setSelectedId((current) => current ?? mapped[0]?.id ?? null);
      setError(null);
      return;
    }
    const client = supabase;
    if (!client) throw new Error('Connect your Supabase project to load messages.');
    if (!userId) throw new Error('Log in to see your messages.');
    const rows = await fetchConversations(client, userId);
    setConversations(rows);
    setSelectedId((current) => (current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? null));
    setError(null);
  }, [userId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const stored = await readPreference(readKey);
        if (active && stored) {
          try {
            setReadMap(JSON.parse(stored) as ReadMap);
          } catch {
            setReadMap({});
          }
        }
        await load();
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load your messages.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load, readKey]);

  const markRead = useCallback((id: string) => {
    setReadMap((current) => {
      if (current[id]) return current;
      const next = { ...current, [id]: new Date().toISOString() };
      void writePreference(readKey, JSON.stringify(next));
      return next;
    });
  }, [readKey]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (loadError) {
      setNotice(loadError instanceof Error ? loadError.message : 'Could not refresh messages.');
    } finally {
      setRefreshing(false);
    }
  };

  const openCompose = async () => {
    setComposeOpen(true);
    setComposeSearch('');
    setPeopleLoading(true);
    try {
      if (isDemoMode) {
        setPeople(DEMO_PEOPLE);
      } else if (supabase && userId) {
        setPeople(await fetchSuggestedPeople(supabase, userId, 12));
      }
    } catch {
      setNotice('Could not load people right now.');
    } finally {
      setPeopleLoading(false);
    }
  };

  const startWith = async (person: Person) => {
    setComposeOpen(false);
    if (isDemoMode) {
      const existing = conversations.find((conversation) => conversation.peerId === person.id);
      if (existing) {
        setSelectedId(existing.id);
        if (!wide) router.push({ pathname: '/(tabs)/chat/[id]', params: { id: existing.id } });
        return;
      }
      const id = `demo-new-${person.id}`;
      const conversation: Conversation = {
        id,
        peerId: person.id,
        name: person.display_name,
        username: person.username,
        avatarUrl: person.avatar_url,
        lastMessage: 'No messages yet',
        lastMessageAt: new Date().toISOString(),
        lastSenderId: null,
      };
      setConversations((current) => [conversation, ...current]);
      setSelectedId(id);
      if (!wide) {
        router.push({
          pathname: '/(tabs)/chat/[id]',
          params: { id, demo: '1', name: person.display_name, username: person.username },
        });
      }
      return;
    }
    if (!supabase) return;
    try {
      const id = await startConversation(supabase, person.id);
      await load();
      setSelectedId(id);
      if (!wide) router.push({ pathname: '/(tabs)/chat/[id]', params: { id } });
    } catch (startError) {
      setNotice(startError instanceof Error ? startError.message : 'Could not start that conversation.');
    }
  };

  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const selectedForRead = selected?.id;
  const handleRead = useCallback(() => {
    if (selectedForRead) markRead(selectedForRead);
  }, [markRead, selectedForRead]);
  const demoConversation = selected ? DEMO_CONVERSATIONS.find((conversation) => conversation.id === selected.id) : undefined;
  const filtered = conversations.filter((conversation) => {
    const haystack = `${conversation.name} ${conversation.username ?? ''} ${conversation.lastMessage}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const isUnread = (conversation: Conversation) => {
    if (conversation.lastSenderId === userId) return false;
    const readAt = readMap[conversation.id];
    return !readAt || new Date(conversation.lastMessageAt).getTime() > new Date(readAt).getTime();
  };

  const list = (
    <View style={{ width: wide ? 330 : '100%', borderRightWidth: wide ? 1 : 0, borderRightColor: colors.line, backgroundColor: colors.surface, minHeight: 0 }}>
      <View style={{ padding: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Search messages" compact />
        {notice ? (
          <Pressable onPress={() => setNotice(null)}>
            <Text style={[type.small, { color: colors.danger, fontSize: 10 }]}>{notice}</Text>
          </Pressable>
        ) : null}
      </View>
      {loading ? (
        <LoadingState label="Loading conversations…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void refresh()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="message-circle"
          title={conversations.length === 0 ? 'No conversations yet.' : 'No matches.'}
          description={conversations.length === 0 ? 'Start one from someone’s profile and it will appear here.' : 'Try a different name or message.'}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.accent} />}>
          {filtered.map((conversation) => {
            const active = conversation.id === selectedId && wide;
            const unread = isUnread(conversation);
            const recent = activeRecently(conversation.lastMessageAt);
            return (
              <Pressable
                key={conversation.id}
                onPress={() => {
                  setSelectedId(conversation.id);
                  markRead(conversation.id);
                  if (!wide) router.push({ pathname: '/(tabs)/chat/[id]', params: { id: conversation.id } });
                }}
                accessibilityLabel={`Open conversation with ${conversation.name}`}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  gap: 10,
                  paddingHorizontal: 13,
                  paddingVertical: 13,
                  backgroundColor: active ? colors.accentSoft : pressed ? colors.backgroundAlt : 'transparent',
                  borderLeftWidth: 3,
                  borderLeftColor: active ? colors.accent : 'transparent',
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                })}
              >
                <View style={{ position: 'relative' }}>
                  <Avatar uri={conversation.avatarUrl} name={conversation.name} size={44} />
                  {recent ? (
                    <View style={{ position: 'absolute', right: 0, bottom: 0, width: 11, height: 11, borderRadius: 6, backgroundColor: colors.success, borderWidth: 2, borderColor: colors.surface }} />
                  ) : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text numberOfLines={1} style={[type.smallMedium, { color: colors.ink, flex: 1, fontWeight: unread ? '700' : '500' }]}>{conversation.name}</Text>
                    <Text style={[type.small, { color: unread ? colors.accent : colors.mutedLight, fontSize: 9 }]}>{formatRelativeTime(conversation.lastMessageAt)}</Text>
                  </View>
                  <Text numberOfLines={1} style={[type.small, { color: unread ? colors.inkSoft : colors.muted, fontSize: 10.5, marginTop: 3, fontWeight: unread ? '600' : '400' }]}>
                    {conversation.lastMessage}
                  </Text>
                </View>
                {unread ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent, alignSelf: 'center' }} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  const chat = selected ? (
    <ChatWindow
      key={selected.id}
      conversationId={selected.id}
      peer={{ name: selected.name, username: selected.username, avatarUrl: selected.avatarUrl }}
      demoMessages={demoConversation?.messages}
      lastActivity={selected.lastMessageAt}
      onRead={handleRead}
      onSent={(message) => {
        setConversations((current) => current.map((conversation) => conversation.id === selected.id
          ? { ...conversation, lastMessage: `You: ${message}`, lastMessageAt: new Date().toISOString(), lastSenderId: userId ?? 'demo-me' }
          : conversation));
      }}
    />
  ) : (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <EmptyState icon="message-square" title="Choose a conversation." description="Your messages live here, away from the noise." />
    </View>
  );

  if (!wide) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12 }}>
          <PageHeader
            eyebrow="Your little corner"
            title="Messages."
            subtitle="Conversations that feel like you."
            actions={<ClayButton label="New" icon="edit-3" size="sm" onPress={() => void openCompose()} />}
          />
        </View>
        <View style={{ flex: 1, minHeight: 0, paddingHorizontal: 16, paddingBottom: 10 }}>
          <ClayCard style={{ flex: 1, minHeight: 0, padding: 0, overflow: 'hidden' }}>{list}</ClayCard>
        </View>
        <ComposeDialog
          visible={composeOpen}
          onClose={() => setComposeOpen(false)}
          people={people}
          loading={peopleLoading}
          query={composeSearch}
          onQuery={setComposeSearch}
          onSelect={(person) => void startWith(person)}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 20 }}>
      <View style={{ width: '100%', maxWidth: 1240, alignSelf: 'center', flex: 1, minHeight: 0, gap: 16 }}>
        <PageHeader
          eyebrow="Your little corner"
          title="Messages."
          subtitle="Private conversations, kept between the people in them."
          actions={<ClayButton label="New message" icon="edit-3" size="sm" onPress={() => void openCompose()} />}
        />
        <ClayCard style={{ flex: 1, minHeight: 0, flexDirection: 'row', overflow: 'hidden', padding: 0 }} elevated="soft">
          {list}
          <View style={{ flex: 1, minWidth: 0, backgroundColor: colors.surface, borderRadius: radii.card }}>
            {chat}
          </View>
        </ClayCard>
      </View>
      <ComposeDialog
        visible={composeOpen}
        onClose={() => setComposeOpen(false)}
        people={people}
        loading={peopleLoading}
        query={composeSearch}
        onQuery={setComposeSearch}
        onSelect={(person) => void startWith(person)}
      />
    </View>
  );
}

function ComposeDialog({
  visible,
  onClose,
  people,
  loading,
  query,
  onQuery,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  people: Person[];
  loading: boolean;
  query: string;
  onQuery: (value: string) => void;
  onSelect: (person: Person) => void;
}) {
  const { colors, type } = useTheme();
  const filtered = people.filter((person) => `${person.display_name} ${person.username}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Dialog visible={visible} title="Start a conversation" message="Choose someone to message. Keep it kind." cancelLabel="Close" onCancel={onClose}>
      <ClayInput value={query} onChangeText={onQuery} placeholder="Search people" icon="search" />
      <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: 4 }}>
        {loading ? <LoadingState label="Finding people…" /> : filtered.length === 0 ? (
          <Text style={[type.small, { color: colors.muted, padding: 12 }]}>No people found.</Text>
        ) : filtered.map((person) => (
          <Pressable
            key={person.id}
            onPress={() => onSelect(person)}
            accessibilityLabel={`Message ${person.display_name}`}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 9,
              borderRadius: 12,
              backgroundColor: pressed ? colors.backgroundAlt : 'transparent',
            })}
          >
            <Avatar uri={person.avatar_url} name={person.display_name} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={[type.smallMedium, { color: colors.ink }]}>{person.display_name}</Text>
              <Text style={[type.small, { color: colors.muted, fontSize: 10 }]}>@{person.username}</Text>
            </View>
            <Feather name="chevron-right" size={15} color={colors.muted} />
          </Pressable>
        ))}
      </ScrollView>
      {isDemoMode ? <Text style={[type.small, { color: colors.mutedLight, fontSize: 9 }]}>Preview mode: conversations are local to this session.</Text> : null}
    </Dialog>
  );
}
