// Header of the task detail. In tab order: back to the list, 打开会话, 重新运行, 更多. The title block between them
// states the task's status (glyph and word), the stage its progress text names, and how long it has taken.
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, MessageSquare, MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react';
import { Button, MenuItem, Popover, StatusText } from '@/components/ui';
import { PATHS } from '@/layout/navigation';
import { PACKER_NAMES, SLOW_S, fmtDur } from './taskParts';
import { currentStageText, durOf, hasReport, kindWord, nameOf, statusView, type ParsedProgress, type SessionLink, type TaskItem } from './taskModel';
import { TaskCounts } from './TaskRow';
import type { CountsState } from './useTasks';

export const TaskBack: React.FC<{ id: string | number }> = ({ id }) => (
  <Link to={`${PATHS.tasks}?focus=${id}`} data-task-back title="返回任务列表（Esc）"
    className="inline-flex h-8 items-center gap-1 rounded-control pr-2 text-label font-medium text-jz-ink-2 hover:text-jz-ink max-[760px]:h-jz-touch">
    <ArrowLeft size={16} aria-hidden /> 任务
  </Link>
);

const Fact: React.FC<{ label: string; children: React.ReactNode } & Record<`data-${string}`, string | number | undefined>> = ({ label, children, ...rest }) => (
  <span className="inline-flex min-w-0 items-baseline gap-1.5" {...rest}><span className="flex-none text-jz-muted">{label}</span><span className="min-w-0 text-jz-ink">{children}</span></span>
);

export const TaskHeader: React.FC<{
  task: TaskItem; parsed: ParsedProgress; link: SessionLink | null; counts: CountsState; now: number; polling: boolean;
  onOpenSession: () => void; onRerun: () => void; onAsk: () => void; onDelete: () => void;
}> = ({ task, parsed, link, counts, now, polling, onOpenSession, onRerun, onAsk, onDelete }) => {
  const v = statusView(task);
  const dur = durOf(task, now);
  const owner = counts.users[String(task.user_id)];
  const live = task.status === 'running' || task.status === 'queued';
  return (
    <header className="flex min-w-0 flex-col gap-2" data-task-header>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1 basis-72">
          <TaskBack id={task.id} />
          <h1 className="jz-page-title mt-1 break-words text-jz-ink" data-task-title>{nameOf(task)}</h1>
          <p className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 text-label text-jz-ink-2">
            <span className="font-mono tnum" data-task-id>#{task.id}</span>
            <span>{kindWord(task)}</span>
            {task.package && <span className="min-w-0 break-all font-mono text-mono">{task.package}</span>}
            {task.packer && <span>{task.packer === 'none' ? '无加固' : `加固 ${PACKER_NAMES[task.packer] || task.packer}`}</span>}
          </p>
        </div>
        <div className="flex flex-none flex-wrap items-center gap-2" data-task-actions>
          <Button variant="secondary" icon={<ExternalLink size={16} aria-hidden />} onClick={onOpenSession} disabled={!link} data-task-open-session
            title={link ? `打开渗透会话 #${link.sid}` : '这个任务没有关联的会话'}>打开会话</Button>
          <Button variant="secondary" icon={<RefreshCw size={16} aria-hidden />} onClick={onRerun} data-task-rerun title="重新运行,可以重选设备、模式和深度">重新运行</Button>
          <Popover role="menu" align="end" label={`任务 #${task.id} 的更多操作`}
            trigger={(tp) => <Button variant="secondary" icon={<MoreHorizontal size={16} aria-hidden />} data-task-more {...tp}>更多</Button>}>
            {(close) => (
              <div data-task-more-menu>
                <MenuItem icon={<MessageSquare size={14} aria-hidden />} disabled={!hasReport(task)} data-ask-btn
                  title={hasReport(task) ? undefined : '只有已完成并有结果的评估任务可以提问'} onClick={() => { close(); onAsk(); }}>向智能体提问</MenuItem>
                <MenuItem danger icon={<Trash2 size={14} aria-hidden />} data-act-del onClick={() => { close(); onDelete(); }}>删除任务</MenuItem>
              </div>
            )}
          </Popover>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-jz-border pt-2 text-label" data-task-facts>
        <Fact label="状态" data-task-status={task.status}><StatusText kind={v.glyph} strong>{v.word}</StatusText></Fact>
        <Fact label="阶段" data-task-stage>{currentStageText(task, parsed)}</Fact>
        <Fact label="耗时" data-task-dur>
          <span className="font-mono tnum" title={live ? '从创建到现在' : '从创建到最后更新'}>{fmtDur(dur)}</span>
          {dur > SLOW_S && <span className="ml-1.5 text-meta text-jz-ink-2" title="已超过 15 分钟">慢</span>}
        </Fact>
        <Fact label="结果"><TaskCounts t={task} counts={counts} /></Fact>
        <Fact label="负责人" data-task-owner>
          <span className="font-mono text-mono">{owner || (task.user_id != null ? `#${task.user_id}` : '—')}</span>
        </Fact>
        <span className="text-meta text-jz-ink-2" data-task-polling={polling ? 'on' : 'off'} role="status">
          {polling ? '任务还没有结束，每 10 秒读取一次任务列表' : live ? '页面不可见时不读取；回到页面后继续' : '任务已结束，不再自动读取'}
        </span>
      </div>
    </header>
  );
};
