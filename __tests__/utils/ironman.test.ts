import { Task } from '../../app/types';
import {
  canEditCompletionOn,
  canSkipOn,
  isIronman,
  mergeIronmanFields,
  preserveIronmanFields,
} from '../../app/utils/ironman';
import { mergeTaskLists } from '../../app/utils/importExport';
import { getTaskStatusInfo } from '../../app/utils/taskStatusSummary';

// Local-time constructors throughout -- every rule here is about the user's own calendar day.
const CREATED = new Date(2026, 10, 15, 9, 0);
const SAME_DAY_LATER = new Date(2026, 10, 15, 22, 30);
const NEXT_DAY = new Date(2026, 10, 16, 0, 5);

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 't1',
  name: 'Run',
  icon: 'run' as Task['icon'],
  color: '#000',
  frequency: 'daily',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  daysPerWeek: 3,
  daysPerMonth: 15,
  timesPerDay: 1,
  createdAt: CREATED.toISOString(),
  updatedAt: CREATED.toISOString(),
  completions: [],
  ...overrides,
});

describe('isIronman', () => {
  it('is only true for an explicit true flag', () => {
    expect(isIronman(makeTask())).toBe(false);
    expect(isIronman(makeTask({ ironman: false }))).toBe(false);
    expect(isIronman(makeTask({ ironman: true }))).toBe(true);
  });
});

describe('canEditCompletionOn', () => {
  it('lets a standard habit edit any day', () => {
    expect(canEditCompletionOn(makeTask(), '2026-01-01', NEXT_DAY)).toBe(true);
  });

  it('locks past days from the creation day on -- there is no backfill', () => {
    const task = makeTask({ ironman: true });
    expect(canEditCompletionOn(task, '2026-11-14', SAME_DAY_LATER)).toBe(false);
    expect(canEditCompletionOn(task, '2026-01-01', SAME_DAY_LATER)).toBe(false);
    expect(canEditCompletionOn(task, '2026-11-15', SAME_DAY_LATER)).toBe(true);
  });

  it('locks yesterday once the day rolls over, but keeps today editable', () => {
    const task = makeTask({ ironman: true });
    expect(canEditCompletionOn(task, '2026-11-15', NEXT_DAY)).toBe(false);
    expect(canEditCompletionOn(task, '2026-11-16', NEXT_DAY)).toBe(true);
  });
});

describe('canSkipOn', () => {
  it('never allows skips on an Ironman habit', () => {
    const task = makeTask({ ironman: true });
    expect(canSkipOn(task, '2026-11-15', SAME_DAY_LATER)).toBe(false);
    expect(canSkipOn(task, '2026-11-10', SAME_DAY_LATER)).toBe(false);
    expect(canSkipOn(makeTask(), '2026-11-16', NEXT_DAY)).toBe(true);
  });
});

describe('preserveIronmanFields', () => {
  it('cannot turn Ironman off', () => {
    const previous = makeTask({ ironman: true });
    expect(preserveIronmanFields(previous, { ...previous, ironman: false }).ironman).toBe(true);
  });

  it('cannot turn Ironman on for an existing standard habit', () => {
    const previous = makeTask();
    expect(preserveIronmanFields(previous, { ...previous, ironman: true }).ironman).toBeUndefined();
  });
});

describe('mergeIronmanFields / mergeTaskLists', () => {
  it('keeps Ironman from either copy', () => {
    expect(mergeIronmanFields({ ironman: true }, {})).toEqual({ ironman: true });
    expect(mergeIronmanFields({}, { ironman: true })).toEqual({ ironman: true });
    expect(mergeIronmanFields({}, {})).toEqual({});
  });

  it('does not let a newer standard copy drop Ironman on import', () => {
    const current = makeTask({ ironman: true });
    const incoming = makeTask({ updatedAt: '2027-01-01T00:00:00.000Z' });
    const [merged] = mergeTaskLists([current], [incoming]);
    expect(merged.ironman).toBe(true);
  });
});

describe('getTaskStatusInfo with Ironman', () => {
  it('does not offer a skip for an Ironman habit and says so in the schedule', () => {
    const info = getTaskStatusInfo(makeTask({ ironman: true }), NEXT_DAY);
    expect(info.canSkipToday).toBe(false);
    expect(info.scheduleSentence).toContain('Ironman');
  });
});
