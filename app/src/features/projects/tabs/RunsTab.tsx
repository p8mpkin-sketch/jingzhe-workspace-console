import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Layers3, Plus, RefreshCw, SearchX } from 'lucide-react';
import { api } from '@/services/api';
import { AsyncBoundary, Button, ConfirmDialog, DataTable, EmptyState, InlineAlert, Panel, Readout, SegmentedControl, StatusBadge, toast } from '@/components/ui';
import type { Column } from '@/components/ui';
import { PATHS } from '@/layout/navigation';
import type { ProjectCtx } from '../ProjectDetailPage';
import { isLive, statusText, tone } from '../projectModel';
import type { FlatSession, SessionItem, TaskItem } from '../projectModel';
import { errText, useResource } from '../useResource';

type Scope = 'all' | 'running' | 'queued' | 'failed' | 'done';
const SCOPE_LABEL: Record<Scope, string> = { all: '全部', running: '运行中', queued: '排队', failed: '失败', done: '已完成' };
type Row = { s: SessionItem; pkg: string; taskId?: number; task?: TaskItem };

/**
 * Runs: the task model filtered to this project. A task belongs to a project through its session (session.task_id),
 * the same join the task page uses, so the rows are this project's sessions with the task each one runs. The scope
 * control uses the task page's four scopes. Batch runs of the app inventory are listed below. No third task list.
 */
