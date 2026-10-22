# Visual Regression POC — 專案統整與投影片講稿

> **產出日期**：2026-05-03  
> **專案路徑**：`visual-regression-poc`（約兩天衝刺的 Percy-like 視覺回歸 POC）

---

## 一、統整摘要（Executive Summary）

### 1. 我們做了什麼

在時間壓縮的前提下，做了一個 **端到端可 demo 的視覺回歸測試 POC**：用 **Playwright** 截取畫面與 DOM 結構快照，用 Rust 為核心的 **odiff** 做像素級比對並產生差異區塊，再以 **Node / TypeScript** 將「像素差異」與「DOM／樣式變更」交叉分析，最後輸出 **無需伺服器、可直接開檔或用 zip 分享的靜態 HTML 報告**，並附上 **CLI**（capture / compare / approve）維持與商用產品相近的基本工作流。

### 2. 要解決的問題（Why）

視覺變更易在 QA 過程中被漏掉，或僅能靠人工肉眼比對；商用服務（如 Percy）體驗好但依賴雲端與訂閱。此 POC 驗證：**在本機與檔案系統上，能否在極短時間內做出「截圖比對 + 點選差異區塊即看根因」** 的核心體驗，作為日後內建工具或引進商用品的決策基礎。

### 3. 技術路線（How — 一句話）

**Playwright（擷取）→ odiff（像素 diff + mask）→ 區塊聚類 → DOM 座標／樣式 diff 交叉分析 → 靜態報告（Vanilla JS）**。

### 4. 核心交付物


| 類別      | 內容                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------- |
| **SDK** | `takeSnapshot(page, name)`：PNG + 含 rect / computedStyle（白名單）的 JSON                              |
| **設定**  | `vrt.config.ts`：viewports、`excludeSelectors`（截圖隱藏 + 序列化略過）、`computedStyleProps`、`diffThreshold` |
| **引擎**  | 影像 diff、連通分量聚類、xpath 對齊的 coord diff、區塊與 DOM IoU／深度排序的根因指派                                       |
| **報告**  | 左右對照、Current 側可點紅框、Root Cause Analysis（HTML／Styles／Box Model）、鍵盤 ← → 巡覽區塊                       |
| **CLI** | `vrt capture`、`vrt compare`、`vrt approve`                                                       |
| **示範**  | `demo/v1` vs `demo/v2`；`pnpm demo` 一鍵跑通                                                         |


### 5. 兩天的刻意範圍（Scope）

**納入**：單瀏覽器、單 viewport 快照、靜態報告、Percy-like 互動 RCA、fixture 發生器方便不開瀏覽器也能開發報告。  
**明確延後**：GitHub Actions、Docker 字型正規化、多 snapshot sidebar、diff slider、雲端儲存等（詳見 repo 內 `PLAN.md`）。

### 6. 關鍵取捨與決策

- **odiff-bin**：借用成熟 Rust 二進位，避免 POC 自建影像核心。  
- **無 DB／無後端**：比對結果與資產全在 `screenshots/`、`reports/` 目錄，降低維運成本。  
- **靜態 HTML + base64**：報告單檔或可攜資料夾分享；`README`／`TUTORIAL` 亦說明 IDE 預覽與企業環境對 `data:` 的限制時可改用小型靜態伺服器。  
- **xpath 嚴格配對**：實作單純；DOM 結構大改會呈現為 deleted + new，屬 POC 可接受限制。

### 7. 「根因（RCA）」邏輯（精簡版）

對 odiff 產出的每個差異區域：將影像座標對應到 CSS pixel（考量 `devicePixelRatio`），找與該區顯著重疊的 DOM 矩形，再以 **深度優先／重疊率** 選出「頭號嫌疑元素」，對照事先算好的 coord + style diff，標示為 `styled`、`shifted`、`resized`、`deleted`、`new`，或無對應屬性變更時的 `visualOnly`。

### 8. 建議對外一句話 Elevator Pitch

「兩天內我們驗證了一條可行的本機視覺回歸管線：**Playwright 採集、odiff 找像素差、再把差異對回 DOM 與計算後樣式**，產出的 HTML 報告不用架站就能分享——足以支撐我們討論是否投資正式的 CI／多瀏覽器／商用品整合。」

