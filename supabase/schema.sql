create extension if not exists pgcrypto;

create type public.account_status as enum ('pending_guardian', 'active', 'suspended');
create type public.content_visibility as enum ('public', 'followers', 'private');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 30),
  display_name text not null check (char_length(display_name) between 1 and 60),
  date_of_birth date not null,
  country_code text not null default 'IN',
  is_minor boolean not null,
  guardian_consent_status text not null default 'not_required' check (guardian_consent_status in ('required', 'pending', 'verified', 'rejected', 'not_required')),
  account_status public.account_status not null default 'active',
  profile_visibility public.content_visibility not null,
  sensitive_content_opt_in boolean not null default false,
  bio text not null default '' check (char_length(bio) <= 160),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint minor_requires_guardian check (
    not is_minor or (
      profile_visibility <> 'public'
      and not sensitive_content_opt_in
      and (account_status <> 'active' or guardian_consent_status = 'verified')
    )
  )
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  caption text not null default '' check (char_length(caption) <= 2200),
  media_type text not null check (media_type in ('photo', 'video')),
  media_key text not null,
  thumbnail_key text,
  visibility public.content_visibility not null default 'followers',
  sensitive_review_status text not null default 'pending' check (sensitive_review_status in ('pending', 'safe', 'mature', 'removed')),
  created_at timestamptz not null default now()
);

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 1000),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now()
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.guardian_consent_requests (
  id uuid primary key default gen_random_uuid(),
  minor_id uuid not null references public.profiles(id) on delete cascade,
  guardian_email text not null check (char_length(guardian_email) between 5 and 254),
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'expired')),
  guardian_name text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index posts_author_created_idx on public.posts(author_id, created_at desc);
create index posts_visibility_created_idx on public.posts(visibility, sensitive_review_status, created_at desc);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at desc);
create index reports_status_created_idx on public.reports(status, created_at desc);
create index guardian_consent_requests_minor_created_idx on public.guardian_consent_requests(minor_id, created_at desc);
create unique index guardian_consent_requests_one_pending_idx on public.guardian_consent_requests(minor_id) where status = 'pending';

-- Membership checks live in a security definer function so policies on conversation_members
-- do not re-enter their own RLS policy (Postgres raises 42P17 for self-referential policies).
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_conversation_member(target_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = target_conversation_id
      and cm.user_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_conversation_member(uuid) from public;
grant execute on function private.is_conversation_member(uuid) to authenticated;

-- Block checks are shared by profile/media visibility, follow eligibility and chat
-- policies. Security definer keeps them out of their own RLS evaluation paths.
create or replace function private.profiles_are_blocked(p_first uuid, p_second uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_first and b.blocked_id = p_second)
       or (b.blocker_id = p_second and b.blocked_id = p_first)
  );
$$;

create or replace function private.conversation_is_blocked(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.conversation_members mine
    join public.conversation_members other
      on other.conversation_id = mine.conversation_id
     and other.user_id <> mine.user_id
    where mine.conversation_id = p_conversation_id
      and private.profiles_are_blocked(mine.user_id, other.user_id)
  );
$$;

-- An accepted follow only grants visibility when both accounts are active,
-- guardian-cleared where required, and neither side has blocked the other.
create or replace function private.follow_is_eligible(p_follower uuid, p_followed uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.follows f
    join public.profiles viewer on viewer.id = f.follower_id
    join public.profiles target on target.id = f.followed_id
    where f.follower_id = p_follower
      and f.followed_id = p_followed
      and f.status = 'accepted'
      and viewer.account_status = 'active'
      and target.account_status = 'active'
      and (not viewer.is_minor or viewer.guardian_consent_status = 'verified')
      and (not target.is_minor or target.guardian_consent_status = 'verified')
      and not private.profiles_are_blocked(f.follower_id, f.followed_id)
  );
$$;

revoke execute on function private.profiles_are_blocked(uuid, uuid) from public;
revoke execute on function private.conversation_is_blocked(uuid) from public;
revoke execute on function private.follow_is_eligible(uuid, uuid) from public;
grant execute on function private.profiles_are_blocked(uuid, uuid) to authenticated;
grant execute on function private.conversation_is_blocked(uuid) to authenticated;
grant execute on function private.follow_is_eligible(uuid, uuid) to authenticated;

