#!/usr/bin/env node
// Dev-only request cadence check: opens every route for DUR ms (default 65 s) and reports, per route, the
// requests repeated during the first 3 s (duplicates) and every request that repeats (polling, with gaps).
//   node scripts/check-polling.mjs > out.json                 fixtures (default, against vite preview)
//   BASE=https://host/v2/ REAL=1 TOKEN=... node scripts/check-polling.mjs   a real backend, no fixtures
// Fixture caveat: the fixture answers every SSE endpoint with an empty body, so EventSource and the agent
// stream reconnect every 1-3 s here; against a live backend those streams stay open.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { resolve as fixture } from './fixtures/api.mjs';
const REAL = process.env.REAL === '1';
const ROUTES = [['dashboard','/dashboard'],['projects','/pentest'],['project-sessions','/pentest/project/1'],['session','/pentest/project/1/session/40'],['company','/company'],['company-project','/company/projects/1'],['new-assessment','/new-audit'],['tasks','/tasks'],['reports','/reports'],['discovery','/discovery'],['knowledge','/skills'],['assistant','/ai-assistant'],['agent','/agent'],['system','/system']];
const DUR = +(process.env.DUR || 65000);
const b = await chromium.launch();
const out = {};
await Promise.all(ROUTES.map(async ([name, route]) => {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => { localStorage.setItem('token', t); }, process.env.TOKEN || 'fixture-token');
  const p = await ctx.newPage(); const t0 = Date.now(); const log = [];
  await p.route('**/api/**', async (r) => { const req = r.request(); const u = new URL(req.url()); log.push([Date.now() - t0, req.method() + ' ' + u.pathname + u.search]);
    if (REAL) return r.continue();
    if (/\/stream$|send_stream$/.test(u.pathname)) return r.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    const body = fixture(req.method(), u); return r.fulfill({ status: 200, contentType: typeof body === 'string' ? 'text/plain' : 'application/json', body: typeof body === 'string' ? body : JSON.stringify(body) }); });
  await p.goto((process.env.BASE || 'http://localhost:4173/v2/') + '#' + route); await p.waitForTimeout(DUR);
  const by = {}; for (const [t, k] of log) (by[k] ||= []).push(t);
  const initialDup = Object.entries(by).filter(([, ts]) => ts.filter((t) => t < 3000).length > 1).map(([k, ts]) => `${k} x${ts.filter((t) => t < 3000).length}`);
  const polls = Object.entries(by).filter(([, ts]) => ts.length > 1).map(([k, ts]) => { const gaps = ts.slice(1).map((t, i) => Math.round((t - ts[i]) / 1000)); return `${k} n=${ts.length} gaps(s)=${[...new Set(gaps)].join(',')}`; });
  out[route] = { total: log.length, initialDuplicates: initialDup, repeating: polls };
  await ctx.close();
}));
await b.close();
console.log(JSON.stringify(out, null, 1));
