# Demo data

`streakaholic-demo-data.json` is a marketing/demo export with six active habits (the
real free-tier cap), one archived habit, and enough history to populate Home, every
Dashboard tab, per-habit analytics, calendars, streak history, and the Trophy Case.

The file is generated rather than hand-edited. Every run preserves the same story but
re-anchors all dates to today:

```bash
npm run demo-data
```

For repeatable testing against another anchor date or output path:

```bash
python3 demo-data/generate-demo-data.py --today 2026-09-01 --output /tmp/streakaholic-demo.json
```

Import the result with **Settings → Import & Replace All Data**. When the app asks
**Check for achievements?**, choose **Check Now** so it reconstructs the trophies
earned by the imported history. Use replace, not merge: merging a newly generated
date-relative set into an older demo import can retain stale completion records.

## Main dataset

| Habit | Schedule and state | What it demonstrates |
|---|---|---|
| Morning Workout | Daily; 34-day live streak (with one genuine skip in it), 132-day record | Long-term consistency, a broken-and-rebuilt streak, backfill-created record, the skip feature (a real day with no completion that still doesn't break the chain), morning activity peak, reminder with repeat nags |
| Drink Water | Daily, 4×; 2/4 today, 75-day streak at risk, 100-day record | Segmented partial progress, completion counter, expiring streak, afternoon activity peak |
| Read Before Bed | Four selected weekdays; due today with a one-day live streak | Specific weekday scheduling, late-night activity peak, and a staged live completion that triggers the full-screen 2-day-streak celebration |
| Meal Prep | 3×/week; last week fell short | Weekly quota, expired/dormant state, multiple historical streak chains |
| Deep Clean | 4×/month; currently on track | Monthly quota, sparse calendar history, distinct month/year chart rhythm |
| Learn Spanish | Daily; created today with no history | Never-started state, empty progress and analytics, new-user baseline |
| No Sugar | Archived, with older history | Archived Habits and restore flow without polluting active analytics |

The task creation dates are staggered and the completion timestamps cluster in the
morning, afternoon, and late evening. This makes the Dashboard's task breakdown,
over-time chart, weekday histogram, and time-of-day histogram visually meaningful.

## Achievement coverage

The generated history is designed to unlock a representative mix after **Check Now**:

- First Steps, every streak tier through 100 days, and New Best Streak
- One Year Strong and completion milestones through 100 on qualifying habits
- Century Club and Fortune 500 across all habits
- Perfect Day, Perfect Week, Welcome Back, and Habit Collector
- Early Bird and Night Owl

The 1,000-day, 1,000-completion, and Millennium Club trophies deliberately remain
locked with visible progress. A completely unlocked Trophy Case is less useful in a
demo because it hides how goals and progress bars motivate the next milestone.

## Verification

`__tests__/utils/demoData.test.ts` loads the generated export through the production
import parser, calculates states with the production streak engine, and runs the
production retroactive achievement detector. Run it with:

```bash
npm test -- --runInBand --no-watchman __tests__/utils/demoData.test.ts
```

## Legacy achievement fixture

`generate-achievements-test-data.py` and
`streakaholic-achievements-test-data.json` are older, threshold-oriented fixtures for
manually triggering individual celebration screens. They are retained for targeted QA,
but they are not the recommended marketing dataset and do not cover every achievement
added since their creation.
