import { useEffect, useState } from 'react';

// Runtime access to the jz tokens for libraries that take colors in JS (ECharts, React Flow, canvas).
// Values are read from the stylesheet, so nothing here is a color literal.

export type ColorToken = 'canvas' | 'surface' | 'surface-2' | 'ink' | 'ink-2' | 'muted' | 'border' | 'border-strong' | 'brand' | 'brand-soft'
  | 'on-brand' | 'teal' | 'amber' | 'orange' | 'red' | 'teal-ink' | 'amber-ink' | 'sev-critical' | 'sev-high' | 'sev-medium' | 'sev-low' | 'sev-info';

/** CSS color string that follows the theme live; use wherever a CSS value is accepted (inline style, SVG attribute). */
export const tokenVar = (name: ColorToken, alpha?: number): string => (alpha == null ? `rgb(var(--jz-${name}))` : `rgb(var(--jz-${name}) / ${alpha})`);

/** Resolved `rgb(r, g, b)` / `rgba(...)` string for canvas-based libraries that cannot read CSS variables. */
export function tokenColor(name: ColorToken, alpha?: number): string {
  const probe = document.createElement('span');
  probe.style.color = tokenVar(name, alpha);
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
}

/** Canvas text sizes come from the type tokens; chart libraries take numbers, so this reads the px value. */
export type SizeToken = 'meta' | 'label' | 'body' | 'chart-label' | 'chart-tick';
export const tokenPx = (name: SizeToken): number =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--jz-text-${name}`)) || 0;

/** Font stacks for canvas text. */
export const tokenFont = (kind: 'body' | 'display' | 'mono' = 'body'): string =>
  getComputedStyle(document.documentElement).getPropertyValue(`--jz-font-${kind}`).trim();

/** Increments whenever the theme class on <html> changes; put it in a dependency list to re-read token colors. */
export function useThemeVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const mo = new MutationObserver(() => setV((n) => n + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return v;
}
