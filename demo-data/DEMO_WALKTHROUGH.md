# Streakaholic demo walkthrough

This walkthrough is built around `streakaholic-demo-data.json`. It can be used for a
live tester tour or as a shot list for a narrated demo video.

## Prepare the demo

1. From the repository root, run `npm run demo-data` as close as practical to recording.
2. Move `demo-data/streakaholic-demo-data.json` somewhere the Android document picker
   can reach, such as Downloads or Google Drive.
3. For a truly clean Trophy Case, clear the demo device's Streakaholic app storage first.
   **Import & Replace All Data** replaces habits, but intentionally does not erase trophies
   that were already earned on that installation.
4. Open **Settings → Import & Replace All Data**, choose the generated file, and then tap
   **Check Now** in the achievement prompt.
5. In **Settings → Achievements**, make sure **Celebrate Achievements** is enabled. If
   **Unsnooze All Celebrations** is visible, use it. The live trigger below depends on the
   streak-10 celebration not being snoozed.
6. In **Settings → Habit Cards**, enable the card background, habit name, and completion
   counter for the clearest recording, then return to Home.
7. Turn on Do Not Disturb and hide personal notifications before recording. Use a clean,
   high-contrast wallpaper or crop to the app frame.

Do not merge the demo export into an older demo dataset. Because the dates are regenerated,
a merge can retain old records and change the intended streak states.

## Core walkthrough (about 4–5 minutes)

### 1. Open on motivation, not setup (20 seconds)

**Action:** Start on Home and pause long enough to show all six cards.

**Say:**

> Streakaholic turns everyday habits into visible momentum. Each habit can have its own
> schedule, color, reminder, daily target, and streak—without requiring an account.

**Point out:**

- Morning Workout is complete today and carries a live streak.
- Drink Water is halfway through its 2-of-4 daily target.
- The fire and clock bubbles at the top summarize healthy and at-risk streaks.
- Read Before Bed has a 9-day live streak with today still due; it is deliberately staged so
  the live celebration later in the walkthrough crosses into a genuine double-digit streak.
- Learn Spanish is intentionally brand new, so the grid includes both long-term progress
  and the clean starting state.

### 2. Show that progress can be partial (20 seconds)

**Action:** Press and hold **Drink Water** once. Let the progress animation finish and show
the counter move from 2/4 to 3/4. Let the toast appear and sit — its visible **Undo** action
is the point; don't tap it, since reversing a completion on camera reads as confusing (something
visibly finishing, then visibly un-finishing). Move on once the toast has been on screen a beat.

**Say:**

> Habits do not have to be binary. A daily target can take multiple check-ins, and every
> check-in visibly fills the ring while the streak stays at risk until the target is met.

### 3. Use the streak-state filters (15 seconds)

**Action:** Tap the orange clock bubble, then clear it. Tap the red fire bubble, then clear it.

**Say:**

> These filters answer two useful questions immediately: what is safely on track, and what
> still needs attention today?

The clock filter should isolate **Drink Water** and **Read Before Bed**. The fire filter
should show the comfortably current habits.

### 4. Trigger a real full-screen celebration and share it (40 seconds)

**Action:** With all filters cleared and **Read Before Bed** showing its habit face, press
and hold it once. Let the completion animation finish. It should extend the staged 9-day
run to 10 days and cross the streak-10 tier, launching a full-screen milestone celebration —
a bigger, more satisfying trigger than a small "Streak Started" moment.

Pause for the count-up, emblem reveal, and confetti. Tap **Share**, keep the habit name
enabled, and show the generated achievement card. For a live tester tour, tap the preview's
**Share** button once to prove it opens the native share sheet, then dismiss it. For store or
social footage, stop at the clean preview so personal share targets do not enter the recording.

**Say:**

> Completing a habit can do more than tick a box. It extends the streak, unlocks a real
> achievement, and turns that moment into a shareable card—all rendered locally on the device.

Close the share preview and celebration. Do not undo this completion; the next step uses
the newly completed state. Re-import the dataset whenever you need to rehearse this trigger
again.

### 5. Flip a card to preview it, then dive into its full story, including a skip (60 seconds)

**Action:** Back on Home, tap the already-completed **Morning Workout** card once. It flips
from its habit face to its compact calendar face — a quick preview without leaving Home.

**Say:**

> Every card does more than show a checkmark. Tapping it flips through a compact calendar and
> stats view right on the home screen.

