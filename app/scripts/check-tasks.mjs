#!/usr/bin/env node
// Dev-only acceptance for V3 Phase 7 (task list and task detail), on fixtures. Seven groups:
//   L  list          search, status, type, packer, owner, partial, instant failures; paging, selection across pages,
//                    the four bulk actions, export, clean-up. Every filter is checked by row count and row ids.
//   R  row entries   artifacts, report, rerun, detail, delete, open session, ask the agent; the failure reason as
//                    text in the row; the artifacts rule
//   D  detail        header, run strip, output, timeline, artifacts, report link
//   S  states        list: empty, loading, error, forbidden, slow, stale; detail: not found, forbidden, error, slow,
//                    stale, no output
//   K  keyboard      Escape back to the row, tablist keys, header order, `/`, focus back after menus and dialogs
//   W  widths        list and the three detail tabs at 1440 / 1024 / 760 / 390 in both themes
//   Q  requests      /tasks against the Phase 6 record, /tasks/:id request by request, polling
// Rules of the script:
//   - every wait has a limit (LIMIT, GROUP_MS, RUN_MS);
//   - a control that is not there fails its check at once with “entry missing …”; a control that is there but
//     leads to the wrong thing fails with “state rendering …”;
//   - a precondition that does not hold is a failed check, never a skipped one;
//   - the total is fixed (PLAN): a group that stops early has its remaining checks recorded as failures.
// Needs `npx vite preview --port 4173`.
// Usage: node scripts/check-tasks.mjs [--out dir] [--only L,R,D,S,K,W,Q] [--base url]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve as fixture } from './fixtures/api.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:4173/v2/');
const out = arg('out', '');
const only = arg('only', '').split(',').filter(Boolean);
const want = (g) => !only.length || only.includes(g);
if (out) fs.mkdirSync(out, { recursive: true });
const here = path.dirname(fileURLToPath(import.meta.url));

// Checks per group. The run always reports exactly these totals.
const PLAN = { L: 87, R: 42, D: 65, S: 53, K: 26, W: 64, Q: 26 };
const LIMIT = { nav: 20000, act: 8000, state: 6000, read: 3000, poll: 13000 };
const GROUP_MS = 10 * 60 * 1000, RUN_MS = 45 * 60 * 1000;
const RETRY = /重试|再读一次|稍后|重新读取|再试/;
const WIDTHS = [1440, 1024, 760, 390], THEMES = ['light', 'dark'];

const results = [];
const first = (e) => String(e?.message || e).split('\n')[0].slice(0, 200);
const ok = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail: String(detail ?? '') }); console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch();
const live = new Set();
const summary = () => {
  const failed = results.filter((r) => !r.pass);
  const groups = {}; for (const r of results) { const g = r.name[0]; groups[g] = groups[g] || [0, 0]; groups[g][1]++; if (r.pass) groups[g][0]++; }
  if (out) fs.writeFileSync(path.join(out, 'report.tasks.json'), JSON.stringify({ base: 'fixtures', total: results.length, failed: failed.length, plan: PLAN, groups, results }, null, 1));
  console.log('\n' + Object.entries(groups).map(([g, [p, t]]) => `${g} ${p}/${t}`).join('   '));
  console.log(`${results.length - failed.length}/${results.length} task checks passed (fixtures)`);
  return failed.length;
};
// A group that throws or runs out of time stops there; the checks it did not reach are recorded as failures,
// so the total of a run is the same whatever happens.
async function group(g, body) {
  if (!want(g)) return;
  let timer; let why = '';
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`group ${g} did not finish within ${GROUP_MS / 60000} min`)), GROUP_MS); });
  try { await Promise.race([body(), limit]); }
  catch (e) { why = first(e); }
  finally { clearTimeout(timer); for (const c of live) await c.close().catch(() => {}); live.clear(); }
  const done = results.filter((r) => r.name[0] === g).length;
  for (let i = done; i < PLAN[g]; i++) ok(`${g} not reached: check ${i + 1} of ${PLAN[g]}`, false, why ? `the group stopped: ${why}` : 'the group ended before this check');
  if (done > PLAN[g]) ok(`${g} plan: the group ran ${done} checks, the plan says ${PLAN[g]}`, false, 'update PLAN');
}
setTimeout(() => { ok('Z watchdog: the run did not finish', false, `stopped after ${RUN_MS / 60000} min`); summary(); process.exit(2); }, RUN_MS).unref();

async function open(route, { width = 1440, height = 900, theme = 'light', deny = null, fail = null, hang = null, over = null, wait = 1500, downloads = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme, acceptDownloads: downloads });
  await ctx.addInitScript((t) => { try { localStorage.setItem('token', 'fixture-token'); localStorage.setItem('apksec-theme', t); } catch {} }, theme);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  live.add(ctx); ctx.setDefaultTimeout(LIMIT.act); ctx.setDefaultNavigationTimeout(LIMIT.nav);
  const page = await ctx.newPage();
  const state = { deny, fail, hang, over, errors: [], reqs: [], posts: [], streams: new Set() }; // streams: event streams, kept apart because the browser reconnects them on its own
  page.on('pageerror', (e) => state.errors.push(e.message));
  await page.route('**/api/**', async (r) => {
    const req = r.request(); const url = new URL(req.url());
    if (/\/stream$|send_stream$/.test(url.pathname)) { state.streams.add(`${req.method()} ${url.pathname}${url.search}`); return r.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }); }
    const key = `${req.method()} ${url.pathname}${url.search}`;
    state.reqs.push(key);
    if (req.method() !== 'GET') state.posts.push({ key, body: req.postData() || '' });
    const full = url.pathname + url.search;
    if (state.hang && state.hang.test(full)) return; // never answered
    if (state.deny && state.deny.test(full)) return r.fulfill({ status: 403, contentType: 'application/json', body: '{"detail":"fixture: forbidden"}' });
    if (state.fail && state.fail.test(full)) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"fixture failure"}' });
    const own = state.over ? state.over(req.method(), url) : undefined;
    if (own && own.__status) return r.fulfill({ status: own.__status, contentType: 'application/json', body: JSON.stringify(own.body || {}) });
    const body = own !== undefined ? own : fixture(req.method(), url);
    return r.fulfill(typeof body === 'string' ? { status: 200, contentType: 'text/plain; charset=utf-8', body } : { status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(base + '#' + route); await page.waitForTimeout(wait);
  return { ctx, page, state };
}
const count = (page, sel) => page.locator(sel).count();
const text = (page, sel) => page.locator(sel).first().innerText({ timeout: LIMIT.read }).then((s) => s.replace(/\s+/g, ' ').trim()).catch(() => '');
const raw = (page, sel) => page.locator(sel).first().evaluate((el) => el.textContent || '', null, { timeout: LIMIT.read }).catch(() => '');
const attr = (page, sel, a) => page.locator(sel).first().getAttribute(a, { timeout: LIMIT.read }).catch(() => null);
const shot = async (page, name) => { if (out) await page.screenshot({ path: path.join(out, name) }).catch(() => {}); };
const closeup = async (page, sel, name) => { if (out) await page.locator(sel).first().screenshot({ path: path.join(out, name), timeout: LIMIT.read }).catch(() => {}); };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const hash = (page) => page.evaluate(() => decodeURIComponent(location.hash.slice(1)));
const rowIds = (page) => page.$$eval('[data-task-row]', (els) => els.map((e) => Number(e.getAttribute('data-task-row'))));
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? [...a.attributes].filter((x) => x.name.startsWith('data-') || x.name === 'aria-label' || x.name === 'role').map((x) => x.name + (x.value ? '=' + x.value : '')).join(' ') : ''; });
const ring = (page) => page.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return false; const cs = getComputedStyle(a); return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none'; });
const clip = (page) => page.evaluate(() => navigator.clipboard.readText()).catch((e) => `clipboard: ${e.message}`);
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const brief = (a) => (a.length > 14 ? `${a.slice(0, 14).join(',')}… (${a.length})` : a.join(',') || '(none)');
const safe = async (fn) => { try { await fn(); return ''; } catch (e) { return first(e); } };
const setVis = (page, v) => page.evaluate((s) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => s === 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); }, v);

// One check on a control: missing → “entry missing”, cannot be used → “entry not usable”, wrong result → “state rendering”.
async function step(name, page, sel, action, verify) {
  if (!(await count(page, sel))) return ok(name, false, `entry missing: ${sel}`);
  if (action) { const e = await safe(() => action(page.locator(sel).first())); if (e) return ok(name, false, `entry not usable: ${sel} — ${e}`); }
  let r; try { r = await verify(); } catch (e) { r = [false, first(e)]; }
  const [pass, detail] = Array.isArray(r) ? r : [r, ''];
  ok(name, pass, pass ? (detail || '') : `state rendering: ${detail || 'not what the check expects'}`);
}
// A state check: the page is expected to be in a given state already.
const st = (name, pass, detail = '') => ok(name, pass, pass ? detail : `state rendering: ${detail || 'not what the check expects'}`);
const click = (l) => l.click();

// ───────────────────────────── data ─────────────────────────────
const NOW = Math.floor(Date.now() / 1000);
const pad = (i) => String(i).padStart(2, '0');
const ST5 = ['done', 'running', 'queued', 'failed', 'done'];
const bigTasks = () => Array.from({ length: 65 }, (_, i) => {
  const status = ST5[i % 5]; const packer = ['none', 'vendor-a', 'vendor-b'][i % 3]; const kind = i % 4 === 3 ? 'unpack' : 'audit';
  const created = NOW - 3600 * (i + 1);
  const smoke = status === 'failed' && i % 10 === 3;
  const partial = status === 'done' && i % 5 === 4 && packer !== 'none';
  return {
    id: 1000 + i, kind, app_name: `App ${pad(i)}`, package: `com.sample.a${pad(i)}`, status, created_at: created, started_at: created + 5,
    updated_at: status === 'failed' ? created + (smoke ? 1 : 900) : created + 1800, finished_at: status === 'done' ? created + 1800 : null,
    result_id: status === 'done' ? 7000 + i : null,
    progress: status === 'running' ? 'Unpack: 100% · 2 dex → Decompile: 10% · jadx' : status === 'failed' ? `stopped at step ${i}` : status === 'done' ? '评估完成' : '',
    user_id: 1 + (i % 3), error: '', error_msg: status === 'failed' ? `E${pad(i)}: connection reset by device after step ${i}` : '',
    unpack_outcome: status === 'done' ? (partial ? { verdict: 'blocked', defined_biz: 0, code_recovered: 0, unpack_method: 'frida', diagnosis: { reason: 'stub classes only' } } : { biz_classes: 100 + i, code_recovered: 1 }) : null,
    packer, version: '1.0.0', size_mb: 10,
  };
});
const USERS = { 1: 'demo', 2: 'reviewer' };
// The filter rules, written again here (not imported from the app): what the page shows is compared with this.
const isPartial = (t) => t.status === 'done' && t.packer !== 'none' && t.unpack_outcome?.verdict === 'blocked';
const isSmoke = (t) => t.status === 'failed' && t.updated_at - t.created_at < 2;
const expect = (tasks, f = {}) => tasks.filter((t) => (!f.status || t.status === f.status) && (!f.partial || isPartial(t)) && (!f.kind || t.kind === f.kind)
  && (!f.packer || (f.packer === '__packed' ? t.packer !== 'none' : t.packer === f.packer)) && (!f.owner || String(t.user_id) === f.owner) && (!f.hideSmoke || !isSmoke(t))
  && (!f.q || [t.app_name, t.package, String(t.id), USERS[t.user_id] || '', t.error_msg].some((s) => s.toLowerCase().includes(f.q.toLowerCase())))).map((t) => t.id);
const BIG_SESS = [{ id: 900, task_id: 1000, project_id: 1 }, { id: 901, task_id: 1005, project_id: 1 }, { id: 902, task_id: 1001, project_id: 2 }];
// A list the test can change between reads, with the write endpoints the page uses.
const world = (tasks, sessions) => {
  const w = { tasks, sessions, next: 5000, refuse: (t) => t.status === 'running' || t.status === 'queued' };
  w.over = (m, u) => {
    if (m === 'GET' && u.pathname === '/api/tasks') { const s = u.searchParams.get('status'); return s ? w.tasks.filter((t) => t.status === s) : w.tasks; }
    if (m === 'GET' && u.pathname === '/api/pentest/sessions' && w.sessions) return w.sessions;
    const del = m === 'DELETE' && /^\/api\/tasks\/(\d+)$/.exec(u.pathname);
    if (del) { const t = w.tasks.find((x) => x.id === Number(del[1])); if (!t || w.refuse(t)) return { __status: 409, body: { detail: '任务正在运行,不能删除' } }; w.tasks = w.tasks.filter((x) => x !== t); return { ok: true }; }
    if (m === 'POST' && u.pathname === '/api/tasks') return { task_id: w.next++ };
    if (m === 'POST' && /^\/api\/tasks\/\d+\/rerun$/.test(u.pathname)) { const id = w.next++; w.tasks = [{ ...w.tasks[0], id, status: 'queued', progress: '', error_msg: '', result_id: null, unpack_outcome: null, app_name: 'Rerun copy' }, ...w.tasks]; return { task_id: id }; }
    return undefined;
  };
  return w;
};
const fx = () => JSON.parse(JSON.stringify(fixture('GET', new URL('http://x/api/tasks?limit=2000'))));
const LONG_REASON = `unpack failed at stage 2: device emulator-5554 did not answer within 600s\n  step dump_dex: ${'com.example.launcher.internal.loader.StubApplication$'.repeat(6)}Proxy\n  last adb line: error: closed\n  hint: the app may be waiting for a login the run could not complete`;
// The fixture list with: a long failure reason on 102, a failed task with no reason and no session (108), a running task with many lines (109).
const smallTasks = () => {
  const t = fx();
  const f = t.find((x) => x.id === 102); f.error_msg = LONG_REASON;
  t.push({ ...JSON.parse(JSON.stringify(f)), id: 108, app_name: 'Silent', package: 'com.example.silent', error_msg: '', error: '', progress: '', user_id: 1 });
  t.push({ ...JSON.parse(JSON.stringify(t.find((x) => x.id === 101))), id: 109, app_name: 'Verbose', package: 'com.example.verbose', progress: longProgress(240) });
  return t;
};
function longProgress(n) { return `Unpack: 100% · 3 dex\n${Array.from({ length: 20 }, (_, i) => `unpack line ${i + 1}`).join('\n')} → Decompile: 42% · jadx 4200/10000 classes\n${Array.from({ length: n }, (_, i) => `decompile line ${i + 1}: class com.example.verbose.C${i + 1}`).join('\n')}`; }

