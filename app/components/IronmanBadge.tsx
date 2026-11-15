import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

// Ironman's own fixed palette -- like the streak red/orange and achievement palettes, deliberately
// not themed: a dark steel plate with a gold rim reads as "earned and serious" on both light and
// dark backgrounds, and must stay recognizable on share cards that render off-screen.
export const IRONMAN_GOLD = '#F5B300';
export const IRONMAN_STEEL = '#1F232B';
export const IRONMAN_ICON = 'shield-crown' as const;

interface IronmanBadgeProps {
  // 'emblem': a small round shield, for tight spots (habit tiles, streak rows, calendar badges).
  // 'pill': shield + "Ironman" wordmark, for headers, the habit form, and share cards.
  variant?: 'emblem' | 'pill';
  size?: number; // icon size; everything else scales from it
  label?: string;
  style?: ViewStyle;
}

export const IronmanBadge: React.FC<IronmanBadgeProps> = ({ variant = 'pill', size = 14, label = 'Ironman', style }) => {
  if (variant === 'emblem') {
    const diameter = Math.round(size * 1.7);
    return (
      <View
        style={[
          styles.emblem,
          { width: diameter, height: diameter, borderRadius: diameter / 2, borderWidth: Math.max(1, Math.round(size / 9)) },
          style,
        ]}
        accessibilityLabel="Ironman habit"
        pointerEvents="none"
      >
        <MaterialCommunityIcons name={IRONMAN_ICON} size={size} color={IRONMAN_GOLD} />
      </View>
    );
  }

  const fontSize = Math.round(size * 0.85);
  return (
    <View
      style={[
        styles.pill,
        {
          paddingHorizontal: Math.round(size * 0.6),
          paddingVertical: Math.max(2, Math.round(size * 0.2)),
          gap: Math.max(3, Math.round(size * 0.3)),
          borderWidth: Math.max(1, Math.round(size / 10)),
        },
        style,
      ]}
      accessibilityLabel="Ironman habit"
      pointerEvents="none"
    >
      <MaterialCommunityIcons name={IRONMAN_ICON} size={size} color={IRONMAN_GOLD} />
      <Text style={[styles.pillText, { fontSize, letterSpacing: fontSize * 0.08 }]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  emblem: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: IRONMAN_STEEL,
    borderColor: IRONMAN_GOLD,
    shadowColor: IRONMAN_GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 3,
    elevation: 3,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: IRONMAN_STEEL,
    borderColor: IRONMAN_GOLD,
    shadowColor: IRONMAN_GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  pillText: {
    color: IRONMAN_GOLD,
    fontWeight: '800',
  },
});
