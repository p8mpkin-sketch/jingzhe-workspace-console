#!/usr/bin/env node
// Dev-only checks of the run surfaces against a running build (`npm run build && npx vite preview --port 4173`):
// T1–T12 of docs/v3-plan.md for the Agent trace, then the composer (C), the terminal (TERM) and the requests
// surface (REQ). The API is answered from scripts/fixtures; this script keeps the run of session 41 in
// a small scenario object (which stage is in progress, appended events, run state) so that it can move the run on.
// Usage: node scripts/check-trace.mjs [--base http://localhost:4173/v2/] [--out dir] [--only T1,T5]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
import { resolve as fixture, liveSteps, liveApprovals, stamp } from './fixtures/api.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:4173/v2/');
const out = arg('out', '');
const only = arg('only', '').split(',').filter(Boolean);
if (out) fs.mkdirSync(out, { recursive: true });
const TRACE = '#/projects/1/sessions/41';
const PHASES = [['P0', '范围确认'], ['P1', '静态检查'], ['P2', '权限矩阵'], ['P3', '会话状态检查'], ['P5', '报告汇总']];

const results = [];
let current = '';
const expect = (ok, what, detail = '') => { results.push({ test: current, ok: !!ok, what, detail: ok ? '' : String(detail) }); if (!ok) console.log(`  FAIL ${current}: ${what} ${detail}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fresh = () => ({ active: 2, done: 3, state: 'running', extra: [], decided: new Set(), noRunning: false, fail: false });
function steps(S) {
  const seen = {};
  return liveSteps.map((st) => {
    const pi = PHASES.findIndex(([id]) => id === st.phase); const k = (seen[st.phase] = (seen[st.phase] || 0) + 1) - 1;
    const state = pi < S.active ? 'ok' : pi > S.active ? 'pending' : k < S.done ? 'ok' : k === S.done && S.state === 'running' && !S.noRunning ? 'running' : 'pending';
    return { ...st, state, findings: 0 };
  });
}
const phases = (S) => PHASES.map(([phase, name]) => { const mine = steps(S).filter((x) => x.phase === phase); return { phase, name, done: mine.filter((x) => x.state === 'ok').length, total: mine.length }; });
function events(S) {
  const ev = [{ id: 'start', seq: 1, type: 'autopilot_start', ts: stamp(6000), title: '分析引擎启动' }];
  steps(S).forEach((st, g) => {
    if (st.state === 'pending') return;
    ev.push({ id: `s${g}a`, seq: 10 + g * 2, type: 'step_start', ts: stamp(5800 - g * 200), phase: st.phase, tool: st.tool, name: st.name });
    if (st.state === 'ok') ev.push({ id: `s${g}b`, seq: 11 + g * 2, type: 'step_done', ts: stamp(5650 - g * 200), phase: st.phase, tool: st.tool, name: st.name });
  });
  ev.push({ id: 'g1', seq: 101, type: 'clue_consumed', ts: stamp(3990), phase: 'P2', title: '引导已读取', detail: '订单接口优先核对 /api/v1/orders/{id}。', user: 'demo' });
  ev.push({ id: 'e1', seq: 102, type: 'tool_error', ts: stamp(3980), phase: 'P2', title: '重放请求没有完成', detail: 'replay_request 在 30 秒内没有收到响应：代理端口 18081 拒绝连接（ECONNREFUSED）。' });
  ev.push({ id: 'j1', seq: 103, type: 'react_decision', ts: stamp(3970), phase: 'P2', title: '先核对订单接口的越权访问', detail: '匿名与登录态结果一致，下一步换用第二个账号重放。' });
  return [...ev, ...S.extra];
}
const append = (S, n) => { const at = S.extra.length; for (let i = 0; i < n; i++) S.extra.push({ id: `x${at + i}`, seq: 1000 + at + i, type: 'observation', ts: stamp(Math.max(0, 300 - at - i)), phase: PHASES[S.active][0], title: `追加事件 ${at + i + 1}`, detail: '脚本追加的事件，用来检查列表的稳定性。' }); };

const browser = await chromium.launch();
const pageErrors = [];
async function open(S, { width = 1440, height = 900, theme = 'light', reduced = false, hash = TRACE } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: theme, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript((t) => { try { localStorage.setItem('apksec-theme', t); localStorage.setItem('token', 'fixture-token'); } catch {} }, theme);
  await ctx.addInitScript(() => { window.__scrolls = []; document.addEventListener('scroll', (e) => { const t = e.target; if (t.hasAttribute && t.hasAttribute('data-trace-scroller') && window.__scrolls.length < 8) window.__scrolls.push([Math.round(performance.now()), t.scrollTop, t.scrollHeight, t.clientHeight]); }, true); window.__cls = 0; window.__src = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__cls += e.value; for (const s of e.sources || []) window.__src.push((s.node?.outerHTML || String(s.node?.nodeName)).slice(0, 120)); } }).observe({ type: 'layout-shift', buffered: true }); } catch {} });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${current}: ${e.message}`));
  await page.route('**/api/**', async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname; const get = req.method() === 'GET';
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (/\/stream$|send_stream$/.test(p)) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    if (S.deny && /\/sessions\/41(\/|$)/.test(p)) return json({ detail: 'fixture: forbidden' }, 403);
    if (!/\/sessions\/41\//.test(p)) { const b = fixture(req.method(), url); return typeof b === 'string' ? route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: b }) : json(b); }
    if (S.fail && /autopilot\/status$|\/timeline$|\/events$/.test(p)) return json({ detail: 'fixture: source failed' }, 500);
    if (get && /autopilot\/status$/.test(p)) return json({ state: S.state, status: S.state, phases: phases(S) });
    if (get && /\/timeline$/.test(p)) return json({ steps: steps(S) });
    if (get && /\/events$/.test(p) && url.searchParams.get('source') === 'progress') {
      // A read with since_seq is a page: events after that sequence number, `limit` at most, in sequence order.
      if (!url.searchParams.has('since_seq')) return json({ events: events(S), cursor: 0, total: 0 });
      const since = Number(url.searchParams.get('since_seq')), limit = Number(url.searchParams.get('limit') || 200);
      const all = events(S).filter((e) => e.seq > since).sort((x, y) => x.seq - y.seq); const pg = all.slice(0, limit);
      return json({ events: pg, cursor: pg.length ? pg[pg.length - 1].seq : since, truncated: all.length > pg.length, total: all.length });
    }
    if (get && S.bare && /\/vulns\/grouped$/.test(p)) return json({ status: 'ok', cards: [] });
    if (get && /\/approvals$/.test(p)) return json({ status: 'ok', approvals: S.bare ? [] : liveApprovals().map((a) => (S.decided.has(a.id) ? { ...a, state: 'approved' } : a)) });
    if (!get && /\/clue$/.test(p)) { S.clues = [...(S.clues || []), JSON.parse(req.postData() || '{}').text]; if (S.clueDelay) await sleep(S.clueDelay);
      return S.clue === 403 ? json({ detail: 'fixture: forbidden' }, 403) : S.clue === 500 ? json({ detail: 'fixture: internal error' }, 500) : json({ status: 'ok' }); }
    if (!get && /\/approvals\/([^/]+)\/decide$/.test(p)) { S.decided.add(p.split('/').slice(-2)[0]); return json({ status: 'ok' }); }
    const b = fixture(req.method(), url);
    return typeof b === 'string' ? route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: b }) : json(b);
  });
  await page.goto(base + hash); await page.waitForSelector('[data-wb-root], [data-nav-rail], [data-nav-open]'); await page.waitForTimeout(1300);
  return { ctx, page };
}
const refresh = async (page, wait = 700) => { await page.click('[aria-label="刷新数据"]'); await page.waitForTimeout(wait); };
const shot = async (page, name) => { if (out) await page.screenshot({ path: path.join(out, `${name}.png`) }); };
const stage = (page, id) => page.evaluate((id) => {
  const el = document.querySelector(`[data-stage-head="${id}"]`) || document.querySelector(`[data-stage-sticky="${id}"]`);
  return el ? { open: el.getAttribute('data-stage-open') === '1', events: Number(el.getAttribute('data-stage-events')), judgments: Number(el.getAttribute('data-stage-judgments')), guidance: Number(el.getAttribute('data-stage-guidance')),
    findings: Number(el.getAttribute('data-stage-findings')), duration: el.getAttribute('data-stage-duration'), summary: el.querySelector('[data-stage-summary]')?.textContent || '' } : null;
}, id);
const scroll = (page) => page.evaluate(() => { const el = document.querySelector('[data-trace-scroller]'); return el ? { top: el.scrollTop, gap: el.scrollHeight - el.scrollTop - el.clientHeight, h: el.clientHeight, sh: el.scrollHeight } : null; });
// A person's scroll: the wheel over the list (the list ignores position changes that come without input).
const scrollBy = async (page, dy) => { const b = await page.locator('[data-trace-scroller]').boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.wheel(0, dy); await page.waitForTimeout(250); };
const toTop = async (page) => { await scrollBy(page, -20000); };
const firstRow = (page) => page.evaluate(() => {
  const box = document.querySelector('[data-trace-scroller]').getBoundingClientRect();
  const sticky = document.querySelector('[data-stage-sticky]')?.getBoundingClientRect().height || 0;
  for (const r of document.querySelectorAll('[data-trace-row]')) { const b = r.getBoundingClientRect(); if (b.top >= box.top + sticky) return { id: r.getAttribute('data-trace-row'), top: b.top }; }
  return null;
});
const motion = (page) => page.evaluate(() => {
  const secs = (v) => Math.max(0, ...String(v).split(',').map((x) => (x.trim().endsWith('ms') ? parseFloat(x) / 1000 : parseFloat(x) || 0)));
  let max = 0;
  for (const el of document.querySelectorAll('[data-wb-root] *')) { const cs = getComputedStyle(el); max = Math.max(max, secs(cs.transitionDuration), cs.animationName !== 'none' ? secs(cs.animationDuration) : 0); }
  const loops = document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity);
  return { maxMs: max * 1000, loops: loops.length, dots: loops.filter((a) => a.effect.target?.hasAttribute?.('data-live-dot')).length };
});

