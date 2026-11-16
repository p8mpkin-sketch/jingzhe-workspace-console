#!/usr/bin/env node
// Phase 17: the legacy workbenches are retired. Old links (?ui=v3, ?ui=v2, ?ui=v4) must open the six-tab workbench,
// drop the ui parameter, keep the other query parameters, and leave no way back into a legacy shell.
//   node scripts/check-legacy-retired.mjs        (against vite preview, default :4173, fixtures)
import { createRequire } from 'node:module';
import { resolve as fixture } from './fixtures/api.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.BASE || 'http://localhost:4173/v2/';
const b = await chromium.launch(); const out = {};
for (const ui of ['v3', 'v2', 'v4']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { localStorage.setItem('token', 'fixture-token'); localStorage.setItem('apksec-ui-v3', '1'); });
  const p = await ctx.newPage(); const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.route('**/api/**', async (r) => { const u = new URL(r.request().url()); if (/\/stream$/.test(u.pathname)) return; const body = fixture(r.request().method(), u); return r.fulfill({ status: 200, contentType: typeof body === 'string' ? 'text/plain' : 'application/json', body: typeof body === 'string' ? body : JSON.stringify(body) }); });
  await p.goto(`${base}#/pentest/project/1/session/40?ui=${ui}&view=findings`); await p.waitForTimeout(2500);
  const hash = new URL(p.url()).hash;
  out[ui] = { hash, workbench: (await p.locator('[data-wb-root]').count()) > 0, legacyShell: (await p.locator('[data-legacy-workbench]').count()) > 0,
    legacyEntry: (await p.locator('[data-wb-legacy]').count()) > 0, uiParamDropped: !/[?&]ui=/.test(hash), viewKept: /[?&]view=findings/.test(hash),
    v3FlagCleared: await p.evaluate(() => localStorage.getItem('apksec-ui-v3') === null), pageErrors: errors };
  await ctx.close();
}
await b.close();
const pass = Object.values(out).every((r) => r.workbench && !r.legacyShell && !r.legacyEntry && r.uiParamDropped && r.viewKept && r.v3FlagCleared && !r.pageErrors.length);
console.log(JSON.stringify({ pass, out }, null, 1)); process.exit(pass ? 0 : 1);