-- One row per conversation for the signed-in member, with the other participant and the
-- latest message. Security definer keeps the peer's display name visible without widening
-- the profiles RLS policy for everyone.
create or replace function public.get_my_conversations()
returns table (
  conversation_id uuid,
  peer_id uuid,
  peer_display_name text,
  peer_username text,
  peer_avatar_url text,
  last_message text,
  last_message_sender_id uuid,
  last_message_at timestamptz,
  conversation_created_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  with me as (
    select p.id
    from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and (not p.is_minor or p.guardian_consent_status = 'verified')
  ),
  my_conversations as (
    select c.id, c.created_at
    from public.conversations c
    where exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = c.id and cm.user_id = (select id from me)
    )
      and not private.conversation_is_blocked(c.id)
  ),
  peers as (
    select distinct on (cm.conversation_id)
      cm.conversation_id, p.id, p.display_name, p.username, p.avatar_url
    from public.conversation_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.conversation_id in (select id from my_conversations)
      and cm.user_id <> (select id from me)
    order by cm.conversation_id, p.display_name
  ),
  latest as (
    select distinct on (m.conversation_id)
      m.conversation_id, m.body, m.sender_id, m.created_at
    from public.messages m
    where m.conversation_id in (select id from my_conversations)
    order by m.conversation_id, m.created_at desc
  )
  select
    mc.id,
    peers.id,
    peers.display_name,
    peers.username,
    peers.avatar_url,
    latest.body,
    latest.sender_id,
    latest.created_at,
    mc.created_at
  from my_conversations mc
  left join peers on peers.conversation_id = mc.id
  left join latest on latest.conversation_id = mc.id
  order by coalesce(latest.created_at, mc.created_at) desc;
$$;

revoke execute on function public.get_my_conversations() from public;
revoke execute on function public.get_my_conversations() from anon;
grant execute on function public.get_my_conversations() to authenticated;

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.follows enable row level security;
alter table public.post_likes enable row level security;
alter table public.comments enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;
alter table public.guardian_consent_requests enable row level security;

create policy "users can read own profile or accepted public profiles" on public.profiles for select to authenticated using (
  id = auth.uid() or (
    account_status = 'active'
    and profile_visibility = 'public'
    and (not is_minor or guardian_consent_status = 'verified')
  ) or private.follow_is_eligible(auth.uid(), id)
);
create policy "users can update their own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "eligible users can read posts" on public.posts for select to authenticated using (
  exists (select 1 from public.profiles viewer where viewer.id = auth.uid() and viewer.account_status = 'active')
  and sensitive_review_status = 'safe'
  and (
    author_id = auth.uid()
    or (visibility = 'public' and exists (select 1 from public.profiles author where author.id = author_id and author.account_status = 'active' and (not author.is_minor or author.guardian_consent_status = 'verified')))
    or (visibility = 'followers' and private.follow_is_eligible(auth.uid(), author_id))
  )
);
create policy "active users can create own posts" on public.posts for insert to authenticated with check (
  author_id = auth.uid()
  and sensitive_review_status = 'pending'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_status = 'active' and (not p.is_minor or p.guardian_consent_status = 'verified'))
);
create policy "authors can edit their posts" on public.posts for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "authors can delete their posts" on public.posts for delete to authenticated using (author_id = auth.uid());

