#!/usr/bin/env node
// Real-backend READ audit. Opens the 14 routes for 65 s each and the 20 workbench surfaces, against a
// production preview build that proxies /api to the real backend. No fixtures are involved.
//
//   cd app && npm run build && npx vite preview --port 4173 --strictPort      (one terminal)
//   JZ_TOKEN_FILE=~/.jz-token node scripts/real-read-audit.mjs --out ../docs/screenshots/phase-16/real-read.json
//
// Environment:
//   JZ_TOKEN or JZ_TOKEN_FILE   session token (file must be mode 600). Never printed or saved.
//   BASE                        preview URL, default http://localhost:4173/v2/
//   JZ_PID, JZ_SID              project and session to open; discovered from the API when not set
//   JZ_COMPANY_PID              company project id; defaults to JZ_PID
//   DUR                         ms per route, default 65000.  VIEW_DUR  ms per workbench surface, default 6000
//   JZ_MATRIX_SIDS              comma-separated session ids whose auth_matrix is read directly (Phase 17 regression
//                               check); default: the audited session plus 260 (the session that returned 500)
//   --cadence <file>            also write the polling / stream cadence of every route and surface to <file>
//
// HOLD_STREAMS does not apply here: the real backend holds every SSE connection open, so nothing is simulated.
//
// The audit is read-only: any request that is not a GET is aborted before it leaves the browser and is
// reported as a violation. Streams are held open by the real backend, so nothing is simulated.
// Exit code: 0 clean, 1 duplicates / failed requests / write attempts found, 2 could not run.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readToken, redactor, normalise, call, arg, fail } from './real-common.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const token = readToken();
const redact = redactor(token);
const base = process.env.BASE || 'http://localhost:4173/v2/';
const out = arg('out', 'real-read.json');
const DUR = +(process.env.DUR || 65000);
const VIEW_DUR = +(process.env.VIEW_DUR || 6000);

// 1. Reachability and ids.
const me = await call(token, 'GET', '/api/me').catch((e) => ({ status: 0, text: String(e.message || e) }));
if (me.status !== 200) fail(`GET /api/me through ${base} returned ${me.status || 'no response'} (${redact(me.text || '')}). Backend not reachable or token rejected; nothing was audited.`);
let pid = process.env.JZ_PID, sid = process.env.JZ_SID;
if (!pid || !sid) {
  const sessions = await call(token, 'GET', '/api/pentest/sessions');
  const rows = Array.isArray(sessions.json) ? sessions.json : sessions.json?.items || sessions.json?.sessions || [];
  const pick = rows.find((s) => String(s.id) === String(sid)) || rows.filter((s) => !pid || String(s.project_id) === String(pid)).sort((a, b) => b.id - a.id)[0];
  if (!pick) fail('No session found. Set JZ_PID and JZ_SID.');
  sid = sid || pick.id; pid = pid || pick.project_id || pick.pid;
}
if (!pid) {
  const one = await call(token, 'GET', `/api/pentest/sessions/${sid}`);
  pid = one.json?.project_id ?? one.json?.pid;
  if (!pid) fail(`Session ${sid} does not say which project it belongs to. Set JZ_PID.`);
}
const cpid = process.env.JZ_COMPANY_PID || pid;

const ROUTES = [
  ['/dashboard', '/dashboard'], ['/pentest', '/pentest'], ['/pentest/project/{id}', `/pentest/project/${pid}`],
  ['/pentest/project/{id}/session/{id}', `/pentest/project/${pid}/session/${sid}`], ['/company', '/company'],
  ['/company/projects/{id}', `/company/projects/${cpid}`], ['/new-audit', '/new-audit'], ['/tasks', '/tasks'],
  ['/reports', '/reports'], ['/discovery', '/discovery'], ['/skills', '/skills'], ['/ai-assistant', '/ai-assistant'],
  ['/agent', '/agent'], ['/system', '/system'],
];
const VIEWS = ['overview', 'stream', 'stream&tab=trajectory', 'ai', 'raw', 'apitree', 'burp', 'findings', 'shadow', 'rulecards',
  'clusters', 'graph', 'facts', 'structure', 'credentials', 'coverage', 'artifacts', 'packer', 'report', 'diff'];

