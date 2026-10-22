# Visual Regression Testing POC

Percy 類似的視覺迴歸測試，兩天內做完。用 Playwright 截圖、[`odiff`](https://github.com/dmtrKovalenko/odiff)（Rust）做 pixel diff，產出一份獨立的 HTML 報告，點 diff 區塊就能看到是哪個 DOM element 的哪個 computed style 改了。

![demo](./doc/demo.gif)

## Why

- **Percy / Chromatic 太貴**，自架一套看看能走多遠
- **「哪裡不一樣」還不夠，要知道「為什麼不一樣」** —— 一般 pixel diff 只告訴你哪塊紅了，這份 report 會告訴你是哪個 element、哪個 CSS property 從什麼變成什麼
- **Report 完全靜態** —— 沒 server、沒 DB、沒 build step，zip 起來寄 email 都行

## Getting Started

```bash
pnpm install
pnpm exec playwright install chromium   # 第一次才需要

pnpm demo:baseline                      # 截 v1 當 baseline
pnpm demo:current                       # 截 v2 當 current
pnpm vrt compare --open                 # diff 並開 report
```

接自己的專案就在 Playwright test 裡呼叫 `takeSnapshot(page, 'home')`：

```ts
import { test } from '@playwright/test';
import { takeSnapshot } from 'visual-regression-poc/src/sdk';

test('homepage', async ({ page }) => {
  await page.goto('https://app.example.com/');
  await takeSnapshot(page, 'homepage');
});
```

## How it works

- **Playwright + SDK** 截圖同時序列化 DOM（rect + 白名單的 computedStyle）
- **odiff** 做 pixel diff，BFS 把紅點聚成 bounding boxes
- **Root Cause Analysis**：拿 diff 區塊的座標去反查 DOM，挑「最深、重疊最多」的那個 element，比對它前後的 computedStyle，報告裡用 red/green diff 顯示
- **Report** 是純靜態 HTML + vanilla JS，← / → 可以在 diff 區塊之間切換

## What the report shows

- **Side-by-side baseline / current**，current 面板上可點的紅色 overlay
- **Root Cause Analysis panel**：HTML (selector + xpath) · Styles (red/green computedStyle diff) · Box Model
- ← / → 在 diff 區塊之間切換

## Architecture

```
src/
├── sdk/        Playwright hook：截圖 + 序列化 DOM
├── engine/    pixel diff + 聚類 + Root Cause 分析
├── report/    靜態 HTML 報告生成器
└── cli.ts     commander 入口
```

檔案層級的說明、how RCA works、troubleshooting 都在 [doc/ARCHITECTURE.md](doc/ARCHITECTURE.md)。

## Tech Stack

TypeScript · Playwright · odiff (Rust) · 無框架 vanilla HTML report

## Notes

- POC 範圍：單瀏覽器、單 viewport、沒做 font / Docker 渲染校正，baseline per-machine
- 完整的限制、troubleshooting、dev fixtures 在 [doc/ARCHITECTURE.md](doc/ARCHITECTURE.md)
