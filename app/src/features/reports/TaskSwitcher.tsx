// TaskSwitcher.tsx — 详情页可搜索任务切换器(自定义 Popover w-96 max-h-96,彻底替换原微型 select):
// 搜索框按包名/#ID/应用名过滤;列表项=任务号+包名+合规评分;点击切换任务(含当前任务高亮)。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import type { HubEntry } from './types';
import { complianceScoreOf } from './types';

export const TaskSwitcher: React.FC<{
 entries: HubEntry[];
 currentTaskId: number | null;
 currentLabel: string;
 onPick: (tid: number) => void;
}> = ({ entries, currentTaskId, currentLabel, onPick }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

 useEffect(() => {
 if (!open) return;
 inputRef.current?.focus();
 const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
 const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
 document.addEventListener('mousedown', onDoc);
 document.addEventListener('keydown', onKey);
 return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
 }, [open]);

 const list = useMemo(() => {
 const k = q.trim().toLowerCase();
 const hit = (e: HubEntry) => !k
      || String(e.task.id).includes(k.replace('#', ''))
      || String(e.task.package || '').toLowerCase().includes(k)
      || String(e.task.app_name || '').toLowerCase().includes(k);
    return entries.filter(hit).slice(0, 200);
  }, [entries, q]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" data-task-switcher-btn onClick={() => setOpen((v) => !v)}
 title="切换任务(可搜索包名/#ID/应用名)"
 className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-jz-elevated/60 hover:bg-jz-elevated text-xs text-jz-text-primary max-w-[320px]">
        <span className="truncate">{currentLabel}</span>
        <ChevronDown size={13} className={`flex-none transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div data-task-switcher className="absolute z-40 left-0 mt-1.5 w-96 max-h-96 flex flex-col rounded-xl border border-jz-border bg-jz-surface shadow-jz-card overflow-hidden">
          <div className="relative p-2 border-b border-jz-border flex-none">
            <Search size={14} className="absolute left-5 top-1/2 -translate-y-1/2 text-jz-text-muted" />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} data-task-switcher-search
 placeholder="搜索包名 / #ID / 应用名…"
 className="w-full h-9 pl-8 pr-3 rounded-lg bg-jz-elevated/60 text-sm text-jz-text-primary placeholder:text-jz-text-muted outline-none focus:border-jz-active/50 border border-transparent" />
          </div>
          <div className="overflow-y-auto flex-1 p-1.5 space-y-0.5" data-task-switcher-list>
            {list.length === 0 && <div className="px-3 py-4 text-sm text-jz-text-muted">无匹配任务</div>}
 {list.map(({ task: t, agg }) => {
              const score = complianceScoreOf(agg?.summary);
              const cur = t.id === currentTaskId;
              return (
                <button key={t.id} type="button" data-task-switcher-item={t.id}
 onClick={() => { onPick(t.id); setOpen(false); setQ(''); }}
 className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${cur ? 'bg-neon-accent/15 ring-1 ring-jz-active/40' : 'hover:bg-jz-elevated/60'}`}>
                  <span className="font-mono text-sm font-bold text-neon-accent tnum flex-none">#{t.id}</span>
                  <span className="flex-1 min-w-0 truncate text-sm text-jz-text-primary" title={t.app_name || t.package || ''}>
                    {t.app_name || t.package || '—'}
                  </span>
                  <span className="font-mono text-[11px] text-jz-text-muted truncate max-w-[160px]" title={t.package}>{t.package || ''}</span>
                  <span className={`font-mono text-sm tnum flex-none ${score == null ? 'text-jz-text-muted' : score < 60 ? 'text-vuln-critical' : score < 85 ? 'text-vuln-medium' : 'text-vuln-safe'}`}>
                    {score ?? '—'}
                  </span>
                </button>
 );
 })}
 {list.length >= 200 && <div className="px-3 py-1.5 text-[11px] text-jz-text-muted">仅显示前 200 条,请继续输入缩小范围</div>}
          </div>
        </div>
      )}
    </div>
  );
};
