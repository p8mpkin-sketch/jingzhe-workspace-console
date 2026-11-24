#!/usr/bin/env node
// Dev-only acceptance for the findings and evidence surfaces of the assessment workbench (V3 Phase 5), on fixtures.
// Session 41 is the running session of the fixtures: 7 findings (12 instances) and 1 de-noised, a relation graph of
// 45 nodes, 3 Shadow findings. Session 40 has not started and has no graph.
// F = FindingsSurface, E = EvidenceSurface. Needs `npx vite preview --port 4173`.
// Usage: node scripts/check-findings-evidence.mjs [--out dir] [--only F1,E3] [--base url]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
import { resolve as fixture } from './fixtures/api.mjs';
import { liveCards, liveGraph } from './fixtures/evidence.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:4173/v2/');
const out = arg('out', '');
const only = arg('only', '').split(',').filter(Boolean);
if (out) fs.mkdirSync(out, { recursive: true });
const LIVE = '/projects/1/sessions/41';
const IDLE = '/projects/1/sessions/40';
const results = [];
let group = '';
const ok = (name, pass, detail = '') => { results.push({ group, name, pass: !!pass, detail: String(detail ?? '') }); console.log(`${pass ? 'ok  ' : 'FAIL'} ${group} ${name}${detail && !pass ? ' — ' + detail : ''}`); };
const want = (g) => !only.length || only.includes(g);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const pageErrors = [];
/** `over(method, url, body)` may answer a request itself: return { status?, body } or nothing to fall through to the fixtures. */
async function open(route, { width = 1440, height = 900, theme = 'light', over = null, delay = 0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.setItem('token', 'fixture-token'); localStorage.setItem('apksec-theme', t); } catch {} }, theme);
  const page = await ctx.newPage();
  const gets = []; const posts = [];
  page.on('pageerror', (e) => pageErrors.push(`${group}: ${e.message}`));
  await page.route('**/api/**', async (r) => {
    const req = r.request(); const url = new URL(req.url());
    if (/\/stream$|send_stream$/.test(url.pathname)) return r.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    if (req.method() === 'GET') gets.push(url.pathname + url.search); else posts.push({ path: url.pathname, body: req.postData() || '' });
    const own = over ? await over(req.method(), url, req.postData()) : undefined;
    if (own) return r.fulfill({ status: own.status || 200, contentType: 'application/json', body: JSON.stringify(own.body ?? {}) });
    const body = fixture(req.method(), url);
    if (delay && /\/api\/pentest\/sessions\/\d+/.test(url.pathname)) await sleep(delay);
    return r.fulfill(typeof body === 'string' ? { status: 200, contentType: 'text/plain; charset=utf-8', body } : { status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(base + '#' + route); await page.waitForTimeout(delay ? 300 : 1400);
  return { ctx, page, gets, posts };
}
const count = (page, sel) => page.locator(sel).count();
const text = (page, sel) => page.locator(sel).first().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const shot = async (page, name) => { if (out) await page.screenshot({ path: path.join(out, name + '.png') }); };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const hash = (page) => page.evaluate(() => location.hash);
const focusIs = (page, sel) => page.evaluate((s) => !!document.activeElement?.matches(s), sel);
const focusIn = (page, sel) => page.evaluate((s) => !!document.activeElement?.closest(s), sel);
/** The colour a token resolves to in this page, as the browser reports it. */
const token = (page, name) => page.evaluate((n) => { const p = document.createElement('i'); p.style.color = `rgb(var(${n}))`; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; }, name);
const titles = (page) => page.locator('[data-finding-row] [data-finding-title]').allInnerTexts();
const stateWrites = (posts) => posts.filter((p) => /\/vulns\/state$/.test(p.path)).map((p) => { try { const b = JSON.parse(p.body); return `${b.id}:${b.state}`; } catch { return p.body; } });
const cards = (list) => ({ status: 'ok', cards: list });
const grouped = (fn) => (m, u, b) => (/\/sessions\/41\/vulns\/grouped$/.test(u.pathname) && m === 'GET' ? fn(u) : undefined);
const RETRY = /重试|稍后/;

// ───────────────────────── Findings ─────────────────────────

if (want('F1')) { group = 'F1';
  const { ctx, page } = await open(`${LIVE}?view=findings`);
  ok('the findings tab mounts the findings surface, once', (await count(page, '[data-findings="main"]')) === 1 && (await count(page, '[data-findings-grid]')) === 1);
  const scope = await text(page, '[data-findings-scope]');
  ok('the scope statement counts findings, instances and de-noised', scope === '7 条 · 12 个实例 · 1 条已降噪', scope);
  const t = await titles(page);
  ok('7 rows, the de-noised finding is not listed', t.length === 7 && !t.some((x) => /第三方库版本提示/.test(x)), t.join(' | '));
  const order = await page.locator('[data-finding-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-row-priority-level')).join(','));
  ok('rows are ordered by priority', order === 'P0,P1,P1,P2,P2,P3,P3', order);
  const g = await page.evaluate(() => {
    const grid = document.querySelector('[data-findings-grid]').getBoundingClientRect(); const pane = document.querySelector('[data-findings-pane]')?.getBoundingClientRect();
    return { grid: [grid.left, grid.right, grid.width], pane: pane ? [pane.left, pane.right, pane.width] : null, heads: [...document.querySelectorAll('[data-findings-grid] [role="columnheader"]')].map((h) => h.textContent.trim()).filter(Boolean) };
  });
  ok('table and detail side by side at 1440: the table stays, the detail is a pane beside it', g.pane && g.pane[0] >= g.grid[1] - 1 && g.grid[2] > 480 && g.pane[2] >= 384, JSON.stringify(g));
  ok('columns: priority, title, status, confidence, evidence, instances', g.heads.join(',') === '优先级,标题,状态,置信,证据,实例', g.heads.join(','));
  ok('the first finding is open in the pane', (await text(page, '[data-findings-pane] [data-finding-head]')).includes('P0') && (await page.locator('[data-finding-row]').first().getAttribute('data-current')) === 'true');
  ok('no horizontal overflow', (await overflow(page)) <= 1);
  await shot(page, 'findings-1440-light');
  await ctx.close();
}

if (want('F2')) { group = 'F2';
  for (const theme of ['light', 'dark']) {
    const { ctx, page } = await open(`${LIVE}?view=findings`, { theme });
    const orange = await token(page, '--jz-line-finding'); const red = await token(page, '--jz-red');
    const rows = await page.locator('[data-finding-row]').evaluateAll((els) => els.map((e) => {
      const cs = getComputedStyle(e); const sev = e.querySelector('[data-severity]'); const st = e.querySelector('[data-review]');
      return { p: e.getAttribute('data-row-priority-level'), line: cs.borderLeftColor, w: cs.borderLeftWidth, cap: !!e.querySelector('[data-row-cap]'),
        shape: sev?.querySelector('svg') ? sev.querySelector('svg').innerHTML.replace(/\s+/g, ' ').slice(0, 60) : '', label: sev?.textContent.trim() || '', weight: sev ? getComputedStyle(sev.querySelector('[data-p-label]') || sev).fontWeight : '',
        statusGlyph: !!st?.querySelector('svg'), statusWord: st?.textContent.trim() || '',
        dim: [e, ...e.querySelectorAll('*')].filter((n) => Number(getComputedStyle(n).opacity) < 1).length };
    }));
    ok(`${theme}: every row carries the orange finding line`, rows.length === 7 && rows.every((r) => r.line === orange), `${orange} vs ${[...new Set(rows.map((r) => r.line))].join(' ')}`);
    ok(`${theme}: severity by line width: 3 px for P0 and P1, 2 px for P2 and P3`, rows.every((r) => r.w === (r.p === 'P0' || r.p === 'P1' ? '3px' : '2px')), rows.map((r) => `${r.p}:${r.w}`).join(' '));
    ok(`${theme}: severity by cap marker: P0 and P1 only`, rows.every((r) => r.cap === (r.p === 'P0' || r.p === 'P1')), rows.map((r) => `${r.p}:${r.cap}`).join(' '));
    const shapes = Object.fromEntries(rows.map((r) => [r.p, r.shape]));
    ok(`${theme}: severity by marker shape and P-label: four shapes, each row says its P level`, new Set(Object.values(shapes)).size === 4 && rows.every((r) => r.shape && r.label.startsWith(r.p)), rows.map((r) => r.label).join(' | '));
    ok(`${theme}: status is a glyph and a word`, rows.every((r) => r.statusGlyph && /^(待复核|已确认|已排除|部分确认)$/.test(r.statusWord)), rows.map((r) => r.statusWord).join(','));
    ok(`${theme}: nothing in a row is dimmed by opacity, the excluded finding included`, rows.every((r) => r.dim === 0), rows.map((r) => r.dim).join(','));
    const reds = await page.evaluate((red) => [...document.querySelectorAll('[data-findings] *')].filter((n) => { const c = getComputedStyle(n); return [c.color, c.backgroundColor, c.borderLeftColor, c.borderTopColor, c.fill, c.stroke].includes(red); }).length, red);
    ok(`${theme}: no red anywhere on the surface: a finding is never red`, reds === 0, `${reds} elements`);
    if (theme === 'dark') await shot(page, 'findings-1440-dark');
    await ctx.close();
  }
}

if (want('F3')) { group = 'F3';
  for (const theme of ['light', 'dark']) {
    const { ctx, page } = await open(`${LIVE}?view=findings`, { theme });
    const s2 = await token(page, '--jz-surface-2');
    const bg = await page.locator('[data-finding-row]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-current') === 'true', getComputedStyle(e).backgroundColor]));
    ok(`${theme}: the current row is on surface-2 and is the only one`, bg.filter((b) => b[0]).length === 1 && bg.every((b) => (b[1] === s2) === b[0]), JSON.stringify(bg));
    await page.locator('[data-finding-row]').nth(3).click(); await page.waitForTimeout(200);
    const cur = await page.locator('[data-finding-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-current') === 'true').indexOf(true));
    ok(`${theme}: clicking another row moves the current row and the pane`, cur === 3 && (await text(page, '[data-findings-pane] [data-finding-title]')).includes('调试标志'), `current ${cur}`);
    await ctx.close();
  }
}

