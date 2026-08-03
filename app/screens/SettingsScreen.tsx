import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { ThemeMode, useSettings } from '../context/SettingsContext';
import { useTaskContext } from '../context/TaskContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { Task } from '../types';

const isImportableTask = (value: unknown): value is Task =>
  typeof value === 'object' && value !== null
    && typeof (value as Task).id === 'string'
    && typeof (value as Task).name === 'string';

const THEME_MODE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export const SettingsScreen: React.FC = () => {
  const router = useRouter();
  const { tasks, importTasks } = useTaskContext();
  const {
    themeMode, setThemeMode,
    showCardBackground, setShowCardBackground,
    showTaskName, setShowTaskName,
    showTaskCounter, setShowTaskCounter,
  } = useSettings();
  const [isBusy, setIsBusy] = useState(false);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const appName = Constants.expoConfig?.name ?? 'Streakaholic';
  const version = Constants.expoConfig?.version ?? '';

  const handleExport = async () => {
    setIsBusy(true);
    try {
      const json = JSON.stringify(tasks, null, 2);
      const filename = `streakaholic-export-${format(new Date(), 'yyyy-MM-dd')}.json`;

      if (Platform.OS === 'web') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        const fileUri = FileSystem.documentDirectory + filename;
        await FileSystem.writeAsStringAsync(fileUri, json);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: 'application/json' });
        } else {
          Alert.alert('Export complete', `Saved to ${fileUri}`);
        }
      }
    } catch {
      Alert.alert('Error', 'Failed to export data');
    } finally {
      setIsBusy(false);
    }
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;

      setIsBusy(true);
      const uri = result.assets[0].uri;
      const content = Platform.OS === 'web'
        ? await (await fetch(uri)).text()
        : await FileSystem.readAsStringAsync(uri);

      const parsed: unknown = JSON.parse(content);
      if (!Array.isArray(parsed) || !parsed.every(isImportableTask)) {
        Alert.alert('Invalid file', "This doesn't look like a Streakaholic export file.");
        return;
      }

      Alert.alert(
        'Replace all data?',
        `This will replace your current ${tasks.length} task(s) with ${parsed.length} task(s) from the file. This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: async () => {
              await importTasks(parsed);
              Alert.alert('Import complete', `Imported ${parsed.length} task(s).`);
            },
          },
        ]
      );
    } catch {
      Alert.alert('Error', 'Failed to import data');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <MaterialCommunityIcons name="theme-light-dark" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Theme</Text>
          </View>
          <View style={styles.themeSelector}>
            {THEME_MODE_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[styles.themeOption, themeMode === option.value && styles.themeOptionActive]}
                onPress={() => setThemeMode(option.value)}
              >
                <Text style={[styles.themeOptionText, themeMode === option.value && styles.themeOptionTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Task Cards</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <MaterialCommunityIcons name="card-outline" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Show Card Background</Text>
            <Switch
              value={showCardBackground}
              onValueChange={setShowCardBackground}
              trackColor={{ false: colors.border, true: '#007AFF' }}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <MaterialCommunityIcons name="format-text" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Show Task Name</Text>
            <Switch
              value={showTaskName}
              onValueChange={setShowTaskName}
              trackColor={{ false: colors.border, true: '#007AFF' }}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <MaterialCommunityIcons name="counter" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Show Completion Counter</Text>
            <Switch
              value={showTaskCounter}
              onValueChange={setShowTaskCounter}
              trackColor={{ false: colors.border, true: '#007AFF' }}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Data</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => router.push('/archived-tasks')}>
            <MaterialCommunityIcons name="archive-outline" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Archived Tasks</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textTertiary} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.row} onPress={handleExport} disabled={isBusy}>
            <MaterialCommunityIcons name="export-variant" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Export Data</Text>
            {isBusy && <ActivityIndicator size="small" />}
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.row} onPress={handleImport} disabled={isBusy}>
            <MaterialCommunityIcons name="import" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Import Data</Text>
            {isBusy && <ActivityIndicator size="small" />}
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <MaterialCommunityIcons name="information-outline" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>{appName}</Text>
            <Text style={styles.rowValue}>{version}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.iconButtonBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    marginTop: 8,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 16,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  rowValue: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  themeSelector: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  themeOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
  },
  themeOptionActive: {
    backgroundColor: '#007AFF',
  },
  themeOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  themeOptionTextActive: {
    color: '#fff',
  },
});
