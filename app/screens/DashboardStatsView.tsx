import { MaterialCommunityIcons } from '@expo/vector-icons';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import React, { useMemo, useState } from 'react';
import { Dimensions, LayoutChangeEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
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
  const [timeRange, setTimeRange] = useState<TimeFrame>('week');
  const [isCumulative, setIsCumulative] = useState(false);
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

  const chartData = {
    labels,
    datasets: [{
      data,
      color: (opacity = 1) => ACCENT,
      strokeWidth: 2,
    }],
  };

  const dayOfWeekChartData = {
    labels: dayOfWeekLabels,
    datasets: [{ data: dayOfWeekData }],
  };

  const hourOfDayChartData = {
    labels: hourOfDayLabels,
    datasets: [{ data: hourOfDayData }],
  };

  const baseChartConfig = {
    backgroundColor: colors.surface,
    backgroundGradientFrom: colors.surface,
    backgroundGradientTo: colors.surface,
    decimalPlaces: 0,
    labelColor: () => colors.textSecondary,
    style: {
      borderRadius: 16,
    },
    propsForLabels: {
      fontSize: 11,
      fontFamily: 'System',
      fontWeight: '400' as const,
    },
  };

  return (
    <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: insets.bottom }}>
      <View style={styles.heroBlock}>
        <View style={styles.heroEyebrowRow}>
          <MaterialCommunityIcons name="check-decagram" size={16} color={ACCENT} />
          <Text style={styles.heroEyebrow}>Total Completions</Text>
        </View>
        <Text style={[styles.heroValue, { color: ACCENT }]}>{stats.totalCompletions}</Text>
        <Text style={styles.heroSince}>Since {createdAtLabel}</Text>
      </View>

      <View style={styles.statsDivider} />

      <View style={styles.secondaryStrip}>
        <View style={styles.secondaryItem}>
          <Text style={styles.secondaryValue}>{stats.currentStreak}</Text>
          <View style={styles.labelRow}>
            <MaterialCommunityIcons name="fire" size={14} color="#FF6B6B" />
            <Text style={styles.secondaryLabel}>Current Streak</Text>
          </View>
        </View>
        <View style={styles.stripDividerV} />
        <View style={styles.secondaryItem}>
          <Text style={styles.secondaryValue}>{stats.bestStreak}</Text>
          <View style={styles.labelRow}>
            <MaterialCommunityIcons name="trophy" size={14} color="#FFD700" />
            <Text style={styles.secondaryLabel}>Best Streak</Text>
          </View>
        </View>
      </View>

      <View style={styles.statsDividerMinor} />

      <View style={styles.tertiaryStrip}>
        <View style={styles.tertiaryItem}>
          <Text style={styles.tertiaryValue}>{Math.round(stats.completionRate * 100)}%</Text>
          <Text style={styles.tertiaryLabel}>Rate</Text>
        </View>
        <View style={styles.stripDividerVMinor} />
        <View style={styles.tertiaryItem}>
          <Text style={styles.tertiaryValue}>{avgPerWeek.toFixed(1)}</Text>
          <Text style={styles.tertiaryLabel}>Per Week</Text>
        </View>
        <View style={styles.stripDividerVMinor} />
        <View style={styles.tertiaryItem}>
          <Text style={styles.tertiaryValue}>{bestDayLabel}</Text>
          <Text style={styles.tertiaryLabel}>Best Day</Text>
        </View>
      </View>

      <View style={styles.chartSection} onLayout={handleChartSectionLayout}>
        <View style={styles.chartHeader}>
          <Text style={styles.sectionTitle}>Activity</Text>
          <View style={styles.timeRangeContainer}>
            <TimeRangeButton range="week" label="Week" isSelected={timeRange === 'week'} onPress={setTimeRange} />
            <TimeRangeButton range="month" label="Month" isSelected={timeRange === 'month'} onPress={setTimeRange} />
            <TimeRangeButton range="year" label="Year" isSelected={timeRange === 'year'} onPress={setTimeRange} />
            <TimeRangeButton range="all" label="All Time" isSelected={timeRange === 'all'} onPress={setTimeRange} />
          </View>
        </View>

        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Total Completions</Text>
          <View style={styles.hBarList}>
            {taskTotals.map(({ task, total }) => (
              <View key={task.id} style={styles.hBarRow}>
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
              </View>
            ))}
          </View>
        </View>

        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Completions Over Time</Text>
          <View style={styles.chartContainer}>
            <LineChart
              data={chartData}
              width={chartWidth}
              height={180}
              chartConfig={{
                ...baseChartConfig,
                color: (opacity = 1) => ACCENT,
                propsForDots: { r: '4' },
                propsForBackgroundLines: {
                  strokeDasharray: '',
                  stroke: colors.border,
                  strokeWidth: 1,
                },
                fillShadowGradient: ACCENT,
                fillShadowGradientOpacity: 0.2,
              }}
              bezier
              withInnerLines={false}
              withOuterLines={false}
              withVerticalLines={false}
              withHorizontalLines={true}
              withDots={true}
              withShadow={true}
              style={styles.chart}
            />
            <TouchableOpacity
              style={[styles.cumulativeToggle, isCumulative && { backgroundColor: ACCENT }]}
              onPress={() => setIsCumulative(!isCumulative)}
            >
              <MaterialCommunityIcons
                name="chart-line-variant"
                size={20}
                color={isCumulative ? '#fff' : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>By Day of Week</Text>
          <BarChart
            data={dayOfWeekChartData}
            width={chartWidth}
            height={180}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={{
              ...baseChartConfig,
              color: (opacity = 1) => ACCENT,
              propsForBackgroundLines: {
                strokeDasharray: '',
                stroke: 'rgba(0,0,0,0)',
                strokeWidth: 1,
              },
            }}
            style={styles.chart}
            fromZero
          />
        </View>

        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>By Time of Day</Text>
          <BarChart
            data={hourOfDayChartData}
            width={chartWidth}
            height={180}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={{
              ...baseChartConfig,
              color: (opacity = 1) => ACCENT,
              propsForBackgroundLines: {
                strokeDasharray: '',
                stroke: 'rgba(0,0,0,0)',
                strokeWidth: 1,
              },
            }}
            style={styles.chart}
            fromZero
          />
        </View>
      </View>
    </ScrollView>
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
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  chartContainer: {
    position: 'relative',
  },
  cumulativeToggle: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.isDark ? colors.surfaceSecondary : 'rgba(240, 240, 240, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
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
