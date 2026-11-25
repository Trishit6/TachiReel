import { supabase } from './supabase';

export type AdminRole =
  | 'super_admin'
  | 'admin'
  | 'content_manager'
  | 'moderator'
  | 'support_manager'
  | 'support_agent'
  | 'analyst'
  | 'notification_manager'
  | 'community_manager'
  // Kept so existing assignments keep working after the v2 migration.
  | 'content_moderator';

export type AdminPermission =
  | 'admin.manage'
  | 'roles.view'
  | 'roles.create'
  | 'roles.edit'
  | 'roles.delete'
  | 'permissions.assign'
  | 'admins.view'
  | 'admins.create'
  | 'admins.edit'
  | 'admins.deactivate'
  | 'users.view'
  | 'users.edit'
  | 'users.suspend'
  | 'users.verify_minor'
  | 'users.delete'
  | 'posts.manage'
  | 'posts.view'
  | 'posts.delete'
  | 'posts.restore'
  | 'reelyx.manage'
  | 'reelyx.view'
  | 'reelyx.feature'
  | 'comments.manage'
  | 'comments.view'
  | 'comments.delete'
  | 'reports.manage'
  | 'reports.view'
  | 'reports.review'
  | 'reports.resolve'
  | 'reports.escalate'
  | 'tickets.view'
  | 'tickets.manage'
  | 'support.assign'
  | 'support.resolve'
  | 'help.manage'
  | 'notifications.view'
  | 'notifications.manage'
  | 'notifications.create'
  | 'notifications.send'
  | 'settings.view'
  | 'settings.manage'
  | 'audit.view'
  | 'audit_logs.view'
  | 'analytics.view'
  | 'analytics.export';

export const ADMIN_ROLES: AdminRole[] = [
  'super_admin', 'admin', 'content_manager', 'moderator', 'support_manager',
  'support_agent', 'analyst', 'notification_manager', 'community_manager',
  'content_moderator',
];

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  content_manager: 'Content Manager',
  moderator: 'Moderator',
  support_manager: 'Support Manager',
  support_agent: 'Support Agent',
  analyst: 'Analyst',
  notification_manager: 'Notification Manager',
  community_manager: 'Community Manager',
  content_moderator: 'Content Moderator (legacy)',
};

