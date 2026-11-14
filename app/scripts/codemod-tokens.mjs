#!/usr/bin/env node
// One-shot, re-runnable class codemod: legacy color / size / radius / shadow classes → jz token classes.
// Presentation only: it rewrites class-name substrings and CSS variable names, nothing else.
// Usage: node scripts/codemod-tokens.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';

const dry = process.argv.includes('--dry');
const root = new URL('../src/', import.meta.url).pathname;
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(tsx?|css)$/.test(e.name)) files.push(p); } })(root);

const UTIL = '(?:text|bg|border(?:-[trblxy])?|ring(?:-offset)?|from|via|to|divide|fill|stroke|outline|accent|placeholder|decoration|caret|shadow)';
const B = '(?<![\\w-])';   // left edge of a class token (variants like hover: / dark: end in ":", which is allowed)
const E = '(?![\\w-])';    // right edge
const sizePx = (n) => n <= 12 ? 'meta' : n <= 13 ? 'label' : n <= 15 ? 'body' : n <= 19 ? 'section' : n <= 24 ? 'title' : n <= 29 ? 'page' : n <= 34 ? 'metric' : 'display';
const NAMED = { xs: 'meta', sm: 'body', base: 'section', lg: 'section', xl: 'title', '2xl': 'title', '3xl': 'metric', '4xl': 'display' };
const RADIUS = { sm: 'tag', md: 'control', lg: 'control', xl: 'card', '2xl': 'panel', '3xl': 'dialog', full: 'pill' };
const PALETTE = [
  ['emerald|green|teal|lime', 'jz-teal'], ['red|rose|pink', 'jz-red'], ['amber|yellow', 'jz-amber'], ['orange', 'jz-orange'],
  ['cyan|sky|blue|indigo|violet|purple|fuchsia', 'jz-brand'],
];

