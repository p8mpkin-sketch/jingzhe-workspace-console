#!/usr/bin/env node
// Dev-only acceptance for V3 Phase 9 (knowledge, Agent, evidence, system), on fixtures. Eleven groups:
//   K  knowledge library  list, search, categories, sort, detail, source text, enable / disable / promote, delete
//                         confirm, mounting, local entries, import, rescan, distill, exports; every write's request body
//   R  review             reason, source, evidence refs, task link, pre-review filter, pre-review 429, single and batch
//                         decisions, the decided record; non-admins send no candidate read
//   A  Agent              three panes, the shared composer (send / stop / mode / model), slash commands, approvals,
//                         403 / 429 keep the text, focus back to the composer, ?task=
//   E  evidence           source filter, search, detail, copy, coverage, the row shared with the workbench
//   Y  system             seven tabs and ?tab=, account menu and palette to 模型, the web switch PATCH, devices send no
//                         request of their own, nodes, diagnostics, non-admins
//   C  confirms           four in the AI assistant archive, two in the Agent: cancel sends nothing, confirm sends the
//                         original request, focus returns; the archive note; any window.confirm / prompt call fails
//   T  retired            /skills and /discovery redirect; each capability of the retired components is reachable
//   Q  requests           first-load request sets against 777f03e, no 0 from data that was not read, 403 without retry
//   KB keyboard           tabs with arrows, table ↑↓ Enter, Escape back to the trigger
//   V  widths, themes     7 views × 390 / 760 / 1024 / 1280 / 1440 / 1680 × light and dark
//   S  states             8 surfaces × 6 states × 4 widths × 2 themes = 384 cells
// Rules: every wait has a limit; a missing precondition fails, it is never skipped; the total is fixed (PLAN).
// Needs this build on --base (default :4178) and the 777f03e build on --baseline (default :4177) for Q.
// Usage: node scripts/check-knowledge-agent-evidence.mjs [--out dir] [--only K,R,...] [--base url] [--baseline url]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve as fixture, emptied } from './fixtures/api.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:4178/v2/');
const baseline = arg('baseline', 'http://localhost:4177/v2/');
const out = arg('out', '');
const only = arg('only', '').split(',').filter(Boolean);
const want = (g) => !only.length || only.includes(g);
if (out) fs.mkdirSync(out, { recursive: true });
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

const PLAN = { K: 32, R: 28, A: 36, E: 20, Y: 26, C: 16, T: 12, Q: 22, KB: 12, V: 84, S: 384 };
const LIMIT = { nav: 20000, act: 8000, read: 3000 };
const GROUP_MS = { S: 60 * 60 * 1000, V: 25 * 60 * 1000 }, GROUP_DEFAULT = 12 * 60 * 1000, RUN_MS = 150 * 60 * 1000;
const RETRY = /重试|再读一次|稍后|重新读取|再试/;

const results = [];
const groupOf = (name) => (name.match(/^[A-Z]+/) || ['?'])[0];
const first = (e) => String(e?.message || e).split('\n')[0].slice(0, 200);
const ok = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail: String(detail ?? '') }); console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const browser = await chromium.launch();
const live = new Set();
const summary = () => {
  const failed = results.filter((r) => !r.pass);
  const groups = {}; for (const r of results) { const g = groupOf(r.name); groups[g] = groups[g] || [0, 0]; groups[g][1]++; if (r.pass) groups[g][0]++; }
  if (out) fs.writeFileSync(path.join(out, 'report.knowledge-agent-evidence.json'), JSON.stringify({ base: 'fixtures', total: results.length, failed: failed.length, plan: PLAN, groups, results }, null, 1));
  console.log('\n' + Object.entries(groups).map(([g, [p, t]]) => `${g} ${p}/${t}`).join('   '));
  console.log(`${results.length - failed.length}/${results.length} knowledge, Agent, evidence and system checks passed (fixtures)`);
  return failed.length;
};
async function group(g, body) {
  if (!want(g)) return;
  let timer; let why = '';
  const ms = GROUP_MS[g] ?? GROUP_DEFAULT;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`group ${g} did not finish within ${ms / 60000} min`)), ms); });
  try { await Promise.race([body(), limit]); } catch (e) { why = first(e); }
  finally { clearTimeout(timer); for (const c of live) await c.close().catch(() => {}); live.clear(); }
  const done = results.filter((r) => groupOf(r.name) === g).length;
  for (let i = done; i < PLAN[g]; i++) ok(`${g} not reached: check ${i + 1} of ${PLAN[g]}`, false, why ? `the group stopped: ${why}` : 'the group ended before this check');
  if (done > PLAN[g]) ok(`${g} plan: the group ran ${done} checks, the plan says ${PLAN[g]}`, false, 'update PLAN');
}
setTimeout(() => { ok('Q watchdog: the run did not finish', false, `stopped after ${RUN_MS / 60000} min`); summary(); process.exit(2); }, RUN_MS).unref();

/**
 * One page on fixtures. mode: ok | empty | error | forbidden | slow | delay | stale (stale: answers until
 * state.failing is set). deny / fail / hang / limit: regexes on path+query (403 / 500 / no answer / 429);
 * over(method, url) returns a body or { __status, body } to replace the fixture.
 */
