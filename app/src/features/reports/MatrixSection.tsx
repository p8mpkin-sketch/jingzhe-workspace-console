// MatrixSection.tsx — 鉴权矩阵 API×Role 交叉表(既有 rows 展示层重排,重算零触碰):
// V4 放大: 端点路径搜索框 + 状态过滤胶囊(全部/红越权/黄疏漏/绿拦截/灰未探测)+ 客户端分页(20/50)。
import React, { useMemo, useState } from 'react';
import { ShieldAlert, Minus, CircleDashed, Search } from 'lucide-react';
import { StatusBadge, Skeleton } from '@/components/ui';
import { MX_ICON } from './shared';

const STATUS_PILLS: Array<{ key: 'all' | 'red' | 'yellow' | 'green' | 'gray'; label: string; cls: string }> = [
  { key: 'all', label: '全部', cls: 'bg-jz-surface-2/60 text-jz-ink-2' },
  { key: 'red', label: '红·越权', cls: 'bg-jz-sev-critical/10 text-jz-sev-critical' },
  { key: 'yellow', label: '黄·疏漏', cls: 'bg-jz-sev-medium/10 text-jz-sev-medium' },
  { key: 'green', label: '绿·拦截', cls: 'bg-jz-teal/10 text-jz-teal' },
  { key: 'gray', label: '灰·未判定', cls: 'bg-jz-surface-2 text-jz-muted' },
];

