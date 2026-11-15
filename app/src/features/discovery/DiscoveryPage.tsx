import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, FlaskConical, ShieldCheck, ListChecks } from 'lucide-react';
import { api } from '@/services/api';
import {
  Page, PageHeader, Panel, DataTable, SegmentedControl, StatusBadge, Tag, AsyncBoundary, EmptyState, Drawer, FactRow, CoverageDisclosure,
} from '@/components/ui';
import type { Column, TabItem } from '@/components/ui';
import { moduleLabel } from '@/layout/navigation';

type Confirmed = {
  hypothesis_id: string;
  task: string;
  provenance: string;
  device: string;
  finding_id: string;
  proof_level: string;
  synthetic: boolean;
  source: string;
};
type TaskRow = { task: string; paths: number; dataflow: number };
type Stage = { id: string; label: string; state: string };
type Overview = {
  tasks_total: number;
  candidates_total: number;
  confirmed_total: number;
  real_confirmed: number;
  synthetic_confirmed: number;
  silver_total: number;
  unresolved_total: number;
  apk_with_confirmed: number;
  sink_families: number;
  tasks: TaskRow[];
  confirmed: Confirmed[];
  pipeline: Stage[];
};

const KPI = [
  { key: 'tasks_total', label: '已接入应用', hint: '可读取的评估任务' },
  { key: 'candidates_total', label: '候选路径', hint: '由数据流假设生成' },
  { key: 'confirmed_total', label: '已确认', hint: '通过独立核验' },
  { key: 'unresolved_total', label: '未决', hint: '缺少动态证据' },
] as const;

type Filter = 'all' | 'real' | 'synthetic';
const STAGE_TONE: Record<string, 'success' | 'brand' | 'neutral'> = { done: 'success', active: 'brand' };
const STAGE_STATE: Record<string, string> = { done: '已完成', active: '进行中' };

const shortTask = (s: string) => s.replace(/^com\./, '').replace(/\.(consultant|zhenbaoxian|browser)$/, '');
const shortId = (s: string) => s.length > 22 ? s.slice(0, 12) + '…' + s.slice(-6) : s;

