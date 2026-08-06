import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface AppSettings {
  themeMode: ThemeMode;
  showCardBackground: boolean;
  showTaskName: boolean;
  showTaskCounter: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'system',
  showCardBackground: true,
  showTaskName: true,
  showTaskCounter: true,
};

const STORAGE_KEY = 'appSettings';

interface SettingsContextType extends AppSettings {
  isLoaded: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setShowCardBackground: (value: boolean) => void;
  setShowTaskName: (value: boolean) => void;
  setShowTaskCounter: (value: boolean) => void;
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

  const updateSettings = (patch: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
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
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};
