import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useThemeColors } from '../hooks/useThemeColors';

// Ironman's own fixed palettes -- like the streak red/orange and achievement palettes, these are
// deliberately not the app's semantic theme colors. Two tones instead of one so the badge reads as
// a premium medal on both backgrounds: polished gold on light surfaces, gold-rimmed gunmetal on
// dark ones (and always on the share cards, which render on a dark frame).
export const IRONMAN_GOLD = '#F5B300';
export const IRONMAN_STEEL = '#1F232B';

export type IronmanTone = 'light' | 'dark';

export interface IronmanPalette {
  // Badge/pill fill gradient, top -> bottom.
  fillFrom: string;
  fillTo: string;
  border: string;
  text: string;
  shield: string;
  // Larger surfaces (the Add habit card when on, the calendar banner).
  surface: string;
  surfaceBorder: string;
  surfaceTitle: string;
  surfaceBody: string;
  // Solid accent for small controls on those surfaces (switch track, lock glyph).
  accent: string;
  onAccent: string;
}

const PALETTES: Record<IronmanTone, IronmanPalette> = {
  light: {
    fillFrom: '#FFE27A',
    fillTo: '#F2A400',
    border: '#D08A00',
    text: '#4A2E00',
    shield: '#2B2F36',
    surface: '#FFF7E0',
    surfaceBorder: '#F2B200',
    surfaceTitle: '#3A2600',
    surfaceBody: '#6B5426',
    accent: '#F2A400',
    onAccent: '#3A2600',
  },
  dark: {
    fillFrom: '#353B46',
    fillTo: '#14171C',
    border: IRONMAN_GOLD,
    text: IRONMAN_GOLD,
    shield: IRONMAN_GOLD,
    surface: '#1C2027',
    surfaceBorder: IRONMAN_GOLD,
    surfaceTitle: '#FFFFFF',
    surfaceBody: '#C9CED6',
    accent: IRONMAN_GOLD,
    onAccent: IRONMAN_STEEL,
  },
};

export const getIronmanPalette = (tone: IronmanTone): IronmanPalette => PALETTES[tone];

// The current app theme's tone -- pass an explicit `tone` instead wherever the background is fixed
// regardless of theme (share cards are always dark).
export const useIronmanPalette = (tone?: IronmanTone): IronmanPalette => {
  const { isDark } = useThemeColors();
  return PALETTES[tone ?? (isDark ? 'dark' : 'light')];
};

// A shield with the flame cut out of it as negative space, plus a solid inner tongue -- one
// color, so it reads as a stamped mark rather than an emoji. No MaterialCommunityIcons glyph
// combines the two, so it's drawn here (24x24 viewBox, same footprint as an icon glyph).
const SHIELD_PATH = 'M12 1.6 3.6 4.8v6.4c0 5.3 3.6 10.1 8.4 11.2 4.8-1.1 8.4-5.9 8.4-11.2V4.8z';
const FLAME_CUTOUT_PATH =
  'M12 5.2C12.6 7.6 16.2 9.4 16.2 13.6C16.2 16.6 14.3 18.8 12 18.8C9.7 18.8 7.8 16.8 7.8 14.2C7.8 12.2 8.9 10.9 9.9 9.9C10 11.2 10.6 12 11.4 12.3C10.9 9.6 11.2 7.2 12 5.2Z';
const FLAME_TONGUE_PATH =
  'M12.1 12.6C12.4 13.7 13.9 14.4 13.9 16C13.9 17.1 13.1 17.9 12 17.9C10.9 17.9 10.1 17.1 10.1 16.1C10.1 15.2 10.6 14.5 11.1 14C11.2 14.6 11.5 14.9 11.9 15.1C11.7 14.2 11.8 13.3 12.1 12.6Z';

