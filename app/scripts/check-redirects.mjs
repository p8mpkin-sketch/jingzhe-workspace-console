#!/usr/bin/env node
// Dev-only: every pre-V3 path must land on its canonical route with the query string intact.
// Needs `npx vite preview --port 4173`. Usage: node scripts/check-redirects.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { resolve as fixture } from './fixtures/api.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:4173/v2/');
// [old, expected]. Parameters are compared as sets, so their order does not matter.
const CASES = [
  ['/company', '/projects?scope=company'],
  ['/company?scope=single', '/projects?scope=single'],
  ['/company/projects/1', '/projects/1'],
  ['/company/projects/1?tab=apps', '/projects/1?tab=apps'],
  ['/pentest/project/1/session/40', '/projects/1/sessions/40'],
  ['/pentest/project/1/session/40?view=findings&finding=7', '/projects/1/sessions/40?view=findings&finding=7'],
  ['/pentest/project/1/session/40?tab=vulns&masvs=MASVS-NETWORK-1', '/projects/1/sessions/40?tab=vulns&masvs=MASVS-NETWORK-1'],
  ['/pentest/project/0/session/40', '/projects/0/sessions/40'],
  ['/new-audit', '/new-assessment'],
  ['/skills', '/knowledge'],
  ['/skills?tab=review', '/knowledge?tab=review'],
  ['/discovery', '/evidence'],
  ['/tasks?status=degraded', '/tasks?status=done&partial=1'],
  ['/tasks?status=degraded&focus=101', '/tasks?status=done&partial=1&focus=101'],
  // Unchanged paths keep their deep links.
  ['/tasks?status=failed', '/tasks?status=failed'],
  ['/tasks?focus=101', '/tasks?focus=101'],
  ['/reports?taskId=100', '/reports?taskId=100'],
  // The report page consumes ?sid=&cmp= itself (it resolves the session to its task), so only the path is asserted.
  ['/reports?sid=40&cmp=41', '/reports'],
  ['/agent', '/agent'],
  ['/system', '/system'],
  ['/ai-assistant', '/ai-assistant'],
  ['/no-such-route', '/dashboard'],
  // Merged into the project domain in V3 Phase 2.
  ['/pentest', '/projects'],
  ['/pentest?scope=single', '/projects?scope=single'],
  ['/pentest/project/1', '/projects/1?tab=runs'],
  ['/pentest/project/1?tab=overview&from=notice', '/projects/1?tab=overview&from=notice'],
  ['/company?q=alpha', '/projects?scope=company&q=alpha'],
  ['/company/projects/1?tab=runs', '/projects/1?tab=runs'],
];
const norm = (hash) => { const [p, q = ''] = hash.replace(/^#/, '').split('?'); return p + '?' + [...new URLSearchParams(q)].map(([k, v]) => `${k}=${v}`).sort().join('&'); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => { try { localStorage.setItem('token', 'fixture-token'); } catch {} });
let bad = 0;
for (const [from, to] of CASES) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (/\/stream$|send_stream$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    const body = fixture(req.method(), url);
    return route.fulfill(typeof body === 'string' ? { status: 200, contentType: 'text/plain; charset=utf-8', body } : { status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(base + '#' + from); await page.waitForTimeout(900);
  const got = new URL(page.url()).hash;
  // Pages may add their own defaults to the query string after landing; every expected parameter must be present.
  const want = norm('#' + to); const have = norm(got);
  const [wp, wq] = want.split('?'); const [hp, hq] = have.split('?');
  const ok = wp === hp && wq.split('&').filter(Boolean).every((kv) => hq.split('&').includes(kv)) && !errors.length;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${from.padEnd(62)} → ${got.replace(/^#/, '')}${errors.length ? '  pageerror: ' + errors[0] : ''}${ok ? '' : `   (expected ${to})`}`);
  await page.close();
}
await browser.close();
console.log(bad ? `${bad} redirect(s) failed` : `all ${CASES.length} redirects land on their canonical route`);
process.exit(bad ? 1 : 0);
