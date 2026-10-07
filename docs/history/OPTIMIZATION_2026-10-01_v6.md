# 2026.10.01_v6

## 本版更新

- GitHub Actions 年度資料檢查更新為 `actions/checkout@v7`。
- GitHub Actions Python 環境更新為 `actions/setup-python@v7`。
- Workflow 執行環境由 `ubuntu-latest` 改為固定 `ubuntu-24.04`，避免 GitHub 日後切換 `ubuntu-latest` 時造成環境差異。
- 保留 `permissions: contents: write`，年度候選資料仍可自動寫回 `data/annual-candidate.json`。
- 保留每週一台北時間 09:15 自動檢查與手動 `workflow_dispatch`。
- 不變更稅務公式、年度參數邏輯、舊儲存資料格式與列印/PDF 左資訊右計算雙欄版面。

## 版本說明

- 左側：輸入與基本資料。
- 右側：計算結果與比較。
- 列印與另存 PDF：A4 橫式、一頁優先、自動縮放。
- 年度資料：先寫入候選檔，須由管理員確認後才套用正式參數。
