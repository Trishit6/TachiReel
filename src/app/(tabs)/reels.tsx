import { privatePageMetadata } from '../../lib/seo';
import { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SemanticHeading } from '../../components/SemanticHeading';
import { useTheme } from '../../theme/theme';

/** Legacy route: the section is now officially named Reelyx. */
export default function ReelsRedirect() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();

  useEffect(() => {
    router.replace({
      pathname: '/(tabs)/reelyx',
      params: params.id ? { id: params.id } : undefined,
    });
  }, [params.id]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SemanticHeading visuallyHidden>Reelyx</SemanticHeading>
    </View>
  );
}

export function generateMetadata() {
  return privatePageMetadata({
    title: "Reelyx",
    description: "Redirecting to TachiReel Reelyx.",
    path: "/reels",
  });
}

export function generateStaticParams() {
  return [];
}