create policy "users can read related follow edges" on public.follows for select to authenticated using (follower_id = auth.uid() or followed_id = auth.uid());
create policy "users can request follows" on public.follows for insert to authenticated with check (
  follower_id = auth.uid()
  and status = 'pending'
  and not private.profiles_are_blocked(auth.uid(), followed_id)
  and exists (
    select 1 from public.profiles viewer
    where viewer.id = auth.uid()
      and viewer.account_status = 'active'
      and (not viewer.is_minor or viewer.guardian_consent_status = 'verified')
  )
  and exists (
    select 1 from public.profiles target
    where target.id = followed_id
      and target.account_status = 'active'
      and (not target.is_minor or target.guardian_consent_status = 'verified')
  )
);
create policy "followers can cancel or renew requests" on public.follows for update to authenticated using (follower_id = auth.uid()) with check (
  follower_id = auth.uid()
  and status = 'pending'
  and not private.profiles_are_blocked(auth.uid(), followed_id)
  and exists (
    select 1 from public.profiles viewer
    where viewer.id = auth.uid()
      and viewer.account_status = 'active'
      and (not viewer.is_minor or viewer.guardian_consent_status = 'verified')
  )
  and exists (
    select 1 from public.profiles target
    where target.id = followed_id
      and target.account_status = 'active'
      and (not target.is_minor or target.guardian_consent_status = 'verified')
  )
);
create policy "followed users can decide requests" on public.follows for update to authenticated using (followed_id = auth.uid()) with check (
  followed_id = auth.uid()
  and status in ('accepted', 'rejected')
  and not private.profiles_are_blocked(follower_id, auth.uid())
  and exists (
    select 1 from public.profiles viewer
    where viewer.id = follower_id
      and viewer.account_status = 'active'
      and (not viewer.is_minor or viewer.guardian_consent_status = 'verified')
  )
  and exists (
    select 1 from public.profiles target
    where target.id = auth.uid()
      and target.account_status = 'active'
      and (not target.is_minor or target.guardian_consent_status = 'verified')
  )
);
create policy "users can unfollow" on public.follows for delete to authenticated using (follower_id = auth.uid() or followed_id = auth.uid());

create or replace function public.respond_to_follow_request(p_follower_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_follower_id = (select auth.uid()) then
    raise exception 'You cannot respond to your own follow request';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.account_status = 'active'
      and (not p.is_minor or p.guardian_consent_status = 'verified')
  ) then
    raise exception 'Your account is not eligible to manage follow requests';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_follower_id
      and p.account_status = 'active'
      and (not p.is_minor or p.guardian_consent_status = 'verified')
  ) then
    raise exception 'That account is not eligible to follow';
  end if;
  if private.profiles_are_blocked(p_follower_id, (select auth.uid())) then
    raise exception 'You cannot respond to a blocked account';
  end if;

  update public.follows
  set status = case when p_accept then 'accepted' else 'rejected' end
  where follower_id = p_follower_id
    and followed_id = (select auth.uid())
    and status = 'pending';

  if not found then
    raise exception 'That follow request is no longer pending';
  end if;
end;
$$;

revoke execute on function public.respond_to_follow_request(uuid, boolean) from public;
revoke execute on function public.respond_to_follow_request(uuid, boolean) from anon;
grant execute on function public.respond_to_follow_request(uuid, boolean) to authenticated;

-- Security definer so a target can review a private requester's public identity
-- without widening the general profile SELECT policy.
create or replace function public.get_my_follow_requests()
returns table (
  follower_id uuid,
  display_name text,
  username text,
  avatar_url text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id, p.display_name, p.username, p.avatar_url, f.created_at
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.followed_id = (select auth.uid())
    and f.status = 'pending'
    and not private.profiles_are_blocked(p.id, f.followed_id)
  order by f.created_at desc
  limit 100;
$$;

revoke execute on function public.get_my_follow_requests() from public;
revoke execute on function public.get_my_follow_requests() from anon;
grant execute on function public.get_my_follow_requests() to authenticated;

create policy "users can read likes on readable posts" on public.post_likes for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id));
create policy "users can like posts" on public.post_likes for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
create policy "users can remove their likes" on public.post_likes for delete to authenticated using (user_id = auth.uid());

create policy "users can read comments on readable posts" on public.comments for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id));
create policy "active users can comment" on public.comments for insert to authenticated with check (author_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_status = 'active') and exists (select 1 from public.posts p where p.id = post_id));
create policy "authors can delete own comments" on public.comments for delete to authenticated using (author_id = auth.uid());

