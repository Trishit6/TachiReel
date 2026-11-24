import { privatePageMetadata } from '../../lib/seo';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Avatar, Badge, ClayButton, ClayCard, Chip, EmptyState, ErrorState, LoadingState, PageHeader } from '../../components/ui';
import { DEMO_NOTIFICATIONS, isDemoMode, type DemoNotification } from '../../lib/demo-data';
import { formatRelativeTime } from '../../lib/format';
import { signPaths } from '../../lib/posts';
import { useSession } from '../../lib/session';
import { readPreference, writePreference } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/theme';

type Category = 'All' | 'Likes' | 'Comments' | 'Followers' | 'Announcements' | 'Mentions';
type Notification = {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'announcement';
  actorName: string;
  actorUsername: string | null;
  actorAvatar: string | null;
  title: string | null;
  body: string | null;
  postId: string | null;
  postCaption: string | null;
  postMediaUrl?: string;
  createdAt: string;
  read: boolean;
};

type Row = {
  notification_id: string;
  notification_type: 'like' | 'comment' | 'follow' | 'announcement';
  notification_title: string | null;
  notification_body: string | null;
  actor_id: string | null;
  actor_display_name: string | null;
  actor_username: string | null;
  actor_avatar_url: string | null;
  post_id: string | null;
  post_caption: string | null;
  post_media_key: string | null;
  created_at: string;
};

const CATEGORIES: Category[] = ['All', 'Likes', 'Comments', 'Followers', 'Announcements', 'Mentions'];

