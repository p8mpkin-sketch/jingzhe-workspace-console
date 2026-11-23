import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft, SunMoon, CornerDownRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cx, useOverlay } from '@/components/ui';
import { NAV_ACTION, NAV_EXTRA, NAV_PRIMARY, NAV_SCOPES } from '@/layout/navigation';
import { useTheme } from '@/theme/ThemeContext';

/**
 * Command palette (Ctrl/⌘ + K, or the top bar button). One list, three groups: the primary action and commands,
 * the destinations, and their sub-scopes. Labels come from layout/navigation.ts, so the palette says exactly what
 * the rail and the page tabs say. Local matching only; arrow keys move, Enter runs, Escape closes and returns focus.
 */
const EVENT = 'jz:cmdk';
export const openCommandPalette = (): void => { window.dispatchEvent(new Event(EVENT)); };

interface Cmd { id: string; group: '操作' | '前往' | '范围'; label: string; hint?: string; icon: LucideIcon; keywords: string; run: () => void }

export const CmdPalette: React.FC = () => {
  const nav = useNavigate();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
    };
    const show = () => setOpen(true);
    window.addEventListener('keydown', h);
    window.addEventListener(EVENT, show);
    return () => { window.removeEventListener('keydown', h); window.removeEventListener(EVENT, show); };
  }, []);
  useEffect(() => { if (open) { setQ(''); setAt(0); } }, [open]);

  const all = useMemo<Cmd[]>(() => [
    { id: 'new', group: '操作', label: NAV_ACTION.label, icon: NAV_ACTION.icon, keywords: 'new assessment xinjian', run: () => nav(NAV_ACTION.to) },
    { id: 'theme', group: '操作', label: theme === 'dark' ? '切换到浅色主题' : '切换到深色主题', icon: SunMoon, keywords: 'theme dark light zhuti', run: toggle },
    ...[...NAV_PRIMARY, ...NAV_EXTRA].map((n): Cmd => ({ id: n.to, group: '前往', label: n.label, hint: n.to, icon: n.icon, keywords: n.to, run: () => nav(n.to) })),
    ...NAV_SCOPES.map((s): Cmd => ({ id: s.to, group: '范围', label: `${s.parent} · ${s.label}`, icon: CornerDownRight, keywords: s.to, run: () => nav(s.to) })),
  ], [nav, theme, toggle]);
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return all.filter((c) => !k || c.label.toLowerCase().includes(k) || c.keywords.includes(k));
  }, [q, all]);

  // Keep the active option in view by moving the list's own scroll position (never scrollIntoView: it also
  // scrolls clipped ancestors).
  useEffect(() => {
    if (!open) return;
    const box = listRef.current; const el = box?.querySelector<HTMLElement>(`#cmdk-${at}`);
    if (!box || !el) return;
    const top = el.offsetTop - box.offsetTop; const bottom = top + el.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top - 4;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight + 4;
  }, [at, open, list.length]);

  const ref = useOverlay(open, () => setOpen(false));
  if (!open) return null;
  const run = (c: Cmd) => { setOpen(false); c.run(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(i + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setAt(0); }
    else if (e.key === 'End') { e.preventDefault(); setAt(list.length - 1); }
    else if (e.key === 'Enter' && list[at]) { e.preventDefault(); run(list[at]); }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-jz-scrim/50 px-4 pt-24 modal-overlay-in max-[760px]:pt-4" onMouseDown={() => setOpen(false)} data-cmdk>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="搜索或跳转" tabIndex={-1} onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] overflow-hidden rounded-dialog border border-jz-border bg-jz-overlay shadow-dialog outline-none modal-panel-in">
        <div className="flex items-center gap-2.5 border-b border-jz-border px-4">
          <Search size={16} className="flex-none text-jz-muted" aria-hidden />
          <input data-autofocus value={q} onChange={(e) => { setQ(e.target.value); setAt(0); }} onKeyDown={onKey}
            placeholder="输入页面、范围或操作的名称" aria-label="搜索页面、范围或操作" role="combobox" aria-expanded aria-controls="cmdk-list"
            aria-activedescendant={list[at] ? `cmdk-${at}` : undefined}
            className="h-12 w-full bg-transparent text-body text-jz-ink outline-none placeholder:text-jz-muted focus-visible:outline-none" />
        </div>
        <div id="cmdk-list" ref={listRef} role="listbox" aria-label="结果" className="relative max-h-80 overflow-auto p-1.5">
          {list.map((c, i) => (
            <React.Fragment key={c.id}>
              {(i === 0 || list[i - 1].group !== c.group) && <div role="presentation" className="px-2.5 pb-1 pt-2 text-meta font-medium text-jz-muted">{c.group}</div>}
              <button type="button" id={`cmdk-${i}`} role="option" aria-selected={i === at} tabIndex={-1} data-cmdk-item={c.id}
                onMouseMove={() => setAt(i)} onClick={() => run(c)}
                className={cx('flex h-jz-control w-full items-center gap-2.5 rounded-control px-2.5 text-left text-label max-[760px]:h-jz-touch',
                  i === at ? 'bg-jz-selected text-jz-brand' : 'text-jz-ink-2')}>
                <c.icon size={16} className="flex-none" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                {c.hint && <span className={cx('flex-none font-mono text-meta', i === at ? 'text-jz-brand' : 'text-jz-muted')}>{c.hint}</span>}
                {i === at && <CornerDownLeft size={14} className="flex-none" aria-hidden />}
              </button>
            </React.Fragment>
          ))}
          {!list.length && <div className="px-3 py-6 text-center text-label text-jz-muted" role="status">没有名称包含“{q.trim()}”的页面或操作</div>}
        </div>
        <div className="flex items-center gap-3 border-t border-jz-border bg-jz-inset px-4 py-2 text-meta text-jz-muted">
          <span><kbd className="font-mono">↑↓</kbd> 选择</span><span><kbd className="font-mono">Enter</kbd> 打开</span><span><kbd className="font-mono">Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  );
};
