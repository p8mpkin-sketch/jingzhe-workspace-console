// HubView.tsx — report hub: metric row, toolbar (search / risk filter / sort / view), task cards or table,
// selection with a batch summary export, pagination. Presentation only; every number comes from the parent.
import React from 'react';
import { LayoutGrid, Table2, FileDown, ArrowUpDown, Check, FileSearch, SearchX, Plus, PanelRight, ArrowRight, Download, Eye } from 'lucide-react';
import {
  Button, StatusBadge, CodePill, Panel, ObjectCard, DataTable, Pagination, BulkBar,
  SearchField, SegmentedControl, Popover, MenuItem, AsyncBoundary, EmptyState, Checkbox, useMediaQuery, useCompactTable,
  SplitView, FactRow, ActionMenu, RowActions, cx,
} from '@/components/ui';
import type { Column, TabItem } from '@/components/ui';
import { ScoreRing, MX_LABEL, scoreCls } from './shared';
import type { HubEntry } from './types';
import { complianceScoreOf } from './types';

const RISK_LABEL: Record<HubState['risk'], string> = { all: '全部', highrisk: '有高危发现', lowscore: '合规分低于 60' };
const SORT_LABEL: Record<HubState['sort'], string> = { new: '最近更新', risk: '风险分从高到低', score: '合规分从低到高' };

export type HubState = {
  q: string;
  risk: 'all' | 'highrisk' | 'lowscore';
  sort: 'new' | 'risk' | 'score';
  /** split = list with a readable preview beside it (drawer below 1280 px); cards and table use the full width. */
  view: 'split' | 'cards' | 'table';
  page: number;
  pageSize: number;
  checked: Set<number>;
};

