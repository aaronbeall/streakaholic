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

Merging to `main` publishes this folder to GitHub Pages at <https://streakaholic.app>
(`.github/workflows/website.yml`). Every pull request that touches `website/` gets a
preview at `https://streakaholic.app/pr-preview/pr-<number>/`, linked in a PR comment
(`.github/workflows/website-preview.yml`). There's nothing to build.

## Pages for Google Play

Play Console asks for these URLs. Keep them live and up to date:

- Privacy policy: <https://streakaholic.app/privacy/>
- Data deletion: <https://streakaholic.app/delete-data/>
- Support / contact: <https://streakaholic.app/support/>
- Terms of service: <https://streakaholic.app/terms/>

If the app or the site starts handling data differently (sync, analytics, a new email
tool), update `privacy/` and `delete-data/` and the Play Data safety form together.

## Current state

The app isn't published yet (see `RELEASE_GUIDE.md`, still pre-Closed-testing), so
there's no Play Store link to send visitors to. Early access is an EmailOctopus list.
The form is EmailOctopus's own inline embed, pasted into `#signup` in `index.html`; it
shows its success message only after EmailOctopus has accepted the address. Until the
embed is pasted in, a `mailto:` button stands in. Include the embed only once per page.
Style it (colors, font) in EmailOctopus's form editor, not here. **Swap the section for
a Play Store badge/link once the app is public**: search `#get-access` in `index.html`.

The page opens with a dark hero that keeps copy and a phone preview in one desktop
viewport, then a short sequence of the real app: six muted looping clips
(`assets/demo-*.mp4`) with poster frames in `assets/screens/`. Each clip shows the
feature that section describes — card flips + a completion celebration in the hero,
creating a habit end-to-end, streak history, calendar drill-in, streamgraph toggles,
Trophy Case. Videos only play while in view. Captured from the web build with
`demo-data/streakaholic-demo-data.json` loaded, in dark mode, at a phone-sized
viewport. Regenerate them from a fresh `npm run demo-data` when the UI changes —
don't draw mock screens on top of the product.

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
