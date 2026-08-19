import { addDays, differenceInCalendarDays, format, parseISO, startOfDay, subDays } from 'date-fns';
import { MaterialCommunityIconName, Task } from '../types';
import { buildCompletionCountsByDate, getPeriodBounds, getQuotaPeriodInfo, isDueOnDate, nextPeriodStart, QuotaUnit, StreakScheduleInfo } from './streaks';

export interface StreakChain {
  startDate: Date;
  endDate: Date;
  length: number;
}

export interface TaskStreakChain extends StreakChain {
  taskId: string;
  taskName: string;
  taskIcon: MaterialCommunityIconName;
  taskColor: string;
}

interface Segment {
  met: boolean;
  count: number;
  // The actual earliest/latest *completed* day within the segment (not the segment's nominal
  // due-day-gate/period boundary) -- a failing segment's own bonus days can still extend a
  // chain right up to the real last day it was active, and a chain that opens mid-segment
  // should start at the real first day it was active, not an arbitrary boundary.
  firstCompleted: Date | null;
  lastCompleted: Date | null;
}

// Chains consecutive *met* segments into streak runs -- mirrors calculateDueDayStats/
// calculateQuotaStats's "IncludingClose" reasoning (see streaks.ts): a segment that closes on a
// miss still contributes its own bonus days to the run that's ending (only the *next* met
// segment starts a fresh chain), so those bonus days aren't silently dropped.
const chainMetSegments = (segments: Segment[]): StreakChain[] => {
  const chains: StreakChain[] = [];
  let chainStart: Date | null = null;
  let chainEnd: Date | null = null;
  let chainLength = 0;

  for (const segment of segments) {
    if (segment.met) {
      if (chainStart === null) chainStart = segment.firstCompleted;
      if (segment.lastCompleted) chainEnd = segment.lastCompleted;
      chainLength += segment.count;
    } else if (chainStart !== null) {
      // The chain that's ending still gets credit for this failing segment's own bonus days.
      chainLength += segment.count;
      if (segment.lastCompleted) chainEnd = segment.lastCompleted;
      chains.push({ startDate: chainStart, endDate: chainEnd as Date, length: chainLength });
      chainStart = null;
      chainEnd = null;
      chainLength = 0;
    }
    // A failing segment with no chain currently open contributes nothing -- there's no
    // streak to attribute its (non-existent, since it failed) bonus days to.
  }
  if (chainStart !== null) {
    chains.push({ startDate: chainStart, endDate: chainEnd as Date, length: chainLength });
  }

  return chains;
};

