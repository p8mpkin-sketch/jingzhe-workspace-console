#!/usr/bin/env node
// Dev-only acceptance for the assessment workbench shell and inspector (V3 Phase 3), on fixtures.
// Session 41 is the running session of the fixtures (stages, steps, two approvals waiting, review rounds);
// session 40 has not started. `check-workbench.mjs` covers the 20 work surfaces; this script covers the shell.
// Needs `npx vite preview --port 4173`. Usage: node scripts/check-workbench-shell.mjs [--out dir]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
import { resolve as fixture } from './fixtures/api.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:4173/v2/');
const out = arg('out', '');
if (out) fs.mkdirSync(out, { recursive: true });
const LIVE = '/projects/1/sessions/41';
const IDLE = '/projects/1/sessions/40';
const KEY = 'jz.inspector.demo'; // fixtures sign in as "demo"
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch();
async function open(route, { width = 1440, theme = 'light', storage = null, fail = null, delay = 0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: out ? 1 : 1, colorScheme: theme });
  await ctx.addInitScript(([t, key, value]) => {
    try {
      localStorage.setItem('token', 'fixture-token'); localStorage.setItem('apksec-theme', t);
      if (value && !sessionStorage.getItem('seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('seeded', '1'); }
    } catch {}
  }, [theme, KEY, storage]);
  const page = await ctx.newPage();
  const errors = []; const gets = []; const posts = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', async (r) => {
    const req = r.request(); const url = new URL(req.url());
    if (/\/stream$|send_stream$/.test(url.pathname)) return r.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    (req.method() === 'GET' ? gets : posts).push(`${req.method()} ${url.pathname}`);
    if (fail && fail.test(url.pathname)) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"fixture failure"}' });
    const body = fixture(req.method(), url);
    if (delay && /\/api\/pentest\/sessions\/\d+/.test(url.pathname)) await new Promise((res) => setTimeout(res, delay));
    return r.fulfill(typeof body === 'string' ? { status: 200, contentType: 'text/plain; charset=utf-8', body } : { status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(base + '#' + route); await page.waitForTimeout(1400);
  return { ctx, page, errors, gets, posts };
}
const count = (page, sel) => page.locator(sel).count();
const text = (page, sel) => page.locator(sel).first().innerText().catch(() => '');
const shot = async (page, name) => { if (out) await page.screenshot({ path: path.join(out, name) }); };
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
const focusIn = (page, sel) => page.evaluate((s) => !!document.activeElement?.closest(s), sel);
const rect = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) } : null; }, sel);

// 1. One navigation layer; header → tabs → surface bar → surface, at every width.
for (const width of [1440, 1024, 760, 390]) {
  const { ctx, page, errors } = await open(LIVE, { width });
  const m = await page.evaluate(() => {
    const q = (s) => document.querySelector(s)?.getBoundingClientRect();
    const root = document.querySelector('[data-wb-root]');
    const tabs = [...document.querySelectorAll('[data-wb-tab]')];
    return {
      header: q('[data-wb-header]'), tabsRow: q('[data-wb-tabs]'), bar: q('[data-wb-surfacebar]'), surface: q('.wb-surface'), root: root?.getBoundingClientRect(),
      rail: document.querySelectorAll('.wb-rail, [data-wb-root] aside:not([data-wb-inspector])').length,
      navs: root ? root.querySelectorAll('nav, [role="navigation"]').length : -1,
      // Navigation landmarks in view, the breadcrumb aside: only the global navigation may be one (off-canvas below 761).
      pageNavs: [...document.querySelectorAll('nav, [role="navigation"]')].filter((n) => { const r = n.getBoundingClientRect(); return n.getAttribute('aria-label') !== '位置' && r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth; }).map((n) => n.getAttribute('aria-label')),
      tabTops: [...new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top)))],
      tabs: tabs.map((t) => t.getAttribute('data-wb-tab')),
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      globalRailVisible: (() => { const r = document.querySelector('[data-sidebar]')?.getBoundingClientRect(); return !!r && r.width > 0 && r.right > 0; })(),
    };
  });
  const order = m.header && m.tabsRow && m.bar && m.surface && m.header.top < m.tabsRow.top && m.tabsRow.top < m.bar.top && m.bar.top < m.surface.top;
  const flush = m.root && Math.abs(m.header.left - m.root.left) < 1 && Math.abs(m.bar.left - m.root.left) < 1 && Math.abs(m.surface.left - m.root.left) < 1;
  ok(`@${width} header, tabs, surface bar, surface in this order`, order && !errors.length, errors.join('; '));
  ok(`@${width} no second navigation rail: the surface starts at the left edge of the workbench`, m.rail === 0 && flush && m.navs === 0 && m.pageNavs.every((n) => n === '主导航') && m.pageNavs.length <= 1, `rails ${m.rail}, nav landmarks in workbench ${m.navs}, on the page: ${m.pageNavs.join(',') || 'none in view'}`);
  ok(`@${width} six primary tabs in one row`, m.tabs.join(',') === 'overview,runtime,findings,evidence,artifacts,report' && m.tabTops.length === 1, m.tabs.join(','));
  ok(`@${width} no horizontal overflow`, m.doc <= 1, `doc ${m.doc}`);
  await shot(page, `shell-live-${width}-light.png`);
  await ctx.close();
}

