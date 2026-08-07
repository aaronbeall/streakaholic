import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';

// Stub -- Reports is a placeholder tab for now, not implemented yet.
export const DashboardReportsView: React.FC = () => {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name="file-chart-outline" size={48} color={colors.textTertiary} />
      <Text style={styles.title}>Reports</Text>
      <Text style={styles.subtitle}>Coming soon.</Text>
    </View>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
