/**
 * GAS web app backend for the tax-test2026 GitHub Pages site (v21).
 * Configure Script Properties before deployment. See ../GAS-DEPLOY.md.
 *
 * Script Properties (never commit values):
 *   GITHUB_TOKEN                          Fine-grained PAT, Contents read/write on this repo only
 *   ADMIN_USERNAME / ADMIN_PASSWORD_HASH  primary admin  (hash produced by migratePasswordsToHash)
 *   SECONDARY_ADMIN_USERNAME / SECONDARY_ADMIN_PASSWORD_HASH
 *   ADMIN_PASSWORD / SECONDARY_ADMIN_PASSWORD  legacy plaintext; accepted only until migrated
 */
const CONFIG = Object.freeze({
  OWNER: 'cronos-2026',
  REPO: 'tax-test2026',
  BRANCH: 'main',
  CONFIG_PATH: 'tax-config.json',
  AUDIT_PATH: 'admin-login-log.json',
  SESSION_TTL: 1800,
  RESULT_TTL: 120,
  MAX_BODY: 45000,
  LOGIN_MAX_FAILS: 5,        // consecutive failures before lockout
  LOGIN_LOCK_SECONDS: 900,   // lockout length and failure-counting window
  HASH_ITERATIONS: 10000,
  AUDIT_MAX: 2000,
  AUDIT_VIEW: 100,
  TIMEZONE: 'Asia/Taipei'
});

class UserError extends Error {}
function fail_(msg) { throw new UserError(msg); }

/* ───────────── web app entry points ───────────── */

