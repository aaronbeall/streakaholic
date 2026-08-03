import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Reanimated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { TaskCard } from '../components/TaskCard';
import { useTaskContext } from '../context/TaskContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { Task } from '../types';
import { getStreakStats } from '../utils/data';

const GRID_SPACING = 16;
const SIDE_PADDING = 16;
const FAB_SIZE = 56;
const FAB_OFFSET = 24;

type FilterType = 'up_to_date' | 'expiring' | null;

const HomeHeader = React.memo(({ activeFilter, onFilterChange }: { activeFilter: FilterType; onFilterChange: (filter: FilterType) => void }) => {
  const router = useRouter();
  const { tasks } = useTaskContext();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const streakStats = useMemo(() => getStreakStats(tasks.filter(task => !task.archived)), [tasks]);

  const handleFilterPress = (filter: FilterType) => {
    onFilterChange(activeFilter === filter ? null : filter);
  };

  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => router.push({ pathname: '/dashboard' })}
      >
        <MaterialCommunityIcons name="chart-bar" size={24} color={colors.text} />
      </TouchableOpacity>

      <View style={styles.streakBubbles}>
        {streakStats.upToDate > 0 && (
          <TouchableOpacity 
            style={[
              styles.streakBubble, 
              { backgroundColor: 'rgba(255, 59, 48, 0.1)' },
              activeFilter === 'up_to_date' && { backgroundColor: '#FF3B30' }
            ]}
            onPress={() => handleFilterPress('up_to_date')}
          >
            <MaterialCommunityIcons 
              name="fire" 
              size={16} 
              color={activeFilter === 'up_to_date' ? '#fff' : '#FF3B30'} 
            />
            <Text style={[
              styles.streakBubbleText, 
              { color: activeFilter === 'up_to_date' ? '#fff' : '#FF3B30' }
            ]}>
              {streakStats.upToDate}
            </Text>
          </TouchableOpacity>
        )}
        {streakStats.expiring > 0 && (
          <TouchableOpacity 
            style={[
              styles.streakBubble, 
              { backgroundColor: 'rgba(255, 167, 38, 0.1)' },
              activeFilter === 'expiring' && { backgroundColor: '#FFA726' }
            ]}
            onPress={() => handleFilterPress('expiring')}
          >
            <MaterialCommunityIcons 
              name="clock-outline" 
              size={16} 
              color={activeFilter === 'expiring' ? '#fff' : '#FFA726'} 
            />
            <Text style={[
              styles.streakBubbleText, 
              { color: activeFilter === 'expiring' ? '#fff' : '#FFA726' }
            ]}>
              {streakStats.expiring}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => router.push('/settings')}
      >
        <MaterialCommunityIcons name="cog" size={24} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
});

HomeHeader.displayName = "HomeHeader";

export const HomeScreen: React.FC = () => {
  const router = useRouter();
  const { tasks, completeTask, isTaskCompleted } = useTaskContext();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<FilterType>(null);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const filteredTasks = useMemo(() => tasks.filter(task => {
    if (task.archived) return false;
    if (!filter) return true;
    if (filter === 'up_to_date') {
      return task.stats?.streakStatus === 'up_to_date' && task.stats.currentStreak > 0;
    }
    if (filter === 'expiring') {
      return task.stats?.streakStatus === 'expiring' && task.stats.currentStreak > 0;
    }
    return true;
  }), [tasks, filter]);

  const hasAnyTasks = useMemo(() => tasks.some(task => !task.archived), [tasks]);

  const getColumnCount = () => {
    if (width >= 1200) return 4;
    if (width >= 900) return 3;
    return 2;
  };

  const columnCount = getColumnCount();
  const availableWidth = width - (SIDE_PADDING * 2) - (GRID_SPACING * (columnCount - 1));
  const cardSize = Math.floor(availableWidth / columnCount);

  const handleTaskLongPress = (task: Task) => {
    if (isTaskCompleted(task)) {
      router.push({ pathname: '/task-details', params: { taskId: task.id } });
    } else {
      completeTask(task.id);
    }
  };

  return (
    <View style={styles.container}>
      <HomeHeader activeFilter={filter} onFilterChange={setFilter} />
      <FlatList
        key={columnCount}
        data={filteredTasks}
        keyExtractor={(item) => item.id}
        numColumns={columnCount}
        columnWrapperStyle={styles.row}
        getItemLayout={(data, index) => ({
          length: cardSize,
          offset: cardSize * Math.floor(index / columnCount),
          index,
        })}
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            size={cardSize}
            onLongPressCalendar={() => router.push({
              pathname: '/task-calendar',
              params: { taskId: item.id }
            })}
            onLongPressStats={() => router.push({
              pathname: '/task-stats',
              params: { taskId: item.id }
            })}
            onLongPressTask={() => handleTaskLongPress(item)}
          />
        )}
        contentContainerStyle={[styles.listContent, filteredTasks.length === 0 && styles.emptyListContent]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Reanimated.View
              entering={FadeIn.duration(400)}
              style={[
                styles.emptyIconBadge,
                { backgroundColor: hasAnyTasks ? colors.surfaceSecondary : 'rgba(255, 107, 107, 0.12)' },
              ]}
            >
              <MaterialCommunityIcons
                name={hasAnyTasks ? 'filter-off-outline' : 'fire'}
                size={40}
                color={hasAnyTasks ? colors.textTertiary : '#FF6B6B'}
              />
            </Reanimated.View>
            <Reanimated.View entering={FadeInDown.duration(400).delay(100)} style={styles.emptyStateTextGroup}>
              <Text style={styles.emptyStateTitle}>
                {hasAnyTasks ? 'No tasks match this filter' : 'Start your first streak'}
              </Text>
              <Text style={styles.emptyStateSubtitle}>
                {hasAnyTasks
                  ? 'Try a different filter, or clear it to see everything.'
                  : 'Track a daily habit and watch your streak grow.'}
              </Text>
              {hasAnyTasks ? (
                <TouchableOpacity style={styles.emptyStateButtonSecondary} onPress={() => setFilter(null)}>
                  <Text style={styles.emptyStateButtonSecondaryText}>Clear Filter</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.emptyStateButton} onPress={() => router.push('/add-task')}>
                  <MaterialCommunityIcons name="plus" size={18} color="#fff" />
                  <Text style={styles.emptyStateButtonText}>Add a Habit</Text>
                </TouchableOpacity>
              )}
            </Reanimated.View>
          </View>
        }
      />
      <TouchableOpacity style={styles.addButton} onPress={() => router.push('/add-task')}>
        <MaterialCommunityIcons name="plus" size={32} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.iconButtonBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakBubbles: {
    flexDirection: 'row',
    gap: 8,
  },
  streakBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  streakBubbleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: SIDE_PADDING,
    paddingTop: SIDE_PADDING,
    paddingBottom: FAB_OFFSET + FAB_SIZE + GRID_SPACING,
    gap: GRID_SPACING,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyStateTextGroup: {
    alignItems: 'center',
    gap: 8,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 12,
  },
  emptyStateButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyStateButtonSecondary: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 12,
  },
  emptyStateButtonSecondaryText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  row: {
    justifyContent: 'space-between',
    gap: GRID_SPACING,
  },
  addButton: {
    position: 'absolute',
    right: FAB_OFFSET,
    bottom: FAB_OFFSET,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    padding: 8,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
}); 