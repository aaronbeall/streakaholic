import {
  getPendingAchievementPresentation,
  partitionAchievementPresentations,
  promoteFirstAchievementAlert,
} from '../../app/utils/achievementCelebrations';
import { Achievement, AchievementKind } from '../../app/utils/achievements';

const achievement = (id: string, kind: AchievementKind): Achievement => ({
  id,
  kind,
  dedupScope: `scope-${id}`,
  earnedAt: '2026-08-14T12:00:00.000Z',
});

describe('getPendingAchievementPresentation', () => {
  const first = achievement('1', 'first-completion');
  const second = achievement('2', 'streak-2');
  const alert = achievement('3', 'streak-5');

  it('combines every currently queued full-screen unlock', () => {
    expect(getPendingAchievementPresentation([first, second], [])).toEqual({
      type: 'celebration',
      achievements: [first, second],
    });
  });

  it('returns the oldest quick alert when no full-screen unlock is waiting', () => {
    expect(getPendingAchievementPresentation([], [alert, second])).toEqual({
      type: 'alert',
      achievement: alert,
    });
  });

  it('prioritizes a full-screen celebration over queued quick alerts', () => {
    expect(getPendingAchievementPresentation([first], [alert])).toEqual({
      type: 'celebration',
      achievements: [first],
    });
  });

  it('returns null for an empty queue', () => {
    expect(getPendingAchievementPresentation([], [])).toBeNull();
  });
});

describe('partitionAchievementPresentations', () => {
  it('assigns muted unlocks to alerts while preserving order within both queues', () => {
    const fullFirst = achievement('1', 'first-completion');
    const alertFirst = achievement('2', 'streak-2');
    const fullSecond = achievement('3', 'milestone-10');
    const alertSecond = achievement('4', 'streak-5');

    expect(partitionAchievementPresentations(
      [fullFirst, alertFirst, fullSecond, alertSecond],
      ['streak-2', 'streak-5']
    )).toEqual({
      celebrations: [fullFirst, fullSecond],
      alerts: [alertFirst, alertSecond],
    });
  });
});

describe('promoteFirstAchievementAlert', () => {
  it('atomically moves only the current alert to the front of the celebration queue', () => {
    const waitingCelebration = achievement('1', 'first-completion');
    const currentAlert = achievement('2', 'streak-2');
    const nextAlert = achievement('3', 'streak-5');

    expect(promoteFirstAchievementAlert(
      [waitingCelebration],
      [currentAlert, nextAlert]
    )).toEqual({
      pendingCelebrations: [currentAlert, waitingCelebration],
      pendingAlerts: [nextAlert],
    });
  });

  it('does nothing when there is no current alert', () => {
    expect(promoteFirstAchievementAlert([], [])).toBeNull();
  });
});
