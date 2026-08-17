# Streakaholic

A playful, private habit & streak tracker for Android. React Native + Expo (Router), TypeScript,
local-only persistence via AsyncStorage. Solo indie project. Web is used only for quick functional
testing during development — not a target platform (no web-specific polish).

Naming: "Streakaholic" is final, kept as-is.

Brand/copy: [BRAND.md](BRAND.md) is the source of truth for user-facing strings —
`app/constants/brand.ts` holds branded UI strings. Sentence case in the UI. Say "habit" to the
user, not internal "task" (data model/files/types stay `Task`-named — only user-facing copy
changed). A handful of casual contexts ("Habit Collector!" badge names, idiomatic flavor text)
intentionally keep looser phrasing.

> **Note on this file's history**: this doc used to carry a long blow-by-blow changelog of every
> UI iteration (colors tried and rejected, animation constants retuned repeatedly, etc.). That's
> been condensed away — git history has the real record. What remains below is current-state
> architecture and non-obvious lessons worth knowing before touching this code again.

## Stack

- Expo SDK 54, expo-router (file-based routing, typed routes), React 19 / RN 0.81
- State: Zustand + `persist` middleware, AsyncStorage-backed (`app/stores/`) — see State
  management below
- Animation: `react-native-reanimated` v4 throughout `TaskCard.tsx`/`ParticleSystem.tsx`/
  `TrophyBadge.tsx`
- Safe areas: `android.edgeToEdgeEnabled: true` — every custom header applies
  `useSafeAreaInsets().top`; bottom-anchored elements add `insets.bottom`
- Charts: `react-native-chart-kit` (no internal memoization — see Performance notes)
- Icons: `@expo/vector-icons` MaterialCommunityIcons; `MaterialCommunityIconName` type is derived
  from the glyph map, so a typo in an icon name is a `tsc` compile error
- Data export/import: `expo-file-system`, `expo-sharing`, `expo-document-picker`
- Notifications: `expo-notifications` + `@react-native-community/datetimepicker` — **native-only,
  requires an EAS dev-client build; will not load in Expo Go** (SDK 53+ removed it there)
- Theming: `app/hooks/useThemeColors.ts` — semantic palette off `useColorScheme()`. Every
  screen builds its `StyleSheet` via `createStyles(colors)` + `useMemo`. Task/status/brand colors
  (task.color, streak red/orange, achievement palettes) are deliberately left un-themed.
- Testing: `jest` + `jest-expo`, `npm test`. Scope is **pure functions in `app/utils/*.ts`
  only** — no component/store tests. Test files live in top-level `__tests__/utils/`, **not**
  co-located in `app/` — with `typedRoutes` on, expo-router scans every file under `app/` as a
  route candidate and a `.test.ts` there gets bundled into the app and crashes at runtime.

## Animation timing rule

Coordinated animation beats must share one authoritative UI-thread clock. If two elements should
meet/collide/hand off/start together, drive them from one Reanimated `SharedValue` and derive
local progress from it — don't independently approximate the same moment with a mix of
`withDelay`, child-mount effects, `setTimeout`, and React state (JS scheduling/commit/paint add
variable latency, so mathematically-equal constants can still look out of sync). Small
perceptual lead/lag is fine as a threshold on the shared clock, applied after synchronization is
structurally correct — not as ad-hoc millisecond nudges. Independent `withDelay` loops remain fine
for unrelated ambient/random effects; JS timers remain fine for non-frame-sensitive control flow
(auto-dismiss, cleanup) — Android animation-finished callbacks have proven unreliable for driving
real control flow, so completion/commit logic uses a fixed `setTimeout` sized to the animation's
worst case, not the animation library's own "finished" callback.

## Architecture

File-based routing under `app/`; each route file re-exports a screen in `app/screens/`.

- `index` → `HomeScreen`: grid of `TaskCard`s (2–4 col responsive), streak filter bubbles, FAB
- `dashboard` → `DashboardScreen`: header (back/task-filter/tabs) + swapped content —
  `DashboardCalendarView` (infinite horizontal Timeline grid w/ Grid|Bars|Streamgraph modes),
  `DashboardStatsView` (aggregate stats/charts), `DashboardStreaksView` (streak history list,
  shared with per-task view). Tab selection persists via `settingsStore`'s `dashboardLastTab`.
