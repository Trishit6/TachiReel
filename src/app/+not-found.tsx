import { Link } from 'expo-router';
import { View } from 'react-native';
import { TachiReelMark, TachiReelWordmark } from '../components/Brand';
import { SemanticHeading } from '../components/SemanticHeading';
import { ClayButton, ClayCard } from '../components/ui';
import { privatePageMetadata } from '../lib/seo';
import { useTheme } from '../theme/theme';

export function generateMetadata() {
  return privatePageMetadata({
    title: 'Page not found',
    description: 'The page you were looking for is not available on TachiReel.',
    path: '/404',
  });
}

export default function NotFound() {
  const { colors, type } = useTheme();

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 20 }}>
      <ClayCard style={{ width: '100%', maxWidth: 560, padding: 24, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 16 }}>
          <TachiReelMark size={30} />
          <TachiReelWordmark size={20} />
        </View>
        <SemanticHeading style={[type.h1, { color: colors.ink, textAlign: 'center' }]}>This page wandered off.</SemanticHeading>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 20 }}>
          <Link href="/" asChild>
            <ClayButton label="Go to TachiReel" icon="home" />
          </Link>
          <Link href="/discover" asChild>
            <ClayButton label="Explore" variant="secondary" icon="compass" />
          </Link>
          <Link href="/support" asChild>
            <ClayButton label="Help & Support" variant="ghost" icon="help-circle" />
          </Link>
        </View>
      </ClayCard>
    </View>
  );
}
