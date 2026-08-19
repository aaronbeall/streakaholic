import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { create } from 'zustand';
import { PersistStorage, persist } from 'zustand/middleware';
import { Task, TaskCompletion } from '../types';
import { mergeTaskLists } from '../utils/importExport';
import { cancelTaskNotifications, rescheduleAllTaskNotifications, scheduleTaskNotifications } from '../utils/notifications';
import { calculateTaskStats, getCachedCompletionCountsByDate, isScheduledOnDate } from '../utils/streaks';
import { useAchievementsStore } from './achievementsStore';
import { useLastImportStore } from './lastImportStore';
import { useSettingsStore } from './settingsStore';

// Fire-and-forget -- scheduling touches the native Notifications API and none of this store's
// mutators are async, matching how recordCompletionAchievements is already called synchronously
// without being awaited. A denied/never-granted permission is an expected, silent no-op (already
// handled inside scheduleTaskNotifications/cancelTaskNotifications themselves) -- but a genuine
// native rejection (e.g. a scheduling call actually throwing) was previously swallowed with
// nothing logged at all, real diagnosability was a genuine gap (see the 2026-08-13 permission-gap
// bug this same day, which needed to be root-caused by reading code alone since nothing had ever
// surfaced a failure signal). Warning on catch costs nothing on the happy path and gives any
// future failure of this kind an actual trace to look at.
const rescheduleFor = (task: Task): void => {
  scheduleTaskNotifications(task).catch(error => console.warn('Failed to schedule notifications for task', task.id, error));
};
const cancelFor = (taskId: string): void => {
  cancelTaskNotifications(taskId).catch(error => console.warn('Failed to cancel notifications for task', taskId, error));
};

// A generous debounce specifically for calendar-sourced completions (TaskCalendarScreen's
// handleDayPress, via completeTask's own `deferAchievements` option) -- per explicit user
// direction, only calendar edits should debounce; Home/TaskHeader's own press-and-hold stays
// fully immediate, since that's one deliberate real-time action that deserves instant feedback.
// Calendar backfilling is different: rapidly tapping through several days in a row (correcting a
// week of missed history, say) would otherwise run a full achievement check -- and possibly pop a
// celebration screen -- after *every single tap*, which reads as spammy for what's really one
// editing session, not several distinct "I just did this" moments.
//
// Module-level (not component state) so a pending check survives navigating away from the
// calendar screen entirely -- it's keyed off the store's own mutation, not the screen's mount
// lifecycle, and still needs to fire even if the user has already moved on to the Stats tab.
// Keyed per task, since edits to two different tasks' calendars shouldn't debounce against each
// other. `prevTask` is captured once, at the *start* of a debounce burst, and deliberately not
// overwritten by subsequent calls within the same burst (only the timer resets) -- achievement
// detection needs the true before/after pair spanning the *whole* burst, not just its final step,
// or a crossing that happened partway through (e.g. hitting streak-25 on the third of five
// backfilled days) could be missed entirely once later edits change what "next" looks like.
const ACHIEVEMENT_CHECK_DEBOUNCE_MS = 4000;
const pendingDeferredAchievementChecks = new Map<string, { prevTask: Task; date: Date; timer: ReturnType<typeof setTimeout> }>();

