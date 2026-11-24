import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { ClayCard } from './ClayCard';
import { SemanticHeading } from './SemanticHeading';
import { surfaceTransition, useTheme } from '../theme/theme';

export { ClayCard } from './ClayCard';

export type IconName = keyof typeof Feather.glyphMap;

const PASTELS = ['sage', 'mint', 'peach', 'butter'] as const;

function initialsFor(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function pastelFor(name: string): (typeof PASTELS)[number] {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = (hash + name.charCodeAt(index) * 17) % 997;
  return PASTELS[hash % PASTELS.length];
}

export function Avatar({
  uri,
  name,
  size = 44,
  ring = false,
}: {
  uri?: string | null;
  name: string;
  size?: number;
  ring?: boolean;
}) {
  const { colors } = useTheme();
  const tint = colors[pastelFor(name || 'TachiReel')];
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(uri) && !failed;
  const outer = size + (ring ? 6 : 0);

  return (
    <View
      style={{
        width: outer,
        height: outer,
        borderRadius: outer / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceRaised,
        borderWidth: ring ? 2 : 1,
        borderColor: ring ? colors.accent : colors.line,
      }}
    >
      {showImage ? (
        <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
          <Animated.Image
            source={{ uri: uri ?? undefined }}
            onError={() => setFailed(true)}
            style={{ width: size, height: size }}
            resizeMode="cover"
          />
        </View>
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: tint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: size * 0.3, color: colors.ink }}>
            {initialsFor(name || '?')}
          </Text>
        </View>
      )}
    </View>
  );
}

