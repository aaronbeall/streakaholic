# Streakaholic

A playful habit/streak tracker for Android. React Native + Expo (Router), TypeScript, local-only persistence via AsyncStorage. Solo indie project. Web is used only for quick functional testing during development — not a target platform (see "No web-specific polish" guidance).

Naming: resolved as "Streakaholic" (kept as-is — user confirmed 2026-08-01, no config changes needed).

## Stack

- Expo SDK 54, expo-router (file-based routing, typed routes enabled), React 19 / RN 0.81
- State: React Context (`TaskContext`) + AsyncStorage, no external state lib (Zustand migration floated in TODO.md but not started)
- Animation: `react-native-reanimated` v4 (+ its `react-native-worklets` peer dep) throughout `TaskCard.tsx`/`ParticleSystem.tsx` (migrated off the legacy `Animated` API)
- Safe areas: `app.json` sets `android.edgeToEdgeEnabled: true`, so every screen draws behind the status bar and gesture nav bar. Every custom header (`HomeScreen`, `SettingsScreen`, `ArchivedTasksScreen`, and the shared `TaskHeader` used by Dashboard/Calendar/Stats) applies `useSafeAreaInsets().top` inline instead of a hardcoded `paddingTop`; every bottom-anchored element (FAB, `ToastBanner`, scroll content, the fixed-height calendar grid) adds `insets.bottom`. `AddTaskScreen` uses the native `Stack.Screen` header (already inset-aware) so it only needed a bottom-inset fix on its ScrollView. `SafeAreaProvider` itself comes for free from expo-router's root layout.
- Charts: `react-native-chart-kit` (Dashboard + per-task Stats screens)
- Icons: `@expo/vector-icons` MaterialCommunityIcons — `MaterialCommunityIconName` type is derived directly from the glyph map
- Data export/import: `expo-file-system`, `expo-sharing`, `expo-document-picker`
- Theming: `app/hooks/useThemeColors.ts` — `useColorScheme()`-backed semantic palette (`background`, `surface`, `surfaceSecondary`, `text`, `textSecondary`, `textTertiary`, `border`, `iconButtonBackground`, `overlay`, `isDark`). Every screen/component builds its `StyleSheet` via `createStyles(colors)` + `useMemo` instead of a static object. Task-specific/status/brand colors (task.color, streak red/orange, primary blue, destructive red, trophy gold) are intentionally left un-themed — they read fine on both schemes.
- Testing: `jest` + `jest-expo` preset, `npm test`. Scope is intentionally narrow — pure functions in `app/utils/*.ts` only (`streaks.ts`, `data.ts`, `importExport.ts`, `periodStats.ts`, `pieWedge.ts`, `calendarGrid.ts`). No component/render tests, no mocking of `TaskContext`/AsyncStorage — anything that needs those stays manually/on-device tested per the rest of this doc. Test files live in a top-level `__tests__/utils/` mirroring `app/utils/`, **not** co-located inside `app/`: expo-router (with `typedRoutes` on) scans every file under `app/` as a route candidate, so a `*.test.ts` sitting in `app/utils/` got bundled into the actual app and crashed at runtime in Expo Go on its top-level `describe(...)` call (`describe`/`it`/`expect` are Jest globals, not present outside a test run). `package.json`'s `"jest"` config scopes `testMatch` to `__tests__/**/*.test.ts` accordingly. No CI config present (tests are local-only for now).

## Architecture

Routing is file-based under `app/`. Each route file is a thin re-export of a screen in `app/screens/`:

- `index` → `HomeScreen`: grid of `TaskCard`s (2–4 columns responsive), streak filter bubbles, FAB to add task, empty state when no (non-archived) tasks or a filter matches nothing
- `dashboard` → `DashboardScreen`: aggregate stats + charts across all/selected **non-archived** tasks
- `add-task` → `AddTaskScreen`: create **or edit** task form (reads optional `taskId` search param; prefills + calls `updateTask` when editing, `addTask` otherwise). When editing, this is also the *only* place to archive/delete a task — there's no separate read-only "task details" screen; `TaskHeader`'s pencil icon, Home's long-press-on-an-already-completed-card, and `ArchivedTasksScreen`'s row tap all go straight here. Archive/Delete render as a "manage" section below Save, each behind an `Alert.alert` confirm (the one place in the app that still uses a modal — see the Toasts section below for why) before performing the action and closing.
- `settings` → `SettingsScreen`: Data section (Archived Tasks, Export Data, Import Data, Import & Replace All Data), Help section (Replay Onboarding Hints), About section
- `archived-tasks` → `ArchivedTasksScreen`: list of archived tasks with one-tap restore
- `task-calendar`, `task-stats` (both modals) → per-task screens, share `TaskHeader`

