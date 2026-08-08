import { format, subDays } from 'date-fns';
import { Task, TaskCompletion } from '../../app/types';
import { buildCompletionCountsByDate, calculateTaskStats, getCompletionCount, isTaskCompleted, StreakScheduleInfo } from '../../app/utils/streaks';

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

const makeFullTask = (overrides: Partial<Task> = {}): Task => ({
  id: 't1',
  name: 'Test Task',
  icon: 'fire',
  color: '#000000',
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

    // Due days (Mon/Wed/Fri) still gate the streak -- missing one still breaks it -- but every
    // day completed in between, due or not, adds to the running count instead of being ignored.
    it('counts non-due days completed in between due days, but a missed due day still resets the chain', () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 7)); // Friday Aug 7 2026
      try {
        const task = baseTask({ frequency: 'specific_days_of_week', daysOfWeek: [1, 3, 5] }); // Mon/Wed/Fri
        const completions = [
          makeCompletion('sat', new Date(2026, 7, 1)),  // Sat -- non-due, completed
          makeCompletion('sun', new Date(2026, 7, 2)),  // Sun -- non-due, completed
          makeCompletion('mon', new Date(2026, 7, 3)),  // Mon -- due, completed (gate met)
          // Tue not completed (non-due, irrelevant either way)
          // Wed not completed -- due day missed, breaks the chain
          makeCompletion('thu', new Date(2026, 7, 6)),  // Thu -- non-due, completed
          makeCompletion('fri', new Date(2026, 7, 7)),  // Fri (today) -- due, completed (gate met)
        ];
        const stats = calculateTaskStats(task, completions);
        expect(stats.streakStatus).toBe('up_to_date');
        expect(stats.currentStreak).toBe(2); // Thu + Fri, restarted after Wed's miss
        expect(stats.bestStreak).toBe(3); // Sat + Sun + Mon, the longest run before the miss
      } finally {
        jest.useRealTimers();
      }
    });

    it('counts bonus days completed ahead of the next due day as still pending, not waiting for that gate to resolve', () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 8)); // Saturday Aug 8 2026
      try {
        const task = baseTask({ frequency: 'specific_days_of_week', daysOfWeek: [1, 3, 5] }); // Mon/Wed/Fri
        const completions = [
          makeCompletion('fri', new Date(2026, 7, 7)), // Fri -- due, completed
          makeCompletion('sat', new Date(2026, 7, 8)), // Sat (today) -- non-due, completed
        ];
        const stats = calculateTaskStats(task, completions);
        expect(stats.streakStatus).toBe('up_to_date');
        expect(stats.currentStreak).toBe(2); // Fri + Sat, counted before Monday's gate even arrives
      } finally {
        jest.useRealTimers();
      }
    });

    // A missed due day still resets *currentStreak* going forward, but the run that just ended
    // keeps every bonus day it accumulated right up to (not including) the actual miss -- it
    // isn't discarded down to 0 just because the gate that would have extended it failed.
    it('retains bonus days in bestStreak up to the miss, not discarding them when the gate fails', () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 7)); // Friday Aug 7 2026
      try {
        const task = baseTask({ frequency: 'specific_days_of_week', daysOfWeek: [1, 3, 5] }); // Mon/Wed/Fri
        const completions = [
          makeCompletion('sat', new Date(2026, 7, 1)),  // Sat -- non-due, completed
          makeCompletion('sun', new Date(2026, 7, 2)),  // Sun -- non-due, completed
          makeCompletion('mon', new Date(2026, 7, 3)),  // Mon -- due, completed (gate met)
          makeCompletion('tue', new Date(2026, 7, 4)),  // Tue -- non-due, completed (tail bonus day)
          // Wed not completed -- due day missed, breaks the chain
          makeCompletion('thu', new Date(2026, 7, 6)),  // Thu -- non-due, completed
          makeCompletion('fri', new Date(2026, 7, 7)),  // Fri (today) -- due, completed (gate met)
        ];
        const stats = calculateTaskStats(task, completions);
        expect(stats.currentStreak).toBe(2); // Thu + Fri, restarted after Wed's miss
        expect(stats.bestStreak).toBe(4); // Sat + Sun + Mon + Tue -- Tue still counts despite Wed's miss
      } finally {
        jest.useRealTimers();
      }
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

    it('carries the streak across a met week into the still-open current week while there is comfortable slack left', () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5)); // Wednesday Aug 5 2026
      try {
        const task = baseTask({ frequency: 'days_per_week', daysPerWeek: 2 });
        // The prior week (Jul 26 - Aug 1) met its 2-day quota; nothing logged yet in the
        // current, still-open week (Aug 2-8) -- but Wed still has Wed/Thu/Fri/Sat (4 days)
        // left to hit 2, so there's slack and this should read as comfortably up_to_date.
        const completions = [
          makeCompletion('a', new Date(2026, 6, 27)),
          makeCompletion('b', new Date(2026, 6, 28)),
        ];
        const stats = calculateTaskStats(task, completions);
        expect(stats.streakStatus).toBe('up_to_date');
        expect(stats.currentStreak).toBe(2);
      } finally {
        jest.useRealTimers();
      }
    });

    // "Expiring" only kicks in once every remaining day of the period -- including today, if
    // today's own chance hasn't been used yet -- is actually required to still hit quota. Any
    // day with slack to spare reads as up_to_date even though quota isn't met yet.
    it('only flags expiring once the remaining days in the week are all required to still hit quota', () => {
      const task1 = baseTask({ frequency: 'days_per_week', daysPerWeek: 1 });
      const priorWeekCompletion = [makeCompletion('a', new Date(2026, 6, 27))]; // meets a prior week's quota of 1

      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5)); // Wed -- Wed/Thu/Fri/Sat (4) left, needs 1: slack
      try {
        expect(calculateTaskStats(task1, priorWeekCompletion).streakStatus).toBe('up_to_date');
      } finally {
        jest.useRealTimers();
      }

      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 8)); // Sat, the week's last day -- needs 1, exactly 1 left
      try {
        expect(calculateTaskStats(task1, priorWeekCompletion).streakStatus).toBe('expiring');
      } finally {
        jest.useRealTimers();
      }

      const task3 = baseTask({ frequency: 'days_per_week', daysPerWeek: 3 });
      const priorWeekCompletions3 = [
        makeCompletion('a', new Date(2026, 6, 27)),
        makeCompletion('b', new Date(2026, 6, 28)),
        makeCompletion('c', new Date(2026, 6, 29)),
      ]; // meets a prior week's quota of 3

      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5)); // Wed -- 4 left, needs 3: 1 day of slack
      try {
        expect(calculateTaskStats(task3, priorWeekCompletions3).streakStatus).toBe('up_to_date');
      } finally {
        jest.useRealTimers();
      }

      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 6)); // Thu -- Thu/Fri/Sat (3) left, needs 3: no slack
      try {
        expect(calculateTaskStats(task3, priorWeekCompletions3).streakStatus).toBe('expiring');
      } finally {
        jest.useRealTimers();
      }
    });

    // A period that fails its quota still contributes its own days to the run that's ending
    // (mirrors the due-day "tail bonus" behavior above) -- it just doesn't link forward, so a
    // fresh mini-streak starts from the next period.
    it('breaks the chain on a genuinely missed period, but keeps that period\'s own days in bestStreak', () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5)); // Wednesday Aug 5 2026
      try {
        const task = baseTask({ frequency: 'days_per_week', daysPerWeek: 2 });
        const completions = [
          makeCompletion('pp1', new Date(2026, 6, 20)), // 2 weeks ago: met (2 days)
          makeCompletion('pp2', new Date(2026, 6, 21)),
          makeCompletion('p1', new Date(2026, 6, 27)),  // last week: missed (only 1 of 2)
          makeCompletion('c1', new Date(2026, 7, 3)),   // this week: met (2 days)
          makeCompletion('c2', new Date(2026, 7, 4)),
        ];
        const stats = calculateTaskStats(task, completions);
        expect(stats.streakStatus).toBe('up_to_date');
        expect(stats.currentStreak).toBe(2); // just this week -- the miss cut the chain
        expect(stats.bestStreak).toBe(3); // 2 (met) + 1 (missed week's own day before it closed)
      } finally {
        jest.useRealTimers();
      }
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

    it('only flags expiring once the remaining days in the month are all required to still hit quota', () => {
      const task = baseTask({ frequency: 'days_per_month', daysPerMonth: 1 });
      const priorMonthCompletion = [makeCompletion('a', new Date(2026, 6, 5))]; // meets July's quota of 1

      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5)); // Aug 5 -- most of the month left, needs 1: slack
      try {
        expect(calculateTaskStats(task, priorMonthCompletion).streakStatus).toBe('up_to_date');
      } finally {
        jest.useRealTimers();
      }

      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 31)); // Aug 31, the month's last day -- needs 1, exactly 1 left
      try {
        expect(calculateTaskStats(task, priorMonthCompletion).streakStatus).toBe('expiring');
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

describe('getCompletionCount / isTaskCompleted', () => {
  it('returns 0 and false when there are no completions at all', () => {
    const task = makeFullTask({ completions: [] });
    expect(getCompletionCount(task)).toBe(0);
    expect(isTaskCompleted(task)).toBe(false);
  });

  it('returns 0 for a date with no matching completion record', () => {
    const today = new Date();
    const task = makeFullTask({
      completions: [makeCompletion('a', subDays(today, 5), 1)],
    });
    expect(getCompletionCount(task, today)).toBe(0);
    expect(isTaskCompleted(task, today)).toBe(false);
  });

  it('reports a partial multi-rep day as not yet completed', () => {
    const today = new Date();
    const task = makeFullTask({
      timesPerDay: 3,
      completions: [makeCompletion('a', today, 2)],
    });
    expect(getCompletionCount(task, today)).toBe(2);
    expect(isTaskCompleted(task, today)).toBe(false);
  });

  it('reports a fully-met multi-rep day as completed', () => {
    const today = new Date();
    const task = makeFullTask({
      timesPerDay: 3,
      completions: [makeCompletion('a', today, 3)],
    });
    expect(getCompletionCount(task, today)).toBe(3);
    expect(isTaskCompleted(task, today)).toBe(true);
  });

  it('defaults to today when no date is passed', () => {
    const task = makeFullTask({
      completions: [makeCompletion('a', new Date(), 1)],
    });
    expect(getCompletionCount(task)).toBe(1);
    expect(isTaskCompleted(task)).toBe(true);
  });
});

describe('buildCompletionCountsByDate', () => {
  it('returns an empty map for no completions', () => {
    expect(buildCompletionCountsByDate([]).size).toBe(0);
  });

  it('maps each date to its timesCompleted, agreeing with getCompletionCount for the same data', () => {
    const today = new Date();
    const completions = [
      makeCompletion('a', subDays(today, 2), 1),
      makeCompletion('b', subDays(today, 1), 3),
      makeCompletion('c', today, 2),
    ];
    const map = buildCompletionCountsByDate(completions);
    const task = makeFullTask({ completions });

    expect(map.size).toBe(3);
    for (const date of [subDays(today, 2), subDays(today, 1), today]) {
      const dateString = format(date, 'yyyy-MM-dd');
      expect(map.get(dateString) ?? 0).toBe(getCompletionCount(task, date));
    }
    expect(map.get(format(subDays(today, 5), 'yyyy-MM-dd')) ?? 0).toBe(0);
  });
});
