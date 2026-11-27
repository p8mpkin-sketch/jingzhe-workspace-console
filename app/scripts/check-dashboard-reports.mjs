#!/usr/bin/env node
// Dev-only acceptance for V3 Phase 8 (overview signal and scoped reports), on fixtures. Ten groups:
//   G  overview signal   conclusion sentence, 现在需要处理, readout row, running list; every number equals the fixture;
//                        non-admins send no /api/nodes; each attention item has one action and the right URL
//   W  recent work       real tasks, sessions, project names, scores, reports; 创建会话 sends the one POST; events
//   Z  no false zero     each read alone answering 403 or 500; whole page 403 / 500; report aggregation 403 / 500
//   F  scope filters     全部 / 会话 / 项目 / 单应用, search, sort, risk, paging, views; only ?scope= changes;
//                        invalid scope; counts hidden while loading, never 0 on failure; project reads 4 at a time
//   L  deep links        ?taskId= reader, ?sid=&cmp=, invalid task, palette scope entries, task / workbench / overview entries
//   P  project scope     the project 报告 tab: generate, search, 8 per page, download; same row component as /reports
//   X  exports           hub single and batch CSV, the reader's ten exports and print, against the 470c6bf build
//   K  keyboard          scope tabs with arrows, table ↑↓ Enter, Escape back to a menu trigger, focus back from the reader
//   V  widths, themes    390 / 760 / 1024 / 1280 / 1440 / 1680 light and dark: overflow, page errors, covered controls,
//                        measured text contrast
//   S  states            6 surfaces × 6 states × 4 widths × 2 themes = 288 cells
// Rules: every wait has a limit; a missing precondition fails, it is never skipped; the total is fixed (PLAN).
// Needs `npx vite preview --port 4173` (this build) and, for X, the 470c6bf build on --baseline (default :4175).
// Usage: node scripts/check-dashboard-reports.mjs [--out dir] [--only G,W,...] [--base url] [--baseline url]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
import { resolve as fixture, emptied } from './fixtures/api.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:4173/v2/');
const baseline = arg('baseline', 'http://localhost:4175/v2/');
const out = arg('out', '');
const only = arg('only', '').split(',').filter(Boolean);
const want = (g) => !only.length || only.includes(g);
if (out) fs.mkdirSync(out, { recursive: true });

const PLAN = { G: 24, W: 21, Z: 30, F: 36, L: 13, P: 13, X: 14, K: 8, V: 72, S: 288 };
const LIMIT = { nav: 20000, act: 8000, read: 3000, poll: 12000 };
const GROUP_MS = { S: 40 * 60 * 1000, V: 20 * 60 * 1000 }, GROUP_DEFAULT = 10 * 60 * 1000, RUN_MS = 90 * 60 * 1000;
const RETRY = /重试|再读一次|稍后|重新读取|再试/;

const results = [];
const first = (e) => String(e?.message || e).split('\n')[0].slice(0, 200);
const ok = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail: String(detail ?? '') }); console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const browser = await chromium.launch();
const live = new Set();
const summary = () => {
  const failed = results.filter((r) => !r.pass);
  const groups = {}; for (const r of results) { const g = r.name[0]; groups[g] = groups[g] || [0, 0]; groups[g][1]++; if (r.pass) groups[g][0]++; }
  if (out) fs.writeFileSync(path.join(out, 'report.dashboard-reports.json'), JSON.stringify({ base: 'fixtures', total: results.length, failed: failed.length, plan: PLAN, groups, results }, null, 1));
  console.log('\n' + Object.entries(groups).map(([g, [p, t]]) => `${g} ${p}/${t}`).join('   '));
  console.log(`${results.length - failed.length}/${results.length} dashboard and report checks passed (fixtures)`);
  return failed.length;
};
async function group(g, body) {
  if (!want(g)) return;
  let timer; let why = '';
  const ms = GROUP_MS[g] ?? GROUP_DEFAULT;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`group ${g} did not finish within ${ms / 60000} min`)), ms); });
  try { await Promise.race([body(), limit]); } catch (e) { why = first(e); }
  finally { clearTimeout(timer); for (const c of live) await c.close().catch(() => {}); live.clear(); }
  const done = results.filter((r) => r.name[0] === g).length;
  for (let i = done; i < PLAN[g]; i++) ok(`${g} not reached: check ${i + 1} of ${PLAN[g]}`, false, why ? `the group stopped: ${why}` : 'the group ended before this check');
  if (done > PLAN[g]) ok(`${g} plan: the group ran ${done} checks, the plan says ${PLAN[g]}`, false, 'update PLAN');
}
setTimeout(() => { ok('Z watchdog: the run did not finish', false, `stopped after ${RUN_MS / 60000} min`); summary(); process.exit(2); }, RUN_MS).unref();

/**
 * One page on fixtures. mode: ok | empty | error | forbidden | slow | delay | stale (stale: answers until
 * state.failing is set). deny / fail / hang: regexes on path+query; over(method, url) returns a body or
 * { __status, body } to replace the fixture.
 */
