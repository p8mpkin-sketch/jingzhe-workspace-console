// Task detail (/tasks/:id). The task is found in the list request the task page already makes
// (`GET /api/tasks?limit=2000`); there is no single-task read. Run strip and output list are the workbench's
// RunStrip and StageStack, fed with the stages the task's progress text names. Tabs: 输出 · 产物 · 时间线, and a
// link to the task's report. Escape returns to the list with ?focus=<id>, and the list gives focus to that row.
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, FileText, SearchX } from 'lucide-react';
import { api } from '@/services/api';
import { usePentest } from '@/stores/pentest';
import { Button, ConfirmDialog, EmptyState, ErrorState, Page, PermissionState, SkeletonLoader, StaleNotice, Tabs, toast } from '@/components/ui';
import type { TabItem } from '@/components/ui';
import { PATHS } from '@/layout/navigation';
import { ArtifactBrowser } from '@/features/artifacts/ArtifactBrowser';
import { RunStrip } from '@/features/pentest/workbench/surfaces/runtime/RunStrip';
import { RerunTaskModal } from './RerunTaskModal';
import { TaskBack, TaskHeader } from './TaskHeader';
import { TaskOutput } from './TaskOutput';
import { TaskTimeline } from './TaskTimeline';
import { CopyText } from './TaskRow';
import { whenFull } from './taskParts';
import { NO_REASON, TASK_WINDOW, artifactsReady, buildTaskTrace, failureReason, hasReport, nameOf, parseProgress, runStatusOf } from './taskModel';
import { errText, useNowSeconds, usePollWhileLive, useSessionLinks, useTaskCounts, useTaskList } from './useTasks';

type TabKey = 'output' | 'artifacts' | 'timeline';
const TAB_KEYS: TabKey[] = ['output', 'artifacts', 'timeline'];

/** Frame of every state that has no task to show: the way back, the id, and the state itself. */
const Shell: React.FC<{ id: string; state: string; children: React.ReactNode }> = ({ id, state, children }) => (
  <Page data-task-detail data-task-detail-state={state}>
    <header className="flex min-w-0 flex-col gap-1" data-task-header>
      <TaskBack id={id} />
      <h1 className="jz-page-title break-words text-jz-ink" data-task-title>任务 <span className="font-mono tnum">#{id}</span></h1>
    </header>
    <section className="border border-jz-border bg-jz-surface" aria-label="任务状态">{children}</section>
  </Page>
);