function doGet(e) {
  const p = (e && e.parameter) || {};
  const result = takeResult_(String(p.requestId || ''));
  if (String(p.format || '') === 'json') {   // preferred: fetch without cookies
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  const callback = String(p.callback || '');   // fallback: JSONP
  if (!/^cb_[a-zA-Z0-9_]{1,60}$/.test(callback)) return ContentService.createTextOutput('/* invalid callback */');
  return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  const requestId = String(p.requestId || '');
  if (!isRequestId_(requestId)) return ContentService.createTextOutput('bad request');
  const t0 = Date.now();
  const action = String(p.action || '').slice(0, 24);
  let result;
  try {
    const body = String(p.payload || '');
    if (body.length > CONFIG.MAX_BODY) fail_('請求內容過大');
    const data = body ? JSON.parse(body) : {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail_('請求格式錯誤');
    result = route_(action, data);
  } catch (err) {
    result = { ok: false, error: safeMessage_(err) };
  }
  console.log('doPost action=' + action + ' ok=' + !!(result && result.ok) + ' ' + (Date.now() - t0) + ' ms');  // no payload, no secrets
  CacheService.getScriptCache().put('result:' + requestId, JSON.stringify(result), CONFIG.RESULT_TTL);
  return ContentService.createTextOutput('accepted');
}

function route_(action, data) {
  if (action === 'login') return login_(data);
  const session = requireSession_(data.session);
  switch (action) {
    case 'logout':
      CacheService.getScriptCache().remove('session:' + data.session);
      return { ok: true };
    case 'check': {
      const current = githubRead_(CONFIG.CONFIG_PATH);
      return { ok: true, version: current.json.siteVersion || '', revision: revisionOf_(current.json), config: current.json };
    }
    case 'saveConfig':
      return saveConfig_(data, session);
    case 'getAudit':
      return getAudit_();
    case 'deleteAudit':
      return deleteAudit_(data, session);
    default:
      fail_('不支援的操作');
  }
}

/* ───────────── login, throttling, password hashing ───────────── */

function login_(data) {
  const props = PropertiesService.getScriptProperties();
  const user = String(data.account || '').trim().slice(0, 64);
  const pass = String(data.password || '').slice(0, 256);
  const accounts = loadAccounts_(props);
  if (!accounts.length) fail_('後端尚未完成管理員設定');

  const key = throttleKey_(user);
  const state = readThrottle_(key);
  if (state.until > Date.now()) fail_('登入失敗次數過多，請 15 分鐘後再試');

  const matched = accounts.find(function (a) { return a.username === user; });
  const t0 = Date.now();
  const ok = verifyPassword_(pass, matched);   // runs equal work even when the account does not exist
  const tVerify = Date.now() - t0;
  if (!matched || !ok) {
    console.log('login failed: verify ' + tVerify + ' ms, accountFound=' + !!matched);
    const locked = recordFailure_(key);
    Utilities.sleep(250);
    if (locked) {
      appendAudit_({ result: 'locked', account: matched ? user : '(unknown)', role: matched ? matched.role : '' }, data.clientInfo);
      fail_('登入失敗次數過多，請 15 分鐘後再試');
    }
    fail_('帳號或密碼錯誤');
  }

  CacheService.getScriptCache().remove(key);
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('session:' + token,
    JSON.stringify({ account: matched.username, role: matched.role }), CONFIG.SESSION_TTL);
  const t1 = Date.now();
  const auditOk = appendAudit_({ result: 'success', account: matched.username, role: matched.role }, data.clientInfo);
  console.log('login ok: verify ' + tVerify + ' ms, audit ' + (Date.now() - t1) + ' ms');
  return { ok: true, token: token, role: matched.role, expiresIn: CONFIG.SESSION_TTL, auditOk: auditOk };
}

function loadAccounts_(props) {
  return [
    { role: 'primary', u: 'ADMIN_USERNAME', h: 'ADMIN_PASSWORD_HASH', p: 'ADMIN_PASSWORD' },
    { role: 'secondary', u: 'SECONDARY_ADMIN_USERNAME', h: 'SECONDARY_ADMIN_PASSWORD_HASH', p: 'SECONDARY_ADMIN_PASSWORD' }
  ].map(function (d) {
    return { role: d.role, username: props.getProperty(d.u), hash: props.getProperty(d.h), plain: props.getProperty(d.p) };
  }).filter(function (a) { return a.username && (a.hash || a.plain); });
}

// Stored format: v1$<iterations>$<salt>$<hex sha256 chain>
function verifyPassword_(pass, account) {
  const dummy = 'v1$' + CONFIG.HASH_ITERATIONS + '$00000000000000000000000000000000$' + new Array(65).join('0');
  const stored = account && account.hash ? account.hash : dummy;
  const parts = stored.split('$');
  let ok = false;
  if (parts.length === 4 && parts[0] === 'v1') {
    const computed = stretch_(pass, parts[2], Math.min(Math.max(parseInt(parts[1], 10) || 0, 1), 20000));
    ok = !!(account && account.hash) && safeEqual_(computed, parts[3]);
  }
  if (account && !account.hash && account.plain) {      // legacy plaintext until migratePasswordsToHash() runs
    ok = safeEqual_(sha256Hex_('p:' + pass), sha256Hex_('p:' + account.plain));
  }
  return ok;
}

function stretch_(password, salt, iterations) {
  // Same value as the original Utilities.computeDigest chain (existing v1 hashes stay valid),
  // but computed in plain JS: each Utilities call is a slow service round trip inside a loop.
  const tail = utf8_(salt + password);
  let hex = hexBytes_(sha256Bytes_(utf8_(salt + ':' + password)));
  for (let i = 0; i < iterations; i++) hex = hexBytes_(sha256Bytes_(hex.concat(tail)));
  return String.fromCharCode.apply(null, hex);
}

function throttleKey_(account) { return 'fail:' + sha256Hex_(String(account).toLowerCase()); }
function readThrottle_(key) {
  const raw = CacheService.getScriptCache().get(key);
  try { return raw ? JSON.parse(raw) : { count: 0, until: 0 }; } catch (_) { return { count: 0, until: 0 }; }
}
function recordFailure_(key) {
  const lock = LockService.getScriptLock();
  lock.tryLock(3000);
  try {
    const s = readThrottle_(key);
    s.count = (s.count || 0) + 1;
    const locked = s.count >= CONFIG.LOGIN_MAX_FAILS;
    if (locked) s.until = Date.now() + CONFIG.LOGIN_LOCK_SECONDS * 1000;
    CacheService.getScriptCache().put(key, JSON.stringify(s), CONFIG.LOGIN_LOCK_SECONDS);
    return locked;
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function requireSession_(token) {
  if (!token || !/^[a-f0-9-]{60,80}$/i.test(String(token))) fail_('登入已逾時，請重新登入');
  const raw = CacheService.getScriptCache().get('session:' + token);
  if (!raw) fail_('登入已逾時，請重新登入');
  return JSON.parse(raw);
}

/**
 * Run from the Apps Script editor (never from the web app).
 * Put the NEW password in ADMIN_PASSWORD / SECONDARY_ADMIN_PASSWORD (Script Properties UI),
 * run this once; it stores a salted hash and deletes the plaintext property.
 * Also use it to rotate a password the same way.
 */
function migratePasswordsToHash() {
  const props = PropertiesService.getScriptProperties();
  const done = [];
  [['ADMIN_PASSWORD', 'ADMIN_PASSWORD_HASH'], ['SECONDARY_ADMIN_PASSWORD', 'SECONDARY_ADMIN_PASSWORD_HASH']].forEach(function (pair) {
    const plain = props.getProperty(pair[0]);
    if (!plain) return;
    const salt = Utilities.getUuid().replace(/-/g, '');
    props.setProperty(pair[1], 'v1$' + CONFIG.HASH_ITERATIONS + '$' + salt + '$' + stretch_(plain, salt, CONFIG.HASH_ITERATIONS));
    props.deleteProperty(pair[0]);
    done.push(pair[1]);
  });
  Logger.log(done.length ? 'Stored: ' + done.join(', ') + '; plaintext removed.' : 'No plaintext password properties found.');
}

/* ───────────── config save / validation ───────────── */

function saveConfig_(data, session) {
  const current = githubRead_(CONFIG.CONFIG_PATH);
  const baseRevision = Number(data.baseRevision);
  if (!isFinite(baseRevision)) fail_('缺少基準版次，請按「重新讀取」後再發布');
  if (baseRevision !== revisionOf_(current.json)) fail_('參數已被其他操作更新，請按「重新讀取」取得最新設定後再發布');
  validateConfig_(data.config, current.json);
  const next = data.config;
  next.configRevision = revisionOf_(current.json) + 1;
  githubWrite_(CONFIG.CONFIG_PATH, next, current.sha, 'Update tax config ' + next.siteVersion + ' (rev ' + next.configRevision + ') by ' + session.account);
  return { ok: true, version: next.siteVersion, revision: next.configRevision, savedBy: session.account };
}

function revisionOf_(cfg) { return Math.max(0, parseInt(cfg && cfg.configRevision, 10) || 0); }

function parseVersion_(v) {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})_v(\d+)$/.exec(String(v || ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] : null;
}
function cmpVersion_(a, b) {
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}
function typeOf_(v) { return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v; }

function validateConfig_(config, current) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) fail_('參數格式錯誤');
  if (JSON.stringify(config).length > CONFIG.MAX_BODY) fail_('稅務參數超過大小限制');

  // 1. version must be well-formed and never go backwards (rollback guard)
  const nv = parseVersion_(config.siteVersion);
  if (!nv) fail_('版本格式錯誤');
  const cv = parseVersion_(current && current.siteVersion);
  if (cv && cmpVersion_(nv, cv) < 0) fail_('版本不可低於目前線上版本 ' + current.siteVersion);

  // 2. every existing top-level key must remain, with the same type
  Object.keys(current || {}).forEach(function (k) {
    if (k === 'configRevision') return;
    if (!(k in config)) fail_('缺少必要欄位：' + k);
    if (typeOf_(config[k]) !== typeOf_(current[k])) fail_('欄位型別錯誤：' + k);
  });
  Object.keys(config).forEach(function (k) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') fail_('不允許的欄位名稱');
  });

  // 3. numeric ranges
  const ratioKeys = ['dividendCreditRate', 'dividendSeparateRate', 'legalReserveRate', 'businessTaxTransitionRate', 'businessTaxRate'];
  Object.keys(config).forEach(function (k) {
    const v = config[k];
    if (k === 'schemaVersion' || k === 'taxYear' || typeof v !== 'number') return;
    if (!isFinite(v) || v < 0 || v > 1e10) fail_('數值超出合理範圍：' + k);
  });
  ratioKeys.forEach(function (k) {
    if (typeof config[k] === 'number' && config[k] > 1) fail_('稅率必須介於 0～1：' + k);
  });
  if (typeof config.taxYear === 'number' && (config.taxYear < 100 || config.taxYear > 200 || config.taxYear % 1)) fail_('課稅年度不合理');
  if (config.businessTaxExemptThreshold > config.businessTaxTransitionThreshold) fail_('營所稅免稅門檻不可大於過渡門檻');

  // 4. brackets: ascending limits, last is open-ended, rates 0..1
  if (!Array.isArray(config.brackets) || config.brackets.length < 1 || config.brackets.length > 12) fail_('課稅級距格式錯誤');
  let prev = 0;
  config.brackets.forEach(function (b, i) {
    const last = i === config.brackets.length - 1;
    if (!b || typeof b.rate !== 'number' || b.rate < 0 || b.rate > 1 || typeof b.diff !== 'number' || !isFinite(b.diff)) fail_('課稅級距內容錯誤');
    if (last) { if (b.limit !== null) fail_('最後一級距上限必須為空'); return; }
    if (typeof b.limit !== 'number' || !isFinite(b.limit) || b.limit <= prev) fail_('課稅級距上限必須遞增');
    prev = b.limit;
  });

  // 5. strings: bounded length, safe URL scheme
  ['pageTitle', 'pageSubtitle', 'pageNotice', 'sourceLabel', 'sourceUrl', 'sourcePublishDate', 'lastUpdated'].forEach(function (k) {
    if (k in config && typeof config[k] === 'string' && config[k].length > 2000) fail_('文字過長：' + k);
  });
  if (config.sourceUrl && !/^https?:\/\//i.test(String(config.sourceUrl))) fail_('來源網址必須為 http(s)');
}

/* ───────────── audit log (written only by the server) ───────────── */

function appendAudit_(event, clientInfo) {
  const ci = clientInfo && typeof clientInfo === 'object' ? clientInfo : {};
  const now = new Date();
  const entry = {
    id: Utilities.getUuid(),
    loginAt: now.toISOString(),
    loginAtLocal: Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy/MM/dd HH:mm:ss'),
    result: event.result,
    account: event.account,
    role: event.role,
    // client-reported hints: informational only, can be forged
    deviceName: clean_(ci.deviceName, 80),
    deviceId: clean_(ci.deviceId, 40),
    browserPlatform: clean_(ci.browserPlatform, 80),
    language: clean_(ci.language, 20),
    clientIp: /^[0-9a-fA-F:.]{3,45}$/.test(String(ci.publicIp || '')) ? String(ci.publicIp) : '',
    userAgent: clean_(ci.userAgent, 200),
    detail: event.detail || ''
  };
  return mutateAudit_(function (logs) { logs.push(entry); return logs; });
}

function mutateAudit_(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(8000);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const current = githubRead_(CONFIG.AUDIT_PATH, true);
        const logs = fn(((current.json && current.json.logs) || []).slice()).slice(-CONFIG.AUDIT_MAX);
        githubWrite_(CONFIG.AUDIT_PATH, { schemaVersion: 1, updatedAt: new Date().toISOString(), logs: logs },
          current.sha, 'Update admin login audit');
        return true;
      } catch (err) {
        if (attempt === 1 || !(err instanceof UserError) || err.message.indexOf('409') < 0) throw err;
      }
    }
  } catch (err) {
    console.error('audit write failed: ' + (err && err.message));
    return false;
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
  return false;
}

