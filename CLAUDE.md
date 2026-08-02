# Streakaholic (aka Streakoholic)

A playful habit/streak tracker for iOS/Android/web, inspired by the iOS "Streaks" app. React Native + Expo (Router), TypeScript, local-only persistence via AsyncStorage. Solo indie project, pre-MVP.

Naming note: `package.json`/`app.json`/bundle id all say "Streakaholic"; TODO.md's first line asks whether it should be "Streakoholic" instead. Unresolved — check before touching branding/config.

## Stack

- Expo SDK 53, expo-router (file-based routing, typed routes enabled), React 19 / RN 0.79
- State: React Context (`TaskContext`) + AsyncStorage, no external state lib (Zustand migration floated in TODO.md but not started)
- Animation: mid-migration from RN `Animated` to `react-native-reanimated` (see Gaps)
- Charts: `react-native-chart-kit` (Dashboard + per-task Stats screens)
- Icons: `@expo/vector-icons` MaterialCommunityIcons — `MaterialCommunityIconName` type is derived directly from the glyph map
- No test suite, no CI config present.

## Architecture

Routing is file-based under `app/`. Each route file is a thin re-export of a screen in `app/screens/`:

- `index` → `HomeScreen`: grid of `TaskCard`s (2–4 columns responsive), streak filter bubbles, FAB to add task
- `dashboard` → `DashboardScreen`: aggregate stats + charts across all/selected tasks
- `add-task` → `AddTaskScreen`: create task form (name, icon, color, frequency)
- `task-details`, `task-calendar`, `task-stats` (all modals) → per-task screens, share `TaskHeader`

Shared state: `app/context/TaskContext.tsx` — single source of truth for `tasks`, loads/saves to AsyncStorage under key `"tasks"`, computes `TaskStats` (streak length/status/best/completion rate) by walking `completions` and looking for **consecutive calendar days**. It does not currently take a task's `frequency`/`daysOfWeek`/`daysPerWeek` into account (see Gaps — this is the single biggest correctness gap).

Data model (`app/types/index.ts`):
- `Task`: id, name, icon, color, `frequency` (`daily | specific_days_of_week | days_per_week | days_per_month`), `daysOfWeek`, `daysPerWeek`, `timesPerDay`, timestamps, optional `stats`/`completions`
- `TaskCompletion`: id, taskId, `date` (yyyy-MM-dd, the day it counts for), `completedAt` (actual timestamp), `timesCompleted`
- Note: `Task` has no `daysPerMonth` field even though `days_per_month` is a valid `FrequencyType` and `AddTaskScreen` collects it — see Gaps.

`app/utils/data.ts` holds pure chart/date-range helpers (time-frame bucketing, day-of-week/hour-of-day histograms, aggregate stats) used by Dashboard and per-task Stats screens.

`TaskCard.tsx` is the most complex component: a flip card with three faces (task/calendar/stats) cycled via long-press-context-dependent actions, plus its own completion animation (progress ring, checkmark swap, streak badge pop, confetti-style `ParticleSystem`). It's mid-refactor from `Animated` to `Reanimated` (uncommitted changes on `TaskCard.tsx` as of this writing — finish or revert before building on top of it).

## Known gaps / bugs (found by reading, not yet fixed)

Ordered roughly by impact:

