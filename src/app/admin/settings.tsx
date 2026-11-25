import { adminPageMetadata } from '../../lib/seo';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ClayButton, ClayInput, Dialog, ModalCard, Select, Tabs, useToast } from '../../components/ui';
import { useAdmin } from '../../components/admin/AdminProvider';
import { AdminCard, AdminPage, AdminRestricted, KeyValue, LoadingCard, StatusBadge } from '../../components/admin/AdminUI';
import { adminApi, formatDateTime, friendlyError, truncate, type HelpContent } from '../../lib/admin';
import { useTheme } from '../../theme/theme';

type SettingCategory = 'general' | 'moderation' | 'notifications' | 'security' | 'support';
type SettingDefinition = {
  key: string;
  label: string;
  description: string;
  category: SettingCategory;
  kind: 'text' | 'number' | 'boolean';
  min?: number;
  max?: number;
};

// Every key here is validated server-side by admin_set_setting; these limits
// mirror that validation so the form fails early with a clear message.
const SETTINGS: SettingDefinition[] = [
  { key: 'general.platform_name', label: 'Platform name', description: 'Shown in headers, emails and public metadata.', category: 'general', kind: 'text' },
  { key: 'general.description', label: 'Platform description', description: 'Short summary used in share previews.', category: 'general', kind: 'text' },
  { key: 'moderation.require_review_for_media', label: 'Review every media change', description: 'Return edited posts to pending review when their media changes.', category: 'moderation', kind: 'boolean' },
  { key: 'moderation.auto_flag_threshold', label: 'Auto-flag threshold', description: 'Risk score at which new content is prioritised for review (0–100).', category: 'moderation', kind: 'number', min: 0, max: 100 },
  { key: 'notifications.announcements_enabled', label: 'Announcements enabled', description: 'Allow staff to publish announcements to members.', category: 'notifications', kind: 'boolean' },
  { key: 'notifications.daily_digest', label: 'Daily digest', description: 'Send the daily activity digest to opted-in members.', category: 'notifications', kind: 'boolean' },
  { key: 'security.require_2fa_for_admins', label: 'Require 2FA for staff', description: 'Recorded staff security policy; enforce in Supabase Auth settings.', category: 'security', kind: 'boolean' },
  { key: 'security.session_timeout_minutes', label: 'Session timeout (minutes)', description: 'Maximum idle session lifetime (15–10080).', category: 'security', kind: 'number', min: 15, max: 10080 },
  { key: 'security.max_login_attempts', label: 'Login attempt limit', description: 'Failed attempts before a cooldown (3–20).', category: 'security', kind: 'number', min: 3, max: 20 },
  { key: 'support.contact_email', label: 'Support email', description: 'Reply-to address for support conversations.', category: 'support', kind: 'text' },
  { key: 'support.business_hours', label: 'Business hours', description: 'Shown in support replies and the help centre.', category: 'support', kind: 'text' },
  { key: 'support.sla_first_response_hours', label: 'First response SLA (hours)', description: 'Target time to the first staff reply (1–720).', category: 'support', kind: 'number', min: 1, max: 720 },
  { key: 'support.sla_resolution_hours', label: 'Resolution SLA (hours)', description: 'Target time to resolve a ticket (1–720).', category: 'support', kind: 'number', min: 1, max: 720 },
  { key: 'content.max_post_media_mb', label: 'Max media size (MB)', description: 'Upper limit for a single upload (1–200).', category: 'general', kind: 'number', min: 1, max: 200 },
  { key: 'content.max_caption_chars', label: 'Max caption characters', description: 'Longest caption accepted on a post (100–5000).', category: 'general', kind: 'number', min: 100, max: 5000 },
];

const SETTING_TABS: { key: SettingCategory; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'moderation', label: 'Moderation' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'security', label: 'Security' },
  { key: 'support', label: 'Support' },
];

type HelpDraft = {
  kind: 'category' | 'article' | 'faq';
  id: string | null;
  name: string;
  slug: string;
  description: string;
  categorySlug: string;
  summary: string;
  question: string;
  answer: string;
  published: boolean;
};

