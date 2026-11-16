#!/usr/bin/env node
// Assessment workbench audit against a running build (`npx vite preview --port 4173`), answered from fixtures.
// Checks every work surface of the six-tab shell at 1440 / 1024 / 760 in both themes:
//   - every `?view=` deep link resolves to its own surface, and every surface is reachable by clicking
//     primary tab → secondary tab → segment (no orphan panel, no duplicate owner);
//   (widths: 1440 / 1024 / 760 / 390)
//   - no horizontal overflow of the document, the surface bar or the main column, with and without the inspector;
//   - keyboard focus: every tab stop shows a focus indicator and is not covered by another element;
//   - variants: empty / error / forbidden / slow / stale never reach the error boundary.
// Usage: node scripts/check-workbench.mjs --out ../docs/screenshots/phase-14/workbench [--shots 1] [--base URL]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
import { resolve as fixture } from './fixtures/api.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:4173/v2/');
const out = path.resolve(arg('out', '.ui-shots/workbench'));
const shots = arg('shots', '1') === '1';
const SESSION = '/pentest/project/1/session/40';
const WIDTHS = [1440, 1024, 760, 390];
const THEMES = ['light', 'dark'];
const VARIANTS = ['empty', 'error', 'forbidden', 'slow', 'stale'];
// [name, query, expected data-wb-tab, expected data-wb-view]
const SURFACES = [
  ['overview', 'view=overview', 'overview'],
  ['runtime-trace', '', 'runtime', 'stream'],
  ['runtime-trace-steps', 'view=stream&tab=trajectory', 'runtime', 'stream'],
  ['runtime-trace-reasoning', 'view=ai', 'runtime'],
  ['runtime-terminal', 'view=raw', 'runtime'],
  ['runtime-requests-api', 'view=apitree', 'runtime'],
  ['runtime-requests-proxy', 'view=burp', 'runtime'],
  ['findings', 'view=findings', 'findings'],
  ['findings-shadow', 'view=shadow', 'findings'],
  ['findings-rulecards', 'view=rulecards', 'findings'],
  ['findings-clusters', 'view=clusters', 'findings'],
  ['evidence-graph', 'view=graph', 'evidence'],
  ['evidence-facts', 'view=facts', 'evidence'],
  ['evidence-structure', 'view=structure', 'evidence'],
  ['evidence-credentials', 'view=credentials', 'evidence'],
  ['evidence-coverage', 'view=coverage', 'evidence'],
  ['artifacts-output', 'view=artifacts', 'artifacts'],
  ['artifacts-packaging', 'view=packer', 'artifacts'],
  ['report', 'view=report', 'report'],
  ['report-diff', 'view=diff', 'report'],
].map(([name, q, tab, view]) => ({ name, q, tab, view: view || q.replace('view=', '') }));

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const report = { surfaces: SURFACES.length, overflow: [], errors: [], navigation: {}, focus: { checked: 0, noRing: [], occluded: [] }, variants: {} };

