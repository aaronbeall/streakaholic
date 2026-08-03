import { addDays, addMonths, differenceInDays, endOfMonth, endOfWeek, format, parseISO, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { FrequencyType, StreakStatus, TaskCompletion, TaskStats } from '../types';

export interface StreakScheduleInfo {
  frequency: FrequencyType;
  daysOfWeek: number[];
  daysPerWeek: number;
  daysPerMonth: number;
  timesPerDay: number;
}

const emptyStats: TaskStats = {
  currentStreak: 0,
  lastStreak: 0,
  bestStreak: 0,
  totalCompletions: 0,
  completionRate: 0,
  streakStatus: 'never_started',
};

// A streak is always measured in days. `weights` lets a single flag stand in for more than
// one day -- e.g. a week/month period whose quota was met contributes however many distinct
// days were actually logged in it, not just "1 period". For daily/specific-days-of-week,
// every flag is worth exactly 1 day, so these behave as plain day counts.
const longestRun = (flags: boolean[], weights: number[]): number => {
  let best = 0;
  let run = 0;
  for (let i = 0; i < flags.length; i++) {
    run = flags[i] ? run + weights[i] : 0;
    best = Math.max(best, run);
  }
  return best;
};

const trailingRun = (flags: boolean[], weights: number[]): number => {
  let run = 0;
  for (let i = flags.length - 1; i >= 0; i--) {
    if (!flags[i]) break;
    run += weights[i];
  }
  return run;
};

// Day-sum of the most recently completed run, skipping over any trailing misses first.
const mostRecentCompletedRun = (flags: boolean[], weights: number[]): number => {
  let i = flags.length - 1;
  while (i >= 0 && !flags[i]) i--;
  let run = 0;
  while (i >= 0 && flags[i]) {
    run += weights[i];
    i--;
  }
  return run;
};

const ones = (length: number): number[] => Array(length).fill(1);

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
  const weights = ones(settledFlags.length);

  const bestStreak = longestRun(settledFlags, weights);
  const trailing = trailingRun(settledFlags, weights);
  const lastStreak = trailing > 0 ? trailing : mostRecentCompletedRun(settledFlags, weights);

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

// For 'days_per_week' / 'days_per_month': frequency only decides whether a period counts as
// "on schedule" (its quota was met) -- the streak itself is still a day count, not a period
// count. A met period contributes however many distinct qualifying days actually landed in
// it. An unmet *elapsed* period breaks the chain; the in-progress current period never
// "fails" until it's actually over, so its days-so-far always extend an intact chain (and
// reaching quota mid-period already counts, without waiting for the period to end).
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
  const dayCounts = periods.map(p => p.count);
  const bestStreak = longestRun(flags, dayCounts);

  const currentPeriodMet = flags[flags.length - 1];
  const currentPeriodDays = dayCounts[dayCounts.length - 1];
  const priorFlags = flags.slice(0, -1);
  const priorDayCounts = dayCounts.slice(0, -1);
  const priorTrailingDays = trailingRun(priorFlags, priorDayCounts);
  const priorChainIntact = priorFlags.length === 0 || priorTrailingDays > 0;

  let streakStatus: StreakStatus;
  let currentStreak: number;
  let lastStreak: number;

  if (currentPeriodMet) {
    currentStreak = priorChainIntact ? priorTrailingDays + currentPeriodDays : currentPeriodDays;
    lastStreak = currentStreak;
    streakStatus = 'up_to_date';
  } else if (priorChainIntact) {
    // Not yet met this period, but the prior chain hasn't failed -- still time to add to it.
    currentStreak = priorTrailingDays + currentPeriodDays;
    lastStreak = currentStreak;
    streakStatus = 'expiring';
  } else {
    // The most recent elapsed period missed its quota -- chain broken. Any days already
    // logged this period are a fresh mini-streak forming, not a continuation.
    currentStreak = currentPeriodDays;
    const priorRun = mostRecentCompletedRun(priorFlags, priorDayCounts);
    lastStreak = currentStreak > 0 ? currentStreak : priorRun;
    streakStatus = currentStreak > 0 ? 'expiring' : (priorRun > 0 ? 'expired' : 'never_started');
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
  // A day only "counts" once it's hit the task's timesPerDay quota -- a completion record
  // that's only partially filled in (e.g. 2 of 8 reps) shouldn't count as a done day yet.
  const requiredTimes = Math.max(1, task.timesPerDay || 1);
  const qualifyingCompletions = completions.filter(c => c.timesCompleted >= requiredTimes);

  if (qualifyingCompletions.length === 0) return emptyStats;

  switch (task.frequency) {
    case 'days_per_week':
      return calculateQuotaStats(task, qualifyingCompletions, 'week', task.daysPerWeek);
    case 'days_per_month':
      return calculateQuotaStats(task, qualifyingCompletions, 'month', task.daysPerMonth);
    case 'daily':
    case 'specific_days_of_week':
    default:
      return calculateDueDayStats(task, qualifyingCompletions);
  }
};
