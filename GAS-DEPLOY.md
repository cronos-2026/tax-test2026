# Google Apps Script 後端部署（v21）

前端部署在 GitHub Pages。Apps Script Web App 負責管理員登入驗證、參數發布與登入紀錄寫入；GitHub Token 與管理員密碼只放在 Script Properties，不放入前端或版本控制。後端原始碼為 `gas/Code.gs`，部署設定為 `gas/appsscript.json`。

## Script Properties

| 名稱 | 說明 |
| --- | --- |
| `GITHUB_TOKEN` | Fine-grained PAT，僅授權本儲存庫 `cronos-2026/tax-test2026`，權限 `Contents: Read and write`（`Metadata: Read-only` 保持預設）。若沿用舊儲存庫的 Token，必須在 GitHub 重新設定其可存取的儲存庫。 |
| `ADMIN_USERNAME`、`ADMIN_PASSWORD_HASH` | 主要管理員。雜湊值由 `migratePasswordsToHash` 產生，不要手寫。 |
| `SECONDARY_ADMIN_USERNAME`、`SECONDARY_ADMIN_PASSWORD_HASH` | 次要管理員：可發布參數、查看登入紀錄；不能刪除登入紀錄、不能新增管理員。 |
| `ADMIN_PASSWORD`、`SECONDARY_ADMIN_PASSWORD` | **僅用於設定或更換密碼的暫存屬性**，執行遷移後會被自動刪除。 |

### 設定或更換密碼（含 v20 → v21 升級）
1. 在「專案設定 → 指令碼屬性」把新密碼填入 `ADMIN_PASSWORD`（及 `SECONDARY_ADMIN_PASSWORD`），必須是個人專用的強密碼。
2. 在 Apps Script 編輯器選取函式 `migratePasswordsToHash`，按「執行」。
3. 確認屬性中已出現 `*_PASSWORD_HASH`、明文屬性已消失。之後 Script Properties 內不再有明文密碼。
4. 在遷移前，舊的明文屬性仍可登入（過渡用）；遷移後只接受雜湊。

雜湊為「隨機鹽 + 3000 次 SHA-256 迭代」。Apps Script 沒有 PBKDF2/bcrypt，因此真正的防線是下方的失敗鎖定，請使用長密碼。

## 登入防護
- 同一帳號連續失敗 5 次，鎖定 15 分鐘（鎖定期間連正確密碼也拒絕）。鎖定計數放在 Script Cache，快取可能被 Google 提早清除，屬於盡力而為的保護。
- 帳號不存在與密碼錯誤回傳相同訊息，並做同等運算，避免被用來探測帳號。
- 攻擊者可藉由故意失敗 5 次暫時鎖住管理員（鎖定不會影響已登入的 session）。這是鎖定機制的已知取捨。
- 登入 session 存於 GAS Cache，30 分鐘到期；後台「登出」會立即作廢 session。

## 登入紀錄
- 由後端在驗證成功時直接寫入 `admin-login-log.json`；前端沒有任何新增或同步紀錄的入口。
- 鎖定事件與刪除動作也會留下紀錄；只有主要管理員可刪除，且刪除本身會被記錄。
- 裝置識別、瀏覽器資訊、公開 IP 為**瀏覽器自行回報**（Apps Script 取不到來源 IP），可被偽造，僅供參考。
- ⚠️ **隱私**：此檔含帳號名稱、IP 與裝置資訊。若儲存庫是公開的，任何人都能在 GitHub 上讀到它（Pages 發布版已排除此檔，但儲存庫本身仍可見）。建議把儲存庫改為私有，或另建私有儲存庫並修改 `CONFIG.OWNER/REPO/AUDIT_PATH`。

## 參數發布檢查
`saveConfig` 會拒絕：版本號低於線上版本、缺少既有欄位或型別改變、金額為負或過大、稅率不在 0～1、課稅級距未遞增、來源網址非 http(s)。另外每次發布會把 `configRevision` 加一，後台以讀取當下的版次發布，若期間有人更新過，會提示重新讀取，避免覆蓋他人修改。

## 部署 Web App
1. 確認 `Code.gs` 已儲存且沒有語法錯誤，並完成上方密碼遷移。
2. 「部署 → 新增部署作業 → 網頁應用程式」：執行身分選「我」，存取權選「所有人」（GitHub Pages 前台才能呼叫；管理操作仍須通過帳密與 session）。
3. 複製 `/exec` 網址，更新 `admin.html` 的 `GAS_API_URL_DEFAULT`。之後每次修改程式，請編輯部署作業並建立**新版本**。
4. 僅專案擁有者應有 GAS 專案編輯權限，因編輯者可修改後端並讀取 Script Properties。

## API 與工作階段
前端以不帶 cookie 的 `fetch` 傳送請求（POST，`no-cors`），再以 `fetch(...?format=json&requestId=…, {credentials:'omit'})` 輪詢短期結果；若瀏覽器擋下這種讀取，才退回 JSONP（`<script>` 標籤）備援。
**不要只依賴 JSONP**：`<script>` 一定會帶 Google cookie，使用者登入多個 Google 帳號時，Google 會把請求導向 `/macros/u/1/...` 並回傳「無法開啟檔案」的 Drive 頁面，後端的 `doGet` 不會被執行。
請求識別碼由瀏覽器以 `crypto.getRandomValues` 產生（32 位以上，不可猜測），結果在讀取後最多再保留 20 秒即失效。支援的操作：`login`、`logout`、`check`、`saveConfig`、`getAudit`、`deleteAudit`；除 `login` 外都須 session。v21 已移除未驗證的 `publicConfig` 與前端寫入的 `syncAudit`。錯誤回應只含預先定義的訊息，不含例外堆疊或 GitHub 回傳內容。

### 連線排查
在已部署後台頁面（網域 github.io）的開發者工具 Console 執行，確認不帶 cookie 的跨網域讀取可用：
```
fetch('<你的 /exec 網址>?format=json&requestId=' + 'a'.repeat(32), {credentials: 'omit'}).then(r => r.text()).then(console.log)
```
預期輸出 `{"ok":false,"pending":true}`。若報 CORS 錯誤，後台會自動改用 JSONP，但多帳號登入的瀏覽器可能失敗；登入錯誤訊息會列出 fetch 與 jsonp 各自的失敗原因。

## 版本控制
- 後端：`gas/Code.gs`、`gas/appsscript.json` 入庫。可用 clasp 同步（在 `gas/` 目錄執行 `clasp push`）；`.clasprc.json`、Script Properties、密碼與 Token 絕不可提交（已列入 `.gitignore`）。
- 前端：`VERSION.txt` 與 `docs/history/` 追蹤版本。

## 前端建置與混淆
GitHub Pages 的來源需設為「GitHub Actions」（Settings → Pages → Build and deployment → Source）。`.github/workflows/deploy-pages.yml` 在推送到 `main`、年度監控完成或手動觸發時執行 `npm run build`：只發布白名單檔案，將 `js/*.js` 與 `admin.html` 內嵌腳本以 `javascript-obfuscator` 混淆，並驗證每支腳本仍可解析，任何失敗都會中止部署、線上網站維持原狀。`admin-login-log.json` 的更新不會觸發部署。

本機除錯可用 `npm run build:dev`（不混淆）。**混淆只增加閱讀成本，不是保密或安全控制**；敏感邏輯與祕密必須留在 GAS。
