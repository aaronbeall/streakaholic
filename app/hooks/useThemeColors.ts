import { useColorScheme } from 'react-native';
import { useSettings } from '../context/SettingsContext';

export interface ThemeColors {
  isDark: boolean;
  background: string;
  surface: string;
  surfaceSecondary: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  iconButtonBackground: string;
  overlay: string;
}

const light: ThemeColors = {
  isDark: false,
  background: '#f5f5f5',
  surface: '#ffffff',
  surfaceSecondary: '#f8f8f8',
  text: '#333333',
  textSecondary: '#666666',
  textTertiary: '#999999',
  border: '#f0f0f0',
  iconButtonBackground: '#f5f5f5',
  overlay: 'rgba(0, 0, 0, 0.05)',
};

const dark: ThemeColors = {
  isDark: true,
  background: '#121214',
  surface: '#1c1c1e',
  surfaceSecondary: '#2c2c2e',
  text: '#f2f2f2',
  textSecondary: '#a1a1a6',
  textTertiary: '#8e8e93',
  border: '#2c2c2e',
  iconButtonBackground: '#2c2c2e',
  overlay: 'rgba(255, 255, 255, 0.08)',
};

export const useThemeColors = (): ThemeColors => {
  const systemScheme = useColorScheme();
  const { themeMode } = useSettings();
  const effectiveScheme = themeMode === 'system' ? systemScheme : themeMode;
  return effectiveScheme === 'dark' ? dark : light;
};