const browser = await chromium.launch();
async function visit(hash, ms) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => { localStorage.setItem('token', t); }, token);
  const page = await ctx.newPage(); const t0 = Date.now();
  const log = []; const writes = []; const failed = []; const consoleErrors = []; const pageErrors = [];
  await page.route('**/api/**', async (r) => {
    const req = r.request(); const u = new URL(req.url()); const key = redact(`${req.method()} ${u.pathname}${u.search}`);
    if (req.method() !== 'GET') { writes.push(key); return r.abort(); }
    log.push([Date.now() - t0, key]); return r.continue();
  });
  page.on('response', (res) => { const u = new URL(res.url()); if (u.pathname.startsWith('/api/') && res.status() >= 400) failed.push(redact(`${res.status()} ${res.request().method()} ${u.pathname}${u.search}`)); });
  page.on('requestfailed', (req) => { const u = new URL(req.url()); if (!u.pathname.startsWith('/api/')) failed.push(redact(`asset failed ${u.pathname}`)); });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(redact(m.text()).slice(0, 200)); });
  page.on('pageerror', (e) => pageErrors.push(redact(e.message).slice(0, 200)));
  await page.goto(base + '#' + hash); await page.waitForTimeout(ms);
  const by = {}; for (const [t, k] of log) (by[k] ||= []).push(t);
  const isStream = (k) => /\/stream(\?|$)/.test(k.split(' ')[1]);
  const result = {
    total: log.length,
    unique: Object.keys(by).sort(),
    initialDuplicates: Object.entries(by).filter(([, ts]) => ts.filter((t) => t < 3000).length > 1).map(([k, ts]) => `${k} x${ts.filter((t) => t < 3000).length}`),
    polling: Object.entries(by).filter(([k, ts]) => ts.length > 1 && !isStream(k)).map(([k, ts]) => `${k} n=${ts.length} gaps(s)=${[...new Set(ts.slice(1).map((t, i) => Math.round((t - ts[i]) / 1000)))].join(',')}`),
    streams: Object.entries(by).filter(([k]) => isStream(k)).map(([k, ts]) => `${k} connections=${ts.length}${ts.length > 1 ? ` reconnect gaps(s)=${ts.slice(1).map((t, i) => Math.round((t - ts[i]) / 1000)).join(',')}` : ''}`),
    writeAttemptsBlocked: writes, failed: [...new Set(failed)], consoleErrors: [...new Set(consoleErrors)], pageErrors,
  };
  await ctx.close();
  return result;
}

const report = {
  kind: 'real-backend read audit', startedAt: new Date().toISOString(), base, durationMsPerRoute: DUR, durationMsPerView: VIEW_DUR,
  ids: { project: +pid, session: +sid, companyProject: +cpid }, routes: {}, views: {}, baseline: {}, checks: {},
};

// 2. Routes, in parallel (as check-polling does).
await Promise.all(ROUTES.map(async ([name, hash]) => { report.routes[name] = await visit(hash, DUR); }));
// 3. Workbench surfaces, one after another.
for (const v of VIEWS) report.views[v] = await visit(`/pentest/project/${pid}/session/${sid}?view=${v}`, VIEW_DUR);
await browser.close();

