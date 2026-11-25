import { privatePageMetadata } from '../../lib/seo';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type ViewInstance,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import { ClayButton, ClayCard, ClayInput, Chip, Dialog, Notice, PageHeader, PressableScale } from '../../components/ui';
import { useSession } from '../../lib/session';
import { readPreference, writePreference } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { uploadAsset, validateAsset } from '../../lib/upload';
import { useTheme } from '../../theme/theme';

const CAPTION_LIMIT = 2200;
const TOPICS = ['Travel', 'Food', 'Style', 'Art', 'Technology', 'Lifestyle', 'Wellness'] as const;
const HASHTAGS = ['#slowmornings', '#littlecorners', '#weekendwalks', '#softliving'];
type Visibility = 'public' | 'followers' | 'private';
type PostType = 'photo' | 'video';
type Stage = 'uploading' | 'saving' | null;
type Feedback = { tone: 'success' | 'error' | 'info'; text: string } | null;

export default function CreateScreen() {
  const { colors, type } = useTheme();
  const { width } = useWindowDimensions();
  const { userId, profile, isDemo } = useSession();
  const params = useLocalSearchParams<{ type?: string }>();
  const wide = width >= 1000;

  const [postType, setPostType] = useState<PostType>(params.type === 'video' || params.type === 'reel' ? 'video' : 'photo');
  const [media, setMedia] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>(profile?.is_minor ? 'private' : 'public');
  const effectiveVisibility: Visibility = profile?.is_minor && visibility === 'public' ? 'private' : visibility;
  const [stage, setStage] = useState<Stage>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dropRef = useRef<ViewInstance | null>(null);

  // React Native Web exposes the underlying DOM node, so drag-and-drop can be attached
  // without shipping a web-only component tree.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = dropRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    const onDragOver = (event: DragEvent) => {
      event.preventDefault();
      setDragOver(true);
    };
    const onDragLeave = () => setDragOver(false);
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        setFeedback({ tone: 'error', text: 'Choose a photo or video file.' });
        return;
      }
      setMedia({
        uri: URL.createObjectURL(file),
        file,
        fileName: file.name,
        mimeType: file.type,
        type: file.type.startsWith('video') ? 'video' : 'image',
        width: 0,
        height: 0,
      } as unknown as ImagePicker.ImagePickerAsset);
      setPostType(file.type.startsWith('video') ? 'video' : 'photo');
      setFeedback(null);
    };
    node.addEventListener('dragover', onDragOver);
    node.addEventListener('dragleave', onDragLeave);
    node.addEventListener('drop', onDrop);
    return () => {
      node.removeEventListener('dragover', onDragOver);
      node.removeEventListener('dragleave', onDragLeave);
      node.removeEventListener('drop', onDrop);
    };
  }, []);

  const chooseMedia = async (kind: PostType = postType) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'video' ? ['videos'] : ['images'],
      allowsEditing: true,
      quality: 0.9,
      videoMaxDuration: 180,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const problem = validateAsset(asset);
    if (problem) {
      setFeedback({ tone: 'error', text: problem });
      return;
    }
    setMedia(asset);
    setPostType(kind);
    setFeedback(null);
  };

  const publish = async () => {
    if (!media || stage) return;
    if (!caption.trim()) {
      setFeedback({ tone: 'error', text: 'Add a caption so people know what they are looking at.' });
      return;
    }
    if (!supabase || !userId) {
      setFeedback({
        tone: 'error',
        text: isDemo
          ? 'Preview mode cannot publish. Connect Supabase and log in with a real account to share.'
          : 'Add your Supabase URL and anon key to publish posts.',
      });
      return;
    }

    setFeedback(null);
    setStage('uploading');
    let uploadedPath: string | null = null;
    try {
      const uploaded = await uploadAsset(supabase, userId, media);
      uploadedPath = uploaded.path;
      setStage('saving');
      const payload = {
        author_id: userId,
        caption: caption.trim(),
        media_type: media.type === 'video' ? 'video' : 'photo',
        media_key: uploaded.path,
        visibility: effectiveVisibility,
        topic,
      };
      let { error: insertError } = await supabase.from('posts').insert(payload);
      if (insertError && /topic/i.test(insertError.message)) {
        const legacy = { ...payload } as { topic?: string | null };
        delete legacy.topic;
        const retry = await supabase.from('posts').insert(legacy);
        insertError = retry.error;
      }
      if (insertError) throw insertError;
      setMedia(null);
      setCaption('');
      setTopic(null);
      setFeedback({ tone: 'success', text: 'Your moment is in! It will appear once the safety review is complete.' });
    } catch (error) {
      if (uploadedPath && supabase) await supabase.storage.from('post-media').remove([uploadedPath]);
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Could not share this post. Please try again.' });
    } finally {
      setStage(null);
    }
  };

  const saveDraft = async () => {
    if (!caption.trim() && !topic) {
      setFeedback({ tone: 'info', text: 'Add a caption or topic before saving a draft.' });
      return;
    }
    await writePreference(`tachireel.draft.${userId ?? 'guest'}`, JSON.stringify({ caption, topic, visibility }));
    setFeedback({ tone: 'success', text: 'Draft saved on this device.' });
  };

  const restoreDraft = async () => {
    const raw = await readPreference(`tachireel.draft.${userId ?? 'guest'}`);
    if (!raw) {
      setFeedback({ tone: 'info', text: 'No saved draft was found on this device.' });
      return;
    }
    try {
      const draft = JSON.parse(raw) as { caption?: string; topic?: string | null; visibility?: Visibility };
      setCaption(draft.caption ?? '');
      setTopic(draft.topic ?? null);
      if (draft.visibility) setVisibility(draft.visibility);
      setFeedback({ tone: 'success', text: 'Draft restored. Re-select your media to publish it.' });
    } catch {
      setFeedback({ tone: 'error', text: 'That draft could not be read.' });
    }
  };

  const publishLabel = stage === 'uploading' ? 'Uploading media…' : stage === 'saving' ? 'Sharing your moment…' : 'Publish post';
  const canPublish = Boolean(media) && Boolean(caption.trim()) && !stage;

  const mediaPanel = (
    <ClayCard style={{ padding: 0, overflow: 'hidden' }} radius={30}>
      <View ref={dropRef} style={{ padding: 14 }}>
        <View accessibilityLabel="Media upload area">
          <View
            style={{
              height: wide ? 470 : 300,
              borderRadius: 22,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: dragOver ? colors.accent : colors.lineStrong,
              backgroundColor: dragOver ? colors.accentSoft : colors.backgroundAlt,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {media ? (
              <>
                {media.type === 'video' ? (
                  <View style={{ flex: 1, width: '100%', backgroundColor: colors.mediaOverlay, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <View style={{ width: 62, height: 62, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="play" size={24} color={colors.ink} />
                    </View>
                    <Text style={[type.small, { color: colors.white }]}>Video selected · tap to replace</Text>
                  </View>
                ) : (
                  <Image source={{ uri: media.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
                )}
                <View style={{ position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => void chooseMedia()}
                    accessibilityLabel="Replace media"
                    style={{ width: 36, height: 36, borderRadius: 13, backgroundColor: colors.mediaOverlay, borderWidth: 1, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Feather name="refresh-cw" size={15} color={colors.white} />
                  </Pressable>
                  <Pressable
                    onPress={() => setMedia(null)}
                    accessibilityLabel="Remove media"
                    style={{ width: 36, height: 36, borderRadius: 13, backgroundColor: colors.mediaOverlay, borderWidth: 1, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Feather name="x" size={16} color={colors.secondaryAccent} />
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={{ alignItems: 'center', padding: 24 }}>
                <View style={{ width: 76, height: 76, borderRadius: 28, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: colors.line }}>
                  <Feather name={postType === 'video' ? 'video' : 'image'} size={30} color={colors.accent} />
                </View>
                <Text style={[type.h3, { color: colors.ink, textAlign: 'center' }]}>
                  {dragOver ? 'Drop it right here.' : 'Your next favourite moment.'}
                </Text>
                <Text style={[type.small, { color: colors.muted, textAlign: 'center', marginTop: 6, maxWidth: 300 }]}>
                  {Platform.OS === 'web' ? 'Drag a photo or video here, or choose one from your device.' : 'Choose a photo or video from your library.'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
                  <ClayButton label="Choose media" icon="upload" size="sm" onPress={() => void chooseMedia()} />
                </View>
                <Text style={[type.small, { color: colors.mutedLight, fontSize: 9, marginTop: 12 }]}>JPG, PNG, WEBP, MP4 or MOV · up to 50 MB</Text>
              </View>
            )}
          </View>
        </View>

        {stage ? (
          <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.accentSoft, borderRadius: 12, padding: 11 }}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[type.small, { color: colors.accent, flex: 1 }]}>{stage === 'uploading' ? 'Uploading your media…' : 'Saving your post…'}</Text>
          </View>
        ) : null}
        {feedback ? <View style={{ marginTop: 12 }}><Notice text={feedback.text} tone={feedback.tone === 'info' ? 'info' : feedback.tone} /></View> : null}
      </View>
    </ClayCard>
  );

  const detailsPanel = (
    <View style={{ flex: 1, gap: 14 }}>
      <ClayCard style={{ padding: 20 }} elevated="soft">
        <Text style={[type.h3, { color: colors.ink }]}>The details</Text>
        <Text style={[type.small, { color: colors.muted, marginTop: 3, marginBottom: 14 }]}>A good caption makes a moment feel like yours.</Text>
        <ClayInput
          label="CAPTION"
          value={caption}
          onChangeText={setCaption}
          placeholder="What is this little moment about?"
          multiline
          maxLength={CAPTION_LIMIT}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <Text style={[type.small, { color: colors.mutedLight, fontSize: 10 }]}>Hashtags can go right in the caption</Text>
          <Text style={[type.small, { color: caption.length > CAPTION_LIMIT - 100 ? colors.danger : colors.mutedLight, fontSize: 10 }]}>{caption.length}/{CAPTION_LIMIT}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
          {HASHTAGS.map((tag) => (
            <Chip key={tag} label={tag} onPress={() => setCaption((value) => `${value}${value.trim() ? ' ' : ''}${tag}`.slice(0, CAPTION_LIMIT))} />
          ))}
        </View>
      </ClayCard>

      <ClayCard style={{ padding: 20 }} elevated="soft">
        <Text style={[type.h3, { color: colors.ink }]}>Post type</Text>
        <Text style={[type.small, { color: colors.muted, marginTop: 3, marginBottom: 12 }]}>Photo and video posts are supported by the current backend.</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Chip label="Photo" icon="image" active={postType === 'photo'} onPress={() => { setPostType('photo'); setMedia(null); }} />
          <Chip label="Video" icon="video" active={postType === 'video'} onPress={() => { setPostType('video'); setMedia(null); }} />
          <Chip label="Story" icon="circle" onPress={() => setFeedback({ tone: 'info', text: 'Stories need a story table and expiry job in the backend. They are not available yet.' })} />
          <Chip label="Go Live" icon="radio" onPress={() => setFeedback({ tone: 'info', text: 'Live streaming needs a video provider such as Mux. It is not available yet.' })} />
        </View>
        <PressableScale onPress={() => void chooseMedia(postType)} style={{ marginTop: 14 }}>
          <View style={{ height: 44, borderRadius: 14, backgroundColor: colors.backgroundAlt, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}>
            <Feather name="plus" size={15} color={colors.accent} />
            <Text style={[type.buttonSmall, { color: colors.inkSoft }]}>{media ? 'Replace with another' : `Choose a ${postType}`}</Text>
          </View>
        </PressableScale>
      </ClayCard>

      <ClayCard style={{ padding: 20 }} elevated="soft">
        <Text style={[type.h3, { color: colors.ink }]}>Audience and topic</Text>
        <Text style={[type.small, { color: colors.muted, marginTop: 3, marginBottom: 12 }]}>Who gets to see this, and where it belongs.</Text>
        <View style={{ gap: 8 }}>
          {([
            { value: 'public', label: 'Everyone', copy: 'Visible on your profile and in Explore.', icon: 'globe' as const },
            { value: 'followers', label: 'Your followers', copy: 'Only people who follow you.', icon: 'users' as const },
            { value: 'private', label: 'Only me', copy: 'A private moment just for you.', icon: 'lock' as const },
          ] as const).map((option) => {
            const disabled = profile?.is_minor && option.value === 'public';
            const active = visibility === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => { if (!disabled) setVisibility(option.value); }}
                accessibilityRole="radio"
                accessibilityState={{ checked: active, disabled }}
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: active ? colors.accent : colors.line,
                  backgroundColor: active ? colors.accentSoft : colors.surface,
                  padding: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  opacity: disabled ? 0.45 : 1,
                }}
              >
                <Feather name={option.icon} size={16} color={active ? colors.accent : colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.smallMedium, { color: colors.ink }]}>{option.label}</Text>
                  <Text style={[type.small, { color: colors.muted, fontSize: 10 }]}>{option.copy}</Text>
                </View>
                <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: active ? colors.accent : colors.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
                  {active ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent }} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        {profile?.is_minor ? <View style={{ marginTop: 10 }}><Notice text="Teen accounts cannot post publicly. Your moments stay within your chosen circle." /></View> : null}
        <Text style={[type.tiny, { color: colors.muted, marginTop: 16, marginBottom: 8 }]}>TOPIC</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {TOPICS.map((item) => (
            <Chip key={item} label={item} active={topic === item} onPress={() => setTopic(topic === item ? null : item)} />
          ))}
        </View>
        <Text style={[type.small, { color: colors.mutedLight, fontSize: 9, marginTop: 12 }]}>
          Location, tagging people, and drafts across devices need additional backend fields. Drafts here are stored only on this device.
        </Text>
      </ClayCard>

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <ClayButton label="Save draft" variant="secondary" icon="save" onPress={() => void saveDraft()} />
        <ClayButton label="Restore draft" variant="ghost" icon="rotate-ccw" onPress={() => void restoreDraft()} />
        <ClayButton label="Preview" variant="soft" icon="eye" onPress={() => setPreviewOpen(true)} disabled={!media} />
      </View>

      <ClayButton
        label={publishLabel}
        size="lg"
        full
        iconRight="arrow-right"
        loading={Boolean(stage)}
        disabled={!canPublish}
        onPress={() => void publish()}
      />
      {isDemo ? <Notice text="Preview mode: the composer is fully interactive, but publishing needs a real Supabase account." /> : null}
      <Text style={[type.small, { color: colors.muted, textAlign: 'center', fontSize: 9 }]}>
        Every post goes through a safety review before it appears in feeds.
      </Text>
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 80, gap: 18 }}
      showsVerticalScrollIndicator={false}
    >
      <PageHeader
        eyebrow="Your little corner of the internet"
        title="Create something."
        subtitle="Good moments are better when shared."
        actions={<ClayButton label="Back to feed" variant="ghost" size="sm" icon="arrow-left" onPress={() => router.push('/(tabs)/home')} />}
      />

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
        <View style={{ width: wide ? '56%' : '100%', maxWidth: wide ? 640 : undefined }}>{mediaPanel}</View>
        <View style={{ width: wide ? undefined : '100%', flex: wide ? 1 : undefined, minWidth: 0 }}>{detailsPanel}</View>
      </View>

      <Dialog
        visible={previewOpen}
        title="A little look first"
        message="This is how your moment will feel in the feed."
        cancelLabel="Close"
        onCancel={() => setPreviewOpen(false)}
      >
        <View style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surfaceDeep, height: 220 }}>
          {media && media.type !== 'video' ? (
            <Image source={{ uri: media.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Feather name="video" size={26} color={colors.muted} />
              <Text style={[type.small, { color: colors.muted }]}>Video preview</Text>
            </View>
          )}
        </View>
        <Text style={[type.smallMedium, { color: colors.ink }]}>{caption.trim() || 'Your caption will appear here.'}</Text>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {topic ? <Chip label={`#${topic.toLowerCase()}`} active /> : null}
          <Chip label={visibility === 'public' ? 'Everyone' : visibility === 'followers' ? 'Followers' : 'Only me'} icon="eye" />
        </View>
      </Dialog>
    </ScrollView>
  );
}

export function generateMetadata() {
  return privatePageMetadata({
    title: "Create a post",
    description: "Share a photo, short video or small thought on TachiReel.",
    path: "/create",
  });
}
