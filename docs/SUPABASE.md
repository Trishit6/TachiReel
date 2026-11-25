# TachiReel Supabase setup and operations

This guide is the source of truth for connecting a Supabase project to the
existing TachiReel Expo app. Environment values are not committed. Nothing in
this repository assumes or contains live project credentials.

## 1. Architecture

- Client: `@supabase/supabase-js` in `src/lib/supabase.ts`.
- Env prefix: Expo only (`EXPO_PUBLIC_*`). `VITE_*` names are not used.
- Session storage: `localStorage` on web and `expo-secure-store` on native via
  `src/lib/storage.ts`. Auth uses PKCE; browser URL detection is enabled only on
  web.
- Database: three ordered SQL files in `supabase/`:
  1. `schema.sql` — fresh-install schema, RLS, functions, storage buckets.
  2. `admin_schema.sql` — additive/idempotent admin RPCs and policies.
  3. `admin_rbac_v2.sql` — role matrix, protected bootstrap account, custom
     roles, granular permissions.
- Admin authorization: every sensitive operation is a `SECURITY DEFINER` RPC
  that rechecks permissions in Postgres. UI permission checks only hide actions;
  they are never the security boundary.
- Media: private buckets and signed URLs. Native uploads use `ArrayBuffer`
  from `expo-file-system`; web uses `File`/`Blob` paths.

## 2. Environment variables

Copy `.env.example` to `.env` and fill:

```env
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable-anon-key>
EXPO_PUBLIC_APP_URL=https://<your-app-origin>
```

`EXPO_PUBLIC_APP_URL` is the canonical origin for share links, guardian consent
links, reset-password redirects and SEO metadata. Leave it unset only for local
development; set it explicitly in production.

Server-only values (never prefix with `EXPO_PUBLIC_`, never put in `.env` read by
Expo):

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPPORT_AI_API_KEY=<provider-key>
SUPPORT_AI_MODEL=gpt-4o-mini
```

`.env`, `.env.local` and other `.env.*` files are gitignored; `.env.example` is
the tracked template. If either `EXPO_PUBLIC_SUPABASE_URL` or
`EXPO_PUBLIC_SUPABASE_ANON_KEY` is missing, the app stays in Preview mode and
admin access remains locked.

Restart the Expo dev server after changing env files. If Metro reports an
unresolved module after installing packages, restart with
`npx expo start --clear`.

## 3. Create and link a project

```bash
npm install
npx supabase login
npx supabase link --project-ref <project-ref>
```

If the Supabase CLI is not installed locally, use `npx supabase` or install it
per the Supabase CLI documentation. Linking requires the database password for
the project.

## 4. Apply migrations in order

For a fresh project, apply these files in order using the SQL Editor or the
CLI:

```bash
npx supabase db query --file supabase/schema.sql --remote
npx supabase db query --file supabase/admin_schema.sql --remote
npx supabase db query --file supabase/admin_rbac_v2.sql --remote
```

Supabase CLI v3 and newer target the local stack unless `--remote` is passed.
The SQL Editor in the Supabase Dashboard is an equally valid way to apply these
files in the same order. Read the printed `Target:` line before confirming a
hosted change.

Important:

- `schema.sql` is a fresh-setup script, not a safe re-runnable migration on a
  populated database. Only its “Redesign additions” appendix is designed to be
  re-applied.
- `admin_schema.sql` and `admin_rbac_v2.sql` are additive and idempotent.
- Re-applying `admin_schema.sql` after `admin_rbac_v2.sql` deliberately fails
  with an anti-downgrade error. If that happens, re-apply
  `admin_rbac_v2.sql` immediately.
- `admin_rbac_v2.sql` asserts that Super Admin covers every catalogue
  permission; the migration fails if that invariant regresses.

## 5. Generated database types

There is no generated `src/lib/database.types.ts` in this checkout because no
project was linked and the Supabase CLI was unavailable. `src/lib/admin.ts`
contains hand-maintained RPC payload types; do not treat it as a generated
schema.

After linking a real project, generate types:

```bash
npm run generate:types
# equivalent: supabase gen types typescript --remote --schema public --schema auth > src/lib/database.types.ts
```

Then replace the hand-maintained generics in `src/lib/supabase.ts` and
`src/lib/admin.ts` with the generated `Database` type. Regenerate after every
migration. Never hand-edit the generated file.

## 6. Authentication configuration

In Supabase Auth settings:

- Enable email/password sign-up.
- Set the Site URL to `EXPO_PUBLIC_APP_URL`.
- Add redirect URLs for every deployment origin, for example:
  - `https://<your-app-origin>/**`
  - `https://<your-app-origin>/reset-password`
  - `https://<your-app-origin>/guardian-consent`
  - `looply://*` for native deep links (the app scheme is `looply`).
