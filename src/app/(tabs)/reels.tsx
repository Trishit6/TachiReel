import { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
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

  return <View style={{ flex: 1, backgroundColor: colors.background }} />;
}
