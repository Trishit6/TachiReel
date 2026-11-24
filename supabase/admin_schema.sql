/* =============================================================================
 * TachiReel Admin Panel — additive, idempotent Supabase migration.
 *
 * Apply this AFTER supabase/schema.sql. It never rewrites user data. Every
 * privileged operation is a SECURITY DEFINER RPC that checks the caller's
 * admin role in Postgres. The browser never receives a service-role key and
 * cannot grant itself a role.
 *
 * Bootstrap the first Super Admin with the SQL at the bottom of this file.
 * =========================================================================== */

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Roles and private authorization helpers
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'admin_role'
  ) then
    create type public.admin_role as enum ('super_admin', 'content_moderator', 'support_agent', 'analyst');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'report_status' and e.enumlabel = 'escalated'
  ) then
    alter type public.report_status add value 'escalated';
  end if;
end $$;

create table if not exists public.admin_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role public.admin_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.admin_roles enable row level security;

create schema if not exists private;
grant usage on schema private to authenticated;

create table if not exists private.admin_rate_limits (
  actor_id uuid not null,
  action text not null,
  window_start timestamptz not null default now(),
  hit_count integer not null default 1,
  primary key (actor_id, action)
);

create or replace function private.admin_permissions_for_role(p_role public.admin_role)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'super_admin' then array[
      'admin.manage', 'users.view', 'users.suspend', 'users.verify_minor', 'users.delete',
      'posts.manage', 'posts.view', 'reelyx.manage', 'reelyx.view',
      'comments.manage', 'comments.view', 'reports.manage', 'reports.view',
      'tickets.view', 'tickets.manage', 'help.manage',
      'notifications.view', 'notifications.manage',
      'settings.manage', 'audit.view', 'analytics.view'
    ]::text[]
    when 'content_moderator' then array[
      'users.view', 'users.suspend', 'posts.manage', 'posts.view',
      'reelyx.manage', 'reelyx.view', 'comments.manage', 'comments.view',
      'reports.manage', 'reports.view', 'analytics.view'
    ]::text[]
    when 'support_agent' then array[
      'users.view', 'tickets.view', 'tickets.manage', 'help.manage',
      'notifications.view', 'notifications.manage', 'reports.view',
      'analytics.view'
    ]::text[]
    when 'analyst' then array[
      'users.view', 'posts.view', 'reelyx.view', 'comments.view',
      'reports.view', 'tickets.view', 'notifications.view',
      'analytics.view', 'audit.view'
    ]::text[]
    else array[]::text[]
  end;
$$;

create or replace function private.has_admin_permission(p_permission text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.admin_roles r
    where r.user_id = auth.uid()
      and r.is_active
      and p_permission = any (private.admin_permissions_for_role(r.role))
  );
$$;

