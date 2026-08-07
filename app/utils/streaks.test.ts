import { addDays, format, startOfWeek, subDays, subWeeks } from 'date-fns';
import { TaskCompletion } from '../types';
import { calculateTaskStats, StreakScheduleInfo } from './streaks';

const makeCompletion = (id: string, date: Date, timesCompleted = 1): TaskCompletion => ({
  id,
  taskId: 't1',
  date: format(date, 'yyyy-MM-dd'),
  completedAt: date.toISOString(),
  timesCompleted,
});

const baseTask = (overrides: Partial<StreakScheduleInfo> = {}): StreakScheduleInfo => ({
  frequency: 'daily',
  daysOfWeek: [],
  daysPerWeek: 0,
  daysPerMonth: 0,
  timesPerDay: 1,
  ...overrides,
});

describe('calculateTaskStats', () => {
  it('returns empty stats when there are no completions', () => {
    const stats = calculateTaskStats(baseTask(), []);
    expect(stats).toEqual({
      currentStreak: 0,
      lastStreak: 0,
      bestStreak: 0,
      totalCompletions: 0,
      completionRate: 0,
      streakStatus: 'never_started',
    });
  });

  it('ignores completions that have not met timesPerDay yet', () => {
    const task = baseTask({ timesPerDay: 3 });
    const today = new Date();
    const completions = [
      makeCompletion('a', subDays(today, 1), 2), // under quota, doesn't count
      makeCompletion('b', today, 3), // meets quota
    ];
    const stats = calculateTaskStats(task, completions);
    expect(stats.totalCompletions).toBe(1);
    expect(stats.currentStreak).toBe(1);
  });

  describe('daily frequency', () => {
    it('is up_to_date with today included in a consecutive streak', () => {
      const today = new Date();
      const completions = [
        makeCompletion('a', subDays(today, 2)),
        makeCompletion('b', subDays(today, 1)),
        makeCompletion('c', today),
      ];
      const stats = calculateTaskStats(baseTask(), completions);
      expect(stats.streakStatus).toBe('up_to_date');
      expect(stats.currentStreak).toBe(3);
      expect(stats.bestStreak).toBe(3);
      expect(stats.lastStreak).toBe(3);
    });

    it('is expiring when yesterday was completed but today is not yet', () => {
      const today = new Date();
      const completions = [
        makeCompletion('a', subDays(today, 2)),
        makeCompletion('b', subDays(today, 1)),
      ];
      const stats = calculateTaskStats(baseTask(), completions);
      expect(stats.streakStatus).toBe('expiring');
      expect(stats.currentStreak).toBe(2);
    });

    it('tracks bestStreak separately from a shorter current streak after a gap', () => {
      const today = new Date();
      const completions = [
        // An older 5-day streak.
        makeCompletion('a', subDays(today, 10)),
        makeCompletion('b', subDays(today, 9)),
        makeCompletion('c', subDays(today, 8)),
        makeCompletion('d', subDays(today, 7)),
        makeCompletion('e', subDays(today, 6)),
        // Gap on days -5, -4, -3 breaks the streak.
        // A shorter, currently-active 3-day streak.
        makeCompletion('f', subDays(today, 2)),
        makeCompletion('g', subDays(today, 1)),
        makeCompletion('h', today),
      ];
      const stats = calculateTaskStats(baseTask(), completions);
      expect(stats.streakStatus).toBe('up_to_date');
      expect(stats.currentStreak).toBe(3);
      expect(stats.bestStreak).toBe(5);
    });
  });

  describe('specific_days_of_week frequency', () => {
    it('does not break the streak on non-due days', () => {
      const today = new Date();
      const todayDow = today.getDay();
      const task = baseTask({ frequency: 'specific_days_of_week', daysOfWeek: [todayDow] });
      // Only due on today's weekday -- the other 6 days each week have no completions at all,
      // and should not count as misses.
      const completions = [
        makeCompletion('a', subDays(today, 14)),
        makeCompletion('b', subDays(today, 7)),
        makeCompletion('c', today),
      ];
      const stats = calculateTaskStats(task, completions);
      expect(stats.streakStatus).toBe('up_to_date');
      expect(stats.currentStreak).toBe(3);
      expect(stats.bestStreak).toBe(3);
    });
  });

  describe('days_per_week frequency', () => {
    it('marks the streak up_to_date once quota is met, even mid-week', () => {
      const today = new Date();
      const task = baseTask({ frequency: 'days_per_week', daysPerWeek: 1 });
      const stats = calculateTaskStats(task, [makeCompletion('a', today)]);
      expect(stats.streakStatus).toBe('up_to_date');
      expect(stats.currentStreak).toBe(1);
    });

    it('carries the streak across a met week into the next, and keeps it alive while the current week is still open', () => {
      const today = new Date();
      const twoWeeksAgoStart = startOfWeek(subWeeks(today, 2));
      const oneWeekAgoStart = startOfWeek(subWeeks(today, 1));
      const task = baseTask({ frequency: 'days_per_week', daysPerWeek: 2 });
      // Two consecutive, fully-elapsed weeks each meeting a 2-day quota; nothing logged yet in
      // the still-open current week.
      const completions = [
        makeCompletion('a', addDays(twoWeeksAgoStart, 1)),
        makeCompletion('b', addDays(twoWeeksAgoStart, 2)),
        makeCompletion('c', addDays(oneWeekAgoStart, 1)),
        makeCompletion('d', addDays(oneWeekAgoStart, 2)),
      ];
      const stats = calculateTaskStats(task, completions);
      expect(stats.streakStatus).toBe('expiring');
      expect(stats.currentStreak).toBe(4);
      expect(stats.bestStreak).toBe(4);
    });
  });

  describe('days_per_month frequency', () => {
    it('marks the streak up_to_date once quota is met, even mid-month', () => {
      const today = new Date();
      const task = baseTask({ frequency: 'days_per_month', daysPerMonth: 1 });
      const stats = calculateTaskStats(task, [makeCompletion('a', today)]);
      expect(stats.streakStatus).toBe('up_to_date');
      expect(stats.currentStreak).toBe(1);
    });
  });
});
