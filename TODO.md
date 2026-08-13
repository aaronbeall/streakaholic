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
- [ ] Sharing
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
- [ ] Pause tasks (hidden, doesn't count towards completion percentage while paused)
- [x] Remember dashboard selection (`dashboardLastTab`/`taskDetailLastTab` in `SettingsContext` — last-viewed Stats/Calendar/Streaks tab persists across visits; the task-filter checkboxes themselves still reset to "all tasks" each time, that's a separate thing)
- [ ] Re-order tasks on home screen
- [x] Add/Edit Task: switching Frequency to "Specific Days" should default to all 7 days selected instead of carrying over whatever `daysOfWeek` the previous frequency left behind (empty for a task that was never Specific Days)
- [x] Use consistent terminology across user-facing copy -- standardized on "Habit" everywhere a user reads it (per explicit user direction: "Calling it 'habit' is purely a user facing term" -- the data model/code stays `Task` throughout, unchanged)
- [ ] Consistent empty state design/copy across Stats/Calendar/Streaks views (Dashboard and per-task task-detail)
- [x] Double-wide task card is not okay (`TaskCard`'s `container` had `flex: 1`, whose implied `flexBasis: 0%` overrode the explicit `width` in `HomeScreen`'s row, stretching a lone last-row card to fill the row; fixed by dropping `flex: 1` and centering a partial last row via `justifyContent: 'center'`)
- [x] Archive/Delete task should take you back to homepage (`AddTaskScreen`'s Archive/Delete confirm now calls `router.dismissTo('/')` instead of `router.back()` — fixes a real crash: reached via task-detail's pencil icon, `back()` only popped to task-detail, which still held the just-deleted `taskId` and threw "Missing task" on render)
- [x] Congratulation achievements (`app/utils/achievements.ts`'s `detectCompletionAchievements` — 23 kinds: first-completion, new-best-streak, anniversary, streak-length tiers 2/5/10/25/50/100/1000, completion-count milestones 10/50/100/1000, three cross-task Century Club tiers (100/500/1000), perfect-day, perfect-week, comeback, habit-collector, early-bird, night-owl. Event-triggered off `taskStore.completeTask`, recorded to a persisted `achievementsStore`, celebrated via a full-screen `AchievementCelebration` (or, for a kind you've snoozed via its own bell toggle, a lighter top-anchored `AchievementAlert` notice instead), browsable in a Trophy Case screen (`/trophies`) with per-kind unlocked/in-progress/locked status, toggleable in Settings — see CLAUDE.md)
  - [x] New best streak congratulations
  - [x] Perfect day congratulations
  - [x] First streak congratulations
  - [x] Milestone completions (10, 50, 100, 1000)
  - [ ] Trophy Case: filter by task
  - [ ] Integrate achievements on Stats screens (per-task `TaskStatsScreen` and aggregate `DashboardStatsView`)
  - [ ] Achievement spam via undo/redo -- a repeatable kind's threshold-crossing check (e.g. `streak-10`, `new-best-streak`, `perfect-day`) can re-fire every time the same single completion is undone then redone, since each redo is a fresh prev/next transition crossing the same threshold again with nothing genuinely new earned; one-time kinds are already safe via dedup, this is scoped to the repeatable ones
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
- [ ] Duration based tasks
- [ ] Landscape mode
- [ ] Sounds
  - [ ] Completion and streak
  - [ ] Congratulations

## MMP

- [ ] Monetization — see [MONETIZATION.md](MONETIZATION.md) for the actual plan (one-time Pro unlock + tip jar + streak unfreeze, no ads/subscription) and sequencing
  - [ ] Tip jar (build first — see PUBLISHING.md's implementation guide)
  - [ ] Pro unlock (unlimited tasks, widgets, extra customization — build once task cap + widgets exist)
  - [ ] Unfreeze streak (needs the underlying "restore a lapsed streak" feature designed first, not just billing)
  - [ ] ~~AdMob~~ — decided against, see MONETIZATION.md
- [ ] Rate this app
- [ ] Widgets
- [ ] Sync (Drive or Dropbox)
- [x] About (privacy, ToS, credits, etc) (`app/about.tsx` → `AboutScreen` — app identity/version/icon, a Privacy Policy and Terms of Service reflecting the app's actual local-only/no-tracking architecture, and an Open Source credits list of the libraries actually used; linked from Settings' About row, which now navigates instead of just displaying name/version inline. Placeholder legal-style text — review/replace before an actual store submission)

## Future

- [x] Timeline view (`DashboardCalendarView`'s "Timeline" section — infinite horizontal scroll, Grid | Bars toggle)
- [x] Heatmap view (`DashboardCalendarView`'s Timeline section — partial-day fills across every task calendar now scale opacity by completion fraction, plus a Grid | Bars toggle with a per-day segmented completion bar chart)
- [x] Achievements (see the MVP+ entry above — 23-kind system, Trophy Case, celebration screen; deliberately no points/ranks/upgrades layered on top yet, kept purely cosmetic per explicit design decision — a future point system could hang off the same recorded data, see below)
- [ ] Points/ranks/upgrades
- [ ] Daily summary
- [ ] Personal leaderboard
- [ ] Social features
  - [ ] Friends, friend streaks, friend comparisons
  - [ ] Competitions
  - [ ] Leaderboards
- [ ] Task groups (swipe left/right on home, etc)
- [ ] Home screen customization (default=icons, calendar, timeline, list)
- [ ] Ironman mode (can't change past day completions)
