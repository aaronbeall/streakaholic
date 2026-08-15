# Native Performance Review

Last reviewed: 2026-08-14

Tracker last updated: 2026-08-14

## Executive summary

Streakaholic already has a sound performance foundation: React Native's new architecture is enabled, most interaction animation runs through Reanimated, Zustand selectors limit unrelated store-driven renders, task references are updated immutably, expensive charts are lazy-mounted and memoized, and long task lists use `FlatList` with stable keys and item layouts.

The most important remaining problems are concentrated in a few paths rather than spread throughout the app:

1. Completing a habit synchronously recalculates history, evaluates achievements, and persists the full task store while the completion animation is in progress.
2. Screens beneath the active native-stack screen can remain subscribed and render work that the user cannot see.
3. Startup and foreground handling repeats broad stats and notification work even when nothing changed.
4. Dashboard calendar work grows with the full loaded history and is not incrementally computed.

Those issues should be addressed before bundle-size cleanup and smaller render refinements. The completion path is the most likely to improve animation smoothness and perceived responsiveness on typical Android devices.

Fire particles intentionally play when qualifying task cards mount. This is desired product behavior, even when several cards celebrate together. A deferred safeguard (`PERF-001`) proposes a shared particle budget that preserves the behavior while reducing particle counts for lower-priority systems during unusually dense simultaneous bursts.

Task cards also intentionally pre-render their hidden calendar face. This shifts work into Home mounting so the first tap-to-flip remains smooth; a prior lazy version visibly lagged while creating the calendar. `PERF-004` now records lower-risk alternatives for future consideration rather than recommending that eager rendering simply be removed.

This review targets the native Android app. React Native Web behavior and browser profiling are intentionally out of scope because web is only a quick functional-testing environment for this project.

## Rating system

### Priority

- **P0 — Immediate:** directly competes with common interactions or can create large avoidable animation/render workloads.
- **P1 — High:** meaningful cost during navigation, startup, foregrounding, or long-history use.
- **P2 — Medium:** useful optimization with a smaller or more situational user-facing effect.
- **P3 — Low:** polish, safeguards, or future scale work after the main bottlenecks are removed.

### Impact

- **High:** likely to affect frame consistency, interaction latency, startup time, or scalability in normal use.
- **Medium:** noticeable in particular screens, data sizes, or navigation paths.
- **Low:** primarily preventative or a modest reduction in background work.

### Complexity

- **S:** localized change with limited architectural risk.
- **M:** crosses a few components or needs careful lifecycle/testing work.
- **L:** changes data flow, persistence, or a nontrivial calculation pipeline.

## Implementation tracker

This is the source-of-truth checklist for the review. Keep the stable `PERF-###` IDs when updating an item so code changes, commits, and testing notes can refer back to the same finding.

- `[ ]` means implementation remains open.
- `[x]` means the code change and automated validation are complete.
- Native QA is tracked separately where it is still useful; it does not erase completed implementation work.
- If an issue is intentionally deferred or rejected, leave it unchecked and add a dated note explaining the decision.

When addressing an issue, check off its concrete subtasks as they land, check the parent only after implementation and automated validation are complete, and add a dated `Status` note to its detailed finding. Update `Tracker last updated` above in the same change. The phase plan and summary matrix are ordering/reference views; their IDs point back to this single authoritative checklist.

### P0 — Primary interaction and animation

- [x] **PERF-002 — Remove per-particle JavaScript timers**
  - [x] Mount the particle set once per burst.
  - [x] Move randomized spawn staggering to Reanimated `withDelay`.
  - [x] Remove `visibleCount` and its per-particle React state updates.
  - [x] Retain only the single system-level completion timer used for reliable Android control flow.
  - [x] Pass TypeScript, lint, Jest, and Android production-export validation.
  - Native follow-up: visually confirm stagger timing on a physical Android device.
- [ ] **PERF-003 — Reduce synchronous completion-path work**
  - [ ] Add release-like Android timing spans for completion-array construction, task stats, the task-store commit/stringification, achievement preparation/detection/persistence, and notification dispatch.
  - [ ] Record the time from `completeTask` entry to the task-store subscriber notification and to the next rendered frame.
  - [x] Add immutable-reference `WeakMap` caches for per-task completion-count maps, so unchanged tasks do not rescan their histories for every completion.
  - [x] Reuse the capped per-task recent-completion windows used by early-bird/night-owl detection instead of rescanning all active histories.
  - [ ] Measure `calculateTaskStats` separately for daily, specific-day, weekly-quota, and monthly-quota tasks with long and sparse histories.
  - [ ] Add a fast path for ordinary current-day completion only if it can exactly match the full calculation; retain the full path for backfills, undo, restore, imports, and uncertain cases.
  - [ ] Narrow persistence so one completion does not stringify every task's full history; define and test migration from the current `tasks` key.
  - [ ] Prefer immediately starting a narrow durable write over blind debounce; if writes are coalesced, define background flush and explicit failure/retry behavior first.
  - [x] Diff notification schedules instead of blanket cancel/dismiss/reschedule after every completion-related mutation.
  - [ ] Preserve an immutable before/after snapshot and serialized ordering for achievement detection; do not let deferred work observe a newer, unrelated store state.
  - [ ] Verify daily and quota streaks, multi-rep completion, backfilled dates, repeated completion, undo/redo deduplication, perfect-day/week, time-of-day achievements, reminders, hydration, migration, and abrupt termination.

### P1 — Invisible work, startup, and scale

- [x] **PERF-005 — Freeze blurred native-stack screens**
  - [x] Enable `freezeOnBlur` explicitly on the root native Stack.
  - [x] Keep the setting scoped to the existing root Stack rather than globally changing future navigators.
  - [x] Pass TypeScript, lint, Jest, and Android production-export validation.
  - Native follow-up: confirm hidden Home does not rerender or start new render-driven celebrations under detail/settings screens.
  - Native follow-up: confirm a hidden Dashboard does not recompute its active stats/calendar/streaks view after task changes in a pushed detail screen.
  - Native follow-up: confirm task detail does not rerender behind its Add/Edit Habit modal.
  - Native follow-up: verify state catches up immediately when a screen regains focus.
  - Native follow-up: check whether already-running Reanimated worklets, timers, or effects continue while frozen; handle those separately if measurements justify it.
  - Native follow-up: regression-test back navigation, modal dismissal, multi-screen stacks, deep links, theme changes, and achievements.
- [ ] **PERF-006 — Reduce startup and foreground reconciliation**
  - [ ] Persist the local date for which derived task stats were last refreshed.
  - [ ] Skip same-day task-history recalculation when data is unchanged.
  - [x] Skip reminder-disabled tasks in the normal notification pass.
  - [x] Diff desired and scheduled notifications instead of blanket cancel/reschedule.
  - [x] Invalidate only affected task schedules after normal mutations.
  - [ ] Test imports, date/timezone changes, daylight saving, permissions, and device reboot behavior.
