-- Local-only RBAC integration assertions. Run against a fresh temporary
-- database created by `npm run verify:rbac`. Never run this against production:
-- it creates auth users and admin roles.

\set bootstrap '11111111-1111-1111-1111-111111111111'
\set second    '22222222-2222-2222-2222-222222222222'
\set moderator '33333333-3333-3333-3333-333333333333'
\set member    '44444444-4444-4444-4444-444444444444'
\set ops       '66666666-6666-6666-6666-666666666666'
\set support   '99999999-9999-9999-9999-999999999999'
\set suspended '55555555-5555-5555-5555-555555555555'
\set viewer    'cccccccc-cccc-cccc-cccc-cccccccccccc'
\set granter   'dddddddd-dddd-dddd-dddd-dddddddddddd'
\set notifier  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
\set closer    'ffffffff-ffff-ffff-ffff-ffffffffffff'
\set target    '12121212-1212-1212-1212-121212121212'

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.posts, public.comments, public.profiles to authenticated;
grant select on public.follows to authenticated;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  (:'bootstrap', 'admin@admin.com', '{"date_of_birth":"1990-01-01","display_name":"Super Admin","username":"superadmin"}'),
  (:'second',    'second@admin.com', '{"date_of_birth":"1990-01-01","display_name":"Second Admin","username":"secondadmin"}'),
  (:'moderator', 'mod@admin.com', '{"date_of_birth":"1990-01-01","display_name":"Moderator","username":"moderator"}'),
  (:'member',    'member@example.com', '{"date_of_birth":"1990-01-01","display_name":"Member","username":"member"}'),
  (:'ops',       'ops@admin.com', '{"date_of_birth":"1990-01-01","display_name":"Ops Admin","username":"opsadmin"}'),
  (:'support',   'agent@admin.com', '{"date_of_birth":"1990-01-01","display_name":"Support Agent","username":"supportagent"}'),
  (:'suspended', 'suspended@admin.com', '{"date_of_birth":"1990-01-01","display_name":"Suspended Admin","username":"suspendedadmin"}'),
  (:'viewer',    'viewer@admin.com', '{"date_of_birth":"1990-01-01","display_name":"Read Only Analyst","username":"rbacviewer"}'),
  (:'granter',   'granter@admin.com', '{"date_of_birth":"1990-01-01","display_name":"Granular Admin","username":"rbacgranter"}'),
  (:'notifier',  'notifier@admin.com', '{"date_of_birth":"1990-01-01","display_name":"Notification Operator","username":"rbacnotifier"}'),
  (:'closer',    'closer@admin.com', '{"date_of_birth":"1990-01-01","display_name":"Support Resolver","username":"rbaccloser"}'),
  (:'target',    'target@example.com', '{"date_of_birth":"1990-01-01","display_name":"RBAC Target","username":"rbactarget"}');

insert into public.admin_roles (user_id, role, is_active) values
  (:'bootstrap', 'super_admin', true),
  (:'second',    'super_admin', true),
  (:'moderator', 'moderator', true),
  (:'ops',       'admin', true),
  (:'support',   'support_agent', true),
  (:'suspended', 'admin', true),
  (:'viewer',    'analyst', true),
  (:'granter',   'admin', true),
  (:'notifier',  'analyst', true),
  (:'closer',    'content_manager', true);

update public.profiles set account_status = 'suspended' where id = :'suspended';

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select u.email, r.role, r.is_active, p.account_status
from auth.users u
join public.admin_roles r on r.user_id = u.id
join public.profiles p on p.id = u.id
where u.email = 'admin@admin.com';

do $$
begin
  if not private.is_bootstrap_super_admin('11111111-1111-1111-1111-111111111111') then
    raise exception 'FAIL: admin@admin.com is not recognised as the protected Super Admin';
  end if;
  if exists (
    select 1
    from unnest(private.admin_all_permissions()) p
    where not exists (
      select 1 from unnest((select permissions from public.admin_get_my_access())) have
      where have = p
    )
  ) then
    raise exception 'FAIL: Super Admin is missing a permission';
  end if;
  raise notice 'PASS: admin@admin.com is an active Super Admin with all permissions';
end $$;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare v_action text;
begin
  foreach v_action in array array['upsert', 'deactivate', 'remove'] loop
    begin
      perform public.admin_mutate_admin('11111111-1111-1111-1111-111111111111', 'analyst', v_action);
      raise exception 'FAIL: another Super Admin could % the protected account', v_action;
    exception when others then
      if sqlerrm like 'FAIL:%' then raise; end if;
      raise notice 'PASS: another Super Admin cannot % the protected account', v_action;
    end;
  end loop;

  begin
    perform public.admin_set_admin_access('11111111-1111-1111-1111-111111111111', null, '{}');
    raise exception 'FAIL: protected permissions were changed';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: protected Super Admin permissions cannot be changed';
  end;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