create or replace function private.require_admin_permission(p_permission text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_admin_permission(p_permission) then
    raise exception using
      message = 'You do not have permission to perform this administrative action.',
      errcode = '42501';
  end if;
end;
$$;

create or replace function private.check_admin_rate_limit(
  p_action text,
  p_limit integer default 20,
  p_window_seconds integer default 60
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_count integer;
begin
  select window_start, hit_count into v_start, v_count
  from private.admin_rate_limits
  where actor_id = auth.uid() and action = p_action;

  if v_start is null or now() - v_start > make_interval(secs => p_window_seconds) then
    insert into private.admin_rate_limits (actor_id, action, window_start, hit_count)
    values (auth.uid(), p_action, now(), 1)
    on conflict (actor_id, action)
    do update set window_start = now(), hit_count = 1;
    v_count := 1;
  else
    update private.admin_rate_limits
    set hit_count = hit_count + 1
    where actor_id = auth.uid() and action = p_action
    returning hit_count into v_count;
  end if;

  if v_count > p_limit then
    raise exception using
      message = 'Too many administrative actions. Please wait a moment and try again.',
      errcode = '42900';
  end if;
end;
$$;

create or replace function private.current_admin_role()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select r.role::text
  from public.admin_roles r
  where r.user_id = auth.uid() and r.is_active
  limit 1;
$$;

create or replace function private.write_admin_audit(
  p_action text,
  p_resource text,
  p_resource_id text,
  p_changes jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb := '{}'::jsonb;
begin
  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  insert into public.admin_audit_logs (
    actor_id, actor_role, action, resource, resource_id, changes, metadata
  ) values (
    auth.uid(),
    private.current_admin_role(),
    p_action,
    p_resource,
    p_resource_id,
    coalesce(p_changes, '{}'::jsonb),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'user_agent', nullif(v_headers ->> 'user-agent', '')
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- New tables and additive columns
-- -----------------------------------------------------------------------------

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  action text not null,
  resource text not null,
  resource_id text,
  changes jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_logs enable row level security;
create index if not exists admin_audit_created_idx on public.admin_audit_logs(created_at desc);
create index if not exists admin_audit_resource_idx on public.admin_audit_logs(resource, resource_id);
create index if not exists admin_audit_actor_idx on public.admin_audit_logs(actor_id, created_at desc);

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 160),
  body text not null check (char_length(body) between 3 and 2000),
  type text not null default 'general' check (type in ('general', 'maintenance', 'policy', 'account')),
  audience text not null default 'all' check (audience in ('all', 'selected')),
  target_user_ids uuid[] not null default '{}'::uuid[],
  template_key text,
  status text not null default 'draft' check (status in ('draft', 'sent')),
  created_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.admin_notifications enable row level security;
create index if not exists admin_notifications_created_idx on public.admin_notifications(created_at desc);

create table if not exists public.admin_notification_recipients (
  notification_id uuid not null references public.admin_notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  read_at timestamptz,
  primary key (notification_id, user_id)
);

alter table public.admin_notification_recipients enable row level security;
create index if not exists admin_notification_recipients_user_idx on public.admin_notification_recipients(user_id, delivered_at desc);

create table if not exists public.admin_notification_templates (
  key text primary key check (char_length(key) between 2 and 60),
  title text not null check (char_length(title) between 3 and 160),
  body text not null check (char_length(body) between 3 and 2000),
  type text not null default 'general' check (type in ('general', 'maintenance', 'policy', 'account')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.admin_notification_templates enable row level security;

create table if not exists public.admin_help_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (char_length(slug) between 2 and 60),
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.admin_help_categories enable row level security;

create table if not exists public.admin_help_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (char_length(slug) between 2 and 80),
  category_slug text,
  title text not null check (char_length(title) between 3 and 140),
  summary text not null default '' check (char_length(summary) <= 300),
  minutes integer not null default 2 check (minutes between 1 and 30),
  keywords text[] not null default '{}'::text[],
  sections jsonb not null default '[]'::jsonb,
  is_published boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_help_articles enable row level security;
create index if not exists admin_help_articles_published_idx on public.admin_help_articles(is_published, updated_at desc);

create table if not exists public.admin_help_faqs (
  id uuid primary key default gen_random_uuid(),
  category_slug text,
  question text not null check (char_length(question) between 3 and 240),
  answer text not null check (char_length(answer) between 3 and 1000),
  article_slug text,
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_help_faqs enable row level security;

create table if not exists public.admin_platform_settings (
  key text primary key check (char_length(key) between 2 and 80),
  value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.admin_platform_settings enable row level security;

create table if not exists public.admin_user_warnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 500),
  issued_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.admin_user_warnings enable row level security;
create index if not exists admin_user_warnings_user_idx on public.admin_user_warnings(user_id, created_at desc);

create table if not exists public.support_ticket_internal_notes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.support_ticket_internal_notes enable row level security;
create index if not exists support_internal_notes_ticket_idx on public.support_ticket_internal_notes(ticket_id, created_at);

alter table public.posts add column if not exists is_featured boolean not null default false;
alter table public.posts add column if not exists removed_at timestamptz;
alter table public.posts add column if not exists removed_by uuid references public.profiles(id) on delete set null;

alter table public.comments add column if not exists moderation_status text not null default 'visible';
alter table public.comments add column if not exists moderated_at timestamptz;
alter table public.comments add column if not exists moderated_by uuid references public.profiles(id) on delete set null;

alter table public.reports add column if not exists category text not null default 'other';
alter table public.reports add column if not exists priority text not null default 'normal';
alter table public.reports add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.reports add column if not exists resolution_notes text not null default '';
alter table public.reports add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.reports add column if not exists updated_at timestamptz not null default now();

alter table public.support_tickets add column if not exists priority text not null default 'normal';
alter table public.support_tickets add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

alter table public.support_tickets drop constraint if exists support_tickets_status_check;
alter table public.support_tickets add constraint support_tickets_status_check
  check (status in ('open', 'in_progress', 'waiting_for_user', 'pending', 'resolved', 'closed'));

alter table public.support_tickets drop constraint if exists support_tickets_priority_check;
alter table public.support_tickets add constraint support_tickets_priority_check
  check (priority in ('low', 'normal', 'high', 'urgent'));

alter table public.comments drop constraint if exists comments_moderation_status_check;
alter table public.comments add constraint comments_moderation_status_check
  check (moderation_status in ('visible', 'removed', 'under_review'));

alter table public.reports drop constraint if exists reports_priority_check;
alter table public.reports add constraint reports_priority_check
  check (priority in ('low', 'normal', 'high', 'urgent'));

alter table public.reports drop constraint if exists reports_category_check;
alter table public.reports add constraint reports_category_check
  check (category in ('inappropriate', 'harassment', 'spam', 'fake_account', 'impersonation', 'copyright', 'other'));

create index if not exists reports_assigned_idx on public.reports(assigned_to, status, created_at desc);
create index if not exists support_tickets_assigned_idx on public.support_tickets(assigned_to, status, updated_at desc);
create index if not exists support_tickets_priority_idx on public.support_tickets(priority, status);
create index if not exists posts_featured_idx on public.posts(is_featured, media_type, created_at desc);
create index if not exists comments_moderation_idx on public.comments(moderation_status, created_at desc);

-- Admins must be able to preview private media for moderation. User policies stay intact.
drop policy if exists "admins can read post media" on storage.objects;
create policy "admins can read post media" on storage.objects for select to authenticated
using (bucket_id = 'post-media' and private.has_admin_permission('posts.manage'));

drop policy if exists "admins can read avatars" on storage.objects;
create policy "admins can read avatars" on storage.objects for select to authenticated
using (bucket_id = 'avatars' and private.has_admin_permission('users.view'));

drop policy if exists "admins can read support attachments" on storage.objects;
create policy "admins can read support attachments" on storage.objects for select to authenticated
using (bucket_id = 'support-attachments' and private.has_admin_permission('tickets.manage'));

-- Close the author self-approval loophole without blocking service-role tooling.
create or replace function public.protect_post_review_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and new.sensitive_review_status is distinct from old.sensitive_review_status
     and not private.has_admin_permission('posts.manage') then
    raise exception 'Review status can only be changed by authorized administrators';
  end if;
  if auth.uid() is not null
     and new.is_featured is distinct from old.is_featured
     and not private.has_admin_permission('reelyx.manage') then
    raise exception 'Featured status can only be changed by authorized administrators';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_post_review_fields_before_update on public.posts;
create trigger protect_post_review_fields_before_update
  before update on public.posts
  for each row execute procedure public.protect_post_review_fields();

-- Keep existing derived notifications and add database-backed announcements.
drop function if exists public.get_my_notifications();

create or replace function public.get_my_notifications()
returns table (
  notification_id uuid,
  notification_type text,
  notification_title text,
  notification_body text,
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
  with me as (select auth.uid() as id),
  activity as (
    select
      gen_random_uuid() as notification_id,
      'like'::text as notification_type,
      'New like'::text as notification_title,
      actor.display_name || ' liked your moment.'::text as notification_body,
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
      gen_random_uuid(), 'comment'::text, 'New comment'::text,
      actor.display_name || ' commented on your moment.'::text,
      actor.id, actor.display_name, actor.username, actor.avatar_url,
      p.id, p.caption, p.media_key, c.created_at
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
      gen_random_uuid(), 'follow'::text, 'New follower'::text,
      actor.display_name || ' started following you.'::text,
      actor.id, actor.display_name, actor.username, actor.avatar_url,
      null::uuid, null::text, null::text, f.created_at
    from public.follows f
    join public.profiles actor on actor.id = f.follower_id
    where f.followed_id = (select id from me)
      and f.status = 'accepted'
      and f.follower_id <> (select id from me)
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = f.followed_id and b.blocked_id = f.follower_id)
           or (b.blocker_id = f.follower_id and b.blocked_id = f.follower_id)
      )
    union all
    select
      n.id, 'announcement'::text, n.title, n.body,
      null::uuid, null::text, null::text, null::text,
      null::uuid, null::text, null::text, n.sent_at
    from public.admin_notifications n
    where n.status = 'sent'
      and n.sent_at is not null
      and (
        n.audience = 'all'
        or auth.uid() = any(n.target_user_ids)
        or exists (
          select 1 from public.admin_notification_recipients r
          where r.notification_id = n.id and r.user_id = auth.uid()
        )
      )
  )
  select
    activity.notification_id,
    activity.notification_type,
    activity.notification_title,
    activity.notification_body,
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
  limit 100;
$$;

revoke all on function public.get_my_notifications() from public;
revoke all on function public.get_my_notifications() from anon;
grant execute on function public.get_my_notifications() to authenticated;

-- -----------------------------------------------------------------------------
-- Access and dashboard
-- -----------------------------------------------------------------------------

create or replace function public.admin_get_my_access()
returns table (
  user_id uuid,
  role text,
  permissions text[],
  display_name text,
  username text,
  avatar_url text,
  email text
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    r.user_id,
    r.role::text,
    private.admin_permissions_for_role(r.role),
    p.display_name,
    p.username,
    p.avatar_url,
    u.email
  from public.admin_roles r
  join public.profiles p on p.id = r.user_id
  left join auth.users u on u.id = r.user_id
  where r.user_id = auth.uid() and r.is_active;
$$;

create or replace function public.admin_analytics(
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_from date;
  v_to date;
  v_result jsonb;
begin
  perform private.require_admin_permission('analytics.view');

  v_from := least(coalesce(p_from, now() - interval '30 days'), coalesce(p_to, now()))::date;
  v_to := coalesce(p_to, now())::date;
  if v_to - v_from > 365 then
    v_from := v_to - 365;
  end if;

  with days as (
    select generate_series(v_from, v_to, interval '1 day')::date as day
  ), registrations as (
    select created_at::date as day, count(*)::int as value
    from public.profiles
    where created_at::date between v_from and v_to
    group by 1
  ), posts_published as (
    select created_at::date as day, count(*)::int as value
    from public.posts
    where media_type = 'photo' and created_at::date between v_from and v_to
    group by 1
  ), reelyx_published as (
    select created_at::date as day, count(*)::int as value
    from public.posts
    where media_type = 'video' and created_at::date between v_from and v_to
    group by 1
  ), engagement as (
    select day, sum(value)::int as value from (
      select created_at::date as day, count(*)::int as value from public.post_likes where created_at::date between v_from and v_to group by 1
      union all
      select created_at::date as day, count(*)::int as value from public.comments where created_at::date between v_from and v_to group by 1
    ) e group by day
  ), reports_made as (
    select created_at::date as day, count(*)::int as value
    from public.reports
    where created_at::date between v_from and v_to
    group by 1
  ), tickets_opened as (
    select created_at::date as day, count(*)::int as value
    from public.support_tickets
    where created_at::date between v_from and v_to
    group by 1
  ), activity as (
    select created_at as ts, author_id as user_id from public.posts
    union all select created_at, user_id from public.post_likes
    union all select created_at, author_id from public.comments
    union all select created_at, sender_id from public.messages
    union all select created_at, follower_id from public.follows
    union all select created_at, author_id from public.support_ticket_messages
  ), dau as (
    select ts::date as day, count(distinct user_id)::int as value
    from activity where ts::date between v_from and v_to group by 1
  ), months as (
    select generate_series(date_trunc('month', v_from::timestamp), v_to::timestamp, interval '1 month')::date as month
  ), mau as (
    select date_trunc('month', ts)::date as month, count(distinct user_id)::int as value
    from activity where ts::date between v_from and v_to group by 1
  ), monthly_registrations as (
    select date_trunc('month', created_at)::date as month, count(*)::int as value
    from public.profiles where created_at::date between v_from and v_to group by 1
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to),
    'registrations', coalesce((select jsonb_agg(jsonb_build_object('date', d.day, 'value', coalesce(r.value, 0)) order by d.day) from days d left join registrations r on r.day = d.day), '[]'::jsonb),
    'daily_active_users', coalesce((select jsonb_agg(jsonb_build_object('date', d.day, 'value', coalesce(a.value, 0)) order by d.day) from days d left join dau a on a.day = d.day), '[]'::jsonb),
    'monthly_active_users', coalesce((select jsonb_agg(jsonb_build_object('date', m.month, 'value', coalesce(a.value, 0)) order by m.month) from months m left join mau a on a.month = m.month), '[]'::jsonb),
    'monthly_registrations', coalesce((select jsonb_agg(jsonb_build_object('date', m.month, 'value', coalesce(r.value, 0)) order by m.month) from months m left join monthly_registrations r on r.month = m.month), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('date', d.day, 'value', coalesce(x.value, 0)) order by d.day) from days d left join posts_published x on x.day = d.day), '[]'::jsonb),
    'reelyx', coalesce((select jsonb_agg(jsonb_build_object('date', d.day, 'value', coalesce(x.value, 0)) order by d.day) from days d left join reelyx_published x on x.day = d.day), '[]'::jsonb),
    'engagement', coalesce((select jsonb_agg(jsonb_build_object('date', d.day, 'value', coalesce(x.value, 0)) order by d.day) from days d left join engagement x on x.day = d.day), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('date', d.day, 'value', coalesce(x.value, 0)) order by d.day) from days d left join reports_made x on x.day = d.day), '[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(jsonb_build_object('date', d.day, 'value', coalesce(x.value, 0)) order by d.day) from days d left join tickets_opened x on x.day = d.day), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.admin_dashboard(
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
security definer stable
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.require_admin_permission('analytics.view');

  select jsonb_build_object(
    'stats', jsonb_build_object(
      'total_users', (select count(*)::int from public.profiles),
      'active_users', (select count(*)::int from public.profiles where account_status = 'active'),
      'new_users', (select count(*)::int from public.profiles where created_at between p_from and p_to),
      'total_posts', (select count(*)::int from public.posts),
      'total_reelyx', (select count(*)::int from public.posts where media_type = 'video'),
      'pending_reports', (select count(*)::int from public.reports where status in ('open', 'reviewing')),
      'open_tickets', (select count(*)::int from public.support_tickets where status not in ('resolved', 'closed')),
      'suspended_accounts', (select count(*)::int from public.profiles where account_status = 'suspended'),
      'pending_content', (select count(*)::int from public.posts where sensitive_review_status = 'pending')
    ),
    'analytics', public.admin_analytics(p_from, p_to),
    'recent_registrations', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select p.id, p.display_name, p.username, p.avatar_url, p.created_at
        from public.profiles p where p.created_at between p_from and p_to
        order by p.created_at desc limit 6
      ) x
    ), '[]'::jsonb),
    'recent_posts', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select p.id, p.caption, p.media_type, p.sensitive_review_status, p.created_at,
               pr.display_name, pr.username
        from public.posts p join public.profiles pr on pr.id = p.author_id
        where p.created_at between p_from and p_to
        order by p.created_at desc limit 6
      ) x
    ), '[]'::jsonb),
    'recent_reports', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select r.id, r.category, r.priority, r.status, r.reason, r.created_at,
               reporter.username as reporter_username, reported.username as reported_username
        from public.reports r
        left join public.profiles reporter on reporter.id = r.reporter_id
        left join public.profiles reported on reported.id = r.reported_user_id
        where r.created_at between p_from and p_to
        order by r.created_at desc limit 6
      ) x
    ), '[]'::jsonb),
    'recent_tickets', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select t.id, t.subject, t.category, t.status, t.priority, t.created_at,
               p.username, p.display_name
        from public.support_tickets t join public.profiles p on p.id = t.user_id
        where t.created_at between p_from and p_to
        order by t.created_at desc limit 6
      ) x
    ), '[]'::jsonb),
    'recent_admin_actions', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select a.id, a.action, a.resource, a.resource_id, a.actor_role, a.created_at,
               p.username as actor_username
        from public.admin_audit_logs a
        left join public.profiles p on p.id = a.actor_id
        where a.created_at between p_from and p_to
        order by a.created_at desc limit 8
      ) x
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- User management
-- -----------------------------------------------------------------------------

