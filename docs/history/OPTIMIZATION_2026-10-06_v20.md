# 2026.10.06_v20

- Connected the admin page to the deployed Google Apps Script Web App for server-side administrator authentication and GitHub Contents API access.
- Set the deployed `/exec` endpoint as the admin default and clear stale browser-local endpoint settings on page load.
- Kept GitHub tokens and administrator credentials in Apps Script Script Properties; no GitHub token input is exposed on the site.
- Preserved the existing GitHub Pages front-end and `/admin` route.
- Documented the current deployment and GitHub fine-grained token permissions.

The Apps Script publicConfig smoke check succeeded (HTTP 200 for POST and JSONP result retrieval). The browser login still needs the updated `admin.html` to be published and manually verified using the administrator's own credentials.
- Replaced stale local API URL settings with the current deployment endpoint and shortened repeated JSONP failure retries so an unreadable response does not wait through the former 20-second retry window.