/**
 * Keep this matrix in sync with private.admin_permissions_for_role() in
 * supabase/admin_rbac_v2.sql. It only controls what the interface shows — every
 * RPC repeats the check in Postgres before touching data.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  super_admin: [
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
    'audit.view', 'audit_logs.view', 'analytics.view', 'analytics.export',
  ],
  admin: [
    'admins.view', 'roles.view',
    'users.view', 'users.edit', 'users.suspend', 'users.verify_minor', 'users.delete',
    'posts.manage', 'posts.view', 'posts.delete', 'posts.restore',
    'reelyx.manage', 'reelyx.view', 'reelyx.feature',
    'comments.manage', 'comments.view', 'comments.delete',
    'reports.manage', 'reports.view', 'reports.review', 'reports.resolve', 'reports.escalate',
    'tickets.view', 'tickets.manage', 'support.assign', 'support.resolve', 'help.manage',
    'notifications.view', 'notifications.manage', 'notifications.create', 'notifications.send',
    'settings.view', 'audit.view', 'analytics.view', 'analytics.export',
  ],
  content_manager: [
    'users.view',
    'posts.manage', 'posts.view', 'posts.delete', 'posts.restore',
    'reelyx.manage', 'reelyx.view', 'reelyx.feature',
    'comments.manage', 'comments.view', 'comments.delete',
    'reports.view', 'reports.review', 'reports.resolve',
    'notifications.view', 'analytics.view',
  ],
  moderator: [
    'users.view',
    'posts.view', 'posts.manage',
    'reelyx.view', 'reelyx.manage',
    'comments.view', 'comments.manage', 'comments.delete',
    'reports.view', 'reports.review', 'reports.resolve', 'reports.escalate',
    'analytics.view',
  ],
  support_manager: [
    'users.view',
    'tickets.view', 'tickets.manage', 'support.assign', 'support.resolve', 'help.manage',
    'reports.view', 'notifications.view',
    'analytics.view', 'analytics.export',
  ],
  support_agent: [
    'users.view',
    'tickets.view', 'tickets.manage', 'support.resolve', 'help.manage',
    'notifications.view', 'reports.view',
  ],
  analyst: [
    'users.view', 'posts.view', 'reelyx.view', 'comments.view',
    'reports.view', 'tickets.view', 'notifications.view',
    'analytics.view', 'analytics.export',
    'audit.view', 'audit_logs.view', 'settings.view',
    'roles.view', 'admins.view',
  ],
  notification_manager: [
    'users.view',
    'notifications.view', 'notifications.manage', 'notifications.create', 'notifications.send',
    'analytics.view',
  ],
  community_manager: [
    'users.view', 'posts.view', 'reelyx.view',
    'comments.view', 'comments.manage',
    'reports.view', 'notifications.view', 'analytics.view',
  ],
  content_moderator: [
    'users.view', 'users.suspend', 'posts.manage', 'posts.view',
    'reelyx.manage', 'reelyx.view', 'comments.manage', 'comments.view',
    'reports.manage', 'reports.view', 'analytics.view',
  ],
};

export const PERMISSION_LABELS: Record<AdminPermission, string> = {
  'admin.manage': 'Manage administrators and roles',
  'roles.view': 'View roles',
  'roles.create': 'Create custom roles',
  'roles.edit': 'Edit custom roles',
  'roles.delete': 'Delete custom roles',
  'permissions.assign': 'Assign permissions',
  'admins.view': 'View administrators',
  'admins.create': 'Create administrators',
  'admins.edit': 'Edit administrators',
  'admins.deactivate': 'Deactivate administrators',
  'users.view': 'View user accounts',
  'users.edit': 'Edit user accounts',
  'users.suspend': 'Suspend and reactivate accounts',
  'users.verify_minor': 'Override minor guardian verification',
  'users.delete': 'Delete accounts',
  'posts.manage': 'Review posts and media',
  'posts.view': 'View posts',
  'posts.delete': 'Remove posts',
  'posts.restore': 'Restore posts',
  'reelyx.manage': 'Review Reelyx videos',
  'reelyx.view': 'View Reelyx videos',
  'reelyx.feature': 'Feature Reelyx videos',
  'comments.manage': 'Moderate comments',
  'comments.view': 'View comments',
  'comments.delete': 'Delete comments',
  'reports.manage': 'Decide reports',
  'reports.view': 'View reports',
  'reports.review': 'Review reports',
  'reports.resolve': 'Resolve reports',
  'reports.escalate': 'Escalate reports',
  'tickets.view': 'View support tickets',
  'tickets.manage': 'Reply to and update tickets',
  'support.assign': 'Assign support tickets',
  'support.resolve': 'Resolve and reopen tickets',
  'help.manage': 'Manage help centre content',
  'notifications.view': 'View announcements',
  'notifications.manage': 'Manage announcements',
  'notifications.create': 'Draft announcements',
  'notifications.send': 'Send announcements',
  'settings.view': 'View platform settings',
  'settings.manage': 'Change platform settings',
  'audit.view': 'View audit logs',
  'audit_logs.view': 'View audit logs',
  'analytics.view': 'View platform analytics',
  'analytics.export': 'Export analytics',
};

/** Module grouping used to render the permission matrix. */
export const PERMISSION_GROUPS: { module: string; permissions: AdminPermission[] }[] = [
  { module: 'Dashboard', permissions: ['analytics.view'] },
  { module: 'Analytics', permissions: ['analytics.export'] },
  { module: 'Users', permissions: ['users.view', 'users.edit', 'users.suspend', 'users.verify_minor', 'users.delete'] },
  { module: 'Posts', permissions: ['posts.view', 'posts.manage', 'posts.delete', 'posts.restore'] },
  { module: 'Reelyx', permissions: ['reelyx.view', 'reelyx.manage', 'reelyx.feature'] },
  { module: 'Comments', permissions: ['comments.view', 'comments.manage', 'comments.delete'] },
  { module: 'Reports', permissions: ['reports.view', 'reports.review', 'reports.manage', 'reports.resolve', 'reports.escalate'] },
  { module: 'Support', permissions: ['tickets.view', 'tickets.manage', 'support.assign', 'support.resolve', 'help.manage'] },
  { module: 'Notifications', permissions: ['notifications.view', 'notifications.create', 'notifications.manage', 'notifications.send'] },
  { module: 'Roles', permissions: ['roles.view', 'roles.create', 'roles.edit', 'roles.delete', 'permissions.assign', 'admin.manage'] },
  { module: 'Administrators', permissions: ['admins.view', 'admins.create', 'admins.edit', 'admins.deactivate'] },
  { module: 'Settings', permissions: ['settings.view', 'settings.manage'] },
  { module: 'Audit', permissions: ['audit.view', 'audit_logs.view'] },
];