export default function NotificationsScreen() {
  const { colors, type, radii } = useTheme();
  const { userId, isDemo } = useSession();
  const [items, setItems] = useState<Notification[]>([]);
  const [category, setCategory] = useState<Category>('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<string | null>(null);

  const readKey = `tachireel.notifications.read.${userId ?? 'demo'}`;

  const load = useCallback(async () => {
    if (isDemoMode) {
      setItems(DEMO_NOTIFICATIONS.map((item: DemoNotification) => ({
        id: item.id,
        type: item.type,
        actorName: item.actor.display_name,
        actorUsername: item.actor.username,
        actorAvatar: item.actor.avatar_url,
        title: null,
        body: item.post_caption ?? null,
        postId: null,
        postCaption: item.post_caption ?? null,
        createdAt: item.created_at,
        read: item.read,
      })));
      setError(null);
      return;
    }
    const client = supabase;
    if (!client) throw new Error('Connect your Supabase project to see notifications.');
    if (!userId) throw new Error('Log in to see notifications.');

    const { data, error: rpcError } = await client.rpc('get_my_notifications');
    if (rpcError) {
      if (rpcError.code === '42883' || /get_my_notifications/i.test(rpcError.message)) {
        throw new Error('Notifications need the latest supabase/schema.sql (get_my_notifications RPC).');
      }
      throw rpcError;
    }
    const rows = (data ?? []) as Row[];
    const media = await signPaths(client, rows.map((row) => row.post_media_key));
    setItems(rows.map((row, index) => ({
      id: row.notification_type === 'announcement'
        ? `announcement-${row.notification_id}`
        : `${row.notification_type}-${row.actor_id}-${row.post_id ?? 'follow'}-${index}`,
      type: row.notification_type,
      actorName: row.actor_display_name ?? 'TachiReel',
      actorUsername: row.actor_username,
      actorAvatar: row.actor_avatar_url,
      title: row.notification_title,
      body: row.notification_body,
      postId: row.post_id,
      postCaption: row.post_caption,
      postMediaUrl: row.post_media_key ? media[row.post_media_key] : undefined,
      createdAt: row.created_at,
      read: false,
    })));
    setError(null);
  }, [userId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const stored = await readPreference(readKey);
        if (active) setLastRead(stored);
        await load();
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load notifications.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load, readKey]);

  const isUnread = (item: Notification) => {
    if (isDemoMode) return !item.read;
    if (!lastRead) return true;
    return new Date(item.createdAt).getTime() > new Date(lastRead).getTime();
  };

  const markAll = () => {
    const now = new Date().toISOString();
    setLastRead(now);
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    void writePreference(readKey, now);
  };

  const filtered = useMemo(() => {
    const map: Record<Exclude<Category, 'All' | 'Mentions'>, Notification['type']> = {
      Likes: 'like',
      Comments: 'comment',
      Followers: 'follow',
      Announcements: 'announcement',
    };
    if (category === 'All') return items;
    if (category === 'Mentions') return [];
    return items.filter((item) => item.type === map[category]);
  }, [category, items]);

  const unreadCount = items.filter(isUnread).length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ width: '100%', maxWidth: 880, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 80, gap: 18 }}
      showsVerticalScrollIndicator={false}
    >
      <PageHeader
        eyebrow="A little attention"
        title="Notifications."
        subtitle="The kind things happening around your corner."
        actions={
          <>
            <Badge label={`${unreadCount} unread`} tone={unreadCount > 0 ? 'sage' : 'muted'} />
            <ClayButton label="Mark all read" size="sm" variant="secondary" icon="check-circle" disabled={unreadCount === 0} onPress={markAll} />
          </>
        }
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {CATEGORIES.map((item) => <Chip key={item} label={item} active={category === item} onPress={() => setCategory(item)} />)}
      </ScrollView>

      {category === 'Mentions' ? (
        <ClayCard style={{ padding: 8 }}>
          <EmptyState
            icon="at-sign"
            title="Mentions are not switched on yet."
            description="Mentions need a mentions table and a notification pipeline. Likes, comments and follows are fully live."
          />
        </ClayCard>
      ) : loading ? (
        <LoadingState label="Gathering the good stuff…" />
      ) : error ? (
        <ClayCard><ErrorState message={error} onRetry={() => { setLoading(true); void load().finally(() => setLoading(false)); }} /></ClayCard>
      ) : filtered.length === 0 ? (
        <ClayCard style={{ padding: 8 }}>
          <EmptyState icon="bell" title="Nothing here yet." description={isDemo ? 'Sample notifications will show here once there is activity.' : 'Likes, comments and new followers will show up here.'} />
        </ClayCard>
      ) : (
        <View style={{ gap: 9 }}>
          {filtered.map((item) => {
            const unread = isUnread(item);
            const announcement = item.type === 'announcement';
            const icon = announcement ? 'bell' : item.type === 'like' ? 'heart' : item.type === 'comment' ? 'message-circle' : 'user-plus';
            const tone = announcement ? '#C8341D' : item.type === 'like' ? colors.peach : item.type === 'comment' ? colors.accent : colors.success;
            const toneBg = announcement ? colors.dangerSoft : item.type === 'like' ? colors.peachSoft : item.type === 'comment' ? colors.accentSoft : colors.mintSoft;
            const text = item.type === 'like' ? 'liked your moment.' : item.type === 'comment' ? 'commented on your moment.' : 'started following you.';
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  if (announcement) return;
                  if (item.type === 'follow' && item.actorUsername) router.push({ pathname: '/(tabs)/user/[username]', params: { username: item.actorUsername } });
                  else if (item.postId) router.push({ pathname: '/(tabs)/post/[postId]', params: { postId: item.postId } });
                }}
                accessibilityLabel={announcement ? item.title ?? 'Announcement' : `${item.actorName} ${text}`}
                style={({ pressed }) => ({
                  backgroundColor: unread ? colors.accentSoft : colors.surface,
                  borderRadius: radii.card,
                  borderWidth: 1,
                  borderColor: unread ? colors.accentSoft : colors.line,
                  padding: 13,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 11,
                  opacity: pressed && !announcement ? 0.9 : 1,
                })}
              >
                <View style={{ position: 'relative' }}>
                  {announcement ? (
                    <View style={{ width: 44, height: 44, borderRadius: radii.card, backgroundColor: toneBg, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="bell" size={19} color={tone} />
                    </View>
                  ) : (
                    <>
                      <Avatar uri={item.actorAvatar} name={item.actorName} size={44} />
                      <View style={{ position: 'absolute', right: -3, bottom: -3, width: 21, height: 21, borderRadius: 8, backgroundColor: toneBg, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: unread ? colors.accentSoft : colors.surface }}>
                        <Feather name={icon} size={10} color={tone} />
                      </View>
                    </>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {announcement ? (
                    <>
                      <Text style={[type.smallMedium, { color: colors.ink }]} numberOfLines={1}>{item.title ?? 'Announcement'}</Text>
                      <Text style={[type.small, { color: colors.inkSoft, lineHeight: 18 }]} numberOfLines={3}>{item.body ?? ''}</Text>
                    </>
                  ) : (
                    <Text style={[type.small, { color: colors.inkSoft, lineHeight: 18 }]}>
                      <Text style={[type.smallMedium, { color: colors.ink }]}>{item.actorName}</Text> {text}
                    </Text>
                  )}
                  {item.postCaption ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      {item.postMediaUrl ? (
                        <View style={{ width: 24, height: 24, borderRadius: 7, overflow: 'hidden', backgroundColor: colors.surfaceDeep }}>
                          <Feather name="image" size={10} color={colors.muted} style={{ alignSelf: 'center', marginTop: 7 }} />
                        </View>
                      ) : null}
                      <Text numberOfLines={1} style={[type.small, { color: colors.muted, fontSize: 10, flex: 1 }]}>{item.postCaption}</Text>
                    </View>
                  ) : null}
                  <Text style={[type.small, { color: colors.mutedLight, fontSize: 9, marginTop: 4 }]}>{formatRelativeTime(item.createdAt)}</Text>
                </View>
                {unread ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent }} /> : announcement ? null : <Feather name="chevron-right" size={15} color={colors.mutedLight} />}
              </Pressable>
            );
          })}
        </View>
      )}

      {isDemo ? <Text style={[type.small, { color: colors.mutedLight, fontSize: 9, textAlign: 'center' }]}>Preview notifications. Connect Supabase for live activity.</Text> : null}
    </ScrollView>
  );
}

export function generateMetadata() {
  return privatePageMetadata({
    title: "Notifications",
    description: "Your TachiReel notifications.",
    path: "/notifications",
  });
}