async function open(route, { width = 1440, height = 900, theme = 'light', mode = 'ok', deny = null, fail = null, hang = null, limit = null, over = null, wait = 1600, downloads = false, root = base, role = 'admin', init = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme, acceptDownloads: downloads });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await ctx.addInitScript((t) => {
    try { localStorage.setItem('token', 'fixture-token'); localStorage.setItem('apksec-theme', t); } catch {}
    window.__native = [];
    window.confirm = (m) => { window.__native.push('confirm:' + m); return false; };
    window.prompt = (m) => { window.__native.push('prompt:' + m); return null; };
  }, theme);
  if (init) await ctx.addInitScript(init);
  live.add(ctx); ctx.setDefaultTimeout(LIMIT.act); ctx.setDefaultNavigationTimeout(LIMIT.nav);
  const page = await ctx.newPage();
  const state = { mode, deny, fail, hang, limit, over, failing: false, errors: [], reqs: [], posts: [] };
  page.on('pageerror', (e) => state.errors.push(e.message));
  await page.route('**/api/**', async (r) => {
    const req = r.request(); const url = new URL(req.url());
    if (/\/stream$|send_stream$/.test(url.pathname)) return r.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    const key = `${req.method()} ${url.pathname}${url.search}`;
    state.reqs.push(key);
    if (req.method() !== 'GET') state.posts.push({ key, body: req.postData() || '' });
    const full = url.pathname + url.search;
    if (url.pathname === '/api/me') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ username: 'demo', role }) });
    if (state.mode === 'delay') await new Promise((res) => setTimeout(res, 800));
    if (state.mode === 'slow') return;
    if (state.mode === 'error' || (state.mode === 'stale' && state.failing)) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"fixture failure"}' });
    if (state.mode === 'forbidden') return r.fulfill({ status: 403, contentType: 'application/json', body: '{"detail":"fixture: forbidden"}' });
    if (state.hang && state.hang.test(full)) return;
    if (state.deny && state.deny.test(full)) return r.fulfill({ status: 403, contentType: 'application/json', body: '{"detail":"fixture: forbidden"}' });
    if (state.limit && state.limit.test(full)) return r.fulfill({ status: 429, contentType: 'application/json', body: '{"detail":"fixture: rate limited"}' });
    if (state.fail && state.fail.test(full)) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"fixture failure"}' });
    const own = state.over ? state.over(req.method(), url) : undefined;
    if (own && own.__status) return r.fulfill({ status: own.__status, contentType: 'application/json', body: JSON.stringify(own.body || {}) });
    let body = own !== undefined ? own : fixture(req.method(), url);
    if (state.mode === 'empty' && req.method() === 'GET' && typeof body !== 'string') body = emptied(body);
    return r.fulfill(typeof body === 'string' ? { status: 200, contentType: 'text/plain; charset=utf-8', body } : { status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(root + '#' + route); await page.waitForTimeout(wait);
  return { ctx, page, state };
}
const count = (page, sel) => page.locator(sel).count();
const visible = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);
const text = (page, sel) => page.locator(sel).first().innerText({ timeout: LIMIT.read }).then((s) => s.replace(/\s+/g, ' ').trim()).catch(() => '');
const attr = (page, sel, a) => page.locator(sel).first().getAttribute(a, { timeout: LIMIT.read }).catch(() => null);
const hash = (page) => page.evaluate(() => decodeURIComponent(location.hash.slice(1)));
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shot = async (page, name) => { if (out) await page.screenshot({ path: path.join(out, name) }).catch(() => {}); };
const since = (state, n) => state.reqs.slice(n);
const main = (page) => text(page, 'main');
const native = (page) => page.evaluate(() => window.__native || []).catch(() => ['unreadable']);
const activeAttr = (page, a) => page.evaluate((x) => document.activeElement?.closest(`[${x}]`)?.getAttribute(x) ?? null, a);
const fx = (u, m = 'GET') => fixture(m, new URL('http://x' + u));
const sent = (state, method, re) => state.posts.filter((p) => p.key.startsWith(method + ' ') && re.test(p.key));
const bodyOf = (p) => { try { return JSON.parse(p?.body || 'null'); } catch { return p?.body; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const click = async (page, sel) => { await page.locator(sel).first().click({ timeout: LIMIT.act }); await page.waitForTimeout(500); };
const menuPick = async (page, trigger, item) => { await click(page, trigger); await click(page, item); };
const wait = (page, ms) => page.waitForTimeout(ms);
const POLL = /\/api\/(pentest\/devices|notifications|tasks-summary|me$)/;
const reqSet = (state) => [...new Set(state.reqs.filter((k) => !POLL.test(k.split(' ')[1])))].sort();

// ───────────── expected values, from the fixture itself ─────────────
const SKILLS = fx('/api/skills');
const CANDS = fx('/api/kb/candidates').items;
const PENDING = CANDS.filter((c) => c.status === 'pending');
const OVERVIEW = fx('/api/v2/overview');
const CONFIRMED = OVERVIEW.confirmed;
const NODES = fx('/api/nodes').items;
const DONE_AUDIT = fx('/api/tasks?limit=200').filter((t) => t.kind === 'audit' && t.status === 'done' && t.result_id);
// The archive's one session has no last message, so the list hides it; these checks give it one.
const chatWithMsg = (m, u) => (m === 'GET' && u.pathname === '/api/chat/sessions' ? fx('/api/chat/sessions').map((s) => ({ ...s, last_msg: '总结这个应用的主要发现。' })) : undefined);

// ═════════════════════════════ K knowledge library ═════════════════════════════
await group('K', async () => {
  const s = await open('/knowledge', { wait: 2200, downloads: true });
  const { page, state } = s;
  ok('K1 条目 reads the /api/skills count', (await text(page, '[data-knowledge-total]')).includes(String(SKILLS.length)), await text(page, '[data-knowledge-total]'));
  ok('K2 待审候选 reads the pending candidates', (await text(page, '[data-knowledge-pending]')).includes(String(PENDING.length)), await text(page, '[data-knowledge-pending]'));
  ok('K3 every skill is a row', (await count(page, '[data-skill-row]')) === SKILLS.length, String(await count(page, '[data-skill-row]')));
  const search = page.locator('input[data-skill-search], [data-skill-search] input').first();
  await search.fill('示例知识条目 3').catch(() => {}); await wait(page, 400);
  ok('K4 search narrows to the matching row', (await count(page, '[data-skill-row]')) === 1 && (await attr(page, '[data-skill-row]', 'data-skill-row')) === '3', String(await count(page, '[data-skill-row]')));
  await search.fill('没有这个条目').catch(() => {}); await wait(page, 400);
  const emptyShown = (await count(page, '[data-skills-tab-empty]')) === 1;
  await page.locator('[data-skills-reset-tab]').first().click().catch(() => {}); await wait(page, 400);
  ok('K5 no match says so and 清除筛选 brings the rows back', emptyShown && (await count(page, '[data-skill-row]')) === SKILLS.length, `${emptyShown}`);
  const tabs = await page.$$eval('[data-scene-tab]', (els) => els.map((e) => [e.getAttribute('data-scene-tab'), Number((e.textContent.match(/(\d+)\s*$/) || [0, 0])[1])]));
  const pick = tabs.find(([k]) => k !== '全部');
  if (pick) { await click(page, `[data-scene-tab="${pick[0]}"]`); }
  ok('K6 a category shows the rows its button counts', !!pick && (await count(page, '[data-skill-row]')) === pick[1], JSON.stringify(pick));
  await page.locator('[data-scene-tab="全部"]').first().click().catch(() => {}); await wait(page, 300);
  await page.locator('select[data-skill-sort]').first().selectOption('uses').catch(() => {}); await wait(page, 400);
  const order = await page.$$eval('[data-skill-row]', (els) => els.map((e) => e.getAttribute('data-skill-row')));
  const byUses = [...SKILLS].sort((a, b) => (b.uses || 0) - (a.uses || 0)).map((x) => String(x.id));
  ok('K7 实战次数↓ orders the rows by uses', order[0] === byUses[0] && order.length === SKILLS.length, order.join(','));
  await page.locator('select[data-skill-sort]').first().selectOption('default').catch(() => {}); await wait(page, 300);
  ok('K8 the pager shows the total that was read', /\b5\b/.test(await text(page, '[data-knowledge-library]')), '');
  let n = state.reqs.length;
  await click(page, '[data-skill-row="1"]'); await wait(page, 800);
  ok('K9 a row opens its detail', await visible(page, '[data-skill-detail]'), '');
  ok('K10 the detail reads the source text once', since(state, n).filter((k) => k === 'GET /api/skills/1/source').length === 1 && (await text(page, '[data-source-pre]')).includes('示例知识条目'), since(state, n).join(' | '));
  ok('K11 the source text can be copied', (await count(page, '[data-source-copy]')) === 1, '');
  await click(page, '[data-skill-disable]'); await wait(page, 600);
  const dis = sent(state, 'PATCH', /\/api\/skills\/1\/status$/);
  ok('K12 停用 sends PATCH /api/skills/1/status {status: disabled}', dis.length === 1 && same(bodyOf(dis[0]), { status: 'disabled' }), dis.map((p) => p.body).join(' | '));
  await page.keyboard.press('Escape'); await wait(page, 400);
  await click(page, '[data-skill-row="3"]'); await wait(page, 600);
  await click(page, '[data-skill-enable]'); await wait(page, 600);
  const en = sent(state, 'PATCH', /\/api\/skills\/3\/status$/);
  ok('K13 启用 sends PATCH /api/skills/3/status {status: active}', en.length === 1 && same(bodyOf(en[0]), { status: 'active' }), en.map((p) => p.body).join(' | '));
  await page.keyboard.press('Escape'); await wait(page, 400);
  await click(page, '[data-skill-row="2"]'); await wait(page, 600);
  await click(page, '[data-skill-promote]'); await wait(page, 600);
  const pr = sent(state, 'PATCH', /\/api\/skills\/2\/status$/);
  ok('K14 草案转正 sends PATCH /api/skills/2/status {status: active}', pr.length === 1 && same(bodyOf(pr[0]), { status: 'active' }), pr.map((p) => p.body).join(' | '));
  await click(page, '[data-skill-delete]'); await wait(page, 400);
  const dlg = await text(page, '[role="alertdialog"], [role="dialog"]:has([data-confirm-ok])');
  ok('K15 删除 asks first and says what is lost', /无法恢复/.test(dlg) && sent(state, 'DELETE', /\/api\/skills\//).length === 0, dlg.slice(0, 80));
  await click(page, '[data-confirm-cancel]');
  ok('K16 cancel sends no DELETE', sent(state, 'DELETE', /\/api\/skills\//).length === 0, '');
  await click(page, '[data-skill-delete]'); await click(page, '[data-confirm-ok]'); await wait(page, 600);
  ok('K17 confirm sends DELETE /api/skills/2', sent(state, 'DELETE', /\/api\/skills\/2$/).length === 1, state.posts.map((p) => p.key).join(' | '));
  await page.keyboard.press('Escape'); await wait(page, 400);
  await click(page, '[data-skill-row="1"]'); await wait(page, 600);
  const opts = await page.$$eval('[data-mount-task-select] option', (els) => els.map((e) => e.value).filter(Boolean));
  ok('K18 the mount list offers the finished audits', opts.length === DONE_AUDIT.length, `${opts.length} vs ${DONE_AUDIT.length}`);
  n = state.reqs.length;
  if (opts[0]) await page.locator('select[data-mount-task-select]').first().selectOption(opts[0]).catch(() => {}); await wait(page, 600);
  ok('K19 choosing a task reads its mounted list', since(state, n).includes(`GET /api/tasks/${opts[0]}/skills`), since(state, n).join(' | '));
  await click(page, '[data-mount-btn]'); await wait(page, 600);
  ok('K20 挂载 sends POST /api/tasks/{tid}/skills/1/mount', sent(state, 'POST', new RegExp(`/api/tasks/${opts[0]}/skills/1/mount$`)).length === 1, state.posts.map((p) => p.key).join(' | '));
  await page.keyboard.press('Escape'); await wait(page, 400);
  n = state.reqs.length;
  await menuPick(page, '[data-knowledge-more]', '[data-skill-new]');
  await page.locator('[data-skill-new-name]').first().fill('本地条目甲').catch(() => {});
  await click(page, '[data-skill-new-submit]'); await wait(page, 500);
  const stored = await page.evaluate(() => localStorage.getItem('apksec-skills-local') || '');
  ok('K21 a new local entry is saved under apksec-skills-local', stored.includes('本地条目甲'), stored.slice(0, 60));
  ok('K22 it is a local row and sends no request', (await count(page, '[data-skill-local]')) === 1 && since(state, n).filter((k) => !k.startsWith('GET')).length === 0, since(state, n).join(' | '));
  ok('K23 本地条目 counts it', /1/.test(await text(page, '[data-readout-row]')), '');
  await menuPick(page, '[data-knowledge-more]', '[data-skills-import-btn]');
  await page.locator('[data-import-panel] input').nth(0).fill('/srv/skills/pack').catch(() => {});
  await click(page, '[data-import-submit]'); await wait(page, 600);
  const imp = sent(state, 'POST', /\/api\/skills\/import$/);
  ok('K24 path import sends {path}', imp.length === 1 && same(bodyOf(imp[0]), { path: '/srv/skills/pack' }), imp.map((p) => p.body).join(' | '));
  await menuPick(page, '[data-knowledge-more]', '[data-skills-import-btn]');
  await page.locator('[data-import-panel] input').nth(1).fill('https://example.com/SKILL.md').catch(() => {});
  await click(page, '[data-import-submit]'); await wait(page, 600);
  const imp2 = sent(state, 'POST', /\/api\/skills\/import$/);
  ok('K25 URL import sends {url}', imp2.length === 2 && same(bodyOf(imp2[1]), { url: 'https://example.com/SKILL.md' }), imp2.map((p) => p.body).join(' | '));
  await menuPick(page, '[data-knowledge-more]', '[data-skills-rescan]'); await wait(page, 600);
  ok('K26 重新扫描 sends POST /api/skills/scan', sent(state, 'POST', /\/api\/skills\/scan$/).length === 1, '');
  ok('K27 the scan result is written on the page', (await count(page, '[data-scan-msg]')) === 1 && (await text(page, '[data-scan-msg]')).length > 0, await text(page, '[data-scan-msg]'));
  await menuPick(page, '[data-knowledge-more]', '[data-distill-open]');
  const dopts = await page.$$eval('[data-distill-task-select] option', (els) => els.map((e) => e.value).filter(Boolean));
  ok('K28 提炼 lists the finished audits', dopts.length === DONE_AUDIT.length, `${dopts.length}`);
  if (dopts[0]) await page.locator('select[data-distill-task-select]').first().selectOption(dopts[0]).catch(() => {});
  await click(page, '[data-distill-btn]'); await wait(page, 600);
  const dst = sent(state, 'POST', /\/api\/skills\/distill$/);
  ok('K29 提炼 sends {task_id}', dst.length === 1 && same(bodyOf(dst[0]), { task_id: Number(dopts[0]) }), dst.map((p) => p.body).join(' | '));
  await page.keyboard.press('Escape'); await wait(page, 300);
  for (const [i, fmt] of [[30, 'json'], [31, 'csv']]) {
    const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await menuPick(page, '[data-knowledge-more]', `[data-skills-export="${fmt}"]`).catch(() => {});
    const d = await dl;
    ok(`K${i} 导出清单 ${fmt.toUpperCase()} downloads a file`, !!d && new RegExp(`\\.${fmt}$`).test(d.suggestedFilename()), d ? d.suggestedFilename() : 'no download');
  }
  await s.ctx.close();
  const u = await open('/knowledge', { role: 'user', wait: 2200 });
  await click(u.page, '[data-skill-row="1"]'); await wait(u.page, 600);
  ok('K32 a non-admin sees no write actions and sends no candidate read', (await count(u.page, '[data-skill-disable], [data-skill-delete], [data-skill-promote], [data-skill-enable]')) === 0
    && !u.state.reqs.some((k) => k.includes('/api/kb/candidates')), u.state.reqs.filter((k) => k.includes('/kb/')).join(' | '));
  await u.ctx.close();
});

// ═════════════════════════════ R review ═════════════════════════════
await group('R', async () => {
  const s = await open('/knowledge?tab=review', { wait: 2200 });
  const { page, state } = s;
  const card = (id, sel) => text(page, `[data-kb-cand-card="${id}"] ${sel}`);
  ok('R1 every pending candidate is a row', (await count(page, '[data-kb-cand-grid] [data-kb-cand-card]')) === PENDING.length, String(await count(page, '[data-kb-cand-grid] [data-kb-cand-card]')));
  ok('R2 a reviewed candidate shows the verdict and its reason', /建议通过/.test(await card(1, '[data-kb-reason]')) && (await card(1, '[data-kb-reason]')).includes('两次任务复现'), await card(1, '[data-kb-reason]'));
  ok('R3 a verdict without a reason says so', /预审未附理由/.test(await card(2, '[data-kb-reason]')), await card(2, '[data-kb-reason]'));
  ok('R4 an unreviewed candidate says 未预审', /未预审/.test(await card(3, '[data-kb-reason]')), await card(3, '[data-kb-reason]'));
  ok('R5 evidence refs are copyable chips', (await count(page, '[data-kb-cand-card="1"] [data-kb-ref]')) === 2, '');
  ok('R6 no refs says 没有证据引用', /没有证据引用/.test(await card(3, '[data-kb-refs]')), await card(3, '[data-kb-refs]'));
  ok('R7 the source is on the row', (await card(1, '[data-kb-source]')).includes('post_mortem'), await card(1, '[data-kb-source]'));
  ok('R8 no source says 未提供来源', /未提供来源/.test(await card(3, '[data-kb-source]')), await card(3, '[data-kb-source]'));
  ok('R9 the task link opens /tasks/101', /#\/tasks\/101$/.test((await attr(page, '[data-kb-cand-card="1"] [data-kb-task-link]', 'href')) || ''), await attr(page, '[data-kb-cand-card="1"] [data-kb-task-link]', 'href'));
  ok('R10 the session is named', /会话 #41/.test(await card(1, '[data-kb-source]')), '');
  ok('R11 no session says 未关联会话', /未关联会话/.test(await card(2, '[data-kb-source]')), '');
  const reviewed = PENDING.filter((c) => /^\[预审\]/.test(c.note || '')).length;
  ok('R12 the pre-review count is read from the notes', (await text(page, '[data-kb-pre-count]')).includes(`${reviewed} / ${PENDING.length}`), await text(page, '[data-kb-pre-count]'));
  const filt = async (k) => { await click(page, `[data-kb-pre-filter-btn="${k}"]`); return page.$$eval('[data-kb-cand-grid] [data-kb-cand-card]', (els) => els.map((e) => e.getAttribute('data-kb-cand-card')).join(',')); };
  ok('R13 建议通过 keeps #1', (await filt('adopt')) === '1', '');
  ok('R14 建议拒绝 keeps #2', (await filt('reject')) === '2', '');
  ok('R15 待补信息 keeps #6', (await filt('needs')) === '6', '');
  ok('R16 未预审 keeps #3', (await filt('none')) === '3', '');
  ok('R17 无证据引用 keeps #3', (await filt('norefs')) === '3', '');
  await filt('all');
  await click(page, '[data-kb-prereview-btn]'); await wait(page, 600);
  const pre = sent(state, 'POST', /\/api\/kb\/candidates\/pre-review$/);
  ok('R18 预审 sends {limit: 20}', pre.length === 1 && same(bodyOf(pre[0]), { limit: 20 }), pre.map((p) => p.body).join(' | '));
  const w = page.viewportSize().width >= 760 ? '' : '-m';
  await click(page, `[data-kb-approve${w}="1"]`); await wait(page, 600);
  const ap = sent(state, 'POST', /\/api\/kb\/candidates$/);
  ok('R19 通过 sends {id, action: approve} without a confirm', ap.length === 1 && same(bodyOf(ap[0]), { id: 1, action: 'approve' }), ap.map((p) => p.body).join(' | '));
  ok('R20 the result line names the candidate', (await text(page, '[data-kb-result]')).includes('#1'), await text(page, '[data-kb-result]'));
  await click(page, `[data-kb-reject${w}="2"]`);
  ok('R21 拒绝 asks first and repeats the reason and source', (await count(page, '[data-kb-reject-context] [data-kb-reason]')) === 1 && (await count(page, '[data-kb-reject-context] [data-kb-source]')) === 1, '');
  await click(page, '[data-confirm-cancel]');
  const before = sent(state, 'POST', /\/api\/kb\/candidates$/).length;
  await click(page, `[data-kb-reject${w}="2"]`); await click(page, '[data-confirm-ok]'); await wait(page, 600);
  const rj = sent(state, 'POST', /\/api\/kb\/candidates$/);
  ok('R22 confirm sends {id: 2, action: reject}; cancel sent nothing', before === 1 && rj.length === 2 && same(bodyOf(rj[1]), { id: 2, action: 'reject' }), rj.map((p) => p.body).join(' | '));
  await page.locator('[data-kb-cand-check="1"]').first().check().catch(() => {});
  await page.locator('[data-kb-cand-check="3"]').first().check().catch(() => {});
  ok('R23 checking two rows shows the bulk bar with 2', /已选\s*2/.test(await text(page, '[data-kb-bulk-bar]')), await text(page, '[data-kb-bulk-bar]'));
  await click(page, '[data-kb-bulk-approve]');
  const ctxText = await text(page, '[data-kb-bulk-context]');
  ok('R24 the bulk confirm lists each candidate with its pre-review', /#1/.test(ctxText) && /#3/.test(ctxText) && /未预审/.test(ctxText), ctxText);
  await click(page, '[data-confirm-ok]'); await wait(page, 600);
  const bk = sent(state, 'POST', /\/api\/kb\/candidates\/decide-batch$/);
  ok('R25 批量通过 sends {ids, action}', bk.length === 1 && same(bodyOf(bk[0]), { ids: [1, 3], action: 'approve' }), bk.map((p) => p.body).join(' | '));
  await click(page, '[data-kb-decided-toggle]');
  const dec = await text(page, '[data-kb-decided-list]');
  ok('R26 已决定 keeps approved and rejected with the decision time', (await count(page, '[data-kb-decided-list] [data-kb-decided]')) === CANDS.length - PENDING.length && /已通过/.test(dec) && /已拒绝/.test(dec) && /决定于/.test(dec), dec.slice(0, 80));
  await click(page, '[data-kb-cand-inspect="6"]'); await wait(page, 400);
  ok('R27 the full candidate shows the raw text', (await text(page, '[data-kb-cand-raw="6"]')).length > 0 || (await count(page, '[data-kb-cand-raw="6"]')) === 1, '');
  await s.ctx.close();
  const l = await open('/knowledge?tab=review', { limit: /pre-review/, wait: 2200 });
  await click(l.page, '[data-kb-prereview-btn]'); await wait(l.page, 600);
  const m429 = await text(l.page, '[data-kb-pre-msg]');
  ok('R28 a 429 pre-review says it is rate limited and nothing changed', /429/.test(m429) && /频率/.test(m429) && /没有改变/.test(m429), m429);
  await l.ctx.close();
});

// ═════════════════════════════ A Agent ═════════════════════════════
const input = (page) => page.locator('[data-agent-composer] [data-composer-input]').first();
const typeSend = async (page, t) => { await input(page).fill(t); await input(page).press('Enter'); await wait(page, 700); };
await group('A', async () => {
  {
    const s = await open('/agent', { wait: 2600 });
    const { page, state } = s;
    ok('A1 three panes at 1440: sessions, transcript, inspector', (await visible(page, '[data-agent-sidebar]')) && (await visible(page, '[data-agent-transcript]')) && (await visible(page, '[data-agent-inspector]')), '');
    ok('A2 the inspector is its own chunk and still opens pinned', (await count(page, '[data-agent-inspector-pinned] [data-agent-inspector]')) >= 1 || (await visible(page, '[data-agent-inspector]')), '');
    ok('A3 the composer is the shared one', (await count(page, '[data-agent-composer] [data-composer]')) >= 1, '');
    ok('A4 the session is a fixed context chip', (await text(page, '[data-agent-composer] [data-composer-chip="session"]')).includes('示例 Agent 会话'), await text(page, '[data-agent-composer] [data-composer-chips]'));
    ok('A5 the mode is locked to the session', (await count(page, '[data-agent-composer] [data-composer-mode-locked]')) >= 1, '');
    const models = await page.$$eval('[data-agent-composer] select[data-composer-model] option', (els) => els.map((e) => e.value));
    ok('A6 the model picker lists the catalog', models.includes('model-large') && models.includes('model-small'), models.join(','));
    await input(page).fill('多行');
    await input(page).press('Shift+Enter'); await wait(page, 300);
    ok('A7 Shift+Enter adds a line and sends nothing', sent(state, 'POST', /\/messages$/).length === 0 && (await input(page).inputValue()).includes('\n'), '');
    await input(page).fill('');
    await page.locator('[data-agent-composer] select[data-composer-model]').first().selectOption('model-small').catch(() => {});
    await typeSend(page, 'Wallet 有哪些高危发现?');
    const msg = sent(state, 'POST', /\/api\/agent\/sessions\/a1\/messages$/);
    ok('A8 Enter sends POST …/a1/messages {text, model}', msg.length === 1 && same(bodyOf(msg[0]), { text: 'Wallet 有哪些高危发现?', model: 'model-small' }), msg.map((p) => p.body).join(' | '));
    ok('A9 while the reply runs only 停止 is offered (D5)', (await count(page, '[data-agent-composer] [data-composer-primary="stop"]')) >= 1 && (await count(page, '[data-agent-composer] [data-composer-send-guidance]')) === 0, '');
    ok('A10 the run cell counts from the moment of sending', /^\d\d:\d\d$/.test(await text(page, '[data-agent-composer] [data-composer-timer]')), await text(page, '[data-agent-composer] [data-composer-timer]'));
    await click(page, '[data-agent-composer] [data-composer-primary="stop"]');
    ok('A11 停止 sends POST …/a1/cancel', sent(state, 'POST', /\/api\/agent\/sessions\/a1\/cancel$/).length === 1, state.posts.map((p) => p.key).join(' | '));
    await wait(page, 4200);
    await input(page).fill('/'); await wait(page, 400);
    const rows = await page.$$eval('[data-agent-composer] [data-composer-menu] [data-menu-row]', (els) => els.map((e) => e.getAttribute('data-menu-row')));
    ok('A12 / lists 新会话, 分支, 导出轨迹, 联网', ['new', 'fork', 'export', 'web'].every((k) => rows.includes(k)), rows.join(','));
    const webRow = await text(page, '[data-agent-composer] [data-menu-row="web"]');
    ok('A13 the web command names the read setting (开启联网)', /开启联网/.test(webRow), webRow);
    await page.locator('[data-agent-composer] [data-menu-row="web"]').first().click().catch(() => {}); await wait(page, 600);
    const web = sent(state, 'PATCH', /\/api\/agent\/settings$/);
    ok('A14 /联网 sends PATCH /api/agent/settings {web_enabled: true}', web.length === 1 && same(bodyOf(web[0]), { web_enabled: true }), web.map((p) => p.body).join(' | '));
    await input(page).fill('/'); await wait(page, 300);
    await page.locator('[data-agent-composer] [data-menu-row="new"]').first().click().catch(() => {}); await wait(page, 700);
    ok('A15 /新会话 sends POST /api/agent/sessions', sent(state, 'POST', /\/api\/agent\/sessions$/).length === 1, state.posts.map((p) => p.key).join(' | '));
    let n = state.reqs.length;
    await click(page, '[data-agent-refresh]'); await wait(page, 600);
    ok('A16 刷新 reads the session list again', since(state, n).includes('GET /api/agent/sessions'), since(state, n).join(' | '));
    await s.ctx.close();
  }
  {
    const s = await open('/agent', { wait: 2400 });
    const { page, state } = s;
    await click(page, '[data-agent-session-item="a2"]'); await wait(page, 1500);
    ok('A17 a running session waiting on approval shows the card', (await attr(page, '[data-agent-approval]', 'data-approval-status')) === 'pending', '');
    ok('A18 its task is a fixed chip', (await text(page, '[data-agent-composer] [data-composer-chip="task"]')).includes('#101'), await text(page, '[data-agent-composer] [data-composer-chips]'));
    ok('A19 running: 停止 replaces 发送', (await count(page, '[data-agent-composer] [data-composer-primary="stop"]')) >= 1 && (await count(page, '[data-agent-composer] [data-composer-primary="send"]')) === 0, '');
    await click(page, '[data-approval-approve]'); await wait(page, 600);
    const apv = sent(state, 'POST', /\/api\/agent\/sessions\/a2\/approvals\/ap-1$/);
    ok('A20 批准执行 sends {decision: approve}', apv.length === 1 && same(bodyOf(apv[0]), { decision: 'approve' }), apv.map((p) => p.body).join(' | '));
    ok('A21 after the decision focus is in the composer', (await page.evaluate(() => document.activeElement?.hasAttribute('data-composer-input'))) === true, await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)));
    await s.ctx.close();
  }
  {
    const s = await open('/agent', { wait: 2400 });
    await click(s.page, '[data-agent-session-item="a2"]'); await wait(s.page, 1500);
    await click(s.page, '[data-approval-deny]'); await wait(s.page, 600);
    const dn = sent(s.state, 'POST', /\/approvals\/ap-1$/);
    ok('A22 拒绝 sends {decision: deny}', dn.length === 1 && same(bodyOf(dn[0]), { decision: 'deny' }), dn.map((p) => p.body).join(' | '));
    await s.ctx.close();
  }
  for (const [i, status, re, retry] of [[23, 403, /没有权限/, false], [24, 429, /429/, true], [25, 500, /发送失败/, true]]) {
    const s = await open('/agent', { wait: 2400, over: (m, u) => (m === 'POST' && /\/messages$/.test(u.pathname) ? { __status: status, body: { detail: 'fixture' } } : undefined) });
    await typeSend(s.page, '保留这段文字');
    const err = await text(s.page, '[data-agent-composer] [data-composer-error]');
    const kept = await input(s.page).inputValue().catch(() => '');
    const hasRetry = (await count(s.page, '[data-agent-composer] [data-composer-retry]')) > 0;
    ok(`A${i} a ${status} on send keeps the text and ${retry ? 'offers' : 'offers no'} retry`, re.test(err) && kept === '保留这段文字' && hasRetry === retry, `${err} · kept=${kept} · retry=${hasRetry}`);
    await s.ctx.close();
  }
  {
    const s = await open('/agent?task=101', { wait: 2400 });
    ok('A26 ?task= puts the task chip on a session without one', (await text(s.page, '[data-agent-composer] [data-composer-chip="task"]')).includes('#101'), await text(s.page, '[data-agent-composer] [data-composer-chips]'));
    await s.ctx.close();
  }
  {
    const s = await open('/agent', { wait: 2400, over: (m, u) => (m === 'GET' && u.pathname === '/api/agent/sessions' ? [] : undefined) });
    ok('A27 no sessions: the start view holds the composer', (await count(s.page, '[data-agent-empty] [data-agent-hero-composer] [data-composer]')) === 1, '');
    const radios = await count(s.page, '[data-agent-composer] [data-composer-mode]');
    await s.page.locator('[data-agent-composer] [data-composer-mode="quick"]').first().click().catch(() => {}); await wait(s.page, 300);
    ok('A28 before a session the mode can be switched', radios === 2 && (await attr(s.page, '[data-agent-composer] [data-composer-mode="quick"]', 'aria-checked')) === 'true', String(radios));
    await input(s.page).fill('/'); await wait(s.page, 300);
    ok('A29 分支 and 导出 are disabled without a session', (await attr(s.page, '[data-composer-menu] [data-menu-row="fork"]', 'aria-disabled')) === 'true' && (await attr(s.page, '[data-composer-menu] [data-menu-row="export"]', 'aria-disabled')) === 'true', '');
    await input(s.page).fill('');
    await s.page.locator('[data-agent-suggest]').first().click().catch(() => {}); await wait(s.page, 900);
    ok('A30 a suggestion creates a session and sends its text', sent(s.state, 'POST', /\/api\/agent\/sessions$/).length === 1 && sent(s.state, 'POST', /\/messages$/).length === 1, s.state.posts.map((p) => p.key).join(' | '));
    await s.ctx.close();
  }
  {
    const s = await open('/agent', { wait: 2400, fail: /\/api\/agent\/settings$/ });
    await input(s.page).fill('/'); await wait(s.page, 300);
    const row = await text(s.page, '[data-composer-menu] [data-menu-row="web"]');
    ok('A31 an unread web setting is not shown as off, and cannot be switched', !/开启联网|关闭联网/.test(row) && (await attr(s.page, '[data-composer-menu] [data-menu-row="web"]', 'aria-disabled')) === 'true', row);
    await s.ctx.close();
  }
  {
    const s = await open('/agent', { wait: 2400, deny: /\/api\/agent\/sessions$/ });
    const m = await main(s.page);
    ok('A32 a 403 list says 无权限 with no retry, and the composer is blocked', (await count(s.page, '[data-agent-denied]')) === 1 && !RETRY.test(m) && (await s.page.locator('[data-composer-primary="send"]').first().isDisabled().catch(() => false)), m.match(RETRY)?.[0] || '');
    await s.ctx.close();
  }
  {
    const s = await open('/agent', { wait: 2400, fail: /\/api\/agent\/sessions$/ });
    const n = s.state.reqs.length;
    const has = (await count(s.page, '[data-agent-retry]')) === 1;
    await s.page.locator('[data-agent-retry]').first().click().catch(() => {}); await wait(s.page, 600);
    ok('A33 a failed list says 未读取 and 重试 reads it again', has && since(s.state, n).includes('GET /api/agent/sessions'), '');
    await s.ctx.close();
  }
  {
    const s = await open('/agent', { wait: 2400, mode: 'stale' });
    s.state.failing = true; await click(s.page, '[data-agent-refresh]'); await wait(s.page, 800);
    ok('A34 a failed refresh keeps the sessions and says so', (await count(s.page, '[data-state="stale"]')) >= 1 && (await count(s.page, '[data-agent-session-item]')) >= 1, '');
    await s.ctx.close();
  }
  {
    const s = await open('/agent', { width: 760, wait: 2400 });
    ok('A35 at 760 the session list is behind a toggle', !(await visible(s.page, '[data-agent-sidebar]')) && (await count(s.page, '[data-agent-session-toggle]')) >= 1, '');
    await click(s.page, '[data-agent-session-toggle]');
    ok('A36 the toggle opens the session list', await visible(s.page, '[data-agent-sidebar]'), '');
    await s.ctx.close();
  }
});

// ═════════════════════════════ E evidence ═════════════════════════════
await group('E', async () => {
  const s = await open('/evidence', { wait: 2200 });
  const { page } = s;
  const rows = () => page.$$eval('[data-discovery-row]', (els) => els.map((e) => e.getAttribute('data-discovery-row')));
  ok('E1 every confirmed item is a row', (await rows()).length === CONFIRMED.length, String((await rows()).length));
  const cell = (k) => text(page, `[data-discovery-value="${k}"]`);
  ok('E2 已确认 reads confirmed_total', (await cell('confirmed_total')).includes(String(OVERVIEW.confirmed_total)), await cell('confirmed_total'));
  ok('E3 待证假设 reads candidates_total', (await cell('candidates_total')).includes(String(OVERVIEW.candidates_total)) && /待证假设/.test(await cell('candidates_total')), await cell('candidates_total'));
  const flt = await text(page, '[data-discovery-confirmed] [role="radiogroup"], [data-discovery-confirmed] [role="tablist"]');
  const realN = CONFIRMED.filter((r) => !r.synthetic).length, synN = CONFIRMED.length - realN;
  ok('E4 the source filter counts the rows read', flt.includes(String(realN)) && flt.includes(String(synN)), flt);
  await click(page, '[data-discovery-filter="real"]');
  ok('E5 真实设备 keeps the real rows', (await rows()).length === realN && (await count(page, '[data-evidence-synthetic]')) === 0, '');
  await click(page, '[data-discovery-filter="synthetic"]');
  ok('E6 合成数据 keeps the synthetic row and marks it', (await rows()).length === synN && (await count(page, '[data-evidence-synthetic]')) === synN, '');
  await click(page, '[data-discovery-filter="all"]');
  const sf = page.locator('[data-evidence-search] input, input[data-evidence-search]').first();
  await sf.fill('wallet').catch(() => {}); await wait(page, 400);
  ok('E7 search by app keeps its row', (await rows()).length === 1, String((await rows()).length));
  await sf.fill('F-102').catch(() => {}); await wait(page, 400);
  ok('E8 search by finding id keeps its row', (await rows()).length === 1, '');
  await sf.fill('没有这个').catch(() => {}); await wait(page, 400);
  ok('E9 no match says so', (await count(page, '[data-discovery-filter-empty]')) === 1, '');
  await sf.fill('').catch(() => {}); await wait(page, 400);
  const id0 = CONFIRMED[0].hypothesis_id;
  await click(page, `[data-discovery-row="${id0}"]`);
  ok('E10 at 1440 the detail opens beside the list', (await count(page, '[data-evidence-side] [data-discovery-detail]')) === 1, '');
  ok('E11 the detail shows the full identifier', (await text(page, '[data-discovery-detail]')).includes(id0), '');
  await click(page, '[data-discovery-detail] [data-ev-copy]');
  ok('E12 复制标识 copies it', (await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')) === id0, '');
  await page.keyboard.press('Escape'); await wait(page, 400);
  ok('E13 Escape closes it and focus returns to the row', (await count(page, '[data-discovery-detail]')) === 0 && (await activeAttr(page, 'data-discovery-row')) === id0, String(await activeAttr(page, 'data-discovery-row')));
  ok('E14 the coverage note is on the page', (await count(page, '[data-discovery-provenance]')) === 1, '');
  ok('E15 the row is the component the workbench uses', (await count(page, '[data-discovery-row][data-focus-inset]')) === CONFIRMED.length
    && fs.readFileSync(path.join(SRC, 'features/evidence/EvidencePage.tsx'), 'utf8').includes("workbench/surfaces/evidence/EvidenceRow")
    && fs.readFileSync(path.join(SRC, 'features/pentest/workbench/surfaces/evidence/EvidenceList.tsx'), 'utf8').includes('EvidenceRow'), '');
  ok('E16 the unresolved panel is on the page', (await count(page, '[data-discovery-unresolved]')) === 1, '');
  await s.ctx.close();
  const t = await open('/evidence', { width: 1024, wait: 2200 });
  await click(t.page, `[data-discovery-row="${id0}"]`);
  ok('E17 at 1024 the detail opens in a drawer', (await count(t.page, '[role="dialog"] [data-discovery-detail]')) === 1, '');
  await t.page.keyboard.press('Escape'); await wait(t.page, 400);
  ok('E18 Escape closes the drawer', (await count(t.page, '[role="dialog"] [data-discovery-detail]')) === 0, '');
  await t.ctx.close();
  const m = await open('/evidence', { wait: 2200, over: (mm, u) => (u.pathname === '/api/v2/overview' ? (({ unresolved_total, ...rest }) => rest)(OVERVIEW) : undefined) });
  ok('E19 a missing count says 未返回, not 0', /未返回/.test(await text(m.page, '[data-discovery-value="unresolved_total"]')) && (await attr(m.page, '[data-discovery-value="unresolved_total"]', 'data-read')) === 'missing', await text(m.page, '[data-discovery-value="unresolved_total"]'));
  await m.ctx.close();
  const n = await open('/evidence', { wait: 2200 });
  const nr = n.state.reqs.length;
  await click(n.page, '[data-evidence-refresh]'); await wait(n.page, 500);
  ok('E20 刷新 reads the overview again', since(n.state, nr).includes('GET /api/v2/overview'), since(n.state, nr).join(' | '));
  await n.ctx.close();
});

// ═════════════════════════════ Y system ═════════════════════════════
const TABS = [['models', '模型'], ['runtime', '运行'], ['devices', '设备'], ['diagnostics', '诊断'], ['audit', '审计日志'], ['users', '用户与权限'], ['tokens', 'API Token']];
await group('Y', async () => {
  {
    const s = await open('/system', { wait: 2200 });
    const labels = await s.page.$$eval('[data-system-tab]', (els) => els.map((e) => e.getAttribute('data-system-tab')));
    ok('Y1 seven tabs in order', same(labels, TABS.map((t) => t[0])), labels.join(','));
    ok('Y2 模型 reads providers, routing and feedback only', same(reqSet(s.state), ['GET /api/feedback', 'GET /api/models/providers', 'GET /api/models/routing']), reqSet(s.state).join(' | '));
    const n = s.state.reqs.length;
    await click(s.page, '[data-system-refresh]'); await wait(s.page, 500);
    ok('Y3 刷新 on 模型 reads the providers again', since(s.state, n).includes('GET /api/models/providers'), since(s.state, n).join(' | '));
    await click(s.page, '[data-system-tab="runtime"]'); await wait(s.page, 800);
    ok('Y4 a click puts ?tab= in the address', (await hash(s.page)) === '/system?tab=runtime', await hash(s.page));
    await s.ctx.close();
  }
  let i = 5;
  for (const [k] of TABS) {
    const s = await open(`/system?tab=${k}`, { wait: 1800 });
    ok(`Y${i++} ?tab=${k} opens ${k}`, (await attr(s.page, `[data-system-tab="${k}"]`, 'aria-selected')) === 'true', '');
    await s.ctx.close();
  }
  {
    const s = await open('/system?tab=bogus', { wait: 1800 });
    ok('Y12 an unknown tab falls back and the address loses it', (await hash(s.page)) === '/system' && (await attr(s.page, '[data-system-tab="models"]', 'aria-selected')) === 'true', await hash(s.page));
    await s.page.locator('[data-user-menu] button').first().click().catch(() => {}); await wait(s.page, 300);
    await click(s.page, '[data-menu-models]');
    ok('Y13 the account menu opens 模型与运行', (await hash(s.page)) === '/system?tab=models', await hash(s.page));
    await s.page.keyboard.press('Control+k'); await wait(s.page, 300);
    await s.page.locator('[data-cmdk-item="/system?tab=runtime"]').first().click().catch(() => {}); await wait(s.page, 1000);
    ok('Y14 the palette opens 系统 · 运行', (await hash(s.page)) === '/system?tab=runtime' && (await attr(s.page, '[data-system-tab="runtime"]', 'aria-selected')) === 'true', await hash(s.page));
    await s.ctx.close();
  }
  {
    const s = await open('/system?tab=runtime', { wait: 2200 });
    ok('Y15 运行 reads settings, web status and resource stats', ['GET /api/agent/settings', 'GET /api/agent/web/status', 'GET /api/system/resource-stats'].every((k) => s.state.reqs.includes(k)), reqSet(s.state).join(' | '));
    ok('Y16 the switch shows the read value', (await attr(s.page, '[data-runtime-switch]', 'data-runtime-switch')) === 'off', '');
    await click(s.page, '[data-runtime-toggle]'); await wait(s.page, 500);
    const p = sent(s.state, 'PATCH', /\/api\/agent\/settings$/);
    ok('Y17 开启联网 sends PATCH {web_enabled: true}', p.length === 1 && same(bodyOf(p[0]), { web_enabled: true }), p.map((x) => x.body).join(' | '));
    ok('Y18 concurrency is read, not guessed', (await text(s.page, '[data-runtime-running]')) === '2' && (await text(s.page, '[data-runtime-quota]')) === '4', '');
    await s.ctx.close();
  }
  {
    const s = await open('/system?tab=runtime', { wait: 2200, fail: /\/api\/agent\/settings$/ });
    const t = await text(s.page, '[data-runtime-web]');
    ok('Y19 an unread switch is disabled and not shown as off', (await s.page.locator('[data-runtime-toggle]').first().isDisabled().catch(() => false)) && !/已关闭/.test(t) && /未读取/.test(t), t.slice(0, 80));
    await s.ctx.close();
  }
  {
    const s = await open('/system', { wait: 2000 });
    const n = s.state.reqs.length;
    await click(s.page, '[data-system-tab="devices"]'); await wait(s.page, 900);
    const extra = since(s.state, n).filter((k) => !POLL.test(k.split(' ')[1]));
    ok('Y20 设备 sends only GET /api/nodes (devices come from the shell poll)', same([...new Set(extra)], ['GET /api/nodes']), extra.join(' | '));
    const rows = await s.page.$$eval('[data-node-row]', (els) => els.map((e) => e.getAttribute('data-node-row')));
    ok('Y21 each node is a row with its state word', same(rows, NODES.map((x) => x.node_id)) && /在线/.test(await text(s.page, '[data-nodes-list]')) && /离线/.test(await text(s.page, '[data-nodes-list]')), rows.join(','));
    await s.ctx.close();
  }
  {
    const s = await open('/system?tab=devices', { wait: 2000, fail: /\/api\/nodes$/ });
    const t = await text(s.page, '[data-nodes-list]');
    ok('Y22 a failed node read says 未读取 with retry, the device list stays', /未读取/.test(t) && RETRY.test(t) && (await count(s.page, '[data-devices-list]')) === 1, t.slice(0, 80));
    await s.ctx.close();
  }
  {
    const s = await open('/system?tab=diagnostics', { wait: 2200 });
    const tok = (await text(s.page, '[data-resource="tokens"]')).replace(/[,\s]/g, '');
    ok('Y23 诊断 shows the 30-day token use that was read', tok.includes('1284000') || tok.includes('1.28M'), tok.slice(0, 80));
    ok('Y24 a field the server did not return says 未返回', /未返回/.test(await text(s.page, '[data-resource="disk"]')), await text(s.page, '[data-resource="disk"]'));
    ok('Y25 建议反馈 moved here', (await count(s.page, '[data-feedback-stats]')) === 1, '');
    await s.ctx.close();
  }
  {
    const s = await open('/system?tab=runtime', { role: 'user', wait: 2000 });
    ok('Y26 a non-admin sees the page permission state and no system read', /需要管理员权限/.test(await main(s.page)) && !s.state.reqs.some((k) => /models\/providers|agent\/settings|resource-stats|\/api\/nodes/.test(k)), reqSet(s.state).join(' | '));
    await s.ctx.close();
  }
});

// ═════════════════════════════ C confirms ═════════════════════════════
await group('C', async () => {
  let nativeCalls = [];
  const ai = async () => open('/ai-assistant', { wait: 2200, over: chatWithMsg });
  const itemSel = '[data-chat-item="示例对话"]';
  {
    const s = await ai();
    await s.page.hover(itemSel).catch(() => {});
    await s.page.locator(`${itemSel} button[aria-label="重命名"]`).first().click().catch(() => {}); await wait(s.page, 600);
    const open1 = (await count(s.page, '[data-ai-rename-dialog]')) === 1;
    await click(s.page, '[data-ai-rename-cancel]');
    ok('C1 重命名 opens a dialog (it was the browser prompt); cancel sends nothing', open1 && sent(s.state, 'PATCH', /\/api\/chat\/sessions\//).length === 0, '');
    ok('C2 cancel returns focus to 重命名', (await s.page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === '重命名', await s.page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)));
    await s.page.hover(itemSel).catch(() => {});
    await s.page.locator(`${itemSel} button[aria-label="重命名"]`).first().click().catch(() => {}); await wait(s.page, 500);
    await s.page.locator('[data-ai-rename-input]').first().fill('新的名字').catch(() => {});
    await s.page.locator('[data-ai-rename-input]').first().press('Enter').catch(() => {}); await wait(s.page, 600);
    const r = sent(s.state, 'PATCH', /\/api\/chat\/sessions\/1$/);
    ok('C3 Enter saves: PATCH /api/chat/sessions/1 {title}', r.length === 1 && same(bodyOf(r[0]), { title: '新的名字' }), r.map((x) => x.body).join(' | '));
    await s.page.hover(itemSel).catch(() => {});
    await s.page.locator(`${itemSel} button[aria-label="删除会话"]`).first().click().catch(() => {}); await wait(s.page, 500);
    const dt = await text(s.page, '[role="alertdialog"], [role="dialog"]:has([data-confirm-ok])');
    await click(s.page, '[data-confirm-cancel]');
    ok('C4 删除 asks in the kit dialog; cancel sends nothing', /删除会话/.test(dt) && sent(s.state, 'DELETE', /\/api\/chat\/sessions\//).length === 0, dt.slice(0, 60));
    await s.page.hover(itemSel).catch(() => {});
    await s.page.locator(`${itemSel} button[aria-label="删除会话"]`).first().click().catch(() => {}); await wait(s.page, 400);
    await click(s.page, '[data-confirm-ok]'); await wait(s.page, 600);
    ok('C5 confirm sends DELETE /api/chat/sessions/1', sent(s.state, 'DELETE', /\/api\/chat\/sessions\/1$/).length === 1, '');
    nativeCalls.push(...(await native(s.page)));
    await s.ctx.close();
  }
  {
    const s = await ai();
    await click(s.page, '[data-batch-toggle]');
    await s.page.locator('[data-batch-check="1"]').first().check().catch(() => {});
    await click(s.page, '[data-batch-delete]');
    const bt = await text(s.page, '[role="alertdialog"], [role="dialog"]:has([data-confirm-ok])');
    await click(s.page, '[data-confirm-cancel]');
    ok('C6 批量删除 asks with the count and 不可恢复; cancel sends nothing', /1 个会话/.test(bt) && /不可恢复/.test(bt) && sent(s.state, 'DELETE', /chat\/sessions/).length === 0, bt.slice(0, 60));
    await s.page.locator('[data-batch-check="1"]').first().check().catch(() => {});
    await click(s.page, '[data-batch-delete]'); await click(s.page, '[data-confirm-ok]'); await wait(s.page, 600);
    ok('C7 confirm sends one DELETE per selected session', sent(s.state, 'DELETE', /\/api\/chat\/sessions\/1$/).length === 1, '');
    nativeCalls.push(...(await native(s.page)));
    await s.ctx.close();
  }
  {
    const s = await ai();
    await click(s.page, itemSel); await wait(s.page, 800);
    await s.page.locator('[data-devmode-toggle] input').first().check().catch(() => {}); await wait(s.page, 900);
    await s.page.locator('textarea').last().fill('总结主要发现').catch(() => {});
    await s.page.getByRole('button', { name: '真跑一条' }).first().click().catch(() => {}); await wait(s.page, 500);
    const rt = await text(s.page, '[role="alertdialog"], [role="dialog"]:has([data-confirm-ok])');
    await click(s.page, '[data-confirm-cancel]');
    ok('C8 真跑一条 asks first; cancel sends nothing', /真跑一次/.test(rt) && sent(s.state, 'POST', /prompt-run/).length === 0, rt.slice(0, 60));
    await s.page.getByRole('button', { name: '真跑一条' }).first().click().catch(() => {}); await wait(s.page, 400);
    await click(s.page, '[data-confirm-ok]'); await wait(s.page, 700);
    const pr = sent(s.state, 'POST', /\/api\/chat\/sessions\/1\/prompt-run$/);
    ok('C9 confirm sends the same prompt-run request', pr.length === 1 && same(bodyOf(pr[0]), { q: '总结主要发现' }), pr.map((x) => x.body).join(' | '));
    ok('C10 the archive note points to the Agent', (await attr(s.page, '[data-ai-archive-agent]', 'href') || '').endsWith('#/agent'), await attr(s.page, '[data-ai-archive-agent]', 'href'));
    nativeCalls.push(...(await native(s.page)));
    await s.ctx.close();
  }
  {
    const s = await open('/agent', { wait: 2400 });
    const item = s.page.locator('[data-agent-session-item="a2"]').first();
    await item.hover().catch(() => {});
    await s.page.locator('[data-agent-session-item="a2"] [data-agent-delete]').first().click().catch(() => {}); await wait(s.page, 500);
    const opened = (await count(s.page, '[data-confirm-ok]')) === 1;
    await click(s.page, '[data-confirm-cancel]');
    ok('C11 Agent 删除 asks in the kit dialog; cancel sends nothing', opened && sent(s.state, 'DELETE', /agent\/sessions/).length === 0, '');
    ok('C12 cancel returns focus to the delete button', (await s.page.evaluate(() => document.activeElement?.hasAttribute('data-agent-delete'))) === true, await s.page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)));
    await item.hover().catch(() => {});
    await s.page.locator('[data-agent-session-item="a2"] [data-agent-delete]').first().click().catch(() => {}); await wait(s.page, 400);
    await click(s.page, '[data-confirm-ok]'); await wait(s.page, 700);
    ok('C13 confirm sends DELETE /api/agent/sessions/a2', sent(s.state, 'DELETE', /\/api\/agent\/sessions\/a2$/).length === 1, s.state.posts.map((p) => p.key).join(' | '));
    nativeCalls.push(...(await native(s.page)));
    await s.ctx.close();
  }
  {
    const s = await open('/agent', { wait: 2400 });
    await click(s.page, '[data-agent-manage]');
    await click(s.page, '[data-agent-session-item="a2"]');
    await click(s.page, '[data-agent-batch-delete]');
    const bt = await text(s.page, '[role="alertdialog"], [role="dialog"]:has([data-confirm-ok])');
    await click(s.page, '[data-confirm-cancel]');
    ok('C14 Agent 批量删除 asks first; cancel sends nothing', /删除/.test(bt) && /软删除/.test(bt) && sent(s.state, 'DELETE', /agent\/sessions/).length === 0, bt.slice(0, 60));
    await click(s.page, '[data-agent-manage]'); await click(s.page, '[data-agent-manage]');
    await click(s.page, '[data-agent-session-item="a2"]');
    await click(s.page, '[data-agent-batch-delete]'); await click(s.page, '[data-confirm-ok]'); await wait(s.page, 900);
    ok('C15 confirm sends DELETE for each selected session', sent(s.state, 'DELETE', /\/api\/agent\/sessions\/a2$/).length === 1, s.state.posts.map((p) => p.key).join(' | '));
    nativeCalls.push(...(await native(s.page)));
    await s.ctx.close();
  }
  ok('C16 no page called window.confirm or window.prompt', nativeCalls.length === 0, nativeCalls.join(' | '));
});

// ═════════════════════════════ T retired ═════════════════════════════
await group('T', async () => {
  {
    const s = await open('/skills', { wait: 2200 });
    ok('T1 /skills redirects to /knowledge', (await hash(s.page)).startsWith('/knowledge'), await hash(s.page));
    ok('T2 …and renders the knowledge page', (await count(s.page, '[data-knowledge-page]')) === 1, '');
    await s.ctx.close();
  }
  {
    const s = await open('/discovery', { wait: 2200 });
    ok('T3 /discovery redirects to /evidence', (await hash(s.page)).startsWith('/evidence'), await hash(s.page));
    ok('T4 …and renders the evidence page with its counts and list', (await count(s.page, '[data-evidence-page] [data-discovery-kpis]')) === 1 && (await count(s.page, '[data-discovery-row]')) === CONFIRMED.length, '');
    await s.ctx.close();
  }
  {
    const s = await open('/knowledge', { wait: 2200 });
    await click(s.page, '[data-knowledge-tab="review"]');
    ok('T5 the old candidate panel lives in 候选审核 (?tab=review)', (await hash(s.page)) === '/knowledge?tab=review' && (await count(s.page, '[data-kb-cand-card]')) === PENDING.length, await hash(s.page));
    await click(s.page, '[data-kb-cand-inspect="1"]');
    ok('T6 the old candidate card detail is the candidate drawer', (await count(s.page, '[data-kb-cand-inspector="1"]')) === 1, '');
    await s.page.keyboard.press('Escape'); await wait(s.page, 300);
    await s.page.locator('[data-kb-graph-disclosure] summary').first().click().catch(() => {}); await wait(s.page, 800);
    ok('T7 the relation graph is behind its disclosure and loads on demand', (await count(s.page, '[data-kb-graph-query]')) === 1, '');
    await click(s.page, '[data-knowledge-tab="library"]');
    await click(s.page, '[data-skill-row="1"]'); await wait(s.page, 600);
    ok('T8 the old skill card is the detail drawer with facts, actions, mount and source', ['[data-skill-actions]', '[data-skill-mount]', '[data-skill-source]'].every(Boolean) && (await count(s.page, '[data-skill-detail] [data-skill-actions]')) === 1 && (await count(s.page, '[data-skill-detail] [data-skill-mount]')) === 1 && (await count(s.page, '[data-source-pre]')) === 1, '');
    await s.ctx.close();
  }
  {
    const s = await open('/agent', { wait: 2400 });
    ok('T9 the old Agent composer is the shared composer', (await count(s.page, '[data-agent-composer] [data-composer-input]')) >= 1 && (await count(s.page, '[data-agent-composer] [data-composer-model]')) >= 1, '');
    await s.ctx.close();
  }
  const gone = ['features/skills/SkillsPage.tsx', 'features/skills/SkillCard.tsx', 'features/skills/CandidateCard.tsx', 'features/skills/skillsShared.tsx', 'features/discovery/DiscoveryPage.tsx', 'features/agent/components_agent/AgentComposer.tsx'];
  const left = gone.filter((f) => fs.existsSync(path.join(SRC, f)) || fs.existsSync(path.join(SRC, f.replace(/\.tsx$/, '.ts'))));
  ok('T10 the retired files are gone', left.length === 0, left.join(', '));
  const refs = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(tsx?|mjs)$/.test(e.name)) { const t = fs.readFileSync(p, 'utf8'); if (/features\/skills\/|features\/discovery\/|AgentComposer['"/]/.test(t)) refs.push(path.relative(SRC, p)); } } };
  walk(SRC);
  ok('T11 nothing imports them', refs.length === 0, refs.join(', '));
  const routes = fs.readFileSync(path.join(SRC, 'app/routes.tsx'), 'utf8');
  ok('T12 the route table loads the new pages', /features\/knowledge\/KnowledgePage/.test(routes) && /features\/evidence\/EvidencePage/.test(routes), '');
});

// ═════════════════════════════ Q requests ═════════════════════════════
await group('Q', async () => {
  const pairs = [['/knowledge', 'admin'], ['/knowledge', 'user'], ['/evidence', 'admin'], ['/agent', 'admin'], ['/system', 'admin'], ['/ai-assistant', 'admin']];
  let i = 1;
  for (const [route, role] of pairs) {
    const a = await open(route, { role, wait: 2600 }); const now = reqSet(a.state); await a.ctx.close();
    const b = await open(route, { role, wait: 2600, root: baseline }); const was = reqSet(b.state); await b.ctx.close();
    ok(`Q${i++} ${route} (${role}) first load sends the same requests as 777f03e`, same(now, was), `now: ${now.join(' | ')} · 777f03e: ${was.join(' | ')}`);
  }
  {
    const a = await open('/knowledge?tab=review', { wait: 2400 });
    const b = await open('/knowledge', { wait: 2400 });
    ok('Q7 opening 候选审核 directly sends no extra request', same(reqSet(a.state), reqSet(b.state)), reqSet(a.state).join(' | '));
    await a.ctx.close(); await b.ctx.close();
  }
  {
    const a = await open('/knowledge?tab=review', { role: 'user', wait: 2400 });
    ok('Q8 a non-admin on ?tab=review goes back to the library and reads no candidates', (await hash(a.page)) === '/knowledge' && !a.state.reqs.some((k) => k.includes('/kb/candidates')), await hash(a.page));
    await a.ctx.close();
  }
  {
    const a = await open('/system', { wait: 2000 });
    for (const k of ['runtime', 'diagnostics', 'runtime']) { await click(a.page, `[data-system-tab="${k}"]`); await wait(a.page, 700); }
    const stats = a.state.reqs.filter((k) => k === 'GET /api/system/resource-stats').length;
    ok('Q9 switching tabs reads each endpoint once', stats === 1 && a.state.reqs.filter((k) => k === 'GET /api/agent/settings').length === 1, `resource-stats ×${stats}`);
    await a.ctx.close();
  }
  const zero = async (n, route, opts, sel, label) => {
    const s = await open(route, { wait: 2400, ...opts });
    const t = await text(s.page, sel);
    ok(`Q${n} ${label}: no 0 from data that was not read`, t.length > 0 && !/(^|[^\d.])0([^\d.]|$)/.test(t), t.slice(0, 100));
    await s.ctx.close();
  };
  await zero(10, '/knowledge', { fail: /\/api\/skills$/ }, '[data-knowledge-total]', '条目 when /api/skills fails');
  await zero(11, '/knowledge', { fail: /\/api\/kb\/candidates$/ }, '[data-knowledge-pending]', '待审候选 when candidates fail');
  await zero(12, '/knowledge', { fail: /\/api\/kb\/candidates$/ }, '[data-knowledge-tab="review"]', 'the review tab label');
  await zero(13, '/evidence', { fail: /\/api\/v2\/overview$/ }, '[data-readout-row]', 'evidence counts');
  await zero(14, '/system?tab=runtime', { fail: /resource-stats/ }, '[data-runtime-slots]', 'concurrency');
  await zero(15, '/system?tab=diagnostics', { fail: /resource-stats/ }, '[data-resource-stats]', 'resource use');
  {
    const s = await open('/system', { wait: 2400, fail: /models\/providers/ });
    const m = await main(s.page);
    ok('Q16 the provider count: no 0 from data that was not read', /供应商\(未读取\)/.test(m) && !/供应商\(0\)/.test(m), (m.match(/供应商\([^)]*\)/) || [''])[0]);
    await s.ctx.close();
  }
  const deny = async (n, route, re, label, extra = {}) => {
    const s = await open(route, { wait: 2400, deny: re, ...extra });
    const m = await main(s.page);
    ok(`Q${n} ${label}: 403 says 无权限 with no retry`, /无权限|不能读取|没有权限/.test(m) && !RETRY.test(m), m.match(RETRY)?.[0] || '');
    await s.ctx.close();
  };
  await deny(17, '/knowledge', /\/api\/skills$/, 'the knowledge list');
  await deny(18, '/knowledge?tab=review', /\/api\/kb\/candidates$/, 'the candidates');
  await deny(19, '/evidence', /\/api\/v2\/overview$/, 'the evidence overview');
  await deny(20, '/agent', /\/api\/agent\/sessions$/, 'the Agent sessions');
  await deny(21, '/system?tab=devices', /\/api\/nodes$/, 'the nodes');
  await deny(22, '/ai-assistant', /\/api\/chat\/sessions$/, 'the archive list');
});

// ═════════════════════════════ KB keyboard ═════════════════════════════
const focusRing = (page) => page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none'); });
await group('KB', async () => {
  {
    const s = await open('/knowledge', { wait: 2200 });
    await s.page.locator('[data-knowledge-tab="library"]').first().focus();
    await s.page.keyboard.press('ArrowRight'); await wait(s.page, 500);
    ok('KB1 → moves from 技能库 to 候选审核', (await attr(s.page, '[data-knowledge-tab="review"]', 'aria-selected')) === 'true' && (await hash(s.page)) === '/knowledge?tab=review', await hash(s.page));
    await s.page.keyboard.press('ArrowLeft'); await wait(s.page, 500);
    ok('KB2 ← moves back and the address loses ?tab=', (await attr(s.page, '[data-knowledge-tab="library"]', 'aria-selected')) === 'true' && (await hash(s.page)) === '/knowledge', await hash(s.page));
    await s.page.locator('[data-skill-row="1"]').first().focus();
    await s.page.keyboard.press('ArrowDown'); await wait(s.page, 200);
    ok('KB3 ↓ moves to the next row', (await activeAttr(s.page, 'data-skill-row')) === '2', String(await activeAttr(s.page, 'data-skill-row')));
    ok('KB4 the focused row shows a focus ring', await focusRing(s.page), '');
    await s.page.keyboard.press('Enter'); await wait(s.page, 600);
    ok('KB5 Enter opens that row', (await attr(s.page, '[data-skill-detail]', 'data-skill-detail')) === SKILLS[1].name, '');
    await s.page.keyboard.press('Escape'); await wait(s.page, 500);
    ok('KB6 Escape closes it and focus returns to the row', (await count(s.page, '[data-skill-detail]')) === 0 && (await activeAttr(s.page, 'data-skill-row')) === '2', String(await activeAttr(s.page, 'data-skill-row')));
    await s.page.locator('[data-knowledge-more]').first().focus();
    await s.page.keyboard.press('Enter'); await wait(s.page, 300);
    const opened = (await count(s.page, '[data-skills-rescan]')) >= 1;
    await s.page.keyboard.press('Escape'); await wait(s.page, 300);
    ok('KB7 更多 opens with Enter and Escape returns to it', opened && (await s.page.evaluate(() => document.activeElement?.hasAttribute('data-knowledge-more'))), '');
    await s.ctx.close();
  }
  {
    const s = await open('/knowledge?tab=review', { wait: 2200 });
    await s.page.locator('[data-kb-cand-inspect="1"]').first().focus();
    await s.page.keyboard.press('Enter'); await wait(s.page, 500);
    const op = (await count(s.page, '[data-kb-cand-inspector="1"]')) === 1;
    await s.page.keyboard.press('Escape'); await wait(s.page, 500);
    ok('KB8 a candidate opens with Enter and Escape returns to its title', op && (await activeAttr(s.page, 'data-kb-cand-inspect')) === '1', '');
    await s.ctx.close();
  }
  {
    const s = await open('/system', { wait: 2000 });
    await s.page.locator('[data-system-tab="models"]').first().focus();
    await s.page.keyboard.press('ArrowRight'); await wait(s.page, 700);
    ok('KB9 → on the system tabs opens 运行 and sets ?tab=', (await hash(s.page)) === '/system?tab=runtime', await hash(s.page));
    await s.ctx.close();
  }
  {
    const s = await open('/evidence', { wait: 2200 });
    const [a, b] = CONFIRMED.map((r) => r.hypothesis_id);
    await s.page.locator(`[data-discovery-row="${a}"]`).first().focus();
    await s.page.keyboard.press('ArrowDown'); await wait(s.page, 200);
    ok('KB10 ↓ moves to the next evidence row', (await activeAttr(s.page, 'data-discovery-row')) === b, String(await activeAttr(s.page, 'data-discovery-row')));
    await s.page.keyboard.press('Enter'); await wait(s.page, 500);
    ok('KB11 Enter opens its detail', (await text(s.page, '[data-discovery-detail]')).includes(b), '');
    await s.page.keyboard.press('Escape'); await wait(s.page, 400);
    ok('KB12 Escape returns focus to that row', (await activeAttr(s.page, 'data-discovery-row')) === b, String(await activeAttr(s.page, 'data-discovery-row')));
    await s.ctx.close();
  }
});

// ═════════════════════════════ V widths and themes ═════════════════════════════
const VIEWS = [['knowledge', '/knowledge'], ['review', '/knowledge?tab=review'], ['agent', '/agent'], ['evidence', '/evidence'], ['system', '/system'], ['system-runtime', '/system?tab=runtime'], ['assistant', '/ai-assistant']];
await group('V', async () => {
  for (const th of ['light', 'dark']) for (const w of [390, 760, 1024, 1280, 1440, 1680]) for (const [name, route] of VIEWS) {
    const s = await open(route, { width: w, theme: th, wait: 2200, over: name === 'assistant' ? chatWithMsg : null });
    const ov = await overflow(s.page);
    const m = await s.page.evaluate(() => {
      const parse = (c) => { const m2 = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/); return m2 ? [+m2[1], +m2[2], +m2[3], m2[4] == null ? 1 : +m2[4]] : null; };
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { stack.push(c); if (c[3] >= 1) break; } }
        let acc = parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1];
        for (const c of stack.reverse()) acc = [0, 1, 2].map((i) => c[i] * c[3] + acc[i] * (1 - c[3])).concat(1);
        return acc; };
      const low = []; let n = 0;
      const root = document.querySelector('main');
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      while (walker.nextNode()) {
        const t = walker.currentNode; if (!t.textContent.trim()) continue;
        const el = t.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
        const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
        if (el.closest('[aria-hidden="true"], [disabled], .sr-only, [data-state="loading"], option')) continue;
        const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        const fg = parse(cs.color); if (!fg) continue; const bg = bgOf(el);
        const fgc = [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
        const [a, b] = [lum(fgc), lum(bg)].sort((x, y) => y - x); const ratio = (a + 0.05) / (b + 0.05);
        const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
        n++; if (ratio < (large ? 3 : 4.5)) low.push(`${t.textContent.trim().slice(0, 12)} ${ratio.toFixed(2)}`);
      }
      const covered = [];
      for (const el of root.querySelectorAll('button, a[href], input, select, textarea, [role="tab"], summary')) {
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
        const x = r.left + r.width / 2, y = r.top + r.height / 2; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        let clipped = false; for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const q = p.getBoundingClientRect(); if (x < q.left || x > q.right || y < q.top || y > q.bottom) { clipped = true; break; } } }
        if (clipped || el.closest('.sr-only')) continue;
        const hit = document.elementFromPoint(x, y); if (hit && !el.contains(hit) && !hit.contains(el)) covered.push((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 16) + ' under ' + (hit.getAttribute('data-cmdk') != null ? 'palette' : hit.tagName));
      }
      return { low, n, covered };
    });
    ok(`V ${name} @${w} ${th}: no overflow, no page error, nothing covered, text contrast ≥ 4.5:1`, ov <= 1 && s.state.errors.length === 0 && m.covered.length === 0 && m.low.length === 0 && m.n > 5,
      `${ov}px · ${s.state.errors.length} errors · covered: ${m.covered.slice(0, 3).join(' | ')} · low: ${m.low.slice(0, 3).join(' | ')} (${m.n} texts)`);
    if ([1440, 1024, 760, 390].includes(w)) await shot(s.page, `${name}-${w}-${th}.png`);
    await s.ctx.close();
  }
});

// ═════════════════════════════ S states (384 cells) ═════════════════════════════
const SURFACES = [
  ['library', '/knowledge', '[data-knowledge-refresh]', '[data-skill-row]', ['[data-skills-empty]', '[data-skills-empty-rescan]']],
  ['review', '/knowledge?tab=review', '[data-knowledge-refresh]', '[data-kb-cand-card]', ['[data-kb-candidates-empty]']],
  ['agent', '/agent', '[data-agent-refresh]', '[data-agent-session-item]', ['[data-agent-empty]', '[data-agent-suggest]']],
  ['evidence', '/evidence', '[data-evidence-refresh]', '[data-discovery-row]', ['[data-evidence-empty]']],
  ['system-models', '/system', '[data-system-refresh]', '[data-provider-card]', ['[data-models-empty]']],
  ['runtime', '/system?tab=runtime', '[data-system-refresh]', '[data-runtime-running]', ['[data-runtime-web-empty]']],
  ['devices', '/system?tab=devices', '[data-system-refresh]', '[data-node-row]', ['[data-nodes-empty]', '[data-devices-empty]']],
  ['assistant', '/ai-assistant', '[data-ai-refresh]', '[data-chat-item]', ['[data-ai-list-empty]', '[data-ai-list-empty] a[href$="#/agent"]']],
];
await group('S', async () => {
  const STATES = ['empty', 'loading', 'error', 'forbidden', 'slow', 'stale'];
  const LOADING = '[data-state="loading"], [data-read="loading"], [role="status"], .motion-safe\\:animate-pulse, .animate-pulse';
  const blank = (page) => page.evaluate(() => {
    const root = document.querySelector('main'); const rs = [];
    for (const el of root.querySelectorAll('h1, h2, h3, p, li, td, th, button, a, input, textarea, dt, dd, [data-state], [role="status"], svg')) { const r = el.getBoundingClientRect(); if (r.width && r.height && r.top < innerHeight) rs.push([r.top, r.bottom]); }
    rs.sort((a, b) => a[0] - b[0]); let gap = 0, end = rs.length ? rs[0][1] : 0;
    for (const [t, b] of rs) { if (t > end) gap = Math.max(gap, t - end); end = Math.max(end, b); }
    return gap;
  });
  for (const th of ['light', 'dark']) for (const w of [1440, 1024, 760, 390]) for (const [name, route, refresh, rowSel, empties] of SURFACES.filter(([n]) => !process.env.SURF || process.env.SURF.split(',').includes(n))) for (const stt of STATES) {
    const mode = stt === 'loading' ? 'delay' : stt === 'stale' ? 'stale' : stt;
    const s = await open(route, { width: w, theme: th, mode, wait: stt === 'loading' ? 300 : stt === 'slow' ? 2600 : 2400, over: name === 'assistant' ? chatWithMsg : null });
    let pass = true; const why = [];
    try {
      if (stt === 'loading') {
        if (!(await count(s.page, LOADING))) { pass = false; why.push('no loading placeholder at 300 ms'); }
        await s.page.waitForTimeout(2400);
      }
      if (stt === 'stale') {
        s.state.failing = true;
        const btn = s.page.locator(refresh).first();
        if (await btn.count()) await btn.click().catch((e) => { pass = false; why.push('refresh not clickable: ' + first(e)); }); else { pass = false; why.push(`no ${refresh}`); }
        await s.page.waitForTimeout(1600);
        if (name === 'agent' && w < 1024) { await s.page.locator('[data-agent-session-toggle]').first().click().catch(() => {}); await wait(s.page, 300); }
        if (!(await count(s.page, '[data-state="stale"]'))) { pass = false; why.push('no stale notice'); }
        if (!(await count(s.page, rowSel))) { pass = false; why.push('the data left the screen'); }
      }
      const m = await main(s.page);
      if (stt === 'empty') {
        if (name === 'assistant' && w < 1024) { await s.page.locator('[data-ai-session-toggle]').first().click().catch(() => {}); await wait(s.page, 300); }
        if (name === 'agent' && w < 1024) { /* the start view is in the transcript */ }
        for (const q of empties) if (!(await count(s.page, q))) { pass = false; why.push(`missing ${q}`); }
      }
      if (stt === 'error') {
        if (!/未读取|没有读到|没有成功|失败/.test(m)) { pass = false; why.push('no failure description'); }
        if (!RETRY.test(m)) { pass = false; why.push('no retry'); }
      }
      if (stt === 'forbidden') {
        if (!/无权限|没有访问权限|没有查看|不能读取|没有权限/.test(m)) { pass = false; why.push('no permission description'); }
        if (RETRY.test(m)) { pass = false; why.push(`retry wording on 403: ${m.match(RETRY)[0]}`); }
      }
      if (stt === 'slow') {
        if (!(await count(s.page, LOADING))) { pass = false; why.push('no loading placeholder while unanswered'); }
        if (!(await count(s.page, '[data-slow]'))) { pass = false; why.push('no slow note after 2 s'); }
      }
      // A readout cell that was not read (data-read is not value / stale) must not show 0; a cell read from
      // storage or the server may say 0 (本地条目 is read from this browser).
      const unreadCells = await s.page.$$eval('[data-readout-row] [data-read]', (els) => els.filter((e) => !['value', 'stale'].includes(e.getAttribute('data-read'))).map((e) => e.textContent.replace(/\s+/g, ' ')));
      if (stt !== 'slow' && stt !== 'loading' && stt !== 'empty' && unreadCells.some((t) => /(^|[^\d.])0([^\d.]|$)/.test(t))) { pass = false; why.push('a 0 from data that was not read: ' + unreadCells.join(' | ')); }
      if (await count(s.page, '[data-error-boundary]')) { pass = false; why.push('error boundary'); }
      if (s.state.errors.length) { pass = false; why.push('page error: ' + s.state.errors[0]); }
      const gap = await blank(s.page);
      if (gap > 900 / 3) { pass = false; why.push(`blank area ${Math.round(gap)}px`); }
      if ((w === 1440 || w === 390) && th === 'light') await shot(s.page, `state-${name}-${stt}-${w}.png`);
    } catch (e) { pass = false; why.push(first(e)); }
    ok(`S ${name} ${stt} @${w} ${th}: says what happened and what to do next`, pass, why.join('; '));
    await s.ctx.close();
  }
});

await browser.close();
const bad = summary();
process.exit(bad ? 1 : 0);