// Reconstructs the full history of streak runs for a due-day-gated task (daily /
// specific_days_of_week), not just the current/best counts calculateTaskStats returns -- mirrors
// that function's segment-by-due-day-gate walk (see calculateDueDayStats) but keeps each
// segment's actual dates instead of collapsing everything into aggregate numbers. A day that's
// due today and not yet completed leaves its segment unclosed (matching calculateDueDayStats's
// "not a miss yet" handling), so an ambiguous still-open today never counts into a chain early.
const getDueDayStreakChains = (
  schedule: StreakScheduleInfo,
  completedDates: Set<string>,
  asOfDate: Date
): StreakChain[] => {
  const sortedDates = Array.from(completedDates).sort();
  if (sortedDates.length === 0) return [];

  const firstDate = startOfDay(parseISO(sortedDates[0]));
  const today = startOfDay(asOfDate);
  const todayStr = format(today, 'yyyy-MM-dd');

  const segments: Segment[] = [];
  let segmentDates: Date[] = [];

  let cursor = firstDate;
  while (cursor <= today) {
    segmentDates.push(cursor);
    const dateStr = format(cursor, 'yyyy-MM-dd');
    const isDue = isDueOnDate(schedule, cursor);
    const isUnsettledToday = dateStr === todayStr && isDue && !completedDates.has(dateStr);

    if (isDue && !isUnsettledToday) {
      const completedInSegment = segmentDates.filter(d => completedDates.has(format(d, 'yyyy-MM-dd')));
      segments.push({
        met: completedDates.has(dateStr),
        count: completedInSegment.length,
        firstCompleted: completedInSegment[0] ?? null,
        lastCompleted: completedInSegment[completedInSegment.length - 1] ?? null,
      });
      segmentDates = [];
    }

    cursor = addDays(cursor, 1);
  }

  const chains = chainMetSegments(segments);

  // The stretch since the last real due-day gate (today, plus any earlier non-due days
  // accumulated since) never gets its own segment above -- there's no due day left to flush it
  // against yet, whether because today isn't due at all or is due but not yet completed. But its
  // real completions still already count toward the live streak -- calculateDueDayStats
  // (streaks.ts) folds these same days into its own currentStreak via `pendingCount`, unconditionally
  // (not just when today itself is the due day). Skipping that here is exactly the "badge lands one
  // day early" bug: a bonus completion that's already happened (e.g. today, on a non-due day) didn't
  // move the chain's own endDate/length forward to match, so the calendar badge stayed stuck on the
  // last real gate while TaskHeader's status badge (reading task.stats.currentStreak) already
  // counted it.
  const pendingCompleted = segmentDates.filter(d => completedDates.has(format(d, 'yyyy-MM-dd')));
  if (pendingCompleted.length > 0) {
    // Mirrors calculateDueDayStats' own `priorChainIntact`: true when there's no settled history
    // yet, or the most recently settled gate was itself met -- i.e. the chain that's still open
    // actually reaches all the way up to just before this pending stretch, with no break in between.
    const priorChainIntact = segments.length === 0 || segments[segments.length - 1].met;
    const lastCompleted = pendingCompleted[pendingCompleted.length - 1];
    const lastChain = priorChainIntact ? chains[chains.length - 1] : undefined;
    if (lastChain) {
      // Extends the currently-forming chain in place -- chainMetSegments only ever returns freshly
      // built chain objects, so this can't leak into anything else.
      lastChain.endDate = lastCompleted;
      lastChain.length += pendingCompleted.length;
    } else {
      // Either there's no chain data yet, or the last real gate was a miss -- these pending bonus
      // days start a fresh chain of their own rather than stitching onto whatever came before,
      // matching `pendingCount` becoming its own openStreak value when priorChainIntact is false.
      chains.push({ startDate: pendingCompleted[0], endDate: lastCompleted, length: pendingCompleted.length });
    }
  }

  return chains;
};

// Same idea as getDueDayStreakChains, but for quota frequencies (days_per_week/days_per_month):
// periods (weeks/months) stand in for due-day segments, chained the same way. The per-period
// "did it meet quota, how many qualifying days" fact itself comes from streaks.ts's shared
// getQuotaPeriodInfo -- the same primitive getDayStreakState below and calculateQuotaStats
// (streaks.ts) both use, rather than each independently re-walking the same period bounds.
// requiredTimes=1 here since `completionCounts` is already built from pre-filtered qualifying
// completions (every entry already met the task's own timesPerDay).
const getQuotaStreakChains = (
  completionCounts: ReadonlyMap<string, number>,
  unit: QuotaUnit,
  quota: number,
  asOfDate: Date
): StreakChain[] => {
  const dates = Array.from(completionCounts.keys()).sort();
  if (dates.length === 0) return [];

  const firstDate = parseISO(dates[0]);
  const today = startOfDay(asOfDate);

  const segments: Segment[] = [];
  let cursor = getPeriodBounds(firstDate, unit).start;
  const lastStart = getPeriodBounds(today, unit).start;
  while (cursor <= lastStart) {
    const info = getQuotaPeriodInfo(cursor, unit, quota, completionCounts, 1);
    segments.push({ met: info.met, count: info.count, firstCompleted: info.firstCompleted, lastCompleted: info.lastCompleted });
    cursor = nextPeriodStart(info.start, unit);
  }

  return chainMetSegments(segments);
};

// Every historical streak run for one task, oldest first.
export const getTaskStreakChains = (task: Task, asOfDate: Date = new Date()): StreakChain[] => {
  const requiredTimes = Math.max(1, task.timesPerDay || 1);
  const qualifyingCompletions = (task.completions || []).filter(c => c.timesCompleted >= requiredTimes);
  if (qualifyingCompletions.length === 0) return [];

  switch (task.frequency) {
    case 'days_per_week':
      return getQuotaStreakChains(buildCompletionCountsByDate(qualifyingCompletions), 'week', task.daysPerWeek, asOfDate);
    case 'days_per_month':
      return getQuotaStreakChains(buildCompletionCountsByDate(qualifyingCompletions), 'month', task.daysPerMonth, asOfDate);
    case 'daily':
    case 'specific_days_of_week':
    default:
      return getDueDayStreakChains(task, new Set(qualifyingCompletions.map(c => c.date)), asOfDate);
  }
};