const scheduleDeferredAchievementCheck = (taskId: string, prevTaskAtBurstStart: Task, date: Date): void => {
  const existing = pendingDeferredAchievementChecks.get(taskId);
  if (existing) clearTimeout(existing.timer);

  // The *true* start-of-burst prevTask -- reused across every reschedule within the same burst,
  // only ever set fresh when there's no burst already in progress for this task. Read by the
  // timer callback below via the map (not this function's own `prevTaskAtBurstStart` parameter
  // directly), since that parameter is whatever the *latest* call happened to pass, not
  // necessarily the one that should actually win.
  const effectivePrevTask = existing?.prevTask ?? prevTaskAtBurstStart;

  const timer = setTimeout(() => {
    pendingDeferredAchievementChecks.delete(taskId);
    const allTasksNow = useTaskStore.getState().tasks;
    const nextTask = allTasksNow.find(t => t.id === taskId);
    // The task could have been archived/deleted since this was scheduled -- a quiet no-op, not
    // an error, same as any other "state moved on" race this app already tolerates elsewhere.
    if (!nextTask) return;
    const completionCountsByTaskId = new Map(
      allTasksNow
        .filter(t => !t.archived)
        .map(t => [t.id, getCachedCompletionCountsByDate(t.completions || [])] as const)
    );
    useAchievementsStore.getState().recordCompletionAchievements(
      effectivePrevTask,
      nextTask,
      allTasksNow,
      date,
      completionCountsByTaskId
    );
  }, ACHIEVEMENT_CHECK_DEBOUNCE_MS);

  pendingDeferredAchievementChecks.set(taskId, { prevTask: effectivePrevTask, date, timer });
};

interface ImportOptions {
  mode?: 'replace' | 'merge';
  exportMeta?: { exportId: string };
}

interface TaskStore {
  tasks: Task[];
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateTask: (task: Task) => void;
  deleteTask: (taskId: string) => void;
  restoreDeletedTask: (task: Task) => void;
  // `deferAchievements` -- see scheduleDeferredAchievementCheck's own comment. Only
  // TaskCalendarScreen passes `true`; every other caller (Home, TaskHeader) omits it and gets the
  // existing immediate behavior.
  completeTask: (taskId: string, date?: Date, options?: { deferAchievements?: boolean }) => void;
  uncompleteTask: (taskId: string, date: Date) => void;
  undoCompleteTask: (taskId: string, date?: Date) => void;
  restoreCompletion: (taskId: string, completion: TaskCompletion) => void;
  // Marks `date` a one-off pass -- see Task.skippedDates' own comment (types/index.ts). A no-op
  // for a quota-type task (days_per_week/days_per_month) or a date already marked skipped; the
  // caller (TaskCalendarScreen) is expected to not even offer the gesture there, this is just the
  // same defense-in-depth isDueOnDate itself applies.
  skipDate: (taskId: string, date: Date) => void;
  // Reverses skipDate -- also the calendar's own long-press-to-toggle "undo" path, not just the
  // toast's Undo action.
  unskipDate: (taskId: string, date: Date) => void;
  archiveTask: (taskId: string) => void;
  restoreTask: (taskId: string) => void;
  // Receives the complete active-task id order. Archived tasks retain their slots, so reordering
  // Home never unexpectedly changes the Archived Habits list.
  reorderTasks: (orderedActiveTaskIds: string[]) => void;
  importTasks: (tasks: Task[], options?: ImportOptions) => void;
  // Not persisted (excluded by `partialize` below, same as `hasHydrated`) -- purely an in-memory
  // guard, for one running process, against redundant same-day recomputes (see
  // `maybeRefreshStats`'s own comment for why this exists at all and why a plain day-string
  // comparison, not a real invalidation scheme, is enough). A fresh process always starts with
  // this `null`, so a cold launch's first check always genuinely recomputes regardless of how long
  // the app was actually closed.
  statsRefreshedOn: string | null;
  // Recomputes every task's own cached `.stats` against the real current moment -- but only if
  // they're not already fresh for today, checked via `statsRefreshedOn` above. `.stats` (including
  // `streakStatus`) is a snapshot, only ever recomputed by `withUpdatedStats` at the moment of an
  // actual mutation -- with no mutation since yesterday, a task's cached status can go stale purely
  // from the calendar day rolling over (e.g. a long streak's `streakStatus` still reading
  // yesterday's comfortable 'up_to_date' after opening the app on a fresh, not-yet-acted-on day,
  // when it should already read 'expiring'). See this action's own call site in _layout.tsx for
  // when it's actually invoked (on hydrate + every app-foreground transition) -- the day-check here
  // is what keeps most of those calls a genuine no-op (same calendar day as the last real check),
  // rather than unconditionally rebuilding every task's object identity (and writing to
  // AsyncStorage) on every single foreground, which would defeat the reference-preservation this
  // store's other mutators are all deliberately built around (see this file's own top-of-file
  // comment) purely to avoid re-rendering components that select an unaffected task.
  maybeRefreshStats: () => void;
}

