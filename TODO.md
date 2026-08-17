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
- [x] Reminders/notifications (`app/utils/notifications.ts` -- per-task `notifications: { level, time }`, escalating 0-4 exactly per the nag levels below, always scheduling only the single next due-and-incomplete occurrence and rescheduling on every relevant task mutation + app foreground/hydrate, rather than relying on OS-level recurring triggers. New tasks default to Level 1; existing tasks are never silently upgraded. Level 4 deliberately stops short of a true full-screen alarm — see CLAUDE.md for why. Not yet confirmed on-device, and needs a dev-client rebuild to test at all.)
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
      intentional breaks do not destroy an otherwise meaningful streak
  - [ ] Let a user mark one due day/period or a date range as passed/skipped, with undo/edit support
        and an optional note/reason; keep the exception visibly distinct from a completion
  - [ ] Preserve streak continuity without adding a completion, increasing completion-based streak
        length, advancing achievements, or unfairly lowering the completion rate
  - [ ] Define fair behavior for daily, specific-weekday, X/week, X/month, and multi-repetition
        habits, including reminders, calendar/streak history, Stats, sharing, and import/export
  - [ ] In Commitment Mode, do not offer free passes/skips: the only continuity-preserving exception
        is a paid Streak Save after a failed unit closes. It remains visible, records the save count,
        and disqualifies the current chain plus later achievements whose qualifying window includes
        it from “Unbroken” treatment without rewriting awards earned before the save — see
        [COMMITMENT_MODE.md](COMMITMENT_MODE.md)
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
- [x] Remember dashboard selection (`dashboardLastTab`/`taskDetailLastTab` in `SettingsContext` — last-viewed Stats/Calendar/Streaks tab persists across visits; the task-filter checkboxes themselves still reset to "all tasks" each time, that's a separate thing)
- [x] Re-order habits on Home (the Home header's sort control supports whole-row drag-and-drop plus Created, Most Used, Color, and Time of Day ordering; the last applied preset highlights until the order is manually changed; `taskStore.reorderTasks` persists the shared active-task order so Home, Dashboard filters/calendar, Trophy filters, and task-detail prev/next navigation all follow it)
- [x] Auto-suggest an icon based on the habit name typed into Add/Edit Task (`app/utils/iconSuggestions.ts`'s `suggestIconForName` -- a word-stem keyword table, e.g. "Run"/"Running" both suggest the running-shoe icon; new tasks only, never overrides an existing task's icon, and stops suggesting the moment the user picks an icon themselves via the picker -- see CLAUDE.md)
- [x] Add/Edit Task: switching Frequency to "Specific Days" should default to all 7 days selected instead of carrying over whatever `daysOfWeek` the previous frequency left behind (empty for a task that was never Specific Days)
- [x] Use consistent terminology across user-facing copy -- standardized on "Habit" everywhere a user reads it (per explicit user direction: "Calling it 'habit' is purely a user facing term" -- the data model/code stays `Task` throughout, unchanged)
- [x] Consistent empty state design/copy across Stats/Calendar/Streaks views (Dashboard and per-task task-detail) -- a shared `EmptyState` component (icon + title + optional subtitle, centered) extracted from `DashboardStreaksView`'s own already-good "no habits selected"/"no streaks yet" treatment, now also used by `DashboardStatsView` (previously no empty state at all -- a filtered-to-nothing view fell through to a wall of zeroed stats) and `DashboardCalendarView` (previously a plain unstyled fallback line). Per-task task-detail screens (`TaskCalendarScreen`/`TaskStatsScreen`) always operate on exactly one already-guaranteed-to-exist task, so there's no "all filtered out" state to cover there -- their Streaks tab already reuses `DashboardStreaksView` itself (`tasks={[task]}`), so it's covered for free; see CLAUDE.md
- [ ] Treatment for "all-task best" in task contexts -- clarify how a single task's own personal-best acknowledgment (e.g. `TaskHeader`'s status popover "Best" row, `TaskDetailScreen` Stats) should relate to the app-wide "best across all tasks" stat (Dashboard's aggregate Best Streak) -- should a per-task best also flag when it happens to be the *overall* best across every task? Scope not yet defined, revisit before building anything
- [x] Double-wide task card is not okay (`TaskCard`'s `container` had `flex: 1`, whose implied `flexBasis: 0%` overrode the explicit `width` in `HomeScreen`'s row, stretching a lone last-row card to fill the row; fixed by dropping `flex: 1` and centering a partial last row via `justifyContent: 'center'`)
- [x] Archive/Delete task should take you back to homepage (`AddTaskScreen`'s Archive/Delete confirm now calls `router.dismissTo('/')` instead of `router.back()` — fixes a real crash: reached via task-detail's pencil icon, `back()` only popped to task-detail, which still held the just-deleted `taskId` and threw "Missing task" on render)
- [x] Congratulation achievements (`app/utils/achievements.ts`'s `detectCompletionAchievements` — 23 kinds: first-completion, new-best-streak, anniversary, streak-length tiers 2/5/10/25/50/100/1000, completion-count milestones 10/50/100/1000, three cross-task Century Club tiers (100/500/1000), perfect-day, perfect-week, comeback, habit-collector, early-bird, night-owl. Event-triggered off `taskStore.completeTask`, recorded to a persisted `achievementsStore`, celebrated via a full-screen `AchievementCelebration` (or, for a kind you've snoozed via its own bell toggle, a lighter top-anchored `AchievementAlert` notice instead), browsable in a Trophy Case screen (`/trophies`) with per-kind unlocked/in-progress/locked status, toggleable in Settings — see CLAUDE.md)
  - [x] New best streak congratulations
  - [x] Perfect day congratulations
  - [x] First streak congratulations
  - [x] Milestone completions (10, 50, 100, 1000)
  - [x] Trophy Case: filter by task (a radio-style "All" + per-task icon chip row, shown once there's more than one active task; selecting one scopes the grid to that task's own earned/in-progress kinds, dropping global-scoped kinds like Century Club/Perfect Day entirely since they aren't attributable to a single task -- see CLAUDE.md)
  - [x] Integrate achievements on Stats screens (a shared `AchievementsPreviewCard` -- unlocked badges + closest-next progress + a "View Trophy Case" link -- on both `TaskStatsScreen` (this task's own earned/in-progress achievements, deep-linking into the Trophy Case pre-filtered to it) and `DashboardStatsView` (the full app-wide trophy status, unfiltered by Dashboard's own task-selection bubbles); see CLAUDE.md)
  - [x] Achievement spam via undo/redo (see CLAUDE.md, 2026-08-13 -- date-qualified dedup scope for repeatable, task-scoped kinds)
  - [ ] Subtle pulsing glow effect on tile/showcase emblems (Trophy Case's `TrophyEmblem` and the Stats-screen `AchievementsPreviewCard` are currently fully static -- something lighter-weight than `TrophyBadge`'s own full halo/pulse animation machinery, since several of these render simultaneously in a grid)
  - [x] Combine multiple unlocks into one unified congratulations screen with prev/next steppers (full-screen unlocks are snapshotted into one stable batch; close dismisses that exact batch and newly arriving unlocks remain queued)
  - [x] The full congratulations screen doesn't wait behind queued achievement alerts (live unlocks are assigned to separate transient full-screen/quick-alert queues at earn time; full-screen work preempts alerts, which remain queued and resume afterward)
- [x] Bottom margin and androind buttons (edge-to-edge insets — every bottom-anchored element (FAB, `ToastBanner`, scroll content, the fixed-height calendar grid) adds `insets.bottom`)
- [x] Performance optimizations
  - [x] Performance pass (audited Context re-render fan-out, memoization/referential-stability gaps, and common RN FlatList traps — see CLAUDE.md's "State management" section)
  - [x] Migrate to Zustand? (`TaskContext`/`SettingsContext` → `app/stores/*` — selector-based selective subscription, fixes `TaskCard` re-rendering on unrelated task changes and every screen re-rendering on any settings change)
  - [x] Reduce unnecessary task stat re-recalculations (see CLAUDE.md's "State management" section for the full audit — the two real finds: `getCompletionCount`+`isTaskCompleted` were called back-to-back on the same (task, date) in 6 places, the second call redundantly repeating the first's lookup; and the calendar grids called those per-cell against the same task's `completions` array via O(n) `.find()`, up to `cells × completions` scans per render. Fixed via a new `buildCompletionCountsByDate` map, memoized per task, giving O(1) lookups. Also found and fixed a genuinely missing `useMemo` in `TaskStatsScreen.tsx` (its sibling `DashboardStatsView.tsx` had the equivalent call memoized, this one didn't). One duplication considered and _not_ pursued: `streaks.ts`'s aggregate stats and `reports.ts`'s streak-chain history independently re-walk very similar day/period segmentation to derive overlapping numbers — left alone since unifying two independently-tested nontrivial algorithms for a computational-efficiency gain that's already mitigated by caching (`task.stats` precomputed at mutation time, chain history memoized) wasn't a good risk/reward trade)
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
  - [ ] Audit analytical labels for plain-language clarity (`Rate` → `Completion rate` or
        `Consistency`, `Total Days` → `Days tracked`, and friendlier pattern-chart titles)
  - [ ] Explain the icon-only Grid/Bars/Streamgraph and cumulative/per-period controls with
        lightweight first-use help or an on-demand info sheet rather than removing advanced modes
  - [ ] Let users tap Stats chart points/bars to inspect the exact date, value, and relevant habits,
        matching the existing day inspection in Dashboard Calendar's Bars/Streamgraph modes
  - [ ] Add encouraging young-data states that explain when a useful pattern will emerge instead of
        presenting sparse/flat charts without context

## MMP

- [ ] Finalize Streakaholic branding and launch identity
  - [ ] Audit the existing logo/app-icon variants under `assets/images/` and `logo/`; choose one
        canonical mark and wordmark, document which alternates are still valid, and retire ambiguous
        duplicates so future store/website assets come from one source of truth
  - [ ] Validate the chosen mark at launcher, adaptive-mask, notification/small-icon, splash,
        favicon, share-card, feature-graphic, light-background, and dark-background sizes
  - [ ] Select one canonical tagline from [MARKETING.md](MARKETING.md) (current default: “Turn habits
        into streaks you want to keep”) and distinguish it from the category descriptor (“A playful
        habit & streak tracker”) and supporting campaign lines such as “Habits worth celebrating”
  - [ ] Define a compact brand guide (`BRAND.md`): canonical name/capitalization, logo usage,
        palette, typography, tagline hierarchy, and encouraging/no-guilt voice
  - [ ] Apply the final identity consistently across the in-app About screen, share cards/share text,
        Play Store title/icon/feature graphic/listing, screenshots, demo videos, press kit, and
        `streakaholic.app`
- [ ] Monetization — see [MONETIZATION.md](MONETIZATION.md) for the actual plan (one-time
      Pro unlock + tip jar + Commitment Mode Streak Saves, no ads/subscription) and sequencing
  - [ ] Tip jar (build first — see PUBLISHING.md's implementation guide)
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
- [x] About (privacy, ToS, credits, etc) (`app/about.tsx` → `AboutScreen` — app identity/version/icon, a Privacy Policy and Terms of Service reflecting the app's actual local-only/no-tracking architecture, and an Open Source credits list of the libraries actually used; linked from Settings' About row, which now navigates instead of just displaying name/version inline. Placeholder legal-style text — review/replace before an actual store submission)
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