- `add-task` → `AddTaskScreen`: create/edit form (`taskId` search param). Collapsible sections
  (Task Name/Icon/Color/Frequency/Nag Level) via shared `CollapsibleSection`, each with a live
  summary when collapsed; collapsed by default when editing, expanded when creating. Archive/
  Delete are the only place in the app still using a modal `Alert.alert` confirm (denser form,
  easier mis-tap) — everything else uses toast+Undo. Save button is task-colored, elevated,
  primary; Archive is outlined secondary; Delete is a plain text link (deliberately quietest
  control despite being most consequential). Guards unsaved edits on back-navigation via
  `usePreventRemove` (Material's full-screen-dialog convention) — bypassed for intentional exits
  (Save/Delete/Archive/Restore) via a ref flag checked inside the callback.
- `settings` → `SettingsScreen`: Data, Task Cards, Achievements (celebrate toggle w/ offer-to-
  backfill, Trophy Case link, Unsnooze All Celebrations), Help, About, Developer (`__DEV__`-gated)
- `archived-tasks`, `about`, `trophies` (Trophy Case), `debug-notifications` (`__DEV__`-gated)
- `task-detail` (modal) → per-task Calendar/Stats/Streaks, one `TaskHeader` + swapped content.
  `TaskHeader` shows an interactive `TaskProgressIcon` (press-and-hold to complete, prev/next task
  cycling via `router.setParams` so the screen instance persists), a frequency badge, a status
  badge (tap → plain-English status-summary popover, `app/utils/taskStatusSummary.ts`).

Onboarding is five independent contextual hints (`app/components/OnboardingHint.tsx` +
`useOnboardingTarget.ts`), reactive to live card/screen state, tracked per-key in
`settingsStore.onboardingHintsSeen`. No stored "progression."

## State management

Zustand + `persist`, three original stores (`taskStore`, `settingsStore`, `lastImportStore`) each
with a **custom `PersistStorage`** (not `createJSONStorage`) that detects and wraps the pre-Zustand
bare-value AsyncStorage shape on first read — needed because those three keys predate the
`{state, version}` persist envelope; skipping this would silently hydrate to empty defaults on
first launch after the migration. `achievementsStore` is newer and has no legacy shape, so it uses
plain `createJSONStorage`.

- `tasks: Task[]` stays a flat array (not normalized) — every mutator rebuilds via `.map()`/
  `.filter()`, which preserves object reference for unaffected tasks, so per-task selectors skip
  re-rendering automatically with zero extra plumbing.
- No completion cache — `getCompletionCount`/`isTaskCompleted` (`streaks.ts`) read
  `task.completions` directly; a `useMemo`'d `buildCompletionCountsByDate` Map (also in
  `streaks.ts`) backs any calendar-grid-scale lookup loop (O(1) instead of re-scanning).
- Hydration gate: each store exposes `hasHydrated`; `_layout.tsx`'s `AppGate` waits on all four
  before rendering, else shows a loading screen.
- Bulk-consumer screens use `zustand/react/shallow`'s `useShallow`; 1–2-field consumers just call
  the hook multiple times with primitive selectors.
- **Stats staleness**: `task.stats` is a cached snapshot, only recomputed by `withUpdatedStats` at
  actual mutation time. Nothing re-triggers it just because real time passes — a long streak left
  untouched overnight can show yesterday's stale `streakStatus` on reopen. Fixed via
  `maybeRefreshStats()` (`taskStore.ts`), called from `AppGate` on hydration + every `AppState`
  → `'active'` transition, guarded by a same-day `statsRefreshedOn` check (not persisted) so it's
  a no-op after the first check each day, not a full-array rebuild on every foreground.
- Toast "Undo" actions are captured once and invoked later — every mutator therefore builds its
  next array from `saveTasks`'s functional-updater `prev` param, never a closed-over `tasks`
  variable, or a delayed Undo can silently no-op against stale state.
- `ToastContext` (small, ephemeral, few consumers) deliberately stayed as React Context — no
  need for selective subscription there.

## Toasts / confirmations

