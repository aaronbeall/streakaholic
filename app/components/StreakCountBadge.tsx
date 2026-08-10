import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

interface StreakCountBadgeProps {
  value: number;
  iconSize?: number;
  style?: ViewStyle;
}

// The same red TaskCard's own home-tile badge uses for an active ("up_to_date"/fire) streak --
// see getStreakBadgeStyle in streaks.ts. Hardcoded here rather than threaded through as a prop:
// per explicit user direction this badge always uses the streak-red, not the task's own color
// (matching how this exact literal is already repeated at each of its other call sites in the
// codebase rather than centralized into a shared constant).
const STREAK_RED = '#FF6B6B';

// A small pill showing a streak's completed-day count, placed at the last completed day of a
// connected run (see reports.ts's buildDayConnectionInfo). Styled to match TaskCard's own
// home-tile streak indicator (streakBubble/streakText: a colored pill, fire icon + number, white
// text, the same subtle drop shadow) rather than the plain circular badge this started as -- just
// without that indicator's celebration pop/particle animation, since this badge is a static
// historical-length label, not a live "you just hit a new streak" moment.
export const StreakCountBadge: React.FC<StreakCountBadgeProps> = ({ value, iconSize = 11, style }) => {
  const fontSize = Math.round(iconSize * 0.85);
  const paddingHorizontal = Math.round(iconSize * 0.35);
  const paddingVertical = Math.max(1, Math.round(iconSize * 0.15));
  const gap = Math.max(1, Math.round(iconSize * 0.15));

  return (
    <View
      style={[styles.badge, { backgroundColor: STREAK_RED, paddingHorizontal, paddingVertical, gap }, style]}
      pointerEvents="none"
    >
      <MaterialCommunityIcons name="fire" size={iconSize} color="#fff" />
      <Text style={[styles.text, { fontSize }]} numberOfLines={1}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  text: {
    color: '#fff',
    fontWeight: '600',
  },
});
