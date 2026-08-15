export const ACHIEVEMENT_REVEAL_TIMING = {
  initialEmblemDelay: 200,
  titleStart: 1600,
  revealDuration: 450,
  descriptionStartWithoutCounter: 2900,
  descriptionPauseAfterCounter: 300,
  historyPauseAfterDescription: 800,
  // Confetti can start up to 1s after the emblem and fall for up to 3.6s.
  confettiDuration: 4600,
} as const;

export interface AchievementRevealSchedule {
  emblemStart: number;
  titleStart: number;
  descriptionStart: number;
  historyStart: number;
  end: number;
}

export const getAchievementRevealSchedule = ({
  countDuration,
  showsNumber,
  emblemDelay = ACHIEVEMENT_REVEAL_TIMING.initialEmblemDelay,
}: {
  countDuration: number;
  showsNumber: boolean;
  emblemDelay?: number;
}): AchievementRevealSchedule => {
  const descriptionStart = showsNumber
    ? ACHIEVEMENT_REVEAL_TIMING.titleStart
      + countDuration
      + ACHIEVEMENT_REVEAL_TIMING.descriptionPauseAfterCounter
    : ACHIEVEMENT_REVEAL_TIMING.descriptionStartWithoutCounter;
  const historyStart = descriptionStart + ACHIEVEMENT_REVEAL_TIMING.historyPauseAfterDescription;

  return {
    emblemStart: emblemDelay,
    titleStart: ACHIEVEMENT_REVEAL_TIMING.titleStart,
    descriptionStart,
    historyStart,
    end: Math.max(
      historyStart + ACHIEVEMENT_REVEAL_TIMING.revealDuration,
      emblemDelay + ACHIEVEMENT_REVEAL_TIMING.confettiDuration
    ),
  };
};

// Kept as a worklet-safe pure helper so every visual derives the same clamped phase progress from
// the shared elapsed-time clock. The ordinary JS export also makes boundary behavior unit-testable.
export const getAchievementRevealProgress = (
  elapsed: number,
  start: number,
  duration: number
): number => {
  'worklet';
  if (duration <= 0) return elapsed >= start ? 1 : 0;
  return Math.max(0, Math.min(1, (elapsed - start) / duration));
};
