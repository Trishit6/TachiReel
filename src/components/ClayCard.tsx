import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/theme';

type ClayCardProps = PropsWithChildren<{
  style?: ViewStyle | ViewStyle[];
  color?: string;
  radius?: number;
  padding?: number;
  elevated?: 'soft' | 'lifted' | 'clay' | 'floating';
  border?: boolean;
}>;

export function ClayCard({
  children,
  style,
  color,
  radius,
  padding,
  elevated = 'clay',
  border = true,
}: ClayCardProps) {
  const { colors, radii, shadows } = useTheme();
  const corner = radius ?? radii.card;

  return (
    <View
      style={[
        shadows[elevated],
        {
          backgroundColor: color ?? colors.surface,
          borderRadius: corner,
          borderWidth: border ? 1 : 0,
          borderColor: colors.highlight,
        },
        padding !== undefined ? { padding } : undefined,
        style,
      ].filter(Boolean)}
    >
      {children}
    </View>
  );
}

export const clayCardStyles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});

// Kept so older screens can still import the named style helper.
export const styles = StyleSheet.create({});
