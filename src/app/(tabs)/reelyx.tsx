import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Avatar,
  Badge,
  ClayButton,
  ClayCard,
  Dialog,
  EmptyState,
  LoadingState,
  useToast,
  type IconName,
} from '../../components/ui';
import { ReelyxCommentsSheet } from '../../components/ReelyxCommentsSheet';
import { DEMO_REELS, isDemoMode } from '../../lib/demo-data';
import {
  fetchReelyxCreatorStats,
  fetchReelyxFollowingIds,
  fetchReelyxLikedIds,
  fetchReelyxPage,
  fetchReelyxSavedIds,
  fetchReelyxVideoById,
  followReelyxCreator,
  toggleReelyxLike,
  toggleReelyxSave,
  unfollowReelyxCreator,
  type ReelyxAuthor,
  type ReelyxCreatorStats,
  type ReelyxVideo,
} from '../../lib/reelyx';
import { postLink, shareLink } from '../../lib/share';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/theme';

const NAV_COOLDOWN = 420;

function formatFollowers(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'New creator';
  if (value < 1000) return `${value} followers`;
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}k followers`;
}

export default function ReelyxScreen() {
  const { type, colors, reduceMotion } = useTheme();
  const { width, height } = useWindowDimensions();
  const { userId } = useSession();
  const params = useLocalSearchParams<{ id?: string }>();
  const initialIdRef = useRef(params.id);
  const insets = useSafeAreaInsets();
  const { show } = useToast();
  const compact = width < 820;

  const [videos, setVideos] = useState<ReelyxVideo[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [creatorStats, setCreatorStats] = useState<Record<string, ReelyxCreatorStats>>({});
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [unfollowTarget, setUnfollowTarget] = useState<ReelyxAuthor | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [hovered, setHovered] = useState(false);

  const lastNavRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const goRef = useRef<(direction: 1 | -1) => void>(() => {});
  const videosRef = useRef(videos);
  const rootRef = useRef<View | null>(null);
  const [anim] = useState(() => new Animated.Value(1));

  const currentIndex = useMemo(() => Math.max(0, videos.findIndex((video) => video.id === currentId)), [videos, currentId]);
  const activeVideo = videos[currentIndex] ?? null;
  const isFirst = currentIndex <= 0;
  const isLast = videos.length === 0 || currentIndex >= videos.length - 1;

  useEffect(() => {
    videosRef.current = videos;
  }, [videos]);

  const hydrateEngagement = useCallback(async (items: ReelyxVideo[], client: SupabaseClient | null, viewerId: string | null) => {
    const ids = items.map((item) => item.id);
    const authorIds = items.map((item) => item.author.id);
    if (isDemoMode || !client || !viewerId) {
      const demoIds = new Set(ids);
      setLiked((previous) => new Set([...previous, ...DEMO_REELS.filter((reel) => demoIds.has(reel.id) && reel.liked).map((reel) => reel.id)]));
      setSaved((previous) => new Set([...previous, ...DEMO_REELS.filter((reel) => demoIds.has(reel.id) && reel.saved).map((reel) => reel.id)]));
      setFollowed((previous) => new Set([...previous, ...DEMO_REELS.filter((reel) => demoIds.has(reel.id) && reel.author.id === 'p-omar').map((reel) => reel.author.id as string)]));
      setCreatorStats(await fetchReelyxCreatorStats(null, authorIds));
      return;
    }

    const [likedIds, savedIds, followingIds, stats] = await Promise.all([
      fetchReelyxLikedIds(client, viewerId, ids),
      fetchReelyxSavedIds(client, viewerId, ids),
      authorIds.some(Boolean) ? fetchReelyxFollowingIds(client, viewerId) : Promise.resolve([]),
      fetchReelyxCreatorStats(client, authorIds),
    ]);
    setLiked((previous) => new Set([...previous, ...likedIds]));
    setSaved((previous) => new Set([...previous, ...savedIds]));
    setFollowed((previous) => new Set([...previous, ...followingIds]));
    setCreatorStats((previous) => ({ ...previous, ...stats }));
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      setLoading(true);
      setError(null);
      setVideos([]);
      setCurrentId(null);
      setNextOffset(0);
      setLiked(new Set());
      setSaved(new Set());
      setFollowed(new Set());
      setCreatorStats({});
      try {
        const client = isDemoMode ? null : supabase;
        if (!isDemoMode && !client) throw new Error('Connect your Supabase project to watch Reelyx.');
        if (!isDemoMode && !userId) throw new Error('Log in to watch Reelyx.');

        const page = await fetchReelyxPage({ client, offset: 0 });
        let items = page.items;
        let selectedId = items[0]?.id ?? null;
        const requestedId = initialIdRef.current;
        if (requestedId) {
          let exact = items.find((item) => item.id === requestedId) ?? null;
          if (!exact) exact = await fetchReelyxVideoById({ client, id: requestedId });
          if (exact) {
            items = [exact, ...items.filter((item) => item.id !== exact?.id)];
            selectedId = exact.id;
          }
        }
        if (!active) return;
        setVideos(items);
        setCurrentId(selectedId);
        setNextOffset(page.nextOffset);
        await hydrateEngagement(items, client, userId);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load Reelyx.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [hydrateEngagement, userId]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || nextOffset === null) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const client = isDemoMode ? null : supabase;
      const page = await fetchReelyxPage({ client, offset: nextOffset });
      setVideos((previous) => {
        const known = new Set(previous.map((item) => item.id));
        return [...previous, ...page.items.filter((item) => !known.has(item.id))];
      });
      setNextOffset(page.nextOffset);
      if (!isDemoMode && supabase && userId) await hydrateEngagement(page.items, supabase, userId);
    } catch {
      setNextOffset(null);
      show('Could not load more Reelyx right now.', 'error');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hydrateEngagement, nextOffset, show, userId]);

  const go = useCallback(
    (direction: 1 | -1) => {
      const list = videosRef.current;
      if (list.length === 0 || commentsOpen) return;
      const index = list.findIndex((item) => item.id === currentId);
      const target = index + direction;
      if (target < 0 || target >= list.length + (nextOffset !== null ? 1 : 0)) return;

      const now = Date.now();
      if (now - lastNavRef.current < NAV_COOLDOWN) return;
      lastNavRef.current = now;
      setPaused(false);
      setCommentsOpen(false);

      if (target >= list.length) {
        void loadMore().then(() => {
          const next = videosRef.current[target];
          if (next) setCurrentId(next.id);
        });
        return;
      }
      setCurrentId(list[target].id);
    },
    [commentsOpen, currentId, loadMore, nextOffset],
  );

  useEffect(() => {
    goRef.current = go;
  }, [go]);

  useEffect(() => {
    if (currentIndex >= videos.length - 2 && nextOffset !== null && !loadingMore) queueMicrotask(() => void loadMore());
  }, [currentIndex, videos.length, nextOffset, loadingMore, loadMore]);

  // Keep the address bar video-specific without re-running the loader.
  useEffect(() => {
    if (!currentId || currentId === initialIdRef.current) return;
    router.replace({ pathname: '/(tabs)/reelyx', params: { id: currentId } });
  }, [currentId]);

  // Reset playback and animate the transition when the selected video changes.
  useEffect(() => {
    if (reduceMotion) {
      anim.setValue(1);
      return;
    }
    anim.setValue(0);
    const timing = Animated.timing(anim, {
      toValue: 1,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    timing.start();
    return () => timing.stop();
  }, [anim, currentId, reduceMotion]);

  // Preload only the next clip's metadata; never download the whole feed.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const next = videos[currentIndex + 1]?.video;
    if (!next) return;
    const element = document.createElement('video');
    element.preload = 'metadata';
    element.muted = true;
    element.style.display = 'none';
    element.src = next;
    document.body.appendChild(element);
    return () => {
      element.pause();
      element.removeAttribute('src');
      element.load();
      element.remove();
    };
  }, [currentIndex, videos]);

  // Wheel navigation is scoped to the Reelyx area and throttled.
  useEffect(() => {
    if (Platform.OS !== 'web' || !hovered || commentsOpen) return;
    let accumulator = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (Math.sign(event.deltaY) !== Math.sign(accumulator)) accumulator = 0;
      accumulator += event.deltaY;
      if (Math.abs(accumulator) < 42) return;
      goRef.current(accumulator > 0 ? 1 : -1);
      accumulator = 0;
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [commentsOpen, hovered]);

  useEffect(() => {
    if (Platform.OS !== 'web' || commentsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'button' || tag === 'a' || target?.isContentEditable) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        goRef.current(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        goRef.current(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commentsOpen]);

  // Mobile-web swipe navigation (native uses PanResponder below).
  useEffect(() => {
    if (Platform.OS !== 'web' || !compact || commentsOpen) return;
    const node = rootRef.current as unknown as HTMLElement | null;
    if (!node) return;
    let startY = 0;
    const onStart = (event: TouchEvent) => {
      startY = event.touches[0]?.clientY ?? 0;
    };
    const onEnd = (event: TouchEvent) => {
      const delta = (event.changedTouches[0]?.clientY ?? startY) - startY;
      if (Math.abs(delta) < 56) return;
      goRef.current(delta < 0 ? 1 : -1);
    };
    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchend', onEnd);
    };
  }, [commentsOpen, compact]);

  // eslint-disable-next-line react-hooks/refs
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 16,
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy < -50) goRef.current(1);
      else if (gesture.dy > 50) goRef.current(-1);
    },
  });

  const toggleLike = async () => {
    const video = activeVideo;
    if (!video) return;
    const wasLiked = liked.has(video.id);
    const delta = wasLiked ? -1 : 1;
    setLiked((previous) => {
      const next = new Set(previous);
      if (wasLiked) next.delete(video.id);
      else next.add(video.id);
      return next;
    });
    setVideos((items) => items.map((item) => item.id === video.id ? { ...item, like_count: Math.max(0, item.like_count + delta) } : item));
    if (isDemoMode) return;
    if (!supabase || !userId) return;
    try {
      await toggleReelyxLike(supabase, userId, video.id, !wasLiked);
    } catch {
      setLiked((previous) => {
        const next = new Set(previous);
        if (wasLiked) next.add(video.id);
        else next.delete(video.id);
        return next;
      });
      setVideos((items) => items.map((item) => item.id === video.id ? { ...item, like_count: Math.max(0, item.like_count - delta) } : item));
      show('Could not save that like.', 'error');
    }
  };

  const toggleSave = async () => {
    const video = activeVideo;
    if (!video) return;
    const wasSaved = saved.has(video.id);
    setSaved((previous) => {
      const next = new Set(previous);
      if (wasSaved) next.delete(video.id);
      else next.add(video.id);
      return next;
    });
    if (isDemoMode) {
      show(wasSaved ? 'Removed from saved.' : 'Saved for later.', 'success');
      return;
    }
    if (!supabase || !userId) return;
    try {
      await toggleReelyxSave(supabase, userId, video.id, !wasSaved);
      show(wasSaved ? 'Removed from saved.' : 'Saved for later.', 'success');
    } catch (saveError) {
      setSaved((previous) => {
        const next = new Set(previous);
        if (wasSaved) next.add(video.id);
        else next.delete(video.id);
        return next;
      });
      show(saveError instanceof Error ? saveError.message : 'Could not update saved Reelyx.', 'error');
    }
  };

  const applyFollow = async (creator: ReelyxAuthor, next: boolean) => {
    const creatorId = creator.id;
    if (!creatorId) return;
    if (creatorId === userId) {
      show('You cannot follow yourself.', 'error');
      setUnfollowTarget(null);
      return;
    }
    setFollowBusy(true);
    setFollowed((previous) => {
      const updated = new Set(previous);
      if (next) updated.add(creatorId);
      else updated.delete(creatorId);
      return updated;
    });
    setCreatorStats((previous) => {
      const stat = previous[creatorId] ?? { follower_count: 0, following_count: 0 };
      return {
        ...previous,
        [creatorId]: { ...stat, follower_count: Math.max(0, stat.follower_count + (next ? 1 : -1)) },
      };
    });
    try {
      if (!isDemoMode && supabase && userId) {
        if (next) await followReelyxCreator(supabase, userId, creatorId);
        else await unfollowReelyxCreator(supabase, userId, creatorId);
      }
      setUnfollowTarget(null);
      show(next ? `Following ${creator.display_name}.` : `Unfollowed ${creator.display_name}.`, 'success');
    } catch (followError) {
      setFollowed((previous) => {
        const updated = new Set(previous);
        if (next) updated.delete(creatorId);
        else updated.add(creatorId);
        return updated;
      });
      setCreatorStats((previous) => {
        const stat = previous[creatorId] ?? { follower_count: 0, following_count: 0 };
        return {
          ...previous,
          [creatorId]: { ...stat, follower_count: Math.max(0, stat.follower_count + (next ? -1 : 1)) },
        };
      });
      show(followError instanceof Error ? followError.message : 'Could not update this follow.', 'error');
    } finally {
      setFollowBusy(false);
    }
  };

  const onFollowPress = () => {
    const creator = activeVideo?.author;
    if (!creator?.id) return;
    if (creator.id === userId) {
      show('You cannot follow yourself.', 'error');
      return;
    }
    if (followed.has(creator.id)) setUnfollowTarget(creator);
    else void applyFollow(creator, true);
  };

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : 28, 0] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 1 : 0.975, 1] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 1 : 0, 1] });

  const introWidth = width < 940 ? 0 : width < 1140 ? 220 : 300;
  const actionRailWidth = width < 1140 ? 56 : 64;
  const stageWidth = compact
    ? width
    : Math.max(280, Math.min(430, height * 0.47, width - 252 - introWidth - actionRailWidth - 84));
  const stageHeight = compact ? height : Math.min(height - 140, 760);

  if (loading && videos.length === 0) {
    return <View style={{ flex: 1, backgroundColor: colors.background }}><LoadingState label="Finding your Reelyx…" /></View>;
  }

  if (error && videos.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ClayCard style={{ padding: 12, width: '100%', maxWidth: 520 }}>
          <EmptyState icon="alert-circle" tone="peach" title="Reelyx is taking a break." description={error} />
        </ClayCard>
      </View>
    );
  }

  if (videos.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ClayCard style={{ padding: 12, width: '100%', maxWidth: 520 }}>
          <EmptyState
            icon="film"
            title="No Reelyx just yet."
            description={isDemoMode ? 'Video moments will appear here once people share them. Try creating one yourself.' : 'Share a short video and it will appear here after review.'}
            action={<ClayButton label="Create a Reelyx" icon="video" onPress={() => router.push({ pathname: '/(tabs)/create', params: { type: 'video' } })} />}
          />
        </ClayCard>
      </View>
    );
  }

  const actions = activeVideo ? (
    <ReelActions
      video={activeVideo}
      liked={liked.has(activeVideo.id)}
      saved={saved.has(activeVideo.id)}
      onLike={() => void toggleLike()}
      onSave={() => void toggleSave()}
      onComment={() => setCommentsOpen(true)}
      onShare={() => void shareLink({ url: postLink(activeVideo.id), message: activeVideo.caption })}
      onMedia={compact}
    />
  ) : null;

  return (
    <View
      ref={rootRef as never}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: compact ? 'none' : 'auto',
      } as never}
      {...(compact && Platform.OS !== 'web' ? panResponder.panHandlers : {})}
    >
      {compact ? (
        <View style={{ position: 'absolute', top: insets.top + 10, left: 14, right: 14, zIndex: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            onPress={() => router.push('/(tabs)')}
            accessibilityLabel="Back to home"
            style={{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mediaOverlay, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }}
          >
            <Feather name="chevron-left" size={21} color="#F5F1E9" />
          </Pressable>
          <View style={{ backgroundColor: colors.mediaOverlay, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }}>
            <Text style={[type.tiny, { color: colors.white, fontSize: 8 }]}>REELYX · swipe up</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      ) : null}

      {!compact ? (
        <View style={{ width: '100%', maxWidth: 1180, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          {introWidth > 0 ? (
            <View style={{ width: introWidth, gap: 14, alignItems: 'flex-start' }}>
              <Badge label="REELYX · short videos" tone="sage" />
              <Text style={{ fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 42, lineHeight: 48, letterSpacing: -1.8, color: colors.ink }}>Reelyx.</Text>
              <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, lineHeight: 22, color: colors.muted }}>
                Small stories in motion. Watch a moment, then keep scrolling — or create your own.
              </Text>
              <ClayButton label="Create a Reelyx" size="sm" icon="video" onPress={() => router.push({ pathname: '/(tabs)/create', params: { type: 'video' } })} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                <RoundControl icon="chevron-up" label="Previous Reelyx" onPress={() => go(-1)} disabled={isFirst} />
                <RoundControl icon="chevron-down" label="Next Reelyx" onPress={() => go(1)} disabled={isLast && nextOffset === null} />
                <Text style={[type.small, { color: colors.mutedLight, fontSize: 10 }]}>
                  {currentIndex + 1} of {videos.length}
                </Text>
              </View>
              {loadingMore ? <Text style={[type.small, { color: colors.accent, fontSize: 10 }]}>Loading more Reelyx…</Text> : null}
            </View>
          ) : null}

          <Animated.View
            style={{
              width: stageWidth,
              height: stageHeight,
              borderRadius: 30,
              overflow: 'hidden',
              backgroundColor: colors.surfaceDeep,
              borderWidth: 1,
              borderColor: colors.line,
              opacity,
              transform: [{ translateY }, { scale }],
            }}
          >
            {activeVideo ? (
              <ReelStage
                key={activeVideo.id}
                reel={activeVideo}
                paused={paused}
                muted={muted}
                onTogglePause={() => setPaused((value) => !value)}
                onToggleMute={() => setMuted((value) => !value)}
                onDoubleLike={() => void toggleLike()}
              />
            ) : null}
            {activeVideo ? (
              <ReelOverlay
                reel={activeVideo}
                followed={Boolean(activeVideo.author.id && followed.has(activeVideo.author.id))}
                isSelf={Boolean(activeVideo.author.id && activeVideo.author.id === userId)}
                followerCount={activeVideo.author.id ? creatorStats[activeVideo.author.id]?.follower_count ?? 0 : 0}
                onFollow={onFollowPress}
                compact={false}
              />
            ) : null}
          </Animated.View>

          <View style={{ width: actionRailWidth, gap: 16, alignItems: 'center' }}>{actions}</View>
        </View>
      ) : (
        <View style={{ width: stageWidth, height: stageHeight }}>
          <Animated.View
            style={{
              flex: 1,
              borderRadius: 0,
              overflow: 'hidden',
              backgroundColor: colors.surfaceDeep,
              opacity,
              transform: [{ translateY }, { scale }],
            }}
          >
            {activeVideo ? (
              <ReelStage
                key={activeVideo.id}
                reel={activeVideo}
                paused={paused}
                muted={muted}
                onTogglePause={() => setPaused((value) => !value)}
                onToggleMute={() => setMuted((value) => !value)}
                onDoubleLike={() => void toggleLike()}
              />
            ) : null}
            {activeVideo ? (
              <ReelOverlay
                reel={activeVideo}
                followed={Boolean(activeVideo.author.id && followed.has(activeVideo.author.id))}
                isSelf={Boolean(activeVideo.author.id && activeVideo.author.id === userId)}
                followerCount={activeVideo.author.id ? creatorStats[activeVideo.author.id]?.follower_count ?? 0 : 0}
                onFollow={onFollowPress}
                compact
              />
            ) : null}
          </Animated.View>
          <View style={{ position: 'absolute', right: 14, bottom: 110, gap: 16, alignItems: 'center' }}>{actions}</View>
          {loadingMore ? (
            <View style={{ position: 'absolute', top: insets.top + 62, alignSelf: 'center', backgroundColor: colors.mediaOverlay, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 }}>
              <Text style={[type.small, { color: colors.white, fontSize: 10 }]}>Loading more Reelyx…</Text>
            </View>
          ) : null}
        </View>
      )}

      <Dialog
        visible={Boolean(unfollowTarget)}
        title={`Unfollow ${unfollowTarget?.display_name ?? 'creator'}?`}
        message="You will stop seeing their posts and Reelyx in your Following feed."
        confirmLabel={followBusy ? 'Unfollowing…' : 'Unfollow'}
        cancelLabel="Keep following"
        destructive
        loading={followBusy}
        onConfirm={() => unfollowTarget && void applyFollow(unfollowTarget, false)}
        onCancel={() => setUnfollowTarget(null)}
      />

      <ReelyxCommentsSheet
        visible={commentsOpen}
        video={activeVideo}
        onClose={() => setCommentsOpen(false)}
        onCommentAdded={(videoId) => {
          setVideos((items) => items.map((item) => item.id === videoId ? { ...item, comment_count: item.comment_count + 1 } : item));
        }}
      />
    </View>
  );
}

type FloatingHeart = { id: number; x: number; y: number; value: Animated.Value };

function ReelStage({
  reel,
  paused,
  muted,
  onTogglePause,
  onToggleMute,
  onDoubleLike,
}: {
  reel: ReelyxVideo;
  paused: boolean;
  muted: boolean;
  onTogglePause: () => void;
  onToggleMute: () => void;
  onDoubleLike: () => void;
}) {
  const { colors, reduceMotion } = useTheme();
  const [hearts, setHearts] = useState<FloatingHeart[]>([]);
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const player = useVideoPlayer(reel.video, (instance) => {
    instance.loop = true;
    instance.muted = muted;
  });

  useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [paused, player]);

  useEffect(() => {
    // expo-video players are mutable native objects, not React state.
    // eslint-disable-next-line react-hooks/immutability
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => () => {
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
  }, []);

  const spawnHeart = (x: number, y: number) => {
    const heart: FloatingHeart = { id: Date.now() + Math.random(), x, y, value: new Animated.Value(0) };
    setHearts((previous) => [...previous, heart]);
    Animated.sequence([
      Animated.timing(heart.value, { toValue: 0.45, duration: reduceMotion ? 60 : 180, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(heart.value, { toValue: 0.78, duration: reduceMotion ? 60 : 180, easing: Easing.out(Easing.back(1.6)), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(heart.value, { toValue: 1, duration: reduceMotion ? 120 : 420, easing: Easing.in(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
    ]).start(() => setHearts((previous) => previous.filter((item) => item.id !== heart.id)));
  };

  const handleTap = (event: { nativeEvent?: Record<string, number>; currentTarget?: unknown }) => {
    const native = event?.nativeEvent ?? {};
    const element = event?.currentTarget as HTMLElement | undefined;
    const rect = typeof element?.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null;
    const rawX = native.locationX ?? native.offsetX ?? native.pageX ?? 0;
    const rawY = native.locationY ?? native.offsetY ?? native.pageY ?? 0;
    const x = rect && native.clientX !== undefined ? native.clientX - rect.left : rawX;
    const y = rect && native.clientY !== undefined ? native.clientY - rect.top : rawY;
    const now = Date.now();

    if (now - lastTapRef.current < 320) {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      lastTapRef.current = 0;
      spawnHeart(x, y);
      onDoubleLike();
      return;
    }
    lastTapRef.current = now;
    tapTimerRef.current = setTimeout(() => {
      onTogglePause();
      tapTimerRef.current = null;
    }, 300);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceDeep }}>
      {reel.poster ? (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: colors.surfaceDeep }} />
      ) : null}
      <VideoView player={player} style={{ flex: 1 }} contentFit="cover" nativeControls={false} surfaceType="textureView" />
      <Pressable
        style={{ position: 'absolute', inset: 0 }}
        onPress={handleTap as never}
        accessibilityLabel={paused ? 'Play Reelyx' : 'Pause Reelyx'}
      />
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(12,10,15,0.10)' }} />
      {paused ? (
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 62, height: 62, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="play" size={26} color="#20221F" />
          </View>
        </View>
      ) : null}
      {hearts.map((heart) => {
        const heartScale = heart.value.interpolate({ inputRange: [0, 0.45, 0.78, 1], outputRange: [0.3, 1.18, 1, 1.24] });
        const heartOpacity = heart.value.interpolate({ inputRange: [0, 0.16, 0.78, 1], outputRange: [0, 1, 1, 0] });
        const heartY = heart.value.interpolate({ inputRange: [0, 1], outputRange: [0, reduceMotion ? 0 : -78] });
        return (
          <Animated.View key={heart.id} pointerEvents="none" style={{ position: 'absolute', left: heart.x - 44, top: heart.y - 44, opacity: heartOpacity, transform: [{ translateY: heartY }, { scale: heartScale }] }}>
            <Feather name="heart" size={88} color={colors.secondaryAccent} />
          </Animated.View>
        );
      })}
      <Pressable
        onPress={onToggleMute}
        accessibilityLabel={muted ? 'Unmute Reelyx' : 'Mute Reelyx'}
        style={{ position: 'absolute', right: 14, top: 14, width: 38, height: 38, borderRadius: 13, backgroundColor: colors.mediaOverlay, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }}
      >
        <Feather name={muted ? 'volume-x' : 'volume-2'} size={17} color="#F5F1E9" />
      </Pressable>
    </View>
  );
}

function ReelOverlay({
  reel,
  followed,
  isSelf,
  followerCount,
  onFollow,
  compact,
}: {
  reel: ReelyxVideo;
  followed: boolean;
  isSelf: boolean;
  followerCount: number;
  onFollow: () => void;
  compact: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View style={{ position: 'absolute', left: 16, right: compact ? 78 : 16, bottom: compact ? insets.bottom + 24 : 20, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Avatar uri={reel.author.avatar_url} name={reel.author.display_name} size={38} ring />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: colors.white }} numberOfLines={1}>{reel.author.display_name}</Text>
          <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 10, color: 'rgba(255,255,255,0.74)' }} numberOfLines={1}>
            @{reel.author.username} · {formatFollowers(followerCount)}
          </Text>
        </View>
        {!isSelf ? (
          <Pressable
            onPress={onFollow}
            accessibilityLabel={followed ? 'Following creator' : `Follow ${reel.author.display_name}`}
            style={{
              borderWidth: 1,
              borderColor: followed ? colors.accent : 'rgba(255,255,255,0.5)',
              backgroundColor: followed ? colors.accent : 'rgba(0,0,0,0.28)',
              borderRadius: 10,
              paddingHorizontal: 11,
              paddingVertical: 6,
            }}
          >
            <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10, color: colors.white }}>{followed ? 'Following' : 'Follow'}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12.5, lineHeight: 18, color: colors.white }} numberOfLines={3}>{reel.caption}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Feather name="music" size={11} color="rgba(255,255,255,0.82)" />
        <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 10, color: 'rgba(255,255,255,0.82)' }} numberOfLines={1}>{reel.audio}</Text>
      </View>
    </View>
  );
}

function ReelActions({
  video,
  liked,
  saved,
  onLike,
  onSave,
  onComment,
  onShare,
  onMedia = false,
}: {
  video: ReelyxVideo;
  liked: boolean;
  saved: boolean;
  onLike: () => void;
  onSave: () => void;
  onComment: () => void;
  onShare: () => void;
  onMedia?: boolean;
}) {
  return (
    <>
      <LikeAction liked={liked} count={video.like_count} onPress={onLike} onMedia={onMedia} />
      <IconAction icon="message-circle" label="Comments" onPress={onComment} count={video.comment_count} onMedia={onMedia} />
      <IconAction icon="send" label="Share" onPress={onShare} onMedia={onMedia} />
      <IconAction icon="bookmark" label={saved ? 'Unsave' : 'Save'} onPress={onSave} active={saved} onMedia={onMedia} />
    </>
  );
}

function AnimatedCount({ value, color }: { value: number; color: string }) {
  const { reduceMotion } = useTheme();
  const [animation] = useState(() => new Animated.Value(value));
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const listenerId = animation.addListener(({ value: current }) => setDisplay(Math.round(current)));
    if (reduceMotion) {
      animation.setValue(value);
    } else {
      Animated.timing(animation, {
        toValue: value,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
    return () => {
      animation.stopAnimation();
      animation.removeListener(listenerId);
    };
  }, [animation, reduceMotion, value]);

  return <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 9, color }}>{display.toLocaleString()}</Text>;
}

function LikeAction({ liked, count, onPress, onMedia = false }: { liked: boolean; count: number; onPress: () => void; onMedia?: boolean }) {
  const { colors, reduceMotion } = useTheme();
  const [scale] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reduceMotion) {
      scale.setValue(1);
      return;
    }
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.35, duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 180, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [liked, reduceMotion, scale]);

  return (
    <Pressable onPress={onPress} accessibilityLabel={liked ? 'Unlike Reelyx' : 'Like Reelyx'} style={{ alignItems: 'center', gap: 4 }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 16,
            backgroundColor: liked ? colors.secondaryAccent : onMedia ? 'rgba(255,255,255,0.1)' : colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: liked ? colors.secondaryAccent : onMedia ? 'rgba(255,255,255,0.14)' : colors.line,
          }}
        >
          <Feather name="heart" size={21} color={liked ? colors.accentContrast : onMedia ? colors.white : colors.inkSoft} />
        </View>
      </Animated.View>
      <AnimatedCount value={count} color={onMedia ? 'rgba(255,255,255,0.82)' : colors.muted} />
    </Pressable>
  );
}

function IconAction({
  icon,
  label,
  onPress,
  active = false,
  count,
  onMedia = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  count?: number;
  onMedia?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={{ alignItems: 'center', gap: 4 }}>
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 16,
          backgroundColor: active ? colors.accent : onMedia ? 'rgba(255,255,255,0.1)' : colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: active ? colors.accentHover : onMedia ? 'rgba(255,255,255,0.14)' : colors.line,
        }}
      >
        <Feather name={icon} size={21} color={active ? colors.accentContrast : onMedia ? colors.white : colors.inkSoft} />
      </View>
      <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 9, color: onMedia ? 'rgba(255,255,255,0.82)' : colors.muted }}>
        {count !== undefined ? count.toLocaleString() : label}
      </Text>
    </Pressable>
  );
}

function RoundControl({ icon, label, onPress, disabled = false }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{
        width: 42,
        height: 42,
        borderRadius: 15,
        backgroundColor: disabled ? colors.disabled : colors.backgroundAlt,
        borderWidth: 1,
        borderColor: disabled ? colors.line : colors.lineStrong,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Feather name={icon} size={17} color={disabled ? colors.disabledText : colors.accent} />
    </Pressable>
  );
}
