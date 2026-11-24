import { adminPageMetadata } from '../../lib/seo';
import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { Avatar, ClayButton, ClayInput, Dropdown, ModalCard, SearchField, Select, useToast } from '../../components/ui';
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
  StatCard,
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
  type AdminTicket,
  type AdminTicketDetail,
} from '../../lib/admin';
import { useTheme } from '../../theme/theme';

const PAGE_SIZE = 25;
const STATUSES = ['open', 'in_progress', 'waiting_for_user', 'pending', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const CATEGORIES = ['account', 'safety', 'content', 'reelyx', 'other'];
type TicketAction = 'status' | 'priority' | 'assign' | 'reply' | 'internal_note';

export default function AdminTicketsScreen() {
  const { can } = useAdmin();
  const toast = useToast();
  const { colors, type } = useTheme();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminTicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [assignees, setAssignees] = useState<AdminAssignee[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ ticket: AdminTicket; action: TicketAction; value: string | null } | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!can('tickets.view')) return;
    void adminApi.listAssignees()
      .then((result) => setAssignees(result.items ?? []))
      .catch(() => setAssignees([]));
  }, [can]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.listTickets({
        p_search: debouncedSearch,
        p_status: status,
        p_priority: priority,
        p_category: category,
        p_from: from ? `${from}T00:00:00.000Z` : null,
        p_to: to ? `${to}T23:59:59.999Z` : null,
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      });
      setRows(result.items ?? []);
      setTotal(result.total ?? result.items?.length ?? 0);
      setStats(result.stats ?? {});
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

  const openDetail = async (ticket: AdminTicket) => {
    setDetailLoading(true);
    setDetail(null);
    setAttachmentUrls({});
    try {
      const data = await adminApi.getTicket(ticket.id);
      setDetail(data);
      const paths = (data.attachments ?? []).map((item) => item.storage_path).filter(Boolean);
      if (paths.length) {
        try { setAttachmentUrls(await signAdminPaths(paths, 'support-attachments')); } catch { setAttachmentUrls({}); }
      }
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const startAction = (ticket: AdminTicket, action: TicketAction, value: string | null = null) => {
    setReason('');
    setPending({ ticket, action, value });
  };

  const confirmAction = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      await adminApi.mutateTicket(pending.ticket.id, pending.action, pending.value, reason);
      toast.show(pending.action === 'reply' ? 'Reply sent to the user.' : 'Ticket updated.', 'success');
      setPending(null);
      void load();
      if (detail) {
        try { setDetail(await adminApi.getTicket(detail.ticket.id)); } catch { /* keep detail */ }
      }
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!can('tickets.view')) return <AdminRestricted permission="tickets.view" />;

  const dialogTitle = pending?.action === 'reply' ? 'Reply to ticket' : pending?.action === 'internal_note' ? 'Add internal note' : `${titleCase(pending?.action ?? '')} ticket`;
  const confirmLabel = pending?.action === 'reply' ? 'Send reply' : pending?.action === 'internal_note' ? 'Save note' : 'Update ticket';

  return (
    <AdminPage
      title="Support Tickets"
      subtitle="Answer conversations, assign owners, and keep a private internal trail for staff."
      actions={<ClayButton label="Refresh" variant="secondary" size="sm" icon="refresh-cw" loading={loading} onPress={() => void load()} />}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <StatCard label="Total tickets" value={stats.total ?? 0} icon="inbox" accent />
        <StatCard label="Open / active" value={stats.open ?? 0} icon="life-buoy" />
        <StatCard label="Resolved" value={stats.resolved ?? 0} icon="check-circle" />
        <StatCard label="Closed" value={stats.closed ?? 0} icon="lock" />
        <StatCard label="Avg. first response" value={`${stats.average_response_minutes ?? 0}m`} icon="clock" />
      </View>

      <AdminCard>
        <FilterRow>
          <View style={{ minWidth: 230, flex: 2 }}>
            <SearchField value={search} onChangeText={setSearch} placeholder="Search subject, user or ticket ID" />
          </View>
          <View style={{ width: 170 }}>
            <Select label="Status" value={status || null} onValueChange={(next) => { setStatus(next === 'all' ? '' : next); setPage(1); }} options={[{ label: 'All statuses', value: 'all' }, ...STATUSES.map((item) => ({ label: titleCase(item), value: item }))]} />
          </View>
          <View style={{ width: 150 }}>
            <Select label="Priority" value={priority || null} onValueChange={(next) => { setPriority(next === 'all' ? '' : next); setPage(1); }} options={[{ label: 'All priorities', value: 'all' }, ...PRIORITIES.map((item) => ({ label: titleCase(item), value: item }))]} />
          </View>
          <View style={{ width: 150 }}>
            <Select label="Category" value={category || null} onValueChange={(next) => { setCategory(next === 'all' ? '' : next); setPage(1); }} options={[{ label: 'All categories', value: 'all' }, ...CATEGORIES.map((item) => ({ label: titleCase(item), value: item }))]} />
          </View>
          <View style={{ width: 145 }}><ClayInput label="From" value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" /></View>
          <View style={{ width: 145 }}><ClayInput label="To" value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" /></View>
        </FilterRow>
      </AdminCard>

      {loading ? <LoadingCard label="Loading tickets" /> : null}
      {!loading && error ? <AdminCard><Text style={[type.body, { color: colors.danger }]}>{error}</Text></AdminCard> : null}
      {!loading && !error ? (
        <AdminCard>
          <DataTable
            columns={[
              { key: 'subject', label: 'Subject', width: 260, render: (row) => <Text style={[type.smallMedium, { color: colors.ink }]} numberOfLines={2}>{row.subject}</Text> },
              { key: 'user', label: 'User', width: 165, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]}>@{row.username}</Text> },
              { key: 'category', label: 'Category', width: 120, render: (row) => <StatusBadge status={row.category} /> },
              { key: 'priority', label: 'Priority', width: 120, render: (row) => <StatusBadge status={row.priority} /> },
              { key: 'status', label: 'Status', width: 150, render: (row) => <StatusBadge status={row.status} /> },
              { key: 'messages', label: 'Messages', width: 110, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]}>{row.message_count ?? 0}</Text> },
              { key: 'updated', label: 'Updated', width: 170, render: (row) => <Text style={[type.small, { color: colors.muted }]}>{formatDateTime(row.updated_at)}</Text> },
              {
                key: 'actions', label: 'Actions', width: 130,
                render: (row) => can('tickets.manage') ? (
                  <Dropdown label="Ticket actions" items={[
                    { key: 'open', label: 'Open ticket', icon: 'eye', onPress: () => void openDetail(row) },
                    { key: 'status', label: 'Change status', icon: 'refresh-cw', onPress: () => startAction(row, 'status', 'in_progress') },
                    { key: 'priority', label: 'Set urgent', icon: 'arrow-up', onPress: () => startAction(row, 'priority', 'urgent') },
                    { key: 'reply', label: 'Send reply', icon: 'message-circle', onPress: () => startAction(row, 'reply') },
                  ]} />
                ) : <Text style={[type.small, { color: colors.muted }]}>View only</Text>,
              },
            ]}
            rows={rows}
            rowKey={(row) => row.id}
            onRowPress={(row) => void openDetail(row)}
            emptyTitle="No tickets found"
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </AdminCard>
      ) : null}

      <ModalCard visible={detailLoading || Boolean(detail)} onClose={() => setDetail(null)} width={860}>
        {detailLoading ? <Text style={[type.h3, { color: colors.ink }]}>Loading ticket…</Text> : null}
        {detail ? (
          <View style={{ maxHeight: '84%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Avatar uri={String(detail.user.avatar_url ?? '') || null} name={String(detail.user.display_name ?? 'User')} size={42} />
              <View style={{ flex: 1 }}>
                <Text style={[type.h3, { color: colors.ink }]}>{detail.ticket.subject}</Text>
                <Text style={[type.small, { color: colors.muted }]}>@{String(detail.user.username ?? 'unknown')} · {titleCase(detail.ticket.category)}</Text>
              </View>
              <StatusBadge status={detail.ticket.status} />
            </View>
            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator>
              <KeyValue label="Priority" value={<StatusBadge status={detail.ticket.priority} />} />
              <KeyValue label="Assigned to" value={String(detail.assigned_to ?? 'Unassigned')} />
              <KeyValue label="Opened" value={formatDateTime(detail.ticket.created_at)} />
              <KeyValue label="Last updated" value={formatDateTime(detail.ticket.updated_at)} />

              {can('tickets.manage') ? (
                <View style={{ gap: 10, marginVertical: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                  <Select label="Status" value={detail.ticket.status} options={STATUSES.map((item) => ({ label: titleCase(item), value: item }))} onValueChange={(next) => startAction(detail.ticket, 'status', next)} />
                  <Select label="Priority" value={detail.ticket.priority} options={PRIORITIES.map((item) => ({ label: titleCase(item), value: item }))} onValueChange={(next) => startAction(detail.ticket, 'priority', next)} />
                  <Select label="Assigned to" value={String(detail.ticket.assigned_to ?? '') || null} options={[{ label: 'Unassigned', value: '' }, ...assignees.map((person) => ({ label: `${person.display_name} (${titleCase(person.role)})`, value: person.user_id }))]} onValueChange={(next) => startAction(detail.ticket, 'assign', next || null)} />
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <ClayButton label="Reply to user" size="sm" icon="message-circle" onPress={() => startAction(detail.ticket, 'reply')} />
                    <ClayButton label="Internal note" size="sm" variant="outline" icon="edit-3" onPress={() => startAction(detail.ticket, 'internal_note')} />
                  </View>
                </View>
              ) : null}

              <Text style={[type.h3, { color: colors.ink, marginBottom: 8 }]}>Conversation</Text>
              {detail.messages.length === 0 ? <Text style={[type.small, { color: colors.muted }]}>No messages yet.</Text> : null}
              {detail.messages.map((message) => {
                const staff = message.author_role === 'support';
                return (
                  <View key={message.id} style={{ alignSelf: staff ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: staff ? colors.accentSoft : colors.backgroundAlt, borderRadius: 14, padding: 12, marginBottom: 8 }}>
                    <Text style={[type.tiny, { color: colors.muted, marginBottom: 4 }]}>{staff ? 'Support' : 'User'} · {formatDateTime(message.created_at)}</Text>
                    <Text style={[type.small, { color: colors.ink }]}>{message.body}</Text>
                  </View>
                );
              })}

              {detail.internal_notes.length ? (
                <View style={{ marginTop: 14 }}>
                  <Text style={[type.h3, { color: colors.ink, marginBottom: 8 }]}>Internal notes</Text>
                  {detail.internal_notes.map((note) => (
                    <View key={note.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 11, marginBottom: 7 }}>
                      <Text style={[type.small, { color: colors.ink }]}>{note.body}</Text>
                      <Text style={[type.tiny, { color: colors.muted, marginTop: 4 }]}>{note.author ?? 'Staff'} · {formatDateTime(note.created_at)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {detail.attachments.length ? (
                <View style={{ marginTop: 14 }}>
                  <Text style={[type.h3, { color: colors.ink, marginBottom: 8 }]}>Attachments</Text>
                  {detail.attachments.map((attachment) => (
                    <ClayButton
                      key={attachment.id}
                      label={`${attachment.file_name} · ${Math.round(attachment.byte_size / 1024)} KB`}
                      variant="outline"
                      size="sm"
                      icon="paperclip"
                      onPress={() => {
                        const url = attachmentUrls[attachment.storage_path];
                        if (url) void Linking.openURL(url);
                        else toast.show('This attachment is no longer available.', 'error');
                      }}
                    />
                  ))}
                </View>
              ) : null}

              <Text style={[type.tiny, { color: colors.muted, marginTop: 14 }]}>{truncate(detail.ticket.subject, 140)}</Text>
            </ScrollView>
          </View>
        ) : null}
      </ModalCard>

      <ReasonDialog
        visible={Boolean(pending)}
        title={dialogTitle}
        message={pending?.action === 'internal_note' ? 'Internal notes are visible to staff only.' : 'Confirm this support action.'}
        confirmLabel={confirmLabel}
        loading={saving}
        reason={reason}
        onReasonChange={setReason}
        requireReason={pending?.action === 'reply' || pending?.action === 'internal_note'}
        onConfirm={() => void confirmAction()}
        onCancel={() => setPending(null)}
      />
    </AdminPage>
  );
}

export function generateMetadata() {
  return adminPageMetadata("Support Tickets", "/admin/tickets");
}
