import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { MaterialCommunityIconName } from '../types';

// Extracted (2026-08-14, closing a standing TODO.md item) from DashboardStreaksView's own
// already-established "no habits selected" / "no streaks yet" treatment -- a big muted icon, a
// bold title, and an optional lighter subtitle, all centered in whatever flex:1 area holds it.
// That was the one Dashboard/task-detail Stats/Calendar/Streaks view with a real empty-state
// design already; DashboardCalendarView had a plain, unstyled fallback line and DashboardStatsView
// had no empty-state handling at all (a filtered-to-nothing view just rendered a wall of zeroed
// stats). Pulling the shared shape into one component is what actually guarantees the three tabs
// stay visually identical going forward, rather than three independent copies that could drift.
interface EmptyStateProps {
  icon: MaterialCommunityIconName;
  title: string;
  subtitle?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, subtitle }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name={icon} size={48} color={colors.textTertiary} />
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
