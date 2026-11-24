import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ClayCard, ErrorState, LoadingState, Notice } from '../../../components/ui';
import { PostCard } from '../../../components/PostCard';
import { DEMO_POSTS, isDemoMode } from '../../../lib/demo-data';
import { attachMedia, fetchLikedIds, fetchSavedIds, toggleLike, toggleSaved, type FeedPost } from '../../../lib/posts';
import { useSession } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../theme/theme';

type Row = {
  id: string;
  caption: string;
  media_type: 'photo' | 'video';
  media_key: string;
  thumbnail_key: string | null;
  topic: string | null;
  created_at: string;
  author: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
  likes: { count: number }[] | null;
  comments: { count: number }[] | null;
};

export default function PostDetailScreen() {
  const { colors, type } = useTheme();
  const { postId } = useLocalSearchParams<{ postId?: string }>();
  const { userId } = useSession();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isDemoMode) {
      const demo = DEMO_POSTS.find((item) => item.id === postId) ?? DEMO_POSTS[0];
      setPost({
        id: demo.id,
        caption: demo.caption,
        media_type: demo.media_type,
        media_key: demo.id,
        thumbnail_key: null,
        topic: demo.topic,
        created_at: demo.created_at,
        author: demo.author,
        like_count: demo.like_count,
        comment_count: demo.comment_count,
        media_url: demo.media_url,
        poster_url: demo.poster_url,
      });
      setLiked(demo.liked);
      setSaved(demo.saved);
      setError(null);
      return;
    }
    const client = supabase;
    if (!client) throw new Error('Connect your Supabase project to open posts.');
    if (!userId) throw new Error('Log in to open posts.');

    const { data, error: postError } = await client
      .from('posts')
      .select(`
        id, caption, media_type, media_key, thumbnail_key, topic, created_at,
        author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url),
        likes:post_likes(count),
        comments:comments(count)
      `)
      .eq('id', postId)
      .maybeSingle();
    if (postError) throw postError;
    if (!data) throw new Error('This post is not available.');

    const row = data as unknown as Row;
    const base: FeedPost = {
      id: row.id,
      caption: row.caption,
      media_type: row.media_type,
      media_key: row.media_key,
      thumbnail_key: row.thumbnail_key,
      topic: row.topic,
      created_at: row.created_at,
      author: row.author,
      like_count: row.likes?.[0]?.count ?? 0,
      comment_count: row.comments?.[0]?.count ?? 0,
    };
    const [withMedia] = await attachMedia(client, [base]);
    setPost(withMedia);
    const [likes, saves] = await Promise.all([
      fetchLikedIds(client, userId, [row.id]),
      fetchSavedIds(client, userId, [row.id]),
    ]);
    setLiked(likes.has(row.id));
    setSaved(saves.has(row.id));
    setError(null);
  }, [postId, userId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await load();
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not open this post.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const like = async () => {
    if (!post) return;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setPost({ ...post, like_count: Math.max(0, post.like_count + (wasLiked ? -1 : 1)) });
    if (isDemoMode) return;
    if (!supabase || !userId) return;
    try {
      await toggleLike(supabase, userId, post.id, !wasLiked);
    } catch (likeError) {
      setLiked(wasLiked);
      setPost({ ...post });
      setNotice(likeError instanceof Error ? likeError.message : 'Could not save that like.');
    }
  };

  const save = async () => {
    if (!post) return;
    const wasSaved = saved;
    setSaved(!wasSaved);
    if (isDemoMode) return;
    if (!supabase || !userId) return;
    try {
      await toggleSaved(supabase, userId, post.id, !wasSaved);
      setNotice(wasSaved ? 'Removed from saved posts.' : 'Saved for later.');
    } catch (saveError) {
      setSaved(wasSaved);
      setNotice(saveError instanceof Error ? saveError.message : 'Could not update saved posts.');
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.push('/(tabs)');
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 96, gap: 14 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={goBack} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="chevron-left" size={20} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[type.h3, { color: colors.ink }]}>A little moment.</Text>
          <Text style={[type.small, { color: colors.muted, fontSize: 10 }]}>Shared on TachiReel</Text>
        </View>
        <Feather name="bookmark" size={18} color={saved ? colors.accent : colors.muted} />
      </View>

      {notice ? <Notice text={notice} tone="error" /> : null}

      {loading ? (
        <LoadingState label="Opening this moment…" />
      ) : error || !post ? (
        <ClayCard><ErrorState message={error ?? 'This post is unavailable.'} onRetry={() => { setLoading(true); setError(null); void load().finally(() => setLoading(false)); }} /></ClayCard>
      ) : (
        <PostCard
          post={post}
          liked={liked}
          saved={saved}
          likeCount={post.like_count}
          commentCount={post.comment_count}
          onToggleLike={() => void like()}
          onToggleSave={() => void save()}
          onComment={() => router.push({ pathname: '/(tabs)/comments/[postId]', params: { postId: post.id } })}
          onAuthor={post.author ? () => router.push({ pathname: '/(tabs)/user/[username]', params: { username: post.author!.username } }) : undefined}
          onPlay={() => router.push({ pathname: '/(tabs)/reels', params: { id: post.id } })}
          onNotice={(text, tone = 'info') => setNotice(tone === 'error' ? text : null)}
        />
      )}

      <Text style={[type.small, { color: colors.mutedLight, fontSize: 9, textAlign: 'center' }]}>
        Be kind. Every moment here belongs to someone.
      </Text>
    </ScrollView>
  );
}
