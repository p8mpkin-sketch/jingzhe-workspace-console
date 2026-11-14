import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

/**
 * SearchableTaskCombobox — 全平台统一任务/会话选择器(本轮全平台升级 Step1 三公共组件之一)。
 * 规格: 触发器 h-10 px-3.5 text-sm md:text-base rounded-xl,显示 #ID+包名(font-mono)+状态徽章;
 * 浮层 w-[420px] max-h-[440px]: 自动聚焦搜索(#ID/包名/应用名模糊)+快速筛选 Tab
 * (全部/运行中/高风险/同包名)+分页列表(每页 30,页码跳转),每项 #ID/包名/审计时间/评分或高危数。
 * 数据面: 纯 props 驱动(items + 受控 value/onChange)——调用方各自喂数据(任务列表/会话列表均可映射),
 * 组件零请求、零假数据。字号纪律: 全部八档内(11/12/13/14/16)。
 */

export type ComboTaskItem = {
  id: number;
  package?: string | null;
  app_name?: string | null;
  status?: string | null;       // done / running / failed / queued / closed / ...(原词透传)
  kind?: string | null;
  created_at?: number | null;   // epoch 秒
  score?: number | null;        // 合规分 0-100(可选)
  highCount?: number | null;    // 高危发现数(可选)
  note?: string;                // 附注(如项目名/设备名)
};

const ST_CN: Record<string, string> = {
  done: '完成', running: '运行中', failed: '失败', queued: '排队',
  closed: '已关闭', idle: '空闲', waiting_login: '等登录',
};
const ST_CLS: Record<string, string> = {
 done: 'bg-vuln-safe/10 text-vuln-safe',
 running: 'bg-jz-accent-cyan/10 text-jz-accent-cyan',
 failed: 'bg-vuln-critical/10 text-vuln-critical',
 queued: 'bg-jz-elevated text-jz-text-muted',
};
const stLabel = (s?: string | null) => (s ? (ST_CN[s] || s) : '—');

