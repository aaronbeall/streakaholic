import { addDays, format, parseISO, startOfDay } from 'date-fns';
import { MaterialCommunityIconName, Task } from '../types';
import { getPeriodBounds, isDueOnDate, nextPeriodStart, QuotaUnit, StreakScheduleInfo } from './streaks';

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
const getDueDayStreakChains = (schedule: StreakScheduleInfo, completedDates: Set<string>): StreakChain[] => {
  const sortedDates = Array.from(completedDates).sort();
  if (sortedDates.length === 0) return [];

  const firstDate = startOfDay(parseISO(sortedDates[0]));
  const today = startOfDay(new Date());
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

  return chainMetSegments(segments);
};

// Same idea as getDueDayStreakChains, but for quota frequencies (days_per_week/days_per_month):
// periods (weeks/months) stand in for due-day segments, chained the same way.
const getQuotaStreakChains = (completedDates: Set<string>, unit: QuotaUnit, quota: number): StreakChain[] => {
  const sortedDates = Array.from(completedDates).sort();
  if (sortedDates.length === 0) return [];

  const safeQuota = Math.max(1, quota || 1);
  const firstDate = parseISO(sortedDates[0]);
  const today = startOfDay(new Date());

  const segments: Segment[] = [];
  let cursor = getPeriodBounds(firstDate, unit).start;
  const lastStart = getPeriodBounds(today, unit).start;
  while (cursor <= lastStart) {
    const { start, end } = getPeriodBounds(cursor, unit);
    const completedInPeriod = sortedDates
      .map(d => parseISO(d))
      .filter(dt => dt >= start && dt <= end);
    segments.push({
      met: completedInPeriod.length >= safeQuota,
      count: completedInPeriod.length,
      firstCompleted: completedInPeriod[0] ?? null,
      lastCompleted: completedInPeriod[completedInPeriod.length - 1] ?? null,
    });
    cursor = nextPeriodStart(start, unit);
  }

  return chainMetSegments(segments);
};

// Every historical streak run for one task, oldest first.
export const getTaskStreakChains = (task: Task): StreakChain[] => {
  const requiredTimes = Math.max(1, task.timesPerDay || 1);
  const completedDates = new Set(
    (task.completions || []).filter(c => c.timesCompleted >= requiredTimes).map(c => c.date)
  );
  if (completedDates.size === 0) return [];

  switch (task.frequency) {
    case 'days_per_week':
      return getQuotaStreakChains(completedDates, 'week', task.daysPerWeek);
    case 'days_per_month':
      return getQuotaStreakChains(completedDates, 'month', task.daysPerMonth);
    case 'daily':
    case 'specific_days_of_week':
    default:
      return getDueDayStreakChains(task, completedDates);
  }
};

// The most recent streak runs across a set of tasks, newest first. A single completed day isn't
// really a "streak" (nothing was ever strung together), so those are left out here -- callers
// that want the raw, unfiltered history (e.g. for a per-task view) should use
// getTaskStreakChains directly instead.
export const getRecentStreaks = (tasks: Task[], limit: number = 10): TaskStreakChain[] => {
  const all: TaskStreakChain[] = tasks.flatMap(task =>
    getTaskStreakChains(task)
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
