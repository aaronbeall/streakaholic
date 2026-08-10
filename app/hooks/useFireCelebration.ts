import { useCallback, useEffect, useState } from 'react';
import { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { POP_PEAK_SCALE } from '../components/TaskProgressIcon';
import { Task } from '../types';
import { getStreakBadgeStyle } from '../utils/streaks';

// Extracted from TaskCard.tsx's CardTask (2026-08-10) so any other place that shows a task's
// streak badge (TaskHeader) can reuse the exact same "pop + particle burst" celebration on the
// same trigger (transitioning into the 'fire' badge state) instead of reimplementing it.
//
// Fires whenever `task.stats.currentStreak` changes while the badge is (or becomes) 'fire' --
// note this is keyed on `currentStreak` itself, not just the icon, so completing/undoing/
// completing again still retriggers even if the streak number returns to a value it already hit
// (5->6->5->6), since `celebrationKey` forces ParticleSystem to remount on every genuine
// transition rather than silently no-opping on a still-mounted instance.
export const useFireCelebration = (task: Task) => {
  const badgeScale = useSharedValue(1);
  const [showParticles, setShowParticles] = useState(false);
  const [celebrationKey, setCelebrationKey] = useState(0);
  const handleParticlesComplete = useCallback(() => setShowParticles(false), []);

  const streakBadgeStyle = getStreakBadgeStyle(task);

  useEffect(() => {
    if (streakBadgeStyle?.icon === 'fire') {
      // Same pop shape as the task icon's own completion animation (explicit snap to a
      // guaranteed peak, then a fast multi-bounce spring settle) -- see TaskProgressIcon.tsx.
      badgeScale.value = withSequence(
        withTiming(POP_PEAK_SCALE, { duration: 100, easing: Easing.out(Easing.cubic) }),
        withSpring(1, {
          damping: 23,
          stiffness: 1000,
          energyThreshold: 0.0001,
        })
      );
      setCelebrationKey(k => k + 1);
      setShowParticles(true);
    }
  }, [task.stats?.currentStreak, streakBadgeStyle?.icon]);

  const badgeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }]
  }));

  return { streakBadgeStyle, badgeAnimatedStyle, showParticles, celebrationKey, handleParticlesComplete };
};
