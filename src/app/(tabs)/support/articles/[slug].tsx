import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { SemanticHeading } from '../../../../components/SemanticHeading';
import { ClayButton, ClayCard, EmptyState, LoadingState, PageHeader } from '../../../../components/ui';
import { privatePageMetadata, publicPageMetadata } from '../../../../lib/seo';
import { allSupportArticles, getSupportArticle, loadPublishedHelpContent, SUPPORT_ARTICLES } from '../../../../lib/support-content';
import { supabase } from '../../../../lib/supabase';
import { useTheme } from '../../../../theme/theme';

export function generateStaticParams() {
  return SUPPORT_ARTICLES.map((article) => ({ slug: article.slug }));
}

export function generateMetadata(_request: unknown, params: Record<string, string | string[]>) {
  const rawSlug = params.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  const article = SUPPORT_ARTICLES.find((item) => item.slug === slug);
  if (!article) {
    return privatePageMetadata({
      title: 'Guide not found',
      description: 'This TachiReel help guide is not available.',
      path: '/support/articles/[slug]',
    });
  }
  return publicPageMetadata({
    title: article.title,
    description: article.summary,
    path: `/support/articles/${article.slug}`,
    keywords: article.keywords,
    type: 'article',
  });
}

export default function SupportArticleScreen() {
  const { colors, type } = useTheme();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const [helpReady, setHelpReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase || helpReady) return;
    void loadPublishedHelpContent(supabase).finally(() => setHelpReady(true));
  }, [helpReady]);

  if (!helpReady) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <SemanticHeading visuallyHidden>Help guide</SemanticHeading>
        <LoadingState label="Loading guide" />
      </View>
    );
  }

  const articles = allSupportArticles();
  const article = getSupportArticle(slug);

  if (!article) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <SemanticHeading visuallyHidden>Help guide not found</SemanticHeading>
        <ClayCard style={{ width: '100%', maxWidth: 520, padding: 12 }}>
          <EmptyState icon="file-text" title="We could not find that guide." description="It may have moved. Browse the help centre to find the current version." />
        </ClayCard>
        <View style={{ marginTop: 14 }}>
          <ClayButton label="Back to Help & Support" icon="arrow-left" onPress={() => router.push('/(tabs)/support')} />
        </View>
      </View>
    );
  }

  const related = articles.filter((item) => item.slug !== article.slug && item.category === article.category).slice(0, 3);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ width: '100%', maxWidth: 820, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 80, gap: 18 }}
      showsVerticalScrollIndicator={false}
    >
      <PageHeader
        eyebrow={article.category}
        title={article.title}
        subtitle={`${article.minutes} min read · TachiReel help centre`}
        actions={<ClayButton label="All articles" icon="arrow-left" size="sm" variant="secondary" onPress={() => router.push('/(tabs)/support')} />}
      />

      <ClayCard style={{ padding: 18, gap: 14 }} elevated="soft">
        {article.sections.map((section) => (
          <View key={section.heading} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="chevron-right" size={13} color={colors.accent} />
              </View>
              <Text style={[type.h3, { color: colors.ink }]}>{section.heading}</Text>
            </View>
            <Text style={[type.body, { color: colors.inkSoft, lineHeight: 24 }]}>{section.body}</Text>
          </View>
        ))}
      </ClayCard>

      {related.length > 0 ? (
        <ClayCard style={{ padding: 18, gap: 8 }} elevated="soft">
          <Text style={[type.h3, { color: colors.ink }]}>Related guides</Text>
          {related.map((item) => (
            <ClayButton
              key={item.slug}
              label={item.title}
              icon="book-open"
              variant="ghost"
              onPress={() => router.push({ pathname: '/(tabs)/support/articles/[slug]', params: { slug: item.slug } })}
            />
          ))}
        </ClayCard>
      ) : null}

      <ClayCard style={{ padding: 18, gap: 12 }} elevated="soft">
        <Text style={[type.h3, { color: colors.ink }]}>Did this help?</Text>
        <Text style={[type.small, { color: colors.muted }]}>If the guide did not cover your situation, open a private ticket with the details.</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <ClayButton label="Open a ticket" icon="plus" size="sm" onPress={() => router.push('/(tabs)/support/new')} />
          <ClayButton label="Ask the assistant" icon="message-square" size="sm" variant="secondary" onPress={() => router.push('/(tabs)/support/chat')} />
        </View>
      </ClayCard>
    </ScrollView>
  );
}
