# 2026.10.07_v21

- Login brute-force protection: per-account lockout (5 failures / 15 min), uniform error message, equal-work verification for unknown accounts.
- Admin passwords are stored as salted iterated SHA-256 hashes (`migratePasswordsToHash` converts the plaintext properties and deletes them); the length-leaking comparison was removed.
- Login audit log is now written only by the backend (success, lockout, deletion records). The browser-side localStorage queue and `syncAudit` were removed; only the primary admin can delete records.
- `saveConfig` validates structure, ranges and brackets, rejects version rollback, and uses `configRevision` for optimistic concurrency. The admin page loads the live config from GitHub through the backend.
- Removed the unauthenticated `publicConfig` action. Backend errors no longer expose GitHub messages or stack text. Request IDs are 32+ chars from `crypto.getRandomValues`; logout invalidates the session.
- `admin.html`: removed stale GitHub Token wording and hard-coded account names; IP lookup has a timeout.
- Added publish-time build (`scripts/build.mjs`, `deploy-pages.yml`): allow-listed files only, JS obfuscation, parse verification. Added `.gitignore`, `gas/appsscript.json`, `package.json`.
- Transport fix: result polling now uses `fetch` with `credentials:'omit'` (`doGet?format=json`) and falls back to JSONP. JSONP `<script>` requests carry Google cookies and are redirected to `/macros/u/1/` when several Google accounts are signed in, which returned the Drive "cannot open file" page and never reached `doGet`. Redeploy the GAS web app (new version) together with the front end.
- Not browser-tested: the backend logic was exercised against a mocked Apps Script runtime, and the build pipeline against a stub obfuscator. Verify login, publish and the Actions deploy once after rollout.
