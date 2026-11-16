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
there's no Play Store link to send visitors to. The primary CTA is a `mailto:` to
`support@metamodernmonkey.com` asking to join early testing. **Swap this for a real Play
Store badge/link once the app is public** — search `#get-access` in `index.html`.

No real app screenshots exist yet either (`../screenshots/` is empty, per
`STORE_LISTING.md`), so the hero uses the illustration-grade `logo4-thematic.png` mark
instead of a device mockup. Once real screenshots exist, a features/screenshot section
would likely strengthen the page more than anything else here — see `STORE_LISTING.md`'s
own 6-shot list for what to capture first.

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
