import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { TaskDetailTab } from '../components/TaskHeader';
import { DashboardTab } from '../screens/DashboardScreen';

export type ThemeMode = 'system' | 'light' | 'dark';

// Each of the three contextual hints on Home's first task card is dismissed independently --
// seeing/dismissing one doesn't affect the others. Which hint (if any) is shown right now is
// derived from that card's live state (completion + visible face), not stored here.
export type OnboardingHintKey = 'hold-to-complete' | 'tap-to-cycle' | 'hold-to-expand';

export type OnboardingHintsSeen = Record<OnboardingHintKey, boolean>;

const DEFAULT_ONBOARDING_HINTS_SEEN: OnboardingHintsSeen = {
  'hold-to-complete': false,
  'tap-to-cycle': false,
  'hold-to-expand': false,
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
  resetOnboardingHints: () => void;
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
        resetOnboardingHints: () => updateSettings({ onboardingHintsSeen: DEFAULT_ONBOARDING_HINTS_SEEN }),
        setDashboardLastTab: (dashboardLastTab) => updateSettings({ dashboardLastTab }),
        setTaskDetailLastTab: (taskDetailLastTab) => updateSettings({ taskDetailLastTab }),
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};
