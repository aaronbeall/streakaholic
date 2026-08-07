import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
// SDK 54's expo-file-system replaced this API with a new File/Directory-based one; the
// classic documentDirectory/writeAsStringAsync/readAsStringAsync functions used here still
// exist, just moved under this subpath.
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeMode, useSettings } from '../context/SettingsContext';
import { useTaskContext } from '../context/TaskContext';
import { useToast } from '../context/ToastContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { Task } from '../types';
import { createTasksExport, ParsedTasksImport, parseTasksImport } from '../utils/importExport';

// react-native-web's Switch splits the thumb color into two props: `thumbColor` (off state)
// and `activeThumbColor` (on state, defaulting to Material teal if unset). Native RN's own
// Switch type doesn't know about `activeThumbColor` since it's a web-only extension, so it's
// typed here rather than reached for with `any`.
const WebSwitch = Switch as React.ComponentType<React.ComponentProps<typeof Switch> & { activeThumbColor?: string }>;

const THEME_MODE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export const SettingsScreen: React.FC = () => {
  const router = useRouter();
  const { tasks, importTasks, lastImport } = useTaskContext();
  const { showToast } = useToast();
  const {
    themeMode, setThemeMode,
    showCardBackground, setShowCardBackground,
    showTaskName, setShowTaskName,
    showTaskCounter, setShowTaskCounter,
    resetOnboardingHints,
  } = useSettings();
  const [isBusy, setIsBusy] = useState(false);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const appName = Constants.expoConfig?.name ?? 'Streakaholic';
  const version = Constants.expoConfig?.version ?? '';

  const handleExport = async () => {
    setIsBusy(true);
    try {
      const json = JSON.stringify(createTasksExport(tasks, version), null, 2);
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
          showToast({ message: `Saved to ${fileUri}` });
        }
      }
    } catch {
      showToast({ message: 'Failed to export data' });
    } finally {
      setIsBusy(false);
    }
  };

  // No modal confirmation and no merge-vs-replace prompt -- "Import Data" always merges (the
  // safe, additive default) and "Import & Replace All Data" is its own explicit row below.
  // Either way the previous tasks are snapshotted first so the toast's Undo can restore them.
  const handleImport = async (mode: 'merge' | 'replace') => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;

      setIsBusy(true);
      const uri = result.assets[0].uri;
      const content = Platform.OS === 'web'
        ? await (await fetch(uri)).text()
        : await FileSystem.readAsStringAsync(uri);

      let importedTasks: Task[];
      let meta: ParsedTasksImport['meta'];
      try {
        ({ tasks: importedTasks, meta } = parseTasksImport(content));
      } catch {
        showToast({ message: "This doesn't look like a Streakaholic export file." });
        return;
      }

      const previousTasks = tasks;
      const alreadyImported = !!meta && meta.exportId === lastImport?.exportId;
      const exportMeta = meta ? { exportId: meta.exportId } : undefined;

      await importTasks(importedTasks, { mode, exportMeta });

      showToast({
        message: `Imported ${importedTasks.length} task(s) — ${mode === 'merge' ? 'merged with' : 'replaced'} your data`
          + (alreadyImported ? ' (already imported before)' : '') + '.',
        action: { label: 'Undo', onPress: () => importTasks(previousTasks, { mode: 'replace' }) },
      });
    } catch {
      showToast({ message: 'Failed to import data' });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: insets.bottom }}>
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
            <WebSwitch
              value={showCardBackground}
              onValueChange={setShowCardBackground}
              trackColor={{ false: colors.border, true: '#007AFF' }}
              thumbColor="#fff"
              activeThumbColor="#fff"
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <MaterialCommunityIcons name="format-text" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Show Task Name</Text>
            <WebSwitch
              value={showTaskName}
              onValueChange={setShowTaskName}
              trackColor={{ false: colors.border, true: '#007AFF' }}
              thumbColor="#fff"
              activeThumbColor="#fff"
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <MaterialCommunityIcons name="counter" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Show Completion Counter</Text>
            <WebSwitch
              value={showTaskCounter}
              onValueChange={setShowTaskCounter}
              trackColor={{ false: colors.border, true: '#007AFF' }}
              thumbColor="#fff"
              activeThumbColor="#fff"
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
          <TouchableOpacity style={styles.row} onPress={() => handleImport('merge')} disabled={isBusy}>
            <MaterialCommunityIcons name="import" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Import Data</Text>
            {isBusy && <ActivityIndicator size="small" />}
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.row} onPress={() => handleImport('replace')} disabled={isBusy}>
            <MaterialCommunityIcons name="delete-sweep-outline" size={22} color="#FF3B30" />
            <Text style={[styles.rowLabel, styles.destructiveRowLabel]}>Import & Replace All Data</Text>
            {isBusy && <ActivityIndicator size="small" />}
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Help</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => {
              resetOnboardingHints();
              router.back();
            }}
          >
            <MaterialCommunityIcons name="gesture-tap-hold" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Replay Onboarding Hints</Text>
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
  destructiveRowLabel: {
    color: '#FF3B30',
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
