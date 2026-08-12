import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Achievement, dedupKey, detectCompletionAchievements, detectRetroactiveAchievements, ONE_TIME_KINDS } from '../utils/achievements';
import { Task } from '../types';

interface AchievementsStore {
  // Full history, persisted -- what TrophiesScreen lists.
  achievements: Achievement[];
  // Not persisted -- a queue AchievementCelebration drains one at a time. Deliberately separate from
  // `achievements` itself (rather than e.g. an `unseen` flag on each record) so the celebration
  // UI has nothing to do with history bookkeeping at all.
  pendingCelebrations: Achievement[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  // Called right after a real completion (see taskStore.completeTask) -- detects whatever this
  // one completion newly earned, records it into history, and queues it for celebration. A
  // complete no-op if nothing new was earned.
  recordCompletionAchievements: (prevTask: Task, nextTask: Task, allTasks: Task[], date: Date) => void;
  dismissCurrentCelebration: () => void;
  // Replays an already-earned achievement's celebration on demand (TrophiesScreen -- tapping an
  // unlocked card) -- just re-queues the exact same record, no new id/earnedAt assigned and
  // `achievements` history untouched, since nothing new was earned, only re-shown.
  queueCelebration: (achievement: Achievement) => void;
  // Manual "catch up" scan (TrophiesScreen's own button) -- evaluates every currently-qualifying,
  // not-yet-earned achievement against the given tasks' *current* stats and records whatever
  // qualifies. Deliberately never touches `pendingCelebrations` -- per explicit user direction
  // this should never trigger the full-screen celebration, only a plain summary toast the caller
  // builds from the returned count. Returns how many new achievements were recorded.
  runRetroactiveScan: (activeTasks: Task[]) => number;
}

type PersistedAchievementsState = { achievements: Achievement[] };

// 'achievements' is a brand-new AsyncStorage key with no pre-Zustand legacy shape to migrate
// (unlike tasks/appSettings/lastImport, which predate the Zustand migration and need custom
// PersistStorage to detect their old bare-value shape) -- createJSONStorage's plain envelope is
// sufficient here.
export const useAchievementsStore = create<AchievementsStore>()(
  persist(
    (set, get) => ({
      achievements: [],
      pendingCelebrations: [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),

      recordCompletionAchievements: (prevTask, nextTask, allTasks, date) => {
        const alreadyEarnedScopes = new Set(
          get().achievements
            .filter(a => ONE_TIME_KINDS.includes(a.kind))
            .map(a => dedupKey(a.kind, a.dedupScope))
        );
        const newlyEarned = detectCompletionAchievements(prevTask, nextTask, allTasks, date, alreadyEarnedScopes);
        if (newlyEarned.length === 0) return;

        // Index-suffixed, not bare Date.now() -- a single completion can legitimately earn more
        // than one achievement in the same synchronous call (e.g. crossing a streak tier and a
        // completion-count tier together), and millisecond-resolution timestamps alone could
        // collide across that batch.
        const earnedAt = new Date().toISOString();
        const recorded: Achievement[] = newlyEarned.map((achievement, index) => ({
          ...achievement,
          id: `${Date.now()}-${index}`,
          earnedAt,
        }));

        // Recorded into history unconditionally, regardless of the celebration setting -- that
        // setting only ever gates whether AchievementCelebration shows its screen, never whether the
        // Trophy Case's history stays complete.
        set(state => ({
          achievements: [...state.achievements, ...recorded],
          pendingCelebrations: [...state.pendingCelebrations, ...recorded],
        }));
      },

      dismissCurrentCelebration: () => set(state => ({ pendingCelebrations: state.pendingCelebrations.slice(1) })),

      queueCelebration: (achievement) => set(state => ({
        pendingCelebrations: [...state.pendingCelebrations, achievement],
      })),

      runRetroactiveScan: (activeTasks) => {
        const newlyEarned = detectRetroactiveAchievements(get().achievements, activeTasks);
        if (newlyEarned.length === 0) return 0;

        // Same index-suffixed id scheme as recordCompletionAchievements -- a single scan can
        // legitimately surface more than one achievement in the same synchronous call.
        const earnedAt = new Date().toISOString();
        const recorded: Achievement[] = newlyEarned.map((achievement, index) => ({
          ...achievement,
          id: `${Date.now()}-${index}`,
          earnedAt,
        }));

        set(state => ({ achievements: [...state.achievements, ...recorded] }));
        return recorded.length;
      },
    }),
    {
      name: 'achievements',
      storage: createJSONStorage<PersistedAchievementsState>(() => AsyncStorage),
      partialize: (state) => ({ achievements: state.achievements }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