// ── T1 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function t1(reduced) {
  const S = fresh(); const { ctx, page } = await open(S, { reduced });
  const before = await stage(page, 'P2');
  expect(before?.open, 'the stage in progress (P2) is open');
  expect((await stage(page, 'P1'))?.open === false, 'a finished stage (P1) is a summary row');
  S.active = 3; S.done = 0;
  await page.click('[aria-label="刷新数据"]');
  if (reduced) { await page.waitForTimeout(250); expect(await page.locator('[data-row-leaving]').count() === 0, 'reduced motion: no rows fade out'); }
  await page.waitForTimeout(reduced ? 150 : 700);
  const p2 = await stage(page, 'P2'); const p3 = await stage(page, 'P3');
  expect(p2 && !p2.open, 'P2 folded into its summary after the run moved on', JSON.stringify(p2));
  // Data: 6 tool calls + 1 judgment + 1 guidance + 1 error; both findings appeared while P2 ran.
  expect(p2?.events === 9 && p2?.judgments === 1 && p2?.guidance === 1 && p2?.findings === 2, 'P2 summary counts match the data (9 events: 6 tool calls, 1 judgment, 1 guidance, 1 error; 2 findings)', JSON.stringify(p2));
  expect(/9 条事件/.test(p2?.summary || '') && /2 条风险发现/.test(p2?.summary || ''), 'P2 summary text states events and findings', p2?.summary);
  expect(p2?.duration === '00:15:00', 'P2 duration is the sum of its recorded steps (6 × 150 s)', p2?.duration);
  expect(p3?.open, 'the next stage (P3) opened');
  const pos = await page.evaluate(() => { const box = document.querySelector('[data-trace-scroller]').getBoundingClientRect(); const h = document.querySelector('[data-stage-head="P3"]')?.getBoundingClientRect();
    return { sticky: !!document.querySelector('[data-stage-sticky="P3"]'), inView: !!h && h.top >= box.top - 1 && h.bottom <= box.bottom + 1 }; });
  expect(pos.sticky || pos.inView, 'P3 row is at the top of the list or pinned there', JSON.stringify(pos));
  expect(await page.locator('[data-strip-stage="P3"][aria-current="step"]').count() === 1, 'run strip marks P3 as the stage in progress');
  if (!reduced) await shot(page, 't1-stage-advanced');
  await ctx.close();
}

// ── T2 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function t2() {
  const S = fresh(); const { ctx, page } = await open(S);
  await toTop(page);
  await page.click('[data-stage-head="P0"]'); await page.waitForTimeout(200);
  expect((await stage(page, 'P0'))?.open, 'P0 opened by hand');
  await page.locator('[data-stage-head="P2"], [data-stage-sticky="P2"]').first().click(); await page.waitForTimeout(200);
  expect((await stage(page, 'P2'))?.open === false, 'P2 (in progress) closed by hand');
  S.done = 4; await refresh(page);
  expect((await stage(page, 'P2'))?.open === false, 'a stage closed by hand is not reopened by new data');
  await page.locator('[data-wb-follow] input').check(); await page.waitForTimeout(200);
  S.active = 3; S.done = 1; await refresh(page);
  S.active = 4; S.done = 0; await refresh(page);
  await toTop(page);
  expect((await stage(page, 'P0'))?.open, 'P0 is still open two stages later');
  expect((await stage(page, 'P1'))?.open === false && (await stage(page, 'P3'))?.open === false, 'untouched finished stages are summaries');
  expect((await stage(page, 'P2'))?.open === false, 'P2 stays closed');
  await page.evaluate(() => { const el = document.querySelector('[data-trace-scroller]'); el.scrollTop = el.scrollHeight; }); await page.waitForTimeout(250);
  expect((await stage(page, 'P5'))?.open, 'the stage now in progress (P5) is open');
  await ctx.close();
}

