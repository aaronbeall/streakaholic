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
5. Return to Home. In **Settings → Habit Cards**, enable the card background, habit name,
   and completion counter for the clearest recording.
6. Turn on Do Not Disturb and hide personal notifications before recording. Use a clean,
   high-contrast wallpaper or crop to the app frame.

Do not merge the demo export into an older demo dataset. Because the dates are regenerated,
a merge can retain old records and change the intended streak states.

## Core walkthrough (about 3 minutes)

### 1. Open on motivation, not setup (20 seconds)

**Action:** Start on Home and pause long enough to show all six cards.

**Say:**

> Streakaholic turns everyday habits into visible momentum. Each habit can have its own
> schedule, color, reminder, daily target, and streak—without requiring an account.

**Point out:**

- Morning Workout is complete today and carries a live streak.
- Drink Water is halfway through its 2-of-4 daily target.
- The fire and clock bubbles at the top summarize healthy and at-risk streaks.
- Learn Spanish is intentionally brand new, so the grid includes both long-term progress
  and the clean starting state.

### 2. Show that progress can be partial (20 seconds)

**Action:** Press and hold **Drink Water** once. Let the progress animation finish and show
the counter move from 2/4 to 3/4. Tap **Undo** in the toast so the rest of the walkthrough
remains on the known dataset.

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

### 4. Open one habit's full story (35 seconds)

**Action:** Long-press the already-completed **Morning Workout** card. Visit its
**Calendar**, **Stats**, and **Streaks** tabs.

**Say:**

> A streak is more useful when you can see the story behind it. Morning Workout has a
> 35-day live streak, but its personal record is 132 days. The calendar shows completed,
> missed, and connected days; Stats shows consistency over time; and Streaks keeps every
> historical run instead of reducing the habit to one number.

**Show:**

- Calendar: swipe to an older month to expose longer runs and breaks.
- Stats: choose **Year**, toggle cumulative activity, and scroll through weekday and
  time-of-day charts. Tap the share icon to show the generated progress card, then close
  the preview without opening the system share sheet during the main recording.
- Streaks: choose **Best** to bring the 132-day record to the top.

### 5. Show aggregate analytics (45 seconds)

**Action:** Return Home and tap the bar-chart icon to open **Dashboard**.

**Say:**

> The Dashboard pulls every habit together, while these colored icons let you include or
> exclude habits from every view.

**Show:**

1. **Stats:** point out total completions, active-streak ratio, best streak, completion
   rate, and the color-coded per-habit breakdown. Switch from **Week** to **Year** so the
   generated history fills the chart, then show the morning, afternoon, and evening peaks.
2. **Calendar:** show the grid's complete, partial, missed, and not-due states. Toggle
   **Grid → Bars** to turn the same dates into stacked daily activity.
3. **Streaks:** choose **Best** and point out that every historical run remains browsable.
4. Tap one colored habit icon in the Dashboard header to demonstrate that all three tabs
   share the same filter.

### 6. Finish on gamification (35 seconds)

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
- From that celebration, tap **Share** to preview the branded achievement card; this is a
  natural bridge from personal motivation to word-of-mouth growth.
- Use a habit icon at the top to filter the Trophy Case to one habit.

**Close with:**

> Streakaholic makes consistency feel rewarding without turning habit tracking into work.

## Optional tester-only extensions

Use these after the polished core tour when the audience cares about behavior rather than
video length:

- Open **Read Before Bed** to show the selected-weekday schedule and late reminder.
- Open **Meal Prep** to explain weekly quotas and its dormant streak history.
- Open **Deep Clean** to show a monthly quota and sparse calendar rhythm.
- Open **Learn Spanish** to contrast a completely new habit with the populated examples.
- Visit **Settings → Archived Habits** and show that No Sugar retains its history and can
  be restored.
- Open the reorder control on Home and briefly demonstrate preset sorting by creation,
  usage, color, or reminder time.

## Short store/social cut (45–60 seconds)

For a short silent or captioned video, record these clips separately and assemble them in
this order:

| Time | Shot | On-screen caption |
|---|---|---|
| 0–5s | Home grid; slow pause on mixed streak states | Build momentum, one day at a time |
| 5–12s | Hold Drink Water; ring moves 2/4 → 3/4 | Track habits your way |
| 12–20s | Filter at-risk streaks, then return to all | Know what needs attention |
| 20–32s | Dashboard Stats, then Calendar Grid → Bars | See your consistency clearly |
| 32–43s | Morning Workout Streaks sorted by Best | Every streak tells a story |
| 43–55s | Trophy Case; tap a trophy, then preview its share card | Turn progress into achievements |
| 55–60s | Return to the Home grid | Streakaholic |

Keep captions inside the middle 80% of the frame so vertical social crops and Play Store
previews do not cut them off. Record taps with pointer visualization enabled only if the
destination format benefits from it; for store footage, clean interactions usually look better.