export const IronmanIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = IRONMAN_GOLD }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d={`${SHIELD_PATH} ${FLAME_CUTOUT_PATH}`} fill={color} fillRule="evenodd" />
    <Path d={FLAME_TONGUE_PATH} fill={color} />
  </Svg>
);

// Gradient fill behind a badge -- an absolutely-positioned SVG so it follows the badge's own
// measured size (percent width/height) without an onLayout round trip.
const GradientFill: React.FC<{ id: string; palette: IronmanPalette; radius: number }> = ({ id, palette, radius }) => (
  <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
    <Defs>
      <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={palette.fillFrom} />
        <Stop offset="1" stopColor={palette.fillTo} />
      </LinearGradient>
    </Defs>
    <Rect x="0" y="0" width="100%" height="100%" rx={radius} ry={radius} fill={`url(#${id})`} />
  </Svg>
);

interface IronmanBadgeProps {
  // 'emblem': a small round medal, for tight spots (habit tiles, calendar banner, share icon).
  // 'pill': medal icon + "Ironman" wordmark, for the habit header, the habit form, share cards.
  variant?: 'emblem' | 'pill';
  size?: number; // icon size; everything else scales from it
  label?: string;
  tone?: IronmanTone;
  style?: ViewStyle;
}

let gradientIdCounter = 0;

export const IronmanBadge: React.FC<IronmanBadgeProps> = ({ variant = 'pill', size = 14, label = 'Ironman', tone, style }) => {
  const palette = useIronmanPalette(tone);
  // Each SVG gradient needs a document-unique id on web; harmless on native.
  const gradientId = React.useMemo(() => `ironman-fill-${gradientIdCounter++}`, []);
  const borderWidth = Math.max(1, Math.round(size / 10));

  if (variant === 'emblem') {
    const diameter = Math.round(size * 1.75);
    return (
      <View
        style={[styles.shadow, { width: diameter, height: diameter, borderRadius: diameter / 2 }, style]}
        accessibilityLabel="Ironman habit"
        pointerEvents="none"
      >
        <View style={[styles.clip, styles.fill, { borderRadius: diameter / 2, borderWidth, borderColor: palette.border }]}>
          <GradientFill id={gradientId} palette={palette} radius={diameter / 2} />
          {/* Wrapped so it stacks above the absolutely-positioned gradient on web too (CSS paints
              positioned elements over static siblings; native just follows sibling order). */}
          <View style={styles.layer}>
            <IronmanIcon size={Math.round(size * 1.35)} color={palette.shield} />
          </View>
        </View>
      </View>
    );
  }

  const fontSize = Math.round(size * 0.82);
  const height = Math.round(size * 1.75);
  return (
    <View style={[styles.shadow, { borderRadius: height / 2 }, style]} accessibilityLabel="Ironman habit" pointerEvents="none">
      <View
        style={[
          styles.clip,
          styles.pillRow,
          {
            height,
            borderRadius: height / 2,
            borderWidth,
            borderColor: palette.border,
            paddingLeft: Math.round(size * 0.4),
            paddingRight: Math.round(size * 0.7),
            gap: Math.max(3, Math.round(size * 0.25)),
          },
        ]}
      >
        <GradientFill id={gradientId} palette={palette} radius={height / 2} />
        <View style={styles.layer}>
          <IronmanIcon size={Math.round(size * 1.15)} color={palette.shield} />
        </View>
        <Text style={[styles.pillText, { fontSize, letterSpacing: fontSize * 0.1, color: palette.text }]} numberOfLines={1}>
          {label.toUpperCase()}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Shadow on an unclipped wrapper, clipping on the inner view -- overflow:hidden + a shadow on the
  // same View drops the shadow on Android (see CLAUDE.md's RN/Android gotchas).
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  fill: {
    flex: 1,
  },
  clip: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillRow: {
    flexDirection: 'row',
  },
  layer: {
    position: 'relative',
  },
  pillText: {
    position: 'relative',
    fontWeight: '900',
  },
});