export function PressableScale({
  children,
  onPress,
  onLongPress,
  disabled,
  style,
  accessibilityLabel,
  accessibilityRole = 'button',
  hitSlop,
  onHoverIn,
  onHoverOut,
  onFocus,
  onBlur,
  focusRingMode = 'default',
}: {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link' | 'tab';
  hitSlop?: number;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
  onFocus?: (event?: any) => void;
  onBlur?: (event?: any) => void;
  focusRingMode?: 'default' | 'keyboard';
}) {
  const { colors, radii, reduceMotion, motion } = useTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const [keyboardFocus, setKeyboardFocus] = useState(false);

  const animate = (to: number) => {
    if (reduceMotion) {
      scale.setValue(to);
      return;
    }
    Animated.timing(scale, {
      toValue: to,
      duration: motion.duration.fast,
      easing: motion.easing,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  useEffect(() => () => scale.stopAnimation(), [scale]);

  const syncKeyboardFocus = (event?: any) => {
    if (focusRingMode !== 'keyboard' || Platform.OS !== 'web') return;
    let keyboard = true;
    try {
      const target = event?.currentTarget ?? (typeof document !== 'undefined' ? document.activeElement : null);
      keyboard = typeof target?.matches === 'function' ? target.matches(':focus-visible') : true;
    } catch {
      keyboard = true;
    }
    setKeyboardFocus(keyboard);
  };

  const handleFocus = (event: any) => {
    syncKeyboardFocus(event);
    onFocus?.(event);
  };

  const handleBlur = (event: any) => {
    setKeyboardFocus(false);
    onBlur?.(event);
  };

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={(event: any) => {
        syncKeyboardFocus(event);
        animate(0.97);
      }}
      onPressOut={() => animate(1)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onHoverIn={() => onHoverIn?.()}
      onHoverOut={() => onHoverOut?.()}
      hitSlop={hitSlop}
      style={(state: any) => [
        style,
        Platform.OS === 'web' && !disabled ? { cursor: 'pointer' as const } : undefined,
        Platform.OS === 'web' && !disabled && focusRingMode === 'keyboard' && keyboardFocus
          ? {
              outlineStyle: 'solid' as const,
              outlineWidth: 2,
              outlineColor: colors.focus,
              outlineOffset: 2,
              borderRadius: radii.control,
            }
          : Platform.OS === 'web' && state.focused && !disabled && focusRingMode === 'default'
            ? { outlineStyle: 'solid' as const, outlineWidth: 2, outlineColor: colors.focus, outlineOffset: 2 }
            : undefined,
        disabled && { opacity: 0.45 },
        state.hovered && !disabled && { opacity: 0.96 },
        state.pressed && { opacity: 0.9 },
      ].filter(Boolean)}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'text' | 'soft' | 'ghost' | 'danger' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

export function ClayButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  full = false,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { colors, radii, type, shadows } = useTheme();
  const [hovered, setHovered] = useState(false);
  const heights: Record<ButtonSize, number> = { sm: 38, md: 48, lg: 54 };
  const pads: Record<ButtonSize, number> = { sm: 14, md: 18, lg: 22 };
  const palette: Record<ButtonVariant, { bg: string; hover: string; fg: string; border: string }> = {
    primary: { bg: colors.accent, hover: colors.accentHover, fg: colors.accentContrast, border: colors.accentHover },
    secondary: { bg: colors.surface, hover: colors.backgroundAlt, fg: colors.ink, border: colors.lineStrong },
    outline: { bg: 'transparent', hover: colors.backgroundAlt, fg: colors.ink, border: colors.lineStrong },
    text: { bg: 'transparent', hover: colors.accentSoft, fg: colors.accent, border: 'transparent' },
    soft: { bg: colors.accentSoft, hover: colors.accentSoft, fg: colors.accent, border: colors.accentSoft },
    ghost: { bg: 'transparent', hover: colors.backgroundAlt, fg: colors.inkSoft, border: 'transparent' },
    danger: { bg: colors.dangerSoft, hover: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
    destructive: { bg: colors.danger, hover: colors.danger, fg: colors.dangerContrast, border: colors.danger },
  };
  const { bg, hover, fg, border } = palette[variant];
  const inactive = disabled || loading;

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      accessibilityLabel={accessibilityLabel ?? label}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[full ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }, style]}
    >
      <View
        style={[
          {
            height: heights[size],
            paddingHorizontal: pads[size],
            borderRadius: size === 'sm' ? radii.control : radii.input,
            backgroundColor: hovered && !inactive ? hover : bg,
            borderWidth: border === 'transparent' ? 0 : 1,
            borderColor: border,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          },
          (variant === 'primary' || variant === 'destructive') && !inactive ? shadows.soft : undefined,
          surfaceTransition(),
        ].filter(Boolean)}
      >
        {loading ? (
          <ActivityIndicator size="small" color={fg} />
        ) : icon ? (
          <Feather name={icon} size={size === 'sm' ? 14 : 17} color={fg} />
        ) : null}
        <Text style={[type.button, size === 'sm' && type.buttonSmall, { color: fg }].filter(Boolean)}>{label}</Text>
        {iconRight && !loading ? <Feather name={iconRight} size={size === 'sm' ? 14 : 16} color={fg} /> : null}
      </View>
    </PressableScale>
  );
}

/** Button aliases make the intended action explicit without new visual languages. */
export function TextButton(props: Omit<Parameters<typeof ClayButton>[0], 'variant'>) {
  return <ClayButton {...props} variant="text" />;
}

export function OutlineButton(props: Omit<Parameters<typeof ClayButton>[0], 'variant'>) {
  return <ClayButton {...props} variant="outline" />;
}

export function DestructiveButton(props: Omit<Parameters<typeof ClayButton>[0], 'variant'>) {
  return <ClayButton {...props} variant="destructive" />;
}

export function IconButton({
  icon,
  onPress,
  label,
  size = 42,
  variant = 'surface',
  active = false,
  disabled = false,
  loading = false,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  size?: number;
  variant?: 'surface' | 'ghost' | 'soft';
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radii } = useTheme();
  const [hovered, setHovered] = useState(false);
  const background = active
    ? colors.accentSoft
    : hovered && !disabled
      ? colors.backgroundAlt
      : variant === 'surface'
        ? colors.surface
        : variant === 'soft'
          ? colors.backgroundAlt
          : 'transparent';
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={label}
      disabled={disabled || loading}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={style}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: Math.min(radii.control, size / 2),
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: background,
          borderWidth: variant === 'ghost' ? 0 : 1,
          borderColor: active ? colors.accent : colors.line,
          ...surfaceTransition(),
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={active ? colors.accent : colors.inkSoft} />
        ) : (
          <Feather name={icon} size={Math.round(size * 0.44)} color={active ? colors.accent : colors.inkSoft} />
        )}
      </View>
    </PressableScale>
  );
}