export type AdminAccess = {
  user_id: string;
  role: AdminRole;
  permissions: AdminPermission[];
  display_name: string;
  username: string;
  avatar_url: string | null;
  email: string | null;
};

export type PagedResult<T> = { items: T[]; total?: number; stats?: Record<string, number> };
export type SeriesPoint = { date: string; value: number };

export type AnalyticsData = {
  range: { from: string; to: string };
  registrations: SeriesPoint[];
  daily_active_users: SeriesPoint[];
  monthly_active_users: SeriesPoint[];
  monthly_registrations: SeriesPoint[];
  posts: SeriesPoint[];
  reelyx: SeriesPoint[];
  engagement: SeriesPoint[];
  reports: SeriesPoint[];
  tickets: SeriesPoint[];
};

export type DashboardData = {
  stats: Record<string, number>;
  analytics: AnalyticsData;
  recent_registrations: Record<string, unknown>[];
  recent_posts: Record<string, unknown>[];
  recent_reports: Record<string, unknown>[];
  recent_tickets: Record<string, unknown>[];
  recent_admin_actions: Record<string, unknown>[];
};

export type AdminUser = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  account_status: string;
  guardian_consent_status: string;
  profile_visibility: string;
  is_minor: boolean;
  created_at: string;
  email: string | null;
  admin_role: string | null;
  post_count: number;
  reelyx_count: number;
  report_count: number;
  warning_count: number;
};

export type AdminUserDetail = {
  profile: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    bio: string;
    email: string | null;
    account_status: string;
    guardian_consent_status: string;
    profile_visibility: string;
    is_minor: boolean;
    created_at: string;
    admin_role: string | null;
  };
  counts: Record<string, number>;
  posts: Record<string, unknown>[];
  reelyx: Record<string, unknown>[];
  reports: Record<string, unknown>[];
  warnings: Record<string, unknown>[];
  activity: Record<string, unknown>[];
};

export type AdminContent = {
  id: string;
  caption?: string;
  body?: string;
  media_type?: string;
  media_key?: string;
  thumbnail_key?: string | null;
  visibility?: string;
  status: string;
  is_featured?: boolean;
  created_at: string;
  removed_at?: string | null;
  author: { id: string; username: string; display_name: string; avatar_url: string | null };
  content?: { id: string; caption: string; media_type: string; media_key: string };
  like_count?: number;
  comment_count?: number;
};

export type AdminReport = {
  id: string;
  reason: string;
  category: string;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
  resolution_notes: string;
  assigned_to: string | null;
  reporter_username: string | null;
  reporter_name: string | null;
  reported_username: string | null;
  reported_name: string | null;
  reported_user_id: string | null;
  content: { id: string; caption: string; media_type: string; media_key: string; status: string } | null;
  assigned_username: string | null;
};

export type AdminReportDetail = {
  report: AdminReport;
  reporter: Record<string, unknown>;
  reported_user: Record<string, unknown>;
  content: Record<string, unknown>;
  notes: Record<string, unknown>[];
};

export type AdminTicket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  assigned_to: string | null;
  username: string;
  display_name: string;
  avatar_url: string | null;
  assigned_username: string | null;
  message_count: number;
  last_message_at: string | null;
};

export type AdminTicketDetail = {
  ticket: AdminTicket;
  user: Record<string, unknown>;
  assigned_to: string | null;
  messages: { id: string; body: string; author_role: string; created_at: string; author_id: string | null }[];
  internal_notes: { id: string; body: string; created_at: string; author: string | null }[];
  attachments: { id: string; storage_path: string; file_name: string; content_type: string; byte_size: number; created_at: string }[];
};

export type AdminNotification = {
  id: string;
  title: string;
  body: string;
  type: string;
  audience: string;
  target_user_ids: string[];
  template_key: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
  recipient_count: number;
  delivered_count: number;
};

export type AdminTemplate = {
  key: string;
  title: string;
  body: string;
  type: string;
  updated_at: string;
};

