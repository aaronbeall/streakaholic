import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTaskContext } from '../context/TaskContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { DashboardReportsView } from './DashboardReportsView';
import { DashboardStatsView } from './DashboardStatsView';

type DashboardTab = 'stats' | 'reports';
const ACCENT = '#007AFF';

const DashboardHeader: React.FC<{
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  selectedTasks: string[];
  onTaskToggle: (taskId: string) => void;
}> = ({ activeTab, onTabChange, selectedTasks, onTaskToggle }) => {
  const { tasks } = useTaskContext();
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const visibleTasks = useMemo(() => tasks.filter(task => !task.archived), [tasks]);

  return (
    <View>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.push('/')}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Dashboard</Text>
          <View style={styles.headerButton} />
        </View>

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
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'stats' && styles.activeTab]}
          onPress={() => onTabChange('stats')}
        >
          <MaterialCommunityIcons
            name="chart-box-outline"
            size={20}
            color={activeTab === 'stats' ? ACCENT : colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'stats' && { color: ACCENT }]}>
            Stats
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'reports' && styles.activeTab]}
          onPress={() => onTabChange('reports')}
        >
          <MaterialCommunityIcons
            name="file-chart-outline"
            size={20}
            color={activeTab === 'reports' ? ACCENT : colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'reports' && { color: ACCENT }]}>
            Reports
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// Mirrors TaskDetailScreen's shape: the header (back button, task filter, Stats/Reports tabs)
// renders once; only the content below swaps on local `activeTab` state, cross-faded rather
// than navigated, so flipping tabs doesn't re-transition the header.
export const DashboardScreen: React.FC = () => {
  const { tasks: allTasks } = useTaskContext();
  const tasks = useMemo(() => allTasks.filter(task => !task.archived), [allTasks]);
  const [activeTab, setActiveTab] = useState<DashboardTab>('stats');
  const [selectedTasks, setSelectedTasks] = useState<string[]>(tasks.map(t => t.id));
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // The task filter lives here (not inside DashboardStatsView) so it can filter everything on
  // the view, regardless of which tab is active.
  const filteredTasks = useMemo(() => tasks.filter(task => selectedTasks.includes(task.id)), [tasks, selectedTasks]);

  return (
    <View style={styles.container}>
      <DashboardHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        selectedTasks={selectedTasks}
        onTaskToggle={(taskId) => {
          setSelectedTasks(prev =>
            prev.includes(taskId)
              ? prev.filter(id => id !== taskId)
              : [...prev, taskId]
          );
        }}
      />
      <Reanimated.View key={activeTab} entering={FadeIn.duration(150)} style={styles.body}>
        {activeTab === 'stats' ? <DashboardStatsView tasks={filteredTasks} /> : <DashboardReportsView />}
      </Reanimated.View>
    </View>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
  },
  header: {
    paddingBottom: 12,
    backgroundColor: colors.surface,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.iconButtonBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
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