- [ ] **PERF-007 — Make Dashboard calendar work incremental and bounded (partially addressed; larger redesign deferred)**
  - [x] Share day-keyed streak-chain reconstruction across Home, Task Calendar, Dashboard, and recent-streak reporting by immutable task reference.
  - [x] Replace repeated per-day linear streak-chain scans with a shared binary-search lookup.
  - [ ] Calculate only newly appended calendar pages (deferred; recent-first infinite history is intentional and current cost is accepted).
  - [ ] Memoize day columns so pagination does not rerender unchanged dates (deferred pending native evidence).
  - [ ] Bound or aggregate older streamgraph history (deferred; do not alter the product's infinite-scroll history without a demonstrated need).
  - [ ] Validate Grid/Bars interaction with a ten-year native stress data set.
  - [x] Pass focused calendar/streak tests, the full Jest suite, TypeScript, and lint for the scoped lookup changes.

### P2 — Perceived latency, bundle, and render hygiene

- [ ] **PERF-008 — Reassess completion commit timing (deferred; current behavior accepted)**
  - [ ] Measure recognition-to-visible-commit latency on Android.
  - [ ] Decide whether to commit at long-press recognition or shorten the post-recognition delay.
  - [ ] Keep cosmetic animation independent from mutation timing.
  - [ ] Guard against early release and duplicate completion.
- [x] **PERF-009 — Narrow icon and chart imports**
  - [x] Switch every MaterialCommunityIcons use to its supported direct module import.
  - [x] Import BarChart and LineChart from their direct package subpaths.
  - [x] Confirm the production source map contains only the required icon family and chart modules, with no Lodash sources.
  - [x] Compare clean Android production exports made with the same command.
  - [x] Pass TypeScript, lint, Jest, and Android production-export validation.
- [ ] **PERF-010 — Move non-route code out of Expo Router's `app/` tree**
  - [ ] Establish the target `src/` structure and import aliases.
  - [ ] Move components, screens, hooks, stores, types, and utilities mechanically.
  - [ ] Leave only route files/groups under `app/`.
  - [ ] Run a complete native navigation and typed-route regression pass.
### P3 — Deferred animation and rendering safeguards

- [ ] **PERF-001 — Add a global concurrent-particle budget (deferred)**
  - [ ] Preserve the intentional behavior where qualifying task cards celebrate on mount.
  - [ ] Add shared awareness of how many particle systems start in the same render/mount burst.
  - [ ] Give earlier and higher-on-screen systems priority for the full particle count.
  - [ ] Progressively reduce particle counts for systems lower on screen or rendered later.
  - [ ] Define a sensible minimum count so lower-priority celebrations still read as celebrations.
  - [ ] Avoid mid-animation particle removal, visual popping, or unstable count rebalancing.
  - [ ] Validate Home mounts with approximately 1, 5, 10, and 20 simultaneous fire systems on Android.
- [ ] **PERF-004 — Reduce hidden-calendar pre-render cost without regressing first-flip responsiveness (deferred)**
  - [ ] Keep the current eager calendar rendering unless native Home measurements justify a change.
  - [ ] Measure Home mount cost separately from first-flip latency on representative Android devices.
  - [ ] Consider delayed, top-to-bottom batched prewarming after the first Home paint.
  - [ ] Consider promoting a card's calendar prewarm on touch-down so it is ready before the flip midpoint.
  - [ ] Consider caching/precomputing the calendar model while leaving native cell mounting just-in-time.
  - [ ] Consider viewport-aware prewarming for visible and near-visible cards.
  - [ ] Consider flattening the noninteractive mini calendar into a lighter SVG rendering while retaining eager mounting.
  - [ ] Reject any alternative that restores the previously observed first-flip hitch or displays a blank destination face.
- [ ] **PERF-011 — Remove scroll-position state from stats parents if native profiling justifies it (deferred)**
  - [ ] Measure parent and child render counts in both Task Stats and Dashboard Stats in a release-like Android build.
  - [ ] Record JS/UI slow frames while scrolling before assuming the approximately 10 parent renders per second are user-visible.
  - [ ] Include a many-task Dashboard case because its per-task completion bars are rebuilt on each parent render.
  - [ ] If warranted, keep the latest scroll offset in a ref and move visibility checks into a small imperative chart-mount coordinator.
  - [ ] Update React state only when a chart first crosses its pre-mount threshold, not for every sampled scroll position.
  - [ ] Preserve one-way lazy mounting and enough pre-mount margin that users never scroll onto an empty chart card.
  - [ ] Confirm time-range controls, chart interaction, rotation/layout changes, and lower-end Android scrolling after the change.
- [x] **PERF-012 — Move achievement count-up off JS state**
  - [x] Replace `requestAnimationFrame` plus per-frame React state with a Reanimated shared value and `withTiming`.
  - [x] Update a display-only native SVG text span through animated props without rerendering `CelebrationContent`.
  - [x] Preserve logarithmic 1–3 second duration scaling, cubic ease-in-out pacing, integer rounding, and comma grouping.
  - [x] Keep the animated field out of accessibility focus so the full-screen alert is announced once rather than once per number.
  - [x] Pass pure formatting/timing tests, TypeScript, lint, Jest, and Android production-export validation.
  - Native follow-up: visually confirm 2, 10, 100, and 1,000+ counts animate without clipping on a physical Android device.
- [ ] **PERF-013 — Add lifecycle and reduced-motion guards**
  - [ ] Pause or cancel continuous trophy animation while the app is inactive.
  - [ ] Honor the platform reduced-motion preference.
  - [ ] Preserve a clear celebratory presentation without continuous motion.

## Prioritized findings

| ID | Priority | Finding | User impact | Complexity | Main area |
| --- | --- | --- | --- | --- | --- |
| PERF-002 | P0 | Particle creation schedules one JavaScript timer per particle | High | S–M | Animation |
| PERF-003 | P0 | Habit completion performs history-wide calculation and full-store persistence synchronously | High | L | Updates/state |
| PERF-005 | P1 | Inactive native-stack screens are not frozen | Medium–High | S | Rendering/navigation |
| PERF-006 | P1 | Startup/foreground stats refreshes and notification rescheduling repeat broad work | High | M–L | Startup/native APIs |
| PERF-007 | P1 | Dashboard calendar and streamgraph cost grows with all loaded history | Medium currently; High after deep long-history scrolling | L | Rendering/calculation |
| PERF-008 | P2 | Completion feedback has about 1.25 seconds of intentional gating before state commits | Medium–High perceived | M | Interaction design |
| PERF-009 | P2 | Broad icon/chart imports increase the native bundle | Medium | S–M | Bundle/startup |
| PERF-010 | P2 | Non-route modules live under Expo Router's `app/` directory | Medium | L | Project structure |
| PERF-011 | P3 | Stats parents update React state repeatedly while scrolling, although memoized charts are protected | Low–Medium, profile-dependent | M | Rendering |
| PERF-001 | P3 | Add a shared particle budget for dense simultaneous mount celebrations | Medium in dense bursts | M | Animation |
| PERF-004 | P3 | Reduce hidden-calendar pre-render cost without regressing first-flip responsiveness | Medium if Home mount becomes costly | M–L | Rendering |
| PERF-012 | P3 | Addressed: achievement count-up formerly used JS-thread frame updates | Low–Medium | M | Animation |
| PERF-013 | P3 | Continuous achievement animation does not account for reduced motion or app state | Low | S–M | Animation/accessibility |

## Detailed findings and recommendations

### PERF-001 (P3): Add a shared budget for simultaneous mount celebrations

**Area:** `app/hooks/useFireCelebration.ts`, `app/components/TaskCard.tsx`, `app/components/ParticleSystem.tsx`

**Status:** Deferred by product decision on 2026-08-14. Celebrating qualifying fire badges when their cards mount is intentional and should be preserved.

**Desired behavior and future risk**

`useFireCelebration` reacts to the task's current badge icon, so a card that mounts with a qualifying fire badge celebrates immediately. This is a desired part of the Home experience, not an incorrectly replayed completion event.

The future scaling concern is aggregate density. With ten qualifying habits and the default particle count of 18, a Home mount can create roughly 180 particles. `PERF-002` removed per-particle JavaScript timers, but each particle still has legitimate UI-thread animation and view costs. A much larger simultaneous burst could therefore compete with Home layout and rendering on slower Android devices.

**Impact:** Medium and situational. The current behavior is accepted; optimization is only needed if dense simultaneous celebrations cause native frame drops.

**Complexity:** Medium.

**Future approach**

Introduce a lightweight global particle-budget coordinator. Particle systems registering within the same mount/render burst receive an allocation rather than always using their requested full count. Earlier systems—normally the cards rendered first and higher on screen—keep more of their requested particles. Later or lower-on-screen systems receive progressively smaller counts while retaining a minimum visible celebration.

Prefer actual visibility/layout position when it is available cheaply; render order is an acceptable fallback because Home renders top-to-bottom. Allocate once before a burst starts rather than removing already-mounted particles during animation, which would cause popping and make coordination harder to reason about.

Do not replace mount-triggered celebrations with completion-only events as part of this work.

**Acceptance checks**

- Qualifying fire badges still celebrate when Home mounts or remounts.
- One or a few simultaneous systems retain the existing full visual density.
- As concurrency grows, aggregate particle count stays within the defined global budget.
- Systems higher on screen/rendered earlier receive priority over lower/later systems.
- Lower-priority systems still render a recognizable minimum celebration.
- No particle count changes after an individual animation begins.

### PERF-002 (P0): ParticleSystem creates a JavaScript timer for every particle

**Area:** `app/components/ParticleSystem.tsx`

**Status:** Addressed 2026-08-14. All particles now mount once and use Reanimated `withDelay` for UI-thread staggering. The single system-level completion timer remains for reliable Android cleanup/control flow.

**Previous behavior**

Particle reveal is staggered by scheduling an individual JavaScript `setTimeout` for each particle and updating React state as each timeout fires. This creates a burst of timers, JS callbacks, state updates, reconciliations, and native handoffs during an animation that should largely stay on the UI thread.

**Impact:** High during dense simultaneous mount celebrations; Medium in a single-card celebration. Timer storms could interrupt gesture handling and other JS work even when the visual transforms themselves used Reanimated.

**Complexity:** Small to Medium.

**Recommended fix**

Mount the particle set once and express staggered starts with Reanimated `withDelay`, keeping the reveal scheduling on the UI thread. Retain at most one JS-side completion callback/timer for cleanup or lifecycle notification.

If mounting all particles at once is visually or architecturally inconvenient, batch particle groups rather than updating React state once per particle.

**Acceptance checks**

- A celebration does not schedule a timer per particle.
- The same particle timing and visual density are preserved.
- Interrupting or unmounting a celebration does not leave callbacks that update stale state.
- Completion remains responsive while particles are active on a mid-range Android device.

### PERF-003 (P0): Completion updates do too much synchronous work

**Area:** `app/stores/taskStore.ts`, `app/utils/streaks.ts`, `app/stores/achievementsStore.ts`, `app/utils/achievements.ts`, Zustand persistence, and notification reconciliation

**Status:** Open. This remains P0 because it sits directly in the app's primary interaction and its cost grows with both the changed task's history and the user's total active history.

**Observed behavior**

`completeTask` presents one synchronous JavaScript turn containing several differently scaling operations. Some occur before Zustand can publish the changed task; others occur immediately afterward but can still occupy the JS thread before React renders the next frame.

| Stage | Current work | Scaling characteristic | Position relative to the task commit |
| --- | --- | --- | --- |
| Find/update the dated completion | Scan the changed task for the date, then map its completion array for an existing date or spread it for a new date. | O(changed task history), with two passes when updating an existing date. | Before commit |
| Recalculate task stats | Filter qualifying completions, create sets/maps and sorted dates, then walk calendar days or quota periods from the first completion through the requested date. | O(changed task history + elapsed calendar range); sparse multi-year histories can cost more than their entry count suggests. | Before commit |
| Publish task state | Map the task array while preserving unchanged task references, then synchronously notify Zustand subscribers. | O(task count), normally cheap relative to history work. | Commit |
| Persist the task store | Zustand persistence invokes `taskStorage.setItem`, whose `JSON.stringify(value)` serializes every task and every completion before `AsyncStorage.setItem` can perform its asynchronous native write. | O(all task data), plus a large temporary string allocation. | As part of the persisted store update |
| Prepare achievement lookup maps | Addressed: retrieve runtime-read-only maps from a `WeakMap` keyed by each exact completions-array reference. Only the changed task's new array is indexed; unchanged tasks reuse their maps. | O(changed task history + active task count), rather than O(all active history). | After task commit, same JS turn |
| Prepare achievement deduplication | Rebuild a `Set` from the complete earned-achievement history. | O(achievement history). | After task commit |
| Detect achievements | Check task thresholds, task age, comeback, perfect day/week, global totals, active-task count, and time-of-day ratios. Addressed: the time-of-day window reuses each unchanged task's cached top-N slice and merges at most N candidates per task. | Mostly bounded rule checks; only the changed task rescans its history for a new top-N slice. | After task commit |
| Record an unlock | If anything is earned, update the achievements store and stringify its persisted achievement history as a separate write. | O(achievement history) only on an unlock. | After task commit |
| Reconcile reminders | Addressed: derive a deterministic desired intent and enqueue reconciliation against the observed native snapshot. An unchanged intent performs no native work; a changed occurrence is repaired serially. | Small pure comparison for ordinary updates; native work only when reminder intent changes. | After task commit |

The changed task is the only task whose `.stats` are recalculated here; unchanged tasks already retain their object references. The all-task repetition comes from achievement lookup-map construction and full-store serialization, not from `calculateTaskStats` being called for every task.

The ordering also matters. The new task state cannot be published until the completion-array update and full stats calculation finish. Once it is published, achievement preparation, detection, persistence, and notification dispatch can still delay the next JS-driven render or callback even though the in-memory store already contains the completion.

**Concrete scale examples**

- A task with ten years of sparse specific-day history can make the stats calculation walk thousands of calendar dates even if it contains far fewer completion records.
- Previously, 30 active tasks containing 1,000 dated records each made one completion rebuild indexes over roughly 30,000 records. The implemented cache now indexes the changed task's roughly 1,000 records and reuses the other 29 indexes.
- The same completion stringifies the complete persisted `tasks` envelope. Its cost therefore increases when unrelated tasks accumulate history.
- Updating a multi-rep completion for an existing day first searches for the record and then maps the same changed-task history to replace it.
- Before both time-of-day achievements are permanently earned, only the changed task rebuilds its newest-N slice; the cross-task merge is bounded by active-task count times the small window size.

**Impact:** High. Habit completion is the core, frequent interaction; even moderate pauses here are disproportionately visible.

**Complexity:** Large because correctness matters across streaks, achievements, persistence, undo, and process termination.

**Recommended sequence**

Do not begin by making the whole path asynchronous. First remove repeat work while preserving the existing transactional semantics, then change persistence and scheduling behind explicit durability rules.

#### 1. Measure the actual slices

Instrument release-like Android builds around completion-array construction, `calculateTaskStats`, task-store publication and task JSON serialization, achievement map/dedup preparation, achievement detection and persistence, and notification dispatch. Capture both elapsed JS time and the first rendered frame after `completeTask` begins. Test each schedule type because the daily/specific-day and quota algorithms have different cost shapes.

This establishes whether stats, cross-task achievement preparation, serialization, or native dispatch dominates on representative data. Development-mode React timings are not an adequate basis for redesigning durability.

#### 2. Reuse immutable per-task indexes — implemented 2026-08-14

The shared accessor now uses a module-level `WeakMap` keyed by the exact `TaskCompletion[]` reference. On one completion, only the changed task receives a new completions-array identity; every unchanged task safely reuses its prior map. No cache is keyed by task ID, so imports, undo, restore, or edits cannot retrieve an index from an older same-ID history.

Cached maps are now used by live achievement detection, task-card calendars, task calendar, and dashboard calendar. Shared indexes are exposed through a runtime-read-only facade with no `set`, `delete`, or `clear`; the existing mutable builder remains separate for private calculations that genuinely need a fresh `Map`.

The time-of-day helper similarly caches each task's frozen newest-N slice by completions-array identity, then merges at most N candidates per active task. New-reference and old-snapshot regression tests verify that replacement histories never reuse or contaminate same-task-id results.

#### 3. Optimize changed-task stats carefully

`calculateTaskStats` cannot be globally memoized for the changed task because every real completion intentionally creates a new completions array. Profile it independently. If it is material, add an incremental fast path for the common operation—adding one current-day rep—using the previous stats plus a maintained history index or bounded affected period.

The fast path must fall back to the current full calculation for backfilled calendar dates, undo, restoring a cleared completion, imports, schedule-setting changes, day rollover, and any case whose effect is not provably local. Daily/specific-day and weekly/monthly quota streaks should not share an incremental algorithm merely for convenience; their linking rules differ.

#### 4. Narrow persistence rather than merely delaying it

The safest structural improvement is to stop persisting one monolithic `tasks` value. Viable designs, in increasing complexity, are:

| Storage shape | Completion write cost | Tradeoff |
| --- | --- | --- |
| One record per task plus a small ordered task index | Serializes only the changed task's metadata/history and the index only when order changes. | Straightforward migration and good reduction when users have many tasks, but a single task's full history is still rewritten. |
| Task metadata separate from per-task completion history | A completion rewrites only that task's history. | More keys and hydration coordination; still O(changed task history). |
| Append/update-oriented completion records or a local database | Writes approximately the changed day/record rather than the full history. | Best scaling and query flexibility, but highest migration, compaction, transaction, backup/export, and recovery complexity. |

Per-task persistence is the recommended first target unless measurements show individual histories themselves are already too large. Preserve a migration reader for the current `tasks` key, write the new form successfully, verify it, and only then retire the legacy value.

Blindly debouncing the existing whole-store write would shorten some bursts but increase the interval in which a killed process can lose a completion. React Native has no universally reliable synchronous shutdown hook. If coalescing is introduced, writes should still begin promptly, failures should remain retryable/observable, and `AppState` backgrounding should request a flush without being treated as the sole durability guarantee.

#### 5. Keep achievement ordering exact

Achievement detection can remain synchronous initially after its indexes are fixed. If profiling still shows meaningful post-commit contention, it may move into a serialized job queue using immutable `prevTask`, `nextTask`, task-list, date, and completion-index snapshots captured by the mutation. Detection must read the latest earned-scope set when its job executes, and jobs must execute in completion order, or rapid consecutive completions could duplicate or miss threshold, perfect-day, and perfect-week unlocks.

Deferring only the celebration presentation is safe; weakening the recorded achievement history or allowing detection to observe an unrelated later task state is not.

#### 6. Diff notification intent — implemented 2026-08-14

Each scheduled request now carries a deterministic intent key and ordinary mutations compare against a process-local snapshot of native state. Only a changed occurrence/content set is cancelled and replaced. Hydration, foreground, and import run a recovery-grade diff from one scheduled/presented-notification query; permission, day/timezone, fired/missing, legacy, and orphaned state therefore self-heal without blanket cancellation. If a completion now satisfies today's quota, moving the reminder to the next due day remains correctness work; partial reps and unrelated edits perform no native calls.

**What not to do**

- Do not optimistically display a completion that is absent from the authoritative in-memory store; the task commit itself should remain atomic.
- Do not use a mutable cache keyed only by task ID.
- Do not replace exact streak/achievement logic with an approximate counter.
- Do not send achievement detection to an unordered timer without immutable snapshots and dedup sequencing.
- Do not claim an AsyncStorage write is durable merely because its promise was started.
- Do not fold PERF-008's intentional long-press/animation delay into this measurement. PERF-003 begins when `completeTask` is actually invoked; changing when it is invoked is a separate interaction-design decision.

**Acceptance checks**

- The in-memory completion commit and next rendered state occur measurably sooner on the representative Android data/device matrix.
- A completion on one task does not rebuild completion-count maps for unchanged tasks.
- Ordinary completion does not stringify unrelated tasks' completion history.
- Daily, specific-day, weekly-quota, and monthly-quota stats match the current implementation for current-day completion, multi-rep partial/full transitions, backfill, undo, restore, and day rollover.
- Achievement records and celebration order match for threshold crossings, comeback, new best, perfect day/week, global totals, and time-of-day rules, including rapid consecutive completions and undo/redo deduplication.
- Reminder cancellation and next-occurrence scheduling remain correct after completion, undo, background/foreground, permission changes, and process restart.
- Existing installs migrate without data loss; import/export and task ordering remain unchanged.
- A completion survives immediate backgrounding and realistic abrupt-termination tests, and storage failures are surfaced or retried rather than silently discarded.
- Before/after traces report calculation, serialization, achievement, and notification costs separately so improvements cannot be hidden by a different stage regressing.

### PERF-004 (P3): Reduce hidden-calendar pre-render cost without regressing first-flip responsiveness

**Area:** `app/components/TaskCard.tsx`, calendar components and streak-chain utilities

**Status:** Deferred by product decision on 2026-08-14. Keep the current eager calendar rendering unless native measurements show that its Home-mount cost warrants another approach.

**Current behavior and rationale**

The initial card-side collection includes both `task` and `calendar`, and both faces render even though only one is visible. The hidden calendar still builds completion maps, derives streak-chain information, creates its day grid, and mounts its component tree for every visible task card.

This is intentional pre-rendering. An earlier lazy implementation produced a noticeable hitch when the user tapped to flip because the calendar had to calculate and mount at that moment. Paying the cost during Home rendering makes the first flip immediate and visually complete.

`CardCalendar` is already wrapped in `React.memo`, and its completion map and streak chains use `useMemo`. The remaining tradeoff is initial calculation/native-view mounting for each mounted card versus guaranteed first-flip responsiveness.

**Impact:** Medium and situational. Eager mounting increases Home's initial work and memory, but removing it would regress a confirmed interaction-quality problem. Treat it as a future optimization only if native Home measurements reveal meaningful cost.

**Complexity:** Medium to Large, depending on the alternative.

**Alternatives for future consideration**

| Alternative | Home-mount cost | First-flip behavior | Complexity | Main tradeoff |
| --- | --- | --- | --- | --- |
| Keep eager rendering | Highest | Best and deterministic | None | Current choice; acceptable while Home performs well |
| Delayed, batched prewarming | Lower first paint | Usually instant | M | A very early tap could arrive before that card is ready |
| Prewarm/promote on touch-down | Low | Potentially smooth | S–M | Calendar work can still compete with the beginning of the gesture/animation |
| Precompute the calendar model only | Medium–Low | Better, but not guaranteed | M | Removes history calculations from the flip; native cells still mount just-in-time |
| Viewport-aware prewarming | Scales best for long lists | Best for visible cards | M–L | Requires visibility/order coordination and careful FlatList lifecycle handling |
| Flatten the mini calendar into SVG | Lower even when eager | Best | M–L | Preserves pre-rendering but requires a rendering rewrite and visual regression testing |

A promising hybrid would render task faces first, precompute/mount visible calendars in top-to-bottom batches after the first paint, and immediately promote a touched card to the front of that queue. Another conservative option is to retain eager mounting while flattening the mini calendar's many native Views into a lighter, noninteractive SVG.

Any experiment should separately measure initial Home work, first-flip latency, JS/UI frames, and memory. Optimizing only the mount metric would be a regression if it restores the interaction hitch.

**Acceptance checks**

- First flip remains visually seamless, with no blank frame or calculation hitch.
- Home's native mount/frame measurements improve enough to justify the added lifecycle complexity.
- Visible and higher-on-screen cards receive prewarming priority when applicable.
- Rapid taps, long presses, repeated flips, task completions, and FlatList recycling do not expose stale calendar data.
- The current eager implementation remains the fallback if an alternative cannot beat both mount and flip behavior.

### PERF-005 (P1): Inactive stack screens remain active

**Area:** `app/_layout.tsx`, Expo Router/native-stack configuration

**Status:** Addressed 2026-08-14. The root native Stack now sets `freezeOnBlur: true`. The setting is deliberately local to this Stack rather than enabled globally. Automated validation passed; the native navigation scenarios below remain the device QA checklist.

**Previous behavior**

The root Stack did not set `freezeOnBlur`. Native-stack screens normally remain mounted so their local state and scroll position survive navigation. Detaching or covering a native screen does not by itself unsubscribe its React tree from Zustand. A task, settings, or achievement mutation could therefore schedule React work in every mounted route that selected the changed state, even when only the top route was visible.

Freezing is narrower than unmounting. It suspends React rendering for the blurred route and preserves its last rendered native view/state until focus returns. It does not stop the Zustand action itself, persistence, notification scheduling, root-level UI, or necessarily every timer/effect/UI-thread worklet that was already running.

**Routes in scope**

Every route declared in the root native Stack can be affected when another route is pushed above it:

| Underlying route | Common covering route | Relative opportunity | Why |
| --- | --- | --- | --- |
| Home (`/`) | Dashboard, Settings, Trophy Case, Add Habit, or task detail | High | Home selects the full task array; its header derives streak counts and its visible cards contain pre-rendered calendars and fire-celebration logic |
| Dashboard (`/dashboard`) | Trophy Case or task detail | High | Dashboard selects all tasks and its active tab can contain aggregate charts, long-history calendar calculations, or streak lists |
| Task detail (`/task-detail`) | Add/Edit Habit or Trophy Case | Medium–High | Detail selects all tasks and renders a task header plus the active Calendar/Stats/Streaks subtree |
| Settings (`/settings`) | Archived Habits, About, or notification debug | Medium | Settings subscribes to tasks, settings, import state, and achievement counts |
| Archived Habits (`/archived-tasks`) | Add/Edit Habit | Medium | The archived list selects the full task array and derives its filtered list |
| Trophy Case (`/trophies`) | Any subsequently pushed route | Medium | It selects tasks and achievements and derives filtered trophy state |
| Add/Edit, About, and notification debug | Any subsequently pushed route | Low in current navigation | These are either forms or relatively light screens, and currently have few routes pushed above them |

The opportunity depends on the actual stack, not just the route name. A route at the bottom of a deeper stack can remain mounted under multiple screens.

**Concrete examples**

1. **Home → task detail → complete a habit.** Task detail commits to `taskStore` and visibly updates its header. Without freezing, hidden Home also receives the new task array. Home recomputes filtered task data and streak summaries; the changed `TaskCard` rerenders its task and pre-rendered calendar faces, and `useFireCelebration` can start another fire burst behind the modal. Freezing prevents that hidden consumer work and lets Home catch up once it is focused.
2. **Home → Settings → toggle card name/counter/background.** Every mounted `TaskCard` subscribes to these display settings. Without freezing, changing the option can restyle/rerender the covered Home grid while Settings is still on top. A theme change is broader still because most screens derive themed styles. Freezing should prevent blurred screen trees from reconciling until they return, while the visible Settings screen and root Stack still update normally.
3. **Home → Dashboard → task detail → complete a habit.** Both Home and Dashboard sit underneath the modal. Without freezing, the single task mutation can update the visible detail screen, the hidden Dashboard task selector and active aggregate view, and the hidden Home grid. This is the strongest multiplicative example because a Dashboard calendar or stats tab can be much heavier than a basic settings screen.
4. **Home → task detail → Edit Habit → save.** The Add/Edit modal updates the task before navigating away. The covered task-detail screen and Home can both react to that mutation even though the edit form is the only visible route. Freezing avoids intermediate hidden renders; both screens must still show the saved data when they become visible.
5. **Home → Settings → Archived Habits → edit or restore.** This can leave Home, Settings, and Archived Habits mounted in one stack. A task mutation can notify all three route trees. Freezing limits rendering to the top/active route and defers catch-up for the others.
6. **Dashboard Stats → Trophy Case → change achievement state.** Dashboard Stats subscribes to achievements for its preview. Without freezing, achievement mutations in the Trophy Case can update the hidden stats screen as well as the visible trophy grid.

**Not affected by this setting**

- Switching Calendar/Stats/Streaks inside Dashboard or task detail is local conditional rendering, not native-stack navigation; `freezeOnBlur` does not apply to those internal tabs.
- `AppGate`, `ToastBanner`, and `AchievementCelebration` live outside the Stack and remain active.
- Store calculations, AsyncStorage persistence, and notification reconciliation still execute when an action is dispatched; freezing only avoids blurred route consumers rendering the result immediately.
- An animation, timer, or effect that started before blur may continue because the screen remains mounted. `PERF-013` covers explicit animation lifecycle guards.

**Impact:** Medium to High during navigation and completion flows.

**Complexity:** Small, with navigation lifecycle verification required.

**Implemented fix**

The root native Stack now enables `freezeOnBlur` in its own `screenOptions`. The installed navigation/screens versions support that option directly, so global `enableFreeze()` was intentionally not used. This gives the current Stack the desired lifecycle while leaving any future navigator's choice explicit. Screens must still be verified to catch up correctly when focused again.

This is a broad, low-code optimization but should be measured before and after. Its main risk is shifting a deferred catch-up render onto the back transition: a frozen screen may hold its old visual snapshot and then reconcile several store changes as it regains focus. If that produces a visible stale frame or return-navigation hitch, a more targeted alternative is to make only the heaviest routes focus-aware or pause specific subscriptions/derivations while blurred.

**Acceptance checks**

- Hidden Home and Dashboard trees do not rerender in response to covered task/settings/achievement mutations.
- Covered screens do not start new fire celebrations or other effects while blurred as a consequence of those deferred renders.
- Returning to Home, Dashboard, task detail, Settings, or Archived Habits immediately shows current store state without a stale frame or transition hitch.
- Local screen state—selected Dashboard tasks/tab, scroll positions, edit form contents, and task-detail tab—remains intact.
- Modal dismissal, deep links, multi-level back navigation, theme changes, and queued achievement UI still work.
- Any already-running animation/timer behavior is explicitly measured rather than assumed to stop.

### PERF-006 (P1): Startup and foreground work is broader than necessary

**Area:** `app/_layout.tsx`, `app/stores/taskStore.ts`, `app/utils/notifications.ts`

**Status:** Partially addressed 2026-08-14. Notification intent diffing and affected-task invalidation are implemented; persisting the stats-refresh date and the full native date/timezone/reboot matrix remain open.

**Previous notification behavior**

After hydration and on foreground transitions, the app refreshes task stats and reschedules notifications broadly.

The stats refresh marker is not persisted, so a cold launch can recalculate and rewrite all task stats even when they were already calculated for the same local day.

Notification scheduling cancels and dismisses multiple known identifiers for each active task before it checks whether notifications are disabled. With twenty active habits, the current cleanup-first pattern can produce up to roughly 160 native cancel/dismiss calls per broad pass, even when many habits have no enabled reminder.

**Implemented notification behavior**

- Each scheduled reminder now carries a deterministic intent key derived only from fields that affect its content or occurrence.
- Hydration, foreground, and import reconciliation read scheduled and presented native notifications once, then repair only missing, changed, delivered, legacy, or orphaned identifiers.
- Ordinary task mutations reuse the observed process-local snapshot and perform no native query, cancellation, dismissal, permission check, or scheduling call when intent is unchanged.
- Partial multi-rep completions, color/icon changes, stats updates, and other non-reminder mutations therefore leave an identical installed reminder alone.
- Reminder operations run through one serialized queue so a rapid completion/undo or pair of edits cannot finish out of order.
- Permission state is refreshed during the recovery pass and reused by normal mutations; an external grant/revocation is picked up when the app foregrounds.
- Imports invoke the recovery-grade diff so removed-task reminders are cleaned up and matching schedules remain installed.

The first recovery pass deliberately replaces legacy reminders that have no intent key. Subsequent passes can prove equality without relying on platform-specific trigger normalization.

**Impact:** High for startup/foreground responsiveness, battery use, and native bridge/module traffic.

**Complexity:** Medium to Large.

**Recommended fix**

- Persist a local-date marker indicating the day for which derived task stats were last refreshed. Recompute on hydration only when that date is stale or data migration/import invalidates it.
- Keep the foreground check cheap: compare the marker before walking task histories.
- Completed: skip reminder-disabled tasks during the normal scheduling pass.
- Completed: query native reminder state once during recovery, compute deterministic desired schedules, and apply a diff.
- Completed: reconcile only the affected task after normal edits/completions, with recovery-grade passes for hydration, foreground, and imports.

**Acceptance checks**

- Opening the app twice on the same day does not rewrite unchanged task stats.
- Crossing a day boundary correctly refreshes streak status.
- Disabled reminders cause no per-task native cancellation churn in a normal foreground pass. Automated reconciliation coverage passes.
- Imports and reminder-setting changes still reconcile stale OS notifications. Import integration is implemented; native import testing remains.
- Device reboot, permission changes, timezone/date changes, and daylight-saving transitions are covered by manual native tests.

### PERF-007 (P1): Dashboard calendar work scales with all loaded history

**Area:** `app/screens/DashboardCalendarView.tsx`, `app/utils/reports.ts`

**Status:** Partially addressed 2026-08-14. Streak-chain reconstruction is now cached once per immutable task version and local day, then shared by Home, Task Calendar, Dashboard, and recent-streak reporting. Per-day membership, prior-chain, and neighboring-chain checks now use binary search over chronological chains instead of repeatedly scanning the full list. The Timeline remains intentionally recent-first with infinite scroll into history; incremental page calculation, column memoization, and streamgraph aggregation are deferred unless native evidence makes the deeper redesign worthwhile.

**Observed behavior**

Loading another 30-day page still rebuilds day-connection information over the entire loaded range rather than computing only the appended dates. Grid mode virtualizes date columns, but streamgraph mode renders the loaded axis and a growing SVG/path as one unbounded visualization. The formerly repeated full-history streak reconstruction and linear per-cell chain scans have been removed from this path.

Synthetic JavaScript benchmarks from the review showed approximately linear growth:

| History | Task stats | Streak chains | Calendar connection map |
| --- | ---: | ---: | ---: |
| 1 year daily | 1 ms | 2 ms | 8 ms |
| 5 years daily | 5 ms | 9 ms | 39 ms |
| 10 years daily | 11 ms | 18 ms | 78 ms |

These figures came from the project's Jest/V8 environment and are useful for relative scaling only. Android Hermes and device rendering can be slower, so they are not native performance claims.

**Impact:** Low to Medium for the intended recent-first use. It can become High only when a user with long, multi-task histories scrolls far enough back to keep a large range loaded.

**Complexity:** Large.

**Remaining options if native measurements justify them**

- Calculate only the newly appended 30-day page and merge it with prior memoized results.
- Memoize individual day columns so appending history does not rerender already-loaded columns.
- Bound the streamgraph's daily resolution. For example, keep recent daily samples and aggregate older history weekly or monthly, or cap the interactive daily window to a documented range.
- Avoid constructing one ever-growing SVG path when segmented/aggregated paths can preserve the useful visual result.

These are deliberately deferred. The Timeline's infinite recent-first exploration is part of the product design, and the remaining work adds state/cache complexity that is not justified by the currently expected usage.

**Acceptance checks**

- Appending a page performs work proportional to the new page, not the total loaded range.
- Existing visible date columns do not rerender during pagination without a data change.
- Grid and streamgraph remain interactive with a 10-year synthetic history on a representative Android device.
- Aggregation does not materially misrepresent completion trends.

### PERF-008 (P2): Completion feedback intentionally delays the state update

**Area:** `app/components/TaskCard.tsx`, `app/components/TaskProgressIcon.tsx`

**Status:** Deferred by design 2026-08-14. The immediate long-press acknowledgment and local success animation make the interaction feel responsive enough; committing later also prevents store updates and achievement presentation from interrupting or obscuring that animation. Revisit only if the delayed success haptic, toast, or downstream state update feels sluggish on-device.

**Observed behavior**

The card waits for a 500 ms long press before recognizing completion, and the progress icon waits approximately another 750 ms before invoking `onCompleted`. Persistence, toast feedback, store updates, achievements, and related views therefore begin roughly 1.25 seconds after touch-down.

This may be experienced as performance lag even if every frame renders smoothly.

**Impact:** Medium to High perceived latency because completion is the primary interaction.

**Complexity:** Medium; this is partly an interaction-design choice rather than a pure optimization.

**Recommended fix**

Commit the completion as soon as the long press is recognized, then run the cosmetic pop/particle sequence independently. Keep undo available if early commit makes accidental completions more likely. Alternatively, shorten the post-recognition animation before commit while preserving the deliberate hold gesture.

**Acceptance checks**

- Completion state and haptic response happen promptly at gesture recognition.
- The animation still communicates success rather than appearing detached from the action.
- Releasing early does not complete the habit.
- Navigation and repeated presses cannot double-commit during the visual sequence.

### PERF-009 (P2): Broad imports increase bundle size

**Area:** icon imports throughout `app/`, `app/components/StatsCharts.tsx`

**Status:** Addressed 2026-08-14. All MaterialCommunityIcons imports now use the direct package module, and StatsCharts imports only BarChart and LineChart through their direct distribution subpaths.

**Previous behavior**

The Android production export completed successfully. The resulting Hermes bytecode was approximately 3.77 MB and bundled assets were approximately 5.2 MB.

Source-map grouping showed several large library contributions:

| Source group | Approximate raw source size |
| --- | ---: |
| Application code | 839 KB |
| Reanimated | 828 KB |
| Lodash | 531 KB |
| date-fns | 521 KB |
| react-native-chart-kit | 287 KB |

MaterialCommunityIcons was imported from the `@expo/vector-icons` package barrel in many files, which bundled more font families and module setup than necessary. `StatsCharts.tsx` imported chart components from the root `react-native-chart-kit` barrel; that barrel eagerly referenced other chart modules, including code that pulled in Lodash.

**Impact:** Medium. Bundle size influences installation, parsing, and startup, though the runtime animation findings above are more urgent.

**Complexity:** Small to Medium.

**Implemented fix and measured result**

- MaterialCommunityIcons now comes from `@expo/vector-icons/MaterialCommunityIcons` everywhere, including the glyph-map-derived icon-name type.
- BarChart now comes from `react-native-chart-kit/dist/BarChart`.
- LineChart now comes from `react-native-chart-kit/dist/line-chart`.

Controlled clean Android exports before and after used the same production command:

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Metro modules | 2,141 | 2,071 | 70 fewer |
| Exported asset entries/files | 44 | 26 | 18 fewer |
| Hermes bytecode | 5,816,200 bytes | 5,413,000 bytes | 403,200 bytes smaller (6.9%) |
| Total export directory | 10,960 KiB | 7,824 KiB | 3,136 KiB smaller (28.6%) |

The removed assets are the 18 unused vector-icon font families; MaterialCommunityIcons is the only vector-icon font left. The post-change production source map contains only MaterialCommunityIcons sources plus `AbstractChart`, `BarChart`, `LineChart`, and `LegendItem` from chart-kit. It contains no Lodash or ContributionGraph source entries.

This keeps the existing UI/chart libraries and behavior while reducing packaged fonts, JavaScript modules, bytecode, and total export-artifact size.

### PERF-010 (P2): Expo Router scans non-route modules under `app/`

**Area:** project structure

**Observed behavior**

Screens, components, hooks, stores, types, and utilities all live under Expo Router's route directory. The web development build reports missing-default-export route warnings for these modules because Router treats everything under `app/` as a potential route. Although web behavior is not a performance target, the warnings expose a structural mismatch in the native route manifest as well.

**Impact:** Medium for route/build hygiene and potential startup scanning; the direct runtime gain needs measurement.

**Complexity:** Large due to widespread import-path changes and regression risk.

**Recommended fix**

Move non-route code to a top-level `src/` tree, leaving only route files and route groups under `app/`. Perform this as an isolated mechanical migration after higher-value runtime fixes, with a full native navigation regression pass.

### PERF-011 (P3): Stats parents receive React state updates during scroll

**Area:** `TaskStatsScreen`, `DashboardStatsView`, and `LazyMount`

**Status:** Deferred pending release-like native evidence. This is a real inefficiency, but the current memoization means it is not equivalent to redrawing every chart on every scroll event.

**Observed behavior**

Both stats views store the current vertical offset in parent React state. Their `ScrollView` handlers call `setScrollY(...)` with `scrollEventThrottle={100}`, producing up to roughly ten parent render attempts per second during an active scroll. Each parent passes that changing value to three `LazyMount` wrappers, which compare their measured bounds with the viewport and permanently mount a chart when it approaches visibility.

The position itself is not displayed. It is only an input to those one-time chart-mount decisions. Nevertheless, the parent keeps updating after all three charts have mounted, when no further visibility decision is needed.

**What work actually repeats**

| Area | Behavior during a sampled scroll update |
| --- | --- |
| Task Stats parent | Re-executes the component and reconciles the hero, stat strips, four time-range buttons, achievements preview, and three lazy-mount wrappers. |
| Dashboard Stats parent | Re-executes the component and reconciles the same general structure plus recreates the JSX for every per-task completion bar. This makes a many-task dashboard the most important case to measure. |
| `LazyMount` wrappers | Receive the new offset, render, and run their visibility effect. Before visibility, one may transition to mounted; after visibility, it remains mounted but still receives every new offset. |
| Time-range controls and other non-memoized children | Their functions/JSX may be evaluated again even though their visible values did not change. |

**What is already protected**

- Expensive date-range, completion-pattern, aggregate-stat, chart-data, and task-total calculations use `useMemo` with dependencies that do not change merely because the user scrolled.
- The line and histogram chart-card components use `React.memo`; their data and callbacks remain referentially stable during scrolling, so the chart-kit/SVG trees should not be redrawn on each parent update.
- Lazy mounting is one-way. A chart is not unmounted when it leaves the viewport, avoiding repeated chart construction and lost interaction state.
- A 100 ms throttle is already much less aggressive than updating React state once per display frame.

For example, scrolling through Task Stats for one second may cause about ten parent reconciliation passes, but it should not cause ten recalculations of the completion history or ten line-chart redraws. On Dashboard Stats with 30 tasks, however, the parent also rebuilds the 30 completion-bar element descriptions on each pass. Whether that produces dropped frames depends on the device, data volume, and concurrent native drawing work.

**Impact:** Low to Medium and profile-dependent. It is most plausible on lower-end Android devices, on Dashboard Stats with many task rows, or while a heavy chart is mounting. After the charts are mounted, continued parent updates are pure overhead, but they may still fit comfortably within the frame budget.

**Complexity:** Medium for a robust fix.

**Preferred fix if profiling demonstrates an issue**

Keep scroll position out of parent render state. Store the latest offset in a ref and give a small chart-mount coordinator an imperative visibility check. The scroll handler can compare the offset with measured chart bounds and call React state only when an unmounted chart first crosses its pre-mount threshold. In the normal case this changes the behavior from approximately ten parent state updates per scrolling second to at most one small subtree update per chart for the screen's lifetime.

This plain React Native approach is preferable as a first implementation because it preserves the existing layout-measurement model and avoids introducing UI-thread-to-JavaScript synchronization merely to mount three charts. It must also recheck thresholds when viewport size or measured layout changes.

**Alternatives and tradeoffs**

| Option | Benefit | Tradeoff |
| --- | --- | --- |
| Keep the current implementation | Simplest and already bounded by memoization and a 100 ms throttle. | Retains avoidable parent reconciliation, including after every chart has mounted. |
| Isolate `scrollY` state in a chart-section coordinator | Limits repeated renders to a much smaller subtree while retaining declarative logic. | Still performs React state updates throughout scrolling and requires reshaping ownership around the `ScrollView`. |
| Use a Reanimated shared value and UI-thread threshold checks | Keeps high-frequency position updates off the JS/React path. | React must still be notified to mount a chart; `runOnJS`, layout synchronization, and testing add complexity disproportionate to three thresholds unless the simpler fix is insufficient. |
| Quantize scroll updates by distance | Small change that lowers render frequency. | Only reduces rather than removes the issue, and a large interval can mount charts late. |
| Mount charts at drag/scroll end | Eliminates updates during active motion. | Users can reach blank placeholders before charts mount, making scrolling feel worse. |
| Mount all charts immediately | Removes visibility tracking entirely. | Moves all chart construction into initial screen render, defeating the reason lazy mounting exists. |
| Convert the page to a virtualized list/viewability API | Provides built-in visibility callbacks. | Large structural change for a screen with only a few heavy sections; may unmount charts and introduce more churn than it removes. |

**Acceptance criteria**

- Ordinary scrolling does not rerender either full stats parent solely because its vertical offset changed.
- Each chart mounts before its placeholder becomes visibly exposed and remains mounted afterward.
- A chart threshold is reevaluated after relevant layout or viewport-size changes.
- Time-range switching, chart gestures, navigation back/forward, and achievements preview behavior remain unchanged.
- Release-like Android profiling shows a measurable improvement in render count or slow frames; otherwise the current simpler implementation remains acceptable.

### PERF-012 (P3): Achievement count-up used JS-thread frame updates

**Area:** `app/components/AchievementCelebration.tsx`

**Status:** Addressed 2026-08-14. Automated validation passed; physical Android visual confirmation remains.

**Previous behavior**

The achievement number count-up used JavaScript `requestAnimationFrame` and `setState` for approximately one to three seconds. Heavy subtrees were memoized, so the practical cost was smaller than the particle issues, and this screen is intentionally full-screen and short-lived.

Every displayed integer scheduled a JS callback and rerendered `CelebrationContent`. Memoized trophy, confetti, description, and history children avoided their heaviest work, but React still had to execute and reconcile the celebration parent throughout the animation.

**Implemented behavior**

- `AchievementCount` owns a Reanimated shared value and advances it with UI-thread `withTiming`.
- A display-only animated SVG text span receives the formatted integer through its native `content` prop; React state is not updated per frame.
- The same cubic ease-in-out shape and logarithmic 1–3 second duration remain.
- A worklet-safe formatter preserves rounding and comma grouping without relying on `Intl` inside the UI runtime.
- A fixed 260×76 SVG viewport reserves stable layout and center-anchors each freshly measured glyph run. Unlike Android `EditText`, the display-only span has no cursor, selection, scrolling viewport, or editable line box that can drift or clip as the number changes width.
- The animated SVG is removed from accessibility focus. The existing full-screen alert label remains the single semantic announcement, avoiding rapidly repeated screen-reader updates.
- Starting is still gated by the title reveal, so the count does not complete invisibly while its fixed layout slot is hidden.

**Impact:** Low to Medium.

**Complexity:** Medium, completed.

**Acceptance checks**

- No `requestAnimationFrame`, timer, or per-frame React state drives the count.
- Values at 1, 10, 100, 1,000, and above finish at the exact target with the existing duration scale.
- Comma grouping and integer rounding match the former `toLocaleString` presentation for supported nonnegative achievement values.
- Description reveal timing still waits for the configured count duration plus its settle pause.
- Trophy, confetti, unlock history, close/mute controls, and queued achievement transitions remain unchanged.
- Physical Android QA confirms no clipping, baseline drift, or screen-reader chatter from the native SVG text.

### PERF-013 (P3): Continuous celebration animation needs lifecycle guards

**Area:** trophy/achievement animation components

**Observed behavior**

Some trophy animation loops continue for the lifetime of the celebration view. They are appropriately limited to the full-screen experience, but should stop when the app backgrounds and should honor reduced-motion settings.

**Impact:** Low, with accessibility and battery benefits.

**Complexity:** Small to Medium.

**Recommended fix**

Pause/cancel loops when AppState is not active, and provide a reduced-motion presentation that keeps the celebratory hierarchy without continuous pulses.

## Areas that are already in good shape

### Reordering

The task reordering implementation is structurally efficient:

- It uses `DraggableFlatList` with Reanimated and Gesture Handler.
- Keys are stable.
- Row styles have a fixed, predictable shape.
- The persisted order is written on drop rather than continuously throughout the drag.

The recent Android drag-and-drop issues were primarily gesture activation and drop-feel concerns, not evidence of an expensive render pipeline. Native profiling should still confirm consistent UI frames while dragging a larger list, but no major static performance rewrite is currently indicated.

### State subscription and rendering

The Zustand migration gives screens/components selective subscriptions instead of broadcasting every task or settings mutation through React Context. Immutable task updates also make reference-based memoization reliable.

### Animation architecture

Most transforms and opacity animations already use Reanimated and therefore can run on the UI thread. Mount-triggered fire effects are intentional; their remaining concern is only aggregate particle density during large simultaneous bursts. The other exceptions are orchestration choices such as count-up state, not wholesale use of the legacy Animated API.

### Lists and charts

The app uses stable list keys, `getItemLayout` where appropriate, memoized chart components, and lazy chart mounting. These are valuable safeguards; optimizations should preserve them.

## Recommended implementation sequence

### Phase 1: Protect the primary interaction

- PERF-002: Remove per-particle JavaScript timers.
- PERF-003: Add native release instrumentation around completion recognition, store commit, animation start, and persistence completion.
- PERF-008: Reassess whether completion should commit at long-press recognition instead of animation completion.

**Expected outcome:** less JS contention and faster-feeling habit completion while retaining the intended celebration behavior.

### Phase 2: Remove invisible render work

- PERF-003: Add immutable-reference caches for shared completion maps/streak chains where completion updates reuse them.
- PERF-005: Freeze blurred native-stack screens.

**Expected outcome:** less repeated calculation and no hidden-screen animation/render work, without changing the deliberately pre-rendered task-card calendar.

### Phase 3: Reduce startup and persistence work

- PERF-006: Persist and validate the derived-stats refresh date.
- PERF-006: Diff desired notification schedules rather than blanket cancel/reschedule.
- PERF-003: Split or otherwise narrow persisted completion data writes.

**Expected outcome:** faster foreground transitions, less native-module churn, and completion cost that grows more slowly with history.

### Phase 4: Make history views scale

- PERF-007: Completed shared streak-chain caching and binary-search chain lookup.
- PERF-007: Defer incremental page calculation, day-column memoization, and streamgraph aggregation unless native evidence justifies them.

**Expected outcome:** lower repeated lookup cost in normal recent-first use without changing the Timeline's infinite-scroll behavior; retain deeper scaling options for demonstrated long-history pressure.

### Phase 5: Startup and bundle hygiene

- PERF-009: Narrow icon and chart imports and compare production artifacts.
- PERF-010: Move non-route modules from `app/` to `src/` as a dedicated refactor.

**Expected outcome:** smaller startup/bundle overhead and cleaner route discovery, after interaction bottlenecks are addressed.

### Deferred follow-up: Animation and rendering safeguards

- PERF-001: Add a global concurrent-particle budget only if native traces show dense Home-mount bursts need it.
- PERF-004: Explore staged prewarming, cached calendar models, viewport priority, or flattened rendering only if native Home measurements justify changing the current eager calendar.
- PERF-011: Replace stats-parent scroll state with threshold-driven chart mounting only if release-like Android traces show a meaningful render or frame-time cost.
- PERF-013: Add reduced-motion and background lifecycle handling to continuous celebration loops.

**Expected outcome:** bounded worst-case animation density without removing intentional mount celebrations or adding complexity before measurements justify it.

## Native measurement plan

Browser profiling is deliberately excluded. Validation should use a release or release-like Android build because Expo development mode, remote debugging, logging, and React development checks materially distort timing.

### Representative device/data matrix

- One mid-range physical Android device as the primary performance baseline.
- One older/lower-memory Android device if available.
- Small data set: 5 habits, 30 days.
- Typical data set: 20 habits, 2 years.
- Stress data set: 50 habits, 10 years, including multiple-completions-per-day habits.

### Core scenarios

1. Cold launch to interactive Home.
2. Warm foreground on the same day.
3. Foreground after a date boundary.
4. Complete and undo a habit on Home.
5. Complete a habit from task detail while Home remains in the back stack.
6. Navigate Home → detail → Dashboard → back.
7. Drag a habit through a 30–50 row reorder list.
8. Flip several task cards between task and calendar faces.
9. Scroll stats through every chart.
10. Paginate the dashboard calendar and switch Grid/Bars with long history.
11. Display one achievement and a queue of several achievements.

### Metrics

- JS and UI frame times, including slow/frozen frame counts.
- Time from long-press recognition to visible committed completion state.
- Time spent in task-store update, stats calculation, achievement detection, serialization, and notification reconciliation.
- React render counts for Home, the changed task card, unrelated task cards, and hidden screens.
- Cold-start and warm-foreground time to interactive.
- Peak memory during Home mount, streamgraph history, and achievement particles.
- Native calls made by a same-day foreground notification reconciliation.
- Production Hermes bytecode and asset sizes after import changes.

### Suggested performance budgets

These are initial targets to refine after collecting a baseline on the representative device:

- No celebration work during a passive Home mount.
- One changed habit should not rerender unrelated habit cards.
- Completion state should commit within one frame of long-press recognition, excluding intentional gesture-hold time.
- Routine same-day foreground should do no task-history recalculation and no blanket notification cancellation.
- Calendar pagination cost should remain approximately constant per 30-day page.
- Dragging and primary animations should sustain the display refresh rate without repeated slow frames.

## Verification completed during the review

- TypeScript: `npx tsc --noEmit` passed.
- Jest: 16 suites and 293 tests passed with `--runInBand --watchman=false`.
- ESLint: no errors; seven existing hook-dependency/unused-variable warnings remained.
- Android production export: completed successfully.
- Synthetic scaling benchmarks: completed for one-, five-, and ten-year histories; temporary benchmark code was removed afterward.
- Working tree: no application files were changed by the review.

The current automated suite covers pure utility logic but not components, gestures, native scheduling, persistence timing, or animation behavior. Each performance phase should therefore include both unit coverage for any extracted calculation/cache logic and a native on-device regression checklist.

## Risks and guardrails

- **Do not trade durability for animation speed.** Deferred persistence needs a reliable flush strategy and termination testing.
- **Do not introduce ID-keyed caches for mutable history.** Cache only by immutable object/array identity or use explicit invalidation.
- **Do not make achievement detection depend on eventually consistent state.** Preserve exact before/after semantics.
- **Do not optimize only in development mode.** Compare native release builds on the same device and data set.
- **Do not hide long-history cost with an arbitrary cap without explaining it in the UI.** Prefer aggregation that preserves the trend.
- **Do not move everything off the JS thread indiscriminately.** Prioritize operations proven to contend with interaction and animation.