---

## 二、投影片講稿（可依簡報頁數拆頁）

以下假設約 **12 分鐘** 口述節奏；每段標題對應一張投影片，**粗體**為建議打在投影片上的關鍵字，其餘為口頭說明。

---

### 投影片 1｜標題頁

**標題**：Visual Regression Testing — **兩天 POC 成果**  
**副標**：Playwright × odiff × 靜態 RCA 報告

各位好，這份簡報整理我們最近約兩天完成的 **視覺回歸 POC**。目標不是取代完整商用平台，而是**快速證明技術可行性**並產出一個可以實際操作、分享的 demo。

---

### 投影片 2｜背景與目標

**動機**：UI 變更易被漏測／**人肉比對成本高**  
**POC 目標**：本機端到端：**截圖 diff + 指向性根因**

我們遇到的核心痛點是：功能測試通過後，版面、顏色、間距仍可悄悄走樣。**視覺回歸測試**就是在改動前後各截一張「黃金圖」，用程式比對差異。

這個 POC 的目標很明确：在有限時間內，做出類似 Percy **「看得到哪裡變了、還能往 DOM 追到為什麼」** 的體驗，但部署在我們能掌控的檔案與腳本上。

---

### 投影片 3｜整體管線（一張圖說清楚）

**管線**：**Playwright** → **PNG + DOM JSON** → **odiff** → **區塊分析** → **靜態 HTML**

流程上分三段：

1. **擷取**：測試裡呼叫 `takeSnapshot`，同時輸出截圖和一份結構化 DOM 資料。
2. **比對**：用 **odiff** 對 baseline 與 current 算像素差並產生 mask；我們再將像素聚類成「人類可理解的紅框區塊」。
3. **呈現**：把所有結果寫進 **一份可離線開啟的報告**，點區塊就更新下方的根因面板。

全程**不需要資料庫、不需要長駐伺服器**。

---

### 投影片 4｜我們實際交付了什麼

**交付**：**SDK**／**CLI**／**設定檔**／**Demo**／**教學文件**

具體包括：

- 測試端 **SDK**：一行程式就能存 baseline 或 current。  
- `**vrt` CLI**：統一進入 capture、compare、approve。  
- `**vrt.config.ts`**：viewport、忽略的選擇器、要比對哪些 computed style、敏感度門檻。  
- `**demo/v1` 與 `v2`** 兩版靜態頁加上 `pnpm demo` **一鍵跑完** 的腳本。  
- **README（英文深度）** 與 **TUTORIAL（中文步驟）**，方便接班人上手。

---

### 投影片 5｜開發者怎么用（現場 Demo 可走這段）

**流程**：**baseline capture** → 改程式 → **current capture** → `**vrt compare`**  
**核准**：`**vrt approve`** 升級基準線

對開發者來說，工作流很像業界常見作法：

改版前先跑 `**vrt capture --target baseline`**，改完後跑 **current**，接著 `**compare`** 出報告。若確認變更是預期的，可用 `**approve`** 把 current 升格成新的 baseline。

內建的 demo 則是先跑 v1、再跑 v2，直接看到顏色與元件上的差異出現在報告裡——適合對非技術聽眾做 **30 秒 live demo**。

---

### 投影片 6｜報告長什麼樣（UX 賣點）

**報告**：**並排圖**／**點擊紅框**／**Root Cause Analysis**／**鍵盤巡覽**

報告版面刻意對齊大家熟悉的視覺 diff 工具：

- Baseline 與 Current **並列**；Current 上有 **可多選的 diff 區塊**。  
- 下方 **Root Cause Analysis** 分三欄：**HTML 定位**（selector、XPath、一鍵複製）、**樣式差異**（紅刪綠加）、**盒模型數字**。  
- 支援 `**←`** `**→`** 在區塊間切換，方便簡報或 code review 時口述「第幾塊問題」。

重點是：**從像素回到元素與計算後樣式**，減少「只看到兩張圖不一樣但不知道該改哪個 class」的情況。

---

### 投影片 7｜根因要如何相信它？（可信度與限制）

**邏輯**：像素區 **∩** DOM 矩形→ **深度／重疊率** 排名  
**限制**：xpath 嚴格配對；**大字重排** ≠ 自動語意對齊

