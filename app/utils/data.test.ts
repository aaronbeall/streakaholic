import { format, startOfDay, subDays, subMonths, subYears } from 'date-fns';
import { Task, TaskCompletion, TaskStats } from '../types';
import {
  calculateAggregateStats,
  getChartData,
  getCompletionPatterns,
  getDateRange,
  getDateRangeLabel,
  getStreakStats,
} from './data';

const makeCompletion = (date: Date, timesCompleted = 1, completedAt: Date = date): TaskCompletion => ({
  id: `${date.getTime()}-${Math.random()}`,
  taskId: 't1',
  date: format(date, 'yyyy-MM-dd'),
  completedAt: completedAt.toISOString(),
  timesCompleted,
});

const makeStats = (overrides: Partial<TaskStats> = {}): TaskStats => ({
  currentStreak: 0,
  lastStreak: 0,
  bestStreak: 0,
  totalCompletions: 0,
  completionRate: 0,
  streakStatus: 'never_started',
  ...overrides,
});

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 't1',
  name: 'Task',
  icon: 'star' as Task['icon'],
  color: '#000',
  frequency: 'daily',
  daysOfWeek: [],
  daysPerWeek: 0,
  daysPerMonth: 0,
  timesPerDay: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  completions: [],
  ...overrides,
});

describe('getDateRange', () => {
  it('spans 7 days for "week"', () => {
    const { start, end } = getDateRange('week', []);
    expect(start).toEqual(subDays(end, 7));
  });

  it('spans 1 month for "month"', () => {
    const { start, end } = getDateRange('month', []);
    expect(start).toEqual(subMonths(end, 1));
  });

  it('spans 1 year for "year"', () => {
    const { start, end } = getDateRange('year', []);
    expect(start).toEqual(subYears(end, 1));
  });

  it('defaults "all" to the last 30 days when there are no completions', () => {
    const { start, end } = getDateRange('all', [makeTask({ completions: [] })]);
    expect(start).toEqual(subDays(end, 30));
  });

  it('starts "all" at the earliest completion across all tasks', () => {
    const today = new Date();
    const earliest = subDays(today, 90);
    const tasks = [
      makeTask({ completions: [makeCompletion(subDays(today, 10))] }),
      makeTask({ completions: [makeCompletion(earliest)] }),
    ];
    const { start } = getDateRange('all', tasks);
    expect(start).toEqual(startOfDay(earliest));
  });
});

describe('getCompletionPatterns', () => {
  it('tallies completions by day-of-week and hour-of-day, weighted by timesCompleted', () => {
    const range = { start: subDays(new Date(), 7), end: new Date() };
    const sunday9am = new Date(2026, 0, 4, 9); // Jan 4 2026 is a Sunday.
    const completions = [makeCompletion(sunday9am, 3, sunday9am)];
    const { dayOfWeekData, hourOfDayData } = getCompletionPatterns(
      { start: subDays(sunday9am, 7), end: sunday9am },
      completions
    );
    expect(dayOfWeekData[0]).toBe(3); // Sunday
    expect(hourOfDayData[9]).toBe(3);
    expect(dayOfWeekData.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('excludes completions outside the given range', () => {
    const today = new Date();
    const outside = subDays(today, 100);
    const { dayOfWeekData, hourOfDayData } = getCompletionPatterns(
      { start: subDays(today, 7), end: today },
      [makeCompletion(outside)]
    );
    expect(dayOfWeekData.reduce((a, b) => a + b, 0)).toBe(0);
    expect(hourOfDayData.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('getChartData', () => {
  it('produces 7 buckets for "week" and counts today in the last bucket', () => {
    const today = new Date();
    const { labels, data } = getChartData('week', [makeCompletion(today, 2)]);
    expect(labels).toHaveLength(7);
    expect(data).toHaveLength(7);
    expect(data[6]).toBe(2);
  });

  it('ignores completions outside the window', () => {
    const today = new Date();
    const { data } = getChartData('week', [makeCompletion(subDays(today, 30))]);
    expect(data.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('accumulates a running total when isCumulative is true', () => {
    // Avoid the exact day -6 boundary: a date-only completion string re-parses as local
    // midnight, which can fall just before a `startDate` cutoff computed from the current
    // time-of-day. Days safely inside the window sidestep that edge case.
    const today = new Date();
    const completions = [
      makeCompletion(subDays(today, 5), 1),
      makeCompletion(subDays(today, 4), 1),
    ];
    const { data } = getChartData('week', completions, true);
    const firstNonZeroIndex = data.findIndex(value => value > 0);
    expect(data[firstNonZeroIndex]).toBe(1);
    expect(data[firstNonZeroIndex + 1]).toBe(2);
    expect(data[data.length - 1]).toBe(2);
  });
});

describe('calculateAggregateStats', () => {
  it('sums totalCompletions and takes the max streaks across tasks', () => {
    const tasks = [
      makeTask({
        completions: [makeCompletion(new Date()), makeCompletion(subDays(new Date(), 1))],
        stats: makeStats({ completionRate: 1, currentStreak: 2, bestStreak: 5 }),
      }),
      makeTask({
        completions: [makeCompletion(new Date())],
        stats: makeStats({ completionRate: 0, currentStreak: 4, bestStreak: 4 }),
      }),
    ];
    const stats = calculateAggregateStats(tasks);
    expect(stats.totalCompletions).toBe(3);
    expect(stats.currentStreak).toBe(4);
    expect(stats.bestStreak).toBe(5);
  });

  // Documents a known, intentional-for-now bug (see CLAUDE.md "Known gaps"): this is a running
  // average across tasks in array order, not a true mean, so later tasks are overweighted.
  it('computes completionRate as a running average, not a true mean', () => {
    const tasks = [
      makeTask({ stats: makeStats({ completionRate: 1 }) }),
      makeTask({ stats: makeStats({ completionRate: 0 }) }),
    ];
    const stats = calculateAggregateStats(tasks);
    expect(stats.completionRate).toBe(0.25); // true mean would be 0.5
  });
});

describe('getDateRangeLabel', () => {
  it('shows just the day range within the same month', () => {
    const label = getDateRangeLabel({ start: new Date(2026, 2, 1), end: new Date(2026, 2, 10) });
    expect(label).toBe('Mar 1 - 10');
  });

  it('shows both month and day within the same year', () => {
    const label = getDateRangeLabel({ start: new Date(2026, 0, 15), end: new Date(2026, 2, 1) });
    expect(label).toBe('Jan 15 - Mar 1');
  });

  it('shows full dates including year across different years', () => {
    const label = getDateRangeLabel({ start: new Date(2025, 11, 15), end: new Date(2026, 0, 5) });
    expect(label).toBe('Dec 15, 2025 - Jan 5, 2026');
  });
});

describe('getStreakStats', () => {
  it('counts up_to_date and expiring tasks with an active streak', () => {
    const tasks = [
      makeTask({ stats: makeStats({ streakStatus: 'up_to_date', currentStreak: 3 }) }),
      makeTask({ stats: makeStats({ streakStatus: 'expiring', currentStreak: 1 }) }),
      makeTask({ stats: makeStats({ streakStatus: 'up_to_date', currentStreak: 0 }) }), // 0 streak doesn't count
      makeTask({ stats: makeStats({ streakStatus: 'expired', currentStreak: 0 }) }),
    ];
    expect(getStreakStats(tasks)).toEqual({ upToDate: 1, expiring: 1 });
  });
});
