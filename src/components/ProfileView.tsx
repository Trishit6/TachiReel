import { useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Avatar, Badge, ClayButton, ClayCard, EmptyState, PressableScale } from './ui';
import type { FeedPost, FollowRequest } from '../lib/posts';
import { useTheme } from '../theme/theme';

export type ProfilePerson = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  is_minor?: boolean;
  account_status?: string;
};

type Tab = 'Posts' | 'Reels' | 'Saved' | 'Tagged';

export function ProfileView({
  profile,
  stats,
  posts,
  savedPosts = [],
  isOwn,
  isFollowing = false,
  onFollow,
  onMessage,
  onEdit,
  onShare,
  onSettings,
  onOpenPost,
  onCreate,
  followRequests = [],
  onRespondFollowRequest,
  loading = false,
}: {
  profile: ProfilePerson;
  stats: { posts: number; followers: number; following: number };
  posts: FeedPost[];
  savedPosts?: FeedPost[];
  isOwn: boolean;
  isFollowing?: boolean;
  onFollow?: () => void;
  onMessage?: () => void;
  onEdit?: () => void;
  onShare?: () => void;
  onSettings?: () => void;
  onOpenPost: (post: FeedPost) => void;
  onCreate?: () => void;
  followRequests?: FollowRequest[];
  onRespondFollowRequest?: (followerId: string, accept: boolean) => void;
  loading?: boolean;
}) {
  const { colors, type, radii } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [tab, setTab] = useState<Tab>('Posts');

  const videoPosts = posts.filter((post) => post.media_type === 'video');
  const shown = tab === 'Posts' ? posts : tab === 'Reels' ? videoPosts : tab === 'Saved' ? savedPosts : [];
  const tabs: Tab[] = isOwn ? ['Posts', 'Reels', 'Saved'] : ['Posts', 'Reels'];

  return (
    <View style={{ gap: 18 }}>
      <ClayCard style={{ padding: 0, overflow: 'hidden' }} radius={30} elevated="soft">
        <View style={{ height: compact ? 150 : 200, overflow: 'hidden' }}>
          <LinearGradient colors={[colors.accentSoft, colors.mintSoft, colors.peachSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
          <View style={{ position: 'absolute', width: 220, height: 220, borderRadius: 80, backgroundColor: colors.surface, opacity: 0.32, top: -80, right: -30, transform: [{ rotate: '18deg' }] }} />
          <View style={{ position: 'absolute', width: 150, height: 150, borderRadius: 52, backgroundColor: colors.accentSoft, opacity: 0.6, bottom: -64, left: 60, transform: [{ rotate: '-14deg' }] }} />
          <View style={{ position: 'absolute', width: 44, height: 44, borderRadius: 15, backgroundColor: colors.butter, top: 26, left: '44%', transform: [{ rotate: '10deg' }] }} />
          <View style={{ position: 'absolute', width: 20, height: 20, borderRadius: 7, backgroundColor: colors.accent, bottom: 30, right: '28%' }} />
          <View style={{ position: 'absolute', top: 14, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Badge label={profile.is_minor ? 'Private account' : 'TachiReel member'} tone={profile.is_minor ? 'butter' : 'sage'} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {onShare ? (
                <Pressable onPress={onShare} accessibilityLabel="Share profile" style={{ width: 36, height: 36, borderRadius: 13, backgroundColor: colors.glassSurface, borderWidth: 1, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="share-2" size={15} color={colors.ink} />
                </Pressable>
              ) : null}
              {onSettings ? (
                <Pressable onPress={onSettings} accessibilityLabel="Settings" style={{ width: 36, height: 36, borderRadius: 13, backgroundColor: colors.glassSurface, borderWidth: 1, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="settings" size={15} color={colors.ink} />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: compact ? 18 : 24, paddingBottom: 20 }}>
          <View style={{ flexDirection: compact ? 'column' : 'row', alignItems: compact ? 'flex-start' : 'flex-end', gap: 16, marginTop: -42 }}>
            <Avatar uri={profile.avatar_url} name={profile.display_name} size={compact ? 84 : 104} ring />
            <View style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
              <Text style={[type.h2, { color: colors.ink }]}>{profile.display_name}</Text>
              <Text style={[type.small, { color: colors.muted, marginTop: 2 }]}>@{profile.username}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', paddingBottom: 2 }}>
              {isOwn ? (
                <>
                  <ClayButton label="Edit profile" size="sm" variant="secondary" icon="edit-2" onPress={onEdit} />
                  <ClayButton label="Share" size="sm" variant="soft" icon="share-2" onPress={onShare} />
                </>
              ) : (
                <>
                  <ClayButton
                    label={isFollowing ? 'Following' : 'Follow'}
                    size="sm"
                    variant={isFollowing ? 'secondary' : 'primary'}
                    icon={isFollowing ? 'check' : 'user-plus'}
                    onPress={onFollow}
                  />
                  <ClayButton label="Message" size="sm" variant="secondary" icon="message-circle" onPress={onMessage} />
                  <ClayButton label="Share" size="sm" variant="soft" icon="share-2" onPress={onShare} />
                </>
              )}
            </View>
          </View>

          <Text style={[type.body, { color: colors.inkSoft, marginTop: 16, maxWidth: 560 }]}>
            {profile.bio || 'Still deciding what to say here. Probably something soft.'}
          </Text>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
            <Stat label="Posts" value={stats.posts} />
            <View style={{ width: 1, backgroundColor: colors.line }} />
            <Stat label="Followers" value={stats.followers} />
            <View style={{ width: 1, backgroundColor: colors.line }} />
            <Stat label="Following" value={stats.following} />
          </View>

          {profile.is_minor ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 16, backgroundColor: colors.butterSoft, borderRadius: radii.control, padding: 10 }}>
              <Feather name="shield" size={13} color={colors.inkSoft} />
              <Text style={[type.small, { color: colors.inkSoft, fontSize: 10, flex: 1 }]}>
                Teen account. Profile is private, sensitive content is off, and safety controls are always on.
              </Text>
            </View>
          ) : null}
        </View>
      </ClayCard>

      {isOwn && followRequests.length > 0 ? (
        <ClayCard style={{ padding: 16 }}>
          <Text style={[type.h3, { color: colors.ink, marginBottom: 4 }]}>Follow requests</Text>
          <Text style={[type.small, { color: colors.muted, marginBottom: 12 }]}>
            Review who can see your followers-only moments.
          </Text>
          <View style={{ gap: 10 }}>
            {followRequests.map((request) => (
              <View key={request.follower_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar uri={request.avatar_url} name={request.display_name} size={38} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.smallMedium, { color: colors.ink }]} numberOfLines={1}>{request.display_name}</Text>
                  <Text style={[type.tiny, { color: colors.muted }]} numberOfLines={1}>@{request.username}</Text>
                </View>
                <ClayButton
                  label="Accept"
                  size="sm"
                  icon="check"
                  onPress={() => onRespondFollowRequest?.(request.follower_id, true)}
                />
                <ClayButton
                  label="Decline"
                  size="sm"
                  variant="ghost"
                  icon="x"
                  onPress={() => onRespondFollowRequest?.(request.follower_id, false)}
                />
              </View>
            ))}
          </View>
        </ClayCard>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 2 }}>
        {tabs.map((item) => {
          const active = tab === item;
          return (
            <Pressable
              key={item}
              onPress={() => setTab(item)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={{ paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: active ? colors.accent : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Feather
                name={item === 'Posts' ? 'grid' : item === 'Reels' ? 'film' : 'bookmark'}
                size={14}
                color={active ? colors.accent : colors.muted}
              />
              <Text style={[type.smallMedium, { color: active ? colors.ink : colors.muted, fontSize: 11 }]}>{item}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {tab === 'Tagged' ? (
        <ClayCard style={{ padding: 8 }}>
          <EmptyState
            icon="tag"
            title="Tagging is not live yet."
            description="Photo tags need a post_tags table and notification support. Posts and Reels are fully live."
          />
        </ClayCard>
      ) : loading ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {Array.from({ length: 6 }).map((_, index) => (
            <View key={index} style={{ width: compact ? '32%' : '32.4%', aspectRatio: 1, borderRadius: 14, backgroundColor: colors.skeleton, opacity: 0.6 }} />
          ))}
        </View>
      ) : shown.length === 0 ? (
        <ClayCard style={{ padding: 8 }}>
          <EmptyState
            icon={tab === 'Saved' ? 'bookmark' : tab === 'Reels' ? 'film' : 'image'}
            title={tab === 'Saved' ? 'Nothing saved yet.' : tab === 'Reels' ? 'No reels yet.' : 'No moments here yet.'}
            description={
              tab === 'Saved'
                ? 'Tap the bookmark on a post and it will wait for you here.'
                : tab === 'Reels'
                  ? 'Short videos will appear here when they are shared.'
                  : isOwn
                    ? 'Share your first little moment.'
                    : 'This corner is still quiet.'
            }
            action={isOwn && tab === 'Posts' ? <ClayButton label="Create a post" size="sm" icon="plus" onPress={onCreate} /> : undefined}
          />
        </ClayCard>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {shown.map((post) => (
            <ProfileTile key={post.id} post={post} onPress={() => onOpenPost(post)} />
          ))}
        </View>
      )}

      <Text style={[type.small, { color: colors.mutedLight, fontSize: 9, textAlign: 'center' }]}>
        Your space, your pace. Only what you choose to share.
      </Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ paddingRight: 8 }}>
      <Text style={[type.h3, { color: colors.ink }]}>{value.toLocaleString()}</Text>
      <Text style={[type.tiny, { color: colors.muted, fontSize: 8, marginTop: 1 }]}>{label}</Text>
    </View>
  );
}

function ProfileTile({ post, onPress }: { post: FeedPost; onPress: () => void }) {
  const { colors } = useTheme();
  const image = post.media_type === 'video' ? post.poster_url : post.media_url ?? post.poster_url;
  return (
    <PressableScale onPress={onPress} accessibilityLabel="Open post" style={{ width: '32.4%' }}>
      <View style={{ aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surfaceDeep, borderWidth: 1, borderColor: colors.highlight }}>
        {image ? (
          <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={220} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name={post.media_type === 'video' ? 'video' : 'image'} size={20} color={colors.muted} />
          </View>
        )}
        {post.media_type === 'video' ? (
          <View style={{ position: 'absolute', top: 7, right: 7, backgroundColor: 'rgba(20,18,24,0.58)', borderRadius: 7, padding: 4 }}>
            <Feather name="play" size={10} color={colors.white} />
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}
