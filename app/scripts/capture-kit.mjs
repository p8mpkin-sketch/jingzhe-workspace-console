#!/usr/bin/env node
// Dev-only: screenshots, overflow and keyboard-focus check of the primitives gallery.
// Needs `npx vite --port 5174` running. Usage: node scripts/capture-kit.mjs --out ../docs/screenshots/phase-2
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:5174/v2/dev/ui-kit.html');
const out = path.resolve(arg('out', '.ui-shots/kit'));
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const problems = [];
for (const theme of ['light', 'dark']) {
  for (const w of [1440, 1024, 760]) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    page.on('pageerror', (e) => problems.push(`pageerror ${e.message}`));
    await page.goto(`${base}?theme=${theme}&selected=1`); await page.waitForTimeout(700);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (ov > 1) problems.push(`overflow ${ov}px @${w} ${theme}`);
    const layout = await page.evaluate(() => document.querySelector('[data-table-layout]')?.getAttribute('data-table-layout'));
    if ((w < 900) !== (layout === 'cards')) problems.push(`table layout ${layout} @${w}`);
    // full page: the Page primitive owns the scroll, so expand it for the shot
    await page.addStyleTag({ content: 'html,body,#root{height:auto!important;overflow:visible!important}#root>div{height:auto!important}#root .overflow-y-auto{overflow:visible!important}' });
    await page.screenshot({ path: path.join(out, `kit-${w}-${theme}.png`), fullPage: true });
    await page.close();
  }
  for (const open of ['dialog', 'confirm', 'drawer']) {
    for (const w of [1440, 760]) {
      const page = await browser.newPage({ viewport: { width: w, height: 900 } });
      await page.goto(`${base}?theme=${theme}&open=${open}`); await page.waitForTimeout(600);
      const info = await page.evaluate(() => { const d = document.querySelector('[role=dialog],[role=alertdialog]'); return { inside: !!d && d.contains(document.activeElement), modal: d?.getAttribute('aria-modal') }; });
      if (!info.inside) problems.push(`${open}: focus not moved into the dialog @${w}`);
      // focus trap: Tab many times, focus must stay inside
      for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
      if (!(await page.evaluate(() => document.querySelector('[role=dialog],[role=alertdialog]')?.contains(document.activeElement)))) problems.push(`${open}: focus escaped the trap @${w}`);
      await page.screenshot({ path: path.join(out, `kit-${open}-${w}-${theme}.png`) });
      await page.keyboard.press('Escape'); await page.waitForTimeout(150);
      const still = await page.evaluate(() => !!document.querySelector('[role=dialog],[role=alertdialog]'));
      if (open === 'confirm' ? !still : still) problems.push(`${open}: Escape behaviour wrong (confirm must stay, others must close) @${w}`);
      await page.close();
    }
  }
}
// Keyboard path: every Tab stop must show a visible focus indicator.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}?theme=light`); await page.waitForTimeout(600);
  let stops = 0, invisible = [];
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24), ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 };
    });
    if (!r) break;
    stops++; if (!r.ring) invisible.push(`${r.tag}:${r.name}`);
  }
  await page.screenshot({ path: path.join(out, 'kit-focus-1440-light.png') });
  if (invisible.length) problems.push(`no visible focus ring on: ${[...new Set(invisible)].join(' | ')}`);
  console.log(`tab stops checked: ${stops}`);
  await page.close();
}
await browser.close();
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ problems }, null, 2) + '\n');
console.log(problems.length ? problems.join('\n') : 'kit: no overflow, dialogs trap focus, every tab stop shows a focus ring');
process.exit(problems.length ? 1 : 0);