async function open(route, { width = 1440, height = 900, theme = 'light', mode = 'ok', deny = null, fail = null, hang = null, over = null, wait = 1500, downloads = false, root = base, role = 'admin' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme, acceptDownloads: downloads });
  await ctx.addInitScript((t) => { try { localStorage.setItem('token', 'fixture-token'); localStorage.setItem('apksec-theme', t); } catch {} }, theme);
  live.add(ctx); ctx.setDefaultTimeout(LIMIT.act); ctx.setDefaultNavigationTimeout(LIMIT.nav);
  const page = await ctx.newPage();
  const state = { mode, deny, fail, hang, over, failing: false, errors: [], reqs: [], posts: [], assets: [] };
  page.on('pageerror', (e) => state.errors.push(e.message));
  page.on('request', (r) => { const u = r.url(); if (/\/assets\/.+\.js$/.test(u)) state.assets.push(u.split('/').pop()); });
  await page.route('**/api/**', async (r) => {
    const req = r.request(); const url = new URL(req.url());
    if (/\/stream$|send_stream$/.test(url.pathname)) return r.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    const key = `${req.method()} ${url.pathname}${url.search}`;
    state.reqs.push(key);
    if (req.method() !== 'GET') state.posts.push({ key, body: req.postData() || '' });
    const full = url.pathname + url.search;
    const isMe = url.pathname === '/api/me';
    if (isMe) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ username: 'demo', role }) });
    if (state.mode === 'delay') await new Promise((res) => setTimeout(res, 800));
    if (state.mode === 'slow') return;
    if (state.mode === 'error' || (state.mode === 'stale' && state.failing)) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"fixture failure"}' });
    if (state.mode === 'forbidden') return r.fulfill({ status: 403, contentType: 'application/json', body: '{"detail":"fixture: forbidden"}' });
    if (state.hang && state.hang.test(full)) return;
    if (state.deny && state.deny.test(full)) return r.fulfill({ status: 403, contentType: 'application/json', body: '{"detail":"fixture: forbidden"}' });
    if (state.fail && state.fail.test(full)) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"fixture failure"}' });
    const own = state.over ? state.over(req.method(), url) : undefined;
    if (own && own.__status) return r.fulfill({ status: own.__status, contentType: 'application/json', body: JSON.stringify(own.body || {}) });
    let body = own !== undefined ? own : fixture(req.method(), url);
    if (state.mode === 'empty' && req.method() === 'GET' && typeof body !== 'string') body = emptied(body);
    return r.fulfill(typeof body === 'string' ? { status: 200, contentType: 'text/plain; charset=utf-8', body } : { status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(root + '#' + route); await page.waitForTimeout(wait);
  return { ctx, page, state };
}
const count = (page, sel) => page.locator(sel).count();
const text = (page, sel) => page.locator(sel).first().innerText({ timeout: LIMIT.read }).then((s) => s.replace(/\s+/g, ' ').trim()).catch(() => '');
const attr = (page, sel, a) => page.locator(sel).first().getAttribute(a, { timeout: LIMIT.read }).catch(() => null);
const hash = (page) => page.evaluate(() => decodeURIComponent(location.hash.slice(1)));
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shot = async (page, name) => { if (out) await page.screenshot({ path: path.join(out, name) }).catch(() => {}); };
const since = (state, n) => state.reqs.slice(n);
const items = (page) => page.$$eval('[data-report-item]', (els) => els.map((e) => e.getAttribute('data-report-item')));
const activeAttr = (page, a) => page.evaluate((x) => document.activeElement?.closest(`[${x}]`)?.getAttribute(x) ?? null, a);
const main = (page) => text(page, 'main');
const fx = (u, m = 'GET') => fixture(m, new URL('http://x' + u));

// ───────────── expected values, from the fixture itself ─────────────
const SUM = fx('/api/tasks-summary');
const SEV = fx('/api/pentest/vulns/severity-summary');
const ALL_TASKS = fx('/api/tasks?limit=500');
const QUEUED = ALL_TASKS.filter((t) => t.status === 'queued').length;
const SESS = fx('/api/pentest/sessions');
const PROJ = fx('/api/pentest/projects');
const AUDIT10 = ALL_TASKS.filter((t) => t.kind === 'audit').slice(0, 10);
const linkOf = (tid) => SESS.find((s) => s.task_id === tid);
const DONE_AUDIT = ALL_TASKS.filter((t) => t.kind === 'audit' && t.status === 'done');
const PREPORTS = PROJ.flatMap((p) => fx(`/api/pentest/projects/${p.id}/reports`).reports.map((r) => ({ ...r, pid: p.id })));
const isProj = (k) => k === 'portfolio' || k === 'project';
const N_PROJECT = PREPORTS.filter((r) => isProj(r.kind)).length, N_APP = PREPORTS.length - N_PROJECT;
const EVENTS = fx('/api/pentest/events/recent').events;
const NODES = fx('/api/nodes').items;

// ═════════════════════════════ G overview signal ═════════════════════════════
await group('G', async () => {
  const { page, state } = await open('/dashboard', { wait: 2200 });
  const exp = `现在有 ${SUM.running} 个评估在运行，${QUEUED} 个在排队。${SUM.failed} 个失败的任务需要查看原因。有 ${SEV.by_severity.critical} 个严重风险发现还没有关闭。`;
  ok('G1 the conclusion sentence is built from the read numbers', (await text(page, '[data-conclusion]')) === exp, await text(page, '[data-conclusion]'));
  const cell = (k) => text(page, `[data-cell="${k}"] dd`);
  ok('G2 运行 equals tasks-summary.running', (await cell('running')) === String(SUM.running), await cell('running'));
  ok('G3 排队 equals the queued rows read', (await cell('queued')) === String(QUEUED), await cell('queued'));
  ok('G4 失败 equals tasks-summary.failed', (await cell('failed')) === String(SUM.failed), await cell('failed'));
  ok('G5 已完成 equals tasks-summary.done', (await cell('done')) === String(SUM.done), await cell('done'));
  ok('G6 评估总数 equals tasks-summary.total', (await cell('total')) === String(SUM.total), await cell('total'));
  const sevCell = await text(page, '[data-cell="sev"]');
  ok('G7 严重 / 高 equal by_severity and the sessions it came from', (await cell('sev')).startsWith(`${SEV.by_severity.critical} / ${SEV.by_severity.high}`) && sevCell.includes(`来自 ${SEV.sessions_scanned}/${SEV.sessions_total} 个会话`), sevCell);
  ok('G8 执行节点 x/y 在线 equals the nodes read', (await cell('nodes')) === `${NODES.filter((n) => n.online).length}/${NODES.length}`, await cell('nodes'));
  ok('G9 the readout row has 7 cells for an admin', (await count(page, '[data-readout-row] [data-cell]')) === 7);
  const attn = await page.$$eval('[data-attn]', (els) => els.map((e) => e.getAttribute('data-attn')));
  ok('G10 现在需要处理 lists failed tasks, critical findings and offline nodes, in that order', attn.join(',') === 'failed,critical,nodes', attn.join(','));
  const oneEach = await page.$$eval('[data-attn]', (els) => els.map((e) => e.querySelectorAll('[data-attn-action]').length));
  ok('G11 each item has exactly one action', oneEach.every((n) => n === 1), oneEach.join(','));
  ok('G12 the failed item states the count read', (await text(page, '[data-attn="failed"]')).startsWith(`${SUM.failed} 个任务失败`), await text(page, '[data-attn="failed"]'));
  ok('G13 the critical item states its sessions x/y', (await text(page, '[data-attn="critical"]')).includes(`${SEV.by_severity.critical} 个严重风险发现，来自 ${SEV.sessions_scanned}/${SEV.sessions_total} 个会话`), await text(page, '[data-attn="critical"]'));
  await page.click('[data-attn-action="nodes"] summary'); await page.waitForTimeout(200);
  const nodes = await page.$$eval('[data-node]', (els) => els.map((e) => e.getAttribute('data-node') + ':' + (e.textContent.includes('离线') ? 'off' : 'on')));
  ok('G14 查看节点 lists every node with its state', nodes.join(',') === NODES.map((n) => `${n.node_id}:${n.online ? 'on' : 'off'}`).join(','), nodes.join(','));
  const lanes = await page.$$eval('[data-live-lane]', (els) => els.map((e) => e.getAttribute('data-live-lane')));
  const running = ALL_TASKS.filter((t) => t.status === 'running');
  ok('G15 the running list is the running tasks read, with their progress text', lanes.join(',') === running.map((t) => t.id).join(',') && (await text(page, `[data-live-lane="${running[0].id}"]`)).includes(running[0].progress), lanes.join(','));
  ok('G16 no chart library is loaded and no retired read is sent', !state.assets.some((a) => /echarts/i.test(a)) && !state.reqs.some((r) => /\/api\/models\/|batch-unpack-summary|vulns\/grouped/.test(r)), state.assets.filter((a) => /echarts/.test(a)).join(',') + ' ' + state.reqs.filter((r) => /models|unpack-summary|grouped/.test(r)).join(','));
  ok('G17 the projects list is read once', state.reqs.filter((r) => r === 'GET /api/pentest/projects').length === 1);
  ok('G18 no page error', state.errors.length === 0, state.errors.join('; '));
  await page.click('[data-attn-action="failed"]'); await page.waitForTimeout(500);
  ok('G19 查看失败任务 goes to /tasks?status=failed', (await hash(page)) === '/tasks?status=failed', await hash(page));
  await page.goBack(); await page.waitForTimeout(1500);
  await page.click('[data-attn-action="critical"]'); await page.waitForTimeout(500);
  const worst = Object.entries(SEV.by_session).find(([, m]) => (m.critical?.active ?? 0) > 0)[0];
  ok('G20 the critical item opens the findings of that session', (await hash(page)) === `/projects/${linkOf(Number(worst) - 40 + 100)?.project_id ?? SESS.find((s) => s.id === Number(worst)).project_id}/sessions/${worst}?view=findings`, await hash(page));
  await page.goBack(); await page.waitForTimeout(1500);
  await page.click('[data-lw-goto-tasks]'); await page.waitForTimeout(500);
  ok('G21 运行中的任务 goes to /tasks?status=running', (await hash(page)) === '/tasks?status=running', await hash(page));
  await page.context().close();
  // Non-admin: no nodes request, no nodes cell, no nodes item.
  { const s = await open('/dashboard', { role: 'user', wait: 2000 });
    ok('G22 a non-admin sends no /api/nodes request and sees no node readout', !s.state.reqs.some((r) => /\/api\/nodes/.test(r)) && (await count(s.page, '[data-cell="nodes"], [data-attn="nodes"]')) === 0 && (await count(s.page, '[data-readout-row] [data-cell]')) === 6);
    await s.ctx.close(); }
  // Empty: zeros that were read are 0, and the list says there is nothing.
  { const s = await open('/dashboard', { mode: 'empty', wait: 2000 });
    ok('G23 empty: the sentence says nothing is running or queued and 现在需要处理 has one line', (await text(s.page, '[data-conclusion]')) === '现在没有运行或排队的评估。没有失败的任务。' && (await count(s.page, '[data-attn="none"]')) === 1, await text(s.page, '[data-conclusion]'));
    await s.ctx.close(); }
  // A full page of queued rows reads "at least".
  { const s = await open('/dashboard', { over: (m, u) => (u.searchParams.get('status') === 'queued' ? Array.from({ length: 2000 }, (_, i) => ({ id: 9000 + i, status: 'queued' })) : undefined), wait: 2200 });
    ok('G24 2000 queued rows read as 至少 2000', (await text(s.page, '[data-cell="queued"] dd')) === '至少 2000' && (await text(s.page, '[data-conclusion]')).includes('至少 2000 个在排队'), await text(s.page, '[data-cell="queued"] dd'));
    await s.ctx.close(); }
});

// ═════════════════════════════ W recent work ═════════════════════════════
await group('W', async () => {
  const { page, state } = await open('/dashboard', { wait: 2500 });
  const rows = await page.$$eval('[data-apk-row]', (els) => els.map((e) => Number(e.getAttribute('data-apk-row'))));
  ok('W1 the rows are the 10 most recent assessment tasks read', rows.join(',') === AUDIT10.map((t) => t.id).join(','), rows.join(','));
  const p1 = PROJ.find((p) => p.id === linkOf(AUDIT10[0].id).project_id);
  ok('W2 a row names its project and links to it', (await text(page, `[data-apk-row="${AUDIT10[0].id}"] [data-recent-project]`)) === p1.name && (await attr(page, `[data-apk-row="${AUDIT10[0].id}"] [data-recent-project]`, 'href')) === `#/projects/${p1.id}`, await text(page, `[data-apk-row="${AUDIT10[0].id}"] [data-recent-project]`));
  const t3 = AUDIT10.find((t) => linkOf(t.id)?.project_id === 3);
  ok('W3 another project is named from the same single read', (await text(page, `[data-apk-row="${t3.id}"] [data-recent-project]`)) === PROJ.find((p) => p.id === 3).name);
  const noSess = AUDIT10.find((t) => !linkOf(t.id));
  ok('W4 a task without a session says 未归属项目 and 未评估', (await text(page, `[data-apk-row="${noSess.id}"]`)).includes('未归属项目') && (await text(page, `[data-apk-row="${noSess.id}"]`)).includes('未评估'));
  const sc = fx(`/api/pentest/sessions/${linkOf(AUDIT10[0].id).id}/report/summary`).risk_score;
  ok('W5 风险分 is the backend risk_score of the linked session', (await text(page, `[data-recent-score="${AUDIT10[0].id}"]`)) === String(sc), await text(page, `[data-recent-score="${AUDIT10[0].id}"]`));
  const letters = await page.$$eval('[data-apk-list] td, [data-apk-list] [data-card-field]', (els) => els.filter((e) => /^[A-F]$/.test(e.textContent.trim())).length);
  ok('W6 no A–F letter is derived from a threshold', letters === 0, String(letters));
  const sv = SEV.by_session[linkOf(AUDIT10[0].id).id];
  ok('W7 发现 严重/高/中 come from severity-summary.by_session', (await text(page, `[data-recent-sev="${AUDIT10[0].id}"]`)) === `${sv.critical.active} ${sv.high.active} ${sv.medium.active}`, await text(page, `[data-recent-sev="${AUDIT10[0].id}"]`));
  const reps = await page.$$eval('[data-recent-report]', (els) => els.map((e) => e.getAttribute('data-recent-report') + '>' + e.getAttribute('href')));
  const doneIds = AUDIT10.filter((t) => t.status === 'done').map((t) => t.id);
  ok('W8 every finished assessment has a 报告 link to /reports?taskId=', reps.join(',') === doneIds.map((id) => `${id}>#/reports?taskId=${id}`).join(','), reps.join(','));
  const fr = await page.$$eval('[data-feed-row]', (els) => els.map((e) => e.getAttribute('data-feed-row')));
  ok('W9 the session events are the events read', fr.join(',') === EVENTS.map((e) => `${e.sid}-${e.seq}`).join(','), fr.join(','));
  await page.click('[data-feed-filter-id="findings"]'); await page.waitForTimeout(200);
  const ff = await page.$$eval('[data-feed-row]', (els) => els.map((e) => e.getAttribute('data-feed-row')));
  const expF = EVENTS.filter((e) => (e.type === 'step_done' || e.type === 'autopilot_done') && Number(e.payload?.findings ?? 0) > 0).map((e) => `${e.sid}-${e.seq}`);
  ok('W10 有发现 keeps only events with findings', ff.join(',') === expF.join(','), ff.join(','));
  await page.click('[data-feed-filter-id="errors"]'); await page.waitForTimeout(200);
  const fe = await page.$$eval('[data-feed-row]', (els) => els.map((e) => e.getAttribute('data-feed-row')));
  const expE = EVENTS.filter((e) => (e.type === 'step_done' && e.payload?.status === 'error') || e.payload?.error).map((e) => `${e.sid}-${e.seq}`);
  ok('W11 异常 keeps only failed steps', fe.join(',') === expE.join(','), fe.join(','));
  ok('W12 the event poll is the same URL as before', state.reqs.includes('GET /api/pentest/events/recent?limit=30'));
  await page.click(`[data-apk-view-task="${AUDIT10[0].id}"]`); await page.waitForTimeout(500);
  ok('W13 the open control goes to the task', (await hash(page)) === `/tasks/${AUDIT10[0].id}`, await hash(page));
  await page.context().close();
  // 创建会话: one POST with the task id, then the workbench of the new session.
  const target = AUDIT10.find((t) => t.status === 'done' && !linkOf(t.id));
  { const s = await open('/dashboard', { wait: 2500, over: (m, u) => (m === 'POST' && u.pathname === '/api/pentest/sessions' ? { id: 77, project_id: 2 } : undefined) });
    const n0 = s.state.posts.length;
    await s.page.click(`[data-launch-pentest="${target.id}"]`); await s.page.waitForTimeout(900);
    const posts = s.state.posts.slice(n0);
    ok('W14 创建会话 sends exactly one POST /api/pentest/sessions with the task id', posts.length === 1 && posts[0].key === 'POST /api/pentest/sessions' && JSON.parse(posts[0].body).task_id === target.id, JSON.stringify(posts));
    ok('W15 and opens the workbench of the new session', (await hash(s.page)) === '/projects/2/sessions/77', await hash(s.page));
    await s.ctx.close(); }
  { const s = await open('/dashboard', { wait: 2500, over: (m, u) => (m === 'POST' && u.pathname === '/api/pentest/sessions' ? { __status: 409, body: { detail: 'task not finished' } } : undefined) });
    await s.page.click(`[data-launch-pentest="${target.id}"]`); await s.page.waitForTimeout(900);
    ok('W16 a 409 explains itself on the row and stays on the overview', (await text(s.page, `[data-launch-result="${target.id}"]`)).includes('还没有完成') && (await hash(s.page)) === '/dashboard', await text(s.page, `[data-launch-result="${target.id}"]`));
    await s.ctx.close(); }
  // Events: first failure leaves the skeleton and offers a retry; a later failure keeps the rows.
  { const s = await open('/dashboard', { wait: 2200, fail: /events\/recent/ });
    ok('W17 a failed first read of the events says so and does not stay on the skeleton', (await attr(s.page, '[data-live-feed]', 'data-feed-state')) === 'unread' && (await count(s.page, '[data-feed-loading]')) === 0 && (await count(s.page, '[data-live-feed] [data-read-retry]')) === 1);
    s.state.fail = null; await s.page.click('[data-live-feed] [data-read-retry]'); await s.page.waitForTimeout(800);
    ok('W18 重试 reads the events again', (await count(s.page, '[data-feed-row]')) === EVENTS.length);
    s.state.fail = /events\/recent/; await s.page.waitForTimeout(9000);
    ok('W19 a failed poll keeps the rows and says the latest refresh failed', (await attr(s.page, '[data-live-feed]', 'data-feed-state')) === 'stale' && (await count(s.page, '[data-feed-row]')) === EVENTS.length && (await count(s.page, '[data-feed-stale]')) === 1);
    await s.ctx.close(); }
  { const s = await open('/dashboard', { wait: 2000, mode: 'empty' });
    ok('W20 empty: no assessment yet, with 新建评估', (await count(s.page, '[data-recent-new]')) === 1 && (await count(s.page, '[data-feed-empty]')) === 1);
    await s.page.click('[data-recent-new]'); await s.page.waitForTimeout(400);
    ok('W21 新建评估 opens /new-assessment', (await hash(s.page)) === '/new-assessment', await hash(s.page));
    await s.ctx.close(); }
});

// ═════════════════════════════ Z no false zero ═════════════════════════════
await group('Z', async () => {
  // One read at a time: [name, path regex, block selector, state attribute].
  const READS = [
    ['tasks-summary', /\/api\/tasks-summary$/, '[data-cell="running"]', 'data-cell-state'],
    ['severity-summary', /severity-summary/, '[data-cell="sev"]', 'data-cell-state'],
    ['queued', /status=queued/, '[data-cell="queued"]', 'data-cell-state'],
    ['nodes', /\/api\/nodes$/, '[data-cell="nodes"]', 'data-cell-state'],
    ['running', /status=running/, '[data-live-workflows] [data-running-state]', 'data-running-state'],
    ['events', /events\/recent/, '[data-live-feed]', 'data-feed-state'],
    ['domain-summary', /domain-summary/, '[data-domain-pane]', 'data-domain-state'],
    ['tasks', /\/api\/tasks\?limit=500$/, '[data-recent-state]', 'data-recent-state'],
  ];
  for (const [name, re, sel, a] of READS) {
    for (const [kind, opt, word] of [['403', { deny: re }, 'permission'], ['500', { fail: re }, 'unread']]) {
      const s = await open('/dashboard', { ...opt, wait: 2000 });
      const st = await attr(s.page, sel, a); const t = await text(s.page, sel);
      const retry = RETRY.test(t);
      const digits = /\d/.test(t.replace(/^[^\n]*?(运行|排队|失败|已完成|评估总数|严重 \/ 高 风险发现|执行节点在线)/, ''));
      ok(`Z ${name} ${kind}: ${word === 'permission' ? '无权限 without retry' : '未读取 with retry'}, no number`, st === word && (word === 'permission' ? !retry && t.includes('无权限') : retry && t.includes('未读取')) && (sel.includes('data-cell') ? !digits : true), `${st} · ${t.slice(0, 80)}`);
      await s.ctx.close();
    }
  }
  // Project names and session links read alone.
  { const s = await open('/dashboard', { deny: /\/api\/pentest\/projects$/, wait: 2200 });
    ok('Z projects 403: the project is linked by id and its name says 无权限', (await text(s.page, `[data-apk-row="${AUDIT10[0].id}"] [data-recent-project]`)).includes('名称无权限'), await text(s.page, `[data-apk-row="${AUDIT10[0].id}"] [data-recent-project]`)); await s.ctx.close(); }
  { const s = await open('/dashboard', { fail: /\/api\/pentest\/sessions$/, wait: 2200 });
    const t = await text(s.page, `[data-apk-row="${AUDIT10[0].id}"]`);
    ok('Z sessions 500: project, score, findings and session cells say 未读取, never 未评估 or 0', t.includes('未读取') && !t.includes('未评估') && !t.includes('未归属项目'), t); await s.ctx.close(); }
  // Whole page.
  for (const mode of ['forbidden', 'error']) {
    const s = await open('/dashboard', { mode, wait: 2200 });
    const row = await text(s.page, '[data-readout-row]');
    ok(`Z page ${mode}: the readout row has no number`, !/\d/.test(row), row.slice(0, 120));
    const m = await main(s.page);
    ok(`Z page ${mode}: no "现在没有运行中的任务", no "共 0 项", no "没有需要处理的事项"`, !/现在没有运行中的任务|共 0 项|没有需要处理的事项/.test(m));
    ok(`Z page ${mode}: no skeleton left after the reads answered`, (await count(s.page, '[data-feed-loading], [data-running-state="loading"], [data-read="loading"]')) === 0);
    ok(`Z page ${mode}: ${mode === 'forbidden' ? 'no retry wording anywhere' : 'a retry on every failed block'}`, mode === 'forbidden' ? !RETRY.test(m) : (await count(s.page, '[data-read-retry]')) >= 8, mode === 'forbidden' ? (m.match(RETRY) || [''])[0] : String(await count(s.page, '[data-read-retry]')));
    await s.ctx.close();
  }
  // Report aggregation (summary of the session behind a finished task): 403 reads 无权限, a failure 未读取.
  const tid = DONE_AUDIT[0].id;
  { const s = await open('/reports', { deny: /report\/summary$/, wait: 2500 });
    ok('Z report aggregation 403 (全部): the row says 无权限, not "—"', (await attr(s.page, `[data-report-item="s-${tid}"] [data-agg-state]`, 'data-agg-state')) === 'permission');
    await s.ctx.close(); }
  { const s = await open('/reports?scope=session', { deny: /report\/summary$/, wait: 2500 });
    await s.page.click('[data-hub-view-btn="table"]'); await s.page.waitForTimeout(300);
    const t = await text(s.page, `[data-hub-row="${tid}"]`);
    ok('Z report aggregation 403 (会话报告 table): score, high and counts say 无权限', (t.match(/无权限/g) || []).length >= 3, t.slice(0, 120));
    await s.ctx.close(); }
  { const s = await open('/reports?scope=session', { fail: /auth_matrix$/, wait: 2500 });
    await s.page.click('[data-hub-view-btn="table"]'); await s.page.waitForTimeout(300);
    ok('Z report aggregation 500 on the matrix: the cell says 未读取, not 无矩阵', (await attr(s.page, `[data-hub-row="${tid}"] [data-agg-state]`, 'data-agg-state')) === 'unread');
    await s.ctx.close(); }
  { const s = await open('/reports?scope=session', { deny: /auth_matrix$/, wait: 2500 });
    await s.page.click('[data-hub-view-btn="table"]'); await s.page.waitForTimeout(300);
    ok('Z report aggregation 403 on the matrix: the cell says 无权限', (await attr(s.page, `[data-hub-row="${tid}"] [data-agg-state]`, 'data-agg-state')) === 'permission');
    await s.ctx.close(); }
});

// ═════════════════════════════ F scope filters ═════════════════════════════
await group('F', async () => {
  const { page, state } = await open('/reports', { wait: 2600 });
  const sel = () => page.$eval('[data-scope-tab][aria-selected="true"]', (e) => e.getAttribute('data-scope-tab')).catch(() => null);
  const cnt = (s) => attr(page, `[data-scope-tab="${s}"]`, 'data-scope-count');
  ok('F1 /reports without a scope is 全部', (await sel()) === 'all' && (await hash(page)) === '/reports');
  ok('F2 会话报告 count equals the finished assessments read', (await cnt('session')) === String(DONE_AUDIT.length), await cnt('session'));
  ok('F3 项目报告 count equals project + portfolio reports of every project', (await cnt('project')) === String(N_PROJECT), await cnt('project'));
  ok('F4 单应用报告 count equals app reports', (await cnt('app')) === String(N_APP), await cnt('app'));
  ok('F5 全部 is the sum', (await cnt('all')) === String(DONE_AUDIT.length + N_PROJECT + N_APP), await cnt('all'));
  ok('F6 全部 shows 12 rows on its first page, newest first', (await items(page)).length === 12 && (await page.$$eval('[data-report-item] td:nth-child(6)', (els) => els.map((e) => e.textContent))).every((v, i, a) => i === 0 || a[i - 1] >= v));
  ok('F7 全部 says how many projects were read', (await text(page, '[data-project-progress]')).includes(`${PROJ.length}/${PROJ.length} 个项目已读取`), await text(page, '[data-project-progress]'));
  ok('F8 each project was read once, four at most at a time', PROJ.every((p) => state.reqs.filter((r) => r === `GET /api/pentest/projects/${p.id}/reports`).length === 1));
  await page.click('[data-hub-page-next]'); await page.waitForTimeout(200);
  ok('F9 paging: page 2 has the remaining rows', (await items(page)).length === DONE_AUDIT.length + N_PROJECT + N_APP - 12);
  await page.fill('[data-hub-search] input, input[data-hub-search]', 'Compass'); await page.waitForTimeout(300);
  ok('F10 search filters 全部 (one session report)', (await items(page)).join(',') === `s-${DONE_AUDIT[0].id}`, (await items(page)).join(','));
  const n0 = state.reqs.length;
  await page.click('[data-scope-tab="project"]'); await page.waitForTimeout(500);
  ok('F11 switching scope changes only ?scope=', (await hash(page)) === '/reports?scope=project', await hash(page));
  ok('F12 the search term is kept', (await page.inputValue('[data-hub-search] input, input[data-hub-search]')) === 'Compass');
  ok('F13 switching scope sends no request (each project read once)', since(state, n0).length === 0, since(state, n0).join(' '));
  await page.fill('[data-hub-search] input, input[data-hub-search]', ''); await page.waitForTimeout(300);
  const pr = await page.$$eval('[data-report-item]', (els) => els.map((e) => e.getAttribute('data-report-kind')));
  ok('F14 项目报告 lists project reports only', pr.length === Math.min(12, N_PROJECT) && pr.every((k) => k === 'project'), pr.join(','));
  await page.fill('[data-hub-search] input, input[data-hub-search]', '#31'); await page.waitForTimeout(300);
  ok('F15 search by report number', (await items(page)).join(',') === 'p-1-31', (await items(page)).join(','));
  await page.fill('[data-hub-search] input, input[data-hub-search]', 'zzz-none'); await page.waitForTimeout(300);
  ok('F16 no match: says so with 清除搜索', (await count(page, '[data-reports-empty="search"] [data-clear-search]')) === 1);
  await page.click('[data-clear-search]'); await page.waitForTimeout(300);
  await page.click('[data-scope-tab="app"]'); await page.waitForTimeout(300);
  const ar = await page.$$eval('[data-report-item]', (els) => els.map((e) => e.getAttribute('data-report-kind')));
  ok('F17 单应用报告 lists app reports only', ar.length === N_APP && ar.every((k) => k === 'app'), ar.join(','));
  ok('F18 the risk filter and the view switch are not offered outside 会话报告', (await count(page, '[data-hub-risk], [data-hub-view-toggle]')) === 0);
  await page.click('[data-scope-tab="session"]'); await page.waitForTimeout(800);
  ok('F19 会话报告 is the hub with its risk filter, sort and three views', (await count(page, '[data-reports-hub] [data-hub-risk]')) === 1 && (await count(page, '[data-hub-view-btn]')) === 3);
  await page.click('[data-hub-view-btn="table"]'); await page.waitForTimeout(200);
  await page.click('[data-hub-toolbar] [data-menu-btn]'); await page.click('[data-hub-sort="risk"]'); await page.waitForTimeout(300);
  const order = await page.$$eval('[data-hub-row]', (els) => els.map((e) => Number(e.getAttribute('data-hub-row'))));
  const riskOf = (t) => fx(`/api/pentest/sessions/${SESS.filter((s) => s.task_id === t && s.status !== 'closed').sort((a, b) => b.id - a.id)[0]?.id}/report/summary`)?.risk_score ?? -1;
  ok('F20 sort 风险分从高到低 orders by the backend risk score', order.join(',') === [...DONE_AUDIT].sort((a, b) => riskOf(b.id) - riskOf(a.id) || b.id - a.id).map((t) => t.id).join(','), order.join(','));
  await page.click('[data-hub-risk-btn="highrisk"]'); await page.waitForTimeout(300);
  ok('F21 risk filter 有高危发现 keeps rows with confirmed high findings', (await page.$$eval('[data-hub-row]', (els) => els.length)) === DONE_AUDIT.filter((t) => (fx(`/api/pentest/sessions/${SESS.find((s) => s.task_id === t.id)?.id}/report/summary`)?.confirmed_high ?? 0) > 0).length);
  await page.click('[data-hub-risk-btn="all"]');
  ok('F22 the hub view switch still offers split, cards and table', (await page.$$eval('[data-hub-view-btn]', (els) => els.map((e) => e.getAttribute('data-hub-view-btn')))).join(',') === 'split,cards,table');
  ok('F23 the hub KPI band is retired (counts live on the scope tabs)', (await count(page, '[data-hub-kpis]')) === 0);
  await page.context().close();
  // Invalid scope.
  { const s = await open('/reports?scope=bogus', { wait: 1500 });
    ok('F24 an invalid scope falls back to 全部 and the URL drops it', (await hash(s.page)) === '/reports' && (await attr(s.page, '[data-scope-tab="all"]', 'aria-selected')) === 'true', await hash(s.page)); await s.ctx.close(); }
  // Request sets per scope.
  { const s = await open('/reports?scope=project', { wait: 2500 });
    ok('F25 ?scope=project sends no session aggregation', !s.state.reqs.some((r) => /report\/summary|auth_matrix|vulns\/grouped/.test(r)), s.state.reqs.filter((r) => /summary|matrix|grouped/.test(r)).join(' '));
    ok('F26 ?scope=project reads the project list once and each project once', s.state.reqs.filter((r) => r === 'GET /api/pentest/projects').length === 1 && PROJ.every((p) => s.state.reqs.filter((r) => r === `GET /api/pentest/projects/${p.id}/reports`).length === 1));
    await s.ctx.close(); }
  { const s = await open('/reports?scope=session', { wait: 2500 });
    ok('F27 ?scope=session sends no project read', !s.state.reqs.some((r) => /\/api\/pentest\/projects/.test(r))); await s.ctx.close(); }
  // Counts while loading and on failure.
  { const s = await open('/reports', { hang: /\/projects\/\d+\/reports$/, wait: 1800 });
    ok('F28 while project reports load, their tabs show no number', (await attr(s.page, '[data-scope-tab="project"]', 'data-scope-count')) === '' && (await attr(s.page, '[data-scope-tab="all"]', 'data-scope-count')) === '');
    ok('F29 and the session reports are already listed (first screen not blocked)', (await s.page.$$eval('[data-report-kind="session"]', (els) => els.length)) === DONE_AUDIT.length);
    await s.ctx.close(); }
  { const s = await open('/reports', { fail: /\/api\/pentest\/projects$/, wait: 2200 });
    ok('F30 project list failure: 未读取 on the tabs, never 0', (await attr(s.page, '[data-scope-tab="project"]', 'data-scope-count')) === '未读取' && (await attr(s.page, '[data-scope-tab="app"]', 'data-scope-count')) === '未读取');
    ok('F31 and the session reports stay listed', (await s.page.$$eval('[data-report-kind="session"]', (els) => els.length)) === DONE_AUDIT.length);
    await s.ctx.close(); }
  { const s = await open('/reports?scope=project', { fail: /\/projects\/2\/reports$/, deny: /\/projects\/3\/reports$/, wait: 2500 });
    const n1 = fx('/api/pentest/projects/1/reports').reports.filter((r) => isProj(r.kind)).length;
    ok('F32 one project failing and one denied affect only those projects', (await attr(s.page, '[data-scope-tab="project"]', 'data-scope-count')) === String(n1) && (await text(s.page, '[data-scope-tab="project"]')).includes('2 个项目未读取'), await text(s.page, '[data-scope-tab="project"]'));
    ok('F33 the progress line says x/y read, which failed and which are denied', (await text(s.page, '[data-project-progress]')).includes('1/3 个项目已读取，1 个未读取，1 个无权限'), await text(s.page, '[data-project-progress]'));
    s.state.fail = null; const n0b = s.state.reqs.length;
    await s.page.click('[data-project-retry]'); await s.page.waitForTimeout(800);
    ok('F34 重试未读取的项目 re-reads only the projects that did not answer', since(s.state, n0b).filter((r) => /\/projects\/\d+\/reports$/.test(r)).sort().join(',') === 'GET /api/pentest/projects/2/reports,GET /api/pentest/projects/3/reports', since(s.state, n0b).join(' '));
    await s.ctx.close(); }
  { // Ten projects: never more than four project reads in flight.
    const many = Array.from({ length: 10 }, (_, i) => ({ id: 101 + i, name: `P${i}` }));
    const s = await open('/reports?scope=project', { wait: 300, over: (m, u) => (u.pathname === '/api/pentest/projects' ? many : undefined), hang: /\/projects\/1\d\d\/reports$/ });
    await s.page.waitForTimeout(1200);
    ok('F35 project reads go four at a time', s.state.reqs.filter((r) => /\/projects\/1\d\d\/reports$/.test(r)).length === 4, String(s.state.reqs.filter((r) => /\/projects\/1\d\d\/reports$/.test(r)).length));
    await s.ctx.close(); }
  { const s = await open('/reports?scope=project', { mode: 'empty', wait: 2000 });
    ok('F36 empty 项目报告: says so, with 去项目里生成', (await count(s.page, '[data-reports-empty="project"] button')) === 1); await s.ctx.close(); }
});

// ═════════════════════════════ L deep links ═════════════════════════════
await group('L', async () => {
  const reader = async (page) => (await count(page, '[data-reader="page"][data-reports-detail]')) === 1;
  { const s = await open('/reports?taskId=100', { wait: 2200 });
    ok('L1 ?taskId= is the Phase 6 reader', await reader(s.page)); await s.ctx.close(); }
  { const s = await open('/reports?taskId=100&scope=project', { wait: 2200 });
    ok('L2 ?taskId= wins over ?scope=', await reader(s.page)); await s.ctx.close(); }
  { const s = await open('/reports?sid=40&cmp=41', { wait: 2200 });
    ok('L3 ?sid=&cmp= still collapses to ?taskId=', (await hash(s.page)) === '/reports?taskId=100' && await reader(s.page), await hash(s.page)); await s.ctx.close(); }
  { const s = await open('/reports?taskId=999', { wait: 2200 });
    ok('L4 an invalid task falls back to the list', (await hash(s.page)) === '/reports' && (await count(s.page, '[data-scope-tabs]')) === 1, await hash(s.page)); await s.ctx.close(); }
  for (const [label, sc] of [['项目报告', 'project'], ['会话报告', 'session'], ['单应用报告', 'app']]) {
    const s = await open('/dashboard', { wait: 1200 });
    await s.page.keyboard.press('Control+k'); await s.page.waitForTimeout(200);
    await s.page.click(`[data-cmdk-item="/reports?scope=${sc}"]`).catch(() => {}); await s.page.waitForTimeout(1500);
    ok(`L palette 报告 · ${label} opens /reports?scope=${sc} on that tab`, (await hash(s.page)) === `/reports?scope=${sc}` && (await attr(s.page, `[data-scope-tab="${sc}"]`, 'aria-selected')) === 'true', await hash(s.page));
    await s.ctx.close();
  }
  { const s = await open('/tasks/100', { wait: 1800 });
    await s.page.click('[data-task-report-link]'); await s.page.waitForTimeout(1500);
    ok('L8 the task page 报告 link opens the reader', (await hash(s.page)) === '/reports?taskId=100' && await reader(s.page), await hash(s.page)); await s.ctx.close(); }
  { const s = await open('/projects/1/sessions/40?view=report', { wait: 2500 });
    await s.page.click('[data-report-export-menu]').catch(() => {}); await s.page.waitForTimeout(200);
    await s.page.click('[data-report-export="workspace"]').catch(() => {}); await s.page.waitForTimeout(1500);
    ok('L9 the workbench 在报告工作区打开 opens the reader for its task', (await hash(s.page)) === '/reports?taskId=100' && await reader(s.page), await hash(s.page)); await s.ctx.close(); }
  { const s = await open('/dashboard', { wait: 2200 });
    await s.page.click('[data-recent-report="100"]'); await s.page.waitForTimeout(1500);
    ok('L10 the overview 报告 link opens the reader', (await hash(s.page)) === '/reports?taskId=100' && await reader(s.page), await hash(s.page)); await s.ctx.close(); }
  { const s = await open('/reports?scope=session', { wait: 2500 });
    await s.page.click('[data-hub-open="100"]'); await s.page.waitForTimeout(1200);
    ok('L11 opening from 会话报告 goes to the reader', (await hash(s.page)) === '/reports?taskId=100' && await reader(s.page));
    await s.page.click('[data-detail-back], [data-reports-detail] button:has-text("返回")').catch(() => {}); await s.page.waitForTimeout(800);
    ok('L12 返回 brings back ?scope=session', (await hash(s.page)) === '/reports?scope=session', await hash(s.page));
    await s.ctx.close(); }
  { const s = await open('/reports?scope=app', { wait: 2200 });
    ok('L13 /reports?scope=app is the list, not the reader', (await count(s.page, '[data-reports-list="app"]')) === 1 && !(await reader(s.page))); await s.ctx.close(); }
});

// ═════════════════════════════ P project scope ═════════════════════════════
await group('P', async () => {
  const R1 = fx('/api/pentest/projects/1/reports').reports;
  const { page, state } = await open('/projects/1?tab=reports', { wait: 2200, downloads: true });
  ok('P1 the project tab uses the shared report table', (await count(page, '[data-report-table="project"] [data-report-item]')) > 0);
  ok('P2 8 rows per page', (await count(page, '[data-report-row]')) === Math.min(8, R1.length));
  ok('P3 the newest report is marked', (await attr(page, '[data-report-latest]', 'data-report-row')) === String(R1[0].id));
  const names = await page.$$eval('[data-report-item] td:first-child', (els) => els.map((e) => e.textContent.trim()));
  ok('P4 portfolio and project rows read 项目总报告, app rows 单应用报告', names.every((n, i) => n.endsWith(isProj(R1[i].kind) ? '项目总报告' : '单应用报告')), names.join(' | '));
  ok('P5 the columns are what the tab had: 报告, 模板, 页数, 状态, 下载', (await page.$$eval('[data-report-table="project"] th', (els) => els.map((e) => e.textContent.trim()))).join(',') === '报告,模板,页数,状态,下载');
  ok('P6 the tab read its reports once and nothing else was added', state.reqs.filter((r) => r === 'GET /api/pentest/projects/1/reports').length === 1 && !state.reqs.some((r) => /\/projects\/[23]\/reports/.test(r)));
  await page.fill('[data-report-step="history"] input', '#31'); await page.waitForTimeout(300);
  ok('P7 search keeps working', (await count(page, '[data-report-row]')) === 1);
  await page.fill('[data-report-step="history"] input', ''); await page.waitForTimeout(300);
  await page.click('[data-report-workflow] button[aria-label*="下一页"], [data-report-workflow] [data-page-next]').catch(() => {}); await page.waitForTimeout(300);
  ok('P8 page 2 has the rest', (await count(page, '[data-report-row]')) === R1.length - 8, String(await count(page, '[data-report-row]')));
  await page.reload(); await page.waitForTimeout(2000);
  const n0 = state.reqs.length;
  await page.click(`[data-report-download="${R1[0].id}"]`); await page.waitForTimeout(200);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: LIMIT.act }), page.click(`[aria-label="下载报告 #${R1[0].id} 的 PDF"]`)]);
  ok('P9 PDF download: same request and file name as before', dl.suggestedFilename() === `project-1-report-${R1[0].id}.pdf` && since(state, n0).includes(`GET /api/pentest/projects/1/reports/${R1[0].id}/download?format=pdf`), dl.suggestedFilename());
  await page.click(`[data-report-download="${R1[0].id}"]`); await page.waitForTimeout(200);
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: LIMIT.act }), page.click(`[aria-label="下载报告 #${R1[0].id} 的 DOCX"]`)]);
  ok('P10 DOCX download', dl2.suggestedFilename() === `project-1-report-${R1[0].id}.docx`, dl2.suggestedFilename());
  const p0 = state.posts.length;
  state.over = (m, u) => (m === 'POST' && /\/projects\/1\/reports$/.test(u.pathname) ? { id: 33, pages: 30 } : undefined);
  const gen = page.waitForEvent('download', { timeout: LIMIT.act }).catch(() => null);
  await page.click('[data-report-generate]'); const g = await gen; await page.waitForTimeout(400);
  ok('P11 生成报告 posts kind=portfolio, re-reads the list and downloads the PDF', state.posts.slice(p0).length === 1 && JSON.parse(state.posts[p0].body).kind === 'portfolio' && g?.suggestedFilename() === 'project-1-report-33.pdf', `${state.posts.slice(p0).map((x) => x.body).join(' ')} ${g?.suggestedFilename()}`);
  await page.context().close();
  { const s = await open('/reports?scope=project', { wait: 2500, downloads: true });
    ok('P12 /reports?scope=project renders the same row component', (await count(s.page, '[data-report-table="global"] [data-report-item][data-report-row]')) > 0);
    const rid = PREPORTS.find((r) => isProj(r.kind)).id;
    await s.page.click(`[data-report-download="${rid}"]`); await s.page.waitForTimeout(200);
    const [d] = await Promise.all([s.page.waitForEvent('download', { timeout: LIMIT.act }), s.page.click(`[aria-label="下载报告 #${rid} 的 PDF"]`)]);
    ok('P13 and downloads through the same request and file name', d.suggestedFilename() === `project-1-report-${rid}.pdf`, d.suggestedFilename());
    await s.ctx.close(); }
});