create policy "members can read conversation members" on public.conversation_members for select to authenticated using (private.is_conversation_member(conversation_id));
create policy "active members can read conversations" on public.conversations for select to authenticated using (private.is_conversation_member(id) and not private.conversation_is_blocked(id) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_status = 'active' and (not p.is_minor or p.guardian_consent_status = 'verified')));
create policy "members can read messages" on public.messages for select to authenticated using (private.is_conversation_member(conversation_id) and not private.conversation_is_blocked(conversation_id));
create policy "active members can send messages" on public.messages for insert to authenticated with check (sender_id = auth.uid() and private.is_conversation_member(conversation_id) and not private.conversation_is_blocked(conversation_id) and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_status = 'active' and (not p.is_minor or p.guardian_consent_status = 'verified')));

create policy "users can submit reports" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "users can see their reports" on public.reports for select to authenticated using (reporter_id = auth.uid());
create policy "users can read their blocks" on public.blocks for select to authenticated using (blocker_id = auth.uid() or blocked_id = auth.uid());
create policy "users can block accounts" on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy "users can unblock accounts" on public.blocks for delete to authenticated using (blocker_id = auth.uid());

-- Consent requests are written only through the security definer RPCs below; minors can
-- read their own requests so the pending screen can show the shared link and status.
create policy "minors can read their own consent requests" on public.guardian_consent_requests for select to authenticated using (minor_id = auth.uid());

create or replace function public.create_profile_for_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parsed_dob date;
  calculated_minor boolean;
  requested_username text;
begin
  parsed_dob := (new.raw_user_meta_data ->> 'date_of_birth')::date;
  if parsed_dob is null or parsed_dob > current_date then
    raise exception 'A valid date of birth is required';
  end if;
  calculated_minor := age(current_date, parsed_dob) < interval '18 years';
  requested_username := coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), 'user_' || substr(new.id::text, 1, 12));

  insert into public.profiles (
    id, username, display_name, date_of_birth, country_code, is_minor,
    guardian_consent_status, account_status, profile_visibility, sensitive_content_opt_in
  ) values (
    new.id,
    requested_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), requested_username),
    parsed_dob,
    coalesce(new.raw_user_meta_data ->> 'country', 'IN'),
    calculated_minor,
    case when calculated_minor then 'pending' else 'not_required' end,
    case when calculated_minor then 'pending_guardian'::public.account_status else 'active'::public.account_status end,
    case when calculated_minor then 'private'::public.content_visibility else 'public'::public.content_visibility end,
    false
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_signup();

create or replace function public.protect_profile_safety_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and auth.uid() = old.id then
    if new.date_of_birth is distinct from old.date_of_birth
      or new.is_minor is distinct from old.is_minor
      or new.guardian_consent_status is distinct from old.guardian_consent_status
      or new.account_status is distinct from old.account_status then
      raise exception 'Age, consent, and account status are managed by verified safety workflows';
    end if;
    if old.is_minor and (new.profile_visibility = 'public' or new.sensitive_content_opt_in) then
      raise exception 'Minor accounts must remain private and cannot view sensitive content';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_profile_safety_fields_before_update
  before update on public.profiles
  for each row execute procedure public.protect_profile_safety_fields();

-- Guardian consent flow.
-- Security model: the token is a bearer secret delivered to the guardian. The minor sees it
-- so they can share it, which means this is possession-based consent, not identity
-- verification. Production should deliver the link directly to the guardian's inbox and
-- keep the token out of the minor's UI.
create or replace function public.request_guardian_consent(guardian_email_input text)
returns table (request_token text, request_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  clean_email text := btrim(coalesce(guardian_email_input, ''));
  new_token text;
  new_expiry timestamptz := now() + interval '7 days';
begin
  if caller is null then
    raise exception 'Sign in to request guardian consent';
  end if;

  if clean_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'Enter a valid guardian email address';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = caller and p.is_minor and p.account_status = 'pending_guardian'
  ) then
    raise exception 'This account does not need guardian consent';
  end if;

  update public.guardian_consent_requests r
  set status = 'expired'
  where r.minor_id = caller and r.status = 'pending';

  new_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.guardian_consent_requests (minor_id, guardian_email, token, expires_at)
  values (caller, clean_email, new_token, new_expiry);

  return query select new_token, new_expiry;
end;
$$;

revoke execute on function public.request_guardian_consent(text) from public;
revoke execute on function public.request_guardian_consent(text) from anon;
grant execute on function public.request_guardian_consent(text) to authenticated;