Now, while the card is showing its calendar face, long-press it. This opens the full
task-detail screen already on the **Calendar** tab — the flip gesture is also how you jump
straight to the view you were just previewing, instead of always landing on whichever tab
you last used.

**Say:**

> A streak is more useful when you can see the story behind it. Morning Workout has a
> 34-day live streak, but its personal record is 132 days. The calendar shows completed,
> missed, connected, and skipped days; Stats shows consistency over time; and Streaks keeps
> every historical run instead of reducing the habit to one number.

**Show:**

- Calendar: without swiping anywhere, point out the one day in the current month with a
  faded, struck-through number instead of a filled dot or a plain miss mark — that is a real
  skip. Long-press it to open the day-details popover and show its **Remove skip** option
  (close without tapping it), then say:

  > Life happens. A skip is different from just not showing up — it tells the app this day
  > was a deliberate pass, so the streak keeps going instead of resetting to zero. Skips
  > only apply to daily and specific-weekday habits, and only to a day that was actually
  > scheduled — you can't skip a day that was never due in the first place.

- Long-press a different, still-empty recent day to open the same popover and tap **Skip
  this day**. Let the toast with its **Undo** action appear and sit for a beat, then move
  on without tapping Undo — the dataset doesn't need to return to its prior state for the
  rest of the walkthrough.
- Calendar: swipe to an older month to expose longer runs and breaks.
- Stats: choose **Year**, toggle cumulative activity, and scroll through weekday and
  time-of-day charts. Tap the share icon to show the generated habit-progress card and its
  optional habit-name control, then close the preview.
- Streaks: choose **Best** to bring the 132-day record to the top.

### 6. Show selected weekdays and quota schedules (45 seconds)

**Action:** Back on Home, press and hold the now-completed **Read Before Bed** card to open
its detail screen. Tap the frequency/status badges beneath the large habit icon to open the
plain-language summary. Point out that it is due only on four selected weekdays, then close
the summary.

Use the right-hand habit arrow to move to **Meal Prep** and open the same summary. Point out
its **3 days per week** quota and the deliberately missed previous week. Move once more to
**Deep Clean** and point out its **4 days per month** quota and its sparse, on-track rhythm.
Return to Home.

**Say:**

> Schedules can follow exact weekdays, or flexible weekly and monthly quotas. A three-day
> weekly goal does not force Monday, Wednesday, and Friday—you choose the days while the
> app keeps the period accountable.

### 7. Show aggregate analytics and the streamgraph (60 seconds)

**Action:** Return Home and tap the bar-chart icon to open **Dashboard**.

**Say:**

> The Dashboard pulls every habit together, while these colored icons let you include or
> exclude habits from every view.

**Show:**

1. **Stats:** point out total completions, active-streak ratio, best streak, completion
   rate, and the color-coded per-habit breakdown. Tap the share icon to preview the
   aggregate progress card. Close it, switch from **Week** to **Year** so the generated
   history fills the chart, then show the morning, afternoon, and evening peaks.
2. **Calendar:** show the grid's complete, partial, missed, and not-due states. Toggle
   **Grid → Bars → Streamgraph**. Pause on the streamgraph so the colored habit ribbons and
   changing total activity silhouette are readable. Tap one of the visibly broad recent
   peaks to show the selected-day line and the per-habit detail card beneath the chart.
3. **Streaks:** choose **Best** and point out that every historical run remains browsable.
4. Tap one colored habit icon in the Dashboard header to demonstrate that all three tabs
   share the same filter.

**Say while showing the streamgraph:**

> The streamgraph turns the whole routine into one flowing picture. Each color is a habit,
> and the shape makes bursts, quiet periods, and changes in the mix immediately visible.

### 8. Finish on gamification (30 seconds)

**Action:** Open the **Trophy Case** from the Dashboard or Home header.

**Say:**

> Streaks provide the daily motivation, and achievements mark the bigger story: first
> steps, personal records, perfect weeks, comebacks, long-term milestones, and even when
> you tend to get things done.

**Show:**

- Scroll through **Unlocked** and **Locked**.
- Point out Early Bird, Night Owl, Perfect Week, New Best Streak, and Fortune 500.
- Point out the progress toward the intentionally locked 1,000-level trophies.
- Tap an unlocked trophy to replay its full-screen celebration.
- Point out that replayed celebrations retain the same **Share** action demonstrated by the
  live unlock earlier.
- Use a habit icon at the top to filter the Trophy Case to one habit.

**Close with:**

> Streakaholic makes consistency feel rewarding without turning habit tracking into work.

## Optional tester-only extensions

