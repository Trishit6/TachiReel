export type SupportArticle = {
  slug: string;
  title: string;
  summary: string;
  category: 'Getting started' | 'Posts & Reelyx' | 'Privacy' | 'Safety' | 'Support';
  minutes: number;
  keywords: string[];
  sections: { heading: string; body: string }[];
};

export const SUPPORT_ARTICLES: SupportArticle[] = [
  {
    slug: 'getting-started',
    title: 'Getting started on TachiReel',
    summary: 'Set up your profile, find people you know, and understand what Preview mode means.',
    category: 'Getting started',
    minutes: 3,
    keywords: ['account', 'login', 'sign up', 'profile', 'preview', 'demo'],
    sections: [
      { heading: 'Create your account', body: 'TachiReel uses email and password sign-in. After signing up, add a display name and a short bio so people recognise you. Your date of birth is used only to apply the correct safety settings.' },
      { heading: 'Preview mode', body: 'When TachiReel is opened without a connected backend, it runs in Preview mode. Sample posts and Reelyx videos are labelled so you can explore the interface. Preview mode does not store tickets or AI chat messages.' },
      { heading: 'Find your people', body: 'Use Explore to search captions, people, hashtags and places. Follow someone from their profile or from a post to add their moments to your Following feed.' },
    ],
  },
  {
    slug: 'post-review',
    title: 'Why a new post is waiting',
    summary: 'New posts and Reelyx videos are reviewed before they appear in feeds. Learn why and what to do next.',
    category: 'Posts & Reelyx',
    minutes: 2,
    keywords: ['post', 'video', 'review', 'pending', 'safe', 'missing', 'feed', 'moderation'],
    sections: [
      { heading: 'Review is intentional', body: 'Every new post and Reelyx video starts with a pending review status. Only items marked safe are visible in feeds. This keeps the feed consistent and protects younger members.' },
      { heading: 'Your post is not lost', body: 'A pending post is still stored. You can see your own uploads from your profile while they wait. If it stays pending for an unusually long time, open a ticket with the post title and approximate upload time.' },
      { heading: 'Do not change the rules', body: 'Do not loosen database access rules to make a post appear. Review decisions are enforced in Postgres and should stay there.' },
    ],
  },
  {
    slug: 'reelyx',
    title: 'Watching and creating Reelyx',
    summary: 'Navigate the short-video feed, like a specific video, follow its creator and comment on the right clip.',
    category: 'Posts & Reelyx',
    minutes: 4,
    keywords: ['reelyx', 'reels', 'video', 'swipe', 'wheel', 'like', 'follow', 'comment', 'audio'],
    sections: [
      { heading: 'Move between videos', body: 'On mobile, swipe up or down. On desktop, use the mouse wheel while the player is active, the arrow keys, or the on-screen controls. Only the video you are watching plays automatically.' },
      { heading: 'Engagement belongs to the video', body: 'Likes, saves and comments are attached to the exact Reelyx video you are watching, not to the previous clip. Double-tap to like at the tap position; the like count animates as it changes.' },
      { heading: 'Following a creator', body: 'Tap Follow beside the creator name. Unfollowing asks for confirmation first. If the request fails, the button returns to its previous state so you do not lose track of who you follow.' },
      { heading: 'Sound and motion', body: 'Video starts muted to respect your surroundings. Use the sound control to unmute. If your system asks for reduced motion, transitions and floating animations are reduced.' },
    ],
  },
  {
    slug: 'privacy',
    title: 'Choosing who sees your moments',
    summary: 'Understand public, followers-only and private profiles, and when a choice is unavailable.',
    category: 'Privacy',
    minutes: 3,
    keywords: ['privacy', 'visibility', 'public', 'followers', 'private', 'profile', 'settings'],
    sections: [
      { heading: 'Three visibility levels', body: 'Everyone means any member can find your profile and public posts. Followers means only accepted followers can see your moments. Only me keeps your profile and posts visible just to you.' },
      { heading: 'Teen accounts', body: 'Accounts under 18 cannot be public, and sensitive content stays off. These limits are enforced by the database, not just the interface.' },
      { heading: 'Changing your mind', body: 'Open Settings → Privacy to change visibility. The choice is saved to your account when a backend is connected.' },
    ],
  },
  {
    slug: 'teen-safety',
    title: 'How safety works for teens',
    summary: 'What guardian consent changes and which settings stay locked for younger members.',
    category: 'Safety',
    minutes: 4,
    keywords: ['teen', 'minor', 'guardian', 'consent', 'safety', 'dob', 'under 18', 'dm'],
    sections: [
      { heading: 'Date of birth at signup', body: 'TachiReel needs a valid date of birth when an account is created. It is used to derive whether an account is a teen and to apply the right restrictions. It cannot be edited from the app.' },
      { heading: 'Guardian consent', body: 'A teen account starts with limited access. A guardian request creates a time-limited link that the guardian can open to approve or decline. The link is a possession-based token, so treat it like a private invitation.' },
      { heading: 'What stays restricted', body: 'Teen accounts cannot be public, cannot enable sensitive content, and cannot use messages until guardian consent is verified. These checks run in Postgres so they cannot be bypassed by changing the app.' },
      { heading: 'Need help with consent', body: 'If a guardian link expired or was lost, ask the teen account to request a new one from the guardian consent screen. Do not share another account\'s consent link.' },
    ],
  },
  {
    slug: 'messages',
    title: 'Messages and eligible accounts',
    summary: 'Who can start a conversation and why the Inbox may be empty at first.',
    category: 'Getting started',
    minutes: 2,
    keywords: ['inbox', 'message', 'dm', 'chat', 'conversation', 'guardian'],
    sections: [
      { heading: 'Eligibility', body: 'An account must be active to read and send messages. Teen accounts also need verified guardian consent before conversations are available.' },
      { heading: 'Starting a conversation', body: 'Open a profile and choose Message. Existing threads appear in Inbox. If Inbox shows an error, the database may be missing the conversations helper; open a ticket with the exact error text.' },
      { heading: 'Privacy', body: 'Only conversation members can read messages. Do not share verification codes, passwords or consent links in a conversation.' },
    ],
  },
  {
    slug: 'attachments',
    title: 'Sending a support attachment',
    summary: 'What files you can attach to a ticket and how private storage is protected.',
    category: 'Support',
    minutes: 2,
    keywords: ['attachment', 'screenshot', 'file', 'upload', 'ticket', 'private'],
    sections: [
      { heading: 'How to attach', body: 'Open a ticket and choose Add file. On the web you can pick an image or PDF. Attachments stay private to your account and are linked only to your ticket.' },
      { heading: 'Supported files', body: 'Images (JPEG, PNG, WebP), PDFs and plain text files up to 10 MB are supported. Never attach passwords, token links or full identity documents.' },
      { heading: 'Signed links', body: 'Attachments live in a private bucket. The app creates short-lived signed links so only you can open your own files.' },
    ],
  },
  {
    slug: 'voice-support',
    title: 'Using voice in support chat',
    summary: 'When voice input and spoken replies are available, and what to do when they are not.',
    category: 'Support',
    minutes: 2,
    keywords: ['voice', 'speech', 'microphone', 'listen', 'speak', 'accessibility'],
    sections: [
      { heading: 'Browser support', body: 'Voice input and spoken replies use your browser\'s Web Speech API. Your browser must support it and you must allow microphone access when asked.' },
      { heading: 'Edit before sending', body: 'Speech recognition places words into the message box. Check them before sending; dictated text can be wrong, especially names and hashtags.' },
      { heading: 'Text always works', body: 'If speech is unavailable or you deny permission, type as usual. Spoken replies can be played, paused, resumed or stopped from the chat screen.' },
      { heading: 'Privacy', body: 'Audio is handled by your browser and speech provider. TachiReel stores only the text you choose to send.' },
    ],
  },
];

