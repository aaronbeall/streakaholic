import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TaskHeader } from '../components/TaskHeader';
import { useTaskContext } from '../context/TaskContext';

export default function TaskDetailsScreen() {
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { tasks, deleteTask, archiveTask, restoreTask } = useTaskContext();

  const task = tasks.find(t => t.id === taskId);
  if (!task) {
    return null;
  }

  const handleDelete = () => {
    deleteTask(taskId);
    router.back();
  };

  const handleEdit = () => {
    router.push({
      pathname: '/add-task',
      params: { taskId }
    });
  };

  const handleArchiveToggle = () => {
    if (task.archived) {
      restoreTask(taskId);
    } else {
      archiveTask(taskId);
      router.back();
    }
  };

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <View style={styles.container}>
      <TaskHeader task={task} />

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Task Information</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Name</Text>
              <Text style={styles.infoValue}>{task.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Icon</Text>
              <View style={styles.iconValue}>
                <MaterialCommunityIcons name={task.icon} size={24} color={task.color} />
                <Text style={styles.infoValue}>{task.icon}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Color</Text>
              <View style={styles.colorValue}>
                <View style={[styles.colorPreview, { backgroundColor: task.color }]} />
                <Text style={styles.infoValue}>{task.color}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Frequency</Text>
          <View style={styles.infoCard}>
            {task.frequency === 'specific_days_of_week' ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Days of Week</Text>
                <View style={styles.daysContainer}>
                  {weekDays.map((day, index) => (
                    <View
                      key={day}
                      style={[
                        styles.dayChip,
                        task.daysOfWeek.includes(index) && { backgroundColor: task.color }
                      ]}
                    >
                      <Text style={[
                        styles.dayText,
                        task.daysOfWeek.includes(index) && styles.selectedDayText
                      ]}>
                        {day[0]}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Schedule</Text>
                <Text style={styles.infoValue}>
                  {task.frequency === 'daily' && 'Every day'}
                  {task.frequency === 'days_per_week' && `${task.daysPerWeek} days per week`}
                  {task.frequency === 'days_per_month' && `${task.daysPerMonth} days per month`}
                </Text>
              </View>
            )}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Times Per Day</Text>
              <Text style={styles.infoValue}>{task.timesPerDay}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.button, styles.editButton]} onPress={handleEdit}>
            <MaterialCommunityIcons name="pencil" size={20} color="#fff" />
            <Text style={styles.buttonText}>Edit Task</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.archiveButton]} onPress={handleArchiveToggle}>
            <MaterialCommunityIcons name={task.archived ? 'archive-arrow-up-outline' : 'archive-outline'} size={20} color="#fff" />
            <Text style={styles.buttonText}>{task.archived ? 'Restore Task' : 'Archive Task'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.deleteButton]} onPress={handleDelete}>
            <MaterialCommunityIcons name="delete" size={20} color="#fff" />
            <Text style={styles.buttonText}>Delete Task</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 16,
    color: '#666',
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  iconValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorPreview: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  daysContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  dayChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  selectedDayText: {
    color: '#fff',
  },
  actions: {
    gap: 12,
    marginBottom: 24,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  editButton: {
    backgroundColor: '#007AFF',
  },
  archiveButton: {
    backgroundColor: '#8E8E93',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
}); 