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

The verbal identity above is final. **The canonical mark is chosen (2026-08-19): "logo4"** —
a circular aurora-gradient (magenta → violet → cyan → mint) flame wrapping a checkmark ring,
on a starfield texture. Source art lives in `design/logo/` and gets iterated on directly there
(files get renamed/replaced/deleted outside of any derivation script) — treat this list as a
snapshot, not a stable catalog, and re-check `ls design/logo/` before assuming a named file still
exists. Currently used by a derived asset below:
- `logo4.png` — mark on a near-white background (the original, as generated)
- `logo4-thematic.png` — mark on a full starfield/nebula background with an added glowing rim —
  the richest, most "illustration-grade" treatment, used wherever we own the whole canvas and
  nothing downstream is going to re-crop or mask it (see "Where the free-form shape is safe to
  use" below)
- `logo4-thematic-transparent.png` — an alpha cutout of the mark alone (same underlying mark
  colors as `logo4.png`'s own cutout would be — a transparent cutout only ever preserves the
  mark's own pixels, so the "thematic" background richness doesn't carry into cutout versions).
  The source for every asset that needs the free-form mark on a non-navy or variable background:
  `logo-mark.png` (Home empty state), `splash-icon.png`, and the feature graphic's icon.
- `logo4-solid.png` — a flat, single-color (white) line-art rendition of the mark on a flat color
  background, purpose-built for small sizes where the gradient/starfield detail turns to mush
- `logo4-solid-transparent.png` / `logo4-solid-white-only.png` — derived *in this repo* (not
  supplied) via flood-fill + chroma-key on `logo4-solid.png`, regenerate these two if that source
  ever changes rather than trusting stale copies. The former keeps the mark's own interior fill
  opaque (fine where only the alpha channel is read, e.g. Android's notification icon); the latter
  chroma-keys that fill out too, leaving pure white line art with nothing but the glyph itself
  opaque — needed for compositing onto a *new* background, since the interior fill would
  otherwise show through as a mismatched patch. Feeds `notification-icon.png` and
  `logo-mark-solid.png` (ShareCards' brand footer).
- `logo4-aurora-solid-white.png` — the **current app-icon source**: `logo4-solid-white-only.png`'s
  line art, centered and scaled to ~66% of canvas height, composited onto `aurora-background.png`
  (a supplied gradient/starfield plate with no mark baked in). Also the source for `favicon.png`,
  so the browser-tab icon matches the actual app icon. Regenerated **2026-08-19** after the prior
  edge-to-edge version (mark nearly filling the full 1254px canvas, off-center) clipped badly on
  real Android launchers — the mark's flame tips and ring bottom extended well past Android's
  adaptive-icon safe zone (a centered ~66dp-diameter circle within the 108dp foreground canvas;
  anything outside it is fair game for any launcher's mask, up to the most aggressive case of a
  circle tangent to all four edges). The ~66%-height/centered composition was verified against
  that worst-case full-bleed circle mask (`-compose CopyOpacity` simulation) with zero clipping.
  Regenerate the same way from `aurora-background.png` + `logo4-solid-white-only.png` if either
  changes, rather than hand-editing this file.

**App icon redesigned 2026-08-19, replacing the circular "coin + escaping flame" composition**
for `icon.png`, `adaptive-icon.png`, and the Play/App Store hi-res icons: on-device, the flame
licking out past its own circular badge got inconsistently clipped by Android's adaptive-icon
mask (which crops to a circle/squircle/rounded-square depending on launcher, independent of the
mark's own circular boundary) — an escaping element reads as broken once a *second*, unrelated
circular crop lands on top of it. `logo4-aurora-solid-white.png` avoids this entirely: it's a
complete, full-bleed square design with no element needing to escape its own shape, so any
adaptive mask just crops the square normally, the same unremarkable way every other app icon
gets cropped. Verified by simulating a circular mask directly (`magick ... -compose
CopyOpacity`) before committing to the source swap, and again after the source was updated to
add the starfield texture.

**Where the free-form shape (the flame breaking out of its own circle) is safe to use**: only
where this repo owns the entire rendered canvas and nothing external — an OS launcher mask, a
store's own listing-icon cropper — is going to re-crop or mask it afterward. That's the splash
screen, the feature graphic, and the Home empty state; it is deliberately *not* used for any of
the four release-facing icon contexts (app icon, adaptive icon, Play/App Store listing icons),
all of which now use the full-bleed `logo4-aurora-solid-white.png` instead. The About screen's
72×72 icon display intentionally also uses the real app icon (`icon.png`), not the free-form
mark, so it visually matches what the user actually sees on their home screen.

Every app icon, the Android adaptive-icon foreground/background, the web favicon, the splash
screen, the Play/App Store hi-res icons, and the feature graphic are all derived from these
files (`assets/images/icon.png`, `adaptive-icon.png`, `favicon.png`, `splash-icon.png`,
`logo-mark.png`, `logo-mark-solid.png`, `notification-icon.png`; `design/AppIcons/*`;
`design/store-assets/feature-graphic.png`) — regenerate from the `design/logo/` files above if
the mark ever changes, rather than hand-editing any derived export directly. `#01073B` is the
canonical navy brand background color (Android adaptive-icon `backgroundColor`, feature graphic
background); `#65FC7C` (the flame's own mint-green) is the accent used for tagline/accent text
against navy.

**`assets/images/notification-icon.png` stays a plain white silhouette on transparent, not the
aurora-solid treatment** — this is an Android platform constraint, not a design choice: the OS
renders every app's status-bar/notification small icon as a flat monochrome alpha mask regardless
of what color the source image actually is, so a colorful source there would just get its color
silently discarded at render time. The one lever that *does* reach the actual notification
presentation is the `expo-notifications` plugin's `color` field (`app.json`) — set to `#A110D4`
(vivid violet, sampled from the real mark), used by Android for the icon's accent backdrop/LED
color where the OS/launcher supports it. A genuinely colorful notification would need a separate
runtime *large icon* (Android's expanded-notification-body image, which does render full color) —
not built, since that's a `app/utils/notifications.ts` scheduling-code change, not an asset swap.

Not yet done: light/dark-background variants beyond what's listed above, a maskable-safe web
favicon set, and formal clear-space/minimum-size rules — revisit if the mark shows up somewhere
new that these derived assets don't already cover.
