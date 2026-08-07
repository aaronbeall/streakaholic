import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { Task } from '../types';
import { getRecentStreaks, TaskStreakChain } from '../utils/reports';

const PAGE_SIZE = 20;
// Comfortably more than any real user will ever accumulate, so getRecentStreaks effectively
// returns "all of them" -- pagination below is just about how many get *rendered*, not
// re-deriving the underlying chain list each time (that's computed once and memoized).
const ALL_STREAKS_LIMIT = 5000;

// A color/icon-coded list of every historical streak run across the filtered tasks, most
// recent first, with infinite vertical scroll further into the past (same pagination idea as
// the Reports tab's calendar grid, just vertical instead of horizontal).
export const DashboardStreaksView: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const allStreaks = useMemo(() => getRecentStreaks(tasks, ALL_STREAKS_LIMIT), [tasks]);
  // Reset pagination when the task filter changes -- scroll position tied to a different set of
  // tasks isn't meaningful to carry over.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [tasks]);
  const visibleStreaks = allStreaks.slice(0, visibleCount);
  const maxStreakLength = Math.max(1, ...visibleStreaks.map(s => s.length));

  const handleEndReached = () => {
    setVisibleCount(prev => Math.min(prev + PAGE_SIZE, allStreaks.length));
  };

  if (tasks.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons name="chart-timeline-variant" size={48} color={colors.textTertiary} />
        <Text style={styles.emptyTitle}>No tasks selected</Text>
      </View>
    );
  }

  if (allStreaks.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons name="chart-timeline-variant" size={48} color={colors.textTertiary} />
        <Text style={styles.emptyTitle}>No streaks yet</Text>
        <Text style={styles.emptySubtitle}>Complete a task on its due days to start one.</Text>
      </View>
    );
  }

  return (
    <FlatList<TaskStreakChain>
      style={styles.content}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom }}
      data={visibleStreaks}
      keyExtractor={(item, index) => `${item.taskId}-${item.startDate.toISOString()}-${index}`}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      renderItem={({ item }) => (
        <View style={styles.streakRow}>
          <Text style={styles.streakDateLabel}>{format(item.startDate, 'MMM d')}</Text>
          <View style={styles.streakBarTrack}>
            <View
              style={[
                styles.streakBar,
                { width: `${Math.max(20, (item.length / maxStreakLength) * 100)}%`, backgroundColor: item.taskColor },
              ]}
            >
              <MaterialCommunityIcons name={item.taskIcon} size={12} color="#fff" />
              <Text style={styles.streakBarText}>{item.length}</Text>
            </View>
          </View>
          <Text style={styles.streakDateLabel}>{format(item.endDate, 'MMM d')}</Text>
        </View>
      )}
    />
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  streakDateLabel: {
    width: 52,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  streakBarTrack: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
  },
  streakBar: {
    height: 24,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  streakBarText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
});