No modal confirmations except Archive/Delete Task (see above) — actions apply immediately with a
toast + Undo (`app/context/ToastContext.tsx` + `ToastBanner.tsx`, one at a time, swipeable,
`GestureHandlerRootView` wraps the app root for this). `AchievementCelebration`'s own top-anchored
notification host sits at a *higher* `zIndex` than `ToastBanner` — a toast triggered from
*inside* the celebration screen (e.g. its mute toggle) must render above it, not be hidden behind
its backdrop. **`Alert.alert` is a no-op on react-native-web** in this setup — the Archive/Delete
confirm must be smoke-tested on-device, not in a browser.

## Data model (`app/types/index.ts`)

- `Task`: id, name, icon, color, `frequency` (`daily | specific_days_of_week | days_per_week |
  days_per_month`), `daysOfWeek`, `daysPerWeek`, `daysPerMonth`, `timesPerDay`, timestamps,
  optional `archived`/`stats`/`completions`/`notifications`
- `TaskCompletion`: id, taskId, `date` (yyyy-MM-dd, which day it counts for), `completedAt` (real
  timestamp), `timesCompleted`
- **Streak length is always a day-count, regardless of frequency** — a `days_per_week`/
  `days_per_month` quota only decides *which* days qualify toward the streak; it never changes the
  counting unit to weeks/months. (`streaks.ts`'s `currentStreak`/`bestStreak` are day counts
  everywhere.)

## Key `app/utils/` modules

- `streaks.ts` — the frequency-aware streak engine. Due-day types (`daily`/
  `specific_days_of_week`) walk every calendar day into segments gated by due-day; a miss only
  breaks the chain at an actual due day, non-due days add bonus credit. Quota types
  (`days_per_week`/`days_per_month`) evaluate at the period level via `getQuotaPeriodInfo`
  (shared primitive, avoids re-deriving "count qualifying days in this period, compare to quota"
  three separate times). `'expiring'` status requires today itself still undone — already-done-
  today suppresses it even if the rest of the period is tight. `getStreakBadgeStyle(task)` is the
  canonical status→icon/color map (red fire / orange clock / gray sleep), reused everywhere a
  streak status renders.
- `reports.ts` — `getTaskStreakChains`/`getRecentStreaks` reconstruct actual streak-run history
  (dates, not just counts) by re-walking the same segmentation logic. `getDayStreakState` classifies
  any empty day as `'connected'` (soft, still counts toward a live/closed chain) / `'hardMiss'`
  (was actually required and missed) / `'softMiss'` (never mattered — non-due, or before any real
  chain existed). `buildDayConnectionInfo` layers run-boundary/badge info on top for calendar
  rendering.
- `data.ts` — chart/date-range helpers, `calculateAggregateStats` (true mean now, not a running
  average), `getBarPercentage` (chart-kit's bars are a fixed 32px regardless of chart width/bar
  count — this rescales so bars don't overlap on a 24-bar histogram).
- `formatFrequency.ts` — turns raw schedule fields into human phrases ("Daily", "3x weekly", "4x
  daily" — collapses "Daily · 4x daily" to just "4x daily" since the times-per-day already implies
  every day). Deliberately duplicates a small day-abbreviation array rather than importing
  `constants/task.tsx` (which pulls in `@expo/vector-icons`, breaking jest resolution for this
  otherwise-pure file).
- `taskStatusSummary.ts` — `getTaskStatusInfo(task)` builds the tap-to-expand header popover:
  schedule sentence, optional frequency explainer (for quota/specific-days types), branching
  status line, optional "this is your best streak" line.
- `achievements.ts`, `taskLimits.ts`, `iconSearch.ts`, `notifications.ts`, `importExport.ts`,
  `periodStats.ts`, `pieWedge.ts`, `calendarGrid.ts` — see their own sections below.

## Free-tier task cap

`taskLimits.ts`: `MAX_ACTIVE_TASKS = 6` (non-archived). Enforced at three mutation points that can
increase the active count: `AddTaskScreen` (creation), `HomeScreen`'s FAB/empty-state button
(blocks navigation to the form), `ArchivedTasksScreen`'s Restore. **Deliberately not enforced on
import** (merge or replace) — `MONETIZATION.md` states data export/import is never gated, since
paywalling a user's own data would break the "your data is yours" promise; accepted as a known
bypass. Also not enforced on toast-Undo of a delete/archive (own-action-reversal window, judged
not worth the UX complexity).

## Achievements (`app/utils/achievements.ts` + `achievementsStore.ts`)

Purely cosmetic celebration system. 24 kinds across streak-length tiers, lifetime-completion
tiers, and moment-based kinds (perfect day/week, comeback, anniversary, early bird/night owl,
habit collector, century-club tiers). Full-screen `AchievementCelebration.tsx` (animated
`TrophyBadge` medallion, `Confetti`, sequential reveal) fires from a `pendingCelebrations` queue;
Trophy Case (`TrophiesScreen.tsx`) is a badge grid grouped Unlocked → Locked (in-progress first,
then not-started), with a per-task filter row and locked-card celebration preview (`__DEV__`-only).

**Extensibility is the whole point of the architecture** — nothing downstream branches on
`AchievementKind` by name. Every kind's `AchievementMeta` entry (`icon`, `title`, `describe`,
`flavorText`, `ribbon`, `triggerSuffix`/`triggerStandalone`, `repeatable`, `scope`
(`'task'|'global'`), `color: {base, glow, accent, theme}`, and a `progressStrategy` — one of five
closed variants: `fixed-threshold`, `ratio-to-own-best`, `readiness`, `today-progress`,
`task-age`) is the single source every consumer (detection, Trophy Case progress bars, ribbon
text, description sentences) dispatches against. Adding a new *tier* of an existing strategy needs
one metadata entry and nothing else; a genuinely new *rule* still needs its own detection block.