create or replace function public.admin_list_users(
  p_search text default '',
  p_status text default '',
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_sort text default 'created_at',
  p_dir text default 'desc',
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql security definer stable set search_path = ''
as $$
declare
  v_total bigint;
  v_items jsonb;
begin
  perform private.require_admin_permission('users.view');
  p_limit := least(greatest(coalesce(p_limit, 25), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  p_dir := case when lower(coalesce(p_dir, 'desc')) = 'asc' then 'asc' else 'desc' end;
  p_sort := coalesce(p_sort, 'created_at');

  with filtered as (
    select
      p.id, p.username, p.display_name, p.avatar_url, p.account_status::text as account_status,
      p.guardian_consent_status, p.profile_visibility::text as profile_visibility,
      p.is_minor, p.created_at, u.email, r.role::text as admin_role,
      (select count(*)::int from public.posts x where x.author_id = p.id) as post_count,
      (select count(*)::int from public.posts x where x.author_id = p.id and x.media_type = 'video') as reelyx_count,
      (select count(*)::int from public.reports x where x.reported_user_id = p.id) as report_count,
      (select count(*)::int from public.admin_user_warnings x where x.user_id = p.id) as warning_count
    from public.profiles p
    left join auth.users u on u.id = p.id
    left join public.admin_roles r on r.user_id = p.id and r.is_active
    where (p_search is null or p_search = '' or
      p.display_name ilike '%' || p_search || '%' or
      p.username ilike '%' || p_search || '%' or
      coalesce(u.email, '') ilike '%' || p_search || '%' or
      p.id::text ilike '%' || p_search || '%')
      and (p_status is null or p_status = '' or p.account_status::text = p_status)
      and (p_from is null or p.created_at >= p_from)
      and (p_to is null or p.created_at <= p_to)
  ), counted as (select count(*) as total from filtered)
  select total into v_total from counted;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_items
  from (
    select * from filtered
    order by
      case when p_dir = 'asc' then
        case p_sort
          when 'name' then lower(display_name)
          when 'username' then lower(username)
          when 'email' then lower(coalesce(email, ''))
          when 'status' then account_status
          else created_at::text
        end
      end asc nulls last,
      case when p_dir = 'desc' then
        case p_sort
          when 'name' then lower(display_name)
          when 'username' then lower(username)
          when 'email' then lower(coalesce(email, ''))
          when 'status' then account_status
          else created_at::text
        end
      end desc nulls last
    limit p_limit offset p_offset
  ) x;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$$;

create or replace function public.admin_get_user(p_user_id uuid)
returns jsonb
language plpgsql security definer stable set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.require_admin_permission('users.view');

  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name,
      'avatar_url', p.avatar_url, 'bio', p.bio, 'email', u.email,
      'account_status', p.account_status::text, 'guardian_consent_status', p.guardian_consent_status,
      'profile_visibility', p.profile_visibility::text, 'is_minor', p.is_minor,
      'created_at', p.created_at, 'admin_role', r.role::text
    ),
    'counts', jsonb_build_object(
      'posts', (select count(*)::int from public.posts x where x.author_id = p.id),
      'reelyx', (select count(*)::int from public.posts x where x.author_id = p.id and x.media_type = 'video'),
      'reports', (select count(*)::int from public.reports x where x.reported_user_id = p.id),
      'warnings', (select count(*)::int from public.admin_user_warnings x where x.user_id = p.id)
    ),
    'posts', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select id, caption, media_type, media_key, sensitive_review_status, created_at
        from public.posts where author_id = p.id order by created_at desc limit 12
      ) x
    ), '[]'::jsonb),
    'reelyx', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select id, caption, media_key, thumbnail_key, sensitive_review_status, is_featured, created_at
        from public.posts where author_id = p.id and media_type = 'video' order by created_at desc limit 12
      ) x
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select id, category, reason, status, priority, created_at from public.reports
        where reported_user_id = p.id order by created_at desc limit 12
      ) x
    ), '[]'::jsonb),
    'warnings', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
        select id, reason, created_at from public.admin_user_warnings
        where user_id = p.id order by created_at desc limit 12
      ) x
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object('type', x.type, 'at', x.at, 'label', x.label) order by x.at desc) from (
        select 'post'::text as type, created_at as at, 'Published a post'::text as label from public.posts where author_id = p.id
        union all select 'comment'::text, created_at, 'Added a comment'::text from public.comments where author_id = p.id
        union all select 'like'::text, created_at, 'Liked a post'::text from public.post_likes where user_id = p.id
        union all select 'follow'::text, created_at, 'Followed someone'::text from public.follows where follower_id = p.id
        union all select 'ticket'::text, created_at, 'Opened a support ticket'::text from public.support_tickets where user_id = p.id
      ) x order by x.at desc limit 20
    ), '[]'::jsonb)
  ) into v_result
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.admin_roles r on r.user_id = p.id and r.is_active
  where p.id = p_user_id;

  if v_result is null then
    raise exception 'User not found.';
  end if;
  return v_result;