// ── T3 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function t3() {
  const S = fresh(); const { ctx, page } = await open(S, { height: 700 });
  await page.click('[data-trace-pin]'); await page.waitForTimeout(150);
  const pinned = await page.getAttribute('[data-trace]', 'data-trace-pinned');
  expect(pinned === 'P2', 'pin takes the stage being read', pinned);
  expect(await page.locator(`[data-strip-stage="${pinned}"] [data-strip-pin]`).count() === 1, 'run strip shows a pin on that stage');
  const a = await scroll(page);
  S.active = 3; S.done = 0; append(S, 50); await refresh(page, 900);
  const b = await scroll(page);
  expect(Math.abs(a.top - b.top) < 1, 'scroll position unchanged while pinned', `${a.top} → ${b.top}`);
  expect((await stage(page, 'P2'))?.open, 'pinned stage is still open after the run moved on');
  expect(await page.locator('[data-row-leaving]').count() === 0, 'nothing folds while pinned');
  await shot(page, 't3-pinned');
  await page.click('[data-trace-pin]'); await page.waitForTimeout(700);
  expect(await page.getAttribute('[data-trace]', 'data-trace-follow') === 'on', 'follow resumes after unpinning');
  expect((await stage(page, 'P3'))?.open, 'after unpinning the stage in progress opens');
  await ctx.close();
}

// ── T4 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function t4(reduced) {
  const S = fresh(); const { ctx, page } = await open(S, { height: 640, reduced });
  expect((await scroll(page)).gap <= 1, 'a following list starts at its end', JSON.stringify([await scroll(page), await page.getAttribute('[data-trace]', 'data-trace-follow'), await page.evaluate(() => window.__scrolls)]));
  await scrollBy(page, -200);
  const a = await scroll(page);
  expect(await page.getAttribute('[data-wb-follow]', 'data-wb-follow') === 'off', 'scrolling up pauses follow');
  append(S, 20); await refresh(page);
  const b = await scroll(page);
  expect(Math.abs(a.top - b.top) < 1, 'scroll position unchanged after 20 new events', `${a.top} → ${b.top}`);
  const label = (await page.locator('[data-wb-new-entries]').textContent().catch(() => '')) || '';
  expect(/20\s*条新事件/.test(label), 'the bar says "20 条新事件 ↓"', label);
  if (!reduced) await shot(page, 't4-paused-new-entries');
  await page.click('[data-wb-new-entries]'); await page.waitForTimeout(300);
  expect((await scroll(page)).gap <= 1 && await page.getAttribute('[data-wb-follow]', 'data-wb-follow') === 'on', 'clicking it returns to the end and follows again');
  expect(await page.locator('[data-wb-new-entries]').count() === 0, 'the counter is gone after returning');
  await ctx.close();
}