const fmtAuditTime = (ts?: number | null): string => {
 if (!ts) return '—';
 const d = new Date(ts * 1000);
 const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type QuickTab = 'all' | 'running' | 'highrisk' | 'samepkg';
const TABS: Array<[QuickTab, string]> = [
  ['all', '全部'], ['running', '运行中'], ['highrisk', '高风险'], ['samepkg', '同包名'],
];
const PAGE_SIZE = 30;

export const SearchableTaskCombobox: React.FC<{
 items: ComboTaskItem[];
 value: number | null;
 onChange: (id: number | null, item?: ComboTaskItem) => void;
 placeholder?: string;
 /** 触发器附加类(宽度等) */
 className?: string;
 /** 浮层对齐方向(靠右贴边时用 right) */
 align?: 'left' | 'right';
 clearable?: boolean;
 emptyText?: string;
 /** 探针属性透传(data-probe 值) */
 probe?: string;
}> = ({ items, value, onChange, placeholder = '选择任务 / 会话…', className = '', align = 'left', clearable = true, emptyText = '暂无可选项', probe }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<QuickTab>('all');
  const [page, setPage] = useState(1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

 const current = useMemo(() => items.find((it) => it.id === value) || null, [items, value]);

 // 浮层外点击/Escape 关闭
 useEffect(() => {
 if (!open) return;
 const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
 const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
 document.addEventListener('mousedown', onDown);
 document.addEventListener('keydown', onKey);
 return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
 }, [open]);

 // 打开即清条件+聚焦搜索
 useEffect(() => {
 if (!open) return;
 setQ(''); setTab('all'); setPage(1);
 const t = setTimeout(() => inputRef.current?.focus(), 30);
 return () => clearTimeout(t);
 }, [open]);

 const tabCount = useMemo(() => ({
 all: items.length,
 running: items.filter((it) => it.status === 'running' || it.status === 'waiting_login').length,
 highrisk: items.filter((it) => (it.highCount ?? 0) > 0).length,
 samepkg: current?.package ? items.filter((it) => it.id !== current.id && it.package && it.package === current.package).length : 0,
 }), [items, current]);

 const filtered = useMemo(() => {
 let list = items;
 if (tab === 'running') list = list.filter((it) => it.status === 'running' || it.status === 'waiting_login');
 else if (tab === 'highrisk') list = list.filter((it) => (it.highCount ?? 0) > 0);
 else if (tab === 'samepkg') list = current?.package
 ? list.filter((it) => it.id !== current.id && it.package && it.package === current.package)
 : [];
 const kw = q.trim().toLowerCase();
 if (kw) {
 list = list.filter((it) =>
 [String(it.id), it.package || '', it.app_name || '', it.note || '']
 .some((v) => v.toLowerCase().includes(kw)));
 }
 return list;
 }, [items, q, tab, current]);

 const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
 const safePage = Math.min(page, pages);
 const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

 const pick = (it: ComboTaskItem) => { onChange(it.id, it); setOpen(false); };

  return (
    <div ref={rootRef} className={`relative ${className}`} data-stc-root={probe || ''}>
      {/* 触发器: h-10 px-3.5 text-sm md:text-base rounded-xl */}
      <button type="button" data-stc-trigger={probe || 'combo'} onClick={() => setOpen((v) => !v)}
 className="w-full h-10 px-3.5 rounded-xl bg-jz-elevated/60 border border-jz-border text-left
 flex items-center gap-2 hover:border-neon-accent/50 transition-colors
 focus:outline-none focus:ring-2 focus:ring-neon-accent/30">
        {current ? (
          <span className="min-w-0 flex-1 flex items-center gap-2">
            <span className="font-mono text-sm md:text-base font-semibold text-jz-text-primary flex-none tnum">#{current.id}</span>
            <span className="font-mono text-sm md:text-base text-jz-text-secondary truncate" title={current.package || current.app_name || ''}>
              {current.app_name || current.package || '—'}
            </span>
            <span className={`flex-none px-1.5 py-0.5 rounded-md text-[11px] font-mono ${ST_CLS[current.status || ''] || 'bg-jz-elevated text-jz-text-muted'}`}>
              {stLabel(current.status)}
            </span>
          </span>
        ) : (
          <span className="flex-1 truncate text-sm md:text-base text-jz-text-muted">{placeholder}</span>
        )}
        {clearable && current && (
          <span role="button" aria-label="清除选择" data-stc-clear
 onClick={(e) => { e.stopPropagation(); onChange(null, undefined); }}
 className="flex-none p-0.5 rounded text-jz-text-muted hover:text-vuln-critical">
            <X size={13} />
          </span>
        )}
        <ChevronDown size={15} className={`flex-none text-jz-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div data-stc-popover role="listbox"
 className={`absolute z-50 top-full mt-1.5 w-[420px] max-w-[92vw] max-h-[440px] flex flex-col
 rounded-xl bg-jz-surface border border-jz-border shadow-jz-card overflow-hidden
 ${align === 'right' ? 'right-0' : 'left-0'}`}>
            {/* 搜索(自动聚焦): #ID/包名/应用名模糊 */}
            <div className="relative flex-none p-2 border-b border-jz-border">
              <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-jz-text-muted pointer-events-none" />
              <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
 data-stc-search placeholder="搜索 #ID / 包名 / 应用名…"
 className="w-full pl-7 pr-2 h-8 rounded-lg bg-jz-elevated/60 text-xs text-jz-text-primary
 placeholder:text-jz-text-muted outline-none focus:ring-2 focus:ring-neon-accent/30" />
            </div>
            {/* 快速筛选 Tab(计数=props 列表真算) */}
            <div className="flex-none flex items-center gap-1 px-2 py-1.5 border-b border-jz-border">
 {TABS.map(([k, label]) => (
                <button key={k} type="button" data-stc-tab={k} onClick={() => { setTab(k); setPage(1); }}
 title={k === 'samepkg' ? '与当前选中项同包名的其他任务/会话' : undefined}
 className={`px-2 py-0.5 rounded-full text-xs transition-colors ${tab === k
 ? 'bg-neon-accent/10 text-neon-accent font-semibold'
 : 'text-jz-text-muted hover:text-jz-text-secondary hover:bg-jz-elevated/60'}`}>
                  {label} <span className="tnum font-mono opacity-70">{tabCount[k]}</span>
                </button>
              ))}
            </div>
            {/* 列表(分页 30/页) */}
            <div className="flex-1 min-h-0 overflow-y-auto" data-stc-list>
              {pageRows.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-jz-text-muted" data-stc-empty>{emptyText}</div>
 )}
 {pageRows.map((it) => {
                const on = it.id === value;
                return (
                  <button key={it.id} type="button" role="option" aria-selected={on} data-stc-item={it.id} onClick={() => pick(it)}
 className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors border-l-2
 ${on ? 'bg-neon-accent/10 border-l-neon-accent' : 'border-l-transparent hover:bg-jz-elevated/50'}`}>
                    <span className="flex-none font-mono text-xs font-semibold text-jz-text-primary tnum">#{it.id}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-jz-text-primary truncate" title={it.app_name || it.package || ''}>
                        {it.app_name || it.package || '—'}
                      </span>
                      <span className="block font-mono text-[11px] text-jz-text-muted truncate" title={it.package || ''}>
                        {it.package || '无包名'}{it.note ? ` · ${it.note}` : ''}
                      </span>
                    </span>
                    <span className="flex-none text-right">
                      <span className="block font-mono text-[11px] text-jz-text-muted tnum" title="审计时间(created_at)">{fmtAuditTime(it.created_at)}</span>
                      <span className="block text-[11px] font-mono tnum">
 {it.highCount != null && it.highCount > 0
                          ? <span className="text-vuln-critical" title={`高危发现 ${it.highCount}`}>高危 {it.highCount}</span>
                          : it.score != null
                            ? <span className={it.score >= 60 ? 'text-vuln-safe' : 'text-vuln-medium'} title={`合规分 ${it.score}`}>{it.score} 分</span>
                            : <span className="text-jz-text-muted">{stLabel(it.status)}</span>}
                      </span>
                    </span>
                    {on && <Check size={13} className="flex-none text-neon-accent" />}
                  </button>
                );
              })}
            </div>
            {/* 分页脚 */}
            <div className="flex-none flex items-center gap-2 px-2.5 py-1.5 border-t border-jz-border text-[11px] text-jz-text-muted">
              <span className="tnum font-mono">{filtered.length} 项</span>
              <span className="flex-1" />
              <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}
 className="px-1.5 h-6 rounded-md hover:bg-jz-elevated disabled:opacity-30">‹</button>
              <span className="tnum font-mono">{safePage}/{pages}</span>
              <button type="button" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}
 className="px-1.5 h-6 rounded-md hover:bg-jz-elevated disabled:opacity-30">›</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
