import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Task, TaskCompletion } from '../types';
import { calculateTaskStats } from '../utils/streaks';

interface TaskContextType {
  tasks: Task[];
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateTask: (task: Task) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  completeTask: (taskId: string, date?: Date) => Promise<void>;
  uncompleteTask: (taskId: string, date: Date) => Promise<void>;
  archiveTask: (taskId: string) => Promise<void>;
  restoreTask: (taskId: string) => Promise<void>;
  importTasks: (tasks: Task[]) => Promise<void>;
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

export const TaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
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
    }
  };

  // Check for day change and update stats
  useEffect(() => {
    let lastDate = format(new Date(), 'yyyy-MM-dd');
    const interval = setInterval(() => {
      const currentDate = format(new Date(), 'yyyy-MM-dd');
      if (currentDate !== lastDate) {
        lastDate = currentDate;
        const updatedTasks = tasks.map(task => ({
          ...task,
          stats: calculateTaskStats(task, task.completions || []),
        }));
        setTasks(updatedTasks);
      }
    }, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [tasks]);

  const saveTasks = async (updatedTasks: Task[]) => {
    try {
      setTasks(updatedTasks);
      await AsyncStorage.setItem('tasks', JSON.stringify(updatedTasks));
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
    await saveTasks([...tasks, newTask]);
  };

  const updateTask = async (task: Task) => {
    const updatedTask = {
      ...task,
      updatedAt: new Date().toISOString(),
      stats: calculateTaskStats(task, task.completions || []),
    };
    const updatedTasks = tasks.map(t => 
      t.id === task.id ? updatedTask : t
    );
    await saveTasks(updatedTasks);
  };

  const deleteTask = async (taskId: string) => {
    const updatedTasks = tasks.filter(t => t.id !== taskId);
    await saveTasks(updatedTasks);
  };

  const completeTask = async (taskId: string, date: Date = new Date()) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const dateString = format(date, 'yyyy-MM-dd');
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

    const updatedTask = {
      ...task,
      completions: newCompletions,
    };
    await updateTask(updatedTask);
  };

  const uncompleteTask = async (taskId: string, date: Date) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const dateString = format(date, 'yyyy-MM-dd');
    const newCompletions = (task.completions || []).filter(
      completion => completion.date !== dateString
    );
    const updatedTask = {
      ...task,
      completions: newCompletions,
    };
    await updateTask(updatedTask);
  };

  const archiveTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    await updateTask({ ...task, archived: true });
  };

  const restoreTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    await updateTask({ ...task, archived: false });
  };

  const importTasks = async (importedTasks: Task[]) => {
    const tasksWithStats = importedTasks.map(task => ({
      ...task,
      stats: calculateTaskStats(task, task.completions || []),
    }));
    await saveTasks(tasksWithStats);
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
        addTask,
        updateTask,
        deleteTask,
        completeTask,
        uncompleteTask,
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