// ── T5 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function t5(reduced) {
  { const S = fresh(); const { ctx, page } = await open(S, { height: 640, reduced });
    await scrollBy(page, -200);
    const a = await firstRow(page); const top0 = (await scroll(page)).top;
    await page.evaluate(() => { window.__cls = 0; window.__src = []; });
    append(S, 200);
    await page.waitForTimeout(9000);                    // the workbench's own 8 s read picks the events up: no input involved
    const b = await firstRow(page); const s = await scroll(page);
    const cls = await page.evaluate(() => window.__cls);
    expect(Number((await page.locator('[data-wb-new-entries]').textContent().catch(() => '0')).replace(/\D/g, '')) === 200, 'paused: 200 events arrived');
    expect(a && b && a.id === b.id && Math.abs(a.top - b.top) === 0, 'paused: first visible row did not move (0 px)', `${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    expect(Math.abs(s.top - top0) < 1, 'paused: scrollTop unchanged', `${top0} → ${s.top}`);
    expect(cls === 0, 'paused: cumulative layout shift is 0', `${cls} ${JSON.stringify(await page.evaluate(() => window.__src.slice(0, 4)))}`);
    const dom = await page.locator('[data-trace-row]').count();
    expect(dom < 80, `rows in the DOM are bounded by virtualisation (${dom} in the DOM after 200 more)`, dom);
    if (!reduced) await shot(page, 't5-paused-200');
    await ctx.close(); }
  { const S = fresh(); const { ctx, page } = await open(S, { height: 640, reduced });
    const base = Number(((await page.locator('[data-trace-count]').textContent()) || '').replace(/\D/g, ''));
    for (const n of [100, 100]) { append(S, n); await refresh(page, 800); expect((await scroll(page)).gap <= 1, `following: at the end after +${n}`, JSON.stringify(await scroll(page))); }
    const total = Number(((await page.locator('[data-trace-count]').textContent()) || '').replace(/\D/g, ''));
    expect(total === base + 200, `following: the row count went from ${base} to ${base + 200}`, total);
    expect(await page.locator('[data-trace-row]').count() < 80, 'following: rows in the DOM stay bounded');
    await ctx.close(); }
}

// ── T6 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function t6() {
  const active = (page) => page.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return null;
    const box = document.querySelector('[data-trace-scroller]')?.getBoundingClientRect(); const sticky = document.querySelector('[data-stage-sticky]')?.getBoundingClientRect().height || 0; const b = a.getBoundingClientRect();
    const cs = getComputedStyle(a);
    return { row: a.closest('[data-trace-row]')?.getAttribute('data-trace-row') || null, toggle: a.hasAttribute('data-row-toggle'), scroller: a.hasAttribute('data-trace-scroller'), input: a.hasAttribute('data-composer-input'),
      insp: a.hasAttribute('data-wb-inspector-toggle'), at: [Math.round(b.top), Math.round(b.bottom), box && Math.round(box.top), box && Math.round(box.bottom), sticky], ring: cs.outlineStyle !== 'none' || cs.boxShadow !== 'none', clear: !box || !a.closest('[data-trace-scroller]') || (b.top >= box.top + sticky - 1 && b.bottom <= box.bottom + 1) }; });
  { const S = fresh(); const { ctx, page } = await open(S);
    const t = page.locator('[data-row-kind="tool"] [data-row-toggle]').last();
    const id = await t.evaluate((el) => el.closest('[data-trace-row]').getAttribute('data-trace-row'));
    await t.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    expect(await page.locator(`[data-trace-row="${id}"] [data-row-panel]`).count() === 1, 'Enter expands a tool row (input / output)');
    expect(/输入/.test(await page.locator(`[data-trace-row="${id}"] [data-row-panel]`).textContent()) && /输出/.test(await page.locator(`[data-trace-row="${id}"] [data-row-panel]`).textContent()), 'the panel has input and output');
    await shot(page, 't6-tool-expanded');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const a = await active(page);
    expect(await page.locator(`[data-trace-row="${id}"] [data-row-panel]`).count() === 0 && a?.row === id && a.toggle, 'Escape collapses it and focus is back on the row toggle', JSON.stringify(a));
    expect(a?.ring && a?.clear, 'focus ring visible and not covered by the pinned stage row', JSON.stringify(a));
    // Command menu of the composer.
    await page.focus('[data-composer-input]'); await page.keyboard.type('/'); await page.waitForTimeout(200);
    expect(await page.locator('[data-composer-menu]').count() === 1, '"/" opens the command menu');
    await shot(page, 't6-command-menu');
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    expect(await page.locator('[data-composer-menu]').count() === 0 && (await active(page))?.input, 'Escape closes the menu, focus stays in the input');
    await page.keyboard.press('Backspace');
    // Approval.
    const ap = page.locator('[data-row-approve]').first(); await ap.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(900);
    const b = await active(page);
    expect(S.decided.size === 1, 'Enter on 批准 sends the decision');
    expect(b && (b.row || b.scroller), 'after the decision focus is on a trace row or the list, not lost', JSON.stringify(b));
    // Finding: opens the findings surface for that finding.
    await page.locator('[data-row-open]').first().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
    expect(/view=findings/.test(page.url()) && /finding=/.test(page.url()), 'Enter on 打开 goes to the finding', page.url());
    await ctx.close(); }
  { const S = fresh(); const { ctx, page } = await open(S, { width: 1100 });
    await page.focus('[data-wb-inspector-toggle]'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    const opened = await page.locator('[data-wb-inspector]').count();
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    expect(opened === 1 && (await active(page))?.insp, 'inspector drawer: Escape closes it and focus returns to its toggle');
    await ctx.close(); }
}

// ── T7 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function t7() {
  for (const theme of ['light', 'dark']) {
    const S = fresh(); const { ctx, page } = await open(S, { theme, height: 1100 });
    await page.locator('[data-row-kind="tool"]').first().click({ position: { x: 300, y: 10 } }); await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
      const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
      const bgOf = (el) => { const stack = []; for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0) stack.push(c); if (c.a === 1) break; }
        return stack.reverse().reduce((u, c) => over(c, u), { r: 255, g: 255, b: 255, a: 1 }); };
      const ratio = (fg, bg) => { const a = lum(over(fg, bg)), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
      const text = [], lines = [], dim = []; let lined = 0;
      for (const row of document.querySelectorAll('[data-trace-row]')) {
        const kind = `${row.getAttribute('data-row-kind')}${row.getAttribute('data-row-variant') ? ':' + row.getAttribute('data-row-variant') : ''}${row.hasAttribute('data-current') ? ':current' : ''}`;
        const w = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          if (!n.textContent.trim()) continue; const el = n.parentElement; const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || !el.getClientRects().length || el.closest('.sr-only')) continue;
          const cr = ratio(parse(cs.color), bgOf(el));
          if (cr < 4.5 && !el.closest('button:disabled')) text.push(`${kind} "${n.textContent.trim().slice(0, 16)}" ${cr.toFixed(2)}`);
        }
        for (let n = row; n && !n.hasAttribute('data-trace'); n = n.parentElement) if (Number(getComputedStyle(n).opacity) < 1) dim.push(kind);
        for (const el of row.querySelectorAll('*')) if (Number(getComputedStyle(el).opacity) < 1 && el.textContent.trim()) dim.push(`${kind} <${el.tagName.toLowerCase()}>`);
        const cs = getComputedStyle(row);
        if (parseFloat(cs.borderLeftWidth) >= 2 && (kind.startsWith('finding') || kind.includes('error'))) { lined++; const cr = ratio(parse(cs.borderLeftColor), bgOf(row)); if (cr < 3) lines.push(`${kind} left line ${cr.toFixed(2)}`); }
      }
      const prog = document.querySelector('[data-strip-progress]');
      if (prog) { const cr = ratio(parse(getComputedStyle(prog).borderBottomColor), bgOf(prog.parentElement)); if (cr < 3) lines.push(`active line ${cr.toFixed(2)}`); }
      const kinds = [...new Set([...document.querySelectorAll('[data-trace-row]')].map((x) => x.getAttribute('data-row-kind') + (x.getAttribute('data-row-variant') ? ':' + x.getAttribute('data-row-variant') : '')))];
      return { text, lines, dim, kinds, lined, current: document.querySelectorAll('[data-trace-row][data-current]').length };
    });
    expect(r.text.length === 0, `${theme}: all trace text is at least 4.5:1`, r.text.slice(0, 6).join(' | '));
    expect(r.lines.length === 0 && r.lined === 3, `${theme}: finding, error and active lines are at least 3:1 (2 finding rows, 1 error row, the strip's progress line)`, `${r.lined} lined rows; ${r.lines.join(' | ')}`);
    expect(r.dim.length === 0, `${theme}: no trace text is dimmed by opacity`, r.dim.slice(0, 6).join(' | '));
    expect(r.current === 1 && ['judgment', 'judgment:operator', 'tool', 'finding', 'approval', 'result:error'].every((k) => r.kinds.includes(k)), `${theme}: measured on every row type and the current row`, r.kinds.join(','));
    await shot(page, `t7-rows-${theme}`);
    await ctx.close();
  }
}

// ── T8 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function t8() {
  { const S = fresh(); const { ctx, page } = await open(S, { reduced: true });
    const m = await motion(page);
    expect(m.maxMs <= 0.011, 'reduced motion: no transition or animation longer than 0.01 ms', `${m.maxMs} ms`);
    expect(m.loops === 0, 'reduced motion: no looping animation is running', m.loops);
    expect(await page.locator('[data-live-dot]').count() === 1 && await page.locator('[data-live-dot]').evaluate((el) => getComputedStyle(el).animationName === 'none'), 'reduced motion: the dot is there and static');
    await ctx.close(); }
  await t1(true); await t4(true); await t5(true);
}

// ── T9 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function t9() {
  for (const [state, want] of [['running', 1], ['paused', 0], ['waiting_login', 0], ['completed', 0]]) {
    const S = fresh(); S.state = state; if (state === 'completed') { S.active = 5; }
    const { ctx, page } = await open(S);
    const m = await motion(page);
    expect(m.loops === want && m.dots === want, `${state}: ${want} looping animation${want === 1 ? ' (the run strip dot)' : 's'}`, JSON.stringify(m));
    expect(await page.locator('.jz-shimmer').count() === 0, `${state}: no skeleton on screen while counting`);
    await ctx.close();
  }
  { const S = fresh(); const { ctx, page } = await open(S, { hash: `${TRACE}?view=overview` });
    const m = await motion(page);
    expect(m.loops === 1 && m.dots === 1, 'overview while running: exactly one loop, the run strip dot', JSON.stringify(m));
    await ctx.close(); }
}

