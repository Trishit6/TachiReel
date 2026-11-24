import { isSupabaseConfigured } from './supabase';

// Preview-only content. It is never used when Supabase is configured, and every
// demo screen labels itself so sample data cannot be mistaken for production data.
export const isDemoMode = !isSupabaseConfigured;

const portrait = (id: string) => `https://images.unsplash.com/${id}?w=240&h=240&auto=format&fit=crop&q=80`;
const photo = (id: string) => `https://images.unsplash.com/${id}?w=1000&auto=format&fit=crop&q=82`;
const videoPoster = (id: string) => `https://images.pexels.com/videos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=900`;

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export type DemoPerson = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio?: string;
};

export const DEMO_PROFILE = {
  id: 'demo-me',
  username: 'aanya.somewhere',
  display_name: 'Aanya Sharma',
  avatar_url: portrait('photo-1494790108377-be9c29b29330'),
  bio: 'Collecting little moments & making them feel like everything. 🌿',
  is_minor: false,
  account_status: 'active' as const,
  profile_visibility: 'public' as const,
  sensitive_content_opt_in: false,
  guardian_consent_status: 'not_required' as const,
  created_at: minutesAgo(60 * 24 * 400),
};

export const DEMO_PEOPLE: DemoPerson[] = [
  { id: 'p-nila', username: 'nila.moves', display_name: 'Nila Rao', avatar_url: portrait('photo-1534528741775-53994a69daeb'), bio: 'Slow travel, soft mornings.' },
  { id: 'p-dev', username: 'devonthego', display_name: 'Dev Malhotra', avatar_url: portrait('photo-1506794778202-cad84cf45f1d'), bio: 'Weekend trips and film cameras.' },
  { id: 'p-rosa', username: 'rosa.makes', display_name: 'Rosa Fernández', avatar_url: portrait('photo-1544005313-94ddf0286df2'), bio: 'Ceramics, coffee, quiet corners.' },
  { id: 'p-kai', username: 'kai.reads', display_name: 'Kai Nakamura', avatar_url: portrait('photo-1500648767791-00dcc994a43e'), bio: 'Books and good light.' },
  { id: 'p-mira', username: 'mira.wellness', display_name: 'Mira Patel', avatar_url: portrait('photo-1531123897727-8f129e1688ce'), bio: 'Gentle movement, honest words.' },
  { id: 'p-leah', username: 'leah.frames', display_name: 'Leah Okafor', avatar_url: portrait('photo-1548142813-c348350df52b'), bio: 'Small moments, wide skies.' },
  { id: 'p-omar', username: 'omar.wanders', display_name: 'Omar Haddad', avatar_url: portrait('photo-1507003211169-0a1dd7228f2d'), bio: 'Walking slowly, noticing everything.' },
  { id: 'p-sana', username: 'sana.studio', display_name: 'Sana Iqbal', avatar_url: portrait('photo-1524504388940-b1c1722653e1'), bio: 'Ceramics, colour, quiet mornings.' },
  { id: 'p-tara', username: 'tara.trails', display_name: 'Tara Brooks', avatar_url: portrait('photo-1517841905240-472988babdf9'), bio: 'Trails, waterfalls, good light.' },
  { id: 'p-jules', username: 'jules.cuts', display_name: 'Jules Martin', avatar_url: portrait('photo-1535713875002-d1d0cf377fde'), bio: 'Tiny films about ordinary days.' },
];

const person = (id: string): DemoPerson => DEMO_PEOPLE.find((item) => item.id === id) ?? DEMO_PEOPLE[0];

export type DemoPost = {
  id: string;
  caption: string;
  media_type: 'photo' | 'video';
  media_url: string;
  poster_url?: string;
  topic: string | null;
  created_at: string;
  author: DemoPerson;
  like_count: number;
  comment_count: number;
  liked: boolean;
  saved: boolean;
};