export type AdminAudit = {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  resource: string;
  resource_id: string | null;
  changes: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_username: string | null;
  actor_name: string | null;
};

export type AdminAccount = {
  user_id: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  email: string | null;
  created_by_username: string | null;
  last_sign_in_at: string | null;
  custom_role: string | null;
  extra_permissions: string[] | null;
};

export type AdminRoleDefinition = {
  key: string;
  label: string;
  is_system: boolean;
  description: string;
  permissions: AdminPermission[];
  assigned_count: number;
};

export type AdminAssignee = {
  user_id: string;
  role: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
};

export type HelpContent = {
  categories: Record<string, unknown>[];
  articles: Record<string, unknown>[];
  faqs: Record<string, unknown>[];
};

export type RangePreset = '7d' | '30d' | '90d' | 'custom';

export const RANGE_PRESETS: { label: string; value: RangePreset }[] = [
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 90 days', value: '90d' },
  { label: 'Custom', value: 'custom' },
];

export function rangeForPreset(preset: RangePreset, customFrom?: string, customTo?: string) {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  if (preset === '7d') from.setDate(from.getDate() - 6);
  else if (preset === '90d') from.setDate(from.getDate() - 89);
  else if (preset === 'custom') {
    if (customFrom) from.setTime(new Date(`${customFrom}T00:00:00`).getTime());
    else from.setDate(from.getDate() - 29);
  } else from.setDate(from.getDate() - 29);
  if (preset !== 'custom') from.setHours(0, 0, 0, 0);
  const end = preset === 'custom' && customTo ? new Date(`${customTo}T23:59:59.999`) : to;
  if (Number.isNaN(from.getTime()) || Number.isNaN(end.getTime()) || from > end) {
    throw new Error('Choose a valid date range.');
  }
  return { from: from.toISOString(), to: end.toISOString() };
}

export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  if (message.includes('42501') || message.toLowerCase().includes('do not have permission')) {
    return 'Your administrator role does not include this action.';
  }
  if (message.includes('42900') || message.toLowerCase().includes('too many')) {
    return 'Too many actions at once. Please wait a moment and try again.';
  }
  if (message.includes('42883') || message.includes('42P01') || message.toLowerCase().includes('could not find the function')) {
    return 'The admin database migration has not been applied yet. Ask a Supabase administrator to run supabase/admin_schema.sql.';
  }
  return message;
}

async function callRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error('Administrator access needs a connected Supabase project.');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(friendlyError(error));
  return data as T;
}