async function open(theme, width, variant = 'ok') {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.setItem('apksec-theme', t); localStorage.setItem('token', 'fixture-token'); } catch {} }, theme);
  const page = await ctx.newPage();
  const state = { failing: false };
  await page.route('**/api/**', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (/\/stream$|send_stream$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    const isMe = url.pathname === '/api/me';
    if (((variant === 'stale' && state.failing) || variant === 'error') && !isMe) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"fixture: internal error"}' });
    if (variant === 'forbidden' && !isMe) return route.fulfill({ status: 403, contentType: 'application/json', body: '{"detail":"fixture: forbidden"}' });
    if (variant === 'slow' && !isMe) return;
    let body = fixture(req.method(), url);
    if (typeof body === 'string') return route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: variant === 'empty' ? '' : body });
    if (variant === 'empty' && !isMe && req.method() === 'GET') body = Array.isArray(body) ? [] : Object.fromEntries(Object.entries(body).map(([k, v]) => [k, Array.isArray(v) ? [] : typeof v === 'number' ? 0 : v]));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  page.on('pageerror', (e) => report.errors.push(`${page.url().split('#')[1]} :: ${e.message}`));
  return { ctx, page, state };
}
const url = (q) => `${base}#${SESSION}${q ? '?' + q : ''}`;
const measure = (page) => page.evaluate(() => {
  const d = document.documentElement; const vw = window.innerWidth;
  const over = (sel) => { const e = document.querySelector(sel); return e ? Math.max(0, Math.round(e.getBoundingClientRect().right - vw)) : 0; };
  const bar = document.querySelector('[data-wb-surfacebar]');
  return {
    doc: d.scrollWidth - d.clientWidth, main: over('.wb-main'), bar: bar ? bar.scrollWidth - bar.clientWidth : 0, inspector: over('[data-wb-inspector]'),
    tab: document.querySelector('[data-wb-tab][aria-current="page"]')?.getAttribute('data-wb-tab') || null,
    view: document.querySelector('[data-wb-view]')?.getAttribute('data-wb-view') || null,
    boundary: !!document.querySelector('[data-error-boundary]') || /Something went wrong/.test(document.body.innerText.slice(0, 400)),
    root: !!document.querySelector('[data-wb-root]'),
  };
});
const flag = (m, where) => {
  if (m.doc > 1 || m.main > 1 || m.bar > 1 || m.inspector > 1) report.overflow.push({ where, doc: m.doc, main: m.main, bar: m.bar, inspector: m.inspector });
  if (m.boundary) report.errors.push(`${where}: error boundary rendered`);
  if (!m.root) report.errors.push(`${where}: workbench did not mount`);
};

// 1. Every surface, by deep link, at every width and theme; then with the inspector open.
for (const theme of THEMES) for (const w of WIDTHS) {
  const { ctx, page } = await open(theme, w);
  for (const s of SURFACES) {
    await page.goto(url(s.q)); await page.waitForTimeout(900);
    const m = await measure(page); const where = `${s.name} @${w} ${theme}`;
    flag(m, where);
    if (m.tab !== s.tab || m.view !== s.view) report.errors.push(`${where}: expected ${s.tab}/${s.view}, got ${m.tab}/${m.view}`);
    if (shots) await page.screenshot({ path: path.join(out, `${s.name}-${w}-${theme}.png`) });
    if (['runtime-trace', 'findings', 'evidence-graph', 'artifacts-output'].includes(s.name)) {
      await page.click('[data-wb-inspector-toggle]'); await page.waitForTimeout(250);
      flag(await measure(page), `${where} + inspector`);
      if (shots && theme === 'light') await page.screenshot({ path: path.join(out, `${s.name}.inspector-${w}-${theme}.png`) });
      await page.keyboard.press('Escape');
    }
  }
  await ctx.close();
}

// 2. Navigation: click through tabs, secondary tabs and segments; every surface must be reached exactly once.
{
  const { ctx, page } = await open('light', 1440);
  await page.goto(url('')); await page.waitForTimeout(1200);
  const reached = [];
  const tabs = await page.$$eval('[data-wb-tab]', (els) => els.map((e) => e.getAttribute('data-wb-tab')));
  for (const t of tabs) {
    await page.click(`[data-wb-tab="${t}"]`); await page.waitForTimeout(200);
    const subs = await page.$$eval('[data-wb-sub]', (els) => els.map((e) => e.getAttribute('data-wb-sub')));
    for (const sub of subs.length ? subs : [null]) {
      if (sub) { await page.click(`[data-wb-sub="${sub}"]`); await page.waitForTimeout(200); }
      const segs = await page.$$eval('[data-wb-seg]', (els) => els.map((e) => e.getAttribute('data-wb-seg')));
      for (const seg of segs.length ? segs : [null]) {
        if (seg) { await page.click(`[data-wb-seg="${seg}"]`); await page.waitForTimeout(200); }
        const q = await page.evaluate(() => { const p = new URLSearchParams(location.hash.split('?')[1] || ''); return `${p.get('view')}${p.get('tab') === 'trajectory' ? '+trajectory' : ''}`; });
        reached.push(`${t}/${sub || '-'}/${seg || '-'} → ${q}`);
      }
    }
  }
  const targets = reached.map((r) => r.split(' → ')[1]);
  report.navigation = {
    primaryTabs: tabs, reached,
    duplicates: targets.filter((v, i) => targets.indexOf(v) !== i),
    missing: SURFACES.map((s) => s.view + (s.q.includes('trajectory') ? '+trajectory' : '')).filter((v) => !targets.includes(v)),
    legacyEntryRetired: (await page.locator('[data-wb-legacy]').count()) === 0, // Phase 17: legacy workbenches retired
  };
  if (report.navigation.duplicates.length || report.navigation.missing.length || !report.navigation.legacyEntryRetired) report.errors.push('navigation: ' + JSON.stringify({ d: report.navigation.duplicates, m: report.navigation.missing, legacyRetired: report.navigation.legacyEntryRetired }));
  await ctx.close();
}