if (want('F4')) { group = 'F4';
  const { ctx, page } = await open(`${LIVE}?view=findings`);
  const prim = await page.locator('[data-findings] [data-triage="primary"]').count();
  ok('one primary triage control on the surface: 确认, in the detail', prim === 1 && (await count(page, '[data-findings-pane] [data-triage="primary"]')) === 1 && (await text(page, '[data-triage-primary]')) === '确认');
  const all = await text(page, '[data-findings]');
  ok('no second triage pattern: no “批量确认（预览）”, no per-row buttons', !/批量确认|预览/.test(all) && (await count(page, '[data-finding-row] button')) === 0);
  await page.click('[data-findings-pane] [data-triage-more]'); await page.waitForTimeout(200);
  const items = await page.locator('[role="menu"] [role="menuitem"]').allInnerTexts();
  ok('the other outcomes are in the menu of the same button: 排除, 恢复待复核', items.join(',') === '排除,恢复待复核', items.join(','));
  ok('the outcome the finding already has is not offered', await page.locator('[data-triage-item="pending"]').isDisabled());
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok('Escape closes the menu and leaves the detail open', (await count(page, '[role="menu"]')) === 0 && (await count(page, '[data-findings-pane] [data-finding-head]')) === 1);
  await page.locator('[data-finding-check]').nth(1).check(); await page.locator('[data-finding-check]').nth(2).check(); await page.waitForTimeout(150);
  ok('ticking rows adds a secondary control for those rows; still one primary', (await count(page, '[data-findings-bulk] [data-triage="secondary"]')) === 1 && (await count(page, '[data-findings] [data-triage="primary"]')) === 1 && /已选 2 条/.test(await text(page, '[data-findings-picked]')));
  await shot(page, 'findings-picked-1440-light');
  await ctx.close();
}

if (want('F5')) { group = 'F5';
  const { ctx, page } = await open(`${LIVE}?view=findings`);
  await page.locator('[data-finding-row]').first().focus();
  ok('one tab stop in the table: the focused row', (await page.locator('[data-finding-row][tabindex="0"]').count()) === 1);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150);
  ok('↓ ↓ moves focus to the third row', await focusIs(page, '[data-row-index="2"]'));
  ok('moving focus does not change the finding in the pane', (await text(page, '[data-findings-pane] [data-finding-head]')).includes('P0'));
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(100);
  ok('↑ moves back', await focusIs(page, '[data-row-index="1"]'));
  await page.keyboard.press('End'); await page.waitForTimeout(100); const end = await focusIs(page, '[data-row-index="6"]');
  await page.keyboard.press('Home'); await page.waitForTimeout(100);
  ok('End and Home go to the last and first row', end && (await focusIs(page, '[data-row-index="0"]')));
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  ok('Enter opens the detail of that row and moves focus into it', (await text(page, '[data-findings-pane]')).includes('匿名可访问个人资料接口') && (await focusIn(page, '[data-findings-pane]')));
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok('Escape closes the detail and returns focus to the row', (await count(page, '[data-findings-pane] [data-finding-head]')) === 0 && (await focusIs(page, '[data-row-index="2"]')));
  await page.keyboard.press(' '); await page.waitForTimeout(150);
  ok('Space ticks the row', (await page.locator('[data-row-index="2"]').getAttribute('aria-selected')) === 'true' && /已选 1 条/.test(await text(page, '[data-findings-picked]')));
  await page.keyboard.press(' '); await page.waitForTimeout(150);
  ok('Space again unticks it', (await page.locator('[data-row-index="2"]').getAttribute('aria-selected')) === 'false' && (await count(page, '[data-findings-picked]')) === 0);
  const ring = await page.evaluate(() => { const c = getComputedStyle(document.activeElement); return `${c.outlineStyle} ${c.outlineWidth} ${c.boxShadow}`; });
  ok('the focused row shows a focus indicator', !/^none 0px none$/.test(ring), ring);
  await ctx.close();
}

if (want('F6')) { group = 'F6';
  const { ctx, page, posts } = await open(`${LIVE}?view=findings`);
  await page.click('[data-findings-pane] [data-triage-primary]'); await page.waitForTimeout(500);
  const w = stateWrites(posts);
  ok('确认 on one finding writes each of its instances through POST /vulns/state', w.join(',') === 'f31:confirmed,f32:confirmed', w.join(','));
  ok('and issues nothing else', posts.length === 2 && posts.every((p) => /\/sessions\/41\/vulns\/state$/.test(p.path)), posts.map((p) => p.path).join(' '));
  ok('no confirmation dialog for one finding', (await count(page, '[role="alertdialog"]')) === 0);
  posts.length = 0;
  await page.click('[data-findings-pane] [data-triage-more]'); await page.waitForTimeout(150); await page.click('[data-triage-item="excluded"]'); await page.waitForTimeout(500);
  ok('排除 from the menu writes the same instances as excluded', stateWrites(posts).join(',') === 'f31:excluded,f32:excluded', stateWrites(posts).join(','));
  await ctx.close();
}

if (want('F7')) { group = 'F7';
  const { ctx, page, posts } = await open(`${LIVE}?view=findings`);
  await page.locator('[data-finding-row]').first().focus(); await page.keyboard.press(' '); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press(' '); await page.waitForTimeout(150);
  await page.click('[data-findings-bulk] [data-triage-primary]'); await page.waitForTimeout(300);
  const dlg = await text(page, '[role="alertdialog"]');
  ok('triage of several rows asks first, in a dialog that lists the rows', (await count(page, '[role="alertdialog"] [data-findings-confirm] li')) === 2 && /硬编码密钥/.test(dlg) && /匿名可访问个人资料接口/.test(dlg) && /确认 2 条风险发现/.test(dlg), dlg.slice(0, 200));
  ok('the dialog states the instance count and that it can be undone', /4 个实例/.test(dlg) && /可以撤回/.test(dlg), dlg.slice(0, 260));
  ok('nothing is written before the answer', posts.length === 0);
  await shot(page, 'findings-bulk-confirm-1440-light');
  await page.locator('[role="alertdialog"] button', { hasText: '取消' }).click(); await page.waitForTimeout(250);
  ok('取消 writes nothing and keeps the ticks', posts.length === 0 && (await count(page, '[role="alertdialog"]')) === 0 && /已选 2 条/.test(await text(page, '[data-findings-picked]')));
  await page.click('[data-findings-bulk] [data-triage-more]'); await page.waitForTimeout(150); await page.click('[data-triage-item="excluded"]'); await page.waitForTimeout(300);
  ok('排除 for several rows asks in the same dialog', /排除 2 条风险发现/.test(await text(page, '[role="alertdialog"]')));
  await page.locator('[role="alertdialog"] button', { hasText: '排除 2 条' }).click(); await page.waitForTimeout(700);
  const w = stateWrites(posts);
  ok('confirming writes every instance of the listed rows', w.join(',') === 'f31:excluded,f32:excluded,f71:excluded,f72:excluded', w.join(','));
  ok('afterwards the dialog is closed and the ticks are cleared', (await count(page, '[role="alertdialog"]')) === 0 && (await count(page, '[data-findings-picked]')) === 0);
  await ctx.close();
}

