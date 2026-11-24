import { useCallback, useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { ClayButton, ClayInput, Dropdown, SearchField, Select, useToast } from '../ui';
import { useAdmin } from './AdminProvider';
import {
  AdminCard,
  AdminPage,
  AdminRestricted,
  DataTable,
  FilterRow,
  LoadingCard,
  Pagination,
  ReasonDialog,
  StatusBadge,
} from './AdminUI';
import {
  adminApi,
  formatDate,
  friendlyError,
  signAdminPaths,
  titleCase,
  truncate,
  type AdminContent,
  type AdminPermission,
} from '../../lib/admin';
import { useTheme } from '../../theme/theme';

const PAGE_SIZE = 25;

type ContentKind = 'post' | 'reelyx' | 'comment';
type ContentAction = 'set_status' | 'remove' | 'restore' | 'feature' | 'unfeature' | 'review';

export function ContentManager({
  kind,
  title,
  subtitle,
  viewPermission,
  managePermission,
}: {
  kind: ContentKind;
  title: string;
  subtitle: string;
  viewPermission: AdminPermission;
  managePermission: AdminPermission;
}) {
  const { can } = useAdmin();
  const toast = useToast();
  const { colors, type } = useTheme();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [parentKind, setParentKind] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminContent[]>([]);
  const [total, setTotal] = useState(0);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ row: AdminContent; action: ContentAction; value: string | null } | null>(null);
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
      const result = await adminApi.listContent({
        p_kind: kind,
        p_search: debouncedSearch,
        p_status: status,
        p_parent_kind: parentKind,
        p_from: from ? `${from}T00:00:00.000Z` : null,
        p_to: to ? `${to}T23:59:59.999Z` : null,
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      });
      const items = result.items ?? [];
      setRows(items);
      setTotal(result.total ?? items.length);
      const paths = items.map((row) => row.media_key ?? row.content?.media_key).filter((path): path is string => Boolean(path));
      try {
        setSigned(await signAdminPaths(paths));
      } catch {
        setSigned({});
      }
    } catch (caught) {
      setError(friendlyError(caught));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, from, kind, page, parentKind, status, to]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const startAction = (row: AdminContent, action: ContentAction, value: string | null = null) => {
    setReason('');
    setPending({ row, action, value });
  };

  const confirmAction = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      await adminApi.mutateContent(kind, pending.row.id, pending.action, pending.value, reason);
      toast.show('Content updated.', 'success');
      setPending(null);
      void load();
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!can(viewPermission)) return <AdminRestricted permission={viewPermission} />;

  const statuses = kind === 'comment'
    ? [
        { label: 'All statuses', value: '' },
        { label: 'Visible', value: 'visible' },
        { label: 'Under review', value: 'under_review' },
        { label: 'Removed', value: 'removed' },
      ]
    : [
        { label: 'All statuses', value: '' },
        { label: 'Pending review', value: 'pending' },
        { label: 'Safe', value: 'safe' },
        { label: 'Mature', value: 'mature' },
        { label: 'Removed', value: 'removed' },
        ...(kind === 'reelyx' ? [{ label: 'Featured', value: 'featured' }] : []),
      ];

  const mediaKey = (row: AdminContent) => row.media_key ?? row.content?.media_key ?? '';
  const destructive = pending?.action === 'remove';

  return (
    <AdminPage
      title={title}
      subtitle={subtitle}
      actions={<ClayButton label="Refresh" variant="secondary" size="sm" icon="refresh-cw" loading={loading} onPress={() => void load()} />}
    >
      <AdminCard>
        <FilterRow>
          <View style={{ minWidth: 240, flex: 2 }}>
            <SearchField value={search} onChangeText={setSearch} placeholder={kind === 'comment' ? 'Search comment, author or post' : 'Search caption, author or ID'} />
          </View>
          <View style={{ width: 170 }}>
            <Select label="Status" value={status || null} onValueChange={(next) => { setStatus(next === 'all' ? '' : next); setPage(1); }} options={statuses} />
          </View>
          {kind === 'comment' ? (
            <View style={{ width: 170 }}>
              <Select
                label="Content type"
                value={parentKind || null}
                onValueChange={(next) => { setParentKind(next === 'all' ? '' : next); setPage(1); }}
                options={[
                  { label: 'All content', value: 'all' },
                  { label: 'Posts', value: 'post' },
                  { label: 'Reelyx', value: 'reelyx' },
                ]}
              />
            </View>
          ) : null}
          <View style={{ width: 160 }}><ClayInput label="From" value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" /></View>
          <View style={{ width: 160 }}><ClayInput label="To" value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" /></View>
        </FilterRow>
      </AdminCard>

      {loading ? <LoadingCard label="Loading content" /> : null}
      {!loading && error ? <AdminCard><Text style={[type.body, { color: colors.danger }]}>{error}</Text></AdminCard> : null}

      {!loading && !error ? (
        <AdminCard>
          {kind === 'comment' ? (
            <DataTable
              columns={[
                { key: 'body', label: 'Comment', width: 320, render: (row) => <Text style={[type.smallMedium, { color: colors.ink }]} numberOfLines={2}>{truncate(row.body, 110)}</Text> },
                { key: 'author', label: 'Author', width: 170, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]}>@{row.author?.username ?? 'unknown'}</Text> },
                { key: 'on', label: 'On content', width: 260, render: (row) => <Text style={[type.small, { color: colors.muted }]} numberOfLines={1}>{truncate(row.content?.caption, 70)}</Text> },
                { key: 'status', label: 'Status', width: 150, render: (row) => <StatusBadge status={row.status} /> },
                { key: 'date', label: 'Created', width: 150, render: (row) => <Text style={[type.small, { color: colors.muted }]}>{formatDate(row.created_at)}</Text> },
                { key: 'actions', label: 'Actions', width: 130, render: (row) => <ContentActions canManage={can(managePermission)} row={row} kind={kind} onAction={startAction} /> },
              ]}
              rows={rows}
              rowKey={(row) => row.id}
              emptyTitle="No comments found"
            />
          ) : (
            <DataTable
              columns={[
                {
                  key: 'media', label: 'Media', width: 90,
                  render: (row) => signed[mediaKey(row)]
                    ? <Image source={{ uri: signed[mediaKey(row)] }} style={{ width: 54, height: 54, borderRadius: 10, backgroundColor: colors.backgroundAlt }} resizeMode="cover" />
                    : <View style={{ width: 54, height: 54, borderRadius: 10, backgroundColor: colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.line }} /></View>,
                },
                { key: 'caption', label: 'Caption', width: 290, render: (row) => <Text style={[type.smallMedium, { color: colors.ink }]} numberOfLines={2}>{truncate(row.caption, 100)}</Text> },
                { key: 'author', label: 'Author', width: 165, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]}>@{row.author?.username ?? 'unknown'}</Text> },
                { key: 'status', label: 'Review', width: 140, render: (row) => <StatusBadge status={row.status} /> },
                { key: 'featured', label: 'Featured', width: 110, render: (row) => row.is_featured ? <StatusBadge status="safe" /> : <Text style={[type.small, { color: colors.muted }]}>No</Text> },
                { key: 'engagement', label: 'Likes / comments', width: 150, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]}>{row.like_count ?? 0} / {row.comment_count ?? 0}</Text> },
                { key: 'date', label: 'Created', width: 145, render: (row) => <Text style={[type.small, { color: colors.muted }]}>{formatDate(row.created_at)}</Text> },
                { key: 'actions', label: 'Actions', width: 130, render: (row) => <ContentActions canManage={can(managePermission)} row={row} kind={kind} onAction={startAction} /> },
              ]}
              rows={rows}
              rowKey={(row) => row.id}
              emptyTitle={kind === 'reelyx' ? 'No Reelyx videos found' : 'No posts found'}
            />
          )}
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </AdminCard>
      ) : null}

      <ReasonDialog
        visible={Boolean(pending)}
        title={`${titleCase(pending?.action ?? '')} ${kind}`}
        message={destructive ? 'This removes the item from public feeds. The audit log will record your reason.' : 'Confirm this moderation action. Your reason is written to the audit log.'}
        confirmLabel={destructive ? 'Remove' : 'Apply action'}
        destructive={destructive}
        loading={saving}
        reason={reason}
        onReasonChange={setReason}
        onConfirm={() => void confirmAction()}
        onCancel={() => setPending(null)}
      />
    </AdminPage>
  );
}