// 3. Keyboard focus: visible indicator, and the focused control is the top element at its own centre.
for (const w of WIDTHS) {
  const { ctx, page } = await open('light', w);
  for (const s of SURFACES) {
    await page.goto(url(s.q)); await page.waitForTimeout(700);
    const seen = new Set();
    for (let i = 0; i < 70; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => {
        const e = document.activeElement; if (!e || e === document.body || !e.closest('[data-wb-root]')) return null;
        const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return null;
        const ring = (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none') || (cs.boxShadow && cs.boxShadow !== 'none');
        const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
        const top = document.elementFromPoint(x, y);
        const inView = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
        return { k: `${e.tagName}|${(e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || '').trim().slice(0, 24)}|${Math.round(r.top)}|${Math.round(r.left)}`, ring, covered: !inView || !(top && (e.contains(top) || top.contains(e))) };
      });
      if (!f || seen.has(f.k)) continue;
      seen.add(f.k); report.focus.checked++;
      if (!f.ring) report.focus.noRing.push(`${s.name} @${w} ${f.k}`);
      if (f.covered) report.focus.occluded.push(`${s.name} @${w} ${f.k}`);
    }
  }
  await ctx.close();
}

// 4. Data states on the surfaces that load data.
for (const variant of VARIANTS) {
  report.variants[variant] = {};
  for (const w of WIDTHS) {
    const { ctx, page, state } = await open('light', w, variant);
    for (const s of SURFACES) {
      await page.goto(url(s.q)); await page.waitForTimeout(variant === 'slow' ? 600 : 900);
      if (variant === 'stale') { state.failing = true; await page.click('[data-wb-root] [aria-label="刷新数据"]').catch(() => {}); await page.waitForTimeout(900); }
      const m = await measure(page); flag(m, `${s.name}.${variant} @${w}`);
      // A surface is blank when it shows neither text nor a loading skeleton.
      const { text, nodes } = await page.evaluate(() => { const el = document.querySelector('.wb-surface'); return { text: (el?.innerText || '').replace(/\s+/g, ' ').trim(), nodes: el ? el.querySelectorAll('*').length : 0 }; });
      const blank = text.length < 6 && nodes < 4;
      if (w === 1440) report.variants[variant][s.name] = blank ? 'BLANK' : text.length < 6 ? '(loading skeleton)' : text.slice(0, 90);
      if (blank) report.errors.push(`${s.name}.${variant} @${w}: blank surface`);
      if (shots && w === 1440) await page.screenshot({ path: path.join(out, `${s.name}.${variant}-${w}-light.png`) });
      state.failing = false;
    }
    await ctx.close();
  }
}

await browser.close();
report.errors = [...new Set(report.errors)];
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`workbench: ${SURFACES.length} surfaces × ${WIDTHS.length} widths × ${THEMES.length} themes → ${out}`);
console.log(`overflow: ${report.overflow.length}  errors: ${report.errors.length}  focus: ${report.focus.checked} checked, ${report.focus.noRing.length} without indicator, ${report.focus.occluded.length} covered`);
for (const o of report.overflow.slice(0, 30)) console.log('  overflow', JSON.stringify(o));
for (const e of report.errors.slice(0, 40)) console.log('  error', e);
for (const e of report.focus.noRing.slice(0, 15)) console.log('  no-ring', e);
for (const e of report.focus.occluded.slice(0, 15)) console.log('  covered', e);
process.exit(report.overflow.length || report.errors.length ? 1 : 0);
