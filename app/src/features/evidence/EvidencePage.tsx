// EvidencePage.tsx — /evidence: confirmed hypotheses across apps from GET /api/v2/overview (the one read, as in
// 777f03e). Counts in a readout row, the processing chain, a source filter plus a search, the list in the
// workbench's own evidence row, and the selected item in the workbench's evidence detail panel (right side from
// 1280 px, a drawer below). Only the presentation is shared with the workbench; the data model is evidenceModel.ts.
import React, { useMemo, useRef, useState } from 'react';
import { ChevronRight, FlaskConical, ListChecks, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  Button, CoverageDisclosure, Drawer, EmptyState, ErrorState, Page, PageHeader, Panel, PermissionState, Readout, SearchField,
  SegmentedControl, SkeletonLoader, StaleNotice, StatusBadge, Tag, cx, useMediaQuery, BREAKPOINT,
} from '@/components/ui';
import type { ReadoutCell, TabItem } from '@/components/ui';
import { moduleLabel } from '@/layout/navigation';
import { READ_WORD, STALE_WORD, hasValue, useRead, useSlow } from '@/features/dashboard/readout';
import { EvidenceHead, EvidenceRow } from '@/features/pentest/workbench/surfaces/evidence/EvidenceRow';
import { CopyId, DetailAttr, EvidenceDetail } from '@/features/pentest/workbench/surfaces/evidence/EvidenceDetail';
import { COUNTS, countOf, filterRows, matchSource, pickOverview, rowKey, shortId, shortTask, STAGE_STATE } from './evidenceModel';
import type { Confirmed, SourceFilter } from './evidenceModel';

const COLS = 'grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_7.5rem_minmax(0,0.8fr)_4.5rem] max-[760px]:grid-cols-[minmax(0,1fr)_6.5rem]';

const SourceMark: React.FC<{ r: Confirmed }> = ({ r }) => (r.synthetic
  ? <Tag title="证据来自合成数据,不代表真实设备上的取值"><FlaskConical size={12} aria-hidden className="mr-1 inline" />合成数据</Tag>
  : <Tag mono title="证据来自真实设备"><ShieldCheck size={12} aria-hidden className="mr-1 inline text-jz-teal" />{r.provenance || '真实设备'}</Tag>);

