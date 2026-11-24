# tachireel-support-chat

Server-side support assistant for TachiReel. The app never receives an AI key. The
Edge Function verifies the signed-in user's Supabase JWT, stores only that
user's messages, and writes replies with the service role.

## Setup

1. Apply `supabase/schema.sql` so `public.support_chat_messages` exists.
2. Set the provider key as an Edge Function secret (never an `EXPO_PUBLIC_*` env var):

   ```bash
   supabase secrets set SUPPORT_AI_API_KEY=your-server-side-key
   supabase secrets set SUPPORT_AI_MODEL=gpt-4o-mini
   ```

3. Deploy the function:

   ```bash
   supabase functions deploy tachireel-support-chat
   ```

4. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the
   app's `.env`, then restart Expo.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
provided automatically to deployed Supabase Edge Functions.

## Behaviour

- Unauthenticated calls are rejected.
- The user id comes from the verified JWT, never from the request body.
- Chat context is the caller's own most recent messages.
- Requests are rate-limited to six user messages per minute.
- If the key is missing, the app shows a setup message and falls back to the
  help articles and FAQ. No simulated replies are returned.
