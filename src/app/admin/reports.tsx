import { adminPageMetadata } from '../../lib/seo';
import { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { ClayButton, ClayInput, Dropdown, ModalCard, SearchField, Select, useToast } from '../../components/ui';
import { useAdmin } from '../../components/admin/AdminProvider';
import {
  AdminCard,
  AdminPage,
  AdminRestricted,
  DataTable,
  FilterRow,
  KeyValue,
  LoadingCard,
  Pagination,
  ReasonDialog,
  StatusBadge,
} from '../../components/admin/AdminUI';
import {
  adminApi,
  formatDateTime,
  friendlyError,
  signAdminPaths,
  titleCase,
  truncate,
  type AdminAssignee,
  type AdminReport,
  type AdminReportDetail,
} from '../../lib/admin';
import { useTheme } from '../../theme/theme';

const PAGE_SIZE = 25;
type ReportAction = 'decide' | 'warn_user' | 'suspend_user' | 'remove_content' | 'assign' | 'priority' | 'category';
const CATEGORIES = ['inappropriate', 'harassment', 'spam', 'fake_account', 'impersonation', 'copyright', 'other'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const DECISIONS = ['reviewing', 'resolved', 'dismissed', 'escalated'];

export default function AdminReportsScreen() {
  const { can } = useAdmin();
  const toast = useToast();
  const { colors, type } = useTheme();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminReport[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [assignees, setAssignees] = useState<AdminAssignee[]>([]);
  const [pending, setPending] = useState<{ report: AdminReport; action: ReportAction; value: string | null } | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!can('reports.view')) return;
    void adminApi.listAssignees()
      .then((result) => setAssignees(result.items ?? []))
      .catch(() => setAssignees([]));
  }, [can]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.listReports({
        p_search: debouncedSearch,
        p_status: status,
        p_category: category,
        p_priority: priority,
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
  }, [category, debouncedSearch, from, page, priority, status, to]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const openDetail = async (report: AdminReport) => {
    setDetailLoading(true);
    setDetail(null);
    setMediaUrl(null);
    try {
      const data = await adminApi.getReport(report.id);
      setDetail(data);
      const mediaKey = String((data.content as Record<string, unknown>).media_key ?? '');
      if (mediaKey) {
        const urls = await signAdminPaths([mediaKey]);
        setMediaUrl(urls[mediaKey] ?? null);
      }
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const startAction = (report: AdminReport, action: ReportAction, value: string | null = null) => {
    setReason('');
    setPending({ report, action, value });
  };

  const confirmAction = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      if (pending.action === 'assign') {
        await adminApi.mutateReport(pending.report.id, 'assign', pending.value, reason);
      } else if (pending.action === 'priority' || pending.action === 'category') {
        await adminApi.mutateReport(pending.report.id, pending.action, pending.value, reason);
      } else {
        await adminApi.mutateReport(pending.report.id, pending.action, null, reason);
      }
      toast.show('Report updated.', 'success');
      setPending(null);
      void load();
      if (detail) {
        try { setDetail(await adminApi.getReport(detail.report.id)); } catch { /* keep previous detail */ }
      }
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!can('reports.view')) return <AdminRestricted permission="reports.view" />;

  const destructive = pending?.action === 'suspend_user' || pending?.action === 'remove_content';
  const requireReason = destructive || pending?.action === 'warn_user' || pending?.action === 'decide';
  const reportStatus = detail ? String((detail.report as Record<string, unknown>).status ?? 'open') : '';
  const hasReportedUser = Boolean(detail && (detail.reported_user as Record<string, unknown>).id);
  const hasContent = Boolean(detail && (detail.content as Record<string, unknown>).id);

  return (
    <AdminPage
      title="Reports & Moderation"
      subtitle="Work through community reports with server-side filters and auditable decisions."
      actions={<ClayButton label="Refresh" variant="secondary" size="sm" icon="refresh-cw" loading={loading} onPress={() => void load()} />}
    >
      <AdminCard>
        <FilterRow>
          <View style={{ minWidth: 230, flex: 2 }}>
            <SearchField value={search} onChangeText={setSearch} placeholder="Search report ID, reason or username" />
          </View>
          <View style={{ width: 160 }}>
            <Select label="Status" value={status || null} onValueChange={(next) => { setStatus(next === 'all' ? '' : next); setPage(1); }} options={[
              { label: 'All statuses', value: 'all' },
              { label: 'Open', value: 'pending' },
              { label: 'Reviewing', value: 'reviewing' },
              { label: 'Escalated', value: 'escalated' },
              { label: 'Resolved', value: 'resolved' },
              { label: 'Dismissed', value: 'dismissed' },
            ]} />
          </View>
          <View style={{ width: 165 }}>
            <Select label="Category" value={category || null} onValueChange={(next) => { setCategory(next === 'all' ? '' : next); setPage(1); }} options={[{ label: 'All categories', value: 'all' }, ...CATEGORIES.map((item) => ({ label: titleCase(item), value: item }))]} />
          </View>
          <View style={{ width: 150 }}>
            <Select label="Priority" value={priority || null} onValueChange={(next) => { setPriority(next === 'all' ? '' : next); setPage(1); }} options={[{ label: 'All priorities', value: 'all' }, ...PRIORITIES.map((item) => ({ label: titleCase(item), value: item }))]} />
          </View>
          <View style={{ width: 150 }}><ClayInput label="From" value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" /></View>
          <View style={{ width: 150 }}><ClayInput label="To" value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" /></View>
        </FilterRow>
      </AdminCard>

      {loading ? <LoadingCard label="Loading reports" /> : null}
      {!loading && error ? <AdminCard><Text style={[type.body, { color: colors.danger }]}>{error}</Text></AdminCard> : null}
      {!loading && !error ? (
        <AdminCard>
          <DataTable
            columns={[
              { key: 'category', label: 'Category', width: 145, render: (row) => <StatusBadge status={row.category} /> },
              { key: 'reason', label: 'Reason', width: 280, render: (row) => <Text style={[type.smallMedium, { color: colors.ink }]} numberOfLines={2}>{truncate(row.reason, 100)}</Text> },
              { key: 'reported', label: 'Reported user', width: 175, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]}>@{row.reported_username ?? 'content only'}</Text> },
              { key: 'reporter', label: 'Reporter', width: 160, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]}>@{row.reporter_username ?? 'unknown'}</Text> },
              { key: 'priority', label: 'Priority', width: 125, render: (row) => <StatusBadge status={row.priority} /> },
              { key: 'status', label: 'Status', width: 135, render: (row) => <StatusBadge status={row.status} /> },
              { key: 'date', label: 'Reported', width: 150, render: (row) => <Text style={[type.small, { color: colors.muted }]}>{formatDateTime(row.created_at)}</Text> },
              {
                key: 'actions', label: 'Actions', width: 140,
                render: (row) => can('reports.manage') ? (
                  <Dropdown label="Report actions" items={[
                    { key: 'review', label: 'Open review', icon: 'eye', onPress: () => void openDetail(row) },
                    { key: 'reviewing', label: 'Mark reviewing', icon: 'clock', onPress: () => startAction(row, 'decide', 'reviewing') },
                    { key: 'resolved', label: 'Resolve', icon: 'check-circle', onPress: () => startAction(row, 'decide', 'resolved') },
                    { key: 'dismissed', label: 'Dismiss', icon: 'x-circle', onPress: () => startAction(row, 'decide', 'dismissed') },
                    { key: 'escalated', label: 'Escalate', icon: 'arrow-up', onPress: () => startAction(row, 'decide', 'escalated') },
                  ]} />
                ) : <Text style={[type.small, { color: colors.muted }]}>View only</Text>,
              },
            ]}
            rows={rows}
            rowKey={(row) => row.id}
            onRowPress={(row) => void openDetail(row)}
            emptyTitle="No reports found"
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </AdminCard>
      ) : null}

      <ModalCard visible={detailLoading || Boolean(detail)} onClose={() => setDetail(null)} width={820}>
        {detailLoading ? <Text style={[type.h3, { color: colors.ink }]}>Loading report…</Text> : null}
        {detail ? (
          <View style={{ maxHeight: '84%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <Text style={[type.h3, { color: colors.ink }]}>Report details</Text>
              <StatusBadge status={reportStatus} />
            </View>
            <ScrollView style={{ maxHeight: 450 }} showsVerticalScrollIndicator>
              <KeyValue label="Category" value={<StatusBadge status={String((detail.report as Record<string, unknown>).category ?? '')} />} />
              <KeyValue label="Priority" value={<StatusBadge status={String((detail.report as Record<string, unknown>).priority ?? '')} />} />
              <KeyValue label="Reporter" value={`@${String((detail.reporter as Record<string, unknown>).username ?? 'unknown')}`} />
              <KeyValue label="Reported user" value={`@${String((detail.reported_user as Record<string, unknown>).username ?? 'content only')}`} />
              <KeyValue label="Assigned to" value={String((detail.report as Record<string, unknown>).assigned_to ?? 'Unassigned')} />
              <KeyValue label="Reported" value={formatDateTime(String((detail.report as Record<string, unknown>).created_at ?? ''))} />
              <KeyValue label="Reason" value={truncate(String((detail.report as Record<string, unknown>).reason ?? ''), 320)} />
              <KeyValue label="Resolution notes" value={truncate(String((detail.report as Record<string, unknown>).resolution_notes ?? ''), 320)} />
              {mediaUrl ? (
                <Image source={{ uri: mediaUrl }} style={{ width: '100%', height: 200, borderRadius: 14, backgroundColor: colors.backgroundAlt, marginVertical: 10 }} resizeMode="contain" />
              ) : null}
              {can('reports.manage') ? (
                <View style={{ gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line }}>
                  <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                    <View style={{ minWidth: 180, flex: 1 }}>
                      <Select
                        label="Assign to"
                        value={String((detail.report as Record<string, unknown>).assigned_to ?? '') || null}
                        options={[{ label: 'Unassigned', value: '' }, ...assignees.map((person) => ({ label: `${person.display_name} (${titleCase(person.role)})`, value: person.user_id }))]}
                        onValueChange={(next) => startAction(detail.report, 'assign', next || null)}
                      />
                    </View>
                    <View style={{ minWidth: 150, flex: 1 }}>
                      <Select label="Priority" value={String((detail.report as Record<string, unknown>).priority ?? 'normal')} options={PRIORITIES.map((item) => ({ label: titleCase(item), value: item }))} onValueChange={(next) => startAction(detail.report, 'priority', next)} />
                    </View>
                  </View>
                  <Select label="Category" value={String((detail.report as Record<string, unknown>).category ?? 'other')} options={CATEGORIES.map((item) => ({ label: titleCase(item), value: item }))} onValueChange={(next) => startAction(detail.report, 'category', next)} />
                  <Text style={[type.tiny, { color: colors.muted }]}>Decision</Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {DECISIONS.map((decision) => (
                      <ClayButton key={decision} label={titleCase(decision)} size="sm" variant={decision === 'dismissed' ? 'danger' : 'secondary'} onPress={() => startAction(detail.report, 'decide', decision)} />
                    ))}
                  </View>
                  <Text style={[type.tiny, { color: colors.muted }]}>Linked actions</Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <ClayButton label="Warn user" size="sm" variant="outline" icon="alert-triangle" disabled={!hasReportedUser || !can('users.suspend')} onPress={() => startAction(detail.report, 'warn_user')} />
                    <ClayButton label="Suspend user" size="sm" variant="danger" icon="slash" disabled={!hasReportedUser || !can('users.suspend')} onPress={() => startAction(detail.report, 'suspend_user')} />
                    <ClayButton label="Remove content" size="sm" variant="destructive" icon="trash-2" disabled={!hasContent || !can('posts.manage')} onPress={() => startAction(detail.report, 'remove_content')} />
                  </View>
                </View>
              ) : null}
              <View style={{ marginTop: 14 }}>
                <Text style={[type.h3, { color: colors.ink, marginBottom: 8 }]}>Moderation history</Text>
                {detail.notes.length === 0 ? <Text style={[type.small, { color: colors.muted }]}>No prior admin notes.</Text> : null}
                {detail.notes.map((note, index) => (
                  <View key={String(note.id ?? index)} style={{ borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 8 }}>
                    <Text style={[type.smallMedium, { color: colors.ink }]}>{titleCase(String(note.action ?? ''))}</Text>
                    <Text style={[type.tiny, { color: colors.muted }]}>{formatDateTime(String(note.created_at ?? ''))}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        ) : null}
      </ModalCard>

      <ReasonDialog
        visible={Boolean(pending)}
        title={pending?.action === 'assign' ? 'Assign report' : `${titleCase(pending?.action ?? '')} report`}
        message={destructive ? 'This is a high-impact moderation action. The reason will be saved to the audit log.' : 'Confirm this report update. Your note is saved to the audit log.'}
        confirmLabel={destructive ? 'Apply action' : 'Update report'}
        destructive={destructive}
        loading={saving}
        reason={reason}
        onReasonChange={setReason}
        requireReason={requireReason}
        onConfirm={() => void confirmAction()}
        onCancel={() => setPending(null)}
      />
    </AdminPage>
  );
}

export function generateMetadata() {
  return adminPageMetadata("Reports & Moderation", "/admin/reports");
}