**Detection** (`detectCompletionAchievements`) runs from `taskStore.completeTask` only — a real
user action, never from undo/uncompletion/import. Dedup: one-time kinds use a plain scope key
(`taskId` or `'global'`); **repeatable task-scoped kinds** (streak-N tiers, new-best-streak,
comeback) date-qualify their scope (`` `${taskId}:${dateString}` ``) so an undo-then-redo of the
same completion can't re-fire the identical crossing — a specific calendar date can only represent
one genuine threshold crossing per task.

**Retroactive scan** (`detectRetroactiveAchievements`, exposed via a Settings toggle-on offer and
a Trophy Case action) does a genuine chronological replay of every completion ordered by
`completedAt` (not `date` — `completedAt` is what determines the `asOfDate` passed to
`calculateTaskStats`, matching what live completion actually does; this is also what lets a
backfilled past-day completion via the Calendar tab bridge two runs into a single-jump new-best-
streak). `calculateTaskStats`/`calculateDueDayStats`/`calculateQuotaStats` all take an optional
`asOfDate` param specifically to make this replay possible. Repeatable task-scoped kinds use a
counting-based dedup guard (how many times already recorded, keyed on `kind:taskId` not the full
date-qualified scope string) since the same kind can legitimately be earned multiple times by one
task across real history. `comeback`/`perfect-day`/`perfect-week` are only detectable this way
(need "state as of a specific past moment," not a current snapshot); `task-age`/`active-task-count`
use a simpler direct current-snapshot check instead.

**Per-kind mute ("snooze")**: `achievementsStore.mutedKinds`. A muted kind's live unlock shows a
compact top-anchored `AchievementAlert` instead of the full celebration; a Trophy Case replay
always forces the full celebration regardless of mute (`forcedCelebrationIds`). Bulk-restore via
Settings' "Unsnooze All Celebrations."

**No revocation on Undo, no automatic historical backfill** (only via the explicit retroactive
scan) — both stated design decisions, not gaps.

## Notifications (`app/utils/notifications.ts`)

Per-task escalating reminders (Level 0–4: none/dismissable/repeated/persistent/alarm-style).
Schedules only the **single next due-and-incomplete occurrence** per task (deterministic ids
`reminder:${taskId}[:nag${n}]`, no OS-level recurring trigger) — recomputed on every task mutation
that could affect it, plus a bulk sweep on app-foreground. This means a task left completely
untouched for several days without the app ever reopening will only get the one reminder that was
already scheduled — there's no pre-scheduled queue of future occurrences (a known, accepted
architectural limitation, not yet revisited). Level 4 ("alarm") is explicitly **not** a true
alarm — no continuous sound/vibration loop, no lock-screen bypass, no `SCHEDULE_EXACT_ALARM`
(Play Store restricts that to real alarm/calendar apps); it's a stronger channel + non-dismissable
notification, one buzz on delivery. Debug screen at `/debug-notifications` (`__DEV__`-gated) reads
live from `expo-notifications`' own inspection APIs rather than trusting app-side bookkeeping.