// 2. Session header: identity, the four readouts, one primary action, overflow menu, toggle. Nothing repeated in the top bar.
{
  const { ctx, page, posts } = await open(LIVE);
  const id = await text(page, '[data-wb-identity]');
  ok('header shows title, package and device', (await text(page, '[data-wb-title]')) === 'Wallet' && /com\.example\.wallet/.test(id) && /emulator-5554/.test(id), id);
  const cells = await page.locator('[data-wb-readout]').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-wb-readout'), e.innerText.replace(/\s+/g, ' ').trim()])));
  ok('readouts: status, stage, elapsed, pending', /运行中/.test(cells.status || '') && /阶段 3\/5/.test(cells.stage || '') && /权限矩阵/.test(cells.stage || '') && /3\/6 步/.test(cells.stage || '')
    && /^已用时 \d\d:\d\d:\d\d$/.test(cells.elapsed || '') && /待处理 2$/.test(cells.pending || ''), JSON.stringify(cells));
  const e1 = cells.elapsed; await page.waitForTimeout(2100);
  const e2 = (await text(page, '[data-wb-readout="elapsed"]')).replace(/\s+/g, ' ').trim();
  ok('elapsed time runs while the session is live', e1 !== e2, `${e1} → ${e2}`);
  ok('one primary run action', (await count(page, '[data-wb-header] [data-wb-primary]')) === 1 && (await text(page, '[data-wb-primary]')).trim() === '暂停');
  await page.click('[data-wb-more]'); await page.waitForTimeout(200);
  ok('overflow menu keeps the secondary actions and their hooks', (await count(page, '[data-v3-mission-start="device"]')) === 1 && (await count(page, '[data-v3-mission-start="replay"]')) === 1 && (await count(page, '[data-wb-stop]')) === 1);
  await page.keyboard.press('Escape');
  // Stopping a run is destructive: it asks first, and cancelling sends nothing.
  await page.click('[data-wb-more]'); await page.waitForTimeout(200); await page.click('[data-wb-stop]'); await page.waitForTimeout(300);
  const asked = (await count(page, '[role="alertdialog"] [data-confirm-ok]')) === 1 && /停止这次运行/.test(await text(page, '[role="alertdialog"]'));
  await page.click('[data-confirm-cancel]'); await page.waitForTimeout(250);
  ok('stop asks for confirmation; cancel sends nothing', asked && (await count(page, '[role="alertdialog"]')) === 0 && !posts.some((x) => /autopilot/.test(x)), posts.join(', ') || 'no POST');
  await page.click('[data-wb-more]'); await page.waitForTimeout(200); await page.click('[data-wb-stop]'); await page.waitForTimeout(300);
  await page.click('[data-confirm-ok]'); await page.waitForTimeout(500);
  ok('confirming sends one stop request', posts.filter((x) => /autopilot\/stop$/.test(x)).length === 1, posts.join(', '));
  const top = await text(page, '[data-topbar]');
  ok('top bar repeats neither package, device nor run status', !/com\.example|emulator-5554|运行中/.test(top), top.replace(/\s+/g, ' ').slice(0, 80));
  await ctx.close();
  const idle = await open(IDLE);
  const c2 = await idle.page.locator('[data-wb-readout]').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-wb-readout'), e.innerText.replace(/\s+/g, ' ').trim()])));
  ok('a session that has not started shows no invented stage or time', /未开始/.test(c2.status) && /未就绪/.test(c2.stage) && /—$/.test(c2.elapsed) && /0$/.test(c2.pending) && (await text(idle.page, '[data-wb-primary]')).trim() === '启动', JSON.stringify(c2));
  await idle.ctx.close();
}