end;
$$;

create or replace function public.admin_mutate_user(
  p_user_id uuid,
  p_action text,
  p_value text default null,
  p_reason text default ''
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_is_minor boolean;
  v_consent text;
  v_status text;
  v_changes jsonb;
begin
  if p_action in ('suspend', 'reactivate') then
    perform private.require_admin_permission('users.suspend');
  elsif p_action = 'set_verification' then
    -- Guardian verification is deliberately stricter than suspension: only
    -- super admins may override the possession-based consent workflow.
    perform private.require_admin_permission('users.verify_minor');
  elsif p_action = 'delete' then
    perform private.require_admin_permission('users.delete');
    perform private.check_admin_rate_limit('admin_delete_user', 5, 300);
  else
    raise exception 'Unknown user action.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own account from the admin panel.';
  end if;

  select is_minor, guardian_consent_status, account_status::text
  into v_is_minor, v_consent, v_status
  from public.profiles where id = p_user_id;
  if not found then
    raise exception 'User not found.';
  end if;

  v_changes := jsonb_build_object('reason', coalesce(p_reason, ''), 'previous_status', v_status);

  if p_action = 'suspend' then
    update public.profiles set account_status = 'suspended', updated_at = now() where id = p_user_id;
  elsif p_action = 'reactivate' then
    if v_is_minor and v_consent <> 'verified' then
      raise exception 'This minor account still requires verified guardian consent.';
    end if;
    update public.profiles set account_status = 'active', updated_at = now() where id = p_user_id;
  elsif p_action = 'set_verification' then
    if coalesce(p_value, '') not in ('verified', 'rejected', 'pending', 'required', 'not_required') then
      raise exception 'Invalid verification status.';
    end if;
    update public.profiles
    set guardian_consent_status = p_value,
        account_status = case when v_is_minor and p_value <> 'verified' then 'pending_guardian' else account_status end,
        updated_at = now()
    where id = p_user_id;
  elsif p_action = 'delete' then
    delete from auth.users where id = p_user_id;
  end if;

  v_changes := v_changes || jsonb_build_object('action', p_action, 'value', p_value);
  perform private.write_admin_audit('user.' || p_action, 'user', p_user_id::text, v_changes);
  return jsonb_build_object('success', true, 'user_id', p_user_id, 'action', p_action);
end;
$$;

create or replace function public.admin_warn_user(
  p_user_id uuid,
  p_reason text,
  p_report_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_warning_id uuid;
begin
  perform private.require_admin_permission('users.suspend');
  perform private.check_admin_rate_limit('admin_warn_user', 20, 60);
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A warning reason is required.';
  end if;
  insert into public.admin_user_warnings (user_id, report_id, reason, issued_by)
  values (p_user_id, p_report_id, trim(p_reason), auth.uid())
  returning id into v_warning_id;
  perform private.write_admin_audit('user.warn', 'user', p_user_id::text, jsonb_build_object('reason', trim(p_reason), 'warning_id', v_warning_id));
  return jsonb_build_object('success', true, 'id', v_warning_id, 'user_id', p_user_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Content management (posts, Reelyx videos, comments)
-- -----------------------------------------------------------------------------

create or replace function public.admin_list_content(
  p_kind text default 'post',
  p_search text default '',
  p_status text default '',
  p_parent_kind text default '',
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql security definer stable set search_path = ''
as $$
declare
  v_total bigint;
  v_items jsonb;
begin
  if p_kind = 'comment' then
    perform private.require_admin_permission('comments.view');
  elsif p_kind = 'reelyx' then
    perform private.require_admin_permission('reelyx.view');
  else
    perform private.require_admin_permission('posts.view');
  end if;

  p_limit := least(greatest(coalesce(p_limit, 25), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);

  if p_kind = 'comment' then
    with filtered as (
      select
        c.id, c.body, c.created_at, c.moderation_status as status,
        jsonb_build_object('id', a.id, 'username', a.username, 'display_name', a.display_name, 'avatar_url', a.avatar_url) as author,
        jsonb_build_object('id', p.id, 'caption', p.caption, 'media_type', p.media_type, 'media_key', p.media_key) as content
      from public.comments c
      join public.profiles a on a.id = c.author_id
      join public.posts p on p.id = c.post_id
      where (p_search is null or p_search = '' or
        c.body ilike '%' || p_search || '%' or a.username ilike '%' || p_search || '%' or
        a.display_name ilike '%' || p_search || '%' or c.id::text ilike '%' || p_search || '%')
        and (p_status is null or p_status = '' or c.moderation_status = p_status)
        and (p_parent_kind is null or p_parent_kind = '' or p.media_type = case when p_parent_kind = 'reelyx' then 'video' else 'photo' end)
        and (p_from is null or c.created_at >= p_from)
        and (p_to is null or c.created_at <= p_to)
    ), counted as (select count(*) as total from filtered)
    select total into v_total from counted;
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_items
    from (select * from filtered order by created_at desc limit p_limit offset p_offset) x;
  else
    with filtered as (
      select
        p.id, p.caption, p.media_type, p.media_key, p.thumbnail_key,
        p.visibility::text as visibility, p.sensitive_review_status as status,
        p.is_featured, p.created_at, p.removed_at,
        jsonb_build_object('id', a.id, 'username', a.username, 'display_name', a.display_name, 'avatar_url', a.avatar_url) as author,
        (select count(*)::int from public.post_likes l where l.post_id = p.id) as like_count,
        (select count(*)::int from public.comments c where c.post_id = p.id) as comment_count
      from public.posts p
      join public.profiles a on a.id = p.author_id
      where p.media_type = case when p_kind = 'reelyx' then 'video' else 'photo' end
        and (p_search is null or p_search = '' or
          p.caption ilike '%' || p_search || '%' or a.username ilike '%' || p_search || '%' or
          a.display_name ilike '%' || p_search || '%' or p.id::text ilike '%' || p_search || '%')
        and (p_status is null or p_status = '' or
          p.sensitive_review_status = p_status or
          (p_status = 'featured' and p.is_featured))
        and (p_from is null or p.created_at >= p_from)
        and (p_to is null or p.created_at <= p_to)
    ), counted as (select count(*) as total from filtered)
    select total into v_total from counted;
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_items
    from (select * from filtered order by created_at desc limit p_limit offset p_offset) x;
  end if;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$$;

create or replace function public.admin_mutate_content(
  p_kind text,
  p_id uuid,
  p_action text,
  p_value text default null,
  p_reason text default ''
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_old text;
  v_changes jsonb;
begin
  v_changes := jsonb_build_object('reason', coalesce(p_reason, ''), 'action', p_action, 'value', p_value);

  if p_kind = 'comment' then
    perform private.require_admin_permission('comments.manage');
    select moderation_status into v_old from public.comments where id = p_id;
    if not found then raise exception 'Comment not found.'; end if;
    if p_action not in ('remove', 'restore', 'review') then raise exception 'Unknown comment action.'; end if;
    update public.comments
      set moderation_status = case p_action when 'remove' then 'removed' when 'review' then 'under_review' else 'visible' end,
          moderated_at = now(), moderated_by = auth.uid()
      where id = p_id;
  elsif p_kind = 'reelyx' then
    perform private.require_admin_permission('reelyx.manage');
    select sensitive_review_status into v_old from public.posts where id = p_id and media_type = 'video';
    if not found then raise exception 'Reelyx video not found.'; end if;
    if p_action = 'feature' then
      update public.posts set is_featured = true where id = p_id;
    elsif p_action = 'unfeature' then
      update public.posts set is_featured = false where id = p_id;
    elsif p_action = 'remove' then
      update public.posts set sensitive_review_status = 'removed', removed_at = now(), removed_by = auth.uid() where id = p_id;
    elsif p_action = 'restore' then
      update public.posts set sensitive_review_status = 'safe', removed_at = null, removed_by = null where id = p_id;
    elsif p_action = 'set_status' then
      if coalesce(p_value, '') not in ('pending', 'safe', 'mature', 'removed') then raise exception 'Invalid review status.'; end if;
      update public.posts set sensitive_review_status = p_value where id = p_id;
    else
      raise exception 'Unknown Reelyx action.';
    end if;
  else
    perform private.require_admin_permission('posts.manage');
    select sensitive_review_status into v_old from public.posts where id = p_id and media_type = 'photo';
    if not found then raise exception 'Post not found.'; end if;
    if p_action = 'remove' then
      update public.posts set sensitive_review_status = 'removed', removed_at = now(), removed_by = auth.uid() where id = p_id;
    elsif p_action = 'restore' then
      update public.posts set sensitive_review_status = 'safe', removed_at = null, removed_by = null where id = p_id;
    elsif p_action = 'set_status' then
      if coalesce(p_value, '') not in ('pending', 'safe', 'mature', 'removed') then raise exception 'Invalid review status.'; end if;
      update public.posts set sensitive_review_status = p_value where id = p_id;
    else
      raise exception 'Unknown post action.';
    end if;
  end if;

  v_changes := v_changes || jsonb_build_object('previous_status', v_old);
  perform private.write_admin_audit('content.' || p_action, p_kind, p_id::text, v_changes);
  return jsonb_build_object('success', true, 'id', p_id, 'action', p_action);
end;
$$;

-- -----------------------------------------------------------------------------
-- Reports and moderation
-- -----------------------------------------------------------------------------

create or replace function public.admin_list_reports(
  p_search text default '',
  p_status text default '',
  p_category text default '',
  p_priority text default '',
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql security definer stable set search_path = ''
as $$
declare
  v_total bigint;
  v_items jsonb;
  v_status text;
begin
  perform private.require_admin_permission('reports.view');
  p_limit := least(greatest(coalesce(p_limit, 25), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  v_status := case
    when p_status = 'pending' then 'open'
    when p_status = 'under_review' then 'reviewing'
    else p_status
  end;

  with filtered as (
    select
      r.id, r.reason, r.category, r.priority, r.status::text as status,
      r.created_at, r.updated_at, r.resolution_notes, r.assigned_to,
      reporter.username as reporter_username, reporter.display_name as reporter_name,
      reported.username as reported_username, reported.display_name as reported_name,
      reported.id as reported_user_id,
      jsonb_build_object('id', p.id, 'caption', p.caption, 'media_type', p.media_type, 'media_key', p.media_key, 'status', p.sensitive_review_status) as content,
      moderator.username as assigned_username
    from public.reports r
    left join public.profiles reporter on reporter.id = r.reporter_id
    left join public.profiles reported on reported.id = r.reported_user_id
    left join public.posts p on p.id = r.post_id
    left join public.profiles moderator on moderator.id = r.assigned_to
    where (p_search is null or p_search = '' or
      r.id::text ilike '%' || p_search || '%' or r.reason ilike '%' || p_search || '%' or
      coalesce(reporter.username, '') ilike '%' || p_search || '%' or
      coalesce(reported.username, '') ilike '%' || p_search || '%')
      and (v_status is null or v_status = '' or r.status::text = v_status)
      and (p_category is null or p_category = '' or r.category = p_category)
      and (p_priority is null or p_priority = '' or r.priority = p_priority)
      and (p_from is null or r.created_at >= p_from)
      and (p_to is null or r.created_at <= p_to)
  ), counted as (select count(*) as total from filtered)
  select total into v_total from counted;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_items
  from (select * from filtered order by
    case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
    created_at desc limit p_limit offset p_offset) x;

  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$$;

create or replace function public.admin_get_report(p_report_id uuid)
returns jsonb
language plpgsql security definer stable set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.require_admin_permission('reports.view');
  select jsonb_build_object(
    'report', to_jsonb(r),
    'reporter', jsonb_build_object('id', reporter.id, 'username', reporter.username, 'display_name', reporter.display_name, 'avatar_url', reporter.avatar_url),
    'reported_user', jsonb_build_object('id', reported.id, 'username', reported.username, 'display_name', reported.display_name, 'avatar_url', reported.avatar_url, 'account_status', reported.account_status::text),
    'content', jsonb_build_object('id', p.id, 'caption', p.caption, 'media_type', p.media_type, 'media_key', p.media_key, 'status', p.sensitive_review_status),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'changes', a.changes, 'actor', a.actor_id, 'created_at', a.created_at) order by a.created_at)
      from public.admin_audit_logs a where a.resource = 'report' and a.resource_id = p_report_id::text
    ), '[]'::jsonb)
  ) into v_result
  from public.reports r
  left join public.profiles reporter on reporter.id = r.reporter_id
  left join public.profiles reported on reported.id = r.reported_user_id
  left join public.posts p on p.id = r.post_id
  where r.id = p_report_id;
  if v_result is null then raise exception 'Report not found.'; end if;
  return v_result;
end;
$$;

create or replace function public.admin_mutate_report(
  p_report_id uuid,
  p_action text,
  p_value text default null,
  p_note text default ''
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
  v_changes jsonb;
begin
  perform private.require_admin_permission('reports.manage');
  perform private.check_admin_rate_limit('admin_report_action', 40, 60);
  select * into v_report from public.reports where id = p_report_id;
  if not found then raise exception 'Report not found.'; end if;
  v_changes := jsonb_build_object('action', p_action, 'value', p_value, 'note', coalesce(p_note, ''));

  if p_action = 'assign' then
    update public.reports set assigned_to = p_value::uuid, updated_at = now() where id = p_report_id;
  elsif p_action = 'priority' then
    if coalesce(p_value, '') not in ('low', 'normal', 'high', 'urgent') then raise exception 'Invalid priority.'; end if;
    update public.reports set priority = p_value, updated_at = now() where id = p_report_id;
  elsif p_action = 'category' then
    if coalesce(p_value, '') not in ('inappropriate', 'harassment', 'spam', 'fake_account', 'impersonation', 'copyright', 'other') then raise exception 'Invalid category.'; end if;
    update public.reports set category = p_value, updated_at = now() where id = p_report_id;
  elsif p_action = 'decide' then
    if coalesce(p_value, '') not in ('reviewing', 'resolved', 'dismissed', 'escalated') then raise exception 'Invalid decision.'; end if;
    update public.reports
      set status = p_value::public.report_status, resolution_notes = coalesce(p_note, ''),
          reviewed_by = auth.uid(), updated_at = now()
      where id = p_report_id;
  elsif p_action = 'warn_user' then
    if v_report.reported_user_id is null then raise exception 'This report has no reported user.'; end if;
    insert into public.admin_user_warnings (user_id, report_id, reason, issued_by)
    values (v_report.reported_user_id, p_report_id, p_note, auth.uid());
  elsif p_action = 'suspend_user' then
    if v_report.reported_user_id is null then raise exception 'This report has no reported user.'; end if;
    perform private.require_admin_permission('users.suspend');
    update public.profiles set account_status = 'suspended', updated_at = now() where id = v_report.reported_user_id;
  elsif p_action = 'remove_content' then
    if v_report.post_id is null then raise exception 'This report has no linked content.'; end if;
    perform private.require_admin_permission('posts.manage');
    update public.posts set sensitive_review_status = 'removed', removed_at = now(), removed_by = auth.uid() where id = v_report.post_id;
  else
    raise exception 'Unknown report action.';
  end if;

  perform private.write_admin_audit('report.' || p_action, 'report', p_report_id::text, v_changes);
  return jsonb_build_object('success', true, 'id', p_report_id, 'action', p_action);
end;
$$;

-- -----------------------------------------------------------------------------
-- Support tickets
-- -----------------------------------------------------------------------------

create or replace function public.admin_list_tickets(
  p_search text default '',
  p_status text default '',
  p_priority text default '',
  p_category text default '',
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql security definer stable set search_path = ''
as $$
declare
  v_total bigint;
  v_items jsonb;
  v_stats jsonb;
begin
  perform private.require_admin_permission('tickets.view');
  p_limit := least(greatest(coalesce(p_limit, 25), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);

  with filtered as (
    select
      t.id, t.subject, t.category, t.status, t.priority, t.created_at, t.updated_at, t.assigned_to,
      p.username, p.display_name, p.avatar_url,
      agent.username as assigned_username,
      (select count(*)::int from public.support_ticket_messages m where m.ticket_id = t.id) as message_count,
      (select m.created_at from public.support_ticket_messages m where m.ticket_id = t.id order by m.created_at desc limit 1) as last_message_at
    from public.support_tickets t
    join public.profiles p on p.id = t.user_id
    left join public.profiles agent on agent.id = t.assigned_to
    where (p_search is null or p_search = '' or
      t.id::text ilike '%' || p_search || '%' or t.subject ilike '%' || p_search || '%' or
      p.username ilike '%' || p_search || '%' or p.display_name ilike '%' || p_search || '%')
      and (p_status is null or p_status = '' or t.status = p_status)
      and (p_priority is null or p_priority = '' or t.priority = p_priority)
      and (p_category is null or p_category = '' or t.category = p_category)
      and (p_from is null or t.created_at >= p_from)
      and (p_to is null or t.created_at <= p_to)
  ), counted as (select count(*) as total from filtered)
  select total into v_total from counted;

  select jsonb_build_object(
    'total', (select count(*)::int from public.support_tickets),
    'open', (select count(*)::int from public.support_tickets where status in ('open', 'in_progress', 'waiting_for_user', 'pending')),
    'resolved', (select count(*)::int from public.support_tickets where status = 'resolved'),
    'closed', (select count(*)::int from public.support_tickets where status = 'closed'),
    'average_response_minutes', (
      select coalesce(round(avg(extract(epoch from (first_reply.created_at - t.created_at)) / 60))::int, 0)
      from public.support_tickets t
      join lateral (
        select m.created_at from public.support_ticket_messages m
        where m.ticket_id = t.id and m.author_role = 'support'
        order by m.created_at asc limit 1
      ) first_reply on true
      where first_reply.created_at >= t.created_at
    )
  ) into v_stats;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_items
  from (select * from filtered order by updated_at desc limit p_limit offset p_offset) x;

  return jsonb_build_object('items', v_items, 'total', v_total, 'stats', v_stats);
end;
$$;

create or replace function public.admin_get_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql security definer stable set search_path = ''
as $$
declare
  v_result jsonb;
  v_can_manage boolean;
begin
  perform private.require_admin_permission('tickets.view');
  v_can_manage := private.has_admin_permission('tickets.manage');
  select jsonb_build_object(
    'ticket', to_jsonb(t),
    'user', jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'account_status', p.account_status::text),
    'assigned_to', agent.username,
    'messages', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.created_at) from (
        select id, body, author_role, created_at, author_id from public.support_ticket_messages
        where ticket_id = p_ticket_id order by created_at
      ) m
    ), '[]'::jsonb),
    -- Internal notes are visible only to roles that can write them.
    'internal_notes', case when v_can_manage then coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'created_at', n.created_at, 'author', a.username) order by n.created_at)
      from public.support_ticket_internal_notes n
      left join public.profiles a on a.id = n.author_id
      where n.ticket_id = p_ticket_id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object('id', att.id, 'storage_path', att.storage_path, 'file_name', att.file_name, 'content_type', att.content_type, 'byte_size', att.byte_size, 'created_at', att.created_at) order by att.created_at)
      from public.support_ticket_attachments att
      where att.ticket_id = p_ticket_id
    ), '[]'::jsonb)
  ) into v_result
  from public.support_tickets t
  join public.profiles p on p.id = t.user_id
  left join public.profiles agent on agent.id = t.assigned_to
  where t.id = p_ticket_id;
  if v_result is null then raise exception 'Ticket not found.'; end if;
  return v_result;