begin
  begin
    perform public.admin_mutate_admin('44444444-4444-4444-4444-444444444444', 'super_admin', 'upsert');
    raise exception 'FAIL: moderator granted Super Admin';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: moderator cannot grant Super Admin';
  end;
  begin
    perform public.admin_list_admins();
    raise exception 'FAIL: moderator listed administrators';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: moderator cannot list administrators';
  end;
  begin
    perform public.admin_get_settings();
    raise exception 'FAIL: settings.view gate is missing';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: settings access requires settings.view';
  end;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.admin_get_my_access();
  if v_count <> 0 then raise exception 'FAIL: normal member has admin access'; end if;
  begin
    perform public.admin_list_admins();
    raise exception 'FAIL: normal member called admin RPC';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: normal member has no admin access';
  end;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  begin
    perform public.admin_upsert_custom_role('bad_role', 'Bad', '', array['not.a.permission']);
    raise exception 'FAIL: unknown custom-role permission was accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: custom-role permissions are validated';
  end;
  begin
    perform public.admin_delete_custom_role('super_admin');
    raise exception 'FAIL: predefined role was deleted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: predefined roles cannot be deleted';
  end;
end $$;
reset role;

-- Make the second Super Admin the only active one, then let an admin (not a
-- Super Admin) attempt to deactivate it.
update public.admin_roles set is_active = false where user_id = '11111111-1111-1111-1111-111111111111';
update public.admin_roles
set extra_permissions = array['admin.manage']
where user_id = '66666666-6666-6666-6666-666666666666';

set role authenticated;
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
do $$
begin
  begin
    perform public.admin_mutate_admin('22222222-2222-2222-2222-222222222222', 'analyst', 'deactivate');
    raise exception 'FAIL: last active Super Admin was deactivated';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: last active Super Admin cannot be deactivated';
  end;
end $$;
reset role;

-- A normal member cannot self-approve a post, but can still create a pending one.
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$
begin
  begin
    insert into public.posts (author_id, media_type, media_key, sensitive_review_status)
    values ('44444444-4444-4444-4444-444444444444', 'photo', 'member/safe.jpg', 'safe');
    raise exception 'FAIL: member self-approved a post';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: members cannot create an already-approved post';
  end;
  insert into public.posts (id, author_id, media_type, media_key, sensitive_review_status)
  values ('77777777-7777-7777-7777-777777777777', '44444444-4444-4444-4444-444444444444', 'photo', 'member/pending.jpg', 'pending');
  insert into public.posts (id, author_id, media_type, media_key, sensitive_review_status)
  values ('88888888-8888-8888-8888-888888888888', '44444444-4444-4444-4444-444444444444', 'video', 'member/reelyx.mp4', 'pending');
  raise notice 'PASS: members can still create pending posts';
end $$;
reset role;

-- posts.manage does not imply delete, restore or feature. Those checks live in
-- admin_mutate_content, not just in the admin interface.
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare v_action text;
begin
  foreach v_action in array array['remove', 'restore'] loop
    begin
      perform public.admin_mutate_content('post', '77777777-7777-7777-7777-777777777777', v_action);
      raise exception 'FAIL: moderator could % a post without the granular permission', v_action;
    exception when others then
      if sqlerrm like 'FAIL:%' then raise; end if;
      raise notice 'PASS: moderator cannot % a post without the granular permission', v_action;
    end;
  end loop;
  begin
    perform public.admin_mutate_content('post', '77777777-7777-7777-7777-777777777777', 'set_status', 'removed');
    raise exception 'FAIL: moderator bypassed posts.delete with set_status';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: set_status to removed requires posts.delete';
  end;
  begin
    perform public.admin_mutate_content('reelyx', '88888888-8888-8888-8888-888888888888', 'feature');
    raise exception 'FAIL: moderator featured a Reelyx without reelyx.feature';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: featuring Reelyx requires reelyx.feature';
  end;
end $$;
reset role;

-- An administrator with users.suspend cannot suspend/delete the protected account.
set role authenticated;
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
do $$
declare v_action text;
begin
  foreach v_action in array array['suspend', 'delete'] loop
    begin
      perform public.admin_mutate_user('11111111-1111-1111-1111-111111111111', v_action);
      raise exception 'FAIL: bootstrap Super Admin could be % by an admin', v_action;
    exception when others then
      if sqlerrm like 'FAIL:%' then raise; end if;
      raise notice 'PASS: bootstrap Super Admin cannot be % by an admin', v_action;
    end;
  end loop;

  perform public.admin_log_auth_event('login');
  raise notice 'PASS: administrator sign-in is audited';
end $$;
reset role;

