import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Dimensions, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AchievementsPreviewCard } from '../components/AchievementsPreviewCard';
import { EmptyState } from '../components/EmptyState';
import { LazyMount } from '../components/LazyMount';
import { DashboardStatsShareCard } from '../components/ShareCards';
import { SharePreviewModal } from '../components/SharePreviewModal';
import { CompletionsOverTimeChartCard, HistogramChartCard } from '../components/StatsCharts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { useAchievementsStore } from '../stores/achievementsStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useTaskStore } from '../stores/taskStore';
import { Task } from '../types';
import { TimeFrame, calculateAggregateStats, dayOfWeekLabels, getChartData, getCompletionPatterns, getDateRange, hourOfDayLabels } from '../utils/data';

const CARD_HORIZONTAL_PADDING = 16;
const ACCENT = '#007AFF';

interface TimeRangeButtonProps {
  range: TimeFrame;
  label: string;
  isSelected: boolean;
  onPress: (range: TimeFrame) => void;
}

const TimeRangeButton: React.FC<TimeRangeButtonProps> = ({ range, label, isSelected, onPress }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={[styles.timeRangeButton, isSelected && { backgroundColor: ACCENT }]}
      onPress={() => onPress(range)}
      accessibilityRole="radio"
      accessibilityState={{ checked: isSelected }}
    >
      <Text style={[styles.timeRangeButtonText, isSelected && { color: '#fff' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

// The Stats tab's content for the aggregate (multi-task) dashboard -- styled identically to a
// single task's TaskStatsView (same no-card-chrome tiered hierarchy, same chart cards), adapted
// for a task list instead of one task. `tasks` here is already filtered by the header's task
// picker; that filter applies to everything below, both the headline stats and the charts.
export const DashboardStatsView: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<TimeFrame>('week');
  const [isCumulative, setIsCumulative] = useState(true);
  const [shareVisible, setShareVisible] = useState(false);
  // Measured from the actual rendered container rather than guessed from Dimensions.get('window')
  // minus a hardcoded constant -- see TaskStatsView for why.
  const [chartAreaWidth, setChartAreaWidth] = useState(Dimensions.get('window').width - 32);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleChartSectionLayout = (event: LayoutChangeEvent) => {
    setChartAreaWidth(event.nativeEvent.layout.width);
  };
  const chartWidth = Math.max(0, chartAreaWidth - CARD_HORIZONTAL_PADDING * 2);

  // Powers LazyMount below -- see TaskStatsView for the full rationale (`contentRef` wraps the
  // ScrollView's entire content starting at content-offset 0, so a chart's own measureLayout
  // position relative to it is directly comparable to `scrollY`).
  const contentRef = useRef<View>(null);
  const [scrollY, setScrollY] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollY(e.nativeEvent.contentOffset.y);
  }, []);
  const handleScrollViewLayout = useCallback((e: LayoutChangeEvent) => {
    setViewportHeight(e.nativeEvent.layout.height);
  }, []);
  const handleToggleCumulative = useCallback(() => setIsCumulative(prev => !prev), []);

  // Powers the Achievements preview card below -- deliberately reads the *full* active task list
  // (not the `tasks` prop, which is already narrowed by Dashboard's own header task-filter
  // bubbles) plus every recorded achievement, unfiltered: your overall trophy status is a
  // persistent, cross-session fact, not something that should shrink just because a couple of task
  // filter chips happen to be unchecked right now for charting purposes. Hidden entirely once
  // celebrations are off in Settings -- see TaskStatsView for the same reasoning (the Trophy Case
  // and its own header nav button both stay reachable regardless, this only suppresses the
  // unprompted showcase).
  const achievementCelebrationsEnabled = useSettingsStore(state => state.achievementCelebrationsEnabled);
  const allTasks = useTaskStore(state => state.tasks);
  const allActiveTasks = useMemo(() => allTasks.filter(t => !t.archived), [allTasks]);
  const allAchievements = useAchievementsStore(state => state.achievements);
  const handleViewAchievements = useCallback(() => router.push('/trophies'), [router]);

  // Headline stats are always all-time across the filtered tasks -- the Activity time-range
  // picker below only scopes the charts, not these numbers. Streak-type stats in particular
  // don't make sense clipped to a sub-window (a streak can span outside the selected range).
  const stats = useMemo(() => calculateAggregateStats(tasks), [tasks]);
  const allCompletionsAllTime = useMemo(() => tasks.flatMap(t => t.completions || []), [tasks]);

  const earliestCreatedAt = useMemo(() => {
    if (tasks.length === 0) return null;
    return tasks.reduce((earliest, task) => (task.createdAt < earliest ? task.createdAt : earliest), tasks[0].createdAt);
  }, [tasks]);
  const createdAtLabel = earliestCreatedAt ? format(parseISO(earliestCreatedAt), 'MMM d, yyyy') : '—';
  const daysTracked = earliestCreatedAt
    ? Math.max(1, differenceInCalendarDays(new Date(), parseISO(earliestCreatedAt)) + 1)
    : 0;
  const avgPerWeek = daysTracked > 0 ? stats.totalCompletions / (daysTracked / 7) : 0;

  // Replaces a plain "Current Streak" (previously just the single longest streak among the
  // filtered tasks, via stats.currentStreak -- see calculateAggregateStats) per explicit user
  // direction: on an aggregate, multi-task screen, one task's own streak length says little about
  // overall consistency (a lone 50-day streak can mask five other lapsed tasks), whereas "how many
  // of your tasks are currently on a live streak" is the more representative "am I keeping up with
  // everything" signal for this context. `up_to_date`/`expiring` both count as "active" (a streak
  // that's still alive, whether comfortably or urgently) -- only `expired`/`never_started` don't.
  const activeStreakCount = useMemo(
    () => tasks.filter(t => t.stats?.streakStatus === 'up_to_date' || t.stats?.streakStatus === 'expiring').length,
    [tasks]
  );

  // All-time day-of-week histogram for "Best Day" -- deliberately independent of the Activity
  // section's own time-range toggle below, same reasoning as TaskStatsView.
  const allTimePatterns = useMemo(
    () => getCompletionPatterns({ start: new Date(0), end: new Date() }, allCompletionsAllTime),
    [allCompletionsAllTime]
  );
  const bestDayCount = Math.max(...allTimePatterns.dayOfWeekData);
  const bestDayLabel = bestDayCount > 0 ? dayOfWeekLabels[allTimePatterns.dayOfWeekData.indexOf(bestDayCount)] : '—';

  // Everything below this point -- the charts -- IS scoped to the selected time range.
  const { start, end } = useMemo(() => getDateRange(timeRange, tasks), [timeRange, tasks]);
  const rangeCompletions = useMemo(() => allCompletionsAllTime.filter(completion => {
    if (timeRange === 'all') return true;
    const completionDate = parseISO(completion.date);
    return completionDate >= start && completionDate <= end;
  }), [allCompletionsAllTime, start, end, timeRange]);

  const { dayOfWeekData, hourOfDayData } = useMemo(
    () => getCompletionPatterns({ start, end }, rangeCompletions),
    [rangeCompletions, start, end]
  );
  const { labels, data } = useMemo(
    () => getChartData(timeRange, rangeCompletions, isCumulative),
    [timeRange, rangeCompletions, isCumulative]
  );

  // Per-task breakdown, same time range as the rest of Activity -- which task is actually
  // contributing to the totals above.
  const taskTotals = useMemo(() => tasks.map(task => {
    const requiredTimes = Math.max(1, task.timesPerDay || 1);
    const total = (task.completions || []).filter(completion => {
      if (completion.timesCompleted < requiredTimes) return false;
      if (timeRange === 'all') return true;
      const date = parseISO(completion.date);
      return date >= start && date <= end;
    }).length;
    return { task, total };
  }), [tasks, start, end, timeRange]);
  const maxTaskTotal = Math.max(1, ...taskTotals.map(t => t.total));

  // Memoized so react-native-chart-kit sees stable references (and can skip its own re-render/
  // redraw work) whenever this component re-renders for an unrelated reason, not just when the
  // underlying data actually changes.
  const chartData = useMemo(() => ({
    labels,
    datasets: [{
      data,
      color: (opacity = 1) => ACCENT,
      strokeWidth: 2,
    }],
  }), [labels, data]);

  const dayOfWeekChartData = useMemo(() => ({
    labels: dayOfWeekLabels,
    datasets: [{ data: dayOfWeekData }],
  }), [dayOfWeekData]);

  const hourOfDayChartData = useMemo(() => ({
    labels: hourOfDayLabels,
    datasets: [{ data: hourOfDayData }],
  }), [hourOfDayData]);

  // Placed after every hook above (rules-of-hooks) -- previously a filtered-to-nothing view fell
  // through to the full stats layout below, rendering a wall of zeroed/NaN-adjacent stats (0
  // completions, an empty "0/0" streak ratio, "—" for Best Day) instead of a clear signal that
  // there's simply nothing selected. Matches DashboardStreaksView/DashboardCalendarView's own
  // identical "no habits selected" treatment -- see EmptyState.tsx.
  if (tasks.length === 0) {
    return <EmptyState icon="chart-line" title="No habits selected" />;
  }

  return (
    <>
    <ScrollView
      style={styles.content}
      contentContainerStyle={{ paddingBottom: insets.bottom }}
      onScroll={handleScroll}
      onLayout={handleScrollViewLayout}
      scrollEventThrottle={100}
    >
      <View ref={contentRef}>
      <View style={styles.heroBlock}>
        <TouchableOpacity
          style={styles.heroShareButton}
          onPress={() => setShareVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Share dashboard progress"
        >
          <MaterialCommunityIcons name="share-variant" size={19} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.heroEyebrowRow}>
          <MaterialCommunityIcons name="check-decagram" size={16} color={ACCENT} />
          <Text style={styles.heroEyebrow}>Habit days completed</Text>
        </View>
        <Text style={[styles.heroValue, { color: ACCENT }]}>{stats.totalCompletions}</Text>
        <Text style={styles.heroSince}>Since {createdAtLabel}</Text>
      </View>

      <View style={styles.statsDivider} />

      <View style={styles.secondaryStrip}>
        <View
          style={styles.secondaryItem}
          accessible
          accessibilityLabel={`${activeStreakCount} of ${tasks.length} habits currently on an active streak`}
        >
          <Text style={styles.secondaryValue}>
            {activeStreakCount}
            <Text style={[styles.secondaryValue, styles.secondaryValueTotal]}>/{tasks.length}</Text>
          </Text>
          <View style={styles.labelRow}>
            <MaterialCommunityIcons name="fire" size={14} color="#FF6B6B" />
            <Text style={styles.secondaryLabel}>Active streaks</Text>
          </View>
        </View>
        <View style={styles.stripDividerV} />
        <View style={styles.secondaryItem}>
          <Text style={styles.secondaryValue}>{stats.bestStreak}</Text>
          <View style={styles.labelRow}>
            <MaterialCommunityIcons name="trophy" size={14} color="#FFD700" />
            <Text style={styles.secondaryLabel}>Best streak</Text>
          </View>
        </View>
      </View>

      <View style={styles.statsDividerMinor} />

      <View style={styles.tertiaryStrip}>
        <View style={styles.tertiaryItem}>
          <Text style={styles.tertiaryValue}>{Math.round(stats.completionRate * 100)}%</Text>
          <Text style={styles.tertiaryLabel}>Completion rate</Text>
        </View>
        <View style={styles.stripDividerVMinor} />
        <View style={styles.tertiaryItem}>
          <Text style={styles.tertiaryValue}>{avgPerWeek.toFixed(1)}</Text>
          <Text style={styles.tertiaryLabel}>Weekly average</Text>
        </View>
        <View style={styles.stripDividerVMinor} />
        <View style={styles.tertiaryItem}>
          <Text style={styles.tertiaryValue}>{bestDayLabel}</Text>
          <Text style={styles.tertiaryLabel}>Best day</Text>
        </View>
      </View>

      {achievementCelebrationsEnabled && (
        <AchievementsPreviewCard
          achievements={allAchievements}
          activeTasks={allActiveTasks}
          taskScoped={false}
          accentColor={ACCENT}
          onViewAll={handleViewAchievements}
        />
      )}

      <View style={styles.chartSection} onLayout={handleChartSectionLayout}>
        <View style={styles.chartHeader}>
          <Text style={styles.sectionTitle}>Progress</Text>
          <View style={styles.timeRangeContainer}>
            <TimeRangeButton range="week" label="Week" isSelected={timeRange === 'week'} onPress={setTimeRange} />
            <TimeRangeButton range="month" label="Month" isSelected={timeRange === 'month'} onPress={setTimeRange} />
            <TimeRangeButton range="year" label="Year" isSelected={timeRange === 'year'} onPress={setTimeRange} />
            <TimeRangeButton range="all" label="All time" isSelected={timeRange === 'all'} onPress={setTimeRange} />
          </View>
        </View>

        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Completed days by habit</Text>
          <View style={styles.hBarList}>
            {taskTotals.map(({ task, total }) => (
              <TouchableOpacity
                key={task.id}
                style={styles.hBarRow}
                onPress={() => router.push({ pathname: '/task-detail', params: { taskId: task.id, tab: 'stats' } })}
                accessibilityRole="button"
                accessibilityLabel={`${task.name}, ${total} days completed`}
                accessibilityHint="Opens this habit's stats"
              >
                <MaterialCommunityIcons name={task.icon} size={16} color={task.color} style={styles.hBarIcon} />
                <View style={styles.hBarTrack}>
                  <View
                    style={[
                      styles.hBarFill,
                      { width: `${Math.max(4, (total / maxTaskTotal) * 100)}%`, backgroundColor: task.color },
                    ]}
                  />
                </View>
                <Text style={styles.hBarValue}>{total}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <LazyMount contentRef={contentRef} scrollY={scrollY} viewportHeight={viewportHeight}>
          <CompletionsOverTimeChartCard
            chartData={chartData}
            chartWidth={chartWidth}
            color={ACCENT}
            isCumulative={isCumulative}
            onToggleCumulative={handleToggleCumulative}
          />
        </LazyMount>

        <LazyMount contentRef={contentRef} scrollY={scrollY} viewportHeight={viewportHeight}>
          <HistogramChartCard
            title="Most active days"
            chartData={dayOfWeekChartData}
            chartWidth={chartWidth}
            color={ACCENT}
          />
        </LazyMount>

        <LazyMount contentRef={contentRef} scrollY={scrollY} viewportHeight={viewportHeight}>
          <HistogramChartCard
            title="Most active times"
            chartData={hourOfDayChartData}
            chartWidth={chartWidth}
            color={ACCENT}
          />
        </LazyMount>
      </View>
      </View>
    </ScrollView>
    <SharePreviewModal
      visible={shareVisible}
      title="Share progress"
      filename="streakaholic-progress"
      onClose={() => setShareVisible(false)}
    >
      <DashboardStatsShareCard
        totalCompletions={stats.totalCompletions}
        activeStreaks={activeStreakCount}
        habitCount={tasks.length}
        bestStreak={stats.bestStreak}
        completionRate={stats.completionRate}
        since={earliestCreatedAt ? format(parseISO(earliestCreatedAt), 'MMM yyyy') : '—'}
      />
    </SharePreviewModal>
    </>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: {
    flex: 1,
    padding: 16,
  },
  heroBlock: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 20,
  },
  heroShareButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.iconButtonBackground,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
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
  heroSince: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 6,
  },
  statsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: 20,
  },
  statsDividerMinor: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  stripDividerVMinor: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: colors.border,
  },
  secondaryValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  // Nested Text (the "/N" denominator, e.g. "5" bold + "/7" smaller-and-muted) -- a lighter
  // weight/size for the total reads as "5 out of 7" rather than two equally-weighted numbers
  // competing for attention, matching how ratios are conventionally typeset.
  secondaryValueTotal: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  secondaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tertiaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  tertiaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  tertiaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  tertiaryLabel: {
    fontSize: 10,
    color: colors.textTertiary,
  },
  chartSection: {
    marginBottom: 20,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  timeRangeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  timeRangeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
  },
  timeRangeButtonText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: CARD_HORIZONTAL_PADDING,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  // One row per task, horizontal bars -- grows vertically to fit however many tasks there are
  // instead of needing horizontal scrolling for a wide vertical-bar chart.
  hBarList: {
    gap: 10,
    paddingVertical: 4,
  },
  hBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hBarIcon: {
    width: 18,
  },
  hBarTrack: {
    flex: 1,
    height: 14,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 7,
    overflow: 'hidden',
  },
  hBarFill: {
    height: '100%',
    borderRadius: 7,
  },
  hBarValue: {
    width: 28,
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
});