end;
$$;

create or replace function public.admin_mutate_ticket(
  p_ticket_id uuid,
  p_action text,
  p_value text default null,
  p_body text default ''
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
  v_changes jsonb;
begin
  perform private.require_admin_permission('tickets.manage');
  perform private.check_admin_rate_limit('admin_ticket_action', 60, 60);
  select status into v_status from public.support_tickets where id = p_ticket_id;
  if not found then raise exception 'Ticket not found.'; end if;
  v_changes := jsonb_build_object('action', p_action, 'value', p_value, 'previous_status', v_status);

  if p_action = 'assign' then
    update public.support_tickets set assigned_to = nullif(p_value, '')::uuid, updated_at = now() where id = p_ticket_id;
  elsif p_action = 'priority' then
    if coalesce(p_value, '') not in ('low', 'normal', 'high', 'urgent') then raise exception 'Invalid priority.'; end if;
    update public.support_tickets set priority = p_value, updated_at = now() where id = p_ticket_id;
  elsif p_action = 'status' then
    if coalesce(p_value, '') not in ('open', 'in_progress', 'waiting_for_user', 'pending', 'resolved', 'closed') then raise exception 'Invalid status.'; end if;
    update public.support_tickets set status = p_value, updated_at = now() where id = p_ticket_id;
  elsif p_action = 'reply' then
    if coalesce(trim(p_body), '') = '' then raise exception 'Write a reply before sending.'; end if;
    insert into public.support_ticket_messages (ticket_id, author_id, author_role, body)
    values (p_ticket_id, auth.uid(), 'support', trim(p_body));
  elsif p_action = 'internal_note' then
    if coalesce(trim(p_body), '') = '' then raise exception 'Write a note before saving.'; end if;
    insert into public.support_ticket_internal_notes (ticket_id, author_id, body)
    values (p_ticket_id, auth.uid(), trim(p_body));
  else
    raise exception 'Unknown ticket action.';
  end if;

  perform private.write_admin_audit('ticket.' || p_action, 'ticket', p_ticket_id::text, v_changes);
  return jsonb_build_object('success', true, 'id', p_ticket_id, 'action', p_action);
end;
$$;

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------

create or replace function public.admin_list_notifications(
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql security definer stable set search_path = ''
as $$
declare
  v_total bigint;
  v_items jsonb;
begin
  perform private.require_admin_permission('notifications.view');
  p_limit := least(greatest(coalesce(p_limit, 25), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  select count(*) into v_total from public.admin_notifications;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_items
  from (
    select n.*,
      case when n.audience = 'all' then (select count(*)::int from public.profiles) else coalesce(cardinality(n.target_user_ids), 0) end as recipient_count,
      (select count(*)::int from public.admin_notification_recipients r where r.notification_id = n.id) as delivered_count
    from public.admin_notifications n
    order by n.created_at desc limit p_limit offset p_offset
  ) x;
  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$$;

create or replace function public.admin_send_notification(p_notification_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_notification public.admin_notifications%rowtype;
begin
  perform private.require_admin_permission('notifications.manage');
  perform private.check_admin_rate_limit('admin_send_notification', 10, 300);
  select * into v_notification from public.admin_notifications where id = p_notification_id;
  if not found then raise exception 'Notification not found.'; end if;
  if v_notification.status = 'sent' then raise exception 'This announcement was already sent.'; end if;
  if v_notification.audience = 'selected' and cardinality(v_notification.target_user_ids) = 0 then
    raise exception 'Select at least one recipient.';
  end if;

  if v_notification.audience = 'selected' then
    insert into public.admin_notification_recipients (notification_id, user_id)
    select v_notification.id, u from unnest(v_notification.target_user_ids) as u
    where exists (select 1 from public.profiles p where p.id = u)
    on conflict do nothing;
  end if;

  update public.admin_notifications
  set status = 'sent', sent_at = now() where id = p_notification_id;
  perform private.write_admin_audit('notification.send', 'notification', p_notification_id::text,
    jsonb_build_object('audience', v_notification.audience, 'type', v_notification.type));
  return jsonb_build_object('success', true, 'id', p_notification_id);
end;
$$;

create or replace function public.admin_create_notification(
  p_title text,
  p_body text,
  p_type text default 'general',
  p_audience text default 'all',
  p_target_user_ids uuid[] default '{}'::uuid[],
  p_template_key text default null,
  p_send_now boolean default false
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_admin_permission('notifications.manage');
  if coalesce(p_type, '') not in ('general', 'maintenance', 'policy', 'account') then raise exception 'Invalid notification type.'; end if;
  if coalesce(p_audience, '') not in ('all', 'selected') then raise exception 'Invalid audience.'; end if;

  insert into public.admin_notifications (title, body, type, audience, target_user_ids, template_key, created_by)
  values (trim(p_title), trim(p_body), p_type, p_audience, coalesce(p_target_user_ids, '{}'::uuid[]), nullif(p_template_key, ''), auth.uid())
  returning id into v_id;

  perform private.write_admin_audit('notification.create', 'notification', v_id::text,
    jsonb_build_object('title', p_title, 'audience', p_audience, 'send_now', p_send_now));
  if p_send_now then
    perform public.admin_send_notification(v_id);
  end if;
  return jsonb_build_object('success', true, 'id', v_id, 'sent', p_send_now);
end;
$$;

create or replace function public.admin_delete_notification(p_notification_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_admin_permission('notifications.manage');
  delete from public.admin_notifications where id = p_notification_id;
  if not found then raise exception 'Notification not found.'; end if;
  perform private.write_admin_audit('notification.delete', 'notification', p_notification_id::text);
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.admin_list_templates()
returns jsonb
language plpgsql security definer stable set search_path = ''
as $$
declare v_items jsonb;
begin
  perform private.require_admin_permission('notifications.view');
  select coalesce(jsonb_agg(to_jsonb(x) order by x.key), '[]'::jsonb) into v_items
  from (select * from public.admin_notification_templates) x;
  return jsonb_build_object('items', v_items);
end;
$$;

create or replace function public.admin_mutate_template(
  p_key text,
  p_title text default null,
  p_body text default null,
  p_type text default null,
  p_action text default 'upsert'
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_admin_permission('notifications.manage');
  if p_action = 'delete' then
    delete from public.admin_notification_templates where key = p_key;
  else
    if coalesce(p_title, '') = '' or coalesce(p_body, '') = '' then raise exception 'Title and body are required.'; end if;
    insert into public.admin_notification_templates (key, title, body, type, updated_by)
    values (p_key, p_title, p_body, coalesce(p_type, 'general'), auth.uid())
    on conflict (key) do update set
      title = excluded.title, body = excluded.body, type = excluded.type,
      updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform private.write_admin_audit('template.' || p_action, 'notification_template', p_key);
  return jsonb_build_object('success', true, 'key', p_key);
end;
$$;

-- -----------------------------------------------------------------------------
-- Analytics, audit log, settings, help center, admin accounts
-- -----------------------------------------------------------------------------

create or replace function public.admin_list_audit(
  p_search text default '',
  p_action text default '',
  p_resource text default '',
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql security definer stable set search_path = ''
as $$
declare
  v_total bigint;
  v_items jsonb;
begin
  perform private.require_admin_permission('audit.view');
  p_limit := least(greatest(coalesce(p_limit, 25), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  with filtered as (
    select a.*, p.username as actor_username, p.display_name as actor_name
    from public.admin_audit_logs a
    left join public.profiles p on p.id = a.actor_id
    where (p_search is null or p_search = '' or
      a.action ilike '%' || p_search || '%' or a.resource_id ilike '%' || p_search || '%' or
      coalesce(p.username, '') ilike '%' || p_search || '%')
      and (p_action is null or p_action = '' or a.action = p_action)
      and (p_resource is null or p_resource = '' or a.resource = p_resource)
      and (p_from is null or a.created_at >= p_from)
      and (p_to is null or a.created_at <= p_to)
  ), counted as (select count(*) as total from filtered)
  select total into v_total from counted;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_items
  from (select * from filtered order by created_at desc limit p_limit offset p_offset) x;
  return jsonb_build_object('items', v_items, 'total', v_total);
end;
$$;

create or replace function public.admin_get_settings()
returns jsonb
language plpgsql security definer stable set search_path = ''
as $$
declare v_items jsonb;
begin
  perform private.require_admin_permission('users.view');
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_items from public.admin_platform_settings;
  return v_items;
end;
$$;

create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_admin_permission('settings.manage');
  if coalesce(p_key, '') not in (
    'general.platform_name', 'general.description', 'support.contact_email',
    'content.max_post_media_mb', 'content.max_caption_chars'
  ) then
    raise exception 'This setting is not supported by the current platform.';
  end if;
  insert into public.admin_platform_settings (key, value, updated_by, updated_at)
  values (p_key, p_value, auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  perform private.write_admin_audit('setting.update', 'setting', p_key, jsonb_build_object('value', p_value));
  return jsonb_build_object('success', true, 'key', p_key, 'value', p_value);
end;
$$;

create or replace function public.admin_list_help()
returns jsonb
language plpgsql security definer stable set search_path = ''
as $$
declare v_result jsonb;
begin
  perform private.require_admin_permission('help.manage');
  select jsonb_build_object(
    'categories', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.name) from (select * from public.admin_help_categories) x), '[]'::jsonb),
    'articles', coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (select * from public.admin_help_articles) x), '[]'::jsonb),
    'faqs', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.question) from (select * from public.admin_help_faqs) x), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.admin_mutate_help(
  p_kind text,
  p_action text,
  p_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_slug text;
  v_new_id uuid;
begin
  perform private.require_admin_permission('help.manage');
  v_slug := trim(both '-' from lower(regexp_replace(coalesce(p_payload ->> 'slug', p_payload ->> 'title', p_payload ->> 'question', 'item-' || gen_random_uuid()::text), '[^a-zA-Z0-9]+', '-', 'g')));

  if p_kind = 'category' then
    if p_action = 'delete' then
      delete from public.admin_help_categories where id = p_id;
    else
      insert into public.admin_help_categories (id, slug, name, description, sort_order, is_active)
      values (coalesce(p_id, gen_random_uuid()), v_slug, coalesce(p_payload ->> 'name', ''), coalesce(p_payload ->> 'description', ''),
              coalesce((p_payload ->> 'sort_order')::int, 0), coalesce((p_payload ->> 'is_active')::boolean, true))
      on conflict (id) do update set
        slug = excluded.slug, name = excluded.name, description = excluded.description,
        sort_order = excluded.sort_order, is_active = excluded.is_active;
    end if;
  elsif p_kind = 'article' then
    if p_action = 'delete' then
      delete from public.admin_help_articles where id = p_id;
    else
      insert into public.admin_help_articles (
        id, slug, category_slug, title, summary, minutes, keywords, sections, is_published, updated_by, updated_at
      ) values (
        coalesce(p_id, gen_random_uuid()), v_slug, nullif(p_payload ->> 'category_slug', ''),
        coalesce(p_payload ->> 'title', ''), coalesce(p_payload ->> 'summary', ''),
        coalesce((p_payload ->> 'minutes')::int, 2),
        coalesce((select array_agg(value::text) from jsonb_array_elements_text(coalesce(p_payload -> 'keywords', '[]'::jsonb))), '{}'::text[]),
        coalesce(p_payload -> 'sections', '[]'::jsonb),
        coalesce((p_payload ->> 'is_published')::boolean, false), auth.uid(), now()
      )
      on conflict (id) do update set
        slug = excluded.slug, category_slug = excluded.category_slug, title = excluded.title,
        summary = excluded.summary, minutes = excluded.minutes, keywords = excluded.keywords,
        sections = excluded.sections, is_published = excluded.is_published,
        updated_by = excluded.updated_by, updated_at = now()
      returning id into v_new_id;
    end if;
  elsif p_kind = 'faq' then
    if p_action = 'delete' then
      delete from public.admin_help_faqs where id = p_id;
    else
      insert into public.admin_help_faqs (
        id, category_slug, question, answer, article_slug, sort_order, is_published, updated_by, updated_at
      ) values (
        coalesce(p_id, gen_random_uuid()), nullif(p_payload ->> 'category_slug', ''),
        coalesce(p_payload ->> 'question', ''), coalesce(p_payload ->> 'answer', ''),
        nullif(p_payload ->> 'article_slug', ''), coalesce((p_payload ->> 'sort_order')::int, 0),
        coalesce((p_payload ->> 'is_published')::boolean, false), auth.uid(), now()
      )
      on conflict (id) do update set
        category_slug = excluded.category_slug, question = excluded.question, answer = excluded.answer,
        article_slug = excluded.article_slug, sort_order = excluded.sort_order,
        is_published = excluded.is_published, updated_by = excluded.updated_by, updated_at = now()
      returning id into v_new_id;
    end if;
  else
    raise exception 'Unknown help content type.';
  end if;

  perform private.write_admin_audit('help.' || p_action, p_kind, coalesce(p_id, v_new_id)::text, p_payload);
  return jsonb_build_object('success', true, 'id', coalesce(p_id, v_new_id), 'slug', v_slug);
end;
$$;

create or replace function public.get_published_help_content()
returns jsonb
language sql security definer stable set search_path = ''
as $$
  select jsonb_build_object(
    'categories', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.name) from (
      select slug, name, description from public.admin_help_categories where is_active
    ) x), '[]'::jsonb),
    'articles', coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (
      select slug, category_slug, title, summary, minutes, keywords, sections from public.admin_help_articles where is_published
    ) x), '[]'::jsonb),
    'faqs', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.question) from (
      select question, answer, article_slug from public.admin_help_faqs where is_published
    ) x), '[]'::jsonb)
  );