// ── T10 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
async function t10() {
  const S = fresh(); const { ctx, page } = await open(S, { height: 1100 });
  const r = await page.evaluate(() => {
    const probe = (v) => { const i = document.createElement('i'); i.style.color = `rgb(var(${v}))`; document.body.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return c; };
    const orange = probe('--jz-line-finding'), red = probe('--jz-red'), lineError = probe('--jz-line-error'), approval = probe('--jz-raised');
    const rows = [...document.querySelectorAll('[data-trace-row]')].map((row) => {
      const cs = getComputedStyle(row);
      const reds = [row, ...row.querySelectorAll('*')].filter((el) => { const c = getComputedStyle(el); return [c.color, c.backgroundColor, c.borderLeftColor, c.borderTopColor].includes(red); }).length;
      return { kind: row.getAttribute('data-row-kind'), variant: row.getAttribute('data-row-variant'), glyph: row.getAttribute('data-glyph'), author: row.getAttribute('data-author'), level: row.getAttribute('data-row-priority-level'),
        word: row.querySelector('[data-row-type]')?.textContent.trim(), hasGlyph: !!row.querySelector('[data-row-type] svg, [data-row-type] [data-glyph-mark]'), lineW: cs.borderLeftWidth, lineC: cs.borderLeftColor, bg: cs.backgroundColor,
        cap: !!row.querySelector('[data-row-cap]'), priority: row.querySelector('[data-row-priority]')?.textContent.trim(), reds, text: row.textContent,
        approve: (() => { const b = row.querySelector('[data-row-approve]'); return b ? !b.disabled && b.tabIndex >= 0 : null; })() };
    });
    return { rows, orange, red, lineError, approval, orangeToken: probe('--jz-orange') };
  });
  const rows = r.rows; const by = (k, v) => rows.filter((x) => x.kind === k && (v === undefined || (x.variant || '') === v));
  const kinds = [...new Set(rows.map((x) => x.kind))].sort();
  expect(kinds.join() === 'approval,finding,judgment,result,tool', 'data-row-kind has exactly the five values', kinds.join());
  const WORD = { judgment: '判断', 'judgment-operator': '引导', tool: '工具', finding: '风险发现', approval: '审批', result: '结果', error: '错误' };
  expect(rows.every((x) => x.glyph && WORD[x.glyph] === x.word && x.hasGlyph), 'every row has its glyph and its type word', JSON.stringify(rows.find((x) => !(x.glyph && WORD[x.glyph] === x.word && x.hasGlyph))));
  const f1 = by('finding').find((x) => x.level === 'P1'), f2 = by('finding').find((x) => x.level === 'P2');
  expect(by('finding').length === 2 && by('finding').every((x) => x.lineC === r.orange), 'finding rows: left line is the finding orange', `${by('finding').map((x) => x.lineC)} vs ${r.orange}`);
  expect(r.orange === r.orangeToken, 'the finding line colour is the orange token', `${r.orange} vs ${r.orangeToken}`);
  expect(f2 && f2.lineW === '2px' && f2.priority === 'P2 中' && !f2.cap, 'ordinary finding: 2 px, "P2 中", no cap', JSON.stringify(f2 && [f2.lineW, f2.priority, f2.cap]));
  expect(f1 && f1.lineW === '3px' && f1.priority === 'P1 高' && f1.cap, 'high finding: 3 px, cap marker, "P1 高"', JSON.stringify(f1 && [f1.lineW, f1.priority, f1.cap]));
  expect(by('finding').every((x) => x.reds === 0), 'no red anywhere on a finding row', by('finding').map((x) => x.reds).join());
  const err = by('result', 'error')[0];
  expect(err && err.lineC === r.lineError && parseFloat(err.lineW) >= 2 && err.word === '错误' && /ECONNREFUSED/.test(err.text), 'error row: red left line, "错误", full reason shown', JSON.stringify(err && [err.lineC, err.lineW, err.word]));
  const ap = by('approval').filter((x) => x.approve !== null);
  expect(ap.length === 2 && ap.every((x) => x.bg === r.approval && x.approve), 'pending approval rows: raised surface and a focusable primary action', JSON.stringify(ap.map((x) => [x.bg, x.approve])));
  const op = by('judgment', 'operator');
  expect(op.length === 1 && op[0].author === 'operator' && op[0].glyph === 'judgment-operator' && op[0].word === '引导', 'operator guidance: judgment variant, hollow diamond, "引导", data-author=operator', JSON.stringify(op[0]));
  expect(by('judgment', '').every((x) => x.author === 'agent'), 'AI judgments carry data-author=agent');
  expect((await stage(page, 'P2'))?.judgments === 1 && (await stage(page, 'P2'))?.guidance === 1, 'the stage counts 1 judgment; guidance is counted apart');
  await page.selectOption('[data-trace-filter]', 'operator'); await page.waitForTimeout(250);
  const after = await page.evaluate(() => [...document.querySelectorAll('[data-trace-row]')].map((x) => x.getAttribute('data-row-variant')));
  expect(after.length === 1 && after[0] === 'operator', 'filter "操作者引导" leaves only those rows', after.join());
  await shot(page, 't10-operator-filter');
  await ctx.close();
}

// ── T11 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
async function t11() {
  const gaps = (page, sel) => page.evaluate((sel) => { const body = document.querySelector('[data-trace-body]').getBoundingClientRect(); const el = document.querySelector(sel).getBoundingClientRect(); return { above: el.top - body.top, below: body.bottom - el.bottom, third: window.innerHeight / 3 }; }, sel);
  const noVoid = async (page, sel, name) => { const g = await gaps(page, sel); expect(g.above <= g.third && g.below <= g.third, `${name}: no blank area taller than a third of the screen`, JSON.stringify(g)); };
  { const S = fresh(); S.active = 3; S.done = 0; S.noRunning = true; S.bare = true; const { ctx, page } = await open(S);
    const t = await page.locator('[data-stage-upcoming="empty"]').textContent({ timeout: 2000 }).catch(() => '');
    expect(/还没有事件/.test(t) && ['会话有效期核对', '令牌刷新核对', '登出核对', '多端登录核对'].every((n) => t.includes(n)), 'stage in progress without events lists its real upcoming steps', t);
    await shot(page, 't11-upcoming-steps'); await ctx.close(); }
  { const S = fresh(); const { ctx, page } = await open(S, { hash: '#/projects/1/sessions/40' });
    expect(await page.locator('[data-trace-empty="idle"]').count() === 1 && await page.locator('[data-trace-start]').isVisible(), 'not started: explanation and 启动评估');
    await noVoid(page, '[data-trace-empty="idle"]', 'not started');
    await shot(page, 't11-not-started'); await ctx.close(); }
  { const S = fresh(); S.fail = true; const { ctx, page } = await open(S);
    const t = await page.locator('[data-trace-empty="failed"]').textContent().catch(() => '');
    expect(/未能读取/.test(t) && /运行状态/.test(t) && await page.locator('[data-trace-empty="failed"] button', { hasText: '重试' }).count() >= 1, 'failed sources: names what failed and offers retry', t);
    await noVoid(page, '[data-trace-empty="failed"]', 'failed sources');
    await shot(page, 't11-source-failed');
    S.fail = false; await page.locator('[data-trace-empty="failed"] button', { hasText: '重试' }).first().click(); await page.waitForTimeout(900);
    expect(await page.locator('[data-trace-row]').count() > 0, 'retry brings the trace back'); await ctx.close(); }
  { const S = fresh(); const { ctx, page } = await open(S);
    await page.selectOption('[data-trace-filter]', 'approval'); await page.selectOption('[data-trace-stage-filter]', 'P0'); await page.waitForTimeout(250);
    expect(await page.locator('[data-trace-empty="filtered"]').count() === 1, 'filtered to nothing: says so');
    await noVoid(page, '[data-trace-empty="filtered"]', 'filtered empty');
    await shot(page, 't11-filtered-empty');
    await page.click('[data-trace-clear]'); await page.waitForTimeout(250);
    expect(await page.locator('[data-trace-row]').count() > 0 && await page.locator('[data-trace-empty]').count() === 0, '清除筛选 brings the rows back'); await ctx.close(); }
}

