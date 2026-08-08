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

## UX / Usability / Enhancements

- [x] Onboarding for core gestures (tap to cycle task/calendar/stats views, hold to complete; plus Dashboard's task-filter hint and task-detail Calendar's tap-a-day hint)
- [x] Confirmation dialog before deleting a task (modal confirm on Delete/Archive in the Edit Task screen; everything else uses a toast + Undo instead of a modal)
- [x] Quick undo for accidental task completions (toast + Undo right on Home after completing; `undoCompleteTask` reverses exactly one press, not the whole day)
- [ ] Touch target sizes below platform minimums (Add/Edit Task's +/- steppers and day-of-week buttons)
- [ ] Accessibility support (no accessibilityLabel/Role/Hint anywhere in app/ — icon-only buttons are silent to screen readers)
- [ ] Haptic feedback (expo-haptics is installed but unused; completions/streaks/celebrations are natural fits)
- [ ] Hide unscheduled tasks option (Home filter to only show tasks due today)
- [ ] Pause tasks (also hidden, but still shown in dashboard)
- [ ] Remember dashboard selection
- [ ] Re-order tasks on home screen
- [ ] Double-wide task card is not okay
- [ ] Archive/Delete task should take you back to homepage
- [ ] New best streak congratulations
- [ ] Perfect day congratulations

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

## Future

- [ ] Timeline view
- [x] Heatmap view (`DashboardCalendarView`'s Timeline section — partial-day fills across every task calendar now scale opacity by completion fraction, plus a Grid | Bars toggle with a per-day segmented completion bar chart)
- [ ] Points/ranks/achievements
- [ ] Daily summary
- [ ] Personal leaderboard
- [ ] Login with google
- [ ] Social features (friends, friend streaks, competitions, leaderboards)

## UI tweaks

- [x] Bottom margin and androind buttons (edge-to-edge insets — every bottom-anchored element (FAB, `ToastBanner`, scroll content, the fixed-height calendar grid) adds `insets.bottom`)
- [ ] Performance optimizations
  - [ ] Performance pass (profile the app and audit for bottlenecks)
  - [ ] Migrate to Zustand?
  - [ ] Reduce unnecessary task stat re-recalculations
  - [ ] WeakMap caching
- [x] Layout/navigation improvement with proper screen transitions (`RootStack`'s `slide_from_right` animation)