我們用幾何重疊與 DOM 深度去猜「最有可能負責這塊視覺的節點」，再對照 JSON 里的座標／樣式 diff 做標籤。**這不是形式驗證**，在複雜頁面上仍可能需人工複核。

也要誠實講：**DOM 結構若被整段重写**，xpath 對不起來時會落在 deleted／new 敘述，這是 POC 為換取實作速度做的取捨。

---

### 投影片 8｜噪音與穩定性

**降噪**：`**excludeSelectors`**——CSS 隱藏 + 序列化省略**  
**門檻：`**diffThreshold`**／**computedStyle 白名單**

鐘錶、輪播、動畫區我們用 **雙重保險**：截圖前把它們設成不可見，序列化時也跳過，避免既干擾像素又製造無意義 style diff。

計算後樣式若不設白名單，報告會被海量屬性淹沒；因此只追蹤我們在 `vrt.config` 裡同意的那些屬性。

---

### 投影片 9｜為什麼是「兩天 POC」取向

**刻意不做**：CI、多瀏覽器、Docker 字型鎖定、雲端儀表板…

對照原本的長期 roadmap，這兩天我們**砍掉最大的是維運與平台化**：先證明 **「比對引擎 + RCA 報告」** 值不值得。

若結論為正向，下一階段才值得談：**GitHub Action、並行視窗、baseline 治理、與設計 tokens 對齊** 等題目。

---

### 投影片 10｜風險與已知限制（給決策者的備註）

**單機 baselines**：字型／OS 可能造成微差  
**POC**：單一 Chromium、快照維度單純  

本機環境若不統一，**像素級 baselines** 可能出現環境噪声；正式上線通常會談 Docker 或用更寬鬆門檻／perceptual diff——這些在本次 POC **明確標記為後續**。

---

### 投影片 11｜建議後續路線（若要我們往產品化走）

**Next**：CI 工件／**baseline 策略**／**flake 監控**／（選配）商用整合

若是企業級 rollout，建議優先順序為：

1. **在 CI 產報告並存 artifact**，讓 MR 可追溯。
2. **baseline 核准流程**誰能做、是否要分環境。
3. **不穩定測試**與動態區的治理（繼續擴充 `excludeSelectors` 與資料屬性約定）。

若評估後傾向外購 Percy／Chromatic，本 POC **仍可保留技術評估**：我們已理解 **pixel mask 與 DOM 交叉分析** 的複雜度與上限。

---

### 投影片 12｜總結與 Q&A

**結論**：**可行**／**可 demo**／**可作為決策輸入**  
**問題**：是否要投資下一階段——**制度化與環境統一**

總結三點：

1. 管線打通，且報告 **離線可用**。
2. **RCA** 對開發者有實質幫助，但需在複雜度上升時配以流程與工程治理。
3. 接下來已不是「能不能做」，而是 **「要花多少成本做到可持續營運」**。

謝謝，歡迎提問。

---

## 附錄：口述 Demo 備忘（約 60–90 秒）

若現場有可執行環境，建議順序：

1. 「這是改動前的 v1——我們已寫進 baseline。」
2. 「改動後的 v2 寫進 current，`pnpm vrt compare`。」
3. 打開報告：指出 **diff 百分比／區塊數**。
4. 點一個 **紅框**，唸出 RCA：哪個選擇器、哪個 `backgroundColor` 從什麼變什麼。
5. 按 `**→`** 切到下一個區塊，強調「**不用自己找座標**」。

若環境無法跑 Playwright，改用 `**pnpm dev:fixtures`** 再走 compare，口頭交代「fixture 模仿典型 nav／CTA 變色案例」。

---

## 檔案與進一步閱讀（repo 內）


| 檔案                                     | 用途                   |
| -------------------------------------- | -------------------- |
| `README.md`                            | 架構、CLI、RCA 演算法細節、除錯  |
| `TUTORIAL.md`                          | 中文手把手教學              |
| `PLAN.md`                              | 兩日切割、範圍對照、mermaid 架構 |
| `vrt.config.ts`                        | 專案可調參數               |
| `src/sdk/`、`src/engine/`、`src/report/` | 實作主目錄                |
