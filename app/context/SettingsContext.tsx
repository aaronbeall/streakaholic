import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { TaskDetailTab } from '../components/TaskHeader';
import { DashboardTab } from '../screens/DashboardScreen';

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

const STORAGE_KEY = 'appSettings';

interface SettingsContextType extends AppSettings {
  isLoaded: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setShowCardBackground: (value: boolean) => void;
  setShowTaskName: (value: boolean) => void;
  setShowTaskCounter: (value: boolean) => void;
  setOnboardingHintSeen: (key: OnboardingHintKey, seen: boolean) => void;
  resetOnboardingHints: (preserve?: Partial<OnboardingHintsSeen>) => void;
  setDashboardLastTab: (tab: DashboardTab) => void;
  setTaskDetailLastTab: (tab: TaskDetailTab) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const updateSettings = (patch: Partial<AppSettings> | ((prev: AppSettings) => Partial<AppSettings>)) => {
    setSettings(prev => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(error => {
        console.error('Error saving settings:', error);
      });
      return next;
    });
  };

  return (
    <SettingsContext.Provider
      value={{
        ...settings,
        isLoaded,
        setThemeMode: (themeMode) => updateSettings({ themeMode }),
        setShowCardBackground: (showCardBackground) => updateSettings({ showCardBackground }),
        setShowTaskName: (showTaskName) => updateSettings({ showTaskName }),
        setShowTaskCounter: (showTaskCounter) => updateSettings({ showTaskCounter }),
        setOnboardingHintSeen: (key, seen) => updateSettings(prev => ({
          onboardingHintsSeen: { ...prev.onboardingHintsSeen, [key]: seen },
        })),
        // `preserve` lets a caller keep specific hints marked seen instead of clearing everything
        // -- e.g. Settings' "Replay Onboarding Hints" keeps 'hold-to-complete' seen when a task's
        // already been completed today, since replaying that hint wouldn't make sense then.
        resetOnboardingHints: (preserve) => updateSettings({
          onboardingHintsSeen: { ...DEFAULT_ONBOARDING_HINTS_SEEN, ...preserve },
        }),
        setDashboardLastTab: (dashboardLastTab) => updateSettings({ dashboardLastTab }),
        setTaskDetailLastTab: (taskDetailLastTab) => updateSettings({ taskDetailLastTab }),
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};
