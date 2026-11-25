#!/usr/bin/env node
/**
 * Secure, idempotent bootstrap for the initial TachiReel Super Admin.
 *
 * Run with a server-only service-role key (never an EXPO_PUBLIC_* value):
 *
 *   SUPABASE_URL=https://<project>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   npm run seed:super-admin
 *
 * The official Super Admin email is fixed: admin@admin.com. No substitute
 * address is accepted. Only the date of birth can be overridden, because
 * schema.sql requires one for every auth user.
 *
 * The script never sets or prints a password. If the auth user is new, it
 * prints a one-time Supabase recovery link so the owner can choose one.
 * A date of birth is supplied only because schema.sql requires one on every
 * auth user; the default is an adult placeholder and can be overridden.
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = 'admin@admin.com';
const dateOfBirth = (process.env.SUPER_ADMIN_DOB || '1990-01-01').trim();

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Both are required; the service key must stay server-side.');
  process.exit(1);
}

if (!/^[^@\s]+@[^@\s]+$/.test(email)) {
  console.error(`"${email}" is not a valid email address for Supabase Auth.`);
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function findUser() {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) fail(`Could not list auth users: ${error.message}`);
    const users = data?.users ?? [];
    const match = users.find((user) => user.email?.toLowerCase() === email);
    if (match) return { user: match, created: false };
    if (users.length < perPage) return { user: null, created: false };
    page += 1;
  }
}

async function main() {
  console.log(`Super Admin bootstrap for ${email}`);

  let { user, created } = await findUser();

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { date_of_birth: dateOfBirth, display_name: 'Super Admin' },
    });
    if (error) fail(`Could not create the auth account: ${error.message}`);
    user = data.user;
    created = true;
    console.log('Auth account created without a password.');
  } else {
    console.log('Auth account already exists; leaving its profile and credentials untouched.');
  }

  if (!user) fail('Supabase did not return a user record.');

  const { error: roleError } = await supabase
    .from('admin_roles')
    .upsert(
      {
        user_id: user.id,
        role: 'super_admin',
        is_active: true,
        custom_role: null,
        extra_permissions: [],
      },
      { onConflict: 'user_id' },
    );
  if (roleError) {
    fail(`Could not assign the Super Admin role. Apply supabase/schema.sql and supabase/admin_schema.sql first: ${roleError.message}`);
  }

  const { data: assigned, error: verifyError } = await supabase
    .from('admin_roles')
    .select('user_id, role, is_active, created_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (verifyError) fail(`Could not verify the assigned role: ${verifyError.message}`);
  if (assigned?.role !== 'super_admin' || assigned.is_active !== true) {
    fail('Role verification failed: the account is not an active Super Admin.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, account_status')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) fail(`Could not verify the profile: ${profileError.message}`);
  if (profile?.account_status !== 'active') {
    fail('The account is not active. Resolve its guardian/account status before granting access.');
  }

  console.log('Verified role:', assigned);
  console.log('Verified profile:', profile);

  // A freshly created account has no password. An existing account that has
  // never signed in may be one provisioned by an earlier seed run, so it gets
  // the same one-time setup link. No password is ever chosen here.
  if (created || !user.last_sign_in_at) {
    const { data: link, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
    });
    if (linkError) {
      console.warn(`A recovery link could not be generated: ${linkError.message}`);
      console.warn('Use the "Forgot password?" flow on /admin/login instead.');
    } else {
      console.log('\nOne-time password setup link (do not share or commit):');
      console.log(link.action_link);
      console.log('Open it, choose a strong password, then sign in at /admin/dashboard.');
    }
  }

  console.log('\nDone. No password was stored in the repository or set by this script.');
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
