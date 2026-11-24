import { privatePageMetadata } from '../../lib/seo';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Avatar,
  ClayButton,
  ClayCard,
  Chip,
  Dialog,
  EmptyState,
  ErrorState,
  PageHeader,
  PressableScale,
  SearchField,
  SectionHeader,
  Skeleton,
} from '../../components/ui';
import { DEMO_PEOPLE, DEMO_POSTS, isDemoMode } from '../../lib/demo-data';
import { formatRelativeTime } from '../../lib/format';
import {
  fetchFeed,
  fetchFollowingIds,
  fetchLikedIds,
  fetchSavedIds,
  fetchSuggestedPeople,
  followUser,
  toggleLike,
  toggleSaved,
  unfollowUser,
  type FeedPost,
  type PostAuthor,
} from '../../lib/posts';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/theme';

const CATEGORIES = ['All', 'Travel', 'Food', 'Style', 'Art', 'Technology', 'Lifestyle', 'Wellness'] as const;
type Category = (typeof CATEGORIES)[number];
type Sort = 'Latest' | 'Most liked' | 'Most discussed';
type Media = 'All' | 'Photos' | 'Videos';

const SORT_OPTIONS: Sort[] = ['Latest', 'Most liked', 'Most discussed'];
const MEDIA_OPTIONS: Media[] = ['All', 'Photos', 'Videos'];
const PAGE_SIZE = 8;

const CATEGORY_KEYWORDS: Record<Exclude<Category, 'All'>, string[]> = {
  Travel: ['travel', 'trip', 'coast', 'ubud', 'trail', 'route', 'weekend', 'wander', 'road', 'city', 'somewhere'],
  Food: ['food', 'coffee', 'pour', 'bake', 'peach', 'market', 'cook', 'recipe', 'breakfast', 'delicious', 'sunday'],
  Style: ['style', 'linen', 'shirt', 'fashion', 'wear', 'outfit', 'wardrobe'],
  Art: ['art', 'ceramic', 'making', 'paint', 'draw', 'craft', 'studio', 'hands'],
  Technology: ['tech', 'camera', 'film', 'digital', 'design', 'code', 'lens'],
  Lifestyle: ['life', 'lifestyle', 'reading', 'book', 'blanket', 'home', 'corner', 'sunday', 'plans'],
  Wellness: ['wellness', 'stretch', 'yoga', 'movement', 'calm', 'breath', 'gentle', 'health', 'quiet'],
};

const PLACES = [
  { name: 'Ubud', note: 'Slow mornings & green light', icon: 'sunrise' as const },
  { name: 'Coast', note: 'Salt air and film cameras', icon: 'wind' as const },
  { name: 'Market', note: 'Linen, peaches, good afternoons', icon: 'shopping-bag' as const },
  { name: 'Sunday', note: 'Baking, reading, no plans', icon: 'coffee' as const },
];

type Person = PostAuthor & { bio?: string | null };

function toFeedPost(post: (typeof DEMO_POSTS)[number]): FeedPost {
  return {
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
  };
}

function postMatchesCategory(post: FeedPost, category: Category): boolean {
  if (category === 'All') return true;
  const haystack = `${post.topic ?? ''} ${post.caption}`.toLowerCase();
  if (post.topic?.toLowerCase() === category.toLowerCase()) return true;
  return CATEGORY_KEYWORDS[category].some((keyword) => haystack.includes(keyword));
}

