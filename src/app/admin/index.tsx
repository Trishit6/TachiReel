import { adminPageMetadata } from '../../lib/seo';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Chip, ClayButton, ClayInput, Tabs } from '../../components/ui';
import { useAdmin } from '../../components/admin/AdminProvider';
import { AdminCard, AdminPage, AdminRestricted, DataTable, FilterRow, LineChart, LoadingCard, StatCard, StatusBadge } from '../../components/admin/AdminUI';
import {
  RANGE_PRESETS,
  adminApi,
  formatDate,
  formatDateTime,
  formatNumber,
  friendlyError,
  rangeForPreset,
  titleCase,
  truncate,
  type DashboardData,
  type RangePreset,
} from '../../lib/admin';
import { useTheme } from '../../theme/theme';

const ACTIVITY_TABS = [
  { key: 'registrations', label: 'Sign-ups' },
  { key: 'posts', label: 'Posts' },
  { key: 'reports', label: 'Reports' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'actions', label: 'Staff actions' },
];

function text(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export default function AdminDashboardScreen() {
  const { can } = useAdmin();
  const { colors, type } = useTheme();
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState('registrations');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (preset === 'custom' && (!/^\d{4}-\d{2}-\d{2}$/.test(customFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(customTo))) {
        throw new Error('Enter both custom dates as YYYY-MM-DD.');
      }
      const { from, to } = rangeForPreset(preset, customFrom, customTo);
      setData(await adminApi.dashboard(from, to));
    } catch (caught) {
      setError(friendlyError(caught));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [customFrom, customTo, preset]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!can('analytics.view')) return <AdminRestricted permission="analytics.view" />;

  const stats = data?.stats ?? {};
  const analytics = data?.analytics;

  return (
    <AdminPage
      title="Dashboard"
      subtitle="A live view of the TachiReel community. Every number is read from Supabase for the selected range."
      actions={
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <ClayButton label="Refresh" variant="secondary" size="sm" icon="refresh-cw" loading={loading} onPress={() => void load()} />
          {RANGE_PRESETS.map((option) => (
            <Chip key={option.value} label={option.label} active={preset === option.value} onPress={() => setPreset(option.value)} />
          ))}
        </View>
      }
    >
      {preset === 'custom' ? (
        <AdminCard>
          <FilterRow>
            <View style={{ width: 210 }}>
              <ClayInput label="From" value={customFrom} onChangeText={setCustomFrom} placeholder="2026-01-01" />
            </View>
            <View style={{ width: 210 }}>
              <ClayInput label="To" value={customTo} onChangeText={setCustomTo} placeholder="2026-01-31" />
            </View>
          </FilterRow>
          <Text style={[type.tiny, { color: colors.muted }]}>Use YYYY-MM-DD. The dashboard reloads automatically when the range changes.</Text>
        </AdminCard>
      ) : null}

      {loading ? <LoadingCard label="Loading live dashboard" /> : null}
      {!loading && error ? <AdminCard><Text style={[type.body, { color: colors.danger }]}>{error}</Text><Text style={[type.small, { color: colors.muted, marginTop: 8 }]}>You can retry with the refresh action in the page header.</Text></AdminCard> : null}

      {data && !loading ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <StatCard label="Total users" value={stats.total_users ?? 0} icon="users" accent />
            <StatCard label="New users (range)" value={stats.new_users ?? 0} icon="user-plus" />
            <StatCard label="Active users" value={stats.active_users ?? 0} icon="user-check" />
            <StatCard label="Suspended accounts" value={stats.suspended_accounts ?? 0} icon="slash" />
            <StatCard label="Posts" value={stats.total_posts ?? 0} hint={`${formatNumber(stats.pending_content ?? 0)} awaiting review`} icon="image" />
            <StatCard label="Reelyx videos" value={stats.total_reelyx ?? 0} hint="Published videos" icon="video" />
            <StatCard label="Open reports" value={stats.pending_reports ?? 0} hint="Open or reviewing" icon="flag" />
            <StatCard label="Open tickets" value={stats.open_tickets ?? 0} hint="Needs support attention" icon="life-buoy" />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            <View style={{ flex: 1, minWidth: 320 }}>
              <LineChart data={analytics?.registrations ?? []} title="New users" />
            </View>
            <View style={{ flex: 1, minWidth: 320 }}>
              <LineChart data={analytics?.daily_active_users ?? []} title="Daily active users" />
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            <View style={{ flex: 1, minWidth: 320 }}>
              <LineChart data={analytics?.posts ?? []} title="Posts published" />
            </View>
            <View style={{ flex: 1, minWidth: 320 }}>
              <LineChart data={analytics?.reelyx ?? []} title="Reelyx videos published" />
            </View>
          </View>

          <AdminCard>
            <Text style={[type.h3, { color: colors.ink }]}>Recent activity</Text>
            <Tabs items={ACTIVITY_TABS} active={activity} onChange={setActivity} />
            {activity === 'registrations' ? (
              <DataTable
                columns={[
                  { key: 'name', label: 'User', width: 220, render: (row) => <Text style={[type.smallMedium, { color: colors.ink }]}>{text(row.display_name)}</Text> },
                  { key: 'username', label: 'Username', width: 180, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]}>@{text(row.username)}</Text> },
                  { key: 'date', label: 'Joined', width: 170, render: (row) => <Text style={[type.small, { color: colors.muted }]}>{formatDate(text(row.created_at))}</Text> },
                ]}
                rows={data.recent_registrations}
                rowKey={(row) => text(row.id)}
                emptyTitle="No new users in this range"
              />
            ) : null}
            {activity === 'posts' ? (
              <DataTable
                columns={[
                  { key: 'author', label: 'Author', width: 180, render: (row) => <Text style={[type.smallMedium, { color: colors.ink }]}>@{text(row.username)}</Text> },
                  { key: 'caption', label: 'Caption', width: 320, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]} numberOfLines={1}>{truncate(text(row.caption), 70)}</Text> },
                  { key: 'type', label: 'Type', width: 110, render: (row) => <StatusBadge status={text(row.media_type)} /> },
                  { key: 'review', label: 'Review', width: 130, render: (row) => <StatusBadge status={text(row.sensitive_review_status)} /> },
                  { key: 'date', label: 'Created', width: 170, render: (row) => <Text style={[type.small, { color: colors.muted }]}>{formatDate(text(row.created_at))}</Text> },
                ]}
                rows={data.recent_posts}
                rowKey={(row) => text(row.id)}
                emptyTitle="No posts in this range"
              />
            ) : null}
            {activity === 'reports' ? (
              <DataTable
                columns={[
                  { key: 'category', label: 'Category', width: 140, render: (row) => <StatusBadge status={text(row.category)} /> },
                  { key: 'reason', label: 'Reason', width: 300, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]} numberOfLines={1}>{truncate(text(row.reason), 70)}</Text> },
                  { key: 'reported', label: 'Reported', width: 160, render: (row) => <Text style={[type.small, { color: colors.ink }]}>@{text(row.reported_username)}</Text> },
                  { key: 'status', label: 'Status', width: 130, render: (row) => <StatusBadge status={text(row.status)} /> },
                  { key: 'date', label: 'Created', width: 170, render: (row) => <Text style={[type.small, { color: colors.muted }]}>{formatDate(text(row.created_at))}</Text> },
                ]}
                rows={data.recent_reports}
                rowKey={(row) => text(row.id)}
                emptyTitle="No reports in this range"
              />
            ) : null}
            {activity === 'tickets' ? (
              <DataTable
                columns={[
                  { key: 'subject', label: 'Subject', width: 280, render: (row) => <Text style={[type.smallMedium, { color: colors.ink }]} numberOfLines={1}>{text(row.subject)}</Text> },
                  { key: 'user', label: 'User', width: 170, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]}>@{text(row.username)}</Text> },
                  { key: 'priority', label: 'Priority', width: 120, render: (row) => <StatusBadge status={text(row.priority)} /> },
                  { key: 'status', label: 'Status', width: 140, render: (row) => <StatusBadge status={text(row.status)} /> },
                  { key: 'date', label: 'Updated', width: 170, render: (row) => <Text style={[type.small, { color: colors.muted }]}>{formatDate(text(row.created_at))}</Text> },
                ]}
                rows={data.recent_tickets}
                rowKey={(row) => text(row.id)}
                emptyTitle="No tickets in this range"
              />
            ) : null}
            {activity === 'actions' ? (
              <DataTable
                columns={[
                  { key: 'action', label: 'Action', width: 210, render: (row) => <Text style={[type.smallMedium, { color: colors.ink }]}>{titleCase(text(row.action))}</Text> },
                  { key: 'actor', label: 'Administrator', width: 180, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]}>@{text(row.actor_username)}</Text> },
                  { key: 'role', label: 'Role', width: 170, render: (row) => <StatusBadge status={text(row.actor_role)} /> },
                  { key: 'resource', label: 'Resource', width: 140, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]}>{text(row.resource)}</Text> },
                  { key: 'date', label: 'When', width: 190, render: (row) => <Text style={[type.small, { color: colors.muted }]}>{formatDateTime(text(row.created_at))}</Text> },
                ]}
                rows={data.recent_admin_actions}
                rowKey={(row) => text(row.id)}
                emptyTitle="No staff actions in this range"
              />
            ) : null}
          </AdminCard>
        </>
      ) : null}
    </AdminPage>
  );
}

export function generateMetadata() {
  return adminPageMetadata("Dashboard", "/admin");
}
