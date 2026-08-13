import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePreventRemove, useNavigation } from '@react-navigation/native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { ColorPicker } from '../components/ColorPicker';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { IconPicker } from '../components/IconPicker';
import { DAY_ABBREVIATIONS, DEFAULT_COLORS, DEFAULT_ICONS } from '../constants/task';
import { useToast } from '../context/ToastContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { useTaskStore } from '../stores/taskStore';
import { FrequencyType, MaterialCommunityIconName, NotificationLevel } from '../types';
import { formatFrequencyLabel } from '../utils/formatFrequency';
import { DEFAULT_NAG_INTERVAL_MINUTES, ensureNotificationPermissions } from '../utils/notifications';
import { ACTIVE_TASK_LIMIT_MESSAGE, hasReachedActiveTaskLimit } from '../utils/taskLimits';

interface NotificationLevelOption {
  level: NotificationLevel;
  label: string;
  icon: MaterialCommunityIconName;
}

// Matches TODO.md's own "Nag level" wording exactly -- see app/utils/notifications.ts for the
// actual scheduling behavior each level drives. Full behavior text lives in
// buildNagDescription below (rendered as one sentence with inline, tappable settings) rather
// than here, since it needs to interpolate the task's own chosen time/interval.
const NOTIFICATION_LEVEL_OPTIONS: NotificationLevelOption[] = [
  { level: 0, label: 'Off', icon: 'bell-off-outline' },
  { level: 1, label: 'Once', icon: 'bell-outline' },
  { level: 2, label: 'Repeat', icon: 'bell-ring-outline' },
  { level: 3, label: 'Persist', icon: 'bell-alert-outline' },
  { level: 4, label: 'Alarm', icon: 'alarm-light-outline' },
];

const NAG_INTERVAL_PRESETS_MINUTES = [15, 30, 45, 60];

const DEFAULT_NOTIFICATION_TIME = '09:00';

// The two manage-section actions' own semantic colors -- unrelated to the task's chosen color, so
// kept as fixed constants rather than tied to `selectedColor` the way Save/Add now is.
const ARCHIVE_COLOR = '#8E8E93';
const DELETE_COLOR = '#FF3B30';

const parseTimeString = (time: string): Date => {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
};

type FormSectionKey = 'name' | 'icon' | 'color' | 'frequency' | 'nagLevel';