// 3. Labels: read from ia.ts, unique across primary tabs, secondary tabs and inspector tabs.
{
  const { ctx, page } = await open(LIVE);
  const primary = await page.locator('[data-wb-tab]').evaluateAll((els) => els.map((e) => e.childNodes[0].textContent.trim()));
  const subs = [];
  for (const t of ['overview', 'runtime', 'findings', 'evidence', 'artifacts', 'report']) {
    await page.click(`[data-wb-tab="${t}"]`); await page.waitForTimeout(150);
    subs.push(...await page.locator('[data-wb-sub]').evaluateAll((els) => els.map((e) => e.innerText.trim())));
  }
  await page.click('[data-wb-inspector-toggle]'); await page.waitForTimeout(250);
  const insp = await page.locator('[data-wb-inspector-tab]').evaluateAll((els) => els.map((e) => e.innerText.trim()));
  const all = [...primary, ...subs, ...insp];
  const dup = all.filter((v, i) => all.indexOf(v) !== i);
  ok('six primary labels', primary.join(' ') === '概览 运行 风险发现 证据 产物 报告', primary.join(' '));
  ok('no tab label appears twice in the workbench', dup.length === 0, dup.join(',') || all.join(' '));
  ok('the surface bar has no heading that repeats the tab', (await count(page, '[data-wb-surfacebar] h2')) === 0);
  await ctx.close();
}

// 4. Surface bar: secondary tabs, segments, one live-status position, no summary chips.
{
  const { ctx, page } = await open(LIVE);
  ok('secondary tabs and segments of the trace', (await count(page, '[data-wb-sub]')) === 3 && (await count(page, '[data-wb-seg]')) === 3);
  ok('one live-status position', (await count(page, '[data-wb-surfacebar] [role="status"]')) === 1 && (await count(page, '[data-wb-live]')) === 1 && (await count(page, '.wb-live')) === 0, await text(page, '[data-wb-live]'));
  ok('no summary chips in the bar', (await count(page, '[data-wb-surfacebar] .wb-priority, [data-wb-surfacebar] .wb-chip')) === 0);
  ok('the trace renders its follow switch into that position', (await count(page, '[data-wb-live] [data-wb-follow]')) === 1 && (await count(page, '[data-wb-live] [aria-label="刷新数据"]')) === 1);
  await page.locator('[data-wb-sub="trace"]').focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200);
  ok('secondary tabs move with the arrow keys', (await page.locator('[data-wb-sub="terminal"]').getAttribute('aria-selected')) === 'true' && new URL(page.url()).hash.includes('view=raw'));
  await ctx.close();
}