function getAudit_() {
  const current = githubRead_(CONFIG.AUDIT_PATH, true);
  const logs = ((current.json && current.json.logs) || []).slice(-CONFIG.AUDIT_VIEW);
  return { ok: true, logs: logs };
}

function deleteAudit_(data, session) {
  if (session.role !== 'primary') fail_('只有主要管理員可刪除登入紀錄');
  const ids = (Array.isArray(data.ids) ? data.ids : []).map(String).filter(function (s) { return /^[a-zA-Z0-9-]{8,60}$/.test(s); }).slice(0, 100);
  if (!ids.length) fail_('未指定要刪除的紀錄');
  const del = new Set(ids);
  let removed = 0;
  const ok = mutateAudit_(function (logs) {
    const kept = logs.filter(function (l) { return !(l && del.has(String(l.id))); });
    removed = logs.length - kept.length;
    kept.push({  // deletions leave a trace
      id: Utilities.getUuid(), loginAt: new Date().toISOString(),
      loginAtLocal: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy/MM/dd HH:mm:ss'),
      result: 'audit-delete', account: session.account, role: session.role,
      detail: 'deleted ' + removed + ' record(s)'
    });
    return kept;
  });
  if (!ok) fail_('寫入登入紀錄失敗，請稍後再試');
  return { ok: true, removed: removed };
}