// 4. Compare the unique request set with the fixture baseline, ids normalised. Per-session rows
//    (one request per listed session) collapse to one pattern on both sides.
const baselineFile = new URL('./fixtures/requests-baseline.json', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
for (const [route, list] of Object.entries(fixture)) {
  const name = normalise(route);
  const real = report.routes[name]; if (!real) continue;
  const a = new Set(list.map(normalise)), b = new Set(real.unique.map(normalise));
  report.baseline[name] = { missingOnReal: [...a].filter((x) => !b.has(x)), extraOnReal: [...b].filter((x) => !a.has(x)) };
}

// 5. Named checks from the Phase 16 brief.
const all = { ...report.routes, ...Object.fromEntries(Object.entries(report.views).map(([k, v]) => ['view=' + k, v])) };
const sys = report.routes['/system'];
const feedback = sys.unique.filter((k) => k.startsWith('GET /api/feedback'));
const fbCount = sys.initialDuplicates.find((d) => d.startsWith('GET /api/feedback'));
report.checks = {
  feedbackReads: { requests: feedback, duplicated: !!fbCount, pass: feedback.length === 1 && !fbCount },
  tasksVariants: { note: 'different query strings are separate keys and are never merged', keys: [...new Set(Object.values(report.routes).flatMap((r) => r.unique.filter((k) => /^GET \/api\/tasks(\?|$)/.test(k))))] },
  duplicateDataRequests: Object.entries(all).flatMap(([n, r]) => r.initialDuplicates.filter((d) => !/\/stream\?/.test(d)).map((d) => `${n}: ${d}`)),
  duplicateStreamConnections: Object.entries(all).flatMap(([n, r]) => r.initialDuplicates.filter((d) => /\/stream\?/.test(d)).map((d) => `${n}: ${d}`)),
  writeAttempts: Object.entries(all).flatMap(([n, r]) => r.writeAttemptsBlocked.map((d) => `${n}: ${d}`)),
  failedRequests: Object.entries(all).flatMap(([n, r]) => r.failed.map((d) => `${n}: ${d}`)),
  pageErrors: Object.entries(all).flatMap(([n, r]) => r.pageErrors.map((d) => `${n}: ${d}`)),
  consoleErrors: Object.entries(all).flatMap(([n, r]) => r.consoleErrors.map((d) => `${n}: ${d}`)),
  baselineDifferences: Object.entries(report.baseline).filter(([, d]) => d.missingOnReal.length || d.extraOnReal.length).map(([n]) => n),
};

// 6. Phase 17 checks. auth_matrix: no 5xx for any session, including one without recon data (regression for the
//    app.py fallback that called .get() on a Path). Model list: catalog status and size, and whether the composer
//    had a reason to fall back to providers. Polling: every repeating data request uses the 8 s or 30 s interval
//    listed in docs/request-map.md (one second of jitter allowed).
const matrixSids = [...new Set((process.env.JZ_MATRIX_SIDS || `${sid},260`).split(',').map((x) => x.trim()).filter(Boolean))];
const authMatrix = [];
for (const m of matrixSids) {
  const r = await call(token, 'GET', `/api/pentest/sessions/${m}/auth_matrix`);
  const j = r.json || {};
  authMatrix.push({ session: +m, status: r.status, shape: j.status === 'error' ? `error ${j.error_class || ''}`.trim() : Array.isArray(j.rows) ? `matrix rows=${j.rows.length}` : r.status === 404 ? 'not found' : 'other', counts: j.counts ?? null });
}
const uiMatrix5xx = Object.entries(all).flatMap(([n, r]) => r.failed.filter((d) => /^5\d\d GET .*\/auth_matrix/.test(d)).map((d) => `${n}: ${d}`));
report.checks.authMatrix = { direct: authMatrix, fromPages5xx: uiMatrix5xx, pass: authMatrix.every((x) => x.status < 500) && !uiMatrix5xx.length };
const cat = await call(token, 'GET', '/api/models/catalog');
const prov = await call(token, 'GET', '/api/models/providers');
const composerRoutes = ['/agent', '/pentest/project/{id}/session/{id}'];
report.checks.models = {
  catalog: { status: cat.status, items: Array.isArray(cat.json?.models) ? cat.json.models.length : null },
  providers: { status: prov.status, items: Array.isArray(prov.json?.providers) ? prov.json.providers.length : null },
  providersRequestedOn: composerRoutes.filter((r) => report.routes[r]?.unique.some((k) => k === 'GET /api/models/providers')),
  explanation: 'AgentComposer requests /api/models/providers only when /api/models/catalog fails or returns an empty list (src/features/agent/components_agent/AgentComposer.tsx). The fixture used to return an empty catalog.',
};
report.checks.models.pass = report.checks.models.catalog.status === 200 && (report.checks.models.catalog.items > 0) === (report.checks.models.providersRequestedOn.length === 0);
const okGap = (g) => (g >= 7 && g <= 9) || (g >= 29 && g <= 31);
const offCadence = Object.entries(all).flatMap(([n, r]) => r.polling.filter((p) => !p.split('gaps(s)=')[1].split(',').map(Number).every(okGap)).map((p) => `${n}: ${p}`));
report.checks.pollingIntervals = { expected: '8 s or 30 s (docs/request-map.md)', offCadence, pass: !offCadence.length };
report.checks.streams = { reconnects: Object.entries(all).flatMap(([n, r]) => r.streams.filter((x) => !/connections=1$/.test(x)).map((x) => `${n}: ${x}`)) };
report.finishedAt = new Date().toISOString();

const json = JSON.stringify(report, null, 1);
if (json.includes(token)) fail('Refusing to write the result: the token survived redaction.');
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, json + '\n');
const cadenceOut = arg('cadence', '');
if (cadenceOut) {
  const cad = { kind: 'request cadence, real backend (streams held open by the backend)', startedAt: report.startedAt, durationMsPerRoute: DUR, durationMsPerView: VIEW_DUR,
    routes: Object.fromEntries(Object.entries(report.routes).map(([k, r]) => [k, { initialDuplicates: r.initialDuplicates, polling: r.polling, streams: r.streams }])),
    views: Object.fromEntries(Object.entries(report.views).map(([k, r]) => [k, { initialDuplicates: r.initialDuplicates, polling: r.polling, streams: r.streams }])),
    pollingIntervals: report.checks.pollingIntervals };
  const cj = JSON.stringify(cad, null, 1); if (cj.includes(token)) fail('Refusing to write the cadence file: the token survived redaction.');
  fs.writeFileSync(cadenceOut, cj + '\n');
}
const c = report.checks;
console.log(`real read audit → ${out}`);
console.log(`routes ${Object.keys(report.routes).length}, surfaces ${Object.keys(report.views).length}, project ${pid}, session ${sid}`);
console.log(`duplicate data requests: ${c.duplicateDataRequests.length}   duplicate stream connections: ${c.duplicateStreamConnections.length}`);
console.log(`failed requests: ${c.failedRequests.length}   write attempts blocked: ${c.writeAttempts.length}   page errors: ${c.pageErrors.length}   console errors: ${c.consoleErrors.length}`);
console.log(`/api/feedback single read: ${c.feedbackReads.pass ? 'yes' : 'NO'}   routes differing from fixture baseline: ${c.baselineDifferences.length}`);
console.log(`auth_matrix: ${c.authMatrix.direct.map((x) => `${x.session}→${x.status} ${x.shape}`).join(', ')}   pass ${c.authMatrix.pass ? 'yes' : 'NO'}`);
console.log(`models/catalog ${c.models.catalog.status} items ${c.models.catalog.items}; providers requested on ${c.models.providersRequestedOn.join(', ') || 'none'}   polling off 8/30 s: ${c.pollingIntervals.offCadence.length}`);
for (const l of [...c.duplicateDataRequests, ...c.duplicateStreamConnections, ...c.writeAttempts, ...c.failedRequests].slice(0, 40)) console.log('  ' + l);
process.exit(c.duplicateDataRequests.length || c.duplicateStreamConnections.length || c.writeAttempts.length || c.failedRequests.length || c.pageErrors.length || !c.authMatrix.pass || !c.pollingIntervals.pass ? 1 : 0);