export const DEMO_POSTS: DemoPost[] = [
  {
    id: 'demo-post-1',
    caption: 'Slow mornings in Ubud. The kind where the coffee goes cold because the light kept changing. ☕🌿',
    media_type: 'photo',
    media_url: photo('photo-1537996194471-e657df975ab4'),
    topic: 'Travel',
    created_at: minutesAgo(24),
    author: person('p-nila'),
    like_count: 1284,
    comment_count: 42,
    liked: false,
    saved: false,
  },
  {
    id: 'demo-post-2',
    caption: 'A tiny reminder to take the scenic route. Found this trail completely by accident.',
    media_type: 'photo',
    media_url: photo('photo-1464822759023-fed622ff2c3b'),
    topic: 'Travel',
    created_at: minutesAgo(96),
    author: person('p-dev'),
    like_count: 842,
    comment_count: 19,
    liked: true,
    saved: true,
  },
  {
    id: 'demo-post-3',
    caption: 'The perfect pour, take eleven. Still not perfect. Still delicious.',
    media_type: 'photo',
    media_url: photo('photo-1495474472287-4d71bcdd2085'),
    topic: 'Food',
    created_at: minutesAgo(190),
    author: person('p-rosa'),
    like_count: 436,
    comment_count: 12,
    liked: false,
    saved: false,
  },
  {
    id: 'demo-post-4',
    caption: 'Sunday market finds: one linen shirt, two peaches, and a very good afternoon.',
    media_type: 'photo',
    media_url: photo('photo-1441986300917-64674bd600d8'),
    topic: 'Style',
    created_at: minutesAgo(320),
    author: person('p-mira'),
    like_count: 921,
    comment_count: 31,
    liked: false,
    saved: false,
  },
  {
    id: 'demo-post-5',
    caption: 'Reading corner reset. New book, old blanket, absolutely no plans.',
    media_type: 'photo',
    media_url: photo('photo-1490750967868-88aa4486c946'),
    topic: 'Lifestyle',
    created_at: minutesAgo(430),
    author: person('p-kai'),
    like_count: 617,
    comment_count: 8,
    liked: false,
    saved: false,
  },
  {
    id: 'demo-post-6',
    caption: 'Ten minutes of stretching before the day gets loud. It genuinely helps.',
    media_type: 'photo',
    media_url: photo('photo-1544367567-0f2fcb009e0b'),
    topic: 'Wellness',
    created_at: minutesAgo(610),
    author: person('p-mira'),
    like_count: 1102,
    comment_count: 56,
    liked: true,
    saved: false,
  },
  {
    id: 'demo-post-7',
    caption: 'A little film from the coast. Sound on for the waves.',
    media_type: 'video',
    media_url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    poster_url: photo('photo-1500530855697-b586d89ba3ee'),
    topic: 'Travel',
    created_at: minutesAgo(88),
    author: person('p-nila'),
    like_count: 3841,
    comment_count: 204,
    liked: false,
    saved: false,
  },
  {
    id: 'demo-post-8',
    caption: 'POV: you finally took that weekend trip.',
    media_type: 'video',
    media_url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
    poster_url: photo('photo-1477587458883-47145ed94245'),
    topic: 'Travel',
    created_at: minutesAgo(240),
    author: person('p-dev'),
    like_count: 2180,
    comment_count: 86,
    liked: true,
    saved: false,
  },
  {
    id: 'demo-post-9',
    caption: 'My own little corner. A few days of making things with my hands.',
    media_type: 'photo',
    media_url: photo('photo-1518837695005-2083093ee35b'),
    topic: 'Art',
    created_at: minutesAgo(60 * 30),
    author: DEMO_PROFILE,
    like_count: 512,
    comment_count: 22,
    liked: false,
    saved: false,
  },
  {
    id: 'demo-post-10',
    caption: 'A Sunday well spent: baking, reading, and ignoring my phone.',
    media_type: 'photo',
    media_url: photo('photo-1470252649378-9c29740c9fa8'),
    topic: 'Food',
    created_at: minutesAgo(60 * 52),
    author: DEMO_PROFILE,
    like_count: 388,
    comment_count: 9,
    liked: false,
    saved: false,
  },
  {
    id: 'demo-reel-forest-floor',
    caption: 'The forest floor after rain. No filter, just good light. #slowliving #nature',
    media_type: 'video',
    media_url: 'https://videos.pexels.com/video-files/8745437/8745437-hd_1080_1920_25fps.mp4',
    poster_url: videoPoster('8745437'),
    topic: 'Wellness',
    created_at: minutesAgo(38),
    author: person('p-leah'),
    like_count: 4218,
    comment_count: 163,
    liked: false,
    saved: false,
  },
  {
    id: 'demo-reel-tall-trees',
    caption: 'Tall trees, small worries. A reminder to look up more often. #travel #forest',
    media_type: 'video',
    media_url: 'https://videos.pexels.com/video-files/9642003/9642003-hd_1080_1920_25fps.mp4',
    poster_url: videoPoster('9642003'),
    topic: 'Travel',
    created_at: minutesAgo(74),
    author: person('p-omar'),
    like_count: 2874,
    comment_count: 91,
    liked: true,
    saved: false,
  },
  {
    id: 'demo-reel-waterfall',
    caption: 'Waterfall hour. I could sit here all afternoon. #nature #wellness',
    media_type: 'video',
    media_url: 'https://videos.pexels.com/video-files/10382686/10382686-hd_1080_1920_30fps.mp4',
    poster_url: videoPoster('10382686'),
    topic: 'Wellness',
    created_at: minutesAgo(126),
    author: person('p-tara'),
    like_count: 6391,
    comment_count: 248,
    liked: false,
    saved: true,
  },
  {
    id: 'demo-reel-orange-cat',
    caption: 'The street cat who owns the whole neighbourhood. #cats #citydays',
    media_type: 'video',
    media_url: 'https://videos.pexels.com/video-files/15386749/15386749-hd_1080_1920_60fps.mp4',
    poster_url: videoPoster('15386749'),
    topic: 'Lifestyle',
    created_at: minutesAgo(190),
    author: person('p-sana'),
    like_count: 9127,
    comment_count: 512,
    liked: false,
    saved: false,
  },
  {
    id: 'demo-reel-evergreen',
    caption: 'Evergreen canopy and a very quiet mind. #nature #slowliving',
    media_type: 'video',
    media_url: 'https://videos.pexels.com/video-files/19032275/19032275-hd_1080_1920_24fps.mp4',
    poster_url: videoPoster('19032275'),
    topic: 'Wellness',
    created_at: minutesAgo(255),
    author: person('p-mira'),
    like_count: 3542,
    comment_count: 117,
    liked: false,
    saved: false,
  },
  {
    id: 'demo-reel-sunbeams',
    caption: 'Sunbeams through the pines, recorded on a morning walk. #morning #nature',
    media_type: 'video',
    media_url: 'https://videos.pexels.com/video-files/33743427/14326118_1080_1920_30fps.mp4',
    poster_url: videoPoster('33743427'),
    topic: 'Wellness',
    created_at: minutesAgo(330),
    author: person('p-jules'),
    like_count: 1986,
    comment_count: 64,
    liked: false,
    saved: false,
  },
  {
    id: 'demo-reel-forest-path',
    caption: 'A path with no rush attached. #travel #walking',
    media_type: 'video',
    media_url: 'https://videos.pexels.com/video-files/36891229/15627548_1080_1920_30fps.mp4',
    poster_url: videoPoster('36891229'),
    topic: 'Travel',
    created_at: minutesAgo(410),
    author: person('p-rosa'),
    like_count: 2733,
    comment_count: 88,
    liked: true,
    saved: false,
  },
  {
    id: 'demo-reel-sunlit-trees',
    caption: 'Golden hour in the woods. Sound on for the birds. #nature #film',
    media_type: 'video',
    media_url: 'https://videos.pexels.com/video-files/35457953/15022321_1080_1920_30fps.mp4',
    poster_url: videoPoster('35457953'),
    topic: 'Art',
    created_at: minutesAgo(505),
    author: person('p-dev'),
    like_count: 4720,
    comment_count: 201,
    liked: false,
    saved: false,
  },
  {
    id: 'demo-reel-canopy',
    caption: 'Looking up from the forest floor. The canopy is its own ceiling. #nature',
    media_type: 'video',
    media_url: 'https://videos.pexels.com/video-files/35296761/14954832_1080_1920_60fps.mp4',
    poster_url: videoPoster('35296761'),
    topic: 'Wellness',
    created_at: minutesAgo(590),
    author: person('p-kai'),
    like_count: 3118,
    comment_count: 96,
    liked: false,
    saved: false,
  },
];

