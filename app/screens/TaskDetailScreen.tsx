import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { TaskDetailTab, TaskHeader } from '../components/TaskHeader';
import { useTaskContext } from '../context/TaskContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { TaskCalendarView } from './TaskCalendarScreen';
import { TaskStatsView } from './TaskStatsScreen';

// The single modal screen for a task's Calendar/Stats detail view. TaskHeader (banner + tabs)
// renders once here; only the content below it swaps when the tab changes, via local state
// rather than navigation -- opening this screen from Home is still one full modal transition,
// but flipping between Calendar and Stats no longer re-triggers that same transition just to
// switch tabs, since it's not actually leaving the screen.
export default function TaskDetailScreen() {
  const { taskId, tab } = useLocalSearchParams<{ taskId: string; tab?: string }>();
  const { tasks } = useTaskContext();
  const [activeTab, setActiveTab] = useState<TaskDetailTab>(tab === 'stats' ? 'stats' : 'calendar');
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const task = tasks.find(t => t.id === taskId);
  if (!task) {
    throw new Error('Missing task');
  }

  return (
    <View style={styles.container}>
      <TaskHeader task={task} activeTab={activeTab} onTabChange={setActiveTab} />
      <Reanimated.View key={activeTab} entering={FadeIn.duration(150)} style={styles.body}>
        {activeTab === 'calendar' ? <TaskCalendarView task={task} /> : <TaskStatsView task={task} />}
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