export type SupportFaq = { question: string; answer: string; articleSlug: string };

export const SUPPORT_FAQS: SupportFaq[] = [
  { question: 'Why can’t I see my new post?', answer: 'New posts and Reelyx videos wait for review and appear once marked safe.', articleSlug: 'post-review' },
  { question: 'How do I move to the next Reelyx video?', answer: 'Swipe, scroll with the mouse wheel, use the arrow keys, or tap the on-screen controls.', articleSlug: 'reelyx' },
  { question: 'Can a teen account be public?', answer: 'No. Teen accounts cannot be public and sensitive content stays off.', articleSlug: 'teen-safety' },
  { question: 'How do I change who follows me?', answer: 'Change profile visibility in Settings → Privacy to Everyone, Followers or Only me.', articleSlug: 'privacy' },
  { question: 'Why is my Inbox empty or failing to load?', answer: 'Messages need an active eligible account and the conversation helper in the database.', articleSlug: 'messages' },
  { question: 'Can I attach a screenshot to a ticket?', answer: 'Yes. Images and PDFs up to 10 MB stay private to your ticket.', articleSlug: 'attachments' },
  { question: 'Does voice chat work everywhere?', answer: 'Only where the browser supports the Web Speech API and permission is granted; typing always works.', articleSlug: 'voice-support' },
];

export type SupportSearchResult = { article: SupportArticle; score: number };

export function searchSupportArticles(query: string): SupportSearchResult[] {
  const terms = query.toLowerCase().split(/\s+/).map((term) => term.trim()).filter(Boolean);
  if (terms.length === 0) return [];
  return SUPPORT_ARTICLES.map((article) => {
    const haystack = [article.title, article.summary, article.category, ...article.keywords, ...article.sections.flatMap((section) => [section.heading, section.body])].join(' ').toLowerCase();
    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 + (article.title.toLowerCase().includes(term) ? 2 : 0) : 0), 0);
    return { article, score };
  }).filter((result) => result.score > 0).sort((a, b) => b.score - a.score);
}

export function getSupportArticle(slug: string | undefined): SupportArticle | undefined {
  return SUPPORT_ARTICLES.find((article) => article.slug === slug);
}
