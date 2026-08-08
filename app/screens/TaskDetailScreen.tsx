import { parseISO } from 'date-fns';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { TaskDetailTab, TaskHeader } from '../components/TaskHeader';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { useSettingsStore } from '../stores/settingsStore';
import { useTaskStore } from '../stores/taskStore';
import { DashboardStreaksView } from './DashboardStreaksView';
import { TaskCalendarView } from './TaskCalendarScreen';
import { TaskStatsView } from './TaskStatsScreen';

// The single modal screen for a task's Calendar/Stats/Streaks detail view. TaskHeader (banner +
// tabs) renders once here; only the content below it swaps when the tab changes, via local state
// rather than navigation -- opening this screen from Home is still one full modal transition,
// but flipping between tabs no longer re-triggers that same transition just to switch tabs, since
// it's not actually leaving the screen.
export default function TaskDetailScreen() {
  const { taskId, tab, month } = useLocalSearchParams<{ taskId: string; tab?: string; month?: string }>();
  const tasks = useTaskStore(state => state.tasks);
  const taskDetailLastTab = useSettingsStore(state => state.taskDetailLastTab);
  const setTaskDetailLastTab = useSettingsStore(state => state.setTaskDetailLastTab);
  // An explicit `tab` param (e.g. Home's long-press-calendar-face action) always wins; absent
  // that, restore whichever tab was last viewed rather than always defaulting to Calendar.
  const linkedTab: TaskDetailTab | undefined =
    tab === 'stats' || tab === 'calendar' || tab === 'streaks' ? tab : undefined;
  const [activeTab, setActiveTab] = useState<TaskDetailTab>(linkedTab ?? taskDetailLastTab);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const task = tasks.find(t => t.id === taskId);
  if (!task) {
    throw new Error('Missing task');
  }

  // Lets a caller (e.g. DashboardCalendarView's tap-through) land the calendar tab already on a
  // specific month, e.g. "?taskId=X&tab=calendar&month=2026-07-01", instead of always today's.
  const initialMonth = month ? parseISO(month) : undefined;

  const handleTabChange = (nextTab: TaskDetailTab) => {
    setActiveTab(nextTab);
    setTaskDetailLastTab(nextTab);
  };

  return (
    <View style={styles.container}>
      <TaskHeader task={task} activeTab={activeTab} onTabChange={handleTabChange} />
      <Reanimated.View key={activeTab} entering={FadeIn.duration(150)} style={styles.body}>
        {activeTab === 'calendar' ? (
          <TaskCalendarView task={task} initialMonth={initialMonth} />
        ) : activeTab === 'stats' ? (
          <TaskStatsView task={task} />
        ) : (
          // Exactly the Dashboard's Streaks tab, just scoped to this one task -- it's already
          // generic over a task list, so a single-element array is all that's needed here.
          <DashboardStreaksView tasks={[task]} />
        )}
      </Reanimated.View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
  },
});
