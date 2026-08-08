import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { PersistStorage, persist } from 'zustand/middleware';
import type { TaskDetailTab } from '../components/TaskHeader';
import type { DashboardTab } from '../screens/DashboardScreen';

export type ThemeMode = 'system' | 'light' | 'dark';

// Each contextual hint is dismissed independently -- seeing/dismissing one doesn't affect the
// others. The first three are Home's first-task-card hints; which of them (if any) is shown right
// now is derived from that card's live state (completion + visible face), not stored here. The
// other two are single, stationary-target hints (Dashboard's task-filter row, task-detail's
// Calendar tap-a-day grid) with no such live-state branching -- each is just shown once until
// dismissed or until the user performs the gesture it teaches.
export type OnboardingHintKey =
  | 'hold-to-complete'
  | 'tap-to-cycle'
  | 'hold-to-expand'
  | 'dashboard-task-filter'
  | 'task-calendar-tap-day';

export type OnboardingHintsSeen = Record<OnboardingHintKey, boolean>;

const DEFAULT_ONBOARDING_HINTS_SEEN: OnboardingHintsSeen = {
  'hold-to-complete': false,
  'tap-to-cycle': false,
  'hold-to-expand': false,
  'dashboard-task-filter': false,
  'task-calendar-tap-day': false,
};

export interface AppSettings {
  themeMode: ThemeMode;
  showCardBackground: boolean;
  showTaskName: boolean;
  showTaskCounter: boolean;
  onboardingHintsSeen: OnboardingHintsSeen;
  // Restored as the default tab the next time each screen opens without an explicit deep-linked
  // tab (task-detail's own `tab` search param) -- only updated by actually switching tabs within
  // the screen, never by an incoming deep link, so a one-off "open on Stats" link doesn't
  // permanently change the remembered preference.
  dashboardLastTab: DashboardTab;
  taskDetailLastTab: TaskDetailTab;
}

const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'system',
  showCardBackground: true,
  showTaskName: true,
  showTaskCounter: true,
  onboardingHintsSeen: DEFAULT_ONBOARDING_HINTS_SEEN,
  dashboardLastTab: 'stats',
  taskDetailLastTab: 'calendar',
};

interface SettingsStore extends AppSettings {
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setShowCardBackground: (value: boolean) => void;
  setShowTaskName: (value: boolean) => void;
  setShowTaskCounter: (value: boolean) => void;
  setOnboardingHintSeen: (key: OnboardingHintKey, seen: boolean) => void;
  // `preserve` lets a caller keep specific hints marked seen instead of clearing everything --
  // e.g. Settings' "Replay Onboarding Hints" keeps 'hold-to-complete' seen when a task's already
  // been completed today, since replaying that hint wouldn't make sense then.
  resetOnboardingHints: (preserve?: Partial<OnboardingHintsSeen>) => void;
  setDashboardLastTab: (tab: DashboardTab) => void;
  setTaskDetailLastTab: (tab: TaskDetailTab) => void;
}

type PersistedSettingsState = AppSettings;

// Legacy raw value under 'appSettings' is a bare AppSettings object (from the old
// SettingsContext's `JSON.stringify(settings)`), not zustand persist's `{ state, version }`
// envelope. Already matches this store's persisted shape field-for-field (no extra nesting
// needed, unlike taskStore/lastImportStore) -- migration is just wrapping it in the envelope,
// merged over defaults in case an older version predates a field (mirrors the old Context's own
// `{ ...DEFAULT_SETTINGS, ...JSON.parse(stored) }` load-time merge).
const settingsStorage: PersistStorage<PersistedSettingsState> = {
  getItem: async (name) => {
    const raw = await AsyncStorage.getItem(name);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !('state' in parsed)) {
      return { state: { ...DEFAULT_SETTINGS, ...parsed }, version: 0 };
    }
    return parsed;
  },
  setItem: async (name, value) => {
    await AsyncStorage.setItem(name, JSON.stringify(value));
  },
  removeItem: async (name) => {
    await AsyncStorage.removeItem(name);
  },
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setShowCardBackground: (showCardBackground) => set({ showCardBackground }),
      setShowTaskName: (showTaskName) => set({ showTaskName }),
      setShowTaskCounter: (showTaskCounter) => set({ showTaskCounter }),
      setOnboardingHintSeen: (key, seen) => set(state => ({
        onboardingHintsSeen: { ...state.onboardingHintsSeen, [key]: seen },
      })),
      resetOnboardingHints: (preserve) => set({
        onboardingHintsSeen: { ...DEFAULT_ONBOARDING_HINTS_SEEN, ...preserve },
      }),
      setDashboardLastTab: (dashboardLastTab) => set({ dashboardLastTab }),
      setTaskDetailLastTab: (taskDetailLastTab) => set({ taskDetailLastTab }),
    }),
    {
      name: 'appSettings',
      storage: settingsStorage,
      partialize: (state) => ({
        themeMode: state.themeMode,
        showCardBackground: state.showCardBackground,
        showTaskName: state.showTaskName,
        showTaskCounter: state.showTaskCounter,
        onboardingHintsSeen: state.onboardingHintsSeen,
        dashboardLastTab: state.dashboardLastTab,
        taskDetailLastTab: state.taskDetailLastTab,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