export function ClayInput({
  label,
  error,
  icon,
  rightAccessory,
  multiline,
  style,
  inputStyle,
  secureTextEntry,
  ...rest
}: TextInputProps & {
  label?: string;
  error?: string | null;
  icon?: IconName;
  rightAccessory?: ReactNode;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}) {
  const { colors, radii, type } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <Text style={[type.tiny, { color: colors.muted }]}>{label}</Text> : null}
      <View
        style={{
          minHeight: multiline ? 112 : 48,
          borderRadius: radii.input,
          borderWidth: 1,
          borderColor: error ? colors.danger : focused ? colors.focus : colors.inputBorder,
          backgroundColor: colors.input,
          ...surfaceTransition(),
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          paddingHorizontal: 14,
          paddingVertical: multiline ? 10 : 0,
          gap: 10,
        }}
      >
        {icon ? <Feather name={icon} size={17} color={focused ? colors.focus : colors.muted} style={{ marginTop: multiline ? 4 : 0 }} /> : null}
        <TextInput
          {...rest}
          multiline={multiline}
          secureTextEntry={secureTextEntry}
          placeholderTextColor={colors.mutedLight}
          selectionColor={colors.focus}
          onFocus={(event) => {
            setFocused(true);
            rest.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            rest.onBlur?.(event);
          }}
          style={[
            type.body,
            {
              flex: 1,
              color: colors.ink,
              paddingVertical: multiline ? 0 : 12,
              minHeight: multiline ? 92 : undefined,
              textAlignVertical: multiline ? 'top' : 'center',
              outlineStyle: 'solid' as const,
              outlineWidth: 0,
              outlineColor: 'transparent',
            },
            inputStyle,
          ]}
        />
        {rightAccessory}
      </View>
      {error ? <Text style={[type.small, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search',
  onSubmit,
  onFocus,
  onBlur,
  onKeyDown,
  style,
  compact = false,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: any) => void;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const { colors, radii, type } = useTheme();
  const [focused, setFocused] = useState(false);
  const [pointerFocus, setPointerFocus] = useState(false);

  // Text inputs always match :focus-visible in Chromium, so pointer intent has
  // to be tracked explicitly. Mouse/touch focus stays borderless; keyboard
  // focus keeps a deliberate, theme-coloured ring.
  const pointerProps = Platform.OS === 'web'
    ? ({ onPointerDown: () => setPointerFocus(true) } as unknown as TextInputProps)
    : {};
  const keyboardFocus = focused && !pointerFocus;

  return (
    <View
      style={[
        {
          height: compact ? 40 : 46,
          borderRadius: radii.pill,
          borderWidth: 1,
          borderColor: keyboardFocus ? colors.focus : 'transparent',
          backgroundColor: colors.input,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
          paddingHorizontal: 14,
          ...surfaceTransition(),
          ...(keyboardFocus
            ? {
                outlineStyle: 'solid' as const,
                outlineWidth: 2,
                outlineColor: colors.focus,
                outlineOffset: 2,
              }
            : {}),
        },
        style,
      ]}
    >
      <Feather name="search" size={compact ? 14 : 16} color={focused ? colors.focus : colors.muted} />
      <TextInput
        {...pointerProps}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedLight}
        returnKeyType="search"
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          setPointerFocus(false);
          onBlur?.();
        }}
        onKeyDown={onKeyDown}
        // Chromium applies its own light outline to focused text inputs.
        // Override it here instead of hiding it with an unrelated wrapper rule.
        style={[
          type.small,
          {
            flex: 1,
            color: colors.ink,
            paddingVertical: 0,
            outlineStyle: 'solid' as const,
            outlineWidth: 0,
            outlineColor: 'transparent',
          },
        ]}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} accessibilityLabel="Clear search" hitSlop={8}>
          <Feather name="x" size={14} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Chip({
  label,
  active = false,
  onPress,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) {
  const { colors, radii, type } = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label}>
      <View
        style={{
          height: 36,
          paddingHorizontal: 14,
          borderRadius: radii.pill,
          backgroundColor: active ? colors.accent : colors.surface,
          borderWidth: 1,
          borderColor: active ? colors.accent : colors.line,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {icon ? <Feather name={icon} size={13} color={active ? colors.accentContrast : colors.muted} /> : null}
        <Text style={[type.buttonSmall, { color: active ? colors.accentContrast : colors.inkSoft }]}>{label}</Text>
      </View>
    </PressableScale>
  );
}

export function Badge({ label, tone = 'sage' }: { label: string; tone?: 'sage' | 'mint' | 'peach' | 'butter' | 'muted' }) {
  const { colors, radii, type } = useTheme();
  const map = {
    sage: { bg: colors.accentSoft, fg: colors.accent },
    mint: { bg: colors.mintSoft, fg: colors.mint },
    peach: { bg: colors.secondaryAccentSoft, fg: colors.secondaryAccent },
    butter: { bg: colors.butterSoft, fg: colors.inkSoft },
    muted: { bg: colors.backgroundAlt, fg: colors.muted },
  } as const;
  return (
    <View style={{ backgroundColor: map[tone].bg, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' }}>
      <Text style={[type.tiny, { color: map[tone].fg, fontSize: 9 }]}>{label}</Text>
    </View>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  style,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }, style]}>
      <View style={{ flexShrink: 1, minWidth: 220 }}>
        {eyebrow ? <Text style={[type.overline, { color: colors.muted, marginBottom: 7 }]}>{eyebrow}</Text> : null}
        <SemanticHeading style={[type.h1, { color: colors.ink }]}>{title}</SemanticHeading>
        {subtitle ? <Text style={[type.body, { color: colors.muted, marginTop: 4 }]}>{subtitle}</Text> : null}
      </View>
      {actions ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{actions}</View> : null}
    </View>
  );
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
      <View style={{ flex: 1 }}>
        <Text style={[type.h3, { color: colors.ink }]}>{title}</Text>
        {subtitle ? <Text style={[type.small, { color: colors.muted, marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function EmptyState({
  icon = 'feather',
  title,
  description,
  action,
  tone = 'sage',
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'sage' | 'mint' | 'peach' | 'butter';
}) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 32, paddingHorizontal: 20, gap: 10 }}>
      <View
        style={{
          width: 66,
          height: 66,
          borderRadius: 24,
          backgroundColor: colors[`${tone}Soft` as 'sageSoft'],
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: colors.highlight,
        }}
      >
        <Feather name={icon} size={26} color={colors[tone === 'sage' ? 'sage' : tone === 'mint' ? 'success' : tone === 'peach' ? 'danger' : 'inkSoft']} />
      </View>
      <Text style={[type.h3, { color: colors.ink, textAlign: 'center' }]}>{title}</Text>
      {description ? <Text style={[type.small, { color: colors.muted, textAlign: 'center', maxWidth: 380, lineHeight: 19 }]}>{description}</Text> : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 36, gap: 12 }}>
      <ActivityIndicator color={colors.accent} />
      <Text style={[type.small, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="alert-circle"
      tone="peach"
      title="Something went quiet"
      description={message}
      action={onRetry ? <ClayButton label="Try again" variant="secondary" size="sm" onPress={onRetry} icon="refresh-cw" /> : undefined}
    />
  );
}

export function Skeleton({ width = '100%', height = 16, radius = 10, style }: { width?: number | string; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { colors, reduceMotion } = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.55));

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0.55, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  return (
    <Animated.View
      style={[
        { width: width as number, height, borderRadius: radius, backgroundColor: colors.skeleton, opacity: pulse },
        style,
      ]}
    />
  );
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'success' | 'error' }) {
  const { colors, radii, type } = useTheme();
  const map = {
    info: { bg: colors.accentSoft, fg: colors.accent, icon: 'info' as IconName },
    success: { bg: colors.successSoft, fg: colors.success, icon: 'check-circle' as IconName },
    error: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle' as IconName },
  };
  return (
    <View style={{ backgroundColor: map[tone].bg, borderRadius: radii.input, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <Feather name={map[tone].icon} size={14} color={map[tone].fg} style={{ marginTop: 2 }} />
      <Text style={[type.small, { color: map[tone].fg, flex: 1, lineHeight: 18 }]}>{text}</Text>
    </View>
  );
}

/** Shared fade + lift transition for modal surfaces, with a matching backdrop. */
function AnimatedModal({
  visible,
  onClose,
  children,
  width,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  const { colors, motion, reduceMotion } = useTheme();
  const [rendered, setRendered] = useState(visible);
  const [opacity] = useState(() => new Animated.Value(visible ? 1 : 0));
  const [lift] = useState(() => new Animated.Value(visible ? 0 : 12));
  const running = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      running.current?.stop();
      const duration = reduceMotion ? 0 : motion.duration.panel;
      const timing = (value: Animated.Value, toValue: number) =>
        Animated.timing(value, {
          toValue,
          duration,
          easing: motion.easing,
          useNativeDriver: Platform.OS !== 'web',
        });

      if (visible) {
        setRendered(true);
        if (reduceMotion) {
          opacity.setValue(1);
          lift.setValue(0);
          return;
        }
        opacity.setValue(0);
        lift.setValue(12);
        running.current = Animated.parallel([timing(opacity, 1), timing(lift, 0)]);
        running.current.start();
      } else if (reduceMotion) {
        setRendered(false);
      } else {
        running.current = Animated.parallel([timing(opacity, 0), timing(lift, 12)]);
        running.current.start(({ finished }) => {
          if (finished) setRendered(false);
        });
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      running.current?.stop();
    };
  }, [visible, reduceMotion, opacity, lift, motion]);

  return (
    <Modal visible={rendered} transparent animationType="none" onRequestClose={onClose} accessibilityViewIsModal>
      <Animated.View style={{ flex: 1, backgroundColor: colors.overlay, opacity, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close dialog" />
        <Animated.View
          style={{
            width: '100%',
            maxWidth: width ?? 430,
            opacity,
            transform: [{ translateY: lift }],
          }}
        >
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export function Dialog({
  visible,
  title,
  message,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive = false,
  loading = false,
}: {
  visible: boolean;
  title: string;
  message?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel: () => void;
  destructive?: boolean;
  loading?: boolean;
}) {
  const { colors, type } = useTheme();
  return (
    <AnimatedModal visible={visible} onClose={onCancel}>
      <ClayCard style={{ width: '100%', maxWidth: 430, padding: 24, gap: 12 }} elevated="floating">
        <Text style={[type.h3, { color: colors.ink }]}>{title}</Text>
        {message ? <Text style={[type.body, { color: colors.muted }]}>{message}</Text> : null}
        {children}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <ClayButton label={cancelLabel} variant="ghost" size="sm" onPress={onCancel} disabled={loading} />
          {onConfirm ? (
            <ClayButton label={confirmLabel} variant={destructive ? 'destructive' : 'primary'} size="sm" onPress={onConfirm} loading={loading} />
          ) : null}
        </View>
      </ClayCard>
    </AnimatedModal>
  );
}

/** Subtle entrance for transient surfaces (menus, suggestion lists, popovers). */
export function FadeIn({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { motion, reduceMotion } = useTheme();
  const [opacity] = useState(() => new Animated.Value(0));
  const [lift] = useState(() => new Animated.Value(6));

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      lift.setValue(0);
      return;
    }
    const timing = (value: Animated.Value, toValue: number) =>
      Animated.timing(value, { toValue, duration: motion.duration.fast, easing: motion.easing, useNativeDriver: Platform.OS !== 'web' });
    const animation = Animated.parallel([timing(opacity, 1), timing(lift, 0)]);
    animation.start();
    return () => animation.stop();
  }, [opacity, lift, motion, reduceMotion]);

  return <Animated.View style={[{ opacity, transform: [{ translateY: lift }] }, style]}>{children}</Animated.View>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ height: 1, backgroundColor: colors.line }, style]} />;
}

