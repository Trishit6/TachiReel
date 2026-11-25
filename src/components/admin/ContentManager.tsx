import { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { ClayButton, ClayInput, Dropdown, ModalCard, Notice, SearchField, Select, useToast } from '../ui';
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
  type AdminHistoryEntry,
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
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ row: AdminContent; items: AdminHistoryEntry[] } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
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
    setMediaError(null);
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
      } catch (caught) {
        setSigned({});
        setMediaError(`Preview unavailable: ${friendlyError(caught)}`);
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

  const openHistory = async (row: AdminContent) => {
    setHistory({ row, items: [] });
    setHistoryLoading(true);
    try {
      const result = await adminApi.getContentHistory(kind, row.id);
      setHistory({ row, items: result.items ?? [] });
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setHistoryLoading(false);
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
      {mediaError ? <Notice text={mediaError} tone="info" /> : null}

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
                { key: 'actions', label: 'Actions', width: 130, render: (row) => <ContentActions can={can} managePermission={managePermission} mutedColor={colors.muted} row={row} kind={kind} onAction={startAction} onHistory={(row) => void openHistory(row)} /> },
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
                { key: 'actions', label: 'Actions', width: 130, render: (row) => <ContentActions can={can} managePermission={managePermission} mutedColor={colors.muted} row={row} kind={kind} onAction={startAction} onHistory={(row) => void openHistory(row)} /> },
              ]}
              rows={rows}
              rowKey={(row) => row.id}
              emptyTitle={kind === 'reelyx' ? 'No Reelyx videos found' : 'No posts found'}
            />
          )}
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </AdminCard>
      ) : null}

      <ModalCard visible={history !== null} onClose={() => setHistory(null)} width={620}>
        {history ? (
          <ScrollView style={{ maxHeight: '84%' }} showsVerticalScrollIndicator>
            <Text style={[type.h3, { color: colors.ink, marginBottom: 8 }]}>Moderation history</Text>
            <Text style={[type.small, { color: colors.muted, marginBottom: 10 }]}>
              {kind === 'comment' ? truncate(history.row.body ?? '', 120) : truncate(history.row.caption ?? '', 120)}
            </Text>
            {historyLoading ? <LoadingCard label="Loading history" /> : null}
            {!historyLoading && history.items.length === 0 ? <Text style={[type.small, { color: colors.muted }]}>No moderation actions recorded.</Text> : null}
            {!historyLoading ? history.items.map((entry, index) => (
              <View key={`${entry.action}-${entry.created_at}-${index}`} style={{ borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 9, gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <Text style={[type.smallMedium, { color: colors.ink }]}>{titleCase(entry.action)}</Text>
                  <Text style={[type.tiny, { color: colors.muted }]}>{formatDate(entry.created_at)}</Text>
                </View>
                {entry.actor || entry.actor_username ? <Text style={[type.tiny, { color: colors.muted }]}>By @{entry.actor_username ?? entry.actor}</Text> : null}
                {entry.changes?.note ? <Text style={[type.small, { color: colors.inkSoft }]}>{String(entry.changes.note)}</Text> : null}
                {entry.changes?.value ? <Text style={[type.tiny, { color: colors.muted }]}>Value: {String(entry.changes.value)}</Text> : null}
              </View>
            )) : null}
          </ScrollView>
        ) : null}
      </ModalCard>

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
  can,
  managePermission,
  mutedColor,
  onAction,
  onHistory,
}: {
  row: AdminContent;
  kind: ContentKind;
  can: (permission: AdminPermission) => boolean;
  managePermission: AdminPermission;
  mutedColor: string;
  onAction: (row: AdminContent, action: ContentAction, value?: string | null) => void;
  onHistory: (row: AdminContent) => void;
}) {
  // Backend RPCs repeat every one of these checks. The menu only hides actions
  // that Postgres would reject anyway.
  const items: { key: string; label: string; icon: 'eye' | 'rotate-ccw' | 'trash-2' | 'check-circle' | 'alert-circle' | 'clock' | 'star' | 'slash' | 'eye-off'; tone?: 'danger'; onPress: () => void }[] = [
    { key: 'history', label: 'View history', icon: 'clock', onPress: () => onHistory(row) },
  ];
  const canManage = can(managePermission);

  if (kind === 'comment') {
    if (canManage) {
      items.push(
        { key: 'review', label: 'Mark under review', icon: 'eye', onPress: () => onAction(row, 'review') },
        { key: 'restore', label: 'Restore', icon: 'rotate-ccw', onPress: () => onAction(row, 'restore') },
      );
    }
    if (can('comments.delete')) {
      items.push({ key: 'remove', label: 'Remove comment', icon: 'trash-2', tone: 'danger', onPress: () => onAction(row, 'remove') });
    }
  } else {
    if (canManage) {
      items.push(
        { key: 'safe', label: 'Unhide / mark safe', icon: 'check-circle', onPress: () => onAction(row, 'set_status', 'safe') },
        { key: 'mature', label: 'Hide from feeds', icon: 'eye-off', onPress: () => onAction(row, 'set_status', 'mature') },
        { key: 'pending', label: 'Send to pending', icon: 'clock', onPress: () => onAction(row, 'set_status', 'pending') },
      );
    }
    if (kind === 'reelyx' && can('reelyx.feature')) {
      items.push({
        key: 'feature',
        label: row.is_featured ? 'Unfeature' : 'Feature',
        icon: 'star',
        onPress: () => onAction(row, row.is_featured ? 'unfeature' : 'feature'),
      });
    }
    if (can('posts.delete')) {
      items.push({ key: 'remove', label: 'Remove', icon: 'slash', tone: 'danger', onPress: () => onAction(row, 'remove') });
    }
    if (can('posts.restore')) {
      items.push({ key: 'restore', label: 'Restore', icon: 'rotate-ccw', onPress: () => onAction(row, 'restore') });
    }
  }

  if (items.length === 0) return <Text style={{ color: mutedColor, fontSize: 12 }}>View only</Text>;
  return <Dropdown label={`Moderate ${kind}`} items={items} />;
}
