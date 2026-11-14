import React, { createContext, useContext, useEffect, useState } from 'react';

/** Light / dark theme, class strategy on <html>. A stored choice wins; with none, the system preference decides
 *  and keeps being followed. Only an explicit toggle writes the choice to localStorage. */

type Theme = 'dark' | 'light';
const KEY = 'apksec-theme';
const SYSTEM_DARK = '(prefers-color-scheme: dark)';

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'dark', toggle: () => {},
});

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch { return null; }
}
function system(): Theme {
  try { return window.matchMedia(SYSTEM_DARK).matches ? 'dark' : 'light'; } catch { return 'dark'; }
}

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  root.style.colorScheme = theme;
  // Browser chrome color follows the canvas token (a meta tag cannot reference a CSS variable).
  const canvas = getComputedStyle(root).getPropertyValue('--jz-canvas').trim();
  if (canvas) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', `rgb(${canvas.split(/\s+/).join(', ')})`);
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => stored() || system());
  useEffect(() => { apply(theme); }, [theme]);
  useEffect(() => {
    let m: MediaQueryList;
    try { m = window.matchMedia(SYSTEM_DARK); } catch { return; }
    const follow = () => { if (!stored()) setTheme(m.matches ? 'dark' : 'light'); };
    m.addEventListener('change', follow);
    return () => m.removeEventListener('change', follow);
  }, []);
  const toggle = () => setTheme((t) => {
    const next: Theme = t === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
    return next;
  });
  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
};

export const useTheme = () => useContext(ThemeCtx);
