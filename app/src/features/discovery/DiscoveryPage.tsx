import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, FlaskConical, ShieldCheck, ListChecks } from 'lucide-react';
import { api } from '@/services/api';
import {
  Page, PageHeader, MetricGrid, Metric, Panel, DataTable, SegmentedControl, StatusBadge, Tag, AsyncBoundary, EmptyState, InlineAlert,
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

      <div data-discovery-kpis>
        <MetricGrid>
          {KPI.map(({ key, label, hint }) => (
            <Metric key={key} label={label} hint={hint} loading={!data && !error} data-discovery-kpi={key}
              tone={key === 'unresolved_total' && data && data.unresolved_total > 0 ? 'attention' : 'default'}
              value={<span data-discovery-value={key}>{data ? (data[key as keyof Overview] as number) : '—'}</span>} />
          ))}
        </MetricGrid>
      </div>

      <AsyncBoundary loading={!data && !error} error={error} onRetry={load} skeleton="table">
        {data && (
          <>
            <Panel title="处理环节" data-discovery-pipeline
              description={`${data.apk_with_confirmed} / ${data.tasks_total} 个应用有已确认的结果`}>
              {pipeline.length === 0 ? <EmptyState compact title="没有环节信息" cause="服务端没有返回处理环节。" /> : (
                <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
                  {pipeline.map((s, i) => (
                    <li key={s.id} className="flex items-center gap-1.5">
                      <StatusBadge tone={STAGE_TONE[s.state] ?? 'neutral'} title={STAGE_STATE[s.state] ?? '未开始'}>
                        <span data-discovery-stage={s.id}><span className="mr-1 font-mono tnum text-jz-muted">{String(i + 1).padStart(2, '0')}</span>{s.label}</span>
                        <span className="sr-only">({STAGE_STATE[s.state] ?? '未开始'})</span>
                      </StatusBadge>
                      {i < pipeline.length - 1 && <ChevronRight size={14} className="flex-none text-jz-muted" aria-hidden />}
                    </li>
                  ))}
                </ol>
              )}
            </Panel>

            <div className="grid grid-cols-1 gap-6 desktop:grid-cols-3">
              <Panel flush className="desktop:col-span-2" title="已确认的证据" data-discovery-confirmed
                actions={<SegmentedControl items={filterItems} value={filter} onChange={setFilter} label="按证据来源筛选" />}>
                <DataTable<Confirmed> label="已确认的证据" columns={columns} rows={rows} rowKey={(r) => r.finding_id || r.hypothesis_id}
                  rowDataAttrs={(r) => ({ 'data-discovery-row': r.hypothesis_id })} stickyHeader={false}
                  state={rows.length === 0 ? (
                    <EmptyState compact icon={ListChecks} title={confirmed.length === 0 ? '还没有已确认的结果' : '没有符合条件的结果'}
                      cause={confirmed.length === 0 ? '候选通过判定和独立核验后会出现在这里。' : '当前筛选下没有已确认的结果。'} />
                  ) : undefined} />
              </Panel>

              <div className="flex min-w-0 flex-col gap-6">
                <Panel title="证据来源" data-discovery-provenance>
                  <dl className="space-y-2 text-label">
                    {([['真实设备', real, 'bg-jz-teal'], ['合成数据', synthetic, 'bg-jz-amber'], ['待核验(silver)', data.silver_total, 'bg-jz-border-strong']] as const).map(([label, n, cls]) => (
                      <div key={label} className="flex items-center gap-2">
                        <span aria-hidden className={`h-2 w-2 flex-none rounded-pill ${cls}`} />
                        <dt className="flex-1 text-jz-ink-2">{label}</dt>
                        <dd className="font-mono tnum text-jz-ink">{n}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 border-t border-jz-border pt-3 text-meta text-jz-muted">已确认只来自判定加独立核验。合成数据已单独标记,不当作真实设备上的取值。</p>
                </Panel>

                <Panel title="未决候选" description="缺少动态证据,不计入已确认" data-discovery-unresolved>
                  <div className="font-display text-metric font-semibold tnum text-jz-ink">{data.unresolved_total}</div>
                  {tasks.length > 0 && (
                    <>
                      <div className="mt-3 flex items-center justify-between text-meta text-jz-muted"><span>应用</span><span>数据流假设</span></div>
                      <ul className="mt-1 space-y-1.5 text-label">
                        {tasks.slice(0, 4).map((t) => (
                          <li key={t.task} className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-jz-ink-2" title={t.task}>{shortTask(t.task)}</span>
                            <span className="font-mono tnum text-jz-muted">{t.dataflow}</span>
                          </li>
                        ))}
                      </ul>
                      {tasks.length > 4 && <p className="mt-2 text-meta text-jz-muted">只列出前 4 个,共 {tasks.length} 个应用。</p>}
                    </>
                  )}
                </Panel>
              </div>
            </div>

            <InlineAlert tone="info">
              候选 = 数据流假设;已确认 = 通过判定并经独立核验;真实设备与合成数据按证据来源区分。这些数字只反映已接入的应用,不代表覆盖完整。
            </InlineAlert>
          </>
        )}
      </AsyncBoundary>
    </Page>
  );
};
