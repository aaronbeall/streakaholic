import { formatFrequencyLabel } from '../../app/utils/formatFrequency';
import { StreakScheduleInfo } from '../../app/utils/streaks';

const baseSchedule = (overrides: Partial<StreakScheduleInfo> = {}): StreakScheduleInfo => ({
  frequency: 'daily',
  daysOfWeek: [],
  daysPerWeek: 0,
  daysPerMonth: 0,
  timesPerDay: 1,
  ...overrides,
});

describe('formatFrequencyLabel', () => {
  it('daily reads as "Daily"', () => {
    expect(formatFrequencyLabel(baseSchedule({ frequency: 'daily' }))).toBe('Daily');
  });

  describe('specific_days_of_week', () => {
    it('treats an empty selection as Daily, matching isDueOnDate\'s own fallback', () => {
      expect(formatFrequencyLabel(baseSchedule({ frequency: 'specific_days_of_week', daysOfWeek: [] }))).toBe('Daily');
    });

    it('treats all 7 days selected as Daily', () => {
      expect(formatFrequencyLabel(baseSchedule({ frequency: 'specific_days_of_week', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }))).toBe('Daily');
    });

    it('recognizes Mon-Fri as "Weekdays" regardless of input order', () => {
      expect(formatFrequencyLabel(baseSchedule({ frequency: 'specific_days_of_week', daysOfWeek: [1, 2, 3, 4, 5] }))).toBe('Weekdays');
      expect(formatFrequencyLabel(baseSchedule({ frequency: 'specific_days_of_week', daysOfWeek: [5, 3, 1, 4, 2] }))).toBe('Weekdays');
    });

    it('recognizes Sat/Sun as "Weekends"', () => {
      expect(formatFrequencyLabel(baseSchedule({ frequency: 'specific_days_of_week', daysOfWeek: [6, 0] }))).toBe('Weekends');
    });

    it('lists an arbitrary subset as sorted 3-letter abbreviations', () => {
      expect(formatFrequencyLabel(baseSchedule({ frequency: 'specific_days_of_week', daysOfWeek: [5, 1, 3] }))).toBe('Mon, Wed, Fri');
    });
  });

  it('days_per_week reads as "Nx weekly"', () => {
    expect(formatFrequencyLabel(baseSchedule({ frequency: 'days_per_week', daysPerWeek: 3 }))).toBe('3x weekly');
  });

  it('days_per_month reads as "Nx monthly"', () => {
    expect(formatFrequencyLabel(baseSchedule({ frequency: 'days_per_month', daysPerMonth: 10 }))).toBe('10x monthly');
  });

  it('appends a times-per-day suffix only when greater than 1', () => {
    expect(formatFrequencyLabel(baseSchedule({ frequency: 'daily', timesPerDay: 1 }))).toBe('Daily');
    expect(formatFrequencyLabel(baseSchedule({ frequency: 'days_per_week', daysPerWeek: 3, timesPerDay: 1 }))).toBe('3x weekly');
    expect(formatFrequencyLabel(baseSchedule({ frequency: 'days_per_week', daysPerWeek: 3, timesPerDay: 2 }))).toBe('3x weekly · 2x daily');
  });

  it('collapses "Daily · Nx daily" to just "Nx daily" -- "Daily" adds nothing once a times-per-day count is shown', () => {
    expect(formatFrequencyLabel(baseSchedule({ frequency: 'daily', timesPerDay: 3 }))).toBe('3x daily');
    // Same collapse applies to specific_days_of_week selections that resolve to "Daily" too
    // (empty or all-7 selection), since they render identically to the plain 'daily' case.
    expect(formatFrequencyLabel(baseSchedule({ frequency: 'specific_days_of_week', daysOfWeek: [], timesPerDay: 4 }))).toBe('4x daily');
  });
});
