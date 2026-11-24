import { adminPageMetadata } from '../../lib/seo';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Avatar, ClayButton, Dialog, ModalCard, SearchField, Select, useToast } from '../../components/ui';
import { useAdmin } from '../../components/admin/AdminProvider';
import { AdminCard, AdminPage, AdminRestricted, DataTable, KeyValue, LoadingCard, StatusBadge } from '../../components/admin/AdminUI';
import {
  ADMIN_ROLES,
  PERMISSION_LABELS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  adminApi,
  formatDate,
  friendlyError,
  titleCase,
  type AdminAccount,
  type AdminPermission,
  type AdminUser,
} from '../../lib/admin';
import { useTheme } from '../../theme/theme';

type RoleAction = { mode: 'set' | 'remove'; account?: AdminAccount; user?: AdminUser; role: string };

export default function AdminRolesScreen() {
  const { can, access, refresh } = useAdmin();
  const toast = useToast();
  const { colors, type } = useTheme();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [newRole, setNewRole] = useState('content_moderator');
  const [pending, setPending] = useState<RoleAction | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.listAdmins();
      setAccounts(result.items ?? []);
    } catch (caught) {
      setError(friendlyError(caught));
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!addOpen) return;
    const timer = setTimeout(() => {
      if (!search.trim()) { setResults([]); return; }
      void adminApi.listUsers({ p_search: search.trim(), p_limit: 10, p_offset: 0 })
        .then((result) => setResults((result.items ?? []).filter((user) => !accounts.some((account) => account.user_id === user.id))))
        .catch(() => setResults([]));
    }, 350);
    return () => clearTimeout(timer);
  }, [accounts, addOpen, search]);

  const applyRole = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      await adminApi.mutateAdmin(pending.user?.id ?? pending.account?.user_id ?? '', pending.role, pending.mode === 'remove' ? 'remove' : 'upsert');
      toast.show(pending.mode === 'remove' ? 'Administrator role removed.' : 'Administrator role saved.', 'success');
      setPending(null);
      setAddOpen(false);
      setSelected(null);
      void load();
      if (pending.user?.id === access?.user_id) void refresh();
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!can('admin.manage')) return <AdminRestricted permission="admin.manage" />;

  const allPermissions = Array.from(new Set(ADMIN_ROLES.flatMap((role) => ROLE_PERMISSIONS[role])));

  return (
    <AdminPage
      title="Roles & Permissions"
      subtitle="Assign staff roles from existing accounts. Roles are enforced by Postgres RPCs, never by the interface alone."
      actions={<ClayButton label="Add administrator" size="sm" icon="plus" onPress={() => { setSearch(''); setResults([]); setSelected(null); setNewRole('content_moderator'); setAddOpen(true); }} />}
    >
      <AdminCard>
        <Text style={[type.h3, { color: colors.ink }]}>Permission matrix</Text>
        <Text style={[type.small, { color: colors.muted }]}>This matrix mirrors private.admin_permissions_for_role() in supabase/admin_schema.sql. The database is the source of truth.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: 840 }}>
          <View>
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 8 }}>
              <View style={{ width: 260 }}><Text style={[type.tiny, { color: colors.muted }]}>PERMISSION</Text></View>
              {ADMIN_ROLES.map((role) => (
                <View key={role} style={{ width: 145 }}><Text style={[type.tiny, { color: colors.muted }]}>{ROLE_LABELS[role].toUpperCase()}</Text></View>
              ))}
            </View>
            {allPermissions.map((permission) => (
              <View key={permission} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 34, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                <View style={{ width: 260, paddingRight: 10 }}><Text style={[type.small, { color: colors.inkSoft }]} numberOfLines={1}>{PERMISSION_LABELS[permission as AdminPermission] ?? permission}</Text></View>
                {ADMIN_ROLES.map((role) => (
                  <View key={role} style={{ width: 145 }}>
                    <StatusBadge status={ROLE_PERMISSIONS[role].includes(permission as AdminPermission) ? 'verified' : 'none'} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </AdminCard>

      {loading ? <LoadingCard label="Loading administrators" /> : null}
      {!loading && error ? <AdminCard><Text style={[type.body, { color: colors.danger }]}>{error}</Text></AdminCard> : null}
      {!loading && !error ? (
        <AdminCard>
          <DataTable
            columns={[
              {
                key: 'admin', label: 'Administrator', width: 240,
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
              { key: 'email', label: 'Email', width: 230, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]} numberOfLines={1}>{row.email ?? '—'}</Text> },
              { key: 'role', label: 'Role', width: 170, render: (row) => <StatusBadge status={row.role} /> },
              { key: 'active', label: 'Status', width: 120, render: (row) => <StatusBadge status={row.is_active ? 'active' : 'suspended'} /> },
              { key: 'by', label: 'Assigned by', width: 170, render: (row) => <Text style={[type.small, { color: colors.inkSoft }]}>{row.created_by_username ? `@${row.created_by_username}` : 'Bootstrap'}</Text> },
              { key: 'date', label: 'Assigned', width: 150, render: (row) => <Text style={[type.small, { color: colors.muted }]}>{formatDate(row.created_at)}</Text> },
              {
                key: 'actions', label: 'Actions', width: 210,
                render: (row) => (
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    <ClayButton label="Change" size="sm" variant="outline" onPress={() => setPending({ mode: 'set', account: row, role: row.role })} />
                    <ClayButton label="Remove" size="sm" variant="danger" onPress={() => setPending({ mode: 'remove', account: row, role: row.role })} />
                  </View>
                ),
              },
            ]}
            rows={accounts}
            rowKey={(row) => row.user_id}
            emptyTitle="No administrators assigned"
            emptyDescription="Add an existing account to grant staff access. There is no public admin sign-up."
          />
        </AdminCard>
      ) : null}

      <ModalCard visible={addOpen} onClose={() => setAddOpen(false)} width={620}>
        <ScrollView style={{ maxHeight: '84%' }} showsVerticalScrollIndicator>
          <View style={{ gap: 14 }}>
            <Text style={[type.h3, { color: colors.ink }]}>Add administrator</Text>
            <Text style={[type.small, { color: colors.muted }]}>Search an existing TachiReel account. Roles cannot be self-assigned.</Text>
            {selected ? (
              <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar uri={selected.avatar_url} name={selected.display_name} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.smallMedium, { color: colors.ink }]}>{selected.display_name}</Text>
                  <Text style={[type.tiny, { color: colors.muted }]}>@{selected.username} · {titleCase(selected.account_status)}</Text>
                </View>
                <ClayButton label="Change" size="sm" variant="outline" onPress={() => setSelected(null)} />
              </View>
            ) : (
              <>
                <SearchField value={search} onChangeText={setSearch} placeholder="Search accounts by name, username or email" compact />
                {results.map((user) => (
                  <View key={user.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 10 }}>
                    <Avatar uri={user.avatar_url} name={user.display_name} size={32} />
                    <View style={{ flex: 1 }}>
                      <Text style={[type.smallMedium, { color: colors.ink }]}>{user.display_name}</Text>
                      <Text style={[type.tiny, { color: colors.muted }]}>@{user.username} · {titleCase(user.account_status)}</Text>
                    </View>
                    <ClayButton label="Select" size="sm" variant="outline" onPress={() => { setSelected(user); setResults([]); }} />
                  </View>
                ))}
                {search.trim() && results.length === 0 ? <Text style={[type.small, { color: colors.muted }]}>No matching accounts.</Text> : null}
              </>
            )}
            <Select
              label="Role"
              value={newRole}
              options={ADMIN_ROLES.map((role) => ({ label: ROLE_LABELS[role], value: role }))}
              onValueChange={setNewRole}
            />
            <ClayButton label="Grant role" icon="shield" disabled={!selected} onPress={() => selected && setPending({ mode: 'set', user: selected, role: newRole })} />
          </View>
        </ScrollView>
      </ModalCard>

      <ModalCard visible={pending?.mode === 'set'} onClose={() => setPending(null)} width={520}>
        {pending ? (
          <View style={{ gap: 14 }}>
            <Text style={[type.h3, { color: colors.ink }]}>Change administrator role</Text>
            <KeyValue label="Account" value={`@${pending.account?.username ?? pending.user?.username ?? ''}`} />
            <Select label="New role" value={pending.role} options={ADMIN_ROLES.map((role) => ({ label: ROLE_LABELS[role], value: role }))} onValueChange={(next) => setPending({ ...pending, role: next })} />
            <Text style={[type.small, { color: colors.muted }]}>{PERMISSION_LABELS['admin.manage']} requires Super Admin. At least one active Super Admin must remain.</Text>
            <ClayButton label="Save role" icon="save" loading={saving} onPress={() => void applyRole()} />
          </View>
        ) : null}
      </ModalCard>

      <Dialog
        visible={pending?.mode === 'remove'}
        title="Remove administrator role?"
        message={pending ? `This removes staff access for @${pending.account?.username ?? ''}. They keep their regular TachiReel account.` : ''}
        confirmLabel="Remove role"
        destructive
        loading={saving}
        onConfirm={() => void applyRole()}
        onCancel={() => setPending(null)}
      />
    </AdminPage>
  );
}

export function generateMetadata() {
  return adminPageMetadata("Roles & Permissions", "/admin/roles");
}
