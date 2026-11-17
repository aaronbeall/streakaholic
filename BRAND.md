# Streakaholic Brand and Voice Guide

This is the source of truth for Streakaholic's name, positioning, product language,
store copy, and in-app voice. Reuse the constants in `app/constants/brand.ts` on branded
product surfaces instead of creating close-but-different versions.

## Core identity

- **Name:** Streakaholic
- **Tagline:** Build streaks worth celebrating.
- **Category:** A playful, private habit & streak tracker.
- **One-liner:** Streakaholic is a playful, privacy-first habit tracker that keeps you
  motivated and forming good habits with satisfying streaks, celebrations, and achievements—while your data
  stays on your device and under your control.
- **Play Store short description:** Build habit streaks worth celebrating. Private by
  design, no account needed.

The tagline is the emotional promise, not a feature inventory. Lead with streaks and
celebration; use privacy to build trust immediately afterward.

## Message pillars

1. **Keep the streak alive.** Flexible schedules and clear progress make daily
   consistency visible and motivating—the repetition that actually builds a habit.
2. **Celebrate every milestone.** Satisfying feedback and collectible achievements make
   progress feel good and reinforce the habit, without turning life into a complicated
   game.
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

The verbal identity above is final. **The canonical mark (2026-11-16) is "logo4-centered"**
(`design/logo/logo4-centered.png`, plus `-transparent.png`). It's the logo4 shape (a checkmark
inside a ring, inside a disc, with a flame breaking out of the top-right) redrawn so the check
ring is concentric with the disc, and filled with logo3's flat gradient: amber `#FCB90F` →
orange `#FD7F02` → red `#FC3041` → pink `#F7215E` → magenta `#D1169B` → violet `#4E2EF6`,
running top to bottom at a slight angle (~79°). It has no texture or starfield. The older
aurora "logo4" files in `design/logo/` are history and nothing in the app or website uses them.

`design/logo/branding/` holds the approved derived set:
- `mark-color-*`: the full-color mark on white, cream, ink (`#141022`), navy and transparent.
- `mark-white-*`, `mark-ink-*`, `mark-flat-pink-*`: one-color versions (white on the gradient,
  white on ink, ink on white, flat pink on white, white and ink on transparent).
- `appicon-*`: full-bleed square app icons. The mark's circle is dead-center at 60% of the
  canvas, and the flames trail up and to the right, so they may be cropped by the edge or by a
  launcher mask. That's intended. The circle stays inside Android's adaptive-icon safe zone.
- `adaptive-foreground-*`: transparent foregrounds for Android's 108dp adaptive canvas (circle
  at 40% of the canvas, so it lands at the same visual size once the launcher crops to the
  center 72dp).
- `favicon-*`: the full mark at 16 to 512px, on the gradient square, and a simplified 16px
  version (gradient circle and check only, no flame) for the smallest sizes.

Where each is used:
- App icon (`assets/images/icon.png`, `design/AppIcons/*`), the website's `favicon-192.png` and
  `apple-touch-icon.png`, and the site header's `mark-square.png`: white mark on the gradient.
- Android adaptive icon: `adaptive-icon.png` (white foreground) on
  `adaptive-icon-background.png` (the gradient), plus `adaptive-icon-monochrome.png` for
  Android 13+ themed icons.
- Splash, the Home empty state and the About screen (`splash-icon.png`, `logo-mark.png`): the
  full-color mark on transparent. It reads on both the white and black splash backgrounds.
- Share cards' brand footer (`logo-mark-solid.png`) and the notification small icon: the white
  silhouette. Android flattens the notification icon to a one-color mask anyway. The
  notification accent color (`expo-notifications` `color`) and the adaptive-icon fallback
  `backgroundColor` are the gradient's pink, `#F7215E`.
- Web favicons (`assets/images/favicon.png`, `website/assets/favicon-32.png`): the full-color
  mark on transparent.
- Feature graphic and the website's `og-image.png`: the full-color mark, the white
  "Streakaholic" wordmark and an amber tagline on navy `#01073B`.

Regenerate derived files from the canonical mark rather than hand-editing exports.
