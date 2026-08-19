import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export type MaterialCommunityIconName = keyof typeof MaterialCommunityIcons.glyphMap;

export type FrequencyType = 'daily' | 'specific_days_of_week' | 'days_per_week' | 'days_per_month';

// 0=off, 1=one dismissible notification, 2=repeated dismissible notifications, 3=ongoing
// (non-dismissable) notification, 4=alarm-style + ongoing -- see app/utils/notifications.ts.
export type NotificationLevel = 0 | 1 | 2 | 3 | 4;

export interface TaskNotificationSettings {
  level: NotificationLevel;
  time: string; // "HH:mm", 24-hour, local time
  // Level 2 ("Repeat") only -- minutes between follow-up nags. Optional so older/level<2 tasks
  // don't need it; defaults to DEFAULT_NAG_INTERVAL_MINUTES (app/utils/notifications.ts) when unset.
  nagIntervalMinutes?: number;
}

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
  // Optional -- absent means level 0/off. Pre-existing tasks created before this feature shipped
  // are never silently upgraded; only newly-created tasks default to a nonzero level (see
  // AddTaskScreen's creation path).
  notifications?: TaskNotificationSettings;
  // Dates ("yyyy-MM-dd") the user explicitly marked as a one-off pass -- vacations, sickness,
  // etc. Only meaningful for `daily`/`specific_days_of_week` habits (see isDueOnDate in
  // streaks.ts, the sole place this is consulted); quota habits (days_per_week/days_per_month)
  // don't support this at all, per explicit user direction -- there's no clean way to "skip" a
  // day within a period-based quota the way there is for a genuine per-day due/not-due gate, so
  // this is deliberately out of scope there rather than half-solved. A skipped date is treated
  // exactly like a day that was never due in the first place -- it doesn't break a streak,
  // doesn't add a completion, and isn't visually distinguished from an ordinary non-due day (the
  // existing "pass-through" calendar treatment already covers it correctly).
  skippedDates?: string[];
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
