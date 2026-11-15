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
export const IRONMAN_FLAME = '#FF5A36';

export type IronmanTone = 'light' | 'dark';

export interface IronmanPalette {
  // Badge/pill fill gradient, top -> bottom.
  fillFrom: string;
  fillTo: string;
  border: string;
  text: string;
  shield: string;
  flame: string;
  // Larger surfaces (the Add habit card when on, the calendar banner).
  surface: string;
  surfaceBorder: string;
  surfaceTitle: string;
  surfaceBody: string;
  // Solid accent for small controls on those surfaces (switch track, lock glyph, Lock in button).
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
    flame: IRONMAN_FLAME,
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
    flame: IRONMAN_FLAME,
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

// A shield with a flame inside it -- no MaterialCommunityIcons glyph combines the two, so it's
// drawn here (24x24 viewBox, same footprint as an icon glyph).
const SHIELD_PATH = 'M12 1.6 3.6 4.8v6.4c0 5.3 3.6 10.1 8.4 11.2 4.8-1.1 8.4-5.9 8.4-11.2V4.8z';
const FLAME_PATH =
  'M12.2 5.6c.5 2.1 2.9 3.4 2.9 6.3 0 .7-.15 1.3-.45 1.8.95-.35 1.6-1.2 1.75-2.2 1.05 1.1 1.45 2.4 1.45 3.5 0 3.05-2.5 5.1-5.6 5.1s-5.55-2-5.55-4.85c0-2.45 1.5-3.9 2.65-5.2.2 1.05.85 1.75 1.65 2.05-.45-2.4.35-4.75 1.2-6.5z';
const FLAME_CORE_PATH =
  'M12.1 13c.25 1.1 1.55 1.75 1.55 3.25 0 1.05-.75 1.95-1.85 1.95s-1.9-.8-1.9-1.85c0-1 .6-1.6 1.1-2.15.1.45.35.75.7.85-.15-.75.1-1.5.4-2.05z';

export const IronmanIcon: React.FC<{ size?: number; shieldColor?: string; flameColor?: string; coreColor?: string }> = ({
  size = 16,
  shieldColor = IRONMAN_GOLD,
  flameColor = IRONMAN_FLAME,
  coreColor = '#FFD54A',
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d={SHIELD_PATH} fill={shieldColor} />
    <Path d={FLAME_PATH} fill={flameColor} />
    <Path d={FLAME_CORE_PATH} fill={coreColor} />
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
            <IronmanIcon size={size} shieldColor={palette.shield} flameColor={palette.flame} />
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
          <IronmanIcon size={Math.round(size * 1.15)} shieldColor={palette.shield} flameColor={palette.flame} />
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
