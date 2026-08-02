import { addDays, addMonths, differenceInDays, endOfMonth, endOfWeek, format, parseISO, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { FrequencyType, StreakStatus, TaskCompletion, TaskStats } from '../types';

export interface StreakScheduleInfo {
  frequency: FrequencyType;
  daysOfWeek: number[];
  daysPerWeek: number;
  daysPerMonth: number;
}

const emptyStats: TaskStats = {
  currentStreak: 0,
  lastStreak: 0,
  bestStreak: 0,
  totalCompletions: 0,
  completionRate: 0,
  streakStatus: 'never_started',
};

const longestRun = (flags: boolean[]): number => {
  let best = 0;
  let run = 0;
  for (const flag of flags) {
    run = flag ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
};

const trailingRun = (flags: boolean[]): number => {
  let run = 0;
  for (let i = flags.length - 1; i >= 0; i--) {
    if (!flags[i]) break;
    run++;
  }
  return run;
};

// Length of the most recently completed run, skipping over any trailing misses first.
const mostRecentCompletedRun = (flags: boolean[]): number => {
  let i = flags.length - 1;
  while (i >= 0 && !flags[i]) i--;
  let run = 0;
  while (i >= 0 && flags[i]) {
    run++;
    i--;
  }
  return run;
};

const isDueOnDate = (task: StreakScheduleInfo, date: Date): boolean => {
  if (task.frequency === 'specific_days_of_week') {
    // Treat "no days selected" as always-due rather than never-due, so a misconfigured
    // task doesn't silently look like it has no schedule at all.
    if (!task.daysOfWeek || task.daysOfWeek.length === 0) return true;
    return task.daysOfWeek.includes(date.getDay());
  }
  return true;
};

const buildDueDates = (task: StreakScheduleInfo, from: Date, to: Date): string[] => {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    if (isDueOnDate(task, cursor)) dates.push(format(cursor, 'yyyy-MM-dd'));
    cursor = addDays(cursor, 1);
  }
  return dates;
};

// For 'daily' and 'specific_days_of_week': a streak only breaks on a missed *due* day.
// Non-due days are skipped entirely rather than counting as a break.
const calculateDueDayStats = (task: StreakScheduleInfo, completions: TaskCompletion[]): TaskStats => {
  const completedDates = new Set(completions.map(c => c.date));
  const sortedDates = Array.from(completedDates).sort();
  const firstDate = startOfDay(parseISO(sortedDates[0]));
  const today = startOfDay(new Date());
  const todayStr = format(today, 'yyyy-MM-dd');

  const dueDates = buildDueDates(task, firstDate, today);
  const todayIsDue = isDueOnDate(task, today);
  const todayCompleted = completedDates.has(todayStr);

  // A due day that's today and not yet completed isn't a miss yet -- exclude it from
  // the "settled" history used to detect breaks.
  const settledDueDates = todayIsDue && !todayCompleted ? dueDates.slice(0, -1) : dueDates;
  const settledFlags = settledDueDates.map(d => completedDates.has(d));

  const bestStreak = longestRun(settledFlags);
  const trailing = trailingRun(settledFlags);
  const lastStreak = trailing > 0 ? trailing : mostRecentCompletedRun(settledFlags);

  let streakStatus: StreakStatus;
  let currentStreak: number;

  if (todayIsDue && !todayCompleted) {
    if (trailing > 0) {
      streakStatus = 'expiring';
      currentStreak = trailing;
    } else {
      streakStatus = lastStreak > 0 ? 'expired' : 'never_started';
      currentStreak = 0;
    }
  } else if (trailing > 0) {
    streakStatus = 'up_to_date';
    currentStreak = trailing;
  } else {
    streakStatus = lastStreak > 0 ? 'expired' : 'never_started';
    currentStreak = 0;
  }

  const totalDays = differenceInDays(today, firstDate) + 1;
  const completionRate = totalDays > 0 ? completions.length / totalDays : 0;

  return {
    currentStreak,
    lastStreak,
    bestStreak,
    totalCompletions: completions.length,
    completionRate,
    streakStatus,
  };
};

type QuotaUnit = 'week' | 'month';

const getPeriodBounds = (date: Date, unit: QuotaUnit) =>
  unit === 'month'
    ? { start: startOfMonth(date), end: endOfMonth(date) }
    : { start: startOfWeek(date), end: endOfWeek(date) };

const nextPeriodStart = (start: Date, unit: QuotaUnit) =>
  unit === 'month' ? startOfMonth(addMonths(start, 1)) : addDays(start, 7);

// For 'days_per_week' / 'days_per_month': the streak unit is the period (week/month), not
// the day. A period counts as "met" once enough distinct days are completed within it --
// reaching the quota early in an in-progress period already counts toward the streak.
const calculateQuotaStats = (task: StreakScheduleInfo, completions: TaskCompletion[], unit: QuotaUnit, quota: number): TaskStats => {
  const safeQuota = Math.max(1, quota || 1);
  const distinctDates = Array.from(new Set(completions.map(c => c.date))).sort();
  const firstDate = parseISO(distinctDates[0]);
  const today = startOfDay(new Date());

  const periods: { count: number; met: boolean }[] = [];
  let cursor = getPeriodBounds(firstDate, unit).start;
  const lastStart = getPeriodBounds(today, unit).start;
  while (cursor <= lastStart) {
    const { start, end } = getPeriodBounds(cursor, unit);
    const count = distinctDates.filter(d => {
      const dt = parseISO(d);
      return dt >= start && dt <= end;
    }).length;
    periods.push({ count, met: count >= safeQuota });
    cursor = nextPeriodStart(start, unit);
  }

  const flags = periods.map(p => p.met);
  const bestStreak = longestRun(flags);
  const currentPeriodMet = flags[flags.length - 1];

  let streakStatus: StreakStatus;
  let currentStreak: number;
  let lastStreak: number;

  if (currentPeriodMet) {
    currentStreak = trailingRun(flags);
    lastStreak = currentStreak;
    streakStatus = 'up_to_date';
  } else {
    const priorTrailing = trailingRun(flags.slice(0, -1));
    if (priorTrailing > 0) {
      currentStreak = priorTrailing;
      lastStreak = priorTrailing;
      streakStatus = 'expiring';
    } else {
      currentStreak = 0;
      lastStreak = mostRecentCompletedRun(flags.slice(0, -1));
      streakStatus = lastStreak > 0 ? 'expired' : 'never_started';
    }
  }

  const totalDays = differenceInDays(today, firstDate) + 1;
  const completionRate = totalDays > 0 ? completions.length / totalDays : 0;

  return {
    currentStreak,
    lastStreak,
    bestStreak,
    totalCompletions: completions.length,
    completionRate,
    streakStatus,
  };
};

export const calculateTaskStats = (task: StreakScheduleInfo, completions: TaskCompletion[]): TaskStats => {
  if (completions.length === 0) return emptyStats;

  switch (task.frequency) {
    case 'days_per_week':
      return calculateQuotaStats(task, completions, 'week', task.daysPerWeek);
    case 'days_per_month':
      return calculateQuotaStats(task, completions, 'month', task.daysPerMonth);
    case 'daily':
    case 'specific_days_of_week':
    default:
      return calculateDueDayStats(task, completions);
  }
};
