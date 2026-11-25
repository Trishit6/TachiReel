import { adminPageMetadata } from '../../lib/seo';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { ClayButton, ClayInput, Checkbox, Dialog, ModalCard, useToast } from '../../components/ui';
import { useAdmin } from '../../components/admin/AdminProvider';
import { AdminCard, AdminPage, AdminRestricted, LoadingCard } from '../../components/admin/AdminUI';
import {
  ADMIN_ROLES,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  adminApi,
  friendlyError,
  titleCase,
  type AdminPermission,
  type AdminRoleDefinition,
} from '../../lib/admin';
import { useTheme } from '../../theme/theme';

type CustomDraft = {
  key: string;
  label: string;
  description: string;
  permissions: AdminPermission[];
};

export default function AdminRolesScreen() {
  const { can } = useAdmin();
  const toast = useToast();
  const { colors, type } = useTheme();
  const [roles, setRoles] = useState<AdminRoleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customDraft, setCustomDraft] = useState<CustomDraft | null>(null);
  const [customSaving, setCustomSaving] = useState(false);
  const [deleteRole, setDeleteRole] = useState<AdminRoleDefinition | null>(null);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.listRoles();
      setRoles(result.roles ?? []);
    } catch (caught) {
      const message = friendlyError(caught);
      setError(message);
      setRoles([]);
      toast.show(`Could not load roles: ${message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const timer = setTimeout(() => void loadRoles(), 0);
    return () => clearTimeout(timer);
  }, [loadRoles]);

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

  if (!can('roles.view') && !can('admin.manage')) return <AdminRestricted permission="roles.view" />;

  const canCreateRole = can('admin.manage') || can('roles.create');
  const canEditRole = can('admin.manage') || can('roles.edit');
  const canDeleteRole = can('admin.manage') || can('roles.delete');
  const customRoles = roles.filter((role) => !role.is_system);

  return (
    <AdminPage
      title="Roles & Permissions"
      subtitle="Review the built-in permission matrix and manage additive custom roles. The database is the source of truth."
      actions={
        <Link href="/admin/administrators" style={[type.small, { color: colors.accent }]}>
          Manage administrators
        </Link>
      }
    >
      <AdminCard>
        <Text style={[type.h3, { color: colors.ink }]}>Permission matrix</Text>
        <Text style={[type.small, { color: colors.muted }]}>
          Mirrors private.admin_permissions_for_role() in supabase/admin_rbac_v2.sql. Every admin RPC rechecks these permissions in Postgres.
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
                        <Text style={[type.small, { color: ROLE_PERMISSIONS[role].includes(permission) ? colors.accent : colors.muted }]}>
                          {ROLE_PERMISSIONS[role].includes(permission) ? 'Allowed' : '—'}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </AdminCard>

      {loading ? <LoadingCard label="Loading roles" /> : null}
      {!loading && error ? <AdminCard><Text style={[type.body, { color: colors.danger }]}>{error}</Text></AdminCard> : null}

      {!loading && !error ? (
        <AdminCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 220 }}>
              <Text style={[type.h3, { color: colors.ink }]}>Custom roles</Text>
              <Text style={[type.small, { color: colors.muted }]}>
                Additive permission layers. Built-in roles cannot be edited or deleted, and protected permissions stay Super Admin only.
              </Text>
            </View>
            {canCreateRole ? (
              <ClayButton label="Create role" size="sm" icon="plus" onPress={() => setCustomDraft({ key: '', label: '', description: '', permissions: [] })} />
            ) : null}
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
                      {canEditRole ? (
                        <ClayButton label="Edit" size="sm" variant="outline" onPress={() => setCustomDraft({ key: role.key, label: role.label, description: role.description ?? '', permissions: role.permissions })} />
                      ) : null}
                      {canDeleteRole ? (
                        <ClayButton label="Delete" size="sm" variant="ghost" onPress={() => setDeleteRole(role)} />
                      ) : null}
                    </View>
                  </View>
                  <Text style={[type.small, { color: colors.muted }]} numberOfLines={2}>
                    {role.permissions.length ? role.permissions.map((permission) => PERMISSION_LABELS[permission] ?? titleCase(permission)).join(' · ') : 'No extra permissions yet.'}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[type.small, { color: colors.muted }]}>No custom roles yet.</Text>
          )}
        </AdminCard>
      ) : null}

      <ModalCard visible={customDraft !== null} onClose={() => setCustomDraft(null)} width={620}>
        {customDraft ? (
          <ScrollView style={{ maxHeight: '84%' }} showsVerticalScrollIndicator contentContainerStyle={{ gap: 12 }}>
            <Text style={[type.h3, { color: colors.ink }]}>Custom role</Text>
            <Text style={[type.small, { color: colors.muted }]}>
              Permissions are added on top of a built-in role. Super Admin-only permissions cannot be delegated.
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
  return adminPageMetadata('Roles & Permissions', '/admin/roles');
}