export const adminApi = {
  access: () => callRpc<AdminAccess[]>('admin_get_my_access'),
  dashboard: (from: string, to: string) => callRpc<DashboardData>('admin_dashboard', { p_from: from, p_to: to }),
  analytics: (from: string, to: string) => callRpc<AnalyticsData>('admin_analytics', { p_from: from, p_to: to }),

  listUsers: (args: Record<string, unknown>) => callRpc<PagedResult<AdminUser>>('admin_list_users', args),
  getUser: (userId: string) => callRpc<AdminUserDetail>('admin_get_user', { p_user_id: userId }),
  mutateUser: (userId: string, action: string, value: string | null, reason: string) =>
    callRpc<Record<string, unknown>>('admin_mutate_user', { p_user_id: userId, p_action: action, p_value: value, p_reason: reason }),
  warnUser: (userId: string, reason: string, reportId: string | null = null) =>
    callRpc<Record<string, unknown>>('admin_warn_user', { p_user_id: userId, p_reason: reason, p_report_id: reportId }),

  listContent: (args: Record<string, unknown>) => callRpc<PagedResult<AdminContent>>('admin_list_content', args),
  mutateContent: (kind: string, id: string, action: string, value: string | null, reason: string) =>
    callRpc<Record<string, unknown>>('admin_mutate_content', { p_kind: kind, p_id: id, p_action: action, p_value: value, p_reason: reason }),

  listReports: (args: Record<string, unknown>) => callRpc<PagedResult<AdminReport>>('admin_list_reports', args),
  getReport: (id: string) => callRpc<AdminReportDetail>('admin_get_report', { p_report_id: id }),
  mutateReport: (id: string, action: string, value: string | null, note: string) =>
    callRpc<Record<string, unknown>>('admin_mutate_report', { p_report_id: id, p_action: action, p_value: value, p_note: note }),

  listTickets: (args: Record<string, unknown>) => callRpc<PagedResult<AdminTicket>>('admin_list_tickets', args),
  getTicket: (id: string) => callRpc<AdminTicketDetail>('admin_get_ticket', { p_ticket_id: id }),
  mutateTicket: (id: string, action: string, value: string | null, body: string) =>
    callRpc<Record<string, unknown>>('admin_mutate_ticket', { p_ticket_id: id, p_action: action, p_value: value, p_body: body }),

  listNotifications: (args: Record<string, unknown>) => callRpc<PagedResult<AdminNotification>>('admin_list_notifications', args),
  createNotification: (args: Record<string, unknown>) => callRpc<Record<string, unknown>>('admin_create_notification', args),
  sendNotification: (id: string) => callRpc<Record<string, unknown>>('admin_send_notification', { p_notification_id: id }),
  deleteNotification: (id: string) => callRpc<Record<string, unknown>>('admin_delete_notification', { p_notification_id: id }),
  listTemplates: () => callRpc<PagedResult<AdminTemplate>>('admin_list_templates'),
  mutateTemplate: (key: string, action: string, payload: Record<string, unknown>) =>
    callRpc<Record<string, unknown>>('admin_mutate_template', { p_key: key, p_action: action, ...payload }),

  listAudit: (args: Record<string, unknown>) => callRpc<PagedResult<AdminAudit>>('admin_list_audit', args),
  getSettings: () => callRpc<Record<string, unknown>>('admin_get_settings'),
  setSetting: (key: string, value: unknown) => callRpc<Record<string, unknown>>('admin_set_setting', { p_key: key, p_value: value }),
  listHelp: () => callRpc<HelpContent>('admin_list_help'),
  mutateHelp: (kind: string, action: string, id: string | null, payload: Record<string, unknown>) =>
    callRpc<Record<string, unknown>>('admin_mutate_help', { p_kind: kind, p_action: action, p_id: id, p_payload: payload }),

  listAdmins: () => callRpc<PagedResult<AdminAccount>>('admin_list_admins'),
  listAssignees: () => callRpc<PagedResult<AdminAssignee>>('admin_list_assignees'),
  mutateAdmin: (userId: string, role: string, action: string) =>
    callRpc<Record<string, unknown>>('admin_mutate_admin', { p_user_id: userId, p_role: role, p_action: action }),

  listRoles: () => callRpc<{ roles: AdminRoleDefinition[] }>('admin_list_roles'),
  upsertCustomRole: (key: string, label: string, description: string, permissions: AdminPermission[]) =>
    callRpc<Record<string, unknown>>('admin_upsert_custom_role', {
      p_key: key, p_label: label, p_description: description, p_permissions: permissions,
    }),
  deleteCustomRole: (key: string) =>
    callRpc<Record<string, unknown>>('admin_delete_custom_role', { p_key: key }),
  setAdminAccess: (userId: string, customRole: string | null, extraPermissions: AdminPermission[]) =>
    callRpc<Record<string, unknown>>('admin_set_admin_access', {
      p_user_id: userId, p_custom_role: customRole, p_extra_permissions: extraPermissions,
    }),
};

export async function signAdminPaths(paths: string[], bucket = 'post-media'): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (!unique.length || !supabase) return {};
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, 3600);
  if (error) throw new Error(friendlyError(error));
  const result: Record<string, string> = {};
  data?.forEach((item) => {
    if (item.path && item.signedUrl) result[item.path] = item.signedUrl;
  });
  return result;
}

export function hasPermission(access: AdminAccess | null, permission: AdminPermission): boolean {
  return Boolean(access?.permissions.includes(permission));
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat().format(value ?? 0);
}

export function truncate(value: string | null | undefined, length = 120): string {
  if (!value) return '—';
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

export function toneForStatus(status: string): 'sage' | 'mint' | 'peach' | 'butter' | 'muted' {
  const value = status.toLowerCase();
  if (['active', 'safe', 'resolved', 'sent', 'verified', 'visible', 'published'].includes(value)) return 'mint';
  if (['suspended', 'removed', 'rejected', 'urgent', 'dismissed', 'closed', 'escalated'].includes(value)) return 'peach';
  if (['pending', 'reviewing', 'in_progress', 'under_review', 'waiting_for_user', 'open', 'draft', 'high'].includes(value)) return 'butter';
  if (['mature', 'warning', 'medium'].includes(value)) return 'sage';
  return 'muted';
}
