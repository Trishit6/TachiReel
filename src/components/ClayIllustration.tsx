import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme/theme';

// A stacked, soft-clay heart built from rounded surfaces so it needs no image asset.
export function ClayHeart({ size = 280 }: { size?: number }) {
  const { colors, shadows } = useTheme();
  const unit = size / 280;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={[
          styles.layer,
          {
            width: 218 * unit,
            height: 218 * unit,
            borderRadius: 76 * unit,
            backgroundColor: colors.mint,
            transform: [{ rotate: '-13deg' }],
          },
        ]}
      />
      <View
        style={[
          styles.layer,
          {
            width: 186 * unit,
            height: 186 * unit,
            borderRadius: 64 * unit,
            backgroundColor: colors.accentSoft,
            transform: [{ rotate: '11deg' }],
          },
        ]}
      />
      <View
        style={[
          styles.heart,
          shadows.floating,
          {
            width: 124 * unit,
            height: 124 * unit,
            borderRadius: 44 * unit,
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.highlight,
            transform: [{ rotate: '-7deg' }],
          },
        ]}
      >
        <View
          style={{
            width: 78 * unit,
            height: 78 * unit,
            borderRadius: 28 * unit,
            backgroundColor: colors.peachSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="heart" size={40 * unit} color={colors.peach} />
        </View>
      </View>
      <View
        style={[
          styles.chip,
          shadows.soft,
          {
            width: 48 * unit,
            height: 48 * unit,
            borderRadius: 17 * unit,
            backgroundColor: colors.butter,
            right: 22 * unit,
            top: 34 * unit,
            transform: [{ rotate: '12deg' }],
          },
        ]}
      >
        <Feather name="star" size={19 * unit} color={colors.ink} />
      </View>
      <View
        style={[
          styles.chip,
          shadows.soft,
          {
            width: 54 * unit,
            height: 54 * unit,
            borderRadius: 19 * unit,
            backgroundColor: colors.peach,
            left: 20 * unit,
            bottom: 40 * unit,
            transform: [{ rotate: '-9deg' }],
          },
        ]}
      >
        <Feather name="sun" size={21 * unit} color={colors.ink} />
      </View>
      <View
        style={[
          styles.chip,
          {
            width: 20 * unit,
            height: 20 * unit,
            borderRadius: 8 * unit,
            backgroundColor: colors.accent,
            left: 46 * unit,
            top: 44 * unit,
          },
        ]}
      />
      <View
        style={[
          styles.chip,
          {
            width: 14 * unit,
            height: 14 * unit,
            borderRadius: 7 * unit,
            backgroundColor: colors.mint,
            right: 44 * unit,
            bottom: 46 * unit,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute' },
  heart: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  chip: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
});
