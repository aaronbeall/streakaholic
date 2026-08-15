import {
  ACHIEVEMENT_REVEAL_TIMING,
  getAchievementRevealProgress,
  getAchievementRevealSchedule,
} from '../../app/utils/achievementRevealTimeline';

describe('getAchievementRevealSchedule', () => {
  it('waits for a counter to finish before scheduling the description and history', () => {
    expect(getAchievementRevealSchedule({ showsNumber: true, countDuration: 2400 })).toEqual({
      emblemStart: 200,
      titleStart: 1600,
      descriptionStart: 4300,
      historyStart: 5100,
      end: 5550,
    });
  });

  it('uses the fixed non-counter sequence and accepts an immediate replay emblem', () => {
    expect(getAchievementRevealSchedule({
      showsNumber: false,
      countDuration: 0,
      emblemDelay: 0,
    })).toEqual({
      emblemStart: 0,
      titleStart: 1600,
      descriptionStart: 2900,
      historyStart: 3700,
      end: 4600,
    });
  });
});

describe('getAchievementRevealProgress', () => {
  it('clamps before, during, and after a reveal window', () => {
    const duration = ACHIEVEMENT_REVEAL_TIMING.revealDuration;
    expect(getAchievementRevealProgress(999, 1000, duration)).toBe(0);
    expect(getAchievementRevealProgress(1225, 1000, duration)).toBe(0.5);
    expect(getAchievementRevealProgress(1450, 1000, duration)).toBe(1);
    expect(getAchievementRevealProgress(2000, 1000, duration)).toBe(1);
  });
});
