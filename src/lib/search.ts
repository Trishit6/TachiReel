/**
 * Shared search suggestions for the global navbar.
 *
 * Uses the same data sources as the app: demo content in preview mode, and the
 * existing Supabase tables (profiles + safe posts) when a project is connected.
 * There is no separate places table, so place suggestions are derived from
 * post captions with a small vocabulary of common places and moods.
 */
import { DEMO_PEOPLE, DEMO_POSTS, isDemoMode, type DemoPerson } from './demo-data';
import { signPaths } from './posts';
import { supabase } from './supabase';

export type SearchGroup = 'People' | 'Posts' | 'Hashtags' | 'Places';

export type SearchSuggestion = {
  id: string;
  group: SearchGroup;
  label: string;
  detail?: string;
  image?: string;
  username?: string;
  postId?: string;
  query?: string;
};

const PLACE_WORDS = [
  'Ubud', 'Bali', 'coast', 'trail', 'market', 'garden', 'coffee', 'bookshop',
  'studio', 'kitchen', 'city', 'mountains', 'seaside', 'home', 'weekend',
];

function hashtags(text: string): string[] {
  return [...new Set(text.match(/#[^\s#]+/g) ?? [])].map((tag) => tag.replace(/[.,!?;:]+$/, ''));
}

function places(text: string): string[] {
  const lower = text.toLowerCase();
  return PLACE_WORDS.filter((place) => lower.includes(place.toLowerCase()));
}

function matches(query: string, value: string | null | undefined): boolean {
  return Boolean(value && value.toLowerCase().includes(query));
}

function demoSuggestions(query: string): SearchSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: SearchSuggestion[] = [];

  for (const person of DEMO_PEOPLE) {
    if (matches(q, person.display_name) || matches(q, person.username) || matches(q, person.bio)) {
      results.push({
        id: `person-${person.id}`,
        group: 'People',
        label: person.display_name,
        detail: `@${person.username}`,
        image: person.avatar_url ?? undefined,
        username: person.username,
      });
    }
  }

  for (const post of DEMO_POSTS) {
    if (matches(q, post.caption) || matches(q, post.topic)) {
      results.push({
        id: `post-${post.id}`,
        group: 'Posts',
        label: post.caption.length > 66 ? `${post.caption.slice(0, 63)}…` : post.caption,
        detail: post.topic ? `${post.topic} · @${post.author.username}` : `@${post.author.username}`,
        image: post.media_type === 'video' ? post.poster_url : post.media_url,
        postId: post.id,
      });
    }
  }

  const tags = new Map<string, string>();
  for (const post of DEMO_POSTS) {
    for (const tag of [...hashtags(post.caption), ...(post.topic ? [`#${post.topic}`] : [])]) {
      if (matches(q, tag)) tags.set(tag.toLowerCase(), tag);
    }
  }
  for (const tag of tags.values()) {
    results.push({ id: `tag-${tag}`, group: 'Hashtags', label: tag, detail: 'Explore posts', query: tag });
  }

  const foundPlaces = new Set<string>();
  for (const post of DEMO_POSTS) {
    for (const place of places(post.caption)) {
      if (matches(q, place)) foundPlaces.add(place);
    }
  }
  for (const place of foundPlaces) {
    results.push({ id: `place-${place}`, group: 'Places', label: place, detail: 'Search captions', query: place });
  }

  return results;
}

type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type PostRow = {
  id: string;
  caption: string;
  topic: string | null;
  media_key: string;
  thumbnail_key: string | null;
  author: { username: string }[] | null;
};

async function liveSuggestions(query: string): Promise<SearchSuggestion[]> {
  const client = supabase;
  if (!client) return [];
  const q = query.trim().replace(/[%_,]/g, ' ').slice(0, 60).trim();
  if (!q) return [];
  const pattern = `%${q}%`;
  const results: SearchSuggestion[] = [];

  const [people, posts] = await Promise.all([
    client
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
      .limit(4),
    client
      .from('posts')
      .select('id, caption, topic, media_key, thumbnail_key, author:profiles!posts_author_id_fkey(username)')
      .eq('sensitive_review_status', 'safe')
      .or(`caption.ilike.${pattern},topic.ilike.${pattern}`)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  for (const row of (people.data ?? []) as ProfileRow[]) {
    results.push({
      id: `person-${row.id}`,
      group: 'People',
      label: row.display_name,
      detail: `@${row.username}`,
      image: row.avatar_url ?? undefined,
      username: row.username,
    });
  }

  const rows = (posts.data ?? []) as PostRow[];
  const media = await signPaths(client, rows.flatMap((row) => [row.media_key, row.thumbnail_key]));
  for (const row of rows) {
    results.push({
      id: `post-${row.id}`,
      group: 'Posts',
      label: row.caption.length > 66 ? `${row.caption.slice(0, 63)}…` : row.caption || row.topic || 'A moment',
      detail: row.topic ? `${row.topic} · @${row.author?.[0]?.username ?? 'member'}` : `@${row.author?.[0]?.username ?? 'member'}`,
      image: row.thumbnail_key ? media[row.thumbnail_key] : media[row.media_key],
      postId: row.id,
    });
  }

  const tags = new Map<string, string>();
  const foundPlaces = new Set<string>();
  for (const row of rows) {
    for (const tag of [...hashtags(row.caption), ...(row.topic ? [`#${row.topic}`] : [])]) {
      if (matches(q, tag)) tags.set(tag.toLowerCase(), tag);
    }
    for (const place of places(row.caption)) {
      if (matches(q, place)) foundPlaces.add(place);
    }
  }
  for (const tag of tags.values()) results.push({ id: `tag-${tag}`, group: 'Hashtags', label: tag, detail: 'Explore posts', query: tag });
  for (const place of foundPlaces) results.push({ id: `place-${place}`, group: 'Places', label: place, detail: 'Search captions', query: place });

  return results;
}

export async function getSearchSuggestions(query: string): Promise<SearchSuggestion[]> {
  const clean = query.trim();
  if (!clean) return [];
  return isDemoMode ? demoSuggestions(clean) : liveSuggestions(clean);
}

export function personLabel(person: DemoPerson): string {
  return `@${person.username}`;
}
