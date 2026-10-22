# Visual Regression Testing POC

Percy-like visual regression testing in two days. Captures DOM snapshots
with Playwright, pixel-diffs with [`odiff`](https://github.com/dmtrKovalenko/odiff)
(Rust-powered), and produces a self-contained HTML report that highlights
diff regions and pinpoints which DOM element + computed style changed.

```
┌─────────────┐    ┌──────────────┐    ┌───────────────┐
│  Playwright │───▶│  odiff (Rust)│───▶│ Static HTML   │
│  + DOM JSON │    │  + clustering│    │ Report (vanilla│
│             │    │  + DOM diff  │    │  JS, no server)│
└─────────────┘    └──────────────┘    └───────────────┘
```

## Quick start

```bash
pnpm install
pnpm exec playwright install chromium       # first-time only
pnpm demo:baseline                          # capture v1 as baseline
pnpm demo:current                           # capture v2 as current
pnpm vrt compare --open                     # diff and open report
pnpm vrt approve                            # promote current → baseline
```

The `demo:*` scripts above wrap [`demo/v1`](demo/v1) and [`demo/v2`](demo/v2)
to give you a one-command end-to-end run. For your own project, replace the
demo test with a `takeSnapshot(page, 'home')` call inside any Playwright
test.

## Using the SDK in your tests

```ts
import { test } from '@playwright/test';
import { takeSnapshot } from 'visual-regression-poc/src/sdk';

test('homepage', async ({ page }) => {
  await page.goto('https://app.example.com/');
  await takeSnapshot(page, 'homepage');
});
```

Then run:

```bash
VRT_TARGET=baseline pnpm exec playwright test  # before the change
VRT_TARGET=current  pnpm exec playwright test  # after the change
pnpm vrt compare --open
```

## CLI

| Command | Description |
| --- | --- |
| `vrt capture --target <baseline\|current>` | Run Playwright tests with `VRT_TARGET` set; SDK writes to `screenshots/<target>/`. |
| `vrt compare [--open]` | Diff baseline ↔ current and write a self-contained report to `reports/<timestamp>/index.html`. |
| `vrt approve [name] [-y]` | Copy `screenshots/current/*` into `screenshots/baseline/`. Optional `name` filters by snapshot name. |

## Configuration ([`vrt.config.ts`](vrt.config.ts))

```ts
export default {
  viewports: [{ width: 1280, height: 720 }],
  excludeSelectors: ['#clock', '.carousel', '[data-vrt-ignore]'],
  computedStyleProps: ['backgroundColor', 'color', 'fontSize', /* ... */],
  diffThreshold: 0.1,
};
```

- **`excludeSelectors`** are double-protected: hidden via `visibility: hidden`
  CSS injection at capture time _and_ skipped during DOM serialization, so
  carousels, clocks, or `[data-vrt-ignore]` regions can't ever fail a diff.
- **`computedStyleProps`** is a whitelist; only these properties are tracked
  and shown in the Root Cause Analysis panel.

## What the report shows

1. **Side-by-side baseline / current** — the current panel has clickable
   red overlays on every diff region.
2. **Root Cause Analysis panel** — three columns:
   - **HTML**: CSS selector + XPath + Copy button
   - **Styles**: red/green diff of computedStyle properties
     (`backgroundColor: rgb(245,247,250)` → `rgb(253,246,238)`)
   - **Box Model**: x / y / width / height
3. **Keyboard navigation**: ← / → cycles through diff regions.

The report is fully static (no server, no DB, no build step). Open
`reports/<timestamp>/index.html` directly in any browser, or zip the folder
and email it.

## Architecture

```
src/
├── cli.ts                       commander entry point
├── sdk/
│   ├── index.ts                 takeSnapshot(page, name)
│   └── serializeDom.ts          browser-injected: rect + computedStyle
├── engine/
│   ├── compare.ts               orchestrator
│   ├── imageDiff.ts             odiff-bin wrapper, returns diff mask
│   ├── regionCluster.ts         BFS connected components → bounding boxes
│   ├── coordDiff.ts             xpath-aligned shifted/resized/styled/deleted/new
│   ├── crossAnalysis.ts         IoU-pick the deepest overlapping element
│   └── types.ts
├── report/
│   ├── generate.ts              string-template HTML generator
│   └── template/
│       ├── index.html
│       ├── viewer.js            click → RCA panel
│       └── viewer.css
└── dev/
    └── makeFixtures.ts          synthetic snapshots for engine smoke testing

screenshots/                     ← capture output, content-addressed by name+viewport
reports/                         ← compare output, one folder per build
```

## How "root cause" works

For each diff region detected by odiff:

1. Convert the region (image-pixel coords) to CSS-pixel coords via the
   captured `devicePixelRatio`.
2. Find every DOM element whose `getBoundingClientRect` overlaps the region
   by ≥ 10% of region area (or whose own area is ≥ 50% inside the region).
3. Rank by **depth desc**, then by overlap-over-element-area — the deepest
   tightly-overlapping element wins.
4. Look up the winning element's xpath in the precomputed coord+style diff.
   Show the user `styled` if any computedStyle changed, otherwise
   `shifted`/`resized`/`deleted`/`new`. Pixel-only diffs (no tracked
   property changed) are flagged `visualOnly`.

## Limitations / explicit non-goals (POC scope)

- Single browser, single viewport at a time per snapshot name.
- No font / Docker rendering normalization — diff baselines per-machine.
- `xpath` strict-match for cross-build pairing; structural rewrites fall
  through as "deleted + new".
- No multi-snapshot sidebar (the report supports them via tabs but the demo
  only ships one).
- No GitHub Action, no diff slider, no auth — see PLAN.md for the deferred list.

## Troubleshooting

**Baseline and Current look identical in the report.** The viewer uses
different JSON fields for each panel (`baselineImage` vs `currentImage`); if
they look the same, the PNGs are effectively the same for this run. Check the
tab label and `data.json`: `diffPercent: 0` and `regions: []` means odiff found
no pixel differences above [`diffThreshold`](vrt.config.ts). Verify the inputs
are really different:

```bash
shasum -a 256 screenshots/baseline/*.png screenshots/current/*.png
```

If hashes match, both captures were the same (e.g. same page state, or the same
`VRT_DEMO_VERSION` twice). For the built-in demo, **v1 must go to baseline and
v2 to current**: run `pnpm demo:baseline` then `pnpm demo:current` (or
`pnpm demo` once), not two generic `vrt capture` runs that both default to v1.

**`os.cpus()` returns `[]` and Playwright complains about
`chrome-mac-x64`**: some sandboxed shells (incl. CI runners) report empty
`os.cpus()`, so Playwright falls back to x64 paths. Set
`PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=mac15-arm64` (or your true platform) to
work around it.

**`pngjs` "Unexpected end of input"**: you have `odiff-bin@3.x` which
omits the IEND chunk. Upgrade to `odiff-bin@^4.0.0`.

## Dev / fixtures

If you want to iterate on the engine or the report UI without spinning up
Playwright, use the synthetic fixture generator:

```bash
pnpm dev:fixtures              # writes baseline/current PNG + JSON pairs
pnpm dev:fixtures:compare      # also runs compare and opens the report
```

This reproduces the screenshot in the original Percy mock — purple-nav vs
red-nav, blue-CTA vs red-CTA — without ever launching a browser.