export function ScreenScroll({
  children,
  contentContainerStyle,
  refreshControl,
  maxWidth = 1180,
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ReactElement;
  maxWidth?: number;
}) {
  const { colors, spacing } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
      contentContainerStyle={[
        { width: '100%', maxWidth, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 80, gap: spacing.lg },
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  );
}

export function useIsWide(breakpoint = 768): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setWide(window.innerWidth >= breakpoint);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [breakpoint]);
  return wide;
}

export function useHover(): { hovered: boolean; hoverProps: { onHoverIn: () => void; onHoverOut: () => void } } {
  const [hovered, setHovered] = useState(false);
  const hoverProps = useMemo(
    () => ({ onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) }),
    [],
  );
  return { hovered, hoverProps };
}

/* ============================================================================
 * SHARED FORM CONTROLS
 * Every control below follows the same surface, border, focus and disabled
 * language as ClayInput so screens never mix appearance from one form to the
 * next.
 * ========================================================================== */

export function PasswordInput({ label, error, ...rest }: TextInputProps & { label?: string; error?: string | null }) {
  const [visible, setVisible] = useState(false);
  return (
    <ClayInput
      {...rest}
      label={label}
      error={error}
      secureTextEntry={!visible}
      autoCapitalize="none"
      rightAccessory={
        <Pressable
          onPress={() => setVisible((current) => !current)}
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Feather name={visible ? 'eye-off' : 'eye'} size={17} color="#77766E" />
        </Pressable>
      }
    />
  );
}

