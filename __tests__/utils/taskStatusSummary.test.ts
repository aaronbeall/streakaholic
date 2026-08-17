import { format } from 'date-fns';
import { Task, TaskStats } from '../../app/types';
import { getTaskStatusInfo } from '../../app/utils/taskStatusSummary';

const makeStats = (overrides: Partial<TaskStats> = {}): TaskStats => ({
  currentStreak: 0,
  lastStreak: 0,
  bestStreak: 0,
  totalCompletions: 0,
  completionRate: 0,
  streakStatus: 'never_started',
  ...overrides,
});

const makeTask = (overrides: Partial<Task> = {}, statsOverrides: Partial<TaskStats> = {}): Task => ({
  id: 't1',
  name: 'Read',
  icon: 'book-open-page-variant',
  color: '#4285F4',
  frequency: 'daily',
  daysOfWeek: [],
  daysPerWeek: 0,
  daysPerMonth: 0,
  timesPerDay: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  completions: [],
  stats: makeStats(statsOverrides),
  ...overrides,
});

const today = new Date();
// Completion dates are local calendar dates throughout the app. Using toISOString() here made
// these tests flip to tomorrow after the local UTC offset crossed midnight (for example, after
// 8 p.m. Eastern during daylight saving time), even though `today` was still the prior local day.
const todayStr = format(today, 'yyyy-MM-dd');

