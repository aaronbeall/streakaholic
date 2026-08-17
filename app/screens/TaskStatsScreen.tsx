import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Dimensions, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AchievementsPreviewCard } from '../components/AchievementsPreviewCard';
import { HabitStatsShareCard } from '../components/ShareCards';
import { SharePreviewModal } from '../components/SharePreviewModal';
import { LazyMount } from '../components/LazyMount';
import { CompletionsOverTimeChartCard, HistogramChartCard } from '../components/StatsCharts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { useAchievementsStore } from '../stores/achievementsStore';
import { useSettingsStore } from '../stores/settingsStore';
import { Task } from '../types';
import { TimeFrame, dayOfWeekLabels, getChartData, getCompletionPatterns, getDateRange, hourOfDayLabels } from '../utils/data';

const CARD_HORIZONTAL_PADDING = 16;

interface TimeRangeButtonProps {
  range: TimeFrame;
  label: string;
  isSelected: boolean;
  color: string;
  onPress: (range: TimeFrame) => void;
}

const TimeRangeButton: React.FC<TimeRangeButtonProps> = ({ range, label, isSelected, color, onPress }) => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={[styles.timeRangeButton, isSelected && { backgroundColor: color }]}
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

// The Stats tab's content, rendered below the shared TaskHeader by TaskDetailScreen -- pulled out
// of a standalone routed screen so switching tabs is a local state change (see TaskDetailScreen)
// rather than a full navigation that re-transitions the header too.
export const TaskStatsView: React.FC<{ task: Task }> = ({ task }) => {
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<TimeFrame>('month');
  const [isCumulative, setIsCumulative] = useState(true);
  const [shareVisible, setShareVisible] = useState(false);
  const [includeNameInShare, setIncludeNameInShare] = useState(true);
  // Measured from the actual rendered container rather than guessed from Dimensions.get('window')
  // minus a hardcoded constant -- that guess didn't account precisely for the content padding,
  // which is what left charts clipping on the right edge on some devices. The fallback here (used
  // only for the very first frame, before onLayout fires) still subtracts the expected padding.
  const [chartAreaWidth, setChartAreaWidth] = useState(Dimensions.get('window').width - 32);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleChartSectionLayout = (event: LayoutChangeEvent) => {
    setChartAreaWidth(event.nativeEvent.layout.width);
  };
  const chartWidth = Math.max(0, chartAreaWidth - CARD_HORIZONTAL_PADDING * 2);

  // Powers LazyMount below -- deferring a chart's first render until it's scrolled near the
  // viewport, rather than paying react-native-chart-kit's redraw cost for every chart the instant
  // this screen mounts. `contentRef` wraps the ScrollView's entire content (starting at content-
  // offset 0), so a chart's own measureLayout position relative to it is directly comparable to
  // `scrollY`.
  const contentRef = useRef<View>(null);
  const [scrollY, setScrollY] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollY(e.nativeEvent.contentOffset.y);
  }, []);
  const handleScrollViewLayout = useCallback((e: LayoutChangeEvent) => {
    setViewportHeight(e.nativeEvent.layout.height);
  }, []);
  // Stable across renders so it doesn't defeat CompletionsOverTimeChartCard's own React.memo --
  // an inline arrow here would be a fresh closure every render, exactly the prop-identity churn
  // this whole memoization pass exists to avoid.
  const handleToggleCumulative = useCallback(() => setIsCumulative(prev => !prev), []);

  // Powers the Achievements preview card below -- this task's own earned records only (see
  // AchievementsPreviewCard's own `taskScoped` doc comment for why global-scoped kinds like
  // Century Club get dropped once scoped this way), and a stable single-element task list so the
  // card's own internal useMemo doesn't recompute on every unrelated render. Hidden entirely (not
  // just its own celebration popup) once the user has turned celebrations off in Settings -- the
  // Trophy Case itself, and its own header nav button, stay reachable either way; this only
  // suppresses the *unprompted* showcase surfacing achievements they've said they don't want
  // pushed at them.
  const achievementCelebrationsEnabled = useSettingsStore(state => state.achievementCelebrationsEnabled);
  const allAchievements = useAchievementsStore(state => state.achievements);
  const taskAchievements = useMemo(
    () => allAchievements.filter(a => a.taskId === task.id),
    [allAchievements, task.id]
  );
  const achievementsPreviewTasks = useMemo(() => [task], [task]);
  const handleViewAchievements = useCallback(
    () => router.push({ pathname: '/trophies', params: { taskId: task.id } }),
    [router, task.id]
  );

  // Scoped to just this task (not the app's full task list) -- "All Time" should mean this
  // task's own history, not incidentally shift based on some unrelated task's older completions.
  const { start, end } = useMemo(() => getDateRange(timeRange, [task]), [timeRange, task]);
  // Missing this useMemo meant re-scanning every one of this task's completions (parsing dates,
  // computing hours) on *every* render, not just when the range or completions actually changed --
  // `allTimePatterns` right below already got this right.
  const { dayOfWeekData, hourOfDayData } = useMemo(
    () => getCompletionPatterns({ start, end }, task.completions || []),
    [start, end, task.completions]
  );

  const { labels, data } = useMemo(() => getChartData(timeRange, task.completions || [], isCumulative), [timeRange, task.completions, isCumulative]);
  // Memoized so react-native-chart-kit sees a stable `chartData` reference (and can skip its own
  // re-render/redraw work) whenever this component re-renders for an unrelated reason, not just
  // when `labels`/`data`/`task.color` actually change.
  const chartData = useMemo(() => ({
    labels,
    datasets: [{
      data,
      color: (opacity = 1) => task.color,
      strokeWidth: 2,
    }],
  }), [labels, data, task.color]);

  const dayOfWeekChartData = useMemo(() => ({
    labels: dayOfWeekLabels,
    datasets: [{
      data: dayOfWeekData,
    }],
  }), [dayOfWeekData]);

  const hourOfDayChartData = useMemo(() => ({
    labels: hourOfDayLabels,
    datasets: [{
      data: hourOfDayData,
    }],
  }), [hourOfDayData]);

  // The current streak already has its own badge up in TaskHeader -- repeating it here would be
  // redundant, so Best Streak is the headline stat instead, with a "current" tag when you're
  // actively living it (current === best).
  const currentStreak = task.stats?.currentStreak || 0;
  const bestStreak = task.stats?.bestStreak || 0;
  const isOnBestStreak = bestStreak > 0 && currentStreak === bestStreak;
  const createdAtLabel = format(parseISO(task.createdAt), 'MMM d, yyyy');
  const daysTracked = Math.max(1, differenceInCalendarDays(new Date(), parseISO(task.createdAt)) + 1);
  const totalCompletions = task.stats?.totalCompletions || 0;
  const avgPerWeek = totalCompletions / (daysTracked / 7);

  // All-time day-of-week histogram for "Best Day" -- deliberately independent of the Activity
  // section's own time-range toggle below, so this stays a stable lifetime summary rather than
  // shifting depending on whatever range happens to be selected in the chart.
  const allTimePatterns = useMemo(
    () => getCompletionPatterns({ start: new Date(0), end: new Date() }, task.completions || []),
    [task.completions]
  );
  const bestDayCount = Math.max(...allTimePatterns.dayOfWeekData);
  const bestDayLabel = bestDayCount > 0 ? dayOfWeekLabels[allTimePatterns.dayOfWeekData.indexOf(bestDayCount)] : '—';

  return (
    <View style={styles.container}>
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
            accessibilityLabel={`Share ${task.name} progress`}
          >
            <MaterialCommunityIcons name="share-variant" size={19} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={styles.heroEyebrowRow}>
            <MaterialCommunityIcons name="check-decagram" size={16} color={task.color} />
            <Text style={styles.heroEyebrow}>Days completed</Text>
          </View>
          <Text style={[styles.heroValue, { color: task.color }]}>{totalCompletions}</Text>
          <Text style={styles.heroSince}>Since {createdAtLabel}</Text>
        </View>

        <View style={styles.statsDivider} />

        <View style={styles.secondaryStrip}>
          <View style={styles.secondaryItem}>
            <Text style={styles.secondaryValue}>{bestStreak}</Text>
            <View style={styles.labelRow}>
              <MaterialCommunityIcons name="trophy" size={14} color="#FFD700" />
              <Text style={styles.secondaryLabel}>Best streak</Text>
            </View>
            {isOnBestStreak && <Text style={styles.secondaryTag}>● current</Text>}
          </View>
          <View style={styles.stripDividerV} />
          <View style={styles.secondaryItem}>
            <Text style={styles.secondaryValue}>{daysTracked}</Text>
            <Text style={styles.secondaryLabel}>Days tracked</Text>
          </View>
        </View>

        <View style={styles.statsDividerMinor} />

        <View style={styles.tertiaryStrip}>
          <View style={styles.tertiaryItem}>
            <Text style={styles.tertiaryValue}>{Math.round((task.stats?.completionRate || 0) * 100)}%</Text>
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
            achievements={taskAchievements}
            activeTasks={achievementsPreviewTasks}
            taskScoped
            accentColor={task.color}
            onViewAll={handleViewAchievements}
          />
        )}

        <View style={styles.chartSection} onLayout={handleChartSectionLayout}>
          <View style={styles.chartHeader}>
            <Text style={styles.sectionTitle}>Progress</Text>
            <View style={styles.timeRangeContainer}>
              <TimeRangeButton
                range="week"
                label="Week"
                isSelected={timeRange === 'week'}
                color={task.color}
                onPress={setTimeRange}
              />
              <TimeRangeButton
                range="month"
                label="Month"
                isSelected={timeRange === 'month'}
                color={task.color}
                onPress={setTimeRange}
              />
              <TimeRangeButton
                range="year"
                label="Year"
                isSelected={timeRange === 'year'}
                color={task.color}
                onPress={setTimeRange}
              />
              <TimeRangeButton
                range="all"
                label="All time"
                isSelected={timeRange === 'all'}
                color={task.color}
                onPress={setTimeRange}
              />
            </View>
          </View>
          <LazyMount contentRef={contentRef} scrollY={scrollY} viewportHeight={viewportHeight}>
            <CompletionsOverTimeChartCard
              chartData={chartData}
              chartWidth={chartWidth}
              color={task.color}
              isCumulative={isCumulative}
              onToggleCumulative={handleToggleCumulative}
            />
          </LazyMount>

          <LazyMount contentRef={contentRef} scrollY={scrollY} viewportHeight={viewportHeight}>
            <HistogramChartCard
              title="Most active days"
              chartData={dayOfWeekChartData}
              chartWidth={chartWidth}
              color={task.color}
            />
          </LazyMount>

          <LazyMount contentRef={contentRef} scrollY={scrollY} viewportHeight={viewportHeight}>
            <HistogramChartCard
              title="Most active times"
              chartData={hourOfDayChartData}
              chartWidth={chartWidth}
              color={task.color}
            />
          </LazyMount>
        </View>
        </View>
      </ScrollView>
      <SharePreviewModal
        visible={shareVisible}
        title="Share habit progress"
        filename={`streakaholic-${task.id}-progress`}
        onClose={() => setShareVisible(false)}
        option={{
          label: 'Include habit name',
          value: includeNameInShare,
          onValueChange: setIncludeNameInShare,
        }}
      >
        <HabitStatsShareCard
          name={task.name}
          includeName={includeNameInShare}
          icon={task.icon}
          color={task.color}
          currentStreak={currentStreak}
          bestStreak={bestStreak}
          totalCompletions={totalCompletions}
          completionRate={task.stats?.completionRate || 0}
          since={format(parseISO(task.createdAt), 'MMM yyyy')}
        />
      </SharePreviewModal>
    </View>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  // No card chrome at all for the stats section -- typography and whitespace carry it instead:
  // a centered headline number, a hairline rule, a borderless stat strip divided by thin
  // vertical rules, and a small caption line for the rest. Reads as an editorial stat block
  // rather than a stack of repeated boxes.
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
  // A lighter-weight rule separating tier 2 from tier 3 -- shorter margin, same hairline weight,
  // so all three tiers read as clearly divided sections rather than an ambiguous run-on list.
  statsDividerMinor: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: 16,
  },
  // Icon sits inline next to its label (not stacked above the value) for every tier below
  // the hero, so the number itself reads first and the icon just tags the label beside it.
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // Tier 2: Best Streak / Total Days -- a divided strip, same formal treatment as the old
  // primary strip, one size down from the hero.
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
  secondaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  secondaryTag: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.isDark ? '#FF6B6B' : '#C0392B',
  },
  // Tier 3: Completion rate / Weekly average / Best day -- plain spacing, no dividers, deliberately the lightest
  // and least formal of the three tiers.
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
});
