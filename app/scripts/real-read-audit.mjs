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
report.finishedAt = new Date().toISOString();

const json = JSON.stringify(report, null, 1);
if (json.includes(token)) fail('Refusing to write the result: the token survived redaction.');
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, json + '\n');
const c = report.checks;
console.log(`real read audit → ${out}`);
console.log(`routes ${Object.keys(report.routes).length}, surfaces ${Object.keys(report.views).length}, project ${pid}, session ${sid}`);
console.log(`duplicate data requests: ${c.duplicateDataRequests.length}   duplicate stream connections: ${c.duplicateStreamConnections.length}`);
console.log(`failed requests: ${c.failedRequests.length}   write attempts blocked: ${c.writeAttempts.length}   page errors: ${c.pageErrors.length}   console errors: ${c.consoleErrors.length}`);
console.log(`/api/feedback single read: ${c.feedbackReads.pass ? 'yes' : 'NO'}   routes differing from fixture baseline: ${c.baselineDifferences.length}`);
for (const l of [...c.duplicateDataRequests, ...c.duplicateStreamConnections, ...c.writeAttempts, ...c.failedRequests].slice(0, 40)) console.log('  ' + l);
process.exit(c.duplicateDataRequests.length || c.writeAttempts.length || c.failedRequests.length || c.pageErrors.length ? 1 : 0);
