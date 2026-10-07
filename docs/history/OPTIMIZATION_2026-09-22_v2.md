# 2026.09.22_v2 模組化重構說明

本版以 2026.09.15_v1 安全型優化版為母版，進行第二階段結構重構。

## JavaScript 拆分

- `js/config.js`：年度參數與 `tax-config.json` 載入。
- `js/format.js`：金額、百分比與輸入格式。
- `js/deductions.js`：特別扣除額欄位、上限與資格檢核。
- `js/tax-engine.js`：累進稅率、股利二擇一、營所稅核心公式。
- `js/custom-fields.js`：後台自訂版面與自訂計算欄位。
- `js/calculator.js`：輸入收集、商號／公司情境比較、結果渲染。
- `js/storage.js`：多組儲存、載入、歸零與舊版相容。
- `js/print.js`：自適應列印。
- `js/app.js`：頁面啟動與事件綁定。

## 相容性

- 保留主要輸入與結果元素 ID。
- 保留既有 localStorage 儲存鍵與舊版 `business-share` 相容轉換。
- `tax-config.json`、`annual-presets.json`、`admin.html` 架構仍可沿用。

## 結果區

結果區新增三張摘要卡：商號組織、公司組織、總稅負差額。原詳細計算表改放在「詳細計算內容」區塊，列印時仍會完整呈現。

## 文案與結構

前台標題、說明與結果資訊層級已重新設計，不再沿用原參考網站的行銷文案。
