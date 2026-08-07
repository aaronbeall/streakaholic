# Streak engine test scenarios

Mirrors every case in `streaks.test.ts`. Each day-pattern column reads
oldest → newest, one 7-character block per calendar week (`Sun Mon Tue Wed Thu Fri Sat`),
blocks separated by a space when a scenario spans multiple weeks.

**Legend**
- `-` — no completion that day
- `0` — one completion that day, for a once-per-day task (`timesPerDay=1`, the default)
- `1`–`9` — actual completion count that day, only used for a multi-rep task (`timesPerDay>=2`) — the digit is literally how many times it was completed
- `(x)` — parentheses mark the current day ("today") at the moment `calculateTaskStats` runs

For `specific_days_of_week` / `days_per_week` / `days_per_month` rows, cross-reference the
`Frequency` column against the day-of-week letters to see which columns are the actual due
days / quota-period boundaries — the pattern itself doesn't visually distinguish due vs.
non-due days.

| Scenario | Frequency | Pattern | Result |
|---|---|---|---|
| No completions ever | daily | `------(-)` | `currentStreak=0, bestStreak=0, lastStreak=0, status=never_started` |
| A partial (under-quota) day doesn't qualify; the day that meets quota does | daily, `timesPerDay=3` (yesterday: 2 reps, today: 3 reps) | `-----2(3)` | `totalCompletions=1, currentStreak=1` (only today's 3-rep day qualifies) |
| Active streak, today included | daily | `----00(0)` | `currentStreak=3, bestStreak=3, lastStreak=3, status=up_to_date` |
| Today not completed yet — not a miss until the day is over | daily | `----00(-)` | `currentStreak=2, status=expiring` |
| Old 5-day streak, a 3-day gap, then a shorter active streak | daily | `---0000 0---00(0)` | `currentStreak=3, bestStreak=5, status=up_to_date` |
| Only one due day/week (today's weekday); no data any other day, ever | `specific_days_of_week` [today's weekday only] | `-----0- -----0- -----(0)-` | `currentStreak=3, bestStreak=3, status=up_to_date` |
| Bonus (non-due) days completed, then a due-day miss resets `currentStreak` | `specific_days_of_week` [Mon,Wed,Fri] | `------0 00--0(0)-` | `currentStreak=2` (Thu+Fri, restarted after Wed's miss) · `bestStreak=3` (Sat+Sun+Mon, the run before the miss) · `status=up_to_date` |
| Same, but Tuesday is *also* completed — the tail bonus day survives the miss | `specific_days_of_week` [Mon,Wed,Fri] | `------0 000-0(0)-` | `currentStreak=2` (unchanged) · **`bestStreak=4`** (Sat+Sun+Mon+Tue — Tue still counts despite Wed's miss) |
| Bonus day completed ahead of the next due-day gate, before it's even resolved | `specific_days_of_week` [Mon,Wed,Fri] | `-----0(0)` | `currentStreak=2` (Fri+Sat, counted before Monday's gate arrives) · `status=up_to_date` |
| Quota met mid-week already keeps it alive (quota=1) | `days_per_week=1` | `------(0)` | `currentStreak=1, status=up_to_date` |
| Prior week met; current week has comfortable slack left | `days_per_week=2` | `-00---- ---(-)---` | `currentStreak=2, status=up_to_date` (Wed, 4 days left, only needs 2) |
| Needs 1 more — mid-week, plenty of slack | `days_per_week=1` | `-0----- ---(-)---` | `status=up_to_date` (Wed, 4 days left, needs only 1) |
| Needs 1 more — the week's last day, no slack | `days_per_week=1` | `-0----- ------(-)` | **`status=expiring`** (Sat, exactly 1 day left, needs 1) |
| Needs 3 more — mid-week, 1 day of slack | `days_per_week=3` | `-000--- ---(-)---` | `status=up_to_date` (Wed, 4 days left, needs 3) |
| Needs 3 more — exactly 3 days left, no slack | `days_per_week=3` | `-000--- ----(-)--` | **`status=expiring`** (Thu, exactly 3 days left, needs 3) |
| A genuinely missed week breaks the chain, but keeps its own progress in `bestStreak` | `days_per_week=2` | `-00---- -0----- -00(-)---` | `currentStreak=2` (just this week — the miss cut the chain) · `bestStreak=3` (2 met + 1 from the missed week, retained up to its own close) |
| Quota met mid-month already keeps it alive (quota=1) | `days_per_month=1` | `------(0)` | `currentStreak=1, status=up_to_date` |
| Needs 1 more — mid-month (Aug 5 of 31), plenty of slack | `days_per_month=1` (prior qualifying day shown) | prior day: `0------` · today: `---(-)---` | `status=up_to_date` |
| Needs 1 more — the month's last day (Aug 31), no slack | `days_per_month=1` (prior qualifying day shown) | prior day: `0------` · today: `-(-)-----` | **`status=expiring`** |
