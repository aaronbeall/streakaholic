import { Stack } from 'expo-router';
import { TaskProvider } from './context/TaskContext';
import { useThemeColors } from './hooks/useThemeColors';

export default function Layout() {
  const colors = useThemeColors();

  return (
    <TaskProvider>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="dashboard"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="archived-tasks"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="add-task"
          options={{
            title: 'Add New Task',
            presentation: 'modal',
            headerStyle: {
              backgroundColor: colors.surface,
            },
            headerTitleStyle: {
              color: colors.text,
            },
            headerTintColor: colors.text,
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="task-details"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="task-calendar"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="task-stats"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
      </Stack>
    </TaskProvider>
  );
}
