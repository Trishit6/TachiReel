import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions, type ScrollViewInstance } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ClayHeart } from '../components/ClayIllustration';
import { TachiReelMark, TachiReelWordmark } from '../components/Brand';
import { ClayButton, ClayCard } from '../components/ui';
import { hasDemoSession } from '../lib/demo-session';
import { readPreference } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/theme';

const FEATURES = [
  {
    icon: 'compass' as const,
    title: 'Discover inspiration',
    copy: 'A feed that feels like flipping through a beautifully edited magazine, not a shouting match.',
    tone: 'sage' as const,
  },
  {
    icon: 'camera' as const,
    title: 'Share your moments',
    copy: 'Photos, short videos, and small thoughts. Keep the everyday things that matter to you.',
    tone: 'mint' as const,
  },
  {
    icon: 'users' as const,
    title: 'Connect with people',
    copy: 'Follow the people who make your day softer. Conversations stay private and intentional.',
    tone: 'peach' as const,
  },
];

const HIGHLIGHTS = [
  { icon: 'shield' as const, title: 'Private by design', copy: 'Teen accounts start private with sensitive content off and guardian consent built in.' },
  { icon: 'sun' as const, title: 'A calmer feed', copy: 'No endless noise. Just the people, places, and ideas you actually chose.' },
  { icon: 'message-circle' as const, title: 'Real conversations', copy: 'Direct messages, comments, and follows without the pressure of a public scoreboard.' },
  { icon: 'heart' as const, title: 'Kind by default', copy: 'Small interactions, soft edges, and a community designed to feel welcoming.' },
];