create or replace function public.get_guardian_consent(token_input text)
returns table (
  minor_display_name text,
  minor_username text,
  guardian_email text,
  request_status text,
  request_expires_at timestamptz,
  responded_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  lookup text := btrim(coalesce(token_input, ''));
begin
  if lookup = '' then
    return;
  end if;

  update public.guardian_consent_requests r
  set status = 'expired'
  where r.token = lookup and r.status = 'pending' and r.expires_at < now();

  return query
  select p.display_name, p.username, r.guardian_email, r.status, r.expires_at, r.responded_at
  from public.guardian_consent_requests r
  join public.profiles p on p.id = r.minor_id
  where r.token = lookup;
end;
$$;

revoke execute on function public.get_guardian_consent(text) from public;
grant execute on function public.get_guardian_consent(text) to anon, authenticated;

create or replace function public.respond_to_guardian_consent(
  token_input text,
  decision_input text,
  guardian_name_input text
)
returns table (request_status text, minor_display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  lookup text := btrim(coalesce(token_input, ''));
  decision text := lower(btrim(coalesce(decision_input, '')));
  guardian_full_name text := btrim(coalesce(guardian_name_input, ''));
  consent_request public.guardian_consent_requests%rowtype;
  minor_profile public.profiles%rowtype;
begin
  if decision not in ('approve', 'decline') then
    raise exception 'Unknown consent decision';
  end if;
  if lookup = '' then
    raise exception 'This consent link is invalid';
  end if;
  if decision = 'approve' and char_length(guardian_full_name) < 2 then
    raise exception 'Enter the parent or guardian full name';
  end if;

  select * into consent_request
  from public.guardian_consent_requests r
  where r.token = lookup
  for update;

  if not found then
    raise exception 'This consent link is invalid or has expired';
  end if;
  if consent_request.status <> 'pending' then
    raise exception 'This consent request has already been %', consent_request.status;
  end if;
  if consent_request.expires_at < now() then
    update public.guardian_consent_requests set status = 'expired' where id = consent_request.id;
    raise exception 'This consent link has expired';
  end if;
  if (select auth.uid()) = consent_request.minor_id then
    raise exception 'A parent or guardian must complete this step';
  end if;

  select * into minor_profile from public.profiles p where p.id = consent_request.minor_id;
  if not found then
    raise exception 'This account is not eligible for guardian consent';
  end if;
  if not minor_profile.is_minor then
    raise exception 'This account is not eligible for guardian consent';
  end if;

  if decision = 'approve' then
    if minor_profile.account_status <> 'pending_guardian' then
      raise exception 'This account is not waiting for consent';
    end if;

    update public.profiles
    set guardian_consent_status = 'verified',
        account_status = 'active',
        profile_visibility = 'private',
        sensitive_content_opt_in = false,
        updated_at = now()
    where id = minor_profile.id;

    update public.guardian_consent_requests
    set status = 'approved', guardian_name = guardian_full_name, responded_at = now()
    where id = consent_request.id;

    return query select 'approved'::text, minor_profile.display_name;
    return;
  end if;

  update public.profiles
  set guardian_consent_status = 'rejected', updated_at = now()
  where id = minor_profile.id;

  update public.guardian_consent_requests
  set status = 'declined', guardian_name = nullif(guardian_full_name, ''), responded_at = now()
  where id = consent_request.id;

  return query select 'declined'::text, minor_profile.display_name;
end;
$$;

revoke execute on function public.respond_to_guardian_consent(text, text, text) from public;
grant execute on function public.respond_to_guardian_consent(text, text, text) to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "users can upload their own avatar" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users can update their own avatar" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users can view avatars for visible profiles" on storage.objects for select to authenticated using (bucket_id = 'avatars' and exists (
  select 1 from public.profiles p
  where p.id::text = (storage.foldername(name))[1]
    and (
      p.id = auth.uid()
      or (
        p.account_status = 'active'
        and exists (
          select 1 from public.profiles viewer
          where viewer.id = auth.uid()
            and viewer.account_status = 'active'
            and (not viewer.is_minor or viewer.guardian_consent_status = 'verified')
        )
        and (
          (p.profile_visibility = 'public' and (not p.is_minor or p.guardian_consent_status = 'verified') and not private.profiles_are_blocked(auth.uid(), p.id))
          or private.follow_is_eligible(auth.uid(), p.id)
        )
      )
    )
));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', false, 52428800, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm'
])
on conflict (id) do nothing;

