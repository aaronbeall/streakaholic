import { format } from 'date-fns';
import { Task } from '../types';

// Ironman mode: an opt-in, creation-time-only commitment for a single habit. Once on it can
// never be turned off, and past days are locked from the start -- the only day that can change is
// today. There's deliberately no backfill: an Ironman streak only ever contains days that were
// checked off on the day itself, which is what makes it worth badging.
//
// Pure (no RN imports) so it's unit-testable and usable from the store, screens, and share cards
// alike. Every guard here is checked twice: once by the UI (to explain why a tap did nothing)
// and once by taskStore's own mutators (defense in depth, mirroring skipDate's existing guard).

const toDateString = (date: Date) => format(date, 'yyyy-MM-dd');

export const isIronman = (task: Pick<Task, 'ironman'>): boolean => task.ironman === true;

// Completions (add, clear, undo, restore) on `dateString`. Today and anything later is always
// editable here; the calendar's own "no future dates" rule is enforced separately by the caller.
export const canEditCompletionOn = (task: Pick<Task, 'ironman'>, dateString: string, now: Date = new Date()): boolean =>
  !isIronman(task) || dateString >= toDateString(now);

// Skips are free passes, which is exactly what Ironman gives up.
export const canSkipOn = (task: Pick<Task, 'ironman'>, _dateString?: string, _now?: Date): boolean => !isIronman(task);

// Ironman is set once, at creation, and never changes after. An edit can neither turn it off
// nor turn it on for an existing habit (its history was never locked, so it wouldn't be earned).
export const preserveIronmanFields = <T extends Partial<Pick<Task, 'ironman'>>>(previous: Pick<Task, 'ironman'>, next: T): T & Pick<Task, 'ironman'> => ({
  ...next,
  ironman: previous.ironman,
});

// Import merge: once either copy of a habit is Ironman, the merged habit stays Ironman.
export const mergeIronmanFields = (a: Pick<Task, 'ironman'>, b: Pick<Task, 'ironman'>): Pick<Task, 'ironman'> =>
  a.ironman === true || b.ironman === true ? { ironman: true } : {};

export const IRONMAN_LOCKED_DAY_MESSAGE = 'Ironman habits lock past days. Only today can change.';
export const IRONMAN_NO_SKIP_MESSAGE = "Ironman habits don't take skips.";
