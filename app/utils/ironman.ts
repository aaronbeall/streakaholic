import { format } from 'date-fns';
import { Task } from '../types';

// Ironman mode: an opt-in, creation-time-only commitment for a single habit. Once on it can
// never be turned off, and past days are locked -- the only edits allowed are to today. The one
// exception is a one-time backfill window right after creation, so a habit someone has already
// been doing can start with its real history instead of a fake zero.
//
// The backfill window stays open until the user taps "Lock in" (sets `ironmanLockedAt`) or the
// creation day ends, whichever comes first -- an automatic close so the window can't be left
// open indefinitely as a disguised edit-anything escape hatch.
//
// Pure (no RN imports) so it's unit-testable and usable from the store, screens, and share cards
// alike. Every guard here is checked twice: once by the UI (to explain why a tap did nothing)
// and once by taskStore's own mutators (defense in depth, mirroring skipDate's existing guard).

type IronmanFields = Pick<Task, 'ironman' | 'ironmanLockedAt' | 'createdAt'>;

const toDateString = (date: Date) => format(date, 'yyyy-MM-dd');

export const isIronman = (task: Pick<Task, 'ironman'>): boolean => task.ironman === true;

export const isIronmanBackfillOpen = (task: IronmanFields, now: Date = new Date()): boolean =>
  isIronman(task)
  && !task.ironmanLockedAt
  && toDateString(new Date(task.createdAt)) === toDateString(now);

// Completions (add, clear, undo, restore) on `dateString`. Today and anything later is always
// editable here; the calendar's own "no future dates" rule is enforced separately by the caller.
export const canEditCompletionOn = (task: IronmanFields, dateString: string, now: Date = new Date()): boolean =>
  !isIronman(task)
  || dateString >= toDateString(now)
  || isIronmanBackfillOpen(task, now);

// Skips are free passes, which is exactly what Ironman gives up -- allowed only while backfilling
// real history (e.g. marking a past vacation), never after the history is locked, today included.
export const canSkipOn = (task: IronmanFields, _dateString: string, now: Date = new Date()): boolean =>
  !isIronman(task) || isIronmanBackfillOpen(task, now);

// Ironman is set once, at creation, and never changes after. An edit can neither turn it off
// nor turn it on for an existing habit (its history was never locked, so it wouldn't be earned);
// the lock timestamp can only ever be set, never cleared.
export const preserveIronmanFields = <T extends Partial<IronmanFields>>(previous: IronmanFields, next: T): T & Pick<Task, 'ironman' | 'ironmanLockedAt'> => ({
  ...next,
  ironman: previous.ironman,
  ironmanLockedAt: previous.ironmanLockedAt ?? (previous.ironman ? next.ironmanLockedAt : undefined),
});

// Import merge: once either copy of a habit is Ironman, the merged habit stays Ironman, and the
// earliest lock wins (an older export can't reopen a backfill window that's already closed).
export const mergeIronmanFields = (a: Pick<Task, 'ironman' | 'ironmanLockedAt'>, b: Pick<Task, 'ironman' | 'ironmanLockedAt'>): Pick<Task, 'ironman' | 'ironmanLockedAt'> => {
  const ironman = a.ironman === true || b.ironman === true;
  if (!ironman) return {};
  const locks = [a.ironmanLockedAt, b.ironmanLockedAt].filter((v): v is string => !!v).sort();
  return locks.length > 0 ? { ironman, ironmanLockedAt: locks[0] } : { ironman };
};

export const IRONMAN_LOCKED_DAY_MESSAGE = 'Ironman habits lock past days. Only today can change.';
export const IRONMAN_NO_SKIP_MESSAGE = "Ironman habits don't take skips.";
