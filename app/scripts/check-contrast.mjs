#!/usr/bin/env node
// Dev-only: WCAG contrast of jz token pairs, read from design/tokens.css. Exit 1 on a failing text pair.
import fs from 'node:fs';
const css = fs.readFileSync(new URL('../../design/tokens.css', import.meta.url), 'utf8');
const block = (re) => Object.fromEntries([...(css.match(re)?.[1] ?? '').matchAll(/--jz-([a-z0-9-]+):\s*(\d+) (\d+) (\d+)\s*;/g)].map((m) => [m[1], m.slice(2).map(Number)]));
const light = block(/:root\s*\{([\s\S]*?)\n\}/); const dark = { ...light, ...block(/html\.dark\s*\{([\s\S]*?)\n\}/) };
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const TEXT = ['ink', 'ink-2', 'muted', 'brand', 'amber-ink', 'teal-ink', 'orange', 'red'];
// V3 surface levels. A text token may sit on any of them, and on a hover or pressed layer over any of them.
const BG = ['canvas', 'rail', 'surface', 'raised', 'inset', 'overlay', 'surface-2', 'brand-soft'];
const STATE = { light: { hover: 0.05, pressed: 0.09 }, dark: { hover: 0.06, pressed: 0.09 } };
const over = (fg, bg, a) => bg.map((v, i) => Math.round(v * (1 - a) + fg[i] * a));
let bad = 0;
for (const [name, t] of [['light', light], ['dark', dark]]) {
  console.log(`\n${name}`.padEnd(14) + BG.map((b) => b.padStart(11)).join(''));
  for (const fg of TEXT) {
    if (!t[fg]) continue;
    console.log(fg.padEnd(13) + BG.map((b) => { const r = ratio(t[fg], t[b]); if (r < 4.5) bad++; return (r.toFixed(2) + (r < 4.5 ? '!' : ' ')).padStart(11); }).join(''));
  }
  // State layers: ink at a low alpha over a surface. The pressed layer is the darkest ground text can meet.
  for (const [state, a] of Object.entries(STATE[name])) {
    let worst = 99; let where = '';
    for (const fg of TEXT) for (const b of BG.filter((x) => x !== 'brand-soft')) {
      const r = ratio(t[fg], over(t.ink, t[b], a)); if (r < worst) { worst = r; where = `${fg} on ${b}`; }
    }
    if (worst < 4.5) bad++;
    console.log(`state ${state}`.padEnd(13) + ` worst ${worst.toFixed(2)}${worst < 4.5 ? '!' : ''} (${where})`);
  }
  for (const [fg, bg] of [['on-brand', 'brand'], ['on-red', 'red']]) {
    const r = ratio(t[fg], t[bg]); if (r < 4.5) bad++;
    console.log(`${fg}/${bg}`.padEnd(13) + ' ' + r.toFixed(2) + (r < 4.5 ? '!' : ''));
  }
  // Non-text: control outlines must reach 3:1 on every surface they sit on.
  const bs = BG.filter((x) => x !== 'brand-soft').map((b) => [b, ratio(t['border-strong'], t[b])]);
  const low = bs.filter(([, r]) => r < 3); if (low.length) bad += low.length;
  console.log('border-strong (>= 3:1) ' + bs.map(([b, r]) => `${b} ${r.toFixed(2)}${r < 3 ? '!' : ''}`).join(' · '));
  // A+ trace: the three left rules are non-text marks on the pane and on the current row.
  const lines = [['line-active', 'brand'], ['line-finding', 'orange'], ['line-error', 'red']].flatMap(([n, tok]) => ['surface', 'surface-2', 'raised'].map((b) => [`${n}/${b}`, ratio(t[tok], t[b])]));
  const lowLine = lines.filter(([, r]) => r < 3); bad += lowLine.length;
  console.log('trace rules (>= 3:1) worst ' + Math.min(...lines.map(([, r]) => r)).toFixed(2) + (lowLine.length ? '!  ' + lowLine.map(([n]) => n).join(', ') : ''));
  console.log('border/surface (hairline, informational) ' + ratio(t.border, t.surface).toFixed(2));
}
console.log(`\nfailing pairs: ${bad}`);
process.exit(bad ? 1 : 0);
