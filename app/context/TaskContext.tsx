import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Task, TaskCompletion } from '../types';
import { LastImportRecord, mergeTaskLists } from '../utils/importExport';
import { calculateTaskStats } from '../utils/streaks';

interface ImportOptions {
  mode?: 'replace' | 'merge';
  exportMeta?: { exportId: string };
}

interface TaskContextType {
  tasks: Task[];
  isLoaded: boolean;
  lastImport: LastImportRecord | null;
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateTask: (task: Task) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  restoreDeletedTask: (task: Task) => Promise<void>;
  completeTask: (taskId: string, date?: Date) => Promise<void>;
  uncompleteTask: (taskId: string, date: Date) => Promise<void>;
  undoCompleteTask: (taskId: string, date?: Date) => Promise<void>;
  restoreCompletion: (taskId: string, completion: TaskCompletion) => Promise<void>;
  archiveTask: (taskId: string) => Promise<void>;
  restoreTask: (taskId: string) => Promise<void>;
  importTasks: (tasks: Task[], options?: ImportOptions) => Promise<void>;
  isTaskCompleted: (task: Task, date?: Date) => boolean;
  getCompletionCount: (task: Task, date?: Date) => number;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const useTaskContext = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTaskContext must be used within a TaskProvider');
  }
  return context;
};

const withUpdatedStats = (task: Task): Task => ({
  ...task,
  updatedAt: new Date().toISOString(),
  stats: calculateTaskStats(task, task.completions || []),
});

