// ReportTable.tsx — one report row and one set of row actions, for session reports and project / single-app
// reports alike. Used by /reports (全部, 项目报告, 单应用报告) and by the project 报告 tab (fixed to its project).
import React from 'react';
import { Link } from 'react-router-dom';
import { Download, FileDown, Lock } from 'lucide-react';
import { ActionMenu, Button, DataTable, RowActions, StatusBadge, StatusGlyph } from '@/components/ui';
import type { Column } from '@/components/ui';
import { reportStatus, templateText, tone } from '@/features/projects/projectModel';
import { SCOPE_LABEL, isProjectKind } from './reportScopes';
import type { ReportItem, ProjectReport } from './reportScopes';
import { aggPart } from './types';

/** "#32 · 项目总报告": kind portfolio or project is a project report, anything else a single-app report. */
export const projectReportName = (r: { id: number; kind?: string }) => `#${r.id} · ${isProjectKind(r.kind) ? '项目总报告' : '单应用报告'}`;

const p2 = (n: number) => String(n).padStart(2, '0');
const fmtWhen = (s: number | null) => { if (s == null) return '—'; const d = new Date(s * 1000); return `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };

const riskTone = (level: string) => (level === '严重' || level === '高' ? 'critical' : level === '中' ? 'medium' : 'low');

/** State of a session row's summary: the hub's aggregate, with the HTTP status it answered with. */
const SessionState: React.FC<{ item: Extract<ReportItem, { type: 'session' }> }> = ({ item }) => {
  const agg = item.entry.agg;
  const st = aggPart(agg, 'summary');
  if (st === 'loading') return <StatusBadge tone="neutral">统计中</StatusBadge>;
  if (st === 'permission') return <span className="inline-flex items-center gap-1 text-label text-jz-ink-2" data-agg-state="permission"><Lock size={12} aria-hidden className="text-jz-muted" />无权限</span>;
  if (st === 'unread') return <span className="inline-flex items-center gap-1 text-label text-jz-ink-2" data-agg-state="unread"><StatusGlyph kind="failed" />未读取</span>;
  if (st === 'none') return <StatusBadge tone="neutral">无会话数据</StatusBadge>;
  return agg?.summary?.risk_level ? <StatusBadge tone={riskTone(agg.summary.risk_level)}>风险 {agg.summary.risk_level}</StatusBadge> : <StatusBadge tone="neutral">无风险级</StatusBadge>;
};

export const ReportTable: React.FC<{
  rows: ReportItem[];
  label: string;
  /** global = /reports (type, project and time columns); project = the project 报告 tab (its five columns). */
  context: 'global' | 'project';
  /** Project context: the newest report of the project, marked data-report-latest. */
  latestId?: number;
  onOpen?: (tid: number, key: string) => void;
  onExportOne?: (tid: number) => void;
  onDownload: (r: ProjectReport, format: 'pdf' | 'docx') => void;
  state?: React.ReactNode;
}> = ({ rows, label, context, latestId, onOpen, onExportOne, onDownload, state }) => {
  const global = context === 'global';
  const download = (r: ProjectReport) => (
    <ActionMenu label="下载" menuLabel={`下载报告 #${r.id}`} icon={<Download size={14} aria-hidden />} triggerAttrs={{ 'data-report-download': r.id }}
      items={[
        { key: 'pdf', label: 'PDF', onSelect: () => onDownload(r, 'pdf'), attrs: { 'aria-label': `下载报告 #${r.id} 的 PDF` } },
        { key: 'docx', label: 'DOCX', onSelect: () => onDownload(r, 'docx'), attrs: { 'aria-label': `下载报告 #${r.id} 的 DOCX` } },
      ]} />
  );
  const cols: Column<ReportItem>[] = [
    { key: 'name', header: '报告', card: 'title', cell: (it) => it.type === 'session' ? (
      <span className="flex min-w-0 max-w-72 flex-col">
        <span className="truncate font-medium text-jz-ink" title={it.entry.task.app_name || ''}>{it.entry.task.app_name || it.entry.task.package || `任务 #${it.entry.task.id}`}</span>
        <span className="truncate font-mono text-meta text-jz-muted" title={it.entry.task.package}>#{it.entry.task.id} · {it.entry.task.package || '未返回包名'}</span>
      </span>
    ) : (
      <span className="flex min-w-0 max-w-72 flex-col">
        <span className="font-medium text-jz-ink">{projectReportName(it.report)}</span>
        {global && <Link to={`/projects/${it.report.pid}`} className="truncate rounded-control text-meta text-jz-ink-2 underline-offset-2 hover:underline" title={it.report.projectName} data-report-project={it.report.pid}>{it.report.projectName}</Link>}
      </span>
    ) },
    ...(global ? [{ key: 'type', header: '类型', cell: (it: ReportItem) => <span className="text-jz-ink-2" data-report-type={it.type}>{SCOPE_LABEL[it.type]}</span> } as Column<ReportItem>] : []),
    { key: 'template', header: '模板', cell: (it) => (it.type === 'session' ? <span className="text-jz-muted">—</span> : templateText(it.report.template)) },
    { key: 'pages', header: '页数', align: 'right', width: 'w-20', cell: (it) => (it.type === 'session' ? <span className="text-jz-muted">—</span> : it.report.pages ?? '—') },
    { key: 'status', header: '状态', cell: (it) => (it.type === 'session' ? <SessionState item={it} /> : <StatusBadge tone={tone(it.report.status)}>{reportStatus(it.report.status)}</StatusBadge>) },
    ...(global ? [{ key: 'when', header: '时间', mono: true, cell: (it: ReportItem) => fmtWhen(it.when) } as Column<ReportItem>] : []),
    { key: 'actions', header: <span className="sr-only">{global ? '操作' : '下载'}</span>, label: global ? '操作' : '下载', align: 'right', card: 'action', cell: (it) => (it.type === 'session' ? (
      <span className="inline-flex whitespace-nowrap">
        <RowActions label={`任务 #${it.entry.task.id} 的更多操作`}
          primary={<Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); onOpen?.(it.entry.task.id, it.key); }} data-hub-open={it.entry.task.id}>查看报告</Button>}
          more={[{ key: 'csv', label: '导出汇总 CSV', icon: <FileDown size={14} aria-hidden />, onSelect: () => onExportOne?.(it.entry.task.id), attrs: { 'data-hub-export-one': it.entry.task.id } }]} />
      </span>
    ) : (
      <span className="inline-flex items-center gap-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
        {global && <Link to={`/projects/${it.report.pid}?tab=${it.type === 'project' ? 'reports' : 'apps'}`} className="rounded-control text-meta text-jz-ink-2 underline underline-offset-2 hover:text-jz-ink max-[760px]:hidden" data-report-in-project={it.report.pid}>在项目里生成</Link>}
        {download(it.report)}
      </span>
    )) },
  ];

  // ↑ ↓ move between rows (Enter on a session row opens its report: DataTable's own row activation).
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-report-item]');
    if (!el || el !== e.target) return;
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-report-item][tabindex]')];
    const next = all[all.indexOf(el) + (e.key === 'ArrowDown' ? 1 : -1)];
    if (next) { e.preventDefault(); next.focus(); }
  };

  return (
    <div onKeyDown={onKeyDown} data-report-table={context}>
      <DataTable<ReportItem> stickyHeader={false} label={label} columns={cols} rows={rows} rowKey={(it) => it.key} state={state}
        onRowClick={global && onOpen ? (it) => { if (it.type === 'session') onOpen(it.entry.task.id, it.key); } : undefined}
        rowClassName={(it) => (it.type !== 'session' && it.report.status === 'generating' ? 'bg-jz-brand-soft/50' : undefined)}
        rowDataAttrs={(it) => ({
          'data-report-item': it.key, 'data-report-kind': it.type,
          ...(it.type === 'session' ? { 'data-hub-row': it.entry.task.id } : { 'data-report-row': it.report.id, 'data-report-latest': latestId != null && it.report.id === latestId ? '' : undefined }),
        })} />
    </div>
  );
};
