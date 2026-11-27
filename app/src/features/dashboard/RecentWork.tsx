// RecentWork.tsx — recent assessments (real tasks, their sessions and projects, the report of a finished one,
// 创建会话) and the session events of the open sessions (8 s poll). Every cell says what was read.
import React, { useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowUpRight, Database, Plus, Zap } from 'lucide-react';
import { api, ApiError } from '@/services/api';
import { Button, DataTable, EmptyState, IconButton, Skeleton, SkeletonLoader, StatusBadge, Tabs, toast, cx } from '@/components/ui';
import type { Column, TabItem } from '@/components/ui';
import { ReadValue } from './GlobalSignal';
import { STALE_WORD, hasValue } from './readout';
import type { DashboardReads, FeedEvent } from './useDashboardReads';

// Shell vendor names; an unknown value is shown as it came, none reads 无加固.
const PACKER_LABEL: Record<string, string> = { '360_jiagu': '360加固', ijiami: '爱加密', bangcle: '梆梆加固' };
const SEV_KEYS = ['critical', 'high', 'medium'] as const;
const packerText = (r: any) => { const pk = String(r.packer || '').trim(); return pk && pk !== 'none' ? `加固：${PACKER_LABEL[pk] || pk}` : '无加固'; };

/* ───────────── session events: text and class derived from the record's own fields ───────────── */

/** HH:mm:ss from the backend time string; the full string is in the title. */
const formatFeedTs = (ts: any): string => { const m = String(ts ?? '').match(/(\d{1,2}:\d{2}:\d{2})/); return m ? m[1] : String(ts ?? '—'); };
export const feedText = (e: FeedEvent): string => {
  const p = e.payload || {};
  switch (e.type) {
    case 'autopilot_start': return `autopilot 启动(${p.steps ?? '?'} 步)`;
    case 'autopilot_done': return `autopilot 完成,共 ${p.findings ?? 0} 条发现`;
    case 'triage_done': return `预分诊完成(业务 ${p.business ?? 0} · 规则库 ${p.library ?? 0})`;
    case 'step_start': return `开始 ${p.name || p.tool || '步骤'}${p.phase ? `(${p.phase})` : ''}`;
    case 'step_done': return `${p.tool || '步骤'} ${p.status === 'error' ? '出错' : '完成'}${p.findings != null ? `,产出 ${p.findings} 条发现` : ''}`;
    case 'auth_matrix_skip': return `auth_matrix 跳过(${p.reason || '无理由字段'})`;
    default: return e.type || '(无类型事件)';
  }
};
export const feedFinding = (e: FeedEvent) => (e.type === 'step_done' || e.type === 'autopilot_done') && Number(e.payload?.findings ?? 0) > 0;
export const feedIsSkip = (e: FeedEvent) => e.type === 'auth_matrix_skip';
export const feedIsError = (e: FeedEvent) => (e.type === 'step_done' && e.payload?.status === 'error') || !!e.payload?.error;
const feedTarget = (e: FeedEvent) => String(e.payload?.name || e.payload?.tool || '');

/* ───────────── recent assessments ───────────── */

