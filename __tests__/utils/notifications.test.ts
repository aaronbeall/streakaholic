import { format, startOfDay } from 'date-fns';
import { Task, TaskCompletion } from '../../app/types';
import { getNextReminderOccurrence } from '../../app/utils/notifications';

const makeCompletion = (date: Date, timesCompleted = 1): TaskCompletion => ({
  id: `${date.getTime()}`,
  taskId: 't1',
  date: format(date, 'yyyy-MM-dd'),
  completedAt: date.toISOString(),
  timesCompleted,
});

const makeTask = (overrides: Partial<Task> = {}): Task => ({
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

// A fixed "now" well clear of midnight in either direction, so time-of-day comparisons in the
// tests below aren't sensitive to the local timezone the suite happens to run in.
const NOW = new Date(2026, 7, 13, 12, 0, 0); // Aug 13 2026, 12:00 local

describe('getNextReminderOccurrence', () => {
  it('returns null when notifications are unset (level 0/off)', () => {
    expect(getNextReminderOccurrence(makeTask(), NOW)).toBeNull();
  });

  it('returns null when the task is archived, even with a nonzero level', () => {
    const task = makeTask({ archived: true, notifications: { level: 1, time: '09:00' } });
    expect(getNextReminderOccurrence(task, NOW)).toBeNull();
  });

  it('returns today at the set time for a daily task not yet completed, time not yet passed', () => {
    const task = makeTask({ notifications: { level: 1, time: '17:00' } });
    const next = getNextReminderOccurrence(task, NOW);
    expect(next).not.toBeNull();
    expect(format(next!, 'yyyy-MM-dd')).toBe(format(NOW, 'yyyy-MM-dd'));
    expect(next!.getHours()).toBe(17);
    expect(next!.getMinutes()).toBe(0);
  });

  it('rolls to tomorrow when today\'s set time has already passed', () => {
    const task = makeTask({ notifications: { level: 1, time: '08:00' } }); // NOW is 12:00
    const next = getNextReminderOccurrence(task, NOW);
    expect(next).not.toBeNull();
    const expectedTomorrow = new Date(NOW);
    expectedTomorrow.setDate(expectedTomorrow.getDate() + 1);
    expect(format(next!, 'yyyy-MM-dd')).toBe(format(expectedTomorrow, 'yyyy-MM-dd'));
    expect(next!.getHours()).toBe(8);
  });

  it('rolls to tomorrow when today is already completed, even if the set time has not passed', () => {
    const task = makeTask({
      notifications: { level: 1, time: '17:00' },
      completions: [makeCompletion(NOW)],
    });
    const next = getNextReminderOccurrence(task, NOW);
    expect(next).not.toBeNull();
    const expectedTomorrow = new Date(NOW);
    expectedTomorrow.setDate(expectedTomorrow.getDate() + 1);
    expect(format(next!, 'yyyy-MM-dd')).toBe(format(expectedTomorrow, 'yyyy-MM-dd'));
  });

  it('a multi-rep task not yet at its daily quota today is not treated as completed', () => {
    const task = makeTask({
      timesPerDay: 2,
      notifications: { level: 1, time: '17:00' },
      completions: [makeCompletion(NOW, 1)], // only 1 of 2 reps logged
    });
    const next = getNextReminderOccurrence(task, NOW);
    expect(format(next!, 'yyyy-MM-dd')).toBe(format(NOW, 'yyyy-MM-dd'));
  });

  it('rolls forward to the next due day for a specific_days_of_week task', () => {
    const targetDow = (NOW.getDay() + 3) % 7; // 3 days from now, whatever weekday that is
    const task = makeTask({
      frequency: 'specific_days_of_week',
      daysOfWeek: [targetDow],
      notifications: { level: 1, time: '09:00' },
    });
    const next = getNextReminderOccurrence(task, NOW);
    expect(next).not.toBeNull();
    expect(next!.getDay()).toBe(targetDow);
    const daysAhead = Math.round((next!.getTime() - startOfDay(NOW).getTime()) / (24 * 60 * 60 * 1000));
    expect(daysAhead).toBe(3);
  });

  it('skips a non-due today for a specific_days_of_week task even if the time has not passed', () => {
    const otherDow = (NOW.getDay() + 1) % 7; // definitely not today
    const task = makeTask({
      frequency: 'specific_days_of_week',
      daysOfWeek: [otherDow],
      notifications: { level: 1, time: '23:59' },
    });
    const next = getNextReminderOccurrence(task, NOW);
    expect(next).not.toBeNull();
    expect(format(next!, 'yyyy-MM-dd')).not.toBe(format(NOW, 'yyyy-MM-dd'));
  });

  it('a quota-based (days_per_week) task is treated as due today regardless of quota progress', () => {
    const task = makeTask({
      frequency: 'days_per_week',
      daysPerWeek: 3,
      notifications: { level: 1, time: '17:00' },
    });
    const next = getNextReminderOccurrence(task, NOW);
    expect(format(next!, 'yyyy-MM-dd')).toBe(format(NOW, 'yyyy-MM-dd'));
  });
});
