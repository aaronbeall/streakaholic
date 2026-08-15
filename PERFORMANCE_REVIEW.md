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
  - [ ] Instrument completion recognition, store commit, calculations, serialization, and notification work.
  - [ ] Cache completion maps/stats by immutable task or completions-array identity.
  - [ ] Avoid recalculating unchanged tasks during one task's completion.
  - [ ] Narrow persistence so one completion does not serialize every task's full history.
  - [ ] Define safe persistence flush behavior for backgrounding and termination.
  - [ ] Move/diff notification reconciliation outside the immediate visual commit.
  - [ ] Verify streak, achievement, undo, and durability behavior against the current implementation.

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
  - [ ] Skip reminder-disabled tasks in the normal notification pass.
  - [ ] Diff desired and scheduled notifications instead of blanket cancel/reschedule.
  - [ ] Invalidate only affected task schedules after normal mutations.
  - [ ] Test imports, date/timezone changes, daylight saving, permissions, and device reboot behavior.
- [ ] **PERF-007 — Make Dashboard calendar work incremental and bounded**
  - [ ] Calculate only newly appended calendar pages.
  - [ ] Add indexed, binary-search, or cursor-based streak-chain lookup.
  - [ ] Memoize day columns so pagination does not rerender unchanged dates.
  - [ ] Bound or aggregate older streamgraph history.
  - [ ] Validate Grid/Bars interaction with a ten-year native stress data set.

### P2 — Perceived latency, bundle, and render hygiene

- [ ] **PERF-008 — Reassess completion commit timing**
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
- [ ] **PERF-011 — Stop parent stats rerenders during ordinary scrolling**
  - [ ] Profile render counts on both stats screens.
  - [ ] Replace `scrollY` React state with viewability callbacks or a UI-thread/shared-value mechanism.
  - [ ] Keep lazy mounting one-way after a chart becomes visible.
  - [ ] Confirm scrolling and chart interaction on a lower-end Android device.

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
- [ ] **PERF-012 — Move achievement count-up off JS state if profiling justifies it**
  - [ ] Measure JS contention during single and queued achievement celebrations.
  - [ ] Keep the current implementation if it stays within the native frame budget.
  - [ ] Otherwise, prototype a Reanimated/shared-value count-up without rerendering the screen tree.
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
| PERF-007 | P1 | Dashboard calendar and streamgraph cost grows with all loaded history | High at scale | L | Rendering/calculation |
| PERF-008 | P2 | Completion feedback has about 1.25 seconds of intentional gating before state commits | Medium–High perceived | M | Interaction design |
| PERF-009 | P2 | Broad icon/chart imports increase the native bundle | Medium | S–M | Bundle/startup |
| PERF-010 | P2 | Non-route modules live under Expo Router's `app/` directory | Medium | L | Project structure |
| PERF-011 | P2 | Stats screens update React state repeatedly while scrolling | Medium | M | Rendering |
| PERF-001 | P3 | Add a shared particle budget for dense simultaneous mount celebrations | Medium in dense bursts | M | Animation |
| PERF-004 | P3 | Reduce hidden-calendar pre-render cost without regressing first-flip responsiveness | Medium if Home mount becomes costly | M–L | Rendering |
| PERF-012 | P3 | Achievement count-up uses JS-thread frame updates | Low–Medium | M | Animation |
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

**Area:** `app/stores/taskStore.ts`, stats/streak utilities, achievement detection, Zustand persistence

**Observed behavior**

The completion path currently performs several pieces of work together:

1. Create a new completions array.
2. Recalculate the changed task's history-derived stats.
3. Build completion counts across active tasks for achievement detection.
4. Detect and record newly earned achievements.
5. Persist the Zustand task store, which serializes the entire task collection and completion history.
6. Begin notification rescheduling.

Each piece is reasonable in isolation, but the combined synchronous path competes with the completion interaction and its animation. The cost grows with completion history and task count.

**Impact:** High. Habit completion is the core, frequent interaction; even moderate pauses here are disproportionately visible.

**Complexity:** Large because correctness matters across streaks, achievements, persistence, undo, and process termination.

**Recommended fix**

Split the path into work needed for immediate visual truth and work that can safely follow:

- Commit the changed task and immediate derived state first.
- Cache history-derived maps and stats by immutable task/completions-array identity so unchanged tasks reuse results.
- Keep achievement correctness synchronous if it depends on an exact before/after snapshot, but avoid rebuilding maps for unchanged tasks.
- Redesign persistence so a single completion does not stringify every task's full history. Options include separate metadata/history keys, per-task records, or a compact append-oriented completion log.
- Defer or coalesce persistence only after establishing explicit flush rules for app backgrounding and shutdown. Blind debouncing would risk data loss and is not recommended.
- Diff notification state and perform native scheduling outside the immediate visual commit.

A `WeakMap` keyed by the exact immutable completions array or task object is appropriate here. This avoids the stale-cache failure mode of a cache keyed only by task ID: changed arrays receive new cache entries, while unchanged references safely reuse prior work.

**Acceptance checks**

- Completion state appears immediately and remains durable after abrupt background/termination tests.
- Streak and achievement results match the current implementation for completion, repeated completion, and undo.
- Updating one habit does not recalculate completion maps for every unchanged habit.
- JS frame stalls around completion decrease in a native release build.
- Large-history persistence cost is measured before and after the storage change.

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

**Observed behavior**

After hydration and on foreground transitions, the app refreshes task stats and reschedules notifications broadly.

The stats refresh marker is not persisted, so a cold launch can recalculate and rewrite all task stats even when they were already calculated for the same local day.

Notification scheduling cancels and dismisses multiple known identifiers for each active task before it checks whether notifications are disabled. With twenty active habits, the current cleanup-first pattern can produce up to roughly 160 native cancel/dismiss calls per broad pass, even when many habits have no enabled reminder.