// Tasks are replaced immutably by the store, so an exact object reference is also a safe version
// key for every schedule/completion field used above. Include the local day because today's open
// segment can settle at midnight even when the task data itself has not changed. This cache is
// intentionally shared by Home, Task Calendar, Dashboard, and recent-streak reporting so a task's
// full history is reconstructed at most once per task version per day.
const streakChainsByTask = new WeakMap<Task, { dayKey: string; chains: StreakChain[] }>();

export const getCachedTaskStreakChains = (task: Task, asOfDate: Date = new Date()): StreakChain[] => {
  const dayKey = format(startOfDay(asOfDate), 'yyyy-MM-dd');
  const cached = streakChainsByTask.get(task);
  if (cached?.dayKey === dayKey) return cached.chains;

  const chains = getTaskStreakChains(task, asOfDate);
  streakChainsByTask.set(task, { dayKey, chains });
  return chains;
};

export type DayStreakState = 'connected' | 'hardMiss' | 'softMiss';

// Finds the most recent chain that has already fully closed before `day` (chains are
// chronological, oldest-first, so this is just "the last one whose endDate precedes day").
const lastChainBefore = (chains: StreakChain[], day: Date): StreakChain | undefined => {
  let low = 0;
  let high = chains.length - 1;
  let result: StreakChain | undefined;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const chain = chains[middle];
    if (chain.endDate < day) {
      result = chain;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return result;
};

// Streak chains are chronological and non-overlapping. Find the last chain that starts on or
// before the day, then check its end, avoiding a full chain scan for each calendar cell and each
// neighboring-day connection check.
const chainContaining = (chains: StreakChain[], day: Date): StreakChain | null => {
  let low = 0;
  let high = chains.length - 1;
  let candidate: StreakChain | null = null;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const chain = chains[middle];
    if (chain.startDate <= day) {
      candidate = chain;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return candidate && day <= candidate.endDate ? candidate : null;
};

// A day's relationship to the task's own streak history -- three states, not two:
//  - 'connected': part of a real streak run right now -- either an already-closed historical
//    chain (getTaskStreakChains), the current not-yet-decided period of a days_per_week/
//    days_per_month task, or (daily/specific_days_of_week) a non-due day a real chain reaches
//    through. Renders as the connecting dash/line.
//  - 'hardMiss': a day that was genuinely *required* and wasn't completed -- a missed due day
//    (daily/specific_days_of_week), or any empty day in a days_per_week/days_per_month period
//    that has already elapsed without meeting quota. This applies unconditionally, no matter how
//    long ago it happened or whether the streak is already expired (per explicit user direction:
//    a required day doesn't stop having been required just because time has passed since).
//    Renders as an X.
//  - 'softMiss': the only two cases left once 'hardMiss' isn't unconditional-by-requirement --
//    a non-due day (daily/specific_days_of_week) that isn't covered by any real chain, and a due
//    day when the task has never had *any* real chain yet (nothing has ever been "continuing").
//    Renders as a plain, less-alarming empty day.
//
// Takes `chains` (the caller's own already-memoized getTaskStreakChains(task) result) and
// `completionCounts` (the caller's own already-memoized/cached completion index for task.
// completions) result) rather than recomputing either internally -- calendar grids call this
// once per empty cell, and both of those walk/scan the task's full history, so recomputing them
// from scratch per cell would turn a per-render cost into a per-cell one across a whole grid.
export const getDayStreakState = (
  task: Task,
  date: Date,
  chains: StreakChain[],
  completionCounts: ReadonlyMap<string, number>
): DayStreakState => {
  const day = startOfDay(date);

  if (task.frequency !== 'days_per_week' && task.frequency !== 'days_per_month') {
    if (!isDueOnDate(task, day)) {
      // A non-due day only reads as connected if it's actually *within* a real chain's span (a
      // due-day chain's date range already includes its own non-due bonus days -- see
      // getDueDayStreakChains). Bug fixed 2026-08-09: this used to return 'connected'
      // unconditionally for every non-due day, so one sitting right after a real hard miss
      // (nothing currently connected at all) still drew a connecting dash.
      return chainContaining(chains, day) ? 'connected' : 'softMiss';
    }
    // A missed due day was genuinely required, full stop -- per explicit user direction, this
    // holds even long after the streak that would have used it has already expired; there's no
    // fading it back to a soft miss over time. The one exception: a task that has never had any
    // real chain at all has nothing for this day to have been "continuing" in the first place.
    return lastChainBefore(chains, day) ? 'hardMiss' : 'softMiss';
  }

  // days_per_week / days_per_month: whether this day's own period, on its own, met quota --
  // not whether it happens to fall within some larger chain's overall date span (a chain's own
  // endDate can reach *into* a period that itself failed, via the "IncludingClose" bonus-day
  // credit calculateQuotaStats/getQuotaStreakChains both use for computing streak *length* --
  // that's a different question from what this specific period, in isolation, actually needed).
  // The "did it meet quota" fact itself comes from streaks.ts's shared getQuotaPeriodInfo, the
  // same primitive getQuotaStreakChains/calculateQuotaStats use for their own period walks.
  const unit: QuotaUnit = task.frequency === 'days_per_month' ? 'month' : 'week';
  const requiredTimes = Math.max(1, task.timesPerDay || 1);
  const quota = Math.max(1, (task.frequency === 'days_per_month' ? task.daysPerMonth : task.daysPerWeek) || 1);
  const { start, met } = getQuotaPeriodInfo(day, unit, quota, completionCounts, requiredTimes);
  if (met) return 'connected';

  // Quota not met by this period's own days -- if the period hasn't elapsed yet, it's still
  // undecided (a pending tail), not a miss. Once it has elapsed short of quota, every empty day
  // in it reads as a hard miss -- we can't know which specific subset would have been "the"
  // required ones, so per explicit user direction, all of them are treated as required.
  const today = startOfDay(new Date());
  const isCurrentPeriod = start.getTime() === getPeriodBounds(today, unit).start.getTime();
  return isCurrentPeriod ? 'connected' : 'hardMiss';
};

export interface DayMomentumInfo {
  // A zero-activity day the schedule genuinely allows the streak to cross. This deliberately
  // excludes the first day on which action has become mandatory, even when an open quota period
  // has not formally closed yet.
  isPassThrough: boolean;
  // 1 for a fully completed day, 0 for a break, and a decreasing 0..1 value across allowed
  // pass-through days. The renderer owns the final ~1px visual clamp for a positive pass-through.
  fraction: number;
}

const latestQualifyingDateBefore = (dates: Date[], day: Date): Date | null => {
  let low = 0;
  let high = dates.length - 1;
  let result: Date | null = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (dates[middle] < day) {
      result = dates[middle];
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result;
};

// Assuming no completion after `anchor`, find the first date on which another allowed-miss day
// would make the schedule fail. For due-day schedules that is simply the next due day. For quota
// schedules it is the first day where every remaining opportunity in the week/month is needed.
const findNextMandatoryDate = (
  task: Task,
  anchor: Date,
  qualifyingDates: Date[]
): Date => {
  if (task.frequency !== 'days_per_week' && task.frequency !== 'days_per_month') {
    let cursor = addDays(anchor, 1);
    for (let i = 0; i < 8; i++, cursor = addDays(cursor, 1)) {
      if (isDueOnDate(task, cursor)) return cursor;
    }
    return cursor;
  }

  const unit: QuotaUnit = task.frequency === 'days_per_month' ? 'month' : 'week';
  const quota = Math.max(1, (task.frequency === 'days_per_month' ? task.daysPerMonth : task.daysPerWeek) || 1);
  let cursor = addDays(anchor, 1);
  // Two months is enough to cross the current period, enter the next one, and reach even a
  // one-day-left monthly deadline. This is a fixed ceiling, not an unbounded historical walk.
  for (let i = 0; i < 62; i++, cursor = addDays(cursor, 1)) {
    const { start, end } = getPeriodBounds(cursor, unit);
    const completionsKnownAtAnchor = qualifyingDates.filter(date =>
      date <= anchor && date >= start && date <= end
    ).length;
    const stillNeeded = Math.max(0, quota - completionsKnownAtAnchor);
    const opportunitiesIncludingCursor = differenceInCalendarDays(end, cursor) + 1;
    if (stillNeeded > 0 && opportunitiesIncludingCursor <= stillNeeded) return cursor;
  }
  return cursor;
};

// Builds the streamgraph's per-day momentum once per task/date page. A qualifying completion is a
// full-width reset; partial multi-repetition progress retains its literal completion fraction; an
// allowed-miss (empty, schedule-tolerated) day tapers according to how much slack remains before
// action becomes mandatory. The same `isPassThrough` flag also powers the day-details box so its
// textual state cannot disagree with the stream. Note this is entirely about *schedule-driven*
// slack (a non-due day, or quota slack) -- unrelated to the user-initiated skip feature
// (Task.skippedDates, streaks.ts) even though a skipped day mechanically becomes non-due and so
// also reads as pass-through here, same as any other non-due day would.
export const buildDayMomentumInfo = (
  task: Task,
  dates: Date[],
  completionCounts: ReadonlyMap<string, number>
): Map<string, DayMomentumInfo> => {
  const requiredTimes = Math.max(1, task.timesPerDay || 1);
  const qualifyingDates = Array.from(completionCounts.entries())
    .filter(([, count]) => count >= requiredTimes)
    .map(([date]) => startOfDay(parseISO(date)))
    .sort((a, b) => a.getTime() - b.getTime());
  const mandatoryDateByAnchor = new Map<number, Date>();
  const today = startOfDay(new Date());
  const result = new Map<string, DayMomentumInfo>();

  for (const rawDate of dates) {
    const day = startOfDay(rawDate);
    const key = format(day, 'yyyy-MM-dd');
    const completionCount = completionCounts.get(key) ?? 0;
    if (completionCount > 0) {
      result.set(key, {
        isPassThrough: false,
        fraction: Math.min(completionCount / requiredTimes, 1),
      });
      continue;
    }
    if (day > today) {
      result.set(key, { isPassThrough: false, fraction: 0 });
      continue;
    }

    const anchor = latestQualifyingDateBefore(qualifyingDates, day);
    if (!anchor) {
      result.set(key, { isPassThrough: false, fraction: 0 });
      continue;
    }
    const anchorTime = anchor.getTime();
    let mandatoryDate = mandatoryDateByAnchor.get(anchorTime);
    if (!mandatoryDate) {
      mandatoryDate = findNextMandatoryDate(task, anchor, qualifyingDates);
      mandatoryDateByAnchor.set(anchorTime, mandatoryDate);
    }
    const allowedMissDays = Math.max(0, differenceInCalendarDays(mandatoryDate, anchor) - 1);
    const missesElapsed = differenceInCalendarDays(day, anchor);
    if (day >= mandatoryDate || missesElapsed > allowedMissDays) {
      result.set(key, { isPassThrough: false, fraction: 0 });
      continue;
    }

    const remainingOptionalDaysAfterThis = Math.max(0, allowedMissDays - missesElapsed);
    result.set(key, {
      isPassThrough: true,
      // Normalize the *first* optional day to 1 and the last to 0. The stream renderer then maps
      // that continuation-only range into its deliberately weaker visual band (currently 50%
      // down to ~1px), keeping this schedule calculation independent of a particular chart size.
      fraction: allowedMissDays > 1
        ? remainingOptionalDaysAfterThis / (allowedMissDays - 1)
        : 0,
    });
  }
  return result;
};

// Whether this date reads as part of a connected streak thread at all -- completed, or a
// pass-through day (see getDayStreakState). Used to decide whether two adjacent day cells should
// show a connector line between them: a day gets a left/right connector stub exactly when its
// neighbor on that side is *also* connected, which naturally reproduces "no left connector on a
// streak's first day, no right connector on its last day" without needing to special-case either
// -- a day with a broken/missing neighbor has nothing connected to draw a line into. Today itself
// is never marked completed or pass-through on its own (calendars never judge "today" as a hard
// miss or pass-through -- see each screen's `isPast` gating), so it's handled separately here:
// connected exactly when today's own status is `'up_to_date'` -- comfortably safe, nothing riding
// on today specifically -- not merely whenever `currentStreak > 0`. That distinction matters:
// `'expiring'` *also* has `currentStreak > 0` (a real streak exists), but it specifically means
// today (or, for a quota task, every remaining day in the period) is the make-or-break day -- miss
// it and the streak breaks. Per explicit user direction, an expiring today gets no "free pass" connector; only a
// genuinely safe today (not due, or already covered with slack) does.
export const isConnectedDay = (
  task: Task,
  date: Date,
  chains: StreakChain[],
  completionCounts: ReadonlyMap<string, number>
): boolean => {
  const today = startOfDay(new Date());
  const day = startOfDay(date);
  if (day > today) return false;

  const requiredTimes = Math.max(1, task.timesPerDay || 1);
  const count = completionCounts.get(format(day, 'yyyy-MM-dd')) ?? 0;
  if (count >= requiredTimes) return true;

  if (day.getTime() === today.getTime()) return task.stats?.streakStatus === 'up_to_date';

  return getDayStreakState(task, day, chains, completionCounts) === 'connected';
};

// A broader notion of "connected" than isConnectedDay above, used *only* for the capsule/badge
// rendering in buildDayConnectionInfo below -- not by TaskCard's own (deliberately simpler, still
// per-day-strict) connector stubs on the Home screen, which keep calling isConnectedDay directly
// and are unaffected by this function existing.
//
// Per explicit user direction: the capsule should visually reach all the way to a streak's actual
// last completed day -- the same day the streak-count badge is placed on (a chain's own endDate)
// -- even when that reach crosses a days_per_week/days_per_month period that failed its own quota
// but wasn't empty. getDayStreakState's per-day classification is deliberately strict there (an
// empty day in a failed period is a hard miss, full stop -- see this file's own "Final design"
// history) and that per-day *mark* is untouched by this function; but getQuotaStreakChains' own
// "IncludingClose" rule already credits that period's real completions to the chain that's
// ending, so the chain's span is the authoritative answer for how far the *capsule* should reach.
// This is a strict superset of isConnectedDay/getDayStreakState's own "connected" result: it adds
// one more case (chain-span membership) on top, never removes one, so nothing that already read
// as connected there stops being so here. Built directly on top of isConnectedDay (rather than
// duplicating its future/completed/today/getDayStreakState logic a second time) so both share the
// exact same "today" rule with nothing to keep in sync by hand.
const isChainConnectedDay = (
  task: Task,
  date: Date,
  chains: StreakChain[],
  completionCounts: ReadonlyMap<string, number>
): boolean => {
  const day = startOfDay(date);
  if (day > startOfDay(new Date())) return false;
  if (isConnectedDay(task, date, chains, completionCounts)) return true;

  return chainContaining(chains, day) !== null;
};

// Which chain (if any) a day's own IncludingClose span belongs to -- used only to tell two
// genuinely distinct, chronologically-*adjacent* chains apart (see isBridgedNeighbor below). Not
// every connected day belongs to an explicit chain this way (e.g. a quota period's pending tail
// before its own first completion connects via getDayStreakState, not via any chain span) -- that
// falls through to `null` here, which is deliberately treated as "no competing chain identity" by
// the caller, rather than as its own distinct chain.
const chainOf = (chains: StreakChain[], day: Date): StreakChain | null => chainContaining(chains, day);

// Whether `neighbor` should be treated as continuing the same visual run as `day`. Ordinarily
// this is just "is the neighbor connected too" -- but two *different* chains can sit on
// chronologically adjacent calendar days with no gap between them at all (e.g. a failed-quota
// week's own last credited completion falling the day before the very next week's first
// completion, if that next week goes on to meet its own quota) -- both days individually read as
// connected, but they belong to two distinct streaks, and per explicit user direction each
// streak's own capsule should still end at its own chain's real endDate rather than visually
// bleeding into the next one. So: connected neighbors only bridge into the same run when they
// *aren't* known to belong to two different chains; a day with no explicit chain of its own
// (null, e.g. a pending tail) never forces a break on its own.
const isBridgedNeighbor = (
  task: Task,
  day: Date,
  neighbor: Date,
  chains: StreakChain[],
  completionCounts: ReadonlyMap<string, number>
): boolean => {
  if (!isChainConnectedDay(task, neighbor, chains, completionCounts)) return false;
  const dayChain = chainOf(chains, day);
  const neighborChain = chainOf(chains, neighbor);
  if (dayChain && neighborChain && dayChain !== neighborChain) return false;
  return true;
};

export interface DayConnectionInfo {
  // Whether this day itself is part of a connected streak thread -- completed, a pass-through day
  // inside a real chain's span, or (today specifically) reaching into a still-live streak. Same
  // definition isConnectedDay already uses; exposed per-day here for rendering a continuous
  // capsule instead of a per-cell mark.
  isConnectedSelf: boolean;
  // No connected day immediately before/after this one, chronologically, that also belongs to
  // the *same* streak -- i.e. this is the actual start/end of its own run, not just where the
  // caller's own date list happens to stop, and not a false bridge into a chronologically
  // adjacent but genuinely different chain (see isBridgedNeighbor). Checked against the true
  // neighboring calendar date (not limited to whatever range this map was built for), so a run
  // that continues into an adjacent, unrendered month/page correctly reads as *not* ending here.
  isRunStart: boolean;
  isRunEnd: boolean;
  // Whether a streak-count badge belongs on this day, and what number it shows.
  showStreakBadge: boolean;
  badgeValue: number | null;
}

// Per-day connectivity + run-boundary info for rendering a streak as one continuous capsule
// (rounded only at its true start/end, flat everywhere it continues into a neighbor) instead of
// a per-cell mark. Deliberately separate from getDayStreakState/isConnectedDay above -- callers
// still call getDayStreakState directly for their own hard-miss/soft-miss cell rendering, exactly
// as before; this only adds run-boundary detection, via the broader isChainConnectedDay (not
// isConnectedDay), so the capsule can reach all the way to a streak's real last completed day --
// see isChainConnectedDay's own doc comment for why that's a deliberately different question than
// what any single day's own mark should show.
export const buildDayConnectionInfo = (
  task: Task,
  dates: Date[],
  chains: StreakChain[],
  completionCounts: ReadonlyMap<string, number>
): Map<string, DayConnectionInfo> => {
  const sortedDates = Array.from(new Set(dates.map(d => format(startOfDay(d), 'yyyy-MM-dd'))))
    .sort()
    .map(s => parseISO(s));

  const entries = new Map<string, DayConnectionInfo>();
  for (const date of sortedDates) {
    const key = format(date, 'yyyy-MM-dd');
    const isConnectedSelf = isChainConnectedDay(task, date, chains, completionCounts);
    const isRunStart = isConnectedSelf && !isBridgedNeighbor(task, date, subDays(date, 1), chains, completionCounts);
    const isRunEnd = isConnectedSelf && !isBridgedNeighbor(task, date, addDays(date, 1), chains, completionCounts);
    entries.set(key, { isConnectedSelf, isRunStart, isRunEnd, showStreakBadge: false, badgeValue: null });
  }

  // The badge is a *streak-history* fact, not a per-day visual one -- placed directly from
  // `chains` (the exact same StreakChain objects getRecentStreaks/the Streaks screen already
  // read), one badge per chain at its own endDate with its own length, rather than derived by
  // counting within the connected run detected above. This is deliberate, not an oversight: a
  // days_per_week/days_per_month period that fails its own quota but wasn't empty still gets its
  // own completed days credited to the chain that's ending (getQuotaStreakChains' "IncludingClose"
  // rule), even though that same period reads as a disconnected hard-miss wall in this file's own
  // stricter per-day classification (see getDayStreakState) -- so the chain can span further than
  // what this function marks "connected". Reading the badge straight from the chain keeps the
  // number in exact agreement with every other place the app shows a streak's length, at the cost
  // of it occasionally landing on (or naming a length past) a day this same function otherwise
  // renders as its own small, disconnected island -- an accepted tradeoff, not a bug.
  for (const chain of chains) {
    if (chain.length <= 1) continue; // matches getRecentStreaks' own "not really a streak" filter
    const entry = entries.get(format(chain.endDate, 'yyyy-MM-dd'));
    if (entry) {
      entry.showStreakBadge = true;
      entry.badgeValue = chain.length;
    }
  }

  return entries;
};

// The most recent streak runs across a set of tasks, newest first. A single completed day isn't
// really a "streak" (nothing was ever strung together), so those are left out here -- callers
// that want the raw, unfiltered history (e.g. for a per-task view) should use
// getTaskStreakChains directly instead.
export const getRecentStreaks = (tasks: Task[], limit: number = 10): TaskStreakChain[] => {
  const all: TaskStreakChain[] = tasks.flatMap(task =>
    getCachedTaskStreakChains(task)
      .filter(chain => chain.length > 1)
      .map(chain => ({
        ...chain,
        taskId: task.id,
        taskName: task.name,
        taskIcon: task.icon,
        taskColor: task.color,
      }))
  );
  return all.sort((a, b) => b.endDate.getTime() - a.endDate.getTime()).slice(0, limit);
};

// Every calendar day from `start` to `end`, inclusive.
export const eachDayOfRange = (start: Date, end: Date): Date[] => {
  const days: Date[] = [];
  let cursor = startOfDay(start);
  const last = startOfDay(end);
  while (cursor <= last) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
};
