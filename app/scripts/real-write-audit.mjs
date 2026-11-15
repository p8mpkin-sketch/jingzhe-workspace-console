#!/usr/bin/env node
// Real-backend WRITE audit. Sends each write the UI sends, with the same method, path and body keys, against
// DISPOSABLE data that this script creates and then removes. It never touches an id it did not create.
//
//   cd app && npm run build && npx vite preview --port 4173 --strictPort      (one terminal)
//   JZ_TOKEN_FILE=~/.jz-token JZ_APK_PATH=/server/path/to/own-sample.apk \
//     node scripts/real-write-audit.mjs --out ../docs/screenshots/phase-16/real-write.json --shots ../docs/screenshots/phase-16/real
//
// Environment:
//   JZ_TOKEN or JZ_TOKEN_FILE   session token of an account allowed to create and delete (file mode 600)
//   BASE                        preview URL, default http://localhost:4173/v2/
//   JZ_APK_PATH                 server-side path of a sample you are authorised to assess. Without it, assessment
//                               creation and everything that needs a task is reported as BLOCKED, not faked.
//   JZ_DEVICE                   device serial for the session body, default emulator-5554
//   JZ_ALLOW_START=1            also send autopilot start, then stop at once. Off by default because start
//                               drives a real device.
//   JZ_KEEP=1                   skip cleanup (for debugging). The ids are in the result file.
//
// Every step records: method, path, request body, response status, the read-back used to confirm the
// resulting state, and its cleanup. A step that cannot run is recorded as BLOCKED with the reason.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readToken, redactor, call, arg, fail } from './real-common.mjs';

const token = readToken();
const redact = redactor(token);
const base = process.env.BASE || 'http://localhost:4173/v2/';
const out = arg('out', 'real-write.json');
const shots = arg('shots', '');
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const NAME = `jz-phase16-write-audit-${stamp}`;
const report = { kind: 'real-backend write audit', startedAt: new Date().toISOString(), base, marker: NAME, created: {}, steps: [], cleanup: [], residue: [] };
const ok = (s) => s >= 200 && s < 300;
const rows = (j) => (Array.isArray(j) ? j : j?.items || j?.sessions || j?.projects || j?.tasks || j?.cards || []);

async function step(name, method, p, body, verify) {
  const res = await call(token, method, p, body);
  const entry = { name, method, path: p, requestBody: body ?? null, status: res.status, pass: ok(res.status) };
  if (!entry.pass) entry.response = redact(JSON.stringify(res.json ?? res.text ?? '')).slice(0, 300);
  if (entry.pass && verify) { try { entry.resultingState = await verify(res); } catch (e) { entry.resultingState = 'read-back failed: ' + redact(e.message); entry.pass = false; } }
  report.steps.push(entry); console.log(`${entry.pass ? 'ok     ' : 'FAILED '} ${res.status} ${method} ${p}`);
  return res;
}
const blocked = (name, method, p, reason) => { report.steps.push({ name, method, path: p, status: 'BLOCKED', pass: false, reason }); console.log(`BLOCKED ${method} ${p} — ${reason}`); };

const me = await call(token, 'GET', '/api/me').catch((e) => ({ status: 0, text: String(e.message || e) }));
if (me.status !== 200) fail(`GET /api/me through ${base} returned ${me.status || 'no response'}. Backend not reachable or token rejected; no write was sent.`);
report.account = { role: me.json?.role ?? me.json?.user?.role ?? 'unknown' };

