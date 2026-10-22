# PDP Behavior E2E

This directory is the isolated entry point for the PM/QA-facing PDP behavior
testing service. The existing visual regression CLI and report engine remain
independent.

## Scaffold commands

```bash
# 適用開發時
pnpm e2e:dev
# 適用服務啟動
pnpm e2e:start
# 執行 E2E 核心單元測試
pnpm test:e2e:unit
# 執行 BrandB staging PDP preselect live test
pnpm test:e2e:pdp-preselect
```

- Scaffold 提供健康檢查端點：`GET http://127.0.0.1:4173/health`
- 可透過 `E2E_HOST` 調整監聽位址。
- 可透過 `E2E_PORT` 調整監聽連接埠。
- 測試採用「分類 → 功能 → 檢查項目」結構：
  - 商品
    - PDP Behavior
      - 頁面基本資料
      - Preselect 預設選色
      - 庫存資料一致性
      - Variant 可用狀態
      - 主要操作按鈕
      - 商品圖片 Gallery
      - 加入購物車
- 已加入 BrandB UK dev 的品牌資料模型、PDP Behavior 規則與安全 URL 驗證。
- 已加入 BrandB UK Staging：`https://brand-b.staging.example.com/uk/`
- Preselect 預設選色規則：
  - URL 有 hash 時，此項測試標示為 skipped。
  - URL 無 hash 且ｃｃｃ的 simple product。
  - URL 無 hash 且沒有 preselect 時，應渲染第一個顏色對應的 simple product。
- 以下功能將在後續里程碑逐步加入：
  - Magento 資料供應器
  - Playwright 測試執行器
  - API
  - 資料持久化
  - Web 操作介面
