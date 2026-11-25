// Timeline of a task. Three blocks, each labelled with where its data comes from:
//   1. the task's own times (fields of the task row);
//   2. the stages its progress text names: the backend records no start or end per stage, so those cells say
//      “未记录” and nothing is worked out from other values;
//   3. for a task with a linked session, the steps of that session, read from the session's existing timeline.
//      They are the session's steps, shown apart from the task's stages.
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ErrorState, PermissionState, SkeletonLoader, StatusText, cx } from '@/components/ui';
import type { GlyphKind } from '@/components/ui';
import { PATHS } from '@/layout/navigation';
import { clock, toMs } from '@/features/pentest/workbench/shell/useElapsed';
import { fmtDur, whenFull } from './taskParts';
import { NO_REASON, durOf, failureReason, statusView, type ParsedProgress, type SessionLink, type TaskItem } from './taskModel';
import { CopyText } from './TaskRow';
import { errText, useRead } from './useTasks';

export const UNRECORDED = '未记录';
const Unrecorded: React.FC<{ why: string }> = ({ why }) => <span className="text-jz-ink-2" title={why} data-unrecorded>{UNRECORDED}</span>;
const th = 'px-3 py-1.5 text-left text-meta font-medium text-jz-muted whitespace-nowrap';
const td = 'px-3 py-2 align-top text-label text-jz-ink';

const STEP: Record<string, { glyph: GlyphKind; word: string }> = {
  ok: { glyph: 'done', word: '完成' }, error: { glyph: 'failed', word: '失败' }, skipped: { glyph: 'neutral', word: '已跳过' },
  running: { glyph: 'running', word: '进行中' }, pending: { glyph: 'queued', word: '未开始' },
};

const Block: React.FC<{ title: string; source: string; children: React.ReactNode } & Record<`data-${string}`, string | number | undefined>> = ({ title, source, children, ...rest }) => (
  <section className="min-w-0 border-b border-jz-border last:border-b-0" {...rest}>
    <header className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 bg-jz-inset px-4 py-2">
      <h3 className="text-label font-semibold text-jz-ink">{title}</h3>
      <p className="min-w-0 text-meta text-jz-ink-2" data-timeline-source>{source}</p>
    </header>
    {children}
  </section>
);