/* ───────────── GitHub Contents API ───────────── */

function githubRead_(path, allowMissing) {
  const response = githubRequest_(path, 'get');
  if (response.getResponseCode() === 404 && allowMissing) return { sha: null, json: null };
  const body = parseGithub_(response);
  const bytes = Utilities.base64Decode(String(body.content || '').replace(/\s/g, ''));
  return { sha: body.sha, json: JSON.parse(Utilities.newBlob(bytes).getDataAsString('UTF-8')) };
}

function githubWrite_(path, value, sha, message) {
  const text = JSON.stringify(value, null, 2);
  const payload = { message: message, content: Utilities.base64Encode(text, Utilities.Charset.UTF_8), branch: CONFIG.BRANCH };
  if (sha) payload.sha = sha;
  const response = UrlFetchApp.fetch(githubUrl_(path), {
    method: 'put', contentType: 'application/json', payload: JSON.stringify(payload),
    headers: githubHeaders_(), muteHttpExceptions: true
  });
  parseGithub_(response);
}

function githubRequest_(path, method) {
  return UrlFetchApp.fetch(githubUrl_(path), { method: method, headers: githubHeaders_(), muteHttpExceptions: true });
}
function githubUrl_(path) {
  return 'https://api.github.com/repos/' + CONFIG.OWNER + '/' + CONFIG.REPO + '/contents/' +
    path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(CONFIG.BRANCH);
}
function githubHeaders_() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) fail_('後端尚未設定 GitHub Token');
  return { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' };
}
function parseGithub_(response) {
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    console.error('GitHub API HTTP ' + code + ': ' + String(response.getContentText()).slice(0, 300));
    fail_(code === 409 || code === 422 ? 'GitHub 寫入衝突 (HTTP ' + code + ')，請重新讀取後再試' : 'GitHub API 錯誤 (HTTP ' + code + ')');
  }
  try { return JSON.parse(response.getContentText()); } catch (_) { return {}; }
}

