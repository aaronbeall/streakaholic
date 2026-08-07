import { format, startOfDay, subDays } from 'date-fns';
import { Task, TaskCompletion } from '../../app/types';
import { eachDayOfRange, getRecentStreaks, getTaskStreakChains } from '../../app/utils/reports';

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
