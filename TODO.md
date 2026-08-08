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
- [ ] Reminders/notifications

## UX / UI Improvements

- [x] Onboarding for core gestures (tap to cycle task/calendar/stats views, hold to complete; plus Dashboard's task-filter hint and task-detail Calendar's tap-a-day hint)
- [x] Confirmation dialog before deleting a task (modal confirm on Delete/Archive in the Edit Task screen; everything else uses a toast + Undo instead of a modal)
- [x] Quick undo for accidental task completions (toast + Undo right on Home after completing; `undoCompleteTask` reverses exactly one press, not the whole day)
- [x] Touch target sizes below platform minimums (Add/Edit Task's +/- steppers and day-of-week buttons bumped 32/36px → 44x44, iOS HIG's minimum)
- [x] Accessibility support (accessibilityLabel/Role/Hint/State added across every screen and component — see CLAUDE.md)
- [x] Haptic feedback (task completion, long-press gesture recognition, calendar day toggle, toast Undo, archive/delete/restore — see CLAUDE.md)
- [ ] Hide unscheduled tasks option (Home filter to only show tasks due today)
- [ ] Pause tasks (also hidden, but still shown in dashboard)
- [x] Remember dashboard selection (`dashboardLastTab`/`taskDetailLastTab` in `SettingsContext` — last-viewed Stats/Calendar/Streaks tab persists across visits; the task-filter checkboxes themselves still reset to "all tasks" each time, that's a separate thing)
- [ ] Re-order tasks on home screen
- [x] Double-wide task card is not okay (`TaskCard`'s `container` had `flex: 1`, whose implied `flexBasis: 0%` overrode the explicit `width` in `HomeScreen`'s row, stretching a lone last-row card to fill the row; fixed by dropping `flex: 1` and centering a partial last row via `justifyContent: 'center'`)
- [x] Archive/Delete task should take you back to homepage (`AddTaskScreen`'s Archive/Delete confirm now calls `router.dismissTo('/')` instead of `router.back()` — fixes a real crash: reached via task-detail's pencil icon, `back()` only popped to task-detail, which still held the just-deleted `taskId` and threw "Missing task" on render)
- [ ] New best streak congratulations
- [ ] Perfect day congratulations
- [x] Bottom margin and androind buttons (edge-to-edge insets — every bottom-anchored element (FAB, `ToastBanner`, scroll content, the fixed-height calendar grid) adds `insets.bottom`)
- [ ] Performance optimizations
  - [x] Performance pass (audited Context re-render fan-out, memoization/referential-stability gaps, and common RN FlatList traps — see CLAUDE.md's "State management" section)
  - [x] Migrate to Zustand? (`TaskContext`/`SettingsContext` → `app/stores/*` — selector-based selective subscription, fixes `TaskCard` re-rendering on unrelated task changes and every screen re-rendering on any settings change)
  - [ ] Reduce unnecessary task stat re-recalculations
  - [x] WeakMap caching (considered during the Zustand migration for `getCompletionCount`/`isTaskCompleted` — went the other way instead: dropped the existing `completionCache` Map entirely in favor of a plain `task.completions.find()`, since the cache was also a real staleness bug (one render behind `tasks`), not just a perf question, and the O(n) lookup is trivial at this app's scale)
- [x] Layout/navigation improvement with proper screen transitions (`RootStack`'s `slide_from_right` animation)
- [ ] Already completed task on home screen should not have press-and-hold triggering completion animation

## MMP

- [ ] Monetization
  - [ ] Freemium
  - [ ] AdMob
  - [ ] Unlocks
  - [ ] Unfreeze streak
  - [ ] Tip jar
- [ ] Rate this app
- [ ] Widgets
- [ ] Sync (Drive or Dropbox)
- [ ] About (privacy, ToS, credits, etc)

## Future

- [x] Timeline view (`DashboardCalendarView`'s "Timeline" section — infinite horizontal scroll, Grid | Bars toggle)
- [x] Heatmap view (`DashboardCalendarView`'s Timeline section — partial-day fills across every task calendar now scale opacity by completion fraction, plus a Grid | Bars toggle with a per-day segmented completion bar chart)
- [ ] Points/ranks/achievements
- [ ] Daily summary
- [ ] Personal leaderboard
- [ ] Login with google
- [ ] Social features (friends, friend streaks, competitions, leaderboards)
