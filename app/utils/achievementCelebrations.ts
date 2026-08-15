import { Achievement, AchievementKind } from './achievements';

export type PendingAchievementPresentation =
  | { type: 'alert'; achievement: Achievement }
  | { type: 'celebration'; achievements: Achievement[] };

export const partitionAchievementPresentations = (
  achievements: Achievement[],
  mutedKinds: AchievementKind[]
): { celebrations: Achievement[]; alerts: Achievement[] } => {
  const muted = new Set(mutedKinds);
  const celebrations: Achievement[] = [];
  const alerts: Achievement[] = [];
  for (const achievement of achievements) {
    (muted.has(achievement.kind) ? alerts : celebrations).push(achievement);
  }
  return { celebrations, alerts };
};

// Tapping a quick alert expands that exact unlock into the full-screen presentation. Keep this
// queue transition as one operation so no render can briefly lose the achievement or show the
// next alert underneath it. Prepending also gives the user's explicit tap priority over any
// full-screen unlock that happens to arrive in the same turn.
export const promoteFirstAchievementAlert = (
  pendingCelebrations: Achievement[],
  pendingAlerts: Achievement[]
): { pendingCelebrations: Achievement[]; pendingAlerts: Achievement[] } | null => {
  const achievement = pendingAlerts[0];
  if (!achievement) return null;

  return {
    pendingCelebrations: [achievement, ...pendingCelebrations],
    pendingAlerts: pendingAlerts.slice(1),
  };
};

// Plans only the next presentation. Full-screen work always wins, regardless of how many snoozed
// quick alerts are waiting. Callers snapshot a celebration batch for its lifetime so unlocks
// appended later remain queued for the next screen.
export const getPendingAchievementPresentation = (
  pendingCelebrations: Achievement[],
  pendingAlerts: Achievement[]
): PendingAchievementPresentation | null => {
  if (pendingCelebrations.length > 0) {
    return { type: 'celebration', achievements: pendingCelebrations };
  }

  const alert = pendingAlerts[0];
  return alert ? { type: 'alert', achievement: alert } : null;
};
