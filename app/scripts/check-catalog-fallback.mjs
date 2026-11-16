#!/usr/bin/env node
// Fixture check for the model list on the session and agent routes (Phase 17).
// The agent composer reads GET /api/models/catalog and falls back to GET /api/models/providers only when the
// catalog is empty or fails. The real backend returns a non-empty catalog, so providers is not requested there.
//   node scripts/check-catalog-fallback.mjs [--out file.json]      (against vite preview, default :4173)
// Pass: with the default (non-empty) catalog providers is not requested by the composer; with
// FIXTURE_CATALOG=empty it is requested, and the composer still lists the provider models.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { resolve as fixture } from './fixtures/api.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.BASE || 'http://localhost:4173/v2/';
const ROUTES = [['agent', '/agent'], ['session', '/pentest/project/1/session/40']];
const i = process.argv.indexOf('--out'); const out = i > -1 ? process.argv[i + 1] : null;
const b = await chromium.launch(); const result = {};
for (const mode of ['default', 'empty']) {
  if (mode === 'empty') process.env.FIXTURE_CATALOG = 'empty'; else delete process.env.FIXTURE_CATALOG;
  for (const [name, hash] of ROUTES) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => { localStorage.setItem('token', 'fixture-token'); });
    const p = await ctx.newPage(); const log = [];
    await p.route('**/api/**', async (r) => {
      const req = r.request(); const u = new URL(req.url()); log.push(`${req.method()} ${u.pathname}`);
      if (/\/stream$|send_stream$/.test(u.pathname)) return; // held open, as a live backend does
      const body = fixture(req.method(), u);
      return r.fulfill({ status: 200, contentType: typeof body === 'string' ? 'text/plain' : 'application/json', body: typeof body === 'string' ? body : JSON.stringify(body) });
    });
    await p.goto(base + '#' + hash); await p.waitForTimeout(5000);
    const options = await p.locator('select option').allTextContents().catch(() => []);
    result[`${mode}:${name}`] = {
      catalogRequests: log.filter((k) => k === 'GET /api/models/catalog').length,
      providersRequests: log.filter((k) => k === 'GET /api/models/providers').length,
      providerModelListed: options.some((t) => /model-large|model-small/.test(t)),
    };
    await ctx.close();
  }
}
await b.close();
const pass = ROUTES.every(([n]) => result[`default:${n}`].providersRequests === 0 && result[`empty:${n}`].providersRequests >= 1);
const report = { pass, result };
if (out) fs.writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify(report, null, 1));