/* ───────────── helpers ───────────── */

function takeResult_(id) {
  if (!isRequestId_(id)) return { ok: false, error: '無效的請求識別碼' };
  const cache = CacheService.getScriptCache();
  const key = 'result:' + id;
  const raw = cache.get(key);
  if (!raw) return { ok: false, pending: true };
  cache.put(key, raw, 20);   // short grace so a retry after a dropped response still works, then it expires
  return JSON.parse(raw);
}
function isRequestId_(id) { return /^[a-zA-Z0-9_-]{32,80}$/.test(id); }
function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max); }
function hexBytes_(bytes) {          // byte array -> array of ASCII char codes of its lowercase hex
  const digits = '0123456789abcdef';
  const out = new Array(bytes.length * 2);
  for (let i = 0; i < bytes.length; i++) {
    out[2 * i] = digits.charCodeAt(bytes[i] >> 4);
    out[2 * i + 1] = digits.charCodeAt(bytes[i] & 15);
  }
  return out;
}
function sha256Hex_(s) { return String.fromCharCode.apply(null, hexBytes_(sha256Bytes_(utf8_(s)))); }

function utf8_(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const d = str.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

const SHA256_K_ = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function sha256Bytes_(msg) {         // msg: array of bytes (0-255); returns array of 32 bytes
  const len = msg.length;
  const padded = msg.slice();
  padded.push(0x80);
  while (padded.length % 64 !== 56) padded.push(0);
  const bits = len * 8;
  padded.push(0, 0, 0, 0, (bits >>> 24) & 255, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
      h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = (padded[j] << 24) | (padded[j + 1] << 16) | (padded[j + 2] << 8) | padded[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA256_K_[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  const out = [];
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach(function (v) {
    out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  });
  return out;
}
function safeEqual_(a, b) {          // callers pass equal-length digests, so length is not leaked
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function safeMessage_(err) {
  if (err instanceof UserError) return String(err.message).slice(0, 240);
  console.error(err && err.stack || err);
  return '伺服器錯誤';
}

/**
 * Run from the Apps Script editor. Prints NO passwords or hashes: only whether each login
 * property is set, whether the username has stray spaces, whether the hash format is valid,
 * and how long password verification takes in this runtime.
 */
function diagnoseLoginConfig() {
  const props = PropertiesService.getScriptProperties();
  [['primary', 'ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH', 'ADMIN_PASSWORD'],
   ['secondary', 'SECONDARY_ADMIN_USERNAME', 'SECONDARY_ADMIN_PASSWORD_HASH', 'SECONDARY_ADMIN_PASSWORD']].forEach(function (d) {
    const u = props.getProperty(d[1]), h = props.getProperty(d[2]), p = props.getProperty(d[3]);
    const parts = h ? h.split('$') : [];
    Logger.log(d[0] + ': username ' + (u ? 'set, length ' + u.length + (u !== u.trim() ? ' (HAS leading/trailing whitespace)' : '') : 'NOT set') +
      '; hash ' + (h ? (parts.length === 4 && parts[0] === 'v1' && /^[0-9a-f]{64}$/.test(parts[3]) ? 'valid format, ' + parts[1] + ' iterations' : 'INVALID format') : 'not set') +
      '; plaintext ' + (p ? 'STILL SET' + (h ? ' (ignored: the hash takes priority, so a new plaintext password has no effect until migratePasswordsToHash runs)' : ' (legacy mode)') : 'not set'));
  });
  const t = Date.now();
  stretch_('timing-test', 'timing-salt', CONFIG.HASH_ITERATIONS);
  Logger.log('One password verification (' + CONFIG.HASH_ITERATIONS + ' iterations): ' + (Date.now() - t) + ' ms');
  Logger.log('GITHUB_TOKEN ' + (props.getProperty('GITHUB_TOKEN') ? 'set' : 'NOT set'));
}
