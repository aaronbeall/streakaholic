import { addDays, addMonths, differenceInCalendarDays, differenceInDays, endOfMonth, endOfWeek, format, parseISO, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { FrequencyType, MaterialCommunityIconName, StreakStatus, Task, TaskCompletion, TaskStats } from '../types';

export interface StreakScheduleInfo {
  frequency: FrequencyType;
  daysOfWeek: number[];
  daysPerWeek: number;
  daysPerMonth: number;
  timesPerDay: number;
  // See Task.skippedDates' own comment (types/index.ts) -- optional so every existing caller
  // that builds a synthetic StreakScheduleInfo without it (tests, etc.) is unaffected.
  skippedDates?: string[];
}

// The minimal shape isScheduledOnDate/isDueOnDate actually read -- StreakScheduleInfo satisfies
// this structurally (it's a strict superset), and so does periodStats.ts's own narrower
// PeriodQuotaSchedule, letting that file share this one due-day predicate (and so correctly
// exclude a skipped day from its own period totals) without widening to carry timesPerDay, a
// field neither function touches.
export interface DueDaySchedule {
  frequency: FrequencyType;
  daysOfWeek: number[];
  skippedDates?: string[];
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

// Day-total of the most recently closed (or still-open) run, including its closing period's own
// days even when that period is the one that failed to meet quota -- but not any *later*, separate
// failed periods past that close. Walks back past trailing failures first to find where a real run
// last existed, rather than starting the sum at the very last period: starting there meant a
// second failure settling in behind the closing one collapsed this to 0 (the true run it should
// still remember fell out of the sum entirely), which is what made a lapsed streak's "sleeping"
// badge disappear one day after it first appeared instead of persisting -- a real bug, not a
// deliberate "only shown the day after" design, per direct user report.
const mostRecentRunIncludingClose = (flags: boolean[], weights: number[]): number => {
  let i = flags.length - 1;
  while (i >= 0 && !flags[i]) i--;
  if (i < 0) return 0; // no period in this history ever actually hit
  // `i` is the last period that hit. Sum its own trailing true run, plus -- only if it exists --
  // the single period immediately after it, which is what actually closed this run out (already
  // guaranteed false, since the walk above skipped past nothing but false periods to reach `i`).
  // Any failures beyond that one are later, separate lapses, not part of this run's own length.
  let total = weights[i];
  if (i + 1 < flags.length) total += weights[i + 1];
  i--;
  while (i >= 0 && flags[i]) {
    total += weights[i];
    i--;
  }
  return total;
};

// The raw schedule's own due-ness, ignoring any skip override entirely -- what isDueOnDate falls
// back to once it's confirmed this date isn't explicitly skipped. Exported so a caller that
// specifically needs "was this day ever actually scheduled" independent of whether it's *been*
// skipped -- e.g. TaskCalendarScreen/taskStore deciding whether skip is even a meaningful action
// to offer for a given date at all (skipping an already-non-due day is redundant, per explicit
// user direction) -- doesn't have to duplicate the specific_days_of_week logic itself.
export const isScheduledOnDate = (task: DueDaySchedule, date: Date): boolean => {
  if (task.frequency === 'specific_days_of_week') {
    // Treat "no days selected" as always-due rather than never-due, so a misconfigured
    // task doesn't silently look like it has no schedule at all.
    if (!task.daysOfWeek || task.daysOfWeek.length === 0) return true;
    return task.daysOfWeek.includes(date.getDay());
  }
  return true;
};

export const isDueOnDate = (task: DueDaySchedule, date: Date): boolean => {
  // A skip makes a day behave exactly like it was never due, regardless of what the schedule
  // otherwise says -- checked first, and only for the two frequency types skip actually supports
  // (see Task.skippedDates' own comment for why quota types are excluded). Every other consumer
  // of isDueOnDate (streak math, achievements, notifications, the status popover, calendar
  // day-state) reads this same function, so this one check is what makes a skip propagate
  // correctly everywhere without any of them needing their own awareness of it.
  if (
    (task.frequency === 'daily' || task.frequency === 'specific_days_of_week')
    && task.skippedDates?.includes(format(date, 'yyyy-MM-dd'))
  ) {
    return false;
  }
  return isScheduledOnDate(task, date);
};

// For 'daily' and 'specific_days_of_week': a streak only *breaks* on a missed due day, but every
// day completed -- due or not -- adds to the running count. Walk every calendar day (not just
// due days) from firstDate to today, grouping them into segments that each end at a due-day
// "gate": hitting the gate links the whole segment's day-count (due AND non-due days completed
// within it) into the streak; missing it breaks the chain going forward. For 'daily', every day
// is its own due day, so every segment is exactly one day -- this degenerates to the old
// per-due-day behavior with no non-due days to add.
// `asOfDate` defaults to real "now" for every live call site (Task Card badges, headers, the
// Dashboard, etc.) -- it exists so a historical replay (achievements.ts's own retroactive scan)
// can ask "what would this task's stats have looked like on some past date," by passing that date
// here instead of letting "today" mean the actual current moment. Every live caller is unaffected
// since the parameter is optional and defaults identically to the old hardcoded behavior.
const calculateDueDayStats = (task: StreakScheduleInfo, completions: TaskCompletion[], asOfDate: Date = new Date()): TaskStats => {
  const completedDates = new Set(completions.map(c => c.date));
  const sortedDates = Array.from(completedDates).sort();
  const firstDate = startOfDay(parseISO(sortedDates[0]));
  const today = startOfDay(asOfDate);
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

export interface QuotaPeriodInfo {
  start: Date;
  end: Date;
  count: number;
  met: boolean;
  firstCompleted: Date | null;
  lastCompleted: Date | null;
}

// The single "did this quota period meet its own quota" primitive -- the one piece of the quota
// engine that genuinely needs sharing, since it was previously reimplemented independently three
// times (calculateQuotaStats's own per-period loop below, getQuotaStreakChains's identical loop
// in reports.ts, and getDayStreakState's single-period check, also in reports.ts) even though all
// three walk the exact same period bounds against the exact same qualifying-completion data.
// Callers that already have a pre-filtered "only qualifying dates" completionCounts map (the two
// full-history walkers below and in reports.ts) can pass requiredTimes=1, since every entry in
// that map is already known to qualify; callers working from a task's raw, unfiltered completions
// (getDayStreakState) pass the task's real timesPerDay instead.
export const getQuotaPeriodInfo = (
  date: Date,
  unit: QuotaUnit,
  quota: number,
  completionCounts: ReadonlyMap<string, number>,
  requiredTimes: number
): QuotaPeriodInfo => {
  const safeQuota = Math.max(1, quota || 1);
  const { start, end } = getPeriodBounds(date, unit);
  let count = 0;
  let firstCompleted: Date | null = null;
  let lastCompleted: Date | null = null;
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    if ((completionCounts.get(format(cursor, 'yyyy-MM-dd')) ?? 0) >= requiredTimes) {
      count++;
      if (!firstCompleted) firstCompleted = cursor;
      lastCompleted = cursor;
    }
  }
  return { start, end, count, met: count >= safeQuota, firstCompleted, lastCompleted };
};

// For 'days_per_week' / 'days_per_month': frequency only decides whether days *link* across
// a period boundary into the next period -- it never decides whether a day counts at all.
// A met period's days link forward, extending the streak into the next period. An unmet
// (failed) *elapsed* period still contributes its own real days to the streak that's ending,
// it just doesn't link forward -- the *next* period starts fresh. The in-progress current
// period hasn't closed yet, so its days-so-far are always provisionally included in whatever
// streak is currently open, win or lose, until it actually closes.
// See calculateDueDayStats's own comment on `asOfDate` -- same reasoning, same default.
const calculateQuotaStats = (
  task: StreakScheduleInfo,
  completions: TaskCompletion[],
  unit: QuotaUnit,
  quota: number,
  asOfDate: Date = new Date()
): TaskStats => {
  const safeQuota = Math.max(1, quota || 1);
  const distinctDates = Array.from(new Set(completions.map(c => c.date))).sort();
  const firstDate = parseISO(distinctDates[0]);
  const today = startOfDay(asOfDate);
  // `completions` here are already the caller's pre-filtered qualifying set (see
  // calculateTaskStats below), so any date present in this map already qualifies --
  // requiredTimes=1 against it is equivalent to re-checking the real timesPerDay threshold.
  const completionCounts = buildCompletionCountsByDate(completions);

  const periods: { count: number; met: boolean }[] = [];
  let cursor = getPeriodBounds(firstDate, unit).start;
  const lastStart = getPeriodBounds(today, unit).start;
  while (cursor <= lastStart) {
    const info = getQuotaPeriodInfo(cursor, unit, safeQuota, completionCounts, 1);
    periods.push({ count: info.count, met: info.met });
    cursor = nextPeriodStart(info.start, unit);
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
    // `'expiring'` is meant to be an actionable "do something today or this breaks" signal --
    // once today's own chance has already been used, there's nothing left to *act on* today
    // regardless of how tight the days after today are (that's tomorrow's problem to flag, if
    // it's still tight then). `calculateDueDayStats` (the daily/specific_days_of_week sibling of
    // this function) already gates its own 'expiring' on `!todayCompleted` for exactly this
    // reason -- this was a real gap between the two, not a deliberate quota-specific difference:
    // without it, a task could show 'expiring' on a day its own quota-relevant action was already
    // completed, which every downstream consumer of this status (DashboardCalendarView/
    // TaskCalendarScreen's own "expiring today" clock icon, HomeScreen's "needs attention" filter)
    // was already independently guarding against via its own redundant `!isCompleted` check --
    // this fix makes the underlying status itself correct instead of relying on every caller to
    // compensate for it.
    const isTight = !todayAlreadyCounted && remainingOpportunities <= stillNeeded;

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

// `asOfDate` (optional, defaults to real "now") is what "today" means throughout this whole
// calculation -- every live call site omits it and gets the exact same behavior as before this
// parameter existed. It exists specifically so achievements.ts's retroactive scan can reconstruct
// a task's stats *as they stood on some past date*, by recomputing this same function with that
// date instead of the real current moment.
export const calculateTaskStats = (
  task: StreakScheduleInfo,
  completions: TaskCompletion[],
  asOfDate: Date = new Date()
): TaskStats => {
  // A day only "counts" once it's hit the task's timesPerDay quota -- a completion record
  // that's only partially filled in (e.g. 2 of 8 reps) shouldn't count as a done day yet.
  const requiredTimes = Math.max(1, task.timesPerDay || 1);
  const qualifyingCompletions = completions.filter(c => c.timesCompleted >= requiredTimes);

  if (qualifyingCompletions.length === 0) return emptyStats;

  switch (task.frequency) {
    case 'days_per_week':
      return calculateQuotaStats(task, qualifyingCompletions, 'week', task.daysPerWeek, asOfDate);
    case 'days_per_month':
      return calculateQuotaStats(task, qualifyingCompletions, 'month', task.daysPerMonth, asOfDate);
    case 'daily':
    case 'specific_days_of_week':
    default:
      return calculateDueDayStats(task, qualifyingCompletions, asOfDate);
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

// A runtime-read-only facade, not merely a ReadonlyMap TypeScript annotation. Cached maps are
// shared across components and achievement checks, so exposing Map.set/delete/clear would allow
// one accidental cast/mutation to corrupt every later reader of the same completions-array key.
// The backing Map is held in a native private field and cannot be reached through the returned
// object; its iterators expose entries, not the mutable Map itself.
class CompletionCountsView implements ReadonlyMap<string, number> {
  readonly [Symbol.toStringTag] = 'CompletionCountsView';
  readonly #source: Map<string, number>;

  constructor(completions: readonly TaskCompletion[]) {
    this.#source = new Map();
    for (const completion of completions) {
      this.#source.set(completion.date, completion.timesCompleted);
    }
    Object.freeze(this);
  }

  get size(): number { return this.#source.size; }
  get(key: string): number | undefined { return this.#source.get(key); }
  has(key: string): boolean { return this.#source.has(key); }
  entries(): MapIterator<[string, number]> { return this.#source.entries(); }
  keys(): MapIterator<string> { return this.#source.keys(); }
  values(): MapIterator<number> { return this.#source.values(); }
  [Symbol.iterator](): MapIterator<[string, number]> { return this.#source[Symbol.iterator](); }
  forEach(
    callbackfn: (value: number, key: string, map: ReadonlyMap<string, number>) => void,
    thisArg?: unknown
  ): void {
    this.#source.forEach((value, key) => callbackfn.call(thisArg, value, key, this));
  }
}

const completionCountsByArray = new WeakMap<TaskCompletion[], ReadonlyMap<string, number>>();
const EMPTY_COMPLETION_COUNTS: ReadonlyMap<string, number> = new CompletionCountsView([]);

// Shared only by callers holding the store's immutable completion-array references. Every action
// that changes completion data replaces the array (complete, uncomplete, undo, restore, and import
// merge/replace inputs), so a changed history is a guaranteed cache miss while a settings edit that
// retains unchanged history is a safe hit. Deliberately keyed by the array object -- never task id
// -- so replacing a task's data cannot return an index built from an older history. WeakMap also
// lets abandoned histories be collected without manual invalidation or an unbounded id cache.
export const getCachedCompletionCountsByDate = (
  completions: readonly TaskCompletion[]
): ReadonlyMap<string, number> => {
  if (completions.length === 0) return EMPTY_COMPLETION_COUNTS;

  // Task.completions is declared mutable for legacy/import compatibility, but store-owned arrays
  // follow immutable replacement. The cast only supplies WeakMap's object key type; this function
  // never writes to the input array.
  const key = completions as TaskCompletion[];
  const cached = completionCountsByArray.get(key);
  if (cached) return cached;

  const counts = new CompletionCountsView(completions);
  completionCountsByArray.set(key, counts);
  return counts;
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