$$;

revoke all on function public.get_published_help_content() from public;
grant execute on function public.get_published_help_content() to anon, authenticated;

create or replace function public.admin_list_assignees()
returns jsonb
language plpgsql security definer stable set search_path = ''
as $$
declare v_items jsonb;
begin
  perform private.require_admin_permission('users.view');
  select coalesce(jsonb_agg(to_jsonb(x) order by x.role, x.display_name), '[]'::jsonb) into v_items
  from (
    select r.user_id, r.role::text as role, p.display_name, p.username, p.avatar_url
    from public.admin_roles r
    join public.profiles p on p.id = r.user_id
    where r.is_active
  ) x;
  return jsonb_build_object('items', v_items);
end;
$$;

create or replace function public.admin_list_admins()
returns jsonb
language plpgsql security definer stable set search_path = ''
as $$
declare v_items jsonb;
begin
  perform private.require_admin_permission('admin.manage');
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_items
  from (
    select r.user_id, r.role::text as role, r.is_active, r.created_at, r.updated_at,
           p.display_name, p.username, p.avatar_url, u.email,
           creator.username as created_by_username
    from public.admin_roles r
    join public.profiles p on p.id = r.user_id
    left join auth.users u on u.id = r.user_id
    left join public.profiles creator on creator.id = r.created_by
  ) x;
  return jsonb_build_object('items', v_items);
