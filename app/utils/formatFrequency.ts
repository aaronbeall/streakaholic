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

// A short, human-readable label for a task's schedule -- "3x weekly", "Weekdays", "Mon, Wed, Fri"
// -- for surfacing in UI (the Task Details header badge) rather than the raw frequency/
// daysOfWeek/daysPerWeek/daysPerMonth fields those screens otherwise only use for calculation.
// Deliberately reads like a person describing their own habit, not the underlying data model:
// no "specific_days_of_week" or "days_per_month" terminology, no raw day-index arrays. Per
// explicit user direction, quantities read as "Nx <adverb>" with a space (not a slash) --
// "3x weekly", "4x daily" -- since that's the more natural, pharmacy-label-style English phrasing
// ("take 2x daily") rather than a terser but less readable "3x/week"/"4x/day".
export const formatFrequencyLabel = (task: StreakScheduleInfo): string => {
  const base = (() => {
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
  })();

  if (task.timesPerDay <= 1) return base;
  // "Daily" is redundant once a times-per-day count is shown -- "4x daily" already implies every
  // day on its own, so there's nothing the combined "Daily · 4x daily" adds. Every other base
  // (a specific day selection, or a week/month quota) still needs to combine with it, since
  // neither implies "every day" on its own.
  return base === 'Daily' ? `${task.timesPerDay}x daily` : `${base} · ${task.timesPerDay}x daily`;
};
