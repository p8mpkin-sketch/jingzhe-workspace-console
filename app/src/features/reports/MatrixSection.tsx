// MatrixSection.tsx — auth matrix (endpoint × role). Rows and verdicts come from the API unchanged;
// this file only filters, pages and lays them out.
import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, CircleDashed, Minus, TableProperties } from 'lucide-react';
import { Panel, SearchField, SegmentedControl, Pagination, EmptyState, ErrorState, StaleNotice, SkeletonLoader, Button } from '@/components/ui';
import type { TabItem } from '@/components/ui';
import { MX_ICON, MX_LABEL } from './shared';

type StKey = 'all' | 'red' | 'yellow' | 'green' | 'gray';
const colorOf = (r: any): string => (r.authed === 'ui-verified' ? 'yellow' : r.color);
const GRID = 'grid grid-cols-[minmax(0,1fr)_repeat(3,3.5rem)] items-center gap-1 px-4 tablet:grid-cols-[minmax(0,1fr)_repeat(3,5rem)]';

const NotProbed: React.FC<{ why: string }> = ({ why }) => (
  <span className="inline-flex items-center justify-center gap-1 text-jz-muted" title={why}>
    <CircleDashed size={14} aria-hidden /><span className="sr-only tablet:not-sr-only tablet:text-meta">未探测</span>
  </span>
);