const riskTone = (level: string) => (level === '严重' || level === '高' ? 'critical' : level === '中' ? 'medium' : 'low');
const domainsOf = (agg: HubEntry['agg']) => (agg?.domains?.rows || []).filter((d) => d.count > 0).sort((a, b) => b.count - a.count);
/** MM-DD HH:mm of the task's last update. The API value is sliced as before; a numeric epoch is formatted the same way. */
const when = (t: any) => {
  const v = t.updated_at;
  if (typeof v === 'number' && v > 0) {
    const d = new Date(v > 1e12 ? v : v * 1000);
    const p2 = (n: number) => String(n).padStart(2, '0');
    return `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  return String(v || '').slice(5, 16).replace('T', ' ');
};

/** The four matrix verdict counts as "label n" pairs; says so when there is no matrix or it is still loading. */
const MatrixCounts: React.FC<{ mx: NonNullable<HubEntry['agg']>['mx'] | undefined; compact?: boolean }> = ({ mx, compact }) => {
  if (mx == null) return <span className="text-jz-muted">统计中</span>;
  if (mx === 'error') return <span className="text-jz-muted" title="该会话尚未生成鉴权矩阵">无矩阵</span>;
  const cell = (k: 'red' | 'yellow' | 'green' | 'gray', cls: string) => (
    <span title={MX_LABEL[k]} className="inline-flex items-center gap-1">
      <span aria-hidden className={`h-1.5 w-1.5 rounded-pill ${cls}`} />
      {!compact && <span className="text-jz-muted">{MX_LABEL[k]}</span>}
      <span className="sr-only">{compact ? MX_LABEL[k] : ''}</span>
      <span className="font-mono tnum text-jz-ink-2">{mx[k]}</span>
    </span>
  );
  return (
    <span className={`inline-flex items-center gap-x-3 gap-y-1 ${compact ? 'whitespace-nowrap' : 'flex-wrap'}`}>
      {cell('red', 'bg-jz-red')}{cell('yellow', 'bg-jz-amber')}{cell('green', 'bg-jz-teal')}{cell('gray', 'bg-jz-border-strong')}
    </span>
  );
};

/** Readable summary of one task's report, built only from the hub's own aggregates (no extra request). */
const ReportPreview: React.FC<{
  entry: HubEntry; onOpen: (tid: number) => void; onExportOne: (tid: number) => void;
  /** Wide split only: Escape or ArrowLeft returns focus to the list row. */
  onBack?: () => void; headingRef?: React.Ref<HTMLHeadingElement>;
}> = ({ entry, onOpen, onExportOne, onBack, headingRef }) => {
  const { task: t, agg } = entry;
  const s = agg?.summary;
  const score = complianceScoreOf(s);
  const top = domainsOf(agg).slice(0, 6);
  const max = Math.max(1, ...top.map((d) => d.count));
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-panel border border-jz-border bg-jz-surface-2" data-hub-preview={t.id}
      onKeyDown={onBack ? (e) => {
        if (e.key !== 'Escape' && e.key !== 'ArrowLeft') return;
        const el = e.target as HTMLElement;
        if (el.closest('[role="menu"], input, select, textarea')) return;
        e.preventDefault(); onBack();
      } : undefined}>
      <div className="flex items-center gap-2 border-b border-jz-border px-6 py-2 text-meta text-jz-muted" data-hub-preview-label>
        <Eye size={14} aria-hidden className="flex-none" />
        <span><span className="font-medium text-jz-ink-2">摘要预览</span> · 不含发现明细与证据</span>
      </div>
      <header className="flex flex-wrap items-start gap-4 border-b border-jz-border px-6 py-5">
        <ScoreRing rate={score ?? 0} size={64} stroke={4.5}>
          <span className={cx('font-display text-section font-semibold tnum', score == null ? 'text-jz-muted' : 'text-jz-ink')} title="合规分">{score ?? '—'}</span>
        </ScoreRing>
        <div className="min-w-0 flex-1 basis-56">
          <div className="text-meta text-jz-muted"><span className="font-mono tnum">#{t.id}</span> · 更新于 <span className="font-mono tnum">{when(t) || '—'}</span></div>
          <h2 ref={headingRef} tabIndex={-1} className="mt-0.5 w-fit max-w-full rounded-control font-display text-section font-semibold text-jz-ink break-words" data-hub-preview-heading>{t.app_name || t.package || `任务 #${t.id}`}</h2>
          <div className="mt-2"><CodePill value={t.package || `任务#${t.id}未返回包名`} maxW="max-w-full" /></div>
        </div>
        {s?.risk_level
          ? <StatusBadge tone={riskTone(s.risk_level)}>风险 {s.risk_level}</StatusBadge>
          : <StatusBadge tone="neutral">{agg?.loading ? '统计中' : '无会话数据'}</StatusBadge>}
      </header>
      <div className="flex flex-col gap-6 px-6 py-5">
        <FactRow facts={[
          { label: '合规分', value: score ?? '—', hint: '100 − 风险分' },
          { label: '确认高危', value: s && typeof s.confirmed_high === 'number' ? s.confirmed_high : '—', tone: s?.confirmed_high ? 'danger' : 'default' },
          { label: '确认 / 复核 / 排除', value: s?.counts ? `${s.counts.confirmed ?? 0} / ${s.counts.pending ?? 0} / ${s.counts.excluded ?? 0}` : '—' },
          { label: '加固', value: <span className="text-body font-medium">{t.packer && t.packer !== 'none' ? t.packer : '未识别'}</span> },
        ]} />
        <section>
          <h3 className="mb-2 text-label font-semibold text-jz-ink">鉴权矩阵</h3>
          <div className="text-label"><MatrixCounts mx={agg?.mx} /></div>
        </section>
        <section>
          <h3 className="mb-2 text-label font-semibold text-jz-ink">发现集中在哪些域</h3>
          {top.length ? (
            <ul className="space-y-2.5">
              {top.map((d) => (
                <li key={d.name}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-label"><span className="text-jz-ink">{d.name}</span><span className="font-mono text-meta tnum text-jz-ink-2">{d.count} 项</span></div>
                  <div className="h-1.5 overflow-hidden rounded-pill bg-jz-surface-2"><div className="h-full rounded-pill bg-jz-brand" style={{ width: `${Math.round((d.count / max) * 100)}%` }} /></div>
                </li>
              ))}
            </ul>
          ) : <p className="text-label text-jz-muted">{agg?.sid ? '这个任务的会话没有发现。' : '没有关联会话，无法按域统计。'}</p>}
        </section>
      </div>
      <footer className="mt-auto flex flex-wrap items-center gap-2 border-t border-jz-border bg-jz-surface px-6 py-3">
        <Button size="sm" onClick={() => onOpen(t.id)} data-hub-open={t.id}>打开完整报告<ArrowRight size={14} aria-hidden /></Button>
        <ActionMenu label="导出" menuLabel={`导出任务 #${t.id}`} icon={<Download size={14} aria-hidden />}
          items={[{ key: 'csv', label: '汇总 CSV', icon: <FileDown size={14} aria-hidden />, onSelect: () => onExportOne(t.id), attrs: { 'data-hub-export-one': t.id } }]} />
        <span className="ml-auto text-meta text-jz-muted">发现明细、证据与 Markdown / JSON 导出在完整报告里</span>
      </footer>
    </article>
  );
};