Onboarding is contextual, not a separate screen, and purely reactive to a live card's state rather than a stored progression. `HomeScreen` targets the first visible `TaskCard` (`onboardingTargetTask = filteredTasks[0]`, skipped once every hint has been seen) and derives which hint condition currently matches from that card's own live state — never from history:
- Card showing its `'task'` face and not completed today → `'hold-to-complete'`
- Card showing its `'task'` face and completed today → `'tap-to-cycle'`
- Card showing its `'calendar'`/`'stats'` face (regardless of completion) → `'hold-to-expand'`

`SettingsContext`'s `onboardingHintsSeen: Record<OnboardingHintKey, boolean>` tracks each of the three independently — dismissing or completing one hint's gesture never affects the other two, so e.g. dismissing "tap to cycle" still lets "hold to expand" appear once the card is flipped. A hint is marked seen either by tapping its dismiss (×) or by the user actually performing the gesture it teaches: completing the task (`handleTaskLongPress`), flipping to a non-task face (`TaskCard`'s `onFlip={(visibleSide: CardSide) => ...}` prop), or long-pressing the flipped face to open the full calendar/stats screen (`onLongPressCalendar`/`onLongPressStats`). Settings' "Replay Onboarding Hints" resets all three flags at once and navigates back to Home.

`app/components/OnboardingHint.tsx` renders the match as a pulsing ring around the real card plus a pointer/tooltip bubble (dismiss button laid out in a flex row next to the text, not absolutely overlaid) — never an abstract demo — with a spring-like pop-in (`Easing.back`) that replays on every distinct hint because `HomeScreen` keys the element by `onboardingHintKey`, forcing a remount when the shown hint changes. The bubble is a solid, theme-independent accent fill with white text rather than `colors.surface` — a surface-colored bubble blended into the background on both themes, so this one component intentionally opts out of the semantic palette to stay legible everywhere. `TaskCard` is a `React.forwardRef` so `HomeScreen` can attach a ref directly to the target card's own root `View` (no extra wrapper element — an earlier version wrapped it in a plain `<View>` for measurement, which broke the FlatList grid's row layout) and measure it into screen coordinates via `measureInWindow`. That measurement is triggered by a `requestAnimationFrame`-scheduled effect on mount/target-change — react-native-web's `onLayout` (a `ResizeObserver` polyfill) didn't fire reliably on initial mount, so it's kept only as a supplementary re-measure (along with `onScroll`) rather than the primary trigger.

Shared state: `app/context/TaskContext.tsx` — single source of truth for `tasks`, loads/saves to AsyncStorage under key `"tasks"`. Delegates streak/stat calculation to `app/utils/streaks.ts` (see below). Also exposes `archiveTask`/`restoreTask` (flip `task.archived`, same `updateTask` path), `importTasks(tasks, { mode, exportMeta })` (`'replace'` or `'merge'`, used by Settings' Import — see below), and `getCompletionCount(task, date)` (today's progress toward `timesPerDay`, backed by a `Map<taskId, Map<date, timesCompleted>>` cache). Also tracks `lastImport` (`{ exportId, importedAt }`, persisted under AsyncStorage key `"lastImport"`) so Settings can detect re-importing the same file.

Three extra mutators exist purely to back the toast "Undo" actions described below, and aren't general-purpose:
- `restoreDeletedTask(task)` re-inserts an already-deleted task exactly as captured (same id/completions), appended to the end — position isn't preserved.
- `undoCompleteTask(taskId, date?)` reverses exactly one `completeTask` press: decrements `timesCompleted` if >1, otherwise removes that day's completion entirely. This is distinct from `uncompleteTask` (used by `TaskCalendarScreen`'s tap-a-day-to-clear-it), which always clears the whole day regardless of count — undoing one accidental tap on a multi-rep task shouldn't also wipe out reps logged earlier that day.
- `restoreCompletion(taskId, completion)` re-inserts an exact `TaskCompletion` record (same id/date/timesCompleted), for undoing `TaskCalendarScreen`'s clear-a-day tap — since `uncompleteTask` wipes the whole day, Undo needs the snapshot taken just before that call, not just a single `completeTask` re-add (which would lose a multi-rep day's count).

## Toasts (confirmation/undo policy)

