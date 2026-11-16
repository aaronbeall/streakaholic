# Streakaholic marketing website

A single-page, static marketing site — plain HTML/CSS/JS, no build step, no framework.
Lives in this subdirectory alongside the Expo app rather than in its own repo, so brand
assets and copy can be pulled straight from [`BRAND.md`](../BRAND.md),
[`STORE_LISTING.md`](../STORE_LISTING.md), and `../design/logo/` without duplicating them
across repos. It doesn't participate in the app's build at all — Metro/Expo never sees
this directory.

## Preview locally

```bash
cd website
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## Deploy

Point any static host (Vercel, Netlify, GitHub Pages, Cloudflare Pages) at this
`website/` directory as its project root — there's nothing to build. The domain
`streakaholic.app` is the one referenced in [`MARKETING.md`](../MARKETING.md).

## Current state

The app isn't published yet (see `RELEASE_GUIDE.md` — still pre-Closed-testing), so
there's no Play Store link to send visitors to. Early access is an on-page email form
that posts to [FormSubmit](https://formsubmit.co) and lands in
`support@metamodernmonkey.com`. The first submission from a new hosting domain asks that
inbox to confirm once; after that, each signup arrives as a normal email. A `mailto:`
fallback stays under the form. **Swap the form for a Play Store badge/link once the app
is public** — search `#get-access` in `index.html`.

The page is a short sequence of the real app: six muted looping clips
(`assets/demo-*.mp4`) with poster frames in `assets/screens/`. Each clip shows the
feature that section describes — card flips + a completion celebration in the hero,
create-habit options, streaks, calendar, streamgraph, Trophy Case. Captured from the
web build with `demo-data/streakaholic-demo-data.json` loaded, in dark mode, at a
phone-sized viewport. Regenerate them from a fresh `npm run demo-data` when the UI
changes — don't draw mock screens on top of the product.

## Content source of truth

Don't let copy drift — when brand language changes, update the source doc first, then
re-sync this page:

- Positioning, tagline, message pillars → [`BRAND.md`](../BRAND.md)
- Feature bullets, privacy language → [`STORE_LISTING.md`](../STORE_LISTING.md)
- Colors, mark files → [`BRAND.md`](../BRAND.md)'s "Visual identity status" +
  `../design/logo/`

## Assets

`assets/` holds web-sized exports (favicons, the hero mark, an Open Graph image) baked
from `../design/logo/` and `../design/store-assets/`. Regenerate them from those sources
if the canonical mark changes — don't hand-edit anything in here directly.
