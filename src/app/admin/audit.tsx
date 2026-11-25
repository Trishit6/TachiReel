import { adminPageMetadata } from '../../lib/seo';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ClayButton, ClayInput, ModalCard, SearchField, Select } from '../../components/ui';
import { useAdmin } from '../../components/admin/AdminProvider';
import { AdminCard, AdminPage, AdminRestricted, DataTable, FilterRow, KeyValue, LoadingCard, Pagination, StatusBadge } from '../../components/admin/AdminUI';
import { adminApi, formatDateTime, friendlyError, titleCase, truncate, type AdminAudit } from '../../lib/admin';
import { useTheme } from '../../theme/theme';

const PAGE_SIZE = 25;
const ACTIONS = [
  'auth.login', 'auth.logout', 'analytics.export',
  'user.edit', 'user.suspend', 'user.reactivate', 'user.set_verification', 'user.warn', 'user.delete',
  'content.set_status', 'content.remove', 'content.restore', 'content.feature', 'content.unfeature',
  'report.assign', 'report.decide', 'report.priority', 'report.category', 'report.note',
  'report.warn_user', 'report.suspend_user', 'report.remove_content',
  'ticket.status', 'ticket.priority', 'ticket.assign', 'ticket.reply', 'ticket.internal_note',
  'notification.create', 'notification.send', 'notification.delete',
  'template.create', 'template.upsert', 'template.delete',
  'help.create', 'help.upsert', 'help.delete',
  'setting.update', 'admin_role.upsert', 'admin_role.activate', 'admin_role.deactivate',
  'admin_role.remove', 'custom_role.upsert', 'custom_role.delete', 'admin_permissions.set',
];
const RESOURCES = ['user', 'post', 'reelyx', 'comment', 'report', 'ticket', 'notification', 'setting', 'admin', 'admin_role', 'notification_template', 'category', 'article', 'faq', 'analytics'];

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function AdminAuditScreen() {
  const { can } = useAdmin();
  const { colors, type } = useTheme();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [action, setAction] = useState('');
  const [resource, setResource] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminAudit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminAudit | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.listAudit({
        p_search: debouncedSearch,
        p_action: action,
        p_resource: resource,
        p_actor_id: actorId.trim() || null,
        p_from: from ? `${from}T00:00:00.000Z` : null,
        p_to: to ? `${to}T23:59:59.999Z` : null,
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      });
      setRows(result.items ?? []);
      setTotal(result.total ?? result.items?.length ?? 0);
    } catch (caught) {
      setError(friendlyError(caught));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [action, actorId, debouncedSearch, from, page, resource, to]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!can('audit.view') && !can('audit_logs.view')) {
    return <AdminRestricted permission="audit.view or audit_logs.view" />;
  }

  return (
    <AdminPage
      title="Audit Logs"
      subtitle="An append-only record of staff actions. Every decision, role change and setting update is captured here."
      actions={<ClayButton label="Refresh" variant="secondary" size="sm" icon="refresh-cw" loading={loading} onPress={() => void load()} />}
    >
      <AdminCard>
        <FilterRow>
          <View style={{ minWidth: 230, flex: 2 }}>
            <SearchField value={search} onChangeText={setSearch} placeholder="Search action, actor or resource ID" />
          </View>
          <View style={{ width: 190 }}>
            <Select label="Action" value={action || null} onValueChange={(next) => { setAction(next === 'all' ? '' : next); setPage(1); }} options={[{ label: 'All actions', value: 'all' }, ...ACTIONS.map((item) => ({ label: titleCase(item), value: item }))]} />
          </View>
          <View style={{ width: 160 }}>
            <Select label="Resource" value={resource || null} onValueChange={(next) => { setResource(next === 'all' ? '' : next); setPage(1); }} options={[{ label: 'All resources', value: 'all' }, ...RESOURCES.map((item) => ({ label: titleCase(item), value: item }))]} />
          </View>
          <View style={{ minWidth: 260 }}>
            <ClayInput label="Actor user ID" value={actorId} onChangeText={(next) => { setActorId(next); setPage(1); }} placeholder="Optional UUID" />
          </View>
          <View style={{ width: 150 }}><ClayInput label="From" value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" /></View>
          <View style={{ width: 150 }}><ClayInput label="To" value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" /></View>
        </FilterRow>
      </AdminCard>

      {loading ? <LoadingCard label="Loading audit logs" /> : null}
      {!loading && error ? <AdminCard><Text style={[type.body, { color: colors.danger }]}>{error}</Text></AdminCard> : null}
      {!loading && !error ? (
        <AdminCard>
          <DataTable
            columns={[
              { key: 'action', label: 'Action', width: 220, render: (row) => <Text style={[type.smallMedium, { color: colors.ink }]}>{titleCase(row.action)}</Text> },
              { key: 'actor', label: 'Administrator', width: 180, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]}>@{row.actor_username ?? 'system'}</Text> },
              { key: 'role', label: 'Role', width: 160, render: (row) => row.actor_role ? <StatusBadge status={row.actor_role} /> : <Text style={[type.small, { color: colors.muted }]}>—</Text> },
              { key: 'resource', label: 'Resource', width: 130, render: (row) => <StatusBadge status={row.resource} /> },
              { key: 'id', label: 'Resource ID', width: 180, render: (row) => <Text style={[type.small, { color: colors.muted }]} numberOfLines={1}>{truncate(row.resource_id, 28)}</Text> },
              { key: 'date', label: 'When', width: 190, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]}>{formatDateTime(row.created_at)}</Text> },
            ]}
            rows={rows}
            rowKey={(row) => row.id}
            onRowPress={setDetail}
            emptyTitle="No audit entries found"
            emptyDescription="Try adjusting the filters or a wider date range."
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </AdminCard>
      ) : null}

      <ModalCard visible={Boolean(detail)} onClose={() => setDetail(null)} width={600}>
        {detail ? (
          <ScrollView style={{ maxHeight: '84%' }} showsVerticalScrollIndicator>
            <View style={{ gap: 4 }}>
              <Text style={[type.h3, { color: colors.ink }]}>{titleCase(detail.action)}</Text>
              <Text style={[type.small, { color: colors.muted }]}>{formatDateTime(detail.created_at)}</Text>
              <View style={{ marginTop: 10 }}>
                <KeyValue label="Actor" value={detail.actor_username ? `@${detail.actor_username}` : 'System'} />
                <KeyValue label="Role" value={detail.actor_role ? titleCase(detail.actor_role) : '—'} />
                <KeyValue label="Resource" value={titleCase(detail.resource)} />
                <KeyValue label="Resource ID" value={truncate(detail.resource_id, 60)} />
              </View>
              <Text style={[type.h3, { color: colors.ink, marginTop: 12, marginBottom: 6 }]}>Changes</Text>
              {Object.keys(detail.changes ?? {}).length === 0 ? <Text style={[type.small, { color: colors.muted }]}>No change payload recorded.</Text> : null}
              {Object.entries(detail.changes ?? {}).map(([key, value]) => (
                <KeyValue key={key} label={titleCase(key)} value={truncate(displayValue(value), 200)} />
              ))}
              <Text style={[type.h3, { color: colors.ink, marginTop: 12, marginBottom: 6 }]}>Metadata</Text>
              {Object.keys(detail.metadata ?? {}).length === 0 ? <Text style={[type.small, { color: colors.muted }]}>No extra metadata.</Text> : null}
              {Object.entries(detail.metadata ?? {}).map(([key, value]) => (
                <KeyValue key={key} label={titleCase(key)} value={truncate(displayValue(value), 200)} />
              ))}
            </View>
          </ScrollView>
        ) : null}
      </ModalCard>
    </AdminPage>
  );
}

export function generateMetadata() {
  return adminPageMetadata("Audit Logs", "/admin/audit");
}
