#!/usr/bin/env node
// Dev-only: WCAG contrast of jz token pairs, read from design/tokens.css. Exit 1 on a failing text pair.
import fs from 'node:fs';
const css = fs.readFileSync(new URL('../../design/tokens.css', import.meta.url), 'utf8');
const block = (re) => Object.fromEntries([...(css.match(re)?.[1] ?? '').matchAll(/--jz-([a-z0-9-]+):\s*(\d+) (\d+) (\d+)\s*;/g)].map((m) => [m[1], m.slice(2).map(Number)]));
const light = block(/:root\s*\{([\s\S]*?)\n\}/); const dark = { ...light, ...block(/html\.dark\s*\{([\s\S]*?)\n\}/) };
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const TEXT = ['ink', 'ink-2', 'muted', 'brand', 'amber-ink', 'teal-ink', 'orange', 'red'];
const BG = ['canvas', 'surface', 'surface-2', 'brand-soft'];
let bad = 0;
for (const [name, t] of [['light', light], ['dark', dark]]) {
  console.log(`\n${name}`.padEnd(14) + BG.map((b) => b.padStart(11)).join(''));
  for (const fg of TEXT) {
    if (!t[fg]) continue;
    console.log(fg.padEnd(13) + BG.map((b) => { const r = ratio(t[fg], t[b]); if (r < 4.5) bad++; return (r.toFixed(2) + (r < 4.5 ? '!' : ' ')).padStart(11); }).join(''));
  }
  const ob = ratio(t['on-brand'] ?? [255, 255, 255], t.brand); if (ob < 4.5) bad++;
  console.log('on-brand/brand'.padEnd(13) + ' ' + ob.toFixed(2) + (ob < 4.5 ? '!' : ''));
  console.log('border/surface (non-text, informational) ' + ratio(t.border, t.surface).toFixed(2) + '   border-strong/surface ' + (t['border-strong'] ? ratio(t['border-strong'], t.surface).toFixed(2) : 'n/a'));
}
console.log(`\nfailing text pairs (<4.5): ${bad}`);
process.exit(bad ? 1 : 0);
