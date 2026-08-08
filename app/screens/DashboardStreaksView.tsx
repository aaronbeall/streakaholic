import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { Task } from '../types';
import { getRecentStreaks, TaskStreakChain } from '../utils/reports';

const PAGE_SIZE = 20;
// Comfortably more than any real user will ever accumulate, so getRecentStreaks effectively
// returns "all of them" -- pagination below is just about how many get *rendered*, not
// re-deriving the underlying chain list each time (that's computed once and memoized).
const ALL_STREAKS_LIMIT = 5000;
type SortMode = 'recent' | 'best';
const STREAK_DATE_LABEL_WIDTH = 48;
const STREAK_LABEL_GAP = 8;
// streakBar's own height (24) plus streakRow's marginBottom (12) -- every row is this exact
// height regardless of streak length (only the bar's *width* varies), so this can be a real
// getItemLayout instead of leaving FlatList to measure each row on the fly.
const STREAK_ROW_HEIGHT = 24 + 12;

// A color/icon-coded list of every historical streak run across the filtered tasks, with infinite
// vertical scroll further into the past (same pagination idea as the Calendar tab's grid, just
// vertical instead of horizontal). Above the list: a hero/secondary stats block styled identically
// to DashboardStatsView's no-card-chrome tiered hierarchy.
export const DashboardStreaksView: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  const router = useRouter();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  // Measured once from the first row -- every row is the same width, so this doesn't need to be
  // per-row state. Drives the bar's max pixel width so the start/end date labels can sit directly
  // against the bar's own edges instead of in fixed-width side columns far from a shorter bar.
  const [rowWidth, setRowWidth] = useState(0);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // getRecentStreaks already sorts newest-first; "best" mode just re-sorts a copy by length.
  const allStreaks = useMemo(() => getRecentStreaks(tasks, ALL_STREAKS_LIMIT), [tasks]);
  const sortedStreaks = useMemo(() => (
    sortMode === 'best' ? [...allStreaks].sort((a, b) => b.length - a.length) : allStreaks
  ), [allStreaks, sortMode]);

  // Headline stats are always across every streak, independent of the list's own sort order below.
  const streakStats = useMemo(() => {
    if (allStreaks.length === 0) {
      return { count: 0, totalDays: 0, average: 0, best: null as TaskStreakChain | null };
    }
    const totalDays = allStreaks.reduce((sum, s) => sum + s.length, 0);
    const maxLength = Math.max(...allStreaks.map(s => s.length));
    // Ties (e.g. two tasks both maxing a 7-day week) are broken by whichever happened first --
    // the oldest streak of that length is "the" record, not whichever tied task got walked last.
    const best = allStreaks
      .filter(s => s.length === maxLength)
      .reduce((oldest, s) => (s.startDate < oldest.startDate ? s : oldest));
    return { count: allStreaks.length, totalDays, average: totalDays / allStreaks.length, best };
  }, [allStreaks]);

  // Reset pagination when the task filter or sort order changes -- scroll position tied to a
  // different set of tasks or a different ordering isn't meaningful to carry over.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [tasks, sortMode]);
  const visibleStreaks = sortedStreaks.slice(0, visibleCount);
  const maxStreakLength = Math.max(1, ...visibleStreaks.map(s => s.length));
  const maxBarWidth = Math.max(24, rowWidth - (STREAK_DATE_LABEL_WIDTH + STREAK_LABEL_GAP) * 2);

  const handleEndReached = () => {
    setVisibleCount(prev => Math.min(prev + PAGE_SIZE, sortedStreaks.length));
  };
  const handleRowLayout = (event: LayoutChangeEvent) => {
    if (rowWidth === 0) setRowWidth(event.nativeEvent.layout.width);
  };

  if (tasks.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons name="fire" size={48} color={colors.textTertiary} />
        <Text style={styles.emptyTitle}>No tasks selected</Text>
      </View>
    );
  }

  if (allStreaks.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons name="fire" size={48} color={colors.textTertiary} />
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
      getItemLayout={(_data, index) => ({ length: STREAK_ROW_HEIGHT, offset: STREAK_ROW_HEIGHT * index, index })}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <>
          <View style={styles.heroBlock}>
            <View style={styles.heroEyebrowRow}>
              <MaterialCommunityIcons name="trophy" size={16} color="#FFD700" />
              <Text style={styles.heroEyebrow}>Best Streak</Text>
            </View>
            <Text style={[styles.heroValue, { color: '#FFD700' }]}>{streakStats.best!.length}</Text>
            <View style={styles.heroTaskRow}>
              <MaterialCommunityIcons name={streakStats.best!.taskIcon} size={16} color={streakStats.best!.taskColor} />
              <Text style={styles.heroSince}>
                <Text style={{ color: streakStats.best!.taskColor, fontWeight: '700' }}>{streakStats.best!.taskName}</Text>
                {' · '}{format(streakStats.best!.startDate, 'MMM d')} – {format(streakStats.best!.endDate, 'MMM d, yyyy')}
              </Text>
            </View>
          </View>

          <View style={styles.statsDivider} />

          <View style={styles.secondaryStrip}>
            <View style={styles.secondaryItem}>
              <Text style={styles.secondaryValue}>{streakStats.count}</Text>
              <Text style={styles.secondaryLabel}>Streaks</Text>
            </View>
            <View style={styles.stripDividerV} />
            <View style={styles.secondaryItem}>
              <Text style={styles.secondaryValue}>{streakStats.totalDays}</Text>
              <Text style={styles.secondaryLabel}>Completions in Streaks</Text>
            </View>
            <View style={styles.stripDividerV} />
            <View style={styles.secondaryItem}>
              <Text style={styles.secondaryValue}>{streakStats.average.toFixed(1)}</Text>
              <Text style={styles.secondaryLabel}>Average Streak</Text>
            </View>
          </View>

          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>Streak History</Text>
            <View style={styles.sortToggle}>
              <TouchableOpacity
                style={[styles.sortButton, sortMode === 'recent' && styles.sortButtonActive]}
                onPress={() => setSortMode('recent')}
                accessibilityRole="radio"
                accessibilityState={{ checked: sortMode === 'recent' }}
              >
                <Text style={[styles.sortButtonText, sortMode === 'recent' && styles.sortButtonTextActive]}>Recent</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortButton, sortMode === 'best' && styles.sortButtonActive]}
                onPress={() => setSortMode('best')}
                accessibilityRole="radio"
                accessibilityState={{ checked: sortMode === 'best' }}
              >
                <Text style={[styles.sortButtonText, sortMode === 'best' && styles.sortButtonTextActive]}>Best</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.streakRow}
          onLayout={handleRowLayout}
          onPress={() => router.push({ pathname: '/task-detail', params: { taskId: item.taskId, tab: 'streaks' } })}
          accessibilityRole="button"
          accessibilityLabel={`${item.taskName}, ${item.length} day streak, ${format(item.startDate, 'MMM d')} to ${format(item.endDate, 'MMM d')}`}
          accessibilityHint="Opens this task's streaks"
        >
          <Text style={[styles.streakDateLabel, styles.streakDateLabelStart]}>{format(item.startDate, 'MMM d')}</Text>
          <View
            style={[
              styles.streakBar,
              { width: Math.max(20, (item.length / maxStreakLength) * maxBarWidth), backgroundColor: item.taskColor },
            ]}
          >
            <MaterialCommunityIcons name={item.taskIcon} size={12} color="#fff" />
            <Text style={styles.streakBarText}>{item.length}</Text>
          </View>
          <Text style={[styles.streakDateLabel, styles.streakDateLabelEnd]}>{format(item.endDate, 'MMM d')}</Text>
        </TouchableOpacity>
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
  heroBlock: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 20,
  },
  heroEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroValue: {
    fontSize: 64,
    fontWeight: '800',
    lineHeight: 64,
  },
  heroTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  heroSince: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  statsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: 20,
  },
  secondaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  secondaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  stripDividerV: {
    width: StyleSheet.hairlineWidth,
    height: 44,
    backgroundColor: colors.border,
  },
  secondaryValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  secondaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  sortToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 20,
    padding: 3,
    gap: 3,
  },
  sortButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 17,
  },
  sortButtonActive: {
    backgroundColor: '#007AFF',
  },
  sortButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sortButtonTextActive: {
    color: '#fff',
  },
  // Centered as a single group (label + bar + label) rather than the labels sitting in fixed-width
  // side columns -- that left a visible gap between each date and a shorter-than-max bar. Centering
  // the whole group keeps both date labels snug against the bar's own actual edges instead.
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  streakDateLabel: {
    width: STREAK_DATE_LABEL_WIDTH,
    fontSize: 11,
    color: colors.textSecondary,
  },
  streakDateLabelStart: {
    textAlign: 'right',
    marginRight: STREAK_LABEL_GAP,
  },
  streakDateLabelEnd: {
    textAlign: 'left',
    marginLeft: STREAK_LABEL_GAP,
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