export const TaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [lastImport, setLastImport] = useState<LastImportRecord | null>(null);
  const [completionCache, setCompletionCache] = useState<Map<string, Map<string, number>>>(new Map());

  // Update completion cache when tasks change
  useEffect(() => {
    const newCache = new Map<string, Map<string, number>>();
    tasks.forEach(task => {
      if (task.completions) {
        const counts = new Map(task.completions.map(c => [c.date, c.timesCompleted]));
        newCache.set(task.id, counts);
      }
    });
    setCompletionCache(newCache);
  }, [tasks]);

  // Load tasks and calculate initial stats
  useEffect(() => {
    loadTasks();
    loadLastImport();
  }, []);

  const loadTasks = async () => {
    try {
      const storedTasks = await AsyncStorage.getItem('tasks');
      if (storedTasks) {
        const loadedTasks: Task[] = JSON.parse(storedTasks);
        const tasksWithStats = loadedTasks.map(task => ({
          ...task,
          stats: calculateTaskStats(task, task.completions || []),
        }));
        setTasks(tasksWithStats);
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const loadLastImport = async () => {
    try {
      const stored = await AsyncStorage.getItem('lastImport');
      if (stored) setLastImport(JSON.parse(stored));
    } catch (error) {
      console.error('Error loading last import record:', error);
    }
  };

  // Check for day change and update stats
  useEffect(() => {
    let lastDate = format(new Date(), 'yyyy-MM-dd');
    const interval = setInterval(() => {
      const currentDate = format(new Date(), 'yyyy-MM-dd');
      if (currentDate !== lastDate) {
        lastDate = currentDate;
        setTasks(prev => prev.map(task => ({
          ...task,
          stats: calculateTaskStats(task, task.completions || []),
        })));
      }
    }, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  // Every mutator below builds its next array from `prev`, not the `tasks` closure -- a
  // mutator's own closure can go stale by the time it actually runs (e.g. a toast's "Undo"
  // action, captured once and invoked later, after further renders). Reading the outer `tasks`
  // variable in that case would operate on a snapshot from before the original action even
  // landed. `setTasks`'s updater always receives the true latest state, so building each next
  // array there instead sidesteps that class of bug entirely.
  const saveTasks = async (updater: Task[] | ((prev: Task[]) => Task[])) => {
    let next: Task[] = [];
    setTasks(prev => {
      next = typeof updater === 'function' ? updater(prev) : updater;
      return next;
    });
    try {
      await AsyncStorage.setItem('tasks', JSON.stringify(next));
    } catch (error) {
      console.error('Error saving tasks:', error);
    }
  };

  const addTask = async (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newTask: Task = {
      ...taskData,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completions: [],
      stats: calculateTaskStats(taskData, []),
    };
    await saveTasks(prev => [...prev, newTask]);
  };

  const updateTask = async (task: Task) => {
    const updatedTask = withUpdatedStats(task);
    await saveTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
  };

  const deleteTask = async (taskId: string) => {
    await saveTasks(prev => prev.filter(t => t.id !== taskId));
  };

  // Re-inserts an already-deleted task exactly as it was (same id/completions/stats), for the
  // "Undo" action on a delete toast. Not a general-purpose restore -- appends to the end since
  // original list position isn't preserved.
  const restoreDeletedTask = async (task: Task) => {
    await saveTasks(prev => [...prev, task]);
  };

  const completeTask = async (taskId: string, date: Date = new Date()) => {
    const dateString = format(date, 'yyyy-MM-dd');
    await saveTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task;

      const existing = (task.completions || []).find(c => c.date === dateString);
      const newCompletions: TaskCompletion[] = existing
        ? (task.completions || []).map(c =>
            c.date === dateString
              ? { ...c, timesCompleted: c.timesCompleted + 1, completedAt: new Date().toISOString() }
              : c
          )
        : [
            ...(task.completions || []),
            {
              id: Date.now().toString(),
              taskId,
              date: dateString,
              completedAt: new Date().toISOString(),
              timesCompleted: 1,
            },
          ];

      return withUpdatedStats({ ...task, completions: newCompletions });
    }));
  };

  const uncompleteTask = async (taskId: string, date: Date) => {
    const dateString = format(date, 'yyyy-MM-dd');
    await saveTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task;
      const newCompletions = (task.completions || []).filter(c => c.date !== dateString);
      return withUpdatedStats({ ...task, completions: newCompletions });
    }));
  };

  // Reverses exactly one completeTask press -- decrements today's count rather than clearing
  // the whole day, so undoing a single accidental tap on a multi-rep task doesn't also wipe out
  // reps logged earlier that day. (uncompleteTask, used by the calendar's tap-to-clear-a-day,
  // intentionally clears the whole day instead.)
  const undoCompleteTask = async (taskId: string, date: Date = new Date()) => {
    const dateString = format(date, 'yyyy-MM-dd');
    await saveTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task;

      const existing = (task.completions || []).find(c => c.date === dateString);
      if (!existing) return task;

      const newCompletions = existing.timesCompleted > 1
        ? (task.completions || []).map(c =>
            c.date === dateString ? { ...c, timesCompleted: c.timesCompleted - 1 } : c
          )
        : (task.completions || []).filter(c => c.date !== dateString);

      return withUpdatedStats({ ...task, completions: newCompletions });
    }));
  };

  // Re-inserts an exact completion record for the "Undo" action on the calendar's clear-a-day
  // toast. Not just re-running completeTask -- uncompleteTask wipes the whole day, which for a
  // multi-rep task can mean losing a `timesCompleted` > 1, so Undo needs to restore that exact
  // count rather than just adding one rep back.
  const restoreCompletion = async (taskId: string, completion: TaskCompletion) => {
    await saveTasks(prev => prev.map(task => {
      if (task.id !== taskId) return task;
      const withoutDate = (task.completions || []).filter(c => c.date !== completion.date);
      return withUpdatedStats({ ...task, completions: [...withoutDate, completion] });
    }));
  };

  const archiveTask = async (taskId: string) => {
    await saveTasks(prev => prev.map(task => task.id === taskId ? withUpdatedStats({ ...task, archived: true }) : task));
  };

  const restoreTask = async (taskId: string) => {
    await saveTasks(prev => prev.map(task => task.id === taskId ? withUpdatedStats({ ...task, archived: false }) : task));
  };

  const importTasks = async (importedTasks: Task[], options: ImportOptions = {}) => {
    const mode = options.mode ?? 'replace';
    await saveTasks(prev => {
      const nextTasks = mode === 'merge' ? mergeTaskLists(prev, importedTasks) : importedTasks;
      return nextTasks.map(task => ({
        ...task,
        stats: calculateTaskStats(task, task.completions || []),
      }));
    });

    if (options.exportMeta) {
      const record: LastImportRecord = { exportId: options.exportMeta.exportId, importedAt: new Date().toISOString() };
      setLastImport(record);
      await AsyncStorage.setItem('lastImport', JSON.stringify(record));
    }
  };

  const getCount = (task: Task, date: Date = new Date()) => {
    const dateString = format(date, 'yyyy-MM-dd');
    return completionCache.get(task.id)?.get(dateString) ?? 0;
  };

  const isCompleted = (task: Task, date: Date = new Date()) => {
    return getCount(task, date) >= (task.timesPerDay || 1);
  };

  return (
    <TaskContext.Provider
      value={{
        tasks,
        isLoaded,
        lastImport,
        addTask,
        updateTask,
        deleteTask,
        restoreDeletedTask,
        completeTask,
        uncompleteTask,
        undoCompleteTask,
        restoreCompletion,
        archiveTask,
        restoreTask,
        importTasks,
        isTaskCompleted: isCompleted,
        getCompletionCount: getCount,
      }}
    >
      {children}
    </TaskContext.Provider>
  );
};
