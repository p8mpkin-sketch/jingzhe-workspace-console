// GlobalSignal.tsx — the first screen of the overview: one sentence built only from numbers that were read,
// the list of what needs attention now, the readout row and the tasks running now. Below it, the findings by
// domain (D2: a list sorted by count; no compliance score, no chart library).
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Lock, RefreshCw } from 'lucide-react';
import { Button, Skeleton, StatusGlyph, StatusText, cx } from '@/components/ui';
import { DOMAINS, domainOf, OTHER_DOMAIN_NAME } from '@/features/pentest/masvsDomains';
import { READ_WORD, STALE_WORD, hasValue, worstOf } from './readout';
import type { Read, ReadState } from './readout';
import type { DashboardReads, NodeRow } from './useDashboardReads';
import { QUEUED_LIMIT } from './useDashboardReads';

/* ───────────── one value in its read state ───────────── */

/** A value, or the word for its state. Loading is a fixed-size placeholder so nothing moves when it lands. */
export const ReadValue: React.FC<{
  state: ReadState; children?: React.ReactNode; onRetry?: () => void; size?: 'value' | 'text'; className?: string; label?: string;
}> = ({ state, children, onRetry, size = 'value', className, label }) => {
  if (state === 'loading') return <span role="status" aria-label={label ? `${label}读取中` : '读取中'} data-read="loading" className={cx('inline-block align-middle', className)}><Skeleton className={size === 'value' ? 'h-6 w-14' : 'h-4 w-24'} /></span>;
  if (state === 'permission') return <span data-read="permission" className={cx('inline-flex items-center gap-1 text-label font-medium text-jz-ink-2', className)}><Lock size={12} aria-hidden className="text-jz-muted" />{READ_WORD.permission}</span>;
  if (state === 'unread') return (
    <span data-read="unread" className={cx('inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-label font-medium text-jz-ink-2', className)}>
      <span className="inline-flex items-center gap-1"><StatusGlyph kind="failed" />{READ_WORD.unread}</span>
      {onRetry && <button type="button" onClick={onRetry} data-read-retry className="inline-flex items-center gap-1 rounded-control text-meta font-medium text-jz-brand underline-offset-2 hover:underline"><RefreshCw size={12} aria-hidden />重试</button>}
    </span>
  );
  return (
    <span data-read={state} className={cx('inline-flex min-w-0 flex-col', className)}>
      <span>{children}</span>
      {state === 'stale' && <span className="text-meta font-normal text-jz-amber-ink" data-read-stale>{STALE_WORD}</span>}
    </span>
  );
};

/* ───────────── derivations (only from what was read) ───────────── */

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const queuedText = (q: number) => (q >= QUEUED_LIMIT ? `至少 ${QUEUED_LIMIT}` : String(q));
const fieldState = (r: Read<any>, v: unknown): ReadState => ((r.state === 'value' || r.state === 'stale') && r.value != null && n(v) == null ? 'unread' : r.state);

/** Session with the most critical findings, for the attention item's single action. */
const worstSession = (sev: Read<any>): number | null => {
  const by = sev.value?.by_session || {};
  let best: number | null = null; let max = 0;
  for (const [sid, m] of Object.entries<any>(by)) { const c = Number(m?.critical?.active ?? 0); if (c > max) { max = c; best = Number(sid); } }
  return best;
};

export type Attention = { key: string; glyph: 'failed' | 'attention' | 'blocked'; text: React.ReactNode; action: React.ReactNode };

/* ───────────── the first screen ───────────── */

