// The task table. A task is two lines: the row of cells, and under it a line across the remaining columns for the
// failure reason, the live progress or the partial-completion reason. A table from 1024 px, record cards below.
// Activating a row opens the task detail; session and artifacts are explicit buttons in the row.
import React from 'react';
import { cx } from '@/components/ui';
import { TaskActions, TaskCounts, TaskDuration, TaskIdentity, TaskStatus, TaskSubline, hasSubline, type RowHandlers } from './TaskRow';
import type { SessionMap, TaskItem } from './taskModel';
import type { CountsState } from './useTasks';

export interface TaskTableProps {
  rows: TaskItem[];
  sess: SessionMap;
  counts: CountsState;
  users: Record<string, string>;
  now: number;
  focusId: string | null;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  table: boolean;
  showOwner: boolean;
  wide: boolean;
  on: RowHandlers;
  state?: React.ReactNode;
}

const interactive = (el: EventTarget | null) => el instanceof Element && !!el.closest('button, a, input, select, textarea, label, [role="menu"], [data-no-row-open]');

export const TaskTable: React.FC<TaskTableProps> = ({ rows, sess, counts, users, now, focusId, selected, onToggle, onToggleAll, table, showOwner, wide, on, state }) => {
  const ids = rows.map((t) => t.id);
  const allSel = ids.length > 0 && ids.every((id) => selected.has(id));
  const someSel = ids.some((id) => selected.has(id));
  const owner = (t: TaskItem) => users[String(t.user_id)] || (t.user_id != null ? `#${t.user_id}` : '—');
  const open = (t: TaskItem) => (e: React.MouseEvent) => { if (!interactive(e.target) && !window.getSelection()?.toString()) on.openDetail(t); };
  const key = (t: TaskItem) => (e: React.KeyboardEvent) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); on.openDetail(t); } };
  const rowAttrs = (t: TaskItem) => ({
    'data-task-row': t.id, 'data-focused': focusId && String(t.id) === focusId ? '1' : undefined, 'data-selected': selected.has(t.id) ? '1' : undefined,
    'aria-label': `任务 #${t.id} ${t.app_name || t.package || ''}，按回车打开详情`,
  });
  const cols = 5 + (showOwner ? 1 : 0);

  if (!table) {
    return (
      <div className="min-w-0" data-table-layout="cards" data-task-table>
        {state ?? (
          <ul aria-label="任务列表" className="divide-y divide-jz-border">
            {rows.map((t) => (
              <li key={t.id} {...rowAttrs(t)} tabIndex={0} onClick={open(t)} onKeyDown={key(t)}
                className={cx('flex cursor-pointer gap-3 px-4 py-3', selected.has(t.id) ? 'bg-jz-selected' : focusId && String(t.id) === focusId ? 'bg-jz-brand-soft' : 'hover:bg-jz-hover')}>
                <label className="flex h-jz-touch w-6 flex-none items-start justify-center pt-1">
                  <input type="checkbox" className="h-4 w-4 rounded-tag accent-jz-brand" checked={selected.has(t.id)} onChange={() => onToggle(t.id)} aria-label={`选择任务 #${t.id}`} data-sel-row={t.id} />
                </label>
                <div className="min-w-0 flex-1">
                  <TaskIdentity t={t} />
                  <div className="mt-2 flex flex-wrap items-start gap-x-5 gap-y-2">
                    <TaskStatus t={t} />
                    <TaskDuration t={t} now={now} />
                    <span className="flex flex-col"><span className="text-meta text-jz-muted">结果</span><TaskCounts t={t} counts={counts} /></span>
                    <span className="flex flex-col"><span className="text-meta text-jz-muted">负责人</span><span className="font-mono text-meta text-jz-ink-2" data-operator>{owner(t)}</span></span>
                  </div>
                  {hasSubline(t) && <div className="mt-2 border-t border-jz-border pt-2" data-task-sub={t.id} data-no-row-open><TaskSubline t={t} /></div>}
                  <div className="mt-3"><TaskActions t={t} sess={sess} wide={false} on={on} /></div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0" data-table-layout="table" data-task-table>
      <table aria-label="任务列表" className="w-full table-fixed border-collapse text-label">
        <colgroup>
          <col className="w-9" /><col /><col className="w-28 xl:w-36" /><col className="w-24 xl:w-28" /><col className="w-32 xl:w-36" />{showOwner && <col className="w-28" />}<col className={wide ? 'w-72' : 'w-48 xl:w-56'} />
        </colgroup>
        <thead>
          <tr className="h-jz-table-head bg-jz-inset text-meta text-jz-muted">
            <th scope="col" className="pl-4 text-left">
              <input type="checkbox" className="h-4 w-4 rounded-tag accent-jz-brand align-middle" checked={allSel} ref={(el) => { if (el) el.indeterminate = !allSel && someSel; }}
                onChange={onToggleAll} aria-label="选择本页全部" data-sel-all />
            </th>
            <th scope="col" className="px-3 text-left font-medium">任务</th>
            <th scope="col" className="px-3 text-left font-medium">状态</th>
            <th scope="col" className="px-3 text-left font-medium">耗时</th>
            <th scope="col" className="px-3 text-left font-medium" title="评估和渗透两部分的发现数。C/H/M/L 为严重、高、中、低。">结果</th>
            {showOwner && <th scope="col" className="px-3 text-left font-medium">负责人</th>}
            <th scope="col" className="px-3 pr-4 text-right font-medium">操作</th>
          </tr>
        </thead>
        {!state && (
          <tbody>
            {rows.map((t) => {
              const sel = selected.has(t.id);
              const focused = !!focusId && String(t.id) === focusId;
              const sub = hasSubline(t);
              const tone = sel ? 'bg-jz-selected' : focused ? 'bg-jz-brand-soft' : '';
              return (
                <React.Fragment key={t.id}>
                  <tr {...rowAttrs(t)} aria-selected={sel} tabIndex={0} onClick={open(t)} onKeyDown={key(t)}
                    className={cx('cursor-pointer border-t border-jz-border text-jz-ink transition-colors duration-fast', tone || 'hover:bg-jz-hover')}>
                    <td className="pl-4 align-top pt-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="h-4 w-4 rounded-tag accent-jz-brand align-middle" checked={sel} onChange={() => onToggle(t.id)} aria-label={`选择任务 #${t.id}`} data-sel-row={t.id} />
                    </td>
                    <td className="px-3 py-2 align-top"><TaskIdentity t={t} /></td>
                    <td className="px-3 py-2 align-top"><TaskStatus t={t} /></td>
                    <td className="px-3 py-2 align-top"><TaskDuration t={t} now={now} /></td>
                    <td className="px-3 py-2 align-top"><TaskCounts t={t} counts={counts} /></td>
                    {showOwner && <td className="px-3 py-2 align-top"><span className="block truncate font-mono text-meta text-jz-ink-2" data-operator title={t.user_id != null ? `uid=${t.user_id}` : ''}>{owner(t)}</span></td>}
                    <td className="px-3 py-2 pr-4 align-top"><TaskActions t={t} sess={sess} wide={wide} dense on={on} /></td>
                  </tr>
                  {sub && (
                    <tr data-task-sub={t.id} className={cx('text-jz-ink', tone)}>
                      <td />
                      <td colSpan={cols} className="px-3 pb-2.5 pr-4 pt-0"><TaskSubline t={t} /></td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        )}
      </table>
      {state}
    </div>
  );
};
