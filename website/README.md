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

The page is a short sequence of the real app: a looping completion video
(`assets/complete.mp4`) and stills in `assets/screens/`. Those frames were captured from
the web build with `demo-data/streakaholic-demo-data.json` loaded, in dark mode, at a
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
