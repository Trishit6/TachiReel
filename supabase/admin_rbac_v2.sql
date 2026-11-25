/* =============================================================================
 * TachiReel Admin RBAC v2 — additive, idempotent migration.
 *
 * Apply this AFTER supabase/schema.sql and supabase/admin_schema.sql.
 *
 * What it adds:
 *   - Six additional staff roles (Admin, Content Manager, Moderator,
 *     Support Manager, Notification Manager, Community Manager).
 *   - Custom roles with an explicit permission list.
 *   - Per-administrator permission overrides (additive only).
 *   - Administrator activate/deactivate and last-login reporting.
 *   - Role/administrator management RPCs, all permission-checked in Postgres.
 *   - Server-side protection of the official initial Super Admin
 *     (admin@admin.com) against every admin RPC.
 *
 * It never rewrites user data and never grants a role from the browser.
 * The existing permission identifiers are preserved so every RPC from
 * admin_schema.sql keeps working unchanged. New granular identifiers are
 * added alongside them for the newer management screens.
 * =========================================================================== */

-- -----------------------------------------------------------------------------
-- 1. Extend the role enum. ADD VALUE is idempotent from PostgreSQL 12 onwards.
-- -----------------------------------------------------------------------------

alter type public.admin_role add value if not exists 'admin';
alter type public.admin_role add value if not exists 'content_manager';
alter type public.admin_role add value if not exists 'moderator';
alter type public.admin_role add value if not exists 'support_manager';
alter type public.admin_role add value if not exists 'notification_manager';
alter type public.admin_role add value if not exists 'community_manager';

-- -----------------------------------------------------------------------------
-- 2. Custom roles and per-administrator overrides.
-- -----------------------------------------------------------------------------

create table if not exists public.admin_custom_roles (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,39}$'),
  label text not null check (length(btrim(label)) between 2 and 60),
  description text not null default '',
  permissions text[] not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_custom_roles enable row level security;
-- No policies: only SECURITY DEFINER RPCs may read or write this table.

alter table public.admin_roles
  add column if not exists custom_role text references public.admin_custom_roles(key) on delete set null;

alter table public.admin_roles
  add column if not exists extra_permissions text[] not null default '{}';

create index if not exists admin_roles_role_active_idx
  on public.admin_roles (role, is_active);

create index if not exists admin_custom_roles_created_at_idx
  on public.admin_custom_roles (created_at desc);

-- The catalogue of permission identifiers the RPCs will accept. Keeping it in
-- one place prevents a custom role from inventing arbitrary permission names.
create or replace function private.admin_all_permissions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    -- dashboard / analytics
    'analytics.view', 'analytics.export',
    -- users
    'users.view', 'users.edit', 'users.suspend', 'users.verify_minor', 'users.delete',
    -- posts
    'posts.view', 'posts.manage', 'posts.delete', 'posts.restore',
    -- reelyx
    'reelyx.view', 'reelyx.manage', 'reelyx.feature',
    -- comments
    'comments.view', 'comments.manage', 'comments.delete',
    -- reports
    'reports.view', 'reports.manage', 'reports.review', 'reports.resolve', 'reports.escalate',
    -- support
    'tickets.view', 'tickets.manage', 'support.assign', 'support.resolve', 'help.manage',
    -- notifications
    'notifications.view', 'notifications.manage', 'notifications.create', 'notifications.send',
    -- roles / administrators
    'admin.manage', 'roles.view', 'roles.create', 'roles.edit', 'roles.delete', 'permissions.assign',
    'admins.view', 'admins.create', 'admins.edit', 'admins.deactivate',
    -- platform
    'audit.view', 'audit_logs.view', 'settings.view', 'settings.manage'
  ]::text[];
$$;

-- Permissions that are never delegable by a non-Super Admin, whether through a
-- custom role or a per-administrator override.
create or replace function private.super_admin_only_permissions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'admin.manage', 'roles.create', 'roles.edit', 'roles.delete', 'permissions.assign',
    'admins.create', 'admins.edit', 'admins.deactivate', 'settings.manage'
  ]::text[];