create policy "users can upload their own post media" on storage.objects for insert to authenticated with check (
  bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "users can delete their own post media" on storage.objects for delete to authenticated using (
  bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "users can read post media for visible reviewed posts" on storage.objects for select to authenticated using (
  bucket_id = 'post-media' and exists (
    select 1
    from public.posts p
    join public.profiles viewer on viewer.id = auth.uid() and viewer.account_status = 'active'
    where (p.media_key = storage.objects.name or p.thumbnail_key = storage.objects.name)
      and p.sensitive_review_status = 'safe'
      and (
        p.author_id = auth.uid()
        or (p.visibility = 'public' and exists (
          select 1 from public.profiles author
          where author.id = p.author_id and author.account_status = 'active'
            and (not author.is_minor or author.guardian_consent_status = 'verified')
        ) and not private.profiles_are_blocked(auth.uid(), p.author_id))
        or (p.visibility = 'followers' and private.follow_is_eligible(auth.uid(), p.author_id))
      )
  )
);

-- ============================================================================
-- Redesign additions
-- Apply this block to an existing project: it is written to be idempotent.
-- ============================================================================

-- Post topics power the Explore filters and the composer's topic chips.
alter table public.posts add column if not exists topic text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_topic_check') then
    alter table public.posts
      add constraint posts_topic_check
      check (topic is null or topic in ('Travel', 'Food', 'Style', 'Art', 'Technology', 'Lifestyle', 'Wellness'));
  end if;
end
$$;
create index if not exists posts_topic_created_idx on public.posts(topic, created_at desc);

-- Saved posts back the bookmark action and the Saved tab on a profile.
create table if not exists public.saved_posts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists saved_posts_user_created_idx on public.saved_posts(user_id, created_at desc);
alter table public.saved_posts enable row level security;

drop policy if exists "users can read their saved posts" on public.saved_posts;
create policy "users can read their saved posts" on public.saved_posts
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "users can save readable posts" on public.saved_posts;
create policy "users can save readable posts" on public.saved_posts
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id)
  );

drop policy if exists "users can remove their saved posts" on public.saved_posts;
create policy "users can remove their saved posts" on public.saved_posts
  for delete to authenticated using (user_id = auth.uid());

-- Start (or reuse) a one-to-one conversation. Without this, members have no
-- insert policy on conversations/conversation_members and cannot begin a chat.
create or replace function public.start_conversation(peer_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  existing_id uuid;
  new_id uuid;
begin
  if me is null then
    raise exception 'You must be signed in to start a conversation';
  end if;
  if peer_profile_id = me then
    raise exception 'You cannot message yourself';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = peer_profile_id
      and p.account_status = 'active'
      and (not p.is_minor or p.guardian_consent_status = 'verified')
  ) then
    raise exception 'That account is not available';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = me and b.blocked_id = peer_profile_id)
       or (b.blocker_id = peer_profile_id and b.blocked_id = me)
  ) then
    raise exception 'This conversation is not available';
  end if;

  select c.id into existing_id
  from public.conversations c
  join public.conversation_members mine on mine.conversation_id = c.id and mine.user_id = me
  join public.conversation_members theirs on theirs.conversation_id = c.id and theirs.user_id = peer_profile_id
  where (select count(*) from public.conversation_members cm where cm.conversation_id = c.id) = 2
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  insert into public.conversations default values returning id into new_id;
  insert into public.conversation_members (conversation_id, user_id)
  values (new_id, me), (new_id, peer_profile_id);
  return new_id;
end;
$$;

revoke execute on function public.start_conversation(uuid) from public;
revoke execute on function public.start_conversation(uuid) from anon;
grant execute on function public.start_conversation(uuid) to authenticated;

