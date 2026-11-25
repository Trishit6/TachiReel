import { useMemo, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Href, usePathname, useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { Avatar, ConfirmDialog, Dropdown, IconButton, PressableScale, useToast, type IconName } from '../ui';
import { SemanticHeading } from '../SemanticHeading';
import { TachiReelLogo } from '../Brand';
import { useAdmin } from './AdminProvider';
import { useSession } from '../../lib/session';
import { ROLE_LABELS, type AdminPermission } from '../../lib/admin';
import { brand } from '../../theme/brand';
import { surfaceTransition, useTheme } from '../../theme/theme';

type AdminNavItem = {
  label: string;
  href: Href;
  icon: IconName;
  permission?: AdminPermission;
};

const SECTIONS: { title: string; items: AdminNavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/admin/dashboard', icon: 'grid' },
      { label: 'Platform Analytics', href: '/admin/analytics', icon: 'bar-chart-2', permission: 'analytics.view' },
    ],
  },
  {
    title: 'Community',
    items: [
      { label: 'User Management', href: '/admin/users', icon: 'users', permission: 'users.view' },
      { label: 'Posts Management', href: '/admin/posts', icon: 'image', permission: 'posts.view' },
      { label: 'Reelyx Management', href: '/admin/reelyx', icon: 'video', permission: 'reelyx.view' },
      { label: 'Comments Management', href: '/admin/comments', icon: 'message-circle', permission: 'comments.view' },
      { label: 'Reports & Moderation', href: '/admin/reports', icon: 'flag', permission: 'reports.view' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Support Tickets', href: '/admin/tickets', icon: 'life-buoy', permission: 'tickets.view' },
      { label: 'Notifications', href: '/admin/notifications', icon: 'bell', permission: 'notifications.view' },
      { label: 'Audit Logs', href: '/admin/audit', icon: 'list', permission: 'audit.view' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Administrators', href: '/admin/administrators', icon: 'user-check', permission: 'admin.manage' },
      { label: 'Roles & Permissions', href: '/admin/roles', icon: 'shield', permission: 'admin.manage' },
      { label: 'Platform Settings', href: '/admin/settings', icon: 'settings', permission: 'settings.manage' },
      { label: 'Admin Profile', href: '/admin/profile', icon: 'user' },
    ],
  },
];

function isActive(pathname: string, href: Href): boolean {
  const target = String(href);
  if (target === '/admin/dashboard') {
    return pathname === '/admin' || pathname === '/admin/' || pathname === target;
  }
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const { colors, radii, type, shadows, resolved, toggleTheme } = useTheme();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const { access, can } = useAdmin();
  const { profile, email, signOut } = useSession();
  const [drawer, setDrawer] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const desktop = width >= 1040;
  const showSidebar = width >= 780;

  const visibleSections = useMemo(
    () =>
      SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => !item.permission || can(item.permission)),
      })).filter((section) => section.items.length > 0),
    [can],
  );

  const current = useMemo(
    () => visibleSections.flatMap((section) => section.items).find((item) => isActive(pathname, item.href)),
    [pathname, visibleSections],
  );

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      toast.show('Could not sign out. Please try again.', 'error');
      setSigningOut(false);
    }
  };

  const navContent = (
    <View style={{ flex: 1 }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {visibleSections.map((section) => (
          <View key={section.title} style={{ marginBottom: 18 }}>
            <Text style={[type.tiny, { color: colors.muted, paddingHorizontal: 14, marginBottom: 8, letterSpacing: 1 }]}>
              {section.title.toUpperCase()}
            </Text>
            <View style={{ gap: 3 }}>
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <PressableScale
                    key={String(item.href)}
                    focusRingMode="keyboard"
                    onPress={() => {
                      setDrawer(false);
                      router.push(item.href);
                    }}
                    accessibilityLabel={item.label}
                  >
                    <View
                      style={{
                        minHeight: 44,
                        borderRadius: radii.control,
                        backgroundColor: active ? colors.accentSoft : 'transparent',
                        borderWidth: 1,
                        borderColor: 'transparent',
                        ...surfaceTransition(),
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingHorizontal: 13,
                      }}
                    >
                      <Feather name={item.icon} size={17} color={active ? brand.reelRed : colors.muted} />
                      <Text style={[type.smallMedium, { flex: 1, color: active ? colors.ink : colors.inkSoft }]}>{item.label}</Text>
                      {active ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: brand.reelRed }} /> : null}
                    </View>
                  </PressableScale>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.line, padding: 12 }}>
        <PressableScale focusRingMode="keyboard" onPress={() => setLogoutOpen(true)} accessibilityLabel="Log out">
          <View style={{ minHeight: 44, borderRadius: radii.control, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13 }}>
            <Feather name="log-out" size={17} color={colors.muted} />
            <Text style={[type.smallMedium, { color: colors.inkSoft }]}>Logout</Text>
          </View>
        </PressableScale>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
      {showSidebar ? (
        <View
          style={{
            width: desktop ? 258 : 228,
            borderRightWidth: 1,
            borderRightColor: colors.line,
            backgroundColor: colors.nav,
            paddingTop: 18,
          }}
        >
          <View style={{ paddingHorizontal: 18, paddingBottom: 20 }}>
            <TachiReelLogo size={40} variant={desktop ? 'full' : 'compact'} />
            <Text style={[type.tiny, { color: brand.reelRed, marginTop: 10, letterSpacing: 1.2 }]}>ADMIN WORKSPACE</Text>
          </View>
          {navContent}
        </View>
      ) : null}

      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            height: 70,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: width < 480 ? 14 : 22,
            backgroundColor: colors.nav,
            borderBottomWidth: 1,
            borderBottomColor: colors.line,
          }}
        >
          {!showSidebar ? (
            <IconButton icon="menu" label="Open admin navigation" variant="ghost" onPress={() => setDrawer(true)} />
          ) : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.overline, { color: colors.muted }]}>TachiReel Admin</Text>
            <SemanticHeading level={2} numberOfLines={1} style={[type.h3, { color: colors.ink }]}>
              {current?.label ?? 'Workspace'}
            </SemanticHeading>
          </View>
          <PressableScale
            focusRingMode="keyboard"
            onPress={() => router.push('/(tabs)/home')}
            accessibilityLabel="Back to TachiReel"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, height: 38, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line }}>
              <Feather name="arrow-left" size={14} color={colors.inkSoft} />
              {width >= 620 ? <Text style={[type.small, { color: colors.inkSoft }]}>Back to app</Text> : null}
            </View>
          </PressableScale>
          <IconButton icon={resolved === 'dark' ? 'sun' : 'moon'} label="Toggle appearance" variant="ghost" onPress={toggleTheme} />
          <Dropdown
            label="Administrator account"
            width={232}
            header={
              <View style={{ gap: 3 }}>
                <Text style={[type.smallMedium, { color: colors.ink }]}>{profile?.display_name ?? 'Administrator'}</Text>
                <Text style={[type.tiny, { color: colors.muted }]}>{access ? ROLE_LABELS[access.role] : 'Admin access'}</Text>
              </View>
            }
            items={[
              { key: 'profile', label: 'Admin profile', icon: 'user', onPress: () => router.push('/admin/profile') },
              { key: 'logout', label: 'Log out', icon: 'log-out', tone: 'danger', onPress: () => setLogoutOpen(true) },
            ]}
            trigger={
              <Avatar uri={profile?.avatar_url} name={profile?.display_name ?? email ?? 'Admin'} size={34} />
            }
          />
        </View>
        <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
      </View>

      {!showSidebar ? (
        <Modal visible={drawer} transparent animationType="fade" onRequestClose={() => setDrawer(false)}>
          <View style={{ flex: 1, backgroundColor: colors.overlay }}>
            <Pressable style={{ position: 'absolute', inset: 0 }} onPress={() => setDrawer(false)} accessibilityLabel="Close navigation" />
            <View style={{ width: Math.min(300, width - 56), height: '100%', backgroundColor: colors.nav, paddingTop: 20, ...shadows.lg }}>
              <View style={{ paddingHorizontal: 18, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <TachiReelLogo size={36} variant="compact" />
                <IconButton icon="x" label="Close navigation" variant="ghost" onPress={() => setDrawer(false)} />
              </View>
              {navContent}
            </View>
          </View>
        </Modal>
      ) : null}

      <ConfirmDialog
        visible={logoutOpen}
        title="Log out of admin?"
        message="You will return to the TachiReel sign-in screen."
        confirmLabel="Log out"
        loading={signingOut}
        onConfirm={() => void handleSignOut()}
        onCancel={() => setLogoutOpen(false)}
      />
    </View>
  );
}
