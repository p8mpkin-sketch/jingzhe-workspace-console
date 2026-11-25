#!/usr/bin/env node
// Dev-only acceptance for V3 Phase 6 (artifacts and reports), on fixtures. Seven groups:
//   A  artifact browser   tree, search, categories, one download control, bundle download, upload, manifest export
//   P  preview            text / JSON / Markdown / image, over 512 kB, binary
//   K  加固信息            PackerPanel in A+
//   D  版本对比            ReportDiffPanel in A+
//   R  report reader      chapters, scroll highlight, draft / ready, keyboard, every record listed
//   X  export and print   the one export menu, JSON with every record, print media, a PDF
//   T  task dialog        the dialog shell around the same browser
// Every group also runs empty, error, forbidden (no retry wording), slow and stale.
// Every wait has a limit (LIMIT, GROUP_MS, RUN_MS): something that is missing fails its check with the reason
// (“entry missing …”, “state rendering …”); nothing waits without end.
// Needs `npx vite preview --port 4173`.
// Usage: node scripts/check-artifacts-reports.mjs [--out dir] [--only A,P,K,D,R,X,T] [--base url]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { resolve as fixture } from './fixtures/api.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:4173/v2/');
const out = arg('out', '');
const only = arg('only', '').split(',').filter(Boolean);
const want = (g) => !only.length || only.includes(g);
if (out) fs.mkdirSync(out, { recursive: true });
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail: String(detail ?? '') }); console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

const WB = '/projects/1/sessions/41';
const ART = `${WB}?view=artifacts`, PACK = `${WB}?view=packer`, REPORT = `${WB}?view=report`, DIFF = `${WB}?view=diff`;
const TASK_LIST = /\/api\/tasks\/\d+\/artifacts$/;
const TASK_FILE = /\/api\/tasks\/\d+\/(artifact|report-file)$/;
const RETRY = /重试|再读一次|稍后|重新读取/;
// No wait in this script is open-ended. Every page gets these as its defaults (so a locator action on something
// that is not there fails after LIMIT.act), a group has GROUP_MS, the whole run RUN_MS.
const LIMIT = { nav: 20000, act: 8000, list: 10000, state: 6000, read: 3000 };
const GROUP_MS = 12 * 60 * 1000, RUN_MS = 45 * 60 * 1000;
// Every width in both themes, except 1440 light, which the main pass of each group covers.
const REST = [[1440, 'dark'], [1024, 'light'], [1024, 'dark'], [760, 'light'], [760, 'dark'], [390, 'light'], [390, 'dark']];

// A tree with every kind of file: Markdown, JSON, XML, logs, two images, a binary, a file over the preview limit,
// and a directory below the depth the first walk reaches.
const TREE = {
  '': { run_dir: '/data/runs/task_101', entries: [
    { type: 'dir', name: 'report', rel: 'report', files: 3 }, { type: 'dir', name: 'unpacked', rel: 'unpacked', files: 3 },
    { type: 'dir', name: 'screens', rel: 'screens', files: 2 }, { type: 'dir', name: 'logs', rel: 'logs', files: 2 },
    { type: 'file', name: 'run.log', rel: 'run.log', size_kb: 48 }] },
  report: { entries: [
    { type: 'file', name: 'security_report.md', rel: 'report/security_report.md', size_kb: 86 },
    { type: 'file', name: 'executive_summary.md', rel: 'report/executive_summary.md', size_kb: 12 },
    { type: 'file', name: 'security_report.json', rel: 'report/security_report.json', size_kb: 240 }] },
  unpacked: { entries: [
    { type: 'file', name: 'classes.dex', rel: 'unpacked/classes.dex', size_kb: 8420 },
    { type: 'file', name: 'AndroidManifest.xml', rel: 'unpacked/AndroidManifest.xml', size_kb: 22 },
    { type: 'dir', name: 'res', rel: 'unpacked/res', files: 1 }] },
  'unpacked/res': { entries: [{ type: 'dir', name: 'drawable', rel: 'unpacked/res/drawable', files: 1 }] },
  'unpacked/res/drawable': { entries: [{ type: 'file', name: 'icon.svg', rel: 'unpacked/res/drawable/icon.svg', size_kb: 3 }] },
  screens: { entries: [{ type: 'file', name: 'login.svg', rel: 'screens/login.svg', size_kb: 4 }, { type: 'file', name: 'home.png', rel: 'screens/home.png', size_kb: 180 }] },
  logs: { entries: [{ type: 'file', name: 'full.log', rel: 'logs/full.log', size_kb: 2048 }, { type: 'file', name: 'crash.txt', rel: 'logs/crash.txt', size_kb: 6 }] },
};
const WALKED = 10; // files the first walk finds; icon.svg is one level below it
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><rect width="120" height="80" fill="#e8e4dc"/><rect x="20" y="20" width="80" height="12" fill="#4b4f58"/><rect x="20" y="44" width="50" height="12" fill="#8a8d94"/></svg>';
// An 8×8 grey PNG, built here so the bytes are a valid image.
const PNG = (() => {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.concat(Array.from({ length: 8 }, () => Buffer.from([0, ...Array(8).fill(0x8a)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
})();
const tree = (m, u) => {
  if (m !== 'GET') return undefined;
  if (TASK_LIST.test(u.pathname)) return TREE[u.searchParams.get('prefix') || ''] || { entries: [] };
  if (/\/artifact$/.test(u.pathname)) {
    const p = u.searchParams.get('path') || '';
    if (/\.svg$/.test(p)) return { __raw: Buffer.from(SVG), type: 'application/octet-stream' };
    if (/\.png$/.test(p)) return { __raw: PNG, type: 'application/octet-stream' };
  }
  return undefined;
};
const manyCards = (n) => {
  const cards = fixture('GET', new URL('http://x/api/pentest/sessions/41/vulns/grouped')).cards.filter((c) => c.severity !== 'info');
  const sev = ['critical', 'high', 'medium', 'low'];
  return Array.from({ length: n }, (_, i) => {
    const c = JSON.parse(JSON.stringify(cards[i % cards.length]));
    c.rule_id = `R-${String(100 + i)}`; c.title = `示例发现 ${String(i + 1).padStart(2, '0')}: ${c.title.replace(/^示例发现: /, '')}`; c.severity = sev[i % 4];
    c.instances = (c.instances || []).map((x, j) => ({ ...x, id: `g${i}_${j}`, severity: c.severity, state: i % 3 === 0 ? 'pending' : 'confirmed' }));
    return c;
  });
};

const browser = await chromium.launch();
const live = new Set(); // contexts opened by the group in progress
const summary = () => {
  const failed = results.filter((r) => !r.pass);
  const groups = {}; for (const r of results) { const g = r.name[0]; groups[g] = groups[g] || [0, 0]; groups[g][1]++; if (r.pass) groups[g][0]++; }
  if (out) fs.writeFileSync(path.join(out, 'report.artifacts-reports.json'), JSON.stringify({ base: 'fixtures', total: results.length, failed: failed.length, groups, results }, null, 1));
  console.log('\n' + Object.entries(groups).map(([g, [p, t]]) => `${g} ${p}/${t}`).join('   '));
  console.log(`${results.length - failed.length}/${results.length} artifacts and reports checks passed (fixtures)`);
  return failed.length;
};
// A group that throws or runs out of time is one failed check with the reason; the next group still runs.
async function group(g, body) {
  if (!want(g)) return;
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`group ${g} did not finish within ${GROUP_MS / 60000} min`)), GROUP_MS); });
  try { await Promise.race([body(), limit]); }
  catch (e) { ok(`${g} aborted: the group stopped before its end`, false, String(e?.message || e).split('\n').slice(0, 3).join(' | ')); }
  finally { clearTimeout(timer); for (const c of live) await c.close().catch(() => {}); live.clear(); }
}
setTimeout(() => { ok('Z watchdog: the run did not finish', false, `stopped after ${RUN_MS / 60000} min`); summary(); process.exit(2); }, RUN_MS).unref();
async function open(route, { width = 1440, height = 900, theme = 'light', deny = null, fail = null, hang = null, over = null, wait = 1500, downloads = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme, acceptDownloads: downloads });
  await ctx.addInitScript((t) => { try { localStorage.setItem('token', 'fixture-token'); localStorage.setItem('apksec-theme', t); } catch {} }, theme);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  live.add(ctx); ctx.setDefaultTimeout(LIMIT.act); ctx.setDefaultNavigationTimeout(LIMIT.nav);
  const page = await ctx.newPage();
  const state = { deny, fail, hang, over, errors: [], reqs: [] };
  page.on('pageerror', (e) => state.errors.push(e.message));
  await page.route('**/api/**', async (r) => {
    const req = r.request(); const url = new URL(req.url());
    if (/\/stream$|send_stream$/.test(url.pathname)) return r.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    state.reqs.push(`${req.method()} ${url.pathname}${url.search}`);
    if (state.hang && state.hang.test(url.pathname)) return; // never answered: the reader stays in its loading state
    if (state.deny && state.deny.test(url.pathname)) return r.fulfill({ status: 403, contentType: 'application/json', body: '{"detail":"fixture: forbidden"}' });
    if (state.fail && state.fail.test(url.pathname)) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"fixture failure"}' });
    const own = state.over ? state.over(req.method(), url) : undefined;
    if (own && own.__raw) return r.fulfill({ status: 200, contentType: own.type, body: own.__raw });
    if (own && own.__status) return r.fulfill({ status: own.__status, contentType: 'application/json', body: JSON.stringify(own.body || {}) });
    const body = own !== undefined ? own : fixture(req.method(), url);
    return r.fulfill(typeof body === 'string' ? { status: 200, contentType: 'text/plain; charset=utf-8', body } : { status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(base + '#' + route); await page.waitForTimeout(wait);
  return { ctx, page, state };
}
const count = (page, sel) => page.locator(sel).count();
const text = (page, sel) => page.locator(sel).first().innerText({ timeout: LIMIT.read }).then((s) => s.replace(/\s+/g, ' ').trim()).catch(() => '');
const attr = (page, sel, a) => page.locator(sel).first().getAttribute(a, { timeout: LIMIT.read }).catch(() => null);
const shot = async (page, name) => { if (out) await page.screenshot({ path: path.join(out, name) }); };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const since = (state, n) => state.reqs.slice(n);
// Presentation rules of A+ inside one root: nothing dimmed by opacity (a disabled control is the kit's own state),
// nothing in the error red, no emoji.
const rules = (page, sel) => page.evaluate((s) => {
  const root = document.querySelector(s); if (!root) return { dim: ['no root'], red: [], emoji: '' };
  const probe = document.createElement('span'); probe.className = 'text-jz-red'; root.appendChild(probe);
  const redInk = getComputedStyle(probe).color; probe.remove();
  const dim = []; const red = [];
  for (const el of root.querySelectorAll('*')) {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (Number(cs.opacity) < 1 && !el.closest('[disabled], [aria-disabled="true"], [role="status"][aria-label="加载中"]')) dim.push(el.tagName + '.' + String(el.className).slice(0, 40));
    if (cs.color === redInk && (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || el.tagName === 'svg')) red.push(el.tagName + ':' + (el.textContent || '').slice(0, 20));
  }
  const emoji = (root.innerText.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u) || [''])[0];
  return { dim: dim.slice(0, 3), red: red.slice(0, 3), emoji };
}, sel);
const clean = async (page, sel, label) => { const r = await rules(page, sel); ok(`${label}: nothing dimmed, nothing red, no emoji`, !r.dim.length && !r.red.length && !r.emoji, JSON.stringify(r)); };
// Tab order: every control in `sel` that should be reachable gets focus with a visible indicator.
const tabStops = async (page, rootSel, max = 60) => {
  await page.locator(rootSel).first().evaluate((el) => { el.setAttribute('tabindex', el.getAttribute('tabindex') ?? '-1'); el.focus(); });
  const seen = []; let bare = 0;
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate((rs) => {
      const a = document.activeElement; const root = document.querySelector(rs);
      if (!a || !root || !root.contains(a) || a === root) return null;
      const cs = getComputedStyle(a); const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 || cs.boxShadow !== 'none';
      const hooks = [...a.attributes].filter((x) => x.name.startsWith('data-')).map((x) => x.name + (x.value ? '=' + x.value : '')).join(' ');
      return { hooks, ring, tag: a.tagName };
    }, rootSel);
    if (!s) break;
    seen.push(s.hooks || s.tag); if (!s.ring) bare++;
  }
  return { seen, bare };
};