-- Derived notification feed: likes/comments on my posts plus new followers.
-- There is no notifications table, so this is computed from real activity.
create or replace function public.get_my_notifications()
returns table (
  notification_type text,
  actor_id uuid,
  actor_display_name text,
  actor_username text,
  actor_avatar_url text,
  post_id uuid,
  post_caption text,
  post_media_key text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  with me as (
    select auth.uid() as id
  ),
  activity as (
    select
      'like'::text as notification_type,
      actor.id as actor_id,
      actor.display_name as actor_display_name,
      actor.username as actor_username,
      actor.avatar_url as actor_avatar_url,
      p.id as post_id,
      p.caption as post_caption,
      p.media_key as post_media_key,
      pl.created_at as created_at
    from public.post_likes pl
    join public.posts p on p.id = pl.post_id
    join public.profiles actor on actor.id = pl.user_id
    where p.author_id = (select id from me)
      and pl.user_id <> (select id from me)
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = p.author_id and b.blocked_id = pl.user_id)
           or (b.blocker_id = pl.user_id and b.blocked_id = p.author_id)
      )
    union all
    select
      'comment'::text,
      actor.id,
      actor.display_name,
      actor.username,
      actor.avatar_url,
      p.id,
      p.caption,
      p.media_key,
      c.created_at
    from public.comments c
    join public.posts p on p.id = c.post_id
    join public.profiles actor on actor.id = c.author_id
    where p.author_id = (select id from me)
      and c.author_id <> (select id from me)
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = p.author_id and b.blocked_id = c.author_id)
           or (b.blocker_id = c.author_id and b.blocked_id = p.author_id)
      )
    union all
    select
      'follow'::text,
      actor.id,
      actor.display_name,
      actor.username,
      actor.avatar_url,
      null::uuid,
      null::text,
      null::text,
      f.created_at
    from public.follows f
    join public.profiles actor on actor.id = f.follower_id
    where f.followed_id = (select id from me)
      and f.status = 'pending'
      and f.follower_id <> (select id from me)
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = f.followed_id and b.blocked_id = f.follower_id)
           or (b.blocker_id = f.follower_id and b.blocked_id = f.followed_id)
      )
  )
  select
    activity.notification_type,
    activity.actor_id,
    activity.actor_display_name,
    activity.actor_username,
    activity.actor_avatar_url,
    activity.post_id,
    activity.post_caption,
    activity.post_media_key,
    activity.created_at
  from activity
  order by activity.created_at desc
  limit 60;
$$;

revoke execute on function public.get_my_notifications() from public;
revoke execute on function public.get_my_notifications() from anon;
grant execute on function public.get_my_notifications() to authenticated;

/* =============================================================================
 * Redesign additions — safe to re-apply to an existing database.
 * Support data is strictly user-owned. Support replies and AI answers are
 * written with the service role (Edge Function / admin tooling), never by the
 * browser, so a client cannot impersonate staff or change ticket status.
 * =========================================================================== */

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null check (char_length(subject) between 3 and 140),
  category text not null check (category in ('account', 'safety', 'content', 'reelyx', 'other')),
  status text not null default 'open' check (status in ('open', 'pending', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  author_role text not null check (author_role in ('user', 'support')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 180),
  content_type text not null check (char_length(content_type) between 1 and 120),
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  created_at timestamptz not null default now()
);

-- Assistant replies are persisted by the Edge Function with the service role.
-- There is deliberately no INSERT policy for authenticated clients.
create table if not exists public.support_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_user_updated_idx on public.support_tickets(user_id, updated_at desc);
create index if not exists support_ticket_messages_ticket_created_idx on public.support_ticket_messages(ticket_id, created_at);
create index if not exists support_ticket_attachments_ticket_created_idx on public.support_ticket_attachments(ticket_id, created_at);
create index if not exists support_chat_messages_user_created_idx on public.support_chat_messages(user_id, created_at desc);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.support_ticket_attachments enable row level security;
alter table public.support_chat_messages enable row level security;

drop policy if exists "users can read own support tickets" on public.support_tickets;
create policy "users can read own support tickets" on public.support_tickets
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "users can open support tickets" on public.support_tickets;
create policy "users can open support tickets" on public.support_tickets
  for insert to authenticated with check (user_id = auth.uid() and status = 'open');

-- Status and staff replies are changed only through the RPCs below or service-role code.

drop policy if exists "users can read replies on own tickets" on public.support_ticket_messages;
create policy "users can read replies on own tickets" on public.support_ticket_messages
  for select to authenticated using (
    exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
  );

drop policy if exists "users can add their own ticket messages" on public.support_ticket_messages;
create policy "users can add their own ticket messages" on public.support_ticket_messages
  for insert to authenticated with check (
    author_role = 'user'
    and author_id = auth.uid()
    and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
  );

drop policy if exists "users can read own support attachments" on public.support_ticket_attachments;
create policy "users can read own support attachments" on public.support_ticket_attachments
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "users can attach files to own tickets" on public.support_ticket_attachments;
create policy "users can attach files to own tickets" on public.support_ticket_attachments
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
  );

