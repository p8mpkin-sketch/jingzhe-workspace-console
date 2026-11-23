import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Download, FileText, SearchX, Wand2 } from 'lucide-react';
import { api } from '@/services/api';
import { ActionMenu, AsyncBoundary, Button, Checkbox, DataTable, EmptyState, Field, Pagination, SearchField, Select, StatusBadge } from '@/components/ui';
import type { Column } from '@/components/ui';
import type { ProjectCtx } from '../ProjectDetailPage';
import { pagesOf, reportName, reportStatus, slice, templateText, tone } from '../projectModel';
import type { ReportRow } from '../projectModel';

const REPORT_CONTENTS = ['封面与目录页码', '应用全量清单', '重点发现总表', '密钥、签名与加固', '逐应用证据图', '误报与待复核', '覆盖与限制', '证据索引'];
const StepMark: React.FC<{ n: number }> = ({ n }) => (
  <span aria-hidden className="grid h-5 w-5 flex-none place-items-center rounded-tag border border-jz-border-strong font-mono text-meta text-jz-ink-2">{n}</span>
);

/** Project reports: generate, then history and download. A project-scoped view; the report workspace is /reports. */
export const ReportsTab: React.FC<{ ctx: ProjectCtx }> = ({ ctx }) => {
  const { id, apps, reports, busy, setBusy, say, template, setTemplate, useLlm, setUseLlm, download } = ctx;
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const all = reports.data ?? [];
  const appRows = apps.data ?? [];
  const done = appRows.filter((x) => x.status === 'done').length;
  const latest = all[0];
  const filtered = useMemo(() => { const v = q.trim().toLowerCase(); return all.filter((r) => !v || (('#' + r.id) + r.kind + r.template + r.status).toLowerCase().includes(v)); }, [all, q]);
  const shown = slice(filtered, Math.min(page, pagesOf(filtered.length, 8)), 8);
  useEffect(() => { setPage(1); }, [q]);

  const gen = async () => {
    setBusy('report:portfolio:');
    try {
      const r = await api<any>(`/api/pentest/projects/${id}/reports`, { method: 'POST', body: JSON.stringify({ kind: 'portfolio', app_id: undefined, template, use_llm: useLlm }) });
      say(`报告已生成：${r.pages || '-'} 页。`);
      await reports.reload();
      if (r.id) await download(r.id, 'pdf');
    } catch (e: any) { say('生成失败：' + (e?.message || e), true); } finally { setBusy(''); }
  };

  const cols: Column<ReportRow>[] = [
    { key: 'name', header: '报告', card: 'title', cell: (r) => <span className="font-medium text-jz-ink">{reportName(r)}</span> },
    { key: 'template', header: '模板', cell: (r) => templateText(r.template) },
    { key: 'pages', header: '页数', align: 'right', width: 'w-20', cell: (r) => r.pages ?? '—' },
    { key: 'status', header: '状态', cell: (r) => <StatusBadge tone={tone(r.status)}>{reportStatus(r.status)}</StatusBadge> },
    { key: 'actions', header: <span className="sr-only">下载</span>, label: '下载', align: 'right', card: 'action', cell: (r) => (
      <ActionMenu label="下载" menuLabel={`下载报告 #${r.id}`} icon={<Download size={14} aria-hidden />} triggerAttrs={{ 'data-report-download': r.id }}
        items={[
          { key: 'pdf', label: 'PDF', onSelect: () => download(r.id, 'pdf'), attrs: { 'aria-label': `下载报告 #${r.id} 的 PDF` } },
          { key: 'docx', label: 'DOCX', onSelect: () => download(r.id, 'docx'), attrs: { 'aria-label': `下载报告 #${r.id} 的 DOCX` } },
        ]} />
    ) },
  ];

  return (
    <section className="jz-pane overflow-hidden rounded-card" data-report-workflow>
      <div className="border-b border-jz-border px-4 py-4" data-report-step="generate">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StepMark n={1} /><h2 className="text-label font-semibold text-jz-ink">生成项目总报告</h2>
          <p className="text-meta text-jz-muted">生成后自动下载 PDF，并出现在下方历史的第一行。</p>
        </div>
        <div className="mt-3 grid items-end gap-4 desktop:grid-cols-[minmax(220px,300px)_1fr_auto]">
          <Field label="模板">
            {(ids) => (
              <Select ids={ids} value={template} onChange={(e) => setTemplate(e.target.value)}>
                <option value="technical">技术证据版</option><option value="executive">管理层摘要</option><option value="forensic">取证版</option>
              </Select>
            )}
          </Field>
          <Checkbox checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} label="使用 LLM 撰写叙述（可选）"
            hint={apps.data ? `报告正文不含明文密钥。当前覆盖 ${appRows.length} 个应用，${done} 个已完成。` : '报告正文不含明文密钥。'} />
          <Button icon={<Wand2 size={16} aria-hidden />} loading={busy === 'report:portfolio:'} disabled={!!busy || !appRows.length} onClick={gen}
            title={appRows.length ? undefined : '清单里还没有应用'} data-report-generate>生成报告</Button>
        </div>
        <details className="group mt-3">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-control text-label text-jz-ink-2 hover:text-jz-ink [&::-webkit-details-marker]:hidden">
            <ChevronDown size={14} aria-hidden className="transition-transform duration-base group-open:rotate-180" />报告包含 {REPORT_CONTENTS.length} 个章节
          </summary>
          <ul className="mt-2 grid gap-x-4 gap-y-1.5 text-label text-jz-ink-2 sm:grid-cols-2 desktop:grid-cols-4" aria-label="报告包含的章节">
            {REPORT_CONTENTS.map((x) => <li key={x} className="flex items-center gap-1.5"><Check size={14} className="flex-none text-jz-muted" aria-hidden />{x}</li>)}
          </ul>
        </details>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5" data-report-step="history">
        <StepMark n={2} /><h2 className="text-label font-semibold text-jz-ink">历史与下载</h2>
        <p className="mr-auto font-mono text-mono tnum text-jz-muted">{reports.data ? `${filtered.length} / ${all.length}` : ''}</p>
        <SearchField value={q} onValueChange={setQ} label="搜索报告" className="w-56 max-w-full" />
      </div>
      <div className="border-t border-jz-border">
        <AsyncBoundary loading={reports.loading} error={reports.error} stale={reports.stale} onRetry={reports.reload}
          empty={!shown.length}
          emptyState={all.length ? <EmptyState compact icon={SearchX} title="没有匹配的报告" /> : <EmptyState compact icon={FileText} title="还没有报告" cause="在上方生成第一份项目总报告。" />}>
          <DataTable stickyHeader={false} label="报告历史" columns={cols} rows={shown} rowKey={(r) => r.id}
            rowClassName={(r) => (r.status === 'generating' ? 'bg-jz-brand-soft/50' : undefined)}
            rowDataAttrs={(r) => ({ 'data-report-row': r.id, 'data-report-latest': latest && r.id === latest.id ? '' : undefined })} />
          <Pagination page={page} pageSize={8} total={filtered.length} onPage={setPage} />
        </AsyncBoundary>
      </div>
    </section>
  );
};
