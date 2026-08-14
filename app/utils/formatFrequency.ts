import { StreakScheduleInfo } from './streaks';

// Deliberately a local copy, not imported from app/constants/task.tsx -- that module pulls in
// @expo/vector-icons (for ALL_ICONS' glyph map), which drags a native font-loading dependency
// into this otherwise-pure, jest-testable utils file. Index 0 = Sunday, matching both
// `Date.getDay()` and `Task.daysOfWeek`'s own indexing (see streaks.ts's isDueOnDate) -- keep in
// sync with the identical array in AddTaskScreen.tsx's day-of-week picker if either changes.
const DAY_ABBREVIATIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const WEEKDAY_INDEXES = [1, 2, 3, 4, 5];
const WEEKEND_INDEXES = [0, 6];

const sameDays = (a: number[], b: number[]): boolean =>
  a.length === b.length && [...a].sort().every((day, i) => day === [...b].sort()[i]);

// The base schedule description, before any timesPerDay combination -- "Daily", "Weekdays",
// "Weekends", a comma-joined day-abbreviation list, or "Nx weekly"/"Nx monthly". Extracted as its
// own export (2026-08-14) so `formatFrequencySentence` below can build a full sentence around the
// exact same base `formatFrequencyLabel` already derives, rather than re-deriving which
// frequency/daysOfWeek combination means what a second time.
export const getFrequencyBaseLabel = (task: StreakScheduleInfo): string => {
  switch (task.frequency) {
    case 'daily':
      return 'Daily';
    case 'specific_days_of_week': {
      // Matches isDueOnDate's own "no days selected" fallback (streaks.ts) -- an empty
      // selection is treated as always-due, so the label should read the same way.
      if (!task.daysOfWeek || task.daysOfWeek.length === 0 || task.daysOfWeek.length === 7) {
        return 'Daily';
      }
      if (sameDays(task.daysOfWeek, WEEKDAY_INDEXES)) return 'Weekdays';
      if (sameDays(task.daysOfWeek, WEEKEND_INDEXES)) return 'Weekends';
      return [...task.daysOfWeek].sort().map(day => DAY_ABBREVIATIONS[day]).join(', ');
    }
    case 'days_per_week':
      return `${task.daysPerWeek}x weekly`;
    case 'days_per_month':
      return `${task.daysPerMonth}x monthly`;
  }
};

// A short, human-readable label for a task's schedule -- "3x weekly", "Weekdays", "Mon, Wed, Fri"
// -- for surfacing in UI (the Task Details header badge) rather than the raw frequency/
// daysOfWeek/daysPerWeek/daysPerMonth fields those screens otherwise only use for calculation.
// Deliberately reads like a person describing their own habit, not the underlying data model:
// no "specific_days_of_week" or "days_per_month" terminology, no raw day-index arrays. Per
// explicit user direction, quantities read as "Nx <adverb>" with a space (not a slash) --
// "3x weekly", "4x daily" -- since that's the more natural, pharmacy-label-style English phrasing
// ("take 2x daily") rather than a terser but less readable "3x/week"/"4x/day".
export const formatFrequencyLabel = (task: StreakScheduleInfo): string => {
  const base = getFrequencyBaseLabel(task);
  if (task.timesPerDay <= 1) return base;
  // "Daily" is redundant once a times-per-day count is shown -- "4x daily" already implies every
  // day on its own, so there's nothing the combined "Daily · 4x daily" adds. Every other base
  // (a specific day selection, or a week/month quota) still needs to combine with it, since
  // neither implies "every day" on its own.
  return base === 'Daily' ? `${task.timesPerDay}x daily` : `${base} · ${task.timesPerDay}x daily`;
};

// A full-sentence version of the same schedule (2026-08-14, for the task-details Status popover's
// own Schedule row, which has room for a real sentence rather than a compact badge label). Builds
// off `getFrequencyBaseLabel` -- the same base `formatFrequencyLabel` uses -- rather than
// re-deriving what each frequency/daysOfWeek combination means a second time; only the grammar
// wrapped around it is new. The base's own output space is small and fully enumerable (owned by
// this same file, so it can't silently drift out from under this function): exact matches for
// "Daily"/"Weekdays"/"Weekends", a `x weekly`/`x monthly` suffix check for the two quota shapes,
// and anything else falls through as a day-abbreviation list ("Mon, Wed, Fri").
export const formatFrequencySentence = (task: StreakScheduleInfo): string => {
  const base = getFrequencyBaseLabel(task);
  const dayClause =
    base === 'Daily' ? 'Happens every day'
      : base === 'Weekdays' ? 'Happens on weekdays'
        : base === 'Weekends' ? 'Happens on weekends'
          : base.endsWith('x weekly') ? `Happens ${base.replace('x weekly', '')} times a week`
            : base.endsWith('x monthly') ? `Happens ${base.replace('x monthly', '')} times a month`
              : `Happens on ${base}`; // a specific day-abbreviation list

  if (task.timesPerDay <= 1) return `${dayClause}.`;
  // Same "Daily collapses once a times-per-day count is shown" reasoning as formatFrequencyLabel's
  // own combination rule -- "Happens 4 times a day" already implies every day, so restating "every
  // day" alongside it would be redundant.
  return base === 'Daily'
    ? `Happens ${task.timesPerDay} times a day.`
    : `${dayClause}, ${task.timesPerDay} times a day.`;
};
