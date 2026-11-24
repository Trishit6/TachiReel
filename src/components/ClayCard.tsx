import { useState, type PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { surfaceTransition, useTheme } from '../theme/theme';

type ClayCardProps = PropsWithChildren<{
  style?: ViewStyle | ViewStyle[];
  color?: string;
  radius?: number;
  padding?: number;
  elevated?: 'soft' | 'lifted' | 'clay' | 'floating';
  border?: boolean;
  /** Opt in to a quiet hover border change for cards that are content surfaces. */
  interactive?: boolean;
}>;

export function ClayCard({
  children,
  style,
  color,
  radius,
  padding,
  elevated = 'clay',
  border = true,
  interactive = false,
}: ClayCardProps) {
  const { colors, radii, shadows } = useTheme();
  const [hovered, setHovered] = useState(false);
  const corner = radius ?? radii.card;
  const hoverProps = interactive
    ? ({ onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) } as unknown as ViewProps)
    : {};

  return (
    <View
      {...hoverProps}
      style={[
        shadows[elevated],
        {
          backgroundColor: color ?? colors.surface,
          borderRadius: corner,
          borderWidth: border ? 1 : 0,
          borderColor: interactive && hovered ? colors.lineStrong : colors.highlight,
          ...surfaceTransition(),
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