`app/context/ToastContext.tsx` (`useToast().showToast({ message, action?, duration? })`) + `app/components/ToastBanner.tsx` (rendered once at the root, in `_layout.tsx`, as a sibling of `AppGate` — so it overlays every screen and survives navigation) replace `Alert.alert` as the app's default feedback mechanism. Only one toast shows at a time; a new one replaces whatever's currently up. The banner is a solid, theme-independent dark bar with white text and an accent-colored action label, same reasoning as `OnboardingHint`'s bubble — needs to read clearly regardless of the current theme.

The policy, per the user's explicit direction (2026-08-07): **no modal confirmations** — perform the action immediately and offer "Undo" via toast — for every action *except* Archive/Delete Task, which the user asked back into an `Alert.alert` confirm specifically because they now live at the bottom of the Edit Task form (denser, easier to mis-tap) rather than their own dedicated screen. Concretely:
- **Complete a task** (`HomeScreen.handleTaskLongPress`) → toast + Undo (`undoCompleteTask`).
- **Toggle a day on `TaskCalendarScreen`** (tap a day to complete/clear it) → toast + Undo either way: completing uses `undoCompleteTask`, clearing snapshots the day's `TaskCompletion` before calling `uncompleteTask` and restores it via `restoreCompletion` (needed for multi-rep tasks, where clearing loses a `timesCompleted` > 1 that a plain re-complete wouldn't recover). Originally left off the calendar on the reasoning that tapping again was already its own undo, but the user asked for it back in for consistency with the rest of the app (2026-08-06).
- **Delete / Archive Task** (`AddTaskScreen`, editing mode only) → `Alert.alert` confirm first, *then* toast + Undo (`restoreDeletedTask` / `restoreTask`) after — belt-and-suspenders for anyone who confirms on autopilot. Restoring an archived task doesn't get a toast; re-archiving is the obvious reverse action, always one tap away.
- **Import Data** → no more merge-vs-replace `Alert.alert` prompt. "Import Data" always merges; "Import & Replace All Data" is its own explicit, separately-labeled Settings row (destructive-red icon/text). Either way the full previous `tasks` array is snapshotted before `importTasks` runs, so the toast's Undo is just `importTasks(previousTasks, { mode: 'replace' })` regardless of which mode the original import used. The old "this file looks newer/older/already-imported" advisory copy (which existed to inform the pre-action Merge/Replace choice) was dropped since that choice no longer happens at runtime; "already imported before" now folds into the post-import toast message instead.
- **Export, validation errors, generic failures** → plain info toast, no action — these were always single-dismiss notices, never true confirmations, so converting them was just consistency cleanup.

**Web-testing caveat:** `Alert.alert` (the Archive/Delete confirm) is a no-op on react-native-web in this project's setup — tapping Archive/Delete in a web build shows nothing and does nothing (verified: neither the task's `archived` flag nor its existence changes), rather than silently skipping the confirmation and acting anyway. This isn't a bug introduced here; react-native-web simply doesn't implement native `Alert.alert`. It works normally on Android (the actual target platform). Do one manual smoke test on-device: Edit Task → Archive Task / Delete Task → confirm the modal appears and both Cancel and the destructive action behave as expected.

**A real bug this surfaced (fixed, worth knowing about):** every `TaskContext` mutator used to read the `tasks` array via closure. That's fine for handlers invoked synchronously off a fresh render, but toast "Undo" actions are captured once and invoked *later* — by then the closure's `tasks` could predate the very state update the undo is supposed to reverse (e.g. `undoCompleteTask` couldn't find the completion it was told to remove, since its closure was from before `completeTask`'s update had landed). Fixed by having every mutator build its next array from `saveTasks`'s functional-updater `prev` parameter instead of the outer `tasks` variable — see `withUpdatedStats` and the `saveTasks(prev => ...)` pattern used throughout. Caught by manually driving the full press-toast-undo cycle in a browser rather than just checking the toast rendered.

`app/utils/streaks.ts` — frequency-aware streak engine, extracted from `TaskContext`:
- Filters completions to "qualifying" ones first (`timesCompleted >= task.timesPerDay`) — a partially-logged day doesn't count.
- `daily` / `specific_days_of_week`: builds the due-day sequence and only breaks a streak on a missed **due** day; non-due days are skipped, not counted as gaps.
- `days_per_week` / `days_per_month`: the streak unit is the period (week/month) — a period counts as "met" once enough distinct qualifying days land in it, including mid-period for the current one (so hitting the weekly quota early still keeps the streak alive without waiting for the week to end).