if (want('F8')) { group = 'F8';
  { // The write is refused.
    const { ctx, page, posts } = await open(`${LIVE}?view=findings`, { over: (m, u) => (m === 'POST' && /vulns\/state$/.test(u.pathname) ? { status: 403, body: { detail: 'fixture: forbidden' } } : undefined) });
    await page.click('[data-findings-pane] [data-triage-primary]'); await page.waitForTimeout(500);
    const n = await text(page, '[data-findings-notice]');
    ok('a refused write (403) is stated as a permission matter', (await page.locator('[data-findings-notice]').getAttribute('data-findings-notice')) === 'forbidden' && /无权处置/.test(n) && /切换账号或联系管理员/.test(n), n.slice(0, 160));
    ok('and offers no retry', (await count(page, '[data-findings-retry]')) === 0 && !RETRY.test(n), n.slice(0, 200));
    ok('the first refusal stops the remaining writes', posts.length === 1, `${posts.length} requests`);
    await shot(page, 'findings-write-forbidden-1440-light');
    await ctx.close();
  }
  { // The write fails for another reason.
    let fail = true;
    const { ctx, page, posts } = await open(`${LIVE}?view=findings`, { over: (m, u) => (m === 'POST' && /vulns\/state$/.test(u.pathname) && fail ? { status: 500, body: { detail: 'fixture failure' } } : undefined) });
    await page.click('[data-findings-pane] [data-triage-primary]'); await page.waitForTimeout(500);
    ok('a failed write (500) says what was not written and offers retry', (await page.locator('[data-findings-notice]').getAttribute('data-findings-notice')) === 'error' && (await count(page, '[data-findings-retry]')) === 1 && /没有写入/.test(await text(page, '[data-findings-notice]')));
    fail = false; posts.length = 0; await page.click('[data-findings-retry]'); await page.waitForTimeout(600);
    ok('retry writes the same instances and clears the notice', stateWrites(posts).join(',') === 'f31:confirmed,f32:confirmed' && (await count(page, '[data-findings-notice]')) === 0, stateWrites(posts).join(','));
    await ctx.close();
  }
  { // The read is refused.
    const { ctx, page } = await open(`${LIVE}?view=findings`, { over: grouped(() => ({ status: 403, body: { detail: 'fixture: forbidden' } })) });
    const t = await text(page, '[data-findings]');
    ok('a refused read (403) is a permission state', (await page.locator('[data-findings]').getAttribute('data-state')) === 'forbidden' && (await count(page, '[data-findings] [data-state="permission"]')) === 1 && /没有权限读取风险发现/.test(t), t.slice(0, 120));
    ok('with no retry wording and no triage control', !RETRY.test(t) && (await count(page, '[data-findings] [data-triage]')) === 0, t);
    ok('and no count or filter for a list that was not read', (await count(page, '[data-findings-toolbar]')) === 0 && !/0 条/.test(t), t.slice(0, 80));
    await shot(page, 'findings-forbidden-1440-light');
    await ctx.close();
  }
  { // The read fails.
    let fail = true;
    const { ctx, page } = await open(`${LIVE}?view=findings`, { over: grouped(() => (fail ? { status: 500, body: { detail: 'fixture failure' } } : undefined)) });
    ok('a failed read (500) is an error state with retry', (await page.locator('[data-findings]').getAttribute('data-state')) === 'error' && (await count(page, '[data-findings] [data-state="error"] button')) >= 1);
    fail = false; await page.locator('[data-findings] [data-state="error"] button', { hasText: '重试' }).click(); await page.waitForTimeout(900);
    ok('retry reads again and lists the findings', (await count(page, '[data-finding-row]')) === 7);
    await ctx.close();
  }
}

