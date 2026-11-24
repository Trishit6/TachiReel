import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ClayButton, ClayCard, ErrorState, LoadingState } from '../../../components/ui';
import { ProfileView, type ProfilePerson } from '../../../components/ProfileView';
import { DEMO_CONVERSATIONS, DEMO_PEOPLE, DEMO_POSTS, DEMO_PROFILE, isDemoMode } from '../../../lib/demo-data';
import { fetchFeed, fetchFollowingIds, followUser, unfollowUser, type FeedPost } from '../../../lib/posts';
import { startConversation } from '../../../lib/messages';
import { profileLink, shareLink } from '../../../lib/share';
import { useSession } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../theme/theme';

export default function UserProfileScreen() {
  const { colors } = useTheme();
  const { username } = useLocalSearchParams<{ username?: string }>();
  const { userId } = useSession();
  const [profile, setProfile] = useState<ProfilePerson | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [stats, setStats] = useState({ posts: 0, followers: 0, following: 0 });
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handle = username ?? '';

  const load = useCallback(async () => {
    if (isDemoMode) {
      if (handle === DEMO_PROFILE.username) {
        router.replace('/(tabs)/profile');
        return;
      }
      const person = DEMO_PEOPLE.find((item) => item.username === handle);
      if (!person) throw new Error('We could not find that profile.');
      setProfile({
        id: person.id,
        username: person.username,
        display_name: person.display_name,
        avatar_url: person.avatar_url,
        bio: person.bio ?? '',
        is_minor: false,
      });
      setPosts(DEMO_POSTS.filter((post) => post.author.id === person.id).map((post) => ({
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
      setStats({ posts: 24, followers: 1240 + person.display_name.length * 37, following: 186 });
      setError(null);
      return;
    }

    const client = supabase;
    if (!client) throw new Error('Connect your Supabase project to view profiles.');
    if (!userId) throw new Error('Log in to view profiles.');

    const { data: row, error: profileError } = await client
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, is_minor, account_status')
      .eq('username', handle)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!row) throw new Error('This profile is private or does not exist.');

    const person = row as ProfilePerson;
    if (person.id === userId) {
      router.replace('/(tabs)/profile');
      return;
    }

    const [feed, followerCount, followingCount, myFollowing] = await Promise.all([
      fetchFeed(client, { userId, mode: 'For you', authorId: person.id, limit: 60 }),
      client.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followed_id', person.id).eq('status', 'accepted'),
      client.from('follows').select('followed_id', { count: 'exact', head: true }).eq('follower_id', person.id).eq('status', 'accepted'),
      fetchFollowingIds(client, userId),
    ]);
    setProfile(person);
    setPosts(feed);
    setStats({ posts: feed.length, followers: followerCount.count ?? 0, following: followingCount.count ?? 0 });
    setFollowing(myFollowing.includes(person.id));
    setError(null);
  }, [handle, userId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await load();
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load this profile.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const toggleFollow = async () => {
    if (!profile) return;
    const next = !following;
    setFollowing(next);
    if (isDemoMode) return;
    if (!supabase || !userId) return;
    try {
      if (next) await followUser(supabase, userId, profile.id);
      else await unfollowUser(supabase, userId, profile.id);
      setStats((current) => ({ ...current, followers: Math.max(0, current.followers + (next ? 1 : -1)) }));
    } catch (followError) {
      setFollowing(!next);
      setNotice(followError instanceof Error ? followError.message : 'Could not update that follow.');
    }
  };

  const message = async () => {
    if (!profile) return;
    if (isDemoMode) {
      const existing = DEMO_CONVERSATIONS.find((conversation) => conversation.peer.id === profile.id);
      router.push(
        existing
          ? { pathname: '/(tabs)/chat/[id]', params: { id: existing.id } }
          : { pathname: '/(tabs)/chat/[id]', params: { id: `demo-new-${profile.id}`, demo: '1', name: profile.display_name, username: profile.username } },
      );
      return;
    }
    if (!supabase) return;
    try {
      const id = await startConversation(supabase, profile.id);
      router.push({ pathname: '/(tabs)/chat/[id]', params: { id } });
    } catch (startError) {
      setNotice(startError instanceof Error ? startError.message : 'Could not start that conversation.');
    }
  };

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}><LoadingState label="Opening this corner…" /></View>;
  }

  if (error || !profile) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <ClayCard style={{ width: '100%', maxWidth: 520, padding: 10 }}>
          <ErrorState message={error ?? 'This profile is unavailable.'} onRetry={() => { setLoading(true); setError(null); void load().finally(() => setLoading(false)); }} />
          <View style={{ alignItems: 'center', paddingBottom: 12 }}>
            <ClayButton label="Back to Explore" variant="secondary" size="sm" onPress={() => router.push('/(tabs)/discover')} />
          </View>
        </ClayCard>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ width: '100%', maxWidth: 1000, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 96, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ width: '100%' }}>
        <ProfileView
          profile={profile}
          stats={stats}
          posts={posts}
          isOwn={false}
          isFollowing={following}
          onFollow={() => void toggleFollow()}
          onMessage={() => void message()}
          onShare={() => void shareLink({ url: profileLink(profile.username), message: `Come find @${profile.username} on TachiReel` })}
          onOpenPost={(post) => router.push({ pathname: '/(tabs)/post/[postId]', params: { postId: post.id } })}
        />
        {notice ? (
          <View style={{ marginTop: 14 }}>
            <ClayButton label={notice} variant="danger" size="sm" onPress={() => setNotice(null)} />
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
