import { useEffect, useState, type PropsWithChildren } from 'react';
import { Animated, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { usePathname, useRouter, useSegments, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TachiReelMark, TachiReelWordmark } from './Brand';
import {
  Avatar,
  Badge,
  Dropdown,
  IconButton,
  PressableScale,
  SearchField,
  Tooltip,
  useToast,
  type IconName,
} from './ui';
import { getSearchSuggestions, type SearchSuggestion } from '../lib/search';
import { readPreference, readPreferenceSync, writePreference } from '../lib/storage';
import { useSession } from '../lib/session';
import { useTheme } from '../theme/theme';

type NavItem = { label: string; icon: IconName; href: Href };

const NAV: NavItem[] = [
  { label: 'Home', icon: 'home', href: '/(tabs)' },
  { label: 'Explore', icon: 'compass', href: '/(tabs)/discover' },
  { label: 'Reelyx', icon: 'film', href: '/(tabs)/reelyx' },
  { label: 'Create', icon: 'plus-circle', href: '/(tabs)/create' },
  { label: 'Inbox', icon: 'message-circle', href: '/(tabs)/inbox' },
  { label: 'Notifications', icon: 'bell', href: '/(tabs)/notifications' },
  { label: 'Help & Support', icon: 'help-circle', href: '/(tabs)/support' },
  { label: 'Profile', icon: 'user', href: '/(tabs)/profile' },
  { label: 'Settings', icon: 'settings', href: '/(tabs)/settings' },
];

const MOBILE_NAV: NavItem[] = [
  { label: 'Home', icon: 'home', href: '/(tabs)' },
  { label: 'Explore', icon: 'compass', href: '/(tabs)/discover' },
  { label: 'Create', icon: 'plus', href: '/(tabs)/create' },
  { label: 'Reelyx', icon: 'film', href: '/(tabs)/reelyx' },
  { label: 'Inbox', icon: 'message-circle', href: '/(tabs)/inbox' },
  { label: 'Profile', icon: 'user', href: '/(tabs)/profile' },
];

const SIDEBAR_KEY = 'tachireel.sidebar.collapsed';

function useActiveRoute() {
  const pathname = usePathname();
  const segments = useSegments();
  return (href: Href): boolean => {
    if (href === '/(tabs)') return pathname === '/' && (segments as string[]).includes('(tabs)');
    const path = String(href).replace('/(tabs)', '');
    return pathname === path || pathname.startsWith(`${path}/`);
  };
}

function useSidebarPreference(autoCollapsed: boolean) {
  const [preference, setPreference] = useState<boolean | null>(() => {
    const saved = readPreferenceSync(SIDEBAR_KEY);
    if (saved === 'true' || saved === 'false') return saved === 'true';
    return null;
  });

  useEffect(() => {
    let active = true;
    void readPreference(SIDEBAR_KEY).then((saved) => {
      if (!active || (saved !== 'true' && saved !== 'false')) return;
      setPreference(saved === 'true');
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const collapsed = preference ?? autoCollapsed;
  const setCollapsed = (next: boolean) => {
    setPreference(next);
    void writePreference(SIDEBAR_KEY, String(next));
  };
  return { collapsed, setCollapsed };
}

export function AppShell({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const pathname = usePathname();
  const compact = width < 820;
  const { collapsed, setCollapsed } = useSidebarPreference(width < 1140);
  const immersive = compact && pathname.startsWith('/reelyx');

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
      {!compact ? <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {!immersive ? <TopNav compact={compact} /> : null}
        <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
        {compact && !immersive ? <MobileNav /> : null}
      </View>
    </View>
  );
}

function Sidebar({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const { colors, radii, type, reduceMotion } = useTheme();
  const { profile, email, isDemo, signOut } = useSession();
  const isActive = useActiveRoute();
  const router = useRouter();
  const name = profile?.display_name ?? 'Your account';
  const handle = profile?.username ? `@${profile.username}` : email ?? '';
  const [widthValue] = useState(() => new Animated.Value(collapsed ? 84 : 252));

  useEffect(() => {
    Animated.timing(widthValue, {
      toValue: collapsed ? 84 : 252,
      duration: reduceMotion ? 0 : 220,
      useNativeDriver: false,
    }).start();
  }, [collapsed, reduceMotion, widthValue]);

  const toggle = (
    <PressableScale
      onPress={onToggleCollapse}
      accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      style={{ width: 34, height: 34 }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundAlt, borderWidth: 1, borderColor: colors.line }}>
        <Feather name={collapsed ? 'chevron-right' : 'chevron-left'} size={16} color={colors.inkSoft} />
      </View>
    </PressableScale>
  );

  return (
    <Animated.View
      style={{
        width: widthValue,
        backgroundColor: colors.nav,
        borderRightWidth: 1,
        borderRightColor: colors.line,
        paddingHorizontal: collapsed ? 12 : 18,
        paddingTop: 22,
        paddingBottom: 18,
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}
    >
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 42, paddingHorizontal: collapsed ? 0 : 2, marginBottom: 22 }}>
          <TachiReelMark size={38} />
          {!collapsed ? (
            <>
              <View style={{ flex: 1 }}>
                <TachiReelWordmark size={25} />
              </View>
              {toggle}
            </>
          ) : null}
        </View>

        {collapsed ? (
          <View style={{ alignItems: 'center', marginBottom: 18 }}>
            <Tooltip label="Expand sidebar" side="right">{toggle}</Tooltip>
          </View>
        ) : null}

        {isDemo && !collapsed ? (
          <View style={{ marginBottom: 14, paddingHorizontal: 4 }}>
            <Badge label="Preview mode" tone="butter" />
          </View>
        ) : null}

        <View style={{ gap: 5 }}>
          {NAV.map((item) => {
            const active = isActive(item.href);
            const row = (
              <PressableScale
                key={item.label}
                accessibilityLabel={item.label}
                accessibilityRole="tab"
                focusRingMode="keyboard"
                onPress={() => router.push(item.href)}
                style={{ alignSelf: 'stretch' }}
              >
                <View
                  style={{
                    height: 46,
                    borderRadius: radii.control,
                    paddingHorizontal: collapsed ? 0 : 13,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    alignItems: 'center',
                    flexDirection: 'row',
                    gap: 12,
                    backgroundColor: active ? colors.navActive : 'transparent',
                  }}
                >
                  <Feather name={item.icon} size={19} color={active ? colors.accent : colors.muted} />
                  {!collapsed ? (
                    <Text
                      numberOfLines={1}
                      style={[type.bodyMedium, { color: active ? colors.ink : colors.inkSoft, flex: 1, fontWeight: active ? '600' : '500' }]}
                    >
                      {item.label}
                    </Text>
                  ) : null}
                  {!collapsed && active ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }} /> : null}
                </View>
              </PressableScale>
            );
            return collapsed ? <Tooltip key={`tip-${item.label}`} label={item.label} side="right">{row}</Tooltip> : row;
          })}
        </View>

        {!collapsed ? (
          <Pressable
            onPress={() => router.push('/(tabs)/create')}
            accessibilityRole="button"
            accessibilityLabel="Create a post"
            style={({ pressed }) => ({
              marginTop: 20,
              borderRadius: radii.control,
              backgroundColor: pressed ? colors.accentSoft : colors.accentSoft,
              borderWidth: 1,
              borderColor: colors.line,
              padding: 13,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            })}
          >
            <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="feather" size={15} color={colors.accentContrast} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.smallMedium, { color: colors.ink }]}>Share a moment</Text>
              <Text style={[type.small, { color: colors.muted, fontSize: 10 }]}>Photo, video or thought</Text>
            </View>
          </Pressable>
        ) : null}
      </View>

      <View style={{ gap: 10 }}>
        <Dropdown
          label="Account options"
          align="left"
          width={collapsed ? 240 : 232}
          trigger={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: collapsed ? 3 : 7, borderRadius: radii.input, backgroundColor: colors.backgroundAlt, borderWidth: 1, borderColor: colors.line }}>
              <Avatar uri={profile?.avatar_url} name={name} size={collapsed ? 34 : 36} />
              {!collapsed ? (
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[type.smallMedium, { color: colors.ink }]}>{name}</Text>
                  <Text numberOfLines={1} style={[type.small, { color: colors.muted, fontSize: 10 }]}>{handle}</Text>
                </View>
              ) : null}
              {!collapsed ? <Feather name="chevron-up" size={13} color={colors.muted} /> : null}
            </View>
          }
          header={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Avatar uri={profile?.avatar_url} name={name} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[type.smallMedium, { color: colors.ink }]}>{name}</Text>
                <Text numberOfLines={1} style={[type.small, { color: colors.muted, fontSize: 10 }]}>{email ?? handle}</Text>
              </View>
            </View>
          }
          items={[
            { key: 'profile', label: 'View profile', icon: 'user', onPress: () => router.push('/(tabs)/profile') },
            { key: 'saved', label: 'Saved posts', icon: 'bookmark', onPress: () => router.push('/(tabs)/profile') },
            { key: 'support', label: 'Help & Support', icon: 'help-circle', onPress: () => router.push('/(tabs)/support') },
            { key: 'settings', label: 'Settings', icon: 'settings', onPress: () => router.push('/(tabs)/settings') },
          ]}
        />
        <Pressable
          onPress={() => void signOut()}
          accessibilityLabel="Log out"
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 10,
            paddingVertical: 9,
            paddingHorizontal: collapsed ? 0 : 10,
            borderRadius: radii.control,
            backgroundColor: pressed ? colors.backgroundAlt : 'transparent',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Feather name="log-out" size={16} color={colors.muted} />
          {!collapsed ? <Text style={[type.smallMedium, { color: colors.muted }]}>Log out</Text> : null}
        </Pressable>
        {!collapsed ? (
          <Text style={[type.small, { color: colors.mutedLight, fontSize: 9, paddingHorizontal: 10, lineHeight: 13 }]}>A softer corner of the internet.</Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

const SEARCH_ICONS: Record<SearchSuggestion['group'], IconName> = {
  People: 'user',
  Posts: 'image',
  Hashtags: 'hash',
  Places: 'map-pin',
};

function TopNav({ compact }: { compact: boolean }) {
  const { colors, radii, type, resolved, toggleTheme } = useTheme();
  const { profile, email, signOut } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { show } = useToast();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const name = profile?.display_name ?? 'Your account';

  useEffect(() => {
    let active = true;
    const value = query.trim();
    if (!value) return () => { active = false; };
    const timer = setTimeout(() => {
      if (!active) return;
      setSearching(true);
      void getSearchSuggestions(value)
        .then((results) => {
          if (!active) return;
          setSuggestions(results);
          setHighlight(-1);
        })
        .catch(() => {
          if (active) setSuggestions([]);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 220);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const submitSearch = (value = query) => {
    const clean = value.trim();
    setSuggestionsOpen(false);
    setMobileSearchOpen(false);
    router.push(clean ? { pathname: '/(tabs)/discover', params: { q: clean } } : '/(tabs)/discover');
  };

  const openSuggestion = (item: SearchSuggestion) => {
    setSuggestionsOpen(false);
    setMobileSearchOpen(false);
    setQuery(item.label);
    if (item.group === 'People' && item.username) {
      router.push({ pathname: '/(tabs)/user/[username]', params: { username: item.username } });
    } else if (item.group === 'Posts' && item.postId) {
      router.push({ pathname: '/(tabs)/post/[postId]', params: { postId: item.postId } });
    } else {
      submitSearch(item.query ?? item.label);
    }
  };

  const onSearchKeys = (event: any) => {
    if (event.nativeEvent?.key === 'Escape' || event.key === 'Escape') {
      setSuggestionsOpen(false);
      return;
    }
    const key = event.nativeEvent?.key ?? event.key;
    if (key === 'ArrowDown') {
      event.preventDefault?.();
      setSuggestionsOpen(true);
      setHighlight((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (key === 'ArrowUp') {
      event.preventDefault?.();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (key === 'Enter') {
      if (suggestionsOpen && highlight >= 0 && suggestions[highlight]) openSuggestion(suggestions[highlight]);
      else submitSearch();
    }
  };

  const suggestionsView = suggestionsOpen && query.trim().length > 0 ? (
    <View
      style={[
        { position: 'absolute', top: compact ? 50 : 54, left: 0, right: 0, maxHeight: 360, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, padding: 6, zIndex: 45 },
      ]}
    >
      {searching && suggestions.length === 0 ? (
        <Text style={[type.small, { color: colors.muted, padding: 12 }]}>Looking for moments…</Text>
      ) : suggestions.length === 0 ? (
        <Text style={[type.small, { color: colors.muted, padding: 12 }]}>No matches yet. Press Enter to search everything.</Text>
      ) : (
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
          {suggestions.map((item, index) => (
            <Pressable
              key={item.id}
              onPress={() => openSuggestion(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.group}: ${item.label}`}
              style={({ pressed, hovered }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 8,
                paddingHorizontal: 9,
                borderRadius: radii.control,
                backgroundColor: index === highlight || hovered || pressed ? colors.backgroundAlt : 'transparent',
              })}
            >
              {item.group === 'People' && item.image ? (
                <Avatar uri={item.image} name={item.label} size={30} />
              ) : (
                <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={SEARCH_ICONS[item.group]} size={14} color={colors.accent} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[type.smallMedium, { color: colors.ink }]}>{item.label}</Text>
                <Text numberOfLines={1} style={[type.tiny, { color: colors.muted, fontSize: 9 }]}>{item.group}{item.detail ? ` · ${item.detail}` : ''}</Text>
              </View>
              <Feather name="arrow-up-left" size={13} color={colors.mutedLight} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  ) : null;

  const searchField = (
    <View style={{ position: 'relative', flex: 1, maxWidth: compact ? undefined : 460 }}>
      <SearchField
        value={query}
        onChangeText={(value) => {
          setQuery(value);
          setSuggestionsOpen(true);
          if (!value.trim()) {
            setSuggestions([]);
            setSearching(false);
            setHighlight(-1);
          }
        }}
        onSubmit={() => submitSearch()}
        onFocus={() => setSuggestionsOpen(true)}
        onBlur={() => {
          setTimeout(() => setSuggestionsOpen(false), 120);
        }}
        onKeyDown={onSearchKeys}
        placeholder="Search people, captions, places"
      />
      {suggestionsView}
    </View>
  );

  return (
    <View
      style={{
        paddingTop: compact ? insets.top : 0,
        backgroundColor: colors.nav,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        zIndex: 30,
      }}
    >
      <View
        style={{
          minHeight: compact ? 62 : 76,
          paddingHorizontal: compact ? 16 : 24,
          paddingVertical: compact ? 6 : 0,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {compact ? (
          <Pressable onPress={() => router.push('/(tabs)')} accessibilityLabel="TachiReel home" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TachiReelMark size={32} />
            <TachiReelWordmark size={21} />
          </Pressable>
        ) : searchField}

        <View style={{ flex: 1 }} />

        {compact ? (
          <IconButton
            icon={mobileSearchOpen ? 'x' : 'search'}
            label={mobileSearchOpen ? 'Close search' : 'Search'}
            variant="ghost"
            size={38}
            onPress={() => setMobileSearchOpen((current) => !current)}
          />
        ) : null}

        <IconButton
          icon={resolved === 'dark' ? 'sun' : 'moon'}
          label="Toggle theme"
          variant="ghost"
          size={38}
          onPress={() => {
            toggleTheme();
            show(`${resolved === 'dark' ? 'Light' : 'Dark'} appearance`, 'info');
          }}
        />
        <View>
          <IconButton icon="bell" label="Notifications" variant="ghost" size={38} onPress={() => router.push('/(tabs)/notifications')} />
          {profile?.account_status === 'active' ? (
            <View style={{ position: 'absolute', top: 8, right: 9, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.peach, borderWidth: 1, borderColor: colors.surface }} />
          ) : null}
        </View>
        <Dropdown
          label="Account menu"
          align="right"
          width={236}
          trigger={<Avatar uri={profile?.avatar_url} name={name} size={36} />}
          header={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Avatar uri={profile?.avatar_url} name={name} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[type.smallMedium, { color: colors.ink }]}>{name}</Text>
                <Text numberOfLines={1} style={[type.small, { color: colors.muted, fontSize: 10 }]}>{profile?.username ? `@${profile.username}` : email}</Text>
              </View>
            </View>
          }
          items={[
            { key: 'profile', label: 'View profile', icon: 'user', onPress: () => router.push('/(tabs)/profile') },
            { key: 'saved', label: 'Saved posts', icon: 'bookmark', onPress: () => router.push('/(tabs)/profile') },
            { key: 'support', label: 'Help & Support', icon: 'help-circle', onPress: () => router.push('/(tabs)/support') },
            { key: 'settings', label: 'Settings', icon: 'settings', onPress: () => router.push('/(tabs)/settings') },
            { key: 'appearance', label: resolved === 'dark' ? 'Light appearance' : 'Dark appearance', icon: resolved === 'dark' ? 'sun' : 'moon', onPress: toggleTheme },
            { key: 'logout', label: 'Log out', icon: 'log-out', tone: 'muted', onPress: () => void signOut() },
          ]}
        />
      </View>
      {compact && mobileSearchOpen ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>{searchField}</View>
      ) : null}
    </View>
  );
}

function MobileNav() {
  const { colors, type, radii, shadows, reduceMotion } = useTheme();
  const router = useRouter();
  const isActive = useActiveRoute();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-around',
        paddingTop: 7,
        paddingBottom: Math.max(insets.bottom, 8),
        backgroundColor: colors.nav,
        borderTopWidth: 1,
        borderTopColor: colors.line,
      }}
    >
      {MOBILE_NAV.map((item) => {
        const active = isActive(item.href);
        const isCreate = item.label === 'Create';
        if (isCreate) {
          return (
            <Pressable
              key={item.label}
              onPress={() => router.push(item.href)}
              accessibilityLabel={item.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={{ alignItems: 'center', width: 56, marginTop: -20 }}
            >
              <View
                style={[
                  shadows.soft,
                  {
                    width: 48,
                    height: 48,
                    borderRadius: 16,
                    backgroundColor: colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 3,
                    borderColor: colors.nav,
                  },
                ]}
              >
                <Feather name="plus" size={22} color={colors.accentContrast} />
              </View>
              <Text style={[type.tiny, { fontSize: 9, color: colors.muted, marginTop: 3 }]}>{item.label}</Text>
            </Pressable>
          );
        }
        return (
          <Pressable
            key={item.label}
            onPress={() => router.push(item.href)}
            accessibilityLabel={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{ alignItems: 'center', width: 52, minHeight: 48, justifyContent: 'center', borderRadius: radii.control }}
          >
            <Feather name={item.icon} size={19} color={active ? colors.accent : colors.muted} />
            <Text style={[type.tiny, { fontSize: 9, color: active ? colors.accent : colors.muted, marginTop: 4 }]}>{item.label}</Text>
            <View style={{ width: 18, height: 3, borderRadius: 2, marginTop: 3, backgroundColor: active ? colors.accent : 'transparent', opacity: reduceMotion ? 1 : 1 }} />
          </Pressable>
        );
      })}
    </View>
  );
}