export type DemoReelComment = {
  id: string;
  video_id: string;
  author: DemoPerson;
  body: string;
  created_at: string;
};

const reelComment = (videoId: string, index: number, authorId: string, body: string, minutes: number): DemoReelComment => ({
  id: `${videoId}-comment-${index}`,
  video_id: videoId,
  author: person(authorId),
  body,
  created_at: minutesAgo(minutes),
});

export const DEMO_REEL_COMMENTS: Record<string, DemoReelComment[]> = Object.fromEntries(
  DEMO_POSTS.filter((post) => post.media_type === 'video').map((post, videoIndex) => [
    post.id,
    [
      reelComment(post.id, 1, DEMO_PEOPLE[(videoIndex + 1) % DEMO_PEOPLE.length].id, 'This is exactly the kind of quiet I needed today. 🤍', 18 + videoIndex),
      reelComment(post.id, 2, DEMO_PEOPLE[(videoIndex + 2) % DEMO_PEOPLE.length].id, 'The light in this one is unreal.', 9 + videoIndex),
      reelComment(post.id, 3, DEMO_PEOPLE[(videoIndex + 3) % DEMO_PEOPLE.length].id, 'Saving this for later. Thank you for sharing it.', 4 + videoIndex),
    ],
  ]),
);

export type DemoReel = {
  id: string;
  author: DemoPerson;
  caption: string;
  audio: string;
  video: string;
  poster: string;
  like_count: number;
  comment_count: number;
  liked: boolean;
  saved: boolean;
};

