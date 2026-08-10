import { format, startOfDay, subDays } from 'date-fns';
import { Task, TaskCompletion } from '../../app/types';
import { eachDayOfRange, getDayStreakState, getRecentStreaks, getTaskStreakChains, isConnectedDay } from '../../app/utils/reports';
import { calculateTaskStats } from '../../app/utils/streaks';

const makeCompletion = (id: string, date: Date): TaskCompletion => ({
  id,
  taskId: 't1',
  date: format(date, 'yyyy-MM-dd'),
  completedAt: date.toISOString(),
  timesCompleted: 1,
});

const baseTask = (overrides: Partial<Task> = {}): Task => ({
  id: 't1',
  name: 'Task',
  icon: 'star' as Task['icon'],
  color: '#000',
  frequency: 'daily',
  daysOfWeek: [],
  daysPerWeek: 0,
  daysPerMonth: 0,
  timesPerDay: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  completions: [],
  ...overrides,
});

// Mirrors how the real app always has `.stats` precomputed and stored on the task object --
// getDayStreakState reads task.stats.currentStreak for the still-open "pending tail" case.
const withStats = (task: Task): Task => ({ ...task, stats: calculateTaskStats(task, task.completions || []) });

describe('getTaskStreakChains', () => {
  it('returns no chains with no completions', () => {
    expect(getTaskStreakChains(baseTask())).toEqual([]);
  });

  it('daily: reconstructs an old closed streak and a shorter current one (matches calculateTaskStats\'s best/current)', () => {
    const today = new Date();
    const task = baseTask({
      completions: [
        makeCompletion('a', subDays(today, 10)),
        makeCompletion('b', subDays(today, 9)),
        makeCompletion('c', subDays(today, 8)),
        makeCompletion('d', subDays(today, 7)),
        makeCompletion('e', subDays(today, 6)),
        // gap on -5, -4, -3
        makeCompletion('f', subDays(today, 2)),
        makeCompletion('g', subDays(today, 1)),
        makeCompletion('h', today),
      ],
    });
    const chains = getTaskStreakChains(task);
    expect(chains).toHaveLength(2);
    expect(chains[0].length).toBe(5);
    expect(chains[0].startDate).toEqual(startOfDay(subDays(today, 10)));
    expect(chains[0].endDate).toEqual(startOfDay(subDays(today, 6)));
    expect(chains[1].length).toBe(3);
    expect(chains[1].startDate).toEqual(startOfDay(subDays(today, 2)));
    expect(chains[1].endDate).toEqual(startOfDay(today));
  });

  it('specific_days_of_week: chains bonus days with the due-day gate, breaking on a real miss (matches the streaks.ts bonus-day test)', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 7)); // Friday Aug 7 2026
    try {
      const task = baseTask({
        frequency: 'specific_days_of_week',
        daysOfWeek: [1, 3, 5], // Mon/Wed/Fri
        completions: [
          makeCompletion('sat', new Date(2026, 7, 1)),
          makeCompletion('sun', new Date(2026, 7, 2)),
          makeCompletion('mon', new Date(2026, 7, 3)), // due, met
          makeCompletion('tue', new Date(2026, 7, 4)),
          // Wed 8/5 missed -- due day, breaks the chain
          makeCompletion('thu', new Date(2026, 7, 6)),
          makeCompletion('fri', new Date(2026, 7, 7)), // due, met (today)
        ],
      });
      const chains = getTaskStreakChains(task);
      expect(chains).toHaveLength(2);
      expect(chains[0].length).toBe(4); // Sat+Sun+Mon+Tue
      expect(chains[0].startDate).toEqual(new Date(2026, 7, 1));
      // Ends at Tuesday, the last real day it was active -- not the Wednesday gate that failed
      // (that day was never actually completed, so it can't be the streak's own end date).
      expect(chains[0].endDate).toEqual(new Date(2026, 7, 4));
      expect(chains[1].length).toBe(2); // Thu+Fri
      expect(chains[1].startDate).toEqual(new Date(2026, 7, 6));
      expect(chains[1].endDate).toEqual(new Date(2026, 7, 7));
    } finally {
      jest.useRealTimers();
    }
  });

  it('days_per_week: chains link across a met week but break on a genuinely missed one (matches the streaks.ts quota-miss test)', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5)); // Wednesday Aug 5 2026
    try {
      const task = baseTask({
        frequency: 'days_per_week',
        daysPerWeek: 2,
        completions: [
          makeCompletion('pp1', new Date(2026, 6, 20)), // 2 weeks ago: met (2 days)
          makeCompletion('pp2', new Date(2026, 6, 21)),
          makeCompletion('p1', new Date(2026, 6, 27)),  // last week: missed (only 1 of 2)
          makeCompletion('c1', new Date(2026, 7, 3)),   // this week: met (2 days)
          makeCompletion('c2', new Date(2026, 7, 4)),
        ],
      });
      const chains = getTaskStreakChains(task);
      expect(chains).toHaveLength(2);
      // 2 (met) + 1 (the missed week's own day, still credited to the run that's ending) --
      // matches streaks.ts's equivalent bestStreak=3 test for this exact scenario.
      expect(chains[0].length).toBe(3);
      expect(chains[1].length).toBe(2); // this week -- the miss cut the chain
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('getDayStreakState', () => {
  const countsFrom = (completions: TaskCompletion[]): Map<string, number> => {
    const map = new Map<string, number>();
    for (const c of completions) map.set(c.date, (map.get(c.date) ?? 0) + c.timesCompleted);
    return map;
  };

  it('specific_days_of_week: a non-due day only connects when a real chain actually reaches it -- being non-due alone isn\'t enough', () => {
    // Bug fixed 2026-08-09: a non-due day used to unconditionally read as 'connected' just for
    // being non-due, even with zero streak history to actually connect. 2026-01-06 is a Tuesday;
    // daysOfWeek only includes Monday, so it's never due -- but with no chains at all, nothing
    // is passing through it, so it's a soft miss, not a connecting dash.
    const specificTask = withStats(baseTask({ frequency: 'specific_days_of_week', daysOfWeek: [1] }));
    expect(getDayStreakState(specificTask, new Date(2026, 0, 6), [], new Map())).toBe('softMiss');
  });

  it('specific_days_of_week: a non-due day connects when it falls inside a real chain\'s span', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 7)); // Friday Aug 7 2026
    try {
      // Reuses getTaskStreakChains' own "chains bonus days with the due-day gate" fixture:
      // chain0 spans Sat Aug 1 - Tue Aug 4, so Sun Aug 2 (non-due) sits inside it.
      const completions = [
        makeCompletion('sat', new Date(2026, 7, 1)),
        makeCompletion('sun', new Date(2026, 7, 2)),
        makeCompletion('mon', new Date(2026, 7, 3)),
        makeCompletion('tue', new Date(2026, 7, 4)),
        // Wed 8/5 missed -- due day, breaks the chain
        makeCompletion('thu', new Date(2026, 7, 6)),
        makeCompletion('fri', new Date(2026, 7, 7)),
      ];
      const task = withStats(baseTask({ frequency: 'specific_days_of_week', daysOfWeek: [1, 3, 5], completions }));
      const chains = getTaskStreakChains(task);
      const counts = countsFrom(completions);
      expect(getDayStreakState(task, new Date(2026, 7, 2), chains, counts)).toBe('connected'); // Sun, non-due, inside chain0
    } finally {
      jest.useRealTimers();
    }
  });

  it('specific_days_of_week: a non-due day right after a hard miss does not connect across it (regression)', () => {
    // Matches the exact reported scenario: Jul 5 (Sun) + Jul 6 (Mon) completed -- a real chain
    // -- Jul 8 (Wed, due) missed -- the hard miss that closes the chain -- and Jul 9 (Thu,
    // non-due) must NOT read as connected, since the chain already closed the day before.
    jest.useFakeTimers().setSystemTime(new Date(2026, 6, 10)); // Friday Jul 10 2026
    try {
      const completions = [
        makeCompletion('sun', new Date(2026, 6, 5)),
        makeCompletion('mon', new Date(2026, 6, 6)),
      ];
      const task = withStats(baseTask({ frequency: 'specific_days_of_week', daysOfWeek: [0, 1, 3], completions }));
      const chains = getTaskStreakChains(task);
      const counts = countsFrom(completions);
      expect(getDayStreakState(task, new Date(2026, 6, 8), chains, counts)).toBe('hardMiss'); // Wed: the break
      expect(getDayStreakState(task, new Date(2026, 6, 9), chains, counts)).toBe('softMiss'); // Thu, non-due: NOT connected
    } finally {
      jest.useRealTimers();
    }
  });

  it('daily/specific_days_of_week: a due day with no prior chain at all is a soft miss, not a hard miss', () => {
    // A brand new task that's never been completed hasn't broken anything yet -- there's no
    // streak for an empty due day to have threatened.
    const dueTask = withStats(baseTask({ frequency: 'daily' }));
    expect(getDayStreakState(dueTask, new Date(2026, 0, 4), [], new Map())).toBe('softMiss');

    const specificTask = withStats(baseTask({ frequency: 'specific_days_of_week', daysOfWeek: [1] }));
    expect(getDayStreakState(specificTask, new Date(2026, 0, 5), [], new Map())).toBe('softMiss'); // Mon, due
  });

  it('daily: every missed due day after a real chain closes is a hard miss -- permanently, no fading, even long after the streak has expired', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 0, 10));
    try {
      // A real 3-day streak (Jan 1-3), then nothing -- broke on Jan 4 and has stayed broken
      // since. Per explicit user direction, every missed due day since then is still a hard
      // miss -- a required day doesn't stop having been required just because time has passed.
      const completions = [
        makeCompletion('a', new Date(2026, 0, 1)),
        makeCompletion('b', new Date(2026, 0, 2)),
        makeCompletion('c', new Date(2026, 0, 3)),
      ];
      const task = withStats(baseTask({ frequency: 'daily', completions }));
      const chains = getTaskStreakChains(task);
      const counts = countsFrom(completions);
      expect(getDayStreakState(task, new Date(2026, 0, 4), chains, counts)).toBe('hardMiss'); // the actual break
      expect(getDayStreakState(task, new Date(2026, 0, 5), chains, counts)).toBe('hardMiss'); // still required
      expect(getDayStreakState(task, new Date(2026, 0, 9), chains, counts)).toBe('hardMiss'); // 6 days later: still required
    } finally {
      jest.useRealTimers();
    }
  });

  describe('days_per_week: connects within a period that met its own quota, hard-misses every empty day of one that didn\'t', () => {
    // Reuses the exact fixture from getTaskStreakChains' own "chains link across a met week but
    // break on a genuinely missed one" test above, so the two stay consistent with each other.
    let task: Task;
    let chains: ReturnType<typeof getTaskStreakChains>;
    let counts: Map<string, number>;

    beforeAll(() => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 5)); // Wednesday Aug 5 2026
      const completions = [
        makeCompletion('pp1', new Date(2026, 6, 20)), // week 1 (Jul 19-25): met (2 days)
        makeCompletion('pp2', new Date(2026, 6, 21)),
        makeCompletion('p1', new Date(2026, 6, 27)),  // week 2 (Jul 26 - Aug 1): failed (1 of 2)
        makeCompletion('c1', new Date(2026, 7, 3)),   // week 3 (Aug 2-8, current): met (2 days)
        makeCompletion('c2', new Date(2026, 7, 4)),
      ];
      task = withStats(baseTask({ frequency: 'days_per_week', daysPerWeek: 2, completions }));
      chains = getTaskStreakChains(task);
      counts = countsFrom(completions);
    });

    afterAll(() => jest.useRealTimers());

    it('connects every empty day of a week that met its own quota', () => {
      // Week 1 met quota (2/2) on its own -- every one of its empty days connects, including
      // Jul 19 itself (before either of that week's own completions).
      expect(getDayStreakState(task, new Date(2026, 6, 19), chains, counts)).toBe('connected');
      expect(getDayStreakState(task, new Date(2026, 6, 22), chains, counts)).toBe('connected');
      expect(getDayStreakState(task, new Date(2026, 6, 25), chains, counts)).toBe('connected');
    });

    it('hard-misses every empty day of a week that failed its own quota -- including ones before its own real completion', () => {
      // Week 2 only reached 1 of 2 -- per explicit user direction, ALL of its empty days are a
      // hard miss (we can't know which specific one(s) would have been "the" required day), not
      // just the ones chronologically after Jul 27's own completion.
      expect(getDayStreakState(task, new Date(2026, 6, 26), chains, counts)).toBe('hardMiss'); // before Jul 27
      expect(getDayStreakState(task, new Date(2026, 6, 28), chains, counts)).toBe('hardMiss'); // after Jul 27
      expect(getDayStreakState(task, new Date(2026, 7, 1), chains, counts)).toBe('hardMiss');
    });

    it('connects the current period\'s pending tail, even before that period\'s own first completion', () => {
      // Aug 2 (Sun) is the first day of "this week" -- before either of this week's own
      // completions (Aug 3/4). This week already met quota, so the whole period connects.
      expect(getDayStreakState(task, new Date(2026, 7, 2), chains, counts)).toBe('connected');
    });
  });

  it('days_per_week: stays a hard miss indefinitely, no fading, long after the failing week', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 5)); // a month after the failing week
    try {
      const completions = [
        makeCompletion('a', new Date(2026, 6, 20)),
        makeCompletion('b', new Date(2026, 6, 21)),
        makeCompletion('c', new Date(2026, 6, 27)), // the only day of the failing week
      ];
      const task = withStats(baseTask({ frequency: 'days_per_week', daysPerWeek: 2, completions }));
      const chains = getTaskStreakChains(task);
      const counts = countsFrom(completions);
      // A week well after the failing week (Jul 26 - Aug 1), with zero completions of its own --
      // per explicit user direction, quota types don't get a "long dead, fade to neutral"
      // exception any more than due-day types do: this elapsed week failed its own quota (0 of
      // 2), so every empty day in it is a hard miss.
      expect(getDayStreakState(task, new Date(2026, 7, 10), chains, counts)).toBe('hardMiss');
    } finally {
      jest.useRealTimers();
    }
  });

  describe('days_per_month: same per-period logic, scaled to the month', () => {
    it('a day inside a month that met its own quota connects, and that carries into the still-empty next month as a pending tail', () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 1, 15)); // Feb 15 2026
      try {
        const completions = [
          makeCompletion('a', new Date(2026, 0, 3)),  // January: met (2 days)
          makeCompletion('b', new Date(2026, 0, 25)),
        ];
        const task = withStats(baseTask({ frequency: 'days_per_month', daysPerMonth: 2, completions }));
        const chains = getTaskStreakChains(task);
        const counts = countsFrom(completions);
        // A day inside January (which met its own quota) connects.
        expect(getDayStreakState(task, new Date(2026, 0, 15), chains, counts)).toBe('connected');
        // February has no completions yet, but it's still the current, undecided period --
        // connects regardless of January's own outcome.
        expect(getDayStreakState(task, new Date(2026, 1, 10), chains, counts)).toBe('connected');
      } finally {
        jest.useRealTimers();
      }
    });

    it('a failed first-ever period\'s own empty days are still a hard miss -- quota types get no "never touched" exception', () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 1, 15)); // Feb 15 2026
      try {
        // January is the task's very first period and it fails (1 of 2). Unlike due-day types
        // (which soften to a soft miss when there's no prior chain at all), quota types judge
        // strictly per-period: January elapsed short of its own quota, so every one of its empty
        // days is a hard miss regardless of it being the task's first-ever attempt.
        const completions = [makeCompletion('a', new Date(2026, 0, 3))];
        const task = withStats(baseTask({ frequency: 'days_per_month', daysPerMonth: 2, completions }));
        const chains = getTaskStreakChains(task);
        const counts = countsFrom(completions);
        expect(chains).toEqual([]); // isolated failing segment forms no chain (getTaskStreakChains)
        expect(getDayStreakState(task, new Date(2026, 0, 15), chains, counts)).toBe('hardMiss');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  it('a task with zero history ever still hard-misses an elapsed period\'s empty days once that period is in the past', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 12)); // Wednesday Aug 12 2026
    try {
      const task = withStats(baseTask({ frequency: 'days_per_week', daysPerWeek: 3, completions: [] }));
      // Aug 3 falls in the week of Aug 2-8, already elapsed relative to "today" (Aug 12) -- 0 of
      // 3 met, so it's a hard miss, not a soft one; quota types don't get an exception for
      // having literally zero history.
      expect(getDayStreakState(task, new Date(2026, 7, 3), [], new Map())).toBe('hardMiss');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('isConnectedDay', () => {
  it('a completed day is always connected', () => {
    const task = withStats(baseTask({ completions: [makeCompletion('a', new Date(2026, 0, 5))] }));
    const counts = new Map([['2026-01-05', 1]]);
    expect(isConnectedDay(task, new Date(2026, 0, 5), [], counts)).toBe(true);
  });

  it('a future day is never connected', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 0, 5));
    try {
      const task = withStats(baseTask());
      expect(isConnectedDay(task, new Date(2026, 0, 6), [], new Map())).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('an empty past day inside a chain is connected; outside every chain it is not', () => {
    const task = withStats(baseTask({
      frequency: 'days_per_week',
      daysPerWeek: 2,
      completions: [makeCompletion('a', new Date(2026, 0, 5)), makeCompletion('b', new Date(2026, 0, 8))],
    }));
    const chains = getTaskStreakChains(task);
    const counts = new Map([['2026-01-05', 1], ['2026-01-08', 1]]);
    // Jan 6/7 sit between the two completed days of the same chain.
    expect(isConnectedDay(task, new Date(2026, 0, 6), chains, counts)).toBe(true);
    // A week before any completion exists isn't part of any chain.
    expect(isConnectedDay(task, new Date(2025, 11, 29), chains, counts)).toBe(false);
  });

  it('today is connected exactly when there is a live streak reaching into it', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 0, 6));
    try {
      const liveTask = withStats(baseTask({ completions: [makeCompletion('a', new Date(2026, 0, 5))] }));
      expect(isConnectedDay(liveTask, new Date(2026, 0, 6), [], new Map())).toBe(true);

      const deadTask = withStats(baseTask({ completions: [] }));
      expect(isConnectedDay(deadTask, new Date(2026, 0, 6), [], new Map())).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('getRecentStreaks', () => {
  it('merges chains across tasks, sorted newest-first, capped to the limit', () => {
    const today = new Date();
    const taskA = baseTask({
      id: 'a',
      name: 'A',
      completions: [makeCompletion('a1', subDays(today, 20)), makeCompletion('a2', subDays(today, 19))],
    });
    const taskB = baseTask({
      id: 'b',
      name: 'B',
      completions: [makeCompletion('b1', subDays(today, 1)), makeCompletion('b2', today)],
    });
    const results = getRecentStreaks([taskA, taskB], 10);
    expect(results).toHaveLength(2);
    expect(results[0].taskId).toBe('b'); // ends today -- most recent
    expect(results[1].taskId).toBe('a');
  });

  it('respects the limit', () => {
    const today = new Date();
    // 3 separate two-day streaks, far enough apart to each be their own chain.
    const task = baseTask({
      completions: [
        makeCompletion('a1', subDays(today, 21)), makeCompletion('a2', subDays(today, 20)),
        makeCompletion('b1', subDays(today, 11)), makeCompletion('b2', subDays(today, 10)),
        makeCompletion('c1', subDays(today, 1)), makeCompletion('c2', today),
      ],
    });
    expect(getRecentStreaks([task], 2)).toHaveLength(2);
  });

  it('omits 1-day streaks -- a single completed day isn\'t really a "streak"', () => {
    const today = new Date();
    const task = baseTask({
      completions: [
        makeCompletion('lone', subDays(today, 10)), // isolated single day, not part of any run
        makeCompletion('a1', subDays(today, 1)),    // a real 2-day streak
        makeCompletion('a2', today),
      ],
    });
    const results = getRecentStreaks([task], 10);
    expect(results).toHaveLength(1);
    expect(results[0].length).toBe(2);
  });
});

describe('eachDayOfRange', () => {
  it('returns every calendar day inclusive of both ends', () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 0, 5);
    const days = eachDayOfRange(start, end);
    expect(days).toHaveLength(5);
    expect(days[0]).toEqual(new Date(2026, 0, 1));
    expect(days[4]).toEqual(new Date(2026, 0, 5));
  });

  it('returns a single day when start equals end', () => {
    const day = new Date(2026, 0, 1);
    expect(eachDayOfRange(day, day)).toHaveLength(1);
  });
});
