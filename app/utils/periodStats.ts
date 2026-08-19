import { addDays } from 'date-fns';
import { FrequencyType } from '../types';
import { isDueOnDate } from './streaks';

export interface PeriodQuotaSchedule {
  frequency: FrequencyType;
  daysOfWeek: number[];
  daysPerWeek: number;
  daysPerMonth: number;
  // Only meaningful for daily/specific_days_of_week -- see Task.skippedDates' own comment
  // (types/index.ts). Optional so existing callers/tests that don't care about skip are unaffected.
  skippedDates?: string[];
}

// The "x/N" total for a period box (e.g. TaskCard's "This week" / "Past 30 days") is the task's
// own due/quota schedule scaled to that period, not a blind 7 or 30 -- a `specific_days_of_week`
// task counts its actual matching weekdays in `[from, to]`; a `days_per_week`/`days_per_month`
// quota task prorates its target to the period's `nominalDays` (7 for a week box, 30 for a month
// box), so e.g. a "2 days a month" task shows a small fractional-rounded target in the week box
// instead of 30. Prorating can let the actual completed count land above this total (more
// due-days landed in the window than the average, or a quota task ran ahead of pace) -- that's
// fine, it's meant to be treated as a bonus by the caller rather than a hard ceiling.
export const getExpectedPeriodTotal = (task: PeriodQuotaSchedule, from: Date, to: Date, nominalDays: number): number => {
  switch (task.frequency) {
    case 'specific_days_of_week':
    case 'daily': {
      // Walks isDueOnDate day-by-day (instead of a raw schedule match, or -- for daily -- just
      // returning nominalDays outright) specifically so a skipped due day is excused from this
      // total the same way it's excused from the streak requirement itself: skip doesn't support
      // days_per_week/days_per_month (see Task.skippedDates), so those two branches below stay
      // untouched.
      let count = 0;
      let cursor = from;
      while (cursor <= to) {
        if (isDueOnDate(task, cursor)) count++;
        cursor = addDays(cursor, 1);
      }
      return Math.max(1, count);
    }
    case 'days_per_week':
      return Math.max(1, Math.round((task.daysPerWeek || 1) * (nominalDays / 7)));
    case 'days_per_month':
      return Math.max(1, Math.round((task.daysPerMonth || 1) * (nominalDays / 30)));
    default:
      return nominalDays;
  }
};