drop policy if exists "users can remove own support attachments" on public.support_ticket_attachments;
create policy "users can remove own support attachments" on public.support_ticket_attachments
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "users can read own support chat" on public.support_chat_messages;
create policy "users can read own support chat" on public.support_chat_messages
  for select to authenticated using (user_id = auth.uid());

create or replace function public.touch_support_ticket_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_tickets set updated_at = now() where id = new.ticket_id;
  return new;
end;
$$;

drop trigger if exists support_ticket_messages_touch on public.support_ticket_messages;
create trigger support_ticket_messages_touch
after insert on public.support_ticket_messages
for each row execute function public.touch_support_ticket_on_message();

create or replace function public.set_my_support_ticket_status(p_ticket_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('open', 'resolved', 'closed') then
    raise exception 'Unsupported status';
  end if;
  update public.support_tickets
     set status = p_status, updated_at = now()
   where id = p_ticket_id and user_id = auth.uid();
  if not found then
    raise exception 'Ticket not found';
  end if;
end;
$$;

revoke execute on function public.set_my_support_ticket_status(uuid, text) from public;
revoke execute on function public.set_my_support_ticket_status(uuid, text) from anon;
grant execute on function public.set_my_support_ticket_status(uuid, text) to authenticated;

create or replace function public.get_my_support_stats()
returns table (open_count bigint, pending_count bigint, resolved_count bigint, closed_count bigint, total_count bigint)
language sql
security definer
set search_path = ''
stable
as $$
  select
    count(*) filter (where status = 'open')::bigint,
    count(*) filter (where status = 'pending')::bigint,
    count(*) filter (where status = 'resolved')::bigint,
    count(*) filter (where status = 'closed')::bigint,
    count(*)::bigint
  from public.support_tickets
  where user_id = auth.uid();
$$;

revoke execute on function public.get_my_support_stats() from public;
revoke execute on function public.get_my_support_stats() from anon;
grant execute on function public.get_my_support_stats() to authenticated;

-- Reelyx creator counts are public activity, read through a definer so RLS on
-- follows cannot vary the number shown in the player overlay.
create or replace function public.get_reelyx_creator_stats(creator_ids uuid[])
returns table (creator_id uuid, follower_count bigint, following_count bigint)
language sql
security definer
set search_path = ''
stable
as $$
  select
    creator.id as creator_id,
    (select count(*) from public.follows f where f.followed_id = creator.id and f.status = 'accepted')::bigint as follower_count,
    (select count(*) from public.follows f where f.follower_id = creator.id and f.status = 'accepted')::bigint as following_count
  from unnest(creator_ids) as creator(id);
$$;

revoke execute on function public.get_reelyx_creator_stats(uuid[]) from public;
revoke execute on function public.get_reelyx_creator_stats(uuid[]) from anon;
grant execute on function public.get_reelyx_creator_stats(uuid[]) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users can upload support attachments" on storage.objects;
create policy "users can upload support attachments" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users can read their support attachments" on storage.objects;
create policy "users can read their support attachments" on storage.objects
  for select to authenticated using (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.support_ticket_attachments a
      where a.storage_path = name and a.user_id = auth.uid()
    )
  );

drop policy if exists "users can delete their support attachments" on storage.objects;
create policy "users can delete their support attachments" on storage.objects
  for delete to authenticated using (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