// ───────────────────────────── L. List ─────────────────────────────
await group('L', async () => {
  const w = world(bigTasks(), BIG_SESS);
  const all = () => w.tasks;
  const { page, state } = await open('/tasks', { over: w.over, downloads: true });
  st('L1 the list page is up and says it read the list', (await attr(page, '[data-tasks-page]', 'data-task-list-state')) === 'ok', await attr(page, '[data-tasks-page]', 'data-task-list-state'));
  st('L1 first page: 20 rows, in the order the server sent', same(await rowIds(page), all().slice(0, 20).map((t) => t.id)), brief(await rowIds(page)));
  st('L1 the pager states the total (65)', /共 65 条/.test(await text(page, '[data-v3-pagination]')), await text(page, '[data-v3-pagination]'));
  const tabText = async (k) => text(page, `[data-toolbar-filter="${k}"]`);
  const wantTabs = { '': 65, running: 13, queued: 13, failed: 13, done: 26 };
  const gotTabs = {}; for (const k of Object.keys(wantTabs)) gotTabs[k] = await tabText(k);
  st('L1 five status tabs with the count of each status', Object.entries(wantTabs).every(([k, n]) => new RegExp(`\\b${n}$`).test(gotTabs[k])) && /全部/.test(gotTabs['']) && /运行中/.test(gotTabs.running) && /排队/.test(gotTabs.queued) && /失败/.test(gotTabs.failed) && /已完成/.test(gotTabs.done), JSON.stringify(gotTabs));
  st('L1 header readout: concurrency, running, queued, online devices', /并发 2\/4/.test(await text(page, '[data-slot-pod]')) && /运行中 13/.test(await text(page, '[data-fact-running]')) && /排队中 13/.test(await text(page, '[data-fact-queued]')) && /在线设备 2/.test(await text(page, '[data-fact-devices]')), await text(page, '[data-situation-pods]'));
  st('L1 header actions in order: refresh, export, clean failed, new assessment', same(await page.$$eval('[data-toolbar-actions] button', (b) => b.map((x) => ['data-tasks-refresh', 'data-toolbar-export-toggle', 'data-clean-failed', 'data-toolbar-create'].find((a) => x.hasAttribute(a)) || '?')), ['data-tasks-refresh', 'data-toolbar-export-toggle', 'data-clean-failed', 'data-toolbar-create']));
  st('L1 toolbar: search, type, packer, owner, partial only, hide instant failures', (await count(page, '[data-toolbar="tasks"] [data-task-search]')) === 1 && (await count(page, '[data-kind-filter]')) === 1 && (await count(page, '[data-packer-filter]')) === 1 && (await count(page, '[data-operator-filter]')) === 1 && (await count(page, '[data-partial-toggle]')) === 1 && (await count(page, '[data-smoke-toggle]')) === 1);
  await shot(page, 'closeup-list-toolbar.png');

  // every later filter check looks at one page of 100 rows, so the ids on screen are all the ids
  await step('L2 page size 100 puts all 65 rows on one page', page, 'select[aria-label="每页条数"]', (l) => l.selectOption('100'), async () => { await page.waitForTimeout(500); const ids = await rowIds(page); return [same(ids, all().map((t) => t.id)), brief(ids)]; });
  const filterCheck = async (name, sel, action, f) => step(name, page, sel, action, async () => { await page.waitForTimeout(450); const ids = await rowIds(page); const exp = expect(all(), f); const total = await text(page, '[data-v3-pagination]'); return [same(ids, exp) && new RegExp(`共 ${exp.length} 条`).test(total), `rows ${ids.length}, expected ${exp.length}; ids ${brief(ids)}; pager “${total.slice(0, 12)}”`]; });
  for (const s of ['running', 'queued', 'failed', 'done']) {
    await filterCheck(`L2 status tab ${s}: rows and ids`, `[data-toolbar-filter="${s}"]`, click, { status: s });
    st(`L2 status tab ${s}: the address carries ?status=${s}`, new RegExp(`[?&]status=${s}(&|$)`).test(await hash(page)), await hash(page));
  }
  await filterCheck('L2 status tab 全部: every row again', '[data-toolbar-filter=""]', click, {});
  st('L2 全部 removes ?status= from the address', !/status=/.test(await hash(page)), await hash(page));
  await filterCheck('L3 type 脱壳: rows and ids', '[data-kind-filter]', (l) => l.selectOption('unpack'), { kind: 'unpack' });
  await filterCheck('L3 type 评估: rows and ids', '[data-kind-filter]', (l) => l.selectOption('audit'), { kind: 'audit' });
  await filterCheck('L3 type 全部类型: every row again', '[data-kind-filter]', (l) => l.selectOption(''), {});
  await filterCheck('L3 packer 有加固: rows and ids', '[data-packer-filter]', (l) => l.selectOption('__packed'), { packer: '__packed' });
  await filterCheck('L3 packer 无加固: rows and ids', '[data-packer-filter]', (l) => l.selectOption('none'), { packer: 'none' });
  await filterCheck('L3 packer vendor-a: rows and ids', '[data-packer-filter]', (l) => l.selectOption('vendor-a'), { packer: 'vendor-a' });
  await filterCheck('L3 packer 全部: every row again', '[data-packer-filter]', (l) => l.selectOption('all'), {});
  await filterCheck('L3 owner #1: rows and ids', '[data-operator-filter]', (l) => l.selectOption('1'), { owner: '1' });
  await filterCheck('L3 owner #2: rows and ids', '[data-operator-filter]', (l) => l.selectOption('2'), { owner: '2' });
  await filterCheck('L3 owner #3 (no name on record): rows and ids', '[data-operator-filter]', (l) => l.selectOption('3'), { owner: '3' });
  await filterCheck('L3 owner 全部: every row again', '[data-operator-filter]', (l) => l.selectOption(''), {});
  await filterCheck('L4 partial only: rows and ids', '[data-partial-toggle] input', (l) => l.check({ force: true }), { status: 'done', partial: true });
  st('L4 partial only writes status=done&partial=1 to the address', /status=done/.test(await hash(page)) && /partial=1/.test(await hash(page)), await hash(page));
  await filterCheck('L4 partial only off: the done tab stays', '[data-partial-toggle] input', (l) => l.uncheck({ force: true }), { status: 'done' });
  await safe(() => page.click('[data-toolbar-filter=""]'));
  await filterCheck('L4 hide instant failures: rows and ids', '[data-smoke-toggle] input', (l) => l.check({ force: true }), { hideSmoke: true });
  st('L4 the toggle states how many it hides', new RegExp(`\\(${all().filter(isSmoke).length}\\)`).test(await text(page, '[data-smoke-toggle]')), await text(page, '[data-smoke-toggle]'));
  await filterCheck('L4 hide instant failures off: every row again', '[data-smoke-toggle] input', (l) => l.uncheck({ force: true }), {});
  const search = (q) => (l) => l.fill(q);
  await filterCheck('L5 search by app name “App 4”: rows and ids', '[data-task-search]', search('App 4'), { q: 'App 4' });
  await filterCheck('L5 search by package “a07”: rows and ids', '[data-task-search]', search('a07'), { q: 'a07' });
  await filterCheck('L5 search by task id “1042”: rows and ids', '[data-task-search]', search('1042'), { q: '1042' });
  await filterCheck('L5 search by owner name “reviewer”: rows and ids', '[data-task-search]', search('reviewer'), { q: 'reviewer' });
  await filterCheck('L5 search by failure reason “E13”: rows and ids', '[data-task-search]', search('E13'), { q: 'E13' });
  await filterCheck('L5 search is not case sensitive (“app 0”)', '[data-task-search]', search('app 0'), { q: 'app 0' });
  await safe(() => page.selectOption('[data-packer-filter]', 'vendor-a'));
  await filterCheck('L5 search + packer + status together', '[data-toolbar-filter="failed"]', async (l) => { await page.fill('[data-task-search]', 'reset'); await l.click(); }, { q: 'reset', packer: 'vendor-a', status: 'failed' });
  await step('L5 a search with no match says so and offers to clear', page, '[data-task-search]', search('zzz-no-such-task'), async () => { await page.waitForTimeout(450); return [(await count(page, '[data-task-state="filtered-empty"]')) === 1 && (await count(page, '[data-task-row]')) === 0 && (await count(page, '[data-clear-filters]')) === 1, await text(page, '[data-task-table]')]; });
  await shot(page, 'state-list-filtered-empty-1440.png');
  await filterCheck('L5 清除筛选 brings every row back and empties the controls', '[data-clear-filters]', click, {});
  st('L5 after clearing: search empty, selects at their defaults, no ?status=', (await page.inputValue('[data-task-search]').catch(() => '?')) === '' && (await page.inputValue('[data-packer-filter]').catch(() => '?')) === 'all' && !/status=/.test(await hash(page)), await hash(page));

  // paging
  await step('L6 page size 20: four pages', page, 'select[aria-label="每页条数"]', (l) => l.selectOption('20'), async () => { await page.waitForTimeout(400); return [same(await rowIds(page), all().slice(0, 20).map((t) => t.id)) && /1\s*\/\s*4/.test(await text(page, '[data-v3-pagination]')), await text(page, '[data-v3-pagination]')]; });
  st('L6 page sizes offered: 20, 50, 100, 200', same(await page.$$eval('select[aria-label="每页条数"] option', (o) => o.map((x) => x.value)), ['20', '50', '100', '200']));
  await step('L6 下一页: rows 21–40', page, 'button[aria-label="下一页"]', click, async () => { await page.waitForTimeout(400); return [same(await rowIds(page), all().slice(20, 40).map((t) => t.id)), brief(await rowIds(page))]; });
  st('L6 a page asks for the counts of its own 20 tasks only', state.reqs.some((r) => r === `GET /api/tasks/counts?ids=${all().slice(20, 40).map((t) => t.id).join(',')}`), state.reqs.filter((r) => /counts/.test(r)).slice(-1)[0]);
  await step('L6 跳至页码 4: the last 5 rows', page, 'input[aria-label="跳至页码"]', async (l) => { await l.fill('4'); await l.press('Enter'); }, async () => { await page.waitForTimeout(400); return [same(await rowIds(page), all().slice(60).map((t) => t.id)), brief(await rowIds(page))]; });
  st('L6 on the last page 下一页 is disabled', await page.locator('button[aria-label="下一页"]').isDisabled().catch(() => false));
  await step('L6 上一页: rows 41–60', page, 'button[aria-label="上一页"]', click, async () => { await page.waitForTimeout(400); return [same(await rowIds(page), all().slice(40, 60).map((t) => t.id)), brief(await rowIds(page))]; });
  await safe(async () => { await page.fill('input[aria-label="跳至页码"]', '1'); await page.press('input[aria-label="跳至页码"]', 'Enter'); await page.waitForTimeout(300); });

  // selection across pages
  await step('L7 selecting two rows shows the bulk bar with the count', page, '[data-sel-row="1000"]', async (l) => { await l.check(); await page.check('[data-sel-row="1005"]'); }, async () => [/已选 2 项/.test(await text(page, '[data-bulk-bar]')) && /在 1 页内/.test(await text(page, '[data-sel-pages]')), await text(page, '[data-bulk-bar]')]);
  await step('L7 two tasks that both have a session: 对比报告 is offered', page, '[data-batch-compare]', null, async () => [/900/.test(await attr(page, '[data-batch-compare]', 'title') || '') && /901/.test(await attr(page, '[data-batch-compare]', 'title') || ''), await attr(page, '[data-batch-compare]', 'title')]);
  await safe(() => page.click('button[aria-label="下一页"]')); await page.waitForTimeout(400);
  await step('L7 a row on page 2 joins the selection: 3 items across 2 pages', page, '[data-sel-row="1021"]', (l) => l.check(), async () => [/已选 3 项/.test(await text(page, '[data-bulk-bar]')) && /跨 2 页/.test(await text(page, '[data-sel-pages]')) && (await attr(page, '[data-sel-pages]', 'data-sel-pages')) === '2', await text(page, '[data-bulk-bar]')]);
  st('L7 with three selected 对比报告 is gone (it needs exactly two)', (await count(page, '[data-batch-compare]')) === 0);
  st('L7 page 2: the header box is indeterminate (some of this page)', await page.$eval('[data-sel-all]', (el) => el.indeterminate && !el.checked).catch(() => false));
  await closeup(page, '[data-tasks-list]', 'closeup-cross-page-selection.png');
  await closeup(page, '[data-bulk-bar]', 'closeup-bulk-bar.png');
  await step('L7 选择本页全部 on page 2: 22 items', page, '[data-sel-all]', (l) => l.check(), async () => [/已选 22 项/.test(await text(page, '[data-bulk-bar]')) && (await page.$$eval('[data-sel-row]', (b) => b.every((x) => x.checked))), await text(page, '[data-bulk-bar]')]);
  await safe(() => page.click('button[aria-label="上一页"]')); await page.waitForTimeout(400);
  st('L7 back on page 1 the two rows are still ticked, and only they', same(await page.$$eval('[data-sel-row]:checked', (b) => b.map((x) => Number(x.getAttribute('data-sel-row')))), [1000, 1005]), brief(await page.$$eval('[data-sel-row]:checked', (b) => b.map((x) => Number(x.getAttribute('data-sel-row'))))));
  st('L7 selected rows are marked for assistive technology', (await attr(page, '[data-task-row="1000"]', 'aria-selected')) === 'true' && (await attr(page, '[data-task-row="1001"]', 'aria-selected')) === 'false');
  await step('L7 选择本页全部 again on page 2 removes that page only', page, 'button[aria-label="下一页"]', async (l) => { await l.click(); await page.waitForTimeout(300); await page.uncheck('[data-sel-all]'); }, async () => [/已选 2 项/.test(await text(page, '[data-bulk-bar]')), await text(page, '[data-bulk-bar]')]);
  await safe(() => page.click('button[aria-label="上一页"]')); await page.waitForTimeout(300);

  // bulk actions (selection: 1000 done, 1005 done)
  await step('L8 bulk 对比报告 goes to the report page with the two sessions (sid, cmp)', page, '[data-batch-compare]', async (l) => { await page.evaluate(() => { window.__h = []; for (const k of ['pushState', 'replaceState']) { const f = history[k]; history[k] = function (...x) { window.__h.push(decodeURIComponent(String(x[2] || '').replace(/^.*#/, ''))); return f.apply(this, x); }; } }); await l.click(); }, async () => { await page.waitForTimeout(600); const hs = await page.evaluate(() => window.__h || []); const h = await hash(page); return [hs[0] === '/reports?sid=900&cmp=901' && /^\/reports/.test(h), `${hs.join(' → ')}`]; });
  await safe(async () => { await page.goto(base + '#/tasks'); await page.waitForTimeout(900); });
  st('L8 coming back, the list is there again', (await count(page, '[data-task-row]')) === 20, String(await count(page, '[data-task-row]')));
  await safe(async () => { await page.check('[data-sel-row="1000"]'); await page.check('[data-sel-row="1003"]'); await page.check('[data-sel-row="1001"]'); });
  const dl = async (trigger) => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: LIMIT.act }), trigger()]); return { name: d.suggestedFilename(), body: fs.readFileSync(await d.path(), 'utf8') }; };
  await step('L8 bulk export CSV: the selected tasks, one line each', page, '[data-batch-export]', click, async () => { const f = await dl(() => page.click('[data-batch-csv]')); const lines = f.body.replace(/^﻿/, '').trim().split(/\r?\n/); const ids = lines.slice(1).map((l) => Number(l.split(',')[0].replace(/"/g, ''))); return [/\.csv$/.test(f.name) && same(ids, [1000, 1001, 1003]) && /^"?ID/.test(lines[0]), `${f.name}: ${lines.length - 1} rows, ids ${ids.join(',')}`]; });
  await step('L8 bulk export JSON: the same tasks with the same fields as before', page, '[data-batch-export]', click, async () => { const f = await dl(() => page.click('[data-batch-json]')); const doc = JSON.parse(f.body); const rows = doc.rows || []; return [/\.json$/.test(f.name) && doc.count === 3 && same(rows.map((r) => r.ID), [1000, 1001, 1003]) && ['ID', '类型', '目标应用', '包名', '壳', '状态语义', '业务码类数', '漏洞C', '漏洞H', '漏洞M', '漏洞L', '操作员', '耗时秒'].every((k) => k in rows[0]), `${f.name}: ${rows.length} rows; keys ${Object.keys(rows[0]).join('/')}`]; });
  st('L8 the page says what it exported', /已导出选中的 3 行\(JSON\)/.test(await text(page, '[data-batch-msg]')), await text(page, '[data-batch-msg]'));
  let before = state.posts.length;
  await step('L8 bulk 重新运行 asks first and lists the tasks', page, '[data-batch-retry]', click, async () => { const t = await text(page, '[data-batch-retry-modal]'); return [/重新运行 3 个任务/.test(t) && /#1000/.test(t) && /#1001/.test(t) && /#1003/.test(t) && state.posts.length === before, t.slice(0, 120)]; });
  await step('L8 confirming sends one POST /api/tasks per task, with the old payload', page, '[data-batch-retry-confirm]', click, async () => { await page.waitForTimeout(700); const p = state.posts.slice(before); const b = p.map((x) => { try { return JSON.parse(x.body); } catch { return {}; } }); return [p.length === 3 && p.every((x) => x.key === 'POST /api/tasks') && b.every((x) => x.authorized === '任务中心重跑') && same(b.map((x) => `${x.kind}:${x.app_name}`), ['audit:App 00', 'audit:App 01', 'unpack:App 03']) && b.every((x) => Object.keys(x).every((k) => ['kind', 'app_name', 'apk_path', 'authorized'].includes(k))), p.map((x) => x.key + ' ' + x.body.slice(0, 90)).join(' | ')]; });
  st('L8 the result line counts them and the selection is cleared', /已重新运行 3 个任务/.test(await text(page, '[data-batch-msg]')) && (await count(page, '[data-bulk-bar]')) === 0, await text(page, '[data-batch-msg]'));
  await safe(async () => { await page.waitForTimeout(1000); await page.check('[data-sel-row="1000"]'); await page.check('[data-sel-row="1001"]'); await page.check('[data-sel-row="1003"]'); });
  before = state.posts.length;
  await step('L8 bulk 删除 asks first (alert dialog) and says it cannot be undone', page, '[data-batch-del]', click, async () => { const t = await text(page, '[data-batch-del-modal]'); return [(await count(page, '[role="alertdialog"]')) === 1 && /删除 3 个任务/.test(t) && /无法恢复/.test(t) && state.posts.length === before, t.slice(0, 120)]; });
  await step('L8 confirming deletes what the server allows and says what was skipped', page, '[data-batch-del-confirm]', click, async () => { await page.waitForTimeout(900); const p = state.posts.slice(before).map((x) => x.key); const m = await text(page, '[data-batch-msg]'); return [same(p, ['DELETE /api/tasks/1000', 'DELETE /api/tasks/1001', 'DELETE /api/tasks/1003']) && /已删除 2 个任务/.test(m) && /跳过 1 个/.test(m), `${p.join(' | ')} — ${m}`]; });
  st('L8 the deleted rows are gone, the refused one is still there', (await count(page, '[data-task-row="1000"]')) === 0 && (await count(page, '[data-task-row="1003"]')) === 0 && (await count(page, '[data-task-row="1001"]')) === 1 && /共 63 条/.test(await text(page, '[data-v3-pagination]')), await text(page, '[data-v3-pagination]'));
  await step('L8 取消选择 empties the selection', page, '[data-sel-row="1002"]', async (l) => { await l.check(); await page.click('[data-bulk-bar] button:has-text("取消选择")'); }, async () => [(await count(page, '[data-bulk-bar]')) === 0 && (await count(page, '[data-sel-row]:checked')) === 0, '']);

  // header export, clean-up, refresh
  await safe(() => page.click('[data-toolbar-filter="queued"]')); await page.waitForTimeout(300);
  await step('L9 header export CSV: every row of the current filter, not only the page', page, '[data-toolbar-export-toggle]', click, async () => { const f = await dl(() => page.click('[data-toolbar-export-item="csv"]')); const n = f.body.trim().split(/\r?\n/).length - 1; return [n === 13 && /当前筛选结果 13 行/.test(await text(page, '[data-batch-msg]')), `${f.name}: ${n} rows`]; });
  await safe(() => page.click('[data-toolbar-filter=""]')); await page.waitForTimeout(300);
  await step('L9 header export JSON: all 63 tasks', page, '[data-toolbar-export-toggle]', click, async () => { const f = await dl(() => page.click('[data-toolbar-export-item="json"]')); const rows = JSON.parse(f.body).rows || []; return [rows.length === 63 && same(rows.map((r) => r.ID), all().map((t) => t.id)), `${f.name}: ${rows.length} rows`]; });
  await safe(() => page.selectOption('[data-packer-filter]', 'vendor-b')); await page.waitForTimeout(400);
  const failedB = expect(all(), { packer: 'vendor-b', status: 'failed' });
  st('L9 清理失败任务 counts the failed tasks of the current filter', new RegExp(`\\(${failedB.length}\\)`).test(await text(page, '[data-clean-failed]')), `${await text(page, '[data-clean-failed]')} — expected ${failedB.length}`);
  before = state.posts.length;
  await step('L9 清理失败任务 asks first and names its scope', page, '[data-clean-failed]', click, async () => { const t = await text(page, '[data-clean-failed-modal]'); return [new RegExp(`删除 ${failedB.length} 个失败任务`).test(t) && /当前搜索和筛选结果/.test(t) && (await count(page, '[role="alertdialog"]')) === 1 && state.posts.length === before, t.slice(0, 100)]; });
  await step('L9 confirming deletes exactly those tasks', page, '[data-clean-failed-confirm]', click, async () => { await page.waitForTimeout(900); const p = state.posts.slice(before).map((x) => x.key); return [same(p, failedB.map((id) => `DELETE /api/tasks/${id}`)) && new RegExp(`已删除 ${failedB.length} 个失败任务`).test(await text(page, '[data-batch-msg]')), p.join(' | ')]; });
  st('L9 afterwards the button is disabled at (0) for this filter', (await page.locator('[data-clean-failed]').isDisabled().catch(() => false)) && /\(0\)/.test(await text(page, '[data-clean-failed]')), await text(page, '[data-clean-failed]'));
  await safe(() => page.selectOption('[data-packer-filter]', 'all')); await page.waitForTimeout(2200);
  let n0 = state.reqs.filter((r) => r === 'GET /api/tasks?limit=2000').length;
  await step('L9 刷新 reads the list once more', page, '[data-tasks-refresh]', click, async () => { await page.waitForTimeout(700); const n = state.reqs.filter((r) => r === 'GET /api/tasks?limit=2000').length; return [n === n0 + 1, `${n - n0} read(s)`]; });
  await step('L9 the batch-unpack block is collapsed to one line and opens', page, '[data-batch-toggle]', click, async () => [(await attr(page, '[data-batch-summary]', 'data-open')) === '1' && /批量脱壳合计/.test(await page.locator('[data-batch-summary]').innerHTML()), await text(page, '[data-batch-toggle]')]);
  await step('L9 新建评估 goes to the assessment page', page, '[data-toolbar-create]', click, async () => { await page.waitForTimeout(600); return [/^\/new-assessment/.test(await hash(page)), await hash(page)]; });

  // query parameters
  for (const [q, f, label] of [['?status=failed', { status: 'failed' }, 'status=failed'], ['?status=done&partial=1', { status: 'done', partial: true }, 'status=done&partial=1'], ['?status=degraded', { status: 'done', partial: true }, 'the old status=degraded']]) {
    const o = await open('/tasks' + q, { over: world(bigTasks(), BIG_SESS).over });
    const ids = await rowIds(o.page); const exp = expect(bigTasks(), f).slice(0, 20);
    st(`L10 a link with ${label} opens on that filter`, same(ids, exp) && (f.partial ? (await attr(o.page, '[data-partial-toggle]', 'data-active')) === '1' : true), `${brief(ids)} — ${await hash(o.page)}`);
    await o.ctx.close(); live.delete(o.ctx);
  }
  const o = await open('/tasks?focus=1040', { over: world(bigTasks(), BIG_SESS).over });
  st('L10 a link with focus= puts that task first, marks it and gives it the focus', (await rowIds(o.page))[0] === 1040 && (await attr(o.page, '[data-task-row="1040"]', 'data-focused')) === '1' && /data-task-row=1040/.test(await active(o.page)), `first row ${(await rowIds(o.page))[0]}; focus on “${await active(o.page)}”`);
  st('L10 no page error during the list checks', state.errors.length === 0 && o.state.errors.length === 0, [...state.errors, ...o.state.errors].join(' | '));
});

// ───────────────────────────── R. Row entries ─────────────────────────────
await group('R', async () => {
  const w = world(smallTasks(), null);
  let { page, state, ctx } = await open('/tasks', { over: w.over });
  const onLoad = state.reqs.slice();
  // Back to the list by its address, so a check that did not navigate cannot send the next ones to another page.
  const toList = () => safe(async () => { await page.goto(base + '#/tasks'); await page.waitForTimeout(900); });
  const within = (id, sel) => `[data-task-row="${id}"] ${sel}`;
  st('R1 a finished assessment with a session: 会话, 报告 and 产物 are buttons in the row', (await count(page, within(100, '[data-goto-session]'))) === 1 && (await count(page, within(100, '[data-act-report]'))) === 1 && (await count(page, within(100, '[data-artifacts-btn="100"]'))) === 1, await text(page, '[data-task-row="100"] td:last-child'));
  await step('R1 the row menu holds 详情, 重新运行, 向智能体提问, 删除', page, within(100, '[data-more-btn]'), click, async () => { const m = '[data-more-menu]'; return [(await count(page, `${m} [data-act-detail]`)) === 1 && (await count(page, `${m} [data-act-rerun]`)) === 1 && (await count(page, `${m} [data-ask-btn]`)) === 1 && (await count(page, `${m} [data-act-del]`)) === 1, await text(page, m)]; });
  await closeup(page, '[data-tasks-list]', 'closeup-row-menu.png');
  // Taking the picture can scroll the list, which closes the menu: open it again if it is gone.
  if (!(await count(page, '[data-more-menu]'))) await safe(() => page.click(within(100, '[data-more-btn]')));
  await step('R1 详情 opens /tasks/100', page, '[data-more-menu] [data-act-detail]', click, async () => { await page.waitForTimeout(700); return [(await hash(page)) === '/tasks/100' && (await count(page, '[data-task-detail="100"]')) === 1, await hash(page)]; });
  await toList();
  await step('R1 pressing the row opens the detail of that task', page, '[data-task-row="101"] [data-task-id]', click, async () => { await page.waitForTimeout(700); return [(await hash(page)) === '/tasks/101', await hash(page)]; });
  await toList();
  await step('R1 会话 opens the linked session, not the detail', page, within(100, '[data-goto-session]'), click, async () => { await page.waitForTimeout(700); return [(await hash(page)) === '/projects/1/sessions/40', await hash(page)]; });
  await toList();
  await step('R1 报告 opens the report of that task', page, within(100, '[data-act-report]'), click, async () => { await page.waitForTimeout(700); return [(await hash(page)) === '/reports?taskId=100', await hash(page)]; });
  await toList();
  let n = state.reqs.length;
  await step('R1 产物 opens the artifact browser in a dialog and stays on the list', page, within(100, '[data-artifacts-btn]'), click, async () => { await page.waitForTimeout(900); return [(await count(page, '[role="dialog"] [data-art-browser]')) === 1 && (await hash(page)) === '/tasks' && state.reqs.slice(n).some((r) => /GET \/api\/tasks\/100\/artifacts\?prefix=/.test(r)), state.reqs.slice(n).join(' | ').slice(0, 160)]; });
  await safe(async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(400); });
  await step('R1 向智能体提问 goes to the agent with the task', page, within(100, '[data-more-btn]'), async (l) => { await l.click(); await page.click('[data-more-menu] [data-ask-btn]'); }, async () => { await page.waitForTimeout(700); return [(await hash(page)) === '/agent?task=100', await hash(page)]; });
  await toList();

  // rerun
  st('R2 a failed task has 重新运行 as a button in the row', (await count(page, within(102, '[data-act-retry]'))) === 1);
  n = state.posts.length;
  await step('R2 it opens the rerun dialog for that task (device, mode, depth)', page, within(102, '[data-act-retry]'), click, async () => [(await count(page, '[data-rerun-modal]')) === 1 && (await count(page, '[data-rerun-device]')) === 1 && (await count(page, '[data-rerun-mode]')) === 1 && (await count(page, '[data-rerun-depth]')) === 1 && /#102/.test(await text(page, '[role="dialog"]')), (await text(page, '[role="dialog"]')).slice(0, 80)]);
  await step('R2 confirming sends POST /api/tasks/102/rerun and focuses the new task', page, '[data-rerun-confirm]', click, async () => { await page.waitForTimeout(1600); const p = state.posts.slice(n); const b = (() => { try { return JSON.parse(p[0]?.body || '{}'); } catch { return {}; } })(); const h = await hash(page); return [p.length === 1 && p[0].key === 'POST /api/tasks/102/rerun' && 'device_serial' in b && 'mode' in b && 'depth' in b && h === '/tasks?focus=5000' && (await rowIds(page))[0] === 5000, `${p.map((x) => x.key + ' ' + x.body).join(' | ')} → ${h}`]; });
  await step('R2 a task that did not fail has 重新运行 in its menu', page, within(104, '[data-more-btn]'), async (l) => { await l.click(); await page.click('[data-more-menu] [data-act-rerun]'); }, async () => [(await count(page, '[data-rerun-modal]')) === 1 && /#104/.test(await text(page, '[role="dialog"]')), (await text(page, '[role="dialog"]')).slice(0, 60)]);
  await safe(async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(300); });

  // delete
  n = state.posts.length;
  await step('R3 删除 asks first, says it cannot be undone, and sends nothing yet', page, within(107, '[data-more-btn]'), async (l) => { await l.click(); await page.click('[data-more-menu] [data-act-del]'); }, async () => { const t = await text(page, '[role="alertdialog"]'); return [/删除任务 #107/.test(t) && /无法恢复/.test(t) && state.posts.length === n, t.slice(0, 90)]; });
  await step('R3 取消 keeps the task', page, '[data-confirm-cancel]', click, async () => { await page.waitForTimeout(300); return [(await count(page, '[role="alertdialog"]')) === 0 && state.posts.length === n && (await count(page, '[data-task-row="107"]')) === 1, '']; });
  await step('R3 confirming sends DELETE /api/tasks/107 and the row goes', page, within(107, '[data-more-btn]'), async (l) => { await l.click(); await page.click('[data-more-menu] [data-act-del]'); await page.click('[data-confirm-ok]'); }, async () => { await page.waitForTimeout(1500); return [same(state.posts.slice(n).map((x) => x.key), ['DELETE /api/tasks/107']) && (await count(page, '[data-task-row="107"]')) === 0 && /已删除任务 #107/.test(await text(page, '[data-batch-msg]')), state.posts.slice(n).map((x) => x.key).join(' | ')]; });
  n = state.posts.length;
  await step('R3 a delete the server refuses says so and keeps the row', page, within(101, '[data-more-btn]'), async (l) => { await l.click(); await page.click('[data-more-menu] [data-act-del]'); await page.click('[data-confirm-ok]'); }, async () => { await page.waitForTimeout(900); const body = await text(page, 'body'); return [same(state.posts.slice(n).map((x) => x.key), ['DELETE /api/tasks/101']) && (await count(page, '[data-task-row="101"]')) === 1 && /任务 #101 没有删除/.test(body), (body.match(/任务 #101 没有删除[^。]*/) || ['no message'])[0]]; });

  // failure reason
  const reasonSel = '[data-task-reason="102"] [data-task-reason-text]';
  await step('R4 the failure reason is text in the row, complete', page, reasonSel, null, async () => { const t = await raw(page, reasonSel); return [t === LONG_REASON, `${t.length} of ${LONG_REASON.length} characters`]; });
  st('R4 it is under the row, in the same task (second line)', (await count(page, '[data-task-sub="102"] [data-task-reason="102"]')) === 1);
  st('R4 it is not carried by a title attribute', await page.$eval('[data-task-sub="102"]', (el, r) => ![el, ...el.querySelectorAll('*')].some((x) => (x.getAttribute('title') || '').includes(r.slice(0, 40))), LONG_REASON).catch(() => false));
  st('R4 it wraps: not cut, no ellipsis, can be selected', await page.$eval(reasonSel, (el) => { const cs = getComputedStyle(el); return cs.textOverflow !== 'ellipsis' && cs.whiteSpace.startsWith('pre-wrap') && cs.userSelect !== 'none' && el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().height > 40; }).catch(() => false));
  st('R4 the long reason does not widen the page', (await overflow(page)) <= 0, String(await overflow(page)));
  await step('R4 复制 puts exactly the full reason on the clipboard', page, '[data-task-reason-copy="102"]', click, async () => { await page.waitForTimeout(300); const c = await clip(page); return [c === LONG_REASON, `${c.length} of ${LONG_REASON.length} characters`]; });
  await step('R4 pressing the reason text does not leave the list (it can be selected)', page, reasonSel, click, async () => { await page.waitForTimeout(400); return [(await hash(page)).startsWith('/tasks?') || (await hash(page)) === '/tasks', await hash(page)]; });
  await closeup(page, '[data-task-sub="102"]', 'closeup-failure-reason-row.png');
  st('R4 a failed task with no reason from the server says exactly that, with nothing to copy', /服务端没有返回失败原因/.test(await text(page, '[data-task-reason="108"]')) && (await count(page, '[data-task-reason-copy="108"]')) === 0, await text(page, '[data-task-reason="108"]'));
  st('R4 the status cell says 失败 as a word with a glyph', /失败/.test(await text(page, within(102, '[data-task-status]'))) && (await count(page, within(102, '[data-task-status] svg'))) >= 1, await text(page, within(102, '[data-task-status]')));
  st('R4 a partly finished task shows its reason in the second line', (await count(page, '[data-task-sub="105"] [data-unpack-reason]')) === 1 && /部分完成/.test(await text(page, within(105, '[data-task-status]'))), await text(page, '[data-task-sub="105"]'));
  st('R4 a running task shows its live progress in the second line', /反编译/.test(await text(page, '[data-task-sub="101"]')) && /42%/.test(await text(page, '[data-task-sub="101"]')), await text(page, '[data-task-sub="101"]'));

  // artifacts rule (766a717): finished assessment or unpack, or a linked session
  const has = (id) => count(page, `[data-artifacts-btn="${id}"]`);
  st('R5 artifacts entry: finished assessment (104) and finished unpack (105)', (await has(104)) === 1 && (await has(105)) === 1);
  st('R5 artifacts entry: running (101), failed (102), queued (103) tasks with a session', (await has(101)) === 1 && (await has(102)) === 1 && (await has(103)) === 1);
  st('R5 no artifacts entry: queued without a session (106), failed without a session (108)', (await has(106)) === 0 && (await has(108)) === 0);
  st('R5 the list did not ask the artifacts endpoint to decide', onLoad.length > 0 && !onLoad.some((r) => /\/artifacts\?/.test(r)), `${onLoad.length} requests on load`);
  await ctx.close(); live.delete(ctx);
  ({ page, state, ctx } = await open('/tasks', { over: world(smallTasks(), null).over, deny: /\/api\/tasks\/\d+\/artifacts/ }));
  st('R5 with the artifacts endpoint refused, the entries are the same', (await count(page, '[data-artifacts-btn]')) === 7 && (await count(page, '[data-artifacts-btn="106"]')) === 0, String(await count(page, '[data-artifacts-btn]')));
  await step('R5 the dialog then shows the permission state, without retry wording', page, '[data-artifacts-btn="100"]', click, async () => { await page.waitForTimeout(900); const t = await text(page, '[role="dialog"]'); return [(await count(page, '[role="dialog"] [data-state="permission"]')) >= 1 && !RETRY.test(t), t.slice(0, 120)]; });
  await ctx.close(); live.delete(ctx);
  ({ page, state, ctx } = await open('/tasks', { over: world(smallTasks(), null).over, deny: /\/api\/pentest\/sessions$/ }));
  st('R5 with the session list refused: finished tasks keep the entry, the others have none, no session button', same(await page.$$eval('[data-artifacts-btn]', (b) => b.map((x) => Number(x.getAttribute('data-artifacts-btn')))), [100, 104, 105, 107]) && (await count(page, '[data-goto-session]')) === 0, brief(await page.$$eval('[data-artifacts-btn]', (b) => b.map((x) => Number(x.getAttribute('data-artifacts-btn'))))));
  await ctx.close(); live.delete(ctx);

  // counts
  ({ page, state, ctx } = await open('/tasks', { over: world(smallTasks(), null).over, deny: /\/api\/tasks\/counts/ }));
  const cs = await page.$$eval('[data-vuln-counts]', (els) => els.map((e) => [e.getAttribute('data-counts-state'), e.textContent.trim()]));
  st('R6 counts refused (403): every row says 未读取, none shows 0', cs.length === 10 && cs.every(([s, t]) => s === 'forbidden' && /未读取/.test(t) && !/\d/.test(t) && !/没有发现/.test(t)), JSON.stringify(cs.slice(0, 2)));
  await ctx.close(); live.delete(ctx);
  ({ page, state, ctx } = await open('/tasks', { over: world(smallTasks(), null).over, fail: /\/api\/tasks\/counts/ }));
  const cf = await page.$$eval('[data-vuln-counts]', (els) => els.map((e) => [e.getAttribute('data-counts-state'), e.textContent.trim()]));
  st('R6 counts failed (500): every row says 未读取, none shows 0', cf.length === 10 && cf.every(([s, t]) => s === 'failed' && /未读取/.test(t) && !/\d/.test(t)), JSON.stringify(cf.slice(0, 2)));
  await ctx.close(); live.delete(ctx);
  ({ page, state, ctx } = await open('/tasks', { over: world(smallTasks(), null).over }));
  st('R6 counts read: a task with no finding says 没有发现, the others four figures', /没有发现/.test(await text(page, within(102, '[data-vuln-counts]'))) && /C\d+\s*H\d+\s*M\d+\s*L\d+/.test((await text(page, within(100, '[data-vuln-counts]'))).replace(/\s+/g, ' ')), `${await text(page, within(102, '[data-vuln-counts]'))} / ${await text(page, within(100, '[data-vuln-counts]'))}`);
  await ctx.close(); live.delete(ctx);

  // widths
  ({ page, state, ctx } = await open('/tasks', { over: world(smallTasks(), null).over, width: 1024 }));
  st('R7 at 1024 the row buttons show icons and keep their names', await page.$eval('[data-task-row="100"] [data-goto-session]', (b) => b.textContent.trim() === '会话' && b.getBoundingClientRect().width < 48).catch(() => false), '');
  await step('R7 at 1024 the report is in the row menu', page, '[data-task-row="100"] [data-more-btn]', click, async () => [(await count(page, '[data-more-menu] [data-act-report]')) === 1 && (await page.$$eval('[data-task-row="100"] [data-act-report]', (b) => b.filter((x) => !x.closest('[data-more-menu]')).length)) === 0, await text(page, '[data-more-menu]')]);
  await ctx.close(); live.delete(ctx);
  ({ page, state, ctx } = await open('/tasks', { over: world(smallTasks(), null).over, width: 390, height: 844 }));
  st('R7 at 390 a task is a card with the same entries and the reason under it', (await attr(page, '[data-task-table]', 'data-table-layout')) === 'cards' && (await count(page, '[data-task-row="102"] [data-act-retry]')) === 1 && (await count(page, '[data-task-row="102"] [data-artifacts-btn]')) === 1 && (await raw(page, '[data-task-row="102"] [data-task-reason-text]')) === LONG_REASON && (await overflow(page)) <= 0, `overflow ${await overflow(page)}`);
  await ctx.close(); live.delete(ctx);
  ({ page, state, ctx } = await open('/tasks', { over: world(smallTasks(), null).over, width: 1680 }));
  st('R7 at 1680 the owner has its own column', (await page.$$eval('[data-task-table] thead th', (h) => h.map((x) => x.textContent.trim()))).includes('负责人') && /demo|reviewer/.test(await text(page, '[data-task-row="100"] [data-operator]')), await text(page, '[data-task-row="100"] [data-operator]'));
  st('R7 no page error during the row checks', state.errors.length === 0, state.errors.join(' | '));
});

// ───────────────────────────── D. Detail ─────────────────────────────
await group('D', async () => {
  const w = world(smallTasks(), null);
  let { page, state, ctx } = await open('/tasks/101', { over: w.over, downloads: true });
  st('D1 /tasks/101 shows the detail of task 101', (await attr(page, '[data-task-detail]', 'data-task-detail')) === '101' && (await attr(page, '[data-task-detail]', 'data-task-detail-state')) === 'ok', await attr(page, '[data-task-detail]', 'data-task-detail-state'));
  st('D1 header: back link, title, id, type, package', (await attr(page, '[data-task-back]', 'href') || '').endsWith('#/tasks?focus=101') && (await text(page, '[data-task-title]')) === 'Wallet' && (await text(page, '[data-task-header] [data-task-id]')) === '#101' && /com\.example\.wallet/.test(await text(page, '[data-task-header]')), await text(page, '[data-task-header]'));
  st('D1 header facts: status 运行中, stage 反编译 42%, duration', /运行中/.test(await text(page, '[data-task-facts] [data-task-status]')) && /反编译 42%/.test(await text(page, '[data-task-stage]')) && /\d+h|\d+m/.test(await text(page, '[data-task-dur]')), await text(page, '[data-task-facts]'));
  st('D1 header actions: 打开会话, 重新运行, 更多', same(await page.$$eval('[data-task-actions] button', (b) => b.map((x) => x.textContent.trim())), ['打开会话', '重新运行', '更多']), (await page.$$eval('[data-task-actions] button', (b) => b.map((x) => x.textContent.trim()))).join(','));
  st('D1 run strip: the two stages the progress text names, the second one active', (await attr(page, '[data-task-strip]', 'data-strip-stages')) === '2' && (await attr(page, '[data-task-strip]', 'data-strip-parsed')) === '1' && same(await page.$$eval('[data-task-strip] [data-run-strip] [data-strip-stage]', (c) => c.map((x) => x.getAttribute('data-strip-mode'))), ['past', 'active']) && /脱壳/.test(await text(page, '[data-strip-stage="1"]')) && /反编译/.test(await text(page, '[data-strip-stage="2"]')), await text(page, '[data-task-strip]'));
  st('D1 it is the workbench run strip (same component, same hooks)', (await count(page, '[data-task-strip] [data-run-strip][role="group"]')) === 1 && (await count(page, '[data-task-strip] [data-live-dot]')) === 1);
  st('D1 tabs 输出 · 产物 · 时间线 in a tablist, 输出 selected', same(await page.$$eval('[role="tablist"][aria-label="任务内容"] [role="tab"]', (t) => t.map((x) => x.textContent.trim() + ':' + x.getAttribute('aria-selected'))), ['输出:true', '产物:false', '时间线:false']));
  st('D1 a running task has no report: the place says 没有报告, no link', (await count(page, '[data-task-report-none]')) === 1 && (await count(page, '[data-task-report-link]')) === 0);

  // output
  const o = '[data-task-output]';
  st('D2 output: grouped by the stages of the progress text, then the log file', same(await page.$$eval(`${o} [data-stage-head]`, (s) => s.map((x) => x.getAttribute('data-stage-head'))), ['1', '2', '日志']) && (await attr(page, o, 'data-output-parsed')) === '1', (await page.$$eval(`${o} [data-stage-head]`, (s) => s.map((x) => x.getAttribute('data-stage-head')))).join(','));
  st('D2 output lines are the text of the progress, in monospace', same(await page.$$eval(`${o} [data-output-line^="1:"] [data-output-text], ${o} [data-output-line^="2:"] [data-output-text]`, (l) => l.map((x) => x.textContent)), ['Unpack: 100% · 3 dex', 'Decompile: 42% · jadx 4200/10000 classes']) && /mono/i.test(await page.$eval(`${o} [data-output-text]`, (el) => getComputedStyle(el).fontFamily)));
  st('D2 the source line says where the output comes from', /进度文本/.test(await text(page, '[data-output-source]')) && /日志文件 run\.log/.test(await text(page, '[data-output-source]')), await text(page, '[data-output-source]'));
  st('D2 each group states its lines and its source', /1 行 · 来自进度文本/.test(await text(page, `${o} [data-stage-head="1"] [data-output-summary]`)) && /3 行 · 来自产物里的日志文件/.test(await text(page, `${o} [data-stage-head="日志"] [data-output-summary]`)), await text(page, `${o} [data-stage-head="日志"] [data-output-summary]`));
  st('D2 the list is labelled 任务输出', (await attr(page, `${o} [data-trace-scroller]`, 'aria-label')) === '任务输出');
  st('D2 the line count is stated', /共 5 行/.test(await text(page, '[data-output-count]')) && (await attr(page, o, 'data-output-lines')) === '5', await text(page, '[data-output-count]'));
  await step('D3 search “stage”: the hit count and the lines that hold it', page, '[data-output-search]', (l) => l.fill('stage'), async () => { await page.waitForTimeout(300); return [(await attr(page, '[data-output-count]', 'data-hits')) === '3' && /命中 3 处，3 行/.test(await text(page, '[data-output-count]')) && (await count(page, '[data-output-hit]')) === 3 && (await count(page, '[data-output-line]')) === 3, await text(page, '[data-output-count]')]; });
  await step('D3 search “s”: occurrences are counted, not lines', page, '[data-output-search]', (l) => l.fill('S1'), async () => { await page.waitForTimeout(300); return [(await attr(page, '[data-output-count]', 'data-hits')) === '2' && (await count(page, '[data-output-hit]')) === 2 && same(await page.$$eval('[data-output-hit]', (m) => m.map((x) => x.textContent)), ['S1', 'S1']), await text(page, '[data-output-count]')]; });
  await closeup(page, o, 'closeup-search-hits.png');
  await step('D3 a search with no match says so and offers to clear', page, '[data-output-search]', (l) => l.fill('zzz-nothing'), async () => { await page.waitForTimeout(300); return [(await count(page, '[data-output-state="no-match"]')) === 1 && /输出有 5 行/.test(await text(page, '[data-output-state="no-match"]')), await text(page, '[data-output-state="no-match"]')]; });
  await step('D3 清除搜索 shows every line again', page, '[data-output-clear]', click, async () => { await page.waitForTimeout(300); return [(await count(page, '[data-output-line]')) === 5 && (await page.inputValue('[data-output-search]')) === '', '']; });
  const PLAIN = '## 1 脱壳\nUnpack: 100% · 3 dex\n\n## 2 反编译\nDecompile: 42% · jadx 4200/10000 classes\n\n## 日志 日志文件 run.log\n10:00:01 stage S1 start\n10:00:09 stage S1 done\n10:00:10 stage S2 start';
  await step('D3 复制 puts the whole output on the clipboard, group by group', page, '[data-output-copy]', click, async () => { await page.waitForTimeout(300); const c = await clip(page); return [c === PLAIN && (await attr(page, '[data-output-copy]', 'data-copied')) === 'ok', JSON.stringify(c.slice(0, 80))]; });
  await step('D3 下载 saves the same text as task-101-output.txt', page, '[data-output-download]', null, async () => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: LIMIT.act }), page.click('[data-output-download]')]); const body = fs.readFileSync(await d.path(), 'utf8'); return [d.suggestedFilename() === 'task-101-output.txt' && body === PLAIN + '\n', d.suggestedFilename()]; });
  await step('D3 the wrap switch states its state and changes the lines', page, '[data-output-wrap]', click, async () => [(await attr(page, '[data-output-wrap]', 'aria-pressed')) === 'false' && (await page.$eval('[data-output-text]', (el) => getComputedStyle(el).whiteSpace)) === 'pre', await attr(page, '[data-output-wrap]', 'aria-label')]);
  await safe(() => page.click('[data-output-wrap]'));
  st('D3 a running task follows new output', (await attr(page, o, 'data-output-follow')) === 'on' && (await attr(page, '[data-output-follow-toggle]', 'data-output-follow-toggle')) === 'on' && (await page.locator('[data-output-follow-toggle] input').isChecked().catch(() => false)));
  await step('D3 a group can be folded and opened', page, `${o} [data-stage-head="1"]`, click, async () => { await page.waitForTimeout(300); const folded = (await count(page, `${o} [data-output-line^="1:"]`)) === 0 && (await attr(page, `${o} [data-stage-head="1"]`, 'data-stage-open')) === '0'; await page.click(`${o} [data-stage-head="1"]`); await page.waitForTimeout(300); return [folded && (await count(page, `${o} [data-output-line^="1:"]`)) === 1, `folded ${folded}`]; });

  // timeline
  await step('D4 时间线 tab: the address carries ?tab=timeline', page, '[data-task-tab="timeline"]', click, async () => { await page.waitForTimeout(900); return [/tab=timeline/.test(await hash(page)) && (await count(page, '[data-task-panel="timeline"] [data-task-timeline]')) === 1, await hash(page)]; });
  st('D4 three blocks, each with its source: 任务, 任务阶段, 关联会话的步骤', same(await page.$$eval('[data-task-timeline] section h3', (h) => h.map((x) => x.textContent.trim())), ['任务', '任务阶段', '关联会话的步骤']) && (await count(page, '[data-task-timeline] [data-timeline-source]')) === 3, (await page.$$eval('[data-task-timeline] [data-timeline-source]', (p) => p.map((x) => x.textContent.trim().slice(0, 24)))).join(' | '));
  st('D4 task block: created, started, last update, duration from the task row', same(await page.$$eval('[data-timeline-fact]', (d) => d.map((x) => x.getAttribute('data-timeline-fact'))), ['创建时间', '开始时间', '最后更新', '耗时']) && /\d{4}|\d{2}:\d{2}/.test(await text(page, '[data-timeline-fact="创建时间"]')), await text(page, '[data-timeline-task]'));
  st('D4 stages: exactly the two the progress text names', (await attr(page, '[data-timeline-stages]', 'data-timeline-stages')) === '2' && same(await page.$$eval('[data-timeline-stage]', (r) => r.map((x) => x.getAttribute('data-timeline-stage'))), ['1', '2']) && /脱壳/.test(await text(page, '[data-timeline-stage="1"]')) && /反编译/.test(await text(page, '[data-timeline-stage="2"]')));
  st('D4 stage start, end and duration all say 未记录 (six cells), nothing worked out', same(await page.$$eval('[data-stage-start], [data-stage-end], [data-stage-dur]', (c) => c.map((x) => x.textContent.trim())), Array(6).fill('未记录')), (await page.$$eval('[data-stage-start], [data-stage-end], [data-stage-dur]', (c) => c.map((x) => x.textContent.trim()))).join(','));
  st('D4 the source says the backend does not record stage times', /后端不记录每个阶段的起止时间/.test(await text(page, '[data-timeline-stages] [data-timeline-source]')), await text(page, '[data-timeline-stages] [data-timeline-source]'));
  const steps = fixture('GET', new URL('http://x/api/pentest/sessions/41/timeline')).steps || [];
  st('D4 session steps: a separate block, labelled as the session’s, from the session timeline', (await attr(page, '[data-timeline-session]', 'data-timeline-session')) === '41' && (await attr(page, '[data-timeline-session]', 'data-timeline-session-state')) === 'ok' && (await count(page, '[data-session-step]')) === steps.length && steps.length > 0 && /这是会话的步骤，不是这个任务的阶段/.test(await text(page, '[data-timeline-session] [data-timeline-source]')), `${await count(page, '[data-session-step]')} of ${steps.length} steps`);
  st('D4 session steps are not inside the task stages table', (await count(page, '[data-timeline-stages] [data-session-step]')) === 0 && (await count(page, '[data-timeline-session] [data-timeline-stage]')) === 0);
  st('D4 a step without a time or duration says 未记录', steps.every((s) => s.ts || s.duration_ms != null) || (await count(page, '[data-timeline-session] [data-unrecorded]')) > 0, `${await count(page, '[data-timeline-session] [data-unrecorded]')} cells`);
  await step('D4 the session block links to the session', page, '[data-timeline-open-session]', null, async () => [(await attr(page, '[data-timeline-open-session]', 'href') || '').endsWith('#/projects/1/sessions/41'), await attr(page, '[data-timeline-open-session]', 'href')]);

  // artifacts tab
  let n = state.reqs.length;
  await step('D5 产物 tab embeds the artifact browser of Phase 6', page, '[data-task-tab="artifacts"]', click, async () => { await page.waitForTimeout(1200); return [(await count(page, '[data-task-panel="artifacts"] [data-task-artifacts] [data-art-browser][data-state="ok"]')) === 1 && (await count(page, '[role="dialog"]')) === 0 && state.reqs.slice(n).some((r) => /GET \/api\/tasks\/101\/artifacts\?prefix=/.test(r)), await attr(page, '[data-art-browser]', 'data-state')]; });
  st('D5 the browser lists the files of the task', (await count(page, '[data-task-artifacts] [data-art-file]')) >= 3, String(await count(page, '[data-task-artifacts] [data-art-file]')));
  await ctx.close(); live.delete(ctx);

  // failed task, no stage in the text
  ({ page, state, ctx } = await open('/tasks/102', { over: w.over }));
  st('D6 failed task: the reason has its own line under the run strip, complete', (await raw(page, '[data-task-strip] [data-task-failure] [data-task-failure-text]')) === LONG_REASON && await page.$eval('[data-task-failure]', (el) => { const s = el.parentElement.querySelector('[data-run-strip]'); return !!s && s.getBoundingClientRect().bottom <= el.getBoundingClientRect().top + 1 && el.getBoundingClientRect().width > el.parentElement.getBoundingClientRect().width - 4; }).catch(() => false), `${(await raw(page, '[data-task-failure-text]')).length} of ${LONG_REASON.length} characters`);
  st('D6 the long reason wraps and does not widen the page', (await overflow(page)) <= 0 && await page.$eval('[data-task-failure-text]', (el) => el.scrollWidth <= el.clientWidth + 1).catch(() => false), `overflow ${await overflow(page)}`);
  await step('D6 复制 gives the full reason', page, '[data-task-failure-copy]', click, async () => { await page.waitForTimeout(300); const c = await clip(page); return [c === LONG_REASON, `${c.length} characters`]; });
  st('D6 no stage in the text: one stage called 输出, in the strip and in the output', (await attr(page, '[data-task-strip]', 'data-strip-stages')) === '1' && (await attr(page, '[data-task-strip]', 'data-strip-parsed')) === '0' && /输出/.test(await text(page, '[data-strip-stage="1"]')) && (await attr(page, '[data-task-output]', 'data-output-parsed')) === '0' && /输出/.test(await text(page, '[data-task-output] [data-stage-head="1"]')) && same(await page.$$eval('[data-task-output] [data-stage-head]', (h) => h.map((x) => x.getAttribute('data-stage-head'))), ['1', '日志']), await text(page, '[data-task-strip]'));
  st('D6 and the page says where that comes from', /进度文本里没有阶段信息/.test(await text(page, '[data-strip-note]')) && /文本里没有阶段信息，所以只有“输出”一个阶段/.test(await text(page, '[data-output-source]')) && /没有阶段信息/.test(await text(page, '[data-task-stage]')), await text(page, '[data-output-source]'));
  st('D6 the failing line is marked with a word, not colour alone', (await count(page, '[data-output-error] [data-output-error-label]')) === 1 && /错误/.test(await text(page, '[data-output-error-label]')));
  await closeup(page, '[data-task-detail]', 'closeup-single-output-stage.png');
  await safe(async () => { await page.click('[data-task-tab="timeline"]'); await page.waitForTimeout(800); });
  st('D6 timeline: the single 输出 stage, times 未记录, the failure reason in full', (await attr(page, '[data-timeline-stages]', 'data-timeline-parsed')) === '0' && (await count(page, '[data-timeline-stage]')) === 1 && /输出/.test(await text(page, '[data-timeline-stage="1"]')) && /在这个阶段失败/.test(await text(page, '[data-timeline-stage="1"]')) && same(await page.$$eval('[data-stage-start], [data-stage-end], [data-stage-dur]', (c) => c.map((x) => x.textContent.trim())), Array(3).fill('未记录')) && (await raw(page, '[data-timeline-failure-text]')) === LONG_REASON, await text(page, '[data-timeline-stages] [data-timeline-source]'));
  st('D6 a finished task shows 结束时间 from the task row', same(await page.$$eval('[data-timeline-fact]', (d) => d.map((x) => x.getAttribute('data-timeline-fact'))), ['创建时间', '开始时间', '结束时间', '耗时']));
  await ctx.close(); live.delete(ctx);

  // queued, no session
  ({ page, state, ctx } = await open('/tasks/106', { over: w.over }));
  st('D7 queued task: no stage is made up (strip and stage fact say so)', (await attr(page, '[data-task-strip]', 'data-strip-stages')) === '0' && /还在排队/.test(await text(page, '[data-strip-empty]')) && /尚未开始/.test(await text(page, '[data-task-stage]')) && (await count(page, '[data-run-strip]')) === 0, await text(page, '[data-task-strip]'));
  st('D7 no session: 打开会话 is disabled and says why', (await page.locator('[data-task-open-session]').isDisabled().catch(() => false)) && !!(await attr(page, '[data-task-open-session]', 'title')), await attr(page, '[data-task-open-session]', 'title'));
  n = state.reqs.length;
  await step('D7 产物 tab of a task with no artifacts: says so and asks the server nothing', page, '[data-task-tab="artifacts"]', click, async () => { await page.waitForTimeout(700); return [(await attr(page, '[data-task-artifacts]', 'data-task-artifacts')) === 'none' && !state.reqs.slice(n).some((r) => /artifacts/.test(r)), state.reqs.slice(n).join(' | ')]; });
  n = state.reqs.length;
  await step('D7 时间线 of a task with no session: the block says so, no session request', page, '[data-task-tab="timeline"]', click, async () => { await page.waitForTimeout(700); return [(await attr(page, '[data-timeline-session]', 'data-timeline-session')) === 'none' && /没有关联的会话/.test(await text(page, '[data-timeline-session="none"]')) && !state.reqs.slice(n).some((r) => /timeline/.test(r)) && /还在排队/.test(await text(page, '[data-timeline-stages]')), state.reqs.slice(n).join(' | ')]; });
  await ctx.close(); live.delete(ctx);

  // done task with a report
  ({ page, state, ctx } = await open('/tasks/100', { over: w.over }));
  st('D8 finished assessment: the report is a link to /reports?taskId=100, not a tab', (await attr(page, '[data-task-report-link]', 'href') || '').endsWith('#/reports?taskId=100') && (await count(page, '[role="tab"]')) === 3, await attr(page, '[data-task-report-link]', 'href'));
  st('D8 a finished task does not follow and says it is no longer read', (await attr(page, '[data-output-follow-toggle]', 'data-output-follow-toggle')) === 'idle' && (await page.locator('[data-output-follow-toggle] input').isDisabled().catch(() => false)) && (await attr(page, '[data-task-polling]', 'data-task-polling')) === 'off' && /不再自动读取/.test(await text(page, '[data-task-polling]')), await text(page, '[data-task-polling]'));
  st('D8 the unpack result of the task row is its own group, labelled', (await count(page, '[data-task-output] [data-stage-head="结果"]')) === 1 && /来自任务行的脱壳结果/.test(await text(page, '[data-stage-head="结果"] [data-output-summary]')), await text(page, '[data-stage-head="结果"] [data-output-summary]'));
  await step('D8 the report link opens the report reader', page, '[data-task-report-link]', click, async () => { await page.waitForTimeout(700); return [(await hash(page)) === '/reports?taskId=100', await hash(page)]; });
  await safe(async () => { await page.goto(base + '#/tasks/100'); await page.waitForTimeout(900); });
  await step('D8 打开会话 opens the linked session', page, '[data-task-open-session]', click, async () => { await page.waitForTimeout(700); return [(await hash(page)) === '/projects/1/sessions/40', await hash(page)]; });
  await safe(async () => { await page.goto(base + '#/tasks/100'); await page.waitForTimeout(900); });
  await step('D8 更多: 向智能体提问 and 删除任务', page, '[data-task-more]', click, async () => [(await count(page, '[data-task-more-menu] [data-ask-btn]')) === 1 && (await count(page, '[data-task-more-menu] [data-act-del]')) === 1, await text(page, '[data-task-more-menu]')]);
  await step('D8 向智能体提问 goes to the agent with the task', page, '[data-task-more-menu] [data-ask-btn]', click, async () => { await page.waitForTimeout(700); return [(await hash(page)) === '/agent?task=100', await hash(page)]; });
  await safe(async () => { await page.goto(base + '#/tasks/100'); await page.waitForTimeout(900); });
  n = state.posts.length;
  await step('D8 重新运行 opens the same rerun dialog; confirming goes to the list on the new task', page, '[data-task-rerun]', async (l) => { await l.click(); await page.click('[data-rerun-confirm]'); }, async () => { await page.waitForTimeout(1500); const h = await hash(page); return [same(state.posts.slice(n).map((x) => x.key), ['POST /api/tasks/100/rerun']) && /^\/tasks\?focus=50\d\d$/.test(h), `${state.posts.slice(n).map((x) => x.key).join(' | ')} → ${h}`]; });
  await safe(async () => { await page.goto(base + '#/tasks/104'); await page.waitForTimeout(1200); });
  n = state.posts.length;
  await step('D8 删除任务 asks first; confirming deletes and returns to the list', page, '[data-task-more]', async (l) => { await l.click(); await page.click('[data-task-more-menu] [data-act-del]'); }, async () => { const t = await text(page, '[role="alertdialog"]'); const asked = /删除任务 #104/.test(t) && /无法恢复/.test(t) && state.posts.length === n; await page.click('[data-confirm-ok]'); await page.waitForTimeout(1200); return [asked && same(state.posts.slice(n).map((x) => x.key), ['DELETE /api/tasks/104']) && (await hash(page)) === '/tasks', `${t.slice(0, 50)} → ${await hash(page)}`]; });
  await ctx.close(); live.delete(ctx);

  // follow, pause on scrolling up, pin (a running task with 260 lines; new lines arrive with the next read)
  const w2 = world(smallTasks(), null);
  ({ page, state, ctx } = await open('/tasks/109', { over: w2.over }));
  const sc = '[data-task-output] [data-trace-scroller]';
  const pos = () => page.$eval(sc, (el) => ({ top: Math.round(el.scrollTop), end: Math.round(el.scrollHeight - el.clientHeight) })).catch(() => ({ top: -1, end: -2 }));
  const grow = async (k) => { const t = w2.tasks.find((x) => x.id === 109); t.progress = longProgress(k); await page.waitForTimeout(2200); await setVis(page, 'hidden'); await page.waitForTimeout(150); await setVis(page, 'visible'); await page.waitForTimeout(1200); };
  st('D9 a long running output scrolls inside its pane and starts at the end', await (async () => { const p = await pos(); return p.end > 200 && p.end - p.top <= 4; })(), JSON.stringify(await pos()));
  await grow(245);
  st('D9 following: new lines keep the view at the end', await (async () => { const p = await pos(); return p.end - p.top <= 4 && (await attr(page, '[data-task-output]', 'data-output-lines')) === '267'; })(), `${JSON.stringify(await pos())} lines ${await attr(page, '[data-task-output]', 'data-output-lines')}`);
  await step('D9 scrolling up pauses following, and the switch shows it (one jump of 900 px)', page, sc, async (l) => { await l.hover(); await page.mouse.wheel(0, -900); await page.waitForTimeout(500); }, async () => [(await attr(page, '[data-task-output]', 'data-output-follow')) === 'off' && (await attr(page, '[data-output-follow-toggle]', 'data-output-follow-toggle')) === 'off' && !(await page.locator('[data-output-follow-toggle] input').isChecked()), await attr(page, '[data-task-output]', 'data-output-follow')]);
  const held = await pos();
  await grow(252);
  st('D9 paused: new lines do not move the view, and a button counts them', await (async () => { const p = await pos(); return Math.abs(p.top - held.top) <= 2 && /7 行新输出/.test(await text(page, '[data-output-new]')); })(), `${JSON.stringify(held)} → ${JSON.stringify(await pos())}; “${await text(page, '[data-output-new]')}”`);
  await closeup(page, '[data-task-output]', 'closeup-follow-paused.png');
  await step('D9 the button goes to the end and follows again', page, '[data-output-new]', click, async () => { await page.waitForTimeout(600); const p = await pos(); return [p.end - p.top <= 4 && (await attr(page, '[data-task-output]', 'data-output-follow')) === 'on' && (await count(page, '[data-output-new]')) === 0, JSON.stringify(p)]; });
  await step('D9 固定 holds the current stage: new lines do not move the view', page, '[data-output-pin]', async (l) => { await page.locator(sc).hover(); for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(150); } await l.click(); await page.waitForTimeout(200); }, async () => { const a = await pos(); const pinned = await attr(page, '[data-task-output]', 'data-output-pinned'); await grow(258); const b = await pos(); return [!!pinned && (await attr(page, '[data-output-pin]', 'aria-pressed')) === 'true' && Math.abs(a.top - b.top) <= 2 && (await attr(page, '[data-task-output]', 'data-output-follow')) === 'off', `pinned ${pinned}; ${JSON.stringify(a)} → ${JSON.stringify(b)}`]; });
  await step('D9 Page Up in the list pauses following too', page, '[data-output-follow-toggle] input', async (l) => { await page.click('[data-output-pin]'); await l.check({ force: true }); await page.waitForTimeout(400); await page.locator(sc).focus(); await page.keyboard.press('PageUp'); await page.waitForTimeout(500); }, async () => { const p = await pos(); return [(await attr(page, '[data-task-output]', 'data-output-follow')) === 'off' && p.end - p.top > 100, JSON.stringify(p)]; });
  await step('D9 the pin can be set and released again', page, '[data-output-pin]', click, async () => { const on = (await attr(page, '[data-output-pin]', 'aria-pressed')) === 'true' && !!(await attr(page, '[data-task-output]', 'data-output-pinned')); await page.click('[data-output-pin]'); return [on && !(await attr(page, '[data-task-output]', 'data-output-pinned')) && (await attr(page, '[data-output-pin]', 'aria-pressed')) === 'false', `set ${on}`]; });
  st('D9 no page error during the detail checks', state.errors.length === 0, state.errors.join(' | '));
});

// ───────────────────────────── S. States ─────────────────────────────
await group('S', async () => {
  const TASKS = /^\/api\/tasks\?limit=2000$/;
  const mobile = { width: 390, height: 844 };
  const both = async (name, route, opts, wait, verify) => {
    for (const [label, size] of [['1440', {}], ['390', mobile]]) {
      const o = await open(route, { ...opts, ...size, wait });
      const r = await verify(o.page, o.state, label);
      await shot(o.page, `state-${name}-${label}.png`);
      const ovf = await overflow(o.page);
      if (label === '390') st(`S ${name} at 390: the same state, no overflow, no page error`, r[0] && ovf <= 0 && o.state.errors.length === 0, `${r[1] || ''} overflow ${ovf} ${o.state.errors.join(' | ')}`);
      else for (const [n2, p, d] of r[2]) st(n2, p, d);
      await o.ctx.close(); live.delete(o.ctx);
    }
  };
  const ls = (page) => attr(page, '[data-tasks-page]', 'data-task-list-state');
  const ts = (page) => attr(page, '[data-task-table] [data-task-state]', 'data-task-state');
  // list
  await both('list-empty', '/tasks', { over: world([], []).over }, 1500, async (page) => {
    const t = await text(page, '[data-task-state="empty"]'); const pass = (await ts(page)) === 'empty' && /还没有任务/.test(t);
    return [pass, t.slice(0, 30), [
      ['S1 list empty: says there are no tasks yet and offers 新建评估', pass && (await count(page, '[data-task-state="empty"] button')) === 1, t],
      ['S1 list empty: tabs say 0 (the list was read), no rows', (await count(page, '[data-task-row]')) === 0 && /0$/.test(await text(page, '[data-toolbar-filter=""]')) && /运行中 0/.test(await text(page, '[data-fact-running]')), await text(page, '[data-toolbar-filters]')],
      ['S1 list empty: export stays usable, clean-up is disabled at (0)', !(await page.locator('[data-toolbar-export-toggle]').isDisabled()) && (await page.locator('[data-clean-failed]').isDisabled()), ''],
    ]];
  });
  await both('list-loading', '/tasks', { hang: TASKS }, 900, async (page) => {
    const pass = (await ls(page)) === 'loading' && (await ts(page)) === 'loading';
    return [pass, await ls(page), [
      ['S2 list loading: a skeleton, marked busy', pass && (await count(page, '[data-task-state="loading"][aria-busy="true"]')) === 1, await ls(page)],
      ['S2 list loading: counts are “…”, and nothing unread carries a number', /运行中 …/.test(await text(page, '[data-fact-running]')) && !/\d/.test(await text(page, '[data-toolbar-filter="failed"]')) && !/\d/.test(await text(page, '[data-partial-toggle]')) && !/\d/.test(await text(page, '[data-smoke-toggle]')) && !/\d/.test(await text(page, '[data-clean-failed]')), `${await text(page, '[data-fact-running]')} / ${await text(page, '[data-toolbar-filter="failed"]')}`],
      ['S2 list loading: no pager, export disabled until the list is read', (await count(page, '[data-v3-pagination]')) === 0 && (await page.locator('[data-toolbar-export-toggle]').isDisabled()), ''],
    ]];
  });
  await both('list-slow', '/tasks', { hang: TASKS }, 4800, async (page) => {
    const t = await text(page, '[data-task-state="slow"]'); const pass = (await ls(page)) === 'slow' && /比平时慢/.test(t);
    return [pass, t.slice(0, 30), [
      ['S3 list slow: after 4 s the page says the read is slow and that nothing needs to be done', pass && /不需要刷新/.test(t), t],
      ['S3 list slow: still no row and no empty message', (await count(page, '[data-task-row]')) === 0 && (await count(page, '[data-task-state="empty"]')) === 0, ''],
    ]];
  });
  await both('list-error', '/tasks', { fail: TASKS }, 1500, async (page, state) => {
    const t = await text(page, '[data-task-state="error"]'); const pass = (await ls(page)) === 'error' && /任务列表没有读到/.test(t);
    const n = state.reqs.filter((r) => r === 'GET /api/tasks?limit=2000').length;
    await safe(async () => { await page.waitForTimeout(2100); await page.click('[data-task-state="error"] button'); await page.waitForTimeout(600); });
    const n2 = state.reqs.filter((r) => r === 'GET /api/tasks?limit=2000').length;
    return [pass, t.slice(0, 30), [
      ['S4 list error (500): says the list was not read, with the server’s message', pass && /fixture failure/.test(t), t],
      ['S4 list error: 重试 reads the list again', n2 === n + 1, `${n2 - n} read(s)`],
      ['S4 list error: no row, no empty message, counts 未读取, no (0) on the toolbar or on clean-up', (await count(page, '[data-task-row]')) === 0 && (await count(page, '[data-task-state="empty"]')) === 0 && /未读取/.test(await text(page, '[data-fact-running]')) && !/\d/.test(await text(page, '[data-toolbar="tasks"]')) && !/\d/.test(await text(page, '[data-clean-failed]')), await text(page, '[data-fact-running]')],
    ]];
  });
  await both('list-forbidden', '/tasks', { deny: TASKS }, 1500, async (page) => {
    const t = await text(page, '[data-tasks-list]'); const pass = (await ls(page)) === 'forbidden' && (await count(page, '[data-task-state="forbidden"] [data-state="permission"]')) === 1;
    return [pass, t.slice(0, 40), [
      ['S5 list forbidden (403): a permission state', pass && /没有权限读取任务列表/.test(t), t.slice(0, 80)],
      ['S5 list forbidden: no retry wording and no retry button', !RETRY.test(await text(page, '[data-task-state="forbidden"]')) && (await count(page, '[data-task-state="forbidden"] button')) === 0, await text(page, '[data-task-state="forbidden"]')],
      ['S5 list forbidden: not shown as an empty list (no “还没有任务”, no rows, no pager)', !/还没有任务|没有符合条件/.test(t) && (await count(page, '[data-task-row]')) === 0 && (await count(page, '[data-v3-pagination]')) === 0, ''],
      ['S5 list forbidden: counts say 未读取; tabs, toolbar switches and clean-up carry no number; export is disabled', /运行中 未读取/.test(await text(page, '[data-fact-running]')) && /排队中 未读取/.test(await text(page, '[data-fact-queued]')) && !/\d/.test(await text(page, '[data-toolbar-filters]')) && !/\d/.test(await text(page, '[data-toolbar="tasks"]')) && !/\d/.test(await text(page, '[data-clean-failed]')) && (await page.locator('[data-toolbar-export-toggle]').isDisabled()), await text(page, '[data-situation-pods]')],
    ]];
  });
  for (const [label, size] of [['1440', {}], ['390', mobile]]) {
    const w = world(smallTasks(), null);
    const o = await open('/tasks', { over: w.over, ...size });
    o.state.fail = TASKS;
    await safe(async () => { await o.page.waitForTimeout(2100); await o.page.click('[data-tasks-refresh]'); await o.page.waitForTimeout(900); });
    const pass = (await ls(o.page)) === 'stale' && (await count(o.page, '[data-tasks-page] [data-state="stale"]')) === 1 && (await count(o.page, '[data-task-row]')) === 10;
    await shot(o.page, `state-list-stale-${label}.png`);
    if (label === '1440') {
      st('S6 list stale: a failed refresh keeps the rows and says they may be old', pass && /上一次读到的任务/.test(await text(o.page, '[data-state="stale"]')), await text(o.page, '[data-state="stale"]'));
      o.state.fail = null;
      await step('S6 list stale: 刷新 in the notice reads again and the notice goes', o.page, '[data-state="stale"] button', async (l) => { await o.page.waitForTimeout(2100); await l.click(); }, async () => { await o.page.waitForTimeout(900); return [(await ls(o.page)) === 'ok' && (await count(o.page, '[data-state="stale"]')) === 0, await ls(o.page)]; });
    } else st('S list-stale at 390: the same state, no overflow, no page error', pass && (await overflow(o.page)) <= 0 && o.state.errors.length === 0, `overflow ${await overflow(o.page)}`);
    await o.ctx.close(); live.delete(o.ctx);
  }
  {
    const o = await open('/tasks', { over: world(smallTasks(), null).over, deny: /^\/api\/org$/ });
    st('S7 concurrency refused (403): the readout says 未读取, not 0/0', (await attr(o.page, '[data-situation-pods] [data-slot-state]', 'data-slot-state')) === 'unread' && /并发 未读取/.test(await text(o.page, '[data-situation-pods]')) && (await count(o.page, '[data-task-row]')) === 10, await text(o.page, '[data-situation-pods]'));
    await o.ctx.close(); live.delete(o.ctx);
  }

  // detail
  const ds = (page) => attr(page, '[data-task-detail]', 'data-task-detail-state');
  const sm = world(smallTasks(), null);
  await both('detail-not-found', '/tasks/999999', { over: sm.over }, 1500, async (page) => {
    const t = await text(page, '[data-task-detail]'); const pass = (await ds(page)) === 'not-found' && t.includes('在已读取的 2000 条任务里没有 #999999，可能已删除。');
    return [pass, t.slice(0, 50), [
      ['S8 detail not found: “在已读取的 2000 条任务里没有 #id，可能已删除。”', pass, t],
      ['S8 detail not found: a way back to the list, no retry wording', (await attr(page, '[data-task-notfound-back]', 'href') || '').endsWith('#/tasks') && (await count(page, '[data-task-back]')) === 1 && !RETRY.test(t), ''],
      ['S8 detail not found: no header facts, no tabs, nothing made up', (await count(page, '[data-task-facts]')) === 0 && (await count(page, '[role="tab"]')) === 0 && (await count(page, '[data-task-strip]')) === 0, ''],
    ]];
  });
  {
    const o = await open('/tasks/abc', { over: sm.over });
    st('S8 an address that is not a task number says so', (await ds(o.page)) === 'not-found' && /“abc”不是任务编号/.test(await text(o.page, '[data-task-detail]')), await text(o.page, '[data-task-detail]'));
    await o.ctx.close(); live.delete(o.ctx);
  }
  await both('detail-forbidden', '/tasks/101', { deny: TASKS }, 1500, async (page) => {
    const t = await text(page, '[data-task-detail]'); const pass = (await ds(page)) === 'forbidden' && (await count(page, '[data-task-detail] [data-state="permission"]')) === 1;
    return [pass, t.slice(0, 40), [
      ['S9 detail forbidden (403): a permission state', pass && /没有权限读取这个任务/.test(t), t.slice(0, 80)],
      ['S9 detail forbidden: no retry wording, no retry button, not “not found”', !RETRY.test(t) && (await count(page, '[data-task-detail] section button')) === 0 && !/没有找到任务/.test(t), t.slice(0, 80)],
    ]];
  });
  await both('detail-error', '/tasks/101', { fail: TASKS }, 1500, async (page, state) => {
    const t = await text(page, '[data-task-detail]'); const pass = (await ds(page)) === 'error' && /任务没有读到/.test(t);
    const n = state.reqs.filter((r) => r === 'GET /api/tasks?limit=2000').length;
    await safe(async () => { await page.waitForTimeout(2100); await page.click('[data-task-detail] [data-state="error"] button'); await page.waitForTimeout(600); });
    const n2 = state.reqs.filter((r) => r === 'GET /api/tasks?limit=2000').length;
    return [pass, t.slice(0, 40), [
      ['S10 detail error (500): says the task was not read, with the server’s message', pass && /fixture failure/.test(t), t.slice(0, 80)],
      ['S10 detail error: 重试 reads again', n2 === n + 1, `${n2 - n} read(s)`],
    ]];
  });
  await both('detail-loading', '/tasks/101', { hang: TASKS }, 900, async (page) => {
    const pass = (await ds(page)) === 'loading' && (await count(page, '[data-task-detail] [aria-busy="true"]')) === 1;
    return [pass, await ds(page), [['S11 detail loading: a skeleton, marked busy, with the way back', pass && (await count(page, '[data-task-back]')) === 1, await ds(page)]]];
  });
  await both('detail-slow', '/tasks/101', { hang: TASKS }, 4800, async (page) => {
    const t = await text(page, '[data-task-detail]'); const pass = (await ds(page)) === 'slow' && /比平时慢/.test(t);
    return [pass, t.slice(0, 40), [['S11 detail slow: after 4 s the page says the read is slow', pass && /不需要刷新/.test(t), t.slice(0, 80)]]];
  });
  for (const [label, size] of [['1440', {}], ['390', mobile]]) {
    const o = await open('/tasks/101', { over: world(smallTasks(), null).over, ...size });
    o.state.fail = TASKS;
    await safe(async () => { await o.page.waitForTimeout(2100); await setVis(o.page, 'hidden'); await o.page.waitForTimeout(150); await setVis(o.page, 'visible'); await o.page.waitForTimeout(1000); });
    const pass = (await ds(o.page)) === 'stale' && (await count(o.page, '[data-task-detail] [data-state="stale"]')) === 1 && (await text(o.page, '[data-task-title]')) === 'Wallet' && (await count(o.page, '[data-output-line]')) === 5;
    await shot(o.page, `state-detail-stale-${label}.png`);
    if (label === '1440') st('S12 detail stale: a failed read keeps the last task state on screen and says so', pass && /上一次读到的任务状态/.test(await text(o.page, '[data-state="stale"]')), await text(o.page, '[data-state="stale"]'));
    else st('S detail-stale at 390: the same state, no overflow, no page error', pass && (await overflow(o.page)) <= 0 && o.state.errors.length === 0, `overflow ${await overflow(o.page)}`);
    await o.ctx.close(); live.delete(o.ctx);
  }
  await both('detail-no-output', '/tasks/106', { over: sm.over }, 1500, async (page) => {
    const t = await text(page, '[data-task-output]'); const pass = (await attr(page, '[data-task-output]', 'data-output-state')) === 'empty' && /还没有输出/.test(t);
    return [pass, t.slice(0, 40), [
      ['S13 detail with no output: says so and why (queued, not started)', pass && /还在排队/.test(t), t],
      ['S13 no output: no search, copy or download for nothing', (await count(page, '[data-output-search]')) === 0 && (await count(page, '[data-output-copy]')) === 0 && (await count(page, '[data-output-download]')) === 0, ''],
    ]];
  });
  {
    const o = await open('/tasks/108', { over: sm.over });
    st('S13 a failed task with no progress text: no output, and the reason line says the server gave none', (await attr(o.page, '[data-task-output]', 'data-output-state')) === 'empty' && /没有留下进度文本/.test(await text(o.page, '[data-task-output]')) && /服务端没有返回失败原因/.test(await text(o.page, '[data-task-failure]')) && (await count(o.page, '[data-task-failure-copy]')) === 0, await text(o.page, '[data-task-failure]'));
    await o.ctx.close(); live.delete(o.ctx);
  }
  {
    const o = await open('/tasks/101', { over: sm.over, deny: /\/api\/tasks\/counts/ });
    const t = await text(o.page, '[data-task-facts] [data-vuln-counts]');
    st('S14 detail, counts refused (403): the result says 未读取, never 0', (await attr(o.page, '[data-task-facts] [data-vuln-counts]', 'data-counts-state')) === 'forbidden' && /未读取/.test(t) && !/\d/.test(t), t);
    await o.ctx.close(); live.delete(o.ctx);
  }
  {
    const o = await open('/tasks/101?tab=artifacts', { over: sm.over, deny: /\/api\/tasks\/\d+\/artifacts/ });
    const t = await text(o.page, '[data-task-artifacts]');
    st('S14 产物 tab refused (403): the browser’s permission state, no retry wording', (await count(o.page, '[data-task-artifacts] [data-state="permission"]')) >= 1 && !RETRY.test(t), t.slice(0, 100));
    await safe(async () => { await o.page.click('[data-task-tab="output"]'); await o.page.waitForTimeout(700); });
    st('S14 输出 then says it could not look for a log file (no permission), and still shows the progress text', /没有权限读取，无法判断有没有日志文件/.test(await text(o.page, '[data-output-source]')) && (await attr(o.page, '[data-task-output]', 'data-log-state')) === 'forbidden' && (await count(o.page, '[data-output-line]')) === 2, await text(o.page, '[data-output-source]'));
    await o.ctx.close(); live.delete(o.ctx);
  }
  {
    const o = await open('/tasks/101?tab=timeline', { over: sm.over, deny: /\/api\/pentest\/sessions\/\d+\/timeline/ });
    const t = await text(o.page, '[data-timeline-session]');
    st('S15 session timeline refused (403): a permission state in that block only, no retry wording', (await attr(o.page, '[data-timeline-session]', 'data-timeline-session-state')) === 'forbidden' && (await count(o.page, '[data-timeline-session] [data-state="permission"]')) === 1 && !RETRY.test(t) && (await count(o.page, '[data-timeline-stage]')) === 2, t.slice(0, 100));
    await o.ctx.close(); live.delete(o.ctx);
  }
  {
    const o = await open('/tasks/101?tab=timeline', { over: sm.over, fail: /\/api\/pentest\/sessions\/\d+\/timeline/ });
    st('S15 session timeline failed (500): an error with 重试 in that block, the task stages unaffected', (await attr(o.page, '[data-timeline-session]', 'data-timeline-session-state')) === 'error' && (await count(o.page, '[data-timeline-session] [data-state="error"] button')) === 1 && (await count(o.page, '[data-timeline-stage]')) === 2, await text(o.page, '[data-timeline-session]'));
    o.state.fail = null;
    await step('S15 重试 reads the session timeline again', o.page, '[data-timeline-session] [data-state="error"] button', async (l) => { await o.page.waitForTimeout(2100); await l.click(); }, async () => { await o.page.waitForTimeout(800); return [(await attr(o.page, '[data-timeline-session]', 'data-timeline-session-state')) === 'ok', await attr(o.page, '[data-timeline-session]', 'data-timeline-session-state')]; });
    await o.ctx.close(); live.delete(o.ctx);
  }
  {
    const o = await open('/tasks/101?tab=timeline', { over: (m, u) => (m === 'GET' && /\/sessions\/\d+\/timeline$/.test(u.pathname) ? { steps: [] } : sm.over(m, u)) });
    st('S15 session timeline with no steps: says so, in words', (await attr(o.page, '[data-timeline-session]', 'data-timeline-session-state')) === 'empty' && /时间线里没有步骤/.test(await text(o.page, '[data-timeline-session]')), await text(o.page, '[data-timeline-session]'));
    await o.ctx.close(); live.delete(o.ctx);
  }
  {
    const o = await open('/tasks/101', { over: sm.over, deny: /\/api\/pentest\/sessions$/ });
    st('S16 session list refused (403): the detail still shows the task; 打开会话 is disabled, the artifacts tab makes no request', (await ds(o.page)) === 'ok' && (await o.page.locator('[data-task-open-session]').isDisabled().catch(() => false)) && !o.state.reqs.some((r) => /artifacts/.test(r)), await ds(o.page));
    await o.ctx.close(); live.delete(o.ctx);
  }
});

// ───────────────────────────── K. Keyboard ─────────────────────────────
await group('K', async () => {
  const w = world(smallTasks(), null);
  let { page, state, ctx } = await open('/tasks', { over: w.over });
  await step('K1 `/` puts the focus in the search field', page, '[data-task-search]', async () => { await page.locator('body').click({ position: { x: 700, y: 10 } }); await page.keyboard.press('/'); }, async () => [/data-task-search/.test(await active(page)) && (await page.inputValue('[data-task-search]')) === '', await active(page)]);
  await step('K1 typed in a field, `/` is a character', page, '[data-task-search]', async () => { await page.keyboard.type('a/b'); }, async () => [(await page.inputValue('[data-task-search]')) === 'a/b', await page.inputValue('[data-task-search]')]);
  await safe(async () => { await page.fill('[data-task-search]', ''); await page.waitForTimeout(400); });
  await step('K1 status tabs: ArrowRight, End, Home move and select', page, '[data-toolbar-filter=""]', async (l) => { await l.focus(); }, async () => { await page.keyboard.press('ArrowRight'); const a = await attr(page, '[data-toolbar-filter="running"]', 'aria-selected'); await page.keyboard.press('End'); const b = await attr(page, '[data-toolbar-filter="done"]', 'aria-selected'); const fb = await active(page); await page.keyboard.press('Home'); const c = await attr(page, '[data-toolbar-filter=""]', 'aria-selected'); return [a === 'true' && b === 'true' && c === 'true' && /data-toolbar-filter=done/.test(fb), `${a}/${b}/${c}; focus after End “${fb}”`]; });
  await step('K2 a row takes the focus with a visible ring; Enter opens its detail', page, '[data-task-row="101"]', (l) => l.focus(), async () => { await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); const r = await ring(page); const f = await active(page); await page.keyboard.press('Enter'); await page.waitForTimeout(700); return [r && /data-task-row=101/.test(f) && (await hash(page)) === '/tasks/101', `ring ${r}; focus “${f}”; ${await hash(page)}`]; });
  st('K2 Escape on the detail returns to /tasks?focus=101', await (async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(900); return (await hash(page)) === '/tasks?focus=101'; })(), await hash(page));
  st('K2 and the focus is back on that row, which is marked', /data-task-row=101/.test(await active(page)) && (await attr(page, '[data-task-row="101"]', 'data-focused')) === '1', await active(page));
  await step('K2 Space on a row opens its detail too', page, '[data-task-row="103"]', async (l) => { await l.focus(); await page.keyboard.press('Space'); }, async () => { await page.waitForTimeout(700); return [(await hash(page)) === '/tasks/103', await hash(page)]; });
  await safe(async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(900); });
  await step('K3 the row menu opens from the keyboard; Escape closes it and the focus is back on its button', page, '[data-task-row="100"] [data-more-btn]', async (l) => { await l.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(250); }, async () => { const open1 = (await count(page, '[data-more-menu]')) === 1; await page.keyboard.press('Escape'); await page.waitForTimeout(250); return [open1 && (await count(page, '[data-more-menu]')) === 0 && /data-more-btn/.test(await active(page)) && (await hash(page)).startsWith('/tasks?focus=') , `menu opened ${open1}; focus “${await active(page)}”; ${await hash(page)}`]; });
  await step('K3 the artifacts dialog closes with Escape and the focus is back on 产物', page, '[data-artifacts-btn="100"]', async (l) => { await l.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(800); }, async () => { const o1 = (await count(page, '[role="dialog"] [data-art-browser]')) === 1; await page.keyboard.press('Escape'); await page.waitForTimeout(400); return [o1 && (await count(page, '[role="dialog"]')) === 0 && /data-artifacts-btn=100/.test(await active(page)), `opened ${o1}; focus “${await active(page)}”`]; });
  await step('K3 the delete confirmation: 取消 puts the focus back on the row’s menu button', page, '[data-task-row="100"] [data-more-btn]', async (l) => { await l.focus(); await page.keyboard.press('Enter'); await page.click('[data-more-menu] [data-act-del]'); await page.waitForTimeout(300); }, async () => { const f1 = await active(page); await page.keyboard.press('Enter'); await page.waitForTimeout(400); return [/data-confirm-cancel/.test(f1) && (await count(page, '[role="alertdialog"]')) === 0 && /data-more-btn/.test(await active(page)) && (await count(page, '[data-task-row="100"]')) === 1, `focus in dialog “${f1}”; after “${await active(page)}”`]; });
  await step('K3 the rerun dialog: Escape closes it and the focus is back on 重新运行', page, '[data-task-row="102"] [data-act-retry]', async (l) => { await l.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(400); }, async () => { const o1 = (await count(page, '[data-rerun-modal]')) === 1; await page.keyboard.press('Escape'); await page.waitForTimeout(400); return [o1 && (await count(page, '[data-rerun-modal]')) === 0 && /data-act-retry/.test(await active(page)), `opened ${o1}; focus “${await active(page)}”`]; });
  await step('K3 清理失败任务: 取消 puts the focus back on the button', page, '[data-clean-failed]', async (l) => { await l.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300); }, async () => { const o1 = (await count(page, '[data-clean-failed-modal]')) === 1; await page.keyboard.press('Escape'); await page.waitForTimeout(400); return [o1 && (await count(page, '[data-clean-failed-modal]')) === 0 && /data-clean-failed/.test(await active(page)), `opened ${o1}; focus “${await active(page)}”`]; });
  await step('K3 the export menu: Escape closes it and the focus is back on 导出', page, '[data-toolbar-export-toggle]', async (l) => { await l.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(250); }, async () => { const o1 = (await count(page, '[data-toolbar-export-panel]')) === 1; await page.keyboard.press('Escape'); await page.waitForTimeout(250); return [o1 && (await count(page, '[data-toolbar-export-panel]')) === 0 && /data-toolbar-export-toggle/.test(await active(page)), `opened ${o1}; focus “${await active(page)}”`]; });
  // tab order through the list controls, every stop with a ring
  const walk = async (startSel, n) => { await page.locator(startSel).first().focus(); const seen = [await active(page)]; let bare = (await ring(page)) ? 0 : 1; for (let i = 0; i < n; i++) { await page.keyboard.press('Tab'); seen.push(await active(page)); if (!(await ring(page))) bare++; } return { seen, bare }; };
  const lw = await walk('[data-tasks-refresh]', 12);
  const order = ['data-tasks-refresh', 'data-toolbar-export-toggle', 'data-clean-failed', 'data-toolbar-create', 'role=tab', 'data-task-search', 'data-kind-filter', 'data-packer-filter', 'data-operator-filter'];
  const idx = order.map((k) => lw.seen.findIndex((s) => s.includes(k)));
  st('K4 list: Tab goes refresh → export → clean-up → new → status tabs → search → type → packer → owner', idx.every((x, i) => x >= 0 && (i === 0 || x > idx[i - 1])), idx.join(','));
  st('K4 list: every one of those stops shows a focus ring', lw.bare === 0, `${lw.bare} without a ring of ${lw.seen.length}`);
  await ctx.close(); live.delete(ctx);

  ({ page, state, ctx } = await open('/tasks/101', { over: w.over }));
  const hw = await walk('[data-task-back]', 4);
  st('K5 detail header: Tab goes back → 打开会话 → 重新运行 → 更多, in that order', ['data-task-back', 'data-task-open-session', 'data-task-rerun', 'data-task-more'].every((k, i) => (hw.seen[i] || '').includes(k)), hw.seen.join(' → '));
  st('K5 detail header: every stop shows a focus ring', hw.bare === 0, `${hw.bare} without a ring`);
  await step('K5 detail tabs: ArrowRight, End, Home, ArrowLeft move and select', page, '[data-task-tab="output"]', (l) => l.focus(), async () => { const sel = async () => (await page.$$eval('[data-task-tab]', (t) => t.find((x) => x.getAttribute('aria-selected') === 'true')?.getAttribute('data-task-tab'))); const r = []; for (const k of ['ArrowRight', 'End', 'Home', 'ArrowLeft']) { await page.keyboard.press(k); await page.waitForTimeout(350); r.push(await sel()); } const f = await active(page); return [same(r, ['artifacts', 'timeline', 'output', 'timeline']) && /data-task-tab=timeline/.test(f) && (await ring(page)), `${r.join(',')}; focus “${f}”`]; });
  st('K5 the selected tab is the only tab stop; the panel is a tabpanel named after it', same(await page.$$eval('[data-task-tab]', (t) => t.map((x) => x.tabIndex)), [-1, -1, 0]) && (await attr(page, '[role="tabpanel"]', 'aria-label')) === '时间线', await attr(page, '[role="tabpanel"]', 'aria-label'));
  await safe(async () => { await page.click('[data-task-tab="output"]'); await page.waitForTimeout(500); });
  const ow = await walk('[data-output-search]', 7);
  st('K5 output controls are all reachable with Tab and show a ring: search, follow, pin, wrap, copy, download', ['data-output-search', 'data-output-pin', 'data-output-wrap', 'data-output-copy', 'data-output-download'].every((k) => ow.seen.some((s) => s.includes(k))) && ow.bare === 0, `${ow.bare} without a ring; ${ow.seen.map((s) => (s.match(/data-output-[a-z-]+/) || [s.slice(0, 20)])[0]).join(' → ')}`);
  await step('K6 更多 opens from the keyboard; Escape closes the menu, stays on the detail, focus back on 更多', page, '[data-task-more]', async (l) => { await l.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(250); }, async () => { const o1 = (await count(page, '[data-task-more-menu]')) === 1; await page.keyboard.press('Escape'); await page.waitForTimeout(400); return [o1 && (await count(page, '[data-task-more-menu]')) === 0 && (await hash(page)).startsWith('/tasks/101') && /data-task-more/.test(await active(page)), `opened ${o1}; ${await hash(page)}; focus “${await active(page)}”`]; });
  await step('K6 Escape in the output search with text in it does not leave the page', page, '[data-output-search]', async (l) => { await l.fill('jadx'); await page.keyboard.press('Escape'); await page.waitForTimeout(500); }, async () => [(await hash(page)).startsWith('/tasks/101'), await hash(page)]);
  await step('K6 the rerun dialog on the detail: Escape closes the dialog only, focus back on 重新运行', page, '[data-task-rerun]', async (l) => { await page.fill('[data-output-search]', ''); await l.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(400); }, async () => { const o1 = (await count(page, '[data-rerun-modal]')) === 1; await page.keyboard.press('Escape'); await page.waitForTimeout(500); return [o1 && (await count(page, '[data-rerun-modal]')) === 0 && (await hash(page)).startsWith('/tasks/101') && /data-task-rerun/.test(await active(page)), `opened ${o1}; ${await hash(page)}; focus “${await active(page)}”`]; });
  await step('K6 Escape from the 时间线 tab also returns to the row', page, '[data-task-tab="timeline"]', async (l) => { await l.click(); await page.waitForTimeout(600); await page.keyboard.press('Escape'); await page.waitForTimeout(900); }, async () => [(await hash(page)) === '/tasks?focus=101' && /data-task-row=101/.test(await active(page)), `${await hash(page)}; focus “${await active(page)}”`]);
  await ctx.close(); live.delete(ctx);
  ({ page, state, ctx } = await open('/tasks/999999', { over: w.over }));
  st('K6 Escape works from the not-found state as well', await (async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(900); return (await hash(page)) === '/tasks?focus=999999' && (await count(page, '[data-task-row]')) === 10; })(), await hash(page));
  st('K6 no page error during the keyboard checks', state.errors.length === 0, state.errors.join(' | '));
});

// ───────────────────────────── W. Widths and themes ─────────────────────────────
await group('W', async () => {
  const w = world(smallTasks(), null);
  // Controls that must be reachable by a pointer: the point at their centre belongs to them.
  const covered = (page, sels) => page.evaluate((list) => {
    const bad = [];
    for (const s of list) {
      const el = document.querySelector(s); if (!el) { bad.push(`missing ${s}`); continue; }
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) { bad.push(`no size ${s}`); continue; }
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!top || !(el === top || el.contains(top) || top.contains(el) || top.closest('label')?.contains(el))) bad.push(`covered ${s} by ${top ? top.tagName + '.' + String(top.className).slice(0, 30) : 'nothing'}`);
      if (r.left < -1 || r.right > window.innerWidth + 1) bad.push(`outside ${s}`);
    }
    window.scrollTo(0, 0);
    return bad;
  }, sels);
  const VIEWS = [
    ['list', '/tasks', ['[data-tasks-refresh]', '[data-toolbar-export-toggle]', '[data-clean-failed]', '[data-toolbar-create]', '[data-toolbar-filter="failed"]', '[data-task-search]', '[data-kind-filter]', '[data-packer-filter]', '[data-operator-filter]', '[data-partial-toggle] input', '[data-smoke-toggle] input', '[data-sel-row="100"]', '[data-task-row="100"] [data-goto-session]', '[data-task-row="100"] [data-artifacts-btn]', '[data-task-row="100"] [data-more-btn]', '[data-task-row="102"] [data-act-retry]', '[data-task-reason-copy="102"]', 'select[aria-label="每页条数"]', '[data-batch-toggle]']],
    ['detail-output', '/tasks/101', ['[data-task-back]', '[data-task-open-session]', '[data-task-rerun]', '[data-task-more]', '[data-task-tab="output"]', '[data-task-tab="artifacts"]', '[data-task-tab="timeline"]', '[data-output-search]', '[data-output-follow-toggle] input', '[data-output-pin]', '[data-output-wrap]', '[data-output-copy]', '[data-output-download]', '[data-strip-stage="2"]']],
    ['detail-artifacts', '/tasks/100?tab=artifacts', ['[data-task-back]', '[data-task-rerun]', '[data-task-more]', '[data-task-tab="artifacts"]', '[data-task-report-link]', '[data-task-artifacts] [data-art-browser]']],
    ['detail-timeline', '/tasks/102?tab=timeline', ['[data-task-back]', '[data-task-rerun]', '[data-task-more]', '[data-task-tab="timeline"]', '[data-task-failure-copy]', '[data-timeline-failure-copy]', '[data-timeline-open-session]']],
  ];
  for (const [name, route, sels] of VIEWS) for (const width of WIDTHS) for (const theme of THEMES) {
    const o = await open(route, { over: w.over, width, height: width === 390 ? 844 : 900, theme, wait: 1700 });
    const up = name === 'list' ? (await count(o.page, '[data-task-row]')) === 10 : (await attr(o.page, '[data-task-detail]', 'data-task-detail-state')) === 'ok';
    await shot(o.page, `${name}-${width}-${theme}.png`);
    const ovf = await overflow(o.page);
    const inner = await o.page.evaluate(() => [...document.querySelectorAll('[data-tasks-list], [data-task-header], [data-task-strip], [data-task-output], [data-task-timeline], [data-task-failure]')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).length);
    st(`W ${name} ${width} ${theme}: rendered, no horizontal overflow, no page error`, up && ovf <= 0 && inner === 0 && o.state.errors.length === 0, `up ${up}; overflow ${ovf}; blocks past the edge ${inner}; ${o.state.errors.join(' | ')}`);
    const bad = await covered(o.page, sels).catch((e) => [first(e)]);
    st(`W ${name} ${width} ${theme}: ${sels.length} controls present, inside the page and not covered`, bad.length === 0, bad.slice(0, 3).join('; '));
    await o.ctx.close(); live.delete(o.ctx);
  }
});

// ───────────────────────────── Q. Requests ─────────────────────────────
await group('Q', async () => {
  const P6 = JSON.parse(fs.readFileSync(path.join(here, '../../docs/screenshots/v3/phase-6/requests.json'), 'utf8'));
  const norm = (list) => [...new Set(list.map((r) => r.replace(/\?token=.*/, '?token=…')))].sort();
  const SHELL = norm(P6['/tasks']).filter((r) => !/\/api\/(org|tasks\b|tasks\/|pentest\/sessions)/.test(r) || /tasks-summary/.test(r));
  let { page, state, ctx } = await open('/tasks', { wait: 2500 });
  const got = norm([...state.reqs, ...state.streams]); const exp = norm(P6['/tasks']);
  st('Q1 /tasks on load: the request set is the one recorded for Phase 6', same(got, exp), `extra: ${got.filter((r) => !exp.includes(r)).join(' | ') || 'none'}; missing: ${exp.filter((r) => !got.includes(r)).join(' | ') || 'none'}`);
  st('Q1 /tasks on load: each of the five task reads is made once', ['GET /api/org', 'GET /api/pentest/sessions', 'GET /api/tasks/batch-unpack-summary', 'GET /api/tasks/counts?ids=100,101,102,103,104,105,106,107', 'GET /api/tasks?limit=2000'].every((r) => state.reqs.filter((x) => x === r).length === 1), state.reqs.filter((r) => /api\/(org|tasks|pentest\/sessions)/.test(r)).join(' | '));
  let n = state.reqs.length;
  await page.waitForTimeout(LIMIT.poll - 1500);
  st('Q1 /tasks does not poll: nothing about tasks is read in the next 11 s', !state.reqs.slice(n).some((r) => /\/api\/(tasks|org|pentest\/sessions)/.test(r)), state.reqs.slice(n).join(' | '));
  n = state.reqs.length;
  await safe(async () => { await page.click('[data-toolbar-filter="failed"]'); await page.fill('[data-task-search]', 'la'); await page.waitForTimeout(600); });
  st('Q1 filtering and searching read nothing but the counts of the rows shown', state.reqs.slice(n).every((r) => /^GET \/api\/tasks\/counts\?ids=/.test(r)), state.reqs.slice(n).join(' | ') || 'no request');
  await ctx.close(); live.delete(ctx);

  ({ page, state, ctx } = await open('/tasks/101', { wait: 2500 }));
  const own = norm(state.reqs).filter((r) => !SHELL.includes(r));
  const OUTPUT = ['GET /api/pentest/sessions', 'GET /api/tasks/101/artifact?path=run.log', 'GET /api/tasks/101/artifacts?prefix=', 'GET /api/tasks/counts?ids=101', 'GET /api/tasks?limit=2000'];
  st('Q2 /tasks/101 on load: exactly five reads of its own (list, sessions, counts, artifact list, log file)', same(own, OUTPUT), own.join(' | '));
  st('Q2 /tasks/101: the rest is the application shell, as on /tasks', norm([...state.reqs, ...state.streams]).filter((r) => SHELL.includes(r)).length === SHELL.length, `${norm([...state.reqs, ...state.streams]).filter((r) => SHELL.includes(r)).join(' | ')}`);
  st('Q2 no single-task, log or stage endpoint is asked (none exists)', !state.reqs.some((r) => /\/api\/tasks\/101(\?|$)|\/api\/tasks\/101\/(log|logs|stages|output|progress|timeline)/.test(r)), '');
  st('Q2 nothing is written on load', state.posts.length === 0, state.posts.map((p) => p.key).join(' | '));
  n = state.reqs.length;
  await safe(async () => { await page.click('[data-task-tab="timeline"]'); await page.waitForTimeout(900); });
  st('Q2 时间线: one read, the session timeline, and only when the tab is opened', same(state.reqs.slice(n).filter((r) => !/tasks\?limit/.test(r)), ['GET /api/pentest/sessions/41/timeline']) && !state.reqs.slice(0, n).some((r) => /timeline/.test(r)), state.reqs.slice(n).join(' | '));
  n = state.reqs.length;
  await safe(async () => { await page.click('[data-task-tab="artifacts"]'); await page.waitForTimeout(1500); });
  const art = state.reqs.slice(n).filter((r) => !/tasks\?limit/.test(r));
  st('Q2 产物: only artifact list reads of this task (the browser’s walk)', art.length >= 1 && art.every((r) => /^GET \/api\/tasks\/101\/artifacts\?prefix=/.test(r)), art.join(' | '));
  await ctx.close(); live.delete(ctx);
  const known = [/^GET \/api\/(me|org|notifications|tasks-summary|pentest\/devices|pentest\/sessions)(\?|$)/, /^GET \/api\/notifications\/stream/, /^GET \/api\/tasks\?limit=2000$/, /^GET \/api\/tasks\/counts\?ids=[\d,]+$/, /^GET \/api\/tasks\/batch-unpack-summary$/, /^GET \/api\/tasks\/\d+\/artifacts\?prefix=/, /^GET \/api\/tasks\/\d+\/artifact\?path=/, /^GET \/api\/pentest\/sessions\/\d+\/timeline$/];
  ({ page, state, ctx } = await open('/tasks/100', { wait: 2500 }));
  await safe(async () => { await page.click('[data-task-tab="timeline"]'); await page.waitForTimeout(700); await page.click('[data-task-tab="artifacts"]'); await page.waitForTimeout(1200); });
  st('Q3 every request of the two pages is an endpoint that already existed', state.reqs.every((r) => known.some((k) => k.test(r))), state.reqs.filter((r) => !known.some((k) => k.test(r))).join(' | '));
  await ctx.close(); live.delete(ctx);

  // polling
  const FULL = 'GET /api/tasks?limit=2000';
  const reads = (s, from) => s.reqs.slice(from).filter((r) => r === FULL).length;
  const w = world(smallTasks(), null);
  ({ page, state, ctx } = await open('/tasks/101', { over: w.over, wait: 2000 }));
  st('Q4 running task: the page says it reads the list every 10 seconds', (await attr(page, '[data-task-polling]', 'data-task-polling')) === 'on' && /每 10 秒读取一次任务列表/.test(await text(page, '[data-task-polling]')), await text(page, '[data-task-polling]'));
  n = state.reqs.length;
  await page.waitForTimeout(LIMIT.poll - 2000);
  st('Q4 running task: one read of the full list (limit=2000) in the next 11 s', reads(state, n) === 1, `${reads(state, n)} read(s): ${state.reqs.slice(n).join(' | ')}`);
  st('Q4 polling never asks a status-filtered or limit=50 list', !state.reqs.some((r) => /\/api\/tasks\?(?!limit=2000$)/.test(r)), state.reqs.filter((r) => /\/api\/tasks\?/.test(r) && r !== FULL).join(' | '));
  await setVis(page, 'hidden'); await page.waitForTimeout(300);
  st('Q4 page hidden: the readout says it is not reading', (await attr(page, '[data-task-polling]', 'data-task-polling')) === 'off', await text(page, '[data-task-polling]'));
  n = state.reqs.length;
  await page.waitForTimeout(LIMIT.poll - 1500);
  st('Q4 page hidden: no read of the task list in 11 s', reads(state, n) === 0, `${reads(state, n)} read(s)`);
  n = state.reqs.length;
  await setVis(page, 'visible'); await page.waitForTimeout(1200);
  st('Q4 page visible again: one read at once, then the 10 s rhythm', reads(state, n) === 1 && (await attr(page, '[data-task-polling]', 'data-task-polling')) === 'on', `${reads(state, n)} read(s)`);
  // the task leaves the running list of a status-filtered read but the full list still says running: keep reading
  w.tasks.find((t) => t.id === 101).progress = 'Unpack: 100% · 3 dex → Decompile: 100% · done → Security Analysis: 12% · rules';
  n = state.reqs.length;
  await page.waitForTimeout(LIMIT.poll - 2000);
  st('Q5 a read brings the new progress: a third stage appears, taken from the text', (await attr(page, '[data-task-strip]', 'data-strip-stages')) === '3' && /安全分析 12%/.test(await text(page, '[data-task-stage]')) && reads(state, n) === 1, `${await text(page, '[data-task-stage]')}; ${reads(state, n)} read(s)`);
  w.tasks.find((t) => t.id === 101).status = 'done';
  await page.waitForTimeout(LIMIT.poll - 2000);
  st('Q5 the full list says the task ended: status changes and reading stops', /完成/.test(await text(page, '[data-task-facts] [data-task-status]')) && (await attr(page, '[data-task-polling]', 'data-task-polling')) === 'off', `${await text(page, '[data-task-facts] [data-task-status]')}; ${await text(page, '[data-task-polling]')}`);
  n = state.reqs.length;
  await page.waitForTimeout(LIMIT.poll - 1500);
  st('Q5 after the end: no further read in 11 s', reads(state, n) === 0, `${reads(state, n)} read(s)`);
  await ctx.close(); live.delete(ctx);

  ({ page, state, ctx } = await open('/tasks/103', { over: world(smallTasks(), null).over, wait: 2000 }));
  n = state.reqs.length;
  await page.waitForTimeout(LIMIT.poll - 2000);
  st('Q6 queued task: read every 10 s as well', (await attr(page, '[data-task-polling]', 'data-task-polling')) === 'on' && reads(state, n) === 1, `${reads(state, n)} read(s)`);
  await ctx.close(); live.delete(ctx);
  ({ page, state, ctx } = await open('/tasks/100', { over: world(smallTasks(), null).over, wait: 2000 }));
  n = state.reqs.length;
  await page.waitForTimeout(LIMIT.poll - 1500);
  st('Q6 finished task: never read again', (await attr(page, '[data-task-polling]', 'data-task-polling')) === 'off' && reads(state, n) === 0, `${reads(state, n)} read(s)`);
  await ctx.close(); live.delete(ctx);
  ({ page, state, ctx } = await open('/tasks/102', { over: world(smallTasks(), null).over, wait: 2000 }));
  n = state.reqs.length;
  await page.waitForTimeout(LIMIT.poll - 1500);
  st('Q6 failed task: never read again', (await attr(page, '[data-task-polling]', 'data-task-polling')) === 'off' && reads(state, n) === 0, `${reads(state, n)} read(s)`);
  await ctx.close(); live.delete(ctx);
  // a task missing from a limit=50 running list is not thereby finished: the page does not use that list at all
  const w3 = world(smallTasks(), null);
  const base3 = w3.over;
  let asked50 = 0;
  w3.over = (m, u) => { if (m === 'GET' && u.pathname === '/api/tasks' && u.searchParams.get('limit') !== '2000') { asked50++; return []; } return base3(m, u); };
  ({ page, state, ctx } = await open('/tasks/109', { over: w3.over, wait: 2000 }));
  n = state.reqs.length;
  await page.waitForTimeout(LIMIT.poll - 2000);
  st('Q7 a short running list that omits the task would be empty here: it is never asked, and the task is still shown as running and still read', asked50 === 0 && /运行中/.test(await text(page, '[data-task-facts] [data-task-status]')) && (await attr(page, '[data-task-polling]', 'data-task-polling')) === 'on' && reads(state, n) === 1, `short-list reads ${asked50}; full-list reads ${reads(state, n)}`);
  await safe(async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(900); });
  n = state.reqs.length;
  await page.waitForTimeout(LIMIT.poll - 1500);
  st('Q7 leaving the detail stops its reading', (await hash(page)) === '/tasks?focus=109' && reads(state, n) === 0, `${await hash(page)}; ${reads(state, n)} read(s)`);
  st('Q7 no page error during the request checks', state.errors.length === 0, state.errors.join(' | '));
});

await browser.close();
process.exit(summary() ? 1 : 0);
