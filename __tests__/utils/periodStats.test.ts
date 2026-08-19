import { addDays, endOfWeek, format, startOfWeek } from 'date-fns';
import { getExpectedPeriodTotal, PeriodQuotaSchedule } from '../../app/utils/periodStats';

const schedule = (overrides: Partial<PeriodQuotaSchedule> = {}): PeriodQuotaSchedule => ({
  frequency: 'daily',
  daysOfWeek: [],
  daysPerWeek: 0,
  daysPerMonth: 0,
  ...overrides,
});

describe('getExpectedPeriodTotal', () => {
  it('returns the nominal period length for a daily task, given a matching date range', () => {
    // Walks the real [from, to] range (see the skip-awareness tests below), so this exercises a
    // range that actually matches its own nominalDays, the same as every real caller does
    // (TaskCard always passes a week/30-day span alongside the matching nominalDays).
    const today = new Date();
    expect(getExpectedPeriodTotal(schedule(), today, addDays(today, 6), 7)).toBe(7);
    expect(getExpectedPeriodTotal(schedule(), today, addDays(today, 29), 30)).toBe(30);
  });

  it('counts matching weekdays for specific_days_of_week over a full week', () => {
    const today = new Date();
    const weekStart = startOfWeek(today);
    const weekEnd = endOfWeek(today);
    const task = schedule({ frequency: 'specific_days_of_week', daysOfWeek: [1, 3, 5] }); // Mon/Wed/Fri
    expect(getExpectedPeriodTotal(task, weekStart, weekEnd, 7)).toBe(3);
  });

  it('treats an empty daysOfWeek selection as due every day', () => {
    const today = new Date();
    const weekStart = startOfWeek(today);
    const weekEnd = endOfWeek(today);
    const task = schedule({ frequency: 'specific_days_of_week', daysOfWeek: [] });
    expect(getExpectedPeriodTotal(task, weekStart, weekEnd, 7)).toBe(7);
  });

  it('floors specific_days_of_week at 1 even when no days in range match', () => {
    const monday = new Date(2026, 0, 5); // a known Monday
    const task = schedule({ frequency: 'specific_days_of_week', daysOfWeek: [2] }); // Tuesday only
    expect(getExpectedPeriodTotal(task, monday, monday, 7)).toBe(1);
  });

  it('prorates a days_per_week quota to the requested nominal window', () => {
    const today = new Date();
    const task = schedule({ frequency: 'days_per_week', daysPerWeek: 3 });
    expect(getExpectedPeriodTotal(task, today, today, 7)).toBe(3); // unscaled for a week box
    expect(getExpectedPeriodTotal(task, today, today, 30)).toBe(13); // round(3 * 30/7)
  });

  it('prorates a days_per_month quota to the requested nominal window', () => {
    const today = new Date();
    const task = schedule({ frequency: 'days_per_month', daysPerMonth: 10 });
    expect(getExpectedPeriodTotal(task, today, today, 30)).toBe(10); // unscaled for a month box
    expect(getExpectedPeriodTotal(task, today, today, 7)).toBe(2); // round(10 * 7/30)
  });

  it('falls back to a minimum of 1 for a zero/unset quota', () => {
    const today = new Date();
    expect(getExpectedPeriodTotal(schedule({ frequency: 'days_per_week', daysPerWeek: 0 }), today, today, 7)).toBe(1);
    expect(getExpectedPeriodTotal(schedule({ frequency: 'days_per_month', daysPerMonth: 0 }), today, today, 30)).toBe(1);
  });

  it('excuses a skipped due day from a daily task\'s own period total', () => {
    const monday = new Date(2026, 0, 5); // a known Monday
    const sunday = new Date(2026, 0, 11);
    const task = schedule({ frequency: 'daily', skippedDates: ['2026-01-07'] }); // skipped Wednesday
    expect(getExpectedPeriodTotal(task, monday, sunday, 7)).toBe(6);
  });

  it('excuses a skipped due day from a specific_days_of_week task\'s own period total', () => {
    const monday = new Date(2026, 0, 5); // a known Monday
    const sunday = new Date(2026, 0, 11);
    const task = schedule({ frequency: 'specific_days_of_week', daysOfWeek: [1, 3, 5], skippedDates: ['2026-01-07'] }); // Mon/Wed/Fri, skipped Wednesday
    expect(getExpectedPeriodTotal(task, monday, sunday, 7)).toBe(2);
  });

  it('ignores skippedDates for quota frequencies (skip is not supported there)', () => {
    const today = new Date();
    const task = schedule({ frequency: 'days_per_week', daysPerWeek: 3, skippedDates: [format(today, 'yyyy-MM-dd')] });
    expect(getExpectedPeriodTotal(task, today, today, 7)).toBe(3);
  });
});
