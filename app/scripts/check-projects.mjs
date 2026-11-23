#!/usr/bin/env node
// Dev-only acceptance for the unified project domain (V3 Phase 2), on fixtures.
// Needs `npx vite preview --port 4173`. Usage: node scripts/check-projects.mjs [--out dir]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
import { resolve as fixture } from './fixtures/api.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:4173/v2/');
const out = arg('out', '');
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch();
async function open(route, { width = 1440, fail = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('token', 'fixture-token'); } catch {} });
  const page = await ctx.newPage();
  const errors = []; const posts = []; const gets = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/**', (r) => {
    const req = r.request(); const url = new URL(req.url());
    if (/\/stream$|send_stream$/.test(url.pathname)) return r.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    if (req.method() === 'GET') gets.push(url.pathname + url.search);
    if (fail && fail.test(url.pathname)) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"fixture: internal error"}' });
    if (req.method() === 'POST' && url.pathname === '/api/pentest/projects') { posts.push(JSON.parse(req.postData() || '{}')); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"id":1}' }); }
    const body = fixture(req.method(), url);
    return r.fulfill(typeof body === 'string' ? { status: 200, contentType: 'text/plain; charset=utf-8', body } : { status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(base + '#' + route); await page.waitForTimeout(1300);
  return { ctx, page, errors, posts, gets };
}
const hash = (page) => new URL(page.url()).hash.replace(/^#/, '');
const has = (page, sel) => page.locator(sel).count().then((n) => n > 0);

// 1. One index, no second entry.
{
  const { ctx, page, errors } = await open('/projects');
  ok('index renders the unified page', await has(page, '[data-projects]') && !errors.length, errors.join('; '));
  ok('temporary "会话索引" entry is gone', !(await has(page, '[data-projects-legacy-sessions]')));
  ok('rail has one project entry', (await page.locator('nav [data-nav-item="/projects"]').count()) === 1 && !(await has(page, '[data-nav-item="/pentest"], [data-nav-item="/company"]')));
  const rows = await page.locator('[data-company-project]').evaluateAll((els) => els.map((e) => e.getAttribute('data-project-scope')));
  ok('all scope lists every project', rows.length === 3, `rows: ${rows.join(',')}`);
  // 2. Three scopes.
  for (const [scope, want] of [['company', 1], ['single', 2], ['all', 3]]) {
    await page.locator(`[data-project-scope-tab="${scope}"]`).click(); await page.waitForTimeout(250);
    const got = await page.locator('[data-company-project]').evaluateAll((els) => els.map((e) => e.getAttribute('data-project-scope')));
    const q = new URLSearchParams(hash(page).split('?')[1] || '').get('scope');
    ok(`scope ${scope}`, got.length === want && (scope === 'all' ? q === null : q === scope && got.every((s) => s === scope)), `rows ${got.length}, ?scope=${q}`);
  }
  // Hooks of the two retired indexes that are in the DOM with data on screen.
  const idx = ['[data-company-projects]', '[data-pentest-projects]', '[data-company-create]', '[data-newproject-btn]', '[data-toolbar-create]', '[data-toolbar-import]',
    '[data-toolbar-export]', '[data-toolbar-export-toggle]', '[data-toolbar-actions]', '[data-overview-bar]', '[data-company-portfolio]', '[data-probe="stat-projects-total"]',
    '[data-probe="stat-running-projects"]', '[data-probe="stat-covered-apps"]', '[data-probe="stat-sessions-total"]', '[data-probe="stat-devices"]', '[data-probe="stat-high-sev"]',
    '[data-active-sessions]', '[data-active-session]', '[data-toolbar="projects"]', '[data-company-toolbar]', '[data-toolbar-main]', '[data-probe="proj-search"]', '[data-toolbar-search]',
    '[data-toolbar-sort]', '[data-view-toggle]', '[data-view-btn="cards"]', '[data-view-btn="table"]', '[data-filter-bar]', '[data-toolbar-filters]', '[data-toolbar-filter="high"]',
    '[data-probe^="packer-chip-"]', '[data-probe^="status-chip-"]', '[data-card-grid][data-view="table"]', '[data-probe="proj-row-1"]', '[data-company-primary]', '[data-company-primary-open]',
    '[data-probe="prog-text-1"]', '[data-probe="prog-bar-1"]', '[data-probe="stage-1-0"]', '[data-probe="sev-row-1"]', '[data-probe="enter-workbench-1"]', '[data-probe="proj-menu-1"]',
    '[data-probe="proj-menu-btn-1"]', '[data-probe="pkg-copy-1"]', '[data-probe="device-dot-1"]', '[data-toolbar="projects-pager"]'];
  const missing = []; for (const s of idx) if (!(await has(page, s))) missing.push(s);
  ok('index hooks present', !missing.length, missing.join(' '));
  await page.locator('[data-probe="proj-menu-btn-1"]').click(); await page.waitForTimeout(200);
  const menu = ['[data-probe="proj-menu-panel-1"]', '[data-probe="report-entry-1"]', '[data-probe="proj-menu-newsession-1"]', '[data-probe="proj-menu-copy-1"]', '[data-probe="proj-menu-export-1"]'];
  const mm = []; for (const s of menu) if (!(await has(page, s))) mm.push(s);
  ok('row menu hooks present', !mm.length, mm.join(' '));
  await page.keyboard.press('Escape');
  await page.locator('[data-toolbar-export-toggle]').click(); await page.waitForTimeout(200);
  ok('export menu hooks present', await has(page, '[data-toolbar-export-panel] [data-toolbar-export-item="csv"]'));
  await page.keyboard.press('Escape');
  await page.locator('[data-view-btn="cards"]').click(); await page.waitForTimeout(250);
  ok('card view uses the same row component', await has(page, '[data-card-grid][data-view="cards"] [data-probe="proj-card-1"]'));
  await page.locator('[data-view-btn="table"]').click();
  await page.locator('[data-toolbar-filter="high"]').click(); await page.waitForTimeout(200);
  ok('risk filter narrows the list', (await page.locator('[data-company-project]').count()) === 2);
  await page.locator('[data-probe="proj-search"]').fill('no-such-project'); await page.waitForTimeout(250);
  ok('filtered-empty state with reset', await has(page, '[data-empty-filtered] [data-reset-filters]'));
  await ctx.close();
}

// 3. One create dialog with a type choice; payloads as before.
{
  const { ctx, page, posts } = await open('/projects');
  await page.locator('[data-company-create]').click(); await page.waitForTimeout(300);
  ok('one create dialog with both types', (await page.locator('[role="dialog"]').count()) === 1 && await has(page, '[data-project-kind="company"]') && await has(page, '[data-project-kind="single"]'));
  const dlg = page.locator('[role="dialog"]');
  await dlg.getByLabel('项目名称').fill('Fixture company project');
  await dlg.getByLabel('品牌', { exact: true }).fill('Alpha, Beta');
  await page.locator('[data-project-create-submit]').click(); await page.waitForTimeout(600);
  const c = posts[0] || {};
  ok('company payload unchanged', c.kind === 'company' && c.status === 'draft' && Array.isArray(c.brands) && c.brands.join('|') === 'Alpha|Beta' && 'company_name' in c && 'source' in c && 'note' in c, JSON.stringify(c));
  ok('company create lands on the project', hash(page) === '/projects/1', hash(page));
  await page.goto(base + '#/projects?scope=single'); await page.waitForTimeout(900);
  await page.locator('[data-company-create]').click(); await page.waitForTimeout(300);
  ok('dialog preselects the scope on screen', (await page.locator('[data-project-kind="single"]').getAttribute('aria-checked')) === 'true');
  ok('single type hides the company fields', (await page.locator('[role="dialog"]').getByLabel('公司或集团').count()) === 0);
  await page.locator('[role="dialog"]').getByLabel('项目名称').fill('Fixture single project');
  await page.locator('[data-project-create-submit]').click(); await page.waitForTimeout(900);
  const s = posts[1] || {};
  ok('single payload is name + note', Object.keys(s).sort().join(',') === 'name,note' && s.name === 'Fixture single project', JSON.stringify(s));
  ok('single create opens the session wizard on the runs tab', hash(page).startsWith('/projects/1?tab=runs') && await has(page, '[data-wizard-close]'), hash(page));
  await ctx.close();
}

// 4. Five tabs; runs filtered by project.
{
  const { ctx, page, errors, gets } = await open('/projects/1');
  ok('detail renders', await has(page, '[data-project-detail="1"]') && !errors.length, errors.join('; '));
  const firstLoad = [...new Set(gets)];
  ok('default tab does not load the task list', !firstLoad.some((g) => g.startsWith('/api/tasks?')));
  for (const tab of ['reports', 'apps', 'candidates', 'runs', 'overview']) {
    await page.locator(`[data-project-tab="${tab}"]`).click(); await page.waitForTimeout(500);
    const q = new URLSearchParams(hash(page).split('?')[1] || '').get('tab');
    ok(`tab ${tab}`, await has(page, `[data-project-panel="${tab}"]`) && (tab === 'overview' ? q === null : q === tab) && !(await has(page, '[data-project-panel] [data-state="error"]')), `?tab=${q}`);
  }
  const det = ['[data-company-project-detail]', '[data-project-sessions]', '[data-company-upload]', '[data-company-run]', '[data-new-session]', '[data-company-context]', '[data-company-sticky]',
    '[data-company-tab="reports"]', '[data-company-tab="overview"]', '[data-company-tab="apps"]', '[data-company-tab="candidates"]', '[data-company-tab="runs"]', '[data-company-next]'];
  const missing = []; for (const s of det) if (!(await has(page, s))) missing.push(s);
  ok('detail hooks present', !missing.length, missing.join(' '));
  await page.locator('[data-project-tab="reports"]').click(); await page.waitForTimeout(400);
  const rep = ['[data-report-workflow]', '[data-report-step="generate"]', '[data-report-step="history"]', '[data-report-row]', '[data-report-latest]', '[data-report-download]'];
  const rm = []; for (const s of rep) if (!(await has(page, s))) rm.push(s);
  ok('report hooks present', !rm.length, rm.join(' '));
  await page.locator('[data-project-tab="runs"]').click(); await page.waitForTimeout(900);
  const sess = await page.locator('[data-run-session]').evaluateAll((els) => els.map((e) => e.getAttribute('data-run-session')).sort().join(','));
  const tasks = await page.locator('[data-run-task]').evaluateAll((els) => els.map((e) => e.getAttribute('data-run-task')).sort().join(','));
  ok('runs lists only this project\'s sessions', sess === '40,41,44', sess);
  ok('runs joins each session to its task', tasks === '100,101,104', tasks);
  ok('runs reads the task list the task page reads', gets.includes('/api/tasks?limit=2000') && gets.includes('/api/pentest/sessions'));
  await page.locator('[data-runs-scope="running"]').click(); await page.waitForTimeout(250);
  ok('runs scope filters by task status', (await page.locator('[data-run-session]').evaluateAll((els) => els.map((e) => e.getAttribute('data-run-session')).join(','))) === '41');
  await page.locator('[data-runs-scope="all"]').click();
  const rh = ['[data-continue-session]', '[data-sess-idle]', '[data-sess-close]', '[data-run-batch]'];
  const rmis = []; for (const s of rh) if (!(await has(page, s))) rmis.push(s);
  ok('session hooks present', !rmis.length, rmis.join(' '));
  await page.locator('[data-sess-close]').first().click(); await page.waitForTimeout(300);
  ok('closing a session asks for confirmation', await has(page, '[role="alertdialog"], [role="dialog"]'));
  await ctx.close();
}

// 5. Each tab fails on its own.
{
  const { ctx, page } = await open('/projects/1?tab=apps', { fail: /\/projects\/1\/apps$/ });
  ok('a failing tab shows its own error', await has(page, '[data-project-panel="apps"] [data-state="error"]'));
  ok('the shell and the other tabs stay up', await has(page, '[data-company-tab="reports"]') && (await page.locator('h1').innerText()).includes('Example Holdings'));
  await page.locator('[data-project-tab="reports"]').click(); await page.waitForTimeout(400);
  ok('another tab still shows its data', (await page.locator('[data-report-row]').count()) > 0);
  if (out) { fs.mkdirSync(out, { recursive: true }); await page.locator('[data-project-tab="apps"]').click(); await page.waitForTimeout(300); await page.screenshot({ path: path.join(out, 'project-apps.tab-error-1440-light.png') }); }
  await ctx.close();
}
{
  const { ctx, page } = await open('/projects/1', { fail: /\/projects\/1\/overview$/ });
  ok('identity falls back to the project list when the overview endpoint fails', (await page.locator('h1').innerText()).includes('Example Holdings') && await has(page, '[data-company-tab="runs"]'));
  await ctx.close();
}

// 6. Keyboard focus is never under the sticky tab bar or the top bar.
for (const [route, width] of [['/projects', 1440], ['/projects/1?tab=apps', 1440], ['/projects/1?tab=runs', 1024], ['/projects', 390]]) {
  const { ctx, page } = await open(route, { width });
  let hidden = 0, stops = 0;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return null;
      const b = el.getBoundingClientRect(); if (!b.width || !b.height) return { skip: true };
      const x = Math.min(Math.max(b.left + b.width / 2, 1), innerWidth - 1), y = Math.min(Math.max(b.top + Math.min(b.height / 2, 12), 1), innerHeight - 1);
      const top = document.elementFromPoint(x, y);
      return { covered: !(top && (el.contains(top) || top.contains(el) || top.closest('label')?.contains(el))), tag: el.tagName, text: (el.getAttribute('aria-label') || el.textContent || '').slice(0, 30) };
    });
    if (!r || r.skip) continue;
    stops++; if (r.covered) { hidden++; if (hidden <= 3) console.log(`     covered: ${r.tag} "${r.text}"`); }
  }
  ok(`focus not occluded on ${route} @${width}`, hidden === 0 && stops > 10, `${stops} stops, ${hidden} covered`);
  await ctx.close();
}

await browser.close();
const bad = results.filter((r) => !r.pass).length;
if (out) fs.writeFileSync(path.join(out, 'report.projects.json'), JSON.stringify({ passed: results.length - bad, failed: bad, results }, null, 2) + '\n');
console.log(bad ? `${bad} of ${results.length} checks failed` : `${results.length}/${results.length} project-domain checks passed (fixtures)`);
process.exit(bad ? 1 : 0);
