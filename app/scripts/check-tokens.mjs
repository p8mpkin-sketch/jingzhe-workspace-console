#!/usr/bin/env node
// Dev-only token lint: counts styling that bypasses design/tokens.css. `--strict` exits 1 on any finding.
// `--list <rule>` prints every hit for one rule.
import fs from 'node:fs';
import path from 'node:path';
const root = new URL('../src/', import.meta.url).pathname;
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(tsx?|css)$/.test(e.name)) files.push(p); } })(root);
const RULES = {
  'hex-literal': /#[0-9a-fA-F]{3,8}\b(?![\w-])/g,
  'rgb-literal': /rgba?\(\s*\d[^)]*\)/g,
  'old-css-var': /--c-[a-z-]+|--shadow-card\b|--wb-[a-z0-9-]+/g,
  'old-color-class': /(?<![\w-])(?:[a-z-]+:)*(?:text|bg|border|ring|from|via|to|divide|fill|stroke)-(?:neon|vuln|jz-(?:bg|elevated|text|accent|active))[\w/-]*/g,
  'raw-palette-class': /(?<![\w-])(?:[a-z-]+:)*(?:text|bg|border|ring|from|via|to|divide|fill|stroke|outline|shadow)-(?:slate|gray|zinc|neutral|stone|red|rose|pink|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|white|black)(?:-\d{2,3})?(?:\/\d+)?(?![\w-])/g,
  'arbitrary-font-size': /(?<![\w-])(?:[a-z-]+:)*text-\[\d[^\]]*\]|fontSize:\s*['"]?\d/g,
  'legacy-size-class': /(?<![\w-])(?:[a-z-]+:)*text-(?:xs|sm|base|lg|xl|[2-6]xl)(?![\w-])/g,
  'arbitrary-radius': /(?<![\w-])rounded(?:-[a-z]{1,2})?-\[[^\]]+\]|borderRadius:\s*['"]?\d/g,
  'legacy-radius-class': /(?<![\w-])(?:[a-z-]+:)*rounded(?:-(?:tl|tr|bl|br|[trbl]))?-(?:sm|md|lg|xl|2xl|3xl|full)(?![\w-])/g,
  'arbitrary-shadow': /(?<![\w-])(?:[a-z-]+:)*shadow-\[[^\]]+\]|boxShadow:\s*['"`]\s*\d/g,
  'legacy-shadow-class': /(?<![\w-])(?:[a-z-]+:)*shadow-(?:sm|md|lg|xl|2xl|inner|jz-card|neon-glow)(?![\w-])/g,
  'decorative-effect': /animate-(?:breathe|ping)|status-glow|raster-scan|ai-ambient|bg-clip-text|drop-shadow|blur-(?:2xl|3xl)|(?<![\w-])bg-gradient-to-[a-z]+/g,
  'old-vocabulary': /\b(?:neon|glow|breath\w*|scanline|cyan|apksec-(?:shimmer|toast))\b/gi,
  'css-literal': /(?:font-size|border-radius|box-shadow|font-family):(?![^;}]*var\()\s*(?!inherit|none|0\b)[^;}]+/g,
  'letter-spacing': /letterSpacing|(?<![\w-])tracking-(?:wide|wider|widest|\[)/g,
  'text-alpha': /(?<![\w-])(?:[a-z-]+:)*text-jz-(?:ink|ink-2|muted)\/\d+/g,
};
const strip = (s, f) => f.endsWith('.css') ? s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  : s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, a) => a + ' '.repeat(m.length - a.length));
const listIdx = process.argv.indexOf('--list'); const list = listIdx > 0 ? process.argv[listIdx + 1] : '';
const totals = {}; const perFile = {};
for (const f of files) {
  const rel = path.relative(root, f); const src = strip(fs.readFileSync(f, 'utf8'), f);
  for (const [name, re] of Object.entries(RULES)) {
    for (const m of src.matchAll(re)) {
      totals[name] = (totals[name] || 0) + 1; (perFile[rel] ||= {})[name] = (perFile[rel][name] || 0) + 1;
      if (list === name) console.log(`${rel}:${src.slice(0, m.index).split('\n').length}: ${m[0]}`);
    }
  }
}
if (!list) {
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  for (const name of Object.keys(RULES)) console.log(String(totals[name] || 0).padStart(6) + '  ' + name);
  console.log(String(total).padStart(6) + '  total (comments excluded; design/tokens.css is the only allowed home for literals)');
  if (process.argv.includes('--files')) for (const [f, r] of Object.entries(perFile).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0)).slice(0, 25)) console.log('  ' + f + '  ' + JSON.stringify(r));
  if (process.argv.includes('--strict') && total) process.exit(1);
}