1. **Frequency settings don't affect streak logic.** `calculateTaskStats` in `TaskContext.tsx` only checks for consecutive-day completions. A task scheduled "Mon/Wed/Fri" will show `expired` on Tuesday even though Tuesday was never expected. This is TODO.md's "Implement frequency settings for streaks" — currently the frequency picker in `AddTaskScreen` is cosmetic only.
2. **`daysPerMonth` isn't part of the `Task` type** (`app/types/index.ts`) but `AddTaskScreen.tsx:64` saves it anyway. It round-trips through AsyncStorage/JSON silently (TS doesn't flag it because the object isn't a fresh literal at the call site) but nothing reads it back. Needs adding to the type once frequency logic is implemented.
3. **Editing a task doesn't actually load it.** `TaskDetailsScreen.handleEdit` pushes to `/add-task` with a `taskId` param, but `AddTaskScreen` never reads `useLocalSearchParams` — it always renders a blank "create" form. TODO.md's "Edit task" is unimplemented, and the current wiring looks functional but silently isn't.
4. **`TaskCard`'s `onPress`/`onComplete` props are dead code.** `HomeScreen` passes `onPress` (→ navigate to task-details) and `onComplete` (→ `completeTask`) into `TaskCard`, but internally the `Pressable`'s `onPress` is hardwired to `flipCard`, and `onComplete` is never invoked at all. The real completion path is long-press → `onLongPressTask` → `handleTaskLongPress` in `HomeScreen`, which itself decides between "already completed → open details" and "not completed → complete". Worth deciding whether the unused props are vestigial (delete them) or whether a plain tap was meant to do something (restore behavior).
5. **Settings button is a dead end.** `HomeScreen`'s gear icon (`HomeHeader`) navigates to `/` (itself). No Settings screen exists yet (tracked in TODO.md).
6. **`times per day` is collected but not enforced.** `timesPerDay` is stored per task and shown read-only in `TaskDetailsScreen`, but `completeTask` always records exactly one completion; there's no UI or logic for multi-completion-per-day tasks or partial-day progress.
7. **`calculateAggregateStats` averages completion rate incorrectly** (`utils/data.ts`): `stats.completionRate = (stats.completionRate + task.stats.completionRate) / 2` run in a `reduce` is a running average that overweights later tasks in the array, not a true mean. Low priority (dashboard cosmetic only).
8. No empty state for zero tasks, no archive/restore, no dark mode, no settings screen, no data export/import — all explicitly still open in TODO.md and confirmed absent in the code.

## MVP plan

Based on TODO.md's "MVP" checklist plus the gaps above. Suggested order — earlier items unblock or de-risk later ones:

1. **Resolve naming** ("Streakoholic" vs "Streakaholic") — trivial, but touches `app.json`, `package.json`, bundle id, README; do it once, early, before more config/branding work.
2. **Finish the Reanimated migration on `TaskCard.tsx`** (currently uncommitted/in-progress) — land it before building more features on top of that file.
3. **Implement frequency-aware streak logic** (gap #1) — this is the core value prop ("streak tracking") and currently silently wrong for anything but daily tasks. Needs `calculateTaskStats` to know each day's "was this task due" rule (daily / specific days of week / N-per-week / N-per-month) and redefine "streak break" accordingly. Add `daysPerMonth` to the `Task` type (gap #2) as part of this.
4. **Implement times-per-day** — extend `completeTask`/`isTaskCompleted` to track partial progress toward `timesPerDay` and reflect it in `TaskCard`'s progress ring instead of the current binary complete/incomplete.
5. **Real edit-task flow** (gap #3) — have `AddTaskScreen` read an optional `taskId`, prefill state from the existing task, and call `updateTask` instead of `addTask` on save. Rename/generalize screen if needed.
6. **Decide and fix `TaskCard`'s dead props** (gap #4) — either restore tap-to-view-details or delete `onPress`/`onComplete` from the props/type.
7. **Archive tasks + restore** — soft-delete instead of `deleteTask`'s hard delete; add an archived-tasks view.
8. **Initial empty state** — HomeScreen when `tasks.length === 0`.
9. **Settings screen** — minimum viable: naming/theme placeholder, wire up the gear icon (gap #5) to it instead of `/`.
10. **Dark mode** — `userInterfaceStyle: automatic` is already set in `app.json`; needs actual themed styles (currently all screens hardcode light colors in `StyleSheet.create`).
11. **Export/import data** — straightforward given everything lives under one AsyncStorage key (`"tasks"`); JSON dump/restore via share sheet or file picker.

Items 3 and 4 are the largest/riskiest (touch core data model + stats engine + card UI simultaneously) — worth their own focused sessions rather than bundling with smaller items.

Not in MVP scope per TODO.md: calendar year map, sharing, reminders (MVP+); monetization, widgets, sync, onboarding (MMP); timeline/heatmap views, points/ranks, social features (Future).
