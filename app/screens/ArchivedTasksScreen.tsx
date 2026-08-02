import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTaskContext } from '../context/TaskContext';

export const ArchivedTasksScreen: React.FC = () => {
  const router = useRouter();
  const { tasks, restoreTask } = useTaskContext();

  const archivedTasks = useMemo(() => tasks.filter(task => task.archived), [tasks]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Archived Tasks</Text>
        <View style={styles.headerButton} />
      </View>

      {archivedTasks.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="archive-outline" size={48} color="#ccc" />
          <Text style={styles.emptyStateText}>No archived tasks</Text>
        </View>
      ) : (
        <FlatList
          data={archivedTasks}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push({ pathname: '/task-details', params: { taskId: item.id } })}
            >
              <View style={[styles.iconCircle, { backgroundColor: item.color }]}>
                <MaterialCommunityIcons name={item.icon} size={20} color="#fff" />
              </View>
              <Text style={styles.rowLabel} numberOfLines={1}>{item.name}</Text>
              <TouchableOpacity style={styles.restoreButton} onPress={() => restoreTask(item.id)}>
                <MaterialCommunityIcons name="archive-arrow-up-outline" size={18} color="#007AFF" />
                <Text style={styles.restoreButtonText}>Restore</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  restoreButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
  },
});