export const TaskDetailPage: React.FC = () => {
  const { id = '' } = useParams();
  const tid = /^\d+$/.test(id) ? Number(id) : NaN;
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as TabKey | null;
  const tab: TabKey = tabParam && TAB_KEYS.includes(tabParam) ? tabParam : 'output';
  const setTab = (k: TabKey) => { const next = new URLSearchParams(params); if (k === 'output') next.delete('tab'); else next.set('tab', k); setParams(next, { replace: true }); };

  const list = useTaskList();
  const { map: sess } = useSessionLinks();
  const task = useMemo(() => (list.data || []).find((t) => t.id === tid) ?? null, [list.data, tid]);
  const { polling } = usePollWhileLive(task, list.reload);
  const counts = useTaskCounts(useMemo(() => (task ? [task.id] : []), [task]));
  const now = useNowSeconds();
  const devices = usePentest((s) => s.devices);
  const [rerun, setRerun] = useState(false);
  const [delAsk, setDelAsk] = useState(false);

  const back = `${PATHS.tasks}?focus=${id}`;
  // Escape returns to the list. Not while a dialog or a menu is open (it closes that first), and not from a text field that still holds text.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && (el as HTMLInputElement).value) return;
      e.preventDefault();
      nav(back);
    };
    // Capture phase: this runs before a menu or dialog handles the same key and closes itself, so the check above still sees it open.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [nav, back]);

  const parsed = useMemo(() => parseProgress(task?.progress), [task?.progress]);
  const strip = useMemo(() => (task ? buildTaskTrace(task, parsed) : []), [task, parsed]);

  if (list.loading) {
    return (
      <Shell id={id} state={list.slow ? 'slow' : 'loading'}>
        <div className="p-4" aria-busy="true" data-state={list.slow ? 'slow' : 'loading'}>
          {list.slow && <p className="mb-3 text-label text-jz-ink-2" role="status">任务还在读取，比平时慢。读到之后会直接显示在这里，不需要刷新。</p>}
          <SkeletonLoader variant="table" rows={6} />
        </div>
      </Shell>
    );
  }
  if (list.forbidden) {
    return <Shell id={id} state="forbidden"><PermissionState title="没有权限读取这个任务" message="当前账号不能读取任务，所以这里没有内容。需要查看时，请管理员开通任务的读取权限。" /></Shell>;
  }
  if (list.failed) {
    return <Shell id={id} state="error"><ErrorState title="任务没有读到" message={errText(list.error) || '服务端没有返回任务列表。'} onRetry={() => { void list.reload(); }} /></Shell>;
  }
  if (!task) {
    return (
      <Shell id={id} state="not-found">
        <EmptyState icon={SearchX} title={`没有找到任务 #${id}`}
          cause={Number.isFinite(tid) ? `在已读取的 ${TASK_WINDOW} 条任务里没有 #${id}，可能已删除。` : `“${id}”不是任务编号。`}
          action={<Link to={PATHS.tasks} className="inline-flex h-jz-control items-center gap-1 rounded-control border border-jz-border-strong px-3 text-label font-medium text-jz-ink hover:bg-jz-hover max-[760px]:h-jz-touch" data-task-notfound-back>返回任务列表 <ArrowRight size={14} aria-hidden /></Link>} />
      </Shell>
    );
  }

  const link = sess[task.id] ?? null;
  const arts = artifactsReady(task, sess);
  const report = hasReport(task);
  const reason = failureReason(task);
  const tabs: TabItem<TabKey>[] = [
    { key: 'output', label: '输出', dataAttrs: { 'data-task-tab': 'output' } },
    { key: 'artifacts', label: '产物', dataAttrs: { 'data-task-tab': 'artifacts' } },
    { key: 'timeline', label: '时间线', dataAttrs: { 'data-task-tab': 'timeline' } },
  ];
  const remove = async () => {
    setDelAsk(false);
    try { await api(`/api/tasks/${task.id}`, { method: 'DELETE' }); toast.ok(`已删除任务 #${task.id}`); nav(PATHS.tasks); }
    catch (e) { toast.err(`任务 #${task.id} 没有删除：${errText(e) || '服务端拒绝了这个操作'}`); }
  };

  return (
    <Page data-task-detail={task.id} data-task-detail-state={list.stale ? 'stale' : 'ok'}>
      <TaskHeader task={task} parsed={parsed} link={link} counts={counts} now={now} polling={polling}
        onOpenSession={() => link && nav(PATHS.session(link.pid, link.sid))} onRerun={() => setRerun(true)}
        onAsk={() => nav(`${PATHS.agent}?task=${task.id}`)} onDelete={() => setDelAsk(true)} />

      {list.stale && (
        <StaleNotice onRefresh={() => { void list.reload(); }} refreshing={list.refreshing} since={list.at ? whenFull(list.at / 1000) : undefined}
          reason="最近一次读取没有成功，下面是上一次读到的任务状态。" />
      )}

      <div className="min-w-0 border border-jz-border bg-jz-surface" data-task-strip data-strip-parsed={parsed.parsed ? '1' : '0'} data-strip-stages={strip.length}>
        {strip.length > 0
          ? <RunStrip trace={strip} status={runStatusOf(task)} now={0} onJump={() => setTab('output')} />
          : <p className="px-4 py-2.5 text-label text-jz-ink-2" data-strip-empty>{task.status === 'queued' ? '任务还在排队，没有开始，所以没有阶段。' : '这个任务没有上报进度，所以没有阶段可显示。'}</p>}
        {strip.length > 0 && !parsed.parsed && <p className="border-t border-jz-border px-4 py-1.5 text-meta text-jz-ink-2" data-strip-note>进度文本里没有阶段信息，这里如实显示为“输出”一个阶段。</p>}
        {task.status === 'failed' && (
          <div className="flex min-w-0 items-start gap-2 border-t border-jz-border px-4 py-2.5" data-task-failure role="group" aria-label="失败原因">
            <span className="mt-0.5 flex-none text-label font-medium text-jz-ink">失败原因</span>
            <p className="min-w-0 flex-1 select-text whitespace-pre-wrap break-words font-mono text-mono text-jz-ink [overflow-wrap:anywhere]" data-task-failure-text>{reason || NO_REASON}</p>
            {reason && <CopyText text={reason} label="复制失败原因" data-task-failure-copy="" />}
          </div>
        )}
      </div>

      <div className="flex min-w-0 items-end gap-3 border-b border-jz-border">
        <Tabs<TabKey> className="min-w-0 flex-1 !border-b-0" label="任务内容" items={tabs} value={tab} onChange={setTab} />
        {report
          ? <Link to={`${PATHS.reports}?taskId=${task.id}`} data-task-report-link
              className="mb-1 inline-flex h-8 flex-none items-center gap-1 rounded-control px-2 text-label font-medium text-jz-brand hover:bg-jz-brand-soft max-[760px]:h-jz-touch">
              <FileText size={14} aria-hidden /> 报告 <ArrowRight size={14} aria-hidden />
            </Link>
          : <span className="mb-2 flex-none text-meta text-jz-ink-2" data-task-report-none title="只有已完成并有结果的评估任务有报告">没有报告</span>}
      </div>

      <div role="tabpanel" aria-label={tabs.find((t) => t.key === tab)?.label as string} data-task-panel={tab} className="min-w-0">
        {tab === 'output' && <TaskOutput task={task} parsed={parsed} hasArtifacts={arts} className="min-h-72" />}
        {tab === 'artifacts' && (arts
          ? <div className="border border-jz-border bg-jz-surface" data-task-artifacts><ArtifactBrowser taskId={task.id} taskName={nameOf(task)} linked={link} className="h-[70vh] min-h-80" /></div>
          : <div className="border border-jz-border bg-jz-surface" data-task-artifacts="none">
              <EmptyState title="这个任务还没有产物" cause="完成的评估或脱壳任务，以及有关联会话的任务才有产物。这个任务两者都不是，所以这里没有向服务端请求文件列表。" />
            </div>)}
        {tab === 'timeline' && <TaskTimeline task={task} parsed={parsed} link={link} now={now} />}
      </div>

      <ConfirmDialog open={delAsk} destructive title={`删除任务 #${task.id}`} confirmLabel="删除" outcome="删除后无法恢复。删除后会回到任务列表。"
        onCancel={() => setDelAsk(false)} onConfirm={() => { void remove(); }}>
        {nameOf(task)} 的任务记录将被删除。运行中和排队中的任务不能删除，服务端会拒绝。
      </ConfirmDialog>
      {rerun && (
        <RerunTaskModal task={task} devices={devices || []} onClose={() => setRerun(false)}
          onDone={(nt: number) => { setRerun(false); nav(`${PATHS.tasks}?focus=${nt}`); }} />
      )}
    </Page>
  );
};