export const RecentAssessments: React.FC<{ reads: DashboardReads }> = ({ reads }) => {
  const nav = useNavigate();
  const { tasks, sessions, projects, sev, scores } = reads;
  const [creating, setCreating] = useState<number | null>(null);
  const [result, setResult] = useState<{ tid: number; text: string } | null>(null);
  const links = sessions.value || {};

  // POST /api/pentest/sessions { task_id } — the existing write; 409 / 404 explain themselves on the row.
  const launch = async (r: any) => {
    if (creating != null) return;
    setCreating(r.id); setResult(null);
    try {
      const s = await api<any>('/api/pentest/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: r.id }) });
      toast.ok(`渗透会话 #${s.id} 已创建 · ${r.app_name || r.package || `#${r.id}`}`);
      reads.reloadSessions();
      nav(`/projects/${s.project_id ?? 0}/sessions/${s.id}`);
    } catch (e) {
      const text = e instanceof ApiError ? (e.status === 409 ? `任务 #${r.id} 还没有完成，不能创建会话。` : e.status === 404 ? `任务 #${r.id} 没有运行目录，不能创建会话。` : e.message) : '创建会话失败';
      setResult({ tid: r.id, text }); toast.err(text);
    } finally { setCreating(null); }
  };

  const projectCell = (r: any) => {
    const link = links[r.id];
    if (!sessions.value) return <ReadValue state={sessions.state} size="text" onRetry={sessions.reload} />;
    if (!link || !link.pid) return <span className="text-meta text-jz-muted">未归属项目</span>;
    const name = projects.value?.get(link.pid);
    return (
      <Link to={`/projects/${link.pid}`} className="block max-w-48 truncate rounded-control text-label text-jz-ink underline-offset-2 hover:underline" title={name || `项目 #${link.pid}`} data-recent-project={link.pid}>
        {name || `项目 #${link.pid}`}{!name && projects.state !== 'value' && <span className="ml-1 text-meta text-jz-muted">（名称{projects.state === 'permission' ? '无权限' : projects.state === 'loading' ? '读取中' : '未读取'}）</span>}
      </Link>
    );
  };

  const cols: Column<any>[] = [
    { key: 'app', header: '应用', card: 'title', cell: (r) => (
      <span className="min-w-0">
        <span className="block max-w-48 truncate text-label font-semibold text-jz-ink">{r.app_name || r.package || '—'}</span>
        <span className="block max-w-56 truncate font-mono text-meta text-jz-muted" title={r.package || ''}>#{r.id} {r.package || ''}</span>
        <span className="mt-0.5 block text-meta text-jz-muted" data-recent-packer={r.id}>{packerText(r)}</span>
      </span>
    ) },
    { key: 'project', header: '项目', cell: projectCell },
    // D4: only the score the backend returned; no letters, no thresholds.
    { key: 'score', header: <span title="会话报告摘要里的风险分（report/summary 的 risk_score）。没有会话的任务没有风险分。">风险分</span>, label: '风险分', align: 'right', cell: (r) => {
      const link = links[r.id];
      if (!sessions.value) return <ReadValue state={sessions.state} size="text" />;
      if (!link) return <span className="text-meta text-jz-muted">未评估</span>;
      const sc = scores[r.id];
      if (!sc) return <span className="text-meta text-jz-muted" title="只读取最近 8 个有会话的评估的风险分">未读取</span>;
      return <span data-recent-score={r.id}><ReadValue state={sc.state} size="text"><span className="font-mono text-label tnum text-jz-ink">{sc.value}</span></ReadValue></span>;
    } },
    { key: 'sev', header: <span title="关联会话中待确认和已确认的风险发现，依次为严重、高、中">发现 严重/高/中</span>, label: '发现', cell: (r) => {
      const link = links[r.id];
      if (!sessions.value || !hasValue(sev)) return <ReadValue state={!sessions.value ? sessions.state : sev.state} size="text" />;
      if (!link) return <span className="text-meta text-jz-muted">—</span>;
      const e = sev.value.by_session?.[link.sid];
      if (!e) return <span className="text-meta text-jz-muted" title={`会话 #${link.sid} 没有风险发现`}>无</span>;
      return <span className="inline-flex gap-2 font-mono text-meta tnum" data-recent-sev={r.id}>{SEV_KEYS.map((k) => { const v = e[k]?.active ?? 0; return <span key={k} className={v > 0 ? 'font-semibold text-jz-ink' : 'text-jz-muted'}>{v}</span>; })}</span>;
    } },
    { key: 'session', header: '渗透会话', cell: (r) => {
      const link = links[r.id];
      if (!sessions.value) return <ReadValue state={sessions.state} size="text" />;
      if (link) return <Button size="sm" variant="ghost" onClick={() => nav(`/projects/${link.pid}/sessions/${link.sid}`)} data-apk-session={link.sid}>会话 #{link.sid}</Button>;
      if (r.status === 'done') return (
        <span className="inline-flex flex-col items-start gap-1">
          <Button size="sm" variant="secondary" onClick={() => launch(r)} data-launch-pentest={r.id} disabled={creating != null} loading={creating === r.id}
            title={`为评估 #${r.id} 创建渗透会话并打开`}>{creating === r.id ? '创建中…' : '创建会话'}</Button>
          {result?.tid === r.id && <span role="status" className="max-w-48 text-meta text-jz-red" data-launch-result={r.id}>{result?.text}</span>}
        </span>
      );
      return <span className="text-meta text-jz-muted" title={`任务状态:${r.status || '未知'}。评估完成后才能创建会话。`}>未完成</span>;
    } },
    { key: 'go', header: <span className="sr-only">报告与任务</span>, label: '打开', align: 'right', card: 'action', cell: (r) => (
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        {r.status === 'done' && <Link to={`/reports?taskId=${r.id}`} className="rounded-control px-1 text-label font-medium text-jz-brand underline-offset-2 hover:underline" data-recent-report={r.id}>报告</Link>}
        <IconButton size="sm" label={`打开任务 #${r.id}`} onClick={() => nav(`/tasks/${r.id}`)} data-apk-view-task={r.id}><ArrowUpRight size={16} aria-hidden /></IconButton>
      </span>
    ) },
  ];

  const rows = hasValue(tasks) ? tasks.value : [];
  return (
    <section className="jz-pane min-w-0 overflow-hidden rounded-card" aria-labelledby="dash-recent" data-recent-work>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-jz-border px-4 py-2">
        <div className="min-w-0">
          <h2 id="dash-recent" className="text-label font-semibold text-jz-ink">最近的评估</h2>
          <p className="text-meta text-jz-muted">{hasValue(tasks) ? `最近 ${rows.length} 个评估任务` : '最近 10 个评估任务'}{tasks.state === 'stale' ? ` · ${STALE_WORD}` : ''}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => nav('/tasks')} data-assets-goto-tasks>全部任务<ArrowUpRight size={14} aria-hidden /></Button>
      </div>
      <div data-apk-list data-recent-state={tasks.state}>
        {tasks.state === 'loading' ? <div className="p-4"><SkeletonLoader variant="table" rows={4} /></div>
          : tasks.state === 'permission' ? <p className="px-4 py-6 text-label text-jz-ink-2"><ReadValue state="permission" />。当前账号不能读取任务列表。</p>
          : tasks.state === 'unread' ? <p className="px-4 py-6 text-label text-jz-ink-2">任务列表没有读到。 <ReadValue state="unread" onRetry={tasks.reload} /></p>
          : (
            <DataTable<any> label="最近的评估" columns={cols} rows={rows} rowKey={(r) => r.id} stickyHeader={false} minTableWidth={700}
              rowDataAttrs={(r) => ({ 'data-apk-row': r.id })}
              state={rows.length === 0 ? (
                <EmptyState icon={Database} title="还没有评估" cause="创建评估后，最近的任务会显示在这里。"
                  action={<Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => nav('/new-assessment')} data-recent-new>新建评估</Button>} />
              ) : undefined} />
          )}
      </div>
    </section>
  );
};

