import { privatePageMetadata } from '../../../lib/seo';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import {
  ClayButton,
  ClayCard,
  ClayInput,
  Notice,
  PageHeader,
} from '../../../components/ui';
import { isDemoMode } from '../../../lib/demo-data';
import { useSession } from '../../../lib/session';
import {
  createSpeechPlayback,
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  requestMicrophonePermission,
  type RecognitionController,
  type SpeechPlaybackController,
} from '../../../lib/speech';
import {
  fetchSupportChatHistory,
  sendSupportChatMessage,
  type SupportChatMessage,
} from '../../../lib/support';
import { allSupportFaqs, loadPublishedHelpContent } from '../../../lib/support-content';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../theme/theme';

type SpeechState = 'idle' | 'speaking' | 'paused';

export default function SupportChatScreen() {
  const { colors, type } = useTheme();
  const { userId } = useSession();
  const canUseBackend = !isDemoMode && Boolean(supabase && userId);
  const recognitionSupported = useState(() => isSpeechRecognitionSupported())[0];
  const synthesisSupported = useState(() => isSpeechSynthesisSupported())[0];

  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupNotice, setSetupNotice] = useState<string | null>(null);
  const [helpReady, setHelpReady] = useState(!supabase);
  const [listening, setListening] = useState(false);
  const [speechState, setSpeechState] = useState<SpeechState>('idle');
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const recognitionRef = useRef<RecognitionController | null>(null);
  const playbackRef = useRef<SpeechPlaybackController | null>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!recognitionSupported) return;
    recognitionRef.current = createSpeechRecognition({
      onTranscript: (text) => setComposer(text),
      onListeningChange: setListening,
      onError: (message) => setError(message),
    });
    return () => recognitionRef.current?.cancel();
  }, [recognitionSupported]);

  useEffect(() => {
    if (!synthesisSupported) return;
    playbackRef.current = createSpeechPlayback({
      onStateChange: (next) => {
        setSpeechState(next);
        if (next === 'idle') setSpeakingId(null);
      },
      onError: (message) => setError(message),
    });
    return () => playbackRef.current?.stop();
  }, [synthesisSupported]);

  useEffect(() => {
    if (!supabase || helpReady) return;
    void loadPublishedHelpContent(supabase).finally(() => setHelpReady(true));
  }, [helpReady]);

  useEffect(() => {
    if (!canUseBackend || !supabase || !userId || loadedRef.current === userId) return;
    loadedRef.current = userId;
    void (async () => {
      try {
        setMessages(await fetchSupportChatHistory(supabase, userId));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load the conversation.');
      }
    })();
  }, [canUseBackend, userId]);

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const send = async () => {
    const text = composer.trim();
    if (!text || sending) return;
    if (!canUseBackend || !supabase) {
      setSetupNotice('Support chat needs a connected Supabase project and a deployed AI function. The FAQ below still works.');
      return;
    }

    setSending(true);
    setError(null);
    setSetupNotice(null);
    const optimisticId = `pending-${Date.now()}`;
    setMessages((current) => [...current, { id: optimisticId, role: 'user', body: text, created_at: new Date().toISOString() }]);
    setComposer('');
    try {
      const reply = await sendSupportChatMessage(supabase, text);
      setMessages((current) => [
        ...current.filter((message) => message.id !== optimisticId),
        { id: `assistant-${Date.now()}`, role: 'assistant', body: reply, created_at: new Date().toISOString() },
      ]);
      void (async () => {
        try {
          setMessages(await fetchSupportChatHistory(supabase, userId!));
        } catch {
          // Keep the displayed conversation if the silent refresh fails.
        }
      })();
    } catch (sendError) {
      const detail = sendError instanceof Error ? sendError.message : 'The assistant could not answer.';
      setMessages((current) => current.filter((message) => message.id !== optimisticId));
      setComposer(text);
      if (/Edge Function|not configured|SUPPORT_AI_API_KEY|assistant needs/i.test(detail)) setSetupNotice(detail);
      else setError(detail);
    } finally {
      setSending(false);
    }
  };

  const toggleListening = async () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    if (!recognitionRef.current) {
      setError('Voice input is not supported in this browser. Type your message instead.');
      return;
    }
    setError(null);
    const granted = await requestMicrophonePermission();
    if (!granted) {
      setError('Microphone access was not granted. You can still type your message.');
      return;
    }
    recognitionRef.current.start();
  };

  const speak = (message: SupportChatMessage) => {
    if (!playbackRef.current) {
      setError('Spoken replies are not supported in this browser. You can read the text instead.');
      return;
    }
    if (speakingId === message.id && speechState === 'speaking') {
      playbackRef.current.pause();
      return;
    }
    if (speakingId === message.id && speechState === 'paused') {
      playbackRef.current.resume();
      return;
    }
    playbackRef.current.play(message.body);
    setSpeakingId(message.id);
  };

  const stopSpeaking = () => {
    playbackRef.current?.stop();
    setSpeakingId(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
        <PageHeader
          eyebrow="TachiReel support assistant"
          title="Ask TachiReel"
          subtitle="Answers come from how this app works. For account-specific help, open a private ticket."
          actions={<ClayButton label="New ticket" icon="plus" size="sm" variant="secondary" onPress={() => router.push('/(tabs)/support/new')} />}
        />
      </View>

      {!canUseBackend || setupNotice || error ? (
        <View style={{ paddingHorizontal: 20, gap: 8 }}>
          {!canUseBackend ? (
            <Notice tone="info" text="Preview mode: live AI replies need Supabase and the tachireel-support-chat Edge Function with a server-side key. The FAQ below is available now." />
          ) : null}
          {setupNotice ? <Notice tone="error" text={setupNotice} /> : null}
          {error ? <Notice tone="error" text={error} /> : null}
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ width: '100%', maxWidth: 820, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <ClayCard style={{ padding: 20, gap: 12 }} elevated="soft">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 38, height: 38, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="message-square" size={18} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.h3, { color: colors.ink }]}>What can I help with?</Text>
                <Text style={[type.small, { color: colors.muted, fontSize: 11 }]}>Ask about posts, Reelyx, privacy, teen safety or messages.</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <ClayButton label="Why is my post hidden?" size="sm" variant="soft" onPress={() => setComposer('Why is my new post not showing in the feed?')} />
              <ClayButton label="How do I use Reelyx?" size="sm" variant="soft" onPress={() => setComposer('How do I move between Reelyx videos?')} />
            </View>
          </ClayCard>
        ) : null}

        {messages.map((message) => {
          const isAssistant = message.role === 'assistant';
          const speaking = speakingId === message.id && speechState !== 'idle';
          return (
            <View key={message.id} style={{ flexDirection: 'row', justifyContent: isAssistant ? 'flex-start' : 'flex-end' }}>
              <ClayCard style={{ padding: 14, maxWidth: '86%', gap: 8 }} elevated="soft">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 9, backgroundColor: isAssistant ? colors.accentSoft : colors.secondaryAccentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name={isAssistant ? 'message-square' : 'user'} size={13} color={isAssistant ? colors.accent : colors.secondaryAccent} />
                  </View>
                  <Text style={[type.tiny, { color: colors.muted }]}>{isAssistant ? 'TachiReel assistant' : 'You'}</Text>
                </View>
                <Text style={[type.small, { color: colors.ink }]}>{message.body}</Text>
                {isAssistant && message.id !== 'pending' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {synthesisSupported ? (
                      <ClayButton
                        label={speaking && speechState === 'speaking' ? 'Pause speech' : speaking && speechState === 'paused' ? 'Resume speech' : 'Speak'}
                        icon={speaking && speechState === 'speaking' ? 'pause' : speaking && speechState === 'paused' ? 'play' : 'volume-2'}
                        size="sm"
                        variant="ghost"
                        onPress={() => speak(message)}
                      />
                    ) : null}
                    {speaking ? <ClayButton label="Stop" icon="square" size="sm" variant="ghost" onPress={stopSpeaking} /> : null}
                  </View>
                ) : null}
              </ClayCard>
            </View>
          );
        })}

        <View style={{ gap: 8, marginTop: 10 }}>
          <Text style={[type.tiny, { color: colors.muted }]}>Common questions</Text>
          {allSupportFaqs().slice(0, 4).map((faq) => (
            <Pressable
              key={faq.question}
              onPress={() => setComposer(faq.question)}
              accessibilityLabel={`Ask: ${faq.question}`}
              accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}
            >
              <Feather name="help-circle" size={14} color={colors.accent} />
              <Text style={[type.small, { color: colors.inkSoft, flex: 1 }]}>{faq.question}</Text>
            </Pressable>
          ))}
          <ClayButton label="Browse all articles" icon="book-open" size="sm" variant="ghost" onPress={() => router.push('/(tabs)/support')} />
        </View>
      </ScrollView>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.nav, paddingHorizontal: 20, paddingVertical: 12 }}>
        <View style={{ width: '100%', maxWidth: 820, alignSelf: 'center', gap: 8 }}>
          {listening ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.secondaryAccent }} />
              <Text style={[type.small, { color: colors.inkSoft }]}>Listening… speak now, then edit the text before sending.</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            {recognitionSupported ? (
              <Pressable
                onPress={() => void toggleListening()}
                accessibilityLabel={listening ? 'Stop voice input' : 'Start voice input'}
                style={{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: listening ? colors.secondaryAccent : colors.accentSoft, borderWidth: 1, borderColor: listening ? colors.secondaryAccent : colors.line }}
              >
                <Feather name={listening ? 'mic-off' : 'mic'} size={19} color={listening ? colors.white : colors.accent} />
              </Pressable>
            ) : null}
            <ClayInput
              value={composer}
              onChangeText={setComposer}
              placeholder="Ask about TachiReel…"
              accessibilityLabel="Support chat message"
              multiline
              maxLength={2000}
              style={{ flex: 1 }}
              inputStyle={{ maxHeight: 100 }}
              onSubmitEditing={() => void send()}
            />
            <ClayButton label="Send" icon="send" size="sm" loading={sending} disabled={!composer.trim() || !canUseBackend} onPress={() => void send()} accessibilityLabel="Send support message" />
          </View>
          <Text style={[type.tiny, { color: colors.mutedLight, fontSize: 9 }]}>
            {recognitionSupported
              ? 'Voice uses your browser and needs microphone permission. TachiReel stores only the text you send.'
              : 'Voice is not available here. Typing works on every device.'}
            {synthesisSupported ? ' Spoken replies can be paused or stopped.' : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function generateMetadata() {
  return privatePageMetadata({
    title: "Support chat",
    description: "Chat with TachiReel support about your account.",
    path: "/support/chat",
  });
}
