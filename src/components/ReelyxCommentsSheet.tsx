import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Animated, Modal, PanResponder, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, ClayButton, ClayInput } from './ui';
import { useTheme } from '../theme/theme';
import { formatRelativeTime } from '../lib/format';
import { addReelyxComment, fetchReelyxComments, type ReelyxComment, type ReelyxVideo } from '../lib/reelyx';
import { useSession } from '../lib/session';
import { supabase } from '../lib/supabase';

type Props = {
  visible: boolean;
  video: ReelyxVideo | null;
  onClose: () => void;
  onCommentAdded: (videoId: string) => void;
};

export function ReelyxCommentsSheet({ visible, video, onClose, onCommentAdded }: Props) {
  const { colors, type, reduceMotion } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { userId, profile } = useSession();
  const compact = width < 820;

  const [comments, setComments] = useState<ReelyxComment[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag] = useState(() => new Animated.Value(0));
  const scrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);

  const videoId = video?.id ?? null;

  useEffect(() => {
    if (!visible || !videoId) return;
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      setBody('');
      setComments([]);
      try {
        const rows = await fetchReelyxComments({ client: supabase, videoId });
        if (active) setComments(rows);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load comments.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [visible, videoId]);

  useEffect(() => {
    if (visible) {
      drag.setValue(0);
      const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: !reduceMotion }), 120);
      return () => clearTimeout(timer);
    }
  }, [visible, comments.length, drag, reduceMotion]);

  const close = () => {
    setBody('');
    setError(null);
    onClose();
  };

  const send = async () => {
    if (!videoId || !userId || sending) return;
    const text = body.trim();
    if (!text) {
      setError('Write a comment before sending.');
      return;
    }
    if (text.length > 1000) {
      setError('Comments must be 1,000 characters or fewer.');
      return;
    }

    const optimistic: ReelyxComment = {
      id: `pending-${Date.now()}`,
      author: {
        id: userId,
        username: profile?.username ?? 'you',
        display_name: profile?.display_name ?? 'You',
        avatar_url: profile?.avatar_url ?? null,
      },
      body: text,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setComments((rows) => [...rows, optimistic]);
    setBody('');
    setError(null);
    setSending(true);
    try {
      const saved = await addReelyxComment({
        client: supabase,
        videoId,
        userId,
        profile: optimistic.author,
        body: text,
      });
      setComments((rows) => rows.map((row) => (row.id === optimistic.id ? saved : row)));
      onCommentAdded(videoId);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: !reduceMotion }), 80);
    } catch (sendError) {
      setComments((rows) => rows.filter((row) => row.id !== optimistic.id));
      setBody(text);
      setError(sendError instanceof Error ? sendError.message : 'Could not send that comment.');
    } finally {
      setSending(false);
    }
  };

  // A downward drag on the sheet handle closes the mobile panel.
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => compact && gesture.dy > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_, gesture) => drag.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 90) {
        drag.setValue(0);
        close();
        return;
      }
      Animated.spring(drag, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start();
    },
  });

  const sheetWidth = compact ? width : Math.min(520, width - 40);
  const sheetHeight = compact ? Math.min(height * 0.82, height - insets.top - 24) : Math.min(height * 0.72, 680);

  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: compact ? 'flex-end' : 'center', alignItems: 'center' }}>
        <Pressable style={{ position: 'absolute', inset: 0 }} onPress={close} accessibilityLabel="Close comments" />
        <Animated.View
          style={{
            width: sheetWidth,
            height: sheetHeight,
            maxHeight: sheetHeight,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.line,
            borderBottomWidth: compact ? 0 : 1,
            borderTopLeftRadius: compact ? 24 : 22,
            borderTopRightRadius: compact ? 24 : 22,
            borderBottomLeftRadius: compact ? 0 : 22,
            borderBottomRightRadius: compact ? 0 : 22,
            paddingBottom: compact ? insets.bottom : 0,
            transform: [{ translateY: drag }],
            overflow: 'hidden',
          }}
        >
          <View
            {...(compact ? panResponder.panHandlers : {})}
            style={{
              paddingTop: compact ? 8 : 16,
              paddingHorizontal: 18,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
              gap: compact ? 8 : 12,
            }}
          >
            {compact ? <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong }} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar uri={video?.author.avatar_url} name={video?.author.display_name ?? 'TachiReel'} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.smallMedium, { color: colors.ink }]} numberOfLines={1}>Comments</Text>
                <Text style={[type.tiny, { color: colors.muted }]} numberOfLines={1}>
                  {video?.author.display_name ?? 'Reelyx'} · {video?.comment_count ?? comments.length} comments
                </Text>
              </View>
              <Pressable
                onPress={close}
                accessibilityLabel="Close comments"
                style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundAlt }}
              >
                <Feather name="x" size={18} color={colors.inkSoft} />
              </Pressable>
            </View>
          </View>

          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            {loading ? <Text style={[type.small, { color: colors.muted }]}>Loading comments…</Text> : null}
            {!loading && comments.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
                <Feather name="message-circle" size={28} color={colors.mutedLight} />
                <Text style={[type.body, { color: colors.ink }]}>Start the conversation.</Text>
                <Text style={[type.small, { color: colors.muted, textAlign: 'center' }]}>Be kind, specific and curious.</Text>
              </View>
            ) : null}
            {comments.map((comment) => (
              <View key={comment.id} style={{ flexDirection: 'row', gap: 10, opacity: comment.pending ? 0.65 : 1 }}>
                <Avatar uri={comment.author.avatar_url} name={comment.author.display_name} size={34} />
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <Text style={[type.smallMedium, { color: colors.ink }]}>{comment.author.display_name}</Text>
                    <Text style={[type.tiny, { color: colors.mutedLight }]}>{formatRelativeTime(comment.created_at)}</Text>
                  </View>
                  <Text style={[type.small, { color: colors.inkSoft, lineHeight: 19 }]}>{comment.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {error ? <Text style={[type.tiny, { color: colors.danger, paddingHorizontal: 18, paddingBottom: 6 }]}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: compact ? 10 : 14, borderTopWidth: 1, borderTopColor: colors.line }}>
            <ClayInput
              value={body}
              onChangeText={setBody}
              placeholder="Add a thoughtful comment…"
              accessibilityLabel="Comment text"
              multiline
              maxLength={1000}
              style={{ flex: 1 }}
              inputStyle={{ fontSize: 13, maxHeight: 80 }}
              onSubmitEditing={() => void send()}
            />
            <ClayButton label="Send" icon="send" size="sm" onPress={() => void send()} loading={sending} disabled={!body.trim()} accessibilityLabel="Send comment" />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
