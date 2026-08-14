# Native Performance Review

Last reviewed: 2026-08-14

## Executive summary

Streakaholic already has a sound performance foundation: React Native's new architecture is enabled, most interaction animation runs through Reanimated, Zustand selectors limit unrelated store-driven renders, task references are updated immutably, expensive charts are lazy-mounted and memoized, and long task lists use `FlatList` with stable keys and item layouts.

The most important remaining problems are concentrated in a few paths rather than spread throughout the app:

1. Fire celebrations can start when a task card mounts, creating unnecessary animation work across the Home screen.
2. Completing a habit synchronously recalculates history, evaluates achievements, and persists the full task store while the completion animation is in progress.
3. Every task card initially mounts both its visible task face and its hidden calendar face.
4. Screens beneath the active native-stack screen can remain subscribed and render work that the user cannot see.
5. Startup and foreground handling repeats broad stats and notification work even when nothing changed.
6. Dashboard calendar work grows with the full loaded history and is not incrementally computed.

Those issues should be addressed before bundle-size cleanup and smaller render refinements. The first three are the most likely to improve animation smoothness and perceived responsiveness on typical Android devices.

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

## Prioritized findings

| Priority | Finding | User impact | Complexity | Main area |
| --- | --- | --- | --- | --- |
| P0 | Fire celebrations start from mounted state rather than an explicit completion event | High | M | Animation |
| P0 | Particle creation schedules one JavaScript timer per particle | High | S–M | Animation |
| P0 | Habit completion performs history-wide calculation and full-store persistence synchronously | High | L | Updates/state |
| P1 | Task cards mount their hidden calendar face immediately | High | M | Rendering |
| P1 | Inactive native-stack screens are not frozen | Medium–High | S | Rendering/navigation |
| P1 | Startup/foreground stats refreshes and notification rescheduling repeat broad work | High | M–L | Startup/native APIs |
| P1 | Dashboard calendar and streamgraph cost grows with all loaded history | High at scale | L | Rendering/calculation |
| P2 | Completion feedback has about 1.25 seconds of intentional gating before state commits | Medium–High perceived | M | Interaction design |
| P2 | Broad icon/chart imports increase the native bundle | Medium | S–M | Bundle/startup |
| P2 | Non-route modules live under Expo Router's `app/` directory | Medium | L | Project structure |
| P2 | Stats screens update React state repeatedly while scrolling | Medium | M | Rendering |
| P3 | Achievement count-up uses JS-thread frame updates | Low–Medium | M | Animation |
| P3 | Continuous achievement animation does not account for reduced motion or app state | Low | S–M | Animation/accessibility |

## Detailed findings and recommendations

### P0: Fire celebrations can run when cards mount

**Area:** `app/hooks/useFireCelebration.ts`, `app/components/TaskCard.tsx`, `app/components/ParticleSystem.tsx`

**Observed behavior**

`useFireCelebration` reacts to the task's current badge icon. When a card mounts already showing the fire badge, the effect can start a celebration even though no new completion or streak transition just occurred. The animation is therefore inferred from persistent visual state rather than triggered by a transient user event.

On a Home screen with ten qualifying habits and the default particle count of 18, a cold mount can create roughly 180 particles. Each particle currently owns multiple animated styles, so the screen can create hundreds of per-frame animation calculations before the user interacts. Navigation that remounts Home can repeat the work.

**Impact:** High. This spends UI and JS resources precisely when Home is mounting and laying out its task grid, increasing the likelihood of dropped frames and sluggish navigation.

**Complexity:** Medium.

**Recommended fix**

Trigger the celebration from an explicit, transient completion result instead of inferring it from `badge.icon === 'fire'`. A completion action can return or publish a celebration event/nonce containing the affected task ID. The matching card consumes that event once.

A smaller defensive change can keep a previous-value ref, skip the initial mount, and only fire when streak progress increases. That would stop the worst behavior, but an explicit event is more robust because it distinguishes a genuine completion from hydration, navigation, undo, or passive stats refresh.

**Acceptance checks**

- Opening or returning to Home never starts fire particles by itself.
- Completing one habit animates only that habit's card.
- Undo, stats refresh, hydration, and unrelated habit updates do not replay the animation.
- Rapid valid completions still produce predictable feedback without lost or duplicated events.

### P0: ParticleSystem creates a JavaScript timer for every particle

**Area:** `app/components/ParticleSystem.tsx`

**Observed behavior**