// ═════════════════════════════ X exports against 470c6bf ═════════════════════════════
const norm = (s) => s.replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?/g, 'T').replace(/\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:\d{2}:\d{2}/g, 'T').replace(/\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2}( [AP]M)?/g, 'T');
async function grab(page, click) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: LIMIT.act }), click()]);
  const p = await d.path(); return { name: d.suggestedFilename(), body: p ? norm(fs.readFileSync(p, 'utf8')) : '' };
}
await group('X', async () => {
  const tid = DONE_AUDIT[0].id;
  const pair = async (route, root, fn) => { const s = await open(route, { root, wait: 2800, downloads: true }); try { return await fn(s.page); } finally { await s.ctx.close(); } };
  const single = async (page) => { await page.click(`[data-hub-preview] [data-menu-btn], [data-hub-preview] button:has-text("导出")`); await page.waitForTimeout(150); return grab(page, () => page.click(`[data-hub-export-one="${tid}"]`)); };
  const a = await pair('/reports', baseline, single).catch((e) => ({ name: 'baseline: ' + first(e), body: '' }));
  const b = await pair('/reports?scope=session', base, single).catch((e) => ({ name: first(e), body: '' }));
  ok('X1 hub single CSV: same file name as 470c6bf', a.name === b.name && a.name === `task_${tid}_summary.csv`, `${a.name} / ${b.name}`);
  ok('X2 hub single CSV: same header and fields', a.body.split('\n')[0] === b.body.split('\n')[0] && a.body.length > 0, b.body.split('\n')[0]);
  ok('X3 hub single CSV: same content', a.body === b.body);
  const batch = async (page) => { await page.click('[data-hub-check-all]'); await page.waitForTimeout(150); return grab(page, () => page.click('[data-hub-batch-export]')); };
  const ba = await pair('/reports', baseline, batch).catch((e) => ({ name: 'baseline: ' + first(e), body: '' }));
  const bb = await pair('/reports?scope=session', base, batch).catch((e) => ({ name: first(e), body: '' }));
  ok('X4 hub batch CSV: same file name', ba.name === bb.name && ba.name === `audit_tasks_summary_${DONE_AUDIT.length}.csv`, `${ba.name} / ${bb.name}`);
  ok('X5 hub batch CSV: same content', ba.body === bb.body && ba.body.length > 0);
  const fromAll = await pair('/reports', base, async (page) => { await page.click(`[data-report-item="s-${tid}"] [data-menu-btn], [data-report-item="s-${tid}"] button[aria-label*="更多操作"]`); await page.waitForTimeout(150); return grab(page, () => page.click(`[data-hub-export-one="${tid}"]`)); }).catch((e) => ({ name: first(e), body: '' }));
  ok('X6 the same single CSV from a 全部 row', fromAll.name === b.name && fromAll.body === b.body, fromAll.name);
  // The reader's export menu: every downloadable item against the 470c6bf build.
  const KEYS = ['vulns-csv', 'matrix-csv', 'matrix-json', 'full-json', 'full-md', 'evidence', 'pdf', 'exec', 'zip'];
  const readerAll = async (root) => { const s = await open(`/reports?taskId=${tid}`, { root, wait: 3000, downloads: true }); const got = {};
    try { for (const k of KEYS) { await s.page.click('[data-detail-header] [data-menu-btn], [data-menu-btn]'); await s.page.waitForTimeout(150); got[k] = await grab(s.page, () => s.page.click(`[data-menu-panel] [data-detail-export="${k}"]`)).catch((e) => ({ name: 'none: ' + first(e), body: '' })); await s.page.waitForTimeout(150); }
      await s.page.click('[data-detail-header] [data-menu-btn], [data-menu-btn]'); await s.page.waitForTimeout(150); await s.page.click('[data-menu-panel] [data-detail-export="print"]'); await s.page.waitForTimeout(400);
      got.print = { name: 'print', body: norm(await text(s.page, '[data-print-view] pre')) };
    } finally { await s.ctx.close(); } return got; };
  const ra = await readerAll(baseline); const rb = await readerAll(base);
  const names = KEYS.map((k) => `${rb[k]?.name}`);
  ok('X7 the reader still offers its ten exports (nine downloads and print)', KEYS.every((k) => rb[k] && !rb[k].name.startsWith('none')) && rb.print.body.length > 0, names.join(','));
  ok('X8 reader export file names equal 470c6bf', KEYS.every((k) => ra[k]?.name === rb[k]?.name), KEYS.filter((k) => ra[k]?.name !== rb[k]?.name).map((k) => `${k}: ${ra[k]?.name} vs ${rb[k]?.name}`).join('; '));
  ok('X9 CSV exports have the same fields and rows', ['vulns-csv', 'matrix-csv'].every((k) => ra[k].body === rb[k].body));
  ok('X10 JSON exports have the same fields and values (times aside)', ['matrix-json', 'full-json', 'evidence'].every((k) => ra[k].body === rb[k].body));
  ok('X11 the Markdown report is the same', ra['full-md'].body === rb['full-md'].body);
  ok('X12 the PDF, summary and package downloads keep their names and requests', ['pdf', 'exec', 'zip'].every((k) => ra[k].name === rb[k].name), ['pdf', 'exec', 'zip'].map((k) => rb[k].name).join(','));
  ok('X13 the print view shows the same report', ra.print.body === rb.print.body && rb.print.body.length > 100);
  const d = await pair(`/reports?taskId=${tid}`, base, async (page) => (await count(page, '[data-reader-print]')) === 0 && (await count(page, '[data-reports-detail][data-reader="page"]')) === 1);
  ok('X14 the reader frame is unchanged (no reader print sheet on this page)', d);
});

