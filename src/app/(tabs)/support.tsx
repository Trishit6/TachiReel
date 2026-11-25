import { publicPageMetadata } from '../../lib/seo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Link, router } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import {
  Badge,
  ClayButton,
  ClayCard,
  EmptyState,
  Notice,
  PageHeader,
  SearchField,
  Skeleton,
  type IconName,
} from '../../components/ui';
import { formatRelativeTime } from '../../lib/format';
import { isDemoMode } from '../../lib/demo-data';
import { useSession } from '../../lib/session';
import { fetchSupportStats, fetchSupportTickets, type SupportStats, type SupportStatus, type SupportTicket } from '../../lib/support';
import { allSupportArticles, allSupportFaqs, loadPublishedHelpContent, searchSupportArticles } from '../../lib/support-content';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/theme';

const STATUSES: Record<SupportStatus, { label: string; tone: 'sage' | 'butter' | 'mint' | 'muted' }> = {
  open: { label: 'Open', tone: 'butter' },
  pending: { label: 'Pending', tone: 'sage' },
  resolved: { label: 'Resolved', tone: 'mint' },
  closed: { label: 'Closed', tone: 'muted' },
};

export default function SupportScreen() {
  const { colors, type } = useTheme();
  const { width } = useWindowDimensions();
  const { userId } = useSession();
  const twoColumn = width >= 1000;

  const [query, setQuery] = useState('');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [stats, setStats] = useState<SupportStats>({ open: 0, pending: 0, resolved: 0, closed: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [helpReady, setHelpReady] = useState(false);
  const loadedForRef = useRef<string | null>(null);

  const canUseBackend = !isDemoMode && Boolean(supabase && userId);
  const results = useMemo(() => {
    // helpReady intentionally invalidates results once published content loads.
    void helpReady;
    return query.trim() ? searchSupportArticles(query) : [];
  }, [helpReady, query]);

  // Tickets are loaded once per signed-in user. Preview mode never fakes them.
  useEffect(() => {
    if (!canUseBackend || !supabase || !userId || loadedForRef.current === userId) return;
    loadedForRef.current = userId;
    void (async () => {
      try {
        const rows = await fetchSupportTickets(supabase, userId);
        setTickets(rows);
        setStats(await fetchSupportStats(supabase, rows));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load your tickets.');
      } finally {
        setLoading(false);
      }
    })();
  }, [canUseBackend, userId]);

  // Published admin content is anonymous-safe and optional: the migration may
  // not be applied yet, so static guides remain the fallback.
  useEffect(() => {
    if (!supabase || helpReady) return;
    void loadPublishedHelpContent(supabase).finally(() => setHelpReady(true));
  }, [helpReady]);

  const statItems: { label: string; value: number; icon: IconName; color: string }[] = [
    { label: 'Open', value: stats.open, icon: 'mail', color: colors.peach },
    { label: 'Pending', value: stats.pending, icon: 'clock', color: colors.accent },
    { label: 'Resolved', value: stats.resolved, icon: 'check-circle', color: colors.success },
    { label: 'Total', value: stats.total, icon: 'file-text', color: colors.inkSoft },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 80, gap: 18 }}
      showsVerticalScrollIndicator={false}
    >
      <PageHeader
        eyebrow="Here when you need us"
        title="Help & Support."
        subtitle="Find an answer, ask the assistant, or open a private ticket with the team."
        actions={
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <ClayButton label="Ask assistant" icon="message-square" size="sm" variant="secondary" onPress={() => router.push('/(tabs)/support/chat')} />
            <ClayButton label="New ticket" icon="plus" size="sm" onPress={() => router.push('/(tabs)/support/new')} />
          </View>
        }
      />

      {isDemoMode ? (
        <Notice tone="info" text="Preview mode: articles and FAQs work offline. Tickets, replies and AI chat need a connected Supabase project and a deployed support function." />
      ) : null}
      {error ? <Notice tone="error" text={error} /> : null}

      <ClayCard style={{ padding: 18 }} elevated="soft">
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search articles, guides and FAQs"
        />
        {query.trim() ? (
          <View style={{ marginTop: 14, gap: 6 }}>
            <Text style={[type.tiny, { color: colors.muted, marginBottom: 2 }]}>
              {results.length === 0 ? 'No matching articles. Try a different word or open a ticket.' : `${results.length} ${results.length === 1 ? 'article' : 'articles'} found`}
            </Text>
            {results.map(({ article }) => (
              <Link
                key={article.slug}
                href={{ pathname: '/(tabs)/support/articles/[slug]', params: { slug: article.slug } }}
                asChild
              >
                <Pressable
                  accessibilityLabel={`Open article: ${article.title}`}
                  accessibilityRole="button"
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12, backgroundColor: pressed ? colors.backgroundAlt : 'transparent' })}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="book-open" size={15} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[type.smallMedium, { color: colors.ink }]}>{article.title}</Text>
                    <Text numberOfLines={1} style={[type.tiny, { color: colors.muted, fontSize: 9 }]}>{article.category} · {article.minutes} min read</Text>
                  </View>
                  <Feather name="chevron-right" size={15} color={colors.mutedLight} />
                </Pressable>
              </Link>
            ))}
          </View>
        ) : null}
      </ClayCard>

      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {statItems.map((item) => (
          <ClayCard key={item.label} style={{ flex: 1, minWidth: 132, padding: 14, gap: 8 }} elevated="soft">
            <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name={item.icon} size={15} color={item.color} />
            </View>
            <Text style={[type.h2, { color: colors.ink, fontSize: 24 }]}>{canUseBackend ? item.value : '—'}</Text>
            <Text style={[type.tiny, { color: colors.muted }]}>{item.label} tickets</Text>
          </ClayCard>
        ))}
      </View>

      <View style={{ flexDirection: twoColumn ? 'row' : 'column', alignItems: 'flex-start', gap: 18 }}>
        <View style={{ flex: 1, width: twoColumn ? undefined : '100%', gap: 18, minWidth: 0 }}>
          <SupportSection title="Popular guides" subtitle="Short answers written for this build of TachiReel">
            {allSupportArticles().slice(0, 5).map((article) => (
              <SupportRow
                key={article.slug}
                icon="book-open"
                title={article.title}
                description={article.summary}
                meta={`${article.category} · ${article.minutes} min`}
                href={{ pathname: '/(tabs)/support/articles/[slug]', params: { slug: article.slug } }}
              />
            ))}
          </SupportSection>

          <SupportSection title="Your tickets" subtitle={canUseBackend ? 'Only you can see these conversations.' : 'Connect a backend to create and track tickets.'}>
            {!canUseBackend ? (
              <EmptyState icon="inbox" title="No tickets in Preview mode." description="Open a ticket after connecting Supabase to keep a private conversation with support." />
            ) : loading ? (
              <View style={{ gap: 8 }}><Skeleton height={64} /><Skeleton height={64} /></View>
            ) : tickets.length === 0 ? (
              <EmptyState
                icon="file-text"
                title="No tickets yet."
                description="If an answer does not solve it, open a ticket and we will pick it up from there."
                action={<ClayButton label="Open your first ticket" size="sm" icon="plus" onPress={() => router.push('/(tabs)/support/new')} />}
              />
            ) : (
              tickets.map((ticket) => {
                const status = STATUSES[ticket.status];
                return (
                  <Pressable
                    key={ticket.id}
                    onPress={() => router.push({ pathname: '/(tabs)/support/tickets/[id]', params: { id: ticket.id } })}
                    accessibilityLabel={`Open ticket: ${ticket.subject}`}
                    accessibilityRole="button"
                    style={({ pressed }) => ({ gap: 6, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, opacity: pressed ? 0.8 : 1 })}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      <Text numberOfLines={2} style={[type.smallMedium, { color: colors.ink, flex: 1 }]}>{ticket.subject}</Text>
                      <Badge label={status.label} tone={status.tone} />
                    </View>
                    {ticket.last_message ? <Text numberOfLines={2} style={[type.small, { color: colors.muted, fontSize: 11 }]}>{ticket.last_message.author_role === 'support' ? 'Support: ' : 'You: '}{ticket.last_message.body}</Text> : null}
                    <Text style={[type.tiny, { color: colors.mutedLight, fontSize: 9 }]}>
                      {ticket.message_count} {ticket.message_count === 1 ? 'message' : 'messages'} · updated {formatRelativeTime(ticket.updated_at)}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </SupportSection>
        </View>

        <View style={{ flex: 1, width: twoColumn ? undefined : '100%', gap: 18, minWidth: 0 }}>
          <SupportSection title="Frequently asked" subtitle="Tap a question to see the short answer.">
            {allSupportFaqs().map((faq) => {
              const open = openFaq === faq.question;
              return (
                <View key={faq.question} style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
                  <Pressable
                    onPress={() => setOpenFaq(open ? null : faq.question)}
                    accessibilityRole="button"
                    accessibilityLabel={faq.question}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}
                  >
                    <Text style={[type.smallMedium, { color: colors.ink, flex: 1 }]}>{faq.question}</Text>
                    <Feather name={open ? 'chevron-up' : 'chevron-down'} size={15} color={colors.muted} />
                  </Pressable>
                  {open ? (
                    <View style={{ paddingBottom: 12, gap: 8 }}>
                      <Text style={[type.small, { color: colors.inkSoft }]}>{faq.answer}</Text>
                      <Link href={{ pathname: '/(tabs)/support/articles/[slug]', params: { slug: faq.articleSlug } }} asChild>
                        <ClayButton
                          label="Read the full guide"
                          size="sm"
                          variant="ghost"
                          icon="arrow-right"
                        />
                      </Link>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </SupportSection>

          <ClayCard style={{ padding: 18, gap: 12 }} elevated="soft">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 38, height: 38, borderRadius: 14, backgroundColor: colors.secondaryAccentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="life-buoy" size={18} color={colors.secondaryAccent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.h3, { color: colors.ink }]}>Still stuck?</Text>
                <Text style={[type.small, { color: colors.muted, fontSize: 11 }]}>A private ticket keeps the details out of public posts and comments.</Text>
              </View>
            </View>
            <ClayButton label="Create a support ticket" icon="plus" full onPress={() => router.push('/(tabs)/support/new')} />
          </ClayCard>
        </View>
      </View>
    </ScrollView>
  );
}

function SupportSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const { colors, type } = useTheme();
  return (
    <ClayCard style={{ padding: 18, gap: 4 }} elevated="soft">
      <Text style={[type.h3, { color: colors.ink }]}>{title}</Text>
      {subtitle ? <Text style={[type.small, { color: colors.muted, fontSize: 11, marginBottom: 6 }]}>{subtitle}</Text> : null}
      {children}
    </ClayCard>
  );
}

function SupportRow({ icon, title, description, meta, href }: { icon: IconName; title: string; description: string; meta?: string; href: { pathname: '/(tabs)/support/articles/[slug]'; params: { slug: string } } }) {
  const { colors, type } = useTheme();
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityLabel={`Open guide: ${title}`}
        accessibilityRole="button"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, opacity: pressed ? 0.8 : 1 })}
      >
        <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={icon} size={16} color={colors.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text numberOfLines={1} style={[type.smallMedium, { color: colors.ink }]}>{title}</Text>
          <Text numberOfLines={2} style={[type.small, { color: colors.muted, fontSize: 11 }]}>{description}</Text>
          {meta ? <Text style={[type.tiny, { color: colors.mutedLight, fontSize: 9 }]}>{meta}</Text> : null}
        </View>
        <Feather name="chevron-right" size={16} color={colors.mutedLight} style={{ marginTop: 8 }} />
      </Pressable>
    </Link>
  );
}

export function generateMetadata() {
  return publicPageMetadata({
    title: "Help & Support",
    description: "Find TachiReel help articles, contact support and read answers about safety, privacy, posts and Reelyx.",
    path: "/support",
  });
}
