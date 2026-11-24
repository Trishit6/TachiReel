import type { SupabaseClient } from '@supabase/supabase-js';
import { DEMO_REELS, DEMO_REEL_COMMENTS } from './demo-data';
import { attachMedia, fetchFollowingIds, fetchLikedIds, fetchSavedIds, followUser, toggleLike, toggleSaved, unfollowUser, type FeedPost } from './posts';

export type ReelyxAuthor = {
  id?: string | null;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export type ReelyxVideo = {
  id: string;
  author: ReelyxAuthor;
  caption: string;
  audio: string;
  video: string;
  poster?: string;
  like_count: number;
  comment_count: number;
};

export type ReelyxComment = {
  id: string;
  author: ReelyxAuthor;
  body: string;
  created_at: string;
  pending?: boolean;
};

export type ReelyxPage = { items: ReelyxVideo[]; nextOffset: number | null };

export const REELYX_PAGE_SIZE = 4;

type RawVideoPost = {
  id: string;
  caption: string;
  media_type: 'video';
  media_key: string;
  thumbnail_key?: string | null;
  created_at: string;
  author: ReelyxAuthor | null;
  likes: { count: number }[] | null;
  comments: { count: number }[] | null;
};

type RawComment = {
  id: string;
  body: string;
  created_at: string;
  author: ReelyxAuthor | null;
};

const VIDEO_SELECT = `
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

const COMMENT_SELECT = `
  id,
  body,
  created_at,
  author:profiles!comments_author_id_fkey(id, username, display_name, avatar_url)
`;

const FALLBACK_AUTHOR: ReelyxAuthor = {
  id: null,
  username: 'tachireel',
  display_name: 'TachiReel',
  avatar_url: null,
};

function countOf(rows: { count: number }[] | null): number {
  return rows?.[0]?.count ?? 0;
}

function mapVideoPost(row: RawVideoPost): FeedPost {
  return {
    id: row.id,
    caption: row.caption,
    media_type: 'video',
    media_key: row.media_key,
    thumbnail_key: row.thumbnail_key ?? null,
    topic: null,
    created_at: row.created_at,
    author: row.author && row.author.id ? { ...row.author, id: row.author.id } : null,
    like_count: countOf(row.likes),
    comment_count: countOf(row.comments),
  };
}

function toVideo(post: FeedPost): ReelyxVideo {
  return {
    id: post.id,
    author: post.author ?? FALLBACK_AUTHOR,
    caption: post.caption,
    audio: `original audio · ${post.author?.username ?? 'tachireel'}`,
    video: post.media_url ?? '',
    poster: post.poster_url,
    like_count: post.like_count,
    comment_count: post.comment_count,
  };
}

function uniqueById(items: ReelyxVideo[]): ReelyxVideo[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export type ReelyxCreatorStats = { follower_count: number; following_count: number };

function seedCount(value: string, salt: number): number {
  let hash = salt;
  for (let index = 0; index < value.length; index++) hash = (hash * 31 + value.charCodeAt(index)) % 100000;
  return 180 + (hash % 2400);
}

/** Follower counts are read through a security-definer RPC so RLS cannot hide them. */
export async function fetchReelyxCreatorStats(
  client: SupabaseClient | null,
  authorIds: (string | null | undefined)[],
): Promise<Record<string, ReelyxCreatorStats>> {
  const ids = [...new Set(authorIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return {};
  if (!client) {
    return Object.fromEntries(ids.map((id) => [id, { follower_count: seedCount(id, 7), following_count: seedCount(id, 19) }]));
  }

  const { data, error } = await client.rpc('get_reelyx_creator_stats', { creator_ids: ids });
  if (error) {
    // Older databases simply do not have the optional stats RPC yet.
    if (/function|does not exist|schema cache/i.test(error.message)) return {};
    throw error;
  }
  const stats: Record<string, ReelyxCreatorStats> = {};
  for (const row of (data ?? []) as { creator_id: string; follower_count: number; following_count: number }[]) {
    stats[row.creator_id] = {
      follower_count: Number(row.follower_count ?? 0),
      following_count: Number(row.following_count ?? 0),
    };
  }
  return stats;
}

export async function fetchReelyxPage(options: {
  client: SupabaseClient | null;
  offset: number;
  limit?: number;
}): Promise<ReelyxPage> {
  const limit = options.limit ?? REELYX_PAGE_SIZE;
  const offset = Math.max(0, options.offset);

  if (!options.client) {
    const items = DEMO_REELS.slice(offset, offset + limit).map((reel) => ({
      id: reel.id,
      author: reel.author,
      caption: reel.caption,
      audio: reel.audio,
      video: reel.video,
      poster: reel.poster,
      like_count: reel.like_count,
      comment_count: reel.comment_count,
    }));
    return { items, nextOffset: offset + limit < DEMO_REELS.length ? offset + limit : null };
  }

  const { data, error } = await options.client
    .from('posts')
    .select(VIDEO_SELECT)
    .eq('media_type', 'video')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
    .returns<RawVideoPost[]>();
  if (error) throw error;

  const posts = await attachMedia(options.client, (data ?? []).map(mapVideoPost));
  const items = uniqueById(posts.filter((post) => post.media_url).map(toVideo));
  return { items, nextOffset: items.length === limit ? offset + limit : null };
}

/** Load one exact video by id so deep links never resolve to a neighbour. */
export async function fetchReelyxVideoById(options: {
  client: SupabaseClient | null;
  id: string;
}): Promise<ReelyxVideo | null> {
  const demo = DEMO_REELS.find((reel) => reel.id === options.id);
  if (demo) {
    return {
      id: demo.id,
      author: demo.author,
      caption: demo.caption,
      audio: demo.audio,
      video: demo.video,
      poster: demo.poster,
      like_count: demo.like_count,
      comment_count: demo.comment_count,
    };
  }
  if (!options.client) return null;

  const { data, error } = await options.client
    .from('posts')
    .select(VIDEO_SELECT)
    .eq('id', options.id)
    .eq('media_type', 'video')
    .maybeSingle<RawVideoPost>();
  if (error) throw error;
  if (!data) return null;

  const [post] = await attachMedia(options.client, [mapVideoPost(data)]);
  return post?.media_url ? toVideo(post) : null;
}

export async function fetchReelyxComments(options: {
  client: SupabaseClient | null;
  videoId: string;
}): Promise<ReelyxComment[]> {
  if (!options.client) {
    return (DEMO_REEL_COMMENTS[options.videoId] ?? []).map((comment) => ({
      id: comment.id,
      author: comment.author,
      body: comment.body,
      created_at: comment.created_at,
    }));
  }

  const { data, error } = await options.client
    .from('comments')
    .select(COMMENT_SELECT)
    .eq('post_id', options.videoId)
    .order('created_at', { ascending: true })
    .limit(200)
    .returns<RawComment[]>();
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    author: row.author ?? FALLBACK_AUTHOR,
    body: row.body,
    created_at: row.created_at,
  }));
}

export async function addReelyxComment(options: {
  client: SupabaseClient | null;
  videoId: string;
  userId: string;
  profile: ReelyxAuthor;
  body: string;
}): Promise<ReelyxComment> {
  const body = options.body.trim();
  if (!body) throw new Error('Write a comment before sending.');
  if (body.length > 1000) throw new Error('Comments must be 1,000 characters or fewer.');

  const created_at = new Date().toISOString();
  if (!options.client) {
    return {
      id: `demo-comment-${Date.now()}`,
      author: options.profile,
      body,
      created_at,
    };
  }

  const { data, error } = await options.client
    .from('comments')
    .insert({ post_id: options.videoId, author_id: options.userId, body })
    .select(COMMENT_SELECT)
    .single<RawComment>();
  if (error) throw error;
  return {
    id: data.id,
    author: data.author ?? options.profile,
    body: data.body,
    created_at: data.created_at,
  };
}

export const fetchReelyxLikedIds = fetchLikedIds;
export const fetchReelyxSavedIds = fetchSavedIds;
export const fetchReelyxFollowingIds = fetchFollowingIds;
export const toggleReelyxLike = toggleLike;
export const toggleReelyxSave = toggleSaved;
export const followReelyxCreator = followUser;
export const unfollowReelyxCreator = unfollowUser;
