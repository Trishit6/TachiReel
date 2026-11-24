import type { CSSProperties, ReactNode } from 'react';
import { Platform, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

type Props = {
  level?: 1 | 2 | 3;
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  numberOfLines?: number;
  visuallyHidden?: boolean;
};

/**
 * Keeps the existing visual typography while giving each screen one real HTML
 * heading on web. Native keeps the same React Native Text rendering.
 */
export function SemanticHeading({ level = 1, children, style, accessibilityLabel, numberOfLines, visuallyHidden = false }: Props) {
  if (Platform.OS !== 'web') {
    return (
      <Text
        style={style}
        numberOfLines={numberOfLines}
        accessibilityRole="header"
        aria-level={level}
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </Text>
    );
  }

  const flattened = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3';
  const domStyle = {
    ...flattened,
    display: 'block',
    margin: 0,
    padding: 0,
    boxSizing: 'border-box',
    ...(numberOfLines === 1
      ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }
      : null),
    ...(visuallyHidden
      ? {
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          clipPath: 'inset(50%)',
          whiteSpace: 'nowrap',
          borderWidth: 0,
        }
      : null),
  } as CSSProperties;

  return (
    <Tag style={domStyle} aria-label={accessibilityLabel}>
      {children}
    </Tag>
  );
}
