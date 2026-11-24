# Project knowledge

## What this is

`TachiReel` (package name `tachireel`) is an Expo SDK 58 / React Native 0.88 social app with a safety-first onboarding flow for minors. The app uses a **Midnight Glass × Creative Editorial** design system: dark palette (#11121B, #171824, glass rgba(255,255,255,0.055)), light palette (#F7F4F1, #FFFFFF), purple as main accent (#9870F5, #7751D9, #BDA2FF), with Manrope/DM Sans typography and handwritten decorative accents. Glassmorphism is used selectively (navigation panels, auth containers, overlays, media controls) while solid surfaces are used for forms, content cards, and message bubbles. Theme persistence via `localStorage` key `tachireel.theme` with system preference respect. Auth, the Home feed, publishing, Reels, Explore, Inbox/chat, profiles, notifications, and settings all read/write Supabase when configured. With no Supabase env, the app runs in an explicitly labelled "Preview mode" with local demo content.

- `src/app/` — Expo Router routes (router root is `src/app`)
  - `_layout.tsx` — root stack (index → auth → guardian-pending → (tabs)), headers hidden
  - `index.tsx` — marketing landing page plus session gate: routes to `/auth`, `/guardian-pending`, or `/(tabs)` based on `profiles.account_status`
  - `auth.tsx` — email/password sign-up & sign-in, password visibility, remember me, demo prefill, DOB entry, teen detection, email-verification state, guardian-review link
  - `reset-password.tsx` — password-recovery landing for Supabase email links
  - `guardian-pending.tsx` — minors awaiting consent: creates a guardian request, shares the consent link, and polls (8s) until the account is active
  - `guardian-consent.tsx` — public guardian-facing review screen (link/code entry, approve or decline)
  - `(tabs)/_layout.tsx` — renders the custom `AppShell` (responsive sidebar/top nav/mobile nav) around a `Slot`; Reels switches to an immersive full-screen mode on mobile
  - `(tabs)/index.tsx` — live Home feed: greeting, search, composer, circle rail, For you/Following tabs, post cards, and a right rail with real trending topics and suggested people
  - `(tabs)/reels.tsx` — vertical Reels player using real video posts (MDN CC0 clips in preview mode), with like/save/follow/share/comments, volume, play/pause, and keyboard/arrow navigation on desktop
  - `(tabs)/discover.tsx` — Explore with real posts, topic filters, search, sort dialog, masonry grid, and save
  - `(tabs)/create.tsx` — drag-and-drop on web, media validation/preview/remove/replace, caption/topics/audience, draft save/restore, preview, upload to `post-media`, and `posts` insert
  - `(tabs)/inbox.tsx` and `(tabs)/chat/[id].tsx` — two-pane inbox and chat; conversations come from `get_my_conversations`, new threads from `start_conversation`, messages from `messages`
  - `(tabs)/profile.tsx`, `(tabs)/user/[username].tsx`, `(tabs)/edit-profile.tsx` — shared `ProfileView` header/stats/tabs/grid, follow/message/share, avatar upload, and profile edits
  - `(tabs)/notifications.tsx` — notification center derived from likes/comments/follows via the `get_my_notifications` RPC
  - `(tabs)/settings.tsx` — account, privacy, security/password, local notification preferences, appearance/theme, and logout
  - `(tabs)/post/[postId].tsx`, `(tabs)/comments/[postId].tsx` — post detail and comment threads
  - Home feed queries `posts` with author + embedded like/comment counts, filters by accepted `follows`, reads the viewer's `post_likes`, and signs private `post-media` URLs; `For you`/`Following` switch re-queries. Likes persist to `post_likes` with optimistic UI and revert on error.
- `src/components/` — `AppShell` (sidebar/top nav/mobile nav), `ui.tsx` (ClayButton, ClayInput, Avatar, Chip, Badge, Dialog, PageHeader, loading/empty/error states), `ClayCard`, `PostCard`, `ProfileView`, `ChatWindow`, `Brand`, and `ClayIllustration`
- `src/theme/theme.tsx` — theme provider (light/dark/system, persisted to `tachireel.theme`), Midnight Glass palettes, Manrope/DM Sans typography scale, spacing/radii/shadow tokens, reduced-motion support, handwritten decorative texts. `src/theme/colors.ts` keeps the palette values. The `useTheme` hook returns `{ theme, mode, colors, type, shadows, radii, reduceMotion, spacing, handwritten, toggleTheme, setMode, resolved }` with backward-compatible legacy property names.
- `src/lib/` — `format.ts` (relative timestamps), `supabase.ts` (client/config/teen helpers), `demo-data.ts` (preview-mode content only), `posts.ts`, `messages.ts`, `upload.ts`, `share.ts`, `session.tsx`, and `storage.ts`
- `supabase/schema.sql` — full Postgres schema plus a redesign appendix: `posts.topic`, `saved_posts`, `start_conversation`, and `get_my_notifications` (idempotent additions; apply only the appendix on an existing project)

`App.tsx` and `index.ts` are unused template leftovers — `package.json` `main` is `expo-router/entry`, so do not add code there.

## Commands

Package manager is npm (there is a `package-lock.json`; no `bun.lock`).

```bash
npm install                  # install deps
npm start                    # Expo dev server
npm run web                  # dev server, browser
npm run ios                  # dev server, iOS simulator
npm run android              # dev server, Android emulator
npm run lint                 # expo lint (eslint-config-expo flat config)
npm run typecheck            # tsc --noEmit
npx expo install <package>   # always use this to add deps, so versions match SDK 58
npx expo-doctor              # dependency/config health check
```

## Conventions

- TypeScript strict mode; path alias not configured — use relative imports.
- Expo Router only. New screens go in `src/app/`; reusable code stays outside it.
- Style with `StyleSheet.create` at the bottom of the file and colors from `src/theme/colors.ts`. Icon set is `@expo/vector-icons` (Feather / Ionicons).
- Supabase is optional at runtime: `supabase` is `null` when env vars are absent, and screens show a setup message instead of data. Guard every call (`supabase?.…`) or check `isSupabaseConfigured`.
- **Demo login / Preview mode:** with no Supabase env, `auth.tsx` defaults to sign-in with `admin@admin.com` / `password` and an in-memory session; reloading returns to login. The demo path is gated on `supabase === null`, so it never bypasses a configured backend. Every screen fed by `src/lib/demo-data.ts` labels itself "Preview mode"; real Supabase query/write paths remain in place and are used whenever the env is configured.
- New dependencies with native code require a development build; Expo Go only has its bundled modules.

## Gotchas

- **Web setup:** web needs `react-native-web` and `@expo/metro-runtime` in addition to `react-dom`. If Metro returns HTTP 500 with `Unable to resolve module react-native-web/dist/index` (or any "could not be resolved" for a package that does exist), clear the cache and restart: `npx expo start --clear`. Metro does not pick up packages installed while it is running; kill the whole process chain on port 8081, not just the npm wrapper.
- **Native folders:** `ios/` and `android/` are generated (CNG) and gitignored. Configure via `app.json` and config plugins, never by editing them.
- **Typed routes** are enabled (`experiments.typedRoutes`). Route strings are typechecked; `.expo/types` is generated by `expo start`.
- **Minor safety is enforced twice:** client-side (`isTeen`, teen UI) and in Postgres. The `profiles` insert trigger derives `is_minor` from auth metadata `date_of_birth` (invalid/missing DOB raises an error), and `protect_profile_safety_fields` blocks clients from changing `date_of_birth`, `is_minor`, `guardian_consent_status`, or `account_status`. Minors start private, with sensitive content off and `pending_guardian` status.
- **Guardian consent activation:** `guardian_consent_requests` holds a 7-day bearer token. `request_guardian_consent` (minor only) expires any old pending request and issues a new link; `get_guardian_consent` (anon) loads it; `respond_to_guardian_consent` (anon/authenticated) sets `guardian_consent_status = 'verified'`, `account_status = 'active'`, and re-forces private/no-sensitive. The `minor_requires_guardian` check allows an active minor only with verified consent; it previously required `pending_guardian` forever. The minor's own RLS still blocks them from changing safety fields, so only the RPC path can activate.
- **Consent is possession-based, not identity-verified:** the minor is shown the link so they can share it, meaning they could open it after logging out. Production should email the link straight to the guardian (provider + Edge Function) and never expose the token to the minor. `EXPO_PUBLIC_APP_URL` overrides the shared link base for deployed web builds; without it the link is a local Expo/`looply://` URL.
- **Posts are invisible until reviewed:** RLS only exposes posts with `sensitive_review_status = 'safe'`, but new posts default to `'pending'`. `create.tsx` uploads media and inserts the row with that default, so posts need a moderation/service-role step to transition to `'safe'` before they appear. The screen tells the user the post is awaiting review.
- **Auth/profile coupling:** sign-up passes `date_of_birth` in `options.data`; without it the database trigger rejects the signup even though the client form validates first.
- `app.json` scheme is `looply` while the in-app brand is `TachiReel` — keep that in mind for deep links.
- **Uploads use ArrayBuffer on native:** Supabase Storage does not accept `File`/`Blob`/`FormData` from React Native. `create.tsx` reads the picked file with `new File(uri).arrayBuffer()` from `expo-file-system` (imported lazily so web isn't affected); on web it uploads the picker's `File`/`Blob`, and always passes an explicit `contentType`. A failed `posts` insert deletes the just-uploaded object so bucket and table don't drift.
- **RLS recursion:** a policy on `conversation_members` cannot subquery `conversation_members` (Postgres raises `42P17`). Any membership check in a policy must call `private.is_conversation_member(...)`, a `security definer` function; do not reintroduce direct self-joins in policies.
- **Private media needs signed URLs:** `post-media` is a private bucket with no public read. The feed calls `storage.from('post-media').createSignedUrls(paths, 3600)`; any new screen showing media must do the same. Storage reads are only allowed for posts with `sensitive_review_status = 'safe'`.
- **Inbox depends on an RPC:** `get_my_conversations` must exist in the database (apply `supabase/schema.sql`) or the Inbox shows a "function not found" error. The RPC is `security definer` and returns only the caller's conversations with a safe subset of peer profile fields; JSON-embedding `profiles` directly would hit the stricter profiles RLS policy.
- The schema script is a fresh-setup script, not idempotent (`create table`, `create policy`); re-running it on an existing project fails. Apply only the new blocks when upgrading an existing database.
- Mux is not integrated: live streaming is a placeholder alert, and `EXPO_PUBLIC_MUX_PLAYBACK_DOMAIN` is unused.
- **Hermes Web CSSStyleDeclaration fix:** The `PressableScale` component in `src/components/ui.tsx` must use `.filter(Boolean)` on style arrays to remove `null`/`undefined` values. Hermes Web engine throws `TypeError: Failed to set an indexed property [0] on 'CSSStyleDeclaration'` when arrays contain `null` values. Pattern: `[style, condition && { style }, ...].filter(Boolean)` instead of `[style, condition ? { style } : null, ...]`.
- **Theme backward compatibility:** `useTheme` returns both new Midnight Glass palette values and legacy property names (`muted`, `line`, `background`, `overlay`, `ink`, `radii.input`, `radii.pill`, `shadows.lifted`, etc.) to support existing components. Do not remove these mappings without updating all dependent components.
- **expo lint warnings:** 7 pre-existing warnings about unused variables in `theme.tsx` (`Platform`, `fontFamily`, `theme`, `colors`, `type`, `handwritten`, `toggleTheme` in `ThemeProvider`). These are harmless.