Particle reveal is staggered by scheduling an individual JavaScript `setTimeout` for each particle and updating React state as each timeout fires. This creates a burst of timers, JS callbacks, state updates, reconciliations, and native handoffs during an animation that should largely stay on the UI thread.

**Impact:** High when combined with the mount-trigger issue; Medium in a correctly scoped single-card celebration. Timer storms can interrupt gesture handling and other JS work even when the visual transforms themselves use Reanimated.

**Complexity:** Small to Medium.

**Recommended fix**

Mount the particle set once and express staggered starts with Reanimated `withDelay`, keeping the reveal scheduling on the UI thread. Retain at most one JS-side completion callback/timer for cleanup or lifecycle notification.

If mounting all particles at once is visually or architecturally inconvenient, batch particle groups rather than updating React state once per particle.

**Acceptance checks**

- A celebration does not schedule a timer per particle.
- The same particle timing and visual density are preserved.
- Interrupting or unmounting a celebration does not leave callbacks that update stale state.
- Completion remains responsive while particles are active on a mid-range Android device.

### P0: Completion updates do too much synchronous work

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

### P1: Every task card mounts its hidden calendar face

**Area:** `app/components/TaskCard.tsx`, calendar components and streak-chain utilities

**Observed behavior**

The initial card-side collection includes both `task` and `calendar`, and both faces render even though only one is visible. The hidden calendar still builds completion maps, derives streak-chain information, creates its day grid, and mounts its component tree for every visible task card.

**Impact:** High on Home mount and task updates. The hidden work multiplies by the number of visible cards and makes unrelated completion updates more expensive.

**Complexity:** Medium.

**Recommended fix**

Mount only the visible face initially. When a flip begins, prepare the destination face early enough that it is ready before it becomes visible, then optionally unmount the old expensive face after the transition.

Shared immutable-reference caches for completion-count maps and streak chains will further reduce work where both faces legitimately need the same derived data.

**Acceptance checks**

- Initial Home render mounts no calendar grids for cards showing their task face.
- The first flip remains visually seamless with no blank frame.
- Flipping repeatedly does not reset user-visible card state unexpectedly.
- Completing one task does not rebuild hidden calendars for unrelated cards.

### P1: Inactive stack screens remain active

**Area:** `app/_layout.tsx`, Expo Router/native-stack configuration

**Observed behavior**

The root Stack does not freeze blurred screens. When task detail, settings, or another stack screen covers Home, the underlying Home screen can remain subscribed to stores and process renders/animations that the user cannot see. A completion initiated from a detail header can therefore update both the visible detail screen and hidden Home cards.

**Impact:** Medium to High during navigation and completion flows.

**Complexity:** Small, with navigation lifecycle verification required.

**Recommended fix**

Enable native-screen freezing for blurred screens using the supported React Navigation/react-native-screens configuration (`freezeOnBlur` and, if needed for this version, global freeze enablement). Verify screens correctly catch up when focused again.

**Acceptance checks**

- Hidden Home cards do not render or animate while a covering stack screen is active.
- Returning to Home immediately shows current store state.
- Modal dismissal, deep links, back navigation, theme changes, and queued achievement UI still work.

### P1: Startup and foreground work is broader than necessary

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

### P1: Dashboard calendar work scales with all loaded history

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

### P2: Completion feedback intentionally delays the state update

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

### P2: Broad imports increase bundle size

**Area:** icon imports throughout `app/`, `app/components/StatsCharts.tsx`

**Observed behavior**

The Android production export completed successfully. The resulting Hermes bytecode was approximately 3.77 MB and bundled assets were approximately 5.2 MB.

Source-map grouping showed several large library contributions:

| Source group | Approximate raw source size |
| --- | ---: |
| Application code | 839 KB |
| Reanimated | 828 KB |
| Lodash | 531 KB |
| date-fns | 521 KB |
| react-native-chart-kit | 287 KB |

MaterialCommunityIcons is imported from the `@expo/vector-icons` package barrel in many files, which can bundle more font families or module setup than necessary. `StatsCharts.tsx` imports chart components from the root `react-native-chart-kit` barrel; that barrel eagerly references other chart modules, including code that pulls in Lodash.

**Impact:** Medium. Bundle size influences installation, parsing, and startup, though the runtime animation findings above are more urgent.

**Complexity:** Small to Medium.

**Recommended fix**