const withUpdatedStats = (task: Task): Task => ({
  ...task,
  updatedAt: new Date().toISOString(),
  stats: calculateTaskStats(task, task.completions || []),
});

type PersistedTaskState = { tasks: Task[] };

// The pre-Zustand AsyncStorage 'tasks' key holds a bare Task[] array (from the old TaskContext's
// `JSON.stringify(tasks)`), not zustand persist's `{ state, version }` envelope. Reading it with a
// plain `createJSONStorage` would see a value with no `.state` and silently hydrate to an empty
// store -- indistinguishable from "no tasks yet", i.e. it would look like data loss on upgrade.
// This custom storage detects the legacy bare-array shape on read and wraps it into the envelope
// once; every write after that (via this same storage) is already in the new shape.
const taskStorage: PersistStorage<PersistedTaskState> = {
  getItem: async (name) => {
    const raw = await AsyncStorage.getItem(name);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { state: { tasks: parsed }, version: 0 };
    }
    return parsed;
  },
  setItem: async (name, value) => {
    await AsyncStorage.setItem(name, JSON.stringify(value));
  },
  removeItem: async (name) => {
    await AsyncStorage.removeItem(name);
  },
};

// Same shape/AsyncStorage key ('tasks') as the old TaskContext, so already-installed devices
// need no data migration. `persist` writes to AsyncStorage after every `set()` automatically --
// no manual AsyncStorage.setItem needed, unlike the old Context's hand-rolled `saveTasks`.
//
// Every action below builds its next array via `prev.map()`/`.filter()`, preserving the exact
// object reference for any task that didn't change -- this is what lets a per-task selector
// (`state.tasks.find(t => t.id === taskId)`) skip re-rendering components that select a task
// unaffected by a given mutation, with zero extra bookkeeping (Zustand's default equality check
// is `Object.is`, and an unchanged task keeps its old reference).
export const useTaskStore = create<TaskStore>()(
  persist(
    (set, get) => ({
      tasks: [],
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      statsRefreshedOn: null,

      addTask: (taskData) => {
        const newTask: Task = {
          ...taskData,
          id: Date.now().toString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completions: [],
          stats: calculateTaskStats(taskData, []),
        };
        const nextTasks = [...get().tasks, newTask];
        set({ tasks: nextTasks });
        useAchievementsStore.getState().recordTaskCreatedAchievements(nextTasks.filter(task => !task.archived));
        rescheduleFor(newTask);
      },

      updateTask: (task) => {
        const updatedTask = withUpdatedStats(task);
        set({ tasks: get().tasks.map(t => t.id === task.id ? updatedTask : t) });
        rescheduleFor(updatedTask);
      },

      deleteTask: (taskId) => {
        set({ tasks: get().tasks.filter(t => t.id !== taskId) });
        cancelFor(taskId);
      },

      // Re-inserts an already-deleted task exactly as it was (same id/completions/stats), for the
      // "Undo" action on a delete toast. Not a general-purpose restore -- appends to the end since
      // original list position isn't preserved.
      restoreDeletedTask: (task) => {
        set({ tasks: [...get().tasks, task] });
        rescheduleFor(task);
      },

      completeTask: (taskId, date = new Date(), options) => {
        const dateString = format(date, 'yyyy-MM-dd');
        // Captured from inside the same map() that performs the mutation, rather than a separate
        // get().tasks.find() before/after -- guarantees prevTask/nextTask are the exact before/
        // after pair for *this* task, with no risk of racing a concurrent update to some other
        // task in the same array.
        let prevTask: Task | undefined;
        let nextTask: Task | undefined;
        set({
          tasks: get().tasks.map(task => {
            if (task.id !== taskId) return task;
            prevTask = task;

            const existing = (task.completions || []).find(c => c.date === dateString);
            const newCompletions: TaskCompletion[] = existing
              ? (task.completions || []).map(c =>
                  c.date === dateString
                    ? { ...c, timesCompleted: c.timesCompleted + 1, completedAt: new Date().toISOString() }
                    : c
                )
              : [
                  ...(task.completions || []),
                  {
                    id: Date.now().toString(),
                    taskId,
                    date: dateString,
                    completedAt: new Date().toISOString(),
                    timesCompleted: 1,
                  },
                ];

            // A day can't be both "I did it" and "I skipped it" at once -- completing a
            // previously-skipped date (e.g. tapping it after having long-pressed it earlier, see
            // TaskCalendarScreen's handleDayPress/handleDayLongPress) clears the stale skip
            // rather than leaving it sitting there contradicted by a real completion. Cheap
            // no-op when there was nothing to clear (the common case).
            const clearedSkip = task.skippedDates?.includes(dateString)
              ? task.skippedDates.filter(d => d !== dateString)
              : task.skippedDates;

            nextTask = withUpdatedStats({ ...task, completions: newCompletions, skippedDates: clearedSkip });
            return nextTask;
          }),
        });
        // Achievement detection needs the actual before/after task state plus the full task list
        // (perfect-day spans every task, not just this one) -- both only exist once the mutation
        // above has actually run, so this has to happen after set(), not before. Only completeTask
        // triggers this -- restoreCompletion/uncompleteTask/undoCompleteTask/importTasks are
        // corrections or bulk data operations, not a user completing a task right now.
        if (prevTask && nextTask) {
          if (options?.deferAchievements) {
            // See scheduleDeferredAchievementCheck's own comment -- calendar backfill edits get a
            // generous debounce instead of an immediate check, so rapidly correcting several past
            // days doesn't fire (and possibly celebrate) after every single tap.
            scheduleDeferredAchievementCheck(taskId, prevTask, date);
          } else {
            const allTasksNow = get().tasks;
            // A performance-review finding (2026-08-13): perfect-day's own check (which runs
            // unconditionally on every single completion) and perfect-week's (up to 12 more day
            // checks, whenever perfect-day happens to pass) both look up "is task T done on date D"
            // for several tasks/dates per call. Without this map, that falls through to
            // isTaskCompleted's plain linear .find() over a task's *entire* completions array, from
            // the start -- the worst-case access pattern for finding a *recent* date in an
            // array that's appended in chronological order. This was already fixed for the
            // retroactive scan (see detectRetroactiveAchievements' own completionCountsByTaskId
            // usage) but never wired into this, the app's single most frequent interaction. Built
            // once per completion, scoped to non-archived tasks only (the same universe
            // detectCompletionAchievements' own perfect-day/perfect-week checks already restrict
            // themselves to). The shared accessor is keyed by each exact immutable completions-array
            // reference: only nextTask's new array is indexed now; every unchanged task reuses its
            // existing read-only map. This retains O(1) day lookups without rescanning unrelated
            // histories on the app's most frequent interaction.
            const completionCountsByTaskId = new Map(
              allTasksNow
                .filter(t => !t.archived)
                .map(t => [t.id, getCachedCompletionCountsByDate(t.completions || [])] as const)
            );
            useAchievementsStore.getState().recordCompletionAchievements(
              prevTask,
              nextTask,
              allTasksNow,
              date,
              completionCountsByTaskId
            );
          }
          // Review engagement is deliberately narrower than task history: only a genuine action
          // for today counts. Imports and backfilled calendar dates bypass this path entirely,
          // while undo/restore operations don't increment it elsewhere in the store.
          if (dateString === format(new Date(), 'yyyy-MM-dd')) {
            useSettingsStore.getState().recordReviewCompletion(dateString);
          }
          // A completion can affect whether today's reminder should still be pending. The
          // notification layer compares the newly desired occurrence/content with its observed
          // native snapshot, so partial reps and other no-intent-change updates stop here without
          // cancellation/rescheduling churn.
          rescheduleFor(nextTask);
        }
      },

      uncompleteTask: (taskId, date) => {
        const dateString = format(date, 'yyyy-MM-dd');
        let updatedTask: Task | undefined;
        set({
          tasks: get().tasks.map(task => {
            if (task.id !== taskId) return task;
            const newCompletions = (task.completions || []).filter(c => c.date !== dateString);
            updatedTask = withUpdatedStats({ ...task, completions: newCompletions });
            return updatedTask;
          }),
        });
        if (updatedTask) rescheduleFor(updatedTask);
      },

      // Reverses exactly one completeTask press -- decrements today's count rather than clearing
      // the whole day, so undoing a single accidental tap on a multi-rep task doesn't also wipe
      // out reps logged earlier that day. (uncompleteTask, used by the calendar's tap-to-clear-a-
      // day, intentionally clears the whole day instead.)
      undoCompleteTask: (taskId, date = new Date()) => {
        const dateString = format(date, 'yyyy-MM-dd');
        let updatedTask: Task | undefined;
        set({
          tasks: get().tasks.map(task => {
            if (task.id !== taskId) return task;

            const existing = (task.completions || []).find(c => c.date === dateString);
            if (!existing) return task;

            const newCompletions = existing.timesCompleted > 1
              ? (task.completions || []).map(c =>
                  c.date === dateString ? { ...c, timesCompleted: c.timesCompleted - 1 } : c
                )
              : (task.completions || []).filter(c => c.date !== dateString);

            updatedTask = withUpdatedStats({ ...task, completions: newCompletions });
            return updatedTask;
          }),
        });
        if (updatedTask) rescheduleFor(updatedTask);
      },

      // Re-inserts an exact completion record for the "Undo" action on the calendar's clear-a-day
      // toast. Not just re-running completeTask -- uncompleteTask wipes the whole day, which for a
      // multi-rep task can mean losing a `timesCompleted` > 1, so Undo needs to restore that exact
      // count rather than just adding one rep back.
      restoreCompletion: (taskId, completion) => {
        let updatedTask: Task | undefined;
        set({
          tasks: get().tasks.map(task => {
            if (task.id !== taskId) return task;
            const withoutDate = (task.completions || []).filter(c => c.date !== completion.date);
            // Same mutual-exclusivity guard completeTask applies -- see its own comment.
            const clearedSkip = task.skippedDates?.includes(completion.date)
              ? task.skippedDates.filter(d => d !== completion.date)
              : task.skippedDates;
            updatedTask = withUpdatedStats({ ...task, completions: [...withoutDate, completion], skippedDates: clearedSkip });
            return updatedTask;
          }),
        });
        if (updatedTask) rescheduleFor(updatedTask);
      },

      skipDate: (taskId, date) => {
        const dateString = format(date, 'yyyy-MM-dd');
        let updatedTask: Task | undefined;
        set({
          tasks: get().tasks.map(task => {
            if (task.id !== taskId) return task;
            if (task.frequency !== 'daily' && task.frequency !== 'specific_days_of_week') return task;
            if (task.skippedDates?.includes(dateString)) return task;
            // Skipping a day that was never actually scheduled is redundant -- per explicit user
            // direction (a Weekday-only task shouldn't allow "skipping" a Saturday, an M/W/F task
            // shouldn't allow skipping a Tuesday). The UI is expected to not even offer this (see
            // TaskCalendarScreen's canToggleSkip), this is the defense-in-depth backstop.
            if (!isScheduledOnDate(task, date)) return task;
            // Mirrors completeTask's own guard in the other direction -- a day that's already
            // completed can't also be skipped; same defense-in-depth reasoning.
            const requiredTimes = Math.max(1, task.timesPerDay || 1);
            const existing = (task.completions || []).find(c => c.date === dateString);
            if (existing && existing.timesCompleted >= requiredTimes) return task;
            updatedTask = withUpdatedStats({
              ...task,
              skippedDates: [...(task.skippedDates || []), dateString],
            });
            return updatedTask;
          }),
        });
        if (updatedTask) rescheduleFor(updatedTask);
      },

      unskipDate: (taskId, date) => {
        const dateString = format(date, 'yyyy-MM-dd');
        let updatedTask: Task | undefined;
        set({
          tasks: get().tasks.map(task => {
            if (task.id !== taskId) return task;
            if (!task.skippedDates?.includes(dateString)) return task;
            updatedTask = withUpdatedStats({
              ...task,
              skippedDates: task.skippedDates.filter(d => d !== dateString),
            });
            return updatedTask;
          }),
        });
        if (updatedTask) rescheduleFor(updatedTask);
      },

      archiveTask: (taskId) => {
        set({ tasks: get().tasks.map(t => t.id === taskId ? withUpdatedStats({ ...t, archived: true }) : t) });
        cancelFor(taskId);
      },

      restoreTask: (taskId) => {
        let updatedTask: Task | undefined;
        set({
          tasks: get().tasks.map(t => {
            if (t.id !== taskId) return t;
            updatedTask = withUpdatedStats({ ...t, archived: false });
            return updatedTask;
          }),
        });
        if (updatedTask) rescheduleFor(updatedTask);
      },

      reorderTasks: (orderedActiveTaskIds) => {
        const currentTasks = get().tasks;
        const activeTasks = currentTasks.filter(task => !task.archived);
        const currentIds = new Set(activeTasks.map(task => task.id));

        // Keep this action deliberately strict: callers must provide every active task exactly
        // once. That prevents a stale UI from accidentally dropping or duplicating a task in the
        // persisted list, while still making a valid reorder a single atomic store update.
        if (
          orderedActiveTaskIds.length !== activeTasks.length ||
          new Set(orderedActiveTaskIds).size !== orderedActiveTaskIds.length ||
          orderedActiveTaskIds.some(id => !currentIds.has(id))
        ) return;

        const tasksById = new Map(activeTasks.map(task => [task.id, task]));
        let nextActiveIndex = 0;
        const reorderedTasks = currentTasks.map(task =>
          task.archived ? task : tasksById.get(orderedActiveTaskIds[nextActiveIndex++])!
        );

        // Avoid a needless persistence write and re-render when a button at either end is used.
        if (reorderedTasks.every((task, index) => task === currentTasks[index])) return;
        set({ tasks: reorderedTasks });
      },

      importTasks: (importedTasks, options = {}) => {
        const mode = options.mode ?? 'replace';
        const nextTasks = mode === 'merge' ? mergeTaskLists(get().tasks, importedTasks) : importedTasks;
        const tasksWithStats = nextTasks.map(task => ({
          ...task,
          stats: calculateTaskStats(task, task.completions || []),
        }));
        set({
          tasks: tasksWithStats,
        });

        // Import can add, remove, or rewrite every reminder at once. Run the recovery-grade diff
        // after the store commit so stale identifiers from replaced/deleted tasks are cleaned up,
        // while matching imported schedules remain untouched.
        rescheduleAllTaskNotifications(tasksWithStats).catch(error =>
          console.warn('Failed to reconcile task notifications after import', error)
        );

        if (options.exportMeta) {
          useLastImportStore.getState().setLastImport({
            exportId: options.exportMeta.exportId,
            importedAt: new Date().toISOString(),
          });
        }
      },

      maybeRefreshStats: () => {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        // Already checked (and, if needed, refreshed) today -- a genuine no-op, deliberately not
        // touching `tasks` at all so every task keeps its existing object reference (see this
        // action's own interface comment for why that matters).
        if (get().statsRefreshedOn === todayStr) return;
        set({
          tasks: get().tasks.map(task => ({
            ...task,
            stats: calculateTaskStats(task, task.completions || []),
          })),
          statsRefreshedOn: todayStr,
        });
      },
    }),
    {
      name: 'tasks',
      storage: taskStorage,
      partialize: (state) => ({ tasks: state.tasks }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