if (want('F9')) { group = 'F9';
  const { ctx, page, gets, posts } = await open(`${LIVE}?view=shadow`);
  ok('Shadow 对照 reads vulns/grouped?source=shadow', gets.some((g) => /\/sessions\/41\/vulns\/grouped\?source=shadow$/.test(g)), gets.filter((g) => /grouped/.test(g)).join(' '));
  ok('and lists its 3 findings in the same table', (await count(page, '[data-findings="shadow"] [data-finding-row]')) === 3);
  ok('Shadow is read-only: no tick boxes, no triage control, and it says so', (await count(page, '[data-findings] input[type="checkbox"]')) === 0 && (await count(page, '[data-findings] [data-triage]')) === 0 && /只读对照/.test(await text(page, '[data-findings-readonly]')));
  await page.locator('[data-finding-row]').nth(1).focus(); await page.keyboard.press(' '); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  ok('its detail opens and still has no triage control', /证书校验被关闭/.test(await text(page, '[data-findings-pane]')) && (await count(page, '[data-findings-pane] [data-triage]')) === 0 && posts.length === 0);
  await shot(page, 'findings-shadow-1440-light');
  const segs = await page.locator('[data-wb-seg]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-wb-seg')}:${e.textContent.trim()}`));
  ok('the four segments are kept: 主发现, Shadow 对照, 规则卡, 聚类', segs.join(',') === 'findings:主发现,shadow:Shadow 对照,rulecards:规则卡,clusters:聚类', segs.join(','));
  for (const [seg, probe, label] of [['rulecards', '[aria-label="规则卡"], [data-surface-label="规则卡"]', '规则卡'], ['clusters', '[data-clusters], .wb-view', '聚类'], ['findings', '[data-findings="main"]', '主发现']]) {
    await page.click(`[data-wb-seg="${seg}"]`); await page.waitForTimeout(700);
    ok(`segment ${label} keeps its ?view= and renders`, new RegExp(`view=${seg}(&|$)`).test(await hash(page)) && (await count(page, probe)) >= 1 && (await overflow(page)) <= 1, await hash(page));
    if (seg !== 'findings') await shot(page, `findings-${seg}-1440-light`);
  }
  ok('back on 主发现 the main set is read without ?source', (await count(page, '[data-finding-row]')) === 7);
  await ctx.close();
}

if (want('F10')) { group = 'F10';
  for (const width of [1024, 760, 390]) {
    const { ctx, page } = await open(`${LIVE}?view=findings`, { width });
    ok(`@${width} no pane beside the table and no finding opened on arrival`, (await count(page, '[data-findings-pane]')) === 0 && (await count(page, '[role="dialog"]')) === 0);
    const heads = await page.locator('[data-findings-grid] [role="columnheader"]').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0 && e.textContent.trim()).map((e) => e.textContent.trim()));
    ok(`@${width} columns fit the width`, heads.join(',') === (width === 1024 ? '优先级,标题,状态,置信,证据,实例' : '优先级,标题'), heads.join(','));
    if (width <= 760) {
      const r = await page.locator('[data-finding-row]').first().evaluate((e) => ({ h: e.getBoundingClientRect().height, status: e.querySelector('[data-review]')?.getBoundingClientRect().width || 0, txt: e.innerText.replace(/\s+/g, ' ') }));
      ok(`@${width} a row is two lines: title, then status and instance count`, r.h >= 56 && r.status > 0 && /待复核/.test(r.txt) && /2 个实例/.test(r.txt), JSON.stringify(r));
      const touch = await page.locator('[data-finding-row] label').first().evaluate((e) => { const b = e.getBoundingClientRect(); return [b.width, b.height]; });
      ok(`@${width} the tick box has a 44 px target`, touch[0] >= 44 && touch[1] >= 44, touch.join('×'));
    }
    ok(`@${width} no horizontal overflow`, (await overflow(page)) <= 1);
    await shot(page, `findings-${width}-light`);
    await page.locator('[data-finding-row]').nth(1).focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(450);
    const d = await page.evaluate(() => { const el = document.querySelector('[role="dialog"]'); const b = el?.getBoundingClientRect(); return el ? { w: b.width, right: b.right, vw: innerWidth, txt: el.innerText.slice(0, 80), focus: el.contains(document.activeElement) } : null; });
    ok(`@${width} Enter opens the detail as a drawer, focus inside`, d && /明文传输/.test(d.txt) && d.focus && d.right <= d.vw + 1 && d.w <= d.vw, JSON.stringify(d));
    ok(`@${width} the drawer holds the one primary triage control`, (await count(page, '[role="dialog"] [data-triage="primary"]')) === 1 && (await count(page, '[data-triage="primary"]')) === 1);
    ok(`@${width} no horizontal overflow with the drawer open`, (await overflow(page)) <= 1);
    await shot(page, `findings-drawer-${width}-light`);
    await page.click('[role="dialog"] [data-finding-next]'); await page.waitForTimeout(250);
    ok(`@${width} next in the drawer steps to the following finding`, /匿名可访问个人资料接口/.test(await text(page, '[role="dialog"]')));
    await page.keyboard.press('Escape'); await page.waitForTimeout(450);
    ok(`@${width} Escape closes the drawer and focus returns to the table`, (await count(page, '[role="dialog"]')) === 0 && (await focusIn(page, '[data-findings-grid]')), await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 90)));
    await ctx.close();
  }
}

if (want('F11')) { group = 'F11';
  const many = Array.from({ length: 400 }, (_, i) => ({ rule_id: `G-${String(i).padStart(3, '0')}`, title: `示例发现: 批量条目 ${String(i).padStart(3, '0')}`, severity: ['critical', 'high', 'medium', 'low'][i % 4], instance_count: 1, instances: [{ id: `g${i}`, state: 'pending', severity: 'low', evidence: '' }] }));
  const { ctx, page } = await open(`${LIVE}?view=findings`, { over: grouped(() => ({ body: cards(many) })) });
  const dom = await count(page, '[data-finding-row]');
  ok('400 findings: the table is virtualised', dom > 0 && dom < 70 && /^400 条/.test(await text(page, '[data-findings-scope]')) && (await page.locator('[data-findings-grid]').getAttribute('aria-rowcount')) === '401', `${dom} rows in the DOM`);
  await page.locator('[data-finding-row]').first().focus(); await page.keyboard.press('End'); await page.waitForTimeout(350);
  ok('End reaches the last row and it holds focus', await focusIs(page, '[data-row-index="399"]'));
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowUp'); await page.waitForTimeout(200);
  ok('the focused row stays rendered while moving through the list', await focusIs(page, '[data-row-index="369"]'), await page.evaluate(() => document.activeElement?.getAttribute('data-row-index')));
  await ctx.close();
}

if (want('F12')) { group = 'F12';
  { const { ctx, page } = await open(`${LIVE}?view=findings`, { delay: 2500 });
    ok('loading: a skeleton, not an empty statement and not a count of 0', (await page.locator('[data-findings]').getAttribute('data-state')) === 'loading' && (await count(page, '[data-findings] [aria-busy="true"]')) === 1 && (await count(page, '[data-findings-scope]')) === 0);
    await ctx.close(); }
  { const { ctx, page } = await open(`${LIVE}?view=findings`, { over: grouped(() => ({ body: cards([]) })) });
    const t = await text(page, '[data-findings]');
    ok('empty: says there are none yet and offers the trace', (await page.locator('[data-findings]').getAttribute('data-state')) === 'empty' && /还没有风险发现/.test(t) && /打开 Agent 轨迹/.test(t), t.slice(0, 120));
    await shot(page, 'findings-empty-1440-light');
    await ctx.close(); }
  { const { ctx, page } = await open(`${LIVE}?view=findings`, { over: grouped(() => ({ body: cards(liveCards.filter((c) => c.severity === 'info')) })) });
    ok('everything de-noised: the empty state says so', /都被判为噪声/.test(await text(page, '[data-findings]')));
    await ctx.close(); }
  for (const status of [500, 403]) {
    let fail = false;
    const { ctx, page } = await open(`${LIVE}?view=findings`, { over: grouped(() => (fail ? { status, body: { detail: 'fixture' } } : undefined)) });
    fail = true; await page.click('[data-wb-surfacebar] button[aria-label="刷新数据"]'); await page.waitForTimeout(900);
    const strip = await text(page, '[data-findings-stale]');
    ok(`stale after a ${status}: the earlier rows stay and a strip says they may be old`, (await count(page, '[data-finding-row]')) === 7 && (await page.locator('[data-findings]').getAttribute('data-state')) === (status === 403 ? 'forbidden-stale' : 'stale') && strip.length > 0, strip);
    if (status === 403) ok('stale after a 403 is worded as a permission matter, without retry, and triage is blocked', /无权读取/.test(strip) && !RETRY.test(strip) && (await page.locator('[data-findings-pane] [data-triage-primary]').isDisabled()), strip);
    if (status === 500) await shot(page, 'findings-stale-1440-light');
    await ctx.close();
  }
  { const { ctx, page } = await open(`${LIVE}?view=findings`);
    await page.selectOption('select[aria-label="按状态筛选"]', 'confirmed'); await page.waitForTimeout(200);
    ok('a filter changes the scope statement', (await text(page, '[data-findings-scope]')) === '显示 1 / 7 条 · 2 个实例' && (await count(page, '[data-finding-row]')) === 1, await text(page, '[data-findings-scope]'));
    await page.selectOption('select[aria-label="按优先级筛选"]', 'P3'); await page.waitForTimeout(200);
    ok('filtered to nothing: says so and offers to clear the filters', /当前筛选下没有风险发现/.test(await text(page, '[data-findings-grid]')));
    await page.locator('[data-findings-grid] button', { hasText: '清除筛选' }).click(); await page.waitForTimeout(200);
    ok('clearing brings the 7 rows back', (await count(page, '[data-finding-row]')) === 7);
    await page.fill('[data-findings-toolbar] input[type="search"], [data-findings-toolbar] input', 'R-004'); await page.waitForTimeout(250);
    ok('search matches the rule id', (await titles(page)).join('|') === '示例发现: 可导出组件未设权限', (await titles(page)).join('|'));
    await page.click('[data-findings-clear]'); await page.waitForTimeout(150);
    await page.click('[data-sort="instances"]'); await page.click('[data-sort="instances"]'); await page.waitForTimeout(200);
    ok('sorting by instances, descending, puts the 3-instance finding first', (await titles(page))[0] === '示例发现: 可导出组件未设权限' && (await page.locator('[role="columnheader"][aria-sort="descending"]').count()) === 1, (await titles(page))[0]);
    await ctx.close(); }
}

if (want('F13')) { group = 'F13';
  { const { ctx, page } = await open(`${LIVE}?view=findings&finding=R-004`);
    ok('?finding= opens that finding in the pane', /可导出组件未设权限/.test(await text(page, '[data-findings-pane]')) && (await page.locator('[data-finding-row="R-004"]').getAttribute('data-current')) === 'true');
    const tabs = await page.locator('[data-findings-pane] [role="tab"]').allInnerTexts();
    ok('detail tabs: 概览, 证据, 代码, 轨迹, 修复', tabs.map((t) => t.replace(/\s*\d+$/, '').trim()).join(',') === '概览,证据,代码,轨迹,修复', tabs.join(','));
    ok('the overview shows one instance at a time, with a switch for the 3', (await count(page, '[data-findings-pane] [data-finding-instances] [role="group"] button')) === 3 && /AndroidManifest\.xml:88/.test(await text(page, '[data-findings-pane] [data-finding-instances]')));
    await page.locator('[data-findings-pane] [data-finding-instances] [role="group"] button').nth(2).click(); await page.waitForTimeout(200);
    ok('choosing the third instance shows its evidence and status', /AndroidManifest\.xml:120/.test(await text(page, '[data-findings-pane] [data-finding-instances]')) && /已排除/.test(await text(page, '[data-findings-pane] [data-finding-instances]')));
    await page.locator('[data-findings-pane] [role="tab"]', { hasText: '证据' }).click(); await page.waitForTimeout(200);
    const ev = await text(page, '[data-findings-pane] [data-finding-tab="evidence"]');
    ok('the evidence tab lists every instance with its own evidence', ['f41', 'f42', 'f43', ':88', ':102', ':120'].every((k) => ev.includes(k)), ev.slice(0, 200));
    await page.locator('[data-finding-row="R-001"]').click(); await page.waitForTimeout(250);
    ok('selecting another finding updates ?finding=', /finding=R-001/.test(await hash(page)), await hash(page));
    await ctx.close(); }
  { const { ctx, page } = await open(`${LIVE}?view=findings&finding=R-003`, { width: 1024 });
    ok('?finding= below 1280 opens the drawer', /硬编码密钥/.test(await text(page, '[role="dialog"]')));
    ok('credential detail is kept: summary, value, context, group', (await count(page, '[role="dialog"] [data-credential-summary]')) === 1 && (await count(page, '[role="dialog"] [data-credential-value]')) >= 1 && (await count(page, '[role="dialog"] [data-credential-context]')) === 1 && (await count(page, '[role="dialog"] [data-credential-group]')) === 1);
    await page.click('[role="dialog"] [data-triage-more]'); await page.waitForTimeout(200);
    ok('the triage menu opens inside the drawer', (await count(page, '[role="menu"] [data-triage-item]')) === 2);
    await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    ok('Escape with the menu open closes the menu and leaves the drawer open', (await count(page, '[role="menu"]')) === 0 && (await count(page, '[role="dialog"]')) === 1);
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    ok('a second Escape closes the drawer', (await count(page, '[role="dialog"]')) === 0);
    await ctx.close(); }
}

// ───────────────────────── Evidence ─────────────────────────

const G = '?view=graph';
if (want('E1')) { group = 'E1';
  const { ctx, page, gets } = await open(`${LIVE}${G}`);
  const m = await page.evaluate(() => ({
    mode: document.querySelector('[data-evidence="graph"]')?.getAttribute('data-ev-mode'), lanes: document.querySelectorAll('[data-ev-lane]').length,
    open: document.querySelectorAll('[data-ev-lane-toggle][aria-expanded="true"]').length, nodes: document.querySelectorAll('[data-ev-node]').length,
    edges: document.querySelectorAll('[data-evidence] svg path[data-ev-edge]').length, sum: [...document.querySelectorAll('[data-ev-lane-count]')].reduce((n, e) => n + Number(e.textContent), 0),
    previews: document.querySelectorAll('[data-ev-lane-preview]').length,
  }));
  ok('a graph of more than 40 nodes opens as a grouped overview', m.mode === 'overview' && m.lanes === 8 && m.open === 0, JSON.stringify(m));
  ok('no node and no edge is drawn until a group is opened', m.nodes === 0 && m.edges === 0 && (await count(page, '[data-ev-full], [data-ev-neighbourhood]')) === 0, JSON.stringify(m));
  ok('the groups account for every node, and each says what it holds', m.sum === 45 && m.previews === 8 && (await text(page, '[data-ev-scope]')) === '节点 45 · 关系 53', `${m.sum} / ${await text(page, '[data-ev-scope]')}`);
  ok('the relation data is read once', gets.filter((g) => /\/sessions\/41\/graph$/.test(g)).length === 1);
  ok('no horizontal overflow', (await overflow(page)) <= 1);
  await shot(page, 'evidence-overview-1440-light');
  await ctx.close();
}

if (want('E2')) { group = 'E2';
  const { ctx, page } = await open(`${LIVE}${G}`);
  await page.click('[data-ev-lane="component"] [data-ev-lane-toggle]'); await page.waitForTimeout(200);
  ok('opening a group lists its nodes, still without edges', (await count(page, '[data-ev-lane="component"] [data-ev-node]')) === 9 && (await count(page, 'svg path[data-ev-edge]')) === 0);
  await page.click('[data-ev-node="comp:PayActivity"]'); await page.waitForTimeout(300);
  const cols = await page.locator('[data-ev-col]').evaluateAll((els) => els.map((e) => e.getAttribute('data-ev-col')));
  const hop1 = await page.locator('[data-ev-neighbourhood] [data-ev-node]').evaluateAll((els) => els.map((e) => e.getAttribute('data-ev-node')));
  ok('picking a node shows it with its direct neighbours only', cols.join(',') === 'focus,hop1' && hop1.length === 5 && hop1[0] === 'comp:PayActivity', `${cols} ${hop1.join(' ')}`);
  ok('the neighbours are the 4 nodes linked to it', ['app:wallet', 'deeplink:0', 'api:POST /v1/charges', 'api:POST /v1/refunds'].every((id) => hop1.includes(id)), hop1.join(' '));
  ok('its edges are drawn', (await count(page, '[data-ev-neighbourhood] svg path[data-ev-edge]')) === 4);
  ok('the side panel inspects the picked node', (await page.locator('[data-ev-panel]').getAttribute('data-ev-panel')) === 'comp:PayActivity' && /PayActivity/.test(await text(page, '[data-ev-panel]')) && (await count(page, '[data-ev-relations] [data-ev-rel]')) === 4);
  ok('the crumb names the inspect target and offers the way back', /检查对象/.test(await text(page, '[data-ev-crumb]')) && (await count(page, '[data-ev-back]')) === 1);
  await shot(page, 'evidence-neighbourhood-1440-light');
  await page.click('[data-ev-back]'); await page.waitForTimeout(200);
  ok('返回总览 returns to the groups, the opened group still open', (await count(page, '[data-ev-lanes]')) === 1 && (await count(page, '[data-ev-lane="component"] [data-ev-node]')) === 9);
  await ctx.close();
}

if (want('E3')) { group = 'E3';
  const { ctx, page } = await open(`${LIVE}${G}`);
  await page.click('[data-ev-lane="component"] [data-ev-lane-toggle]'); await page.click('[data-ev-node="comp:PayActivity"]'); await page.waitForTimeout(300);
  await page.click('[data-ev-neighbourhood] [data-ev-node="api:POST /v1/charges"]'); await page.waitForTimeout(250);
  ok('clicking a neighbour inspects it without changing the picture', (await page.locator('[data-ev-panel]').getAttribute('data-ev-panel')) === 'api:POST /v1/charges' && (await count(page, '[data-ev-neighbourhood] [data-ev-node]')) === 5);
  const on = await page.locator('svg path[data-ev-edge="on"]').evaluateAll((els) => els.map((e) => [getComputedStyle(e).strokeWidth, getComputedStyle(e).stroke]));
  const active = await token(page, '--jz-line-active');
  ok('the edges of the selected node are 2 px in the active line colour', on.length === 1 && on.every((e) => e[0] === '2px' && e[1] === active), JSON.stringify(on));
  await page.click('[data-ev-expand]'); await page.waitForTimeout(300);
  const cols = await page.locator('[data-ev-col]').evaluateAll((els) => els.map((e) => e.getAttribute('data-ev-col')));
  const all = await page.locator('[data-ev-neighbourhood] [data-ev-node]').evaluateAll((els) => els.map((e) => e.getAttribute('data-ev-node')));
  ok('展开邻居 adds one more hop, of that neighbour only', cols.join(',') === 'focus,hop1,hop2' && ['group:支付', 'key:PAY_KEY', 'key:PAY_HOST'].every((id) => all.includes(id)) && all.length === 8, `${cols} ${all.join(' ')}`);
  await shot(page, 'evidence-expanded-1440-light');
  await page.click('[data-ev-neighbourhood] [data-ev-node="key:PAY_KEY"]'); await page.waitForTimeout(200);
  const linked = await page.locator('[data-ev-linked] [data-ev-open-finding]').evaluateAll((els) => els.map((e) => e.getAttribute('data-ev-open-finding')));
  ok('a node lists the findings linked to it', linked.join(',') === 'R-003', linked.join(','));
  await page.click('[data-ev-focus]'); await page.waitForTimeout(300);
  ok('设为检查对象 rebuilds the picture around that node', /PAY_KEY/.test(await text(page, '[data-ev-crumb]')) && (await page.locator('[data-ev-neighbourhood] [data-ev-node]').first().getAttribute('data-ev-node')) === 'key:PAY_KEY' && (await count(page, '[data-ev-col="hop2"]')) === 0);
  await ctx.close();
}

if (want('E5')) { group = 'E5';
  for (const theme of ['light', 'dark']) {
    const { ctx, page } = await open(`${LIVE}${G}`, { theme });
    await page.click('[data-ev-lane="finding"] [data-ev-lane-toggle]'); await page.waitForTimeout(150);
    const orange = await token(page, '--jz-line-finding'); const red = await token(page, '--jz-red');
    const rows = await page.locator('[data-ev-lane="finding"] [data-ev-node]').evaluateAll((els) => els.map((e) => [getComputedStyle(e).borderLeftColor, getComputedStyle(e).borderLeftWidth]));
    ok(`${theme}: finding nodes carry the orange line, 3 px or 2 px by severity`, rows.length === 7 && rows.every((r) => r[0] === orange) && rows.filter((r) => r[1] === '3px').length === 3 && rows.filter((r) => r[1] === '2px').length === 4, JSON.stringify(rows));
    await page.click('[data-ev-node="finding:R-001"]'); await page.waitForTimeout(300);
    const m = await page.evaluate((red) => {
      const els = [...document.querySelectorAll('[data-evidence="graph"] *')];
      return { dim: els.filter((n) => { const c = getComputedStyle(n); return Number(c.opacity) < 1 || Number(c.strokeOpacity) < 1 || Number(c.fillOpacity) < 1; }).filter((n) => !n.closest('button:disabled')).map((n) => n.tagName + '.' + String(n.className?.baseVal ?? n.className).slice(0, 40)),
        red: els.filter((n) => { const c = getComputedStyle(n); return [c.color, c.backgroundColor, c.borderLeftColor, c.stroke, c.fill].includes(red); }).length };
    }, red);
    ok(`${theme}: nothing in the graph is dimmed by opacity`, m.dim.length === 0, m.dim.slice(0, 5).join(' '));
    ok(`${theme}: nothing in the graph is red`, m.red === 0, m.red);
    if (theme === 'dark') await shot(page, 'evidence-neighbourhood-1440-dark');
    await ctx.close();
  }
}

if (want('E6')) { group = 'E6';
  const { ctx, page } = await open(`${LIVE}${G}`);
  ok('the full layout is not drawn on arrival', (await count(page, '[data-ev-full]')) === 0);
  await page.click('[data-ev-view="full"]'); await page.waitForTimeout(400);
  const n = await count(page, '[data-ev-full] [data-ev-node]');
  ok('完整布局 draws it on request, with a note that it is dense', (await count(page, '[data-ev-full]')) === 1 && n === 45 && /可能很密/.test(await text(page, '[data-evidence="graph"]')), `${n} nodes`);
  ok('the page still does not overflow: the canvas scrolls inside its pane', (await overflow(page)) <= 1);
  await page.click('[data-ev-full] [data-ev-node="comp:SyncService"]'); await page.waitForTimeout(200);
  ok('a node of the full layout is inspected in the same side panel', (await page.locator('[data-ev-panel]').getAttribute('data-ev-panel')) === 'comp:SyncService' && (await count(page, 'svg path[data-ev-edge="on"]')) >= 1);
  await shot(page, 'evidence-full-1440-light');
  await page.click('[data-ev-view="list"]'); await page.waitForTimeout(250);
  ok('the list is one click away and keeps the selection', (await count(page, '[data-ev-list] [data-ev-row]')) === 45 && (await page.locator('[data-ev-row="comp:SyncService"]').getAttribute('aria-pressed')) === 'true' && (await page.locator('[data-ev-panel]').getAttribute('data-ev-panel')) === 'comp:SyncService');
  await shot(page, 'evidence-list-1440-light');
  await page.fill('[data-ev-toolbar] input', 'pay.example.com'); await page.waitForTimeout(250);
  ok('search narrows the list and the scope statement says so', /^显示 \d+ \/ 节点 45/.test(await text(page, '[data-ev-scope]')) && (await count(page, '[data-ev-row]')) < 45 && (await count(page, '[data-ev-row]')) > 0, await text(page, '[data-ev-scope]'));
  await page.fill('[data-ev-toolbar] input', ''); await page.click('[data-ev-types]'); await page.waitForTimeout(200);
  await page.locator('[data-ev-types-menu] label', { hasText: '接口组' }).first().click(); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok('the type filter hides a type', (await count(page, '[data-ev-row]')) === 42 && /隐藏 1/.test(await text(page, '[data-ev-types]')), `${await count(page, '[data-ev-row]')} rows`);
  await ctx.close();
}

if (want('E8')) { group = 'E8';
  for (const width of [1024, 760, 390]) {
    const { ctx, page } = await open(`${LIVE}${G}`, { width });
    ok(`@${width} the list is the default view`, (await page.locator('[data-evidence="graph"]').getAttribute('data-ev-mode')) === 'list' && (await count(page, '[data-ev-list] [data-ev-row]')) === 45);
    if (width === 390) ok('@390 only the list is offered, and the page says so', (await count(page, '[data-ev-view]')) === 0 && /只提供列表视图/.test(await text(page, '[data-ev-listonly]')));
    else ok(`@${width} the overview and the full layout stay one click away`, (await count(page, '[data-ev-view]')) === 3);
    ok(`@${width} no side panel until something is selected`, (await count(page, '[data-ev-side]')) === 0);
    ok(`@${width} no horizontal overflow`, (await overflow(page)) <= 1);
    await shot(page, `evidence-${width}-light`);
    await page.click('[data-ev-row="comp:WebHostActivity"]'); await page.waitForTimeout(300);
    const g = await page.evaluate(() => { const l = document.querySelector('[data-ev-list]').getBoundingClientRect(); const s = document.querySelector('[data-ev-side]')?.getBoundingClientRect(); return s ? { l: [l.left, l.top, l.right, l.bottom].map(Math.round), s: [s.left, s.top, s.right, s.bottom].map(Math.round), vw: innerWidth } : null; });
    if (width > 760) ok(`@${width} the selection opens beside the list`, g && g.s[0] >= g.l[2] - 1 && g.s[2] <= g.vw + 1, JSON.stringify(g));
    else ok(`@${width} stacked: the selection opens under the list, full width`, g && g.s[1] >= g.l[3] - 1 && g.s[2] - g.s[0] >= g.vw - 2 && g.l[3] - g.l[1] > 120, JSON.stringify(g));
    ok(`@${width} the panel lists its linked finding and relations`, (await count(page, '[data-ev-linked] [data-ev-open-finding]')) === 1 && (await count(page, '[data-ev-relations] [data-ev-rel]')) === 4);
    ok(`@${width} no horizontal overflow with the panel open`, (await overflow(page)) <= 1);
    await shot(page, `evidence-selected-${width}-light`);
    if (width === 760) {
      await page.click('[data-ev-view="overview"]'); await page.waitForTimeout(300);
      const s = await page.evaluate(() => { const a = document.querySelector('[data-ev-neighbourhood], [data-ev-overview]')?.getBoundingClientRect(); const b = document.querySelector('[data-ev-side]')?.getBoundingClientRect(); return a && b ? [Math.round(a.bottom), Math.round(b.top), Math.round(b.width), innerWidth] : null; });
      ok('@760 the graph and the panel are stacked too', s && s[1] >= s[0] - 1 && s[2] >= s[3] - 2 && (await overflow(page)) <= 1, JSON.stringify(s));
      await shot(page, 'evidence-stacked-760-light');
    }
    await ctx.close();
  }
}

if (want('E9')) { group = 'E9';
  const { ctx, page } = await open(`${LIVE}${G}`);
  await page.click('[data-ev-lane="finding"] [data-ev-lane-toggle]'); await page.click('[data-ev-node="finding:R-007"]'); await page.waitForTimeout(300);
  ok('a finding node keeps its P level and status in the panel', /P1/.test(await text(page, '[data-ev-panel]')) && /待复核/.test(await text(page, '[data-ev-panel]')), (await text(page, '[data-ev-panel]')).slice(0, 120));
  await page.locator('[data-ev-panel] button', { hasText: '打开风险发现' }).first().click(); await page.waitForTimeout(700);
  ok('打开风险发现 goes to the findings surface with that finding open', /view=findings/.test(await hash(page)) && /finding=R-007/.test(await hash(page)) && /匿名可访问个人资料接口/.test(await text(page, '[data-findings-pane]')), await hash(page));
  ok('findings and evidence stay separate surfaces: no graph in the findings tab', (await count(page, '[data-evidence="graph"], [data-evidence="coverage"]')) === 0 && (await count(page, '[data-findings]')) === 1);
  await ctx.close();
}

if (want('E10')) { group = 'E10';
  const { ctx, page } = await open(`${LIVE}?view=coverage`);
  ok('the coverage matrix is a table of evidence types by priority', (await count(page, '[data-coverage-table] [data-coverage-row]')) === 5 && (await count(page, '[data-ev-target]')) === 0);
  await page.locator('[data-coverage-row="traffic"] button').first().click(); await page.waitForTimeout(250);
  const list = await page.locator('[data-coverage-detail] [data-cov-list="have"] [data-cov-finding]').evaluateAll((els) => els.map((e) => e.getAttribute('data-cov-finding')));
  ok('a row opens the findings behind its number, and the ones that lack this evidence', list.length === 2 && list.includes('R-001') && list.includes('R-007') && (await count(page, '[data-coverage-detail] [data-cov-list="lack"] [data-cov-finding]')) === 5, list.join(','));
  await page.click('[data-cov-list="have"] [data-cov-finding="R-001"]'); await page.waitForTimeout(250);
  ok('picking one makes it the inspect target, shown above the matrix with its evidence', /明文传输/.test(await text(page, '[data-ev-target]')) && (await count(page, '[data-coverage-target] [data-target-evidence]')) >= 1, await text(page, '[data-ev-target]'));
  await shot(page, 'evidence-coverage-target-1440-light');
  await page.click('[data-wb-sub="graph"], [data-wb-sub="relations"], [data-wb-sub]:has-text("证据关系")'); await page.waitForTimeout(600);
  ok('the selection is shared: 证据关系 opens on that finding and its neighbours', /view=graph/.test(await hash(page)) && /明文传输/.test(await text(page, '[data-ev-crumb]')) && (await page.locator('[data-ev-panel]').getAttribute('data-ev-panel')) === 'finding:R-001', (await hash(page)) + ' ' + (await text(page, '[data-ev-crumb]')));
  const nb = await page.locator('[data-ev-neighbourhood] [data-ev-node]').evaluateAll((els) => els.map((e) => e.getAttribute('data-ev-node')));
  ok('its neighbours are the two interfaces it was observed on', nb.includes('api:GET /api/v1/profile') && nb.includes('api:GET /api/v1/orders') && nb.length === 3, nb.join(' '));
  await page.click('[data-ev-neighbourhood] [data-ev-node="api:GET /api/v1/profile"]'); await page.click('[data-ev-focus]'); await page.waitForTimeout(250);
  await page.click('[data-wb-sub]:has-text("覆盖矩阵")'); await page.waitForTimeout(500);
  ok('and back: the node inspected in the graph is the target above the matrix', /GET \/api\/v1\/profile/.test(await text(page, '[data-ev-target]')), await text(page, '[data-ev-target]'));
  for (const [seg, label] of [['facts', '事实图谱'], ['structure', '应用结构']]) {
    await page.click('[data-wb-sub]:has-text("证据关系")'); await page.waitForTimeout(300); await page.click(`[data-wb-seg="${seg}"]`); await page.waitForTimeout(700);
    ok(`${label} shows the same target`, new RegExp(`view=${seg}`).test(await hash(page)) && /GET \/api\/v1\/profile/.test(await text(page, '[data-ev-target]')), await hash(page));
  }
  await page.locator('[data-ev-target] button', { hasText: '清除' }).click(); await page.waitForTimeout(200);
  ok('清除 removes the target', (await count(page, '[data-ev-target]')) === 0);
  await ctx.close();
}

if (want('E11')) { group = 'E11';
  const reasons = (page) => page.locator('[data-coverage-row]').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-coverage-row'), [e.getAttribute('data-reason'), e.querySelector('[data-coverage-reason]')?.textContent.trim() || '']])));
  const status = (body) => (m, u) => (m === 'GET' && /\/sessions\/41\/autopilot\/status$/.test(u.pathname) ? body : undefined);
  const ph = (id, name, st, done, total) => ({ phase: id, name, status: st, steps: Array.from({ length: total }, (_, k) => ({ id: `${id}-${k}`, name: `步骤 ${k + 1}`, state: k < done ? 'ok' : st === 'running' && k === done ? 'running' : 'pending' })) });
  { const { ctx, page } = await open(`${LIVE}?view=coverage`);
    const r = await reasons(page);
    ok('running: dynamic evidence says the dynamic stages are still running, with the step count', r.traffic[0] === 'running' && /动态阶段还在进行（\d+\/\d+ 步）/.test(r.traffic[1]) && r.runtime[0] === 'running', JSON.stringify(r.traffic));
    ok('running: static evidence says the static check is done and what the text lacks', r.code[0] === 'collected' && /静态检查已完成/.test(r.code[1]) && /^3 条没有这类证据/.test(r.code[1]), r.code[1]);
    ok('every reason starts from a count of findings', ['code', 'config', 'traffic', 'runtime'].every((k) => /^\d+ 条没有这类证据：/.test(r[k][1])) && /^1 条的证据文本里识别不出类型/.test(r.unknown[1]), JSON.stringify(Object.values(r).map((x) => x[1].slice(0, 12))));
    const scope = await text(page, '[data-coverage-scope]');
    ok('the scope statement says what is counted', /6\s*\/\s*7 条/.test(scope) && /风险发现的条数/.test(await text(page, '[data-coverage]')), scope);
    await shot(page, 'evidence-coverage-1440-light');
    await ctx.close(); }
  { const { ctx, page } = await open(`${LIVE}?view=coverage`, { over: (m, u) => (m === 'GET' && /\/api\/pentest\/devices$/.test(u.pathname) ? { body: [{ serial: 'emulator-5554', model: 'Pixel 6', online: false }] } : undefined) });
    const r = await reasons(page);
    ok('device offline: dynamic evidence names the device and says it is offline', r.traffic[0] === 'device-offline' && /emulator-5554 离线/.test(r.traffic[1]) && r.runtime[0] === 'device-offline' && r.code[0] === 'collected', r.traffic[1]);
    await shot(page, 'evidence-coverage-device-offline-1440-light');
    await ctx.close(); }
  { const { ctx, page } = await open(`${LIVE}?view=coverage`, { over: status({ body: { state: 'waiting_login', status: 'waiting_login', current: 'LOGIN', phases: [ph('P0', '范围', 'done', 2, 2), ph('P1', '静态', 'done', 4, 4), ph('LOGIN', '登录', 'running', 0, 1), ph('P2', '权限', 'pending', 0, 6)] } }) });
    const r = await reasons(page);
    ok('waiting for login: says the run waits for a manual login', r.traffic[0] === 'waiting-login' && /等待人工登录/.test(r.traffic[1]), JSON.stringify(r.traffic));
    await ctx.close(); }
  { const { ctx, page } = await open(`${LIVE}?view=coverage`, { over: status({ body: { state: 'completed', status: 'completed', phases: [ph('P0', '范围', 'done', 2, 2), ph('P1', '静态', 'done', 4, 4), ph('P5', '报告', 'done', 1, 1)] } }) });
    const r = await reasons(page);
    ok('static-only run: dynamic evidence is out of scope', r.traffic[0] === 'out-of-scope' && /不在范围内/.test(r.traffic[1]), JSON.stringify(r.traffic));
    await ctx.close(); }
  { const { ctx, page } = await open(`${LIVE}?view=coverage`, { over: status({ body: { state: 'paused', status: 'paused', current: 'P1', phases: [ph('P0', '范围', 'done', 2, 2), ph('P1', '静态', 'running', 2, 4), ph('P2', '权限', 'pending', 0, 6), ph('P3', '会话', 'pending', 0, 4)] } }) });
    const r = await reasons(page);
    ok('dynamic stages not started: says there has been no dynamic run', r.traffic[0] === 'not-run' && /还没有动态运行/.test(r.traffic[1]), JSON.stringify(r.traffic));
    await ctx.close(); }
  { const { ctx, page } = await open(`${LIVE}?view=coverage`, { over: status({ status: 403, body: { detail: 'fixture: forbidden' } }) });
    const r = await reasons(page);
    ok('run status refused (403): the reason says it cannot be judged, as a permission matter, without retry', r.traffic[0] === 'unknown' && /无权读取运行状态/.test(r.traffic[1]) && !RETRY.test(r.traffic[1]), JSON.stringify(r.traffic));
    await ctx.close(); }
  { const { ctx, page } = await open(`${LIVE}?view=coverage`, { over: (m, u) => (m === 'GET' && /\/sessions\/41\/autopilot\/status$/.test(u.pathname) ? { body: { state: 'running', status: 'running', phases: [] } } : m === 'GET' && /\/sessions\/41\/timeline$/.test(u.pathname) ? { body: { steps: [] } } : undefined) });
    const r = await reasons(page);
    ok('a run that reports no stages: the reason says it cannot be judged, not that nothing ran', r.traffic[0] === 'unknown' && /没有阶段信息/.test(r.traffic[1]) && r.code[0] === 'unknown', JSON.stringify(r.traffic));
    await ctx.close(); }
  { const { ctx, page } = await open(`${IDLE}?view=coverage`);
    const t = await text(page, '[data-evidence="coverage"]');
    ok('session not started: the matrix says no assessment has run', /还没有运行过评估|还没有动态运行/.test(t) && (await overflow(page)) <= 1, t.slice(0, 200));
    await ctx.close(); }
  for (const width of [1024, 760, 390]) {
    const { ctx, page } = await open(`${LIVE}?view=coverage`, { width });
    const vis = await page.locator('[data-coverage-reason]').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0 && e.textContent.trim().length > 10).length);
    ok(`@${width} every row still shows its reason, and nothing overflows`, vis === 5 && (await overflow(page)) <= 1, `${vis} reasons`);
    await shot(page, `evidence-coverage-${width}-light`);
    await ctx.close();
  }
}

if (want('E12')) { group = 'E12';
  const probes = { facts: ['fact-graph', '事实图谱'], credentials: ['credentials', '凭据'], clusters: ['vulns/clusters', '聚类'] };
  for (const [view, [ep, label]] of Object.entries(probes)) {
    { const { ctx, page } = await open(`${LIVE}?view=${view}`);
      const t = await text(page, '.wb-surface');
      ok(`${label} keeps ?view=${view} and shows its content`, new RegExp(`view=${view}`).test(await hash(page)) && t.length > 40 && !/没有权限/.test(t) && (await overflow(page)) <= 1, t.slice(0, 80));
      await shot(page, `evidence-${view}-1440-light`);
      await ctx.close(); }
    { const { ctx, page } = await open(`${LIVE}?view=${view}`, { over: (m, u) => (m === 'GET' && u.pathname.endsWith(`/sessions/41/${ep}`) ? { status: 403, body: { detail: 'fixture: forbidden' } } : undefined) });
      const t = await text(page, '.wb-surface');
      ok(`${label}: a 403 is a permission state without retry`, /没有权限读取/.test(t) && !RETRY.test(t) && (await count(page, '.wb-surface [data-state="forbidden"]')) >= 1, t.slice(0, 160));
      await ctx.close(); }
    { const { ctx, page } = await open(`${LIVE}?view=${view}`, { over: (m, u) => (m === 'GET' && u.pathname.endsWith(`/sessions/41/${ep}`) ? { status: 500, body: { detail: 'fixture failure' } } : undefined) });
      const t = await text(page, '.wb-surface');
      ok(`${label}: a 500 is an error with retry`, (await count(page, '.wb-surface [data-state="error"]')) >= 1 && /重试/.test(t), t.slice(0, 160));
      await ctx.close(); }
  }
  { const { ctx, page } = await open(`${LIVE}?view=structure`);
    ok('应用结构 keeps ?view=structure and renders its canvas', /view=structure/.test(await hash(page)) && (await count(page, '[data-evidence="structure"] .wb-tool-body')) === 1 && (await overflow(page)) <= 1);
    await ctx.close(); }
  { const { ctx, page } = await open(`${LIVE}?view=rulecards`);
    ok('规则卡 keeps ?view=rulecards', /view=rulecards/.test(await hash(page)) && (await text(page, '.wb-surface')).length > 20 && (await overflow(page)) <= 1);
    await ctx.close(); }
  { const { ctx, page } = await open(`${LIVE}?view=credentials`);
    const subs = await page.locator('[data-wb-sub]').allInnerTexts();
    ok('evidence keeps its three secondary tabs and the three segments of 证据关系', subs.map((s) => s.trim()).join(',') === '证据关系,凭据,覆盖矩阵', subs.join(','));
    await page.click('[data-wb-sub]:has-text("证据关系")'); await page.waitForTimeout(500);
    const segs = await page.locator('[data-wb-seg]').allInnerTexts();
    ok('segments of 证据关系: 关系图, 事实图谱, 应用结构', segs.map((s) => s.trim()).join(',') === '关系图,事实图谱,应用结构', segs.join(','));
    await ctx.close(); }
}

if (want('E13')) { group = 'E13';
  const graphOf = (fn) => (m, u) => (m === 'GET' && /\/sessions\/41\/graph$/.test(u.pathname) ? fn() : undefined);
  { const { ctx, page } = await open(`${LIVE}${G}`, { delay: 2500 });
    ok('loading: a skeleton', (await page.locator('[data-evidence="graph"]').getAttribute('data-state')) === 'loading' && (await count(page, '[data-evidence="graph"] [aria-busy="true"]')) === 1);
    await ctx.close(); }
  { const { ctx, page } = await open(`${LIVE}${G}`, { over: graphOf(() => ({ status: 403, body: { detail: 'fixture: forbidden' } })) });
    const t = await text(page, '[data-evidence="graph"]');
    ok('403: a permission state, no retry wording, no node count', (await page.locator('[data-evidence="graph"]').getAttribute('data-state')) === 'forbidden' && (await count(page, '[data-evidence="graph"] [data-state="permission"]')) === 1 && !RETRY.test(t) && (await count(page, '[data-ev-scope]')) === 0, t.slice(0, 160));
    await shot(page, 'evidence-forbidden-1440-light');
    await ctx.close(); }
  { let fail = true;
    const { ctx, page } = await open(`${LIVE}${G}`, { over: graphOf(() => (fail ? { status: 500, body: { detail: 'fixture failure' } } : undefined)) });
    ok('500: an error state with retry', (await page.locator('[data-evidence="graph"]').getAttribute('data-state')) === 'error' && (await count(page, '[data-evidence="graph"] [data-state="error"] button')) >= 1);
    fail = false; await page.locator('[data-evidence="graph"] [data-state="error"] button', { hasText: '重试' }).click(); await page.waitForTimeout(800);
    ok('retry reads the graph', (await count(page, '[data-ev-lane]')) === 8);
    fail = true; await page.click('[data-ev-reload]'); await page.waitForTimeout(800);
    ok('a failed re-read keeps the graph and says it may be old', (await page.locator('[data-evidence="graph"]').getAttribute('data-state')) === 'stale' && (await count(page, '[data-ev-lane]')) === 8 && /可能不是最新/.test(await text(page, '[data-ev-stale]')));
    await shot(page, 'evidence-stale-1440-light');
    await ctx.close(); }
  { const { ctx, page } = await open(`${IDLE}${G}`, { over: (m, u) => (m === 'GET' && /\/sessions\/40\/vulns\/grouped$/.test(u.pathname) ? { body: cards([]) } : undefined) });
    const t = await text(page, '[data-evidence="graph"]');
    ok('empty: says the graph is empty and why', (await page.locator('[data-evidence="graph"]').getAttribute('data-state')) === 'empty' && /关系图还是空的/.test(t), t.slice(0, 120));
    await ctx.close(); }
}

if (want('E14')) { group = 'E14';
  const g = liveGraph(); const keep = new Set(g.nodes.filter((n) => ['app', 'component', 'deeplink', 'key'].includes(n.type)).map((n) => n.id));
  const small = { status: 'ok', nodes: g.nodes.filter((n) => keep.has(n.id)), edges: g.edges.filter((e) => keep.has(e.from) && keep.has(e.to)) };
  const { ctx, page } = await open(`${LIVE}${G}`, { over: (m, u) => (m === 'GET' && /\/sessions\/41\/graph$/.test(u.pathname) ? { body: small } : m === 'GET' && /\/sessions\/41\/vulns\/grouped$/.test(u.pathname) ? { body: cards([]) } : undefined) });
  const m = await page.evaluate(() => ({ open: document.querySelectorAll('[data-ev-lane-toggle][aria-expanded="true"]').length, lanes: document.querySelectorAll('[data-ev-lane]').length, nodes: document.querySelectorAll('[data-ev-node]').length }));
  ok('a graph of 40 nodes or fewer opens with its groups unfolded', m.lanes === 4 && m.open === 4 && m.nodes === small.nodes.length, JSON.stringify(m));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
if (pageErrors.length) console.log('page errors:\n  ' + pageErrors.join('\n  '));
if (out) fs.writeFileSync(path.join(out, 'report.findings-evidence.json'), JSON.stringify({ total: results.length, failed: failed.length, pageErrors, results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} findings and evidence checks passed (fixtures)${pageErrors.length ? `, ${pageErrors.length} page errors` : ''}`);
process.exit(failed.length || pageErrors.length ? 1 : 0);
