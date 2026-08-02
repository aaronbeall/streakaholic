import { MaterialCommunityIcons } from '@expo/vector-icons';
import { parseISO } from 'date-fns';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { useTaskContext } from '../context/TaskContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { TimeFrame, calculateAggregateStats, dayOfWeekLabels, getChartData, getCompletionPatterns, getDateRange, getDateRangeLabel, hourOfDayLabels } from '../utils/data';

const DashboardHeader: React.FC<{
  selectedTimeFrame: TimeFrame;
  onTimeFrameChange: (timeFrame: TimeFrame) => void;
  selectedTasks: string[];
  onTaskToggle: (taskId: string) => void;
  dateRangeLabel: string;
}> = ({ selectedTimeFrame, onTimeFrameChange, selectedTasks, onTaskToggle, dateRangeLabel }) => {
  const { tasks } = useTaskContext();
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const visibleTasks = tasks.filter(task => !task.archived);

  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.push('/')}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <MaterialCommunityIcons name="calendar" size={16} color={colors.textSecondary} style={styles.headerIcon} />
          <Text style={styles.headerTitle}>{dateRangeLabel}</Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.headerContent}>
        <View style={styles.taskFilterContainer}>
          {visibleTasks.map((task) => (
            <TouchableOpacity
              key={task.id}
              style={[
                styles.taskFilterButton,
                { backgroundColor: colors.overlay },
                selectedTasks.includes(task.id) && { backgroundColor: task.color },
              ]}
              onPress={() => onTaskToggle(task.id)}
            >
              <MaterialCommunityIcons
                name={task.icon}
                size={16}
                color={selectedTasks.includes(task.id) ? '#fff' : task.color}
              />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.timeFrameContainer}>
          {(['week', 'month', 'year', 'all'] as TimeFrame[]).map((timeFrame) => (
            <TouchableOpacity
              key={timeFrame}
              style={[
                styles.timeFrameButton,
                selectedTimeFrame === timeFrame && styles.selectedTimeFrame,
              ]}
              onPress={() => onTimeFrameChange(timeFrame)}
            >
              <Text style={[
                styles.timeFrameText,
                selectedTimeFrame === timeFrame && styles.selectedTimeFrameText,
              ]}>
                {timeFrame === 'week' ? 'Last Week' :
                 timeFrame === 'month' ? 'Last Month' :
                 timeFrame === 'year' ? 'Last Year' : 'All Time'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
};

export const DashboardScreen: React.FC = () => {
  const { tasks: allTasks } = useTaskContext();
  const tasks = useMemo(() => allTasks.filter(task => !task.archived), [allTasks]);
  const { width } = useWindowDimensions();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedTimeFrame, setSelectedTimeFrame] = useState<TimeFrame>('week');
  const [selectedTasks, setSelectedTasks] = useState<string[]>(tasks.map(t => t.id));
  const [isCumulative, setIsCumulative] = useState(false);

  const { start, end } = useMemo(() => getDateRange(selectedTimeFrame, tasks), [selectedTimeFrame, tasks]);
  const filteredTasks = useMemo(() => tasks.filter(task => selectedTasks.includes(task.id)), [tasks, selectedTasks]);

  const filteredTaskData = useMemo(() => {
    return filteredTasks.map(task => ({
      ...task,
      completions: task.completions?.filter(completion => {
        // Skip date filtering for "all" time frame
        if (selectedTimeFrame === 'all') return true;
        
        const completionDate = parseISO(completion.date);
        return completionDate >= start && completionDate <= end;
      }) || []
    }));
  }, [start, end, filteredTasks, selectedTimeFrame]);

  const allCompletions = useMemo(() => filteredTaskData.flatMap(task => task.completions || []), [filteredTaskData]);
  const { dayOfWeekData, hourOfDayData } = useMemo(() => getCompletionPatterns({ start, end }, allCompletions), [allCompletions, start, end]);

  const stats = useMemo(() => calculateAggregateStats(filteredTaskData), [filteredTaskData]);
  const { labels, data } = useMemo(() => getChartData(selectedTimeFrame, allCompletions, isCumulative), [allCompletions, isCumulative, selectedTimeFrame]);
  const chartData = {
    labels,
    datasets: [{
      data,
      color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
      strokeWidth: 2,
    }],
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

  const baseChartConfig = {
    backgroundColor: colors.surface,
    backgroundGradientFrom: colors.surface,
    backgroundGradientTo: colors.surface,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
    labelColor: () => colors.textSecondary,
    style: {
      borderRadius: 16,
    },
    propsForLabels: {
      fontSize: 11,
      fontFamily: 'System',
      fontWeight: '400',
    },
  };

  const statCardBackground = (light: string) => colors.isDark ? colors.surfaceSecondary : light;

  return (
    <View style={styles.container}>
      <DashboardHeader
        selectedTimeFrame={selectedTimeFrame}
        onTimeFrameChange={setSelectedTimeFrame}
        selectedTasks={selectedTasks}
        onTaskToggle={(taskId) => {
          setSelectedTasks(prev => 
            prev.includes(taskId)
              ? prev.filter(id => id !== taskId)
              : [...prev, taskId]
          );
        }}
        dateRangeLabel={getDateRangeLabel({ start, end })}
      />
      <ScrollView style={styles.content}>
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: statCardBackground('#E8F5E9') }]}>
            <MaterialCommunityIcons name="check-circle" size={24} color="#2E7D32" />
            <Text style={[styles.statLabel, { color: '#2E7D32' }]}>Total Completions</Text>
            <Text style={[styles.statValue, { color: '#2E7D32' }]}>{stats.totalCompletions}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: statCardBackground('#E3F2FD') }]}>
            <MaterialCommunityIcons name="chart-line" size={24} color="#1976D2" />
            <Text style={[styles.statLabel, { color: '#1976D2' }]}>Completion Rate</Text>
            <Text style={[styles.statValue, { color: '#1976D2' }]}>{Math.round(stats.completionRate * 100)}%</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: statCardBackground('#FFF3E0') }]}>
            <MaterialCommunityIcons name="fire" size={24} color="#E65100" />
            <Text style={[styles.statLabel, { color: '#E65100' }]}>Current Streak</Text>
            <Text style={[styles.statValue, { color: '#E65100' }]}>{stats.currentStreak}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: statCardBackground('#FFF8E1') }]}>
            <MaterialCommunityIcons name="trophy" size={24} color="#FFA000" />
            <Text style={[styles.statLabel, { color: '#FFA000' }]}>Best Streak</Text>
            <Text style={[styles.statValue, { color: '#FFA000' }]}>{stats.bestStreak}</Text>
          </View>
        </View>

        <View style={styles.chartContainer}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Activity</Text>
            <TouchableOpacity
              style={[styles.cumulativeToggle, isCumulative && styles.cumulativeToggleActive]}
              onPress={() => setIsCumulative(!isCumulative)}
            >
              <MaterialCommunityIcons
                name="chart-line-variant"
                size={20}
                color={isCumulative ? '#fff' : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
          <LineChart
            data={chartData}
            width={width - 48}
            height={220}
            chartConfig={{
              ...baseChartConfig,
              propsForDots: {
                r: '4',
              },
              propsForBackgroundLines: {
                strokeDasharray: '',
                stroke: colors.border,
                strokeWidth: 1,
              },
              fillShadowGradient: '#007AFF',
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
        </View>

        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>Day of Week</Text>
          <BarChart
            data={dayOfWeekChartData}
            width={width - 48}
            height={220}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={{
              ...baseChartConfig,
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

        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>Hour of Day</Text>
          <LineChart
            data={hourOfDayChartData}
            width={width - 48}
            height={220}
            chartConfig={{
              ...baseChartConfig,
              propsForDots: {
                r: '4',
              },
              propsForBackgroundLines: {
                strokeDasharray: '',
                stroke: colors.border,
                strokeWidth: 1,
              },
              fillShadowGradient: '#007AFF',
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
  header: {
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  headerIcon: {
    marginTop: 1,
  },
  headerContent: {
    alignItems: 'center',
    gap: 16,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.iconButtonBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeFrameContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  timeFrameButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.iconButtonBackground,
  },
  selectedTimeFrame: {
    backgroundColor: '#007AFF',
  },
  timeFrameText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  selectedTimeFrameText: {
    color: '#fff',
  },
  taskFilterContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  taskFilterButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 16,
  },
  statCard: {
    width: '47%',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '600',
  },
  chartContainer: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    margin: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  cumulativeToggle: {
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
  cumulativeToggleActive: {
    backgroundColor: '#007AFF',
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
}); 