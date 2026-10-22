# 視覺回歸 POC 使用教學

本教學協助你從零開始，在專案目錄內完成：**安裝 → 產生基準線 → 產生比對版 → 開啟報告 →（選用）核准成新基準**。

專案根目錄：`visual-regression-poc`（請在該目錄下執行所有指令）。

---

## 事前需求

- **Node.js**：建議 v22 以上（專案開發時使用 v22；需支援 `node --experimental-strip-types`）
- **pnpm**：`npm install -g pnpm`
- **本機終端機**：建議在 macOS 的 **Terminal / iTerm**，或在 IDE 內建終端（能正常啟動 Playwright 瀏覽器者）。部分雲端／沙盒環境無法啟動 Chromium，請改走下方「僅用 fixtures」路徑。

---

## 第一步：安裝依賴

```bash
cd /path/to/visual-regression-poc
pnpm install
```

第一次使用 Playwright 時，需下載瀏覽器：

```bash
pnpm exec playwright install chromium
```

---

## 路徑 A：最快體驗（不需要開瀏覽器）

適合：想先看 **報告版面、紅框點擊、Root Cause Analysis（樣式差異）**，或環境無法跑 Playwright。

```bash
pnpm dev:fixtures             # 寫入 screenshots/baseline 與 screenshots/current
pnpm vrt compare --open       # 比對並試著用系統預設程式開啟報告
```

或一鍵：

```bash
pnpm dev:fixtures:compare
```

完成後到 `reports/` 底下找最新時間戳資料夾，開啟其中的 **`index.html`**（若 `--open` 沒反應可手動雙擊開啟）。

---

## 路徑 B：完整流程（Playwright 真實截圖）

專案已附 `demo/v1` 與 `demo/v2` 兩個靜態頁，測試會依環境變數決定開哪一版。

### 1. 擷取「基準線」baseline（v1）

```bash
pnpm demo:baseline
```

等同於設定 `VRT_TARGET=baseline`、`VRT_DEMO_VERSION=v1` 後跑 Playwright。輸出會在：

- `screenshots/baseline/home-1280x720.png`
- `screenshots/baseline/home-1280x720.json`

### 2. 擷取「目前版」current（v2）

```bash
pnpm demo:current
```

輸出在 `screenshots/current/` 同上檔名。

### 3. 比對並開報告

```bash
pnpm vrt compare --open
```

或一鍵連跑三步（baseline → current → compare）：

```bash
pnpm demo
```

### 4. 報告裡你可以做什麼

- **左右並列**：Baseline 與 Current。
- **Current 上的紅框**：每個區塊代表像素差異聚合後的一塊；點一下可切換下方 RCA。
- **Root Cause Analysis**：  
  - HTML：selector / XPath、複製 XPath  
  - Styles：computedStyle 變更（紅刪綠加）  
  - Box Model：位置與寬高  
- **鍵盤**：`←` `→` 在同一張圖的多個紅框間切換。

---

## 套用在你自己的頁面

1. 複製或改寫 [`demo/tests/snapshot.spec.ts`](demo/tests/snapshot.spec.ts)，讓測試開啟你的 URL 或本機 server，然後呼叫：

   ```ts
   import { takeSnapshot } from '../../src/sdk/index.ts';
   await takeSnapshot(page, '我的畫面名稱');
   ```

2. 檔名規則：`screenshots/<baseline|current>/<名稱>-<寬>x<高>.png|.json`。  
   名稱與 viewport 需與 [`vrt.config.ts`](vrt.config.ts) 的 `viewports` 一致（預設一組 `1280x720`）。

3. 流程仍為：

   ```bash
   pnpm vrt capture --target baseline   # 改動前
   # …修改程式…
   pnpm vrt capture --target current    # 改動後
   pnpm vrt compare --open
   ```

---

## CLI 指令一覽

