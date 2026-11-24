import { privatePageMetadata } from '../../lib/seo';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SemanticHeading } from '../../components/SemanticHeading';
import { ClayButton, ClayCard, EmptyState, ErrorState, LoadingState, PageHeader } from '../../components/ui';
import { ProfileView } from '../../components/ProfileView';
import { DEMO_POSTS, DEMO_PROFILE, isDemoMode } from '../../lib/demo-data';
import { fetchFeed, fetchSavedPosts, type FeedPost } from '../../lib/posts';
import { profileLink, shareLink } from '../../lib/share';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/theme';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { userId, profile, loading: sessionLoading } = useSession();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [saved, setSaved] = useState<FeedPost[]>([]);
  const [stats, setStats] = useState({ posts: 0, followers: 0, following: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isDemoMode) {
      const own = DEMO_POSTS.filter((post) => post.author.id === DEMO_PROFILE.id);
      const toFeed = (post: (typeof DEMO_POSTS)[number]): FeedPost => ({
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
      });
      setPosts(own.map(toFeed));
      setSaved(DEMO_POSTS.filter((post) => post.saved).map(toFeed));
      setStats({ posts: own.length, followers: 12800, following: 248 });
      setError(null);
      return;
    }
    const client = supabase;
    if (!client) throw new Error('Connect your Supabase project to load your profile.');
    if (!userId) throw new Error('Log in to see your profile.');

    const [ownPosts, savedPosts, postCount, followerCount, followingCount] = await Promise.all([
      fetchFeed(client, { userId, mode: 'For you', authorId: userId, limit: 60 }),
      fetchSavedPosts(client, userId),
      client.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', userId),
      client.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followed_id', userId).eq('status', 'accepted'),
      client.from('follows').select('followed_id', { count: 'exact', head: true }).eq('follower_id', userId).eq('status', 'accepted'),
    ]);
    setPosts(ownPosts);
    setSaved(savedPosts);
    setStats({
      posts: postCount.count ?? ownPosts.length,
      followers: followerCount.count ?? 0,
      following: followingCount.count ?? 0,
    });
    setError(null);
  }, [userId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await load();
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load your profile.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load, userId]);

  if (sessionLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}>
        <SemanticHeading visuallyHidden>Profile</SemanticHeading>
        <LoadingState label="Opening your space…" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <SemanticHeading visuallyHidden>Profile</SemanticHeading>
        <ClayCard style={{ width: '100%', maxWidth: 520, padding: 10 }}>
          <EmptyState
            icon="user"
            title="Your corner is waiting."
            description="Log in to see your profile, saved moments, and posts."
            action={<ClayButton label="Go to log in" icon="log-in" onPress={() => router.push('/auth')} />}
          />
        </ClayCard>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ width: '100%', maxWidth: 1000, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 80, gap: 18 }}
      showsVerticalScrollIndicator={false}
    >
      <PageHeader
        eyebrow="Your space, your pace"
        title="Profile."
        subtitle="A little corner that is entirely yours."
        actions={<ClayButton label="Settings" variant="ghost" size="sm" icon="settings" onPress={() => router.push('/(tabs)/settings')} />}
      />

      {error ? (
        <ClayCard><ErrorState message={error} onRetry={() => { setLoading(true); void load().finally(() => setLoading(false)); }} /></ClayCard>
      ) : (
        <ProfileView
          profile={{
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            bio: profile.bio,
            is_minor: profile.is_minor,
            account_status: profile.account_status,
          }}
          stats={stats}
          posts={posts}
          savedPosts={saved}
          isOwn
          loading={loading}
          onEdit={() => router.push('/(tabs)/edit-profile')}
          onSettings={() => router.push('/(tabs)/settings')}
          onCreate={() => router.push('/(tabs)/create')}
          onOpenPost={(post) => router.push({ pathname: '/(tabs)/post/[postId]', params: { postId: post.id } })}
          onShare={() => void shareLink({ url: profileLink(profile.username), message: 'Come find me on TachiReel' })}
        />
      )}
    </ScrollView>
  );
}

export function generateMetadata() {
  return privatePageMetadata({
    title: "Profile",
    description: "Your TachiReel profile and moments.",
    path: "/profile",
  });
}
