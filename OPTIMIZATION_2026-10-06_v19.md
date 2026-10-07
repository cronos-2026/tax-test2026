# 2026.10.06_v19

- Moved administrator authentication and GitHub Contents API writes into a Google Apps Script Web App.
- Stored GitHub token and administrator credentials in Script Properties; removed the GitHub token field from the public admin page.
- Added a primary and secondary administrator credential pair. Both accounts can perform admin tasks; adding administrator credentials remains a Script Properties owner task.
- Added `Cronos` source markers to the public HTML and JavaScript files.
- Kept the existing GitHub Pages front-end and `/admin` URL.

The GAS deployment is recorded in the v20 release notes. The admin page now uses the deployed `/exec` endpoint by default; keep the existing GitHub Pages front-end and `/admin` URL unchanged.
