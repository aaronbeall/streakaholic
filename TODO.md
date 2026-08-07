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
* [x] Confirmation dialog before deleting a task (modal confirm on Delete/Archive in the Edit Task screen; everything else uses a toast + Undo instead of a modal)
* [x] Quick undo for accidental task completions (toast + Undo right on Home after completing; `undoCompleteTask` reverses exactly one press, not the whole day)
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

