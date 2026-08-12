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
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '../context/ToastContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { useAchievementsStore } from '../stores/achievementsStore';
import { useLastImportStore } from '../stores/lastImportStore';
import { ThemeMode, useSettingsStore } from '../stores/settingsStore';
import { useTaskStore } from '../stores/taskStore';
import { Task } from '../types';
import { createTasksExport, ParsedTasksImport, parseTasksImport } from '../utils/importExport';
import { isTaskCompleted } from '../utils/streaks';

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
  const { tasks, importTasks } = useTaskStore(
    useShallow(state => ({ tasks: state.tasks, importTasks: state.importTasks }))
  );
  const lastImport = useLastImportStore(state => state.lastImport);
  const achievementCount = useAchievementsStore(state => state.achievements.length);
  const runRetroactiveScan = useAchievementsStore(state => state.runRetroactiveScan);
  const { showToast } = useToast();
  const {
    themeMode, setThemeMode,
    showCardBackground, setShowCardBackground,
    showTaskName, setShowTaskName,
    showTaskCounter, setShowTaskCounter,
    achievementCelebrationsEnabled, setAchievementCelebrationsEnabled,
    resetOnboardingHints,
  } = useSettingsStore(
    useShallow(state => ({
      themeMode: state.themeMode,
      setThemeMode: state.setThemeMode,
      showCardBackground: state.showCardBackground,
      setShowCardBackground: state.setShowCardBackground,
      showTaskName: state.showTaskName,
      setShowTaskName: state.setShowTaskName,
      showTaskCounter: state.showTaskCounter,
      setShowTaskCounter: state.setShowTaskCounter,
      achievementCelebrationsEnabled: state.achievementCelebrationsEnabled,
      setAchievementCelebrationsEnabled: state.setAchievementCelebrationsEnabled,
      resetOnboardingHints: state.resetOnboardingHints,
    }))
  );
  const [isBusy, setIsBusy] = useState(false);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const appName = Constants.expoConfig?.name ?? 'Streakaholic';
  const version = Constants.expoConfig?.version ?? '';

  // Turning celebrations ON (not off -- there's nothing to offer when disabling) is a natural
  // moment to offer a retroactive "catch up" scan (the same one TrophiesScreen's own "Check for
  // Missed Achievements" button runs), since a user re-enabling this after a while, or trying it
  // for the first time, likely already has qualifying history sitting unrecorded. A toast with an
  // action rather than running it automatically -- this is genuinely optional, not something to
  // do on the user's behalf without asking, and follows the same toast+action shape the app
  // already uses for exactly this kind of "here's a related thing you can also do" offer.
  const handleAchievementCelebrationsToggle = (enabled: boolean) => {
    setAchievementCelebrationsEnabled(enabled);
    if (!enabled) return;
    showToast({
      message: 'Achievements enabled! Want to check for ones you already qualify for?',
      action: {
        label: 'Check Now',
        onPress: () => {
          const activeTasks = tasks.filter(t => !t.archived);
          const count = runRetroactiveScan(activeTasks);
          showToast({
            message: count > 0
              ? `Found ${count} achievement${count === 1 ? '' : 's'} you'd already earned!`
              : "No new achievements found — you're all caught up.",
          });
        },
      },
    });
  };

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
      // Not filtered to 'application/json' -- several cloud-storage document providers (Dropbox
      // in particular) don't reliably report that MIME type for synced files, which made the
      // picker show the file but grey it out as unselectable. Content is already validated right
      // below via `parseTasksImport` (with a clear error toast if it's not actually an export),
      // so an OS-level type filter here was redundant safety that broke real imports.
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
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
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
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
                accessibilityRole="radio"
                accessibilityState={{ checked: themeMode === option.value }}
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
              accessibilityLabel="Show Card Background"
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
              accessibilityLabel="Show Task Name"
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
              accessibilityLabel="Show Completion Counter"
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Achievements</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <MaterialCommunityIcons name="party-popper" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Celebrate Achievements</Text>
            <WebSwitch
              value={achievementCelebrationsEnabled}
              onValueChange={handleAchievementCelebrationsToggle}
              trackColor={{ false: colors.border, true: '#007AFF' }}
              thumbColor="#fff"
              activeThumbColor="#fff"
              accessibilityLabel="Celebrate Achievements"
            />
          </View>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.row} onPress={() => router.push('/trophies')} accessibilityRole="button" accessibilityHint="Opens your trophy history">
            <MaterialCommunityIcons name="trophy-outline" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Trophy Case</Text>
            <Text style={styles.rowValue}>{achievementCount}</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Data</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => router.push('/archived-tasks')} accessibilityRole="button">
            <MaterialCommunityIcons name="archive-outline" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Archived Tasks</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textTertiary} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.row} onPress={handleExport} disabled={isBusy} accessibilityRole="button" accessibilityState={{ disabled: isBusy, busy: isBusy }}>
            <MaterialCommunityIcons name="export-variant" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Export Data</Text>
            {isBusy && <ActivityIndicator size="small" />}
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.row} onPress={() => handleImport('merge')} disabled={isBusy} accessibilityRole="button" accessibilityState={{ disabled: isBusy, busy: isBusy }}>
            <MaterialCommunityIcons name="import" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Import Data</Text>
            {isBusy && <ActivityIndicator size="small" />}
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.row} onPress={() => handleImport('replace')} disabled={isBusy} accessibilityRole="button" accessibilityState={{ disabled: isBusy, busy: isBusy }}>
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
              // If a task's already been completed today, the "hold to complete" hint wouldn't
              // make sense to replay -- the user's clearly already found that gesture.
              const completedSomethingToday = tasks.some(task => !task.archived && isTaskCompleted(task));
              resetOnboardingHints(completedSomethingToday ? { 'hold-to-complete': true } : undefined);
              router.back();
            }}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="gesture-tap-hold" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>Replay Onboarding Hints</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => router.push('/about')} accessibilityRole="button" accessibilityHint="Opens privacy policy, terms, and credits">
            <MaterialCommunityIcons name="information-outline" size={22} color={colors.textSecondary} />
            <Text style={styles.rowLabel}>{appName}</Text>
            <Text style={styles.rowValue}>{version}</Text>
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textTertiary} />
          </TouchableOpacity>
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
    paddingHorizontal: 16,
    // A fixed floor, not just padding, so every row matches regardless of trailing content --
    // rows ending in a Switch were taller than the rest, since Switch's own intrinsic height
    // (bigger than an icon or a line of text) was what determined those rows' height once padding
    // was added on top of it. minHeight (not height) still lets a row grow past this if its
    // content genuinely needs more room, e.g. label text wrapping to two lines on a narrow screen.
    minHeight: 56,
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