export default function DiscoverScreen() {
  const { colors, type, radii } = useTheme();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ q?: string }>();
  const { userId, isDemo } = useSession();

  const paramQuery = typeof params.q === 'string' ? params.q : '';
  const [search, setSearch] = useState(paramQuery);
  const [category, setCategory] = useState<Category>('All');
  const [sort, setSort] = useState<Sort>('Latest');
  const [media, setMedia] = useState<Media>('All');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const wide = width >= 1120;
  const columns = width >= 1280 ? 3 : width >= 760 ? 2 : 1;

  // Adjust state during render when a new search arrives from the navbar.
  const [lastParam, setLastParam] = useState(paramQuery);
  if (paramQuery !== lastParam) {
    setLastParam(paramQuery);
    setSearch(paramQuery);
  }

  const load = useCallback(async () => {
    if (isDemoMode) {
      const feed = DEMO_POSTS.map(toFeedPost);
      setPosts(feed);
      setPeople(DEMO_PEOPLE);
      setLiked(new Set(DEMO_POSTS.filter((post) => post.liked).map((post) => post.id)));
      setSaved(new Set(DEMO_POSTS.filter((post) => post.saved).map((post) => post.id)));
      setError(null);
      return;
    }
    const client = supabase;
    if (!client) throw new Error('Connect your Supabase project to explore the community.');
    if (!userId) throw new Error('Log in to explore the community.');

    const [feed, suggestions, followingIds] = await Promise.all([
      fetchFeed(client, { userId, mode: 'For you', limit: 60 }),
      fetchSuggestedPeople(client, userId, 8),
      fetchFollowingIds(client, userId),
    ]);
    const ids = feed.map((post) => post.id);
    const [likedIds, savedIds] = await Promise.all([
      fetchLikedIds(client, userId, ids),
      fetchSavedIds(client, userId, ids),
    ]);

    const byId = new Map<string, Person>();
    for (const person of suggestions) byId.set(person.id, person);
    for (const post of feed) {
      if (post.author && !byId.has(post.author.id)) byId.set(post.author.id, post.author);
    }
    if (userId) byId.delete(userId);

    setPosts(feed);
    setPeople([...byId.values()]);
    setLiked(likedIds);
    setSaved(savedIds);
    setFollowing(new Set(followingIds));
    setError(null);
  }, [userId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await load();
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load Explore.');
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
    try {
      await load();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not refresh Explore.');
    } finally {
      setRefreshing(false);
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
      setPosts((current) =>
        current.map((item) =>
          item.id === post.id ? { ...item, like_count: Math.max(0, item.like_count + change) } : item,
        ),
      );
    };
    apply(delta);
    if (isDemoMode) return;
    if (!supabase || !userId) return;
    try {
      await toggleLike(supabase, userId, post.id, !wasLiked);
    } catch (likeError) {
      apply(-delta);
      setNotice(likeError instanceof Error ? likeError.message : 'Could not update that like.');
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
      setNotice(wasSaved ? 'Removed from saved posts.' : 'Saved to your collection.');
      return;
    }
    if (!supabase || !userId) return;
    try {
      await toggleSaved(supabase, userId, post.id, !wasSaved);
      setNotice(wasSaved ? 'Removed from saved posts.' : 'Saved to your collection.');
    } catch (saveError) {
      setSaved((current) => {
        const next = new Set(current);
        if (wasSaved) next.add(post.id);
        else next.delete(post.id);
        return next;
      });
      setNotice(saveError instanceof Error ? saveError.message : 'Could not update saved posts.');
    }
  };

  const onFollow = async (person: Person) => {
    const wasFollowing = following.has(person.id);
    setFollowing((current) => {
      const next = new Set(current);
      if (wasFollowing) next.delete(person.id);
      else next.add(person.id);
      return next;
    });
    if (isDemoMode) {
      setNotice(wasFollowing ? `Unfollowed ${person.display_name}.` : `Following ${person.display_name}.`);
      return;
    }
    if (!supabase || !userId) return;
    try {
      if (wasFollowing) await unfollowUser(supabase, userId, person.id);
      else await followUser(supabase, userId, person.id);
      setNotice(wasFollowing ? `Unfollowed ${person.display_name}.` : `Following ${person.display_name}.`);
    } catch (followError) {
      setFollowing((current) => {
        const next = new Set(current);
        if (wasFollowing) next.add(person.id);
        else next.delete(person.id);
        return next;
      });
      setNotice(followError instanceof Error ? followError.message : 'Could not update that follow.');
    }
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = posts.filter((post) => {
      const matchesCategory = postMatchesCategory(post, category);
      const matchesMedia =
        media === 'All' ? true : media === 'Photos' ? post.media_type === 'photo' : post.media_type === 'video';
      const haystack =
        `${post.caption} ${post.author?.display_name ?? ''} ${post.author?.username ?? ''} ${post.topic ?? ''}`.toLowerCase();
      return matchesCategory && matchesMedia && (!query || haystack.includes(query));
    });
    if (sort === 'Most liked') return [...list].sort((a, b) => b.like_count - a.like_count);
    if (sort === 'Most discussed') return [...list].sort((a, b) => b.comment_count - a.comment_count);
    return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [posts, search, category, sort, media]);

  // Reset pagination during render whenever a filter changes.
  const filterKey = `${search}|${category}|${sort}|${media}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setVisible(PAGE_SIZE);
  }

  const peopleResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return people
      .filter((person) =>
        `${person.display_name} ${person.username} ${person.bio ?? ''}`.toLowerCase().includes(query),
      )
      .slice(0, 4);
  }, [people, search]);

  const trending = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      if (post.topic) {
        const tag = `#${post.topic.toLowerCase().replace(/\s+/g, '')}`;
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
      for (const tag of post.caption.match(/#[A-Za-z0-9_]+/g) ?? []) {
        const key = tag.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [posts]);

  const featured = useMemo(
    () => [...filtered].sort((a, b) => b.like_count - a.like_count).slice(0, 2),
    [filtered],
  );

  const suggestedPeople = useMemo(
    () => people.filter((person) => !following.has(person.id)).slice(0, 4),
    [people, following],
  );

  const shown = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;

  const masonry = useMemo(() => {
    const buckets: FeedPost[][] = Array.from({ length: columns }, () => []);
    shown.forEach((post, index) => buckets[index % columns].push(post));
    return buckets;
  }, [shown, columns]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!hasMore) return;
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 640) {
      setVisible((current) => Math.min(current + PAGE_SIZE, filtered.length));
    }
  };

  const resetFilters = () => {
    setSearch('');
    setCategory('All');
    setMedia('All');
    setSort('Latest');
  };

  const filterCount = (category !== 'All' ? 1 : 0) + (media !== 'All' ? 1 : 0) + (sort !== 'Latest' ? 1 : 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ width: '100%', maxWidth: 1280, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 80 }}
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={200}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.accent} />}
    >
      <PageHeader
        eyebrow="Find your next favourite"
        title="Explore."
        subtitle="Discover ideas, people and places worth a pause."
        actions={
          <>
            <PressableScale onPress={() => setFiltersOpen(true)} accessibilityLabel="Filter and sort">
              <View style={{ height: 42, paddingHorizontal: 14, borderRadius: radii.control, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Feather name="sliders" size={15} color={colors.inkSoft} />
                <Text style={[type.buttonSmall, { color: colors.inkSoft }]}>Filter</Text>
                {filterCount > 0 ? (
                  <View style={{ minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[type.tiny, { color: colors.accentContrast, fontSize: 9 }]}>{filterCount}</Text>
                  </View>
                ) : null}
              </View>
            </PressableScale>
            <ClayButton label="Create" icon="plus" size="sm" onPress={() => router.push('/(tabs)/create')} />
          </>
        }
      />

      <View style={{ gap: 14, marginTop: 16 }}>
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search people, captions, hashtags and places"
          onSubmit={() => setSearch((value) => value.trim())}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
          {CATEGORIES.map((item) => (
            <Chip key={item} label={item} active={category === item} onPress={() => setCategory(item)} />
          ))}
        </ScrollView>
      </View>

      {notice ? (
        <PressableScale onPress={() => setNotice(null)} style={{ marginTop: 14 }}>
          <View style={{ backgroundColor: colors.accentSoft, borderRadius: radii.control, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Feather name="info" size={14} color={colors.accent} />
            <Text style={[type.small, { color: colors.accent, flex: 1 }]}>{notice}</Text>
            <Feather name="x" size={13} color={colors.accent} />
          </View>
        </PressableScale>
      ) : null}

      {loading ? (
        <View style={{ marginTop: 18, gap: 16 }}>
          <Skeleton height={260} radius={20} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {Array.from({ length: columns }).map((_, column) => (
              <View key={column} style={{ flex: 1, gap: 12 }}>
                {[0, 1].map((item) => (
                  <ClayCard key={item} style={{ padding: 0, overflow: 'hidden' }}>
                    <Skeleton height={column % 2 === 0 ? 220 : 160} radius={0} />
                    <View style={{ padding: 11, gap: 7 }}>
                      <Skeleton width="60%" height={9} />
                      <Skeleton width="90%" height={11} />
                    </View>
                  </ClayCard>
                ))}
              </View>
            ))}
          </View>
        </View>
      ) : error ? (
        <ClayCard style={{ marginTop: 18 }}>
          <ErrorState message={error} onRetry={() => void refresh()} />
        </ClayCard>
      ) : (
        <>
          {peopleResults.length > 0 ? (
            <View style={{ marginTop: 18 }}>
              <SectionHeader title="People" subtitle={`Matching “${search.trim()}”`} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {peopleResults.map((person) => (
                  <PersonRow
                    key={person.id}
                    person={person}
                    following={following.has(person.id)}
                    onOpen={() => router.push({ pathname: '/(tabs)/user/[username]', params: { username: person.username } })}
                    onFollow={() => void onFollow(person)}
                    compact={wide}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {featured.length > 0 ? (
            <View style={{ marginTop: 20 }}>
              <SectionHeader
                title="Featured today"
                subtitle="The moments people are pausing on"
                action={<Text style={[type.tiny, { color: colors.muted, fontSize: 9 }]}>Curated from the feed</Text>}
              />
              <View style={{ flexDirection: width >= 900 ? 'row' : 'column', gap: 14 }}>
                <View style={{ flex: width >= 900 ? 2 : undefined, minWidth: 0 }}>
                  <FeaturedCard
                    post={featured[0]}
                    saved={saved.has(featured[0].id)}
                    liked={liked.has(featured[0].id)}
                    onSave={() => void onSave(featured[0])}
                    onLike={() => void onLike(featured[0])}
                    onOpen={() => router.push({ pathname: '/(tabs)/post/[postId]', params: { postId: featured[0].id } })}
                    onAuthor={featured[0].author ? () => router.push({ pathname: '/(tabs)/user/[username]', params: { username: featured[0].author!.username } }) : undefined}
                    size="large"
                  />
                </View>
                {featured[1] ? (
                  <View style={{ flex: width >= 900 ? 1 : undefined, minWidth: 0 }}>
                    <FeaturedCard
                      post={featured[1]}
                      saved={saved.has(featured[1].id)}
                      liked={liked.has(featured[1].id)}
                      onSave={() => void onSave(featured[1])}
                      onLike={() => void onLike(featured[1])}
                      onOpen={() => router.push({ pathname: '/(tabs)/post/[postId]', params: { postId: featured[1].id } })}
                      onAuthor={featured[1].author ? () => router.push({ pathname: '/(tabs)/user/[username]', params: { username: featured[1].author!.username } }) : undefined}
                      size="small"
                    />
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 20 : 16, alignItems: wide ? 'flex-start' : 'stretch', marginTop: 20 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.h3, { color: colors.ink }]}>{category === 'All' ? 'Made for your mood' : category}</Text>
                  <Text style={[type.small, { color: colors.muted, marginTop: 2 }]}>
                    {filtered.length} {filtered.length === 1 ? 'moment' : 'moments'}
                    {search.trim() ? ` matching “${search.trim()}”` : ''}
                  </Text>
                </View>
                {isDemo ? <Text style={[type.tiny, { color: colors.mutedLight, fontSize: 8 }]}>Preview content</Text> : null}
              </View>

              {filtered.length === 0 ? (
                <ClayCard>
                  <EmptyState
                    icon="compass"
                    title="Nothing here just yet."
                    description={search.trim() ? 'Try a different search, topic or filter.' : 'New moments will appear as people share them.'}
                    action={<ClayButton label="Clear filters" variant="secondary" size="sm" onPress={resetFilters} />}
                  />
                </ClayCard>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                    {masonry.map((column, columnIndex) => (
                      <View key={columnIndex} style={{ flex: 1, gap: 12, minWidth: 0 }}>
                        {column.map((post, index) => (
                          <ExploreTile
                            key={post.id}
                            post={post}
                            tall={(index + columnIndex) % 3 !== 1}
                            saved={saved.has(post.id)}
                            liked={liked.has(post.id)}
                            onSave={() => void onSave(post)}
                            onLike={() => void onLike(post)}
                            onOpen={() => router.push({ pathname: '/(tabs)/post/[postId]', params: { postId: post.id } })}
                            onComment={() => router.push({ pathname: '/(tabs)/comments/[postId]', params: { postId: post.id } })}
                            onAuthor={post.author ? () => router.push({ pathname: '/(tabs)/user/[username]', params: { username: post.author!.username } }) : undefined}
                          />
                        ))}
                      </View>
                    ))}
                  </View>

                  <View style={{ alignItems: 'center', marginTop: 16, gap: 10 }}>
                    {hasMore ? (
                      <ClayButton
                        label={`Load more moments (${filtered.length - visible})`}
                        variant="secondary"
                        icon="chevron-down"
                        onPress={() => setVisible((current) => Math.min(current + PAGE_SIZE, filtered.length))}
                      />
                    ) : (
                      <Text style={[type.small, { color: colors.mutedLight }]}>You&apos;ve reached the end of this edit.</Text>
                    )}
                  </View>
                </>
              )}
            </View>

            {wide ? (
              <View style={{ width: 300, gap: 16 }}>
                <DiscoverySidebar
                  trending={trending}
                  people={suggestedPeople}
                  following={following}
                  onFollow={(person) => void onFollow(person)}
                  onTag={(tag) => {
                    setSearch(tag.replace('#', ''));
                    setCategory('All');
                  }}
                  onPlace={(place) => {
                    setSearch(place);
                    setCategory('All');
                  }}
                />
              </View>
            ) : null}
          </View>

          {!wide ? (
            <View style={{ marginTop: 20 }}>
              <DiscoverySidebar
                trending={trending}
                people={suggestedPeople}
                following={following}
                onFollow={(person) => void onFollow(person)}
                onTag={(tag) => {
                  setSearch(tag.replace('#', ''));
                  setCategory('All');
                }}
                onPlace={(place) => {
                  setSearch(place);
                  setCategory('All');
                }}
              />
            </View>
          ) : null}
        </>
      )}

      <Dialog
        visible={filtersOpen}
        title="Shape your explore feed"
        message="Choose how moments are ordered and which media to show. Topic filters above narrow the grid."
        cancelLabel="Close"
        onCancel={() => setFiltersOpen(false)}
      >
        <View style={{ gap: 16 }}>
          <View style={{ gap: 8 }}>
            <Text style={[type.overline, { color: colors.muted }]}>Sort by</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SORT_OPTIONS.map((item) => (
                <Chip key={item} label={item} active={sort === item} onPress={() => setSort(item)} />
              ))}
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={[type.overline, { color: colors.muted }]}>Media</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {MEDIA_OPTIONS.map((item) => (
                <Chip key={item} label={item} active={media === item} onPress={() => setMedia(item)} />
              ))}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <ClayButton label="Reset" variant="secondary" onPress={() => { resetFilters(); setFiltersOpen(false); }} />
            </View>
            <View style={{ flex: 1 }}>
              <ClayButton label="Show results" onPress={() => setFiltersOpen(false)} />
            </View>
          </View>
        </View>
      </Dialog>
    </ScrollView>
  );
}

function FeaturedCard({
  post,
  liked,
  saved,
  onLike,
  onSave,
  onOpen,
  onAuthor,
  size,
}: {
  post: FeedPost;
  liked: boolean;
  saved: boolean;
  onLike: () => void;
  onSave: () => void;
  onOpen: () => void;
  onAuthor?: () => void;
  size: 'large' | 'small';
}) {
  const { colors } = useTheme();
  const image = post.media_type === 'video' ? post.poster_url : post.media_url ?? post.poster_url;
  const height = size === 'large' ? 340 : 320;

  return (
    <ClayCard style={{ padding: 0, overflow: 'hidden' }} elevated="soft" radius={22}>
      <PressableScale onPress={onOpen} accessibilityLabel="Open featured post">
        <View style={{ height, backgroundColor: colors.surfaceDeep }}>
          {image ? (
            <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={260} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="image" size={26} color={colors.muted} />
            </View>
          )}
          <LinearGradient
            colors={['rgba(20,18,16,0.05)', 'rgba(20,18,16,0.18)', 'rgba(20,18,16,0.82)']}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          />
          <View style={{ position: 'absolute', top: 14, left: 14, flexDirection: 'row', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(245,241,233,0.92)', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5 }}>
              <Feather name="star" size={11} color="#20221F" />
              <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 9, color: '#20221F', letterSpacing: 0.4 }}>FEATURED</Text>
            </View>
            {post.media_type === 'video' ? (
              <View style={{ backgroundColor: 'rgba(20,18,16,0.5)', borderRadius: 9, padding: 6 }}>
                <Feather name="play" size={11} color="#F5F1E9" />
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={onSave}
            accessibilityLabel={saved ? 'Remove from saved' : 'Save post'}
            hitSlop={6}
            style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(20,18,16,0.42)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="bookmark" size={16} color={saved ? colors.accent : '#F5F1E9'} />
          </Pressable>

          <View style={{ position: 'absolute', left: 18, right: 18, bottom: 16, gap: 8 }}>
            {post.topic ? (
              <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(245,241,233,0.16)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(245,241,233,0.22)' }}>
                <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 9, color: '#F5F1E9', letterSpacing: 0.6 }}>{post.topic.toUpperCase()}</Text>
              </View>
            ) : null}
            <Text numberOfLines={2} style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: size === 'large' ? 20 : 17, lineHeight: size === 'large' ? 27 : 23, color: '#F5F1E9', letterSpacing: -0.3 }}>
              {post.caption || 'A little moment'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Pressable onPress={onAuthor} disabled={!onAuthor} accessibilityLabel="Open author profile" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <Avatar uri={post.author?.avatar_url} name={post.author?.display_name ?? 'TachiReel'} size={26} />
                <Text numberOfLines={1} style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11, color: 'rgba(245,241,233,0.92)' }}>
                  @{post.author?.username ?? 'tachireel'}
                </Text>
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 9, color: 'rgba(245,241,233,0.62)' }}>
                  {formatRelativeTime(post.created_at)}
                </Text>
              </Pressable>
              <Pressable onPress={onLike} accessibilityLabel={liked ? 'Unlike post' : 'Like post'} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Feather name="heart" size={14} color={liked ? colors.secondaryAccent : 'rgba(245,241,233,0.85)'} />
                <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 10, color: 'rgba(245,241,233,0.85)' }}>{post.like_count.toLocaleString()}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </PressableScale>
    </ClayCard>
  );
}

function ExploreTile({
  post,
  tall,
  saved,
  liked,
  onSave,
  onLike,
  onOpen,
  onComment,
  onAuthor,
}: {
  post: FeedPost;
  tall: boolean;
  saved: boolean;
  liked: boolean;
  onSave: () => void;
  onLike: () => void;
  onOpen: () => void;
  onComment: () => void;
  onAuthor?: () => void;
}) {
  const { colors, type, radii } = useTheme();
  const image = post.media_type === 'video' ? post.poster_url : post.media_url ?? post.poster_url;
  return (
    <ClayCard style={{ padding: 0, overflow: 'hidden' }} radius={18} elevated="soft">
      <PressableScale onPress={onOpen} accessibilityLabel="Open post">
        <View style={{ height: tall ? 248 : 180, backgroundColor: colors.surfaceDeep }}>
          {image ? (
            <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={240} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="image" size={22} color={colors.muted} />
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(20,18,16,0.66)']}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 96 }}
          />
          {post.media_type === 'video' ? (
            <View style={{ position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(20,18,16,0.55)', borderRadius: 8, padding: 6 }}>
              <Feather name="play" size={11} color="#F5F1E9" />
            </View>
          ) : null}
          <Pressable
            onPress={onSave}
            accessibilityLabel={saved ? 'Remove from saved' : 'Save post'}
            hitSlop={6}
            style={{ position: 'absolute', top: 9, right: 9, width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(20,18,16,0.42)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="bookmark" size={14} color={saved ? colors.accent : '#F5F1E9'} />
          </Pressable>
          <View style={{ position: 'absolute', left: 11, right: 11, bottom: 10, gap: 3 }}>
            {post.topic ? (
              <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 8, color: 'rgba(245,241,233,0.72)', letterSpacing: 0.7 }}>
                {post.topic.toUpperCase()}
              </Text>
            ) : null}
            <Text numberOfLines={2} style={[type.smallMedium, { color: '#F5F1E9', fontSize: 11.5, lineHeight: 15.5 }]}>
              {post.caption || 'A little moment'}
            </Text>
          </View>
        </View>
      </PressableScale>
      <View style={{ paddingHorizontal: 10, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <PressableScale onPress={onAuthor} disabled={!onAuthor} style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Avatar uri={post.author?.avatar_url} name={post.author?.display_name ?? 'TachiReel'} size={22} />
            <Text numberOfLines={1} style={[type.small, { color: colors.inkSoft, fontSize: 9.5, flex: 1 }]}>
              @{post.author?.username ?? 'tachireel'}
            </Text>
          </View>
        </PressableScale>
        <Pressable onPress={onLike} accessibilityLabel={liked ? 'Unlike post' : 'Like post'} hitSlop={5} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 3 }}>
          <Feather name="heart" size={14} color={liked ? colors.secondaryAccent : colors.muted} />
          <Text style={[type.small, { color: liked ? colors.secondaryAccent : colors.muted, fontSize: 9.5 }]}>
            {post.like_count > 999 ? `${(post.like_count / 1000).toFixed(1)}k` : post.like_count}
          </Text>
        </Pressable>
        <Pressable onPress={onComment} accessibilityLabel="Open comments" hitSlop={5} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 3 }}>
          <Feather name="message-circle" size={14} color={colors.muted} />
          <Text style={[type.small, { color: colors.muted, fontSize: 9.5 }]}>{post.comment_count}</Text>
        </Pressable>
      </View>
      <View style={{ height: 3, marginHorizontal: 10, marginBottom: 8, borderRadius: radii.pill, backgroundColor: colors.accentSoft, overflow: 'hidden' }}>
        <View style={{ width: `${Math.min(100, (post.like_count / 40))}%`, height: '100%', backgroundColor: colors.accent }} />
      </View>
    </ClayCard>
  );
}

function PersonRow({
  person,
  following,
  onOpen,
  onFollow,
  compact,
}: {
  person: Person;
  following: boolean;
  onOpen: () => void;
  onFollow: () => void;
  compact: boolean;
}) {
  const { colors, type, radii } = useTheme();
  return (
    <ClayCard style={{ padding: 12, width: compact ? undefined : '100%', minWidth: compact ? 250 : undefined, flex: compact ? 1 : undefined }} elevated="soft">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <PressableScale onPress={onOpen} accessibilityLabel={`Open ${person.display_name}'s profile`}>
          <Avatar uri={person.avatar_url} name={person.display_name} size={42} />
        </PressableScale>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[type.smallMedium, { color: colors.ink }]}>{person.display_name}</Text>
          <Text numberOfLines={1} style={[type.small, { color: colors.muted, fontSize: 10 }]}>@{person.username}</Text>
          {person.bio ? (
            <Text numberOfLines={1} style={[type.small, { color: colors.muted, fontSize: 9, marginTop: 2 }]}>{person.bio}</Text>
          ) : null}
        </View>
        <Pressable
          onPress={onFollow}
          accessibilityLabel={following ? `Unfollow ${person.display_name}` : `Follow ${person.display_name}`}
          style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: radii.control, backgroundColor: following ? colors.backgroundAlt : colors.accent, borderWidth: 1, borderColor: following ? colors.line : colors.accent }}
        >
          <Text style={[type.buttonSmall, { color: following ? colors.inkSoft : colors.accentContrast, fontSize: 10 }]}>
            {following ? 'Following' : 'Follow'}
          </Text>
        </Pressable>
      </View>
    </ClayCard>
  );
}

function DiscoverySidebar({
  trending,
  people,
  following,
  onFollow,
  onTag,
  onPlace,
}: {
  trending: [string, number][];
  people: Person[];
  following: Set<string>;
  onFollow: (person: Person) => void;
  onTag: (tag: string) => void;
  onPlace: (place: string) => void;
}) {
  const { colors, type, radii } = useTheme();
  return (
    <View style={{ gap: 16 }}>
      <ClayCard style={{ padding: 18 }} elevated="soft">
        <SectionHeader title="Trending now" subtitle="What the feed is talking about" />
        {trending.length === 0 ? (
          <Text style={[type.small, { color: colors.muted }]}>Hashtags will appear as people share.</Text>
        ) : (
          <View style={{ gap: 4 }}>
            {trending.map(([tag, count], index) => (
              <PressableScale key={tag} onPress={() => onTag(tag)} accessibilityLabel={`Search ${tag}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 }}>
                  <Text style={[type.small, { color: colors.mutedLight, width: 16, fontSize: 10 }]}>0{index + 1}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[type.smallMedium, { color: colors.ink }]}>{tag}</Text>
                    <Text style={[type.small, { color: colors.muted, fontSize: 9 }]}>{count} {count === 1 ? 'moment' : 'moments'}</Text>
                  </View>
                  <Feather name="trending-up" size={13} color={colors.accent} />
                </View>
              </PressableScale>
            ))}
          </View>
        )}
      </ClayCard>

      <ClayCard style={{ padding: 18 }} elevated="soft">
        <SectionHeader title="People to meet" subtitle="A few kind corners" />
        {people.length === 0 ? (
          <Text style={[type.small, { color: colors.muted }]}>You&apos;re following everyone we could find right now.</Text>
        ) : (
          <View style={{ gap: 13 }}>
            {people.map((person) => (
              <View key={person.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <PressableScale onPress={() => router.push({ pathname: '/(tabs)/user/[username]', params: { username: person.username } })}>
                  <Avatar uri={person.avatar_url} name={person.display_name} size={36} />
                </PressableScale>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[type.smallMedium, { color: colors.ink }]}>{person.display_name}</Text>
                  <Text numberOfLines={1} style={[type.small, { color: colors.muted, fontSize: 9.5 }]}>@{person.username}</Text>
                </View>
                <Pressable
                  onPress={() => onFollow(person)}
                  accessibilityLabel={following.has(person.id) ? `Unfollow ${person.display_name}` : `Follow ${person.display_name}`}
                  style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.control, backgroundColor: following.has(person.id) ? colors.backgroundAlt : colors.accentSoft, borderWidth: 1, borderColor: following.has(person.id) ? colors.line : colors.accentSoft }}
                >
                  <Text style={[type.buttonSmall, { color: following.has(person.id) ? colors.muted : colors.accent, fontSize: 9.5 }]}>
                    {following.has(person.id) ? 'Following' : 'Follow'}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ClayCard>

      <ClayCard style={{ padding: 18 }} elevated="soft">
        <SectionHeader title="Places & moods" subtitle="Search a feeling" />
        <View style={{ gap: 8 }}>
          {PLACES.map((place) => (
            <PressableScale key={place.name} onPress={() => onPlace(place.name)} accessibilityLabel={`Explore ${place.name}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 9, borderRadius: radii.control, backgroundColor: colors.backgroundAlt }}>
                <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={place.icon} size={14} color={colors.accent} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.smallMedium, { color: colors.ink }]}>{place.name}</Text>
                  <Text numberOfLines={1} style={[type.small, { color: colors.muted, fontSize: 9 }]}>{place.note}</Text>
                </View>
                <Feather name="arrow-up-right" size={13} color={colors.muted} />
              </View>
            </PressableScale>
          ))}
        </View>
      </ClayCard>

      <ClayCard style={{ padding: 20, backgroundColor: colors.accentSoft }} elevated="soft">
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Feather name="feather" size={17} color={colors.accent} />
        </View>
        <Text style={[type.h3, { color: colors.ink }]}>Add your corner.</Text>
        <Text style={[type.small, { color: colors.inkSoft, marginTop: 5, lineHeight: 18 }]}>
          A photo, a thought, a place worth remembering. The feed is better with you in it.
        </Text>
        <View style={{ marginTop: 14 }}>
          <ClayButton label="Share a moment" size="sm" icon="plus" onPress={() => router.push('/(tabs)/create')} />
        </View>
      </ClayCard>
    </View>
  );
}

export function generateMetadata() {
  return privatePageMetadata({
    title: "Explore",
    description: "Search people, captions, hashtags and places on TachiReel.",
    path: "/discover",
  });
}