// ───────────────────────────── A. Artifact browser ─────────────────────────────
await group('A', async () => {
  const { ctx, page, state } = await open(ART, { over: tree, downloads: true });
  ok('A1 the workbench shows the artifact browser, not the old inline dialog', (await count(page, '[data-art-browser][data-state="ok"]')) === 1 && (await count(page, '[data-art-inline], [data-unified-modal]')) === 0);
  ok('A1 the scope line counts the files the walk found', (await text(page, '[data-art-scope]')) === `${WALKED} 个文件`, await text(page, '[data-art-scope]'));
  const lists = state.reqs.filter((x) => /artifacts\?prefix=/.test(x));
  ok('A1 one list request per directory within three levels, on the existing endpoint', ['', 'report', 'unpacked', 'screens', 'logs', 'unpacked%2Fres'].every((p) => lists.some((x) => x.endsWith(`prefix=${p}`))) && !lists.some((x) => /drawable/.test(x)) && state.reqs.every((x) => !/artifact\?path|report-file/.test(x)), lists.join(' | '));
  ok('A1 the tree shows directories with their file counts', (await count(page, '[data-art-mode="tree"] [data-art-dir]')) >= 5 && /3 个文件/.test(await text(page, '[data-art-dir="report"]')));
  ok('A1 every file states its type and size', /Markdown/.test(await text(page, '[data-art-file="report/security_report.md"]')) && /86 kB/.test(await text(page, '[data-art-file="report/security_report.md"]')) && /二进制/.test(await text(page, '[data-art-file="unpacked/classes.dex"]')) && /8\.2 MB/.test(await text(page, '[data-art-file="unpacked/classes.dex"]')));
  // collapse / expand
  await page.click('[data-art-dir="report"]'); await page.waitForTimeout(100);
  ok('A2 a directory collapses and says so', (await attr(page, '[data-art-dir="report"]', 'aria-expanded')) === 'false' && (await count(page, '[data-art-file="report/security_report.md"]')) === 0);
  await page.click('[data-art-dir="report"]'); await page.waitForTimeout(100);
  ok('A2 and expands again', (await attr(page, '[data-art-dir="report"]', 'aria-expanded')) === 'true' && (await count(page, '[data-art-file="report/security_report.md"]')) === 1);
  // a directory below the walk is read when opened
  const before = state.reqs.length;
  await page.click('[data-art-dir="unpacked/res/drawable"]'); await page.waitForTimeout(500);
  ok('A2 a directory below the first walk is read when it is opened (one request)', since(state, before).filter((x) => /artifacts\?prefix=unpacked%2Fres%2Fdrawable/.test(x)).length === 1 && (await count(page, '[data-art-file="unpacked/res/drawable/icon.svg"]')) === 1, since(state, before).join(' | '));
  ok('A2 the count includes the file found there', (await text(page, '[data-art-scope]')) === `${WALKED + 1} 个文件`, await text(page, '[data-art-scope]'));
  // search
  await page.fill('[data-art-search] input, input[data-art-search]', 'report'); await page.waitForTimeout(200);
  ok('A3 search lists matching files by path and states how many of how many', (await attr(page, '[data-art-tree]', 'data-art-mode')) === 'list' && (await count(page, '[data-art-file]')) === 3 && /显示 3 \/ 11 个文件/.test(await text(page, '[data-art-scope]')), await text(page, '[data-art-scope]'));
  await page.fill('[data-art-search] input, input[data-art-search]', 'zzz-nothing'); await page.waitForTimeout(200);
  ok('A3 a search with no match says so and offers to clear', (await count(page, '[data-art-empty]')) === 1 && (await count(page, '[data-art-clear]')) === 1);
  await page.click('[data-art-clear]'); await page.waitForTimeout(150);
  ok('A3 清除筛选 returns to the tree', (await attr(page, '[data-art-tree]', 'data-art-mode')) === 'tree');
  // categories
  const cats = await page.locator('[data-art-cat-chip]').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  ok('A4 category chips with counts: 全部, 脱壳 DEX, Manifest, 报告, 日志', cats.join(' | ') === '全部 11 | 脱壳 DEX 3 | Manifest 0 | 报告 3 | 日志 3', cats.join(' | '));
  await page.click('[data-art-cat-chip="log"]'); await page.waitForTimeout(150);
  ok('A4 a category filters the list and is marked pressed', (await attr(page, '[data-art-cat-chip="log"]', 'aria-pressed')) === 'true' && (await count(page, '[data-art-file]')) === 3 && (await page.locator('[data-art-file]').evaluateAll((els) => els.every((e) => /\.(log|txt)$/.test(e.getAttribute('data-art-file'))))));
  await page.click('[data-art-cat-chip="log"]'); await page.waitForTimeout(100);
  await page.click('[data-art-ext-chip="json"]'); await page.waitForTimeout(150);
  ok('A4 the extension filter works the same way', (await count(page, '[data-art-file]')) === 1 && (await count(page, '[data-art-file="report/security_report.json"]')) === 1);
  await page.click('[data-art-ext-chip="all"]'); await page.waitForTimeout(100);
  // one download control
  ok('A5 no download control before a file is selected; none on any row', (await count(page, '[data-art-download]')) === 0 && (await count(page, '[data-art-tree] [data-art-dl-btn], [data-art-tree] button[aria-label^="下载"]')) === 0);
  await page.click('[data-art-file="run.log"]'); await page.waitForTimeout(500);
  ok('A5 selecting a file marks its row and shows the one download control, on the selected file', (await attr(page, '[data-art-file="run.log"]', 'aria-current')) === 'true' && (await count(page, '[data-art-download]')) === 1 && (await count(page, '[data-art-browser] button:has-text("下载"):not([data-art-zip]):not([role="menuitem"])')) === 1);
  const selBg = await page.evaluate(() => { const probe = document.createElement('i'); probe.className = 'bg-jz-surface-2'; document.body.appendChild(probe); const c = getComputedStyle(probe).backgroundColor; probe.remove(); return [c, getComputedStyle(document.querySelector('[data-art-file="run.log"]')).backgroundColor]; });
  ok('A5 the selected row sits on surface-2', selBg[0] === selBg[1], selBg.join(' vs '));
  let n0 = state.reqs.length;
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-art-download]')]);
  ok('A5 下载 fetches the selected file from /artifact and saves it under its name', dl.suggestedFilename() === 'run.log' && since(state, n0).some((x) => /\/artifact\?path=run\.log$/.test(x)), dl.suggestedFilename());
  ok('A5 a note says what was downloaded', /已下载 run\.log/.test(await text(page, '[data-art-note]')));
  // header actions
  const primaries = await page.evaluate(() => { const probe = document.createElement('i'); probe.className = 'bg-jz-brand'; document.body.appendChild(probe); const c = getComputedStyle(probe).backgroundColor; probe.remove(); return [...document.querySelectorAll('[data-art-header] button')].filter((b) => getComputedStyle(b).backgroundColor === c).map((b) => b.innerText.trim()); });
  ok('A6 打包下载 is the only primary action of the header', primaries.join('|') === '打包下载', primaries.join('|'));
  n0 = state.reqs.length;
  const [zip] = await Promise.all([page.waitForEvent('download'), page.click('[data-art-zip="ready"]')]);
  ok('A6 打包下载 fetches the report package of the session', zip.suggestedFilename() === 'report_41.zip' && since(state, n0).some((x) => /\/sessions\/41\/report\/package$/.test(x)), zip.suggestedFilename());
  // upload: visible, secondary, POST /api/upload
  ok('A7 上传到样本库 is visible in the header and says where the file goes', (await page.locator('[data-art-upload-btn]').isVisible()) && /不会写入这个任务的产物目录/.test((await attr(page, '[data-art-upload-btn]', 'title')) || ''));
  state.over = (m, u) => (m === 'POST' && u.pathname === '/api/upload' ? { apk_path: '/data/in/sample.apk' } : tree(m, u));
  n0 = state.reqs.length;
  await page.setInputFiles('[data-art-upload-input]', { name: 'sample.apk', mimeType: 'application/vnd.android.package-archive', buffer: Buffer.from('PK') }); await page.waitForTimeout(500);
  ok('A7 an upload posts to /api/upload and the note says it did not go into this task', since(state, n0).filter((x) => x === 'POST /api/upload').length === 1 && /已上传到样本库/.test(await text(page, '[data-art-note]')) && /没有写入这个任务的产物目录/.test(await text(page, '[data-art-note]')), await text(page, '[data-art-note]'));
  state.over = (m, u) => (m === 'POST' && u.pathname === '/api/upload' ? { __status: 403 } : tree(m, u));
  await page.setInputFiles('[data-art-upload-input]', { name: 'sample.apk', mimeType: 'application/vnd.android.package-archive', buffer: Buffer.from('PK') }); await page.waitForTimeout(500);
  ok('A7 a refused upload is stated as a permission matter, without retry wording', /无权上传/.test(await text(page, '[data-art-note]')) && !RETRY.test(await text(page, '[data-art-note]')), await text(page, '[data-art-note]'));
  state.over = tree;
  // more menu: manifest export, source package, DEX bundle
  await page.click('[data-art-more]'); await page.waitForTimeout(150);
  const items = await page.locator('[data-art-more-menu] [role="menuitem"]').evaluateAll((els) => els.map((e) => e.innerText.trim()));
  ok('A8 更多 holds the manifest export and the two bundle downloads', items.join('|') === '导出文件清单 JSON|下载原始安装包|下载脱壳 DEX 压缩包', items.join('|'));
  const [man] = await Promise.all([page.waitForEvent('download'), page.click('[data-art-export-list]')]);
  const manPath = await man.path(); const manifest = JSON.parse(fs.readFileSync(manPath, 'utf8'));
  ok('A8 the manifest keeps its fields and lists every file', /task101_artifacts_manifest/.test(man.suggestedFilename()) && manifest.kind === 'apksec_artifacts_manifest' && manifest.task_id === 101 && manifest.count === 11 && manifest.files.length === 11 && ['name', 'rel', 'size_kb'].every((k) => k in manifest.files[0]) && 'run_dir' in manifest && 'exported_at' in manifest, JSON.stringify(Object.keys(manifest)));
  await page.click('[data-art-more]'); await page.waitForTimeout(150);
  n0 = state.reqs.length;
  const [apk] = await Promise.all([page.waitForEvent('download'), page.click('[data-art-source-apk]')]);
  ok('A8 下载原始安装包 uses /source-apk', apk.suggestedFilename() === 'Wallet.apk' && since(state, n0).some((x) => /\/tasks\/101\/source-apk$/.test(x)), apk.suggestedFilename());
  await page.click('[data-art-more]'); await page.waitForTimeout(150);
  n0 = state.reqs.length;
  const [dex] = await Promise.all([page.waitForEvent('download'), page.click('[data-art-dex-package]')]);
  ok('A8 下载脱壳 DEX 压缩包 uses /dex-package', dex.suggestedFilename() === 'task101_dex.zip' && since(state, n0).some((x) => /\/tasks\/101\/dex-package$/.test(x)), dex.suggestedFilename());
  // keyboard
  await page.click('[data-art-more]'); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok('A9 Escape closes the menu and returns focus to 更多', (await count(page, '[data-art-more-menu]')) === 0 && (await page.evaluate(() => document.activeElement?.hasAttribute('data-art-more'))));
  const stops = await tabStops(page, '[data-art-browser]', 70);
  const need = ['data-art-refresh', 'data-art-upload-btn', 'data-art-more', 'data-art-zip', 'data-art-search', 'data-art-cat-chip', 'data-art-ext-chip', 'data-art-dir', 'data-art-file', 'data-art-download', 'data-art-preview-close'];
  const missing = need.filter((h) => !stops.seen.some((s) => s.includes(h)));
  ok('A9 every control is reachable with Tab and shows a focus indicator', missing.length === 0 && stops.bare === 0, `missing: ${missing.join(',') || 'none'}; without indicator: ${stops.bare}; stops: ${stops.seen.length}`);
  await page.locator('[data-art-file="logs/crash.txt"]').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  ok('A9 Enter on a file row selects it', (await attr(page, '[data-art-file="logs/crash.txt"]', 'aria-current')) === 'true' && /crash\.txt/.test(await text(page, '[data-art-preview-path]')));
  await clean(page, '[data-art-browser]', 'A10 light');
  ok('A10 no page error', state.errors.length === 0, state.errors.join('; '));
  await shot(page, 'artifacts-selected-1440-light.png');
  await ctx.close();

  { const d = await open(ART, { over: tree, theme: 'dark' }); await d.page.click('[data-art-file="report/security_report.md"]'); await d.page.waitForTimeout(600);
    await clean(d.page, '[data-art-browser]', 'A10 dark'); await shot(d.page, 'artifacts-selected-1440-dark.png'); await d.ctx.close(); }

  // refused / failed downloads
  { const d = await open(ART, { over: tree }); await d.page.click('[data-art-file="run.log"]'); await d.page.waitForTimeout(400);
    d.state.deny = /\/artifact$|report\/package$/;
    await d.page.click('[data-art-download]'); await d.page.waitForTimeout(400);
    ok('A11 a refused download is a permission matter, without retry wording', /无权下载/.test(await text(d.page, '[data-art-note]')) && !RETRY.test(await text(d.page, '[data-art-note]')), await text(d.page, '[data-art-note]'));
    await d.page.click('[data-art-zip]'); await d.page.waitForTimeout(400);
    ok('A11 a refused bundle download likewise', /无权下载报告包/.test(await text(d.page, '[data-art-note]')), await text(d.page, '[data-art-note]'));
    d.state.deny = null; d.state.fail = /report\/package$/;
    await d.page.click('[data-art-zip]'); await d.page.waitForTimeout(400);
    ok('A11 a failed bundle download says it did not succeed', /没有下载成功/.test(await text(d.page, '[data-art-note]')), await text(d.page, '[data-art-note]'));
    await d.ctx.close(); }

  // states
  { const s = await open(ART, { over: (m, u) => (m === 'GET' && TASK_LIST.test(u.pathname) ? { run_dir: '/data/runs/task_101', entries: [], empty_reason: '任务还没有产生文件' } : undefined) });
    ok('A12 empty: says there are no files and gives the reason the endpoint gave', (await count(s.page, '[data-art-browser][data-state="empty"]')) === 1 && /任务还没有产生文件/.test(await text(s.page, '[data-art-browser]')));
    await shot(s.page, 'artifacts-empty-1440-light.png'); await s.ctx.close(); }
  { const s = await open(ART, { fail: TASK_LIST });
    ok('A12 error: an error state with retry, not an empty list', (await count(s.page, '[data-art-browser][data-state="error"] [data-state="error"]')) === 1 && /不代表这个任务没有产物/.test(await text(s.page, '[data-art-browser]')) && (await count(s.page, '[data-art-browser] button:has-text("重试")')) === 1);
    s.state.fail = null; await s.page.click('[data-art-browser] button:has-text("重试")'); await s.page.waitForTimeout(900);
    ok('A12 重试 reads the list again', (await count(s.page, '[data-art-browser][data-state="ok"]')) === 1);
    await s.ctx.close(); }
  { const s = await open(ART, { deny: TASK_LIST });
    const t = await text(s.page, '[data-art-browser]');
    ok('A12 forbidden: a permission state without retry wording and without a file count', (await count(s.page, '[data-art-browser][data-state="forbidden"] [data-state="permission"]')) === 1 && !RETRY.test(t) && !/\d+ 个文件/.test(t), t.slice(0, 90));
    await shot(s.page, 'artifacts-forbidden-1440-light.png'); await s.ctx.close(); }
  { const s = await open(ART, { hang: TASK_LIST, wait: 1200 });
    ok('A12 slow: a loading state, no count, no empty statement', (await count(s.page, '[data-art-browser][data-state="loading"]')) === 1 && !/个文件|没有产物/.test(await text(s.page, '[data-art-browser]')));
    await shot(s.page, 'artifacts-slow-1440-light.png'); await s.ctx.close(); }
  { const s = await open(ART, { over: tree });
    s.state.fail = TASK_LIST; await s.page.click('[data-art-refresh]'); await s.page.waitForTimeout(700);
    ok('A12 stale: a failed refresh keeps the list and says it may be old', (await count(s.page, '[data-art-browser][data-state="stale"] [data-art-stale]')) === 1 && (await count(s.page, '[data-art-file]')) === WALKED);
    await shot(s.page, 'artifacts-stale-1440-light.png');
    s.state.fail = null; s.state.deny = TASK_LIST; await s.page.click('[data-art-refresh]'); await s.page.waitForTimeout(700);
    ok('A12 stale after a refused refresh: said as a permission matter, no retry offered', /刷新被拒绝/.test(await text(s.page, '[data-art-stale]')) && (await count(s.page, '[data-art-stale] button')) === 0, await text(s.page, '[data-art-stale]'));
    s.state.deny = null; await s.page.click('[data-art-refresh]'); await s.page.waitForTimeout(900);
    ok('A12 a refresh that answers clears the notice', (await count(s.page, '[data-art-stale]')) === 0 && (await count(s.page, '[data-art-browser][data-state="ok"]')) === 1);
    await s.ctx.close(); }
  { const s = await open(ART, { over: tree, fail: /never/ });
    s.state.over = (m, u) => (m === 'GET' && TASK_LIST.test(u.pathname) && u.searchParams.get('prefix') === 'logs' ? { __status: 500 } : tree(m, u));
    await s.page.click('[data-art-refresh]'); await s.page.waitForTimeout(900);
    ok('A12 one directory unread: the others are listed and the unread one is named', /有 1 个目录没有读到（logs）/.test(await text(s.page, '[data-art-unread]')) && (await count(s.page, '[data-art-file]')) === WALKED - 2, await text(s.page, '[data-art-unread]'));
    await s.ctx.close(); }
  // session without a task / unreadable session
  { const s = await open(ART, { over: (m, u) => (m === 'GET' && /\/api\/pentest\/sessions\/41$/.test(u.pathname) ? { ...fixture('GET', u), task_id: null } : undefined) });
    ok('A13 a session without a task says so (empty state)', (await count(s.page, '[data-art-browser][data-state="empty"]')) === 1 && /没有关联的任务/.test(await text(s.page, '[data-art-browser]')));
    await s.ctx.close(); }
  { const s = await open(ART, { deny: /\/api\/pentest\/sessions\/41(\/|$)/ });
    const t = await text(s.page, '[data-art-browser]');
    ok('A13 an unreadable session: permission state, no retry wording', (await count(s.page, '[data-art-browser][data-state="forbidden"]')) === 1 && !RETRY.test(t), t.slice(0, 80));
    await s.ctx.close(); }
  // widths
  for (const [w, th] of REST) {
    const s = await open(ART, { over: tree, width: w, theme: th }); await s.page.click('[data-art-file="run.log"]'); await s.page.waitForTimeout(400);
    const vis = await s.page.evaluate(() => ['[data-art-zip]', '[data-art-upload-btn]', '[data-art-more]', '[data-art-download]'].map((q) => { const r = document.querySelector(q)?.getBoundingClientRect(); return !!r && r.width > 0 && r.right <= innerWidth + 1 && r.left >= -1; }));
    ok(`A14 @${w} ${th} no horizontal overflow; bundle, upload, more and the download control are in reach`, (await overflow(s.page)) <= 1 && vis.every(Boolean), JSON.stringify(vis));
    await shot(s.page, `artifacts-selected-${w}-${th}.png`); await s.ctx.close();
  }
});

