# Architecture

這份文件是 README 的技術補充 —— 檔案層級的職責、Root Cause Analysis 怎麼運作、CLI / Config 細節、troubleshooting、以及 dev fixtures。

## Pipeline overview

```
┌─────────────┐    ┌──────────────┐    ┌────────────────┐
│  Playwright │───▶│  odiff (Rust)│───▶│ Static HTML    │
│  + DOM JSON │    │  + clustering│    │ Report (vanilla│
│             │    │  + DOM diff  │    │  JS, no server)│
└─────────────┘    └──────────────┘    └────────────────┘
```

## 檔案結構

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

## CLI

| Command | Description |
| --- | --- |
| `vrt capture --target <baseline\|current>` | Run Playwright tests with `VRT_TARGET` set; SDK writes to `screenshots/<target>/`. |
| `vrt compare [--open]` | Diff baseline ↔ current and write a self-contained report to `reports/<timestamp>/index.html`. |
| `vrt approve [name] [-y]` | Copy `screenshots/current/*` into `screenshots/baseline/`. Optional `name` filters by snapshot name. |

接自己專案時，baseline / current 分別跑一次：

```bash
VRT_TARGET=baseline pnpm exec playwright test   # 改動前
VRT_TARGET=current  pnpm exec playwright test   # 改動後
pnpm vrt compare --open
```

## Configuration (`vrt.config.ts`)

```ts
export default {
  viewports: [{ width: 1280, height: 720 }],
  excludeSelectors: ['#clock', '.carousel', '[data-vrt-ignore]'],
  computedStyleProps: ['backgroundColor', 'color', 'fontSize', /* ... */],
  diffThreshold: 0.1,
};
```

- **`excludeSelectors`** 雙重保護：capture 時注入 `visibility: hidden` CSS，DOM 序列化階段也會跳過。carousel / clock / `[data-vrt-ignore]` 不可能污染 diff。
- **`computedStyleProps`** 是白名單：只有這些 property 會被追蹤，也只有這些會出現在 Root Cause Analysis panel。

## Report 內容

1. **Side-by-side baseline / current** — current panel 上疊可點的紅色 overlay
2. **Root Cause Analysis panel**（三欄）：
   - **HTML**：CSS selector + XPath + Copy button
   - **Styles**：computedStyle 的 red/green diff（`backgroundColor: rgb(245,247,250)` → `rgb(253,246,238)`）
   - **Box Model**：x / y / width / height
3. **Keyboard navigation**：← / → 在 diff 區塊之間切換

Report 完全靜態，直接開 `reports/<timestamp>/index.html` 就能看，zip 起來寄 email 也行。

## How "root cause" works

對每個 odiff 偵測到的 diff region：

1. 用捕捉當下的 `devicePixelRatio` 把 region 從 image pixel 轉成 CSS pixel
2. 找所有 `getBoundingClientRect` 跟 region 重疊 ≥ 10% 的 element（或自身面積 ≥ 50% 落在 region 內）
3. 按 **depth desc** 再按 overlap-over-element-area 排序 —— 最深、重疊最緊的 element 勝出
4. 用勝出 element 的 xpath 查預先算好的 coord+style diff：
   - 有 computedStyle 改 → 標記 `styled`
   - 否則 → `shifted` / `resized` / `deleted` / `new`
   - pixel 改了但沒有被追蹤的 property 改 → `visualOnly`

## Limitations（POC scope）

- 一個 snapshot name 一次只支援單瀏覽器、單 viewport
- 沒做 font / Docker 渲染校正 —— baseline per-machine
- `xpath` 用嚴格 match 做 cross-build pairing，結構重寫的 element 會被歸到 `deleted + new`
- 沒有多 snapshot sidebar（report template 支援 tabs 但 demo 只出一個）
- 沒 GitHub Action、沒 diff slider、沒 auth —— 看 [PLAN.md](PLAN.md) 的 deferred list

## Troubleshooting

**Baseline 和 Current 在 report 裡看起來一樣。** Viewer 用不同 JSON 欄位（`baselineImage` vs `currentImage`）；如果看起來一樣就是 PNG 真的一樣。看 tab label 跟 `data.json`：`diffPercent: 0` + `regions: []` 代表 odiff 沒找到超過 `diffThreshold` 的像素差。驗證輸入是否真的不同：

```bash
shasum -a 256 screenshots/baseline/*.png screenshots/current/*.png
```

Hash 一樣就是兩次 capture 內容相同（例如同樣的 page state，或 `VRT_DEMO_VERSION` 設成一樣）。內建 demo 要 **v1 進 baseline、v2 進 current**：跑 `pnpm demo:baseline` 再 `pnpm demo:current`（或一次 `pnpm demo`），不要跑兩次預設都 v1 的 `vrt capture`。

**`os.cpus()` 回傳 `[]`，Playwright 抱怨 `chrome-mac-x64`**：某些 sandboxed shell（含 CI runner）的 `os.cpus()` 會空，Playwright 就 fallback 到 x64 路徑。設 `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=mac15-arm64`（或你實際的 platform）繞過。

**`pngjs` "Unexpected end of input"**：你的 `odiff-bin@3.x` 沒輸出 IEND chunk，升到 `odiff-bin@^4.0.0`。

## Dev / fixtures

想迭代 engine 或 report UI 又不想開 Playwright：

```bash
pnpm dev:fixtures              # 寫出 baseline/current 的 PNG + JSON 合成資料
pnpm dev:fixtures:compare      # 連同 compare 一起跑並開 report
```

這會重現原本 Percy mock 的截圖 —— purple-nav vs red-nav、blue-CTA vs red-CTA —— 完全不用啟瀏覽器。
