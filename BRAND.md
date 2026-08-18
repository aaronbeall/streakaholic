# Streakaholic Brand and Voice Guide

This is the source of truth for Streakaholic's name, positioning, product language,
store copy, and in-app voice. Reuse the constants in `app/constants/brand.ts` on branded
product surfaces instead of creating close-but-different versions.

## Core identity

- **Name:** Streakaholic
- **Tagline:** Build streaks worth celebrating.
- **Category:** A playful, private habit & streak tracker.
- **One-liner:** Streakaholic is a playful, privacy-first habit tracker that keeps you
  motivated with satisfying streaks, celebrations, and achievements—while your data
  stays on your device and under your control.
- **Play Store short description:** Build habit streaks worth celebrating. Private by
  design, no account needed.

The tagline is the emotional promise, not a feature inventory. Lead with streaks and
celebration; use privacy to build trust immediately afterward.

## Message pillars

1. **Keep the streak alive.** Flexible schedules and clear progress make consistency
   visible and motivating.
2. **Celebrate every milestone.** Satisfying feedback and collectible achievements make
   progress feel good without turning life into a complicated game.
3. **Own your data.** Habits stay on the device, require no account, and can be exported
   by the user.

## Voice

Streakaholic is upbeat, clear, and encouraging. It celebrates effort without shaming a
missed day or sounding obsessed with productivity.

- Lead with what the user can do or what happened: “Choose days,” “Streak started,” and
  “Nothing tracked for this day.”
- Prefer familiar words and short sentences. Explain unusual streak rules in plain
  English where the user encounters them.
- Celebrate specifically. “You reached a 10-day streak” is stronger than generic praise.
- Make recovery inviting: “Start fresh” rather than “You failed.”
- Use contractions when they sound natural.
- Use sentence case for screen titles, section headings, buttons, and settings labels.
- Keep established feature names such as “Trophy Case” capitalized when used as names.
- Use an em dash (`—`) rather than double hyphens for a pause.
- Avoid guilt, threats, pressure, or addiction jokes. The name is playful; the product
  should still respect the user.

## Product terminology

Internal code may continue to use `Task`, `Frequency`, `Nag`, and other implementation
names. User-facing copy should use the terms below.

| Prefer | Avoid in the UI | Notes |
|---|---|---|
| Habit | Task | “Task” is an internal model name. |
| Schedule | Frequency | Ask when the habit should happen. |
| Reminders | Nag level | Describe the behavior without judging the user. |
| Until done | Persist | For a reminder that remains visible. |
| Choose days | Select specific days | Use a direct, familiar action. |
| Completion rate | Rate | Keep the meaning visible. |
| Days tracked | Total days | Make the measurement explicit. |
| Weekly average | Per week | Label the calculation, not only its unit. |
| Progress over time | Completions over time | Friendlier chart title. |
| Running total / each period | Cumulative / per-period | Use these in help and accessibility copy. |
| Stats | Analytics | “Stats” is shorter and already established in the app. |
| Completions / Total completions | Habit day(s) / Days completed | “Habit day” is ambiguous — a scheduled day, or a completed one? And in an aggregate, multi-habit context, does “7 habit days” mean 7 days of activity across any habits, or one day where 7 habits were each done? “Completions” has no such ambiguity: it always means individual completed-habit events, however they’re distributed across days or habits. |

“Completion” is fine describing a single instance (e.g. “mark a completion”). For a count,
prefer “Completions” or “Total completions” over “days completed” — see the table row above.

## Privacy language

Current claims may say: no account, no sign-in, data stored on the device, no sale of
user data, and user-controlled export. Do not imply cloud sync or cross-device backup.
If optional sync or analytics is added later, review every privacy claim in the app,
store listing, website, and this guide before release.

## Visual identity status

The verbal identity above is final. The canonical logo/app-icon variant is still an MMP
decision; see `TODO.md`. Once chosen, add exact asset paths, clear-space guidance, color
variants, and small-size usage rules here.
