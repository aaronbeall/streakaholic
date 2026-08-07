import { Task, TasksExport } from '../../app/types';
import {
  createTasksExport,
  getLatestModifiedAt,
  isImportableTask,
  mergeTaskLists,
  parseTasksImport,
  TASKS_EXPORT_SCHEMA_VERSION,
} from '../../app/utils/importExport';

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
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  completions: [],
  ...overrides,
});

describe('isImportableTask', () => {
  it('accepts an object with string id and name', () => {
    expect(isImportableTask(makeTask())).toBe(true);
  });

  it('rejects non-objects and objects missing id/name', () => {
    expect(isImportableTask(null)).toBe(false);
    expect(isImportableTask('task')).toBe(false);
    expect(isImportableTask({ name: 'Task' })).toBe(false);
    expect(isImportableTask({ id: 't1' })).toBe(false);
  });
});

describe('createTasksExport', () => {
  it('wraps tasks with schema/version/metadata', () => {
    const tasks = [makeTask()];
    const result = createTasksExport(tasks, '1.0.0');
    expect(result.schemaVersion).toBe(TASKS_EXPORT_SCHEMA_VERSION);
    expect(result.taskCount).toBe(1);
    expect(result.appVersion).toBe('1.0.0');
    expect(result.tasks).toBe(tasks);
    expect(typeof result.exportId).toBe('string');
    expect(result.exportId.length).toBeGreaterThan(0);
    expect(() => new Date(result.exportedAt).toISOString()).not.toThrow();
  });

  it('generates a distinct exportId per call', () => {
    const a = createTasksExport([], '1.0.0');
    const b = createTasksExport([], '1.0.0');
    expect(a.exportId).not.toBe(b.exportId);
  });
});

describe('parseTasksImport', () => {
  it('parses a legacy bare task array with no metadata', () => {
    const tasks = [makeTask()];
    const result = parseTasksImport(JSON.stringify(tasks));
    expect(result.meta).toBeNull();
    expect(result.tasks).toEqual(tasks);
  });

  it('throws on an invalid legacy task array', () => {
    expect(() => parseTasksImport(JSON.stringify([{ foo: 'bar' }]))).toThrow('Invalid task list');
  });

  it('parses a wrapped TasksExport with metadata', () => {
    const tasks = [makeTask()];
    const wrapped: TasksExport = {
      schemaVersion: 1,
      exportId: 'abc123',
      exportedAt: '2026-01-02T00:00:00.000Z',
      appVersion: '1.0.0',
      taskCount: 1,
      tasks,
    };
    const result = parseTasksImport(JSON.stringify(wrapped));
    expect(result.meta).toEqual({ exportId: 'abc123', exportedAt: '2026-01-02T00:00:00.000Z', schemaVersion: 1 });
    expect(result.tasks).toEqual(tasks);
  });

  it('throws on a wrapped export with an invalid task list', () => {
    const wrapped = {
      schemaVersion: 1,
      exportId: 'abc123',
      exportedAt: '2026-01-02T00:00:00.000Z',
      appVersion: '1.0.0',
      taskCount: 1,
      tasks: [{ foo: 'bar' }],
    };
    expect(() => parseTasksImport(JSON.stringify(wrapped))).toThrow('Invalid task list');
  });

  it('throws on an unrecognized format', () => {
    expect(() => parseTasksImport(JSON.stringify({ hello: 'world' }))).toThrow('Unrecognized file format');
    expect(() => parseTasksImport(JSON.stringify(42))).toThrow('Unrecognized file format');
  });
});

describe('getLatestModifiedAt', () => {
  it('returns null for an empty list', () => {
    expect(getLatestModifiedAt([])).toBeNull();
  });

  it('returns the latest updatedAt (falling back to createdAt)', () => {
    const tasks = [
      makeTask({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z' }),
      makeTask({ id: 'b', createdAt: '2026-01-10T00:00:00.000Z', updatedAt: undefined as unknown as string }),
    ];
    expect(getLatestModifiedAt(tasks)).toBe('2026-01-10T00:00:00.000Z');
  });
});

describe('mergeTaskLists', () => {
  it('keeps tasks that only exist in one list', () => {
    const current = [makeTask({ id: 'a' })];
    const incoming = [makeTask({ id: 'b' })];
    const merged = mergeTaskLists(current, incoming);
    expect(merged.map(t => t.id).sort()).toEqual(['a', 'b']);
  });

  it('prefers the newer task by updatedAt on a match', () => {
    const current = [makeTask({ id: 'a', name: 'Old name', updatedAt: '2026-01-01T00:00:00.000Z' })];
    const incoming = [makeTask({ id: 'a', name: 'New name', updatedAt: '2026-01-05T00:00:00.000Z' })];
    const merged = mergeTaskLists(current, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('New name');
  });

  it('unions completions by id instead of concatenating, with the newer task winning shared ids', () => {
    const current = [
      makeTask({
        id: 'a',
        updatedAt: '2026-01-01T00:00:00.000Z',
        completions: [
          { id: 'c1', taskId: 'a', date: '2026-01-01', completedAt: '2026-01-01T00:00:00.000Z', timesCompleted: 1 },
        ],
      }),
    ];
    const incoming = [
      makeTask({
        id: 'a',
        updatedAt: '2026-01-05T00:00:00.000Z',
        completions: [
          { id: 'c1', taskId: 'a', date: '2026-01-01', completedAt: '2026-01-01T00:00:00.000Z', timesCompleted: 2 },
          { id: 'c2', taskId: 'a', date: '2026-01-02', completedAt: '2026-01-02T00:00:00.000Z', timesCompleted: 1 },
        ],
      }),
    ];
    const merged = mergeTaskLists(current, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].completions).toHaveLength(2);
    const c1 = merged[0].completions?.find(c => c.id === 'c1');
    expect(c1?.timesCompleted).toBe(2); // newer task's version of the shared completion wins
  });
});
