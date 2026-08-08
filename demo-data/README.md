# Demo data

A realistic dataset for showing off Streakaholic — 9 tasks spanning every frequency
type, streak status/badge, and a couple of edge cases, with real backfilled completion
history (not just today) so streaks, the Dashboard's charts, and calendars all look
populated on first import.

## How to use it

In the app: **Settings → Import Data**, pick `streakaholic-demo-data.json`. That merges
with whatever's already there — use **Import & Replace All Data** instead for a clean
slate.

## Regenerating

`streakaholic-demo-data.json` is generated, not hand-written — `python3
generate-demo-data.py` reproduces it. Each task's *story* (which days are hit/missed) is
fixed (seeded), but every run re-anchors to the actual current date, so re-running it
right before a demo keeps "today" genuinely current instead of the dataset slowly
drifting stale.

Verified against the app's own `calculateTaskStats`/`parseTasksImport` (not just
eyeballed) before finalizing the completion patterns below, so the streak numbers and
badge states in the table are what actually comes out of the real streak engine, not just
what the story intends.

## What each task demonstrates

| Task | Frequency | Badge shown | What it's for |
|---|---|---|---|
| Morning Workout | daily | 🔥 fire, no trophy | A long-broken best streak (~50 days), a 5-day real-life gap, then a genuine live streak (~35 days) shorter than the best — current ≠ best is the common case, not the exception |
| Drink Water | daily, 4×/day | 🕐 clock + trophy | ~89-day streak, but only 2 of 4 reps logged *today* — the segmented ring's partial-solid state, and an "expiring" badge on a streak that's also the all-time best |
| Read Before Bed | specific days (Sun/Mon/Wed/Fri) | 🔥 fire, no trophy | Spotty, realistic (~60% hit rate on due days) rather than a showcase streak |
| Meal Prep | 3×/week | 🕐 clock, no trophy | Period-based streak, currently short of this week's quota — the "expiring" state for a weekly (not daily) streak |
| Deep Clean | 4×/month | 🔥 fire + trophy | Monthly quota, comfortably ahead this month — trophy + a different period unit than Meal Prep |
| Guitar Practice | daily | 🔥 fire + trophy | Created only 3 days ago — a brand-new task where current streak *is* the best streak |
| Meditate | 5×/week | 😴 gray "sleep" badge | A genuinely great run that's been completely silent for the last ~2 weeks — `currentStreak` is 0 but `lastStreak` isn't, the one badge state none of the other tasks show |
| No Sugar | daily, **archived** | — | Has real history from before archiving, so Archived Tasks → restore has something to demo |
| Learn Spanish | daily | *(no badge)* | Created today, zero completions — the fresh "never started" state and an empty progress ring |
