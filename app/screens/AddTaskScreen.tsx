import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ColorPicker } from '../components/ColorPicker';
import { IconPicker } from '../components/IconPicker';
import { DEFAULT_COLORS, DEFAULT_ICONS } from '../constants/task';
import { useTaskContext } from '../context/TaskContext';
import { useToast } from '../context/ToastContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';
import { FrequencyType, MaterialCommunityIconName } from '../types';

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const AddTaskScreen: React.FC = () => {
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const { addTask, updateTask, tasks, deleteTask, restoreDeletedTask, archiveTask, restoreTask } = useTaskContext();
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

  const isNameValid = useMemo(() => {
    const trimmedName = name.trim();
    if (!trimmedName) return false;
    return !tasks.some(task => task.id !== editingTask?.id && task.name.toLowerCase() === trimmedName.toLowerCase());
  }, [name, tasks, editingTask]);

  const handleSave = async () => {
    if (!isNameValid) {
      showToast({ message: 'Please enter a unique task name' });
      return;
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
    };

    try {
      if (editingTask) {
        await updateTask({ ...editingTask, ...taskData });
      } else {
        await addTask(taskData);
      }
      router.back();
    } catch {
      showToast({ message: `Failed to ${isEditing ? 'update' : 'create'} task` });
    }
  };

  const toggleDayOfWeek = (dayIndex: number) => {
    setDaysOfWeek(prev =>
      prev.includes(dayIndex)
        ? prev.filter(d => d !== dayIndex)
        : [...prev, dayIndex].sort()
    );
  };

  // Archive and delete get a real confirmation modal (unlike everything else in the app) --
  // both live at the bottom of the edit form now rather than a separate read-only screen, so
  // a stray tap here is easier to make by accident. The toast afterward still offers Undo as a
  // second safety net for anyone who confirms on autopilot.
  const handleDelete = () => {
    if (!editingTask) return;
    const deletedTask = editingTask;
    Alert.alert(
      'Delete Task',
      `Delete "${deletedTask.name}"? This removes all of its history too.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteTask(deletedTask.id);
            router.back();
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
      restoreTask(editingTask.id);
      router.back();
      return;
    }

    const archivedTask = editingTask;
    Alert.alert(
      'Archive Task',
      `Archive "${archivedTask.name}"? You can restore it later from Archived Tasks.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: () => {
            archiveTask(archivedTask.id);
            router.back();
            showToast({
              message: `"${archivedTask.name}" archived`,
              action: { label: 'Undo', onPress: () => restoreTask(archivedTask.id) },
            });
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 16 + insets.bottom }}>
      <Stack.Screen options={{ title: isEditing ? 'Edit Task' : 'Add New Task' }} />
      <View style={styles.section}>
        <Text style={styles.label}>Task Name</Text>
        <View style={styles.card}>
          <TextInput
            style={[styles.input, !isNameValid && !!name.trim() && styles.inputError]}
            value={name}
            onChangeText={setName}
            placeholder="Enter task name"
            placeholderTextColor={colors.textTertiary}
          />
          {!isNameValid && !!name.trim() && (
            <Text style={styles.errorText}>This task name already exists</Text>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Icon</Text>
        <View style={styles.card}>
          <IconPicker
            selectedIcon={selectedIcon}
            selectedColor={selectedColor}
            onIconSelect={setSelectedIcon}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Color</Text>
        <View style={styles.card}>
          <ColorPicker
            selectedColor={selectedColor}
            onColorSelect={setSelectedColor}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Frequency</Text>
        <View style={styles.card}>
          <View style={styles.frequencyTypeContainer}>
            <TouchableOpacity
              style={[styles.frequencyTypeButton, frequency === 'daily' && { backgroundColor: selectedColor }]}
              onPress={() => setFrequency('daily')}
            >
              <Text style={[styles.frequencyTypeText, frequency === 'daily' && styles.selectedText]}>
                Daily
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.frequencyTypeButton, frequency === 'specific_days_of_week' && { backgroundColor: selectedColor }]}
              onPress={() => setFrequency('specific_days_of_week')}
            >
              <Text style={[styles.frequencyTypeText, frequency === 'specific_days_of_week' && styles.selectedText]}>
                Specific Days
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.frequencyTypeButton, frequency === 'days_per_week' && { backgroundColor: selectedColor }]}
              onPress={() => setFrequency('days_per_week')}
            >
              <Text style={[styles.frequencyTypeText, frequency === 'days_per_week' && styles.selectedText]}>
                Days/Week
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.frequencyTypeButton, frequency === 'days_per_month' && { backgroundColor: selectedColor }]}
              onPress={() => setFrequency('days_per_month')}
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
                  {weekDays.map((day, index) => (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.dayButton,
                        daysOfWeek.includes(index) && { backgroundColor: selectedColor }
                      ]}
                      onPress={() => toggleDayOfWeek(index)}
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
                  >
                    <MaterialCommunityIcons name="minus" size={20} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.numberInputValue}>{daysPerWeek}</Text>
                  <TouchableOpacity
                    style={[styles.numberInputButton, { backgroundColor: selectedColor }]}
                    onPress={() => setDaysPerWeek(prev => Math.min(7, prev + 1))}
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
                  >
                    <MaterialCommunityIcons name="minus" size={20} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.numberInputValue}>{daysPerMonth}</Text>
                  <TouchableOpacity
                    style={[styles.numberInputButton, { backgroundColor: selectedColor }]}
                    onPress={() => setDaysPerMonth(prev => Math.min(31, prev + 1))}
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
                >
                  <MaterialCommunityIcons name="minus" size={20} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.numberInputValue}>{timesPerDay}</Text>
                <TouchableOpacity
                  style={[styles.numberInputButton, { backgroundColor: selectedColor }]}
                  onPress={() => setTimesPerDay(prev => prev + 1)}
                >
                  <MaterialCommunityIcons name="plus" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.saveButton, !isNameValid && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!isNameValid}
      >
        <Text style={[styles.saveButtonText, !isNameValid && styles.saveButtonTextDisabled]}>
          {isEditing ? 'Save Changes' : 'Save Task'}
        </Text>
      </TouchableOpacity>

      {editingTask && (
        <View style={styles.manageSection}>
          <TouchableOpacity style={[styles.manageButton, styles.archiveButton]} onPress={handleArchiveToggle}>
            <MaterialCommunityIcons
              name={editingTask.archived ? 'archive-arrow-up-outline' : 'archive-outline'}
              size={20}
              color="#fff"
            />
            <Text style={styles.manageButtonText}>{editingTask.archived ? 'Restore Task' : 'Archive Task'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.manageButton, styles.deleteButton]} onPress={handleDelete}>
            <MaterialCommunityIcons name="delete" size={20} color="#fff" />
            <Text style={styles.manageButtonText}>Delete Task</Text>
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
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: colors.text,
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
    width: 36,
    height: 36,
    borderRadius: 18,
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
    width: 32,
    height: 32,
    borderRadius: 16,
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
  saveButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonDisabled: {
    backgroundColor: colors.border,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButtonTextDisabled: {
    color: '#8E8E93',
  },
  manageSection: {
    gap: 12,
    marginTop: 24,
    marginBottom: 32,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    gap: 8,
  },
  archiveButton: {
    backgroundColor: '#8E8E93',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
  },
  manageButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});