const EMPTY_DRAFT: HelpDraft = {
  kind: 'category', id: null, name: '', slug: '', description: '', categorySlug: '',
  summary: '', question: '', answer: '', published: true,
};

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export default function AdminSettingsScreen() {
  const { can } = useAdmin();
  const toast = useToast();
  const { colors, type } = useTheme();
  const [tab, setTab] = useState('general');
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [help, setHelp] = useState<HelpContent>({ categories: [], articles: [], faqs: [] });
  const [helpLoading, setHelpLoading] = useState(false);
  const [helpError, setHelpError] = useState<string | null>(null);
  const [draft, setDraft] = useState<HelpDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HelpDraft | null>(null);
  const [savingHelp, setSavingHelp] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.getSettings();
      setSettings(result ?? {});
      setDrafts(Object.fromEntries(SETTINGS.map((item) => [item.key, asText(result?.[item.key])])));
    } catch (caught) {
      setError(friendlyError(caught));
      setSettings({});
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHelp = useCallback(async () => {
    setHelpLoading(true);
    setHelpError(null);
    try {
      setHelp(await adminApi.listHelp());
    } catch (caught) {
      const message = friendlyError(caught);
      setHelpError(message);
      toast.show(message, 'error');
    } finally {
      setHelpLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (tab !== 'help' || !can('help.manage')) return;
    const timer = setTimeout(() => void loadHelp(), 0);
    return () => clearTimeout(timer);
  }, [can, loadHelp, tab]);

  const saveSetting = async (definition: SettingDefinition) => {
    const raw = (drafts[definition.key] ?? '').trim();
    if (!raw) { toast.show('Enter a value before saving.', 'error'); return; }
    let value: unknown = raw;
    if (definition.kind === 'boolean') {
      if (raw !== 'true' && raw !== 'false') { toast.show('Choose true or false.', 'error'); return; }
      value = raw === 'true';
    } else if (definition.kind === 'number') {
      const parsed = Number(raw);
      const min = definition.min ?? 1;
      const max = definition.max ?? 10000;
      if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        toast.show(`Enter a whole number between ${min} and ${max}.`, 'error');
        return;
      }
      value = parsed;
    }
    setSavingKey(definition.key);
    try {
      await adminApi.setSetting(definition.key, value);
      toast.show(`${definition.label} saved.`, 'success');
      void load();
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setSavingKey(null);
    }
  };

  const openHelpDraft = (next: Partial<HelpDraft>) => setDraft({ ...EMPTY_DRAFT, ...next });

  const saveHelp = async () => {
    if (!draft) return;
    const payload: Record<string, unknown> = { is_published: draft.published };
    if (draft.kind === 'category') {
      if (!draft.name.trim()) { toast.show('Enter a category name.', 'error'); return; }
      payload.name = draft.name.trim();
      payload.description = draft.description.trim();
      payload.slug = draft.slug.trim() || draft.name.trim();
      payload.sort_order = 0;
      payload.is_active = draft.published;
    } else if (draft.kind === 'article') {
      if (!draft.name.trim() || !draft.summary.trim()) { toast.show('Enter a title and summary.', 'error'); return; }
      payload.title = draft.name.trim();
      payload.summary = draft.summary.trim();
      payload.slug = draft.slug.trim() || draft.name.trim();
      payload.category_slug = draft.categorySlug || null;
      payload.minutes = 2;
      payload.keywords = [];
      payload.sections = [];
    } else {
      if (!draft.question.trim() || !draft.answer.trim()) { toast.show('Enter a question and answer.', 'error'); return; }
      payload.question = draft.question.trim();
      payload.answer = draft.answer.trim();
      payload.category_slug = draft.categorySlug || null;
      payload.article_slug = null;
      payload.sort_order = 0;
    }
    setSavingHelp(true);
    try {
      await adminApi.mutateHelp(draft.kind, draft.id ? 'upsert' : 'create', draft.id, payload);
      toast.show('Help content saved.', 'success');
      setDraft(null);
      void loadHelp();
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setSavingHelp(false);
    }
  };

  const confirmDeleteHelp = async () => {
    if (!deleteTarget) return;
    setSavingHelp(true);
    try {
      await adminApi.mutateHelp(deleteTarget.kind, 'delete', deleteTarget.id, {});
      toast.show('Help content removed.', 'success');
      setDeleteTarget(null);
      void loadHelp();
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setSavingHelp(false);
    }
  };

  const canViewSettings = can('settings.view');
  const canManageSettings = can('settings.manage');
  const canHelp = can('help.manage');
  if (!canViewSettings && !canHelp) return <AdminRestricted permission="settings.view or help.manage" />;

  const tabs = [
    ...(canViewSettings ? SETTING_TABS : []),
    ...(canHelp ? [{ key: 'help' as const, label: 'Help centre' }] : []),
  ];
  const activeTab = tabs.some((item) => item.key === tab) ? tab : tabs[0].key;

  return (
    <AdminPage
      title="Platform Settings"
      subtitle="Review and change the settings that power the live app and its help centre."
      actions={<ClayButton label="Refresh" variant="secondary" size="sm" icon="refresh-cw" loading={loading || helpLoading} onPress={() => { void load(); if (activeTab === 'help') void loadHelp(); }} />}
    >
      <AdminCard>
        <Tabs items={tabs} active={activeTab} onChange={setTab} />
      </AdminCard>

      {activeTab !== 'help' ? (
        <>
          {loading ? <LoadingCard label="Loading settings" /> : null}
          {!loading && error ? <AdminCard><Text style={[type.body, { color: colors.danger }]}>{error}</Text></AdminCard> : null}
          {!loading && !error ? (
            <AdminCard>
              {SETTINGS.filter((definition) => definition.category === activeTab).map((definition) => (
                <View key={definition.key} style={{ borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 14, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.smallMedium, { color: colors.ink }]}>{definition.label}</Text>
                      <Text style={[type.tiny, { color: colors.muted }]}>{definition.description}</Text>
                    </View>
                    {canManageSettings ? (
                      <ClayButton label="Save" size="sm" loading={savingKey === definition.key} onPress={() => void saveSetting(definition)} />
                    ) : <StatusBadge status="draft" />}
                  </View>
                  {definition.kind === 'boolean' ? (
                    <Select
                      label="Value"
                      value={drafts[definition.key] || asText(settings[definition.key]) || 'false'}
                      options={[{ label: 'Enabled', value: 'true' }, { label: 'Disabled', value: 'false' }]}
                      onValueChange={(value) => setDrafts((current) => ({ ...current, [definition.key]: value }))}
                    />
                  ) : (
                    <ClayInput
                      value={drafts[definition.key] ?? ''}
                      onChangeText={(value) => setDrafts((current) => ({ ...current, [definition.key]: value }))}
                      placeholder={asText(settings[definition.key]) || 'Not set'}
                      editable={canManageSettings}
                      keyboardType={definition.kind === 'number' ? 'number-pad' : 'default'}
                      multiline={definition.key === 'general.description'}
                    />
                  )}
                  <Text style={[type.tiny, { color: colors.muted }]}>Database key: {definition.key} · stored value: {truncate(asText(settings[definition.key]) || 'none', 80)}</Text>
                </View>
              ))}
            </AdminCard>
          ) : null}
        </>
      ) : null}

      {activeTab === 'help' && canHelp ? (
        <>
          <AdminCard>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <ClayButton label="New category" size="sm" variant="outline" icon="plus" onPress={() => openHelpDraft({ kind: 'category' })} />
              <ClayButton label="New article" size="sm" variant="outline" icon="plus" onPress={() => openHelpDraft({ kind: 'article' })} />
              <ClayButton label="New FAQ" size="sm" variant="outline" icon="plus" onPress={() => openHelpDraft({ kind: 'faq' })} />
            </View>
          </AdminCard>
          {helpLoading ? <LoadingCard label="Loading help content" /> : null}
          {!helpLoading && helpError ? <AdminCard><Text style={[type.body, { color: colors.danger }]}>{helpError}</Text></AdminCard> : null}
          {!helpLoading && !helpError ? (
          <>
          <AdminCard>
            <Text style={[type.h3, { color: colors.ink }]}>Categories ({help.categories.length})</Text>
            {help.categories.length === 0 ? <Text style={[type.small, { color: colors.muted }]}>No categories yet.</Text> : null}
            {help.categories.map((item) => (
              <View key={asText(item.id)} style={{ borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 10 }}>
                <KeyValue label={asText(item.name) || asText(item.slug)} value={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><StatusBadge status={item.is_active ? 'published' : 'draft'} /><ClayButton label="Edit" size="sm" variant="outline" onPress={() => openHelpDraft({ kind: 'category', id: asText(item.id), name: asText(item.name), slug: asText(item.slug), description: asText(item.description), published: Boolean(item.is_active) })} /><ClayButton label="Delete" size="sm" variant="danger" onPress={() => setDeleteTarget({ ...EMPTY_DRAFT, kind: 'category', id: asText(item.id), name: asText(item.name) })} /></View>} />
              </View>
            ))}
          </AdminCard>
          <AdminCard>
            <Text style={[type.h3, { color: colors.ink }]}>Articles ({help.articles.length})</Text>
            {help.articles.length === 0 ? <Text style={[type.small, { color: colors.muted }]}>No articles yet.</Text> : null}
            {help.articles.map((item) => (
              <View key={asText(item.id)} style={{ borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 10, gap: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.smallMedium, { color: colors.ink }]}>{asText(item.title)}</Text>
                    <Text style={[type.tiny, { color: colors.muted }]}>{asText(item.slug)} · {asText(item.category_slug) || 'no category'} · updated {formatDateTime(asText(item.updated_at))}</Text>
                  </View>
                  <StatusBadge status={item.is_published ? 'published' : 'draft'} />
                </View>
                <Text style={[type.small, { color: colors.inkSoft }]} numberOfLines={2}>{truncate(asText(item.summary), 160)}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <ClayButton label="Edit" size="sm" variant="outline" onPress={() => openHelpDraft({ kind: 'article', id: asText(item.id), name: asText(item.title), slug: asText(item.slug), categorySlug: asText(item.category_slug), summary: asText(item.summary), published: Boolean(item.is_published) })} />
                  <ClayButton label="Delete" size="sm" variant="danger" onPress={() => setDeleteTarget({ ...EMPTY_DRAFT, kind: 'article', id: asText(item.id), name: asText(item.title) })} />
                </View>
              </View>
            ))}
          </AdminCard>
          <AdminCard>
            <Text style={[type.h3, { color: colors.ink }]}>FAQs ({help.faqs.length})</Text>
            {help.faqs.length === 0 ? <Text style={[type.small, { color: colors.muted }]}>No FAQs yet.</Text> : null}
            {help.faqs.map((item) => (
              <View key={asText(item.id)} style={{ borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 10, gap: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={[type.smallMedium, { color: colors.ink, flex: 1 }]}>{asText(item.question)}</Text>
                  <StatusBadge status={item.is_published ? 'published' : 'draft'} />
                </View>
                <Text style={[type.small, { color: colors.inkSoft }]} numberOfLines={2}>{truncate(asText(item.answer), 160)}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <ClayButton label="Edit" size="sm" variant="outline" onPress={() => openHelpDraft({ kind: 'faq', id: asText(item.id), question: asText(item.question), answer: asText(item.answer), categorySlug: asText(item.category_slug), published: Boolean(item.is_published) })} />
                  <ClayButton label="Delete" size="sm" variant="danger" onPress={() => setDeleteTarget({ ...EMPTY_DRAFT, kind: 'faq', id: asText(item.id), name: asText(item.question) })} />
                </View>
              </View>
            ))}
          </AdminCard>
        </>
          ) : null}
        </>
      ) : null}

      <ModalCard visible={Boolean(draft)} onClose={() => setDraft(null)} width={620}>
        {draft ? (
          <ScrollView style={{ maxHeight: '84%' }} showsVerticalScrollIndicator>
            <View style={{ gap: 14 }}>
              <Text style={[type.h3, { color: colors.ink }]}>{draft.id ? 'Edit' : 'New'} {draft.kind}</Text>
              <Select label="Content type" value={draft.kind} options={[{ label: 'Category', value: 'category' }, { label: 'Article', value: 'article' }, { label: 'FAQ', value: 'faq' }]} onValueChange={(value) => setDraft({ ...EMPTY_DRAFT, kind: value as HelpDraft['kind'] })} />
              {draft.kind === 'faq' ? (
                <>
                  <ClayInput label="Question" value={draft.question} onChangeText={(value) => setDraft({ ...draft, question: value })} />
                  <ClayInput label="Answer" value={draft.answer} onChangeText={(value) => setDraft({ ...draft, answer: value })} multiline />
                  <ClayInput label="Category slug" value={draft.categorySlug} onChangeText={(value) => setDraft({ ...draft, categorySlug: value })} placeholder="getting-started" />
                </>
              ) : (
                <>
                  <ClayInput label={draft.kind === 'article' ? 'Title' : 'Name'} value={draft.name} onChangeText={(value) => setDraft({ ...draft, name: value })} />
                  <ClayInput label="Slug" value={draft.slug} onChangeText={(value) => setDraft({ ...draft, slug: value })} placeholder="optional-url-slug" />
                  {draft.kind === 'category' ? (
                    <ClayInput label="Description" value={draft.description} onChangeText={(value) => setDraft({ ...draft, description: value })} multiline />
                  ) : (
                    <>
                      <ClayInput label="Summary" value={draft.summary} onChangeText={(value) => setDraft({ ...draft, summary: value })} multiline />
                      <Select label="Category" value={draft.categorySlug || null} options={[{ label: 'No category', value: '' }, ...help.categories.map((item) => ({ label: asText(item.name), value: asText(item.slug) }))]} onValueChange={(value) => setDraft({ ...draft, categorySlug: value })} />
                    </>
                  )}
                </>
              )}
              <Select label="Visibility" value={draft.published ? 'published' : 'draft'} options={[{ label: draft.kind === 'category' ? 'Active' : 'Published', value: 'published' }, { label: 'Hidden', value: 'draft' }]} onValueChange={(value) => setDraft({ ...draft, published: value === 'published' })} />
              <ClayButton label="Save content" icon="save" loading={savingHelp} onPress={() => void saveHelp()} />
            </View>
          </ScrollView>
        ) : null}
      </ModalCard>

      <Dialog
        visible={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.kind ?? 'content'}?`}
        message={`“${truncate(deleteTarget?.name, 100)}” will be removed from the help centre.`}
        confirmLabel="Delete"
        destructive
        loading={savingHelp}
        onConfirm={() => void confirmDeleteHelp()}
        onCancel={() => setDeleteTarget(null)}
      />
    </AdminPage>
  );
}

export function generateMetadata() {
  return adminPageMetadata("Platform Settings", "/admin/settings");
}
