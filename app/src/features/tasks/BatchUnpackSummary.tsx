// Batch-unpack summary: a collapsed block under the task table. Same read as before
// (`GET /api/tasks/batch-unpack-summary`, once on load and again from 刷新); shown only when the server reports
// batch tasks. Collapsed, it is one line of numbers; opened, the readout, the share bar and the task details.
import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { api } from '@/services/api';
import { Button, DataTable, EmptyState, Readout } from '@/components/ui';
import { ST_CN, fmtDur } from './taskParts';

export const BatchUnpackSummary: React.FC = () => {
  const [sum, setSum] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<any>('/api/tasks/batch-unpack-summary').then((d) => { if ((d?.count || 0) > 0) setSum(d); }).catch(() => {}); }, []);
  const refresh = () => { setBusy(true); api<any>('/api/tasks/batch-unpack-summary').then((d) => { setSum(d); setOpen(true); }).catch(() => {}).finally(() => setBusy(false)); };

  if (!(sum && sum.count > 0)) return <span className="sr-only" data-batch-dashboard-empty>没有批量脱壳任务</span>;
  const doneN = sum.done || 0, failN = sum.failed || 0;
  const pendingN = Math.max(0, sum.count - doneN - failN);
  const donePct = sum.count ? Math.round((doneN / sum.count) * 100) : 0;
  return (
    <section aria-label="批量脱壳" className="border border-jz-border bg-jz-surface" data-batch-summary data-batch-dashboard data-open={open ? '1' : '0'}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-batch-toggle
          className="flex min-h-8 min-w-0 flex-1 basis-64 items-center gap-2 rounded-control text-left max-[760px]:min-h-jz-touch">
          {open ? <ChevronDown size={14} aria-hidden className="flex-none text-jz-muted" /> : <ChevronRight size={14} aria-hidden className="flex-none text-jz-muted" />}
          <span className="flex-none text-label font-semibold text-jz-ink">批量脱壳</span>
          <span className="min-w-0 truncate font-mono text-mono tnum text-jz-ink-2">完成 {doneN}/{sum.count} · 失败 {failN} · 待执行 {pendingN} · 完成率 {donePct}%</span>
        </button>
        <Button size="sm" variant="ghost" icon={<RefreshCw size={14} aria-hidden />} loading={busy} onClick={refresh} data-batch-refresh>刷新</Button>
      </div>
      {open && (
        <div className="border-t border-jz-border">
          <Readout className="rounded-none border-0" label="批量脱壳合计" cells={[
            { label: '完成', value: `${doneN}/${sum.count}` },
            { label: '失败', value: failN },
            { label: '待执行', value: pendingN },
            { label: '平均耗时', value: sum.avg_dur_s != null ? fmtDur(sum.avg_dur_s) : '—', title: '已完成任务从创建到最后更新的平均时间' },
            { label: 'DEX 文件数', value: sum.dex_total ?? '—', title: '脱出的 DEX 文件个数,不是体积' },
          ]} />
          <div className="border-t border-jz-border px-4 py-2">
            <span className="flex h-1 w-full overflow-hidden rounded-pill bg-jz-surface-2" data-batch-bar-track role="img" aria-label={`完成 ${doneN},失败 ${failN},待执行 ${pendingN}`}>
              {doneN > 0 && <span className="block h-full bg-jz-teal" style={{ width: `${(doneN / sum.count) * 100}%` }} data-batch-bar-fill />}
              {failN > 0 && <span className="block h-full bg-jz-red" style={{ width: `${(failN / sum.count) * 100}%` }} data-batch-bar-fail />}
            </span>
          </div>
          <div className="border-t border-jz-border">
            <DataTable<any> label="批量脱壳明细" stickyHeader={false} rows={sum.items || []} rowKey={(it) => it.task_id}
              columns={[
                { key: 'id', header: '任务', mono: true, cell: (it) => `#${it.task_id}` },
                { key: 'app', header: '应用', card: 'title', cell: (it) => <span className="block max-w-48 truncate">{it.app_name}</span> },
                { key: 'st', header: '状态', cell: (it) => ST_CN[it.status] || it.status },
                { key: 'packer', header: '加固', cell: (it) => it.packer ?? '—' },
                { key: 'method', header: '方式', cell: (it) => it.method ?? '—' },
                { key: 'dex', header: 'DEX', mono: true, align: 'right', cell: (it) => it.dex ?? '—' },
                { key: 'dur', header: '耗时', mono: true, align: 'right', cell: (it) => (it.dur_s != null ? fmtDur(it.dur_s) : '—') },
              ]}
              state={(sum.items || []).length === 0 ? <EmptyState compact title="没有明细" cause="服务端没有返回任务明细。" /> : undefined} />
          </div>
        </div>
      )}
    </section>
  );
};
