import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { create } from 'zustand';
import { PersistStorage, persist } from 'zustand/middleware';
import type { TaskDetailTab } from '../components/TaskHeader';
import type { DashboardTab } from '../screens/DashboardScreen';
import type { OnboardingHintId, OnboardingHintsSeen } from '../utils/onboardingHints';
import {
  DEFAULT_REVIEW_PROMPT_STATE,
  recordReviewCompletion,
  ReviewPromptState,
  shouldRequestReview,
} from '../utils/reviewPrompt';

export type ThemeMode = 'system' | 'light' | 'dark';

// Each contextual hint is dismissed independently -- seeing/dismissing one doesn't affect the
// others. The first three are Home's first-task-card hints; which of them (if any) is shown right
// now is derived from that card's live state (completion + visible face), not stored here. The
// the others are stationary action targets on Home, Dashboard, or task detail. The root hint
// coordinator decides which eligible unseen target wins, so screens never coordinate with one
// another or read these flags directly.
const DEFAULT_ONBOARDING_HINTS_SEEN: OnboardingHintsSeen = {
  'hold-to-complete': false,
  'multi-completion-progress': false,
  'tap-to-cycle': false,
  'hold-to-expand': false,
  'home-expiring-filter': false,
  'home-reorder': false,
  'home-dashboard': false,
  'dashboard-task-filter': false,
  'dashboard-calendar-chart-modes': false,
  'task-calendar-tap-day': false,
};

export interface AppSettings {
  themeMode: ThemeMode;
  showCardBackground: boolean;
  showTaskName: boolean;
  showTaskCounter: boolean;
  // Gates only whether AchievementCelebration shows its screen -- achievements are still recorded (and
  // still show up in the Trophy Case) regardless of this setting, see achievementsStore.ts.
  achievementCelebrationsEnabled: boolean;
  onboardingHintsSeen: OnboardingHintsSeen;
  // Restored as the default tab the next time each screen opens without an explicit deep-linked
  // tab (task-detail's own `tab` search param) -- only updated by actually switching tabs within
  // the screen, never by an incoming deep link, so a one-off "open on Stats" link doesn't
  // permanently change the remembered preference.
  dashboardLastTab: DashboardTab;
  taskDetailLastTab: TaskDetailTab;
  reviewPrompt: ReviewPromptState;
}

const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'system',
  showCardBackground: true,
  showTaskName: true,
  showTaskCounter: true,
  achievementCelebrationsEnabled: true,
  onboardingHintsSeen: DEFAULT_ONBOARDING_HINTS_SEEN,
  dashboardLastTab: 'stats',
  taskDetailLastTab: 'calendar',
  reviewPrompt: DEFAULT_REVIEW_PROMPT_STATE,
};

interface SettingsStore extends AppSettings {
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setShowCardBackground: (value: boolean) => void;
  setShowTaskName: (value: boolean) => void;
  setShowTaskCounter: (value: boolean) => void;
  setAchievementCelebrationsEnabled: (value: boolean) => void;
  setOnboardingHintSeen: (key: OnboardingHintId, seen: boolean) => void;
  // `preserve` lets a caller keep specific hints marked seen instead of clearing everything --
  // e.g. Settings' "Replay Onboarding Hints" keeps 'hold-to-complete' seen when a task's already
  // been completed today, since replaying that hint wouldn't make sense then.
  resetOnboardingHints: (preserve?: Partial<OnboardingHintsSeen>) => void;
  setDashboardLastTab: (tab: DashboardTab) => void;
  setTaskDetailLastTab: (tab: TaskDetailTab) => void;
  // Only current-day, user-initiated completions call this. Imports, retroactive edits, undo, and
  // restore operations don't manufacture engagement toward a review prompt.
  recordReviewCompletion: (date: string) => void;
  // Transient coordination flag: eligibility is persisted, but an unfinished request should not
  // survive a process restart and surprise someone immediately on launch.
  reviewRequestPending: boolean;
  markReviewRequested: (version: string) => void;
  clearPendingReviewRequest: () => void;
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
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      hasHydrated: false,
      reviewRequestPending: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setShowCardBackground: (showCardBackground) => set({ showCardBackground }),
      setShowTaskName: (showTaskName) => set({ showTaskName }),
      setShowTaskCounter: (showTaskCounter) => set({ showTaskCounter }),
      setAchievementCelebrationsEnabled: (achievementCelebrationsEnabled) => set({ achievementCelebrationsEnabled }),
      setOnboardingHintSeen: (key, seen) => set(state => ({
        onboardingHintsSeen: { ...state.onboardingHintsSeen, [key]: seen },
      })),
      resetOnboardingHints: (preserve) => set({
        onboardingHintsSeen: { ...DEFAULT_ONBOARDING_HINTS_SEEN, ...preserve },
      }),
      setDashboardLastTab: (dashboardLastTab) => set({ dashboardLastTab }),
      setTaskDetailLastTab: (taskDetailLastTab) => set({ taskDetailLastTab }),
      recordReviewCompletion: (date) => {
        const state = get();
        const reviewPrompt = recordReviewCompletion(state.reviewPrompt, date);
        const appVersion = Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? 'unknown';
        const reviewRequestPending = state.reviewRequestPending
          || shouldRequestReview(reviewPrompt, appVersion);

        if (reviewPrompt === state.reviewPrompt && reviewRequestPending === state.reviewRequestPending) return;
        set({ reviewPrompt, reviewRequestPending });
      },
      markReviewRequested: (version) => set(state => ({
        reviewPrompt: {
          ...state.reviewPrompt,
          lastRequestAt: new Date().toISOString(),
          lastRequestVersion: version,
        },
        reviewRequestPending: false,
      })),
      clearPendingReviewRequest: () => set({ reviewRequestPending: false }),
    }),
    {
      name: 'appSettings',
      storage: settingsStorage,
      partialize: (state) => ({
        themeMode: state.themeMode,
        showCardBackground: state.showCardBackground,
        showTaskName: state.showTaskName,
        showTaskCounter: state.showTaskCounter,
        achievementCelebrationsEnabled: state.achievementCelebrationsEnabled,
        onboardingHintsSeen: state.onboardingHintsSeen,
        dashboardLastTab: state.dashboardLastTab,
        taskDetailLastTab: state.taskDetailLastTab,
        reviewPrompt: state.reviewPrompt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