const SessionSteps: React.FC<{ link: SessionLink }> = ({ link }) => {
  const read = useRead<any[]>(`/api/pentest/sessions/${link.sid}/timeline`, (r) => (Array.isArray(r?.steps) ? r.steps : []));
  const state = read.loading ? (read.slow ? 'slow' : 'loading') : read.forbidden ? 'forbidden' : read.failed ? 'error' : read.stale ? 'stale' : (read.data || []).length ? 'ok' : 'empty';
  const steps = read.data || [];
  return (
    <Block title="关联会话的步骤" data-timeline-session={link.sid} data-timeline-session-state={state}
      source={`会话 #${link.sid} 的步骤时间线。这是会话的步骤，不是这个任务的阶段。`}>
      {read.loading && <div className="p-4" aria-busy="true">{read.slow && <p className="mb-2 text-label text-jz-ink-2" role="status">会话时间线还在读取。</p>}<SkeletonLoader variant="table" rows={4} /></div>}
      {read.forbidden && <PermissionState compact title="没有权限读取这个会话的时间线" message="当前账号不能读取这个会话，所以这里没有步骤。任务自己的阶段在上面，不受影响。" />}
      {read.failed && <ErrorState compact title="会话时间线没有读到" message={errText(read.error) || '服务端没有返回时间线。'} onRetry={() => { void read.reload(); }} />}
      {!read.loading && !read.forbidden && !read.failed && steps.length === 0 && (
        <p className="px-4 py-4 text-label text-jz-ink-2" data-state="empty">会话 #{link.sid} 的时间线里没有步骤：这个会话还没有运行过，或者它的步骤没有被记录。</p>
      )}
      {steps.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse" aria-label={`会话 #${link.sid} 的步骤`}>
            <thead><tr className="border-b border-jz-border"><th scope="col" className={th}>阶段</th><th scope="col" className={th}>步骤</th><th scope="col" className={th}>状态</th><th scope="col" className={th}>开始时间</th><th scope="col" className={th}>耗时</th></tr></thead>
            <tbody>
              {steps.map((s, i) => {
                const st = STEP[String(s.state || 'pending')] || { glyph: 'neutral' as GlyphKind, word: String(s.state) };
                const ms = typeof s.duration_ms === 'number' ? s.duration_ms : NaN;
                return (
                  <tr key={i} className="border-b border-jz-border last:border-b-0" data-session-step={i}>
                    <td className={cx(td, 'font-mono text-mono')}>{s.phase || '—'}</td>
                    <td className={td}><span className="break-words">{s.name || s.tool || '未命名步骤'}</span>{s.tool && s.name && <span className="ml-2 font-mono text-mono text-jz-ink-2">{s.tool}</span>}</td>
                    <td className={td}><StatusText kind={st.glyph}>{st.word}</StatusText></td>
                    <td className={cx(td, 'font-mono text-mono tnum')}>{Number.isFinite(toMs(s.ts)) ? s.ts : <Unrecorded why="会话时间线没有给这一步的开始时间" />}</td>
                    <td className={cx(td, 'font-mono text-mono tnum')}>{Number.isFinite(ms) ? clock(ms) : <Unrecorded why="会话时间线没有给这一步的耗时" />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-jz-border px-4 py-2 text-meta">
        <Link to={PATHS.session(link.pid, link.sid)} className="inline-flex items-center gap-1 font-medium text-jz-brand hover:underline" data-timeline-open-session>
          在会话里查看完整轨迹 <ArrowRight size={14} aria-hidden />
        </Link>
      </p>
    </Block>
  );
};

export const TaskTimeline: React.FC<{ task: TaskItem; parsed: ParsedProgress; link: SessionLink | null; now: number }> = ({ task, parsed, link, now }) => {
  const v = statusView(task);
  const ended = task.status === 'done' || task.status === 'failed';
  const has = (k: 'started_at' | 'finished_at') => typeof task[k] === 'number' && (task[k] as number) > 0;
  const reason = failureReason(task);
  const facts: Array<[string, React.ReactNode]> = [
    ['创建时间', task.created_at ? whenFull(task.created_at) : <Unrecorded why="任务行没有创建时间" />],
    ['开始时间', has('started_at') ? whenFull(task.started_at) : <Unrecorded why="任务行没有开始时间字段" />],
    [ended ? '结束时间' : '最后更新', ended && has('finished_at') ? whenFull(task.finished_at) : task.updated_at ? <>{whenFull(task.updated_at)}{ended && <span className="ml-2 font-sans text-meta text-jz-ink-2">（最后更新时间）</span>}</> : <Unrecorded why="任务行没有更新时间" />],
    ['耗时', <span title={ended ? '从创建到最后更新' : '从创建到现在'}>{fmtDur(durOf(task, now))}</span>],
  ];
  return (
    <div className="min-w-0 border border-jz-border bg-jz-surface" data-task-timeline>
      <Block title="任务" source="来自任务行的时间字段。" data-timeline-task>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1.5 px-4 py-3 text-label">
          <dt className="text-jz-muted">状态</dt><dd><StatusText kind={v.glyph} strong>{v.word}</StatusText></dd>
          {facts.map(([k, val]) => <React.Fragment key={k}><dt className="text-jz-muted">{k}</dt><dd className="font-mono text-mono tnum text-jz-ink" data-timeline-fact={k}>{val}</dd></React.Fragment>)}
        </dl>
      </Block>

      <Block title="任务阶段" data-timeline-stages={parsed.stages.length} data-timeline-parsed={parsed.parsed ? '1' : '0'}
        source={parsed.parsed ? '阶段来自任务的进度文本，只列出文本里出现过的阶段。后端不记录每个阶段的起止时间。' : '进度文本里没有阶段信息，全部内容归在“输出”一个阶段下。后端不记录阶段的起止时间。'}>
        {parsed.stages.length === 0 ? (
          <p className="px-4 py-4 text-label text-jz-ink-2" data-state="empty">{task.status === 'queued' ? '任务还在排队，没有开始，所以没有阶段。' : '这个任务没有进度文本，所以没有阶段可列。'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse" aria-label="任务阶段">
              <thead><tr className="border-b border-jz-border"><th scope="col" className={th}>阶段</th><th scope="col" className={th}>状态</th><th scope="col" className={th}>开始时间</th><th scope="col" className={th}>结束时间</th><th scope="col" className={th}>耗时</th></tr></thead>
              <tbody>
                {parsed.stages.map((s, i) => {
                  const last = i === parsed.stages.length - 1;
                  const st = !last || task.status === 'done' ? { glyph: 'done' as GlyphKind, word: '已完成' } : { glyph: v.glyph, word: task.status === 'failed' ? '在这个阶段失败' : v.word };
                  return (
                    <tr key={s.id} className="border-b border-jz-border last:border-b-0" data-timeline-stage={s.id}>
                      <td className={td}><span className="mr-2 font-mono text-mono text-jz-ink-2">{s.id}</span><span className="font-medium">{s.name}</span>{s.pct != null && <span className="ml-2 font-mono text-mono tnum text-jz-ink-2">{s.pct}%</span>}</td>
                      <td className={td}><StatusText kind={st.glyph}>{st.word}</StatusText></td>
                      <td className={cx(td, 'font-mono text-mono')} data-stage-start><Unrecorded why="后端不记录阶段的开始时间" /></td>
                      <td className={cx(td, 'font-mono text-mono')} data-stage-end><Unrecorded why="后端不记录阶段的结束时间" /></td>
                      <td className={cx(td, 'font-mono text-mono')} data-stage-dur><Unrecorded why="没有起止时间，耗时无法得出" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {task.status === 'failed' && (
          <div className="flex min-w-0 items-start gap-2 border-t border-jz-border px-4 py-3" data-timeline-failure>
            <span className="mt-0.5 flex-none text-meta font-medium text-jz-ink-2">失败原因</span>
            <p className="min-w-0 flex-1 select-text whitespace-pre-wrap break-words font-mono text-meta text-jz-ink [overflow-wrap:anywhere]" data-timeline-failure-text>{reason || NO_REASON}</p>
            {reason && <CopyText text={reason} label="复制失败原因" data-timeline-failure-copy="" />}
          </div>
        )}
      </Block>

      {link
        ? <SessionSteps link={link} />
        : <Block title="关联会话的步骤" source="这个任务没有关联的会话，所以没有会话步骤。" data-timeline-session="none"><span className="sr-only">没有关联会话</span></Block>}
    </div>
  );
};