Use these after the polished core tour when the audience cares about behavior rather than
video length:

- Open **Learn Spanish** to contrast a completely new habit with the populated examples.
- Continue flipping a card past its calendar face to its stats face too (the core walkthrough's
  step 5 only shows the flip-to-calendar half of this gesture).
- Open an edit screen to show icon search, color choices, all four frequency controls,
  multiple-times-per-day targets, and the five reminder escalation levels.
- In a habit's monthly calendar, tap a past date to demonstrate backfilling and clearing
  history; do this only after the polished recording because it changes the dataset.
- Visit **Settings → Archived Habits** and show that No Sugar retains its history and can
  be restored.
- Open the reorder control on Home and briefly demonstrate preset sorting by creation,
  usage, color, or reminder time.

## What is not demonstrated in the core walkthrough

These features are implemented, but deliberately left out of the polished 4–5 minute path:

| Area | Specific omissions |
|---|---|
| Habit creation and editing | Creating a habit, automatic icon suggestions and icon search, the expanded color picker, changing a schedule, name validation, the six-active-habit limit, discard-unsaved-changes protection, archive/delete confirmations, and their Undo actions |
| Reminders | The Off/Once/Repeat/Persist/Alarm modes, changing reminder time and repeat interval, Android notification permission, and actual notification/alarm delivery |
| Home interactions | Cycling a card past its calendar face to its stats face (step 5 only shows tap-to-calendar, then long-press to deep-link), manual drag reordering, preset sorting, and the empty/filtered-empty states |
| Calendar editing | Per-habit **Year** mode, directly adding/removing a past completion, multiple-rep corrections from a calendar day, future-day restrictions, and opening a task calendar from a Dashboard day/month card |
| Analytics variants | The **Month** and **All Time** Stats ranges, every chart at every range, Dashboard mini month cards, the Streaks **Recent** sort, and loading very old streak/calendar pages |
| Achievement presentation variants | Snoozing one achievement kind, the lightweight achievement alert used for snoozed kinds, unsnoozing, and a batch where several achievements unlock in one full-screen sequence |
| Settings and support | System/Light/Dark theme switching; the individual card-display toggles as live before/after comparisons; export; merge import; import Undo; Send Feedback; Rate This App; the Tip Jar and its three purchase tiers; **Share Streakaholic** as a store link; replaying onboarding hints; and the About/Privacy/Terms/Open Source screens |
| Data lifecycle | Deleting a habit and restoring via Undo, archiving/restoring as a full flow, duplicate-import messaging, and malformed-import handling |
| Developer-only tooling | The notification debug screen |

The walkthrough does demonstrate all three content-card sharing surfaces: a live achievement,
one habit's Stats, and the aggregate Dashboard. It does **not** demonstrate the separate
**Settings → Share Streakaholic** action, which shares the app/store link rather than a progress
image.

The following roadmap items cannot be demonstrated because they are not implemented yet:

- Commitment Mode (formerly Ironman/Hard Mode), locked history, Commitment achievement
  provenance, and Streak Saves
- Pausing a habit for a prospective date range (distinct from a single-day skip, which
  *is* implemented -- see step 6 above -- and from Commitment Mode's own Streak Saves)
- Pro purchase/unlimited habits and any paid unlock flow (the tip jar itself is
  implemented -- see the "Settings and support" omissions above -- Pro is not)
- Android home-screen widgets

## Short store/social cut (about 60 seconds)

For a short silent or captioned video, record these clips separately and assemble them in
this order:

| Time | Shot | On-screen caption |
|---|---|---|
| 0–5s | Home grid; slow pause on mixed streak states | Build momentum, one day at a time |
| 5–11s | Hold Drink Water; ring moves 2/4 → 3/4 | Track habits your way |
| 11–22s | Hold Read Before Bed; show the full streak-10 celebration | Make progress worth celebrating |
| 22–29s | Open the achievement share preview | Share the moment |
| 29–38s | Read Before Bed schedule summary, then Meal Prep's 3/week summary | Exact days or flexible quotas |
| 38–51s | Dashboard Calendar Grid → Bars → Streamgraph; tap a peak | See the shape of your consistency |
| 51–57s | Dashboard or habit Stats share preview | Your progress, ready to share |
| 57–60s | Trophy Case, then return to Home | Streakaholic |

Keep captions inside the middle 80% of the frame so vertical social crops and Play Store
previews do not cut them off. Record taps with pointer visualization enabled only if the
destination format benefits from it; for store footage, clean interactions usually look better.