/** [RegExp, replacement] applied in order to every file. */
const rules = [
  // ── CSS variables (old names removed from the stylesheet) ──
  [/--c-border-active\b/g, '--jz-brand'], [/--c-bg\b/g, '--jz-canvas'], [/--c-surface\b/g, '--jz-surface'], [/--c-elevated\b/g, '--jz-surface-2'],
  [/--c-border\b/g, '--jz-border'], [/--c-accent-cyan\b/g, '--jz-brand'], [/--c-accent-emerald\b/g, '--jz-teal'], [/--c-accent-amber\b/g, '--jz-amber'],
  [/--c-accent-crimson\b/g, '--jz-red'], [/--c-text-primary\b/g, '--jz-ink'], [/--c-text-secondary\b/g, '--jz-ink-2'], [/--c-text-muted\b/g, '--jz-muted'],
  [/--shadow-card\b/g, '--jz-shadow-card'],
  // ── Shadows first (arbitrary values contain color names the later rules would touch) ──
  [new RegExp(`${B}((?:[a-z-]+:)*)shadow-\\[[^\\]]*\\]`, 'g'), (m, v) => /_0_0_|^.*shadow-\[0_0_/.test(m) && !/inset/.test(m) ? '' : `${v}shadow-card`],
  [new RegExp(`${B}shadow-neon-glow${E}`, 'g'), ''],
  [new RegExp(`${B}shadow-jz-card${E}`, 'g'), 'shadow-card'],
  [new RegExp(`${B}shadow-(?:sm|md)${E}`, 'g'), 'shadow-card'],
  // Bare `shadow` / `rounded` are also ordinary words and identifiers: only rewrite them when they sit
  // between other class tokens inside a class string.
  [/(?<=[\w\]]\s)shadow(?=[\s"'`])|(?<=["'`\s])shadow(?=\s[a-z!\[])/g, 'shadow-card'],
  [new RegExp(`${B}shadow-(?:lg|xl|2xl)${E}`, 'g'), 'shadow-dialog'],
  // ── Semantic color names ──
  [/-jz-bg(?![\w-])/g, '-jz-canvas'], [/-jz-elevated(?![\w-])/g, '-jz-surface-2'],
  [/-jz-text-primary(?![\w-])/g, '-jz-ink'], [/-jz-text-secondary(?![\w-])/g, '-jz-ink-2'], [/-jz-text-muted(?![\w-])/g, '-jz-muted'],
  [/-jz-active(?![\w-])/g, '-jz-brand'], [/-jz-accent-cyan(?![\w-])/g, '-jz-brand'], [/-jz-accent-emerald(?![\w-])/g, '-jz-teal'],
  [/-jz-accent-amber(?![\w-])/g, '-jz-amber'], [/-jz-accent-crimson(?![\w-])/g, '-jz-red'],
  [/-neon-accent(?![\w-])/g, '-jz-brand'], [/-neon-glow(?![\w-])/g, '-jz-brand-soft'],
  [/-vuln-critical(?![\w-])/g, '-jz-sev-critical'], [/-vuln-high(?![\w-])/g, '-jz-sev-high'], [/-vuln-medium(?![\w-])/g, '-jz-sev-medium'],
  [/-vuln-low(?![\w-])/g, '-jz-sev-low'], [/-vuln-safe(?![\w-])/g, '-jz-teal'],
  // ── Raw Tailwind palette ──
  ...PALETTE.map(([names, to]) => [new RegExp(`${B}((?:[a-z-]+:)*${UTIL})-(?:${names})-\\d{2,3}${E}`, 'g'), `$1-${to}`]),
  [new RegExp(`${B}((?:[a-z-]+:)*)text-(?:slate|gray|zinc|neutral|stone)-\\d{2,3}${E}`, 'g'), '$1text-jz-muted'],
  [new RegExp(`${B}((?:[a-z-]+:)*)bg-(?:slate|gray|zinc|neutral|stone)-\\d{2,3}${E}`, 'g'), '$1bg-jz-surface-2'],
  [new RegExp(`${B}((?:[a-z-]+:)*(?:border|divide|ring))-(?:slate|gray|zinc|neutral|stone)-\\d{2,3}${E}`, 'g'), '$1-jz-border'],
  [new RegExp(`${B}((?:[a-z-]+:)*)text-white${E}`, 'g'), '$1text-jz-on-brand'],
  [new RegExp(`${B}((?:[a-z-]+:)*)bg-white${E}`, 'g'), '$1bg-jz-surface'],
  [new RegExp(`${B}((?:[a-z-]+:)*)bg-black${E}`, 'g'), '$1bg-jz-scrim'],
  [new RegExp(`${B}((?:[a-z-]+:)*(?:border|ring|divide))-(?:white|black)${E}`, 'g'), '$1-jz-border'],
  // Body text never carries alpha (it drops below AA); the three ink steps are the hierarchy.
  [new RegExp(`${B}((?:[a-z-]+:)*)text-jz-(ink|ink-2|muted)/\\d+`, 'g'), '$1text-jz-$2'],
  // ── Type scale ──
  [new RegExp(`${B}((?:[a-z-]+:)*)text-\\[(\\d+(?:\\.\\d+)?)px\\]`, 'g'), (m, v, n) => `${v}text-${sizePx(Number(n))}`],
  [new RegExp(`${B}((?:[a-z-]+:)*)text-(xs|sm|base|lg|xl|2xl|3xl|4xl)${E}`, 'g'), (m, v, k) => `${v}text-${NAMED[k]}`],
  [new RegExp(`${B}((?:[a-z-]+:)*)font-(?:bold|extrabold|black)${E}`, 'g'), '$1font-semibold'],
  [new RegExp(`\\s?${B}tracking-(?:wide|wider|widest)${E}`, 'g'), ''],
  // ── Radii ──
  [new RegExp(`${B}((?:[a-z-]+:)*rounded(?:-(?:tl|tr|bl|br|[trbl]))?)-(sm|md|lg|xl|2xl|3xl|full)${E}`, 'g'), (m, p, k) => `${p}-${RADIUS[k]}`],
  [/(?<=[\w\]]\s)((?:[a-z-]+:)*rounded(?:-(?:tl|tr|bl|br|[trbl]))?)(?=[\s"'`])|(?<=["'`\s])((?:[a-z-]+:)*rounded(?:-(?:tl|tr|bl|br|[trbl]))?)(?=\s[a-z!\[])/g, (m) => `${m}-control`],
  // ── Decorative effects ──
  [new RegExp(`\\s?${B}(?:animate-breathe|animate-ping|status-glow|ai-ambient)${E}`, 'g'), ''],
  [/\bapksec-shimmer\b/g, 'jz-shimmer'], [/\bapksec-toast-in\b/g, 'jz-toast-in'], [/\bapksec-toast-progress\b/g, 'jz-toast-progress'],
];

let changed = 0;
for (const f of files) {
  if (f.endsWith('styles/index.css') || f.endsWith('styles/fonts.css')) continue;
  // Logic layers are never touched by the codemod.
  if (/\/src\/(services|stores|types)\//.test(f)) continue;
  const src = fs.readFileSync(f, 'utf8');
  let out = src;
  for (const [re, to] of rules) out = out.replace(re, to);
  if (out !== src) { changed++; if (!dry) fs.writeFileSync(f, out); }
}
console.log(`${dry ? '[dry] ' : ''}${changed} of ${files.length} files changed`);
