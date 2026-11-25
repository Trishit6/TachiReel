import { privatePageMetadata } from '../../../lib/seo';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { Avatar, ClayCard, EmptyState, ErrorState, LoadingState, Notice, PageHeader, PressableScale } from '../../../components/ui';
import { DEMO_PEOPLE, DEMO_POSTS, isDemoMode } from '../../../lib/demo-data';
import { formatRelativeTime } from '../../../lib/format';
import { signPaths } from '../../../lib/posts';
import { useSession } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../theme/theme';

type CommentAuthor = { id: string; username: string; display_name: string; avatar_url: string | null };
type Comment = { id: string; body: string; created_at: string; author: CommentAuthor | null; pending?: boolean };
type PostPreview = {
  id: string;
  caption: string;
  media_type: 'photo' | 'video';
  author: CommentAuthor | null;
  media_url?: string;
  poster_url?: string;
};

const DEMO_COMMENTS: Record<string, Comment[]> = {
  'demo-post-1': [
    { id: 'dc1', body: 'The light in this is unreal. Saving this for my next slow morning.', created_at: new Date(Date.now() - 12 * 60_000).toISOString(), author: { ...DEMO_PEOPLE[2], id: DEMO_PEOPLE[2].id } },
    { id: 'dc2', body: 'This is exactly the reminder I needed today. 🌿', created_at: new Date(Date.now() - 8 * 60_000).toISOString(), author: { ...DEMO_PEOPLE[3], id: DEMO_PEOPLE[3].id } },
  ],
  'demo-post-2': [
    { id: 'dc3', body: 'Taking the scenic route is always the right call.', created_at: new Date(Date.now() - 40 * 60_000).toISOString(), author: { ...DEMO_PEOPLE[4], id: DEMO_PEOPLE[4].id } },
  ],
};

