import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BarChart, LineChart } from 'react-native-chart-kit';
import tinycolor from 'tinycolor2';
import { TaskHeader } from '../components/TaskHeader';
import { useTaskContext } from '../context/TaskContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { TimeFrame, dayOfWeekLabels, getChartData, getCompletionPatterns, getDateRange, hourOfDayLabels } from '../utils/data';

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

export default function TaskStatsScreen() {
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { tasks } = useTaskContext();
  const [timeRange, setTimeRange] = useState<TimeFrame>('month');
  const [isCumulative, setIsCumulative] = useState(false);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const task = tasks.find(t => t.id === taskId);
  if (!task) {
    throw new Error('Missing task');
  }

  const { start, end } = useMemo(() => getDateRange(timeRange, tasks), [timeRange, tasks]);
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

  const getBackgroundColor = (color: string) => {
    const colorObj = tinycolor(color);
    return tinycolor({
      h: colorObj.toHsl().h,
      s: 90,
      l: colors.isDark ? 16 : 98
    }).toString();
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

  return (
    <View style={styles.container}>
      <TaskHeader task={task} />

      <ScrollView style={styles.content}>
        <View style={styles.statsGrid}>
          {task.stats?.streakStatus === 'up_to_date' && task.stats.currentStreak > 0 ? (
            <View style={[styles.statCard, { backgroundColor: getBackgroundColor(task.color) }]}>
              <MaterialCommunityIcons name="fire" size={24} color="#FF6B6B" />
              <Text style={[styles.statNumber, { color: '#FF6B6B' }]}>{task.stats.currentStreak}</Text>
              <Text style={styles.statLabel}>Current Streak</Text>
            </View>
          ) : task.stats?.streakStatus === 'expiring' && task.stats.currentStreak > 0 ? (
            <View style={[styles.statCard, { backgroundColor: getBackgroundColor(task.color) }]}>
              <MaterialCommunityIcons name="clock-outline" size={24} color="#FFA726" />
              <Text style={[styles.statNumber, { color: '#FFA726' }]}>{task.stats.currentStreak}</Text>
              <Text style={styles.statLabel}>Current Streak</Text>
            </View>
          ) : task.stats?.lastStreak && task.stats.lastStreak > 0 ? (
            <View style={[styles.statCard, { backgroundColor: getBackgroundColor(task.color) }]}>
              <MaterialCommunityIcons name="sleep" size={24} color="#90A4AE" />
              <Text style={[styles.statNumber, { color: '#90A4AE' }]}>{task.stats.lastStreak}</Text>
              <Text style={styles.statLabel}>Last Streak</Text>
            </View>
          ) : null}
          <View style={[styles.statCard, { backgroundColor: getBackgroundColor(task.color) }]}>
            <MaterialCommunityIcons name="trophy" size={24} color="#FFD700" />
            <Text style={[styles.statNumber, { color: '#FFD700' }]}>{task.stats?.bestStreak || 0}</Text>
            <Text style={styles.statLabel}>Best Streak</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: getBackgroundColor(task.color) }]}>
            <MaterialCommunityIcons name="check-circle" size={24} color="#4CAF50" />
            <Text style={[styles.statNumber, { color: '#4CAF50' }]}>{task.stats?.totalCompletions || 0}</Text>
            <Text style={styles.statLabel}>Total Completions</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: getBackgroundColor(task.color) }]}>
            <MaterialCommunityIcons name="chart-line" size={24} color="#2196F3" />
            <Text style={[styles.statNumber, { color: '#2196F3' }]}>{Math.round((task.stats?.completionRate || 0) * 100)}%</Text>
            <Text style={styles.statLabel}>Completion Rate</Text>
          </View>
        </View>

        <View style={styles.chartSection}>
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
          <View style={[styles.chartCard, { padding: 0, marginBottom: 16 }]}>
            <View style={styles.chartContainer}>
              <LineChart
                data={chartData}
                width={Dimensions.get('window').width - 48}
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

          <View style={[styles.chartCard, { padding: 0, marginBottom: 16 }]}>
            <BarChart
              data={dayOfWeekChartData}
              width={Dimensions.get('window').width - 48}
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

          <View style={[styles.chartCard, { padding: 0 }]}>
            <LineChart
              data={hourOfDayChartData}
              width={Dimensions.get('window').width - 48}
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
                fillShadowGradientOpacity: .2,
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
          </View>
        </View>
      </ScrollView>
    </View>
  );
} 

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    marginVertical: 8,
  },
  statLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  chartSection: {
    marginBottom: 24,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
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
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
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