-- A delegated operator cannot create a custom role with Super-Admin-only rights.
update public.admin_roles
set extra_permissions = array['admin.manage', 'permissions.assign']
where user_id = '66666666-6666-6666-6666-666666666666';
set role authenticated;
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
do $$
begin
  begin
    perform public.admin_upsert_custom_role('escalated_role', 'Escalated', '', array['admin.manage']);
    raise exception 'FAIL: delegated operator created an escalated custom role';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: delegated operators cannot create escalated custom roles';
  end;
end $$;
reset role;

-- A suspended administrator has no effective access, even with an active role row.
set role authenticated;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.admin_get_my_access();
  if v_count <> 0 then raise exception 'FAIL: suspended administrator has access'; end if;
  begin
    perform public.admin_list_admins();
    raise exception 'FAIL: suspended administrator listed staff';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: suspended administrators are denied access';
  end;
end $$;
reset role;

-- Reports: review/resolve are separate from reports.manage. A moderator can
-- decide a report but cannot reassign it.
insert into public.reports (id, reporter_id, reason)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'Test report for RBAC assertions');
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
begin
  begin
    perform public.admin_mutate_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'assign', '22222222-2222-2222-2222-222222222222');
    raise exception 'FAIL: moderator reassigned a report without reports.manage';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: report assignment requires reports.manage';
  end;
  perform public.admin_mutate_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'decide', 'resolved', 'Handled by RBAC harness');
  raise notice 'PASS: reports.resolve allows a moderator to resolve a report';
end $$;
reset role;