end;
$$;

create or replace function public.admin_mutate_admin(
  p_user_id uuid,
  p_role text,
  p_action text default 'upsert'
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.admin_role;
  v_super_count integer;
  v_existing_role public.admin_role;
begin
  perform private.require_admin_permission('admin.manage');
  perform private.check_admin_rate_limit('admin_role_change', 10, 300);
  if coalesce(p_role, '') not in ('super_admin', 'content_moderator', 'support_agent', 'analyst') then
    raise exception 'Invalid admin role.';
  end if;
  v_role := p_role::public.admin_role;

  select role into v_existing_role from public.admin_roles where user_id = p_user_id;
  select count(*)::int into v_super_count from public.admin_roles where role = 'super_admin' and is_active;

  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own admin role here.';
  end if;

  if p_action = 'remove' then
    if v_existing_role = 'super_admin' and v_super_count <= 1 then
      raise exception 'At least one active Super Admin must remain.';
    end if;
    delete from public.admin_roles where user_id = p_user_id;
  else
    if v_existing_role = 'super_admin' and v_role <> 'super_admin' and v_super_count <= 1 then
      raise exception 'At least one active Super Admin must remain.';
    end if;
    insert into public.admin_roles (user_id, role, is_active, created_by)
    values (p_user_id, v_role, true, auth.uid())
    on conflict (user_id) do update set role = excluded.role, is_active = true, updated_at = now();
  end if;

  perform private.write_admin_audit('admin_role.' || p_action, 'admin', p_user_id::text,
    jsonb_build_object('role', p_role, 'previous_role', v_existing_role::text));
  return jsonb_build_object('success', true, 'user_id', p_user_id, 'role', p_role);
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants, defaults, and bootstrap note
-- -----------------------------------------------------------------------------

-- Explicit allowlist: a future admin_* helper must never become browser-callable
-- just because of its name. Every function here still checks its own permission.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'admin_get_my_access', 'admin_analytics', 'admin_dashboard',
      'admin_list_users', 'admin_get_user', 'admin_mutate_user', 'admin_warn_user',
      'admin_list_content', 'admin_mutate_content',
      'admin_list_reports', 'admin_get_report', 'admin_mutate_report',
      'admin_list_tickets', 'admin_get_ticket', 'admin_mutate_ticket',
      'admin_list_notifications', 'admin_send_notification',
      'admin_create_notification', 'admin_delete_notification',
      'admin_list_templates', 'admin_mutate_template',
      'admin_list_audit', 'admin_get_settings', 'admin_set_setting',
      'admin_list_help', 'admin_mutate_help',
      'admin_list_assignees', 'admin_list_admins', 'admin_mutate_admin'
    )
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('revoke all on function %s from anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- Only the role lookup is needed by storage policies. All other private helpers
-- are intentionally not executable by clients; privileged RPCs call them as definer.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname in (
      'admin_permissions_for_role', 'has_admin_permission', 'require_admin_permission',
      'check_admin_rate_limit', 'current_admin_role', 'write_admin_audit'
    )
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('revoke all on function %s from anon', r.sig);
    execute format('revoke all on function %s from authenticated', r.sig);
  end loop;
end $$;

grant execute on function private.has_admin_permission(text) to authenticated;

insert into public.admin_platform_settings (key, value) values
  ('general.platform_name', '"TachiReel"'::jsonb),
  ('general.description', '"A gentle social space for everyday moments."'::jsonb),
  ('support.contact_email', '"support@tachireel.app"'::jsonb),
  ('content.max_post_media_mb', '50'::jsonb),
  ('content.max_caption_chars', '2200'::jsonb)
on conflict (key) do nothing;

insert into public.admin_notification_templates (key, title, body, type) values
  ('welcome', 'Welcome to TachiReel', 'Your corner is ready. Share a moment when you feel like it.', 'general'),
  ('maintenance', 'Scheduled maintenance', 'TachiReel will be briefly unavailable while we make improvements.', 'maintenance'),
  ('policy_update', 'Policy update', 'We updated our community guidelines. Take a moment to review them.', 'policy')
on conflict (key) do nothing;

/* =============================================================================
 * BOOTSTRAP (run once with the SQL editor, then delete these statements):
 *
 * replace 'first-admin@example.com' with a real, already-registered account.
 *
 * insert into public.admin_roles (user_id, role, created_by)
 * select id, 'super_admin', id from auth.users where email = 'first-admin@example.com';
 *
 * Do not add a client-side "make admin" screen. All later admin accounts are
 * created from Roles & Permissions by an existing Super Admin.
 * =========================================================================== */