## Performance notes

- `react-native-chart-kit` has zero internal render-skipping — every prop change fully redraws.
  Chart cards are extracted into shared `React.memo`'d components (`StatsCharts.tsx`) with
  memoized `chartConfig`, and lazy-mounted via `app/components/LazyMount.tsx` (measures position
  relative to a stable content-root ref via `measureLayout`, not `measureInWindow` — RN has no
  native `IntersectionObserver`).
- Calendar-grid-scale per-cell lookups always go through a pre-built `Map` (see `streaks.ts`
  above), never a per-cell linear scan over `task.completions`.
- Achievement progress/detection avoid full-array sorts for "top-N most recent" queries
  (`selectMostRecentByCompletedAt`, a bounded single-pass buffer) and pre-filter to only the
  relevant kind subset when scoped to one task (`TASK_SCOPED_KIND_ORDER`) rather than computing
  the full catalog and discarding most of it.

## RN/Android gotchas worth knowing before debugging a layout issue

- **`overflow: 'hidden'` + a shadow (`shadowColor`/elevation) on the same View clips the shadow
  away on Android.** Split into a shadow-only wrapper + a clipped inner view (see
  `TrophyBadge.tsx`'s `badgeShadowWrap`/`badgeClip` split).
- **`top: '50%'` + a negative `marginTop` for centering is unreliable against a parent whose size
  comes from `aspectRatio` rather than an explicit height** (bit multiple calendar-connector
  features). Prefer a full-size absolutely-positioned wrapper with `justifyContent: 'center'`
  (flex-based centering) instead of percentage-position + negative-margin.
- **Toggling `backgroundColor` on an already-`borderRadius`ed View post-mount can regenerate the
  rounded-corner drawable incorrectly on only one side on Android.** Prefer sliding a separate,
  always-solid-color indicator via `transform: translateX` instead of conditionally recoloring a
  shared element.
- **A fractional dot/cell size (and the sub-pixel offsets it produces across a row) anti-aliases
  inconsistently between adjacent cells on Android** (not reproducible on web) — floor computed
  cell sizes to a whole pixel, and add `overflow: 'hidden'` to plain-`backgroundColor` circular
  Views as a second mitigation.
- Reanimated's spring config here uses `mass`/`damping`/`stiffness`/`energyThreshold` (no
  `restDisplacementThreshold`/`restSpeedThreshold` in this version — `tsc` will catch it if you
  guess wrong). `Easing.out(...)` wraps a curve that's *already* out-shaped — flips it; only wrap
  curves designed as ease-in.
- `usePreventRemove` intercepts back-button/gesture/programmatic nav uniformly — a screen with
  intentional exits that shouldn't trigger a confirm (Save success, etc.) needs a bypass ref
  checked *inside* the callback, not a timing-dependent prop toggle.

## Known gaps / open bugs

- `TaskCalendarScreen`/`TaskStatsScreen`/`TaskDetailScreen` throw synchronously if `taskId` isn't
  found in the (async-loading) store — reachable via a stale deep link or a fresh page load on
  web before `tasks` finishes hydrating. Should show a loading/null state instead.
- Reported (2026-08-13, not yet investigated): the calendar streak-count badge on
  `specific_days_of_week` tasks can land one day early relative to `TaskHeader`'s own status badge
  — likely in `getDueDayStreakChains`'/`isFirstDueDayAfter`'s handling of "today" as a live,
  not-yet-closed chain.

## MVP status

Original MVP checklist is fully implemented (naming, Reanimated migration, frequency-aware
streaks, times-per-day tracking, edit flow, archive/restore, empty states, dark mode, export/
import with schema+merge). Remaining backlog is MVP+/MMP/Future tier — see `TODO.md`, the
authoritative roadmap (calendar year map, sharing, monetization, widgets, sync, timeline/heatmap
views, points/ranks, social features).