export const HubView: React.FC<{
  loading: boolean;
  /** Error of the task list request; 401 / 403 renders the permission state. */
  error?: unknown;
  onRetry: () => void;
  onCreate: () => void;
  entries: HubEntry[];
  filtered: HubEntry[];
  paged: HubEntry[];
  kpi: { total: number; highRisk: number | null; avgScore: number | null; exportable: number; aggDone: number; aggTotal: number };
  hub: HubState;
  patch: (p: Partial<HubState>) => void;
  onOpen: (tid: number) => void;
  onExportOne: (tid: number) => void;
  onExportBatch: () => void;
  batchBusy: boolean;
}> = ({ loading, error, onRetry, onCreate, entries, filtered, paged, kpi, hub, patch, onOpen, onExportOne, onExportBatch, batchBusy }) => {
  const allChecked = paged.length > 0 && paged.every((e) => hub.checked.has(e.task.id));
  const aggRunning = kpi.aggDone < kpi.aggTotal;
  const failed = !!error && entries.length === 0;
  const dash = (v: number | null) => (failed || v == null ? '—' : v);
  const aggHint = aggRunning ? `正在汇总 ${kpi.aggDone}/${kpi.aggTotal}` : undefined;

  const toggleAll = () => {
    const next = new Set(hub.checked);
    if (allChecked) paged.forEach((e) => next.delete(e.task.id));
    else paged.forEach((e) => next.add(e.task.id));
    patch({ checked: next });
  };
  const toggleOne = (id: number) => {
    const next = new Set(hub.checked);
    if (next.has(id)) next.delete(id); else next.add(id);
    patch({ checked: next });
  };

  const riskItems: TabItem<HubState['risk']>[] = (['all', 'highrisk', 'lowscore'] as const).map((k) => ({ key: k, label: RISK_LABEL[k], dataAttrs: { 'data-hub-risk-btn': k } }));
  const viewItems: TabItem<HubState['view']>[] = [
    { key: 'split', label: <><PanelRight size={14} aria-hidden /><span className="max-[760px]:sr-only">预览</span></>, dataAttrs: { 'data-hub-view-btn': 'split' } },
    { key: 'cards', label: <><LayoutGrid size={14} aria-hidden /><span className="max-[760px]:sr-only">卡片</span></>, dataAttrs: { 'data-hub-view-btn': 'cards' } },
    { key: 'table', label: <><Table2 size={14} aria-hidden /><span className="max-[760px]:sr-only">表格</span></>, dataAttrs: { 'data-hub-view-btn': 'table' } },
  ];

  const rowActions = (t: any) => (
    <RowActions label={`任务 #${t.id} 的更多操作`}
      primary={<Button size="sm" variant="secondary" onClick={() => onOpen(t.id)} data-hub-open={t.id}>查看报告</Button>}
      more={[{ key: 'csv', label: '导出汇总 CSV', icon: <FileDown size={14} aria-hidden />, onSelect: () => onExportOne(t.id), attrs: { 'data-hub-export-one': t.id } }]} />
  );

  // Split view: the selected task (first on the page by default on wide screens; none on narrow, so the drawer stays closed).
  const wide = useMediaQuery('(min-width: 1280px)');
  const [pick, setPick] = React.useState<number | null>(null);
  const current = paged.find((e) => e.task.id === pick) ?? (wide ? paged[0] : undefined);
  // Roving focus: one tab stop for the list; arrows move it (and the preview, on wide screens),
  // Enter opens the full report, ArrowRight moves into the preview and Escape / ArrowLeft come back.
  const listRef = React.useRef<HTMLUListElement>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const [focusId, setFocusId] = React.useState<number | null>(null);
  const rovingId = (paged.some((e) => e.task.id === focusId) ? focusId : current?.task.id) ?? paged[0]?.task.id;
  const focusPick = (id: number) => listRef.current?.querySelector<HTMLElement>(`[data-hub-pick="${id}"]`)?.focus();
  const onPickKey = (e: React.KeyboardEvent<HTMLElement>, idx: number, id: number) => {
    const move = (to: number) => {
      const next = paged[Math.max(0, Math.min(paged.length - 1, to))]?.task.id;
      if (next == null) return;
      e.preventDefault(); setFocusId(next); if (wide) setPick(next); focusPick(next);
    };
    if (e.key === 'ArrowDown') move(idx + 1);
    else if (e.key === 'ArrowUp') move(idx - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(paged.length - 1);
    else if (e.key === 'Enter') { e.preventDefault(); if (wide) onOpen(id); else setPick(id); }
    else if (e.key === ' ') { e.preventDefault(); setPick(id); }
    else if (e.key === 'ArrowRight' && wide) { e.preventDefault(); setPick(id); requestAnimationFrame(() => headingRef.current?.focus()); }
  };

  // Secondary columns appear only where there is room for them; all of them stay in the cards and in the CSV.
  const mid = useMediaQuery('(min-width: 1280px)');
  const roomy = useMediaQuery('(min-width: 1600px)');
  const compact = useCompactTable();
  const columns: Column<HubEntry>[] = ([
    { key: 'task', header: '任务', card: 'title', cell: ({ task: t }) => (
      <span className="flex min-w-0 max-w-64 flex-col">
        <span className="truncate font-medium text-jz-ink" title={t.app_name || ''}>{t.app_name || t.package || `任务 #${t.id}`}</span>
        <span className="truncate font-mono text-meta text-jz-muted" title={t.package}>#{t.id} · {t.package || '未返回包名'}</span>
      </span>
    ) },
    { key: 'packer', header: '加固', cell: ({ task: t }) => (t.packer && t.packer !== 'none' ? t.packer : '未识别') },
    { key: 'score', header: '合规分', align: 'right', mono: true, cell: ({ agg }) => { const s = complianceScoreOf(agg?.summary); return <span className={scoreCls(s)}>{s ?? '—'}</span>; } },
    { key: 'high', header: '高危', align: 'right', mono: true, cell: ({ agg }) => {
      const s = agg?.summary;
      return <span className={s?.confirmed_high ? 'font-semibold text-jz-sev-critical' : 'text-jz-muted'}>{s && typeof s.confirmed_high === 'number' ? s.confirmed_high : '—'}</span>;
    } },
    { key: 'counts', header: <span title="已确认 / 待复核 / 已排除">确认 / 复核 / 排除</span>, label: '确认 / 复核 / 排除', align: 'right', mono: true, cell: ({ agg }) => {
      const s = agg?.summary;
      return s?.counts ? `${s.counts.confirmed ?? 0} / ${s.counts.pending ?? 0} / ${s.counts.excluded ?? 0}` : '—';
    } },
    { key: 'mx', header: '鉴权矩阵', cell: ({ agg }) => <MatrixCounts mx={agg?.mx} compact /> },
    { key: 'domains', header: '主要域', card: 'hidden', cell: ({ agg }) => {
      const top = domainsOf(agg);
      const txt = top.map((d) => `${d.name} ${d.count}`).join(' · ');
      return <span className="block max-w-56 truncate text-jz-ink-2" title={txt}>{top.length ? top.slice(0, 2).map((d) => `${d.name} ${d.count}`).join(' · ') : agg?.sid ? '无发现' : '—'}</span>;
    } },
    { key: 'updated', header: '更新', mono: true, cell: ({ task: t }) => when(t) || '—' },
    { key: 'actions', header: <span className="sr-only">操作</span>, label: '操作', align: 'right', card: 'action', cell: ({ task: t }) => (
      <span className="inline-flex whitespace-nowrap">{rowActions(t)}</span>
    ) },
  ] as Column<HubEntry>[]).filter((c) => compact || ((roomy || (c.key !== 'domains' && c.key !== 'updated')) && (mid || (c.key !== 'counts' && c.key !== 'packer'))));

  return (
    <div className="flex flex-col gap-6" data-reports-hub>
      <section aria-label="报告概况" className="rounded-panel border border-jz-border bg-jz-surface px-6 py-4 shadow-card" data-hub-kpis>
        <FactRow facts={[
          { label: '已完成评估任务', value: <span data-hub-kpi="已审计任务">{loading ? '…' : failed ? '—' : kpi.total}</span>, hint: '类型为评估且状态为已完成' },
          { label: '确认高危发现', value: <span data-hub-kpi="累计高危">{loading ? '…' : dash(kpi.highRisk)}</span>, tone: kpi.highRisk ? 'danger' : 'default', hint: aggHint ?? '各任务最新会话的确认高危之和' },
          { label: <span title="平台没有 MASVS 绝对合规分;此处为 100 减去会话风险分,限定在 0 到 100">平均合规分</span>, value: <span data-hub-kpi="平均 MASVS 分">{loading ? '…' : dash(kpi.avgScore)}</span>, hint: aggHint ?? '合规分 = 100 − 风险分' },
          { label: '可导出完整报告', value: <span data-hub-kpi="可导出完整报告">{loading ? '…' : failed ? '—' : kpi.exportable}</span>, hint: '有关联活跃会话的任务' },
        ]} />
      </section>

      <Panel flush>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3" data-hub-toolbar>
          <SearchField className="min-w-56 flex-1" value={hub.q} onValueChange={(v) => patch({ q: v, page: 1 })}
            label="搜索任务" placeholder="搜索包名、任务编号或应用名" data-hub-search />
          <div data-hub-risk><SegmentedControl items={riskItems} value={hub.risk} onChange={(k) => patch({ risk: k, page: 1 })} label="风险筛选" /></div>
          <Popover label="排序方式" role="menu" align="end"
            trigger={(tp) => <Button variant="secondary" icon={<ArrowUpDown size={14} aria-hidden />} data-menu-btn {...tp}>{SORT_LABEL[hub.sort]}</Button>}>
            {(close) => (['new', 'risk', 'score'] as const).map((k) => (
              <MenuItem key={k} data-hub-sort={k} aria-checked={hub.sort === k} onClick={() => { patch({ sort: k, page: 1 }); close(); }}
                icon={<Check size={14} aria-hidden className={hub.sort === k ? 'text-jz-brand' : 'invisible'} />}>{SORT_LABEL[k]}</MenuItem>
            ))}
          </Popover>
          <div data-hub-view-toggle><SegmentedControl items={viewItems} value={hub.view} onChange={(k) => patch({ view: k })} label="视图" /></div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-jz-border px-4 py-2 text-label text-jz-muted">
          <span className="tnum">共 {entries.length} 个任务,符合条件 {filtered.length} 个</span>
          {paged.length > 0 && (hub.view !== 'table' || compact) && (
            <Checkbox className="!items-center" checked={allChecked} onChange={toggleAll} data-hub-check-all label={<span className="text-label text-jz-ink-2">选择本页</span>} />
          )}
        </div>
        <BulkBar count={hub.checked.size} onClear={() => patch({ checked: new Set() })} className="border-t">
          <Button size="sm" loading={batchBusy} icon={<FileDown size={14} aria-hidden />} onClick={onExportBatch} data-hub-batch-export>
            {batchBusy ? '正在汇总' : '导出汇总 CSV'}
          </Button>
        </BulkBar>

        <div className="border-t border-jz-border">
          <AsyncBoundary loading={loading && entries.length === 0} error={error} stale={!!error && entries.length > 0} onRetry={onRetry}
            skeleton={hub.view === 'cards' ? 'cards' : 'table'}
            empty={filtered.length === 0}
            emptyState={entries.length === 0 ? (
              <div data-hub-empty>
                <EmptyState icon={FileSearch} title="还没有已完成的评估任务" cause="评估任务完成后,它的报告会出现在这里。"
                  action={<Button icon={<Plus size={16} aria-hidden />} onClick={onCreate}>新建评估</Button>} />
              </div>
            ) : (
              <div data-hub-empty>
                <EmptyState icon={SearchX} title="没有符合条件的任务" cause="当前的搜索词或风险筛选没有匹配结果。"
                  action={<Button variant="secondary" onClick={() => patch({ q: '', risk: 'all', page: 1 })}>清除筛选</Button>} />
              </div>
            )}>
            {hub.view === 'split' ? (
              <div className="p-4" data-hub-split>
                <SplitView open={!!current} onClose={() => setPick(null)}
                  detailTitle={current ? (current.task.app_name || current.task.package || `任务 #${current.task.id}`) : '报告预览'}
                  detail={current ? <ReportPreview entry={current} onOpen={onOpen} onExportOne={onExportOne} headingRef={headingRef}
                    onBack={wide ? () => focusPick(current.task.id) : undefined} /> : null}
                  list={(
                    <ul ref={listRef} className="divide-y divide-jz-border overflow-hidden rounded-card border border-jz-border" aria-label="已完成评估任务" data-hub-list>
                      {paged.map((e, idx) => {
                        const t = e.task; const s = e.agg?.summary; const score = complianceScoreOf(s);
                        const on = current?.task.id === t.id;
                        return (
                          <li key={t.id} data-hub-row={t.id} aria-current={on ? 'true' : undefined}
                            className={cx('flex items-center gap-3 px-3 py-3 transition-colors duration-hover', on ? 'bg-jz-brand-soft' : 'hover:bg-jz-surface-2')}>
                            <Checkbox className="!items-center" checked={hub.checked.has(t.id)} onChange={() => toggleOne(t.id)} data-hub-check={t.id}
                              label={<span className="sr-only">选择任务 #{t.id}</span>} />
                            <div className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-control" onClick={() => { setFocusId(t.id); setPick(t.id); }}
                              role="button" tabIndex={t.id === rovingId ? 0 : -1} onKeyDown={(ev) => onPickKey(ev, idx, t.id)}
                              aria-keyshortcuts={wide ? 'ArrowUp ArrowDown Home End Enter ArrowRight' : 'ArrowUp ArrowDown Home End Enter'}
                              aria-label={`预览 ${t.app_name || t.package || '任务 #' + t.id}`} data-hub-pick={t.id}>
                              <span className={cx('w-9 flex-none text-right font-mono text-body font-semibold tnum', scoreCls(score))} title="合规分">{score ?? '—'}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-label font-medium text-jz-ink">{t.app_name || t.package || `任务 #${t.id}`}</span>
                                <span className="block truncate font-mono text-meta text-jz-muted">#{t.id} · {when(t) || '—'}</span>
                              </span>
                              {s?.risk_level
                                ? <StatusBadge tone={riskTone(s.risk_level)}>{s.risk_level}</StatusBadge>
                                : <StatusBadge tone="neutral">{e.agg?.loading ? '统计中' : '无数据'}</StatusBadge>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )} />
                <p className="mt-3 text-meta text-jz-muted" data-hub-keys>{wide
                  ? '↑ ↓ 切换预览，→ 进入预览，Enter 打开完整报告；勾选后可批量导出汇总 CSV。'
                  : '点一行查看摘要预览；勾选后可批量导出汇总 CSV。'}</p>
              </div>
            ) : hub.view === 'cards' ? (
              <div className="grid grid-cols-1 gap-4 p-4 table:grid-cols-2 desktop:grid-cols-3 wide:grid-cols-4" data-hub-cards>
                {paged.map(({ task: t, agg }) => {
                  const score = complianceScoreOf(agg?.summary);
                  const s = agg?.summary;
                  const top = domainsOf(agg);
                  const domTxt = top.length ? top.slice(0, 3).map((d) => `${d.name} ${d.count}`).join(' · ') : agg?.sid ? '无发现' : '无关联会话';
                  return (
                    <ObjectCard key={t.id} data-hub-card={t.id}
                      title={<span className="block truncate" title={t.app_name || t.package || ''}>{t.app_name || t.package || `任务 #${t.id}`}</span>}
                      subtitle={<span className="font-mono tnum">#{t.id} · 更新于 {when(t) || '—'}</span>}
                      media={(
                        <ScoreRing rate={score ?? 0} size={48} stroke={4.5}>
                          <span className={`font-mono text-label font-semibold tnum ${score == null ? 'text-jz-muted' : 'text-jz-ink'}`} title="合规分">{score ?? '—'}</span>
                        </ScoreRing>
                      )}
                      badge={s?.risk_level
                        ? <StatusBadge tone={riskTone(s.risk_level)}>风险 {s.risk_level}</StatusBadge>
                        : <StatusBadge tone="neutral">{agg?.loading ? '统计中' : '无会话数据'}</StatusBadge>}
                      footer={(
                        <>
                          <Checkbox className="!items-center" checked={hub.checked.has(t.id)} onChange={() => toggleOne(t.id)} data-hub-check={t.id}
                            label={<span className="text-label text-jz-ink-2">选择</span>} />
                          {rowActions(t)}
                        </>
                      )}>
                      <CodePill value={t.package || `任务#${t.id}未返回包名`} maxW="max-w-full" />
                      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-label">
                        <dt className="text-jz-muted">确认高危</dt>
                        <dd className={`font-mono tnum ${s?.confirmed_high ? 'font-semibold text-jz-sev-critical' : 'text-jz-ink-2'}`}>{s && typeof s.confirmed_high === 'number' ? s.confirmed_high : '—'}</dd>
                        <dt className="text-jz-muted">加固</dt>
                        <dd className="text-jz-ink-2">{t.packer && t.packer !== 'none' ? t.packer : '未识别'}</dd>
                        <dt className="text-jz-muted">鉴权矩阵</dt>
                        <dd className="text-meta"><MatrixCounts mx={agg?.mx} compact /></dd>
                        <dt className="text-jz-muted">主要域</dt>
                        <dd className="truncate text-jz-ink-2" title={domTxt} data-hub-domains={t.id}>{domTxt}</dd>
                      </dl>
                    </ObjectCard>
                  );
                })}
              </div>
            ) : (
              <div data-hub-table>
                <DataTable<HubEntry> label="已完成评估任务" columns={columns} rows={paged} rowKey={(e) => e.task.id}
                  selected={hub.checked as Set<string | number>} onToggle={(k) => toggleOne(Number(k))} onToggleAll={toggleAll}
                  rowDataAttrs={(e) => ({ 'data-hub-row': e.task.id })} stickyHeader={false} />
              </div>
            )}
          </AsyncBoundary>
        </div>
        {filtered.length > 0 && (
          <Pagination page={hub.page} pageSize={hub.pageSize} total={filtered.length} onPage={(p) => patch({ page: p })}
            onPageSize={(n) => patch({ pageSize: n, page: 1 })} pageSizes={[12, 24, 48]} jump dataAttrs={{ 'data-hub-pager': '' }}
            controlAttrs={{ prev: { 'data-hub-page-prev': '' }, next: { 'data-hub-page-next': '' }, jump: { 'data-hub-page-jump': '' }, size: (n) => ({ 'data-hub-pagesize': n }) }} />
        )}
      </Panel>
    </div>
  );
};
