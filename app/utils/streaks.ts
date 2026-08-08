import { addDays, addMonths, differenceInCalendarDays, differenceInDays, endOfMonth, endOfWeek, format, parseISO, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { FrequencyType, MaterialCommunityIconName, StreakStatus, Task, TaskCompletion, TaskStats } from '../types';

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
const trailingRun = (flags: boolean[], weights: number[]): number => {
  let run = 0;
  for (let i = flags.length - 1; i >= 0; i--) {
    if (!flags[i]) break;
    run += weights[i];
  }
  return run;
};

// Quota periods (days_per_week/days_per_month) need a different kind of "run" than due-days.
// A missed due-day has zero real completions, so it correctly contributes nothing. But a
// *failed* quota period (under quota) still had real qualifying days happen in it -- frequency
// only decides whether that period *links forward* into the next one, not whether its own
// days count at all. So the period that finally breaks the chain still contributes its full
// day count to the run that's ending; only the period *after* it starts over.

// Longest run where every period's days count, including the one that closes it out.
const longestRunIncludingClose = (flags: boolean[], weights: number[]): number => {
  let best = 0;
  let run = 0;
  for (let i = 0; i < flags.length; i++) {
    run += weights[i];
    best = Math.max(best, run);
    if (!flags[i]) run = 0;
  }
  return best;
};

// Day-total of the most recently closed (or still-open) run, including its closing period's
// own days even when that period is the one that failed to meet quota.
const mostRecentRunIncludingClose = (flags: boolean[], weights: number[]): number => {
  if (flags.length === 0) return 0;
  let total = weights[weights.length - 1];
  let i = flags.length - 2;
  while (i >= 0 && flags[i]) {
    total += weights[i];
    i--;
  }
  return total;
};

export const isDueOnDate = (task: StreakScheduleInfo, date: Date): boolean => {
  if (task.frequency === 'specific_days_of_week') {
    // Treat "no days selected" as always-due rather than never-due, so a misconfigured
    // task doesn't silently look like it has no schedule at all.
    if (!task.daysOfWeek || task.daysOfWeek.length === 0) return true;
    return task.daysOfWeek.includes(date.getDay());
  }
  return true;
};

// For 'daily' and 'specific_days_of_week': a streak only *breaks* on a missed due day, but every
// day completed -- due or not -- adds to the running count. Walk every calendar day (not just
// due days) from firstDate to today, grouping them into segments that each end at a due-day
// "gate": hitting the gate links the whole segment's day-count (due AND non-due days completed
// within it) into the streak; missing it breaks the chain going forward. For 'daily', every day
// is its own due day, so every segment is exactly one day -- this degenerates to the old
// per-due-day behavior with no non-due days to add.
const calculateDueDayStats = (task: StreakScheduleInfo, completions: TaskCompletion[]): TaskStats => {
  const completedDates = new Set(completions.map(c => c.date));
  const sortedDates = Array.from(completedDates).sort();
  const firstDate = startOfDay(parseISO(sortedDates[0]));
  const today = startOfDay(new Date());
  const todayStr = format(today, 'yyyy-MM-dd');
  const todayIsDue = isDueOnDate(task, today);
  const todayCompleted = completedDates.has(todayStr);

  // A due day that's today and not yet completed isn't a miss yet -- there's still time left in
  // the day -- so it (and any non-due days after the last settled gate) is held back as a
  // separate "pending" segment rather than settled into `settledFlags`/`settledWeights`.
  const settledFlags: boolean[] = [];
  const settledWeights: number[] = [];
  let pendingDays: string[] = [];

  let cursor = firstDate;
  while (cursor <= today) {
    const dateStr = format(cursor, 'yyyy-MM-dd');
    pendingDays.push(dateStr);

    const isDue = isDueOnDate(task, cursor);
    const isUnsettledToday = dateStr === todayStr && isDue && !todayCompleted;

    if (isDue && !isUnsettledToday) {
      settledWeights.push(pendingDays.filter(d => completedDates.has(d)).length);
      settledFlags.push(completedDates.has(dateStr));
      pendingDays = [];
    }

    cursor = addDays(cursor, 1);
  }

  const priorTrailing = trailingRun(settledFlags, settledWeights);
  const priorChainIntact = settledFlags.length === 0 || priorTrailing > 0;
  const pendingCount = pendingDays.filter(d => completedDates.has(d)).length;
  const isPending = pendingDays.length > 0;
  const openStreak = priorChainIntact ? priorTrailing + pendingCount : pendingCount;
  // "IncludingClose" (not the strict/prior-chain-only trailingRun above): a segment that ends in
  // a missed due day still contributed its own non-due bonus days before the miss, and those
  // should remain part of the run that's ending -- only the *next* segment starts fresh. This is
  // purely about how far back the ENDING run's own tally reaches; it never lets the streak that's
  // currently building extend past a miss (priorTrailing/priorChainIntact above are unaffected).
  const lastClosedRun = mostRecentRunIncludingClose(settledFlags, settledWeights);

  let streakStatus: StreakStatus;
  let currentStreak: number;
  let lastStreak: number;

  if (isPending && todayIsDue && !todayCompleted) {
    // Today is due and not yet completed -- not a miss yet, but not settled as "up to date" either.
    if (openStreak > 0) {
      streakStatus = 'expiring';
      currentStreak = openStreak;
      lastStreak = openStreak;
    } else {
      currentStreak = 0;
      lastStreak = lastClosedRun;
      streakStatus = lastClosedRun > 0 ? 'expired' : 'never_started';
    }
  } else {
    // Either fully settled through today, or today isn't a due day -- nothing outstanding.
    currentStreak = isPending ? openStreak : priorTrailing;
    if (currentStreak > 0) {
      streakStatus = 'up_to_date';
      lastStreak = currentStreak;
    } else {
      lastStreak = lastClosedRun;
      streakStatus = lastClosedRun > 0 ? 'expired' : 'never_started';
    }
  }

  const bestStreak = Math.max(longestRunIncludingClose(settledFlags, settledWeights), currentStreak);
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

export type QuotaUnit = 'week' | 'month';

export const getPeriodBounds = (date: Date, unit: QuotaUnit) =>
  unit === 'month'
    ? { start: startOfMonth(date), end: endOfMonth(date) }
    : { start: startOfWeek(date), end: endOfWeek(date) };

export const nextPeriodStart = (start: Date, unit: QuotaUnit) =>
  unit === 'month' ? startOfMonth(addMonths(start, 1)) : addDays(start, 7);

// For 'days_per_week' / 'days_per_month': frequency only decides whether days *link* across
// a period boundary into the next period -- it never decides whether a day counts at all.
// A met period's days link forward, extending the streak into the next period. An unmet
// (failed) *elapsed* period still contributes its own real days to the streak that's ending,
// it just doesn't link forward -- the *next* period starts fresh. The in-progress current
// period hasn't closed yet, so its days-so-far are always provisionally included in whatever
// streak is currently open, win or lose, until it actually closes.
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
  const bestStreak = longestRunIncludingClose(flags, dayCounts);

  const currentPeriodMet = flags[flags.length - 1];
  const currentPeriodDays = dayCounts[dayCounts.length - 1];
  const priorFlags = flags.slice(0, -1);
  const priorDayCounts = dayCounts.slice(0, -1);
  const priorTrailingDays = trailingRun(priorFlags, priorDayCounts);
  const priorChainIntact = priorFlags.length === 0 || priorTrailingDays > 0;
  const currentStreak = priorChainIntact ? priorTrailingDays + currentPeriodDays : currentPeriodDays;

  let streakStatus: StreakStatus;
  let lastStreak: number;

  if (currentPeriodMet) {
    lastStreak = currentStreak;
    streakStatus = 'up_to_date';
  } else {
    // Not yet met this period -- but that alone isn't urgent. Only flag it 'expiring' once
    // every remaining day of the period, including today if today's own chance hasn't been
    // used yet, would be *required* to still reach quota (e.g. needing 1 more day only turns
    // urgent on the period's very last day; needing 3 more turns urgent once only 3 days
    // remain). Plenty of slack left just means 'up_to_date', even short of quota so far.
    const todayStr = format(today, 'yyyy-MM-dd');
    const todayAlreadyCounted = distinctDates.includes(todayStr);
    const periodEnd = getPeriodBounds(today, unit).end;
    const daysRemainingInclusiveOfToday = differenceInCalendarDays(periodEnd, today) + 1;
    const remainingOpportunities = todayAlreadyCounted
      ? daysRemainingInclusiveOfToday - 1
      : daysRemainingInclusiveOfToday;
    const stillNeeded = safeQuota - currentPeriodDays;
    const isTight = remainingOpportunities <= stillNeeded;

    if (currentStreak > 0 && isTight) {
      streakStatus = 'expiring';
      lastStreak = currentStreak;
    } else if (currentStreak > 0) {
      streakStatus = 'up_to_date';
      lastStreak = currentStreak;
    } else {
      const closedRun = mostRecentRunIncludingClose(priorFlags, priorDayCounts);
      lastStreak = closedRun;
      streakStatus = closedRun > 0 ? 'expired' : 'never_started';
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

// Pure, cache-free reads straight off the task's own `completions` array -- moved here from
// TaskContext's old `completionCache` (a Map rebuilt via a useEffect keyed on `tasks`, which
// lagged one render behind `tasks` itself right after a mutation, a real staleness window, not
// just a perf cost). A `.find()` over one task's own completions is O(its completion count),
// which for a personal habit tracker (months/years of daily entries) is trivial -- not worth a
// cache that can go stale.
export const getCompletionCount = (task: Task, date: Date = new Date()): number => {
  const dateString = format(date, 'yyyy-MM-dd');
  return task.completions?.find(c => c.date === dateString)?.timesCompleted ?? 0;
};

export const isTaskCompleted = (task: Task, date: Date = new Date()): boolean => {
  return getCompletionCount(task, date) >= (task.timesPerDay || 1);
};

// For a single one-off lookup (e.g. "is this task completed today?"), `getCompletionCount`'s own
// `.find()` is the right tool -- O(that task's completion count), trivial for one call. But a
// calendar grid calls it once *per visible cell* for the *same* task (e.g. every day in a month,
// or every visible column in an infinite timeline) -- that's O(cells x completions) of repeated
// linear scans over the exact same array, and since completions are appended in chronological
// order while these grids show the most *recent* days first, the common case is close to a
// worst-case full-array scan on every single cell. Building this map once per task (keyed on that
// task's own `completions` reference via the caller's `useMemo`) turns the whole grid into one
// O(completions) pass up front plus O(1) lookups per cell after that.
export const buildCompletionCountsByDate = (completions: TaskCompletion[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (const completion of completions) {
    map.set(completion.date, completion.timesCompleted);
  }
  return map;
};

export interface StreakBadgeStyle {
  // Named `color`, not `backgroundColor` -- used both as a badge pill's background (`TaskCard`'s
  // front face) and as an icon/text tint (`CardStats`'s stats face), so a background-specific name
  // would be misleading in the second context.
  color: string;
  icon: MaterialCommunityIconName;
  value: number;
  showTrophy: boolean;
}

// Derives the same current-streak-status → icon/color mapping the home-screen badge uses, so any
// other place that wants to visually echo "what state is this streak in" (e.g. `CardStats`'s own
// streak number) stays in sync with the badge by construction instead of duplicating the mapping.
export const getStreakBadgeStyle = (task: Task): StreakBadgeStyle | null => {
  const currentStreak = task.stats?.currentStreak || 0;
  const lastStreak = task.stats?.lastStreak || 0;
  const bestStreak = task.stats?.bestStreak || 0;
  const streakStatus = task.stats?.streakStatus;

  if (!streakStatus || streakStatus === 'never_started') {
    return null;
  }

  if (currentStreak > 0) {
    if (streakStatus === 'up_to_date') {
      return {
        color: '#FF6B6B',
        icon: 'fire',
        value: currentStreak,
        showTrophy: currentStreak === bestStreak
      };
    }
    return {
      color: '#FFA726',
      icon: 'clock-outline',
      value: currentStreak,
      showTrophy: currentStreak === bestStreak
    };
  }

  if (lastStreak > 0) {
    return {
      color: '#90A4AE',
      icon: 'sleep',
      value: lastStreak,
      showTrophy: false
    };
  }

  return null;
};
