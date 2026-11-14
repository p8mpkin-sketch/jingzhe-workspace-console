// TaskSwitcher.tsx — searchable task switcher of the report detail header (popover with a search field and a list).
import React, { useMemo, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Button, Popover, SearchField } from '@/components/ui';
import type { HubEntry } from './types';
import { complianceScoreOf } from './types';
import { scoreCls } from './shared';

export const TaskSwitcher: React.FC<{
  entries: HubEntry[];
  currentTaskId: number | null;
  onPick: (tid: number) => void;
}> = ({ entries, currentTaskId, onPick }) => {
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    const hit = (e: HubEntry) => !k
      || String(e.task.id).includes(k.replace('#', ''))
      || String(e.task.package || '').toLowerCase().includes(k)
      || String(e.task.app_name || '').toLowerCase().includes(k);
    return entries.filter(hit).slice(0, 200);
  }, [entries, q]);

  return (
    <Popover label="切换任务" align="end" className="w-96 !p-0"
      trigger={(tp) => (
        <Button variant="secondary" icon={<ChevronsUpDown size={14} aria-hidden />} data-task-switcher-btn title="切换到另一个任务的报告" {...tp}>切换任务</Button>
      )}>
      {(close) => (
        <div data-task-switcher className="flex max-h-96 flex-col">
          <div className="flex-none border-b border-jz-border p-2">
            <SearchField autoFocus value={q} onValueChange={setQ} label="搜索任务" placeholder="搜索包名、任务编号或应用名" data-task-switcher-search />
          </div>
          <ul className="flex-1 overflow-y-auto p-1.5" data-task-switcher-list>
            {list.length === 0 && <li className="px-3 py-4 text-label text-jz-muted">没有匹配的任务</li>}
            {list.map(({ task: t, agg }) => {
              const score = complianceScoreOf(agg?.summary);
              const cur = t.id === currentTaskId;
              return (
                <li key={t.id}>
                  <button type="button" data-task-switcher-item={t.id} aria-current={cur || undefined}
                    onClick={() => { onPick(t.id); close(); setQ(''); }}
                    className={`flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left max-[760px]:min-h-jz-touch ${cur ? 'bg-jz-brand-soft' : 'hover:bg-jz-surface-2'}`}>
                    <span className="flex-none font-mono text-label tnum text-jz-muted">#{t.id}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-label text-jz-ink" title={t.app_name || t.package || ''}>{t.app_name || t.package || '—'}</span>
                      <span className="block truncate font-mono text-meta text-jz-muted" title={t.package}>{t.package || ''}</span>
                    </span>
                    <span className={`flex-none font-mono text-label tnum ${scoreCls(score)}`} title="合规分">{score ?? '—'}</span>
                  </button>
                </li>
              );
            })}
            {list.length >= 200 && <li className="px-3 py-1.5 text-meta text-jz-muted">仅显示前 200 条,请继续输入以缩小范围</li>}
          </ul>
        </div>
      )}
    </Popover>
  );
};