export type SelectOption = { label: string; value: string; icon?: IconName; disabled?: boolean };

export function Select({
  label,
  value,
  options,
  onValueChange,
  placeholder = 'Choose an option',
  disabled = false,
}: {
  label?: string;
  value: string | null;
  options: SelectOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { colors, radii, type } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <View style={{ gap: 6, zIndex: open ? 20 : 1 }}>
      {label ? <Text style={[type.tiny, { color: colors.muted }]}>{label}</Text> : null}
      <PressableScale
        onPress={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        accessibilityLabel={label ?? 'Select option'}
        accessibilityRole="button"
      >
        <View
          style={{
            minHeight: 48,
            borderRadius: radii.input,
            borderWidth: 1,
            borderColor: open ? colors.focus : colors.inputBorder,
            backgroundColor: colors.input,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            ...surfaceTransition(),
          }}
        >
          {selected?.icon ? <Feather name={selected.icon} size={16} color={colors.accent} /> : null}
          <Text style={[type.body, { flex: 1, color: selected ? colors.ink : colors.mutedLight }]}>
            {selected?.label ?? placeholder}
          </Text>
          <Feather name="chevron-down" size={16} color={colors.muted} />
        </View>
      </PressableScale>
      {open ? (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityLabel="Close options"
          />
          <FadeIn style={{ position: 'absolute', top: label ? 72 : 54, left: 0, right: 0, maxHeight: 240, zIndex: 30 }}>
            <View
              style={{
                backgroundColor: colors.surfaceRaised,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radii.input,
                padding: 5,
                ...surfaceTransition(),
              }}
            >
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {options.map((option) => {
                const active = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    disabled={option.disabled}
                    onPress={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                    accessibilityLabel={option.label}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: active }}
                    style={({ pressed, hovered: isHovered }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 9,
                      paddingHorizontal: 11,
                      paddingVertical: 10,
                      borderRadius: radii.control,
                      backgroundColor: active ? colors.accentSoft : isHovered || pressed ? colors.backgroundAlt : 'transparent',
                      opacity: option.disabled ? 0.45 : 1,
                    })}
                  >
                    {option.icon ? <Feather name={option.icon} size={15} color={active ? colors.accent : colors.muted} /> : null}
                    <Text style={[type.smallMedium, { flex: 1, color: active ? colors.accent : colors.inkSoft }]}>{option.label}</Text>
                    {active ? <Feather name="check" size={14} color={colors.accent} /> : null}
                  </Pressable>
                );
              })}
              </ScrollView>
            </View>
          </FadeIn>
        </>
      ) : null}
    </View>
  );
}