// 5. Inspector, docked from 1280: resizable 280–480, remembered per user, Ctrl/⌘ + ., Escape returns focus.
{
  const { ctx, page } = await open(LIVE);
  ok('inspector is closed by default and the review rounds are not on the page', (await count(page, '[data-wb-inspector]')) === 0 && (await count(page, '[data-security-rounds]')) === 0);
  const before = await rect(page, '.wb-main');
  await page.click('[data-wb-inspector-toggle]'); await page.waitForTimeout(300);
  const mode = await page.locator('[data-wb-inspector]').getAttribute('data-wb-inspector-mode');
  const after = await rect(page, '.wb-main'); const panel = await rect(page, '[data-wb-inspector]');
  ok('1440: docked column that pushes the surface, no scrim', mode === 'docked' && (await count(page, '[data-wb-inspector-overlay]')) === 0 && after.w === before.w - panel.w - 1 && panel.w === 320, `main ${before.w} → ${after.w}, panel ${panel.w}`);
  ok('toggle states the open column', (await page.locator('[data-wb-inspector-toggle]').getAttribute('aria-expanded')) === 'true' && (await page.locator('[data-wb-inspector-toggle]').getAttribute('aria-controls')) === 'wb-inspector');
  ok('four tabs: review queue, brief, progress, log', (await page.locator('[data-wb-inspector-tab]').evaluateAll((els) => els.map((e) => e.getAttribute('data-wb-inspector-tab')).join(','))) === 'inspector,brief,progress,logs');
  // resize with the keyboard
  const sep = page.locator('[data-split-separator]');
  await sep.focus(); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(100);
  const w1 = (await rect(page, '[data-wb-inspector]')).w;
  await page.keyboard.press('Home'); await page.waitForTimeout(100); const wMax = (await rect(page, '[data-wb-inspector]')).w;
  await page.keyboard.press('End'); await page.waitForTimeout(100); const wMin = (await rect(page, '[data-wb-inspector]')).w;
  ok('separator: arrow keys resize, limits 280 and 480', w1 === 336 && wMax === 480 && wMin === 280 && (await sep.getAttribute('aria-valuenow')) === '280', `${w1} / ${wMax} / ${wMin}`);
  // drag
  const s = await rect(page, '[data-split-separator]');
  await page.mouse.move(s.x, s.y + 200); await page.mouse.down(); await page.mouse.move(s.x - 120, s.y + 200, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(100);
  const wDrag = (await rect(page, '[data-wb-inspector]')).w;
  ok('separator: drag resizes', Math.abs(wDrag - 400) <= 2, `${wDrag}`);
  await page.click('[data-wb-inspector-tab="progress"]'); await page.waitForTimeout(150);
  const st = await stored(page);
  ok('state is stored under the signed-in user', st && st.open === true && st.width === wDrag && st.tab === 'progress', JSON.stringify(st));
  await page.reload(); await page.waitForTimeout(1400);
  ok('open state, width and tab survive a reload', (await count(page, '[data-wb-inspector]')) === 1 && (await rect(page, '[data-wb-inspector]')).w === wDrag && (await page.locator('[data-wb-inspector-tab="progress"]').getAttribute('aria-selected')) === 'true');
  await page.locator('[data-split-separator]').dblclick(); await page.waitForTimeout(100);
  ok('double click resets the width to 320', (await rect(page, '[data-wb-inspector]')).w === 320);
  // Escape from inside the docked column: focus goes back to the toggle, column stays
  await page.locator('[data-wb-inspector-tab="progress"]').focus(); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok('docked: Escape returns focus to the toggle', (await focusIn(page, '[data-wb-inspector-toggle]')) && (await count(page, '[data-wb-inspector]')) === 1);
  await page.keyboard.press('Control+.'); await page.waitForTimeout(200);
  const closed = (await count(page, '[data-wb-inspector]')) === 0;
  await page.keyboard.press('Meta+.'); await page.waitForTimeout(200);
  ok('Ctrl + . and ⌘ + . toggle the inspector', closed && (await count(page, '[data-wb-inspector]')) === 1);
  // arrow keys on the tab row
  await page.locator('[data-wb-inspector-tab="progress"]').focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
  ok('inspector tabs move with the arrow keys', (await page.locator('[data-wb-inspector-tab="logs"]').getAttribute('aria-selected')) === 'true' && (await focusIn(page, '[data-wb-inspector-tab="logs"]')));
  // surface change keeps the docked column
  await page.click('[data-wb-tab="findings"]'); await page.waitForTimeout(250);
  ok('docked column stays open when the surface changes', (await count(page, '[data-wb-inspector]')) === 1);
  await shot(page, 'shell-inspector-docked-1440-light.png');
  await ctx.close();
}

// 6. Inspector content: review rounds moved into progress; nothing the header states is repeated.
{
  const { ctx, page, gets } = await open(LIVE, { storage: JSON.stringify({ open: true, width: 360, tab: 'progress' }) });
  ok('review rounds are in inspector › progress, the strip is gone', (await count(page, '[data-wb-inspector] [data-security-rounds]')) === 1 && (await count(page, '[data-security-rounds]')) === 1
    && (await page.locator('[data-round]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-round')}:${e.getAttribute('data-round-status')}`).join(' '))) === '1:ok 2:ok 3:ok 4:warn 5:ok');
  ok('a round state is a glyph and a word, not opacity', (await page.locator('[data-round] [data-status-text]').count()) === 5
    && (await page.locator('[data-round]').evaluateAll((els) => els.every((e) => getComputedStyle(e).opacity === '1'))), await text(page, '[data-round="4"]'));
  ok('stages with their steps, the current one open', (await count(page, '[data-wb-stage]')) === 5 && (await page.locator('[data-wb-stage="P2"]').getAttribute('aria-current')) === 'step'
    && (await page.locator('[data-wb-stage="P2"] button[aria-expanded]').first().getAttribute('aria-expanded')) === 'true' && /越权访问核对/.test(await text(page, '[data-wb-stage="P2"]')));
  await page.locator('[data-wb-stage="P1"] button[aria-expanded]').first().click(); await page.waitForTimeout(150);
  ok('any stage opens to its steps', /反编译与索引/.test(await text(page, '[data-wb-stage="P1"]')));
  await page.click('[data-wb-stage-jump="P1"]'); await page.waitForTimeout(400);
  ok('a stage jumps to its entry in the trace', new URL(page.url()).hash.includes('view=stream') && (await count(page, '#wb-conv-P1')) === 1);
  ok('the rounds request is the one the strip made, issued once on load', gets.filter((g) => g.endsWith('/security-rounds')).length === 1);
  const per = {};
  for (const t of ['inspector', 'brief', 'progress', 'logs']) {
    await page.click(`[data-wb-inspector-tab="${t}"]`); await page.waitForTimeout(350);
    per[t] = (await text(page, '[data-wb-inspector-panel]')).replace(/\s+/g, ' ');
    if (out) await page.locator('[data-wb-inspector]').screenshot({ path: path.join(out, `shell-inspector-${t}-light.png`) });
  }
  ok('review queue lists the approvals waiting', /在测试设备上重放请求/.test(per.inspector) && /启动导出组件/.test(per.inspector) && (await count(page, '[data-wb-inspector-tab="brief"]')) === 1);
  ok('brief: session, task, authorisation, model route, exploration run', /会话 #41/.test(per.brief) && /关联任务 #101/.test(per.brief) && /模型路由/.test(per.brief) && /探索运行/.test(per.brief));
  ok('log lists recent events', /分析引擎启动|待人工确认/.test(per.logs));
  const repeats = ['inspector', 'brief'].filter((t) => /com\.example\.wallet|emulator-5554|运行中|\d\d:\d\d:\d\d(?!.*\d\d:\d\d:\d\d)/.test(per[t].replace(/\d\d:\d\d:\d\d/g, '')));
  ok('queue and brief repeat neither package, device nor run status', repeats.length === 0, repeats.join(','));
  const tabText = (await page.locator('[data-wb-inspector-tab]').allInnerTexts()).join(' ');
  ok('the pending count is stated once, in the header', !/\d/.test(tabText) && /待处理 2/.test((await text(page, '[data-wb-readout="pending"]')).replace(/\s+/g, ' ')), tabText);
  ok('no findings, reports or metrics in the inspector', Object.values(per).every((t) => !/P0|P1 高|示例发现|报告草稿|风险评分/.test(t)));
  await ctx.close();
}

// 6b. Inspector states: reading, and a source that failed (the panel says so instead of showing "nothing waiting").
{
  const slow = await open(LIVE, { storage: JSON.stringify({ open: true, width: 320, tab: 'inspector' }), delay: 2500 });
  ok('inspector says it is reading while the first response is pending', (await count(slow.page, '[data-wb-inspector-panel] [data-state="loading"]')) === 1 && /正在读取/.test(await text(slow.page, '[data-wb-live]')), await text(slow.page, '[data-wb-inspector-panel]'));
  const pre = await slow.page.locator('[data-wb-readout]').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-wb-readout'), e.innerText.replace(/\s+/g, ' ').trim()])));
  ok('before the first response the header states no status or count, and the run action waits', /正在读取/.test(pre.status) && !/未开始|运行中/.test(pre.status) && /—$/.test(pre.pending) && (await slow.page.locator('[data-wb-primary]').isDisabled()), JSON.stringify(pre));
  await shot(slow.page, 'shell-state-loading-1440-light.png');
  await slow.page.waitForTimeout(3200);
  ok('once it arrives the header states it and the action is available', /运行中/.test(await text(slow.page, '[data-wb-readout="status"]')) && !(await slow.page.locator('[data-wb-primary]').isDisabled()));
  await slow.ctx.close();
  const bad = await open(LIVE, { storage: JSON.stringify({ open: true, width: 320, tab: 'inspector' }), fail: /\/approvals$/ });
  const panel = (await text(bad.page, '[data-wb-inspector-panel]')).replace(/\s+/g, ' ');
  ok('a failed source is named in its inspector tab, with retry; the queue is not reported as empty', (await count(bad.page, '[data-wb-inspector-stale]')) === 1 && /审批/.test(await text(bad.page, '[data-wb-inspector-stale]'))
    && (await count(bad.page, '[data-wb-inspector-stale] button')) === 1 && !/没有等待/.test(panel), panel.slice(0, 120));
  ok('the live position says part of the data is not updated; the header does not claim zero approvals', /部分未更新/.test(await text(bad.page, '[data-wb-live]')) && /—$/.test((await text(bad.page, '[data-wb-readout="pending"]')).trim()));
  const noStatus = await open(LIVE, { fail: /\/autopilot\/status$/ });
  ok('a failed status read shows "unknown", not "not started"; the run action stays available', /未知/.test(await text(noStatus.page, '[data-wb-readout="status"]')) && !(await noStatus.page.locator('[data-wb-primary]').isDisabled()), await text(noStatus.page, '[data-wb-readout="status"]'));
  await noStatus.ctx.close();
  await bad.page.click('[data-wb-inspector-tab="progress"]'); await bad.page.waitForTimeout(200);
  ok('tabs whose sources arrived show no notice', (await count(bad.page, '[data-wb-inspector-stale]')) === 0 && (await count(bad.page, '[data-wb-stage]')) === 5);
  await bad.page.click('[data-wb-inspector-tab="inspector"]'); await bad.page.waitForTimeout(200);
  await shot(bad.page, 'shell-state-stale-1440-light.png');
  await bad.ctx.close();
}

// 7. Drawer below 1280, bottom sheet at 760 and below: modal, focus trapped, Escape closes and returns focus.
for (const [width, want] of [[1024, 'drawer'], [760, 'sheet'], [390, 'sheet']]) {
  const { ctx, page } = await open(LIVE, { width, storage: JSON.stringify({ open: true, width: 400, tab: 'inspector' }) });
  ok(`@${width} an overlay never opens by itself on load`, (await count(page, '[data-wb-inspector]')) === 0);
  await page.locator('[data-wb-inspector-toggle]').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(350);
  const mode = await page.locator('[data-wb-inspector]').getAttribute('data-wb-inspector-mode');
  const r = await rect(page, '[data-wb-inspector-overlay] [role="dialog"]');
  const placed = want === 'drawer' ? r.r === width && r.y === 0 && r.h === 900 && r.w === 400 : r.x === 0 && r.w === width && r.b === 900 && r.y > 100;
  ok(`@${width} ${want}: placed ${want === 'drawer' ? 'on the right at the stored width' : 'at the bottom, full width'}`, mode === want && placed && (await count(page, `[data-wb-inspector-overlay="${want}"] [role="dialog"][aria-modal="true"]`)) === 1, JSON.stringify(r));
  ok(`@${width} focus moves into the ${want}`, await focusIn(page, '[data-wb-inspector]'));
  for (let i = 0; i < 14; i++) await page.keyboard.press('Tab');
  ok(`@${width} focus stays inside the ${want}`, await focusIn(page, '[data-wb-inspector]'));
  await shot(page, `shell-inspector-${want}-${width}-light.png`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok(`@${width} Escape closes the ${want} and returns focus to the toggle`, (await count(page, '[data-wb-inspector]')) === 0 && (await focusIn(page, '[data-wb-inspector-toggle]')));
  await page.keyboard.press('Control+.'); await page.waitForTimeout(300);
  const viaKey = (await count(page, '[data-wb-inspector]')) === 1;
  await page.click('[data-wb-inspector-tab="progress"]'); await page.waitForTimeout(150);
  await page.click('[data-wb-stage-jump="P2"]'); await page.waitForTimeout(400);
  ok(`@${width} shortcut opens it; going to the trace closes it`, viaKey && (await count(page, '[data-wb-inspector]')) === 0);
  await ctx.close();
}

// 8. Deep links and hooks of the shell.
{
  const { ctx, page } = await open(`${LIVE}?view=credentials`);
  ok('?view= selects its primary and secondary tab', (await page.locator('[data-wb-tab="evidence"]').getAttribute('aria-selected')) === 'true' && (await page.locator('[data-wb-sub="credentials"]').getAttribute('aria-selected')) === 'true'
    && (await page.locator('[data-wb-view]').getAttribute('data-wb-view')) === 'credentials');
  await page.click('[data-wb-tab="runtime"]'); await page.waitForTimeout(200); await page.click('[data-wb-seg="trajectory"]'); await page.waitForTimeout(200);
  ok('segments keep ?view= and ?tab=', /view=stream/.test(page.url()) && /tab=trajectory/.test(page.url()));
  await page.click('[data-wb-tab="evidence"]'); await page.waitForTimeout(200);
  ok('a primary tab reopens on the surface it was left on', /view=credentials/.test(page.url()));
  await page.click('[aria-label="返回项目"]'); await page.waitForTimeout(600);
  ok('back goes to the project runs tab', new URL(page.url()).hash.replace(/^#/, '') === '/projects/1?tab=runs', new URL(page.url()).hash);
  await ctx.close();
}

// 9. Dark theme screenshots of the shell (the surface capture covers every view).
if (out) {
  for (const width of [1440, 390]) {
    const { ctx, page } = await open(LIVE, { width, theme: 'dark', storage: JSON.stringify({ open: true, width: 320, tab: 'progress' }) });
    if (width < 1280) { await page.click('[data-wb-inspector-toggle]'); await page.waitForTimeout(300); }
    await shot(page, `shell-inspector-${width}-dark.png`);
    await ctx.close();
  }
}

await browser.close();
const failed = results.filter((r) => !r.pass);
if (out) fs.writeFileSync(path.join(out, 'report.workbench-shell.json'), JSON.stringify({ passed: results.length - failed.length, total: results.length, results }, null, 2) + '\n');
console.log(`${results.length - failed.length}/${results.length} workbench-shell checks passed (fixtures)`);
process.exit(failed.length ? 1 : 0);
