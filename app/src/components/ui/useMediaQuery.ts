import { useEffect, useState } from 'react';

/** Breakpoints of the design system. CSS variables cannot be used in media queries, so they live here and in tailwind.config.js `screens`. */
export const BREAKPOINT = { mobile: 760, table: 900, desktop: 1280, wide: 1680 } as const;

export function useMediaQuery(query: string): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const fn = () => setOn(m.matches);
    fn();
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, [query]);
  return on;
}
/** True below 900 px, where tables render as record cards. */
export const useCompactTable = () => useMediaQuery(`(max-width: ${BREAKPOINT.table - 1}px)`);
/** True at 760 px and below, where the sidebar is a drawer and dialogs are sheets. */
export const useIsMobile = () => useMediaQuery(`(max-width: ${BREAKPOINT.mobile}px)`);
