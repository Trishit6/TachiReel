import { adminPageMetadata } from '../../lib/seo';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Avatar, ClayButton, ClayInput, Dialog, Dropdown, ModalCard, SearchField, Select, Tabs, useToast } from '../../components/ui';
import { useAdmin } from '../../components/admin/AdminProvider';
import {
  AdminCard,
  AdminPage,
  AdminRestricted,
  DataTable,
  FilterRow,
  LoadingCard,
  Pagination,
  StatCard,
  StatusBadge,
} from '../../components/admin/AdminUI';
import {
  adminApi,
  formatDateTime,
  friendlyError,
  titleCase,
  truncate,
  type AdminNotification,
  type AdminTemplate,
  type AdminUser,
} from '../../lib/admin';
import { useTheme } from '../../theme/theme';

const PAGE_SIZE = 25;
const TYPES = ['general', 'maintenance', 'policy', 'account'];

export default function AdminNotificationsScreen() {
  const { can } = useAdmin();
  const toast = useToast();
  const { colors, type } = useTheme();
  const [tab, setTab] = useState('announcements');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminNotification | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [notificationType, setNotificationType] = useState('general');
  const [audience, setAudience] = useState('all');
  const [templateKey, setTemplateKey] = useState('');
  const [sendNow, setSendNow] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<AdminUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<AdminUser[]>([]);

  const [editingTemplate, setEditingTemplate] = useState<AdminTemplate | null>(null);
  const [templateKeyInput, setTemplateKeyInput] = useState('');
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [templateType, setTemplateType] = useState('general');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.listNotifications({ p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE });
      setRows(result.items ?? []);
      setTotal(result.total ?? result.items?.length ?? 0);
    } catch (caught) {
      setError(friendlyError(caught));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  const loadTemplates = useCallback(async () => {
    try {
      const result = await adminApi.listTemplates();
      setTemplates(result.items ?? []);
    } catch {
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
      void loadTemplates();
    }, 0);
    return () => clearTimeout(timer);
  }, [load, loadTemplates]);

  useEffect(() => {
    if (!composerOpen) return;
    const timer = setTimeout(() => {
      if (!userSearch.trim()) {
        setUserResults([]);
        return;
      }
      void adminApi.listUsers({ p_search: userSearch.trim(), p_limit: 8, p_offset: 0 })
        .then((result) => setUserResults(result.items ?? []))
        .catch(() => setUserResults([]));
    }, 350);
    return () => clearTimeout(timer);
  }, [composerOpen, userSearch]);

  const openComposer = () => {
    setTitle(''); setBody(''); setNotificationType('general'); setAudience('all');
    setTemplateKey(''); setSendNow(false); setSelectedUsers([]); setUserSearch('');
    setComposerOpen(true);
  };

  const applyTemplate = (key: string) => {
    setTemplateKey(key);
    const found = templates.find((item) => item.key === key);
    if (found) { setTitle(found.title); setBody(found.body); setNotificationType(found.type); }
  };

  const createNotification = async () => {
    if (title.trim().length < 3 || body.trim().length < 3) {
      toast.show('Enter a title and message.', 'error');
      return;
    }
    if (audience === 'selected' && selectedUsers.length === 0) {
      toast.show('Select at least one recipient.', 'error');
      return;
    }
    setSaving(true);
    try {
      await adminApi.createNotification({
        p_title: title.trim(),
        p_body: body.trim(),
        p_type: notificationType,
        p_audience: audience,
        p_target_user_ids: selectedUsers.map((user) => user.id),
        p_template_key: templateKey || null,
        p_send_now: sendNow,
      });
      toast.show(sendNow ? 'Announcement sent.' : 'Draft saved.', 'success');
      setComposerOpen(false);
      void load();
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setSaving(false);
    }
  };

  const sendNotification = async (row: AdminNotification) => {
    setSaving(true);
    try {
      await adminApi.sendNotification(row.id);
      toast.show('Announcement sent to recipients.', 'success');
      void load();
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await adminApi.deleteNotification(deleteTarget.id);
      toast.show('Announcement deleted.', 'success');
      setDeleteTarget(null);
      void load();
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setSaving(false);
    }
  };

  const openTemplateEditor = (template: AdminTemplate | null) => {
    setEditingTemplate(template);
    setTemplateKeyInput(template?.key ?? '');
    setTemplateTitle(template?.title ?? '');
    setTemplateBody(template?.body ?? '');
    setTemplateType(template?.type ?? 'general');
    setTemplateOpen(true);
  };

  const saveTemplate = async () => {
    if (!editingTemplate && templateKeyInput.trim().length < 3) {
      toast.show('Enter a template key.', 'error');
      return;
    }
    if (templateTitle.trim().length < 3 || templateBody.trim().length < 3) {
      toast.show('Title and body are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      await adminApi.mutateTemplate(editingTemplate?.key ?? templateKeyInput.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'), 'upsert', {
        p_title: templateTitle.trim(), p_body: templateBody.trim(), p_type: templateType,
      });
      toast.show('Template saved.', 'success');
      setTemplateOpen(false);
      void loadTemplates();
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (template: AdminTemplate) => {
    setSaving(true);
    try {
      await adminApi.mutateTemplate(template.key, 'delete', {});
      toast.show('Template removed.', 'success');
      void loadTemplates();
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!can('notifications.view')) return <AdminRestricted permission="notifications.view" />;

  const sent = rows.filter((item) => item.status === 'sent').length;

  return (
    <AdminPage
      title="Notifications"
      subtitle="Send in-app announcements and maintain reusable message templates."
      actions={can('notifications.manage') ? (
        <ClayButton label="New announcement" size="sm" icon="plus" onPress={openComposer} />
      ) : undefined}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <StatCard label="Total announcements" value={total} icon="bell" accent />
        <StatCard label="Sent" value={sent} icon="send" />
        <StatCard label="Drafts" value={Math.max(0, total - sent)} icon="edit-3" />
        <StatCard label="Templates" value={templates.length} icon="file-text" />
      </View>

      <AdminCard>
        <Tabs
          items={[
            { key: 'announcements', label: 'Announcements' },
            { key: 'templates', label: 'Templates' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </AdminCard>

      {tab === 'announcements' ? (
        <>
          {loading ? <LoadingCard label="Loading announcements" /> : null}
          {!loading && error ? <AdminCard><Text style={[type.body, { color: colors.danger }]}>{error}</Text></AdminCard> : null}
          {!loading && !error ? (
            <AdminCard>
              <DataTable
                columns={[
                  { key: 'title', label: 'Title', width: 220, render: (row) => <Text style={[type.smallMedium, { color: colors.ink }]} numberOfLines={2}>{row.title}</Text> },
                  { key: 'body', label: 'Message', width: 290, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]} numberOfLines={2}>{truncate(row.body, 100)}</Text> },
                  { key: 'type', label: 'Type', width: 120, render: (row) => <StatusBadge status={row.type} /> },
                  { key: 'audience', label: 'Audience', width: 130, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]}>{row.audience === 'all' ? 'Everyone' : `${row.recipient_count} selected`}</Text> },
                  { key: 'status', label: 'Status', width: 120, render: (row) => <StatusBadge status={row.status} /> },
                  { key: 'delivered', label: 'Delivered', width: 110, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]}>{row.delivered_count ?? 0}</Text> },
                  { key: 'created', label: 'Created', width: 160, render: (row) => <Text style={[type.small, { color: colors.muted }]}>{formatDateTime(row.created_at)}</Text> },
                  {
                    key: 'actions', label: 'Actions', width: 110,
                    render: (row) => can('notifications.manage') ? (
                      <Dropdown label="Announcement actions" items={[
                        ...(row.status !== 'sent' ? [{ key: 'send', label: 'Send now', icon: 'send' as const, onPress: () => void sendNotification(row) }] : []),
                        { key: 'delete', label: 'Delete', icon: 'trash-2' as const, tone: 'danger' as const, onPress: () => setDeleteTarget(row) },
                      ]} />
                    ) : <Text style={[type.small, { color: colors.muted }]}>View only</Text>,
                  },
                ]}
                rows={rows}
                rowKey={(row) => row.id}
                emptyTitle="No announcements yet"
                emptyDescription="Create your first announcement with the button above."
              />
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
            </AdminCard>
          ) : null}
        </>
      ) : (
        <AdminCard>
          {can('notifications.manage') ? (
            <ClayButton label="New template" size="sm" icon="plus" onPress={() => openTemplateEditor(null)} />
          ) : null}
          {templates.length === 0 ? <Text style={[type.small, { color: colors.muted }]}>No templates saved.</Text> : null}
          {templates.map((template) => (
            <View key={template.key} style={{ borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 12, gap: 5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <Text style={[type.smallMedium, { color: colors.ink }]}>{template.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <StatusBadge status={template.type} />
                  {can('notifications.manage') ? (
                    <Dropdown label={`Template ${template.key}`} items={[
                      { key: 'edit', label: 'Edit', icon: 'edit-3', onPress: () => openTemplateEditor(template) },
                      { key: 'delete', label: 'Delete', icon: 'trash-2', tone: 'danger', onPress: () => void deleteTemplate(template) },
                    ]} />
                  ) : null}
                </View>
              </View>
              <Text style={[type.tiny, { color: colors.muted }]}>{template.key} · updated {formatDateTime(template.updated_at)}</Text>
              <Text style={[type.small, { color: colors.inkSoft }]} numberOfLines={2}>{truncate(template.body, 160)}</Text>
            </View>
          ))}
        </AdminCard>
      )}

      <ModalCard visible={composerOpen} onClose={() => setComposerOpen(false)} width={720}>
        <ScrollView showsVerticalScrollIndicator style={{ maxHeight: '84%' }}>
          <View style={{ gap: 14, paddingRight: 4 }}>
            <Text style={[type.h3, { color: colors.ink }]}>New announcement</Text>
            {templates.length ? (
              <Select
                label="Start from template"
                value={templateKey || null}
                options={[{ label: 'Blank message', value: '' }, ...templates.map((item) => ({ label: item.title, value: item.key }))]}
                onValueChange={applyTemplate}
              />
            ) : null}
            <ClayInput label="Title" value={title} onChangeText={setTitle} placeholder="Short headline" maxLength={120} />
            <ClayInput label="Message" value={body} onChangeText={setBody} placeholder="What should people know?" multiline maxLength={1000} />
            <FilterRow>
              <View style={{ width: 180 }}>
                <Select label="Type" value={notificationType} options={TYPES.map((item) => ({ label: titleCase(item), value: item }))} onValueChange={setNotificationType} />
              </View>
              <View style={{ width: 180 }}>
                <Select label="Audience" value={audience} options={[{ label: 'Everyone', value: 'all' }, { label: 'Selected users', value: 'selected' }]} onValueChange={setAudience} />
              </View>
              <View style={{ width: 180 }}>
                <Select label="When" value={sendNow ? 'now' : 'draft'} options={[{ label: 'Save as draft', value: 'draft' }, { label: 'Send now', value: 'now' }]} onValueChange={(next) => setSendNow(next === 'now')} />
              </View>
            </FilterRow>
            {audience === 'selected' ? (
              <View style={{ gap: 10 }}>
                <SearchField value={userSearch} onChangeText={setUserSearch} placeholder="Search accounts to add recipients" compact />
                {selectedUsers.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {selectedUsers.map((user) => (
                      <ClayButton key={user.id} label={`@${user.username}`} size="sm" variant="outline" icon="x" onPress={() => setSelectedUsers((current) => current.filter((item) => item.id !== user.id))} />
                    ))}
                  </View>
                ) : null}
                {userResults.map((user) => (
                  <View key={user.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 9 }}>
                    <Avatar uri={user.avatar_url} name={user.display_name} size={30} />
                    <View style={{ flex: 1 }}>
                      <Text style={[type.smallMedium, { color: colors.ink }]}>{user.display_name}</Text>
                      <Text style={[type.tiny, { color: colors.muted }]}>@{user.username} · {titleCase(user.account_status)}</Text>
                    </View>
                    <ClayButton
                      label={selectedUsers.some((item) => item.id === user.id) ? 'Added' : 'Add'}
                      size="sm"
                      variant="outline"
                      disabled={selectedUsers.some((item) => item.id === user.id)}
                      onPress={() => setSelectedUsers((current) => [...current, user])}
                    />
                  </View>
                ))}
              </View>
            ) : null}
            <ClayButton label={sendNow ? 'Create and send' : 'Save draft'} icon={sendNow ? 'send' : 'save'} loading={saving} onPress={() => void createNotification()} />
          </View>
        </ScrollView>
      </ModalCard>

      <ModalCard visible={templateOpen} onClose={() => setTemplateOpen(false)} width={560}>
        <View style={{ gap: 14 }}>
          <Text style={[type.h3, { color: colors.ink }]}>{editingTemplate ? 'Edit template' : 'New template'}</Text>
          <ClayInput label="Key" value={templateKeyInput} onChangeText={setTemplateKeyInput} placeholder="welcome-message" editable={!editingTemplate} />
          <ClayInput label="Title" value={templateTitle} onChangeText={setTemplateTitle} placeholder="Template title" />
          <ClayInput label="Message" value={templateBody} onChangeText={setTemplateBody} placeholder="Template body" multiline />
          <Select label="Type" value={templateType} options={TYPES.map((item) => ({ label: titleCase(item), value: item }))} onValueChange={setTemplateType} />
          <ClayButton label="Save template" icon="save" loading={saving} onPress={() => void saveTemplate()} />
        </View>
      </ModalCard>

      <Dialog
        visible={Boolean(deleteTarget)}
        title="Delete announcement?"
        message={deleteTarget ? `“${truncate(deleteTarget.title, 80)}” will be removed. Delivered notifications already on devices cannot be recalled.` : ''}
        confirmLabel="Delete"
        destructive
        loading={saving}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </AdminPage>
  );
}

export function generateMetadata() {
  return adminPageMetadata("Notifications", "/admin/notifications");
}
