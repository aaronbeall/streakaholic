import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { create } from 'zustand';
import { PersistStorage, persist } from 'zustand/middleware';
import { Task, TaskCompletion } from '../types';
import { mergeTaskLists } from '../utils/importExport';
import { buildCompletionCountsByDate, calculateTaskStats } from '../utils/streaks';
import { useAchievementsStore } from './achievementsStore';
import { useLastImportStore } from './lastImportStore';

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
  completeTask: (taskId: string, date?: Date) => void;
  uncompleteTask: (taskId: string, date: Date) => void;
  undoCompleteTask: (taskId: string, date?: Date) => void;
  restoreCompletion: (taskId: string, completion: TaskCompletion) => void;
  archiveTask: (taskId: string) => void;
  restoreTask: (taskId: string) => void;
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
        set({ tasks: [...get().tasks, newTask] });
      },

      updateTask: (task) => {
        const updatedTask = withUpdatedStats(task);
        set({ tasks: get().tasks.map(t => t.id === task.id ? updatedTask : t) });
      },

      deleteTask: (taskId) => {
        set({ tasks: get().tasks.filter(t => t.id !== taskId) });
      },

      // Re-inserts an already-deleted task exactly as it was (same id/completions/stats), for the
      // "Undo" action on a delete toast. Not a general-purpose restore -- appends to the end since
      // original list position isn't preserved.
      restoreDeletedTask: (task) => {
        set({ tasks: [...get().tasks, task] });
      },

      completeTask: (taskId, date = new Date()) => {
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

            nextTask = withUpdatedStats({ ...task, completions: newCompletions });
            return nextTask;
          }),
        });
        // Achievement detection needs the actual before/after task state plus the full task list
        // (perfect-day spans every task, not just this one) -- both only exist once the mutation
        // above has actually run, so this has to happen after set(), not before. Only completeTask
        // triggers this -- restoreCompletion/uncompleteTask/undoCompleteTask/importTasks are
        // corrections or bulk data operations, not a user completing a task right now.
        if (prevTask && nextTask) {
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
          // themselves to) -- costs the same O(total completions) as the linear scans it replaces
          // would have cost anyway for a single lookup, but turns every *additional* lookup within
          // this same call (there can be well over a dozen, across perfect-day and perfect-week
          // together) into an O(1) map read instead of another full rescan.
          const completionCountsByTaskId = new Map(
            allTasksNow
              .filter(t => !t.archived)
              .map(t => [t.id, buildCompletionCountsByDate(t.completions || [])] as const)
          );
          useAchievementsStore.getState().recordCompletionAchievements(
            prevTask,
            nextTask,
            allTasksNow,
            date,
            completionCountsByTaskId
          );
        }
      },

      uncompleteTask: (taskId, date) => {
        const dateString = format(date, 'yyyy-MM-dd');
        set({
          tasks: get().tasks.map(task => {
            if (task.id !== taskId) return task;
            const newCompletions = (task.completions || []).filter(c => c.date !== dateString);
            return withUpdatedStats({ ...task, completions: newCompletions });
          }),
        });
      },

      // Reverses exactly one completeTask press -- decrements today's count rather than clearing
      // the whole day, so undoing a single accidental tap on a multi-rep task doesn't also wipe
      // out reps logged earlier that day. (uncompleteTask, used by the calendar's tap-to-clear-a-
      // day, intentionally clears the whole day instead.)
      undoCompleteTask: (taskId, date = new Date()) => {
        const dateString = format(date, 'yyyy-MM-dd');
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

            return withUpdatedStats({ ...task, completions: newCompletions });
          }),
        });
      },

      // Re-inserts an exact completion record for the "Undo" action on the calendar's clear-a-day
      // toast. Not just re-running completeTask -- uncompleteTask wipes the whole day, which for a
      // multi-rep task can mean losing a `timesCompleted` > 1, so Undo needs to restore that exact
      // count rather than just adding one rep back.
      restoreCompletion: (taskId, completion) => {
        set({
          tasks: get().tasks.map(task => {
            if (task.id !== taskId) return task;
            const withoutDate = (task.completions || []).filter(c => c.date !== completion.date);
            return withUpdatedStats({ ...task, completions: [...withoutDate, completion] });
          }),
        });
      },

      archiveTask: (taskId) => {
        set({ tasks: get().tasks.map(t => t.id === taskId ? withUpdatedStats({ ...t, archived: true }) : t) });
      },

      restoreTask: (taskId) => {
        set({ tasks: get().tasks.map(t => t.id === taskId ? withUpdatedStats({ ...t, archived: false }) : t) });
      },

      importTasks: (importedTasks, options = {}) => {
        const mode = options.mode ?? 'replace';
        const nextTasks = mode === 'merge' ? mergeTaskLists(get().tasks, importedTasks) : importedTasks;
        set({
          tasks: nextTasks.map(task => ({
            ...task,
            stats: calculateTaskStats(task, task.completions || []),
          })),
        });

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
