import { Stack } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AchievementCelebration } from './components/AchievementCelebration';
import { ToastBanner } from './components/ToastBanner';
import { ToastProvider } from './context/ToastContext';
import { useThemeColors } from './hooks/useThemeColors';
import { useAchievementsStore } from './stores/achievementsStore';
import { useLastImportStore } from './stores/lastImportStore';
import { useSettingsStore } from './stores/settingsStore';
import { useTaskStore } from './stores/taskStore';

function RootStack() {
  const colors = useThemeColors();

  // contentStyle below only themes react-native-screens' own JS-rendered screen surface -- it
  // doesn't reach the native root/window background underneath, which Android still shows
  // through (white by default) during a screen transition, especially with edgeToEdgeEnabled
  // (there's no opaque system-bar chrome covering the edges to hide it). This is what was still
  // flashing white on back navigation after the contentStyle fix.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  return (
    // `slide_from_right` gives push/pop a direction-aware slide for free -- native-stack
    // plays it forward on push and automatically reverses it on pop (back), on native and
    // (via react-native-screens' web CSS-animation support) on web too.
    //
    // `contentStyle` backgroundColor is required here too: react-native-screens' native Screen
    // surface defaults to white regardless of app theme, so without this, sliding to reveal the
    // screen underneath during a pop -- or the brief moment before a pushed screen's own content
    // has painted -- shows a flash of white through the gap in dark mode. Themed per render since
    // `colors` already reacts to the current theme.
    <Stack screenOptions={{ animation: 'slide_from_right', contentStyle: { backgroundColor: colors.background } }}>
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
        name="about"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="trophies"
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

// Settings, tasks, lastImport, and achievements are all Zustand `persist` stores backed by
// AsyncStorage -- without this gate, the first frame renders with each store's default in-memory
// state (wrong theme override, an empty task list flashing the "no tasks yet" empty state) before
// `persist` finishes reading them back. `hasHydrated` is a plain field on each store, flipped by
// that store's own `onRehydrateStorage` callback once its async read resolves -- the direct
// Zustand-native equivalent of the old Context setup's hand-rolled `isLoaded` state. No
// `<Provider>` wrapping needed for any of them; they're just imported hook modules.
//
// achievementsStore specifically needs this too, not just the original three -- a completion
// firing (and calling recordCompletionAchievements) before its own AsyncStorage read resolves
// would append to an in-memory empty array that the real persisted data then silently overwrites
// moments later, losing the just-earned trophy.
function AppGate() {
  const settingsHydrated = useSettingsStore(state => state.hasHydrated);
  const tasksHydrated = useTaskStore(state => state.hasHydrated);
  const lastImportHydrated = useLastImportStore(state => state.hasHydrated);
  const achievementsHydrated = useAchievementsStore(state => state.hasHydrated);

  if (!settingsHydrated || !tasksHydrated || !lastImportHydrated || !achievementsHydrated) {
    return <LoadingScreen />;
  }

  return <RootStack />;
}

export default function Layout() {
  return (
    // Required by react-native-gesture-handler (ToastBanner's swipe-to-dismiss uses
    // Gesture.Pan()/GestureDetector) -- without this ancestor, GestureDetector throws at
    // runtime on native. Expo Router's own Stack doesn't provide it, so it's added here at
    // the true root.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ToastProvider>
        <AppGate />
        <ToastBanner />
        <AchievementCelebration />
      </ToastProvider>
    </GestureHandlerRootView>
  );
}