-- Support: an agent may reply to tickets but not assign them.
insert into public.support_tickets (id, user_id, subject, category)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', 'RBAC harness ticket', 'other');
set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
do $$
begin
  begin
    perform public.admin_mutate_ticket('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'assign', '99999999-9999-9999-9999-999999999999');
    raise exception 'FAIL: support agent assigned a ticket without support.assign';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: ticket assignment requires support.assign';
  end;
  perform public.admin_mutate_ticket('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'reply', null, 'Reply from RBAC harness');
  raise notice 'PASS: support agents can reply to tickets';
end $$;
reset role;

-- Read-only staff can view staff/role/audit lists but cannot change them. The
-- analyst role carries admins.view, roles.view and audit_logs.view only.
set role authenticated;
set request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
do $$
begin
  perform public.admin_list_admins();
  perform public.admin_list_roles();
  perform public.admin_list_audit();
  raise notice 'PASS: read-only staff can view staff, roles and audit logs';
  begin
    perform public.admin_mutate_admin('12121212-1212-1212-1212-121212121212', 'analyst', 'upsert');
    raise exception 'FAIL: read-only staff assigned an admin role';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: admins.view does not allow role changes';
  end;
  begin
    perform public.admin_upsert_custom_role('analyst_role', 'Analyst role', '', array['users.view']);
    raise exception 'FAIL: read-only staff created a custom role';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: roles.view does not allow role creation';
  end;
end $$;
reset role;

-- Granular admins.create permits assignment but not deactivation or permission
-- overrides.
update public.admin_roles
set extra_permissions = array['admins.create']
where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
set role authenticated;
set request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
do $$
begin
  perform public.admin_mutate_admin('12121212-1212-1212-1212-121212121212', 'analyst', 'upsert');
  raise notice 'PASS: admins.create allows assigning a new administrator';
  begin
    perform public.admin_mutate_admin('cccccccc-cccc-cccc-cccc-cccccccccccc', 'analyst', 'deactivate');
    raise exception 'FAIL: admins.create allowed deactivation';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: admins.create does not allow deactivation';
  end;
  begin
    perform public.admin_set_admin_access('12121212-1212-1212-1212-121212121212', null, '{}');
    raise exception 'FAIL: admins.create allowed permission overrides';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: permission overrides require permissions.assign';
  end;
end $$;
reset role;

-- roles.create permits creating and editing a role it can already grant, but
-- deletion remains a separate roles.delete permission.
update public.admin_roles
set extra_permissions = array['roles.create']
where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
set role authenticated;
set request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
do $$
begin
  perform public.admin_upsert_custom_role('granter_role', 'Granter role', '', array['users.view']);
  begin
    perform public.admin_delete_custom_role('granter_role');
    raise exception 'FAIL: roles.create allowed role deletion';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: roles.create does not allow deletion';
  end;
end $$;
reset role;

update public.admin_roles
set extra_permissions = array['roles.create', 'roles.edit']
where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
set role authenticated;
set request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
do $$
begin
  perform public.admin_upsert_custom_role('granter_role', 'Granular role', 'Edited by harness', array['users.view']);
  raise notice 'PASS: roles.edit allows updating an existing custom role';
end $$;
reset role;

update public.admin_roles
set extra_permissions = array['roles.create', 'roles.edit', 'roles.delete']
where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
set role authenticated;
set request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
do $$
begin
  perform public.admin_delete_custom_role('granter_role');
  raise notice 'PASS: roles.delete allows removing an unassigned custom role';
end $$;
reset role;

-- Profile edits can change display fields but never the protected bootstrap
-- account, and validation still runs inside Postgres.
set role authenticated;
set request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
do $$
begin
  perform public.admin_edit_user('12121212-1212-1212-1212-121212121212', 'RBAC Target', 'rbac_target', 'Edited by harness');
  raise notice 'PASS: users.edit updates non-safety profile fields';
  begin
    perform public.admin_edit_user('11111111-1111-1111-1111-111111111111', 'Changed', 'changed', '');
    raise exception 'FAIL: the bootstrap account profile was editable';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: the bootstrap Super Admin profile is protected';
  end;
  begin
    perform public.admin_edit_user('12121212-1212-1212-1212-121212121212', 'Changed', 'Invalid Username', '');
    raise exception 'FAIL: invalid username was accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: admin profile edits are validated server-side';
  end;
end $$;
reset role;

-- Notification creation and delivery are separate permissions.
update public.admin_roles
set extra_permissions = array['notifications.manage', 'notifications.create']
where user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
set role authenticated;
set request.jwt.claim.sub = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
do $$
declare v_id uuid;
begin
  v_id := (public.admin_create_notification('RBAC draft', 'Created by harness', 'general', 'all', '{}'::uuid[], null, false)->>'id')::uuid;
  begin
    perform public.admin_send_notification(v_id);
    raise exception 'FAIL: notifications.create allowed sending';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: notifications.create does not allow sending';
  end;
end $$;
reset role;

update public.admin_roles
set extra_permissions = array['notifications.manage', 'notifications.create', 'notifications.send']
where user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
set role authenticated;
set request.jwt.claim.sub = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
do $$
declare v_id uuid;
begin
  v_id := (public.admin_create_notification('RBAC sent', 'Sent by harness', 'general', 'all', '{}'::uuid[], null, false)->>'id')::uuid;
  perform public.admin_send_notification(v_id);
  raise notice 'PASS: notifications.send allows delivery';
end $$;
reset role;

-- Closing a ticket requires support.resolve even when tickets.manage is held.
update public.admin_roles
set extra_permissions = array['tickets.manage']
where user_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
set role authenticated;
set request.jwt.claim.sub = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
do $$
begin
  begin
    perform public.admin_mutate_ticket('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'status', 'resolved');
    raise exception 'FAIL: ticket was closed without support.resolve';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: closing a ticket requires support.resolve';
  end;
end $$;
reset role;

update public.admin_roles
set extra_permissions = array['tickets.manage', 'support.resolve']
where user_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
set role authenticated;
set request.jwt.claim.sub = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
do $$
begin
  perform public.admin_mutate_ticket('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'status', 'resolved');
  raise notice 'PASS: support.resolve allows closing a ticket';
end $$;
reset role;

-- Standalone report notes are allowed with review rights but not with view-only
-- access.
set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
do $$
begin
  begin
    perform public.admin_mutate_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'note', null, 'View-only note attempt');
    raise exception 'FAIL: view-only staff added a report note';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: report notes require review or manage rights';
  end;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
begin
  perform public.admin_mutate_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'note', null, 'Note from RBAC harness');
  raise notice 'PASS: moderators can add standalone report notes';
  begin
    perform public.admin_export_analytics(now() - interval '1 day', now());
    raise exception 'FAIL: analytics.view allowed data export';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: analytics export requires analytics.export';
  end;
end $$;
reset role;

-- New read/detail RPCs are callable by a Super Admin and return their expected
-- top-level payloads.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_result jsonb;
  v_notification_id uuid;
begin
  v_result := public.admin_get_content_history('post', '77777777-7777-7777-7777-777777777777');
  if not (v_result ? 'items') then raise exception 'FAIL: content history payload missing'; end if;
  v_result := public.admin_get_ticket('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  if not (v_result ? 'history') then raise exception 'FAIL: ticket history payload missing'; end if;
  select (public.admin_list_notifications(10, 0) -> 'items' -> 0 ->> 'id')::uuid into v_notification_id;
  if v_notification_id is null then raise exception 'FAIL: notification was not listed'; end if;
  v_result := public.admin_get_notification(v_notification_id);
  if not (v_result ? 'delivery') then raise exception 'FAIL: notification delivery payload missing'; end if;
  v_result := public.admin_export_analytics(now() - interval '1 day', now());
  if not (v_result ? 'generated_at') then raise exception 'FAIL: analytics export payload missing'; end if;
  raise notice 'PASS: history, delivery and export RPCs return server-checked data';
end $$;
reset role;
