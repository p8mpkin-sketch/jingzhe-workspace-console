// HubView.tsx — report hub: metric row, toolbar (search / risk filter / sort / view), task cards or table,
// selection with a batch summary export, pagination. Presentation only; every number comes from the parent.
import React from 'react';
import { LayoutGrid, Table2, FileDown, ArrowUpDown, Check, FileSearch, SearchX, Plus } from 'lucide-react';
import {
  Button, StatusBadge, CodePill, Panel, Metric, MetricGrid, ObjectCard, DataTable, Pagination, BulkBar,
  SearchField, SegmentedControl, Popover, MenuItem, AsyncBoundary, EmptyState, Checkbox, IconButton, useMediaQuery, useCompactTable,
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
  view: 'cards' | 'table';
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
    { key: 'cards', label: <><LayoutGrid size={14} aria-hidden /><span className="max-[760px]:sr-only">卡片</span></>, dataAttrs: { 'data-hub-view-btn': 'cards' } },
    { key: 'table', label: <><Table2 size={14} aria-hidden /><span className="max-[760px]:sr-only">表格</span></>, dataAttrs: { 'data-hub-view-btn': 'table' } },
  ];

  const rowActions = (t: any) => (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant="ghost" icon={<FileDown size={14} aria-hidden />} onClick={() => onExportOne(t.id)} data-hub-export-one={t.id}
        title="导出该任务的汇总 CSV">汇总 CSV</Button>
      <Button size="sm" variant="secondary" onClick={() => onOpen(t.id)} data-hub-open={t.id}>查看报告</Button>
    </span>
  );

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
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <IconButton size="sm" variant="ghost" label="导出该任务的汇总 CSV" onClick={() => onExportOne(t.id)}><FileDown size={14} aria-hidden /></IconButton>
        <Button size="sm" variant="secondary" onClick={() => onOpen(t.id)}>查看报告</Button>
      </span>
    ) },
  ] as Column<HubEntry>[]).filter((c) => compact || ((roomy || (c.key !== 'domains' && c.key !== 'updated')) && (mid || (c.key !== 'counts' && c.key !== 'packer'))));

  return (
    <div className="flex flex-col gap-6" data-reports-hub>
      <MetricGrid>
        <Metric label="已完成评估任务" value={failed ? '—' : kpi.total} loading={loading} hint="类型为评估且状态为已完成" data-hub-kpi="已审计任务" />
        <Metric label="确认高危发现" value={dash(kpi.highRisk)} loading={loading} tone={kpi.highRisk ? 'danger' : 'default'}
          hint={aggHint ?? '各任务最新会话的确认高危之和'} data-hub-kpi="累计高危" />
        <Metric label="平均合规分" value={dash(kpi.avgScore)} loading={loading}
          hint={aggHint ?? '合规分 = 100 − 风险分'} title="平台没有 MASVS 绝对合规分;此处为 100 减去会话风险分,限定在 0 到 100" data-hub-kpi="平均 MASVS 分" />
        <Metric label="可导出完整报告" value={failed ? '—' : kpi.exportable} loading={loading} hint="有关联活跃会话的任务" data-hub-kpi="可导出完整报告" />
      </MetricGrid>

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
          {paged.length > 0 && (hub.view === 'cards' || compact) && (
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
            {hub.view === 'cards' ? (
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
