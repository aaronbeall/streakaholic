import { getActiveTaskCount, hasReachedActiveTaskLimit, MAX_ACTIVE_TASKS } from '../../app/utils/taskLimits';
import { Task } from '../../app/types';

const makeTask = (id: string, archived = false): Task => ({
  id,
  name: `Task ${id}`,
  icon: 'fire',
  color: '#000000',
  frequency: 'daily',
  daysOfWeek: [],
  daysPerWeek: 0,
  daysPerMonth: 0,
  timesPerDay: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  archived,
  completions: [],
});

describe('getActiveTaskCount', () => {
  it('counts only non-archived tasks', () => {
    const tasks = [makeTask('1'), makeTask('2', true), makeTask('3')];
    expect(getActiveTaskCount(tasks)).toBe(2);
  });

  it('returns 0 for an empty list', () => {
    expect(getActiveTaskCount([])).toBe(0);
  });
});

describe('hasReachedActiveTaskLimit', () => {
  it('is false below the cap', () => {
    const tasks = Array.from({ length: MAX_ACTIVE_TASKS - 1 }, (_, i) => makeTask(`${i}`));
    expect(hasReachedActiveTaskLimit(tasks)).toBe(false);
  });

  it('is true exactly at the cap', () => {
    const tasks = Array.from({ length: MAX_ACTIVE_TASKS }, (_, i) => makeTask(`${i}`));
    expect(hasReachedActiveTaskLimit(tasks)).toBe(true);
  });

  it('is true above the cap', () => {
    const tasks = Array.from({ length: MAX_ACTIVE_TASKS + 3 }, (_, i) => makeTask(`${i}`));
    expect(hasReachedActiveTaskLimit(tasks)).toBe(true);
  });

  it('ignores archived tasks when checking the cap', () => {
    const activeTasks = Array.from({ length: MAX_ACTIVE_TASKS }, (_, i) => makeTask(`active-${i}`));
    const archivedTasks = Array.from({ length: 10 }, (_, i) => makeTask(`archived-${i}`, true));
    expect(hasReachedActiveTaskLimit([...activeTasks, ...archivedTasks])).toBe(true);
    expect(hasReachedActiveTaskLimit(archivedTasks)).toBe(false);
  });
});