Data model (`app/types/index.ts`):
- `Task`: id, name, icon, color, `frequency` (`daily | specific_days_of_week | days_per_week | days_per_month`), `daysOfWeek`, `daysPerWeek`, `daysPerMonth`, `timesPerDay`, timestamps, optional `archived`, `stats`, `completions`
- `TaskCompletion`: id, taskId, `date` (yyyy-MM-dd, the day it counts for), `completedAt` (actual timestamp), `timesCompleted` (increments per press up to `timesPerDay`, rather than one record per press)

`app/utils/data.ts` holds pure chart/date-range helpers (time-frame bucketing, day-of-week/hour-of-day histograms, aggregate stats) used by Dashboard and per-task Stats screens.

Three smaller pure-logic modules were pulled out of component files specifically so they're unit-testable (components themselves aren't unit-tested — see Testing above): `app/utils/periodStats.ts` (`getExpectedPeriodTotal` — the frequency-aware "x/N" quota math behind TaskCard's "This week"/"Past 30 days" boxes), `app/utils/pieWedge.ts` (`buildPieWedgePath` — the SVG path geometry behind `PartialDayPie`'s clockwise wedge), and `app/utils/calendarGrid.ts` (`getTrailingBlankCount` — the leading/trailing blank-cell padding math shared by the calendar grids in `TaskCard`'s flipped face and `TaskCalendarScreen`).

`app/utils/importExport.ts` — export/import logic used by `SettingsScreen`:
- Export shape is `TasksExport` (`app/types/index.ts`): `{ schemaVersion, exportId, exportedAt, appVersion, taskCount, tasks }`. `schemaVersion` is currently always `1`; `migrateTasksExport` (a `switch` on `schemaVersion`) is the intended landing spot for future format migrations, but there's only the one case so far.
- `parseTasksImport` accepts both the wrapped `TasksExport` format and the old bare-`Task[]`-array format (pre-schema exports) for backward compatibility — legacy imports parse with `meta: null`.
- Import is either `'replace'` (drop-in swap) or `'merge'` via `mergeTaskLists`: tasks are matched by `id`; for a match, the task with the newer `updatedAt` wins for top-level fields, and `completions` are unioned by completion `id` (not concatenated) so re-importing doesn't duplicate completions. Tasks only present in one list are kept as-is. Which mode runs is picked by which Settings row the user tapped (see Toasts section below), not a runtime prompt.

`TaskCard.tsx` is the most complex component: a flip card with three faces (task/calendar/stats) cycled via long-press-context-dependent actions, plus its own completion animation (progress ring, checkmark swap, streak badge pop, confetti-style `ParticleSystem`), and a secondary static progress ring + "`n`/`timesPerDay`" label for multi-rep tasks.

## Known gaps / bugs (found by reading, not yet fixed)

1. **`TaskCalendarScreen` and `TaskStatsScreen` throw synchronously if the task isn't found yet.** Both do `if (!task) throw new Error('Missing task')` on first render. `tasks` loads asynchronously from AsyncStorage in `TaskContext`, so a hard page reload / direct deep link on web (or a cold app launch landing straight on one of these routes) hits this before `loadTasks()` resolves, showing a crash screen instead of a loading state. Reproducible by navigating straight to `/task-calendar?taskId=...` via a fresh page load rather than in-app navigation. Fix: show a loading/`null` state while `tasks` is empty-but-still-loading, rather than throwing.
2. **`calculateAggregateStats` averages completion rate incorrectly** (`utils/data.ts`): `stats.completionRate = (stats.completionRate + task.stats.completionRate) / 2` run in a `reduce` is a running average that overweights later tasks in the array, not a true mean. Low priority (dashboard cosmetic only).

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
- ✅ Export/import data with schema/versioning + merge-or-replace (2026-08-06: added `TasksExport` wrapper with `schemaVersion`/`exportId`/`exportedAt`, a merge mode alongside replace, and staleness/already-imported prompting — see `app/utils/importExport.ts`). Export verified on web (correct JSON shape) and the merge/parse/validation logic verified via a standalone script; the native file-picker UI itself still can't be driven via browser automation, so **do one manual smoke test**: Settings → Import Data → pick an exported file → confirm the Merge/Replace All prompt behaves as expected (including re-importing the same file to see the "already imported" message).

Remaining backlog is MVP+/MMP/Future tier per `TODO.md` (calendar year map, sharing, reminders, monetization, widgets, sync, onboarding, timeline/heatmap views, points/ranks, social features) plus the gaps listed above.