export const RunsTab: React.FC<{ ctx: ProjectCtx }> = ({ ctx }) => {
  const { id, sessions, runs } = ctx;
  // Loaded only while this tab is open: the two lists the task page reads.
  const tasks = useResource<TaskItem[]>('/api/tasks?limit=2000', (r) => (Array.isArray(r) ? r : []));
  const flat = useResource<FlatSession[]>('/api/pentest/sessions', (r) => (Array.isArray(r) ? r : []));
  const [scope, setScope] = useState<Scope>('all');
  const [closing, setClosing] = useState<SessionItem | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const taskOf = new Map((flat.data ?? []).map((f) => [f.id, f.task_id]));
    const byId = new Map((tasks.data ?? []).map((t) => [t.id, t]));
    return (sessions.data ?? []).map((s) => {
      const taskId = s.task_id || taskOf.get(s.id) || undefined;
      return { s, pkg: s.app || s.package || '', taskId, task: taskId ? byId.get(taskId) : undefined };
    });
  }, [sessions.data, tasks.data, flat.data]);
  const count = (k: Scope) => (k === 'all' ? rows.length : rows.filter((r) => r.task?.status === k).length);
  const shown = scope === 'all' ? rows : rows.filter((r) => r.task?.status === scope);

  const open = (sessions.data ?? []).filter((s) => s.status !== 'closed');
  const lead = open.filter((s) => isLive(s.status)).sort((a, b) => b.id - a.id)[0] || [...open].sort((a, b) => b.id - a.id)[0] || null;
  const leadLive = !!lead && isLive(lead.status);

  const closeSession = async (s: SessionItem) => {
    setBusy(true);
    try {
      await api(`/api/pentest/sessions/${s.id}`, { method: 'DELETE' });
      await sessions.reload();
    } catch (e: any) {
      // A 409 means the session is a protected demo target; show what the API said.
      const m = String(e?.detail || e?.message || e || '关闭失败');
      toast.err(m.includes('demo') ? '这是受保护的演示会话，不能关闭' : m);
    } finally { setBusy(false); setClosing(null); }
  };

  const cols: Column<Row>[] = [
    { key: 'app', header: '应用', card: 'title', cell: ({ s, pkg }) => (
      <div className="min-w-0">
        <div className="truncate font-mono text-label font-medium text-jz-ink">{pkg || '—'}</div>
        <div className="truncate text-meta font-normal text-jz-muted">{s.step ?? 0}/{s.total_steps ?? '?'} 步{s.created ? ` · ${s.created}` : ''}</div>
      </div>
    ) },
    { key: 'task', header: '任务', cell: ({ task, taskId }) => (task ? (
      <div className="min-w-0" data-run-task={task.id}>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`${PATHS.tasks}?focus=${task.id}`} className="font-mono text-mono text-jz-brand hover:underline" aria-label={`在任务页查看任务 #${task.id}`}>#{task.id}</Link>
          <StatusBadge status={task.status} />
        </div>
        {task.status === 'failed' && (task.error_msg || task.error) && <div className="mt-0.5 break-words text-meta text-jz-ink-2">{task.error_msg || task.error}</div>}
      </div>
    ) : taskId ? <span className="font-mono text-mono text-jz-muted" title="这个任务不在已加载的任务列表里">#{taskId}</span>
      : <span className="text-meta text-jz-muted">{tasks.loading || flat.loading ? '…' : '未关联任务'}</span>) },
    { key: 'status', header: '会话状态', cell: ({ s }) => <StatusBadge status={s.status || 'ready'} /> },
    { key: 'idle', header: '闲置', cell: ({ s }) => (s.idle_days && s.idle_days >= 1
      ? <span data-sess-idle={s.id} title={`最后更新距今 ${s.idle_days} 天`}><StatusBadge tone={s.idle_days >= 7 ? 'attention' : 'neutral'}>{s.idle_days} 天</StatusBadge></span>
      : <span className="text-jz-muted">—</span>) },
    { key: 'device', header: '设备', mono: true, cell: ({ s }) => s.device || '无设备' },
    { key: 'id', header: '会话', mono: true, cell: ({ s }) => `#${s.id}` },
    { key: 'actions', header: <span className="sr-only">操作</span>, label: '操作', align: 'right', card: 'action', cell: ({ s }) => (
      <div className="flex items-center justify-end gap-2">
        {!!s.idle_days && s.idle_days >= 1 && s.status !== 'closed' && (
          <Button size="sm" variant="danger" data-sess-close={s.id} onClick={(ev) => { ev.stopPropagation(); setClosing(s); }}>关闭会话</Button>
        )}
        <Button size="sm" variant="secondary" onClick={(ev) => { ev.stopPropagation(); ctx.openSession(s.id); }} aria-label={`打开会话 #${s.id}`}>打开 <ArrowRight size={14} aria-hidden /></Button>
      </div>
    ) },
  ];

  const batches = runs.data ?? [];
  const sum = (k: 'succeeded' | 'failed' | 'skipped') => batches.reduce((n, r) => n + (r[k] || 0), 0);
  const joinErr = tasks.error || flat.error;

  return (
    <>
      <Panel flush title="任务与会话" data-project-runs
        description="这个项目的任务，按会话关联到项目。和“任务”页是同一份数据，这里只按项目筛选。"
        actions={<>
          <SegmentedControl<Scope> label="任务范围" value={scope} onChange={setScope}
            items={(Object.keys(SCOPE_LABEL) as Scope[]).map((k) => ({ key: k, label: SCOPE_LABEL[k], count: sessions.data ? count(k) : null, dataAttrs: { 'data-runs-scope': k } }))} />
          <Link to={PATHS.tasks} className="inline-flex h-7 items-center gap-1 rounded-control px-2 text-label font-medium text-jz-brand hover:bg-jz-brand-soft max-[760px]:h-jz-touch">
            全部任务 <ArrowRight size={14} aria-hidden />
          </Link>
          {lead && (
            <Button size="sm" onClick={() => ctx.openSession(lead.id)} data-continue-session={lead.id}
              title={`${leadLive ? '进行中的会话' : '最近创建的会话'} #${lead.id} · ${lead.app || lead.package || ''}`}>
              {leadLive ? '继续会话' : '打开最近的会话'} <span className="font-mono tnum">#{lead.id}</span> <ArrowRight size={14} aria-hidden />
            </Button>
          )}
        </>}>
        {!!joinErr && (
          <InlineAlert tone="attention" className="m-3" data-runs-join-error title="任务状态没有加载"
            action={<Button size="sm" variant="secondary" icon={<RefreshCw size={14} aria-hidden />} onClick={() => { tasks.reload(); flat.reload(); }}>重试</Button>}>
            会话照常列出；任务一列暂时没有状态。{errText(joinErr)}
          </InlineAlert>
        )}
        <AsyncBoundary loading={sessions.loading} error={sessions.error} stale={sessions.stale} onRetry={sessions.reload}
          empty={!shown.length}
          emptyState={rows.length
            ? <EmptyState compact icon={SearchX} title={`没有${SCOPE_LABEL[scope]}的任务`} cause="换一个范围，或在“任务”页查看全部任务。"
                action={<Button variant="secondary" onClick={() => setScope('all')}>查看全部</Button>} />
            : <EmptyState icon={Layers3} title="这个项目还没有会话" cause="会话把一个应用和一台设备绑定到这个项目，它运行的任务会出现在这里。新建后会直接进入工作台。"
                action={<Button variant="secondary" icon={<Plus size={16} aria-hidden />} onClick={ctx.newSession}>新建会话</Button>} />}>
          <DataTable minTableWidth={820} label="项目的任务与会话" density="comfortable" stickyHeader={false} columns={cols} rows={shown} rowKey={(r) => r.s.id}
            onRowClick={(r) => ctx.openSession(r.s.id)} rowDataAttrs={(r) => ({ 'data-run-session': r.s.id })} />
        </AsyncBoundary>
      </Panel>

      <Panel flush title="批量执行批次" description="每次批量执行的进度与结果。并发 2；失败的应用保留在清单中，可以重新执行。"
        actions={<Button size="sm" variant="secondary" icon={<RefreshCw size={14} aria-hidden />} loading={runs.refreshing} onClick={runs.reload}>刷新</Button>}>
        <AsyncBoundary loading={runs.loading} error={runs.error} stale={runs.stale} onRetry={runs.reload} compact
          empty={!batches.length} emptyState={<EmptyState compact icon={Activity} title="还没有批量执行" cause="清单里有应用后，使用页头的“批量执行”。" />}>
          <Readout className="rounded-none border-x-0 border-t-0" label="批次合计" cells={[
            { label: '批次', value: batches.length }, { label: '成功应用', value: sum('succeeded') }, { label: '失败应用', value: sum('failed') }, { label: '跳过', value: sum('skipped') },
          ]} />
          <ul className="divide-y divide-jz-border">
            {batches.map((r) => {
              const p = r.total ? Math.round((r.succeeded / r.total) * 100) : 0;
              return (
                <li key={r.id} className="grid gap-2 px-4 py-2.5 sm:grid-cols-[1fr_200px_48px] sm:items-center" data-run-batch={r.id}>
                  <div>
                    <div className="flex items-center gap-2 text-label font-medium text-jz-ink"><span className="font-mono">#{r.id}</span><StatusBadge tone={tone(r.status)}>{statusText(r.status)}</StatusBadge></div>
                    <div className="mt-0.5 font-mono text-mono tnum text-jz-muted">{r.succeeded} 成功 · {r.failed} 失败 · {r.skipped} 跳过，共 {r.total}</div>
                  </div>
                  <div className="h-1 overflow-hidden rounded-pill bg-jz-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={`批次 #${r.id} 成功占比`}>
                    <div className="h-full rounded-pill bg-jz-brand" style={{ width: p + '%' }} />
                  </div>
                  <div className="font-mono text-mono tnum text-jz-ink-2 sm:text-right">{p}%</div>
                </li>
              );
            })}
          </ul>
        </AsyncBoundary>
      </Panel>

      <ConfirmDialog open={!!closing} title={closing ? `关闭会话 #${closing.id}` : ''} confirmLabel="关闭会话" busy={busy}
        outcome="关闭后不能恢复。" onCancel={() => setClosing(null)} onConfirm={() => closing && closeSession(closing)}>
        {closing && <>会话 <span className="font-mono">{closing.app || closing.package}</span> 已闲置 {closing.idle_days} 天。关闭会释放它占用的端口与注入资源。</>}
      </ConfirmDialog>
    </>
  );
};