export const EvidencePage: React.FC = () => {
  const read = useRead('/api/v2/overview', pickOverview);
  const data = hasValue(read) ? read.value : null;
  const slow = useSlow(read.state === 'loading');
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [q, setQ] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const wide = useMediaQuery(`(min-width: ${BREAKPOINT.desktop}px)`);
  const listRef = useRef<HTMLUListElement>(null);

  const confirmed = data?.confirmed ?? [];
  const rows = useMemo(() => filterRows(confirmed, filter, q), [confirmed, filter, q]);
  const open = openKey ? confirmed.find((r) => rowKey(r) === openKey) || null : null;
  const real = countOf(data, 'real_confirmed');
  const synthetic = countOf(data, 'synthetic_confirmed');
  const stateWord = read.state === 'value' || read.state === 'stale' ? '' : READ_WORD[read.state];

  const cells: ReadoutCell[] = COUNTS.map(({ key, label, hint }) => {
    const v = countOf(data, key);
    return { label, hint, value: v != null ? v : data ? '未返回' : stateWord, text: v == null,
      dataAttrs: { 'data-discovery-kpi': key, 'data-discovery-value': key, 'data-read': v != null ? read.state : data ? 'missing' : read.state } };
  });
  const filterItems: TabItem<SourceFilter>[] = [
    { key: 'all', label: '全部', count: data ? confirmed.length : null, dataAttrs: { 'data-discovery-filter': 'all' } },
    { key: 'real', label: '真实设备', count: data ? confirmed.filter((r) => matchSource(r, 'real')).length : null, dataAttrs: { 'data-discovery-filter': 'real' } },
    { key: 'synthetic', label: '合成数据', count: data ? confirmed.filter((r) => matchSource(r, 'synthetic')).length : null, dataAttrs: { 'data-discovery-filter': 'synthetic' } },
  ];

  const close = () => {
    const k = openKey; setOpenKey(null);
    if (k && wide) requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-discovery-row="${CSS.escape(k)}"]`)?.focus());
  };
  const onListKey = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-discovery-row]')];
    const i = all.indexOf(document.activeElement as HTMLElement); if (i < 0) return;
    const next = all[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (next) { e.preventDefault(); next.focus(); }
  };

  const detail = open && (
    <EvidenceDetail attrs={{ 'data-discovery-detail': '' }} onClose={close} closeLabel="关闭详情"
      mark={<SourceMark r={open} />} title={shortTask(open.task) || '已确认的假设'} id={open.hypothesis_id}
      actions={<CopyId text={open.hypothesis_id} />}>
      <dl className="px-3 py-2">
        <DetailAttr label="假设"><span className="break-all font-mono text-mono">{open.hypothesis_id}</span></DetailAttr>
        <DetailAttr label="应用"><span className="break-all">{open.task || '—'}</span></DetailAttr>
        <DetailAttr label="来源">{open.synthetic ? '合成数据(不代表真实设备上的取值)' : `真实设备 · ${open.provenance || '—'}`}</DetailAttr>
        <DetailAttr label="设备"><span className="font-mono text-mono">{open.device || '—'}</span></DetailAttr>
        <DetailAttr label="发现"><span className="break-all font-mono text-mono">{open.finding_id || '—'}</span></DetailAttr>
        <DetailAttr label="证明"><span className="font-mono text-mono">{open.proof_level || '—'}</span></DetailAttr>
        <DetailAttr label="核验">{open.source || '设备来源'}</DetailAttr>
      </dl>
      <p className="border-t border-jz-border px-3 py-2 text-meta text-jz-ink-2">发现编号来自跨应用汇总,汇总里没有会话编号,所以这里不链接到工作台。</p>
    </EvidenceDetail>
  );

  let listState: React.ReactNode = null;
  if (read.state === 'loading') listState = <div data-state="loading" data-discovery-loading><SkeletonLoader variant="table" rows={5} />{slow && <p role="status" className="px-4 pb-3 text-label text-jz-muted" data-slow>仍在读取证据汇总,接口响应较慢。</p>}</div>;
  else if (read.state === 'permission') listState = <div data-discovery-error><PermissionState title="无权限" message="当前账号不能读取证据汇总(接口返回 403)。" /></div>;
  else if (read.state === 'unread') listState = <div data-discovery-error><ErrorState title="证据汇总未读取" message={`${(read.error as any)?.message || '接口没有返回数据'}。计数和列表都未读取,不按 0 计。`} onRetry={read.reload} /></div>;
  else if (confirmed.length === 0) listState = <div data-evidence-empty><EmptyState compact icon={ListChecks} title="还没有已确认的结果" cause="数据流假设通过判定并经独立核验后会出现在这里。先在评估会话里完成核验环节。" /></div>;
  else if (rows.length === 0) listState = <div data-discovery-filter-empty><EmptyState compact title="没有符合条件的结果" cause={q ? `“${q}”在当前来源筛选下没有匹配项。` : '当前来源筛选下没有已确认的结果。'} action={<Button size="sm" variant="secondary" onClick={() => { setFilter('all'); setQ(''); }}>清除筛选</Button>} /></div>;

  const list = (
    <Panel flush title="已确认的证据" description="点一行查看完整的假设、发现编号和核验来源。" data-discovery-confirmed
      actions={<SegmentedControl items={filterItems} value={filter} onChange={setFilter} label="按证据来源筛选" />}>
      <div className="border-b border-jz-border px-4 py-2">
        <SearchField value={q} onValueChange={setQ} placeholder="搜索假设编号、应用、发现编号" label="搜索已确认的证据" className="max-w-md" data-evidence-search />
      </div>
      {listState ?? (
        <div data-evidence-list>
          <EvidenceHead cols={COLS}>
            <div>假设</div><div className="max-[760px]:hidden">应用</div><div>来源</div><div className="max-[760px]:hidden">发现编号</div><div className="text-right max-[760px]:hidden">证明</div>
          </EvidenceHead>
          <ul ref={listRef} aria-label={`已确认的证据,${rows.length} 条`} onKeyDown={onListKey}>
            {rows.map((r) => {
              const k = rowKey(r);
              return (
                <EvidenceRow key={k} cols={COLS} selected={openKey === k} onSelect={() => setOpenKey(openKey === k ? null : k)} line="border-transparent pl-3"
                  attrs={{ 'data-discovery-row': r.hypothesis_id, 'data-evidence-synthetic': r.synthetic ? '' : undefined }}>
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-mono text-jz-ink" title={r.hypothesis_id}>{r.hypothesis_id}</span>
                    <span className="block truncate text-meta text-jz-ink-2 max-[760px]:hidden" title={r.source}>{r.source || '设备来源'}</span>
                    <span className="hidden truncate text-meta text-jz-ink-2 max-[760px]:block" title={r.task}>{shortTask(r.task)} · {r.finding_id || '—'}</span>
                  </span>
                  <span className="min-w-0 truncate text-label text-jz-ink-2 max-[760px]:hidden" title={r.task}>{shortTask(r.task)}</span>
                  <span className="min-w-0 truncate"><SourceMark r={r} /></span>
                  <span className="min-w-0 truncate font-mono text-mono text-jz-ink-2 max-[760px]:hidden" title={r.finding_id}>{r.finding_id || '—'}</span>
                  <span className="text-right font-mono text-mono text-jz-ink max-[760px]:hidden"><span className="sr-only">证明级别 </span>{r.proof_level || '—'}</span>
                </EvidenceRow>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );

  return (
    <Page data-discovery-page data-evidence-page>
      <PageHeader title={moduleLabel('/evidence')}
        description="数据流假设经过性质、假设、调用图、规划、判定和核验几个环节;只有通过判定并经独立核验的假设才计为已确认。"
        meta={data && (real != null || synthetic != null) ? <>
          <StatusBadge tone="success">真实设备 {real ?? '未返回'}</StatusBadge>
          <StatusBadge tone="neutral">合成数据 {synthetic ?? '未返回'}</StatusBadge>
        </> : undefined}
        actions={<Button variant="secondary" icon={<RefreshCw size={16} aria-hidden />} onClick={read.reload} data-evidence-refresh>刷新</Button>} />

      {read.state === 'stale' && <StaleNotice reason={`${STALE_WORD},下面是上次读到的汇总。`} onRefresh={read.reload} />}
      <section aria-label="发现概况" className="overflow-hidden rounded-card border border-jz-border bg-jz-surface" data-discovery-kpis>
        <div data-readout-row><Readout label="证据计数" cells={cells} className="rounded-none border-0" /></div>
        {data && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-jz-border px-4 py-3" data-discovery-pipeline>
            <span className="text-label font-medium text-jz-ink-2">处理环节</span>
            {data.pipeline.length === 0 ? <span className="text-meta text-jz-muted">服务端没有返回处理环节。</span> : (
              <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
                {data.pipeline.map((st, i) => (
                  <li key={st.id} className="flex items-center gap-1.5">
                    <StatusBadge tone={st.state === 'done' ? 'success' : st.state === 'active' ? 'brand' : 'neutral'} title={STAGE_STATE[st.state] ?? '未开始'}>
                      <span data-discovery-stage={st.id}><span className="mr-1 font-mono tnum text-jz-muted">{String(i + 1).padStart(2, '0')}</span>{st.label}</span>
                      <span className="sr-only">({STAGE_STATE[st.state] ?? '未开始'})</span>
                    </StatusBadge>
                    {i < data.pipeline.length - 1 && <ChevronRight size={14} className="flex-none text-jz-muted" aria-hidden />}
                  </li>
                ))}
              </ol>
            )}
            <span className="ml-auto text-meta text-jz-muted" data-evidence-apps>{countOf(data, 'apk_with_confirmed') ?? '未返回'} / {countOf(data, 'tasks_total') ?? '未返回'} 个应用有已确认的结果</span>
          </div>
        )}
      </section>

      <div className={cx('grid grid-cols-1 gap-6', wide && 'grid-cols-12 items-start')}>
        <div className={cx('min-w-0', wide && (open ? 'col-span-8' : 'col-span-8'))}>{list}</div>
        {wide && (
          <aside aria-label="证据详情" className="sticky top-4 col-span-4 flex min-w-0 flex-col gap-6" data-evidence-side
            onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); close(); } }}>
            {open ? <div className="flex max-h-[calc(100vh-8rem)] min-h-0 flex-col overflow-hidden rounded-card border border-jz-border bg-jz-surface">{detail}</div> : null}
            {data && <Coverage data={data} />}
          </aside>
        )}
      </div>
      {!wide && data && <Coverage data={data} />}

      {data && (
        <Panel flush title="未决候选按应用" description="缺少动态证据,不计入已确认" data-discovery-unresolved>
          {data.tasks.length > 0 ? (
            <>
              <ul className="grid grid-cols-1 text-label tablet:grid-cols-2 desktop:grid-cols-3 [&>li]:border-b [&>li]:border-jz-border">
                {data.tasks.slice(0, 9).map((t) => (
                  <li key={t.task} className="flex items-center gap-2 px-5 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-jz-ink-2" title={t.task}>{shortTask(t.task)}</span>
                    <span className="font-mono tnum text-jz-muted" title="数据流假设">{t.dataflow}</span>
                  </li>
                ))}
              </ul>
              {data.tasks.length > 9 && <p className="px-5 py-2.5 text-meta text-jz-muted">只列出前 9 个,共 {data.tasks.length} 个应用。</p>}
            </>
          ) : <EmptyState compact title="没有按应用的统计" cause="汇总里还没有按应用的数据流假设。" />}
        </Panel>
      )}

      {!wide && <Drawer open={!!open} onClose={close} title={open ? `证据 ${shortId(open.hypothesis_id)}` : '证据'}>{detail || <span />}</Drawer>}
    </Page>
  );
};

const Coverage: React.FC<{ data: ReturnType<typeof pickOverview> }> = ({ data }) => {
  const n = (k: string) => countOf(data, k);
  return (
    <CoverageDisclosure title="证据来源与覆盖" data-discovery-provenance
      sources={[
        { key: 'real', label: '真实设备', state: (n('real_confirmed') ?? 0) > 0 ? 'used' : 'unused', count: n('real_confirmed') ?? '未返回', detail: '判定加独立核验,取值来自真实设备。' },
        { key: 'synthetic', label: '合成数据', state: (n('synthetic_confirmed') ?? 0) > 0 ? 'used' : 'unused', count: n('synthetic_confirmed') ?? '未返回', detail: '单独标记,不当作真实设备上的取值。' },
        { key: 'silver', label: '待核验', state: 'unavailable', count: n('silver_total') ?? '未返回', detail: '还没有独立核验,不计入已确认。' },
        { key: 'unresolved', label: '未决', state: 'unavailable', count: n('unresolved_total') ?? '未返回', detail: '缺少动态证据,不计入已确认。' },
      ]}
      note="待证假设 = 数据流假设;已确认 = 通过判定并经独立核验。这些数字只反映已接入的应用,公开来源和已接入范围都无法保证覆盖完整。" />
  );
};

export default EvidencePage;
