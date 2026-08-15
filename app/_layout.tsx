import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AchievementCelebration } from './components/AchievementCelebration';
import { ToastBanner } from './components/ToastBanner';
import { ToastProvider } from './context/ToastContext';
import { useThemeColors } from './hooks/useThemeColors';
import { useAchievementsStore } from './stores/achievementsStore';
import { useLastImportStore } from './stores/lastImportStore';
import { useSettingsStore } from './stores/settingsStore';
import { useTaskStore } from './stores/taskStore';
import { rescheduleAllTaskNotifications } from './utils/notifications';

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
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        // Keep routes mounted so their local state/scroll position survives navigation, but
        // suspend their React trees once another native-stack route covers them. Without this,
        // a task/settings/achievement mutation on the visible route can also reconcile Home,
        // Dashboard, or task detail underneath it. Scoped to this Stack instead of calling
        // react-native-screens' global enableFreeze(), so any future navigator can make its own
        // lifecycle choice explicitly. Native-only; web remains unaffected.
        freezeOnBlur: true,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
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
        name="debug-notifications"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="add-task"
        options={{
          title: 'Add New Habit',
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
  const hydrated = settingsHydrated && tasksHydrated && lastImportHydrated && achievementsHydrated;

  // Every task's `.stats` (including `streakStatus`) is a cached snapshot, only recomputed by
  // taskStore's own mutators (completeTask, etc.) at the moment something actually happens -- with
  // no mutation since yesterday, that cache can go stale purely from the calendar day rolling
  // over (a long streak's status still reading yesterday's comfortable 'up_to_date' instead of
  // today's genuinely 'expiring', confirmed as a real on-device bug report rather than a logic
  // error in the streak math itself). Checked here on two triggers, once hydration completes:
  // once immediately (covers a cold launch on a fresh day after the app was closed overnight) and
  // again every time the app returns to the foreground (covers backgrounding overnight without a
  // full relaunch, the more common real-world case on a phone). `maybeRefreshStats` itself no-ops
  // unless the calendar day has actually changed since its own last check, so most of these calls
  // -- especially repeated foregrounding within the same day -- do no work at all. Deliberately not
  // a running timer while the app stays open and active -- crossing midnight during one continuous
  // foreground session without ever backgrounding is a rare edge case, not worth the added
  // complexity here.
  useEffect(() => {
    if (!hydrated) return;
    useTaskStore.getState().maybeRefreshStats();
    // Same trigger as maybeRefreshStats (hydrate + every foreground) -- the self-healing diff pass
    // reads scheduled/presented reminders once, repairs only changed/missing/orphaned intent, and
    // refreshes its process-local snapshot. It therefore still recovers a reminder that fired or
    // disappeared while the app was closed and handles day/permission/timezone changes, without
    // blanket cancellation when the native schedule already matches.
    rescheduleAllTaskNotifications(useTaskStore.getState().tasks).catch(error => console.warn('Failed to reschedule task notifications', error));
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        useTaskStore.getState().maybeRefreshStats();
        rescheduleAllTaskNotifications(useTaskStore.getState().tasks).catch(error => console.warn('Failed to reschedule task notifications', error));
      }
    });

    // Tapping a delivered reminder just opens the app to Home -- per explicit user direction, not
    // a deep link to the specific task's own detail screen (an earlier version did that).
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(() => {
      router.push('/');
    });

    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  }, [hydrated]);

  if (!hydrated) {
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