describe('getTaskStatusInfo', () => {
  it('reports a full schedule sentence, including when the task was created, independent of status', () => {
    const task = makeTask({ frequency: 'days_per_week', daysPerWeek: 3, createdAt: new Date('2026-01-15T12:00:00.000Z').toISOString() });
    expect(getTaskStatusInfo(task, today).scheduleSentence).toBe('Happens 3 times a week. Started Jan 15, 2026.');
  });

  describe('frequencyExplainer', () => {
    it('is null for daily (every day is due -- no bonus-day/quota nuance to explain)', () => {
      expect(getTaskStatusInfo(makeTask({ frequency: 'daily' }), today).frequencyExplainer).toBeNull();
    });

    it('is null for a specific_days_of_week selection that collapses to Daily (empty or all 7 days)', () => {
      expect(getTaskStatusInfo(makeTask({ frequency: 'specific_days_of_week', daysOfWeek: [] }), today).frequencyExplainer).toBeNull();
      expect(getTaskStatusInfo(makeTask({ frequency: 'specific_days_of_week', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }), today).frequencyExplainer).toBeNull();
    });

    it('explains week-based quota tracking, without repeating the task name, and clarifying the streak still counts by day', () => {
      const task = makeTask({ name: 'Yoga', frequency: 'days_per_week', daysPerWeek: 4 });
      expect(getTaskStatusInfo(task, today).frequencyExplainer).toBe(
        'Complete 4 days each week to keep your streak alive. Streak length is counted in days.'
      );
    });

    it('explains month-based quota tracking, without repeating the task name, and clarifying the streak still counts by day', () => {
      const task = makeTask({ name: 'Budget Review', frequency: 'days_per_month', daysPerMonth: 10 });
      expect(getTaskStatusInfo(task, today).frequencyExplainer).toBe(
        'Complete 10 days each month to keep your streak alive. Streak length is counted in days.'
      );
    });

    it('explains the miss/bonus rule for a genuine specific_days_of_week subset', () => {
      const task = makeTask({ frequency: 'specific_days_of_week', daysOfWeek: [1, 3, 5] });
      expect(getTaskStatusInfo(task, today).frequencyExplainer).toBe(
        'Missing a due day breaks your streak — but completing it on any other day counts as a bonus day toward your streak.'
      );
    });
  });

  it('has no best-streak badge by default', () => {
    const task = makeTask({}, { currentStreak: 5, bestStreak: 10, streakStatus: 'up_to_date' });
    expect(getTaskStatusInfo(task, today).best).toBeNull();
  });

  it('shows a best-streak badge when currently tied with the record, without repeating the streak count (already covered by status)', () => {
    const task = makeTask({}, { currentStreak: 10, bestStreak: 10, streakStatus: 'up_to_date' });
    const info = getTaskStatusInfo(task, today);
    expect(info.best).not.toBeNull();
    expect(info.best?.text).toBe('This is your best streak yet!');
  });

  describe('status text', () => {
    it('names the current streak length on a non-due, non-completed day, reassuring it is safe', () => {
      const task = makeTask(
        { frequency: 'specific_days_of_week', daysOfWeek: [1, 2, 3, 4, 5] }, // weekdays
        { currentStreak: 5, streakStatus: 'up_to_date' }
      );
      const sunday = new Date('2026-08-16T12:00:00.000Z');
      expect(getTaskStatusInfo(task, sunday).status.text).toBe('Not scheduled for today — your 5-day streak is safe.');
    });

    it('reads as plain "nothing needed" on a non-due day when there is no streak yet to report', () => {
      const task = makeTask(
        { frequency: 'specific_days_of_week', daysOfWeek: [1, 2, 3, 4, 5] }, // weekdays
        { currentStreak: 0, streakStatus: 'never_started' }
      );
      const sunday = new Date('2026-08-16T12:00:00.000Z');
      expect(getTaskStatusInfo(task, sunday).status.text).toBe('Not scheduled for today — nothing needed right now.');
    });

    it('acknowledges a bonus completion on a non-due day as a freshly-started streak', () => {
      const sunday = new Date('2026-08-16T12:00:00.000Z');
      const sundayStr = sunday.toISOString().slice(0, 10);
      const task = makeTask(
        { frequency: 'specific_days_of_week', daysOfWeek: [1, 2, 3, 4, 5] }, // weekdays
        { currentStreak: 1, streakStatus: 'up_to_date' }
      );
      task.completions = [{ id: 'c1', taskId: 't1', date: sundayStr, completedAt: sunday.toISOString(), timesCompleted: 1 }];
      const status = getTaskStatusInfo(task, sunday).status;
      expect(status.text).toBe('Not due today, but you completed it anyway — streak started!');
      expect(status.icon).toBe('fire');
    });

    it('acknowledges a bonus completion on a non-due day as continuing an existing streak', () => {
      const sunday = new Date('2026-08-16T12:00:00.000Z');
      const sundayStr = sunday.toISOString().slice(0, 10);
      const task = makeTask(
        { frequency: 'specific_days_of_week', daysOfWeek: [1, 2, 3, 4, 5] }, // weekdays
        { currentStreak: 6, streakStatus: 'up_to_date' }
      );
      task.completions = [{ id: 'c1', taskId: 't1', date: sundayStr, completedAt: sunday.toISOString(), timesCompleted: 1 }];
      expect(getTaskStatusInfo(task, sunday).status.text).toBe('Not due today, but you completed it anyway, keeping your 6-day streak going.');
    });

    it('ignores partial (not-yet-full-quota) progress on a non-due day -- only a full completion is a bonus day', () => {
      const sunday = new Date('2026-08-16T12:00:00.000Z');
      const sundayStr = sunday.toISOString().slice(0, 10);
      const task = makeTask(
        { frequency: 'specific_days_of_week', daysOfWeek: [1, 2, 3, 4, 5], timesPerDay: 3 }, // weekdays
        { currentStreak: 5, streakStatus: 'up_to_date' }
      );
      task.completions = [{ id: 'c1', taskId: 't1', date: sundayStr, completedAt: sunday.toISOString(), timesCompleted: 1 }];
      expect(getTaskStatusInfo(task, sunday).status.text).toBe('Not scheduled for today — your 5-day streak is safe.');
    });

    it('reports the streak when completed for a single-rep task, with the streak icon', () => {
      const task = makeTask({}, { currentStreak: 5, streakStatus: 'up_to_date' });
      task.completions = [{ id: 'c1', taskId: 't1', date: todayStr, completedAt: today.toISOString(), timesCompleted: 1 }];
      const status = getTaskStatusInfo(task, today).status;
      expect(status.text).toBe('Completed today, keeping your 5-day streak going.');
      expect(status.icon).toBe('fire');
    });

    it('mentions every completion and the streak for a completed multi-completion habit', () => {
      const task = makeTask({ timesPerDay: 3 }, { currentStreak: 2, streakStatus: 'up_to_date' });
      task.completions = [{ id: 'c1', taskId: 't1', date: todayStr, completedAt: today.toISOString(), timesCompleted: 3 }];
      expect(getTaskStatusInfo(task, today).status.text).toBe('Completed all 3 times today, keeping your 2-day streak going.');
    });

    it('calls out a freshly-started streak (currentStreak === 1) distinctly', () => {
      const task = makeTask({}, { currentStreak: 1, streakStatus: 'up_to_date' });
      task.completions = [{ id: 'c1', taskId: 't1', date: todayStr, completedAt: today.toISOString(), timesCompleted: 1 }];
      const status = getTaskStatusInfo(task, today).status;
      expect(status.text).toBe('Completed today — streak started!');
      expect(status.icon).toBe('fire');
    });

    it('names the week when a weekly-goal streak still needs every remaining day', () => {
      const task = makeTask({ frequency: 'days_per_week', daysPerWeek: 5 }, { currentStreak: 3, streakStatus: 'expiring' });
      task.completions = [{ id: 'c1', taskId: 't1', date: todayStr, completedAt: today.toISOString(), timesCompleted: 1 }];
      expect(getTaskStatusInfo(task, today).status.text).toBe('Completed today — every remaining day this week is still needed.');
    });

    it('drops the streak clause when completed with no current streak (edge case)', () => {
      const task = makeTask({}, { currentStreak: 0, streakStatus: 'up_to_date' });
      task.completions = [{ id: 'c1', taskId: 't1', date: todayStr, completedAt: today.toISOString(), timesCompleted: 1 }];
      expect(getTaskStatusInfo(task, today).status.text).toBe('Completed today.');
    });

    it('reports partial progress for a multi-rep task not yet at quota', () => {
      const task = makeTask({ timesPerDay: 3 }, { currentStreak: 4, streakStatus: 'expiring' });
      task.completions = [{ id: 'c1', taskId: 't1', date: todayStr, completedAt: today.toISOString(), timesCompleted: 1 }];
      expect(getTaskStatusInfo(task, today).status.text).toBe('1 of 3 done today — keep going.');
    });

    it('"expiring" reads as an actionable call to complete today, naming the streak length at risk', () => {
      const task = makeTask({}, { currentStreak: 7, streakStatus: 'expiring' });
      expect(getTaskStatusInfo(task, today).status.text).toBe('Complete today to keep your 7-day streak alive!');
    });

    it('"expiring" falls back to generic wording for the (unrealistic) zero-streak edge case', () => {
      const task = makeTask({}, { currentStreak: 0, streakStatus: 'expiring' });
      expect(getTaskStatusInfo(task, today).status.text).toBe('Complete today to keep your streak alive!');
    });

    it('"expired" plainly says the streak ended and names its length', () => {
      const task = makeTask({}, { currentStreak: 0, lastStreak: 9, bestStreak: 12, streakStatus: 'expired' });
      expect(getTaskStatusInfo(task, today).status.text).toBe('Your 9-day streak ended — complete today to start fresh.');
    });

    it('"expired" falls back to generic wording when there is no prior streak length to name', () => {
      const task = makeTask({}, { currentStreak: 0, lastStreak: 0, streakStatus: 'expired' });
      expect(getTaskStatusInfo(task, today).status.text).toBe('Your streak ended — complete today to start fresh.');
    });

    it('"never_started" invites getting going', () => {
      const task = makeTask({}, { streakStatus: 'never_started' });
      expect(getTaskStatusInfo(task, today).status.text).toContain('great day to begin');
    });

    it('"up_to_date" on a weekly-goal habit says this week\'s goal is met', () => {
      const task = makeTask({ frequency: 'days_per_week', daysPerWeek: 3 }, { currentStreak: 3, streakStatus: 'up_to_date' });
      expect(getTaskStatusInfo(task, today).status.text).toContain('You’ve reached this week’s goal');
    });
  });
});
