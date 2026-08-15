import {
  COUNT_DURATION_MAX,
  COUNT_DURATION_MIN,
  formatAchievementCount,
  getAchievementCountUpDuration,
} from '../../app/utils/achievementCountUp';

describe('achievement count-up', () => {
  it('uses the minimum duration for values at or below one', () => {
    expect(getAchievementCountUpDuration(0)).toBe(COUNT_DURATION_MIN);
    expect(getAchievementCountUpDuration(1)).toBe(COUNT_DURATION_MIN);
  });

  it('scales duration logarithmically and caps it at the maximum', () => {
    expect(getAchievementCountUpDuration(10)).toBeCloseTo(1666.67, 1);
    expect(getAchievementCountUpDuration(100)).toBeCloseTo(2333.33, 1);
    expect(getAchievementCountUpDuration(1000)).toBe(COUNT_DURATION_MAX);
    expect(getAchievementCountUpDuration(100000)).toBe(COUNT_DURATION_MAX);
  });

  it('rounds and groups displayed integers without relying on Intl', () => {
    expect(formatAchievementCount(0)).toBe('0');
    expect(formatAchievementCount(1.49)).toBe('1');
    expect(formatAchievementCount(1.5)).toBe('2');
    expect(formatAchievementCount(999)).toBe('999');
    expect(formatAchievementCount(1000)).toBe('1,000');
    expect(formatAchievementCount(1234567.4)).toBe('1,234,567');
  });

  it('clamps transient negative values to zero', () => {
    expect(formatAchievementCount(-1)).toBe('0');
  });
});
