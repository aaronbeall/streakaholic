import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { Task } from '../types';

export type TaskDetailTab = 'calendar' | 'stats' | 'streaks';

interface TaskHeaderProps {
  task: Task;
  activeTab: TaskDetailTab;
  onTabChange: (tab: TaskDetailTab) => void;
}

// Calendar/Stats switch local state on the already-open detail screen (see TaskDetailScreen) --
// no navigation, so no full-screen re-transition just to flip a tab. Back and Edit are genuine
// navigations and still go through the router.
export const TaskHeader: React.FC<TaskHeaderProps> = ({ task, activeTab, onTabChange }) => {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isCalendarScreen = activeTab === 'calendar';
  const isStatsScreen = activeTab === 'stats';
  const isStreaksScreen = activeTab === 'streaks';

  return (
    <View>
      <View style={[styles.header, { backgroundColor: task.color, paddingTop: insets.top + 8 }]}>
        <TouchableOpacity 
          style={styles.headerButton}
          onPress={() => router.push('/')}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="rgba(255, 255, 255, 0.8)" />
        </TouchableOpacity>

        <View style={styles.centerContent}>
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
            <MaterialCommunityIcons name={task.icon} size={48} color="#fff" />
          </View>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{task.name}</Text>
            <View style={styles.streakContainer}>
              {task.stats?.streakStatus === 'up_to_date' && task.stats?.currentStreak > 0 ? (
                <>
                  <View style={[styles.streakBadge, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
                    <MaterialCommunityIcons name="fire" size={16} color="#fff" />
                    <Text style={styles.streakText}>{task.stats.currentStreak}</Text>
                  </View>
                  {task.stats.currentStreak === task.stats.bestStreak && (
                    <MaterialCommunityIcons name="trophy" size={20} color="#FFD700" style={styles.trophyIcon} />
                  )}
                </>
              ) : task.stats?.streakStatus === 'expiring' && task.stats?.currentStreak > 0 ? (
                <>
                  <View style={[styles.streakBadge, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
                    <MaterialCommunityIcons name="fire" size={16} color="#fff" />
                    <Text style={styles.streakText}>{task.stats.currentStreak}</Text>
                  </View>
                  <MaterialCommunityIcons name="clock-outline" size={20} color="rgba(255, 255, 255, 0.6)" style={styles.statusIcon} />
                  {task.stats.currentStreak === task.stats.bestStreak && (
                    <MaterialCommunityIcons name="trophy" size={20} color="#FFD700" style={styles.trophyIcon} />
                  )}
                </>
              ) : task.stats?.lastStreak && task.stats.lastStreak > 0 ? (
                <View style={[styles.streakBadge, { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
                  <MaterialCommunityIcons name="sleep" size={16} color="#fff" />
                  <Text style={styles.streakText}>{task.stats.lastStreak}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.push({
            pathname: '/add-task',
            params: { taskId: task.id }
          })}
        >
          <MaterialCommunityIcons name="pencil" size={24} color="rgba(255, 255, 255, 0.8)" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, isCalendarScreen && styles.activeTab]}
          onPress={() => onTabChange('calendar')}
        >
          <MaterialCommunityIcons 
            name="calendar" 
            size={20} 
            color={isCalendarScreen ? task.color : colors.textSecondary}
          />
          <Text style={[styles.tabText, isCalendarScreen && { color: task.color }]}>
            Calendar
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, isStatsScreen && styles.activeTab]}
          onPress={() => onTabChange('stats')}
        >
          <MaterialCommunityIcons 
            name="chart-bar" 
            size={20} 
            color={isStatsScreen ? task.color : colors.textSecondary} 
          />
          <Text style={[styles.tabText, isStatsScreen && { color: task.color }]}>
            Stats
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, isStreaksScreen && styles.activeTab]}
          onPress={() => onTabChange('streaks')}
        >
          <MaterialCommunityIcons
            name="fire"
            size={20}
            color={isStreaksScreen ? task.color : colors.textSecondary}
          />
          <Text style={[styles.tabText, isStreaksScreen && { color: task.color }]}>
            Streaks
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    paddingBottom: 24,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    gap: 16,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  streakText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  trophyIcon: {
    marginTop: 2,
  },
  statusIcon: {
    marginTop: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: colors.overlay,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
}); 