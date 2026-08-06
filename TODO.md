# Todo

## MVP
* [x] "Streakoholic" vs "Streakaholic" (kept Streakaholic)
* [x] Implement frequency settings for streaks
* [x] Implement times per day
* [x] Edit task
* [x] Dark mode
* [x] Settings screen
* [x] Export/import data
* [x] Archive tasks
  * [x] Restore archived task
* [x] Initial empty state

## MVP+
* [ ] Calendar year map
* [ ] Sharing
* [ ] Reminders/notifications

## UX / Usability
* [x] Onboarding for core gestures (tap to cycle task/calendar/stats views, hold to complete)
* [ ] Confirmation dialog before deleting a task (currently instant, no undo)
* [ ] Quick undo for accidental task completions (uncompleteTask is currently only reachable via the full-screen calendar)
* [ ] Touch target sizes below platform minimums (Add/Edit Task's +/- steppers and day-of-week buttons)
* [ ] Accessibility support (no accessibilityLabel/Role/Hint anywhere in app/ — icon-only buttons are silent to screen readers)
* [ ] Haptic feedback (expo-haptics is installed but unused; completions/streaks/celebrations are natural fits)

## MMP
* [ ] Monetization
  * [ ] Freemium
  * [ ] AdMob
  * [ ] Unlocks
* [ ] Rate this app
* [ ] Widgets
* [ ] Sync (Drive or Dropbox)

## Future
* [ ] Timeline view
* [ ] Heatmap view
* [ ] Points/ranks/achievements
* [ ] Daily summary
* [ ] Personal leaderboard
* [ ] Login with google
* [ ] Social features (friends, friend streaks, competitions, leaderboards)

##  UI tweaks
* [ ] Bottom margin and androind buttons
* [ ] Performance optimizations
  * [ ] Migrate to Zustand?
  * [ ] Reduce unnecessary task stat re-recalculations
  * [ ] WeakMap caching
* [ ] Layout/navigation improvement with proper screen transitions
  * [ ] Gesture navigation (swipe left/right for tabs)

