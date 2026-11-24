import { privatePageMetadata } from '../../lib/seo';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Avatar, ClayButton, ClayCard, EmptyState, ErrorState, PageHeader, PressableScale, SearchField, SectionHeader, Skeleton } from '../../components/ui';
import { PostCard } from '../../components/PostCard';
import { DEMO_PEOPLE, DEMO_POSTS, isDemoMode } from '../../lib/demo-data';
import {
  fetchFeed,
  fetchLikedIds,
  fetchSavedIds,
  fetchSuggestedPeople,
  followUser,
  toggleLike,
  toggleSaved,
  type FeedPost,
} from '../../lib/posts';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/theme';

type Person = { id: string; username: string; display_name: string; avatar_url: string | null; bio?: string | null };
type Mode = 'For you' | 'Following';
type Notice = { text: string; tone: 'info' | 'success' | 'error' } | null;

export default function HomeScreen() {
  const { colors, type, spacing } = useTheme();
  const { width } = useWindowDimensions();
  const { userId, profile, isDemo } = useSession();
  const [mode, setMode] = useState<Mode>('For you');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [circle, setCircle] = useState<Person[]>([]);
  const [suggested, setSuggested] = useState<Person[]>([]);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [search, setSearch] = useState('');

  const compact = width < 820;
  const twoColumn = width >= 1180;
  const name = profile?.display_name?.split(' ')[0] ?? 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const load = useCallback(async () => {
    if (isDemoMode) {
      const source = mode === 'Following'
        ? DEMO_POSTS.filter((post) => ['p-nila', 'p-dev', 'p-rosa'].includes(post.author.id))
        : DEMO_POSTS;
      setPosts(source.map((post) => ({
        id: post.id,
        caption: post.caption,
        media_type: post.media_type,
        media_key: post.id,
        thumbnail_key: null,
        topic: post.topic,
        created_at: post.created_at,
        author: post.author,
        like_count: post.like_count,
        comment_count: post.comment_count,
        media_url: post.media_url,
        poster_url: post.poster_url,
      })));
      setLiked(new Set(source.filter((post) => post.liked).map((post) => post.id)));
      setSaved(new Set(source.filter((post) => post.saved).map((post) => post.id)));
      setCircle(DEMO_PEOPLE.slice(0, 5));
      setSuggested(DEMO_PEOPLE.slice(1, 5));
      setError(null);
      return;
    }

    const client = supabase;
    if (!client) throw new Error('Connect your Supabase project to load the live feed.');
    if (!userId) throw new Error('Log in to see your feed.');

    const [feed, followsResult, suggestions] = await Promise.all([
      fetchFeed(client, { userId, mode, limit: 30 }),
      client
        .from('follows')
        .select('followed_id, profile:profiles!follows_followed_id_fkey(id, username, display_name, avatar_url)')
        .eq('follower_id', userId)
        .eq('status', 'accepted')
        .limit(12),
      fetchSuggestedPeople(client, userId, 4),
    ]);
    if (followsResult.error) throw followsResult.error;

    const ids = feed.map((post) => post.id);
    const [likedIds, savedIds] = await Promise.all([
      fetchLikedIds(client, userId, ids),
      fetchSavedIds(client, userId, ids),
    ]);

    const people = (followsResult.data ?? [])
      .map((row) => (row.profile as unknown as Person | null))
      .filter((person): person is Person => Boolean(person));

    setPosts(feed);
    setLiked(likedIds);
    setSaved(savedIds);
    setCircle(people);
    setSuggested(suggestions);
    setError(null);
  }, [mode, userId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await load();
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load the feed.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    setNotice(null);
    try {
      await load();
    } catch (loadError) {
      setNotice({ text: loadError instanceof Error ? loadError.message : 'Could not refresh the feed.', tone: 'error' });
    } finally {
      setRefreshing(false);
    }
  };

  const retry = async () => {
    setError(null);
    setLoading(true);
    try {
      await load();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the feed.');
    } finally {
      setLoading(false);
    }
  };

  const onLike = async (post: FeedPost) => {
    const wasLiked = liked.has(post.id);
    const delta = wasLiked ? -1 : 1;
    const apply = (change: number) => {
      setLiked((current) => {
        const next = new Set(current);
        if (change > 0) next.add(post.id);
        else next.delete(post.id);
        return next;
      });
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, like_count: Math.max(0, item.like_count + change) } : item));
    };
    apply(delta);
    if (isDemoMode) return;
    if (!supabase || !userId) return;
    try {
      await toggleLike(supabase, userId, post.id, !wasLiked);
    } catch (likeError) {
      apply(-delta);
      setNotice({ text: likeError instanceof Error ? likeError.message : 'Could not save that like.', tone: 'error' });
    }
  };

  const onSave = async (post: FeedPost) => {
    const wasSaved = saved.has(post.id);
    setSaved((current) => {
      const next = new Set(current);
      if (wasSaved) next.delete(post.id);
      else next.add(post.id);
      return next;
    });
    if (isDemoMode) {
      setNotice({ text: wasSaved ? 'Removed from your saved posts.' : 'Saved for later.', tone: 'success' });
      return;
    }
    if (!supabase || !userId) return;
    try {
      await toggleSaved(supabase, userId, post.id, !wasSaved);
      setNotice({ text: wasSaved ? 'Removed from your saved posts.' : 'Saved for later.', tone: 'success' });
    } catch (saveError) {
      setSaved((current) => {
        const next = new Set(current);
        if (wasSaved) next.add(post.id);
        else next.delete(post.id);
        return next;
      });
      setNotice({ text: saveError instanceof Error ? saveError.message : 'Could not update saved posts.', tone: 'error' });
    }
  };

  const onFollow = async (person: Person) => {
    if (isDemoMode) {
      setSuggested((current) => current.filter((item) => item.id !== person.id));
      setNotice({ text: `Following ${person.display_name}.`, tone: 'success' });
      return;
    }
    if (!supabase || !userId) return;
    try {
      await followUser(supabase, userId, person.id);
      setSuggested((current) => current.filter((item) => item.id !== person.id));
      setNotice({ text: `Following ${person.display_name}.`, tone: 'success' });
    } catch (followError) {
      setNotice({ text: followError instanceof Error ? followError.message : 'Could not follow this person.', tone: 'error' });
    }
  };

  const trending = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      if (post.topic) counts.set(`#${post.topic.toLowerCase().replace(/\s+/g, '')}`, (counts.get(`#${post.topic.toLowerCase().replace(/\s+/g, '')}`) ?? 0) + 1);
      for (const tag of post.caption.match(/#[A-Za-z0-9_]+/g) ?? []) {
        const key = tag.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [posts]);

  const submitSearch = () => {
    const value = search.trim();
    router.push(value ? { pathname: '/(tabs)/discover', params: { q: value } } : '/(tabs)/discover');
  };

  const feedContent = (
    <View style={{ flex: 1, minWidth: 0, maxWidth: twoColumn ? 720 : undefined, gap: spacing.md }}>
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        title={`${greeting}, ${name}.`}
        subtitle="Here is what your circle has been up to."
        actions={<ClayButton label="New post" icon="plus" size="sm" onPress={() => router.push('/(tabs)/create')} />}
      />

      {compact ? <SearchField value={search} onChangeText={setSearch} onSubmit={submitSearch} placeholder="Search people and moments" /> : null}

      {notice ? (
        <PressableScale onPress={() => setNotice(null)}>
          <View
            style={{
              padding: 11,
              paddingHorizontal: 14,
              borderRadius: 14,
              backgroundColor: notice.tone === 'error' ? colors.dangerSoft : notice.tone === 'success' ? colors.successSoft : colors.accentSoft,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Feather
              name={notice.tone === 'error' ? 'alert-circle' : notice.tone === 'success' ? 'check-circle' : 'info'}
              size={14}
              color={notice.tone === 'error' ? colors.danger : notice.tone === 'success' ? colors.success : colors.accent}
            />
            <Text style={[type.small, { color: notice.tone === 'error' ? colors.danger : notice.tone === 'success' ? colors.success : colors.accent, flex: 1 }]}>{notice.text}</Text>
            <Feather name="x" size={13} color={colors.muted} />
          </View>
        </PressableScale>
      ) : null}

      <ClayCard style={{ padding: 15 }} elevated="soft">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
          <Avatar uri={profile?.avatar_url} name={profile?.display_name ?? 'You'} size={40} />
          <PressableScale onPress={() => router.push('/(tabs)/create')} style={{ flex: 1 }}>
            <View
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 16,
                backgroundColor: colors.backgroundAlt,
                borderWidth: 1,
                borderColor: colors.line,
                justifyContent: 'center',
                paddingHorizontal: 14,
              }}
            >
              <Text style={[type.small, { color: colors.mutedLight }]}>What&apos;s on your mind, {name}?</Text>
            </View>
          </PressableScale>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Photo', icon: 'image' as const, type: 'photo' },
            { label: 'Video', icon: 'video' as const, type: 'video' },
            { label: 'Reel', icon: 'film' as const, type: 'reel' },
          ].map((item) => (
            <PressableScale key={item.label} onPress={() => router.push({ pathname: '/(tabs)/create', params: { type: item.type } })} style={{ flex: 1, minWidth: 90 }}>
              <View style={{ height: 38, borderRadius: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Feather name={item.icon} size={14} color={colors.accent} />
                <Text style={[type.buttonSmall, { color: colors.inkSoft, fontSize: 11 }]}>{item.label}</Text>
              </View>
            </PressableScale>
          ))}
        </View>
      </ClayCard>

      {circle.length > 0 ? (
        <View>
          <SectionHeader title="Your circle" subtitle="The people you chose to follow" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingVertical: 2, paddingRight: 8 }}>
            {circle.map((person) => (
              <PressableScale
                key={person.id}
                onPress={() => router.push({ pathname: '/(tabs)/user/[username]', params: { username: person.username } })}
                accessibilityLabel={`Open ${person.display_name}'s profile`}
              >
                <View style={{ alignItems: 'center', width: 68, gap: 6 }}>
                  <View style={{ padding: 3, borderRadius: 24, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentSoft }}>
                    <Avatar uri={person.avatar_url} name={person.display_name} size={52} />
                  </View>
                  <Text numberOfLines={1} style={[type.small, { color: colors.inkSoft, fontSize: 10, maxWidth: 66 }]}>
                    {person.display_name.split(' ')[0]}
                  </Text>
                </View>
              </PressableScale>
            ))}
            <PressableScale onPress={() => router.push('/(tabs)/discover')}>
              <View style={{ alignItems: 'center', width: 68, gap: 6 }}>
                <View style={{ width: 58, height: 58, borderRadius: 22, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
                  <Feather name="search" size={18} color={colors.muted} />
                </View>
                <Text style={[type.small, { color: colors.muted, fontSize: 10 }]}>Find more</Text>
              </View>
            </PressableScale>
          </ScrollView>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Text style={[type.h3, { color: colors.ink }]}>The good stuff</Text>
        <View style={{ flexDirection: 'row', padding: 3, borderRadius: 13, backgroundColor: colors.backgroundAlt }}>
          {(['For you', 'Following'] as const).map((item) => (
            <PressableScale key={item} onPress={() => { if (item === mode) return; setMode(item); setLoading(true); }} accessibilityLabel={`Show ${item} feed`}>
              <View style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10, backgroundColor: mode === item ? colors.surface : 'transparent', borderWidth: 1, borderColor: mode === item ? colors.line : 'transparent' }}>
                <Text style={[type.buttonSmall, { color: mode === item ? colors.ink : colors.muted, fontSize: 11 }]}>{item}</Text>
              </View>
            </PressableScale>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={{ gap: 16 }}>
          {[0, 1].map((item) => (
            <ClayCard key={item} style={{ padding: 16, gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <Skeleton width={42} height={42} radius={21} />
                <View style={{ gap: 6 }}>
                  <Skeleton width={120} height={12} />
                  <Skeleton width={80} height={9} />
                </View>
              </View>
              <Skeleton height={240} radius={18} />
              <Skeleton width="80%" height={12} />
            </ClayCard>
          ))}
        </View>
      ) : error ? (
        <ClayCard style={{ padding: 10 }}>
          <ErrorState message={error} onRetry={() => void retry()} />
        </ClayCard>
      ) : posts.length === 0 ? (
        <ClayCard style={{ padding: 10 }}>
          <EmptyState
            icon="sun"
            title={mode === 'Following' ? 'Your following feed is quiet.' : 'No moments here yet.'}
            description={mode === 'Following' ? 'Follow a few people and their moments will appear here.' : 'Be the first to share something small and lovely.'}
            action={<ClayButton label="Share a moment" icon="plus" onPress={() => router.push('/(tabs)/create')} />}
          />
        </ClayCard>
      ) : (
        posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            liked={liked.has(post.id)}
            saved={saved.has(post.id)}
            likeCount={post.like_count}
            commentCount={post.comment_count}
            onToggleLike={() => void onLike(post)}
            onToggleSave={() => void onSave(post)}
            onComment={() => router.push({ pathname: '/(tabs)/comments/[postId]', params: { postId: post.id } })}
            onAuthor={post.author ? () => router.push({ pathname: '/(tabs)/user/[username]', params: { username: post.author!.username } }) : undefined}
            onPlay={() => router.push({ pathname: '/(tabs)/reels', params: { id: post.id } })}
            onNotice={(text, tone = 'info') => setNotice({ text, tone })}
          />
        ))
      )}
    </View>
  );

  const rail = (
    <View style={{ width: twoColumn ? 316 : '100%', gap: 16 }}>
      <ClayCard style={{ padding: 18 }} elevated="soft">
        <SectionHeader title="Trending on TachiReel" subtitle="From the moments in your feed" />
        {trending.length === 0 ? (
          <Text style={[type.small, { color: colors.muted }]}>Hashtags and topics will appear as people share.</Text>
        ) : (
          <View style={{ gap: 12 }}>
            {trending.map(([tag, count], index) => (
              <PressableScale key={tag} onPress={() => router.push({ pathname: '/(tabs)/discover', params: { q: tag.replace('#', '') } })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={[type.small, { color: colors.mutedLight, width: 16, fontSize: 10 }]}>0{index + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.smallMedium, { color: colors.ink }]}>{tag}</Text>
                    <Text style={[type.small, { color: colors.muted, fontSize: 9 }]}>{count} {count === 1 ? 'moment' : 'moments'} today</Text>
                  </View>
                  <Feather name="trending-up" size={14} color={colors.success} />
                </View>
              </PressableScale>
            ))}
          </View>
        )}
      </ClayCard>

      <ClayCard style={{ padding: 18 }} elevated="soft">
        <SectionHeader title="People to meet" subtitle="A few kind corners" />
        {suggested.length === 0 ? (
          <Text style={[type.small, { color: colors.muted }]}>You are following everyone we could find right now.</Text>
        ) : (
          <View style={{ gap: 13 }}>
            {suggested.map((person) => (
              <View key={person.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <PressableScale onPress={() => router.push({ pathname: '/(tabs)/user/[username]', params: { username: person.username } })}>
                  <Avatar uri={person.avatar_url} name={person.display_name} size={38} />
                </PressableScale>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[type.smallMedium, { color: colors.ink }]}>{person.display_name}</Text>
                  <Text numberOfLines={1} style={[type.small, { color: colors.muted, fontSize: 10 }]}>@{person.username}</Text>
                </View>
                <Pressable
                  onPress={() => void onFollow(person)}
                  accessibilityLabel={`Follow ${person.display_name}`}
                  style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentSoft }}
                >
                  <Text style={[type.buttonSmall, { color: colors.accent, fontSize: 10 }]}>Follow</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ClayCard>

      <ClayCard style={{ padding: 20, backgroundColor: colors.accentSoft }} elevated="soft">
        <View style={{ width: 38, height: 38, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Feather name="compass" size={18} color={colors.accent} />
        </View>
        <Text style={[type.h3, { color: colors.ink }]}>Discover something new.</Text>
        <Text style={[type.small, { color: colors.inkSoft, marginTop: 6, lineHeight: 19 }]}>
          Browse topics, places and people outside your usual circle.
        </Text>
        <View style={{ marginTop: 14 }}>
          <ClayButton label="Explore" size="sm" variant="secondary" iconRight="arrow-right" onPress={() => router.push('/(tabs)/discover')} />
        </View>
      </ClayCard>

      {isDemo ? (
        <Text style={[type.small, { color: colors.mutedLight, fontSize: 9, textAlign: 'center' }]}>
          Preview mode uses sample content. Connect Supabase for live data.
        </Text>
      ) : null}
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 80 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.accent} />}
    >
      <View style={{ flexDirection: twoColumn ? 'row' : 'column', gap: 16, alignItems: twoColumn ? 'flex-start' : 'stretch' }}>
        {feedContent}
        {twoColumn ? rail : null}
      </View>
      {!twoColumn ? <View style={{ marginTop: 16 }}>{rail}</View> : null}
    </ScrollView>
  );
}

export function generateMetadata() {
  return privatePageMetadata({
    title: "Home feed",
    description: "Your TachiReel home feed.",
    path: "/home",
  });
}
