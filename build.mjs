// Builds the publishable site into _site/.
//  - copies only the allow-listed public files (admin-login-log.json, docs, gas, scripts… are NOT published)
//  - obfuscates js/*.js and the inline <script> blocks of index.html / admin.html
//  - verifies every produced script still parses; any failure aborts the build so the live site is untouched
// OBFUSCATE=0 copies without obfuscating (local debugging). Obfuscation raises reading cost only; it is not a security control.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, '_site');
const PUBLIC_FILES = ['index.html', 'admin.html', 'tax-config.json', 'annual-presets.json'];
const PUBLIC_DIRS = ['js', 'data'];
const OBFUSCATE = process.env.OBFUSCATE !== '0';

// renameGlobals:false is required: the pages share top-level functions across files and via inline onclick handlers.
// transformObjectKeys/renameProperties stay off: config JSON keys are read by name.
const OPTIONS = {
  target: 'browser',
  compact: true,
  simplify: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  renameProperties: false,
  transformObjectKeys: false,
  stringArray: true,
  stringArrayThreshold: 0.75,
  stringArrayEncoding: ['base64'],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,
  unicodeEscapeSequence: false,
  sourceMap: false
};

let obfuscator = null;
if (OBFUSCATE) {
  try {
    obfuscator = (await import('javascript-obfuscator')).default;
  } catch (e) {
    const missing = e && e.code === 'ERR_MODULE_NOT_FOUND';
    console.error(missing
      ? 'javascript-obfuscator is not installed. Run `npm install`, or use OBFUSCATE=0 for an unobfuscated dev build.'
      : 'Failed to load javascript-obfuscator: ' + (e && e.message));
    process.exit(1);
  }
}

function assertParses(code, label) {
  try { new vm.Script(code, { filename: label }); }
  catch (e) { throw new Error(`Build aborted: ${label} does not parse (${e.message})`); }
}

function transform(code, label) {
  assertParses(code, label + ' (source)');
  if (!OBFUSCATE) return code;
  const out = obfuscator.obfuscate(code, OPTIONS).getObfuscatedCode().replace(/<\/script/gi, '<\\/script');
  assertParses(out, label + ' (obfuscated)');
  return out;
}

function transformHtml(html, label) {
  let n = 0;
  return html.replace(/<script(?![^>]*\bsrc\s*=)([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs);
    if (!body.trim() || (type && !/^(text\/javascript|application\/javascript)$/i.test(type[1]))) return m;
    n++;
    return `<script${attrs}>${transform(body, `${label}#inline${n}`)}</script>`;
  });
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const f of PUBLIC_FILES) {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) { console.warn('skip (missing):', f); continue; }
  const dst = path.join(OUT, f);
  if (f.endsWith('.html')) fs.writeFileSync(dst, transformHtml(fs.readFileSync(src, 'utf8'), f));
  else fs.copyFileSync(src, dst);
}

function copyDir(rel) {
  const srcDir = path.join(ROOT, rel);
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(path.join(OUT, rel), { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const relPath = path.join(rel, entry.name);
    if (entry.isDirectory()) { copyDir(relPath); continue; }
    const dst = path.join(OUT, relPath);
    if (entry.name.endsWith('.js')) fs.writeFileSync(dst, transform(fs.readFileSync(path.join(ROOT, relPath), 'utf8'), relPath));
    else fs.copyFileSync(path.join(ROOT, relPath), dst);
  }
}
PUBLIC_DIRS.forEach(copyDir);

console.log(`Built ${OBFUSCATE ? 'obfuscated' : 'plain'} site -> ${path.relative(ROOT, OUT)}/`);
