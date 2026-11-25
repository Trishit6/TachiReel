import { adminPageMetadata } from '../../lib/seo';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Avatar, Checkbox, ClayButton, Dialog, ModalCard, SearchField, Select, useToast } from '../../components/ui';
import type { SelectOption } from '../../components/ui';
import { useAdmin } from '../../components/admin/AdminProvider';
import {
  AdminCard,
  AdminPage,
  AdminRestricted,
  DataTable,
  FilterRow,
  LoadingCard,
  StatusBadge,
} from '../../components/admin/AdminUI';
import {
  ADMIN_ROLES,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  adminApi,
  formatDate,
  formatDateTime,
  friendlyError,
  titleCase,
  type AdminAccount,
  type AdminPermission,
  type AdminRoleDefinition,
  type AdminUser,
} from '../../lib/admin';
import { useTheme } from '../../theme/theme';

type Editor =
  | { mode: 'create' }
  | { mode: 'role'; account: AdminAccount }
  | null;

type Confirm =
  | { kind: 'deactivate'; account: AdminAccount }
  | { kind: 'activate'; account: AdminAccount }
  | { kind: 'remove'; account: AdminAccount }
  | null;

const ROLE_OPTIONS: SelectOption[] = ADMIN_ROLES.map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

export default function AdminAdministratorsScreen() {
  const { can, access } = useAdmin();
  const toast = useToast();
  const { colors, type } = useTheme();

  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const [editor, setEditor] = useState<Editor>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [saving, setSaving] = useState(false);

  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<AdminUser[]>([]);
  const [pickedUser, setPickedUser] = useState<AdminUser | null>(null);
  const [pickedRole, setPickedRole] = useState<string>('moderator');
  const [roleDefs, setRoleDefs] = useState<AdminRoleDefinition[]>([]);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [userSearchError, setUserSearchError] = useState<string | null>(null);
  const [accessTarget, setAccessTarget] = useState<AdminAccount | null>(null);
  const [accessDraft, setAccessDraft] = useState<{ customRole: string | null; extra: AdminPermission[] }>({
    customRole: null,
    extra: [],
  });
  const [accessSaving, setAccessSaving] = useState(false);

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
    const timer = setTimeout(() => {
      void adminApi.listRoles()
        .then((result) => { setRoleDefs(result.roles ?? []); setRoleError(null); })
        .catch((caught) => {
          const message = friendlyError(caught);
          setRoleError(message);
          setRoleDefs([]);
          toast.show(`Could not load roles: ${message}`, 'error');
        });
    }, 0);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (editor?.mode !== 'create' || !userSearch.trim()) {
        setUserResults([]);
        setUserSearchError(null);
        return;
      }
      void adminApi
        .listUsers({ p_search: userSearch.trim(), p_limit: 10, p_offset: 0 })
        .then((result) => {
          setUserResults(
            (result.items ?? []).filter((user) => !accounts.some((account) => account.user_id === user.id)),
          );
          setUserSearchError(null);
        })
        .catch((caught) => { setUserResults([]); setUserSearchError(friendlyError(caught)); });
    }, 350);
    return () => clearTimeout(timer);
  }, [accounts, editor, userSearch]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return accounts.filter((account) => {
      if (statusFilter === 'active' && !account.is_active) return false;
      if (statusFilter === 'inactive' && account.is_active) return false;
      if (roleFilter !== 'all' && account.role !== roleFilter) return false;
      if (!term) return true;
      return [account.display_name, account.username, account.email, account.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [accounts, roleFilter, search, statusFilter]);

  const openCreate = () => {
    setUserSearch('');
    setUserResults([]);
    setUserSearchError(null);
    setPickedUser(null);
    setPickedRole('moderator');
    setEditor({ mode: 'create' });
  };

  const openRole = (account: AdminAccount) => {
    setPickedRole(account.role);
    setEditor({ mode: 'role', account });
  };

  const saveRole = async () => {
    if (!editor) return;
    const userId = editor.mode === 'create' ? pickedUser?.id : editor.account.user_id;
    if (!userId) {
      toast.show('Choose an account first.', 'error');
      return;
    }
    if (pickedRole === 'super_admin' && !can('admin.manage')) {
      toast.show('Only a Super Admin can grant Super Admin access.', 'error');
      return;
    }
    if (editor.mode === 'role' && userId === access?.user_id) {
      toast.show('You cannot change your own role here.', 'error');
      return;
    }
    setSaving(true);
    try {
      await adminApi.mutateAdmin(userId, pickedRole, 'upsert');
      toast.show(editor.mode === 'create' ? 'Administrator created.' : 'Role updated.', 'success');
      setEditor(null);
      void load();
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setSaving(false);
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setSaving(true);
    try {
      if (confirm.kind === 'remove') {
        await adminApi.mutateAdmin(confirm.account.user_id, confirm.account.role, 'remove');
        toast.show('Administrator access removed.', 'success');
      } else if (confirm.kind === 'deactivate') {
        await adminApi.mutateAdmin(confirm.account.user_id, confirm.account.role, 'deactivate');
        toast.show('Administrator deactivated.', 'success');
      } else {
        await adminApi.mutateAdmin(confirm.account.user_id, confirm.account.role, 'activate');
        toast.show('Administrator reactivated.', 'success');
      }
      setConfirm(null);
      void load();
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetAccess = async (account: AdminAccount) => {
    if (!account.email) {
      toast.show('That account has no email address on file.', 'error');
      return;
    }
    toast.show('Ask the account owner to use “Forgot password” on the admin sign-in screen. Staff cannot set another person’s password.', 'info');
  };

  const openAccess = (account: AdminAccount) => {
    setAccessTarget(account);
    setAccessDraft({
      customRole: account.custom_role,
      extra: (account.extra_permissions ?? []) as AdminPermission[],
    });
  };

  const saveAccess = async () => {
    if (!accessTarget) return;
    setAccessSaving(true);
    try {
      await adminApi.setAdminAccess(accessTarget.user_id, accessDraft.customRole, accessDraft.extra);
      toast.show('Administrator permissions saved.', 'success');
      setAccessTarget(null);
      void load();
    } catch (caught) {
      toast.show(friendlyError(caught), 'error');
    } finally {
      setAccessSaving(false);
    }
  };

  if (!can('admins.view') && !can('admin.manage')) return <AdminRestricted permission="admins.view" />;

  const canCreateAdmin = can('admin.manage') || can('admins.create');
  const canEditAdmin = can('admin.manage') || can('admins.edit');
  const canDeactivateAdmin = can('admin.manage') || can('admins.deactivate');
  const canAssignPermissions = can('admin.manage') || can('permissions.assign');
  const assignableRoleOptions = ROLE_OPTIONS.filter((role) => role.value !== 'super_admin' || can('admin.manage'));
  const activeCount = accounts.filter((account) => account.is_active).length;
  const superCount = accounts.filter((account) => account.role === 'super_admin' && account.is_active).length;

  return (
    <AdminPage
      title="Administrators"
      subtitle="Grant staff access from existing accounts. Roles are stored and verified in Postgres; this page never creates its own login."
      actions={canCreateAdmin ? <ClayButton label="Add administrator" size="sm" icon="plus" onPress={openCreate} /> : undefined}
    >
      <AdminCard>
        <FilterRow>
          <View style={{ minWidth: 220, flex: 1 }}>
            <Text style={[type.tiny, { color: colors.muted, marginBottom: 6 }]}>Search</Text>
            <SearchField value={search} onChangeText={setSearch} placeholder="Name, username or email" />
          </View>
          <View style={{ minWidth: 170 }}>
            <Select
              label="Status"
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'active', label: 'Active only' },
                { value: 'inactive', label: 'Inactive only' },
              ]}
            />
          </View>
          <View style={{ minWidth: 190 }}>
            <Select
              label="Role"
              value={roleFilter}
              onValueChange={setRoleFilter}
              options={[{ value: 'all', label: 'All roles' }, ...ROLE_OPTIONS]}
            />
          </View>
        </FilterRow>
        <Text style={[type.small, { color: colors.muted }]}>
          {activeCount} active administrator{activeCount === 1 ? '' : 's'} · {superCount} active Super Admin{superCount === 1 ? '' : 's'} · the last active Super Admin cannot be removed or deactivated.
        </Text>
      </AdminCard>

      {loading ? <LoadingCard label="Loading administrators" /> : null}
      {!loading && error ? (
        <AdminCard>
          <Text style={[type.body, { color: colors.danger }]}>{error}</Text>
        </AdminCard>
      ) : null}

      {!loading && !error ? (
        <AdminCard>
          <DataTable
            columns={[
              {
                key: 'admin',
                label: 'Administrator',
                width: 250,
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
              {
                key: 'email',
                label: 'Email',
                width: 220,
                render: (row) => <Text style={[type.small, { color: colors.inkSoft }]} numberOfLines={1}>{row.email ?? '—'}</Text>,
              },
              {
                key: 'roles',
                label: 'Roles',
                width: 190,
                render: (row) => (
                  <View style={{ gap: 3 }}>
                    <StatusBadge status={row.role} />
                    {row.custom_role ? (
                      <Text style={[type.tiny, { color: colors.muted }]} numberOfLines={1}>+ {titleCase(row.custom_role)}</Text>
                    ) : null}
                    {row.is_protected ? <Text style={[type.tiny, { color: colors.muted }]}>Protected bootstrap account</Text> : null}
                  </View>
                ),
              },
              {
                key: 'status',
                label: 'Status',
                width: 110,
                render: (row) => <StatusBadge status={row.is_active ? 'active' : 'suspended'} />,
              },
              {
                key: 'login',
                label: 'Last login',
                width: 165,
                render: (row) => <Text style={[type.small, { color: colors.inkSoft }]}>{formatDateTime(row.last_sign_in_at)}</Text>,
              },
              {
                key: 'created',
                label: 'Added',
                width: 130,
                render: (row) => <Text style={[type.small, { color: colors.muted }]}>{formatDate(row.created_at)}</Text>,
              },
              {
                key: 'by',
                label: 'By',
                width: 130,
                render: (row) => <Text style={[type.small, { color: colors.muted }]} numberOfLines={1}>{row.created_by_username ? `@${row.created_by_username}` : 'Bootstrap'}</Text>,
              },
              {
                key: 'actions',
                label: 'Actions',
                width: 300,
                render: (row) => {
                  const self = row.user_id === access?.user_id;
                  const protectedAccount = Boolean(row.is_protected);
                  const lastActiveSuper = row.role === 'super_admin' && row.is_active && superCount <= 1;
                  const locked = self || protectedAccount;
                  return (
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      <ClayButton label="Access" size="sm" variant="outline" disabled={!canAssignPermissions || locked} onPress={() => openAccess(row)} />
                      <ClayButton label="Role" size="sm" variant="outline" disabled={!canEditAdmin || locked || lastActiveSuper} onPress={() => openRole(row)} />
                      {row.is_active ? (
                        <ClayButton label="Deactivate" size="sm" variant="danger" disabled={!canDeactivateAdmin || locked || lastActiveSuper} onPress={() => setConfirm({ kind: 'deactivate', account: row })} />
                      ) : (
                        <ClayButton label="Reactivate" size="sm" variant="soft" disabled={!canDeactivateAdmin || locked} onPress={() => setConfirm({ kind: 'activate', account: row })} />
                      )}
                      <ClayButton label="Remove" size="sm" variant="ghost" disabled={!canDeactivateAdmin || locked || (row.role === 'super_admin' && superCount <= 1)} onPress={() => setConfirm({ kind: 'remove', account: row })} />
                      <ClayButton label="Reset" size="sm" variant="ghost" onPress={() => void resetAccess(row)} />
                    </View>
                  );
                },
              },
            ]}
            rows={filtered}
            rowKey={(row) => row.user_id}
            emptyTitle="No administrators match"
            emptyDescription="Adjust the filters, or add an existing account to grant staff access."
          />
        </AdminCard>
      ) : null}

      <AdminCard>
        <Text style={[type.small, { color: colors.muted }]}>
          Need finer control? Open <Link href="/admin/roles" style={[type.small, { color: colors.accent }]}>Roles & Permissions</Link> to review the matrix and custom roles. Every change is recorded in the audit log.
        </Text>
      </AdminCard>

      <Dialog
        visible={editor !== null}
        title={editor?.mode === 'create' ? 'Add administrator' : 'Change administrator role'}
        message={
          editor?.mode === 'create'
            ? 'Choose an existing TachiReel account. Administrator accounts cannot be registered publicly.'
            : 'Only a Super Admin can grant or remove Super Admin access. The last active Super Admin is protected.'
        }
        confirmLabel={editor?.mode === 'create' ? 'Grant access' : 'Save role'}
        loading={saving}
        onCancel={() => setEditor(null)}
        onConfirm={() => void saveRole()}
      >
        {editor?.mode === 'create' ? (
          <View style={{ gap: 12 }}>
            <View>
              <Text style={[type.tiny, { color: colors.muted, marginBottom: 6 }]}>Find account</Text>
              <SearchField value={userSearch} onChangeText={setUserSearch} placeholder="Search by name, username or email" />
              {userSearchError ? <Text style={[type.small, { color: colors.danger, marginTop: 6 }]}>{userSearchError}</Text> : null}
            </View>
            {pickedUser ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10 }}>
                <Avatar uri={pickedUser.avatar_url} name={pickedUser.display_name} size={28} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.smallMedium, { color: colors.ink }]} numberOfLines={1}>{pickedUser.display_name}</Text>
                  <Text style={[type.tiny, { color: colors.muted }]} numberOfLines={1}>@{pickedUser.username}</Text>
                </View>
                <Pressable onPress={() => setPickedUser(null)} accessibilityLabel="Clear selected account">
                  <Feather name="x" size={15} color={colors.muted} />
                </Pressable>
              </View>
            ) : userResults.length ? (
              <View style={{ gap: 4, maxHeight: 190 }}>
                {userResults.map((user) => (
                  <Pressable
                    key={user.id}
                    onPress={() => {
                      setPickedUser(user);
                      setUserResults([]);
                      setUserSearch('');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${user.display_name}`}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 }}>
                      <Avatar uri={user.avatar_url} name={user.display_name} size={26} />
                      <Text style={[type.small, { color: colors.ink }]} numberOfLines={1}>{user.display_name}</Text>
                      <Text style={[type.tiny, { color: colors.muted }]} numberOfLines={1}>@{user.username}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : userSearch.trim() ? (
              <Text style={[type.small, { color: colors.muted }]}>No matching accounts.</Text>
            ) : null}
          </View>
        ) : null}

        <Select label="Role" value={pickedRole} onValueChange={setPickedRole} options={assignableRoleOptions} />
      </Dialog>

      <Dialog
        visible={confirm !== null}
        title={
          confirm?.kind === 'remove'
            ? 'Remove administrator access?'
            : confirm?.kind === 'deactivate'
              ? 'Deactivate administrator?'
              : 'Reactivate administrator?'
        }
        message={
          confirm?.kind === 'remove'
            ? `${confirm.account.display_name} will lose staff access. Their member account stays intact.`
            : confirm?.kind === 'deactivate'
              ? `${confirm.account.display_name} will be signed out of the admin workspace and blocked from returning until reactivated.`
              : `${confirm?.account.display_name ?? 'This administrator'} will be able to open the admin workspace again.`
        }
        confirmLabel={confirm?.kind === 'remove' ? 'Remove access' : confirm?.kind === 'deactivate' ? 'Deactivate' : 'Reactivate'}
        destructive={confirm?.kind !== 'activate'}
        loading={saving}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runConfirm()}
      />

      <ModalCard visible={accessTarget !== null} onClose={() => setAccessTarget(null)} width={620}>
        {accessTarget ? (
          <ScrollView style={{ maxHeight: '84%' }} showsVerticalScrollIndicator contentContainerStyle={{ gap: 12 }}>
            <Text style={[type.h3, { color: colors.ink }]}>Individual access</Text>
            <Text style={[type.small, { color: colors.muted }]}>
              Extra permissions are additive. A built-in role can never be replaced by hiding it here, and your own access cannot be changed.
            </Text>
            {roleError ? <Text style={[type.small, { color: colors.danger }]}>{roleError}</Text> : null}
            <Select
              label="Custom role layer"
              value={accessDraft.customRole ?? 'none'}
              onValueChange={(value) => setAccessDraft({ ...accessDraft, customRole: value === 'none' ? null : value })}
              options={[
                { value: 'none', label: 'No custom role' },
                ...roleDefs
                  .filter((role) => !role.is_system)
                  .map((role) => ({ value: role.key, label: role.label })),
              ]}
            />
            <Text style={[type.tiny, { color: colors.muted }]}>ADDITIONAL PERMISSIONS</Text>
            {PERMISSION_GROUPS.map((group) => (
              <View key={group.module} style={{ gap: 2 }}>
                <Text style={[type.tiny, { color: colors.accent, letterSpacing: 0.8 }]}>{group.module.toUpperCase()}</Text>
                {group.permissions.map((permission) => (
                  <Checkbox
                    key={permission}
                    label={PERMISSION_LABELS[permission] ?? permission}
                    description={permission}
                    checked={accessDraft.extra.includes(permission)}
                    onToggle={() =>
                      setAccessDraft({
                        ...accessDraft,
                        extra: accessDraft.extra.includes(permission)
                          ? accessDraft.extra.filter((item) => item !== permission)
                          : [...accessDraft.extra, permission],
                      })
                    }
                  />
                ))}
              </View>
            ))}
            <ClayButton label="Save permissions" icon="save" loading={accessSaving} onPress={() => void saveAccess()} />
          </ScrollView>
        ) : null}
      </ModalCard>
    </AdminPage>
  );
}

export function generateMetadata() {
  return adminPageMetadata('Administrators', '/admin/administrators');
}
