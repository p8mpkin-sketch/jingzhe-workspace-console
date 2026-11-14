import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileUp, Plus, Search } from 'lucide-react';

/**
 * DataToolbar — 全平台统一数据工具条(本轮全平台升级 Step1 三公共组件之一)。
 * 规格: h-11 text-body 搜索框 + 状态计数过滤胶囊组(props 配置)+ 排序下拉 +
 * [导入][导出▾][新增] 按钮组插槽 + 底部分页器(12/24/50/100 + 页码跳转)。
 * 全部受控 props(零内部数据源);不渲染时传 undefined 即隐藏对应槽位。
 * 字号纪律: 全部八档内(11/12/14);分页器作为组件第二行渲染(消费方置于表格下方即「底部分页器」)。
 */

export type ToolbarFilter = { key: string; label: string; count?: number; dot?: boolean; title?: string };
export type ToolbarSortOption = { id: string; label: string };
export type ToolbarPager = {
 total: number;
 page: number;
 pageSize: number;
 onPage: (p: number) => void;
 onPageSize: (n: number) => void;
};

export const TOOLBAR_PAGE_SIZES = [12, 24, 50, 100];

export const DataToolbar: React.FC<{
 /** 每页条数选项(缺省 12/24/50/100;调用方可覆盖) */
 pageSizes?: number[];
 /** 搜索受控值;省略 onSearch=不渲染搜索框(可做纯分页器实例) */
 search?: string;
 onSearch?: (v: string) => void;
 searchPlaceholder?: string;
 filters?: ToolbarFilter[];
 activeFilter?: string;
 onFilter?: (key: string) => void;
 sortOptions?: ToolbarSortOption[];
 sort?: string;
 onSort?: (id: string) => void;
  sortDataAttrs?: Record<string, string | number | undefined>;
 onImport?: () => void;
  importLabel?: string;
  exportItems?: Array<{ id: string; label: string }>;
 onExport?: (id: string) => void;
 onCreate?: () => void;
  createLabel?: string;
  pager?: ToolbarPager;
  /** 附加槽位(调用方自由塞批量条/徽章等) */
  children?: React.ReactNode;
  probe?: string;
  /** 存量探针透传(存量资产闸「只增不删」: 接线页把既有 data-* 探针原样挂到对应节点) */
  searchDataAttrs?: Record<string, string | number | undefined>;
  filterRowDataAttrs?: Record<string, string | number | undefined>;
  pagerDataAttrs?: Record<string, string | number | undefined>;
  /** 搜索框样式覆盖(缺省 h-11 w-64 不变——既有页面零影响;任务中心规格要 h-10 宽搜索框) */
  searchClassName?: string;
  /** 右侧动作区追加槽位(渲染在 导入/导出/新增 之前;缺省不渲染,既有页面零影响) */
  extraActions?: React.ReactNode;
}> = ({
 search, onSearch, searchPlaceholder = '搜索…',
 filters, activeFilter, onFilter,
 sortOptions, sort, onSort,
 onImport, importLabel = '导入',
 exportItems, onExport,
 onCreate, createLabel = '新增',
 pager, children, probe,
 pageSizes,
 searchDataAttrs, filterRowDataAttrs, pagerDataAttrs, sortDataAttrs,
 searchClassName, extraActions,
}) => {
  const sizeOptions = pageSizes?.length ? pageSizes : TOOLBAR_PAGE_SIZES;
  const [expOpen, setExpOpen] = useState(false);
  const [jump, setJump] = useState('');
  const expRef = useRef<HTMLDivElement>(null);

 useEffect(() => {
 if (!expOpen) return;
 const onDown = (e: MouseEvent) => { if (expRef.current && !expRef.current.contains(e.target as Node)) setExpOpen(false); };
 document.addEventListener('mousedown', onDown);
 return () => document.removeEventListener('mousedown', onDown);
 }, [expOpen]);

 const pages = pager ? Math.max(1, Math.ceil(pager.total / pager.pageSize)) : 1;
 const safePage = pager ? Math.min(pager.page, pages) : 1;

 const doJump = () => {
    if (!pager) return;
    const p = Math.max(1, Math.min(pages, Number(jump) || 1));
    pager.onPage(p);
    setJump('');
  };

  return (
    <div className="space-y-2" data-toolbar={probe || ''}>
      {/* 主行: h-11 搜索 + 过滤胶囊 + 排序 + 按钮组(全部槽位缺省且带 pager 时=纯分页器实例,主行不渲染) */}
      {(onSearch || filters || sortOptions || onImport || exportItems || onCreate) && (
      <div className="min-h-11 flex items-center gap-2 flex-wrap" data-toolbar-main>
        {onSearch && (
        <div className="relative flex-none">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-jz-muted pointer-events-none" />
          <input value={search ?? ''} onChange={(e) => onSearch(e.target.value)} placeholder={searchPlaceholder}
 {...(searchDataAttrs || {})}
 data-toolbar-search className={searchClassName ||
 `h-11 w-64 pl-8 pr-3 rounded-card bg-jz-surface-2/60 text-body
 text-jz-ink placeholder:text-jz-muted outline-none
 focus:ring-2 focus:ring-jz-brand/30`} />
        </div>
 )}
 {filters && filters.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap" data-toolbar-filters {...(filterRowDataAttrs || {})}>
 {filters.map((f) => {
              const on = activeFilter === f.key;
              return (
                <button key={f.key} onClick={() => onFilter?.(f.key)} title={f.title}
 data-toolbar-filter={f.key} data-active={on ? '1' : ''}
 className={`flex items-center gap-1.5 h-8 px-3 rounded-pill text-meta font-medium transition-colors whitespace-nowrap
 ${on ? 'bg-jz-brand/10 text-jz-brand font-semibold' : 'text-jz-muted hover:text-jz-ink hover:bg-jz-surface-2/50'}`}>
                  {f.dot && <span className="inline-block h-1.5 w-1.5 rounded-pill bg-jz-brand animate-pulse" data-toolbar-dot />}
                  {f.label}
                  {f.count != null && (
                    <span className={`px-1.5 rounded-pill font-mono tnum text-meta ${on ? 'bg-jz-brand/15 text-jz-brand' : 'bg-jz-surface-2 text-jz-muted'}`}>{f.count}</span>
                  )}
                </button>
              );
            })}
          </div>
 )}
 {sortOptions && sortOptions.length > 0 && (
          <select value={sort ?? sortOptions[0].id} onChange={(e) => onSort?.(e.target.value)}
 data-toolbar-sort title="排序" {...(sortDataAttrs || {})}
 className="h-8 px-2 rounded-control bg-jz-surface-2/60 text-meta text-jz-ink-2 outline-none
 focus:ring-2 focus:ring-jz-brand/30 cursor-pointer">
 {sortOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        )}
        {children}
        <span className="flex-1" />
        <div className="flex items-center gap-2 flex-none" data-toolbar-actions>
          {extraActions}
          {onImport && (
            <button onClick={onImport} data-toolbar-import
 className="inline-flex items-center gap-1 h-8 px-2.5 rounded-control bg-jz-surface-2/60 text-meta
 text-jz-ink-2 hover:text-jz-brand transition-colors">
              <FileUp size={12} /> {importLabel}
            </button>
 )}
 {exportItems && exportItems.length > 0 && onExport && (
            <div className="relative" ref={expRef} data-toolbar-export>
              <button onClick={() => setExpOpen((v) => !v)} data-toolbar-export-toggle
 className="inline-flex items-center gap-1 h-8 px-2.5 rounded-control bg-jz-surface-2/60 text-meta
 text-jz-ink-2 hover:text-jz-brand transition-colors">
                <Download size={12} /> 导出 ▾
              </button>
              {expOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-card bg-jz-surface border border-jz-border shadow-card py-1" data-toolbar-export-panel>
 {exportItems.map((it) => (
                    <button key={it.id} onClick={() => { onExport(it.id); setExpOpen(false); }}
 data-toolbar-export-item={it.id}
 className="w-full text-left px-2.5 py-1.5 text-meta text-jz-ink-2 hover:bg-jz-surface-2/60">
                      {it.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {onCreate && (
            <button onClick={onCreate} data-toolbar-create
 className="inline-flex items-center gap-1 h-8 px-2.5 rounded-control bg-jz-brand/15 text-meta
 text-jz-brand font-semibold hover:bg-jz-brand/25 transition-colors">
              <Plus size={12} /> {createLabel}
            </button>
          )}
        </div>
      </div>
      )}

      {/* 分页行(12/24/50/100 + 页码 + 跳页) */}
      {pager && (
        <div className="flex items-center justify-between gap-2 flex-wrap text-meta" data-toolbar-pager {...(pagerDataAttrs || {})}>
          <div className="flex items-center gap-2 text-jz-muted">
            <span>共 <strong className="text-jz-ink font-semibold tnum">{pager.total}</strong> 项</span>
            <span className="text-jz-muted">·</span>
            <span>第 <strong className="text-jz-ink font-semibold tnum">{safePage}</strong>/{pages} 页</span>
            <select value={pager.pageSize} onChange={(e) => { pager.onPageSize(Number(e.target.value)); }}
 data-toolbar-page-size title="每页条数"
 className="h-7 px-1.5 rounded-control bg-jz-surface-2/60 text-meta text-jz-ink-2 outline-none cursor-pointer">
 {sizeOptions.map((n) => <option key={n} value={n}>{n} 条/页</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button disabled={safePage <= 1} onClick={() => pager.onPage(safePage - 1)} title="上一页"
 className="w-7 h-7 rounded-control border border-jz-border/60 bg-jz-surface text-jz-ink-2
 hover:bg-jz-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={13} className="mx-auto" />
            </button>
            <div className="flex items-center gap-1 px-0.5">
 {Array.from({ length: Math.min(5, pages) }, (_, i) => {
 const p = Math.max(1, Math.min(pages - 4, safePage - 2)) + i;
 if (p > pages) return null;
                return (
                  <button key={p} onClick={() => pager.onPage(p)} data-toolbar-page={p}
 className={`w-7 h-7 rounded-control text-meta font-medium transition-colors ${p === safePage
 ? 'bg-jz-brand text-jz-on-brand shadow-card'
 : 'text-jz-ink-2 hover:bg-jz-surface-2 hover:text-jz-ink'}`}>{p}</button>
 );
 })}
 {pages > 5 && <span className="px-0.5 text-jz-muted">…</span>}
 {pages > 5 && (
                <button onClick={() => pager.onPage(pages)} data-toolbar-page-last
 className="w-7 h-7 rounded-control text-meta text-jz-ink-2 hover:bg-jz-surface-2 hover:text-jz-ink transition-colors">{pages}</button>
              )}
            </div>
            <button disabled={safePage >= pages} onClick={() => pager.onPage(safePage + 1)} title="下一页"
 className="w-7 h-7 rounded-control border border-jz-border/60 bg-jz-surface text-jz-ink-2
 hover:bg-jz-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={13} className="mx-auto" />
            </button>
            <span className="flex items-center gap-1.5 ml-2 pl-2 border-l border-jz-border/40 text-jz-muted font-mono">
              <span>跳至</span>
              <input value={jump} onChange={(e) => setJump(e.target.value.replace(/[^0-9]/g, ''))}
 onKeyDown={(e) => { if (e.key === 'Enter') doJump(); }}
 placeholder="页" data-toolbar-jump inputMode="numeric"
 className="w-10 h-7 text-center bg-jz-surface border border-jz-border/60 rounded-control
 text-jz-ink outline-none focus:border-jz-brand/60 focus:ring-1 focus:ring-jz-brand/30
 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <button onClick={doJump} data-toolbar-jump-go
 className="px-2.5 h-7 rounded-control border border-jz-border/60 bg-jz-surface text-jz-ink-2
 hover:bg-jz-surface-2 text-meta font-medium transition-colors active:scale-95">确定</button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
