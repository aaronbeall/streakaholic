import { Task } from '../../app/types';
import {
  canEditCompletionOn,
  canSkipOn,
  isIronman,
  isIronmanBackfillOpen,
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

describe('isIronmanBackfillOpen', () => {
  it('is open on the creation day until locked', () => {
    expect(isIronmanBackfillOpen(makeTask({ ironman: true }), SAME_DAY_LATER)).toBe(true);
  });

  it('closes when the user locks in', () => {
    const task = makeTask({ ironman: true, ironmanLockedAt: SAME_DAY_LATER.toISOString() });
    expect(isIronmanBackfillOpen(task, SAME_DAY_LATER)).toBe(false);
  });

  it('closes automatically once the creation day ends', () => {
    expect(isIronmanBackfillOpen(makeTask({ ironman: true }), NEXT_DAY)).toBe(false);
  });

  it('never applies to a standard habit', () => {
    expect(isIronmanBackfillOpen(makeTask(), SAME_DAY_LATER)).toBe(false);
  });
});

describe('canEditCompletionOn', () => {
  it('lets a standard habit edit any day', () => {
    expect(canEditCompletionOn(makeTask(), '2026-01-01', NEXT_DAY)).toBe(true);
  });

  it('allows any past day during the backfill window', () => {
    expect(canEditCompletionOn(makeTask({ ironman: true }), '2026-01-01', SAME_DAY_LATER)).toBe(true);
  });

  it('locks past days once the window closes, but keeps today editable', () => {
    const task = makeTask({ ironman: true });
    expect(canEditCompletionOn(task, '2026-11-15', NEXT_DAY)).toBe(false);
    expect(canEditCompletionOn(task, '2026-11-16', NEXT_DAY)).toBe(true);
  });

  it('locks past days right after Lock in, even on the creation day', () => {
    const task = makeTask({ ironman: true, ironmanLockedAt: SAME_DAY_LATER.toISOString() });
    expect(canEditCompletionOn(task, '2026-11-14', SAME_DAY_LATER)).toBe(false);
    expect(canEditCompletionOn(task, '2026-11-15', SAME_DAY_LATER)).toBe(true);
  });
});

describe('canSkipOn', () => {
  it('allows skips only while backfilling', () => {
    const task = makeTask({ ironman: true });
    expect(canSkipOn(task, '2026-11-10', SAME_DAY_LATER)).toBe(true);
    expect(canSkipOn(task, '2026-11-16', NEXT_DAY)).toBe(false);
    expect(canSkipOn(makeTask(), '2026-11-16', NEXT_DAY)).toBe(true);
  });
});

describe('preserveIronmanFields', () => {
  it('cannot turn Ironman off', () => {
    const previous = makeTask({ ironman: true, ironmanLockedAt: 'L' });
    const next = preserveIronmanFields(previous, { ...previous, ironman: false, ironmanLockedAt: undefined });
    expect(next.ironman).toBe(true);
    expect(next.ironmanLockedAt).toBe('L');
  });

  it('cannot turn Ironman on for an existing standard habit', () => {
    const previous = makeTask();
    const next = preserveIronmanFields(previous, { ...previous, ironman: true });
    expect(next.ironman).toBeUndefined();
  });
});

describe('mergeIronmanFields / mergeTaskLists', () => {
  it('keeps Ironman and the earliest lock from either copy', () => {
    expect(mergeIronmanFields({ ironman: true, ironmanLockedAt: 'b' }, { ironmanLockedAt: 'a' }))
      .toEqual({ ironman: true, ironmanLockedAt: 'a' });
    expect(mergeIronmanFields({}, {})).toEqual({});
  });

  it('does not let a newer standard copy drop Ironman on import', () => {
    const current = makeTask({ ironman: true, ironmanLockedAt: '2026-11-15T23:00:00.000Z' });
    const incoming = makeTask({ updatedAt: '2027-01-01T00:00:00.000Z' });
    const [merged] = mergeTaskLists([current], [incoming]);
    expect(merged.ironman).toBe(true);
    expect(merged.ironmanLockedAt).toBe('2026-11-15T23:00:00.000Z');
  });
});

describe('getTaskStatusInfo with Ironman', () => {
  it('does not offer a skip for a locked Ironman habit and says so in the schedule', () => {
    const task = makeTask({ ironman: true, ironmanLockedAt: CREATED.toISOString() });
    const info = getTaskStatusInfo(task, NEXT_DAY);
    expect(info.canSkipToday).toBe(false);
    expect(info.scheduleSentence).toContain('Ironman');
  });
});
