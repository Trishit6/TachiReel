import { useState } from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { ClayCard } from './ClayCard';
import { Avatar, ClayButton, ClayInput, Chip, Dialog, Notice, PressableScale, type IconName } from './ui';
import { formatRelativeTime } from '../lib/format';
import { postLink, shareLink } from '../lib/share';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/session';
import { useTheme } from '../theme/theme';

export type PostCardPost = {
  id: string;
  caption: string;
  media_type: 'photo' | 'video';
  created_at: string;
  topic?: string | null;
  author: { id?: string; username: string; display_name: string; avatar_url: string | null } | null;
  media_url?: string;
  poster_url?: string;
};

export function PostCard({
  post,
  liked,
  saved,
  likeCount,
  commentCount,
  onToggleLike,
  onToggleSave,
  onComment,
  onAuthor,
  onPlay,
  onNotice,
}: {
  post: PostCardPost;
  liked: boolean;
  saved: boolean;
  likeCount: number;
  commentCount: number;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onComment: () => void;
  onAuthor?: () => void;
  onPlay?: () => void;
  onNotice?: (message: string, tone?: 'info' | 'success' | 'error') => void;
}) {
  const { colors, type, radii } = useTheme();
  const { width } = useWindowDimensions();
  const { userId, isDemo } = useSession();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const authorName = post.author?.display_name ?? 'Someone';
  const handle = post.author?.username ? `@${post.author.username}` : '';
  const mediaHeight = Math.min(520, Math.max(280, width * 0.52));

  const doShare = async () => {
    const result = await shareLink({
      url: postLink(post.id),
      message: post.caption?.slice(0, 90) || `A moment from ${authorName} on TachiReel`,
    });
    if (result === 'copied') onNotice?.('Link copied to your clipboard.', 'success');
  };

  const submitReport = async () => {
    if (reason.trim().length < 3) {
      setReportError('Tell us briefly what is wrong with this post.');
      return;
    }
    if (!supabase || !userId) {
      setReportError('Reporting needs a connected account.');
      return;
    }
    setReporting(true);
    setReportError(null);
    try {
      const { error } = await supabase.from('reports').insert({
        reporter_id: userId,
        post_id: post.id,
        reason: reason.trim(),
      });
      if (error) throw error;
      setReportOpen(false);
      setReason('');
      onNotice?.('Report sent. Thank you for helping keep TachiReel safe.', 'success');
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Could not send this report.');
    } finally {
      setReporting(false);
    }
  };

  return (
    <ClayCard style={{ overflow: 'hidden' }} padding={0}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, paddingTop: 15, paddingBottom: 13 }}>
        <Pressable onPress={onAuthor} disabled={!onAuthor} accessibilityLabel={`Open ${authorName}'s profile`}>
          <Avatar uri={post.author?.avatar_url} name={authorName} size={42} ring />
        </Pressable>
        <Pressable onPress={onAuthor} disabled={!onAuthor} style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text numberOfLines={1} style={[type.smallMedium, { color: colors.ink }]}>{authorName}</Text>
            <View style={{ width: 13, height: 13, borderRadius: 7, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="check" size={8} color={colors.accent} />
            </View>
          </View>
          <Text numberOfLines={1} style={[type.small, { color: colors.muted, fontSize: 10, marginTop: 1 }]}>
            {[handle, formatRelativeTime(post.created_at), post.topic ? `#${post.topic.toLowerCase()}` : null].filter(Boolean).join(' · ')}
          </Text>
        </Pressable>
        <PressableScale onPress={() => setMenuOpen(true)} accessibilityLabel="Post options">
          <View style={{ width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="more-horizontal" size={20} color={colors.muted} />
          </View>
        </PressableScale>
      </View>

      {post.caption ? (
        <Pressable onPress={() => setExpanded((value) => !value)} style={{ paddingHorizontal: 16, paddingBottom: 13 }}>
          <Text numberOfLines={expanded ? undefined : 3} style={[type.body, { color: colors.inkSoft, fontSize: 13.5, lineHeight: 21 }]}>
            {post.caption}
          </Text>
          {post.caption.length > 150 ? (
            <Text style={[type.smallMedium, { color: colors.accent, fontSize: 10, marginTop: 4 }]}>{expanded ? 'Show less' : 'Read more'}</Text>
          ) : null}
        </Pressable>
      ) : null}

      <Pressable
        onPress={post.media_type === 'video' ? onPlay : undefined}
        disabled={post.media_type !== 'video' || !onPlay}
        accessibilityLabel={post.media_type === 'video' ? 'Play video in Reels' : 'Post media'}
        style={{ backgroundColor: colors.surfaceDeep, width: '100%', height: mediaHeight, maxHeight: mediaHeight }}
      >
        {post.media_type === 'video' ? (
          post.poster_url ? (
            <Image source={{ uri: post.poster_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={220} />
          ) : (
            <View style={{ flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="video" size={28} color={colors.surface} />
            </View>
          )
        ) : post.media_url ? (
          <Image source={{ uri: post.media_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={260} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Feather name="image" size={26} color={colors.muted} />
            <Text style={[type.small, { color: colors.muted, fontSize: 10 }]}>Media unavailable</Text>
          </View>
        )}

        {post.media_type === 'video' ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,18,24,0.16)' }}>
            <View style={{ width: 58, height: 58, borderRadius: 20, backgroundColor: colors.mediaOverlay, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.glassBorder }}>
              <Feather name="play" size={22} color={colors.white} />
            </View>
          </View>
        ) : null}

        {post.topic ? (
          <View style={{ position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.mediaOverlay, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Feather name="hash" size={10} color={colors.white} />
            <Text style={[type.tiny, { color: colors.white, fontSize: 8 }]}>{post.topic}</Text>
          </View>
        ) : null}
      </Pressable>

      <View style={{ paddingHorizontal: 14, paddingTop: 11, paddingBottom: 13 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Action icon="heart" label={likeCount.toLocaleString()} active={liked} activeColor={colors.secondaryAccent} onPress={onToggleLike} accessibilityLabel={liked ? 'Unlike post' : 'Like post'} />
            <Action icon="message-circle" label={commentCount.toLocaleString()} onPress={onComment} accessibilityLabel="Open comments" />
            <Action icon="send" label="Share" onPress={() => void doShare()} accessibilityLabel="Share post" />
          </View>
          <PressableScale onPress={onToggleSave} accessibilityLabel={saved ? 'Remove from saved' : 'Save post'}>
            <View style={{ width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: saved ? colors.accentSoft : 'transparent' }}>
              <Feather name="bookmark" size={19} color={saved ? colors.accent : colors.muted} />
            </View>
          </PressableScale>
        </View>
      </View>

      <Dialog
        visible={menuOpen}
        title="Post options"
        message={`Shared by ${authorName} on TachiReel`}
        cancelLabel="Close"
        onCancel={() => setMenuOpen(false)}
      >
        <View style={{ gap: 8 }}>
          <ClayButton label="Copy link" variant="secondary" icon="link" onPress={() => { setMenuOpen(false); void doShare(); }} />
          <ClayButton label="Report post" variant="danger" icon="flag" onPress={() => { setMenuOpen(false); setReportOpen(true); }} />
          {isDemo ? <Notice text="Preview mode: reports are only sent to a connected Supabase project." /> : null}
        </View>
      </Dialog>

      <Dialog
        visible={reportOpen}
        title="Report this post"
        message="Tell us what is wrong. Reports are private and reviewed by the safety team."
        confirmLabel={reporting ? 'Sending…' : 'Send report'}
        cancelLabel="Cancel"
        onConfirm={() => void submitReport()}
        onCancel={() => { setReportOpen(false); setReportError(null); }}
        destructive
      >
        <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>
          {['Harassment', 'Sensitive content', 'Spam', 'Misinformation'].map((item) => (
            <Chip key={item} label={item} active={reason === item} onPress={() => setReason(item)} />
          ))}
        </View>
        <ClayInput value={reason} onChangeText={setReason} placeholder="Add a short note" multiline maxLength={400} />
        {reportError ? <Notice text={reportError} tone="error" /> : null}
      </Dialog>
    </ClayCard>
  );
}

function Action({
  icon,
  label,
  onPress,
  active = false,
  activeColor,
  accessibilityLabel,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  activeColor?: string;
  accessibilityLabel: string;
}) {
  const { colors, type } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 7,
        paddingHorizontal: Platform.OS === 'web' ? 9 : 6,
        borderRadius: 12,
        backgroundColor: pressed ? colors.backgroundAlt : 'transparent',
      })}
    >
      <Feather name={icon} size={20} color={active && activeColor ? activeColor : colors.inkSoft} />
      <Text style={[type.smallMedium, { color: active && activeColor ? activeColor : colors.muted, fontSize: 11 }]}>{label}</Text>
    </Pressable>
  );
}