- Use the package's supported direct MaterialCommunityIcons module import and confirm only the required font is packaged.
- Prototype direct chart component subpath imports and verify TypeScript compatibility.
- Generate the same production export and compare Hermes bytecode, assets, and source-map groups before keeping the changes.
- Do not replace libraries solely from source-map size; measure the native release result and maintenance cost.

### P2: Expo Router scans non-route modules under `app/`

**Area:** project structure

**Observed behavior**

Screens, components, hooks, stores, types, and utilities all live under Expo Router's route directory. The web development build reports missing-default-export route warnings for these modules because Router treats everything under `app/` as a potential route. Although web behavior is not a performance target, the warnings expose a structural mismatch in the native route manifest as well.

**Impact:** Medium for route/build hygiene and potential startup scanning; the direct runtime gain needs measurement.

**Complexity:** Large due to widespread import-path changes and regression risk.

**Recommended fix**

Move non-route code to a top-level `src/` tree, leaving only route files and route groups under `app/`. Perform this as an isolated mechanical migration after higher-value runtime fixes, with a full native navigation regression pass.

### P2: Stats screens rerender their parent during scroll

**Area:** per-task and dashboard stats screens, lazy chart mounting

**Observed behavior**

The lazy-mount mechanism stores `scrollY` in React state from a scroll handler using `scrollEventThrottle={100}`. This rerenders the parent stats view about ten times per second while scrolling. Memoized chart children avoid the worst redraws, so the current impact is bounded.

**Impact:** Medium on chart-heavy screens, especially lower-end devices.

**Complexity:** Medium.

**Recommended fix**

Use viewability/intersection-style callbacks, a Reanimated shared value, or a small native-driven visibility mechanism so ordinary scrolling does not update the full screen's React state. Keep lazy mounting one-way: once a chart is mounted, scrolling should not continually toggle it.

### P3: Achievement count-up uses JS-thread frame updates

**Area:** `app/components/AchievementCelebration.tsx`

**Observed behavior**

The achievement number count-up uses JavaScript `requestAnimationFrame` and `setState` for approximately one to three seconds. Heavy subtrees are memoized, so the practical cost is smaller than the particle issues, and this screen is intentionally full-screen and short-lived.

**Impact:** Low to Medium.

**Complexity:** Medium.

**Recommended fix**

Only revisit after native profiling shows JS contention. A Reanimated shared value with an animated text strategy could move progression off React state, but added complexity is not justified without evidence.

### P3: Continuous celebration animation needs lifecycle guards

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

Most transforms and opacity animations already use Reanimated and therefore can run on the UI thread. The main exceptions are orchestration choices—mount-triggered effects, JS timer storms, and count-up state—not wholesale use of the legacy Animated API.

### Lists and charts

The app uses stable list keys, `getItemLayout` where appropriate, memoized chart components, and lazy chart mounting. These are valuable safeguards; optimizations should preserve them.

## Recommended implementation sequence

### Phase 1: Protect the primary interaction

1. Replace state-inferred fire celebrations with explicit completion events.
2. Remove per-particle JavaScript timers.
3. Add native release instrumentation around completion recognition, store commit, animation start, and persistence completion.
4. Reassess whether completion should commit at long-press recognition instead of animation completion.

**Expected outcome:** fewer Home-mount animations, less JS contention, and faster-feeling habit completion.

### Phase 2: Remove invisible render work

1. Lazy-mount task-card faces.
2. Add immutable-reference caches for shared completion maps/streak chains.
3. Freeze blurred native-stack screens.

**Expected outcome:** lower Home mount/update cost and no hidden-screen animation/render work.

### Phase 3: Reduce startup and persistence work

1. Persist and validate the derived-stats refresh date.
2. Diff desired notification schedules rather than blanket cancel/reschedule.
3. Split or otherwise narrow persisted completion data writes.

**Expected outcome:** faster foreground transitions, less native-module churn, and completion cost that grows more slowly with history.

### Phase 4: Make history views scale

1. Incrementally append dashboard calendar calculations.
2. Add indexed/cursor-based streak-chain lookup.
3. Bound or aggregate streamgraph history.
4. Remove React parent rerenders from ordinary stats scrolling if native traces show value.

**Expected outcome:** stable calendar interaction for multi-year histories.

### Phase 5: Startup and bundle hygiene

1. Narrow icon and chart imports and compare production artifacts.
2. Move non-route modules from `app/` to `src/` as a dedicated refactor.
3. Add reduced-motion and background lifecycle handling to continuous celebration loops.

**Expected outcome:** smaller startup/bundle overhead and cleaner route discovery, after interaction bottlenecks are addressed.

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

