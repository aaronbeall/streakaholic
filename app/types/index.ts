import { MaterialCommunityIcons } from '@expo/vector-icons';

export type MaterialCommunityIconName = keyof typeof MaterialCommunityIcons.glyphMap;

export type FrequencyType = 'daily' | 'specific_days_of_week' | 'days_per_week' | 'days_per_month';

export interface Task {
  id: string;
  name: string;
  icon: MaterialCommunityIconName;
  color: string;
  frequency: FrequencyType;
  daysOfWeek: number[];
  daysPerWeek: number;
  daysPerMonth: number;
  timesPerDay: number;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  stats?: TaskStats;
  completions?: TaskCompletion[];
}

export interface TaskCompletion {
  id: string;
  taskId: string;
  date: string; // Ex. "2025-06-01"
  completedAt: string; // ISO string based on when the task was marked completed (which may not be on the specified date!)
  timesCompleted: number;
}

export type StreakStatus = 'up_to_date' | 'expiring' | 'expired' | 'never_started';

export interface TaskStats {
  currentStreak: number;
  lastStreak: number;
  bestStreak: number;
  totalCompletions: number;
  completionRate: number;
  streakStatus: StreakStatus;
}

export interface TaskWithStats extends Task {
  stats: TaskStats;
  completions: TaskCompletion[];
}

export interface TasksExport {
  schemaVersion: number;
  exportId: string;
  exportedAt: string;
  appVersion: string;
  taskCount: number;
  tasks: Task[];
}

export type RootStackParamList = {
  Home: undefined;
  AddTask: undefined;
  TaskDetails: { taskId: string };
}; 