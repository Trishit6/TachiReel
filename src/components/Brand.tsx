import Svg, { Circle, G, Path } from 'react-native-svg';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/theme';
import { brand } from '../theme/brand';

export type TachiReelLogoVariant = 'full' | 'symbol' | 'compact';

export function TachiReelMark({ size = 40 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      accessibilityLabel="TachiReel symbol"
    >
      <Circle cx="256" cy="256" r="236" fill={brand.reelRed} />
      <G transform="rotate(-7 256 256)" stroke={brand.paperCream} strokeWidth={34} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M148 166 C206 178 291 175 360 157" />
        <Path d="M264 157 C251 220 250 291 237 350" />
      </G>
      <Circle cx="333" cy="309" r="18" fill={brand.paperCream} />
    </Svg>
  );
}

export function TachiReelWordmark({ size = 26, color }: { size?: number; color?: string }) {
  const { resolved } = useTheme();
  const ink = color ?? (resolved === 'dark' ? brand.paperCream : brand.inkBlack);

  return (
    <Text
      accessibilityLabel="TachiReel"
      allowFontScaling={false}
      numberOfLines={1}
      style={[styles.wordmark, { fontSize: size, color: ink, letterSpacing: -size * 0.035 }]}
    >
      <Text style={[styles.wordmark, { color: ink }]}>Tachi</Text>
      <Text style={[styles.wordmark, { color: brand.reelRed }]}>Reel</Text>
    </Text>
  );
}

export function TachiReelLogo({
  size = 40,
  variant = 'full',
  color,
  style,
}: {
  size?: number;
  variant?: TachiReelLogoVariant;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const markSize = variant === 'compact' ? Math.round(size * 0.76) : size;
  const wordSize = variant === 'compact' ? Math.round(size * 0.58) : Math.round(size * 0.66);
  const gap = variant === 'compact' ? Math.round(size * 0.16) : Math.round(size * 0.22);

  return (
    <View style={[styles.row, { gap }, style]} accessibilityLabel="TachiReel">
      <TachiReelMark size={markSize} />
      {variant === 'symbol' ? null : <TachiReelWordmark size={wordSize} color={color} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  wordmark: { fontFamily: 'BricolageGrotesque_800ExtraBold', fontWeight: '800' },
});
