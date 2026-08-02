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
import { TaskCard } from '../components/TaskCard';
import { useTaskContext } from '../context/TaskContext';
import { Task } from '../types';
import { getStreakStats } from '../utils/data';

const GRID_SPACING = 16;
const SIDE_PADDING = 16;

type FilterType = 'up_to_date' | 'expiring' | null;

const HomeHeader = React.memo(({ onFilterChange }: { onFilterChange: (filter: FilterType) => void }) => {
  const router = useRouter();
  const { tasks } = useTaskContext();
  const [activeFilter, setActiveFilter] = useState<FilterType>(null);

  const streakStats = useMemo(() => getStreakStats(tasks.filter(task => !task.archived)), [tasks]);

  const handleFilterPress = (filter: FilterType) => {
    const newFilter = activeFilter === filter ? null : filter;
    setActiveFilter(newFilter);
    onFilterChange(newFilter);
  };

  return (
    <View style={styles.header}>
      <TouchableOpacity 
        style={styles.headerButton}
        onPress={() => router.push({ pathname: '/dashboard' })}
      >
        <MaterialCommunityIcons name="chart-bar" size={24} color="#333" />
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
        <MaterialCommunityIcons name="cog" size={24} color="#333" />
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
      <HomeHeader onFilterChange={setFilter} />
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
        contentContainerStyle={styles.listContent}
      />
      <TouchableOpacity style={styles.addButton} onPress={() => router.push('/add-task')}>
        <MaterialCommunityIcons name="plus" size={32} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
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
    padding: SIDE_PADDING,
    gap: GRID_SPACING,
  },
  row: {
    justifyContent: 'space-between',
    gap: GRID_SPACING,
  },
  addButton: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
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