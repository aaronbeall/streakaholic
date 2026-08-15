import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Achievement, AchievementKind, dedupKey, detectCompletionAchievements, detectRetroactiveAchievements } from '../utils/achievements';
import { Task } from '../types';

interface AchievementsStore {
  // Full history, persisted -- what TrophiesScreen lists.
  achievements: Achievement[];
  // Not persisted -- a queue AchievementCelebration drains one at a time. Deliberately separate from
  // `achievements` itself (rather than e.g. an `unseen` flag on each record) so the celebration
  // UI has nothing to do with history bookkeeping at all.
  pendingCelebrations: Achievement[];
  // Not persisted -- ids (from `pendingCelebrations`) that should show the full celebration
  // regardless of `mutedKinds`. Set only by `queueCelebration` (a deliberate Trophy Case replay --
  // "the user just tapped this specific achievement to see it," which always wins over the ambient
  // mute setting), never by `recordCompletionAchievements` (a real live unlock, which should still
  // respect mute normally). This is what lets "the trophy case always lets you open any
  // congratulations" hold true even for a kind that's currently muted.
  forcedCelebrationIds: string[];
  // Persisted. Kinds the user has explicitly opted out of the full-screen celebration for (via the
  // bell toggle on that kind's own celebration) -- future unlocks of a muted kind still get
  // recorded into `achievements` exactly as normal, they just surface via a top-anchored
  // AchievementAlert notice (AchievementAlert.tsx, rendered by AchievementCelebration.tsx in place
  // of the full takeover) instead. Scoped by *kind*, not per-task or per-instance, since the whole
  // point is "I get this one often enough that the big ceremony has stopped feeling special" -- a
  // property of the achievement, not of one earn of it.
  mutedKinds: AchievementKind[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  // Called right after a real completion (see taskStore.completeTask) -- detects whatever this
  // one completion newly earned, records it into history, and queues it for celebration. A
  // complete no-op if nothing new was earned. `completionCountsByTaskId` is optional (and, per a
  // 2026-08-13 performance-review fix, always supplied by the real taskStore.completeTask call
  // site) -- see detectCompletionAchievements' own comment on its identically-named `options`
  // field for what it's for; simply forwarded through here rather than duplicated.
  recordCompletionAchievements: (
    prevTask: Task,
    nextTask: Task,
    allTasks: Task[],
    date: Date,
    completionCountsByTaskId?: ReadonlyMap<string, ReadonlyMap<string, number>>
  ) => void;
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
  // Opts a kind out of the full celebration going forward -- idempotent (muting an
  // already-muted kind is a no-op, not a duplicate entry).
  muteKind: (kind: AchievementKind) => void;
  // Reverses muteKind for exactly this one kind -- backs the celebration screen's own toggle
  // button (2026-08-12, replacing an earlier one-shot "mute and dismiss" link with a real
  // on/off toggle that stays on screen either direction), idempotent the same way muteKind is.
  unmuteKind: (kind: AchievementKind) => void;
  // Settings' own "restore full celebrations" action -- clears every muted kind at once, for
  // when the per-kind toggle above isn't a convenient way to restore several at once.
  unmuteAllKinds: () => void;
}

type PersistedAchievementsState = { achievements: Achievement[]; mutedKinds: AchievementKind[] };

// 'achievements' is a brand-new AsyncStorage key with no pre-Zustand legacy shape to migrate
// (unlike tasks/appSettings/lastImport, which predate the Zustand migration and need custom
// PersistStorage to detect their old bare-value shape) -- createJSONStorage's plain envelope is
// sufficient here.
export const useAchievementsStore = create<AchievementsStore>()(
  persist(
    (set, get) => ({
      achievements: [],
      pendingCelebrations: [],
      forcedCelebrationIds: [],
      mutedKinds: [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),

      recordCompletionAchievements: (prevTask, nextTask, allTasks, date, completionCountsByTaskId) => {
        // Unconditional over every existing achievement, not just ONE_TIME_KINDS -- previously this
        // excluded every repeatable kind (streak-N, new-best-streak, comeback, perfect-day,
        // perfect-week) entirely, which was the root cause of "achievement spam via undo/redo":
        // redoing the same completion re-crossed the same threshold with nothing genuinely new
        // earned, and with no matching key in this set to block it, detectCompletionAchievements'
        // own isFirstEarn happily recorded a duplicate every time. Now that those kinds' own
        // dedupScope is date-qualified (see REPEATABLE_TASK_SCOPED_KINDS' and dedupScopeFor's own
        // comments in achievements.ts -- e.g. `${taskId}:${dateString}` instead of bare `taskId`),
        // including them here is safe: a same-date replay hits the exact same key and is correctly
        // blocked, while a genuine new crossing on a later date gets its own distinct key and still
        // fires. This also incidentally closes an identical latent gap for perfect-day/perfect-week
        // (both date-scoped already, but previously excluded from this set the same way).
        const alreadyEarnedScopes = new Set(
          get().achievements.map(a => dedupKey(a.kind, a.dedupScope))
        );
        const newlyEarned = detectCompletionAchievements(
          prevTask,
          nextTask,
          allTasks,
          date,
          alreadyEarnedScopes,
          completionCountsByTaskId ? { completionCountsByTaskId } : undefined
        );
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
        // Trophy Case's history stays complete. Muted kinds still get queued too -- muting only
        // changes how AchievementCelebration *presents* a pending entry (full screen vs. a toast),
        // not whether one gets queued in the first place.
        set(state => ({
          achievements: [...state.achievements, ...recorded],
          pendingCelebrations: [...state.pendingCelebrations, ...recorded],
        }));
      },

      dismissCurrentCelebration: () => set(state => {
        const dismissedId = state.pendingCelebrations[0]?.id;
        return {
          pendingCelebrations: state.pendingCelebrations.slice(1),
          forcedCelebrationIds: dismissedId
            ? state.forcedCelebrationIds.filter(id => id !== dismissedId)
            : state.forcedCelebrationIds,
        };
      }),

      queueCelebration: (achievement) => set(state => ({
        pendingCelebrations: [...state.pendingCelebrations, achievement],
        forcedCelebrationIds: state.forcedCelebrationIds.includes(achievement.id)
          ? state.forcedCelebrationIds
          : [...state.forcedCelebrationIds, achievement.id],
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

      muteKind: (kind) => set(state => (
        state.mutedKinds.includes(kind) ? state : { mutedKinds: [...state.mutedKinds, kind] }
      )),

      unmuteKind: (kind) => set(state => (
        state.mutedKinds.includes(kind) ? { mutedKinds: state.mutedKinds.filter(k => k !== kind) } : state
      )),

      unmuteAllKinds: () => set({ mutedKinds: [] }),
    }),
    {
      name: 'achievements',
      storage: createJSONStorage<PersistedAchievementsState>(() => AsyncStorage),
      partialize: (state) => ({ achievements: state.achievements, mutedKinds: state.mutedKinds }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