- Enable email confirmation for new accounts unless a deliberate launch
  decision says otherwise.
- Configure SMTP/custom email delivery for verification, recovery and guardian
  consent links in production.
- Turn on rate limiting / CAPTCHA for sign-up, login and password recovery.
- Use PKCE (already configured in `src/lib/supabase.ts`) and keep auth cookies
  `HttpOnly`, `Secure`, `SameSite=Lax` or stricter on the hosting layer.

Profile initialization is handled by database triggers in `schema.sql`; signup
metadata must include `date_of_birth`. The app never stores passwords in a
application table.

## 7. Storage buckets and access

`schema.sql` creates and configures these private buckets:

| Bucket | Contents | Access |
|---|---|---|
| `avatars` | Profile images | Owner upload/update; visible-profile read |
| `post-media` | Post photos and Reelyx videos | Owner upload/delete; read only for reviewed, visible posts |
| `support-attachments` | Ticket files | Owner upload/read/delete, scoped to own ticket attachment rows |

Reads use `createSignedUrl` / `createSignedUrlS`; there are no public media
URLs. Admin media previews use signed URLs generated server-side from private
paths. Do not make buckets public to “fix” broken images — fix RLS or the signed
URL call instead.

File size and MIME limits are set on the buckets. Validate again in the UI and
keep the database constraints authoritative.

## 8. Edge Function

Deploy the support assistant after applying `schema.sql`:

```bash
supabase secrets set SUPPORT_AI_API_KEY=<provider-key>
supabase secrets set SUPPORT_AI_MODEL=gpt-4o-mini
supabase functions deploy tachireel-support-chat
```

The function verifies the caller JWT, derives the user id from the token, uses
`SUPABASE_SERVICE_ROLE_KEY` only inside the function, rate-limits requests and
falls back to help articles when no provider key is configured. See
`supabase/functions/tachireel-support-chat/README.md`.

## 9. Initial Super Admin

The official account is fixed to `admin@admin.com`. After all three migrations
are applied, run the idempotent server-side bootstrap:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
npm run seed:super-admin
```

The script:

- creates the Auth user without choosing a password if it does not exist;
- prints a one-time recovery link so the owner can set a strong password;
- leaves existing credentials and profile data untouched;
- upserts `role = super_admin`, `is_active = true`;
- verifies role and active profile before exiting;
- never prints or stores a password.

Do not add a client-side “make admin” path. `admin@admin.com` identifies the
protected account only; privileges come from the verified `admin_roles` row.
Other admins cannot demote, deactivate, remove or change permissions on that
account, and the last active Super Admin cannot be removed.

## 10. Local verification

These checks do not require a Supabase project and never touch one:

```bash
npm run verify:rbac   # throwaway PostgreSQL cluster + supabase/tests/rbac_local.sql
npm run typecheck
npm run lint
npx expo export --platform web
```

`npm run verify:rbac` requires local PostgreSQL binaries (`PG_BIN` can override
the detected path). It applies the real migrations to a temporary cluster,
stubs only Supabase Auth primitives, and asserts granular permissions,
protected account rules, role escalation guards, profile edit validation,
notification delivery separation, ticket resolution gates and payload shapes.

Live Supabase verification must be done manually after linking a project:
registration, email verification, recovery, session persistence, RLS isolation
between two users, private media access, storage upload restrictions, and all
admin workflows. Do not report those as verified until they have been run
against a real project.

## 11. Production checklist

- [ ] `.env` values set in the deployment platform; no secrets in the bundle.
- [ ] Auth Site URL, redirect allowlist, SMTP and CAPTCHA/rate limits configured.
- [ ] Migrations applied in order; anti-downgrade marker intact.
- [ ] `admin@admin.com` bootstrapped and password set from the recovery link.
- [ ] Storage buckets private with the documented policies.
- [ ] Support Edge Function deployed with server-only secrets.
- [ ] Generated types refreshed after final migration.
- [ ] `npm run verify:rbac`, `npm run lint`, `npm run typecheck`, and
      `npx expo export --platform web` pass on the release commit.
- [ ] Desktop and mobile browser smoke tests completed against the real project.
