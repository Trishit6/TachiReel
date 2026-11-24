import { ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ClayButton, ClayCard, EmptyState, PageHeader } from '../../../../components/ui';
import { SUPPORT_ARTICLES, getSupportArticle } from '../../../../lib/support-content';
import { useTheme } from '../../../../theme/theme';

export default function SupportArticleScreen() {
  const { colors, type } = useTheme();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const article = getSupportArticle(slug);

  if (!article) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <ClayCard style={{ width: '100%', maxWidth: 520, padding: 12 }}>
          <EmptyState icon="file-text" title="We could not find that guide." description="It may have moved. Browse the help centre to find the current version." />
        </ClayCard>
        <View style={{ marginTop: 14 }}>
          <ClayButton label="Back to Help & Support" icon="arrow-left" onPress={() => router.push('/(tabs)/support')} />
        </View>
      </View>
    );
  }

  const related = SUPPORT_ARTICLES.filter((item) => item.slug !== article.slug && item.category === article.category).slice(0, 3);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ width: '100%', maxWidth: 820, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 100, gap: 18 }}
      showsVerticalScrollIndicator={false}
    >
      <PageHeader
        eyebrow={article.category}
        title={article.title}
        subtitle={`${article.minutes} min read · TachiReel help centre`}
        actions={<ClayButton label="All articles" icon="arrow-left" size="sm" variant="secondary" onPress={() => router.push('/(tabs)/support')} />}
      />

      <ClayCard style={{ padding: 22, gap: 20 }} elevated="soft">
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
