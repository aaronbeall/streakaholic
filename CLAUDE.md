# Streakaholic (aka Streakoholic)

A playful habit/streak tracker for iOS/Android/web, inspired by the iOS "Streaks" app. React Native + Expo (Router), TypeScript, local-only persistence via AsyncStorage. Solo indie project.

Naming: resolved as "Streakaholic" (kept as-is — user confirmed 2026-08-01, no config changes needed).

## Stack

- Expo SDK 53, expo-router (file-based routing, typed routes enabled), React 19 / RN 0.79
- State: React Context (`TaskContext`) + AsyncStorage, no external state lib (Zustand migration floated in TODO.md but not started)
- Animation: `react-native-reanimated` throughout `TaskCard.tsx`/`ParticleSystem.tsx` (migrated off the legacy `Animated` API)
- Charts: `react-native-chart-kit` (Dashboard + per-task Stats screens)
- Icons: `@expo/vector-icons` MaterialCommunityIcons — `MaterialCommunityIconName` type is derived directly from the glyph map
- Data export/import: `expo-file-system`, `expo-sharing`, `expo-document-picker`
- Theming: `app/hooks/useThemeColors.ts` — `useColorScheme()`-backed semantic palette (`background`, `surface`, `surfaceSecondary`, `text`, `textSecondary`, `textTertiary`, `border`, `iconButtonBackground`, `overlay`, `isDark`). Every screen/component builds its `StyleSheet` via `createStyles(colors)` + `useMemo` instead of a static object. Task-specific/status/brand colors (task.color, streak red/orange, primary blue, destructive red, trophy gold) are intentionally left un-themed — they read fine on both schemes.
- No test suite, no CI config present.

## Architecture

Routing is file-based under `app/`. Each route file is a thin re-export of a screen in `app/screens/`:

- `index` → `HomeScreen`: grid of `TaskCard`s (2–4 columns responsive), streak filter bubbles, FAB to add task, empty state when no (non-archived) tasks or a filter matches nothing
- `dashboard` → `DashboardScreen`: aggregate stats + charts across all/selected **non-archived** tasks
- `add-task` → `AddTaskScreen`: create **or edit** task form (reads optional `taskId` search param; prefills + calls `updateTask` when editing, `addTask` otherwise)
- `settings` → `SettingsScreen`: Data section (Archived Tasks, Export/Import Data), About section
- `archived-tasks` → `ArchivedTasksScreen`: list of archived tasks with one-tap restore
- `task-details`, `task-calendar`, `task-stats` (all modals) → per-task screens, share `TaskHeader`

Shared state: `app/context/TaskContext.tsx` — single source of truth for `tasks`, loads/saves to AsyncStorage under key `"tasks"`. Delegates streak/stat calculation to `app/utils/streaks.ts` (see below). Also exposes `archiveTask`/`restoreTask` (flip `task.archived`, same `updateTask` path), `importTasks` (bulk replace + recompute stats, used by Settings' Import), and `getCompletionCount(task, date)` (today's progress toward `timesPerDay`, backed by a `Map<taskId, Map<date, timesCompleted>>` cache).

`app/utils/streaks.ts` — frequency-aware streak engine, extracted from `TaskContext`:
- Filters completions to "qualifying" ones first (`timesCompleted >= task.timesPerDay`) — a partially-logged day doesn't count.
- `daily` / `specific_days_of_week`: builds the due-day sequence and only breaks a streak on a missed **due** day; non-due days are skipped, not counted as gaps.
- `days_per_week` / `days_per_month`: the streak unit is the period (week/month) — a period counts as "met" once enough distinct qualifying days land in it, including mid-period for the current one (so hitting the weekly quota early still keeps the streak alive without waiting for the week to end).

Data model (`app/types/index.ts`):
- `Task`: id, name, icon, color, `frequency` (`daily | specific_days_of_week | days_per_week | days_per_month`), `daysOfWeek`, `daysPerWeek`, `daysPerMonth`, `timesPerDay`, timestamps, optional `archived`, `stats`, `completions`
- `TaskCompletion`: id, taskId, `date` (yyyy-MM-dd, the day it counts for), `completedAt` (actual timestamp), `timesCompleted` (increments per press up to `timesPerDay`, rather than one record per press)

`app/utils/data.ts` holds pure chart/date-range helpers (time-frame bucketing, day-of-week/hour-of-day histograms, aggregate stats) used by Dashboard and per-task Stats screens.

`TaskCard.tsx` is the most complex component: a flip card with three faces (task/calendar/stats) cycled via long-press-context-dependent actions, plus its own completion animation (progress ring, checkmark swap, streak badge pop, confetti-style `ParticleSystem`), and a secondary static progress ring + "`n`/`timesPerDay`" label for multi-rep tasks.

## Known gaps / bugs (found by reading, not yet fixed)

1. **`TaskCalendarScreen` and `TaskStatsScreen` throw synchronously if the task isn't found yet.** Both do `if (!task) throw new Error('Missing task')` on first render. `tasks` loads asynchronously from AsyncStorage in `TaskContext`, so a hard page reload / direct deep link on web (or a cold app launch landing straight on one of these routes) hits this before `loadTasks()` resolves, showing a crash screen instead of a loading state. Reproducible by navigating straight to `/task-calendar?taskId=...` via a fresh page load rather than in-app navigation. Fix: show a loading/`null` state while `tasks` is empty-but-still-loading, rather than throwing.
2. **`calculateAggregateStats` averages completion rate incorrectly** (`utils/data.ts`): `stats.completionRate = (stats.completionRate + task.stats.completionRate) / 2` run in a `reduce` is a running average that overweights later tasks in the array, not a true mean. Low priority (dashboard cosmetic only).
3. No delete confirmation on `TaskDetailsScreen`'s "Delete Task" (hard delete, no `Alert.alert` guard) — archiving is the safer path now that it exists, but delete itself is still a single tap with no undo.

## MVP status

All items from the original MVP checklist are implemented as of 2026-08-01:

- ✅ Naming resolved (kept "Streakaholic")
- ✅ Reanimated migration (committed, user-verified on-device)
- ✅ Frequency-aware streak logic (`utils/streaks.ts`) + `daysPerMonth` field
- ✅ Times-per-day tracking (increment-based completions, progress ring, verified end-to-end)
- ✅ Real edit-task flow (verified: prefills, updates in place, no duplicates)
- ✅ `TaskCard`'s dead `onPress`/`onComplete` props removed
- ✅ Archive + restore (verified end-to-end)
- ✅ Initial empty state (two variants: no tasks / filter matches nothing)
- ✅ Settings screen, gear icon fixed
- ✅ Dark mode (verified visually across all screens)
- ✅ Export/import data (export verified on web; import's file-picker UI couldn't be driven via browser automation in this session — logic reuses the same save/stats pipeline as everything else, but do one manual smoke test: Settings → Import Data → pick an exported file → confirm replace)

Remaining backlog is MVP+/MMP/Future tier per `TODO.md` (calendar year map, sharing, reminders, monetization, widgets, sync, onboarding, timeline/heatmap views, points/ranks, social features) plus the gaps listed above.