export const MatrixSection: React.FC<{
 mx: any | null;
 state: 'loading' | 'ok' | 'error' | 'empty';
 reload: (refresh: boolean) => void;
  secRef: React.RefObject<HTMLElement>;
 onExportCsv: () => void;
 onExportJson: () => void;
}> = ({ mx, state, reload, secRef, onExportCsv, onExportJson }) => {
  const [q, setQ] = useState('');
  const [stF, setStF] = useState<'all' | 'red' | 'yellow' | 'green' | 'gray'>('all');
  const [pageSize, setPageSize] = useState<20 | 50>(20);
  const [page, setPage] = useState(1);
  const [mxOpen, setMxOpen] = useState<number | null>(null);

 const rows = mx?.rows || [];
 const filtered = useMemo(() => rows
 .map((r: any, i: number) => ({ r, i }))
 .filter(({ r }: any) =>
 (stF === 'all' || (r.authed === 'ui-verified' ? 'yellow' : r.color) === stF)
 && (!q || String(r.path).toLowerCase().includes(q.toLowerCase()))
 ), [rows, q, stF]);
 const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
 const cur = Math.min(page, pages);
 const shown = filtered.slice((cur - 1) * pageSize, cur * pageSize);
 const uiVerifiedN = rows.filter((r: any) => r.authed === 'ui-verified').length;

  return (
    <section className="space-y-2" data-auth-matrix ref={secRef}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-body font-semibold text-jz-ink">鉴权矩阵 API×Role 交叉表</span>
        {mx && <>
          <StatusBadge tone="critical" title="红=匿名可读数据(越权暴露)">红 {mx.counts.red}</StatusBadge>
          <StatusBadge tone="medium" title="黄=登录态新数据(UI 走查)">黄 {mx.counts.yellow}</StatusBadge>
          <StatusBadge tone="custom" className="bg-jz-teal/10 text-jz-teal" title="绿=拦截">绿 {mx.counts.green}</StatusBadge>
          <StatusBadge tone="info" title="灰=SPA 兜底壳/未部署">灰 {mx.counts.gray}</StatusBadge>
        </>}
        <span className="font-mono text-meta text-jz-muted truncate max-w-[280px]" title={mx?.base_url}>{mx?.base_url || ''}</span>
        <span className="flex-1" />
        {mx && <button type="button" onClick={onExportCsv} data-matrix-export-csv className="px-2.5 py-1 rounded-control bg-jz-surface-2/60 hover:bg-jz-brand/10 text-meta text-jz-ink">导出 CSV</button>}
        {mx && <button type="button" onClick={onExportJson} data-matrix-export-json className="px-2.5 py-1 rounded-control bg-jz-surface-2/60 hover:bg-jz-brand/10 text-meta text-jz-ink">导出 JSON</button>}
        <span className="text-meta text-jz-muted font-mono tnum">端点 {rows.length}{uiVerifiedN > 0 && ` · UI走查 ${uiVerifiedN}`}</span>
      </div>

      {state === 'loading' && (
        <div className="rounded-panel bg-jz-surface shadow-card p-3" data-matrix-loading><Skeleton className="h-16" /></div>
      )}
      {state === 'error' && (
        <div className="rounded-card bg-jz-sev-critical/10 p-3 text-body text-jz-sev-critical" data-matrix-error>
          鉴权矩阵加载失败——请确认后端可达后重试
          <button type="button" onClick={() => reload(false)} className="underline ml-2">重试</button>
        </div>
      )}
      {state === 'empty' && (
        <div className="rounded-panel bg-jz-surface shadow-card p-4 text-body text-jz-muted" data-matrix-empty>
          该会话暂无鉴权矩阵(需先在渗透工作台完成网关推导/匿名探测;无 gateway_baseline 时平台 fail-closed 不做跨站实探)。
        </div>
      )}

      {mx && (
        <>
          {mx.stale && (
            <div className="flex items-center gap-2 text-meta text-jz-sev-medium">
              ⚠ 会话事件已漂移(水位 {mx.watermark} → {mx.watermark_now}),矩阵非最新
              <button type="button" onClick={() => reload(true)} className="underline hover:text-jz-ink">重算</button>
            </div>
          )}
          {/* 检索行: 路径搜索 + 状态过滤胶囊 */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-jz-muted" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
 placeholder="搜索端点路径…" data-matrix-search
 className="h-9 w-64 pl-8 pr-3 rounded-control bg-jz-surface-2/60 border border-transparent text-body text-jz-ink placeholder:text-jz-muted outline-none focus:border-jz-brand/50" />
            </div>
            <div className="flex items-center gap-1 flex-wrap" data-matrix-status-filter>
 {STATUS_PILLS.map((p) => {
 const n = p.key === 'all' ? rows.length : rows.filter((r: any) => (r.authed === 'ui-verified' ? 'yellow' : r.color) === p.key).length;
                return (
                  <button key={p.key} type="button" data-matrix-status-pill={p.key}
 onClick={() => { setStF(p.key); setPage(1); }}
 className={`px-2.5 py-1 rounded-pill text-meta font-mono tnum transition-colors ${stF === p.key ? `${p.cls} ring-1 ring-jz-brand/60` : `${p.cls} opacity-60 hover:opacity-100`}`}>
                    {p.label} {n}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="divided-card-list max-h-[520px] overflow-y-auto" data-matrix-table>
            <div className="grid grid-cols-[minmax(0,1fr)_72px_72px_72px] gap-1 px-3 h-10 items-center sticky top-0 z-10 bg-jz-surface text-body font-semibold text-jz-muted">
              <span>端点路径</span>
              <span className="text-center" title="匿名探测腿(auth_matrix 既有判色)">匿名</span>
              <span className="text-center" title="普通用户角色(UI 走查实证行标注;其余未探测)">普通</span>
              <span className="text-center" title="提权角色: 后端无探测数据源,展示层诚实留白(挂账)">提权</span>
            </div>
 {shown.map(({ r, i }: any) => {
              const uiVerified = r.authed === 'ui-verified';
              const open = mxOpen === i;
              return (
                <React.Fragment key={i}>
                  <div className={`grid grid-cols-[minmax(0,1fr)_72px_72px_72px] gap-1 px-3 min-h-[44px] py-1 items-center transition-colors ${open ? 'bg-jz-surface-2/50' : 'hover:bg-jz-surface-2/30'}`}>
                    <button type="button" onClick={() => setMxOpen(open ? null : i)} data-matrix-path={r.path}
 className="flex items-center gap-2 min-w-0 text-left py-1.5" title={r.path}>
                      <span className="font-mono text-meta text-jz-muted flex-none tnum">{i + 1}</span>
                      <span className="font-mono text-body text-jz-ink truncate py-0.5">{r.path}</span>
                    </button>
                    {/* 匿名列: 既有判色如实上图标;UI 走查归并行如实注明匿名腿实为壳响应 */}
                    <button type="button" onClick={() => setMxOpen(open ? null : i)} data-matrix-cell={`${i}:anon`}
 className="h-full w-full flex items-center justify-center" title={uiVerified
 ? `匿名腿=SPA 兜底壳(${r.anon_code} ${r.final_url});判色缓存已按 UI 走查归并为黄(见普通列)`
 : MX_ICON[r.color]?.label || r.color}>
 {(() => {
                        const key = uiVerified ? 'gray' : r.color;
                        const ic = MX_ICON[key];
                        return ic ? <ic.Icon size={15} className={ic.cls} /> : <Minus size={15} className="text-jz-muted" />;
                      })()}
                    </button>
                    {/* 普通列: 仅 UI 走查实证行有真值(authed=ui-verified);登录态腿 token 加密存储显式 SKIP=未探测 */}
                    <span className="h-full w-full flex items-center justify-center" title={uiVerified
 ? 'UI 走查实证: 登录态可见新数据(普通角色维度)'
 : '未探测——登录态 HTTP 腿因 token 加密存储显式 SKIP(后端口径)'}>
                      {uiVerified
                        ? <ShieldAlert size={15} className="text-jz-sev-medium" />
                        : <span className="inline-flex items-center gap-1 text-jz-muted"><CircleDashed size={12} /><span className="text-meta">未探测</span></span>}
                    </span>
                    {/* 提权列: 后端无探测数据源,全部诚实留白(挂账,不假造) */}
                    <span className="h-full w-full flex items-center justify-center" title="未探测——提权角色探测无数据源(挂账)">
                      <span className="inline-flex items-center gap-1 text-jz-muted"><CircleDashed size={12} /><span className="text-meta">未探测</span></span>
                    </span>
                  </div>
                  {open && (
                    <div className="px-3 py-2 bg-jz-surface-2/40 text-meta font-mono text-jz-ink-2 space-y-0.5" data-matrix-evidence={i}>
                      <div>匿名响应码: {r.anon_code ?? '—'} · 耗时 {r.ms ?? '—'}ms · 判色 {r.color}{r.imported ? ' · 导入(本地)' : ''}</div>
                      <div className="truncate" title={r.final_url}>final_url: {r.final_url || '—'}</div>
                      <div>登录态腿: {r.authed || 'skip'}{uiVerified ? '(UI 走查实证)' : '(显式 SKIP)'}</div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            {shown.length === 0 && (
              <div className="px-3 py-4 text-body text-jz-muted">当前过滤条件({stF === 'all' ? '全部状态' : STATUS_PILLS.find((p) => p.key === stF)?.label}{q ? ` · 路径含「${q}」` : ''})无匹配端点</div>
            )}
          </div>
          {/* 客户端分页 20/50 */}
          <div className="flex items-center gap-2 flex-wrap text-meta text-jz-muted">
            <span className="tnum">命中 {filtered.length}/{rows.length} 端点</span>
 {[20, 50].map((n) => (
              <button key={n} type="button" data-matrix-pagesize={n}
 onClick={() => { setPageSize(n as 20 | 50); setPage(1); }}
 className={`px-2 py-0.5 rounded-pill font-mono tnum transition-colors ${pageSize === n ? 'bg-jz-brand/15 text-jz-brand' : 'text-jz-muted hover:text-jz-ink'}`}>
                {n}/页
              </button>
            ))}
            <span className="flex-1" />
            <button type="button" disabled={cur <= 1} onClick={() => setPage(cur - 1)} className="px-2 py-0.5 rounded-pill bg-jz-surface-2/60 disabled:opacity-40 hover:bg-jz-surface-2">上一页</button>
            <span className="tnum">{cur}/{pages}</span>
            <button type="button" disabled={cur >= pages} onClick={() => setPage(cur + 1)} className="px-2 py-0.5 rounded-pill bg-jz-surface-2/60 disabled:opacity-40 hover:bg-jz-surface-2">下一页</button>
          </div>
          <div className="text-meta text-jz-muted">
            红闪=越权暴露(匿名可达) · 绿盾=已拦截 · 黄=配置疏漏(UI 走查) · 灰=SPA 兜底壳/未部署;普通/提权列后端无探测数据源,如实标「未探测」(提权探测=挂账)。点击行/节点展开既有证据(与悬浮详情同源)。
          </div>
        </>
      )}
    </section>
  );
};