export function Checkbox({
  checked,
  onToggle,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const { colors, type } = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 11,
        paddingVertical: 7,
        opacity: pressed ? 0.82 : disabled ? 0.45 : 1,
      })}
    >
      <View
        style={{
          width: 20,
          height: 20,
          marginTop: 1,
          borderRadius: 7,
          borderWidth: 1,
          borderColor: checked ? colors.accent : colors.lineStrong,
          backgroundColor: checked ? colors.accent : colors.input,
          alignItems: 'center',
          justifyContent: 'center',
          ...surfaceTransition(),
        }}
      >
        {checked ? <Feather name="check" size={13} color={colors.accentContrast} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.smallMedium, { color: colors.ink }]}>{label}</Text>
        {description ? <Text style={[type.small, { color: colors.muted, lineHeight: 17 }]}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

export function SwitchControl({
  checked,
  onToggle,
  label,
  disabled = false,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  const { colors, motion, reduceMotion } = useTheme();
  const [knob] = useState(() => new Animated.Value(checked ? 1 : 0));
  useEffect(() => {
    const animation = Animated.timing(knob, {
      toValue: checked ? 1 : 0,
      duration: reduceMotion ? 0 : motion.duration.fast,
      easing: motion.easing,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [checked, knob, motion, reduceMotion]);
  const left = knob.interpolate({ inputRange: [0, 1], outputRange: [3, 25] });
  return (
    <Pressable
      onPress={disabled ? undefined : onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <View
        style={{
          width: 48,
          height: 28,
          borderRadius: 14,
          backgroundColor: checked ? colors.accent : colors.disabled,
          borderWidth: 1,
          borderColor: checked ? colors.accentHover : colors.line,
          justifyContent: 'center',
          ...surfaceTransition(),
        }}
      >
        <Animated.View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surface, left, shadowColor: '#1B1C19', shadowOpacity: 0.16, shadowRadius: 3, elevation: 2 }} />
      </View>
    </Pressable>
  );
}

export function FileUpload({
  label = 'Choose a file',
  description,
  accept,
  multiple = false,
  disabled = false,
  onFiles,
  onPickNative,
}: {
  label?: string;
  description?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  onPickNative?: () => void;
}) {
  const { colors, radii, type } = useTheme();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept ?? '';
    input.multiple = multiple;
    input.style.display = 'none';
    const handleChange = () => {
      onFiles(Array.from(input.files ?? []));
      input.value = '';
    };
    input.addEventListener('change', handleChange);
    document.body.appendChild(input);
    inputRef.current = input;
    return () => {
      input.removeEventListener('change', handleChange);
      input.remove();
      inputRef.current = null;
    };
  }, [accept, multiple, onFiles]);

  const openPicker = () => {
    if (disabled) return;
    if (Platform.OS === 'web') inputRef.current?.click();
    else onPickNative?.();
  };

  return (
    <Pressable
      onPress={openPicker}
      onHoverIn={() => setDragOver(true)}
      onHoverOut={() => setDragOver(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      style={{
        minHeight: 116,
        borderRadius: radii.input,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: dragOver ? colors.accent : colors.lineStrong,
        backgroundColor: dragOver ? colors.accentSoft : colors.backgroundAlt,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 18,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line }}>
        <Feather name="upload-cloud" size={19} color={colors.accent} />
      </View>
      <Text style={[type.smallMedium, { color: colors.ink }]}>{label}</Text>
      {description ? <Text style={[type.small, { color: colors.muted, fontSize: 10, textAlign: 'center' }]}>{description}</Text> : null}
    </Pressable>
  );
}

/* ============================================================================
 * NAVIGATION & OVERLAY PRIMITIVES
 * ========================================================================== */

export type TabItem = { key: string; label: string; icon?: IconName; badge?: string };

export function Tabs({
  items,
  active,
  onChange,
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
}) {
  const { colors, radii, type } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {items.map((item) => {
        const selected = item.key === active;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={item.label}
            style={({ pressed, hovered }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 13,
              height: 36,
              borderRadius: radii.pill,
              backgroundColor: selected ? colors.accent : hovered || pressed ? colors.backgroundAlt : colors.surface,
              borderWidth: 1,
              borderColor: selected ? colors.accent : colors.line,
            })}
          >
            {item.icon ? <Feather name={item.icon} size={14} color={selected ? colors.accentContrast : colors.muted} /> : null}
            <Text style={[type.buttonSmall, { color: selected ? colors.accentContrast : colors.inkSoft }]}>{item.label}</Text>
            {item.badge ? (
              <View style={{ borderRadius: radii.pill, backgroundColor: selected ? colors.surface : colors.accentSoft, paddingHorizontal: 6, paddingVertical: 1 }}>
                <Text style={[type.tiny, { fontSize: 8, color: selected ? colors.accent : colors.accent }]}>{item.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export type DropdownItem = {
  key: string;
  label: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'ink' | 'muted' | 'danger';
};

export function Dropdown({
  label,
  trigger,
  header,
  items,
  width = 232,
  align = 'right',
}: {
  label: string;
  trigger?: ReactNode;
  header?: ReactNode;
  items: DropdownItem[];
  width?: number;
  align?: 'left' | 'right';
}) {
  const { colors, radii, type, shadows } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ zIndex: open ? 40 : 1 }}>
      <Pressable
        onPress={() => setOpen((current) => !current)}
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={5}
      >
        {trigger ?? <Feather name="more-horizontal" size={20} color={colors.muted} />}
      </Pressable>
      {open ? (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel={`Close ${label}`} />
          <FadeIn style={{ position: 'absolute', top: '100%', marginTop: 8, [align]: 0, width, zIndex: 50 }}>
            <View
              style={[
                shadows.lifted,
                surfaceTransition(),
                {
                  backgroundColor: colors.surfaceRaised,
                  borderRadius: radii.card,
                  borderWidth: 1,
                  borderColor: colors.line,
                  padding: 9,
                },
              ]}
            >
            {header ? <View style={{ paddingHorizontal: 5, paddingBottom: 9 }}>{header}</View> : null}
            {header ? <Divider style={{ marginBottom: 5 }} /> : null}
            {items.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => {
                  setOpen(false);
                  item.onPress();
                }}
                disabled={item.disabled}
                accessibilityRole="menuitem"
                accessibilityLabel={item.label}
                style={({ pressed, hovered }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 9,
                  paddingHorizontal: 9,
                  borderRadius: radii.control,
                  backgroundColor: pressed || hovered ? colors.backgroundAlt : 'transparent',
                  opacity: item.disabled ? 0.45 : 1,
                })}
              >
                {item.icon ? (
                  <Feather
                    name={item.icon}
                    size={15}
                    color={item.tone === 'danger' ? colors.danger : item.tone === 'muted' ? colors.muted : colors.inkSoft}
                  />
                ) : null}
                <Text
                  style={[
                    type.smallMedium,
                    { color: item.tone === 'danger' ? colors.danger : item.tone === 'muted' ? colors.muted : colors.inkSoft },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
            </View>
          </FadeIn>
        </>
      ) : null}
    </View>
  );
}

export function Tooltip({
  label,
  side = 'right',
  children,
}: {
  label: string;
  side?: 'top' | 'right' | 'bottom';
  children: ReactNode;
}) {
  const { colors, radii, type, shadows } = useTheme();
  const [shown, setShown] = useState(false);
  const offset = side === 'right' ? { left: '100%' as const, marginLeft: 8, top: '50%' as const, marginTop: -13 } : side === 'bottom' ? { top: '100%' as const, marginTop: 8, left: '50%' as const } : { bottom: '100%' as const, marginBottom: 8, left: '50%' as const };
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<any>, {
        onHoverIn: () => {
          setShown(true);
          (children.props as any).onHoverIn?.();
        },
        onHoverOut: () => {
          setShown(false);
          (children.props as any).onHoverOut?.();
        },
        onFocus: () => {
          setShown(true);
          (children.props as any).onFocus?.();
        },
        onBlur: () => {
          setShown(false);
          (children.props as any).onBlur?.();
        },
      })
    : children;
  return (
    <View style={{ position: 'relative' }}>
      {child}
      {shown ? (
        <View
          pointerEvents="none"
          style={[
            shadows.md,
            {
              position: 'absolute',
              ...offset,
              backgroundColor: colors.surfaceRaised,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radii.control,
              paddingHorizontal: 9,
              paddingVertical: 5,
              zIndex: 60,
            },
          ]}
        >
          <Text style={[type.tiny, { color: colors.ink }]}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function ModalCard({
  visible,
  onClose,
  children,
  width = 430,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  return (
    <AnimatedModal visible={visible} onClose={onClose} width={width}>
      <ClayCard style={{ width: '100%', maxWidth: width, padding: 24 }} elevated="floating">
        {children}
      </ClayCard>
    </AnimatedModal>
  );
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  loading = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      visible={visible}
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      destructive
      loading={loading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

/* ============================================================================
 * TOASTS
 * ========================================================================== */

type ToastTone = 'info' | 'success' | 'error';
type ToastItem = { id: number; message: string; tone: ToastTone; leaving?: boolean };
const ToastContext = createContext<{ show: (message: string, tone?: ToastTone) => void } | null>(null);

const TOAST_VISIBLE_MS = 3400;

function ToastRow({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const { colors, radii, type, shadows, motion, reduceMotion } = useTheme();
  const [opacity] = useState(() => new Animated.Value(0));
  const [lift] = useState(() => new Animated.Value(10));
  const iconFor: Record<ToastTone, IconName> = { info: 'info', success: 'check-circle', error: 'alert-circle' };
  const colorFor: Record<ToastTone, string> = { info: colors.accent, success: colors.success, error: colors.danger };

  useEffect(() => {
    const duration = reduceMotion ? 0 : motion.duration.standard;
    const timing = (value: Animated.Value, toValue: number) =>
      Animated.timing(value, { toValue, duration, easing: motion.easing, useNativeDriver: Platform.OS !== 'web' });
    const animation = Animated.parallel([
      timing(opacity, item.leaving ? 0 : 1),
      timing(lift, item.leaving ? 10 : 0),
    ]);
    animation.start();
    return () => animation.stop();
  }, [item.leaving, opacity, lift, motion, reduceMotion]);

  return (
    <Animated.View
      accessibilityLabel={item.message}
      accessibilityRole="alert"
      style={[
        shadows.lifted,
        surfaceTransition(),
        {
          maxWidth: 420,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
          backgroundColor: colors.surfaceRaised,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radii.input,
          paddingVertical: 11,
          paddingHorizontal: 13,
          opacity,
          transform: [{ translateY: lift }],
        },
      ]}
    >
      <Feather name={iconFor[item.tone]} size={16} color={colorFor[item.tone]} />
      <Text style={[type.smallMedium, { color: colors.ink, flexShrink: 1 }]}>{item.message}</Text>
      <Pressable onPress={onDismiss} accessibilityLabel="Dismiss notification" hitSlop={8}>
        <Feather name="x" size={14} color={colors.muted} />
      </Pressable>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { motion } = useTheme();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextId = useRef(0);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, leaving: true } : item)));
    timers.current.push(setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), motion.duration.panel));
  }, [motion.duration.panel]);

  const show = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = (nextId.current += 1);
    setItems((current) => [...current.slice(-2), { id, message, tone }]);
    timers.current.push(setTimeout(() => dismiss(id), TOAST_VISIBLE_MS));
  }, [dismiss]);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: width < 820 ? 92 : 24,
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 16,
          zIndex: 200,
        }}
      >
        {items.map((item) => (
          <ToastRow key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