export default function IndexScreen() {
  const { colors, type, radii } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 960;
  const [checking, setChecking] = useState(true);
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const sectionY = useRef<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (hasDemoSession()) {
          router.replace('/(tabs)');
          return;
        }
        if (!supabase) return;
        const { data } = await supabase.auth.getSession();
        if (!active || !data.session) return;

        const remembered = await readPreference('tachireel.remember');
        if (remembered === '0') {
          await supabase.auth.signOut();
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('account_status')
          .eq('id', data.session.user.id)
          .maybeSingle();
        if (!active) return;
        if (profile?.account_status === 'pending_guardian') router.replace('/guardian-pending');
        else if (profile?.account_status === 'active') router.replace('/(tabs)');
        else {
          await supabase.auth.signOut();
        }
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const jump = (key: string) => {
    scrollRef.current?.scrollTo({ y: sectionY.current[key] ?? 0, animated: true });
  };

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 0 }}>
        <View style={{ width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: wide ? 40 : 20 }}>
          <View style={{ height: wide ? 88 : 72, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TachiReelMark size={36} />
              <TachiReelWordmark size={24} />
            </Pressable>
            {wide ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 28 }}>
                {[
                  { key: 'discover', label: 'Discover' },
                  { key: 'community', label: 'Community' },
                  { key: 'safety', label: 'Safety' },
                ].map((item) => (
                  <Pressable
                    key={item.key}
                    onPress={() => jump(item.key)}
                    style={({ pressed }) => ({
                      paddingHorizontal: 13,
                      paddingVertical: 8,
                      borderRadius: 10,
                      backgroundColor: pressed ? colors.backgroundAlt : 'transparent',
                    })}
                  >
                    <Text style={[type.smallMedium, { color: colors.inkSoft }]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={{ flex: 1 }} />
            {wide ? (
              <Pressable onPress={() => router.push('/auth')} style={{ paddingHorizontal: 14, paddingVertical: 9 }}>
                <Text style={[type.buttonSmall, { color: colors.inkSoft }]}>Log in</Text>
              </Pressable>
            ) : null}
            <ClayButton label={wide ? 'Get started' : 'Join'} size="sm" onPress={() => router.push('/auth')} />
          </View>

          <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'center', gap: wide ? 56 : 20, paddingTop: wide ? 54 : 24, paddingBottom: wide ? 84 : 56 }}>
            <View style={{ flex: 1, maxWidth: 580 }}>
              <View
                style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 7,
                  backgroundColor: colors.accentSoft,
                  borderRadius: radii.pill,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  marginBottom: 18,
                }}
              >
                <Feather name="star" size={12} color={colors.accent} />
                <Text style={[type.tiny, { color: colors.accent, fontSize: 9 }]}>Your little corner of the internet</Text>
              </View>
              <Text style={[wide ? type.display : type.displaySm, { color: colors.ink }]}>Welcome to TachiReel</Text>
              <Text style={[type.h2, { color: colors.accent, marginTop: 10 }]}>Capture. Share. Explore.</Text>
              <Text style={[type.body, { color: colors.muted, fontSize: 16, lineHeight: 26, marginTop: 16, maxWidth: 480 }]}>
                A gentle social space for the photos, people, and small moments that make your world feel like yours.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
                <ClayButton label="Create your corner" size="lg" iconRight="arrow-right" onPress={() => router.push('/auth')} />
                <ClayButton label="I already have an account" size="lg" variant="secondary" onPress={() => router.push('/auth')} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 28, flexWrap: 'wrap' }}>
                {[
                  { icon: 'lock' as const, label: 'Private by default' },
                  { icon: 'smile' as const, label: 'No pressure' },
                  { icon: 'zap' as const, label: 'Fast and focused' },
                ].map((item) => (
                  <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name={item.icon} size={13} color={colors.success} />
                    <Text style={[type.small, { color: colors.muted }]}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={{ width: wide ? 440 : '100%', maxWidth: 440, alignItems: 'center' }}>
              <ClayHeart size={wide ? 390 : 290} />
            </View>
          </View>
        </View>

        <View
          onLayout={(event) => { sectionY.current.discover = event.nativeEvent.layout.y; }}
          style={{ width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: wide ? 40 : 20, paddingVertical: wide ? 56 : 32 }}
        >
          <Text style={[type.tiny, { color: colors.accent, marginBottom: 8 }]}>Made for the everyday</Text>
          <Text style={[wide ? type.h1 : type.h2, { color: colors.ink, maxWidth: 640 }]}>
            A social app with softer edges.
          </Text>
          <Text style={[type.body, { color: colors.muted, maxWidth: 540, marginTop: 8 }]}>
            Everything you need to share a little life, without the parts that make you want to put your phone down.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 30 }}>
            {FEATURES.map((feature) => (
              <ClayCard key={feature.title} style={{ flexGrow: 1, flexBasis: wide ? 280 : '100%', padding: 24, minHeight: 220 }} radius={28}>
                <View style={{ width: 58, height: 58, borderRadius: 20, backgroundColor: colors[`${feature.tone}Soft` as 'sageSoft'], alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 15, backgroundColor: colors[feature.tone], alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name={feature.icon} size={20} color={colors.ink} />
                  </View>
                </View>
                <Text style={[type.h3, { color: colors.ink }]}>{feature.title}</Text>
                <Text style={[type.small, { color: colors.muted, marginTop: 7, lineHeight: 20 }]}>{feature.copy}</Text>
              </ClayCard>
            ))}
          </View>
        </View>

        <View
          onLayout={(event) => { sectionY.current.community = event.nativeEvent.layout.y; }}
          style={{ backgroundColor: colors.backgroundAlt, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }}
        >
          <View style={{ width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: wide ? 40 : 20, paddingVertical: wide ? 64 : 36 }}>
            <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 48 : 20, alignItems: wide ? 'center' : 'stretch' }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.tiny, { color: colors.success, marginBottom: 8 }]}>A community, not an audience</Text>
                <Text style={[wide ? type.displaySm : type.h2, { color: colors.ink, maxWidth: 520 }]}>
                  Find your people. Keep your peace.
                </Text>
                <Text style={[type.body, { color: colors.muted, maxWidth: 500, marginTop: 12 }]}>
                  Follow thoughtfully, comment kindly, and message privately. TachiReel is built around small circles and real connection.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
                  <ClayButton label="Join TachiReel" icon="heart" onPress={() => router.push('/auth')} />
                  <ClayButton label="Explore the app" variant="secondary" icon="compass" onPress={() => router.push('/auth')} />
                </View>
              </View>
              <View style={{ flex: 1, gap: 12 }}>
                {[
                  { icon: 'image' as const, title: 'Slow feeds', copy: 'A feed shaped by who you follow, not by who paid the most.' },
                  { icon: 'message-square' as const, title: 'Quiet messages', copy: 'Real conversations, kept between the people in them.' },
                  { icon: 'users' as const, title: 'Small circles', copy: 'Your circle, your pace. Follow the people who feel like home.' },
                ].map((item) => (
                  <ClayCard key={item.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }} elevated="soft">
                    <View style={{ width: 42, height: 42, borderRadius: 15, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line }}>
                      <Feather name={item.icon} size={18} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.smallMedium, { color: colors.ink }]}>{item.title}</Text>
                      <Text style={[type.small, { color: colors.muted, marginTop: 2 }]}>{item.copy}</Text>
                    </View>
                    <Feather name="check" size={16} color={colors.success} />
                  </ClayCard>
                ))}
              </View>
            </View>
          </View>
        </View>

        <View
          onLayout={(event) => { sectionY.current.safety = event.nativeEvent.layout.y; }}
          style={{ width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: wide ? 40 : 20, paddingVertical: wide ? 64 : 36 }}
        >
          <Text style={[type.tiny, { color: colors.peach, marginBottom: 8 }]}>Thoughtfully built</Text>
          <Text style={[wide ? type.h1 : type.h2, { color: colors.ink, maxWidth: 620 }]}>
            The good parts of social, with the sharp edges softened.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 28 }}>
            {HIGHLIGHTS.map((item) => (
              <ClayCard key={item.title} style={{ flexGrow: 1, flexBasis: wide ? '46%' : '100%', padding: 20 }} elevated="soft">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name={item.icon} size={15} color={colors.success} />
                  </View>
                  <Text style={[type.smallMedium, { color: colors.ink }]}>{item.title}</Text>
                </View>
                <Text style={[type.small, { color: colors.muted, marginTop: 8, lineHeight: 19 }]}>{item.copy}</Text>
              </ClayCard>
            ))}
          </View>
        </View>

        <View style={{ width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: wide ? 40 : 20, paddingBottom: wide ? 72 : 40 }}>
          <ClayCard style={{ padding: wide ? 44 : 26, alignItems: 'center', backgroundColor: colors.accentSoft }} elevated="floating" radius={32}>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {[colors.mint, colors.peach, colors.butter].map((color, i) => (
                <View key={i} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
              ))}
            </View>
            <Text style={[wide ? type.displaySm : type.h2, { color: colors.ink, textAlign: 'center', maxWidth: 620 }]}>
              Your little corner is waiting.
            </Text>
            <Text style={[type.body, { color: colors.inkSoft, textAlign: 'center', maxWidth: 460, marginTop: 10 }]}>
              Bring the moments that matter. Leave the noise behind.
            </Text>
            <View style={{ marginTop: 22 }}>
              <ClayButton label="Get started — it's free" size="lg" iconRight="arrow-right" onPress={() => router.push('/auth')} />
            </View>
          </ClayCard>
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface }}>
          <View style={{ width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: wide ? 40 : 20, paddingVertical: 32, flexDirection: wide ? 'row' : 'column', justifyContent: 'space-between', gap: 20 }}>
            <View style={{ maxWidth: 300 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                <TachiReelMark size={30} />
                <TachiReelWordmark size={20} />
              </View>
              <Text style={[type.small, { color: colors.muted }]}>Capture. Share. Explore. Your little corner of the internet.</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: wide ? 56 : 36, flexWrap: 'wrap' }}>
              <View style={{ gap: 7 }}>
                <Text style={[type.tiny, { color: colors.mutedLight }]}>Product</Text>
                {['Home feed', 'Reels', 'Explore'].map((label) => (
                  <Text key={label} style={[type.small, { color: colors.muted }]}>{label}</Text>
                ))}
              </View>
              <View style={{ gap: 7 }}>
                <Text style={[type.tiny, { color: colors.mutedLight }]}>Safety</Text>
                {['Community guidelines', 'Teen safety', 'Privacy'].map((label) => (
                  <Text key={label} style={[type.small, { color: colors.muted }]}>{label}</Text>
                ))}
              </View>
              <View style={{ gap: 7 }}>
                <Text style={[type.tiny, { color: colors.mutedLight }]}>Account</Text>
                {['Log in', 'Get started', 'Guardian review'].map((label) => (
                  <Pressable key={label} onPress={() => router.push(label === 'Guardian review' ? '/guardian-consent' : '/auth')}>
                    <Text style={[type.small, { color: colors.muted }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
          <View style={{ width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: wide ? 40 : 20, paddingBottom: 24 }}>
            <View style={{ height: 1, backgroundColor: colors.line, marginBottom: 14 }} />
            <Text style={[type.small, { color: colors.mutedLight, fontSize: 10 }]}>© {new Date().getFullYear()} TachiReel. Made for softer days.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

