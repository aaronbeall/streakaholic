import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTaskContext } from '../context/TaskContext';
import { ThemeColors, useThemeColors } from '../hooks/useThemeColors';

export const ArchivedTasksScreen: React.FC = () => {
  const router = useRouter();
  const { tasks, restoreTask } = useTaskContext();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const archivedTasks = useMemo(() => tasks.filter(task => task.archived), [tasks]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Archived Tasks</Text>
        <View style={styles.headerButton} />
      </View>

      {archivedTasks.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="archive-outline" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyStateText}>No archived tasks</Text>
        </View>
      ) : (
        <FlatList
          data={archivedTasks}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: 16 + insets.bottom }]}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push({ pathname: '/add-task', params: { taskId: item.id } })}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              accessibilityHint="Opens this task for editing"
            >
              <View style={[styles.iconCircle, { backgroundColor: item.color }]}>
                <MaterialCommunityIcons name={item.icon} size={20} color="#fff" />
              </View>
              <Text style={styles.rowLabel} numberOfLines={1}>{item.name}</Text>
              <TouchableOpacity
                style={styles.restoreButton}
                onPress={() => restoreTask(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Restore ${item.name}`}
              >
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
  listContent: {
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
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
    color: colors.text,
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
    color: colors.textTertiary,
  },
});
