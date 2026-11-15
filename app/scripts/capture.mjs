#!/usr/bin/env node
// Dev-only screenshot + overflow + request-log capture against a running build
// (`npm run build && npx vite preview --port 4173`). API calls are answered from
// scripts/fixtures (no backend in this repo). Usage:
//   node scripts/capture.mjs --out ../docs/screenshots/phase-1 [--theme dark|light|both]
//        [--widths 1440,1024,760] [--routes /dashboard,/tasks] [--variant ok|empty|error|forbidden|slow|stale]
//        [--base http://localhost:4173/v2/] [--requests out.json]
import { createRequire } from 'node:module';
// Playwright is resolved from the environment (global install), not from app dependencies.
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
import { resolve as fixture } from './fixtures/api.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:4173/v2/');
const out = path.resolve(arg('out', '.ui-shots'));
const widths = arg('widths', '1440,1024,760').split(',').map(Number);
const overflowWidths = [760, 1024, 1280, 1440, 1680];
const themeArg = arg('theme', 'both');
const themes = themeArg === 'both' ? ['light', 'dark'] : [themeArg];
const variant = arg('variant', 'ok');
const reqOut = arg('requests', '');
export const ROUTES = [
  ['dashboard', '/dashboard'], ['projects', '/pentest'], ['project-sessions', '/pentest/project/1'],
  ['session', '/pentest/project/1/session/40'], ['company', '/company'], ['company-project', '/company/projects/1'],
  ['new-assessment', '/new-audit'], ['tasks', '/tasks'], ['reports', '/reports'], ['discovery', '/discovery'],
  ['knowledge', '/skills'], ['assistant', '/ai-assistant'], ['agent', '/agent'], ['system', '/system'],
];
const only = arg('routes', '');
const routes = only ? ROUTES.filter(([, p]) => only.split(',').includes(p)) : ROUTES;

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const report = { overflow: [], errors: [], requests: {} };

async function open(theme, width, height = 900, login = true) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: theme });
  await ctx.addInitScript(([t, l]) => {
    try { localStorage.setItem('apksec-theme', t); if (l) localStorage.setItem('token', 'fixture-token'); } catch {}
  }, [theme, login]);
  const page = await ctx.newPage();
  const log = [];
  const state = { failing: false }; // stale variant: loads normally, then every later request fails
  await page.route('**/api/**', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    log.push(`${req.method()} ${url.pathname}${url.search}${req.postData() ? ' ' + req.postData() : ''}`);
    if (/\/stream$|send_stream$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    const isMe = url.pathname === '/api/me';
    if (variant === 'stale' && state.failing && !isMe) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"fixture: refresh failed"}' });
    if (variant === 'error' && !isMe) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"fixture: internal error"}' });
    if (variant === 'forbidden' && !isMe) return route.fulfill({ status: 403, contentType: 'application/json', body: '{"detail":"fixture: forbidden"}' });
    if (variant === 'slow' && !isMe) return; // never answered: page stays in its loading state
    let body = fixture(req.method(), url);
    if (typeof body === 'string') return route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: variant === 'empty' ? '' : body });
    if (variant === 'empty' && !isMe && req.method() === 'GET') body = Array.isArray(body) ? [] : Object.fromEntries(Object.entries(body).map(([k, v]) => [k, Array.isArray(v) ? [] : typeof v === 'number' ? 0 : v]));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  page.on('pageerror', (e) => report.errors.push(`${page.url()} :: ${e.message}`));
  return { ctx, page, log, state };
}

async function settle(page) { await page.waitForTimeout(variant === 'slow' ? 800 : 1500); }

for (const theme of themes) {
  // sign-in gate
  for (const w of widths) {
    const { ctx, page } = await open(theme, w, 900, false);
    await page.goto(base + '#/dashboard'); await settle(page);
    if (variant === 'ok') await page.screenshot({ path: path.join(out, `login-${w}-${theme}.png`) });
    await ctx.close();
  }
  for (const [name, route] of routes) {
    for (const w of [...new Set([...widths, ...(variant === 'ok' && theme === themes[0] ? overflowWidths : [])])]) {
      const { ctx, page, log, state } = await open(theme, w);
      await page.goto(base + '#' + route); await settle(page);
      if (variant === 'stale') {
        // Data is on screen; now the backend fails and the page's own refresh control is used once.
        state.failing = true;
        // Prefer the page header's refresh control (button named 刷新…), then any other visible one.
        const named = page.locator('main').getByRole('button', { name: /^刷新/ });
        const refresh = (await page.locator('main header').getByRole('button', { name: /^刷新/ }).count())
          ? page.locator('main header').getByRole('button', { name: /^刷新/ }).first() : named.first();
        const failText = () => page.evaluate(() => (document.body.innerText.match(/失败/g) || []).length);
        const failBefore = await failText();
        const hasRefresh = (await refresh.count()) > 0;
        if (hasRefresh) await refresh.click().catch(() => {});
        await page.waitForTimeout(1500);
        const r = await page.evaluate(() => ({
          notice: !!document.querySelector('[data-state="stale"]') || /刷新失败|可能不是最新|最近一次刷新未成功|未加载/.test(document.body.innerText),
        }));
        r.toast = (await failText()) > failBefore;
        report.stale = report.stale || {};
        report.stale[`${route} @${w}`] = !hasRefresh ? 'no page refresh control' : r.notice ? 'stale notice' : r.toast ? 'failure toast / alert' : 'no feedback';
      }
      const ov = await page.evaluate(() => {
        const d = document.documentElement; const m = document.querySelector('main');
        return { doc: d.scrollWidth - d.clientWidth, main: m ? m.scrollWidth - m.clientWidth : 0,
          boundary: !!document.querySelector('[data-error-boundary]') || /出错|Something went wrong/.test(document.body.innerText.slice(0, 400)) };
      });
      if (ov.doc > 1 || ov.main > 1) report.overflow.push({ route, width: w, theme, ...ov });
      if (ov.boundary) report.errors.push(`${route} @${w} ${theme}: error boundary rendered`);
      if (widths.includes(w)) await page.screenshot({ path: path.join(out, `${name}${variant === 'ok' ? '' : '.' + variant}-${w}-${theme}.png`) });
      if (w === 1440 && theme === themes[0]) report.requests[route] = [...new Set(log)].sort();
      await ctx.close();
    }
  }
}
await browser.close();
if (reqOut) fs.writeFileSync(reqOut, JSON.stringify(report.requests, null, 2) + '\n');
fs.writeFileSync(path.join(out, `report${variant === 'ok' ? '' : '.' + variant}.json`), JSON.stringify({ overflow: report.overflow, errors: [...new Set(report.errors)], ...(report.stale ? { stale: report.stale } : {}) }, null, 2) + '\n');
console.log(`shots → ${out}\noverflow: ${report.overflow.length}  errors: ${new Set(report.errors).size}`);
for (const o of report.overflow) console.log('  overflow', JSON.stringify(o));
for (const e of new Set(report.errors)) console.log('  error', e);
