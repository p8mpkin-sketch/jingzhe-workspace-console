#!/usr/bin/env node
// Dev-only check of the agent stream reconnect policy (fixtures, against vite preview):
//  1. a server that keeps closing: gaps grow (about 1, 2, 4, 8 s with jitter) and never exceed 30 s;
//  2. hidden tab: no reconnect while hidden, one reconnect when shown again;
//  3. after a connection that delivers a new event, the cursor is kept (since_seq) and the delay starts over.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { resolve as fixture } from './fixtures/api.mjs';
const base = process.env.BASE || 'http://localhost:4173/v2/';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem('token', 'fixture-token'); });
const p = await ctx.newPage();
const hits = []; let mode = 'close';
await p.route('**/api/**', async (r) => {
  const u = new URL(r.request().url());
  if (/\/api\/agent\/sessions\/[^/]+\/events$/.test(u.pathname)) {
    hits.push({ t: Date.now(), since: u.searchParams.get('since_seq'), mode });
    if (mode === 'event') { mode = 'close'; return r.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: {"seq": 7, "type": "note", "data": {}}\n\n' }); }
    return r.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
  }
  if (/\/stream$|send_stream$/.test(u.pathname)) return r.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
  const body = fixture(r.request().method(), u);
  return r.fulfill({ status: 200, contentType: typeof body === 'string' ? 'text/plain' : 'application/json', body: typeof body === 'string' ? body : JSON.stringify(body) });
});
const gaps = (from = 0) => hits.slice(from).map((h, i, a) => (i ? +((h.t - a[i - 1].t) / 1000).toFixed(1) : null)).filter((x) => x != null);
await p.goto(base + '#/agent');
await p.waitForTimeout(34000);
const closing = gaps();
// hidden tab
const setHidden = (v) => p.evaluate((v) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => v }); document.dispatchEvent(new Event('visibilitychange')); }, v);
await setHidden(true);
await p.waitForTimeout(34000); // long enough for any pending timer to fire while hidden
const n1 = hits.length;
await p.waitForTimeout(20000);
const whileHidden = hits.length - n1;
await setHidden(false); await p.waitForTimeout(1500);
const onShow = hits.length - n1;
// progress resets the delay and keeps the cursor
mode = 'event';
const n2 = hits.length;
await p.waitForTimeout(40000);
const after = hits.slice(n2);
const eventAt = after.findIndex((h) => h.mode === 'event');
const afterEvent = after.slice(eventAt);
const out = {
  closingServerGapsSeconds: closing, maxGap: Math.max(...closing),
  hidden: { reconnectsWhileHidden: whileHidden, reconnectsOnShow: onShow },
  afterProgress: { sinceSeqOnNextConnect: afterEvent[1]?.since, firstGapSeconds: afterEvent[1] ? +((afterEvent[1].t - afterEvent[0].t) / 1000).toFixed(1) : null },
};
const ok = closing.every((g, i) => i === 0 || g <= 31) && closing.at(-1) > closing[0] && whileHidden === 0 && onShow === 1 && out.afterProgress.sinceSeqOnNextConnect === '7' && out.afterProgress.firstGapSeconds <= 1.3;
console.log(JSON.stringify({ ok, ...out }, null, 1));
await b.close();
process.exit(ok ? 0 : 1);