export default function CommentsScreen() {
  const { colors, type } = useTheme();
  const params = useLocalSearchParams<{ postId?: string }>();
  const postId = params.postId ?? '';
  const { userId, profile } = useSession();
  const [post, setPost] = useState<PostPreview | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isDemoMode) {
      const demo = DEMO_POSTS.find((item) => item.id === postId) ?? DEMO_POSTS[0];
      setPost({
        id: demo.id,
        caption: demo.caption,
        media_type: demo.media_type,
        author: demo.author,
        media_url: demo.media_url,
        poster_url: demo.poster_url,
      });
      setComments(DEMO_COMMENTS[demo.id] ?? []);
      setError(null);
      return;
    }
    const client = supabase;
    if (!client) throw new Error('Connect your Supabase project to read comments.');
    if (!userId) throw new Error('Log in to read comments.');

    const { data: postRow, error: postError } = await client
      .from('posts')
      .select('id, caption, media_type, media_key, thumbnail_key, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url)')
      .eq('id', postId)
      .maybeSingle();
    if (postError) throw postError;
    if (!postRow) throw new Error('This post is not available.');

    const { data: commentRows, error: commentError } = await client
      .from('comments')
      .select('id, body, created_at, author:profiles!comments_author_id_fkey(id, username, display_name, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (commentError) throw commentError;

    const urls = await signPaths(client, [postRow.media_key as string, postRow.thumbnail_key as string | null]);
    setPost({
      id: postRow.id as string,
      caption: (postRow.caption as string) ?? '',
      media_type: postRow.media_type as 'photo' | 'video',
      author: postRow.author as unknown as CommentAuthor | null,
      media_url: urls[postRow.media_key as string],
      poster_url: postRow.thumbnail_key ? urls[postRow.thumbnail_key as string] : undefined,
    });
    setComments((commentRows ?? []).map((row) => ({
      id: row.id as string,
      body: row.body as string,
      created_at: row.created_at as string,
      author: row.author as unknown as CommentAuthor | null,
    })));
    setError(null);
  }, [postId, userId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await load();
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load comments.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const submit = async () => {
    const body = text.trim();
    if (!body || sending) return;
    if (body.length > 1000) {
      setNotice('Comments can be up to 1,000 characters.');
      return;
    }
    if (!profile) {
      setNotice('Log in to join the conversation.');
      return;
    }
    setNotice(null);
    const optimistic: Comment = {
      id: `temp-${Date.now()}`,
      body,
      created_at: new Date().toISOString(),
      author: { id: profile.id, username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url },
      pending: true,
    };
    setComments((current) => [...current, optimistic]);
    setText('');

    if (isDemoMode) {
      setComments((current) => current.map((comment) => comment.id === optimistic.id ? { ...comment, pending: false } : comment));
      return;
    }
    if (!supabase || !userId) return;
    setSending(true);
    try {
      const { data, error: insertError } = await supabase
        .from('comments')
        .insert({ post_id: postId, author_id: userId, body })
        .select('id, body, created_at')
        .single();
      if (insertError) throw insertError;
      setComments((current) => current.map((comment) => comment.id === optimistic.id
        ? { ...comment, id: data.id as string, created_at: data.created_at as string, pending: false }
        : comment));
    } catch (insertError) {
      setComments((current) => current.filter((comment) => comment.id !== optimistic.id));
      setText(body);
      setNotice(insertError instanceof Error ? insertError.message : 'Could not post that comment.');
    } finally {
      setSending(false);
    }
  };

  const remove = async (comment: Comment) => {
    if (isDemoMode || !supabase) {
      setComments((current) => current.filter((item) => item.id !== comment.id));
      return;
    }
    const { error: deleteError } = await supabase.from('comments').delete().eq('id', comment.id).eq('author_id', userId ?? '');
    if (deleteError) {
      setNotice(deleteError.message);
      return;
    }
    setComments((current) => current.filter((item) => item.id !== comment.id));
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.push('/(tabs)/home');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ width: '100%', maxWidth: 820, alignSelf: 'center', flex: 1, minHeight: 0 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={goBack} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="chevron-left" size={20} color={colors.ink} />
          </Pressable>
          <PageHeader title="Comments." subtitle={post ? `${post.caption.slice(0, 80)}${post.caption.length > 80 ? '…' : ''}` : 'Join the conversation.'} />
        </View>

        {loading ? (
          <LoadingState label="Loading the conversation…" />
        ) : error ? (
          <View style={{ padding: 20 }}><ClayCard><ErrorState message={error} onRetry={() => { setLoading(true); void load().finally(() => setLoading(false)); }} /></ClayCard></View>
        ) : (
          <>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
              {post ? (
                <ClayCard style={{ padding: 12, flexDirection: 'row', gap: 12, alignItems: 'center' }} elevated="soft">
                  <View style={{ width: 76, height: 76, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surfaceDeep }}>
                    {post.media_url || post.poster_url ? (
                      <Image source={{ uri: post.media_url ?? post.poster_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Feather name="image" size={20} color={colors.muted} /></View>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Avatar uri={post.author?.avatar_url} name={post.author?.display_name ?? 'Someone'} size={24} />
                      <Text style={[type.smallMedium, { color: colors.ink }]}>{post.author?.display_name ?? 'Someone'}</Text>
                    </View>
                    <Text numberOfLines={2} style={[type.small, { color: colors.muted, marginTop: 5 }]}>{post.caption || 'A little moment.'}</Text>
                  </View>
                  <Pressable onPress={() => { if (post.author?.username) router.push({ pathname: '/(tabs)/user/[username]', params: { username: post.author.username } }); }} accessibilityLabel="Open author profile">
                    <Feather name="arrow-up-right" size={18} color={colors.muted} />
                  </Pressable>
                </ClayCard>
              ) : null}

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[type.h3, { color: colors.ink }]}>The conversation</Text>
                <Text style={[type.small, { color: colors.muted, fontSize: 11 }]}>{comments.length} {comments.length === 1 ? 'comment' : 'comments'}</Text>
              </View>

              {notice ? <Notice text={notice} tone="error" /> : null}

              {comments.length === 0 ? (
                <ClayCard style={{ padding: 8 }}>
                  <EmptyState icon="message-circle" title="Be the first to say something." description="A kind word goes a long way." />
                </ClayCard>
              ) : (
                <View style={{ gap: 4 }}>
                  {comments.map((comment) => {
                    const mine = comment.author?.id === (userId ?? 'demo-me');
                    return (
                      <View key={comment.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 10 }}>
                        <Avatar uri={comment.author?.avatar_url} name={comment.author?.display_name ?? 'Someone'} size={34} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                            <Text style={[type.smallMedium, { color: colors.ink }]}>{comment.author?.display_name ?? 'Someone'}</Text>
                            <Text style={[type.small, { color: colors.mutedLight, fontSize: 9 }]}>{formatRelativeTime(comment.created_at)}</Text>
                            {comment.pending ? <ActivityIndicator size="small" color={colors.accent} /> : null}
                          </View>
                          <Text style={[type.small, { color: colors.inkSoft, marginTop: 3 }]}>{comment.body}</Text>
                        </View>
                        {mine ? (
                          <Pressable onPress={() => void remove(comment)} accessibilityLabel="Delete comment" hitSlop={6} style={{ padding: 4 }}>
                            <Feather name="trash-2" size={14} color={colors.mutedLight} />
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface }}>
              <Avatar uri={profile?.avatar_url} name={profile?.display_name ?? 'You'} size={34} />
              <TextInput
                value={text}
                onChangeText={(value) => { setText(value); if (notice) setNotice(null); }}
                placeholder={profile ? 'Add a kind comment…' : 'Log in to comment'}
                placeholderTextColor={colors.mutedLight}
                editable={Boolean(profile)}
                multiline
                maxLength={1000}
                style={[type.small, { flex: 1, minHeight: 40, maxHeight: 110, backgroundColor: colors.backgroundAlt, borderRadius: 14, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 10, color: colors.ink }]}
              />
              <PressableScale onPress={() => void submit()} disabled={!text.trim() || sending} accessibilityLabel="Post comment">
                <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: !text.trim() ? 0.45 : 1 }}>
                  {sending ? <ActivityIndicator size="small" color={colors.accentContrast} /> : <Feather name="arrow-up" size={18} color={colors.accentContrast} />}
                </View>
              </PressableScale>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

export function generateMetadata() {
  return privatePageMetadata({
    title: "Comments",
    description: "Read comments on a TachiReel post.",
    path: "/comments/[postId]",
  });
}

export function generateStaticParams() {
  return [];
}
