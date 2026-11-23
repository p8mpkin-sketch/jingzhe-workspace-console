import React from 'react';
import { Activity, ArrowRight, Check, FileText, Upload } from 'lucide-react';
import { AsyncBoundary, Button, EmptyState, Panel, StackedBar, StatusBadge } from '@/components/ui';
import type { ProjectCtx } from '../ProjectDetailPage';
import { isLive, reportName, reportStatus, statusText, templateText, tone } from '../projectModel';

/** Where the project stands and what to do next. Each pane reads its own resource and shows its own state. */
export const OverviewTab: React.FC<{ ctx: ProjectCtx }> = ({ ctx }) => {
  const { apps, candidates, reports, runs, sessions, goTab } = ctx;
  const rows = apps.data ?? [];
  const done = rows.filter((x) => x.status === 'done').length;
  const failed = rows.filter((x) => x.status === 'failed').length;
  const active = rows.filter((x) => x.status === 'running' || x.status === 'queued').length;
  const pending = Math.max(0, rows.length - done - active - failed);
  const pct = rows.length ? Math.round((done / rows.length) * 100) : 0;
  const sess = sessions.data ?? [];
  const open = sess.filter((s) => s.status !== 'closed');
  const lead = open.filter((s) => isLive(s.status)).sort((a, b) => b.id - a.id)[0] || [...open].sort((a, b) => b.id - a.id)[0];
  const latest = reports.data?.[0];
  const cands = candidates.data ?? [];

  // What to do next, in workflow order; only steps that apply to the data that actually loaded.
  const next: { key: string; text: React.ReactNode; action: React.ReactNode }[] = [];
  if (lead) next.push({ key: 'session', text: <>{isLive(lead.status) ? '进行中的会话' : '最近的会话'} <span className="font-mono">#{lead.id}</span> {lead.app || lead.package || ''}，第 {lead.step ?? 0}/{lead.total_steps ?? '?'} 步。</>,
    action: <Button size="sm" variant="secondary" onClick={() => ctx.openSession(lead.id)}>{isLive(lead.status) ? '继续会话' : '打开会话'} <ArrowRight size={14} aria-hidden /></Button> });
  if (apps.data && !rows.length && sessions.data && !sess.length) next.push({ key: 'import', text: '清单里还没有应用，也没有会话。导入 APK，在候选应用里发现并导入，或者直接新建会话。',
    action: <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" icon={<Upload size={14} aria-hidden />} onClick={ctx.pickFiles}>导入 APK</Button><Button size="sm" variant="secondary" onClick={ctx.newSession}>新建会话</Button></div> });
  if (rows.length && done < rows.length) next.push({ key: 'run', text: `${rows.length - done} 个应用还没有完成评估。`, action: <Button size="sm" variant="secondary" onClick={() => goTab('apps')}>查看应用</Button> });
  if (cands.length) next.push({ key: 'cand', text: `${cands.length} 个候选应用待核验或导入。`, action: <Button size="sm" variant="secondary" onClick={() => goTab('candidates')}>处理候选应用</Button> });
  if (done) next.push({ key: 'report', text: latest ? `最近一份报告是 #${latest.id}（${reportStatus(latest.status)}）。` : '已有完成的应用，可以生成第一份项目总报告。',
    action: <Button size="sm" variant="secondary" onClick={() => goTab('reports')}>去生成报告</Button> });

  return (
    <div className="grid gap-4 desktop:grid-cols-12">
      <Panel flush className="desktop:col-span-8" title="评估进度" data-project-progress>
        <AsyncBoundary loading={apps.loading} error={apps.error} stale={apps.stale} onRetry={apps.reload} compact skeleton="metrics">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2 px-4 pt-4">
            <div className="font-mono text-display font-semibold tnum text-jz-ink">{rows.length ? pct : lead ? `${lead.step ?? 0}/${lead.total_steps ?? '?'}` : '—'}
              {rows.length > 0 && <span className="text-title text-jz-muted">%</span>}</div>
            <p className="max-w-jz-prose pb-2 text-body text-jz-ink-2">
              {rows.length ? `清单内 ${rows.length} 个应用，${done} 个已完成评估。`
                : lead ? `清单为空。最近的会话 #${lead.id} 进行到第 ${lead.step ?? 0} 步，共 ${lead.total_steps ?? '?'} 步。`
                : '清单里还没有应用，也没有会话。导入应用或新建会话后，这里显示评估进度。'}
            </p>
          </div>
          {rows.length > 0 ? (
            <>
              <StackedBar className="px-4 py-4" label="应用状态分布" parts={[
                { key: 'done', label: '完成', value: done, tone: 'success' }, { key: 'active', label: '执行中', value: active, tone: 'attention' },
                { key: 'failed', label: '失败', value: failed, tone: 'danger' }, { key: 'pending', label: '未执行', value: pending, tone: 'neutral' },
              ]} />
              <dl className="grid grid-cols-2 border-t border-jz-border tablet:grid-cols-4">
                {[['完成', done], ['执行中', active], ['失败', failed], ['未执行', pending]].map(([l, v]) => (
                  <div key={l as string} className="border-jz-border px-4 py-2.5 [&:not(:last-child)]:border-r max-[760px]:border-b">
                    <dt className="text-meta text-jz-muted">{l}</dt><dd className="font-mono text-section font-medium tnum text-jz-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : <div className="h-4" />}
        </AsyncBoundary>
        <div className="border-t border-jz-border" data-project-overview-sessions>
          <div className="flex items-center justify-between gap-3 px-4 pt-2.5">
            <h3 className="jz-eyebrow">最近的会话</h3>
            <Button size="sm" variant="ghost" onClick={() => goTab('runs')}>全部执行<ArrowRight size={14} aria-hidden /></Button>
          </div>
          <AsyncBoundary loading={sessions.loading} error={sessions.error} stale={sessions.stale} onRetry={sessions.reload} compact
            empty={!sess.length} emptyState={<EmptyState compact icon={Activity} title="还没有会话" cause="会话把一个应用和一台设备绑定到这个项目。"
              action={<Button size="sm" variant="secondary" onClick={ctx.newSession}>新建会话</Button>} />}>
            <ul className="divide-y divide-jz-border">
              {[...sess].sort((a, b) => b.id - a.id).slice(0, 4).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-label">
                  <span className="font-mono text-mono tnum text-jz-muted">#{s.id}</span>
                  <span className="min-w-0 flex-1 basis-40 truncate font-mono text-mono text-jz-ink">{s.app || s.package || '—'}</span>
                  <span className="font-mono text-mono tnum text-jz-ink-2">{s.step ?? 0}/{s.total_steps ?? '?'} 步</span>
                  <StatusBadge status={s.status || 'ready'} />
                  <Button size="sm" variant="secondary" onClick={() => ctx.openSession(s.id)} aria-label={`打开会话 #${s.id}`}>打开 <ArrowRight size={14} aria-hidden /></Button>
                </li>
              ))}
            </ul>
          </AsyncBoundary>
        </div>
      </Panel>

      <Panel flush className="desktop:col-span-4" title="接下来">
        {next.length ? (
          <ol className="divide-y divide-jz-border">
            {next.map((s, i) => (
              <li key={s.key} className="flex flex-col gap-2 px-4 py-3" data-company-next={s.key}>
                <p className="text-label text-jz-ink"><span className="mr-1.5 font-mono text-jz-muted">{i + 1}</span>{s.text}</p>
                <div>{s.action}</div>
              </li>
            ))}
          </ol>
        ) : apps.loading || sessions.loading ? <div className="p-4 text-label text-jz-muted" role="status">正在加载…</div>
          : <EmptyState compact icon={Check} title="没有待处理的步骤" cause="应用全部完成，报告已生成。" />}
      </Panel>

      <Panel flush className="desktop:col-span-6" title="最近报告" actions={<Button size="sm" variant="ghost" onClick={() => goTab('reports')}>全部报告<ArrowRight size={14} aria-hidden /></Button>}>
        <AsyncBoundary loading={reports.loading} error={reports.error} stale={reports.stale} onRetry={reports.reload} compact
          empty={!reports.data?.length} emptyState={<EmptyState compact icon={FileText} title="还没有报告" cause="应用评估完成后，在“报告”标签里生成。" />}>
          <ul className="divide-y divide-jz-border">
            {(reports.data ?? []).slice(0, 5).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2 text-label">
                <span className="min-w-0 truncate text-jz-ink">{reportName(r)} · <span className="text-jz-ink-2">{templateText(r.template)}</span></span>
                <StatusBadge tone={tone(r.status)}>{reportStatus(r.status)}</StatusBadge>
              </li>
            ))}
          </ul>
        </AsyncBoundary>
      </Panel>
      <Panel flush className="desktop:col-span-6" title="最近执行" actions={<Button size="sm" variant="ghost" onClick={() => goTab('runs')}>全部执行<ArrowRight size={14} aria-hidden /></Button>}>
        <AsyncBoundary loading={runs.loading} error={runs.error} stale={runs.stale} onRetry={runs.reload} compact
          empty={!runs.data?.length} emptyState={<EmptyState compact icon={Activity} title="还没有批量执行" cause="会话和任务在“执行”标签里。" />}>
          <ul className="divide-y divide-jz-border">
            {(runs.data ?? []).slice(0, 5).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2 text-label">
                <span className="flex items-center gap-2 text-jz-ink"><span className="font-mono">批次 #{r.id}</span><StatusBadge tone={tone(r.status)}>{statusText(r.status)}</StatusBadge></span>
                <span className="font-mono text-mono tnum text-jz-muted">{r.succeeded}/{r.total} 成功 · {r.failed} 失败</span>
              </li>
            ))}
          </ul>
        </AsyncBoundary>
      </Panel>
    </div>
  );
};
