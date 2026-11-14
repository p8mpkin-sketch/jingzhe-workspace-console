import React, { createContext, useContext, useEffect, useState } from 'react';

/** R95-UI: 全局主题上下文——dark/light 双模,class 策略(darkMode:'class'),持久化 localStorage。
 *  默认 dark(平台基底);切换时在 <html> 上挂/摘 'dark' 类,Tailwind dark: 变体全量生效。 */

type Theme = 'dark' | 'light';
const KEY = 'apksec-theme';

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'dark', toggle: () => {},
});

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  root.style.colorScheme = theme;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem(KEY) as Theme) || 'dark'; } catch { return 'dark'; }
  });
  useEffect(() => {
    apply(theme);
    try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  }, [theme]);
  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
};

export const useTheme = () => useContext(ThemeCtx);
