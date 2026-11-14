import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft } from 'lucide-react';
import { cx, useOverlay } from '@/components/ui';
import { NAV_ALL } from '@/layout/navigation';

/** Ctrl/Cmd+K page switcher. Local matching over the shared destination list; arrow keys move, Enter opens. */
export const CmdPalette: React.FC = () => {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  useEffect(() => { if (open) { setQ(''); setAt(0); } }, [open]);
  useEffect(() => { if (open) document.getElementById(`cmdk-${at}`)?.scrollIntoView({ block: 'nearest' }); }, [at, open]);
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return NAV_ALL.filter((c) => !k || c.label.toLowerCase().includes(k) || c.to.includes(k));
  }, [q]);
  const ref = useOverlay(open, () => setOpen(false));
  if (!open) return null;
  const go = (to: string) => { nav(to); setOpen(false); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(i + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && list[at]) { e.preventDefault(); go(list[at].to); }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-jz-scrim/50 px-4 pt-24 modal-overlay-in max-[760px]:pt-4" onMouseDown={() => setOpen(false)} data-cmdk>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="跳转到页面" tabIndex={-1} onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] overflow-hidden rounded-panel border border-jz-border bg-jz-surface shadow-dialog outline-none modal-panel-in">
        <div className="flex items-center gap-2.5 border-b border-jz-border px-4">
          <Search size={16} className="flex-none text-jz-muted" aria-hidden />
          <input data-autofocus value={q} onChange={(e) => { setQ(e.target.value); setAt(0); }} onKeyDown={onKey}
            placeholder="输入页面名称" aria-label="搜索页面" role="combobox" aria-expanded aria-controls="cmdk-list"
            aria-activedescendant={list[at] ? `cmdk-${at}` : undefined}
            className="h-12 w-full bg-transparent text-body text-jz-ink outline-none placeholder:text-jz-muted focus-visible:outline-none" />
        </div>
        <div id="cmdk-list" role="listbox" aria-label="页面" className="max-h-72 overflow-auto p-1.5">
          {list.map((c, i) => (
            <button type="button" key={c.to} id={`cmdk-${i}`} role="option" aria-selected={i === at} tabIndex={-1}
              onMouseEnter={() => setAt(i)} onClick={() => go(c.to)}
              className={cx('flex h-jz-control w-full items-center gap-2.5 rounded-control px-2.5 text-left text-label max-[760px]:h-jz-touch',
                i === at ? 'bg-jz-brand-soft text-jz-brand' : 'text-jz-ink-2')}>
              <c.icon size={16} className="flex-none" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              {i === at && <CornerDownLeft size={14} className="flex-none" aria-hidden />}
            </button>
          ))}
          {!list.length && <div className="px-3 py-6 text-center text-label text-jz-muted" role="status">没有名称包含“{q.trim()}”的页面</div>}
        </div>
        <div className="flex items-center gap-3 border-t border-jz-border px-4 py-2 text-meta text-jz-muted">
          <span><kbd className="font-mono">↑↓</kbd> 选择</span><span><kbd className="font-mono">Enter</kbd> 打开</span><span><kbd className="font-mono">Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  );
};
