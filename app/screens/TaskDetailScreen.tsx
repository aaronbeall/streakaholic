import { parseISO } from 'date-fns';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { TaskDetailTab, TaskHeader } from '../components/TaskHeader';
import { useTaskContext } from '../context/TaskContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
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
  const { tasks } = useTaskContext();
  const [activeTab, setActiveTab] = useState<TaskDetailTab>(
    tab === 'stats' ? 'stats' : tab === 'streaks' ? 'streaks' : 'calendar'
  );
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const task = tasks.find(t => t.id === taskId);
  if (!task) {
    throw new Error('Missing task');
  }

  // Lets a caller (e.g. DashboardCalendarView's tap-through) land the calendar tab already on a
  // specific month, e.g. "?taskId=X&tab=calendar&month=2026-07-01", instead of always today's.
  const initialMonth = month ? parseISO(month) : undefined;

  return (
    <View style={styles.container}>
      <TaskHeader task={task} activeTab={activeTab} onTabChange={setActiveTab} />
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
