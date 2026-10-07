# 2026.09.15_v1 優化說明

- 以 2026.09.v07-23 為母版。
- 保留 index.html 既有欄位 ID、計算 JavaScript、localStorage 儲存鍵與 tax-config.json 讀取方式。
- 移除完整 Tailwind 編譯 CSS，改為僅包含本頁使用 utility 的精簡離線 CSS。
- 首頁標題與副標題重新撰寫，降低與參考網站的文字／視覺近似。
- 將主要區塊改為「一、輸入試算條件」「二、比較試算結果」。
- 新增 115 年度參數、離線可用、多組儲存、列印比較等工具特色標示。
- 版本號更新為 2026.09.15_v1。
- admin.html、tax-config.json、annual-presets.json、登入紀錄與 README 原樣保留。

此版屬安全型重構：優先降低前端樣式負擔與來源近似，不重寫稅務計算核心，避免造成既有計算結果或儲存資料不相容。
