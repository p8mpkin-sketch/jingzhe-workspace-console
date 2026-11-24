#!/usr/bin/env node
// Dev-only regression check for the count on the 风险发现 tab of the assessment workbench, on fixtures.
// The count is a statement about findings that were read. An account that may not read them must get no number:
// "0" beside a banner that says the session cannot be read would say "there are no findings".
//   A  every read of the session answers 403        → the tab reads 风险发现, no number
//   B  only the findings read answers 403           → no number; the other surfaces keep working
//   C  a readable session with findings             → the real count
//   D  a readable session without findings          → 0
//   E  while the first read is pending              → no number, then the count
//   F  the findings read answers 403 after a good read (permission withdrawn) → the number goes away
// Needs `npx vite preview --port 4173`. Usage: node scripts/check-findings-tab-count.mjs [--out dir] [--base url]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
import { resolve as fixture } from './fixtures/api.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:4173/v2/');
const out = arg('out', '');
if (out) fs.mkdirSync(out, { recursive: true });
const LIVE = '/projects/1/sessions/41';
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

const SESSION_READS = /\/api\/pentest\/sessions\/41(\/|$)/;
const FINDINGS_READ = /\/api\/pentest\/sessions\/41\/vulns\/grouped$/;

const browser = await chromium.launch();
// `deny` answers 403, `over` may answer a request itself, `delay` holds the session reads back. Nothing here loosens
// a permission or invents data for a refused read: a 403 stays a 403 for the page.
async function open(route, { width = 1440, theme = 'light', deny = null, over = null, delay = 0, wait = 1400 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
  await ctx.addInitScript((t) => { try { localStorage.setItem('token', 'fixture-token'); localStorage.setItem('apksec-theme', t); } catch {} }, theme);
  const page = await ctx.newPage();
  const state = { deny, errors: [], posts: [] };
  page.on('pageerror', (e) => state.errors.push(e.message));
  await page.route('**/api/**', async (r) => {
    const req = r.request(); const url = new URL(req.url());
    if (/\/stream$|send_stream$/.test(url.pathname)) return r.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    if (req.method() !== 'GET') state.posts.push(`${req.method()} ${url.pathname}`);
    if (state.deny && state.deny.test(url.pathname)) return r.fulfill({ status: 403, contentType: 'application/json', body: '{"detail":"fixture: forbidden"}' });
    const own = over ? over(req.method(), url) : undefined;
    const body = own !== undefined ? own : fixture(req.method(), url);
    if (delay && SESSION_READS.test(url.pathname)) await new Promise((res) => setTimeout(res, delay));
    return r.fulfill(typeof body === 'string' ? { status: 200, contentType: 'text/plain; charset=utf-8', body } : { status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(base + '#' + route); await page.waitForTimeout(wait);
  return { ctx, page, state };
}
const count = (page, sel) => page.locator(sel).count();
const text = (page, sel) => page.locator(sel).first().innerText().catch(() => '');
const shot = async (page, name) => { if (out) await page.screenshot({ path: path.join(out, name) }); };
// What the tab says: its whole text (label and count), and the accessible name a screen reader gets.
const tab = async (page) => {
  const el = page.locator('[data-wb-tab="findings"]');
  return { text: (await el.innerText()).replace(/\s+/g, ' ').trim(), digits: ((await el.innerText()).match(/\d+/g) || []).join(','), count: await el.locator('span.tnum').count() };
};
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// A. Every read of the session answers 403.
for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'light']]) {
  const { ctx, page, state } = await open(LIVE, { deny: SESSION_READS, width, theme });
  const t = await tab(page);
  ok(`A @${width} ${theme} 403 on every read: the tab text is exactly 风险发现`, t.text === '风险发现', JSON.stringify(t.text));
  ok(`A @${width} ${theme} 403 on every read: no digit and no count element on the tab`, t.digits === '' && t.count === 0, `digits "${t.digits}", count elements ${t.count}`);
  if (width === 1440 && theme === 'light') {
    const banner = await text(page, '[data-wb-forbidden].wb-degraded');
    ok('A 403 on every read: the banner states the permission (the tab does not contradict it)', banner.includes('当前账号无权读取该会话'), banner);
    const others = await page.locator('[data-wb-tab]').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
    ok('A 403 on every read: no tab carries a number', others.every((x) => !/\d/.test(x)) && others.length === 6, others.join(' | '));
    await page.click('[data-wb-tab="findings"]'); await page.waitForTimeout(300);
    const after = await tab(page);
    ok('A 403 on every read: still no number with the tab selected', after.text === '风险发现', JSON.stringify(after.text));
    const surface = await text(page, '.wb-surface');
    ok('A 403 on every read: the findings surface states the permission and no count', /没有权限|无权/.test(surface) && !/\d+ ?条/.test(surface), surface.replace(/\s+/g, ' ').slice(0, 80));
    ok('A 403 on every read: nothing was posted, no page error', state.posts.length === 0 && state.errors.length === 0, state.posts.concat(state.errors).join(', '));
    await shot(page, 'tab-count-all-403-1440-light.png');
  }
  if (width === 390) { ok('A @390 no horizontal overflow', (await overflow(page)) <= 1); await shot(page, 'tab-count-all-403-390-light.png'); }
  await ctx.close();
}

// B. Only the findings read answers 403; every other source is readable.
{
  const { ctx, page, state } = await open(LIVE, { deny: FINDINGS_READ });
  const t = await tab(page);
  ok('B 403 on the findings read only: the tab text is exactly 风险发现, no 0', t.text === '风险发现' && t.count === 0, JSON.stringify(t.text));
  const banner = await text(page, '[data-wb-degraded]');
  ok('B the banner names 发现 as a permission matter, without retry wording', /当前账号无权读取：发现/.test(banner) && !/重试|未加载/.test(banner), banner);
  ok('B the header still states the run and the run action is available', /运行中/.test(await text(page, '[data-wb-readout="status"]')) && !(await page.locator('[data-wb-primary]').isDisabled()), await text(page, '[data-wb-readout="status"]'));
  ok('B the overview is drawn', (await count(page, '.wb-surface [data-jz-surface], .wb-surface section')) > 0 && !/没有权限读取该会话/.test(await text(page, '.wb-surface')));
  await page.click('[data-wb-tab="runtime"]'); await page.waitForTimeout(500);
  const rows = await count(page, '[data-trace-row]');
  ok('B the runtime surface shows the trace', rows > 0, `${rows} trace rows`);
  ok('B the composer is usable', await page.locator('[data-composer] textarea, [data-composer-input]').first().isEditable().catch(() => false));
  await page.click('[data-wb-tab="evidence"]'); await page.waitForTimeout(600);
  ok('B the evidence surface opens', (await count(page, '[data-evidence], [data-ev-toolbar]')) > 0);
  await page.click('[data-wb-tab="findings"]'); await page.waitForTimeout(400);
  const surface = await text(page, '[data-findings]');
  ok('B the findings surface is a permission state: no retry, no “0 条”', (await page.getAttribute('[data-findings]', 'data-state')) === 'forbidden' && !/重试/.test(surface) && !/\b0 ?条/.test(surface), surface.replace(/\s+/g, ' ').slice(0, 80));
  const sel = await tab(page);
  ok('B still no number with the tab selected', sel.text === '风险发现', JSON.stringify(sel.text));
  ok('B no page error', state.errors.length === 0, state.errors.join('; '));
  await shot(page, 'tab-count-findings-403-1440-light.png');
  await ctx.close();
}

// C. A readable session with findings: the real count, the one the surface states.
{
  const { ctx, page, state } = await open(`${LIVE}?view=findings`);
  const t = await tab(page);
  const scope = await text(page, '[data-findings-scope]');
  const stated = Number((scope.match(/^(\d+) ?条/) || [])[1]);
  const rows = await count(page, '[data-finding-row]');
  ok('C readable session: the tab shows a count', t.count === 1 && /^风险发现 \d+$/.test(t.text), JSON.stringify(t.text));
  ok('C the count is the number of findings the surface lists', Number(t.digits) === stated && stated === rows && rows > 0, `tab ${t.digits}, scope "${scope}", rows ${rows}`);
  ok('C no page error', state.errors.length === 0, state.errors.join('; '));
  await shot(page, 'tab-count-readable-1440-light.png');
  await ctx.close();
}

// D. A readable session whose findings read answers 200 with none.
{
  const empty = (m, u) => (m === 'GET' && FINDINGS_READ.test(u.pathname) ? { status: 'ok', cards: [] } : undefined);
  const { ctx, page, state } = await open(`${LIVE}?view=findings`, { over: empty });
  const t = await tab(page);
  ok('D readable session without findings: the tab shows 0', t.text === '风险发现 0' && t.count === 1, JSON.stringify(t.text));
  ok('D the surface is the empty state, not a permission state', (await page.getAttribute('[data-findings]', 'data-state')) === 'empty', await page.getAttribute('[data-findings]', 'data-state'));
  ok('D no banner about permission', (await count(page, '[data-wb-forbidden], [data-wb-degraded]')) === 0);
  ok('D no page error', state.errors.length === 0, state.errors.join('; '));
  await shot(page, 'tab-count-empty-1440-light.png');
  await ctx.close();
}

// E. While the first read is pending there is no number; it appears with the answer.
{
  const { ctx, page } = await open(LIVE, { delay: 2500, wait: 900 });
  const before = await tab(page);
  ok('E while the first read is pending: no number', before.text === '风险发现' && before.count === 0, JSON.stringify(before.text));
  await page.waitForTimeout(3200);
  const after = await tab(page);
  ok('E after the read answers: the count', /^风险发现 \d+$/.test(after.text) && Number(after.digits) > 0, JSON.stringify(after.text));
  await ctx.close();
}

// F. The findings read answers 403 after a good read (the 8 s workbench read): the number goes away.
{
  const { ctx, page, state } = await open(LIVE);
  const before = await tab(page);
  ok('F before the permission is withdrawn: the count', /^风险发现 \d+$/.test(before.text), JSON.stringify(before.text));
  state.deny = FINDINGS_READ;
  await page.waitForFunction(() => /无权读取：发现/.test(document.querySelector('[data-wb-degraded]')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  const after = await tab(page);
  ok('F after the findings read answers 403: no number, although findings were read earlier', after.text === '风险发现' && after.count === 0, JSON.stringify(after.text));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
if (out) fs.writeFileSync(path.join(out, 'report.findings-tab-count.json'), JSON.stringify({ base: 'fixtures', total: results.length, failed: failed.length, results }, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} findings tab count checks passed (fixtures)`);
process.exit(failed.length ? 1 : 0);