// ───────────────────────────── P. Preview ─────────────────────────────
await group('P', async () => {
  const { ctx, page, state } = await open(ART, { over: tree });
  const pick = async (rel) => { const n = state.reqs.length; await page.click(`[data-art-file="${rel}"]`); await page.waitForTimeout(700); return since(state, n); };
  ok('P1 nothing selected: the preview says what can be shown', (await count(page, '[data-art-preview="none"]')) === 1 && /512 kB/.test(await text(page, '[data-art-preview]')));
  let r = await pick('run.log');
  ok('P2 text: read from /artifact, shown as text', r.filter((x) => /\/artifact\?path=run\.log$/.test(x)).length === 1 && (await attr(page, '[data-art-preview]', 'data-art-preview-kind')) === 'text' && /stage S1 start/.test(await text(page, '[data-art-text]')));
  const facts = await text(page, '[data-art-facts]');
  ok('P2 the facts line states type, size, source and state', /类型 文本/.test(facts) && /大小 48 kB/.test(facts) && /来源 任务 #101/.test(facts) && /状态 已就绪/.test(facts), facts);
  await page.click('[data-art-copy]'); await page.waitForTimeout(200);
  ok('P2 复制全文 copies the text and says so', (await attr(page, '[data-art-copy]', 'data-art-copy')) === 'done' && /stage S1 start/.test(await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')));
  r = await pick('report/security_report.json');
  ok('P3 JSON: formatted, with the original one switch away', (await attr(page, '[data-art-preview]', 'data-art-preview-kind')) === 'json' && /\n {2}"file"/.test(await page.locator('[data-art-text]').innerText()) && (await count(page, '[data-art-view="raw"]')) === 1);
  await page.click('[data-art-view="raw"]'); await page.waitForTimeout(150);
  ok('P3 原文 shows what the server sent', /^\{"file":/.test(await page.locator('[data-art-text]').innerText()));
  r = await pick('report/security_report.md');
  ok('P4 Markdown report: read through /report-file and rendered', r.filter((x) => /\/report-file\?name=security_report\.md$/.test(x)).length === 1 && r.every((x) => !/\/artifact\?/.test(x)) && (await count(page, '[data-art-markdown] h1, [data-art-markdown] h2')) >= 1 && (await count(page, '[data-art-markdown] li')) >= 1);
  await page.click('[data-art-view="raw"]'); await page.waitForTimeout(150);
  ok('P4 原文 shows the Markdown source', /^# security_report\.md/.test(await page.locator('[data-art-text]').innerText()));
  r = await pick('screens/login.svg');
  ok('P5 image (SVG): shown as an image with a text alternative', (await attr(page, '[data-art-preview]', 'data-art-preview-kind')) === 'image' && (await page.locator('[data-art-image]').evaluate((i) => i.complete && i.naturalWidth > 0)) && /login\.svg/.test((await attr(page, '[data-art-image]', 'alt')) || '') && (await count(page, '[data-art-copy]')) === 0);
  await shot(page, 'preview-image-1440-light.png');
  r = await pick('screens/home.png');
  ok('P5 image (PNG): decoded from the bytes of /artifact', r.filter((x) => /\/artifact\?path=screens%2Fhome\.png$/.test(x)).length === 1 && (await page.locator('[data-art-image]').evaluate((i) => i.complete && i.naturalWidth === 8)));
  r = await pick('logs/full.log');
  let t = await text(page, '[data-art-preview]');
  ok('P6 over 512 kB: no request; size, type, the reason and the download control', r.length === 0 && (await attr(page, '[data-art-preview]', 'data-art-preview')) === 'unsupported' && /2\.0 MB/.test(t) && /超过了在线预览的上限 512 kB/.test(t) && /状态 不能预览/.test(t) && (await count(page, '[data-art-download]')) === 1, t.slice(0, 120));
  await shot(page, 'preview-too-large-1440-light.png');
  r = await pick('unpacked/classes.dex');
  t = await text(page, '[data-art-preview]');
  ok('P7 binary: no request; says it cannot be shown, with size, type and download', r.length === 0 && /二进制/.test(t) && /8\.2 MB/.test(t) && /不能在线预览/.test(t) && (await count(page, '[data-art-download]')) === 1, t.slice(0, 120));
  await page.click('[data-art-preview-close]'); await page.waitForTimeout(150);
  ok('P8 关闭预览 clears the selection', (await count(page, '[data-art-preview="none"]')) === 1 && (await count(page, '[data-art-file][aria-current="true"]')) === 0);
  await clean(page, '[data-art-browser]', 'P9 light');
  ok('P9 no page error', state.errors.length === 0, state.errors.join('; '));
  // states of the preview
  state.over = (m, u) => (m === 'GET' && /\/artifact$/.test(u.pathname) ? '' : tree(m, u));
  await pick('logs/crash.txt');
  ok('P10 empty: an empty file says it is empty', /这个文件是空的/.test(await text(page, '[data-art-preview]')));
  state.over = tree; state.fail = TASK_FILE;
  await pick('run.log');
  ok('P10 error: says the content was not read, offers retry and the download stays', (await attr(page, '[data-art-preview]', 'data-art-preview')) === 'error' && /状态 读取失败/.test(await text(page, '[data-art-facts]')) && (await count(page, '[data-art-preview] button:has-text("重试")')) === 1 && (await count(page, '[data-art-download]')) === 1);
  await shot(page, 'preview-error-1440-light.png');
  state.fail = null; await page.click('[data-art-preview] button:has-text("重试")'); await page.waitForTimeout(600);
  ok('P10 重试 reads the file', (await attr(page, '[data-art-preview]', 'data-art-preview')) === 'ok');
  state.deny = TASK_FILE;
  await pick('logs/crash.txt');
  t = await text(page, '[data-art-preview]');
  ok('P10 forbidden: a permission state without retry wording', (await attr(page, '[data-art-preview]', 'data-art-preview')) === 'forbidden' && /没有权限读取这个文件/.test(t) && /状态 无权限/.test(t) && !RETRY.test(t), t.slice(0, 100));
  await shot(page, 'preview-forbidden-1440-light.png');
  state.deny = null; state.hang = TASK_FILE;
  await pick('unpacked/AndroidManifest.xml');
  ok('P10 slow: a loading state that says 读取中, no content', (await attr(page, '[data-art-preview]', 'data-art-preview')) === 'loading' && /状态 读取中/.test(await text(page, '[data-art-facts]')) && (await count(page, '[data-art-text]')) === 0);
  await shot(page, 'preview-slow-1440-light.png');
  state.hang = null;
  // stale: the list refresh fails while a preview is open; the preview keeps what it read
  await pick('run.log');
  state.fail = TASK_LIST; await page.click('[data-art-refresh]'); await page.waitForTimeout(700);
  ok('P10 stale: a failed refresh of the list keeps the open preview and says the list may be old', (await count(page, '[data-art-stale]')) === 1 && /stage S1 start/.test(await text(page, '[data-art-text]')));
  await shot(page, 'preview-stale-1440-light.png');
  await ctx.close();
  // long text is cut with a statement
  { const big = 'x'.repeat(300 * 1024 + 500);
    const s = await open(ART, { over: (m, u) => (m === 'GET' && /\/artifact$/.test(u.pathname) ? big : tree(m, u)) });
    await s.page.click('[data-art-file="run.log"]'); await s.page.waitForTimeout(900);
    ok('P11 a long text is cut and the preview says how much is missing', /还有 500 个字符没有显示/.test(await text(s.page, '[data-art-cut]')), await text(s.page, '[data-art-cut]'));
    await s.ctx.close(); }
  for (const [w, th] of [[390, 'light'], [1440, 'dark']]) {
    const s = await open(ART, { over: tree, width: w, theme: th }); await s.page.click('[data-art-file="report/security_report.md"]'); await s.page.waitForTimeout(700);
    ok(`P12 @${w} ${th} the preview is in the page without horizontal overflow`, (await overflow(s.page)) <= 1 && (await s.page.locator('[data-art-markdown]').isVisible()));
    if (th === 'dark') await clean(s.page, '[data-art-browser]', `P12 @${w} dark`);
    await shot(s.page, `preview-markdown-${w}-${th}.png`); await s.ctx.close();
  }
});

// ───────────────────────────── K. 加固信息 ─────────────────────────────
await group('K', async () => {
  const PACKER = /\/api\/pentest\/sessions\/41\/packer$/;
  const { ctx, page, state } = await open(PACK);
  ok('K1 the panel reads /packer once and shows the family, confidence and evidence', state.reqs.filter((x) => /\/packer$/.test(x)).length === 1 && /加固方案：example-shell/.test(await text(page, '[data-packer-head]')) && /置信度 82%/.test(await text(page, '[data-packer-head]')) && /libshell\.so/.test(await text(page, '[data-packer-evidence]')));
  ok('K1 the scope line counts the vectors with a hit', /六个检测面，检出 3 个/.test(await text(page, '[data-packer-scope]')), await text(page, '[data-packer-scope]'));
  const rows = await page.locator('[data-packer-vector]').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  ok('K1 six vectors, each a glyph and a word', rows.length === 6 && rows.filter((x) => /检出 \d+ 处/.test(x)).length === 3 && rows.filter((x) => /未检出特征/.test(x)).length === 3 && (await count(page, '[data-packer-vector] [data-glyph]')) === 6, rows.join(' | '));
  ok('K1 the analysis-environment rows are kept', (await page.locator('[data-packer-environment] dt').count()) === 4);
  await page.click('[data-packer-vector="frida"]'); await page.waitForTimeout(150);
  ok('K2 a vector opens its evidence and says it is open', (await attr(page, '[data-packer-vector="frida"]', 'aria-expanded')) === 'true' && /strstr/.test(await text(page, '[data-packer-detail]')));
  await page.click('[data-packer-vector="proxy"]'); await page.waitForTimeout(150);
  ok('K2 one vector open at a time; one without a hit says so', (await count(page, '[data-packer-detail]')) === 1 && /没有发现这类检测特征/.test(await text(page, '[data-packer-detail]')));
  await page.locator('[data-packer-vector="root"]').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  ok('K2 Enter opens a vector from the keyboard', (await attr(page, '[data-packer-vector="root"]', 'aria-expanded')) === 'true');
  const n0 = state.reqs.length;
  await page.click('[data-packer-refresh]'); await page.waitForTimeout(600);
  ok('K3 重扫检测面 reads /packer?refresh=1', since(state, n0).filter((x) => /\/packer\?refresh=1$/.test(x)).length === 1, since(state, n0).join(' | '));
  await clean(page, '[data-packer-panel]', 'K4 light');
  const stops = await tabStops(page, '[data-packer-panel]', 20);
  ok('K4 the refresh control and the six vectors are tab stops with a focus indicator', stops.seen.filter((s) => s.includes('data-packer-vector')).length === 6 && stops.seen.some((s) => s.includes('data-packer-refresh')) && stops.bare === 0, `${stops.seen.length} stops, ${stops.bare} without indicator`);
  ok('K4 no page error', state.errors.length === 0, state.errors.join('; '));
  await shot(page, 'packer-1440-light.png');
  // stale
  state.fail = PACKER; await page.click('[data-packer-refresh]'); await page.waitForTimeout(600);
  ok('K5 stale: a failed rescan keeps what was read and says it may be old', (await count(page, '[data-packer-panel][data-state="stale"] [data-packer-stale]')) === 1 && /example-shell/.test(await text(page, '[data-packer-head]')));
  await shot(page, 'packer-stale-1440-light.png');
  state.fail = null; state.deny = PACKER; await page.click('[data-packer-refresh]'); await page.waitForTimeout(600);
  ok('K5 stale after a refused rescan: a permission matter, no retry offered', /重新读取被拒绝/.test(await text(page, '[data-packer-stale]')) && (await count(page, '[data-packer-stale] button')) === 0);
  await ctx.close();
  { const s = await open(PACK, { over: (m, u) => (PACKER.test(u.pathname) ? { status: 'ok', family: 'unknown', family_confidence: 0, vectors: {} } : undefined) });
    ok('K5 empty: no family and no hit is said in words, not as an error', (await count(s.page, '[data-packer-panel][data-state="empty"]')) === 1 && /没有识别到已知的加固方案/.test(await text(s.page, '[data-packer-head]')) && /检出 0 个/.test(await text(s.page, '[data-packer-scope]')));
    await shot(s.page, 'packer-empty-1440-light.png'); await s.ctx.close(); }
  { const s = await open(PACK, { fail: PACKER });
    ok('K5 error: an error state with retry that does not read as “not packed”', (await count(s.page, '[data-packer-panel][data-state="error"]')) === 1 && /不代表应用没有加固/.test(await text(s.page, '[data-packer-panel]')) && (await count(s.page, '[data-packer-vector]')) === 0);
    s.state.fail = null; await s.page.click('[data-packer-panel] button:has-text("重试")'); await s.page.waitForTimeout(600);
    ok('K5 重试 reads again', (await count(s.page, '[data-packer-panel][data-state="ok"]')) === 1);
    await s.ctx.close(); }
  { const s = await open(PACK, { over: (m, u) => (PACKER.test(u.pathname) ? { status: 'error', family: 'unknown', family_confidence: 0, vectors: {} } : undefined) });
    ok('K5 a 200 answer with status "error" is a failed read, not an empty result', (await count(s.page, '[data-packer-panel][data-state="error"]')) === 1);
    await s.ctx.close(); }
  { const s = await open(PACK, { deny: PACKER });
    const t = await text(s.page, '[data-packer-panel]');
    ok('K5 forbidden: a permission state without retry wording', (await count(s.page, '[data-packer-panel][data-state="forbidden"] [data-state="permission"]')) === 1 && !RETRY.test(t), t.slice(0, 80));
    await shot(s.page, 'packer-forbidden-1440-light.png'); await s.ctx.close(); }
  { const s = await open(PACK, { hang: PACKER, wait: 1200 });
    ok('K5 slow: a loading state that says the first computation can take minutes', (await count(s.page, '[data-packer-panel][data-state="loading"]')) === 1 && /可能需要几分钟/.test(await text(s.page, '[data-packer-panel]')));
    await shot(s.page, 'packer-slow-1440-light.png'); await s.ctx.close(); }
  for (const [w, th] of REST) {
    const s = await open(PACK, { width: w, theme: th }); await s.page.click('[data-packer-vector="frida"]'); await s.page.waitForTimeout(150);
    ok(`K6 @${w} ${th} no horizontal overflow`, (await overflow(s.page)) <= 1);
    if (th === 'dark') await clean(s.page, '[data-packer-panel]', `K6 @${w} dark`);
    await shot(s.page, `packer-${w}-${th}.png`); await s.ctx.close();
  }
});

// ───────────────────────────── D. 版本对比 ─────────────────────────────
await group('D', async () => {
  const VULNS = /\/api\/pentest\/sessions\/\d+\/vulns$/;
  const LIST = /\/api\/pentest\/sessions$/;
  // Session 40 is the baseline; 41 lost one finding, gained two and changed the state of one.
  const diffOver = (m, u) => {
    if (m !== 'GET' || !VULNS.test(u.pathname)) return undefined;
    const d = JSON.parse(JSON.stringify(fixture('GET', u)));
    if (/\/41\/vulns$/.test(u.pathname)) {
      const gone = d.confirmed.shift();
      const moved = d.pending.shift() || d.confirmed.shift();
      if (moved) { moved.state = 'excluded'; d.excluded.push(moved); }
      d.pending.push({ id: 'n1', state: 'pending', severity: 'critical', title: '示例发现: 新增的严重问题', masvs: 'MASVS-AUTH-1', evidence: 'com/example/New.java:3\n    token', phase: 'dynamic' },
        { id: 'n2', state: 'pending', severity: 'low', title: '示例发现: 新增的低优先级问题', phase: 'static' });
      d.counts = { confirmed: d.confirmed.length, pending: d.pending.length, excluded: d.excluded.length };
      void gone;
    }
    return d;
  };
  const { ctx, page, state } = await open(DIFF, { over: diffOver, downloads: true });
  const reads = state.reqs.filter((x) => /\/api\/pentest\/sessions$|\/vulns$/.test(x));
  ok('D1 reads the session list and the findings of the two sessions, nothing else new', reads.filter((x) => /\/sessions$/.test(x)).length >= 1 && reads.filter((x) => /\/40\/vulns$/.test(x)).length === 1 && reads.filter((x) => /\/41\/vulns$/.test(x)).length === 1, reads.join(' | '));
  ok('D1 both pickers are set to sessions of this project', /#40/.test(await text(page, '[data-testid="diff-side-A"]')) && /#41/.test(await text(page, '[data-testid="diff-side-B"]')));
  const stats = await text(page, '[data-diff-stats]');
  ok('D1 the counts are a sign and a word each', /\+ 新增 2/.test(stats) && /− 消除 1/.test(stats) && /~ 变更 1/.test(stats), stats);
  ok('D2 two columns: what is only in A or changed, and what is new in B', (await count(page, '[data-diff-col="A"] [data-diff-row]')) === 2 && (await count(page, '[data-diff-col="B"] [data-diff-row]')) === 2);
  const kinds = await page.locator('[data-diff-kind]').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  ok('D2 a row says what changed with a sign and a word', kinds.sort().join('|') === ['+ 新增', '+ 新增', '~ 变更', '− 消除'].sort().join('|'), kinds.join('|'));
  const marks = await page.evaluate(() => {
    const probe = document.createElement('i'); probe.className = 'border-l-jz-line-finding'; probe.style.borderLeftStyle = 'solid'; document.body.appendChild(probe); const orange = getComputedStyle(probe).borderLeftColor; probe.remove();
    return [...document.querySelectorAll('[data-diff-row]')].map((li) => { const cs = getComputedStyle(li); return { line: cs.borderLeftColor === orange, w: cs.borderLeftWidth, p: li.querySelector('[data-severity]')?.getAttribute('data-severity'), cap: !!li.querySelector('[data-row-cap]') }; });
  });
  ok('D2 every row is a finding: orange line, 3 px with the cap on P0 / P1, 2 px otherwise, shape and P label', marks.every((m) => m.line && m.p && (/P[01]/.test(m.p) ? m.w === '3px' && m.cap : m.w === '2px' && !m.cap)), JSON.stringify(marks));
  await page.click('[data-diff-col="B"] [data-testid="diff-row-added"] >> nth=0'); await page.waitForTimeout(150);
  ok('D3 a row opens its evidence and says it is open', (await attr(page, '[data-diff-col="B"] [data-testid="diff-row-added"] >> nth=0', 'aria-expanded')) === 'true' && (await count(page, '[data-testid="diff-detail"]')) === 1 && /B 新增/.test(await text(page, '[data-testid="diff-detail"]')));
  await page.locator('[data-diff-col="A"] [data-diff-row] button').first().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  ok('D3 Enter opens a row; one row open at a time', (await count(page, '[data-testid="diff-detail"]')) === 1 && (await count(page, '[data-diff-col="A"] [data-testid="diff-detail"]')) === 1);
  await page.click('[data-testid="diff-fold-A"]'); await page.waitForTimeout(150);
  ok('D3 a column folds and says so', (await attr(page, '[data-testid="diff-fold-A"]', 'aria-expanded')) === 'false' && (await count(page, '[data-diff-col="A"] [data-diff-row]')) === 0);
  await page.click('[data-testid="diff-fold-A"]'); await page.waitForTimeout(100);
  await page.click('[data-export-toggle="diff"]'); await page.waitForTimeout(200);
  ok('D4 导出差异 is kept (the export menu of the comparison)', (await count(page, '[data-export-menu="diff"] button')) >= 3);
  await page.keyboard.press('Escape');
  await clean(page, '[data-diff-panel]', 'D5 light');
  ok('D5 no page error', state.errors.length === 0, state.errors.join('; '));
  await shot(page, 'diff-1440-light.png');
  await ctx.close();
  { const s = await open(DIFF);
    ok('D6 empty: two sessions with the same findings say so, with 0 in every count', (await count(s.page, '[data-diff-panel][data-state="empty"] [data-diff-same]')) === 1 && /新增 0/.test(await text(s.page, '[data-diff-stats]')));
    await shot(s.page, 'diff-empty-1440-light.png'); await s.ctx.close(); }
  { const s = await open(DIFF, { fail: VULNS });
    const t = await text(s.page, '[data-diff-panel]');
    ok('D6 error: an error state with retry; no count is stated and it does not read as “identical”', (await count(s.page, '[data-diff-panel][data-state="error"]')) === 1 && /不代表两个版本一致/.test(t) && /新增 —/.test(await text(s.page, '[data-diff-stats]')), (await text(s.page, '[data-diff-stats]')));
    s.state.fail = null; await s.page.click('[data-diff-panel] button:has-text("重试")'); await s.page.waitForTimeout(700);
    ok('D6 重试 reads again', ['ok', 'empty'].includes(await attr(s.page, '[data-diff-panel]', 'data-state')));
    await s.ctx.close(); }
  { const s = await open(DIFF, { fail: LIST });
    ok('D6 error on the session list: said as that, with retry', /会话列表没有读到/.test(await text(s.page, '[data-diff-panel]')));
    await s.ctx.close(); }
  { const s = await open(DIFF, { deny: VULNS });
    const t = await text(s.page, '[data-diff-panel]');
    ok('D6 forbidden: a permission state without retry wording, no count', (await count(s.page, '[data-diff-panel][data-state="forbidden"] [data-state="permission"]')) === 1 && !RETRY.test(t) && /新增 —/.test(t), t.slice(0, 120));
    await shot(s.page, 'diff-forbidden-1440-light.png'); await s.ctx.close(); }
  { const s = await open(DIFF, { hang: VULNS, wait: 1300 });
    ok('D6 slow: a loading state, no count, no “identical”', (await count(s.page, '[data-diff-panel][data-state="loading"]')) === 1 && /新增 —/.test(await text(s.page, '[data-diff-stats]')) && (await count(s.page, '[data-diff-same]')) === 0);
    await shot(s.page, 'diff-slow-1440-light.png'); await s.ctx.close(); }
  { // stale: the comparison was made; a later read of another pair fails → the old result is not kept as if current
    const s = await open(DIFF, { over: diffOver });
    s.state.fail = VULNS;
    await s.page.click('[data-stc-trigger="diff-B"]'); await s.page.waitForTimeout(300);
    if (!(await s.page.locator('[data-stc-item="44"]').count())) { await s.page.fill('[data-stc-search]', '44'); await s.page.waitForTimeout(300); }
    await s.page.click('[data-stc-item="44"]'); await s.page.waitForTimeout(900);
    const st = await attr(s.page, '[data-diff-panel]', 'data-state');
    ok('D6 stale: when a new pair cannot be read, the earlier result is not shown as if it were this pair', st === 'error' && (await count(s.page, '[data-diff-row]')) === 0 && /新增 —/.test(await text(s.page, '[data-diff-stats]')), `state ${st}`);
    await shot(s.page, 'diff-stale-1440-light.png'); await s.ctx.close(); }
  for (const [w, th] of REST) {
    const s = await open(DIFF, { over: diffOver, width: w, theme: th });
    const cols = await s.page.evaluate(() => { const a = document.querySelector('[data-diff-col="A"]')?.getBoundingClientRect(); const b = document.querySelector('[data-diff-col="B"]')?.getBoundingClientRect(); return a && b ? (Math.abs(a.top - b.top) < 2 ? 'side' : 'stacked') : 'none'; });
    ok(`D7 @${w} ${th} no horizontal overflow; columns ${w > 760 ? 'side by side' : 'stacked'}`, (await overflow(s.page)) <= 1 && cols === (w > 760 ? 'side' : 'stacked'), cols);
    if (th === 'dark') await clean(s.page, '[data-diff-panel]', `D7 @${w} dark`);
    await shot(s.page, `diff-${w}-${th}.png`); await s.ctx.close();
  }
});

// ───────────────────────────── R. Report reader ─────────────────────────────
const GROUPED = /\/api\/pentest\/sessions\/41\/vulns\/grouped$/;
const sixty = (m, u) => (m === 'GET' && GROUPED.test(u.pathname) ? { status: 'ok', cards: manyCards(60) } : undefined);
await group('R', async () => {
  const { ctx, page, state } = await open(REPORT);
  ok('R1 the draft is in the shared reader; the old report view is gone', (await count(page, '[data-report-draft] [data-reader="own"]')) === 1 && (await count(page, '.wb-report, .wb-report-toc')) === 0);
  ok('R1 it issues no request of its own', state.reqs.every((x) => !/report\/summary|report-file|\/report$/.test(x)));
  const chapters = await page.locator('[data-chapter-nav] [data-chapter]').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  ok('R1 four chapters, the findings chapter with its count', chapters.join(' | ') === '1 执行结论与口径 | 2 风险发现 7 | 3 覆盖与限制 | 4 复核状态', chapters.join(' | '));
  ok('R1 the first chapter is marked current', (await attr(page, '[data-chapter="summary"]', 'aria-current')) === 'true');
  ok('R2 status line: 草稿 while a finding waits for review, with the number', (await attr(page, '[data-report-status]', 'data-report-status')) === 'draft' && /状态 草稿 4 条待复核/.test(await text(page, '[data-reader-status]')), await text(page, '[data-reader-status]'));
  ok('R2 the status is a glyph and a word', (await count(page, '[data-reader-status] [data-glyph]')) === 1);
  // every record
  const rows = await count(page, '[data-report-finding]');
  ok('R3 the table lists all 7 valid findings (the old view stopped at 6)', rows === 7 && (await attr(page, '[data-report-findings]', 'data-total')) === '7' && (await count(page, '[data-report-finding][data-on-page="yes"]')) === 7);
  const enc = await page.evaluate(() => {
    const probe = document.createElement('i'); probe.className = 'border-l-jz-line-finding'; probe.style.borderLeftStyle = 'solid'; document.body.appendChild(probe); const orange = getComputedStyle(probe).borderLeftColor; probe.remove();
    return [...document.querySelectorAll('[data-report-finding]')].map((tr) => { const td = tr.querySelector('td'); const cs = getComputedStyle(td); return { p: tr.getAttribute('data-row-priority'), line: cs.borderLeftColor === orange, w: cs.borderLeftWidth, cap: !!td.querySelector('[data-row-cap]'), sev: !!tr.querySelector('[data-severity]'), st: !!tr.querySelector('[data-review]') }; });
  });
  ok('R3 each row carries the finding marks: orange line by width, cap on P0 / P1, shape with P label, status glyph with word', enc.every((e) => e.line && e.sev && e.st && (/P[01]/.test(e.p) ? e.w === '3px' && e.cap : e.w === '2px' && !e.cap)), JSON.stringify(enc.slice(0, 3)));
  ok('R3 a table of 7 has no pager', (await count(page, '[data-report-findings-pager]')) === 0);
  // scroll highlight
  await page.setViewportSize({ width: 1440, height: 560 }); await page.waitForTimeout(200);
  await page.locator('[data-reader-scroll]').evaluate((el) => { const t = el.querySelector('[data-reader-chapter="findings"]'); el.scrollTop = t.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 10; }); await page.waitForTimeout(250);
  ok('R4 scrolling marks the chapter in view', (await attr(page, '[data-chapter="findings"]', 'aria-current')) === 'true' && (await count(page, '[data-chapter][aria-current="true"]')) === 1, await page.locator('[data-chapter][aria-current="true"]').getAttribute('data-chapter'));
  const navTop0 = await page.locator('[data-chapter-nav]').evaluate((e) => e.getBoundingClientRect().top);
  await page.locator('[data-reader-scroll]').evaluate((el) => { el.scrollTop = el.scrollHeight; }); await page.waitForTimeout(250);
  const navTop1 = await page.locator('[data-chapter-nav]').evaluate((e) => e.getBoundingClientRect().top);
  ok('R4 the chapter navigation stays in place while the report scrolls', Math.abs(navTop0 - navTop1) < 1 && (await attr(page, '[data-chapter="review"]', 'aria-current')) === 'true', `${navTop0} → ${navTop1}`);
  await page.click('[data-chapter="findings"]'); await page.waitForTimeout(900);
  const inView = await page.evaluate(() => { const sc = document.querySelector('[data-reader-scroll]').getBoundingClientRect(); const c = document.querySelector('[data-reader-chapter="findings"]').getBoundingClientRect(); return c.top >= sc.top - 2 && c.top < sc.top + 80; });
  ok('R4 picking a chapter scrolls it to the top and marks it', inView && (await attr(page, '[data-chapter="findings"]', 'aria-current')) === 'true');
  await page.setViewportSize({ width: 1440, height: 900 });
  // keyboard
  await page.locator('[data-chapter="review"]').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
  ok('R5 Enter on a chapter jumps to it', (await attr(page, '[data-chapter="review"]', 'aria-current')) === 'true');
  const stops = await tabStops(page, '[data-report-draft]', 40);
  const need = ['data-report-export-menu', 'data-chapter=summary', 'data-chapter=review', 'data-reader-scroll', 'data-report-finding-open', 'data-report-open-findings'];
  const missing = need.filter((h) => !stops.seen.some((s) => s.includes(h)));
  ok('R5 export, chapters, the scrolling text, the finding links and 在风险发现里复核 are tab stops with a focus indicator', missing.length === 0 && stops.bare === 0, `missing ${missing.join(',') || 'none'}; without indicator ${stops.bare}`);
  await page.locator('[data-report-finding-open]').first().click(); await page.waitForTimeout(500);
  ok('R5 a finding in the table opens it in 风险发现', /view=findings/.test(page.url()) && /finding=/.test(page.url()), page.url().split('#')[1]);
  await page.evaluate((h) => { location.hash = h; }, '#' + REPORT); await page.waitForSelector('[data-report-open-findings]');
  await page.click('[data-report-open-findings]'); await page.waitForTimeout(400);
  ok('R5 在风险发现里复核 goes to the findings', /view=findings/.test(page.url()));
  ok('R5 no page error', state.errors.length === 0, state.errors.join('; '));
  await ctx.close();
  { const s = await open(REPORT); await clean(s.page, '[data-report-draft]', 'R6 light'); await shot(s.page, 'report-1440-light.png'); await s.ctx.close(); }
  { const s = await open(REPORT, { theme: 'dark' }); await clean(s.page, '[data-report-draft]', 'R6 dark'); await shot(s.page, 'report-1440-dark.png'); await s.ctx.close(); }
  // ready: every finding has an outcome
  { const s = await open(REPORT, { over: (m, u) => { if (m !== 'GET' || !GROUPED.test(u.pathname)) return undefined; const d = JSON.parse(JSON.stringify(fixture('GET', u))); for (const c of d.cards) for (const i of c.instances || []) i.state = 'confirmed'; return d; } });
    ok('R7 可发布 when no finding waits for review', (await attr(s.page, '[data-report-status]', 'data-report-status')) === 'ready' && /状态 可发布 7 条发现都有复核结论/.test(await text(s.page, '[data-reader-status]')), await text(s.page, '[data-reader-status]'));
    await shot(s.page, 'report-ready-1440-light.png'); await s.ctx.close(); }
  // 60 records: nothing silently cut
  { const s = await open(REPORT, { over: sixty });
    ok('R8 60 findings: all 60 are in the table, 25 in view, and the range is stated', (await count(s.page, '[data-report-finding]')) === 60 && (await count(s.page, '[data-report-finding][data-on-page="yes"]')) === 25 && /第 1–25 条，共 60 条/.test(await text(s.page, '[data-report-findings-range]')) && /导出和打印包含全部 60 条/.test(await text(s.page, '[data-report-findings-pager]')), await text(s.page, '[data-report-findings-range]'));
    ok('R8 the chapter count and the summary say 60', /2 风险发现 60/.test(await text(s.page, '[data-chapter="findings"]')) && /全部 60 条未降噪的发现/.test(await text(s.page, '[data-reader-chapter="summary"]')));
    await s.page.click('[data-report-findings-next]'); await s.page.waitForTimeout(150);
    ok('R8 下一页 shows the next 25', /第 26–50 条/.test(await text(s.page, '[data-report-findings-range]')) && (await s.page.locator('[data-report-finding][data-on-page="yes"]').first().innerText()).includes('示例发现 26'));
    await s.page.click('[data-report-findings-next]'); await s.page.waitForTimeout(150);
    ok('R8 the last page has the remaining 10 and 下一页 is disabled', (await count(s.page, '[data-report-finding][data-on-page="yes"]')) === 10 && (await s.page.locator('[data-report-findings-next]').isDisabled()));
    await s.page.click('[data-report-findings-all]'); await s.page.waitForTimeout(150);
    ok('R8 展开全部 shows all 60 on screen', (await count(s.page, '[data-report-finding][data-on-page="yes"]')) === 60 && (await attr(s.page, '[data-report-findings-all]', 'aria-pressed')) === 'true');
    await shot(s.page, 'report-60-1440-light.png'); await s.ctx.close(); }
  // states
  { const s = await open(REPORT, { over: (m, u) => (m === 'GET' && GROUPED.test(u.pathname) ? { status: 'ok', cards: [] } : undefined) });
    ok('R9 empty: a report without findings says so, is a draft, and has no table', (await count(s.page, '[data-report-draft][data-state="empty"]')) === 1 && (await count(s.page, '[data-report-nofindings]')) === 1 && (await count(s.page, '[data-report-findings]')) === 0 && /草稿 还没有风险发现/.test(await text(s.page, '[data-reader-status]')));
    await shot(s.page, 'report-empty-1440-light.png'); await s.ctx.close(); }
  { const s = await open(REPORT, { fail: /\/api\/pentest\/sessions\/41(\/|$)/ });
    ok('R9 error: an error state with retry and no empty report', (await count(s.page, '[data-report-draft][data-state="error"]')) === 1 && (await count(s.page, '[data-reader]')) === 0 && /现在生成的报告会是空的/.test(await text(s.page, '[data-report-draft]')));
    await shot(s.page, 'report-error-1440-light.png'); await s.ctx.close(); }
  { const s = await open(REPORT, { deny: /\/api\/pentest\/sessions\/41(\/|$)/ });
    const t = await text(s.page, '[data-report-draft]');
    ok('R9 forbidden: a permission state without retry wording, no number, no export', (await count(s.page, '[data-report-draft][data-state="forbidden"] [data-state="permission"]')) === 1 && !RETRY.test(t) && !/\d+ 条/.test(t) && (await count(s.page, '[data-report-export-menu]')) === 0, t.slice(0, 90));
    await shot(s.page, 'report-forbidden-1440-light.png'); await s.ctx.close(); }
  { const s = await open(REPORT, { deny: GROUPED });
    ok('R9 forbidden on the findings read alone: still a permission state, not a report with 0 findings', (await count(s.page, '[data-report-draft][data-state="forbidden"]')) === 1);
    await s.ctx.close(); }
  { const s = await open(REPORT, { hang: /\/api\/pentest\/sessions\/41(\/|$)/, wait: 1200 });
    ok('R9 slow: a loading state, no number', (await count(s.page, '[data-report-draft][data-state="loading"]')) === 1 && !/\d+ 条/.test(await text(s.page, '[data-report-draft]')));
    await shot(s.page, 'report-slow-1440-light.png'); await s.ctx.close(); }
  { const s = await open(REPORT);
    s.state.fail = /\/api\/pentest\/sessions\/41\/timeline$/;
    await s.page.waitForSelector('[data-report-stale]', { timeout: 15000 }).catch(() => {});
    ok('R9 stale: a source that stops answering is named above the report, which stays', (await count(s.page, '[data-report-draft][data-state="stale"]')) === 1 && /没有读到：阶段时间线/.test(await text(s.page, '[data-report-stale]')) && (await count(s.page, '[data-report-finding]')) === 7, await text(s.page, '[data-report-stale]'));
    await shot(s.page, 'report-stale-1440-light.png'); await s.ctx.close(); }
  // widths
  for (const [w, th] of REST) {
    const s = await open(REPORT, { width: w, theme: th });
    const nav = await s.page.evaluate(() => { const n = document.querySelector('[data-chapter-nav]').getBoundingClientRect(); const p = document.querySelector('[data-reader-paper]').getBoundingClientRect(); return n.bottom <= p.top + 1 ? 'above' : 'beside'; });
    const clipped = await s.page.evaluate(() => [...document.querySelectorAll('[data-report-finding][data-on-page="yes"] td')].filter((td) => { const r = td.getBoundingClientRect(); const p = document.querySelector('[data-reader-paper]').getBoundingClientRect(); return r.width > 0 && (r.right > p.right + 1 || r.left < p.left - 1); }).length);
    ok(`R10 @${w} ${th} no horizontal overflow; chapters ${w >= 1024 ? 'beside' : 'above'} the paper; no table cell outside it`, (await overflow(s.page)) <= 1 && nav === (w >= 1024 ? 'beside' : 'above') && clipped === 0, `${nav}, ${clipped} cells outside`);
    await shot(s.page, `report-${w}-${th}.png`); await s.ctx.close();
  }
  // /reports?taskId= uses the same frame and keeps its content
  { const s = await open('/reports?taskId=100', { wait: 2200 });
    ok('R11 /reports?taskId= sits in the same reader frame', (await count(s.page, '[data-reader="page"][data-reports-detail]')) === 1 && (await count(s.page, '[data-toc-nav][data-chapter-nav]')) === 1);
    const toc = await s.page.locator('[data-toc-item]').evaluateAll((els) => els.map((e) => e.getAttribute('data-toc-item')));
    ok('R11 its five sections, import, task switcher and manual entry are what they were', toc.join(',') === 'mx,cm,vulns,sess,pipe' && (await count(s.page, '[data-detail-import]')) === 1 && (await count(s.page, '[data-pipeline-reports]')) === 1 && (await count(s.page, '[data-detail-header]')) === 1);
    await s.page.click('[data-menu-btn]'); await s.page.waitForTimeout(200);
    const items = await s.page.locator('[data-menu-panel] [data-detail-export]').evaluateAll((els) => els.map((e) => e.getAttribute('data-detail-export')));
    ok('R11 its one export menu keeps all ten items and their hooks', items.join(',') === 'vulns-csv,matrix-csv,matrix-json,full-json,full-md,evidence,print,pdf,exec,zip' && (await count(s.page, '[data-menu-panel] [data-export-btn]')) === 4 && (await count(s.page, '[data-matrix-export-csv], [data-matrix-export-json]')) === 2, items.join(','));
    await s.page.keyboard.press('Escape'); await s.page.waitForTimeout(150);
    ok('R11 Escape closes the menu and returns focus to 导出', (await count(s.page, '[data-menu-panel]')) === 0 && (await s.page.evaluate(() => document.activeElement?.hasAttribute('data-menu-btn'))));
    await s.page.click('[data-toc-item="vulns"]'); await s.page.waitForTimeout(900);
    ok('R11 a chapter is marked when picked', (await attr(s.page, '[data-toc-item="vulns"]', 'aria-current')) === 'true');
    await s.page.locator('[data-reports-page]').evaluate((el) => { el.scrollTop = el.scrollHeight; }); await s.page.waitForTimeout(900);
    ok('R11 and when scrolled to: the last chapter at the end of the page', (await attr(s.page, '[data-toc-item="pipe"]', 'aria-current')) === 'true', await s.page.locator('[data-toc-item][aria-current="true"]').getAttribute('data-toc-item').catch(() => 'none'));
    ok('R11 this page is not marked for the reader print sheet (its own print view is unchanged)', (await count(s.page, '[data-reader-print]')) === 0);
    ok('R11 no page error', s.state.errors.length === 0, s.state.errors.join('; '));
    await shot(s.page, 'reports-reader-1440-light.png'); await s.ctx.close(); }
  for (const [w, th] of REST) {
    const s = await open('/reports?taskId=100', { width: w, theme: th, wait: 2200 });
    ok(`R11 @${w} ${th} /reports?taskId= no horizontal overflow`, (await overflow(s.page)) <= 1);
    await shot(s.page, `reports-reader-${w}-${th}.png`);
    await s.ctx.close();
  }
});

// ───────────────────────────── X. Export and print ─────────────────────────────
await group('X', async () => {
  const { ctx, page, state } = await open(REPORT, { over: sixty, downloads: true });
  const triggers = await page.evaluate(() => [...document.querySelectorAll('[data-report-draft] button:not([data-report-finding-open])')].filter((b) => /导出|打印|JSON|PDF/.test(b.innerText)).map((b) => b.innerText.trim()));
  ok('X1 one export control on the draft (the two pairs of buttons are gone)', triggers.join('|') === '导出', triggers.join('|'));
  await page.click('[data-report-export-menu]'); await page.waitForTimeout(200);
  const items = await page.locator('[data-reader-export-panel] [role="menuitem"]').evaluateAll((els) => els.map((e) => e.innerText.trim()));
  ok('X1 the menu: JSON, print / PDF, and the report workspace when the session has a task', items.length === 3 && /^JSON（全部 60 条发现）$/.test(items[0]) && items[1] === '打印或另存为 PDF' && items[2] === '在报告工作区打开', items.join(' | '));
  const n0 = state.reqs.length;
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-report-export="json"]')]);
  const json = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  ok('X2 the JSON keeps its file name, field names and structure', dl.suggestedFilename() === 'workbench-report.json' && Object.keys(json).join(',') === 'title,package,generatedAt,counts,stage,findings' && ['findings', 'instances', 'noise', 'steps'].every((k) => k in json.counts) && ['id', 'ruleId', 'title', 'priority', 'status', 'instanceCount', 'instances'].every((k) => k in json.findings[0]), Object.keys(json).join(','));
  ok('X2 the JSON holds all 60 findings, not the first six', json.findings.length === 60 && json.counts.findings.value === 60, `${json.findings.length} findings`);
  ok('X2 exporting issues no request', since(state, n0).length === 0, since(state, n0).join(' | '));
  // print: window.print is called by the menu item
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; });
  await page.click('[data-report-export-menu]'); await page.waitForTimeout(150);
  await page.click('[data-report-export="print"]'); await page.waitForTimeout(200);
  ok('X3 打印或另存为 PDF calls the browser print', (await page.evaluate(() => window.__printed)) === 1);
  await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(200);
  const pm = await page.evaluate(() => {
    const vis = (q) => [...document.querySelectorAll(q)].some((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
    const paper = document.querySelector('[data-reader-print]'); const cs = getComputedStyle(paper);
    const probe = document.createElement('i'); probe.style.color = 'rgb(var(--jz-print-ink))'; probe.style.background = 'rgb(var(--jz-paper))'; document.body.appendChild(probe); const ink = getComputedStyle(probe).color; const sheet = getComputedStyle(probe).backgroundColor; probe.remove();
    const chain = []; for (let e = paper.parentElement; e; e = e.parentElement) { const c = getComputedStyle(e); if (c.overflow !== 'visible' || c.position === 'fixed') chain.push(e.tagName + ':' + c.overflow); }
    return {
      frame: vis('[data-sidebar], [data-wb-header], [data-wb-tabs], [data-wb-surfacebar], [data-wb-inspector], [data-reader-bar], [data-chapter-nav], [data-report-findings-pager], [data-report-open-findings]'),
      rows: [...document.querySelectorAll('[data-report-finding]')].filter((tr) => getComputedStyle(tr).display === 'table-row').length,
      thead: getComputedStyle(document.querySelector('[data-report-findings] thead')).display,
      ink: getComputedStyle(document.querySelector('[data-report-title]')).color === ink,
      sheet: getComputedStyle(document.body).backgroundColor === sheet,
      border: cs.borderTopWidth, chain,
      h: getComputedStyle(document.querySelector('[data-reader-print] .jz-reader-h')).breakAfter,
      tr: getComputedStyle(document.querySelector('[data-report-finding]')).breakInside,
    };
  });
  ok('X4 print: the application frame, the reader bar, the chapter list and the pager are not printed', pm.frame === false);
  ok('X4 print: all 60 rows are printed, whatever page was in view', pm.rows === 60, `${pm.rows} rows`);
  ok('X4 print: the table header repeats (table-header-group) and a row is not split', pm.thead === 'table-header-group' && pm.tr === 'avoid', `${pm.thead}, tr ${pm.tr}`);
  ok('X4 print: a chapter heading is not left at the foot of a page', pm.h === 'avoid', pm.h);
  ok('X4 print: paper tokens for ink and sheet, no frame around the paper, nothing clips it', pm.ink && pm.sheet && pm.border === '0px' && pm.chain.length === 0, JSON.stringify({ ink: pm.ink, sheet: pm.sheet, border: pm.border, chain: pm.chain }));
  // a PDF of the draft, A4
  const pdfPath = path.join(out || fs.mkdtempSync('/tmp/jz-pdf-'), 'report-draft.pdf');
  await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true });
  let info = ''; let txt = '';
  try { info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' }); txt = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' }); } catch (e) { info = 'pdfinfo not available: ' + e.message; }
  const pages = Number((info.match(/Pages:\s+(\d+)/) || [])[1] || 0);
  const size = (info.match(/Page size:\s+([\d.]+) x ([\d.]+)/) || []).slice(1).map(Number);
  ok('X5 PDF: A4 pages', size.length === 2 && Math.abs(size[0] - 595) < 2 && Math.abs(size[1] - 842) < 2, info.match(/Page size:.*/)?.[0] || info.slice(0, 80));
  ok('X5 PDF: the report runs over several pages', pages >= 2, `${pages} pages`);
  const perPage = txt.split('\f').filter((p) => p.trim());
  const withRows = perPage.filter((p) => /示例发现 \d\d/.test(p));
  ok('X5 PDF: every page that has findings starts them under the table header', withRows.length >= 2 && withRows.every((p) => /优先级\s+标题\s+状态\s+实例/.test(p)), `${withRows.filter((p) => /优先级\s+标题\s+状态\s+实例/.test(p)).length} of ${withRows.length} pages with rows have the header`);
  const printed = new Set((txt.match(/示例发现 (\d\d)/g) || []));
  ok('X5 PDF: all 60 findings are in it', printed.size === 60, `${printed.size} distinct findings`);
  ok('X5 PDF: no application frame text in it', !/新建评估|搜索或跳转|上一页|展开全部|导出和打印包含/.test(txt));
  await page.emulateMedia({ media: 'screen' });
  ok('X6 back on screen the frame is there again', await page.locator('[data-wb-tabs]').isVisible());
  await page.click('[data-report-export-menu]'); await page.waitForTimeout(150);
  await page.click('[data-report-export="workspace"]'); await page.waitForTimeout(1200);
  ok('X7 在报告工作区打开 goes to the report centre (task 101 has no finished audit, so the centre shows its list)', /#\/reports(\?|$)/.test(page.url()), page.url().split('#')[1]);
  { const s = await open('/projects/1/sessions/40?view=report');
    await s.page.click('[data-report-export-menu]'); await s.page.waitForTimeout(150);
    await s.page.click('[data-report-export="workspace"]'); await s.page.waitForTimeout(1500);
    ok('X7 for a task with a finished audit it opens /reports?taskId= on that task, in the same reader frame', /#\/reports\?taskId=100/.test(s.page.url()) && (await count(s.page, '[data-reports-detail][data-reader="page"]')) === 1, s.page.url().split('#')[1]);
    await s.ctx.close(); }
  ok('X7 no page error', state.errors.length === 0, state.errors.join('; '));
  await ctx.close();
  // a session without a task: no workspace item
  { const s = await open(REPORT, { over: (m, u) => (m === 'GET' && /\/api\/pentest\/sessions\/41$/.test(u.pathname) ? { ...fixture('GET', u), task_id: null } : undefined) });
    await s.page.click('[data-report-export-menu]'); await s.page.waitForTimeout(150);
    ok('X8 without a task the workspace item is not offered', (await count(s.page, '[data-report-export="workspace"]')) === 0 && (await count(s.page, '[data-report-export]')) === 2);
    await s.page.keyboard.press('Escape'); await s.page.waitForTimeout(150);
    ok('X8 Escape closes the menu and returns focus to 导出', (await count(s.page, '[data-reader-export-panel]')) === 0 && (await s.page.evaluate(() => document.activeElement?.hasAttribute('data-report-export-menu'))));
    await s.ctx.close(); }
  // states of export and print
  { const s = await open(REPORT, { over: (m, u) => (m === 'GET' && GROUPED.test(u.pathname) ? { status: 'ok', cards: [] } : undefined), downloads: true });
    await s.page.click('[data-report-export-menu]'); await s.page.waitForTimeout(150);
    const [dl2] = await Promise.all([s.page.waitForEvent('download'), s.page.click('[data-report-export="json"]')]);
    const j = JSON.parse(fs.readFileSync(await dl2.path(), 'utf8'));
    ok('X9 empty: the export of a report without findings has an empty list and the same fields', Array.isArray(j.findings) && j.findings.length === 0 && Object.keys(j).join(',') === 'title,package,generatedAt,counts,stage,findings', Object.keys(j).join(','));
    await s.ctx.close(); }
  for (const [name, opts, expect] of [['error', { fail: /\/api\/pentest\/sessions\/41(\/|$)/ }, 'error'], ['forbidden', { deny: /\/api\/pentest\/sessions\/41(\/|$)/ }, 'forbidden'], ['slow', { hang: /\/api\/pentest\/sessions\/41(\/|$)/, wait: 1200 }, 'loading']]) {
    const s = await open(REPORT, opts);
    await s.page.emulateMedia({ media: 'print' }); await s.page.waitForTimeout(150);
    ok(`X9 ${name}: nothing is offered for export and no report is marked for print`, (await attr(s.page, '[data-report-draft]', 'data-state')) === expect && (await count(s.page, '[data-report-export-menu]')) === 0 && (await count(s.page, '[data-reader-print]')) === 0);
    await s.ctx.close();
  }
  { const s = await open(REPORT, { downloads: true });
    s.state.fail = /\/api\/pentest\/sessions\/41\/timeline$/;
    await s.page.waitForSelector('[data-report-stale]', { timeout: 15000 }).catch(() => {});
    await s.page.click('[data-report-export-menu]'); await s.page.waitForTimeout(150);
    const [dl3] = await Promise.all([s.page.waitForEvent('download'), s.page.click('[data-report-export="json"]')]);
    const j = JSON.parse(fs.readFileSync(await dl3.path(), 'utf8'));
    ok('X9 stale: export still works on what was read, and the screen says it may be old', j.findings.length === 7 && (await count(s.page, '[data-report-stale]')) === 1);
    await s.ctx.close(); }
});

// ───────────────────────────── T. Task dialog ─────────────────────────────
await group('T', async () => {
  // Fixture tasks: 100, 104, 105, 107 are finished audits / unpacks; 101, 102, 103 are not finished but have a
  // session; 106 is queued without a session. The entry is decided from these facts alone.
  const DONE = [100, 104, 105, 107], ELIGIBLE = [100, 101, 102, 103, 104, 105, 107], NONE = 106;
  const SESSIONS = /\/api\/pentest\/sessions$/;
  const ENTRY = '[data-task-row] [data-artifacts-btn]';
  const entryOf = (id) => `[data-task-row="${id}"] [data-artifacts-btn="${id}"]`;
  const BROWSER = '[data-art-dialog] [data-art-browser]';
  const listReads = (s) => s.state.reqs.filter((r) => /\/api\/tasks\/\d+\/artifacts/.test(r));
  const first = (e) => String(e?.message || e).split('\n')[0].slice(0, 160);
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  // Opens /tasks and records which rows carry an artifacts entry. Every wait has a limit; what is missing is
  // written to s.problem and the caller fails its check with that text.
  const openTasks = async (opts = {}) => {
    const s = await open('/tasks', { wait: 0, ...opts });
    s.problem = ''; s.entries = [];
    const listed = await s.page.waitForSelector('[data-task-row]', { timeout: LIMIT.list }).then(() => true, () => false);
    if (!listed) { s.problem = `task list: no task row within ${LIMIT.list} ms`; return s; }
    // The session map arrives with its own read: wait (bounded) until the set of entries stops changing.
    let prev = '';
    for (let i = 0; i < 12; i++) {
      await s.page.waitForTimeout(300);
      s.entries = await s.page.locator(ENTRY).evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-artifacts-btn'))).sort((a, b) => a - b));
      const now = s.entries.join(','); if (now === prev && i >= 2) break; prev = now;
    }
    return s;
  };
  // Opens the dialog from the entry of one row. A missing entry is reported at once, without pressing anything.
  const openDialog = async (opts = {}, id = 100) => {
    const s = await openTasks(opts);
    if (s.problem) return s;
    const entry = s.page.locator(entryOf(id)); const n = await entry.count();
    if (n !== 1) { s.problem = `entry missing: row ${id} has ${n} artifacts entries (rows that have one: ${s.entries.join(', ') || 'none'})`; return s; }
    s.readsBefore = listReads(s).length;
    const err = await entry.click({ timeout: LIMIT.act }).then(() => '', first);
    if (err) { s.problem = `entry not usable: ${err}`; return s; }
    const opened = await s.page.waitForSelector(BROWSER, { timeout: LIMIT.act }).then(() => true, () => false);
    if (!opened) s.problem = `dialog: not open ${LIMIT.act} ms after the entry of row ${id} was pressed`;
    return s;
  };
  // Waits (bounded) for the browser inside the dialog to reach a state; '' when it did, otherwise what it shows.
  const stateIs = async (s, want) => {
    if (s.problem) return s.problem;
    await s.page.waitForSelector(`${BROWSER}[data-state="${want}"]`, { timeout: LIMIT.state }).catch(() => {});
    const got = await attr(s.page, BROWSER, 'data-state');
    if (got === want) await s.page.waitForTimeout(400); // the sheet has finished moving in
    return got === want ? '' : `state rendering: expected "${want}", the dialog shows ${got ? `"${got}"` : 'no browser'}`;
  };
  // A check that needs the dialog: fails with the reason when the entry or the state was not there.
  const tk = (name, problem, pass, detail = '') => ok(name, !problem && !!pass, problem || detail);
  const entriesKept = (s) => same(s.entries, ELIGIBLE);

  // T1 normal: the entry, then the dialog
  { const s0 = await openTasks({ over: tree });
    tk('T1 entry: every task with a finished audit / unpack or a linked session has one artifacts entry in its row', s0.problem, entriesKept(s0), `rows with an entry: ${s0.entries.join(', ')}`);
    const noneRow = s0.problem ? 0 : await count(s0.page, `[data-task-row="${NONE}"]`);
    const noneEntry = s0.problem ? 0 : await count(s0.page, `[data-task-row="${NONE}"] [data-artifacts-btn]`);
    tk('T1 entry: it is in the row itself, visible, with its name; not behind the overflow menu', s0.problem, (await s0.page.locator(entryOf(100)).isVisible()) && /产物/.test(await text(s0.page, entryOf(100))) && (await count(s0.page, '[data-more-menu]')) === 0);
    tk('T1 entry: shown without asking the artifacts endpoint', s0.problem, listReads(s0).length === 0, `${listReads(s0).length} list reads before a dialog was opened`);
    // Phase 7: a row opens the task detail. For a task without artifacts that is still not a dialog and not a list read.
    if (noneRow === 1) { await s0.page.locator(`[data-task-row="${NONE}"]`).click({ timeout: LIMIT.act, position: { x: 200, y: 12 } }).catch(() => {}); await s0.page.waitForSelector('[data-task-detail]', { timeout: LIMIT.act }).catch(() => {}); }
    tk('T1 entry: the queued task without a session has none, and pressing its row opens its detail page, no dialog and no list read', s0.problem,
      noneRow === 1 && noneEntry === 0 && (await count(s0.page, '[data-art-dialog]')) === 0 && (await count(s0.page, `[data-task-detail="${NONE}"]`)) === 1 && listReads(s0).length === 0, `row ${noneRow}, entries ${noneEntry}, detail ${await count(s0.page, '[data-task-detail]')}`);
    await s0.ctx.close(); }
  const s1 = await openDialog({ over: tree, downloads: true });
  const { page, state } = s1;
  const p1 = await stateIs(s1, 'ok');
  tk('T1 the task centre opens a dialog whose content is the shared browser', p1, (await count(page, '[data-art-dialog] [role="dialog"] [data-art-browser][data-state="ok"]')) === 1 && (await count(page, '[data-art-inline]')) === 0);
  tk('T1 opening it reads the list of that task, and only then', p1, s1.readsBefore === 0 && listReads(s1).some((r) => /\/api\/tasks\/100\/artifacts\?prefix=$/.test(r)), listReads(s1).slice(0, 2).join(' | '));
  tk('T1 same tree, same counts', p1, (await text(page, '[data-art-scope]')) === `${WALKED} 个文件` && (await count(page, '[data-art-dir]')) >= 5);
  tk('T1 same header actions: bundle (primary), upload, more, refresh', p1, (await count(page, '[data-art-dialog] [data-art-zip]')) === 1 && (await count(page, '[data-art-dialog] [data-art-upload-btn]')) === 1 && (await count(page, '[data-art-dialog] [data-art-more]')) === 1 && (await count(page, '[data-art-dialog] [data-art-refresh]')) === 1);
  if (!p1) {
    await page.click('[data-art-file="report/executive_summary.md"]', { timeout: LIMIT.act }); await page.waitForSelector('[data-art-markdown]', { timeout: LIMIT.state }).catch(() => {});
    ok('T2 preview and the one download control work inside the dialog', (await count(page, '[data-art-markdown]')) === 1 && (await count(page, '[data-art-dialog] [data-art-download]')) === 1);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: LIMIT.act }).catch(() => null), page.click('[data-art-dialog] [data-art-download]', { timeout: LIMIT.act })]);
    ok('T2 下载 saves the selected file', !!dl && dl.suggestedFilename() === 'executive_summary.md', dl ? dl.suggestedFilename() : 'no download');
    const zipState = await attr(page, '[data-art-zip]', 'data-art-zip');
    ok('T2 the bundle control states whether the task has a session', zipState === 'ready' || /没有关联的评估会话/.test((await attr(page, '[data-art-zip]', 'title')) || ''), zipState);
    const [zip] = await Promise.all([page.waitForEvent('download', { timeout: LIMIT.act }).catch(() => null), page.click('[data-art-zip]', { timeout: LIMIT.act })]);
    ok('T2 打包下载 fetches the report package of the linked session', !!zip && /report_40\.zip/.test(zip.suggestedFilename()), zip ? zip.suggestedFilename() : 'no download');
    await page.click('[data-art-more]', { timeout: LIMIT.act }); await page.waitForTimeout(150);
    const [man] = await Promise.all([page.waitForEvent('download', { timeout: LIMIT.act }).catch(() => null), page.click('[data-art-export-list]', { timeout: LIMIT.act })]);
    ok('T2 导出文件清单 JSON still exports from the dialog', !!man && /task100_artifacts_manifest/.test(man.suggestedFilename()), man ? man.suggestedFilename() : 'no download');
    const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: LIMIT.act }).catch(() => null), page.click('[data-art-upload-btn]', { timeout: LIMIT.act })]);
    ok('T2 上传到样本库 still opens the file picker', !!fc);
    const focusIn = await page.evaluate(() => !!document.activeElement?.closest('[data-art-dialog]'));
    await page.click('[data-art-more]', { timeout: LIMIT.act }); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok('T3 Escape closes the open menu first and keeps the dialog', (await count(page, '[data-art-more-menu]')) === 0 && (await count(page, '[data-art-dialog]')) === 1 && focusIn);
    await clean(page, BROWSER, 'T4 light');
    await shot(page, 'task-dialog-1440-light.png');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    ok('T3 the next Escape closes the dialog and focus returns to the entry that opened it', (await count(page, '[data-art-dialog]')) === 0 && (await page.evaluate(() => document.activeElement?.getAttribute('data-artifacts-btn'))) === '100',
      await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName} ${[...a.attributes].filter((x) => x.name.startsWith('data-')).map((x) => `${x.name}=${x.value}`).join(' ')}` : 'nothing'; }));
    await page.keyboard.press('Enter'); await page.waitForSelector(BROWSER, { timeout: LIMIT.act }).catch(() => {});
    ok('T3 Enter on the focused entry opens the dialog again', (await count(page, BROWSER)) === 1);
    await page.click('[data-art-dialog] [data-modal-close]', { timeout: LIMIT.act }); await page.waitForTimeout(300);
    ok('T3 the close button closes it and focus returns to the entry', (await count(page, '[data-art-dialog]')) === 0 && (await page.evaluate(() => document.activeElement?.getAttribute('data-artifacts-btn'))) === '100');
    await page.click('[data-task-row="100"] [data-more-btn]', { timeout: LIMIT.act }); await page.waitForTimeout(200);
    const menuOk = (await count(page, '[data-more-menu]')) === 1 && (await count(page, '[data-more-menu] [data-artifacts-btn]')) === 0;
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    ok('T3 the task list still works afterwards: the row menu opens, and it holds no second artifacts item', menuOk);
    const stops = await tabStops(page, '[data-task-row="100"]', 8);
    ok('T3 the entry is a tab stop with a focus indicator', stops.seen.some((h) => h.includes('data-artifacts-btn=100')) && stops.bare === 0, `${stops.seen.join(' | ')}; without indicator ${stops.bare}`);
  } else {
    // The dialog is not there: every check that needs it fails with the reason, none is skipped.
    for (const n of ['T2 preview and the one download control work inside the dialog', 'T2 下载 saves the selected file', 'T2 the bundle control states whether the task has a session', 'T2 打包下载 fetches the report package of the linked session', 'T2 导出文件清单 JSON still exports from the dialog', 'T2 上传到样本库 still opens the file picker', 'T3 Escape closes the open menu first and keeps the dialog', 'T3 the next Escape closes the dialog and focus returns to the entry that opened it', 'T3 Enter on the focused entry opens the dialog again', 'T3 the close button closes it and focus returns to the entry', 'T3 the task list still works afterwards: the row menu opens, and it holds no second artifacts item', 'T3 the entry is a tab stop with a focus indicator', 'T4 light: nothing dimmed, nothing red, no emoji']) ok(n, false, p1);
  }
  tk('T4 no page error', s1.problem, state.errors.length === 0, state.errors.join('; '));
  await s1.ctx.close();

  // T5 the five states. In each one the entry is the same as in the normal case.
  { const s = await openDialog({ over: (m, u) => (m === 'GET' && TASK_LIST.test(u.pathname) ? { entries: [] } : undefined) });
    const p = await stateIs(s, 'empty'); const t = await text(s.page, BROWSER);
    tk('T5 empty: the entry is there', s.problem, entriesKept(s), s.entries.join(', '));
    tk('T5 empty: the dialog says the task has no files', p, /这个任务没有产物文件/.test(t) && (await count(s.page, '[data-art-file]')) === 0, t.slice(0, 80));
    await shot(s.page, 'task-dialog-empty-1440-light.png'); await s.ctx.close(); }
  { const s = await openDialog({ fail: TASK_LIST });
    const p = await stateIs(s, 'error'); const t = await text(s.page, BROWSER);
    tk('T5 error (500): the entry is there', s.problem, entriesKept(s), s.entries.join(', '));
    tk('T5 error (500): the dialog says the list was not read, offers 重试, and does not read as an empty task', p, /产物列表没有读到/.test(t) && (await count(s.page, `${BROWSER} button:has-text("重试")`)) === 1 && !/这个任务没有产物文件/.test(t) && (await text(s.page, '[data-art-scope]')) === '', t.slice(0, 100));
    await shot(s.page, 'task-dialog-error-1440-light.png');
    if (!p) { s.state.fail = null; await s.page.click(`${BROWSER} button:has-text("重试")`, { timeout: LIMIT.act }); }
    const p2 = p || await stateIs(s, 'ok');
    tk('T5 error (500): 重试 reads the list again and shows it', p2, (await count(s.page, '[data-art-file]')) > 0);
    await s.ctx.close(); }
  { const s = await openDialog({ deny: TASK_LIST });
    const p = await stateIs(s, 'forbidden'); const t = await text(s.page, BROWSER);
    tk('T5 forbidden (403): the entry is there, the same rows as in the normal case', s.problem, entriesKept(s), `rows with an entry: ${s.entries.join(', ')}`);
    tk('T5 forbidden (403): the dialog opens on a permission state', p, (await count(s.page, `${BROWSER} [data-state="permission"]`)) === 1 && /没有权限读取产物文件/.test(t), t.slice(0, 100));
    tk('T5 forbidden (403): no retry wording and no retry control', p, !RETRY.test(t) && (await count(s.page, `${BROWSER} button:has-text("重试")`)) === 0, t.slice(0, 100));
    tk('T5 forbidden (403): not shown as “no data yet”, no empty list, no file count', p, !/没有产物文件|还没有|目录是空的/.test(t) && (await count(s.page, '[data-art-empty], [data-art-tree], [data-art-file]')) === 0 && (await text(s.page, '[data-art-scope]')) === '', t.slice(0, 100));
    await shot(s.page, 'task-dialog-forbidden-1440-light.png');
    if (!p) { await s.page.keyboard.press('Escape'); await s.page.waitForTimeout(300); }
    tk('T5 forbidden (403): Escape closes it and focus returns to the entry', p, (await count(s.page, '[data-art-dialog]')) === 0 && (await s.page.evaluate(() => document.activeElement?.getAttribute('data-artifacts-btn'))) === '100');
    tk('T5 forbidden (403): no page error', p, s.state.errors.length === 0, s.state.errors.join('; '));
    await s.ctx.close(); }
  { const s = await openDialog({ hang: TASK_LIST });
    const p = await stateIs(s, 'loading'); const t = await text(s.page, BROWSER);
    tk('T5 slow: the entry is there', s.problem, entriesKept(s), s.entries.join(', '));
    tk('T5 slow: a loading state in the dialog, with no error and no empty statement', p, !/没有读到|没有权限|没有产物文件/.test(t) && (await count(s.page, `${BROWSER} [data-state="error"], ${BROWSER} [data-state="permission"], ${BROWSER} [data-state="empty"]`)) === 0, t.slice(0, 80));
    await shot(s.page, 'task-dialog-slow-1440-light.png');
    if (!p) { await s.page.keyboard.press('Escape'); await s.page.waitForTimeout(300); }
    tk('T5 slow: Escape closes it while it loads, and focus returns to the entry', p, (await count(s.page, '[data-art-dialog]')) === 0 && (await s.page.evaluate(() => document.activeElement?.getAttribute('data-artifacts-btn'))) === '100');
    await s.ctx.close(); }
  { const s = await openDialog({ over: tree });
    const p = await stateIs(s, 'ok');
    if (!p) { s.state.fail = TASK_LIST; await s.page.click('[data-art-refresh]', { timeout: LIMIT.act }); }
    const p2 = p || await stateIs(s, 'stale');
    tk('T5 stale: a failed refresh keeps the list and says it may be old', p2, (await count(s.page, '[data-art-dialog] [data-art-stale]')) === 1 && (await count(s.page, '[data-art-file]')) === WALKED, await text(s.page, '[data-art-stale]'));
    await shot(s.page, 'task-dialog-stale-1440-light.png'); await s.ctx.close(); }

  // T6 widths and themes: the entry in the row, then the dialog
  for (const [w, th] of REST) {
    const s = await openDialog({ over: tree, width: w, theme: th });
    const p = await stateIs(s, 'ok');
    const fits = p ? false : await s.page.evaluate(() => { const d = document.querySelector('[data-art-dialog] [role="dialog"]')?.getBoundingClientRect(); return !!d && d.left >= -1 && d.right <= innerWidth + 1 && d.bottom <= innerHeight + 1; });
    tk(`T6 @${w} ${th} the dialog fits the viewport, no horizontal overflow`, p, fits && (await overflow(s.page)) <= 1 && (await count(s.page, BROWSER)) === 1);
    if (th === 'dark') { if (p) ok(`T6 @${w} dark: nothing dimmed, nothing red, no emoji`, false, p); else await clean(s.page, BROWSER, `T6 @${w} dark`); }
    await shot(s.page, `task-dialog-${w}-${th}.png`);
    if (!p) { await s.page.keyboard.press('Escape'); await s.page.waitForTimeout(300); }
    // Back on the list: every entry is inside the page, not covered, and the page does not scroll sideways.
    const seen = p ? null : await s.page.evaluate(() => [...document.querySelectorAll('[data-task-row] [data-artifacts-btn]')].map((b) => {
      b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { id: b.getAttribute('data-artifacts-btn'), inside: r.left >= 0 && r.right <= innerWidth + 1 && r.width > 0, free: !!top && (b === top || b.contains(top)), h: Math.round(r.height) };
    }));
    tk(`T6 @${w} ${th} the entries are in the rows: all seven inside the page, none covered, no horizontal overflow, focus back on the entry`, p,
      seen && seen.length === ELIGIBLE.length && seen.every((x) => x.inside && x.free) && (await overflow(s.page)) <= 1 && (await s.page.evaluate(() => document.activeElement?.getAttribute('data-artifacts-btn'))) === '100' && s.state.errors.length === 0,
      seen ? JSON.stringify(seen.filter((x) => !x.inside || !x.free)) + ` ${seen.length} entries; errors ${s.state.errors.length}` : '');
    await shot(s.page, `tasks-entry-${w}-${th}.png`); await s.ctx.close();
  }

  // T7 the other ways in, and what the entry does not depend on
  { const s = await openTasks({ deny: SESSIONS });
    tk('T7 session list refused: finished tasks keep their entry (it needs only the task itself); the others have none', s.problem, same(s.entries, DONE), `rows with an entry: ${s.entries.join(', ')}`);
    await s.ctx.close(); }
  { const s = await openDialog({ deny: SESSIONS, over: tree }, 107);
    const p = await stateIs(s, 'ok');
    tk('T7 a finished task without a session opens the same browser; the bundle says why it is disabled', p, (await attr(s.page, '[data-art-zip]', 'data-art-zip')) === 'disabled' && /没有关联的评估会话/.test((await attr(s.page, '[data-art-zip]', 'title')) || ''));
    await s.ctx.close(); }
  { const s = await openDialog({ over: tree }, 101);
    const p = await stateIs(s, 'ok');
    tk('T7 a running task with a session opens the browser on its own files', p, /#101/.test(await text(s.page, '[data-art-header]')) && listReads(s).every((r) => /\/api\/tasks\/101\//.test(r)), await text(s.page, '[data-art-header]'));
    await s.ctx.close(); }
  { const s = await openTasks({ deny: TASK_LIST });
    let p = s.problem;
    if (!p) { await s.page.click('[data-task-row="100"] [data-more-btn]', { timeout: LIMIT.act }).catch((e) => { p = `row menu: ${first(e)}`; }); }
    if (!p) { await s.page.click('[data-more-menu] [data-act-detail]', { timeout: LIMIT.act }).catch((e) => { p = `详情 item: ${first(e)}`; }); }
    // Phase 7: 详情 opens /tasks/:id (the detail drawer is retired); its 产物 tab embeds the same browser.
    const PANE = '[data-task-artifacts] [data-art-browser]';
    if (!p && !(await s.page.waitForSelector('[data-task-detail="100"] [data-task-tab="artifacts"]', { timeout: LIMIT.act }).then(() => true, () => false))) p = 'entry missing: the task detail has no 产物 tab';
    if (!p) { await s.page.click('[data-task-tab="artifacts"]', { timeout: LIMIT.act }); if (!(await s.page.waitForSelector(PANE, { timeout: LIMIT.act }).then(() => true, () => false))) p = 'state rendering: no artifact browser in the 产物 tab of the task detail'; }
    if (!p) { await s.page.waitForSelector(`${PANE}[data-state="forbidden"]`, { timeout: LIMIT.state }).catch(() => {}); const got = await attr(s.page, PANE, 'data-state'); if (got !== 'forbidden') p = `state rendering: expected "forbidden", the 产物 tab shows "${got}"`; }
    const p2 = p;
    tk('T7 the task detail keeps its 产物 tab under a refused list read and shows the same permission state', p2, !RETRY.test(await text(s.page, PANE)));
    if (!p2) { await s.page.keyboard.press('Escape'); await s.page.waitForSelector('[data-task-row="100"]', { timeout: LIMIT.list }).catch(() => {}); await s.page.waitForTimeout(400); }
    tk('T7 Escape returns from the detail to the list and focus is back on the row of that task, not lost', p2, (await count(s.page, '[data-task-detail]')) === 0 && (await s.page.evaluate(() => !!document.activeElement?.closest('[data-task-row="100"]'))),
      await s.page.evaluate(() => document.activeElement?.tagName + ' ' + (document.activeElement?.getAttribute('aria-label') || '')));
    await s.ctx.close(); }
  { const s = await open('/tasks', { deny: /\/api\/tasks$/, wait: 0 });
    await s.page.waitForSelector('[data-state="permission"], [data-state="error"], [data-task-row]', { timeout: LIMIT.list }).catch(() => {});
    ok('T7 task list refused: no row, so no entry and no dialog; the list shows its own state', (await count(s.page, '[data-task-row]')) === 0 && (await count(s.page, '[data-artifacts-btn]')) === 0 && (await count(s.page, '[data-art-dialog]')) === 0 && (await count(s.page, '[data-state="permission"], [data-state="error"]')) >= 1,
      `rows ${await count(s.page, '[data-task-row]')}, entries ${await count(s.page, '[data-artifacts-btn]')}`);
    await s.ctx.close(); }
});

await browser.close();
process.exit(summary() ? 1 : 0);
