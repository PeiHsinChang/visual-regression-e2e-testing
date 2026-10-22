# PDP Preselect 邏輯

## 適用情境

以 BrandB PDP 為例，當使用者進入商品頁，而且 URL 沒有帶 `#` 指定商品顏色時，系統必須決定預設顯示哪一個 simple product。

## 商業邏輯

1. 系統先檢查該商品是否設定了 `preselect` 值。
2. 如果有設定 `preselect`：
   - 找出 `preselect` 對應的 simple product。
   - 將該 simple product 設為預設選項。
   - 使用該 simple product 的商品資料渲染頁面。
3. 如果沒有設定 `preselect`：
   - 取得商品顏色清單中的第一個顏色。
   - 找出該顏色對應的 simple product。
   - 將該 simple product 設為預設選項。
   - 使用該 simple product 的商品資料渲染頁面。

## 邏輯流程

```text
PDP URL 沒有 #
  ├── 有 preselect → 顯示 preselect 對應的 simple product
  └── 無 preselect → 顯示第一個顏色對應的 simple product
```

## 測試規格

當 PDP URL 未帶有 `#` 顏色參數時，系統應優先使用商品設定的 `preselect` 值，選擇並渲染對應的 simple product；若商品未設定 `preselect`，則應選擇第一個顏色，並渲染該顏色對應的 simple product。

## 預期驗證項目

- 頁面選中的顏色符合預期。
- 頁面選中的 configurable option values 符合預期。
- 實際渲染的 simple product ID 符合預期。
- 頁面顯示的 simple product SKU 符合預期。

URL 已帶有 `#` 顏色參數時，不屬於本規格的驗證範圍。