**Impact:** High for startup/foreground responsiveness, battery use, and native bridge/module traffic.

**Complexity:** Medium to Large.

**Recommended fix**

- Persist a local-date marker indicating the day for which derived task stats were last refreshed. Recompute on hydration only when that date is stale or data migration/import invalidates it.
- Keep the foreground check cheap: compare the marker before walking task histories.
- Skip reminder-disabled tasks during the normal scheduling pass.
- Track or query scheduled identifiers once, compute the desired schedule, and apply a diff rather than canceling every possible identifier first.
- Invalidate only affected task schedules after edits or completions; reserve a full reconciliation for hydration, imports, permission changes, and recovery.

**Acceptance checks**

- Opening the app twice on the same day does not rewrite unchanged task stats.
- Crossing a day boundary correctly refreshes streak status.
- Disabled reminders cause no per-task native cancellation churn in a normal foreground pass.
- Imports and reminder-setting changes still reconcile stale OS notifications.
- Device reboot, permission changes, timezone/date changes, and daylight-saving transitions are covered by manual native tests.

### PERF-007 (P1): Dashboard calendar work scales with all loaded history

**Area:** `app/screens/DashboardCalendarView.tsx`, `app/utils/reports.ts`

**Observed behavior**

Loading another 30-day page rebuilds day-connection information over the entire loaded range rather than computing only the appended dates. Day connection lookup repeatedly scans streak-chain data. Grid mode virtualizes date columns, but streamgraph mode renders the loaded axis and a growing SVG/path as one unbounded visualization.

Synthetic JavaScript benchmarks from the review showed approximately linear growth:

| History | Task stats | Streak chains | Calendar connection map |
| --- | ---: | ---: | ---: |
| 1 year daily | 1 ms | 2 ms | 8 ms |
| 5 years daily | 5 ms | 9 ms | 39 ms |
| 10 years daily | 11 ms | 18 ms | 78 ms |

These figures came from the project's Jest/V8 environment and are useful for relative scaling only. Android Hermes and device rendering can be slower, so they are not native performance claims.

**Impact:** High for long-lived users and multi-task histories; lower for new users.

**Complexity:** Large.

**Recommended fix**

- Calculate only the newly appended 30-day page and merge it with prior memoized results.
- Replace repeated chain scans with a date-indexed interval lookup, binary search, or a cursor that advances through sorted chains.
- Memoize individual day columns so appending history does not rerender already-loaded columns.
- Bound the streamgraph's daily resolution. For example, keep recent daily samples and aggregate older history weekly or monthly, or cap the interactive daily window to a documented range.
- Avoid constructing one ever-growing SVG path when segmented/aggregated paths can preserve the useful visual result.

**Acceptance checks**

- Appending a page performs work proportional to the new page, not the total loaded range.
- Existing visible date columns do not rerender during pagination without a data change.
- Grid and streamgraph remain interactive with a 10-year synthetic history on a representative Android device.
- Aggregation does not materially misrepresent completion trends.

### PERF-008 (P2): Completion feedback intentionally delays the state update

**Area:** `app/components/TaskCard.tsx`, `app/components/TaskProgressIcon.tsx`

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

### PERF-011 (P2): Stats screens rerender their parent during scroll

**Area:** per-task and dashboard stats screens, lazy chart mounting

**Observed behavior**

The lazy-mount mechanism stores `scrollY` in React state from a scroll handler using `scrollEventThrottle={100}`. This rerenders the parent stats view about ten times per second while scrolling. Memoized chart children avoid the worst redraws, so the current impact is bounded.

**Impact:** Medium on chart-heavy screens, especially lower-end devices.

**Complexity:** Medium.

**Recommended fix**

Use viewability/intersection-style callbacks, a Reanimated shared value, or a small native-driven visibility mechanism so ordinary scrolling does not update the full screen's React state. Keep lazy mounting one-way: once a chart is mounted, scrolling should not continually toggle it.

### PERF-012 (P3): Achievement count-up uses JS-thread frame updates

**Area:** `app/components/AchievementCelebration.tsx`

**Observed behavior**

The achievement number count-up uses JavaScript `requestAnimationFrame` and `setState` for approximately one to three seconds. Heavy subtrees are memoized, so the practical cost is smaller than the particle issues, and this screen is intentionally full-screen and short-lived.

**Impact:** Low to Medium.

**Complexity:** Medium.

**Recommended fix**

Only revisit after native profiling shows JS contention. A Reanimated shared value with an animated text strategy could move progression off React state, but added complexity is not justified without evidence.

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

- PERF-007: Incrementally append dashboard calendar calculations.
- PERF-007: Add indexed/cursor-based streak-chain lookup.
- PERF-007: Bound or aggregate streamgraph history.
- PERF-011: Remove React parent rerenders from ordinary stats scrolling if native traces show value.

**Expected outcome:** stable calendar interaction for multi-year histories.

### Phase 5: Startup and bundle hygiene

- PERF-009: Narrow icon and chart imports and compare production artifacts.
- PERF-010: Move non-route modules from `app/` to `src/` as a dedicated refactor.

**Expected outcome:** smaller startup/bundle overhead and cleaner route discovery, after interaction bottlenecks are addressed.

### Deferred follow-up: Animation and rendering safeguards

- PERF-001: Add a global concurrent-particle budget only if native traces show dense Home-mount bursts need it.
- PERF-004: Explore staged prewarming, cached calendar models, viewport priority, or flattened rendering only if native Home measurements justify changing the current eager calendar.
- PERF-012: Move achievement count-up off JS state only if profiling justifies it.
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
- Jest: 14 suites and 274 tests passed with `--runInBand --watchman=false`.
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