export const GlobalSignal: React.FC<{ reads: DashboardReads; now: number }> = ({ reads, now }) => {
  const nav = useNavigate();
  const { summary, queued, running, sev, nodes, sessions } = reads;
  const s = summary.value || {};
  const run = n(s.running), failed = n(s.failed), done = n(s.done), total = n(s.total);
  const q = hasValue(queued) ? queued.value : null;
  const crit = n(sev.value?.by_severity?.critical), high = n(sev.value?.by_severity?.high);
  const nodeList: NodeRow[] | null = nodes && hasValue(nodes) ? nodes.value : null;
  const online = nodeList ? nodeList.filter((x) => x.online).length : null;
  const offline = nodeList ? nodeList.filter((x) => !x.online) : [];

  // Conclusion sentence: one clause per number that was read; nothing is guessed for the others.
  const queueState = worstOf(summary.state, queued.state);
  const clauses: string[] = [];
  if (run != null && q != null) clauses.push(run === 0 && q === 0 ? '现在没有运行或排队的评估。' : `现在有 ${run} 个评估在运行，${queuedText(q)} 个在排队。`);
  else if (run != null) clauses.push(run === 0 ? '现在没有运行中的评估，排队数未读取。' : `现在有 ${run} 个评估在运行，排队数未读取。`);
  else if (q != null) clauses.push(`${queuedText(q)} 个评估在排队，运行数未读取。`);
  if (failed != null) clauses.push(failed > 0 ? `${failed} 个失败的任务需要查看原因。` : '没有失败的任务。');
  if (crit != null && crit > 0) clauses.push(`有 ${crit} 个严重风险发现还没有关闭。`);
  const sentence = clauses.length ? clauses.join('')
    : summary.state === 'permission' && queued.state === 'permission' ? '没有查看队列的权限。'
    : queueState === 'loading' ? null : '队列暂时无法读取。';

  // What needs attention now. Each item appears only when its condition holds and has exactly one action.
  const items: Attention[] = [];
  if (failed != null && failed > 0) items.push({ key: 'failed', glyph: 'failed', text: <><span className="font-mono tnum">{failed}</span> 个任务失败</>,
    action: <Button size="sm" variant="secondary" onClick={() => nav('/tasks?status=failed')} data-attn-action="failed">查看失败任务</Button> });
  const worst = worstSession(sev);
  if (crit != null && crit > 0) {
    const link = worst != null ? Object.values(sessions.value || {}).find((l) => l.sid === worst) : undefined;
    items.push({ key: 'critical', glyph: 'attention', text: <><span className="font-mono tnum">{crit}</span> 个严重风险发现，来自 <span className="font-mono tnum">{n(sev.value?.sessions_scanned) ?? '—'}/{n(sev.value?.sessions_total) ?? '—'}</span> 个会话</>,
      action: worst != null
        ? <Button size="sm" variant="secondary" onClick={() => nav(`/projects/${link?.pid ?? 0}/sessions/${worst}?view=findings`)} data-attn-action="critical">查看会话 #{worst}</Button>
        : <Button size="sm" variant="secondary" onClick={() => nav('/projects')} data-attn-action="critical">查看项目</Button> });
  }
  if (offline.length > 0) items.push({ key: 'nodes', glyph: 'blocked', text: <><span className="font-mono tnum">{offline.length}</span> 个执行节点离线</>,
    action: (
      <details className="group" data-attn-action="nodes">
        <summary className="inline-flex h-7 cursor-pointer list-none items-center rounded-control border border-jz-border-strong bg-jz-surface px-2.5 text-meta font-medium text-jz-ink hover:bg-jz-surface-2 [&::-webkit-details-marker]:hidden">查看节点</summary>
        <ul className="mt-2 space-y-1 text-meta text-jz-ink-2" data-node-list>
          {(nodeList || []).map((x) => (
            <li key={x.node_id} data-node={x.node_id} className="flex flex-wrap items-center gap-x-2">
              <StatusText kind={x.online ? 'done' : 'blocked'}>{x.online ? '在线' : '离线'}</StatusText>
              <span className="font-mono">{x.node_id}</span>
              <span className="text-jz-muted">{(x.devices || []).length} 台设备 · 上次心跳 {Math.max(0, Math.round(now - (x.last_seen || 0)))} 秒前</span>
            </li>
          ))}
        </ul>
      </details>
    ) });
  // Reads that feed the list but were not read: the list may be incomplete, and it says so.
  const feeding = [summary.state, sev.state, ...(nodes ? [nodes.state] : [])];
  const missing = feeding.filter((x) => x === 'unread' || x === 'permission').length;
  const feedingLoading = feeding.includes('loading');

  const cells: Array<{ key: string; label: string; state: ReadState; value: React.ReactNode; hint?: React.ReactNode; retry?: () => void }> = [
    { key: 'running', label: '运行', state: fieldState(summary, run), value: run, retry: summary.reload },
    { key: 'queued', label: '排队', state: queued.state, value: q != null ? queuedText(q) : null, retry: queued.reload },
    { key: 'failed', label: '失败', state: fieldState(summary, failed), value: failed, retry: summary.reload },
    { key: 'done', label: '已完成', state: fieldState(summary, done), value: done, retry: summary.reload },
    { key: 'total', label: '评估总数', state: fieldState(summary, total), value: total, retry: summary.reload },
    { key: 'sev', label: '严重 / 高 风险发现', state: fieldState(sev, crit), value: <>{crit}<span className="text-jz-muted"> / </span>{high ?? '—'}</>, retry: sev.reload,
      hint: hasValue(sev) ? <>来自 {n(sev.value.sessions_scanned) ?? '—'}/{n(sev.value.sessions_total) ?? '—'} 个会话</> : undefined },
    ...(nodes ? [{ key: 'nodes', label: '执行节点在线', state: nodes.state, value: nodeList ? <>{online}<span className="text-jz-muted">/{nodeList.length}</span></> : null, retry: nodes.reload }] : []),
  ];

  const runRows = hasValue(running) ? running.value : [];
  return (
    <div className="flex flex-col gap-4" data-global-signal>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="jz-pane overflow-hidden rounded-card lg:col-span-8" aria-labelledby="dash-conclusion" data-conclusion-pane>
          <div className="px-5 pb-3 pt-4">
            <h2 id="dash-conclusion" className="text-meta font-medium text-jz-muted">评估队列</h2>
            <p className="mt-1 font-display text-section font-semibold text-jz-ink" data-conclusion data-conclusion-state={sentence ? queueState : 'loading'}>
              {sentence ?? <Skeleton className="h-6 w-80 max-w-full" />}
            </p>
            {queueState === 'unread' && !clauses.length && <Button size="sm" variant="secondary" className="mt-2" icon={<RefreshCw size={14} aria-hidden />} onClick={() => { summary.reload(); queued.reload(); }} data-conclusion-retry>重试</Button>}
          </div>
          <div className="border-t border-jz-border" data-live-workflows>
            <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-3">
              <h3 className="text-label font-semibold text-jz-ink">正在运行 <span className="font-normal text-jz-muted">· 每 30 秒刷新</span></h3>
              <Button size="sm" variant="ghost" onClick={() => nav('/tasks?status=running')} data-lw-goto-tasks>运行中的任务<ArrowUpRight size={14} aria-hidden /></Button>
            </div>
            {running.state === 'loading' ? <div className="space-y-2 px-5 pb-4 pt-1" data-running-state="loading"><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-3/4" /></div>
              : running.state === 'unread' || running.state === 'permission' ? (
                <div className="px-5 pb-4 pt-1 text-label text-jz-ink-2" data-running-state={running.state}>
                  {running.state === 'permission' ? <ReadValue state="permission" /> : <>运行中的任务暂时无法读取。 <ReadValue state="unread" onRetry={running.reload} /></>}
                </div>
              ) : runRows.length === 0 ? <p className="px-5 pb-4 pt-1 text-label text-jz-muted" data-running-state="empty">现在没有运行中的任务。</p>
              : (
                <ul className="divide-y divide-jz-border px-5 pb-2" data-running-state={running.state}>
                  {runRows.slice(0, 4).map((t: any) => {
                    const hit = sessions.value?.[t.id];
                    return (
                      <li key={t.id} data-live-lane={t.id} className="flex min-w-0 items-center gap-3 py-2.5">
                        <StatusGlyph kind="running" label="运行中" />
                        <span className="flex-none font-mono text-meta tnum text-jz-muted">#{t.id}</span>
                        <span className="w-32 flex-none truncate text-label font-semibold text-jz-ink max-[760px]:w-24" title={t.app_name || t.package || ''}>{t.app_name || t.package || '—'}</span>
                        <span className="min-w-0 flex-1 truncate text-meta text-jz-ink-2" title={t.progress || '还没有上报进度'}>{t.progress || '正在执行，还没有上报进度'}</span>
                        {hit
                          ? <Button size="sm" variant="ghost" onClick={() => nav(`/projects/${hit.pid}/sessions/${hit.sid}`)} data-lw-goto-session={t.id}>会话 #{hit.sid}</Button>
                          : <Button size="sm" variant="ghost" onClick={() => nav(`/tasks/${t.id}`)} data-lw-goto-task={t.id}>任务</Button>}
                      </li>
                    );
                  })}
                  {runRows.length > 4 && <li className="py-2 text-meta text-jz-muted">还有 {runRows.length - 4} 个，在任务页查看。</li>}
                  {running.state === 'stale' && <li className="py-2 text-meta text-jz-amber-ink">{STALE_WORD}，显示的是上次读到的列表。</li>}
                </ul>
              )}
          </div>
        </section>

        <section className="jz-pane overflow-hidden rounded-card lg:col-span-4" aria-labelledby="dash-attention" data-attention>
          <h2 id="dash-attention" className="border-b border-jz-border px-4 py-2.5 text-label font-semibold text-jz-ink">现在需要处理</h2>
          {feedingLoading && items.length === 0 ? <div className="space-y-2 p-4" data-attention-state="loading"><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-2/3" /></div> : (
            <ul className="divide-y divide-jz-border" data-attention-list>
              {items.map((it) => (
                <li key={it.key} data-attn={it.key} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 py-3">
                  <span className="inline-flex min-w-0 items-center gap-2 pt-1 text-label text-jz-ink"><StatusGlyph kind={it.glyph} />{it.text}</span>
                  <span className="flex-none">{it.action}</span>
                </li>
              ))}
              {items.length === 0 && missing === 0 && <li className="px-4 py-3 text-label text-jz-muted" data-attn="none">没有需要处理的事项。</li>}
              {missing > 0 && (
                <li className="px-4 py-3 text-meta text-jz-ink-2" data-attn-incomplete>
                  {missing} 项读数没有读到，这里可能不完整。{feeding.some((x) => x === 'unread') && <button type="button" className="ml-1 rounded-control font-medium text-jz-brand underline-offset-2 hover:underline" onClick={reads.refresh} data-attn-retry>重试</button>}
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      <div className="overflow-hidden rounded-card border border-jz-border bg-jz-surface">
      <dl aria-label="读数" data-readout-row
        className={cx('-mb-px -mr-px grid grid-cols-1 min-[391px]:grid-cols-2 tablet:grid-cols-4', cells.length === 7 ? 'xl:grid-cols-7' : 'xl:grid-cols-6')}>
        {cells.map((c) => (
          <div key={c.key} data-cell={c.key} data-cell-state={c.state} className="min-w-0 border-b border-r border-jz-border px-4 py-3">
            <dt className="truncate text-meta text-jz-muted">{c.label}</dt>
            <dd className="mt-1 min-h-7 font-mono text-section font-medium tnum text-jz-ink">
              <ReadValue state={c.state} onRetry={c.retry} label={c.label}>{c.value}</ReadValue>
            </dd>
            {c.hint && <dd className="truncate text-meta text-jz-muted">{c.hint}</dd>}
          </div>
        ))}
      </dl>
      </div>
    </div>
  );
};

/* ───────────── findings by domain (D2) ───────────── */

/** Findings per domain from domain-summary.by_session (MASVS ids grouped with masvsDomains.ts), sorted by count. */
export const domainRows = (d: { by_session?: Record<string, Record<string, number>> } | null) => {
  const counts = new Map<string, number>([...DOMAINS.map((x) => [x.name, 0] as [string, number]), [OTHER_DOMAIN_NAME, 0]]);
  let sessionsWith = 0;
  for (const mv of Object.values(d?.by_session || {})) {
    let any = false;
    for (const [m, c] of Object.entries(mv || {})) {
      const k = Number(c) || 0; if (!k) continue; any = true;
      const dom = domainOf(m); const name = dom ? dom.name : OTHER_DOMAIN_NAME;
      counts.set(name, (counts.get(name) || 0) + k);
    }
    if (any) sessionsWith++;
  }
  const rows = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return { rows, total: rows.reduce((a, b) => a + b.count, 0), sessionsWith };
};

export const DomainDistribution: React.FC<{ read: Read<{ by_session?: Record<string, Record<string, number>>; sessions_scanned?: number }> }> = ({ read }) => {
  const data = hasValue(read) ? domainRows(read.value) : null;
  const shown = data ? data.rows.filter((r) => r.count > 0) : [];
  const max = Math.max(1, ...shown.map((r) => r.count));
  const scanned = n(read.value?.sessions_scanned);
  return (
    <section className="jz-pane overflow-hidden rounded-card" aria-labelledby="dash-domains" data-domain-pane data-domain-state={read.state}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-jz-border px-4 py-2.5">
        <h2 id="dash-domains" className="text-label font-semibold text-jz-ink">风险发现按域分布</h2>
        {data && <p className="text-meta text-jz-muted" data-domain-total>共 <span className="font-mono tnum text-jz-ink-2">{data.total}</span> 项，来自 <span className="font-mono tnum">{data.sessionsWith}</span>{scanned != null ? <>/<span className="font-mono tnum">{scanned}</span></> : null} 个会话 · 待确认和已确认</p>}
      </div>
      {!data ? (
        <div className="px-4 py-4">
          {read.state === 'loading' ? <div className="grid gap-3 tablet:grid-cols-3"><Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
            : read.state === 'permission' ? <p className="text-label text-jz-ink-2"><ReadValue state="permission" />。当前账号不能读取各域的风险发现数。</p>
            : <p className="text-label text-jz-ink-2">各域的风险发现数没有读到。 <ReadValue state="unread" onRetry={read.reload} /></p>}
        </div>
      ) : shown.length === 0 ? (
        <p className="px-4 py-4 text-label text-jz-muted" data-domain-empty>已读取 {scanned ?? 0} 个会话，没有可以按域归类的风险发现。会话产生发现后，这里会按 {DOMAINS.length + 1} 个域列出。</p>
      ) : (
        <>
          <ol className="grid grid-cols-1 gap-x-6 tablet:grid-cols-2 desktop:grid-cols-3" data-domain-list>
            {shown.map((r) => (
              <li key={r.name} data-domain={r.name} className="border-b border-jz-border px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-2 text-label">
                  <span className="min-w-0 truncate text-jz-ink">{r.name}</span>
                  <span className="flex-none font-mono tnum text-jz-ink-2" data-domain-count>{r.count}</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-pill bg-jz-inset" aria-hidden><div className="h-full rounded-pill bg-jz-orange" style={{ width: `${Math.round((r.count / max) * 100)}%` }} /></div>
              </li>
            ))}
          </ol>
          <p className="px-4 py-2 text-meta text-jz-muted">
            {DOMAINS.length + 1 - shown.length > 0 ? `其余 ${DOMAINS.length + 1 - shown.length} 个域没有风险发现。` : ''}单个会话的分布在工作台的风险发现 › 规则卡里按域筛选。
            {read.state === 'stale' && <span className="ml-1 text-jz-amber-ink" data-read-stale>{STALE_WORD}。</span>}
          </p>
        </>
      )}
    </section>
  );
};