export const DEMO_REELS: DemoReel[] = DEMO_POSTS.filter((post) => post.media_type === 'video').map((post) => ({
  id: post.id,
  author: post.author,
  caption: post.caption,
  audio: `original audio · ${post.author.username}`,
  video: post.media_url,
  poster: post.poster_url ?? post.media_url,
  like_count: post.like_count,
  comment_count: DEMO_REEL_COMMENTS[post.id]?.length ?? post.comment_count,
  liked: post.liked,
  saved: post.saved,
}));

export type DemoMessage = { id: string; sender: 'me' | 'peer'; body: string; created_at: string };

export type DemoConversation = {
  id: string;
  peer: DemoPerson;
  last_message: string;
  last_message_at: string;
  messages: DemoMessage[];
};

export const DEMO_CONVERSATIONS: DemoConversation[] = [
  {
    id: 'demo-conv-1',
    peer: person('p-nila'),
    last_message: 'Okay but that café looks unreal',
    last_message_at: minutesAgo(18),
    messages: [
      { id: 'm1', sender: 'peer', body: 'Did you see the photos from Ubud?', created_at: minutesAgo(70) },
      { id: 'm2', sender: 'me', body: 'Yes! The light was doing something special.', created_at: minutesAgo(64) },
      { id: 'm3', sender: 'peer', body: 'Okay but that café looks unreal', created_at: minutesAgo(18) },
    ],
  },
  {
    id: 'demo-conv-2',
    peer: person('p-dev'),
    last_message: 'You: Sending the trail link now',
    last_message_at: minutesAgo(140),
    messages: [
      { id: 'm4', sender: 'peer', body: 'Any plans for the weekend?', created_at: minutesAgo(180) },
      { id: 'm5', sender: 'me', body: 'Sending the trail link now', created_at: minutesAgo(140) },
    ],
  },
  {
    id: 'demo-conv-3',
    peer: person('p-rosa'),
    last_message: 'The glaze finally came out right!',
    last_message_at: minutesAgo(320),
    messages: [
      { id: 'm6', sender: 'peer', body: 'The glaze finally came out right!', created_at: minutesAgo(320) },
    ],
  },
  {
    id: 'demo-conv-4',
    peer: person('p-mira'),
    last_message: 'You: Sunday reset walk?',
    last_message_at: minutesAgo(60 * 26),
    messages: [
      { id: 'm7', sender: 'me', body: 'Sunday reset walk?', created_at: minutesAgo(60 * 26) },
    ],
  },
];

export type DemoNotification = {
  id: string;
  type: 'like' | 'comment' | 'follow';
  actor: DemoPerson;
  body: string;
  created_at: string;
  read: boolean;
  post_caption?: string;
};

export const DEMO_NOTIFICATIONS: DemoNotification[] = [
  { id: 'n1', type: 'like', actor: person('p-nila'), body: 'liked your little corner photo.', created_at: minutesAgo(12), read: false, post_caption: 'My own little corner.' },
  { id: 'n2', type: 'comment', actor: person('p-rosa'), body: 'commented: "The colours are so calm."', created_at: minutesAgo(56), read: false, post_caption: 'A Sunday well spent.' },
  { id: 'n3', type: 'follow', actor: person('p-kai'), body: 'started following you.', created_at: minutesAgo(130), read: true },
  { id: 'n4', type: 'like', actor: person('p-dev'), body: 'liked your Sunday post.', created_at: minutesAgo(320), read: true, post_caption: 'A Sunday well spent.' },
  { id: 'n5', type: 'follow', actor: person('p-mira'), body: 'started following you.', created_at: minutesAgo(60 * 30), read: true },
];

export const DEMO_SAVED_IDS = DEMO_POSTS.filter((post) => post.saved).map((post) => post.id);

export const DEMO_TRENDING = [
  { tag: '#slowmornings', posts: '12.4k' },
  { tag: '#littlecorners', posts: '8.9k' },
  { tag: '#weekendwalks', posts: '6.2k' },
  { tag: '#coffeeandlight', posts: '4.8k' },
  { tag: '#softliving', posts: '3.1k' },
];
