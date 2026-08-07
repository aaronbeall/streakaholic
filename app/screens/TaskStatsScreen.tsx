import { MaterialCommunityIcons } from '@expo/vector-icons';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import React, { useMemo, useState } from 'react';
import { Dimensions, LayoutChangeEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
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
  const [timeRange, setTimeRange] = useState<TimeFrame>('month');
  const [isCumulative, setIsCumulative] = useState(false);
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

  // Scoped to just this task (not the app's full task list) -- "All Time" should mean this
  // task's own history, not incidentally shift based on some unrelated task's older completions.
  const { start, end } = useMemo(() => getDateRange(timeRange, [task]), [timeRange, task]);
  const { dayOfWeekData, hourOfDayData } = getCompletionPatterns(
    { start, end },
    task.completions || []
  );

  const { labels, data } = useMemo(() => getChartData(timeRange, task.completions || [], isCumulative), [timeRange, task.completions, isCumulative]);
  const chartData = {
    labels,
    datasets: [{
      data,
      color: (opacity = 1) => task.color,
      strokeWidth: 2,
    }],
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

  const dayOfWeekChartData = {
    labels: dayOfWeekLabels,
    datasets: [{
      data: dayOfWeekData,
    }],
  };

  const hourOfDayChartData = {
    labels: hourOfDayLabels,
    datasets: [{
      data: hourOfDayData,
    }],
  };

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
      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: insets.bottom }}>
        <View style={styles.heroBlock}>
          <View style={styles.heroEyebrowRow}>
            <MaterialCommunityIcons name="check-decagram" size={16} color={task.color} />
            <Text style={styles.heroEyebrow}>Total Completions</Text>
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
              <Text style={styles.secondaryLabel}>Best Streak</Text>
            </View>
            {isOnBestStreak && <Text style={styles.secondaryTag}>● current</Text>}
          </View>
          <View style={styles.stripDividerV} />
          <View style={styles.secondaryItem}>
            <Text style={styles.secondaryValue}>{daysTracked}</Text>
            <Text style={styles.secondaryLabel}>Total Days</Text>
          </View>
        </View>

        <View style={styles.statsDividerMinor} />

        <View style={styles.tertiaryStrip}>
          <View style={styles.tertiaryItem}>
            <Text style={styles.tertiaryValue}>{Math.round((task.stats?.completionRate || 0) * 100)}%</Text>
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
                label="All Time"
                isSelected={timeRange === 'all'}
                color={task.color}
                onPress={setTimeRange}
              />
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
                  color: (opacity = 1) => task.color,
                  propsForDots: {
                    r: '4',
                  },
                  propsForBackgroundLines: {
                    strokeDasharray: '',
                    stroke: colors.border,
                    strokeWidth: 1,
                  },
                  fillShadowGradient: task.color,
                  fillShadowGradientOpacity:.2,
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
                style={[styles.cumulativeToggle, isCumulative && { backgroundColor: task.color }]}
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
                color: (opacity = 1) => task.color,
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
                color: (opacity = 1) => task.color,
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
  // Tier 3: Rate / Per Week / Best Day -- plain spacing, no dividers, deliberately the lightest
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
});