$$;

-- -----------------------------------------------------------------------------
-- 3. Role -> permission matrix. Existing identifiers are retained verbatim.
-- -----------------------------------------------------------------------------

create or replace function private.admin_permissions_for_role(p_role public.admin_role)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'super_admin' then array[
      'admin.manage', 'roles.view', 'roles.create', 'roles.edit', 'roles.delete', 'permissions.assign',
      'admins.view', 'admins.create', 'admins.edit', 'admins.deactivate',
      'users.view', 'users.edit', 'users.suspend', 'users.verify_minor', 'users.delete',
      'posts.manage', 'posts.view', 'posts.delete', 'posts.restore',
      'reelyx.manage', 'reelyx.view', 'reelyx.feature',
      'comments.manage', 'comments.view', 'comments.delete',
      'reports.manage', 'reports.view', 'reports.review', 'reports.resolve', 'reports.escalate',
      'tickets.view', 'tickets.manage', 'support.assign', 'support.resolve', 'help.manage',
      'notifications.view', 'notifications.manage', 'notifications.create', 'notifications.send',
      'settings.manage', 'settings.view',
      'audit.view', 'audit_logs.view', 'analytics.view', 'analytics.export'
    ]::text[]
    when 'admin' then array[
      'admins.view', 'roles.view',
      'users.view', 'users.edit', 'users.suspend', 'users.verify_minor', 'users.delete',
      'posts.manage', 'posts.view', 'posts.delete', 'posts.restore',
      'reelyx.manage', 'reelyx.view', 'reelyx.feature',
      'comments.manage', 'comments.view', 'comments.delete',
      'reports.manage', 'reports.view', 'reports.review', 'reports.resolve', 'reports.escalate',
      'tickets.view', 'tickets.manage', 'support.assign', 'support.resolve', 'help.manage',
      'notifications.view', 'notifications.manage', 'notifications.create', 'notifications.send',
      'settings.view', 'audit.view', 'analytics.view', 'analytics.export'
    ]::text[]
    when 'content_manager' then array[
      'users.view',
      'posts.manage', 'posts.view', 'posts.delete', 'posts.restore',
      'reelyx.manage', 'reelyx.view', 'reelyx.feature',
      'comments.manage', 'comments.view', 'comments.delete',
      'reports.view', 'reports.review', 'reports.resolve',
      'notifications.view', 'analytics.view'
    ]::text[]
    when 'moderator' then array[
      'users.view',
      'posts.view', 'posts.manage',
      'reelyx.view', 'reelyx.manage',
      'comments.view', 'comments.manage', 'comments.delete',
      'reports.view', 'reports.review', 'reports.resolve', 'reports.escalate',
      'analytics.view'
    ]::text[]
    when 'support_manager' then array[
      'users.view',
      'tickets.view', 'tickets.manage', 'support.assign', 'support.resolve', 'help.manage',
      'reports.view', 'notifications.view',
      'analytics.view', 'analytics.export'
    ]::text[]
    when 'support_agent' then array[
      'users.view',
      'tickets.view', 'tickets.manage', 'support.resolve', 'help.manage',
      'notifications.view', 'reports.view'
    ]::text[]
    when 'content_moderator' then array[
      'users.view', 'users.suspend', 'posts.manage', 'posts.view',
      'reelyx.manage', 'reelyx.view', 'comments.manage', 'comments.view',
      'reports.manage', 'reports.view', 'analytics.view'
    ]::text[]
    when 'analyst' then array[
      'users.view', 'posts.view', 'reelyx.view', 'comments.view',
      'reports.view', 'tickets.view', 'notifications.view',
      'analytics.view', 'analytics.export',
      'audit.view', 'audit_logs.view', 'settings.view',
      'roles.view', 'admins.view'
    ]::text[]
    when 'notification_manager' then array[
      'users.view',
      'notifications.view', 'notifications.manage', 'notifications.create', 'notifications.send',
      'analytics.view'
    ]::text[]
    when 'community_manager' then array[
      'users.view', 'posts.view', 'reelyx.view',
      'comments.view', 'comments.manage',
      'reports.view', 'notifications.view', 'analytics.view'
    ]::text[]
    else array[]::text[]
  end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Permission check: role matrix union custom role union per-admin overrides.