// ── T12 ─────────────────────────────────────────────────────────────────────────────────────────────────────────
async function t12() {
  for (const hash of [TRACE, '#/tasks']) for (const width of [1440, 1280, 1024, 1000, 760, 390]) {
    const S = fresh(); const { ctx, page } = await open(S, { width, hash });
    const rail = async () => ({ n: await page.locator('[data-nav-rail]').count(), mode: await page.locator('[data-nav-rail]').first().getAttribute('data-nav-rail').catch(() => null),
      w: await page.locator('[data-nav-rail]').first().evaluate((el) => el.getBoundingClientRect().width).catch(() => 0) });
    const a = await rail(); const where = `${hash === TRACE ? 'workbench' : 'tasks'} @${width}`;
    if (width >= 1024) {
      expect(a.mode === 'full' && a.w === 220, `${where}: rail is 220 px by default`, JSON.stringify(a));
      await page.click('[data-nav-collapse]'); await page.waitForTimeout(350);
      const b = await rail(); expect(b.mode === 'collapsed' && b.w === 56, `${where}: collapses to 56 px`, JSON.stringify(b));
    } else if (width > 760) expect(a.mode === 'collapsed' && a.w === 56, `${where}: rail starts collapsed`, JSON.stringify(a));
    else { expect(a.n === 0, `${where}: no inline rail`, JSON.stringify(a)); await page.click('[data-nav-open]'); await page.waitForTimeout(300);
      expect(await page.locator('[data-nav-drawer] [data-nav-rail="full"]').count() === 1, `${where}: navigation is a drawer`); }
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(ov <= 1, `${where}: no horizontal overflow`, ov);
    await ctx.close();
  }
}