let pid = null, tid = null, sid = null;
try {
  // 1. Project creation (projects page, 新建评估项目). Body: { name, note }.
  const pr = await step('project creation', 'POST', '/api/pentest/projects', { name: NAME, note: 'Disposable project created by the Phase 16 write audit. Safe to delete.' }, async (res) => {
    const list = rows((await call(token, 'GET', '/api/pentest/projects')).json);
    const hit = list.find((x) => x.name === NAME); pid = res.json?.id ?? hit?.id ?? null;
    return hit ? `project ${hit.id} listed by GET /api/pentest/projects` : 'project not found in the list';
  });
  if (!pid && ok(pr.status)) pid = pr.json?.id ?? null;
  report.created.project = pid;

  // 2. Assessment creation (new assessment, single submit). Body keys as NewAuditPage sends them.
  if (!process.env.JZ_APK_PATH) blocked('assessment creation', 'POST', '/api/tasks', 'JZ_APK_PATH not set: no sample path to submit');
  else {
    const body = { kind: 'audit', app_name: NAME, apk_path: process.env.JZ_APK_PATH, authorized: '用户已确认测试授权(向导勾选)' };
    const tr = await step('assessment creation', 'POST', '/api/tasks', body, async (res) => {
      tid = res.json?.id ?? res.json?.task_id ?? null;
      const got = await call(token, 'GET', `/api/tasks/${tid}`);
      return `task ${tid}: GET /api/tasks/${tid} → ${got.status}, status "${got.json?.status ?? 'unknown'}"`;
    });
    if (!tid && ok(tr.status)) tid = tr.json?.id ?? tr.json?.task_id ?? null;
    report.created.task = tid;
  }

  // 3. Session creation (wizard). Body: { task_id, device, authorized }.
  if (!pid || !tid) blocked('session creation', 'POST', '/api/pentest/projects/{pid}/sessions', 'needs the disposable project and task from steps 1 and 2');
  else {
    const sr = await step('session creation', 'POST', `/api/pentest/projects/${pid}/sessions`, { task_id: tid, device: process.env.JZ_DEVICE || 'emulator-5554', authorized: '用户已确认测试授权(向导勾选)' }, async (res) => {
      sid = res.json?.id ?? res.json?.sid ?? null;
      const got = await call(token, 'GET', `/api/pentest/sessions/${sid}`);
      return `session ${sid}: GET /api/pentest/sessions/${sid} → ${got.status}, status "${got.json?.status ?? 'unknown'}"`;
    });
    if (!sid && ok(sr.status)) sid = sr.json?.id ?? null;
    report.created.session = sid;
  }

  if (!sid) {
    for (const [n, m, p] of [['clue submission', 'POST', '/api/pentest/sessions/{sid}/clue'], ['rule-card state change', 'POST', '/api/pentest/sessions/{sid}/vulns/state'],
      ['feedback submission', 'POST', '/api/feedback'], ['task start', 'POST', '/api/pentest/sessions/{sid}/autopilot/start'], ['task stop', 'POST', '/api/pentest/sessions/{sid}/autopilot/stop']]) blocked(n, m, p, 'needs the disposable session from step 3');
  } else {
    // 4. Clue (Agent trace composer). Body: { text }.
    await step('clue submission', 'POST', `/api/pentest/sessions/${sid}/clue`, { text: `${NAME}: audit clue, please ignore` }, async (res) => `response keys: ${Object.keys(res.json || {}).join(', ') || 'none'}`);

    // 5. Rule-card state change (findings). Body: { id, state }. Changed, read back, then restored.
    const cards = rows((await call(token, 'GET', `/api/pentest/sessions/${sid}/vulns/grouped`)).json);
    const inst = cards.flatMap((c) => c.instances || c.items || []).find((i) => i && i.id != null);
    if (!inst) blocked('rule-card state change', 'POST', `/api/pentest/sessions/${sid}/vulns/state`, 'the disposable session has no finding instance yet, and the audit does not touch findings of other sessions');
    else {
      const before = inst.state || inst.status || 'pending'; const next = before === 'confirmed' ? 'pending' : 'confirmed';
      await step('rule-card state change', 'POST', `/api/pentest/sessions/${sid}/vulns/state`, { id: inst.id, state: next }, async () => {
        const again = rows((await call(token, 'GET', `/api/pentest/sessions/${sid}/vulns/grouped`)).json).flatMap((c) => c.instances || c.items || []).find((i) => i.id === inst.id);
        return `instance ${inst.id}: "${before}" → "${again?.state || again?.status}"`;
      });
      const back = await call(token, 'POST', `/api/pentest/sessions/${sid}/vulns/state`, { id: inst.id, state: before });
      report.cleanup.push({ what: `restore instance ${inst.id} to "${before}"`, method: 'POST', path: `/api/pentest/sessions/${sid}/vulns/state`, status: back.status });
    }

    // 6. Feedback (AI sidebar). Body: { card_id, verdict, sid }.
    await step('feedback submission', 'POST', '/api/feedback', { card_id: `phase16-audit-${stamp}`, verdict: 'up', sid }, async () => {
      const got = await call(token, 'GET', '/api/feedback');
      const n = rows(got.json).filter((f) => f.card_id === `phase16-audit-${stamp}`).length;
      return `GET /api/feedback → ${got.status}, ${n} matching entr${n === 1 ? 'y' : 'ies'}`;
    });
    report.residue.push(`feedback entry card_id=phase16-audit-${stamp}: the UI has no delete for feedback; remove it on the server if it must not stay`);

    // 7. Task start / stop (workbench header). No body. Start drives a real device, so it is opt-in.
    if (process.env.JZ_ALLOW_START !== '1') {
      blocked('task start', 'POST', `/api/pentest/sessions/${sid}/autopilot/start`, 'JZ_ALLOW_START=1 not set: start drives a real device');
      blocked('task stop', 'POST', `/api/pentest/sessions/${sid}/autopilot/stop`, 'not sent because start was not sent');
    } else {
      const state = async () => { const g = await call(token, 'GET', `/api/pentest/sessions/${sid}/autopilot/status`); return `autopilot/status → ${g.status}, state "${g.json?.state ?? 'unknown'}"`; };
      await step('task start', 'POST', `/api/pentest/sessions/${sid}/autopilot/start`, undefined, state);
      await new Promise((r) => setTimeout(r, 1500));
      await step('task stop', 'POST', `/api/pentest/sessions/${sid}/autopilot/stop`, undefined, async () => { await new Promise((r) => setTimeout(r, 1500)); return state(); });
    }
  }

  // 8. Resulting UI state: the pages that show the new data, on the production preview build.
  if (shots && pid) {
    const { chromium } = createRequire(import.meta.url)('playwright');
    fs.mkdirSync(shots, { recursive: true });
    const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript((t) => { localStorage.setItem('token', t); }, token);
    const page = await ctx.newPage(); const ui = {};
    await page.goto(`${base}#/pentest/project/${pid}`); await page.waitForTimeout(2500);
    ui.projectSessionsPage = { url: `#/pentest/project/${pid}`, showsSession: sid ? (await page.locator(`text=#${sid}`).count()) > 0 : null };
    await page.screenshot({ path: path.join(shots, 'write-project-sessions.png') });
    if (sid) {
      await page.goto(`${base}#/pentest/project/${pid}/session/${sid}`); await page.waitForTimeout(3500);
      ui.workbench = { url: `#/pentest/project/${pid}/session/${sid}`, rendered: (await page.locator('[data-wb-root]').count()) > 0 };
      await page.screenshot({ path: path.join(shots, 'write-workbench.png') });
    }
    if (tid) {
      await page.goto(`${base}#/tasks?focus=${tid}`); await page.waitForTimeout(2500);
      ui.tasksPage = { url: `#/tasks?focus=${tid}`, showsTask: (await page.locator(`text=#${tid}`).count()) > 0 };
      await page.screenshot({ path: path.join(shots, 'write-tasks.png') });
    }
    await b.close(); report.uiState = ui;
  }
} finally {
  // 9. Cleanup, newest first, only ids created above.
  if (process.env.JZ_KEEP === '1') report.cleanup.push({ what: 'skipped (JZ_KEEP=1)' });
  else {
    const del = async (what, p) => { const r = await call(token, 'DELETE', p); report.cleanup.push({ what, method: 'DELETE', path: p, status: r.status }); console.log(`cleanup ${r.status} DELETE ${p}`); return r.status; };
    if (sid) { const s = await del(`session ${sid}`, `/api/pentest/sessions/${sid}`); if (!ok(s)) report.residue.push(`session ${sid} was not removed (status ${s})`); }
    if (tid) { const s = await del(`task ${tid}`, `/api/tasks/${tid}`); if (!ok(s)) report.residue.push(`task ${tid} was not removed (status ${s})`); }
    if (pid) {
      // The UI has no project delete. This tries the conventional route and reports what the server said.
      const s = await del(`project ${pid}`, `/api/pentest/projects/${pid}`);
      if (!ok(s)) report.residue.push(`project ${pid} ("${NAME}") is still there (DELETE returned ${s}); the frontend has no project delete, remove it with an admin tool`);
    }
  }
  report.finishedAt = new Date().toISOString();
  const json = JSON.stringify(report, null, 1);
  if (json.includes(token)) fail('Refusing to write the result: the token survived redaction.');
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, json + '\n');
  const n = (f) => report.steps.filter(f).length;
  console.log(`real write audit → ${out}`);
  console.log(`passed ${n((s) => s.pass)}   failed ${n((s) => !s.pass && s.status !== 'BLOCKED')}   blocked ${n((s) => s.status === 'BLOCKED')}   residue ${report.residue.length}`);
}
process.exit(report.steps.some((s) => !s.pass) ? 1 : 0);