export const AddTaskScreen: React.FC = () => {
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const { addTask, updateTask, tasks, deleteTask, restoreDeletedTask, archiveTask, restoreTask } = useTaskStore(
    useShallow(state => ({
      addTask: state.addTask,
      updateTask: state.updateTask,
      tasks: state.tasks,
      deleteTask: state.deleteTask,
      restoreDeletedTask: state.restoreDeletedTask,
      archiveTask: state.archiveTask,
      restoreTask: state.restoreTask,
    }))
  );
  const { showToast } = useToast();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const editingTask = useMemo(() => tasks.find(t => t.id === taskId), [tasks, taskId]);
  const isEditing = !!editingTask;

  // Find first unused icon and color -- unless editing, in which case keep the task's own.
  const { initialIcon, initialColor } = useMemo(() => {
    if (editingTask) return { initialIcon: editingTask.icon, initialColor: editingTask.color };

    const usedIcons = new Set(tasks.map(task => task.icon));
    const usedColors = new Set(tasks.map(task => task.color));

    const unusedIcon = DEFAULT_ICONS.find(icon => !usedIcons.has(icon)) || DEFAULT_ICONS[0];
    const unusedColor = DEFAULT_COLORS.find(color => !usedColors.has(color)) || DEFAULT_COLORS[0];

    return { initialIcon: unusedIcon, initialColor: unusedColor };
  }, [tasks, editingTask]);

  const [name, setName] = useState(editingTask?.name ?? '');
  const [selectedIcon, setSelectedIcon] = useState<MaterialCommunityIconName>(initialIcon);
  const [selectedColor, setSelectedColor] = useState(initialColor);
  const [frequency, setFrequency] = useState<FrequencyType>(editingTask?.frequency ?? 'daily');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(editingTask?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]);
  const [daysPerWeek, setDaysPerWeek] = useState(editingTask?.daysPerWeek ?? 3);
  const [daysPerMonth, setDaysPerMonth] = useState(editingTask?.daysPerMonth ?? 15);
  const [timesPerDay, setTimesPerDay] = useState(editingTask?.timesPerDay ?? 1);
  // New tasks default to Level 1 (on) -- a sensible, gentle default. An existing task with no
  // `notifications` field (created before this feature shipped) is never silently upgraded; it
  // shows Off until the user opts in themselves.
  const [notificationLevel, setNotificationLevel] = useState<NotificationLevel>(
    editingTask?.notifications?.level ?? (isEditing ? 0 : 1)
  );
  const [notificationTime, setNotificationTime] = useState(editingTask?.notifications?.time ?? DEFAULT_NOTIFICATION_TIME);
  const [nagIntervalMinutes, setNagIntervalMinutes] = useState(
    editingTask?.notifications?.nagIntervalMinutes ?? DEFAULT_NAG_INTERVAL_MINUTES
  );
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [notificationPermissionDenied, setNotificationPermissionDenied] = useState(false);

  // Snapshot of every field's own starting value, captured once (mirrors each useState above
  // exactly) -- compared against current state below to detect unsaved changes. A ref, not state,
  // since it's a fixed baseline that should never itself trigger a re-render.
  const initialFormValues = useRef({
    name: editingTask?.name ?? '',
    selectedIcon: initialIcon,
    selectedColor: initialColor,
    frequency: editingTask?.frequency ?? 'daily',
    daysOfWeek: editingTask?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
    daysPerWeek: editingTask?.daysPerWeek ?? 3,
    daysPerMonth: editingTask?.daysPerMonth ?? 15,
    timesPerDay: editingTask?.timesPerDay ?? 1,
    notificationLevel: editingTask?.notifications?.level ?? (isEditing ? 0 : 1),
    notificationTime: editingTask?.notifications?.time ?? DEFAULT_NOTIFICATION_TIME,
    nagIntervalMinutes: editingTask?.notifications?.nagIntervalMinutes ?? DEFAULT_NAG_INTERVAL_MINUTES,
  }).current;

  const daysOfWeekEqual = (a: number[], b: number[]) => a.length === b.length && a.every((d, i) => d === b[i]);

  // Deliberately not memoized -- a handful of primitive/array comparisons, cheap enough to just
  // recompute every render rather than track a dependency array as long as the state list itself.
  const isDirty =
    name !== initialFormValues.name ||
    selectedIcon !== initialFormValues.selectedIcon ||
    selectedColor !== initialFormValues.selectedColor ||
    frequency !== initialFormValues.frequency ||
    !daysOfWeekEqual(daysOfWeek, initialFormValues.daysOfWeek) ||
    daysPerWeek !== initialFormValues.daysPerWeek ||
    daysPerMonth !== initialFormValues.daysPerMonth ||
    timesPerDay !== initialFormValues.timesPerDay ||
    notificationLevel !== initialFormValues.notificationLevel ||
    notificationTime !== initialFormValues.notificationTime ||
    nagIntervalMinutes !== initialFormValues.nagIntervalMinutes;

  // Every one of this screen's own router calls that intentionally leaves with unsaved changes
  // already accounted for (a completed Save, or Delete/Archive/Restore -- each of which already
  // has its own confirmation, or deliberately has none by existing design) flips this first, so
  // the discard-changes guard below lets that specific removal straight through with no second
  // prompt stacked on top.
  const bypassLeaveGuardRef = useRef(false);
  const navigation = useNavigation();

  // Material Design's own full-screen-dialog guidance: nothing is saved until Save is tapped, and
  // leaving (back button, header back, swipe-back gesture) with unsaved changes should confirm
  // before discarding them. `usePreventRemove` intercepts any such removal action while `isDirty`
  // is true; the callback itself (not the boolean argument) is what actually distinguishes a
  // legitimate bypassed exit from a real "you're about to lose changes" moment, since re-dispatching
  // the original blocked action inside the callback works regardless of exactly when React
  // re-renders relative to the navigation action being processed.
  usePreventRemove(isDirty, ({ data }) => {
    if (bypassLeaveGuardRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert(
      'Discard changes?',
      "You'll lose the changes you made to this habit.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            navigation.dispatch(data.action);
          },
        },
      ]
    );
  });

  // Creating a new task: every section starts expanded, since there's nothing set yet to review
  // -- collapsing first would just cost extra taps to open each one while filling the form in.
  // Editing an existing task: every section starts collapsed instead, since all five already have
  // real values by now -- the collapsed summaries (name/icon/color/frequency/nag level) let the
  // whole config be scanned at a glance, and only the section actually being changed needs
  // expanding. This also means Task Name's own autoFocus (see its TextInput) naturally doesn't
  // fire on open while editing -- nothing to type into yet until that section is actually opened,
  // at which point the same autoFocus behavior kicks in exactly as it would in any other context.
  const [expandedSections, setExpandedSections] = useState<Record<FormSectionKey, boolean>>({
    name: !isEditing,
    icon: !isEditing,
    color: !isEditing,
    frequency: !isEditing,
    nagLevel: !isEditing,
  });
  const toggleSection = (key: FormSectionKey) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isNameValid = useMemo(() => {
    const trimmedName = name.trim();
    if (!trimmedName) return false;
    return !tasks.some(task => task.id !== editingTask?.id && task.name.toLowerCase() === trimmedName.toLowerCase());
  }, [name, tasks, editingTask]);

  // Only relevant when creating -- editing an existing task never changes the active count.
  const atTaskLimit = useMemo(() => !isEditing && hasReachedActiveTaskLimit(tasks), [isEditing, tasks]);

  const handleSave = async () => {
    if (atTaskLimit) {
      showToast({ message: ACTIVE_TASK_LIMIT_MESSAGE });
      return;
    }

    if (!isNameValid) {
      showToast({ message: 'Please enter a unique habit name' });
      return;
    }

    // Real bug (reported directly, 2026-08-13): permission was only ever requested reactively,
    // from the Nag Level slider's own onPress -- but a brand-new task already defaults to Level 1
    // with no tap required to reach it, and editing an existing level>0 task's *other* fields
    // (e.g. just the reminder time) never touches the slider either. Either path could leave
    // Android's notification permission stuck at "never asked" forever, so scheduling would
    // silently never fire (scheduleTaskNotifications's own `if (!granted) return`) with no
    // indication anything was wrong. Asking again here, unconditionally whenever the level being
    // saved is nonzero, closes that gap regardless of how the user arrived at that level --
    // ensureNotificationPermissions itself is already a no-op (an immediate `true`) once
    // permission is already granted, so this costs nothing on the already-working path.
    if (notificationLevel > 0) {
      const granted = await ensureNotificationPermissions();
      setNotificationPermissionDenied(!granted);
    }

    const taskData = {
      name: name.trim(),
      icon: selectedIcon,
      color: selectedColor,
      frequency,
      daysOfWeek,
      daysPerWeek,
      daysPerMonth,
      timesPerDay,
      notifications: { level: notificationLevel, time: notificationTime, nagIntervalMinutes },
    };

    try {
      if (editingTask) {
        await updateTask({ ...editingTask, ...taskData });
      } else {
        await addTask(taskData);
      }
      bypassLeaveGuardRef.current = true;
      router.back();
    } catch {
      showToast({ message: `Failed to ${isEditing ? 'update' : 'create'} habit` });
    }
  };

  // Requesting permission only when the user actually opts into a level > 0 (contextual, not at
  // app launch) -- denial shows an inline note rather than silently failing to ever notify.
  const handleSelectNotificationLevel = async (level: NotificationLevel) => {
    setNotificationLevel(level);
    if (level === 0) {
      setNotificationPermissionDenied(false);
      return;
    }
    const granted = await ensureNotificationPermissions();
    setNotificationPermissionDenied(!granted);
  };

  const handleCycleNagInterval = () => {
    const currentIndex = NAG_INTERVAL_PRESETS_MINUTES.indexOf(nagIntervalMinutes);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % NAG_INTERVAL_PRESETS_MINUTES.length;
    setNagIntervalMinutes(NAG_INTERVAL_PRESETS_MINUTES[nextIndex]);
  };

  const handleTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowTimePicker(false);
    if (event.type === 'set' && selectedDate) {
      setNotificationTime(format(selectedDate, 'HH:mm'));
    }
  };

  const toggleDayOfWeek = (dayIndex: number) => {
    setDaysOfWeek(prev =>
      prev.includes(dayIndex)
        ? prev.filter(d => d !== dayIndex)
        : [...prev, dayIndex].sort()
    );
  };

  // Switching to Specific Days should default to all 7 days selected, not silently carry over
  // whatever daysOfWeek the previous frequency left behind -- an empty array for a task that was
  // never Specific Days to begin with (its own daysOfWeek was never set/used), which rendered as
  // no days selected at all rather than a sensible starting point. Only defaults when daysOfWeek
  // is currently empty, though -- a real, non-empty selection (either the task's own original one,
  // or one already chosen earlier in this same edit session) is preserved, not blown away, if the
  // user toggles away to another frequency and back to Specific Days again.
  const handleSelectSpecificDays = () => {
    setFrequency('specific_days_of_week');
    setDaysOfWeek(prev => (prev.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : prev));
  };

  // Archive and delete get a real confirmation modal (unlike everything else in the app) --
  // both live at the bottom of the edit form now rather than a separate read-only screen, so
  // a stray tap here is easier to make by accident. The toast afterward still offers Undo as a
  // second safety net for anyone who confirms on autopilot.
  const handleDelete = () => {
    if (!editingTask) return;
    const deletedTask = editingTask;
    Alert.alert(
      'Delete Habit',
      `Delete "${deletedTask.name}"? This removes all of its history too.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            deleteTask(deletedTask.id);
            // dismissTo (not back) -- this screen can be reached via task-detail's pencil icon,
            // itself a modal pushed on top of Home. A plain back() would only pop this screen and
            // reveal task-detail underneath, which still holds the now-deleted taskId and throws
            // ("Missing task") on render. dismissTo pops every intermediate screen at once.
            bypassLeaveGuardRef.current = true;
            router.dismissTo('/');
            showToast({
              message: `"${deletedTask.name}" deleted`,
              action: { label: 'Undo', onPress: () => restoreDeletedTask(deletedTask) },
            });
          },
        },
      ]
    );
  };

  const handleArchiveToggle = () => {
    if (!editingTask) return;

    if (editingTask.archived) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      restoreTask(editingTask.id);
      bypassLeaveGuardRef.current = true;
      router.back();
      return;
    }

    const archivedTask = editingTask;
    Alert.alert(
      'Archive Habit',
      `Archive "${archivedTask.name}"? You can restore it later from Archived Habits.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            archiveTask(archivedTask.id);
            // dismissTo (not back), same reasoning as handleDelete above -- popping back to
            // task-detail (if that's how this screen was reached) would land on an archived
            // task's Calendar/Stats/Streaks view, which Home never lets you navigate to normally.
            bypassLeaveGuardRef.current = true;
            router.dismissTo('/');
            showToast({
              message: `"${archivedTask.name}" archived`,
              action: { label: 'Undo', onPress: () => restoreTask(archivedTask.id) },
            });
          },
        },
      ]
    );
  };

  const currentNotificationLevelOption = NOTIFICATION_LEVEL_OPTIONS.find(o => o.level === notificationLevel);
  const timeLabel = format(parseTimeString(notificationTime), 'h:mm a');
  // On native this span itself is the only way to open the time picker (no separate row). On web
  // the picker library has no implementation at all, so this stays plain text and a small text
  // input fallback renders separately below (a nested TextInput inside Text isn't supported by
  // RN, so the web fallback can't be inlined the same way).
  const timeSpan = (
    <Text
      style={[styles.inlineSettingValue, { color: selectedColor }]}
      onPress={Platform.OS === 'web' ? undefined : () => setShowTimePicker(true)}
      accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
      accessibilityLabel={Platform.OS === 'web' ? undefined : `Reminder time, ${timeLabel}`}
    >
      {timeLabel}
    </Text>
  );
  const intervalSpan = (
    <Text
      style={[styles.inlineSettingValue, { color: selectedColor }]}
      onPress={handleCycleNagInterval}
      accessibilityRole="button"
      accessibilityLabel={`Nudge interval, every ${nagIntervalMinutes} minutes. Tap to change.`}
    >
      {nagIntervalMinutes} minutes
    </Text>
  );

  const renderNagDescription = () => {
    switch (notificationLevel) {
      case 0:
        return <Text style={styles.nagDescription}>No reminders for this habit.</Text>;
      case 1:
        return <Text style={styles.nagDescription}>One reminder at {timeSpan}.</Text>;
      case 2:
        return <Text style={styles.nagDescription}>A reminder at {timeSpan}, plus every {intervalSpan} until you complete it.</Text>;
      case 3:
        return <Text style={styles.nagDescription}>A reminder at {timeSpan} that stays until the habit is done.</Text>;
      case 4:
        return <Text style={styles.nagDescription}>A buzzing alarm at {timeSpan} and a reminder that stays until the habit is done.</Text>;
      default:
        return null;
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 16 + insets.bottom }}>
      <Stack.Screen options={{ title: isEditing ? 'Edit Habit' : 'Add New Habit' }} />

      <CollapsibleSection
        title="Habit Name"
        summary={<Text style={styles.summaryText} numberOfLines={1}>{name.trim() || 'Untitled'}</Text>}
        expanded={expandedSections.name}
        onToggle={() => toggleSection('name')}
      >
        <View style={styles.card}>
          <TextInput
            style={[styles.input, !isNameValid && !!name.trim() && styles.inputError]}
            value={name}
            onChangeText={setName}
            placeholder="Enter habit name"
            placeholderTextColor={colors.textTertiary}
            autoFocus
          />
          {!isNameValid && !!name.trim() && (
            <Text style={styles.errorText}>This habit name already exists</Text>
          )}
        </View>
      </CollapsibleSection>

      <CollapsibleSection
        title="Icon"
        summary={<MaterialCommunityIcons name={selectedIcon} size={22} color={selectedColor} />}
        expanded={expandedSections.icon}
        onToggle={() => toggleSection('icon')}
      >
        <View style={styles.card}>
          <IconPicker
            selectedIcon={selectedIcon}
            selectedColor={selectedColor}
            onIconSelect={setSelectedIcon}
          />
        </View>
      </CollapsibleSection>

      <CollapsibleSection
        title="Color"
        summary={<View style={[styles.summaryColorSwatch, { backgroundColor: selectedColor }]} />}
        expanded={expandedSections.color}
        onToggle={() => toggleSection('color')}
      >
        <View style={styles.card}>
          <ColorPicker
            selectedColor={selectedColor}
            onColorSelect={setSelectedColor}
          />
        </View>
      </CollapsibleSection>

      <CollapsibleSection
        title="Frequency"
        summary={(
          <View style={styles.summaryRow}>
            <MaterialCommunityIcons name="repeat" size={18} color={selectedColor} />
            <Text style={styles.summaryText} numberOfLines={1}>
              {formatFrequencyLabel({ frequency, daysOfWeek, daysPerWeek, daysPerMonth, timesPerDay })}
            </Text>
          </View>
        )}
        expanded={expandedSections.frequency}
        onToggle={() => toggleSection('frequency')}
      >
        <View style={styles.card}>
          <View style={styles.frequencyTypeContainer}>
            <TouchableOpacity
              style={[styles.frequencyTypeButton, frequency === 'daily' && { backgroundColor: selectedColor }]}
              onPress={() => setFrequency('daily')}
              accessibilityRole="radio"
              accessibilityState={{ checked: frequency === 'daily' }}
            >
              <Text style={[styles.frequencyTypeText, frequency === 'daily' && styles.selectedText]}>
                Daily
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.frequencyTypeButton, frequency === 'specific_days_of_week' && { backgroundColor: selectedColor }]}
              onPress={handleSelectSpecificDays}
              accessibilityRole="radio"
              accessibilityState={{ checked: frequency === 'specific_days_of_week' }}
            >
              <Text style={[styles.frequencyTypeText, frequency === 'specific_days_of_week' && styles.selectedText]}>
                Specific Days
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.frequencyTypeButton, frequency === 'days_per_week' && { backgroundColor: selectedColor }]}
              onPress={() => setFrequency('days_per_week')}
              accessibilityRole="radio"
              accessibilityState={{ checked: frequency === 'days_per_week' }}
            >
              <Text style={[styles.frequencyTypeText, frequency === 'days_per_week' && styles.selectedText]}>
                Days/Week
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.frequencyTypeButton, frequency === 'days_per_month' && { backgroundColor: selectedColor }]}
              onPress={() => setFrequency('days_per_month')}
              accessibilityRole="radio"
              accessibilityState={{ checked: frequency === 'days_per_month' }}
            >
              <Text style={[styles.frequencyTypeText, frequency === 'days_per_month' && styles.selectedText]}>
                Days/Month
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.frequencyOptionsContainer}>
            {frequency === 'specific_days_of_week' && (
              <View style={styles.optionCard}>
                <Text style={styles.optionLabel}>Select Days</Text>
                <View style={styles.daysContainer}>
                  {DAY_ABBREVIATIONS.map((day, index) => (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.dayButton,
                        daysOfWeek.includes(index) && { backgroundColor: selectedColor }
                      ]}
                      onPress={() => toggleDayOfWeek(index)}
                      accessibilityRole="checkbox"
                      accessibilityLabel={day}
                      accessibilityState={{ checked: daysOfWeek.includes(index) }}
                    >
                      <Text style={[
                        styles.dayText,
                        daysOfWeek.includes(index) && styles.selectedText
                      ]}>
                        {day.slice(0, 1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {frequency === 'days_per_week' && (
              <View style={styles.optionCard}>
                <Text style={styles.optionLabel}>Days per week</Text>
                <View style={styles.numberInputRow}>
                  <TouchableOpacity
                    style={[styles.numberInputButton, { backgroundColor: selectedColor }]}
                    onPress={() => setDaysPerWeek(prev => Math.max(1, prev - 1))}
                    accessibilityRole="button"
                    accessibilityLabel="Decrease days per week"
                  >
                    <MaterialCommunityIcons name="minus" size={20} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.numberInputValue} accessibilityLabel={`${daysPerWeek} days per week`}>{daysPerWeek}</Text>
                  <TouchableOpacity
                    style={[styles.numberInputButton, { backgroundColor: selectedColor }]}
                    onPress={() => setDaysPerWeek(prev => Math.min(7, prev + 1))}
                    accessibilityRole="button"
                    accessibilityLabel="Increase days per week"
                  >
                    <MaterialCommunityIcons name="plus" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {frequency === 'days_per_month' && (
              <View style={styles.optionCard}>
                <Text style={styles.optionLabel}>Days per month</Text>
                <View style={styles.numberInputRow}>
                  <TouchableOpacity
                    style={[styles.numberInputButton, { backgroundColor: selectedColor }]}
                    onPress={() => setDaysPerMonth(prev => Math.max(1, prev - 1))}
                    accessibilityRole="button"
                    accessibilityLabel="Decrease days per month"
                  >
                    <MaterialCommunityIcons name="minus" size={20} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.numberInputValue} accessibilityLabel={`${daysPerMonth} days per month`}>{daysPerMonth}</Text>
                  <TouchableOpacity
                    style={[styles.numberInputButton, { backgroundColor: selectedColor }]}
                    onPress={() => setDaysPerMonth(prev => Math.min(31, prev + 1))}
                    accessibilityRole="button"
                    accessibilityLabel="Increase days per month"
                  >
                    <MaterialCommunityIcons name="plus" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={styles.optionCard}>
              <Text style={styles.optionLabel}>Times per day</Text>
              <View style={styles.numberInputRow}>
                <TouchableOpacity
                  style={[styles.numberInputButton, { backgroundColor: selectedColor }]}
                  onPress={() => setTimesPerDay(prev => Math.max(1, prev - 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease times per day"
                >
                  <MaterialCommunityIcons name="minus" size={20} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.numberInputValue} accessibilityLabel={`${timesPerDay} times per day`}>{timesPerDay}</Text>
                <TouchableOpacity
                  style={[styles.numberInputButton, { backgroundColor: selectedColor }]}
                  onPress={() => setTimesPerDay(prev => prev + 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Increase times per day"
                >
                  <MaterialCommunityIcons name="plus" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </CollapsibleSection>

      <CollapsibleSection
        title="Nag Level"
        summary={(
          <View style={styles.summaryRow}>
            {currentNotificationLevelOption && (
              <MaterialCommunityIcons name={currentNotificationLevelOption.icon} size={18} color={selectedColor} />
            )}
            <Text style={styles.summaryText} numberOfLines={1}>
              {notificationLevel === 0 ? 'Off' : `${currentNotificationLevelOption?.label} at ${timeLabel}`}
            </Text>
          </View>
        )}
        expanded={expandedSections.nagLevel}
        onToggle={() => toggleSection('nagLevel')}
      >
        <View style={styles.card}>
          <View style={styles.nagSliderWrap}>
            <View style={styles.nagSliderTrackBg} />
            <View
              style={[
                styles.nagSliderTrackFill,
                {
                  width: `${(notificationLevel / (NOTIFICATION_LEVEL_OPTIONS.length - 1)) * 100}%`,
                  backgroundColor: selectedColor,
                },
              ]}
            />
            <View style={styles.nagSliderStops}>
              {NOTIFICATION_LEVEL_OPTIONS.map(option => {
                const isSelected = notificationLevel === option.level;
                return (
                  <TouchableOpacity
                    key={option.level}
                    style={[styles.nagSliderStop, isSelected && { backgroundColor: selectedColor }]}
                    onPress={() => handleSelectNotificationLevel(option.level)}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityState={{ checked: isSelected }}
                  >
                    <MaterialCommunityIcons
                      name={option.icon}
                      size={18}
                      color={isSelected ? '#fff' : colors.textSecondary}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {renderNagDescription()}

          {notificationLevel > 0 && Platform.OS === 'web' && (
            // @react-native-community/datetimepicker has no web implementation, and a TextInput
            // can't be nested inside the inline description's <Text> tree above -- this fallback
            // keeps the app's web functional-testing workflow usable instead of leaving the time
            // permanently stuck at whatever it started as.
            <View style={styles.webTimeFallbackRow}>
              <Text style={styles.optionLabel}>Reminder time (web)</Text>
              <TextInput
                style={styles.webTimeFallbackInput}
                value={notificationTime}
                onChangeText={setNotificationTime}
                placeholder="HH:mm"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
          )}

          {notificationPermissionDenied && (
            <Text style={styles.errorText}>Enable notifications in system settings to use reminders.</Text>
          )}
        </View>
      </CollapsibleSection>

      {showTimePicker && Platform.OS !== 'web' && (
        <DateTimePicker
          value={parseTimeString(notificationTime)}
          mode="time"
          onChange={handleTimeChange}
        />
      )}

      {atTaskLimit && (
        <Text style={styles.taskLimitText}>{ACTIVE_TASK_LIMIT_MESSAGE}</Text>
      )}

      <TouchableOpacity
        style={[
          styles.saveButton,
          { backgroundColor: selectedColor },
          (!isNameValid || atTaskLimit) && styles.saveButtonDisabled,
        ]}
        onPress={handleSave}
        disabled={!isNameValid || atTaskLimit}
        accessibilityRole="button"
      >
        <Text style={[styles.saveButtonText, (!isNameValid || atTaskLimit) && styles.saveButtonTextDisabled]}>
          {isEditing ? 'Save Changes' : 'Add Habit'}
        </Text>
      </TouchableOpacity>

      {editingTask && (
        <View style={styles.manageSection}>
          {/* Tier 2: outlined, full width -- clearly secondary to Save/Add above, but still a
              real button. */}
          <TouchableOpacity
            style={[styles.manageButton, { borderColor: ARCHIVE_COLOR }]}
            onPress={handleArchiveToggle}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons
              name={editingTask.archived ? 'archive-arrow-up-outline' : 'archive-outline'}
              size={18}
              color={ARCHIVE_COLOR}
            />
            <Text style={[styles.manageButtonText, { color: ARCHIVE_COLOR }]}>
              {editingTask.archived ? 'Restore Habit' : 'Archive Habit'}
            </Text>
          </TouchableOpacity>

          {/* Tier 3: no fill, no border -- a plain text link, deliberately the quietest control
              on the whole screen despite being the most consequential one. Still unmistakably
              "danger" via its color, just not visually competing for attention the way a bordered
              or filled button would. */}
          <TouchableOpacity
            style={styles.deleteLink}
            onPress={handleDelete}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="delete-outline" size={15} color={DELETE_COLOR} />
            <Text style={styles.deleteLinkText}>Delete Habit</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  summaryColorSwatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  frequencyTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  frequencyOptionsContainer: {
    gap: 16,
  },
  optionCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
  },
  inputError: {
    borderColor: '#FF3B30',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    marginTop: 4,
  },
  // The discrete "slider" for Nag Level -- five evenly-spaced icon stops connected by a track,
  // with a colored fill from Off up to the current level. Deliberately tap-to-select rather than
  // a real drag gesture, to keep this new control simple and reliable without needing on-device
  // testing of custom pan-gesture math.
  nagSliderWrap: {
    position: 'relative',
    height: 44,
    justifyContent: 'center',
    marginBottom: 12,
  },
  nagSliderTrackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  nagSliderTrackFill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 2,
  },
  nagSliderStops: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nagSliderStop: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nagDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  inlineSettingValue: {
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  webTimeFallbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  webTimeFallbackInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 14,
    color: colors.text,
    minWidth: 80,
    textAlign: 'center',
  },
  taskLimitText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  frequencyTypeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
  },
  frequencyTypeText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  selectedText: {
    color: '#fff',
  },
  daysContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  dayButton: {
    // 44x44 -- iOS HIG's minimum touch target size (was 36x36, below platform minimums).
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  numberInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  numberInputButton: {
    // 44x44 -- iOS HIG's minimum touch target size (was 32x32, below platform minimums).
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberInputValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    minWidth: 40,
    textAlign: 'center',
  },
  // The primary action -- bigger padding, bolder/larger text, and a real shadow (matching `card`'s
  // own elevation treatment) all deliberately outweigh the secondary Archive/Delete row below, per
  // explicit user direction that Save/Add should read as clearly the most important control here.
  // Its background color is set inline (selectedColor) rather than here, so it visually reflects
  // the task's own chosen color -- the same "tie the primary action to the user's own selections"
  // treatment already used throughout this screen (day buttons, frequency pills, the nag slider).
  saveButton: {
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  saveButtonDisabled: {
    backgroundColor: colors.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  saveButtonTextDisabled: {
    color: '#8E8E93',
  },
  manageSection: {
    gap: 4,
    marginTop: 24,
    marginBottom: 32,
  },
  // Tier 2 (Archive): outlined, not filled -- a visibly quieter tier than `saveButton` (Material's
  // own filled-over-outlined-over-text hierarchy), sized down (smaller padding/icon/text) but
  // still full width and still a real bordered button, one clear step above Delete's plain link.
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    gap: 6,
  },
  manageButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Tier 3 (Delete): the text-button rung of the same hierarchy -- no fill, no border, small and
  // centered, well below Archive so it never reads as competing with it for attention despite
  // being the more severe action.
  deleteLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  deleteLinkText: {
    fontSize: 13,
    fontWeight: '500',
    color: DELETE_COLOR,
  },
});