// ═════════════════════════════ K keyboard ═════════════════════════════
await group('K', async () => {
  const { page } = await open('/reports', { wait: 2600 });
  await page.focus('[data-scope-tab="all"]'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(500);
  ok('K1 ArrowRight on the scope tabs moves to 会话报告 and only ?scope= changes', (await hash(page)) === '/reports?scope=session' && (await activeAttr(page, 'data-scope-tab')) === 'session', await hash(page));
  await page.keyboard.press('End'); await page.waitForTimeout(400);
  ok('K2 End goes to 单应用报告', (await hash(page)) === '/reports?scope=app');
  await page.keyboard.press('Home'); await page.waitForTimeout(600);
  const firstKey = (await items(page))[0];
  await page.focus(`[data-report-item="${firstKey}"]`); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100);
  const second = (await items(page))[1];
  ok('K3 ↓ moves to the next report row', (await page.evaluate(() => document.activeElement?.getAttribute('data-report-item'))) === second);
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(100);
  ok('K4 ↑ moves back', (await page.evaluate(() => document.activeElement?.getAttribute('data-report-item'))) === firstKey);
  const sKey = (await items(page)).find((k) => k.startsWith('s-'));
  await page.focus(`[data-report-item="${sKey}"]`); await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
  ok('K5 Enter on a session report opens the reader', (await hash(page)) === `/reports?taskId=${sKey.slice(2)}`, await hash(page));
  await page.click('[data-detail-back], [data-reports-detail] button:has-text("返回")').catch(() => {}); await page.waitForTimeout(900);
  ok('K6 返回 puts focus back on that row of 全部', (await hash(page)) === '/reports' && (await page.evaluate(() => document.activeElement?.getAttribute('data-report-item'))) === sKey, `${await hash(page)} ${await page.evaluate(() => document.activeElement?.getAttribute('data-report-item'))}`);
  const pKey = (await items(page)).find((k) => k.startsWith('p-'));
  const rid = pKey.split('-')[2];
  await page.click(`[data-report-item="${pKey}"] [data-report-download]`); await page.waitForTimeout(200);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok('K7 Escape closes the download menu and returns focus to its trigger', (await page.evaluate(() => document.activeElement?.getAttribute('data-report-download'))) === rid);
  await page.goto(base + '#/dashboard'); await page.waitForTimeout(2000);
  let stops = 0, bare = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => { const a = document.activeElement; if (!a || a === document.body || !a.closest('main')) return null; const cs = getComputedStyle(a); return { name: (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 20), ring: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none' }; });
    if (!r) continue; stops++; if (!r.ring) bare.push(r.name);
  }
  ok('K8 every control on the overview shows its focus ring', stops > 10 && bare.length === 0, `${stops} stops; no ring: ${bare.join(' | ')}`);
});

// ═════════════════════════════ V widths and themes ═════════════════════════════
const SURFACES = [['overview', '/dashboard'], ['all', '/reports'], ['session', '/reports?scope=session'], ['project', '/reports?scope=project'], ['app', '/reports?scope=app'], ['ptab', '/projects/1?tab=reports']];
await group('V', async () => {
  for (const th of ['light', 'dark']) for (const w of [390, 760, 1024, 1280, 1440, 1680]) for (const [name, route] of SURFACES) {
    const s = await open(route, { width: w, theme: th, wait: 2200 });
    const ov = await overflow(s.page);
    const m = await s.page.evaluate(() => {
      const parse = (c) => { const m2 = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/); return m2 ? [+m2[1], +m2[2], +m2[3], m2[4] == null ? 1 : +m2[4]] : null; };
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { stack.push(c); if (c[3] >= 1) break; } }
        let acc = parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1];
        for (const c of stack.reverse()) acc = [0, 1, 2].map((i) => c[i] * c[3] + acc[i] * (1 - c[3])).concat(1);
        return acc; };
      const low = []; let n = 0;
      const root = document.querySelector('main');
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      while (walker.nextNode()) {
        const t = walker.currentNode; if (!t.textContent.trim()) continue;
        const el = t.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
        const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
        if (el.closest('[aria-hidden="true"], [disabled], .sr-only, [data-state="loading"]')) continue;
        const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        const fg = parse(cs.color); if (!fg) continue; const bg = bgOf(el);
        const fgc = [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
        const [a, b] = [lum(fgc), lum(bg)].sort((x, y) => y - x); const ratio = (a + 0.05) / (b + 0.05);
        const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
        n++; if (ratio < (large ? 3 : 4.5)) low.push(`${t.textContent.trim().slice(0, 12)} ${ratio.toFixed(2)}`);
      }
      // Covered: an interactive control whose centre is visible but another element sits on top of it.
      const covered = [];
      for (const el of root.querySelectorAll('button, a[href], input, [role="tab"], summary')) {
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
        const x = r.left + r.width / 2, y = r.top + r.height / 2; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        let clipped = false; for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const q = p.getBoundingClientRect(); if (x < q.left || x > q.right || y < q.top || y > q.bottom) { clipped = true; break; } } }
        if (clipped || el.closest('.sr-only')) continue;
        const hit = document.elementFromPoint(x, y); if (hit && !el.contains(hit) && !hit.contains(el)) covered.push((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 16) + ' under ' + (hit.getAttribute('data-cmdk') != null ? 'palette' : hit.tagName));
      }
      return { low, n, covered };
    });
    ok(`V ${name} @${w} ${th}: no overflow, no page error, nothing covered, text contrast ≥ 4.5:1`, ov <= 1 && s.state.errors.length === 0 && m.covered.length === 0 && m.low.length === 0 && m.n > 5,
      `${ov}px · ${s.state.errors.length} errors · covered: ${m.covered.slice(0, 3).join(' | ')} · low: ${m.low.slice(0, 3).join(' | ')} (${m.n} texts)`);
    if ([1440, 1024, 760, 390].includes(w)) await shot(s.page, `${name}-${w}-${th}.png`);
    await s.ctx.close();
  }
});