-- -----------------------------------------------------------------------------

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
    join public.profiles p on p.id = r.user_id and p.account_status = 'active'
    left join public.admin_custom_roles c on c.key = r.custom_role
    where r.user_id = auth.uid()
      and r.is_active
      and (
        p_permission = any (private.admin_permissions_for_role(r.role))
        or (c.key is not null and p_permission = any (c.permissions))
        or p_permission = any (r.extra_permissions)
      )
  );
$$;

-- Effective permissions for the signed-in administrator, including overrides.
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
    (
      select array_agg(distinct permission order by permission)
      from unnest(
        private.admin_permissions_for_role(r.role)
        || coalesce(c.permissions, '{}'::text[])
        || r.extra_permissions
      ) as permission
    ) as permissions,
    p.display_name,
    p.username,
    p.avatar_url,
    u.email
  from public.admin_roles r
  join public.profiles p on p.id = r.user_id
  left join auth.users u on u.id = r.user_id
  left join public.admin_custom_roles c on c.key = r.custom_role
  where r.user_id = auth.uid() and r.is_active and p.account_status = 'active';
$$;

-- The official initial Super Admin is identified by its auth email ONLY to
-- protect it, never to grant privileges. Access always comes from the verified
-- admin_roles row written by the server-side seed process. This function is
-- private and SECURITY DEFINER so no client can call it directly.
create or replace function private.is_bootstrap_super_admin(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.admin_roles r
    join auth.users u on u.id = r.user_id
    where r.user_id = p_user_id
      and r.role = 'super_admin'
      and lower(coalesce(u.email, '')) = 'admin@admin.com'
  );
$$;

revoke all on function private.is_bootstrap_super_admin(uuid) from public;
revoke all on function private.is_bootstrap_super_admin(uuid) from anon;
revoke all on function private.is_bootstrap_super_admin(uuid) from authenticated;

-- -----------------------------------------------------------------------------
-- 5. Administrator listing with last login, custom role and overrides.
-- -----------------------------------------------------------------------------

create or replace function public.admin_list_admins()
returns jsonb
language plpgsql security definer stable set search_path = ''
as $$
declare v_items jsonb;
begin
  -- Both full administrators and read-only audience roles may list staff;
  -- every mutating RPC still requires the stricter admin.manage permission.
  if not (private.has_admin_permission('admin.manage') or private.has_admin_permission('admins.view')) then
    raise exception using
      message = 'You do not have permission to perform this administrative action.',
      errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_items
  from (
    select r.user_id, r.role::text as role, r.is_active, r.created_at, r.updated_at,
           private.is_bootstrap_super_admin(r.user_id) as is_protected,
           r.custom_role, r.extra_permissions,
           p.display_name, p.username, p.avatar_url, u.email,
           u.last_sign_in_at,
           creator.username as created_by_username
    from public.admin_roles r
    join public.profiles p on p.id = r.user_id
    left join auth.users u on u.id = r.user_id
    left join public.profiles creator on creator.id = r.created_by
  ) x;
  return jsonb_build_object('items', v_items, 'total', jsonb_array_length(v_items));
end;
$$;

-- Replace the original upsert-only function with one that also toggles status,
-- guards the last active Super Admin and blocks self-promotion.
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
  v_existing_active boolean;
  v_caller_role text;
