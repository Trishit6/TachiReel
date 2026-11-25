import { adminPageMetadata } from '../../lib/seo';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Avatar, ClayButton, ClayInput, Dropdown, ModalCard, SearchField, Select, Tabs, useToast } from '../../components/ui';
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
  formatDate,
  formatDateTime,
  friendlyError,
  titleCase,
  truncate,
  type AdminUser,
  type AdminUserDetail,
} from '../../lib/admin';
import { useTheme } from '../../theme/theme';

const PAGE_SIZE = 25;
const DETAIL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'posts', label: 'Posts' },
  { key: 'reelyx', label: 'Reelyx' },
  { key: 'reports', label: 'Reports' },
  { key: 'warnings', label: 'Warnings' },
  { key: 'activity', label: 'Activity' },
];

type UserAction = { user: AdminUser; action: 'suspend' | 'reactivate' | 'verify' | 'reject_verification' | 'warn' | 'delete' };

function value(row: Record<string, unknown>, key: string): string {
  const found = row[key];
  return found === null || found === undefined || found === '' ? '—' : String(found);
}

export default function AdminUsersScreen() {
  const { can, access } = useAdmin();
  const toast = useToast();
  const { colors, type } = useTheme();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('created_at');
  const [direction, setDirection] = useState('desc');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState('overview');
  const [editDraft, setEditDraft] = useState<{ id: string; displayName: string; username: string; bio: string } | null>(null);
  const [pending, setPending] = useState<UserAction | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

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
      const result = await adminApi.listUsers({
        p_search: debouncedSearch,
        p_status: status,
        p_sort: sort,
        p_dir: direction,
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
  }, [debouncedSearch, direction, from, page, sort, status, to]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const openDetail = async (user: AdminUser) => {
    setDetailLoading(true);
    setDetail(null);
    setDetailError(null);
    setDetailTab('overview');
    try {
      setDetail(await adminApi.getUser(user.id));
    } catch (caught) {
      const message = friendlyError(caught);
      setDetailError(message);
      toast.show(message, 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const openEditUser = async (userId: string) => {
    try {
      const loaded = detail?.profile.id === userId ? detail : await adminApi.getUser(userId);
      setEditDraft({
        id: loaded.profile.id,
        displayName: loaded.profile.display_name,
        username: loaded.profile.username,
        bio: loaded.profile.bio ?? '',
      });
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    }
  };

  const saveEdit = async () => {
    if (!editDraft) return;
    setSaving(true);
    try {
      await adminApi.editUser(editDraft.id, editDraft.displayName.trim(), editDraft.username.trim().toLowerCase(), editDraft.bio.trim());
      toast.show('Profile updated.', 'success');
      setEditDraft(null);
      void load();
      setDetail(await adminApi.getUser(editDraft.id));
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setSaving(false);
    }
  };

  const startAction = (item: UserAction) => {
    setReason('');
    setPending(item);
  };

  const confirmAction = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      if (pending.action === 'warn') {
        await adminApi.warnUser(pending.user.id, reason);
      } else {
        const mapped = pending.action === 'verify'
          ? { action: 'set_verification', value: 'verified' }
          : pending.action === 'reject_verification'
            ? { action: 'set_verification', value: 'rejected' }
            : { action: pending.action, value: null };
        await adminApi.mutateUser(pending.user.id, mapped.action, mapped.value, reason);
      }
      toast.show('Account updated.', 'success');
      setPending(null);
      void load();
      if (detail) {
        try { setDetail(await adminApi.getUser(detail.profile.id)); }
        catch (caught) { toast.show(`Account updated, but details could not refresh: ${friendlyError(caught)}`, 'error'); }
      }
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!can('users.view')) return <AdminRestricted permission="users.view" />;

  const destructive = pending?.action === 'delete';
  const requireReason = pending?.action === 'delete' || pending?.action === 'warn' || pending?.action === 'suspend';
  const confirmLabel = pending?.action === 'delete' ? 'Delete account' : pending?.action === 'reactivate' ? 'Reactivate' : 'Apply action';

  return (
    <AdminPage
      title="User Management"
      subtitle="Search accounts on the server, review their history, and take controlled account action."
      actions={<ClayButton label="Refresh" variant="secondary" size="sm" icon="refresh-cw" loading={loading} onPress={() => void load()} />}
    >
      <AdminCard>
        <FilterRow>
          <View style={{ minWidth: 240, flex: 2 }}>
            <SearchField value={search} onChangeText={setSearch} placeholder="Search name, username, email or ID" />
          </View>
          <View style={{ width: 170 }}>
            <Select
              label="Status"
              value={status || null}
              onValueChange={(next) => { setStatus(next === 'all' ? '' : next); setPage(1); }}
              options={[
                { label: 'All statuses', value: 'all' },
                { label: 'Active', value: 'active' },
                { label: 'Suspended', value: 'suspended' },
                { label: 'Pending guardian', value: 'pending_guardian' },
              ]}
            />
          </View>
          <View style={{ width: 170 }}>
            <Select
              label="Sort by"
              value={sort}
              onValueChange={(next) => { setSort(next); setPage(1); }}
              options={[
                { label: 'Newest', value: 'created_at' },
                { label: 'Name', value: 'name' },
                { label: 'Username', value: 'username' },
                { label: 'Email', value: 'email' },
                { label: 'Status', value: 'status' },
              ]}
            />
          </View>
          <View style={{ width: 120 }}>
            <Select
              label="Order"
              value={direction}
              onValueChange={(next) => { setDirection(next); setPage(1); }}
              options={[{ label: 'Descending', value: 'desc' }, { label: 'Ascending', value: 'asc' }]}
            />
          </View>
          <View style={{ width: 160 }}><ClayInput label="From" value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" /></View>
          <View style={{ width: 160 }}><ClayInput label="To" value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" /></View>
        </FilterRow>
      </AdminCard>

      {loading ? <LoadingCard label="Loading users" /> : null}
      {!loading && error ? <AdminCard><Text style={[type.body, { color: colors.danger }]}>{error}</Text></AdminCard> : null}
      {!loading && !error ? (
        <AdminCard>
          <DataTable
            columns={[
              {
                key: 'user', label: 'User', width: 230,
                render: (row) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar uri={row.avatar_url} name={row.display_name} size={32} />
                    <View style={{ minWidth: 0 }}>
                      <Text style={[type.smallMedium, { color: colors.ink }]} numberOfLines={1}>{row.display_name}</Text>
                      <Text style={[type.tiny, { color: colors.muted }]} numberOfLines={1}>@{row.username}</Text>
                    </View>
                  </View>
                ),
              },
              { key: 'email', label: 'Email', width: 220, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]} numberOfLines={1}>{row.email ?? '—'}</Text> },
              { key: 'status', label: 'Account', width: 150, render: (row) => <StatusBadge status={row.account_status} /> },
              { key: 'consent', label: 'Verification', width: 160, render: (row) => <StatusBadge status={row.guardian_consent_status} /> },
              { key: 'type', label: 'Flags', width: 130, render: (row) => <Text style={[type.small, { color: colors.muted }]}>{row.is_minor ? 'Minor' : 'Adult'}{row.admin_role ? ` · ${titleCase(row.admin_role)}` : ''}</Text> },
              { key: 'content', label: 'Posts / Reelyx', width: 140, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]}>{row.post_count ?? 0} / {row.reelyx_count ?? 0}</Text> },
              { key: 'joined', label: 'Joined', width: 150, render: (row) => <Text style={[type.small, { color: colors.muted }]}>{formatDate(row.created_at)}</Text> },
              {
                key: 'actions', label: 'Actions', width: 130,
                render: (row) => (
                  <Dropdown
                    label={`Actions for ${row.username}`}
                    items={[
                      { key: 'view', label: 'View details', icon: 'eye', onPress: () => void openDetail(row) },
                      { key: 'edit', label: 'Edit profile', icon: 'edit-3', disabled: !can('users.edit') || row.id === access?.user_id, onPress: () => void openEditUser(row.id) },
                      { key: 'suspend', label: 'Suspend', icon: 'slash', disabled: !can('users.suspend'), onPress: () => startAction({ user: row, action: 'suspend' }) },
                      { key: 'reactivate', label: 'Reactivate', icon: 'check-circle', disabled: !can('users.suspend'), onPress: () => startAction({ user: row, action: 'reactivate' }) },
                      { key: 'verify', label: 'Mark verified', icon: 'shield', disabled: !can('users.verify_minor'), onPress: () => startAction({ user: row, action: 'verify' }) },
                      { key: 'reject', label: 'Reject verification', icon: 'x-circle', disabled: !can('users.verify_minor'), onPress: () => startAction({ user: row, action: 'reject_verification' }) },
                      { key: 'warn', label: 'Issue warning', icon: 'alert-triangle', disabled: !can('users.suspend'), onPress: () => startAction({ user: row, action: 'warn' }) },
                      { key: 'delete', label: 'Delete account', icon: 'trash-2', tone: 'danger', disabled: !can('users.delete'), onPress: () => startAction({ user: row, action: 'delete' }) },
                    ]}
                  />
                ),
              },
            ]}
            rows={rows}
            rowKey={(row) => row.id}
            onRowPress={(row) => void openDetail(row)}
            emptyTitle="No accounts found"
            emptyDescription="Try a different search term or status filter."
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </AdminCard>
      ) : null}

      <ModalCard visible={detailLoading || Boolean(detail) || Boolean(detailError)} onClose={() => { setDetail(null); setDetailError(null); }} width={860}>
        {detailLoading ? <LoadingCard label="Loading account details" /> : null}
        {!detailLoading && detailError ? <AdminCard><Text style={[type.body, { color: colors.danger }]}>{detailError}</Text></AdminCard> : null}
        {detail ? (
          <View style={{ maxHeight: '82%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <Avatar uri={detail.profile.avatar_url} name={detail.profile.display_name} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={[type.h3, { color: colors.ink }]}>{detail.profile.display_name}</Text>
                <Text style={[type.small, { color: colors.muted }]}>@{detail.profile.username} · {detail.profile.email ?? 'No email'}</Text>
              </View>
              <StatusBadge status={detail.profile.account_status} />
              {can('users.edit') && detail.profile.id !== access?.user_id ? (
                <ClayButton label="Edit profile" size="sm" variant="outline" icon="edit-3" onPress={() => void openEditUser(detail.profile.id)} />
              ) : null}
            </View>
            <Tabs items={DETAIL_TABS} active={detailTab} onChange={setDetailTab} />
            <ScrollView style={{ maxHeight: 420, marginTop: 14 }} showsVerticalScrollIndicator>
              {detailTab === 'overview' ? (
                <View>
                  <KeyValue label="Account status" value={<StatusBadge status={detail.profile.account_status} />} />
                  <KeyValue label="Guardian verification" value={<StatusBadge status={detail.profile.guardian_consent_status} />} />
                  <KeyValue label="Profile visibility" value={titleCase(detail.profile.profile_visibility)} />
                  <KeyValue label="Age classification" value={detail.profile.is_minor ? 'Minor' : 'Adult'} />
                  <KeyValue label="Admin role" value={detail.profile.admin_role ? titleCase(detail.profile.admin_role) : 'None'} />
                  <KeyValue label="Joined" value={formatDateTime(detail.profile.created_at)} />
                  <KeyValue label="Posts" value={detail.counts.posts ?? 0} />
                  <KeyValue label="Reelyx videos" value={detail.counts.reelyx ?? 0} />
                  <KeyValue label="Reports against account" value={detail.counts.reports ?? 0} />
                  <KeyValue label="Warnings" value={detail.counts.warnings ?? 0} />
                  <KeyValue label="Bio" value={truncate(detail.profile.bio, 180)} />
                </View>
              ) : null}
              {detailTab === 'posts' ? <DetailList rows={detail.posts} empty="No posts." primary="caption" secondary="sensitive_review_status" /> : null}
              {detailTab === 'reelyx' ? <DetailList rows={detail.reelyx} empty="No Reelyx videos." primary="caption" secondary="is_featured" /> : null}
              {detailTab === 'reports' ? <DetailList rows={detail.reports} empty="No reports against this account." primary="reason" secondary="status" /> : null}
              {detailTab === 'warnings' ? <DetailList rows={detail.warnings} empty="No warnings issued." primary="reason" secondary="created_at" /> : null}
              {detailTab === 'activity' ? <DetailList rows={detail.activity} empty="No recent activity." primary="label" secondary="at" /> : null}
            </ScrollView>
          </View>
        ) : null}
      </ModalCard>

      <ModalCard visible={Boolean(editDraft)} onClose={() => setEditDraft(null)} width={560}>
        {editDraft ? (
          <ScrollView style={{ maxHeight: '84%' }} showsVerticalScrollIndicator contentContainerStyle={{ gap: 14 }}>
            <Text style={[type.h3, { color: colors.ink }]}>Edit profile</Text>
            <Text style={[type.small, { color: colors.muted }]}>Only display name, username and bio can be changed here. Safety fields remain protected by database rules.</Text>
            <ClayInput label="Display name" value={editDraft.displayName} onChangeText={(value) => setEditDraft({ ...editDraft, displayName: value })} maxLength={80} />
            <ClayInput label="Username" value={editDraft.username} onChangeText={(value) => setEditDraft({ ...editDraft, username: value.toLowerCase() })} maxLength={30} autoCapitalize="none" />
            <ClayInput label="Bio" value={editDraft.bio} onChangeText={(value) => setEditDraft({ ...editDraft, bio: value })} multiline maxLength={300} />
            <ClayButton label="Save profile" icon="save" loading={saving} onPress={() => void saveEdit()} />
          </ScrollView>
        ) : null}
      </ModalCard>

      <ReasonDialog
        visible={Boolean(pending)}
        title={pending?.action === 'delete' ? 'Delete this account?' : `${titleCase(pending?.action ?? '')} account`}
        message={
          pending?.action === 'delete'
            ? `This permanently deletes ${pending?.user.username ?? 'this account'} and their data. This cannot be undone.`
            : `This will update ${pending?.user.username ?? 'this account'}. The reason is written to the audit log.`
        }
        confirmLabel={confirmLabel}
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

function DetailList({ rows, empty, primary, secondary }: { rows: Record<string, unknown>[]; empty: string; primary: string; secondary: string }) {
  const { colors, type } = useTheme();
  if (!rows.length) return <Text style={[type.small, { color: colors.muted, paddingVertical: 18 }]}>{empty}</Text>;
  return (
    <View style={{ gap: 8 }}>
      {rows.map((row, index) => (
        <View key={value(row, 'id') || index} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 4 }}>
          <Text style={[type.smallMedium, { color: colors.ink }]} numberOfLines={2}>{truncate(value(row, primary), 140)}</Text>
          <Text style={[type.tiny, { color: colors.muted }]}>{value(row, secondary)} · {formatDate(value(row, 'created_at') === '—' ? value(row, 'at') : value(row, 'created_at'))}</Text>
        </View>
      ))}
    </View>
  );
}

export function generateMetadata() {
  return adminPageMetadata("User Management", "/admin/users");
}