export const MatrixSection: React.FC<{
  mx: any | null;
  state: 'loading' | 'ok' | 'error' | 'empty';
  reload: (refresh: boolean) => void;
  hasSession: boolean;
}> = ({ mx, state, reload, hasSession }) => {
  const [q, setQ] = useState('');
  const [stF, setStF] = useState<StKey>('all');
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState(1);
  const [mxOpen, setMxOpen] = useState<number | null>(null);

  const rows: any[] = mx?.rows || [];
  const filtered = useMemo(() => rows
    .map((r: any, i: number) => ({ r, i }))
    .filter(({ r }) => (stF === 'all' || colorOf(r) === stF) && (!q || String(r.path).toLowerCase().includes(q.toLowerCase()))),
  [rows, q, stF]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const uiVerifiedN = rows.filter((r: any) => r.authed === 'ui-verified').length;

  const statusItems: TabItem<StKey>[] = (['all', 'red', 'yellow', 'green', 'gray'] as const).map((k) => ({
    key: k, label: k === 'all' ? '全部' : MX_LABEL[k],
    count: k === 'all' ? rows.length : rows.filter((r) => colorOf(r) === k).length,
    dataAttrs: { 'data-matrix-status-pill': k },
  }));

  return (
    <Panel flush data-auth-matrix title="鉴权矩阵"
      description={mx
        ? <>{rows.length} 个端点{uiVerifiedN > 0 && `,其中 ${uiVerifiedN} 个经界面走查`}{mx.base_url && <> · <span className="font-mono">{mx.base_url}</span></>}</>
        : '各端点在匿名、普通用户、高权限三种身份下的访问结果'}>
      {mx?.stale && (
        <div className="px-4 pt-3">
          <StaleNotice reason={`会话在矩阵生成后又产生了新事件(${mx.watermark} → ${mx.watermark_now})。`} onRefresh={() => reload(true)} />
        </div>
      )}

      {!mx && state === 'loading' && hasSession && <div className="p-4" data-matrix-loading><SkeletonLoader variant="table" rows={4} /></div>}
      {!mx && state === 'error' && <div data-matrix-error><ErrorState compact title="鉴权矩阵加载失败" message="服务端没有返回矩阵。请确认后端可达后重试。" onRetry={() => reload(false)} /></div>}
      {!mx && (state === 'empty' || (state === 'loading' && !hasSession)) && (
        <div data-matrix-empty>
          <EmptyState compact icon={TableProperties} title="该会话还没有鉴权矩阵"
            cause="矩阵在工作台完成网关推导和匿名探测后生成。没有网关基线时,平台不会对外发起探测。" />
        </div>
      )}

      {mx && (
        <>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <SearchField className="min-w-48 flex-1 tablet:max-w-xs" value={q} onValueChange={(v) => { setQ(v); setPage(1); }} label="搜索端点路径" data-matrix-search />
            <div data-matrix-status-filter className="max-w-full overflow-x-auto">
              <SegmentedControl items={statusItems} value={stF} onChange={(k) => { setStF(k); setPage(1); }} label="按结果筛选" />
            </div>
          </div>

          <div role="table" aria-label="鉴权矩阵" className="border-t border-jz-border" data-matrix-table>
            <div role="row" className={`${GRID} h-jz-table-head bg-jz-surface-2 text-label font-medium text-jz-muted`}>
              <span role="columnheader">端点路径</span>
              <span role="columnheader" className="text-center" title="匿名身份的探测结果">匿名</span>
              <span role="columnheader" className="text-center" title="普通用户身份;只有界面走查过的端点有结果">普通</span>
              <span role="columnheader" className="text-center" title="高权限身份;平台目前没有这一身份的探测数据">高权限</span>
            </div>
            {shown.map(({ r, i }) => {
              const uiVerified = r.authed === 'ui-verified';
              const open = mxOpen === i;
              const ic = MX_ICON[uiVerified ? 'gray' : r.color];
              return (
                <div key={i} role="rowgroup" className="border-t border-jz-border">
                  <div role="row" className={`${GRID} min-h-jz-row transition-colors duration-hover ${open ? 'bg-jz-surface-2' : 'hover:bg-jz-surface-2'}`}>
                    <button type="button" role="cell" onClick={() => setMxOpen(open ? null : i)} data-matrix-path={r.path} aria-expanded={open}
                      className="flex min-h-jz-row min-w-0 items-center gap-2 text-left max-[760px]:min-h-jz-touch" title={r.path}>
                      {open ? <ChevronDown size={14} className="flex-none text-jz-muted" aria-hidden /> : <ChevronRight size={14} className="flex-none text-jz-muted" aria-hidden />}
                      <span className="truncate font-mono text-label text-jz-ink">{r.path}</span>
                    </button>
                    <span role="cell" data-matrix-cell={`${i}:anon`} className="flex items-center justify-center"
                      title={uiVerified ? `匿名请求返回兜底页面(${r.anon_code} ${r.final_url});该端点按界面走查结果归为「登录后可见」` : ic?.label || r.color}>
                      {ic ? <ic.Icon size={16} className={ic.cls} aria-hidden /> : <Minus size={16} className="text-jz-muted" aria-hidden />}
                      <span className="sr-only">{MX_LABEL[uiVerified ? 'gray' : r.color] || r.color}</span>
                    </span>
                    <span role="cell" className="flex items-center justify-center">
                      {uiVerified
                        ? <span title={MX_ICON.yellow.label}><MX_ICON.yellow.Icon size={16} className={MX_ICON.yellow.cls} aria-hidden /><span className="sr-only">{MX_LABEL.yellow}</span></span>
                        : <NotProbed why="未探测:登录态请求被跳过(凭据加密存储)" />}
                    </span>
                    <span role="cell" className="flex items-center justify-center"><NotProbed why="未探测:平台没有高权限身份的探测数据" /></span>
                  </div>
                  {open && (
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 bg-jz-surface-2 px-4 pb-3 pl-10 font-mono text-meta text-jz-ink-2" data-matrix-evidence={i}>
                      <dt className="text-jz-muted">匿名响应</dt>
                      <dd>{r.anon_code ?? '—'} · {r.ms ?? '—'} ms · 结果 {MX_LABEL[r.color] || r.color}{r.imported ? ' · 本地导入' : ''}</dd>
                      <dt className="text-jz-muted">最终地址</dt>
                      <dd className="break-all">{r.final_url || '—'}</dd>
                      <dt className="text-jz-muted">登录态</dt>
                      <dd>{r.authed || 'skip'}{uiVerified ? '(界面走查)' : '(已跳过)'}</dd>
                    </dl>
                  )}
                </div>
              );
            })}
            {shown.length === 0 && (
              <EmptyState compact title="没有符合条件的端点" cause={`${stF === 'all' ? '' : `结果为「${MX_LABEL[stF]}」`}${q ? `${stF === 'all' ? '' : ',且'}路径包含「${q}」` : ''}的端点不存在。`}
                action={<Button variant="secondary" size="sm" onClick={() => { setQ(''); setStF('all'); setPage(1); }}>清除筛选</Button>} />
            )}
          </div>
          <Pagination page={cur} pageSize={pageSize} total={filtered.length} onPage={setPage} pageSizes={[20, 50]}
            onPageSize={(n) => { setPageSize(n); setPage(1); }} controlAttrs={{ size: (n) => ({ 'data-matrix-pagesize': n }) }}
            summary={<>符合条件 <span className="tnum text-jz-ink-2">{filtered.length}</span> / {rows.length} 个端点</>} />
          <p className="border-t border-jz-border px-4 py-2.5 text-meta text-jz-muted">
            「普通」列只有界面走查过的端点有结果,「高权限」列目前没有数据来源,两者都如实标为未探测。点击一行查看该端点的探测记录。
          </p>
        </>
      )}
    </Panel>
  );
};