begin
  -- admin.manage remains the legacy all-access permission; the granular
  -- admins.* permissions can also authorise the matching operation.
  if not (
    private.has_admin_permission('admin.manage')
    or private.has_admin_permission('admins.create')
    or private.has_admin_permission('admins.edit')
    or private.has_admin_permission('admins.deactivate')
  ) then
    raise exception using
      message = 'You do not have permission to perform this administrative action.',
      errcode = '42501';
  end if;
  perform private.check_admin_rate_limit('admin_role_change', 10, 300);
  -- Serialise role changes so concurrent admins cannot both deactivate the
  -- last active Super Admin after each observes more than one.
  perform pg_advisory_xact_lock(hashtext('tachireel.admin_roles'));

  -- Even another Super Admin cannot demote, deactivate or remove the initial
  -- Super Admin through an RPC. Only the server-side seed process may change it.
  if private.is_bootstrap_super_admin(p_user_id) then
    raise exception 'The initial Super Admin is protected. Use the server-side seed process to change it.';
  end if;

  v_caller_role := private.current_admin_role();

  select role, is_active into v_existing_role, v_existing_active
  from public.admin_roles where user_id = p_user_id;

  if p_action in ('deactivate', 'activate', 'remove')
     and not (private.has_admin_permission('admin.manage') or private.has_admin_permission('admins.deactivate')) then
    raise exception using
      message = 'You do not have permission to change administrator status.',
      errcode = '42501';
  end if;
  if coalesce(p_action, 'upsert') = 'upsert'
     and not (
       private.has_admin_permission('admin.manage')
       or (v_existing_role is null and private.has_admin_permission('admins.create'))
       or (v_existing_role is not null and private.has_admin_permission('admins.edit'))
     ) then
    raise exception using
      message = 'You do not have permission to assign this administrator role.',
      errcode = '42501';
  end if;

  select count(*)::int into v_super_count
  from public.admin_roles where role = 'super_admin' and is_active;

  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own admin role here.';
  end if;

  if p_action = 'deactivate' then
    if v_existing_role is null then
      raise exception 'That account is not an administrator.';
    end if;
    if v_existing_role = 'super_admin' and v_super_count <= 1 then
      raise exception 'At least one active Super Admin must remain.';
    end if;
    update public.admin_roles set is_active = false, updated_at = now() where user_id = p_user_id;
    perform private.write_admin_audit('admin_role.deactivate', 'admin', p_user_id::text,
      jsonb_build_object('role', v_existing_role::text));
    return jsonb_build_object('success', true, 'user_id', p_user_id, 'is_active', false);
  end if;

  if p_action = 'activate' then
    if v_existing_role is null then
      raise exception 'That account is not an administrator.';
    end if;
    update public.admin_roles set is_active = true, updated_at = now() where user_id = p_user_id;
    perform private.write_admin_audit('admin_role.activate', 'admin', p_user_id::text,
      jsonb_build_object('role', v_existing_role::text));
    return jsonb_build_object('success', true, 'user_id', p_user_id, 'is_active', true);
  end if;

  if p_action = 'remove' then
    if v_existing_role = 'super_admin' and v_super_count <= 1 then
      raise exception 'At least one active Super Admin must remain.';
    end if;
    delete from public.admin_roles where user_id = p_user_id;
    perform private.write_admin_audit('admin_role.remove', 'admin', p_user_id::text,
      jsonb_build_object('previous_role', v_existing_role::text));
    return jsonb_build_object('success', true, 'user_id', p_user_id, 'removed', true);
  end if;

  if coalesce(p_role, '') not in (
    'super_admin', 'admin', 'content_manager', 'moderator', 'support_manager',
    'support_agent', 'content_moderator', 'analyst', 'notification_manager', 'community_manager'
  ) then
    raise exception 'Invalid admin role.';
  end if;
  v_role := p_role::public.admin_role;

  -- Only an active Super Admin may create or alter a Super Admin.
  if (v_role = 'super_admin' or v_existing_role = 'super_admin')
     and v_caller_role is distinct from 'super_admin' then
    raise exception 'Only a Super Admin can change Super Admin access.';
  end if;

  if v_existing_role = 'super_admin' and v_role <> 'super_admin' and v_super_count <= 1 then
    raise exception 'At least one active Super Admin must remain.';
  end if;

  insert into public.admin_roles (user_id, role, is_active, created_by, custom_role, extra_permissions)
  values (p_user_id, v_role, true, auth.uid(), null, '{}')
  on conflict (user_id) do update
    set role = excluded.role,
        is_active = true,
        custom_role = null,
        extra_permissions = '{}',
        updated_at = now();

  perform private.write_admin_audit('admin_role.upsert', 'admin', p_user_id::text,
    jsonb_build_object('role', p_role, 'previous_role', v_existing_role::text,
                       'was_active', coalesce(v_existing_active, false)));
  return jsonb_build_object('success', true, 'user_id', p_user_id, 'role', p_role);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Role registry and custom-role management.