export const DiscoveryPage: React.FC = () => {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Confirmed | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<Overview>('/api/v2/overview')
      .then(setData)
      .catch((e) => setError(e || new Error('加载失败')));
  }, []);
  useEffect(() => { load(); }, [load]);

  const confirmed = data?.confirmed ?? [];
  const rows = useMemo(
    () => confirmed.filter((r) => filter === 'all' || (filter === 'synthetic' ? r.synthetic : !r.synthetic)),
    [confirmed, filter],
  );

  const real = data?.real_confirmed ?? 0;
  const synthetic = data?.synthetic_confirmed ?? 0;
  const pipeline = data?.pipeline ?? [];
  const tasks = data?.tasks ?? [];

  const filterItems: TabItem<Filter>[] = [
    { key: 'all', label: '全部', count: confirmed.length, dataAttrs: { 'data-discovery-filter': 'all' } },
    { key: 'real', label: '真实设备', count: confirmed.filter((r) => !r.synthetic).length, dataAttrs: { 'data-discovery-filter': 'real' } },
    { key: 'synthetic', label: '合成数据', count: confirmed.filter((r) => r.synthetic).length, dataAttrs: { 'data-discovery-filter': 'synthetic' } },
  ];

  const columns: Column<Confirmed>[] = [
    { key: 'hyp', header: '假设', card: 'title', cell: (r) => (
      <span className="flex min-w-0 flex-col">
        <span className="font-mono text-label text-jz-ink" title={r.hypothesis_id}>{shortId(r.hypothesis_id)}</span>
        <span className="max-w-56 truncate text-meta text-jz-muted">{r.source || '设备来源'}</span>
      </span>
    ) },
    { key: 'task', header: '应用', cell: (r) => <span title={r.task}>{shortTask(r.task)}</span> },
    { key: 'evidence', header: '证据来源', cell: (r) => (
      r.synthetic
        ? <Tag title="证据来自合成数据,不代表真实设备上的取值"><FlaskConical size={12} aria-hidden className="mr-1 inline" />合成数据</Tag>
        : <Tag mono title="证据来自真实设备"><ShieldCheck size={12} aria-hidden className="mr-1 inline text-jz-teal" />{r.provenance}</Tag>
    ) },
    { key: 'device', header: '设备', mono: true, cell: (r) => r.device || '—' },
    { key: 'proof', header: '证明级别', align: 'right', mono: true, cell: (r) => r.proof_level || '—' },
  ];

  return (
    <Page data-discovery-page>
      <PageHeader title={moduleLabel('/discovery')}
        description="候选路径经过性质、假设、调用图、规划、判定和核验几个环节;只有通过判定并经独立核验的候选才计为已确认。"
        meta={data && (
          <>
            <StatusBadge tone="success">真实设备 {real}</StatusBadge>
            <StatusBadge tone="neutral">合成数据 {synthetic}</StatusBadge>
          </>
        )} />

      {!!error && !data && <span className="sr-only" data-discovery-error>加载失败</span>}
      {!error && !data && <span className="sr-only" data-discovery-loading>加载中</span>}

      {/* Counts and the processing chain on one quiet surface: they describe the same funnel. */}
      <section aria-label="发现概况" className="overflow-hidden rounded-panel border border-jz-border bg-jz-surface shadow-card" data-discovery-kpis>
        <FactRow className="px-6 py-4" facts={KPI.map(({ key, label, hint }) => ({
          label, hint,
          tone: key === 'unresolved_total' && data && data.unresolved_total > 0 ? 'attention' as const : 'default' as const,
          value: <span data-discovery-kpi={key}><span data-discovery-value={key}>{data ? (data[key as keyof Overview] as number) : error ? '—' : '…'}</span></span>,
        }))} />
        {data && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-jz-border px-6 py-3" data-discovery-pipeline>
            <span className="text-label font-medium text-jz-ink-2">处理环节</span>
            {pipeline.length === 0 ? <span className="text-meta text-jz-muted">服务端没有返回处理环节。</span> : (
              <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
                {pipeline.map((st, i) => (
                  <li key={st.id} className="flex items-center gap-1.5">
                    <StatusBadge tone={STAGE_TONE[st.state] ?? 'neutral'} title={STAGE_STATE[st.state] ?? '未开始'}>
                      <span data-discovery-stage={st.id}><span className="mr-1 font-mono tnum text-jz-muted">{String(i + 1).padStart(2, '0')}</span>{st.label}</span>
                      <span className="sr-only">({STAGE_STATE[st.state] ?? '未开始'})</span>
                    </StatusBadge>
                    {i < pipeline.length - 1 && <ChevronRight size={14} className="flex-none text-jz-muted" aria-hidden />}
                  </li>
                ))}
              </ol>
            )}
            <span className="ml-auto text-meta text-jz-muted">{data.apk_with_confirmed} / {data.tasks_total} 个应用有已确认的结果</span>
          </div>
        )}
      </section>

      <AsyncBoundary loading={!data && !error} error={error} stale={!!error && !!data} onRetry={load} skeleton="table">
        {data && (
          <div className="grid grid-cols-1 gap-6 desktop:grid-cols-12">
            <Panel flush className="desktop:col-span-8" title="已确认的证据" description="点一行查看完整的假设、发现编号和证据来源。" data-discovery-confirmed
              actions={<SegmentedControl items={filterItems} value={filter} onChange={setFilter} label="按证据来源筛选" />}>
              <DataTable<Confirmed> label="已确认的证据" columns={columns} rows={rows} rowKey={(r) => r.finding_id || r.hypothesis_id}
                rowDataAttrs={(r) => ({ 'data-discovery-row': r.hypothesis_id })} stickyHeader={false} onRowClick={setOpen}
                rowClassName={(r) => (open && open.hypothesis_id === r.hypothesis_id ? 'bg-jz-brand-soft' : undefined)}
                state={rows.length === 0 ? (
                  <EmptyState compact icon={ListChecks} title={confirmed.length === 0 ? '还没有已确认的结果' : '没有符合条件的结果'}
                    cause={confirmed.length === 0 ? '候选通过判定和独立核验后会出现在这里。' : '当前筛选下没有已确认的结果。'} />
                ) : undefined} />
            </Panel>

            <div className="flex min-w-0 flex-col gap-6 desktop:col-span-4">
              <CoverageDisclosure title="证据来源与覆盖" data-discovery-provenance
                sources={[
                  { key: 'real', label: '真实设备', state: real > 0 ? 'used' : 'unused', count: real, detail: '判定加独立核验，取值来自真实设备。' },
                  { key: 'synthetic', label: '合成数据', state: synthetic > 0 ? 'used' : 'unused', count: synthetic, detail: '单独标记，不当作真实设备上的取值。' },
                  { key: 'silver', label: '待核验（silver）', state: 'unavailable', count: data.silver_total, detail: '还没有独立核验，不计入已确认。' },
                  { key: 'unresolved', label: '未决候选', state: 'unavailable', count: data.unresolved_total, detail: '缺少动态证据。' },
                ]}
                note="候选 = 数据流假设；已确认 = 通过判定并经独立核验。这些数字只反映已接入的应用，公开来源和已接入范围都无法保证覆盖完整。" />

            </div>
            <Panel flush className="desktop:col-span-12" title="未决候选按应用" description="缺少动态证据，不计入已确认" data-discovery-unresolved>
              {tasks.length > 0 ? (
                <>
                  <ul className="grid grid-cols-1 text-label tablet:grid-cols-2 desktop:grid-cols-3 [&>li]:border-b [&>li]:border-jz-border">
                    {tasks.slice(0, 9).map((t) => (
                      <li key={t.task} className="flex items-center gap-2 px-5 py-2.5">
                        <span className="min-w-0 flex-1 truncate text-jz-ink-2" title={t.task}>{shortTask(t.task)}</span>
                        <span className="font-mono tnum text-jz-muted" title="数据流假设">{t.dataflow}</span>
                      </li>
                    ))}
                  </ul>
                  {tasks.length > 9 && <p className="px-5 py-2.5 text-meta text-jz-muted">只列出前 9 个，共 {tasks.length} 个应用。</p>}
                </>
              ) : <EmptyState compact title="没有按应用的统计" />}
            </Panel>
          </div>
        )}
      </AsyncBoundary>

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `证据 ${shortId(open.hypothesis_id)}` : '证据'}>
        {open && (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-label" data-discovery-detail>
            {([
              ['假设', <span className="break-all font-mono">{open.hypothesis_id}</span>],
              ['应用', <span className="break-all">{open.task}</span>],
              ['证据来源', open.synthetic ? '合成数据（不代表真实设备上的取值）' : `真实设备 · ${open.provenance}`],
              ['设备', <span className="font-mono">{open.device || '—'}</span>],
              ['发现编号', <span className="break-all font-mono">{open.finding_id || '—'}</span>],
              ['证明级别', <span className="font-mono">{open.proof_level || '—'}</span>],
              ['核验来源', open.source || '设备来源'],
            ] as Array<[string, React.ReactNode]>).map(([k, v]) => (
              <React.Fragment key={k}><dt className="text-jz-muted">{k}</dt><dd className="min-w-0 text-jz-ink">{v}</dd></React.Fragment>
            ))}
          </dl>
        )}
      </Drawer>
    </Page>
  );
};