| 指令 | 說明 |
|------|------|
| `pnpm vrt capture --target baseline` | 跑 Playwright，`VRT_TARGET=baseline`，結果寫入 `screenshots/baseline/` |
| `pnpm vrt capture --target current` | 同上，`current/` |
| `pnpm vrt compare` | 比對兩資料夾內同名 snapshot，輸出到 `reports/<時間戳>/` |
| `pnpm vrt compare --open` | 同上，並嘗試用系統指令開 `index.html` |
| `pnpm vrt approve` | 將 `screenshots/current/` 複製覆蓋到 `baseline/`（會詢問確認） |
| `pnpm vrt approve --yes` | 不詢問，直接覆蓋 |
| `pnpm vrt approve home` | 只覆蓋檔名前綴為 `home-` 的檔案 |

---

## 設定檔：[`vrt.config.ts`](vrt.config.ts)

- **`viewports`**：每個視窗尺寸會各自產一組 PNG/JSON（檔名帶 `-寬x高`）。
- **`excludeSelectors`**：截圖前會注入 `visibility:hidden`，且 DOM 序列化時會跳過這些節點（避免時鐘、輪播等動態區塊干擾）。
- **`computedStyleProps`**：只記錄這些 CSS 屬性，報告 RCA 才不會噪音過多。
- **`diffThreshold`**：傳給 odiff，數值越小越敏感（細節見 README）。

---

## 常見問題

### 1. `pnpm vrt` 或 `tsx` 報錯

若 `pnpm vrt`（內部用 `tsx`）在環境無法運作，可改用 Node 原生執行（需 Node 支援 `--experimental-strip-types`）：

```bash
node --experimental-strip-types --no-warnings src/cli.ts compare --open
```

### 2. Playwright 找不到 Chromium

執行：

```bash
pnpm exec playwright install chromium
```

### 3. 訊息提到 `chrome-mac-x64` 但你是 Apple Silicon

少數環境 `os.cpus()` 回傳空陣列，Playwright 可能誤判平台。可設：

```bash
export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=mac15-arm64
```

（版本字串請依你 macOS 主版本調整，詳見專案 [`README.md`](README.md) 的 Troubleshooting。）

### 4. 比對結果永遠 0% diff

代表 `baseline` 與 `current` 的圖與 DOM 快照相同。確認是否兩次 capture 都指向同一版頁面，或是否剛執行過 `vrt approve` 把 current 覆蓋進 baseline。

### 5. 報告打開是空白或沒有圖（`<img>` 破圖）

`index.html` 內嵌的 JSON 會把 Baseline / Current / Diff 三張圖以 **data URL（base64）** 寫入，在 **Cursor / VS Code「簡易瀏覽器」預覽** 或 **`file://`** 下都應能正常顯示（舊版只靠相對路徑 `images/...` 時，在 IDE 預覽常會被擋）。

若仍破圖，請確認已用最新程式重新產生報告：`pnpm vrt compare`。同資料夾內的 **`data.json` 仍使用相對路徑** `images/...`，給自動化或除錯用；視覺瀏覽請以 `index.html` 為準。

若你是在公司內過濾巨量 HTML ／關閉 `data:` 圖片的環境開啟，請改用 **`pnpm exec serve reports/<時間戳資料夾>`** 等靜態伺服器並改載入不含 base64 的變體——若你需要這種輸出模式可再向我們追加選項。

---

## 建議學習順序

1. 跑 **路徑 A**（fixtures）→ 熟悉報告與 RCA。  
2. 跑 **路徑 B**（demo v1/v2）→ 確認 Playwright 與真實截圖。  
3. 改寫測試接上你的專案 → 建立團隊自己的 baseline 節奏。

若與 [`PLAN.md`](PLAN.md) 裡的長期路線圖（多瀏覽器、CI、Docker 等）相比，本 POC 刻意維持可在兩天內 demo 的範圍；擴充時可再從 PLAN 勾選下一階段項目。

---

## 相關檔案

| 檔案 | 用途 |
|------|------|
| [`README.md`](README.md) | 架構說明、技術細節、限制 |
| [`PLAN.md`](PLAN.md) | 原始開發計畫與擴充方向 |
| [`vrt.config.ts`](vrt.config.ts) | 視窗、忽略選擇器、diff 門檻 |
| [`src/sdk/index.ts`](src/sdk/index.ts) | `takeSnapshot` API |
| [`src/engine/`](src/engine/) | odiff、區塊聚類、DOM 比對、交叉分析 |
| [`src/report/template/`](src/report/template/) | 靜態報告版面與互動脚本 |
