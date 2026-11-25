import { adminPageMetadata } from '../../lib/seo';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Avatar, ClayButton, ClayInput, Checkbox, Dialog, ModalCard, SearchField, Select, useToast } from '../../components/ui';
import { useAdmin } from '../../components/admin/AdminProvider';
import { AdminCard, AdminPage, AdminRestricted, DataTable, KeyValue, LoadingCard, StatusBadge } from '../../components/admin/AdminUI';
import {
  ADMIN_ROLES,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  adminApi,
  formatDate,
  friendlyError,
  titleCase,
  type AdminAccount,
  type AdminPermission,
  type AdminRoleDefinition,
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
  const [roles, setRoles] = useState<AdminRoleDefinition[]>([]);
  const [customDraft, setCustomDraft] = useState<{
    key: string; label: string; description: string; permissions: AdminPermission[];
  } | null>(null);
  const [customSaving, setCustomSaving] = useState(false);
  const [deleteRole, setDeleteRole] = useState<AdminRoleDefinition | null>(null);

  const loadRoles = useCallback(async () => {
    try {
      const result = await adminApi.listRoles();
      setRoles(result.roles ?? []);
    } catch {
      // A project that has not run admin_rbac_v2.sql still gets the built-in matrix.
      setRoles([]);
    }
  }, []);

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
    const timer = setTimeout(() => {
      void load();
      void loadRoles();
    }, 0);
    return () => clearTimeout(timer);
  }, [load, loadRoles]);

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

  const saveCustomRole = async () => {
    if (!customDraft) return;
    setCustomSaving(true);
    try {
      await adminApi.upsertCustomRole(
        customDraft.key.trim().toLowerCase(),
        customDraft.label.trim(),
        customDraft.description.trim(),
        customDraft.permissions,
      );
      toast.show('Custom role saved.', 'success');
      setCustomDraft(null);
      void loadRoles();
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setCustomSaving(false);
    }
  };

  const removeCustomRole = async () => {
    if (!deleteRole) return;
    setCustomSaving(true);
    try {
      await adminApi.deleteCustomRole(deleteRole.key);
      toast.show('Custom role deleted.', 'success');
      setDeleteRole(null);
      void loadRoles();
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setCustomSaving(false);
    }
  };

  if (!can('admin.manage')) return <AdminRestricted permission="admin.manage" />;

  const customRoles = roles.filter((role) => !role.is_system);

  return (
    <AdminPage
      title="Roles & Permissions"
      subtitle="Assign staff roles from existing accounts. Roles are enforced by Postgres RPCs, never by the interface alone."
      actions={<ClayButton label="Add administrator" size="sm" icon="plus" onPress={() => { setSearch(''); setResults([]); setSelected(null); setNewRole('moderator'); setAddOpen(true); }} />}
    >
      <AdminCard>
        <Text style={[type.h3, { color: colors.ink }]}>Permission matrix</Text>
        <Text style={[type.small, { color: colors.muted }]}>
          Generated from the permission definitions and mirrors private.admin_permissions_for_role() in supabase/admin_rbac_v2.sql. The database is the source of truth.
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: 1120 }}>
          <View>
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 8 }}>
              <View style={{ width: 250 }}><Text style={[type.tiny, { color: colors.muted }]}>PERMISSION</Text></View>
              {ADMIN_ROLES.map((role) => (
                <View key={role} style={{ width: 118 }}><Text style={[type.tiny, { color: colors.muted }]} numberOfLines={1}>{ROLE_LABELS[role].toUpperCase()}</Text></View>
              ))}
            </View>
            {PERMISSION_GROUPS.map((group) => (
              <View key={group.module}>
                <View style={{ flexDirection: 'row', backgroundColor: colors.backgroundAlt, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                  <View style={{ flex: 1, paddingVertical: 7, paddingHorizontal: 8 }}>
                    <Text style={[type.tiny, { color: colors.accent, letterSpacing: 0.8 }]}>{group.module.toUpperCase()}</Text>
                  </View>
                </View>
                {group.permissions.map((permission) => (
                  <View key={permission} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 34, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                    <View style={{ width: 250, paddingRight: 10, paddingLeft: 8 }}>
                      <Text style={[type.small, { color: colors.inkSoft }]} numberOfLines={1}>{PERMISSION_LABELS[permission] ?? permission}</Text>
                    </View>
                    {ADMIN_ROLES.map((role) => (
                      <View key={role} style={{ width: 118 }}>
                        <StatusBadge status={ROLE_PERMISSIONS[role].includes(permission) ? 'verified' : 'none'} />
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </AdminCard>

      <AdminCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 220 }}>
            <Text style={[type.h3, { color: colors.ink }]}>Custom roles</Text>
            <Text style={[type.small, { color: colors.muted }]}>
              Layer extra permissions on top of a built-in role. Built-in roles cannot be edited or deleted.
            </Text>
          </View>
          <ClayButton
            label="Create role"
            size="sm"
            icon="plus"
            onPress={() => setCustomDraft({ key: '', label: '', description: '', permissions: [] })}
          />
        </View>
        {customRoles.length ? (
          <View style={{ gap: 8 }}>
            {customRoles.map((role) => (
              <View key={role.key} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 180 }}>
                    <Text style={[type.smallMedium, { color: colors.ink }]}>{role.label}</Text>
                    <Text style={[type.tiny, { color: colors.muted }]}>{role.key} · {role.assigned_count} assigned · {role.permissions.length} permissions</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <ClayButton
                      label="Edit"
                      size="sm"
                      variant="outline"
                      onPress={() => setCustomDraft({
                        key: role.key,
                        label: role.label,
                        description: role.description ?? '',
                        permissions: role.permissions,
                      })}
                    />
                    <ClayButton label="Delete" size="sm" variant="ghost" onPress={() => setDeleteRole(role)} />
                  </View>
                </View>
                <Text style={[type.small, { color: colors.muted }]} numberOfLines={2}>
                  {role.permissions.length ? role.permissions.join(' · ') : 'No extra permissions yet.'}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[type.small, { color: colors.muted }]}>
            No custom roles yet. Create one to tailor access without changing a built-in role.
          </Text>
        )}
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

      <ModalCard visible={customDraft !== null} onClose={() => setCustomDraft(null)} width={620}>
        {customDraft ? (
          <ScrollView style={{ maxHeight: '84%' }} showsVerticalScrollIndicator contentContainerStyle={{ gap: 12 }}>
            <Text style={[type.h3, { color: colors.ink }]}>Custom role</Text>
            <Text style={[type.small, { color: colors.muted }]}>
              Custom permissions are added on top of the built-in role. Built-in roles always remain enforceable.
            </Text>
            <ClayInput label="Key" value={customDraft.key} onChangeText={(value) => setCustomDraft({ ...customDraft, key: value })} placeholder="community_helper" autoCapitalize="none" />
            <ClayInput label="Name" value={customDraft.label} onChangeText={(value) => setCustomDraft({ ...customDraft, label: value })} placeholder="Community helper" />
            <ClayInput label="Description" value={customDraft.description} onChangeText={(value) => setCustomDraft({ ...customDraft, description: value })} placeholder="What this role is for" />
            <Text style={[type.tiny, { color: colors.muted }]}>PERMISSIONS</Text>
            {PERMISSION_GROUPS.map((group) => (
              <View key={group.module} style={{ gap: 2 }}>
                <Text style={[type.tiny, { color: colors.accent, letterSpacing: 0.8 }]}>{group.module.toUpperCase()}</Text>
                {group.permissions.map((permission) => (
                  <Checkbox
                    key={permission}
                    label={PERMISSION_LABELS[permission] ?? permission}
                    description={permission}
                    checked={customDraft.permissions.includes(permission)}
                    onToggle={() =>
                      setCustomDraft({
                        ...customDraft,
                        permissions: customDraft.permissions.includes(permission)
                          ? customDraft.permissions.filter((item) => item !== permission)
                          : [...customDraft.permissions, permission],
                      })
                    }
                  />
                ))}
              </View>
            ))}
            <ClayButton label="Save role" icon="save" loading={customSaving} onPress={() => void saveCustomRole()} />
          </ScrollView>
        ) : null}
      </ModalCard>

      <Dialog
        visible={deleteRole !== null}
        title="Delete custom role?"
        message={deleteRole ? `${deleteRole.label} can only be deleted when no administrator is assigned to it.` : ''}
        confirmLabel="Delete role"
        destructive
        loading={customSaving}
        onConfirm={() => void removeCustomRole()}
        onCancel={() => setDeleteRole(null)}
      />
    </AdminPage>
  );
}

export function generateMetadata() {
  return adminPageMetadata("Roles & Permissions", "/admin/roles");
}