// ── Composer ────────────────────────────────────────────────────────────────────────────────────────────────────
async function composer() {
  const box = (page) => page.locator('[data-composer-primary]').boundingBox();
  const state = (page) => page.getAttribute('[data-composer]', 'data-state');
  let stopBox;
  { const S = fresh(); const { ctx, page } = await open(S);
    stopBox = await box(page);
    expect(await page.getAttribute('[data-composer-primary]', 'data-composer-primary') === 'stop' && await state(page) === 'running', 'running: the primary button is 停止');
    expect((await page.locator('[data-composer-route]').textContent()) === 'model-large', 'model route shows the active model of the catalog');
    const timer = await page.locator('[data-composer-timer]').textContent(); const header = await page.locator('[data-wb-readout="elapsed"], [data-wb-elapsed]').first().textContent().catch(() => '');
    expect(/^\d\d:\d\d:\d\d$/.test(timer || ''), 'running: the composer shows the elapsed time', timer);
    expect(!header || header.includes((timer || '').slice(0, 5)), 'the timer agrees with the session header (same source)', `${timer} / ${header}`);
    await page.fill('[data-composer-input]', '核对订单接口'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    expect(!(S.clues || []).length && /运行中不能发送/.test(await page.locator('[data-composer-reason]').textContent()), 'running: Enter does not send and the reason is stated');
    await page.click('[data-composer-primary="stop"]'); await page.waitForTimeout(300);
    expect(await page.getByRole('alertdialog').filter({ hasText: '停止这次运行' }).count() === 1, 'stop asks for confirmation first');
    await page.keyboard.press('Escape'); await ctx.close(); }
  { const S = fresh(); S.state = 'paused'; S.clueDelay = 700; const { ctx, page } = await open(S);
    const sendBox = await box(page);
    expect(await page.getAttribute('[data-composer-primary]', 'data-composer-primary') === 'send', 'paused: the primary button is 发送');
    expect(JSON.stringify(sendBox) === JSON.stringify(stopBox), 'send and stop occupy the same position and size', `${JSON.stringify(sendBox)} vs ${JSON.stringify(stopBox)}`);
    expect(await page.locator('[data-composer-primary]').isDisabled() && await page.locator('[data-composer-timer]').count() === 0, 'empty input: send is disabled; no timer while paused');
    expect(await page.locator('[data-composer-chip]').count() >= 1, 'the session chip sits above the input');
    await page.focus('[data-composer-input]'); await page.keyboard.type('@'); await page.waitForTimeout(200);
    expect(await page.locator('[data-composer-menu] [data-menu-row]').count() === 2, '"@" lists the findings that can be quoted');
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    expect(await page.locator('[data-composer-chip]').count() >= 2 && await page.inputValue('[data-composer-input]') === '', 'picking one adds a context chip');
    await page.keyboard.type('/'); await page.waitForTimeout(150);
    const cmds = await page.locator('[data-composer-menu] [data-menu-row]').allTextContents();
    expect(['/启动', '/暂停', '/继续', '/停止', '/引用'].every((c) => cmds.some((t) => t.includes(c))), '"/" lists the commands', cmds.join(' | '));
    await page.keyboard.press('Escape'); await page.keyboard.press('Backspace');
    await page.keyboard.type('先核对 /api/v1/orders/{id}'); await page.keyboard.press('Shift+Enter'); await page.keyboard.type('不要动支付接口');
    await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    expect(await state(page) === 'sending', 'while the request is out the composer says it is sending');
    await shot(page, 'c-sending');
    await page.waitForTimeout(1200);
    const sent = (S.clues || [])[0] || '';
    expect(sent.startsWith('> 引用 风险发现') && sent.endsWith('先核对 /api/v1/orders/{id}\n不要动支付接口'), 'the message carries the quoted finding, then the text with its line break', sent);
    expect(await page.inputValue('[data-composer-input]') === '' && await page.locator('[data-composer-chip]').count() === 1, 'after sending: input and added chips are cleared');
    S.clue = 500; S.clueDelay = 0;
    await page.fill('[data-composer-input]', '第二条引导'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
    expect(await state(page) === 'error' && await page.locator('[data-composer-error]').isVisible() && await page.inputValue('[data-composer-input]') === '第二条引导', 'server error: stated in place, the text is kept');
    await shot(page, 'c-error');
    S.clue = 'ok'; await page.click('[data-composer-retry]'); await page.waitForTimeout(700);
    expect(await page.locator('[data-composer-error]').count() === 0 && await page.inputValue('[data-composer-input]') === '', '重试 sends it');
    S.clue = 403;
    await page.fill('[data-composer-input]', '第三条引导'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
    expect(await state(page) === 'forbidden' && await page.locator('[data-composer-input]').isDisabled() && /没有权限/.test(await page.locator('[data-composer-error]').textContent()) && await page.locator('[data-composer-retry]').count() === 0,
      '403: says there is no permission, keeps the text, disables the input, offers no retry');
    await shot(page, 'c-forbidden');
    const fx = await page.evaluate(() => { const el = document.querySelector('[data-composer]'); const cs = getComputedStyle(el); return { img: cs.borderImageSource, bg: cs.backgroundImage, anim: [el, ...el.querySelectorAll('*')].filter((x) => getComputedStyle(x).animationName !== 'none').length }; });
    expect(fx.img === 'none' && fx.bg === 'none' && fx.anim === 0, 'no gradient border, no gradient fill, nothing animated in the composer', JSON.stringify(fx));
    await ctx.close(); }
}

// ── Terminal ────────────────────────────────────────────────────────────────────────────────────────────────────
async function terminal() {
  { const S = fresh(); append(S, 400);
    S.extra.push({ id: 'long', seq: 5000, type: 'observation', ts: stamp(0), phase: 'P2', title: `一条很长的输出：${'GET /api/v1/orders/1001?include=items,address,payments '.repeat(8)}` });
    const { ctx, page } = await open(S, { hash: `${TRACE}?view=raw` });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const sc = () => page.evaluate(() => { const el = document.querySelector('[data-terminal-scroller]'); return { gap: el.scrollHeight - el.scrollTop - el.clientHeight, lines: document.querySelectorAll('[data-terminal-line]').length }; });
    const a = await sc();
    expect(a.gap <= 1 && a.lines > 0 && a.lines < 120, `output is virtualised (${a.lines} lines in the DOM of 400+) and starts at its end`, JSON.stringify(a));
    const word = await page.getAttribute('[data-terminal-status]', 'data-terminal-status');
    expect(word === '运行中', 'running: the status line says 运行中 and when it last read', word);
    const b0 = await page.locator('[data-terminal-scroller]').boundingBox(); await page.mouse.move(b0.x + 200, b0.y + 100); await page.mouse.wheel(0, -300); await page.waitForTimeout(250);
    expect(await page.getAttribute('[data-terminal]', 'data-terminal-follow') === 'off', 'scrolling up pauses follow');
    await page.locator('[data-terminal-follow-toggle]').check(); await page.waitForTimeout(200);
    expect((await sc()).gap <= 1, 'the follow switch returns to the end');
    await page.fill('[data-terminal-find] input, input[data-terminal-find]', '追加事件 12'); await page.waitForTimeout(250);
    const hits = Number(await page.getAttribute('[data-terminal-hits]', 'data-terminal-hits'));
    expect(hits === 11, 'find counts the matches (12, 120–129)', hits);
    await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    expect(await page.locator('[data-terminal-line][data-current] mark').count() >= 1, 'Enter goes to the next match and marks it');
    await page.locator('[data-terminal-only-hits]').check(); await page.waitForTimeout(200);
    expect(await page.locator('[data-terminal-line]').count() === 11, '只列匹配行 keeps only the matching lines');
    await page.locator('[data-terminal-only-hits]').uncheck();
    const h0 = await page.locator('[data-terminal-line]').first().evaluate((el) => el.getBoundingClientRect().height);
    await page.setViewportSize({ width: 700, height: 900 }); await page.waitForTimeout(300);
    await page.fill('[data-terminal-find] input, input[data-terminal-find]', ''); await page.locator('[data-terminal-follow-toggle]').check();
    await page.click('[data-terminal-wrap]'); await page.waitForTimeout(400);
    const tall = await page.evaluate(() => Math.max(...[...document.querySelectorAll('[data-terminal-line]')].map((el) => el.getBoundingClientRect().height)));
    expect(tall > h0 && await page.getAttribute('[data-terminal-wrap]', 'aria-pressed') === 'true', 'wrap: long lines take more than one row', `${h0} → ${tall}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, 'no horizontal overflow with wrap at 700');
    await page.setViewportSize({ width: 1440, height: 900 }); await page.fill('[data-terminal-find] input, input[data-terminal-find]', ''); await page.waitForTimeout(200);
    await page.click('[data-terminal-copy]'); await page.waitForTimeout(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
    expect(clip === null || clip.split('\n').length > 300, 'copy puts the listed lines on the clipboard', clip === null ? 'clipboard not readable here' : clip.split('\n').length);
    await page.click('[data-terminal-clear]'); await page.waitForTimeout(200);
    expect(await page.locator('[data-terminal-line]').count() === 0 && await page.locator('[data-terminal-cleared]').count() === 1, 'clear empties the view and says the records are kept');
    await page.locator('[data-terminal-cleared] button').click(); await page.waitForTimeout(200);
    expect(await page.locator('[data-terminal-line]').count() > 0, '恢复显示 brings the lines back');
    await page.focus('[data-terminal-fullscreen]'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    const full = await page.getAttribute('[data-terminal]', 'data-terminal-full');
    const cover = await page.locator('[data-terminal]').boundingBox();
    expect(!!full && cover.width >= 1439 && cover.height >= 899, `fullscreen covers the window (${full})`, JSON.stringify(cover));
    await shot(page, 'term-fullscreen');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    expect(!(await page.getAttribute('[data-terminal]', 'data-terminal-full')) && await page.evaluate(() => document.activeElement?.hasAttribute('data-terminal-fullscreen')), 'Escape leaves fullscreen and focus returns to its button');
    await page.click('[data-v3-raw-tab="mon"]'); await page.waitForTimeout(200);
    expect(await page.locator('[data-monitor-step]').count() === 18 && /未采集/.test(await page.locator('[data-monitor]').textContent()), '执行监控 lists the 18 steps and says CPU / memory are not collected');
    await ctx.close(); }
  { const S = fresh(); S.fail = true; const { ctx, page } = await open(S, { hash: `${TRACE}?view=raw` });
    expect(await page.getAttribute('[data-terminal]', 'data-terminal-state') === 'failed' && /没有读到/.test(await page.locator('[data-terminal-scroller]').textContent()), 'all sources failing: says the output was not read');
    S.fail = false; await page.locator('[data-terminal-scroller] button', { hasText: '重试' }).click(); await page.waitForTimeout(900);
    expect(await page.locator('[data-terminal-line]').count() > 0, 'retry reads the output'); await ctx.close(); }
  { const S = fresh(); const { ctx, page } = await open(S, { hash: `${TRACE}?view=raw` });
    const n0 = await page.locator('[data-terminal-line]').count();
    S.fail = true; await page.waitForSelector('[data-terminal-status="读取中断"]', { timeout: 12000 }).catch(() => {});
    expect(await page.getAttribute('[data-terminal-status]', 'data-terminal-status') === '读取中断' && await page.locator('[data-terminal-line]').count() === n0, 'reads start failing: says 读取中断 and keeps the lines it has');
    S.fail = false; append(S, 3); await page.waitForSelector('[data-terminal-status="运行中"]', { timeout: 12000 }).catch(() => {});
    expect(await page.getAttribute('[data-terminal-status]', 'data-terminal-status') === '运行中' && await page.locator('[data-terminal-line]').count() === n0 + 3, 'reads recover: back to 运行中 with the new lines', await page.locator('[data-terminal-line]').count() - n0);
    await ctx.close(); }
  for (const [st, word] of [['waiting_login', '等待处理'], ['failed', '失败']]) { const S = fresh(); S.state = st; const { ctx, page } = await open(S, { hash: `${TRACE}?view=raw` });
    const w = await page.getAttribute('[data-terminal-status]', 'data-terminal-status');
    expect(w === word, `${st}: the status line says ${word}`, w); await ctx.close(); }
  { const S = fresh(); const { ctx, page } = await open(S, { hash: '#/projects/1/sessions/40?view=raw' });
    expect(await page.getAttribute('[data-terminal-status]', 'data-terminal-status') === '未开始' && /还没有输出/.test(await page.locator('[data-terminal-scroller]').textContent()), 'not started: no output, and it says why'); await ctx.close(); }
}

// ── Requests ────────────────────────────────────────────────────────────────────────────────────────────────────
async function requests() {
  { const S = fresh(); const { ctx, page } = await open(S, { hash: `${TRACE}?view=apitree` });
    expect(await page.locator('[data-api-row]').count() === 6, 'inventory lists the 6 interfaces');
    await page.selectOption('[data-api-method-filter]', 'GET'); await page.waitForTimeout(150);
    expect(await page.locator('[data-api-row]').count() === 4, 'method filter');
    await page.fill('[data-api-search] input, input[data-api-search]', 'zzz'); await page.waitForTimeout(150);
    expect(await page.locator('[data-requests-empty="filtered"]').count() === 1, 'filtered to nothing: says so');
    await page.locator('[data-requests-empty="filtered"] button').click(); await page.waitForTimeout(150);
    const row = page.locator('[data-api-row]').nth(1); await row.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    const dlg = page.getByRole('dialog');
    expect(await dlg.count() === 1 && /orders\/\{id\}/.test(await dlg.textContent()) && /HTTP 200/.test(await dlg.textContent()), 'a row opens the request detail in a drawer');
    await shot(page, 'req-drawer');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    expect(await dlg.count() === 0 && await page.evaluate(() => document.activeElement?.hasAttribute('data-api-row')), 'Escape closes the drawer and focus returns to the row');
    await row.click(); await page.waitForTimeout(200); await page.click('[data-api-clue-btn]'); await page.waitForTimeout(300);
    await page.goto(base + TRACE); await page.waitForTimeout(900);
    expect(await page.locator('[data-composer-chip]', { hasText: '/api/v1/orders/{id}' }).count() === 1, '引用到引导输入框 puts the request above the composer as a chip');
    await ctx.close(); }
  { const S = fresh(); const { ctx, page } = await open(S, { hash: `${TRACE}?view=burp` });
    expect(await page.locator('[data-burp-flow]').count() === 6 && await page.getAttribute('[data-burp-bridge]', 'data-burp-bridge') === 'on', 'traffic lists the 6 captured requests; forwarding is on');
    await page.selectOption('[data-burp-code-filter]', '4'); await page.waitForTimeout(150);
    expect(await page.locator('[data-burp-flow]').count() === 1, 'status-code filter');
    await page.locator('[data-burp-flow]').first().click(); await page.waitForTimeout(300);
    expect(await page.getByRole('dialog').locator('button:disabled', { hasText: '重放' }).count() === 1 && /重放通道没有接通/.test(await page.getByRole('dialog').textContent()), 'detail drawer: replay is disabled and says why');
    await ctx.close(); }
  { const S = fresh(); const { ctx, page } = await open(S, { hash: '#/projects/1/sessions/40?view=burp' });
    expect(/转发没有启动/.test(await page.locator('[data-requests-empty="none"]').textContent()), 'no traffic: says forwarding is not started');
    await page.goto(base + '#/projects/1/sessions/40?view=apitree'); await page.waitForTimeout(900);
    expect(/还没有接口资产/.test(await page.locator('[data-requests-empty="none"]').textContent()), 'no inventory: says where interfaces come from'); await ctx.close(); }
}

// ── No permission (every read of the session answers 403) ───────────────────────────────────────────────────────
async function denied() {
  const S = fresh(); S.deny = true; const { ctx, page } = await open(S);
  const at = async (view) => { await page.goto(base + TRACE + (view ? `?view=${view}` : '')); await page.waitForTimeout(1100); };
  const says = async (sel) => (await page.locator(sel).first().textContent().catch(() => '')) || '';
  let t = await says('[data-trace-empty="forbidden"]');
  expect(/没有权限读取轨迹/.test(t) && await page.locator('[data-trace-empty="forbidden"] button', { hasText: '重试' }).count() === 0, 'trace: says there is no permission and offers no retry', t.slice(0, 60));
  await shot(page, 'perm-trace');
  await at('overview'); t = await says('[data-overview]');
  expect(await page.getAttribute('[data-overview]', 'data-state') === 'forbidden' && /没有权限读取这个会话/.test(t), 'overview: says there is no permission', t.slice(0, 60));
  await at('raw');
  expect(await page.getAttribute('[data-terminal-status]', 'data-terminal-status') === '没有权限' && /没有权限读取输出/.test(await says('[data-terminal-scroller]')), 'terminal: status line and body say there is no permission');
  await at('apitree'); t = await says('[data-requests-list]');
  expect(/没有权限读取接口资产/.test(t) && await page.locator('[data-requests-list] button', { hasText: '重试' }).count() === 0, 'inventory: says there is no permission', t.slice(0, 60));
  await at('burp'); t = await says('[data-requests-status]');
  expect(await page.getAttribute('[data-burp-bridge]', 'data-burp-bridge') === 'unknown' && !/8080|未启动/.test(t) && await page.locator('[data-requests-status] button', { hasText: '启动转发' }).isDisabled(),
    'traffic: forwarding state is unknown (no default port, not "未启动") and 启动转发 is disabled', t.slice(0, 80));
  expect(/没有权限读取代理流量/.test(await says('[data-requests-empty="none"]')) && await page.locator('[data-requests="burp"] [data-state="stale"]').count() === 0, 'traffic: the empty list says there is no permission; no "earlier requests below" line over an empty list');
  await shot(page, 'perm-traffic');
  await ctx.close();
}

const TESTS = { C: composer, TERM: terminal, REQ: requests, PERM: denied, T1: () => t1(false), T2: t2, T3: t3, T4: () => t4(false), T5: () => t5(false), T6: t6, T7: t7, T8: t8, T9: t9, T10: t10, T11: t11, T12: t12 };
for (const [name, fn] of Object.entries(TESTS)) {
  if (only.length && !only.includes(name)) continue;
  current = name; const t0 = Date.now();
  try { await fn(); } catch (e) { expect(false, 'ran to the end', e.message.split('\n')[0]); }
  current = name;
  const mine = results.filter((x) => x.test === name);
  console.log(`${name}: ${mine.filter((x) => x.ok).length}/${mine.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
await browser.close();
current = 'page'; expect(pageErrors.length === 0, 'no page errors during the run', pageErrors.slice(0, 3).join(' | '));
const failed = results.filter((x) => !x.ok);
console.log(`\ncheck-trace: ${results.length - failed.length}/${results.length} checks passed`);
if (out) fs.writeFileSync(path.join(out, 'check-trace.json'), JSON.stringify({ passed: results.length - failed.length, total: results.length, results }, null, 1));
process.exit(failed.length ? 1 : 0);