/* ───────────── session events ───────────── */

export const SessionEvents: React.FC<{ reads: DashboardReads; className?: string }> = ({ reads, className }) => {
  const { feed } = reads;
  const events = hasValue(feed) ? feed.value.events : [];
  // New rows fade in once (the set difference with the last snapshot); the first read does not animate.
  const seen = useRef<Set<string> | null>(null);
  const fresh = useMemo(() => {
    const cur = new Set(events.map((e, i) => `${e.sid}-${e.seq ?? i}`));
    if (seen.current === null) { if (events.length) seen.current = cur; return new Set<string>(); }
    const f = new Set([...cur].filter((k) => !seen.current!.has(k))); seen.current = cur; return f;
  }, [feed.value]); // eslint-disable-line react-hooks/exhaustive-deps
  const [filter, setFilter] = useState<'all' | 'findings' | 'errors'>('all');
  const rows = events.map((e, i) => ({ e, k: `${e.sid}-${e.seq ?? i}`, fnd: feedFinding(e), skip: feedIsSkip(e), err: feedIsError(e) }))
    .filter((r) => (filter === 'findings' ? r.fnd : filter === 'errors' ? r.err : true));
  const tabs: TabItem<'all' | 'findings' | 'errors'>[] = ([['all', '全部'], ['findings', '有发现'], ['errors', '异常']] as const).map(([id, label]) => ({
    key: id, label, count: id === 'all' ? events.length : events.filter((e) => (id === 'findings' ? feedFinding(e) : feedIsError(e))).length,
    dataAttrs: { 'data-feed-filter-id': id },
  }));
  const scanned = feed.value?.sessions_scanned;
  return (
    <section className={cx('jz-pane flex min-h-0 min-w-0 flex-col overflow-hidden rounded-card', className)} aria-labelledby="dash-feed" data-live-feed data-feed-state={feed.state}>
      <div className="border-b border-jz-border px-4 py-2">
        <h2 id="dash-feed" className="text-label font-semibold text-jz-ink">会话事件</h2>
        <p className="text-meta text-jz-muted">{typeof scanned === 'number' ? `${scanned} 个未关闭的会话，每 8 秒刷新` : '未关闭会话的进度事件，每 8 秒刷新'}</p>
      </div>
      {feed.state === 'stale' && <p className="border-b border-jz-border px-4 py-1.5 text-meta text-jz-amber-ink" data-feed-stale>{STALE_WORD}，下面是上次读到的事件。</p>}
      {events.length > 0 && <div className="px-4 pt-1" data-feed-filter><Tabs items={tabs} value={filter} onChange={setFilter} label="按事件类型筛选" /></div>}
      {feed.state === 'loading' ? <div className="space-y-2 p-4" data-feed-loading><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-full" /><Skeleton className="h-5 w-2/3" /></div>
        : feed.state === 'permission' ? <p className="px-4 py-6 text-label text-jz-ink-2"><ReadValue state="permission" />。当前账号不能读取会话事件。</p>
        : feed.state === 'unread' ? <p className="px-4 py-6 text-label text-jz-ink-2" data-feed-unread>会话事件没有读到。 <ReadValue state="unread" onRetry={feed.reload} /></p>
        : rows.length === 0 ? (
          <div data-feed-empty className="flex flex-1 items-center justify-center py-6">
            <EmptyState compact icon={Zap} title={events.length === 0 ? '没有会话事件' : '没有符合条件的事件'}
              cause={events.length === 0 ? '未关闭的会话产生进度事件后会显示在这里。' : '换一个筛选看看。'}
              action={events.length > 0 ? <Button size="sm" variant="secondary" onClick={() => setFilter('all')}>显示全部</Button> : undefined} />
          </div>
        ) : (
          <ol className="min-h-0 flex-1 divide-y divide-jz-border overflow-auto" data-feed-list aria-live="off">
            {rows.map(({ e, k, fnd, skip, err }) => (
              <li key={k} data-feed-row={k} data-feed-finding={fnd ? '1' : '0'} className={cx('flex items-start gap-3 px-4 py-2.5', fresh.has(k) && 'feed-row-in')}>
                <span className="flex-none pt-0.5 font-mono text-meta tnum text-jz-muted" title={String(e.ts ?? '—')}>{formatFeedTs(e.ts)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <StatusBadge tone={fnd ? 'high' : err ? 'danger' : skip ? 'neutral' : 'brand'} title={`事件类型:${e.type || '无'}${feedTarget(e) ? ` · ${feedTarget(e)}` : ''}`}>
                      {fnd ? '有发现' : err ? '异常' : skip ? '跳过' : '执行'}
                    </StatusBadge>
                    <span className="font-mono text-meta text-jz-muted">#{e.sid}</span>
                  </span>
                  <span className="mt-1 block truncate text-label text-jz-ink-2" title={feedText(e)}>{feedText(e)}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
    </section>
  );
};
