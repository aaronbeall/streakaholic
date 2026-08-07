import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { ToastBanner } from './components/ToastBanner';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import { TaskProvider, useTaskContext } from './context/TaskContext';
import { ToastProvider } from './context/ToastContext';
import { useThemeColors } from './hooks/useThemeColors';

function RootStack() {
  const colors = useThemeColors();

  return (
    // `slide_from_right` gives push/pop a direction-aware slide for free -- native-stack
    // plays it forward on push and automatically reverses it on pop (back), on native and
    // (via react-native-screens' web CSS-animation support) on web too.
    <Stack screenOptions={{ animation: 'slide_from_right' }}>
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
          animation: 'slide_from_bottom',
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
        name="task-detail"
        options={{
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
    </Stack>
  );
}

function LoadingScreen() {
  const colors = useThemeColors();

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color="#007AFF" />
    </View>
  );
}

// Settings and tasks both load asynchronously from AsyncStorage -- without this gate, the
// first frame renders with default settings (wrong theme override) and an empty task list
// (a flash of the "no tasks yet" empty state) before either resolves.
function AppGate() {
  const { isLoaded: settingsLoaded } = useSettings();
  const { isLoaded: tasksLoaded } = useTaskContext();

  if (!settingsLoaded || !tasksLoaded) {
    return <LoadingScreen />;
  }

  return <RootStack />;
}

export default function Layout() {
  return (
    <SettingsProvider>
      <TaskProvider>
        <ToastProvider>
          <AppGate />
          <ToastBanner />
        </ToastProvider>
      </TaskProvider>
    </SettingsProvider>
  );
}
