#!/usr/bin/env node
// Dev-only: screenshots of shell overlays (mobile drawer, notifications, account menu, device popover, command
// palette, collapsed rail) against `npx vite preview --port 4173`, on the same fixtures as capture.mjs.
// Usage: node scripts/capture-shell.mjs --out ../docs/screenshots/phase-3
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
import { resolve as fixture } from './fixtures/api.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:4173/v2/');
const out = path.resolve(arg('out', '.ui-shots'));
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const problems = [];

async function open(theme, width, height = 900, stored = true) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
  await ctx.addInitScript(([t, s]) => { try { if (s) localStorage.setItem('apksec-theme', t); localStorage.setItem('token', 'fixture-token'); } catch {} }, [theme, stored]);
  const page = await ctx.newPage();
  await page.route('**/api/**', (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (/\/stream$|send_stream$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture(req.method(), url)) });
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(base + '#/tasks'); await page.waitForTimeout(1200);
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: path.join(out, `shell-${name}.png`) });
const expect = (ok, msg) => { if (!ok) problems.push(msg); };

for (const theme of ['light', 'dark']) {
  // Mobile drawer: opens from the top bar, traps focus, closes on Escape and on navigation.
  { const { ctx, page } = await open(theme, 760);
    expect(await page.locator('[data-nav-rail]').count() === 0, 'rail must not render inline at 760');
    await page.click('[data-nav-open]'); await page.waitForTimeout(300);
    expect(await page.locator('[data-nav-drawer] [data-nav-rail="full"]').count() === 1, 'drawer did not open');
    await shot(page, `drawer-760-${theme}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    expect(await page.locator('[data-nav-drawer]').count() === 0, 'Escape did not close the drawer');
    await page.click('[data-nav-open]'); await page.click('[data-nav-item="/reports"]'); await page.waitForTimeout(400);
    expect(page.url().endsWith('#/reports') && await page.locator('[data-nav-drawer]').count() === 0, 'drawer navigation failed');
    await page.click('[data-notif-toggle]'); await page.waitForTimeout(200); await shot(page, `notifications-760-${theme}`);
    await ctx.close(); }
  // Phone: the top bar keeps the place and the primary action; the drawer fits the viewport.
  { const { ctx, page } = await open(theme, 390, 844);
    expect(await page.locator('[data-topbar-action]').isVisible(), 'primary action missing from the phone top bar');
    const tb = await page.evaluate(() => { const d = document.documentElement; return d.scrollWidth - d.clientWidth; });
    expect(tb <= 1, `top bar overflows at 390 by ${tb}px`);
    await page.click('[data-nav-open]'); await page.waitForTimeout(300);
    const dw = await page.locator('[data-nav-drawer] [data-nav-rail]').evaluate((el) => el.getBoundingClientRect().right);
    expect(dw <= 390, `drawer is wider than the phone viewport (${dw}px)`);
    await shot(page, `drawer-390-${theme}`);
    await ctx.close(); }
  // Tablet: rail starts collapsed below 1024 and expands on demand.
  { const { ctx, page } = await open(theme, 900);
    expect(await page.locator('[data-nav-rail="collapsed"]').count() === 1, 'rail not collapsed at 900');
    await shot(page, `rail-collapsed-900-${theme}`);
    await page.click('[data-nav-collapse]'); await page.waitForTimeout(350);
    expect(await page.locator('[data-nav-rail="full"]').count() === 1, 'rail did not expand at 900');
    await ctx.close(); }
  // Desktop overlays.
  { const { ctx, page } = await open(theme, 1440);
    const w = await page.locator('[data-nav-rail]').evaluate((el) => el.getBoundingClientRect().width);
    const h = await page.locator('[data-topbar]').evaluate((el) => el.getBoundingClientRect().height);
    expect(w === 220 && h === 48, `rail ${w}px / top bar ${h}px, expected 220 / 48`);
    await page.click('[data-nav-collapse]'); await page.waitForTimeout(350);
    const wc = await page.locator('[data-nav-rail]').evaluate((el) => el.getBoundingClientRect().width);
    expect(wc === 56, `collapsed rail ${wc}px, expected 56`);
    await page.click('[data-nav-collapse]'); await page.waitForTimeout(350);
    await page.click('[data-notif-toggle]'); await page.waitForTimeout(200); await shot(page, `notifications-1440-${theme}`);
    await page.keyboard.press('Escape');
    await page.click('[data-user-menu] button'); await page.waitForTimeout(200); await shot(page, `account-1440-${theme}`);
    await page.keyboard.press('Escape');
    await page.click('[data-sidebar-devices]'); await page.waitForTimeout(200);
    const box = await page.locator('[data-device-flyout]').boundingBox();
    expect(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 1440 && box.y + box.height <= 900, 'rail device popover leaves the viewport');
    await shot(page, `devices-rail-1440-${theme}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    // V3: the top bar carries no device, queue or session facts, and the rail entries show state words, not counts.
    expect(await page.locator('[data-topbar] [data-capsule-device], [data-topbar] [data-capsule-session], [data-topbar] [data-pf-badge]').count() === 0, 'top bar still shows session or device pills');
    const infra = await page.locator('[data-rail-infra]').innerText();
    expect(!/\d/.test(infra), `rail infrastructure entries show a number: ${JSON.stringify(infra)}`);
    expect(await page.locator('[data-nav-rail] [data-nav-item]').count() === 8, 'rail must hold the primary action and seven destinations');
    await page.click('[data-cmdk-open]'); await page.waitForTimeout(250);
    expect(await page.locator('[data-cmdk]').count() === 1, 'top bar command button did not open the palette');
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-cmdk-open')), 'Escape did not return focus to the command button');
    await page.keyboard.press('Control+k'); await page.waitForTimeout(250); await shot(page, `palette-1440-${theme}`);
    await page.keyboard.type('报告'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    expect(page.url().endsWith('#/reports'), 'palette Enter did not navigate');
    // Keyboard: first Tab stop is the skip link, every stop shows a focus indicator.
    await page.reload(); await page.waitForTimeout(1000);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.textContent?.includes('跳到主要内容')), 'skip link is not the first tab stop');
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => { const el = document.activeElement; if (!el || el === document.body) return 'body'; const s = getComputedStyle(el); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2 ? 'ok' : (el.getAttribute('data-nav-item') || el.getAttribute('aria-label') || el.tagName); });
      if (ring !== 'ok') problems.push(`no focus ring on tab stop ${i + 1}: ${ring}`);
    }
    await ctx.close(); }
}
// Theme: no stored choice follows the system; a stored choice wins; toggling stores it.
for (const sys of ['light', 'dark']) {
  const { ctx, page } = await open(sys, 1200, 800, false);
  const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  expect(dark === (sys === 'dark'), `system ${sys} not followed on first visit`);
  expect(await page.evaluate(() => localStorage.getItem('apksec-theme')) === null, 'theme stored without a user choice');
  await page.click('[data-theme-toggle]');
  expect(await page.evaluate(() => localStorage.getItem('apksec-theme')) === (sys === 'dark' ? 'light' : 'dark'), 'toggle did not store the choice');
  await ctx.close();
}
{ const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, colorScheme: 'light' });
  await ctx.addInitScript(() => { localStorage.setItem('apksec-theme', 'dark'); localStorage.setItem('token', 'fixture-token'); });
  const page = await ctx.newPage(); await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(base + '#/system'); await page.waitForTimeout(600);
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'stored dark did not win over system light');
  await ctx.close(); }
await browser.close();
console.log(problems.length ? 'PROBLEMS\n' + problems.join('\n') : 'shell checks passed');
process.exit(problems.length ? 1 : 0);