-- -----------------------------------------------------------------------------

create or replace function public.admin_list_roles()
returns jsonb
language plpgsql security definer stable set search_path = ''
as $$
declare v_roles jsonb;
begin
  perform private.require_admin_permission('roles.view');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.is_system desc, x.label), '[]'::jsonb)
  into v_roles
  from (
    select role_label as key,
           role_label as label,
           true as is_system,
           ''::text as description,
           private.admin_permissions_for_role(role_value) as permissions,
           (select count(*)::int from public.admin_roles a
             where a.role = role_value and a.custom_role is null) as assigned_count
    from (
      select unnest(enum_range(null::public.admin_role)) as role_value,
             unnest(enum_range(null::public.admin_role))::text as role_label
    ) e
    union all
    select c.key, c.label, false, c.description, c.permissions,
           (select count(*)::int from public.admin_roles a where a.custom_role = c.key)
    from public.admin_custom_roles c
  ) x;

  return jsonb_build_object('roles', v_roles);
end;
$$;

create or replace function public.admin_upsert_custom_role(
  p_key text,
  p_label text,
  p_description text,
  p_permissions text[]
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text := lower(btrim(coalesce(p_key, '')));
  v_permissions text[];
begin
  if not (
    private.has_admin_permission('permissions.assign')
    or private.has_admin_permission('admin.manage')
    or private.has_admin_permission('roles.create')
  ) then
    raise exception using
      message = 'You do not have permission to create roles.',
      errcode = '42501';
  end if;
  perform private.check_admin_rate_limit('custom_role_write', 10, 300);

  if v_key !~ '^[a-z][a-z0-9_]{2,39}$' then
    raise exception 'Role keys must be 3–40 characters: lowercase letters, numbers or underscores, starting with a letter.';
  end if;
  if v_key = any (enum_range(null::public.admin_role)::text[]) then
    raise exception 'That key is reserved by a built-in role.';
  end if;
  if length(btrim(coalesce(p_label, ''))) < 2 then
    raise exception 'Give the role a name of at least two characters.';
  end if;
  if exists (select 1 from public.admin_custom_roles where key = v_key)
     and not (
       private.has_admin_permission('permissions.assign')
       or private.has_admin_permission('admin.manage')
       or private.has_admin_permission('roles.edit')
     ) then
    raise exception using
      message = 'You do not have permission to edit roles.',
      errcode = '42501';
  end if;

  select coalesce(array_agg(distinct p order by p), '{}'::text[])
  into v_permissions
  from unnest(coalesce(p_permissions, '{}'::text[])) as p;

  if exists (
    select 1 from unnest(v_permissions) as p
    where p <> all (private.admin_all_permissions())
  ) then
    raise exception 'One or more permission identifiers are not recognised.';
  end if;

  -- A delegated operator must not be able to build a custom role that is more
  -- powerful than itself, or one containing Super-Admin-only permissions.
  if private.current_admin_role() is distinct from 'super_admin' then
    if exists (
      select 1 from unnest(v_permissions) as p
      where p = any (private.super_admin_only_permissions())
    ) then
      raise exception 'Only a Super Admin can grant that permission.';
    end if;
    if exists (
      select 1 from unnest(v_permissions) as p
      where not private.has_admin_permission(p)
    ) then
      raise exception 'You can only grant permissions you already hold.';
    end if;
  end if;

  insert into public.admin_custom_roles (key, label, description, permissions, created_by)
  values (v_key, btrim(p_label), coalesce(p_description, ''), v_permissions, auth.uid())
  on conflict (key) do update
    set label = excluded.label,
        description = excluded.description,
        permissions = excluded.permissions,
        updated_at = now();

  perform private.write_admin_audit('custom_role.upsert', 'admin_role', v_key,
    jsonb_build_object('permissions', v_permissions, 'label', btrim(p_label)));

  return jsonb_build_object('success', true, 'key', v_key, 'permissions', v_permissions);
end;
$$;

create or replace function public.admin_delete_custom_role(p_key text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_key text := btrim(coalesce(p_key, ''));
begin
  if not (
    private.has_admin_permission('permissions.assign')
    or private.has_admin_permission('admin.manage')
    or private.has_admin_permission('roles.delete')
  ) then
    raise exception using
      message = 'You do not have permission to delete roles.',
      errcode = '42501';
  end if;
  perform private.check_admin_rate_limit('custom_role_write', 10, 300);

  if v_key = any (enum_range(null::public.admin_role)::text[]) then
    raise exception 'Built-in roles cannot be deleted.';
  end if;
  if not exists (select 1 from public.admin_custom_roles where key = v_key) then
    raise exception 'That role does not exist.';
  end if;
  if exists (select 1 from public.admin_roles where custom_role = v_key) then
    raise exception 'Move the assigned administrators to another role before deleting this one.';
  end if;

  delete from public.admin_custom_roles where key = v_key;
  perform private.write_admin_audit('custom_role.delete', 'admin_role', v_key);
  return jsonb_build_object('success', true, 'key', v_key);
end;
$$;

-- Attach a custom role and/or additive permission overrides to one administrator.
create or replace function public.admin_set_admin_access(
  p_user_id uuid,
  p_custom_role text,
  p_extra_permissions text[]
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_custom_role text := nullif(btrim(coalesce(p_custom_role, '')), '');
  v_extra text[];
begin
  perform private.require_admin_permission('permissions.assign');
  perform private.check_admin_rate_limit('admin_permission_change', 20, 300);

  if private.is_bootstrap_super_admin(p_user_id) then
    raise exception 'The initial Super Admin permissions come from its Super Admin role and cannot be changed here.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own permissions.';
  end if;
  if not exists (select 1 from public.admin_roles where user_id = p_user_id) then
    raise exception 'That account is not an administrator.';
  end if;
  if v_custom_role is not null
     and not exists (select 1 from public.admin_custom_roles where key = v_custom_role) then
    raise exception 'That custom role does not exist.';
  end if;
  if v_custom_role is not null and private.current_admin_role() is distinct from 'super_admin' then
    if exists (
      select 1
      from public.admin_custom_roles c, unnest(c.permissions) as p
      where c.key = v_custom_role
        and (p = any (private.super_admin_only_permissions()) or not private.has_admin_permission(p))
    ) then
      raise exception 'You can only assign a custom role whose permissions you hold and that contains no Super-Admin-only permission.';
    end if;
  end if;

  select coalesce(array_agg(distinct p order by p), '{}'::text[])
  into v_extra
  from unnest(coalesce(p_extra_permissions, '{}'::text[])) as p;

  if exists (
    select 1 from unnest(v_extra) as p
    where p <> all (private.admin_all_permissions())
  ) then
    raise exception 'One or more permission identifiers are not recognised.';
  end if;

  -- A non-Super-Admin operator can never grant Super-Admin-only permissions
  -- or permissions it does not itself hold.
  if private.current_admin_role() is distinct from 'super_admin' then
    if exists (
      select 1 from unnest(v_extra) as p
      where p = any (private.super_admin_only_permissions())
    ) then
      raise exception 'Only a Super Admin can grant that permission.';
    end if;
    if exists (
      select 1 from unnest(v_extra) as p
      where not private.has_admin_permission(p)
    ) then
      raise exception 'You can only grant permissions you already hold.';
    end if;
  end if;

  update public.admin_roles
  set custom_role = v_custom_role,
      extra_permissions = v_extra,
      updated_at = now()
  where user_id = p_user_id;

  perform private.write_admin_audit('admin_permissions.set', 'admin', p_user_id::text,
    jsonb_build_object('custom_role', v_custom_role, 'extra_permissions', v_extra));

  return jsonb_build_object('success', true, 'user_id', p_user_id,
                            'custom_role', v_custom_role, 'extra_permissions', v_extra);
end;
$$;

-- Marker used by admin_schema.sql to avoid silently downgrading this migration
-- when the base admin migration is re-applied on an upgraded database.
create or replace function private.admin_rbac_v2_installed()
returns boolean
language sql
immutable
set search_path = ''
as $$ select true $$;

revoke all on function private.admin_rbac_v2_installed() from public;
revoke all on function private.admin_rbac_v2_installed() from anon;
revoke all on function private.admin_rbac_v2_installed() from authenticated;

-- Successful administrator sign-in and explicit sign-out are audited from the
-- client after Supabase Auth validates the credentials. Failed logins cannot be
-- attributed server-side here; enable Supabase Auth rate limiting/CAPTCHA in
-- the project dashboard as the authoritative control.
create or replace function public.admin_log_auth_event(p_event text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(p_event, '') not in ('login', 'logout') then
    raise exception 'Unknown authentication event.';
  end if;
  if not exists (select 1 from public.admin_roles where user_id = auth.uid()) then
    return jsonb_build_object('success', true, 'audited', false);
  end if;
  perform private.write_admin_audit('auth.' || p_event, 'admin', auth.uid()::text,
    jsonb_build_object('event', p_event));
  return jsonb_build_object('success', true, 'audited', true);
end;
$$;

-- Fail the migration if the Super Admin matrix ever stops covering every
-- permission. This keeps "Super Admin = all platform permissions" enforceable.
do $$
begin
  if exists (
    select 1
    from unnest(private.admin_all_permissions()) as p
    where not (p = any (private.admin_permissions_for_role('super_admin')))
  ) then
    raise exception 'Super Admin permissions are incomplete.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 7. Grants: same explicit allowlist pattern as admin_schema.sql.
-- -----------------------------------------------------------------------------

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'admin_get_my_access', 'admin_list_admins', 'admin_mutate_admin',
      'admin_list_roles', 'admin_upsert_custom_role', 'admin_delete_custom_role',
      'admin_set_admin_access', 'admin_log_auth_event'
    )
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('revoke all on function %s from anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

revoke all on function private.admin_all_permissions() from public;
revoke all on function private.admin_all_permissions() from anon;

/* =============================================================================
 * SEEDING THE FIRST SUPER ADMIN
 *
 * Do not insert a role here by hand and do not hardcode a password. Use the
 * secure, idempotent provisioning script:
 *
 *   SUPABASE_URL=https://<project>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   npm run seed:super-admin
 *
 * Default email: admin@admin.com — the official initial Super Admin. The email
 * is used only to identify the protected account, never to grant privileges.
 * It creates the auth account only if missing, prints a one-time recovery link
 * for the owner to set a password, and then assigns SUPER_ADMIN in this table.
 *
 * Verify after running it (server-side only):
 *   select u.email, r.role, r.is_active, p.account_status
 *   from public.admin_roles r
 *   join auth.users u on u.id = r.user_id
 *   join public.profiles p on p.id = r.user_id
 *   where u.email = 'admin@admin.com';
 * =========================================================================== */