// ═════════════════════════════ S states (288 cells) ═════════════════════════════
await group('S', async () => {
  const STATES = ['empty', 'loading', 'error', 'forbidden', 'slow', 'stale'];
  // What the surface must say (description) and offer (next step) in each state.
  const expect = {
    empty: {
      overview: ['[data-attn="none"]', '[data-recent-new]'], all: ['[data-reports-empty="all"]', '[data-reports-empty="all"] button'],
      session: ['[data-hub-empty]', '[data-hub-empty] button'], project: ['[data-reports-empty="project"]', '[data-reports-empty="project"] button'],
      app: ['[data-reports-empty="app"]', '[data-reports-empty="app"] button'], ptab: ['[data-report-workflow] [data-state], [data-report-workflow] :text("还没有报告")', '[data-report-generate]'],
    },
  };
  const blank = (page) => page.evaluate(() => {
    const root = document.querySelector('main'); const rs = [];
    for (const el of root.querySelectorAll('h1, h2, h3, p, li, td, th, button, a, input, dt, dd, [data-state], [role="status"], svg')) { const r = el.getBoundingClientRect(); if (r.width && r.height && r.top < innerHeight) rs.push([r.top, r.bottom]); }
    rs.sort((a, b) => a[0] - b[0]); let gap = 0, end = rs.length ? rs[0][1] : 0;
    for (const [t, b] of rs) { if (t > end) gap = Math.max(gap, t - end); end = Math.max(end, b); }
    return gap;
  });
  for (const th of ['light', 'dark']) for (const w of [1440, 1024, 760, 390]) for (const [name, route] of SURFACES) for (const stt of STATES) {
    const mode = stt === 'loading' ? 'delay' : stt === 'stale' ? 'stale' : stt;
    const s = await open(route, { width: w, theme: th, mode, wait: stt === 'loading' ? 300 : stt === 'slow' ? 1500 : 2200 });
    let pass = true; const why = [];
    try {
      if (stt === 'loading') {
        const sk = await count(s.page, '[data-state="loading"], [data-read="loading"], [data-feed-loading], [role="status"], .motion-safe\\:animate-pulse');
        if (!sk) { pass = false; why.push('no loading placeholder at 300 ms'); }
        await s.page.waitForTimeout(2200);
      }
      if (stt === 'stale') {
        s.state.failing = true;
        const btn = s.page.locator('main header').getByRole('button', { name: /^刷新/ }).first();
        if (await btn.count()) await btn.click(); else { pass = false; why.push('no 刷新 in the page header'); }
        await s.page.waitForTimeout(1600);
        const n = await count(s.page, '[data-state="stale"], [data-read-stale], [data-feed-stale]');
        if (!n) { pass = false; why.push('no stale notice'); }
        const data = await count(s.page, '[data-report-item], [data-hub-row], [data-report-row], [data-apk-row]');
        if (!data) { pass = false; why.push('the data left the screen'); }
      }
      const m = await main(s.page);
      if (stt === 'empty') { for (const q of expect.empty[name]) if (!(await count(s.page, q))) { pass = false; why.push(`missing ${q}`); } }
      if (stt === 'error') {
        if (!/未读取|没有读到|没有成功|失败/.test(m)) { pass = false; why.push('no failure description'); }
        if (!RETRY.test(m)) { pass = false; why.push('no retry'); }
      }
      if (stt === 'forbidden') {
        if (!/无权限|没有访问权限|没有查看/.test(m)) { pass = false; why.push('no permission description'); }
        if (RETRY.test(m)) { pass = false; why.push(`retry wording on 403: ${m.match(RETRY)[0]}`); }
      }
      if (stt === 'slow') {
        const sk = await count(s.page, '[data-state="loading"], [data-read="loading"], [data-feed-loading], [role="status"], .motion-safe\\:animate-pulse');
        if (!sk) { pass = false; why.push('no loading placeholder while unanswered'); }
      }
      if (stt !== 'slow' && stt !== 'loading' && /\b0\b/.test(await text(s.page, '[data-readout-row]')) && stt !== 'empty') { pass = false; why.push('a 0 from data that was not read'); }
      if (await count(s.page, '[data-error-boundary]')) { pass = false; why.push('error boundary'); }
      if (s.state.errors.length) { pass = false; why.push('page error: ' + s.state.errors[0]); }
      const gap = await blank(s.page);
      if (gap > 900 / 3) { pass = false; why.push(`blank area ${Math.round(gap)}px`); }
      if ((w === 1440 || w === 390) && th === 'light') await shot(s.page, `state-${name}-${stt}-${w}.png`);
    } catch (e) { pass = false; why.push(first(e)); }
    ok(`S ${name} ${stt} @${w} ${th}: says what happened and what to do next`, pass, why.join('; '));
    await s.ctx.close();
  }
});

await browser.close();
const bad = summary();
process.exit(bad ? 1 : 0);
