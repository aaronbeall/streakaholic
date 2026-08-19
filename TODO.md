# Todo

## MVP

- [x] "Streakoholic" vs "Streakaholic" (kept Streakaholic)
- [x] Implement frequency settings for streaks
- [x] Implement times per day
- [x] Edit task
- [x] Dark mode
- [x] Settings screen
- [x] Export/import data
- [x] Archive tasks
  - [x] Restore archived task
- [x] Initial empty state

## MVP+

- [x] Calendar year map (`TaskCalendarView`'s Year mode — grid-of-months with per-day dots; plus `DashboardCalendarView`'s aggregate infinite calendar grid across tasks)
- [x] Sharing (native system share sheet for a public store-link invitation; locally rendered,
      previewed PNG cards for achievement unlocks/replays, individual habit Stats, and aggregate
      Dashboard Stats; task-scoped cards can omit the habit name for privacy)
- [x] Reminders/notifications (`app/utils/notifications.ts`, escalating levels 0-4 — see CLAUDE.md's "Notifications" section. Not yet confirmed on-device, and needs a dev-client rebuild to test at all.)
  - [x] Nag level: 0=none, 1=dismissable notification, 2=repeated dismissable notifications, 3=ongoing notification, 4=alarm and ongoing notification
  - [x] Set time
  - [ ] Notification dot: a small indicator (e.g. on TaskCard/TaskHeader) showing a task has reminders enabled -- deferred from the original notifications build as a nice-to-have, not essential

## UX / UI Improvements

- [x] Onboarding for core gestures (tap to cycle task/calendar/stats views, hold to complete; plus Dashboard's task-filter hint and task-detail Calendar's tap-a-day hint)
- [x] Confirmation dialog before deleting a task (modal confirm on Delete/Archive in the Edit Task screen; everything else uses a toast + Undo instead of a modal)
- [x] Quick undo for accidental task completions (toast + Undo right on Home after completing; `undoCompleteTask` reverses exactly one press, not the whole day)
- [x] Touch target sizes below platform minimums (Add/Edit Task's +/- steppers and day-of-week buttons bumped 32/36px → 44x44, iOS HIG's minimum)
- [x] Accessibility support (accessibilityLabel/Role/Hint/State added across every screen and component — see CLAUDE.md)
- [x] Haptic feedback (task completion, long-press gesture recognition, calendar day toggle, toast Undo, archive/delete/restore — see CLAUDE.md)
- [ ] Hide unscheduled tasks option (Home filter to only show tasks due today)
- [ ] Pass/skip due units for Standard habits so vacations, sickness, recovery, and other
      intentional breaks do not destroy an otherwise meaningful streak (single-day skip for
      daily/specific-weekday habits shipped 2026-08-18 — see the checked sub-items below; date
      ranges, notes/reasons, and quota-type (X/week, X/month) support are still open)
  - [x] Let a user mark one due day as passed/skipped, with undo support, kept visibly distinct
        from a completion (`TaskCalendarScreen`'s calendar long-press day-details popover +
        `TaskHeader`'s status-popover toggle, backed by `taskStore.skipDate`/`unskipDate` and
        `Task.skippedDates`; a date-range version and an optional note/reason are still open)
  - [x] Preserve streak continuity without adding a completion, increasing completion-based streak
        length, advancing achievements, or unfairly lowering the completion rate (`isDueOnDate`
        treats a skipped date as never-due, so it behaves exactly like an ordinary unscheduled day
        everywhere that reads due-ness: streaks, achievements, completion rate)
  - [ ] Define fair behavior for daily, specific-weekday, X/week, X/month, and multi-repetition
        habits, including reminders, calendar/streak history, Stats, sharing, and import/export
        (daily/specific-weekday done; X/week, X/month, and multi-repetition deliberately deferred —
        every-N-day scheduling will need this too once that frequency type exists)
  - [ ] In Commitment Mode, do not offer free passes/skips: the only continuity-preserving exception
        is a paid Streak Save after a failed unit closes. It remains visible, records the save count,
        and disqualifies the current chain plus later achievements whose qualifying window includes
        it from “Unbroken” treatment without rewriting awards earned before the save — see
        [COMMITMENT_MODE.md](COMMITMENT_MODE.md)
  - [ ] "Perfect streak" concept: a streak chain that never had a skip in its span, distinct from an
        ordinary streak that used one or more skips to survive. Raised 2026-08-18, deliberately
        deferred (not scoped yet) -- three directions considered, from smallest to largest: (1) just
        a "longest streak without a skip" stat on Stats/Dashboard, no new UI chrome; (2) a `hasSkip`
        flag on `StreakChain`/`TaskStreakChain` (`reports.ts`) surfaced as a small "flawless"
        tag/badge on the Streaks screen list and/or the calendar's streak-count badge; (3) a full new
        "Flawless Streak" achievement tier family (mirrors the existing streak-length tiers, but only
        fires for a chain of that length with zero skips) -- needs both live detection (does the
        currently-open chain contain a skip) and retroactive-scan support. Revisit and pick a
        direction before building anything.
- [ ] Pause Standard habits for a prospective date range (no due units are created and the range is
      excluded from completion percentages); active Commitment Mode habits cannot use a free pause
      without permanently ending Commitment Mode — see [COMMITMENT_MODE.md](COMMITMENT_MODE.md)
- [ ] Scheduling enhancements
  - [ ] Version schedule/target changes so edits do not silently rewrite a habit's past
    - [ ] On save, present **Apply going forward** as the default (effective at the next appropriate
          day/week/month boundary) and preserve the schedule version that governed each past unit
    - [ ] For Standard habits, offer an explicit **Recalculate all history** alternative with a
          warning and, ideally, a before/after preview of affected streaks and statistics;
          Commitment Mode only permits forward-effective changes
    - [ ] Earned achievements are permanent: schedule edits or historical recalculation may reveal
          additional eligible achievements, but must never revoke or remove an award already earned
  - [ ] Make N/week and N/month habits quota-aware: once the target is met, stop reminders and mark
        the period safe while still allowing optional bonus completions
  - [ ] Support configurable week start and habit-day rollover, with boundaries shown clearly in UI
  - [ ] Add interval/lifecycle schedules: every N days or weeks, future start/end dates, limited
        challenges, and optionally exact monthly dates
  - [ ] Add optional time slots and per-slot reminders for multi-repetition habits (e.g. morning and
        evening rather than two interchangeable daily taps)
  - [ ] Separate when a habit appears from what satisfies it, enabling preferred days plus a flexible
        weekly/monthly target and makeup days without losing the streak
  - [ ] Explore spacing preferences, progressive/ramping schedules, and minimum-plus-stretch goals
        as encouraging bonuses rather than extra ways to fail
- [x] Remember dashboard selection (last-viewed Stats/Calendar/Streaks tab persists via `dashboardLastTab`/`taskDetailLastTab`; task-filter checkboxes still reset each time, that's separate)
- [x] Re-order habits on Home (the Home header's sort control supports whole-row drag-and-drop plus Created, Most Used, Color, and Time of Day ordering; the last applied preset highlights until the order is manually changed; `taskStore.reorderTasks` persists the shared active-task order so Home, Dashboard filters/calendar, Trophy filters, and task-detail prev/next navigation all follow it)
- [x] Auto-suggest an icon based on the habit name typed into Add/Edit Task (`app/utils/iconSuggestions.ts` — see CLAUDE.md)
- [x] Add/Edit Task: switching Frequency to "Specific Days" should default to all 7 days selected instead of carrying over whatever `daysOfWeek` the previous frequency left behind (empty for a task that was never Specific Days)
- [x] Use consistent terminology across user-facing copy -- standardized on "Habit" everywhere a user reads it (per explicit user direction: "Calling it 'habit' is purely a user facing term" -- the data model/code stays `Task` throughout, unchanged)
- [x] Consistent empty state design/copy across Stats/Calendar/Streaks views (shared `EmptyState` component — see CLAUDE.md)
- [ ] Treatment for "all-task best" in task contexts -- clarify how a single task's own personal-best acknowledgment (e.g. `TaskHeader`'s status popover "Best" row, `TaskDetailScreen` Stats) should relate to the app-wide "best across all tasks" stat (Dashboard's aggregate Best Streak) -- should a per-task best also flag when it happens to be the *overall* best across every task? Scope not yet defined, revisit before building anything
- [x] Double-wide task card is not okay (`TaskCard`'s `container` had `flex: 1`, whose implied `flexBasis: 0%` overrode the explicit `width` in `HomeScreen`'s row, stretching a lone last-row card to fill the row; fixed by dropping `flex: 1` and centering a partial last row via `justifyContent: 'center'`)
- [x] Archive/Delete task should take you back to homepage (`AddTaskScreen`'s Archive/Delete confirm now calls `router.dismissTo('/')` instead of `router.back()` — fixes a real crash: reached via task-detail's pencil icon, `back()` only popped to task-detail, which still held the just-deleted `taskId` and threw "Missing task" on render)
- [x] Congratulation achievements (multi-kind system with a full-screen celebration/alert and Trophy Case — see CLAUDE.md's "Achievements" section for the current kind count/catalog)
  - [x] New best streak congratulations
  - [x] Perfect day congratulations
  - [x] First streak congratulations
  - [x] Milestone completions (10, 50, 100, 1000)
  - [x] Trophy Case: filter by task (per-task icon chip row, scopes the grid to that task's own kinds — see CLAUDE.md)
  - [x] Integrate achievements on Stats screens (shared `AchievementsPreviewCard` on both per-task and Dashboard Stats — see CLAUDE.md)
  - [x] Achievement spam via undo/redo (see CLAUDE.md, 2026-08-13 -- date-qualified dedup scope for repeatable, task-scoped kinds)
  - [ ] Subtle pulsing glow effect on tile/showcase emblems (Trophy Case's `TrophyEmblem` and the Stats-screen `AchievementsPreviewCard` are currently fully static -- something lighter-weight than `TrophyBadge`'s own full halo/pulse animation machinery, since several of these render simultaneously in a grid)
  - [x] Combine multiple unlocks into one unified congratulations screen with prev/next steppers (full-screen unlocks are snapshotted into one stable batch; close dismisses that exact batch and newly arriving unlocks remain queued)
  - [x] The full congratulations screen doesn't wait behind queued achievement alerts (live unlocks are assigned to separate transient full-screen/quick-alert queues at earn time; full-screen work preempts alerts, which remain queued and resume afterward)
- [x] Bottom margin and androind buttons (edge-to-edge insets — every bottom-anchored element (FAB, `ToastBanner`, scroll content, the fixed-height calendar grid) adds `insets.bottom`)
- [x] Performance optimizations — Context re-render fan-out, the Zustand migration, and
      redundant task-stat re-recalculations, all audited and fixed; see CLAUDE.md's "State
      management" section for the current architecture. A dedicated native-performance
      pass (particle timers, completion-path synchronous work, frozen background screens,
      startup/foreground cost, calendar scaling) is tracked separately in
      [PERFORMANCE_REVIEW.md](PERFORMANCE_REVIEW.md), still partly open
  - [x] WeakMap caching (considered during the Zustand migration for `getCompletionCount`/`isTaskCompleted` — went the other way instead: dropped the existing `completionCache` Map entirely in favor of a plain `task.completions.find()`, since the cache was also a real staleness bug (one render behind `tasks`), not just a perf question, and the O(n) lookup is trivial at this app's scale)
- [x] Layout/navigation improvement with proper screen transitions (`RootStack`'s `slide_from_right` animation)
- [x] Already completed task on home screen should not have press-and-hold triggering completion animation (`TaskCard`'s `handleLongPress` now checks `isTaskCompleted` before deciding whether to run the completion pop at all — an already-completed task skips it entirely and opens `task-detail` directly via a new `onLongPressCompletedTask` prop, on whichever tab was last viewed)
- [x] Split up task card icon ring based on per-day count (`TaskCard`'s outer ring, while incomplete: one continuous circle for 1x/day tasks, `timesPerDayCount` equal arc segments with a small gap between each for >1x/day tasks — see `ringSegments`/`RING_SEGMENT_GAP_DEGREES`; unchanged once completed, which still fills solid)
- [ ] Swipe next/prev on task detail header (task) and calendar (month/year) — task cycling itself landed (`TaskHeader`'s prev/next chevron buttons, wraps around the active task list via `router.setParams`), but as tap targets, not a swipe gesture; calendar month/year navigation is still tap-only too
- [x] Min streak history width to fit icon + 2 digits
- [x] Streamgraph
- [ ] Landscape mode
- [ ] Sounds
  - [ ] Completion and streak
  - [ ] Congratulations
- [x] Add a day status summary/explainer on task details screen (tapping `TaskHeader`'s frequency/streak badges row opens a dismissable popover with a plain-English recap -- schedule, today's own status, and how it compares to the task's best streak -- built via `app/utils/taskStatusSummary.ts`'s branching `buildTaskStatusSummary`; see CLAUDE.md)
- [ ] Friendly analytics layer (preserve the existing depth while making it easier to interpret)
  - [ ] Add secondary **On target** streaks without replacing the normalized completion-day streak
    - [ ] Keep the headline flame/streak and existing streak-length achievements based on qualifying
          completion days across every schedule type
    - [ ] Show current/best consecutive on-target weeks and months, plus live period progress such as
          “2 of 3 this week”; evaluate daily/specific-day habits against their due days and quota
          habits against their period target, with cross-cadence and partial-period semantics defined
          explicitly
    - [ ] Add a distinct **On Target** achievement family (for example, “4 Weeks On Target” and
          “3 Months On Target”), separate from universal completion-day streak and perfect-period
          awards; these only add to achievement history and never revoke an existing award
  - [ ] Add one deterministic, local-only, schedule-aware insight near the top of Dashboard Stats
        and per-habit Stats (e.g. habits on track, progress toward a weekly/monthly quota, a current
        personal best, or a fair comparison with the prior equivalent period)
  - [x] Audit analytical labels for plain-language clarity (`Completion rate`, `Days tracked`,
        `Weekly average`, `Progress over time`, and friendlier pattern-chart titles)
  - [x] Explain the icon-only Dashboard Calendar modes with a lightweight first-use hint using the
        same icons as the control
  - [ ] Explain the Stats running-total/each-period control with lightweight first-use help or an
        on-demand info sheet rather than removing the advanced view
  - [ ] Let users tap Stats chart points/bars to inspect the exact date, value, and relevant habits,
        matching the existing day inspection in Dashboard Calendar's Bars/Streamgraph modes
  - [ ] Add encouraging young-data states that explain when a useful pattern will emerge instead of
        presenting sparse/flat charts without context

## MMP

- [ ] Finalize Streakaholic branding and launch identity
  - [x] Audit the existing logo/app-icon variants and choose one canonical mark and wordmark
        (done 2026-08-19 — "logo4" — see BRAND.md's "Visual identity status" for the full
        derivation record and asset inventory)
  - [x] Validate the chosen mark at launcher, adaptive-mask, notification icon, splash,
        favicon, share-card, and feature-graphic sizes — see BRAND.md, same section
  - [x] Use the canonical tagline “Build streaks worth celebrating,” distinct from the category
        descriptor “A playful, private habit & streak tracker”
  - [x] Define [BRAND.md](BRAND.md) as the source of truth for name/capitalization, messaging,
        privacy claims, product terminology, and encouraging/no-guilt voice; add shared in-app
        brand-copy constants in `app/constants/brand.ts`
  - [x] Apply the verbal identity to the in-app About screen, share cards/share text, README,
        marketing plan, competitive positioning, and Play Store listing copy
  - [ ] Apply the chosen visual identity to the Play Store title/icon/feature graphic, screenshots,
        demo videos, press kit, and `streakaholic.app` — icon/feature graphic done, see
        [STORE_LISTING.md](STORE_LISTING.md) for current status and the remaining open questions
        (title format, screenshots still uncaptured)
- [ ] Monetization — see [MONETIZATION.md](MONETIZATION.md) for the actual plan (one-time
      Pro unlock + tip jar + Commitment Mode Streak Saves, no ads/subscription) and sequencing
  - [x] Tip jar (`expo-iap`, three tiers — see PUBLISHING.md's "Tip jar" section for the
        implementation and its still-needed Play Console/Internal-testing pass)
  - [ ] Pro unlock (unlimited tasks, widgets, extra customization — build once task cap + widgets exist)
  - [ ] Commitment Mode + paid Streak Saves (locked history, visible/non-completing saves,
        and mode-specific achievement credibility — see [COMMITMENT_MODE.md](COMMITMENT_MODE.md))
  - [ ] ~~AdMob~~ — decided against, see MONETIZATION.md
- [x] Rate this app (Settings' manual action opens the store review listing directly; a separate
      native in-app request becomes eligible after 10 genuine current-day completions across 5
      active days, waits for achievement/navigation UI to settle, runs once per app version, and
      observes a 90-day cross-version cooldown)
- [ ] Widgets
- [ ] Sync (Drive or Dropbox)
- [x] About (privacy, ToS, credits, etc) (`AboutScreen` — real, accurate Privacy Policy/ToS
      text matching the app's actual local-only architecture, not placeholder copy; still
      worth a lawyer's read before an actual store submission, not a rewrite)
- [ ] Marketting website (streakaholic.app)

## Future

- [ ] Timeline view
- [ ] Heatmap view
- [x] Achievements (see the MVP+ entry above — 23-kind system, Trophy Case, celebration screen; deliberately no points/ranks/upgrades layered on top yet, kept purely cosmetic per explicit design decision — a future point system could hang off the same recorded data, see below)
- [ ] Custom goals and achievements (user-defined milestones layered on top of a habit's schedule,
      not a replacement for its normal due/quota rules)
  - [ ] Support useful goal types such as a target streak, lifetime completion count, completions
        within a date range, and an optional recurring weekly/monthly target
  - [ ] Let the user customize the goal's name, target, icon, color, linked habit(s), and optional
        deadline while offering simple templates for common goals
  - [ ] Show live progress on habit Stats/Dashboard and distinguish custom goals from built-in
        Streakaholic achievements in the Trophy Case
  - [ ] Reuse the existing full-screen celebration, achievement history, and share-card systems when
        a custom goal is reached
  - [ ] Preserve achievement credibility: label custom awards clearly and record whether they were
        earned in normal or Commitment Mode rather than presenting them as built-in accomplishments
- [ ] Negative/reduction habits (e.g. “Stop Snacking”) for behaviors the user wants to avoid or
      keep below a limit rather than complete more often
  - [ ] Add a habit direction/type such as Build vs Reduce/Avoid, with a configurable per-day
        allowance: zero occurrences for strict avoidance, or at most N occurrences for reduction
  - [ ] Treat logged taps as occurrences rather than successes and show a friendly live state such
        as “0 of 2 used,” “At your limit,” or “Over by 1,” with the same undo/history-edit support
        as normal completions
  - [ ] Keep the current day provisionally “on track” while its count is within the allowance, but
        only settle it as a successful streak day after the scheduled day ends; exceeding the limit
        settles it as a miss
  - [ ] Define schedule semantics deliberately: initially consider daily/specific-weekday habits
        with a per-day allowance, since X/week and X/month currently express positive completion
        quotas and could be confusing if silently inverted
  - [ ] Carry the inverse success rule consistently through streak history, calendars, Stats and
        streamgraph analytics, reminders, achievements, sharing, import/export, and Commitment Mode
- [ ] Points/ranks/upgrades
- [ ] Daily summary notification (evening recap push -- completions, streaks at risk; distinct from per-task reminders, and from Home, which only covers the passive/at-a-glance case)
- [ ] Personal leaderboard
- [ ] Social features
  - [ ] Friends, friend streaks, friend comparisons
  - [ ] Competitions
  - [ ] Leaderboards
- [ ] Task groups (swipe left/right on home, etc)
- [ ] Home screen customization (default=icons, calendar, timeline, list)
- [ ] Duration based tasks