function ContentActions({
  row,
  kind,
  canManage,
  onAction,
}: {
  row: AdminContent;
  kind: ContentKind;
  canManage: boolean;
  onAction: (row: AdminContent, action: ContentAction, value?: string | null) => void;
}) {
  if (!canManage) return <Text style={{ color: '#99968D', fontSize: 12 }}>View only</Text>;
  const items = kind === 'comment'
    ? [
        { key: 'review', label: 'Mark under review', icon: 'eye' as const, onPress: () => onAction(row, 'review') },
        { key: 'restore', label: 'Restore', icon: 'rotate-ccw' as const, onPress: () => onAction(row, 'restore') },
        { key: 'remove', label: 'Remove comment', icon: 'trash-2' as const, tone: 'danger' as const, onPress: () => onAction(row, 'remove') },
      ]
    : [
        { key: 'safe', label: 'Mark safe', icon: 'check-circle' as const, onPress: () => onAction(row, 'set_status', 'safe') },
        { key: 'mature', label: 'Mark mature', icon: 'alert-circle' as const, onPress: () => onAction(row, 'set_status', 'mature') },
        { key: 'pending', label: 'Send to pending', icon: 'clock' as const, onPress: () => onAction(row, 'set_status', 'pending') },
        ...(kind === 'reelyx'
          ? [
              { key: 'feature', label: row.is_featured ? 'Unfeature' : 'Feature', icon: 'star' as const, onPress: () => onAction(row, row.is_featured ? 'unfeature' : 'feature') },
            ]
          : []),
        { key: 'remove', label: 'Remove', icon: 'slash' as const, tone: 'danger' as const, onPress: () => onAction(row, 'remove') },
        { key: 'restore', label: 'Restore', icon: 'rotate-ccw' as const, onPress: () => onAction(row, 'restore') },
      ];
  return <Dropdown label={`Moderate ${kind}`} items={items} />;
}
