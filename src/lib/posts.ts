import type { SupabaseClient } from '@supabase/supabase-js';

export type PostAuthor = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export type FeedPost = {
  id: string;
  caption: string;
  media_type: 'photo' | 'video';
  media_key: string;
  thumbnail_key: string | null;
  topic: string | null;
  created_at: string;
  author: PostAuthor | null;
  like_count: number;
  comment_count: number;
  media_url?: string;
  poster_url?: string;
};

type RawPost = {
  id: string;
  caption: string;
  media_type: 'photo' | 'video';
  media_key: string;
  thumbnail_key?: string | null;
  topic?: string | null;
  created_at: string;
  author: PostAuthor | null;
  likes: { count: number }[] | null;
  comments: { count: number }[] | null;
};

const SELECT = `
  id,
  caption,
  media_type,
  media_key,
  thumbnail_key,
  topic,
  created_at,
  author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url),
  likes:post_likes(count),
  comments:comments(count)
`;

const LEGACY_SELECT = `
  id,
  caption,
  media_type,
  media_key,
  thumbnail_key,
  created_at,
  author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url),
  likes:post_likes(count),
  comments:comments(count)
`;

function countOf(rows: { count: number }[] | null): number {
  return rows?.[0]?.count ?? 0;
}

function mapPost(row: RawPost): FeedPost {
  return {
    id: row.id,
    caption: row.caption,
    media_type: row.media_type,
    media_key: row.media_key,
    thumbnail_key: row.thumbnail_key ?? null,
    topic: row.topic ?? null,
    created_at: row.created_at,
    author: row.author,
    like_count: countOf(row.likes),
    comment_count: countOf(row.comments),
  };
}

export async function signPaths(client: SupabaseClient, paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (unique.length === 0) return {};
  const { data, error } = await client.storage.from('post-media').createSignedUrls(unique, 60 * 60);
  if (error) throw error;
  const urls: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
  }
  return urls;
}

export async function attachMedia(client: SupabaseClient, posts: FeedPost[]): Promise<FeedPost[]> {
  if (posts.length === 0) return posts;
  const urls = await signPaths(client, posts.flatMap((post) => [post.media_key, post.thumbnail_key]));
  return posts.map((post) => ({
    ...post,
    media_url: urls[post.media_key],
    poster_url: post.thumbnail_key ? urls[post.thumbnail_key] : undefined,
  }));
}

export async function fetchFollowingIds(client: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await client
    .from('follows')
    .select('followed_id')
    .eq('follower_id', userId)
    .eq('status', 'accepted');
  if (error) throw error;
  return (data ?? []).map((row) => row.followed_id as string);
}

export async function fetchFeed(
  client: SupabaseClient,
  options: { userId: string; mode: 'For you' | 'Following'; limit?: number; authorId?: string },
): Promise<FeedPost[]> {
  let followingIds: string[] = [];
  if (options.mode === 'Following') {
    followingIds = await fetchFollowingIds(client, options.userId);
    if (followingIds.length === 0) return [];
  }

  const run = async (select: string) => {
    let query = client
      .from('posts')
      .select(select)
      .order('created_at', { ascending: false })
      .limit(options.limit ?? 30);
    if (options.authorId) query = query.eq('author_id', options.authorId);
    else if (options.mode === 'Following') query = query.in('author_id', followingIds);
    return query.returns<RawPost[]>();
  };

  let result = await run(SELECT);
  if (result.error && /topic|thumbnail_key/i.test(result.error.message)) {
    result = await run(LEGACY_SELECT);
  }
  if (result.error) throw result.error;

  return attachMedia(client, (result.data ?? []).map(mapPost));
}

export async function fetchLikedIds(client: SupabaseClient, userId: string, postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const { data, error } = await client
    .from('post_likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.post_id as string));
}

export async function fetchSavedIds(client: SupabaseClient, userId: string, postIds?: string[]): Promise<Set<string>> {
  let query = client.from('saved_posts').select('post_id').eq('user_id', userId);
  if (postIds?.length) query = query.in('post_id', postIds);
  const { data, error } = await query;
  if (error) {
    // The saved_posts table is a newer schema addition; treat a missing table as "nothing saved".
    if (error.code === '42P01' || /saved_posts/i.test(error.message)) return new Set();
    throw error;
  }
  return new Set((data ?? []).map((row) => row.post_id as string));
}

export async function fetchSavedPosts(client: SupabaseClient, userId: string): Promise<FeedPost[]> {
  const ids = [...(await fetchSavedIds(client, userId))];
  if (ids.length === 0) return [];
  const run = async (select: string) =>
    client
      .from('posts')
      .select(select)
      .in('id', ids)
      .order('created_at', { ascending: false })
      .returns<RawPost[]>();

  let result = await run(SELECT);
  if (result.error && /topic|thumbnail_key/i.test(result.error.message)) result = await run(LEGACY_SELECT);
  if (result.error) throw result.error;
  return attachMedia(client, (result.data ?? []).map(mapPost));
}

export async function toggleSaved(
  client: SupabaseClient,
  userId: string,
  postId: string,
  saved: boolean,
): Promise<void> {
  const { error } = saved
    ? await client.from('saved_posts').insert({ user_id: userId, post_id: postId })
    : await client.from('saved_posts').delete().eq('user_id', userId).eq('post_id', postId);
  if (error) {
    if (error.code === '42P01' || /saved_posts/i.test(error.message)) {
      throw new Error('Saved posts are not enabled in this database yet. Apply the latest supabase/schema.sql.');
    }
    throw error;
  }
}

export async function toggleLike(
  client: SupabaseClient,
  userId: string,
  postId: string,
  liked: boolean,
): Promise<void> {
  const { error } = liked
    ? await client.from('post_likes').insert({ post_id: postId, user_id: userId })
    : await client.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
  if (error) throw error;
}

export async function fetchSuggestedPeople(client: SupabaseClient, userId: string, limit = 4) {
  const following = new Set(await fetchFollowingIds(client, userId));
  const { data, error } = await client
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio')
    .eq('account_status', 'active')
    .eq('profile_visibility', 'public')
    .neq('id', userId)
    .limit(limit + following.size);
  if (error) throw error;
  return (data ?? [])
    .filter((person) => !following.has(person.id as string))
    .slice(0, limit) as (PostAuthor & { bio: string | null })[];
}

export async function followUser(client: SupabaseClient, followerId: string, followedId: string): Promise<void> {
  const { error } = await client
    .from('follows')
    .upsert({ follower_id: followerId, followed_id: followedId, status: 'accepted' }, { onConflict: 'follower_id,followed_id' });
  if (error) throw error;
}

export async function unfollowUser(client: SupabaseClient, followerId: string, followedId: string): Promise<void> {
  const { error } = await client
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('followed_id', followedId);
  if (error) throw error;
}

export async function isFollowing(client: SupabaseClient, followerId: string, followedId: string): Promise<boolean> {
  const { data, error } = await client
    .from('follows')
    .select('followed_id')
    .eq('follower_id', followerId)
    .eq('followed_id', followedId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
