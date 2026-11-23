// The one project table. Every list of projects (all scopes, table or record cards) renders these columns from
// `ProjectRow`; nothing here issues a request.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Copy, FileJson, FileText, Plus } from 'lucide-react';
import { Button, DataTable, IconButton, RowActions, SeverityBadge, StatusBadge, StatusGlyph, Tag, exportDataFile, toast } from '@/components/ui';
import type { Column } from '@/components/ui';
import { PATHS } from '@/layout/navigation';
import { STAGES, SCOPE_LABEL, brandMismatch, fmtTime, isPacked, packerText, progOf, stageLit } from './projectModel';
import type { ApTruth, ProjectRow } from './projectModel';

/** Packer of the most recent session. A recognised packer needs attention; none / unknown is neutral. */
export const PackerBadge: React.FC<{ raw?: string; all?: string[] }> = ({ raw, all }) => {
  const key = raw ?? 'unknown';
  const extra = all && all.length > 1 ? `；项目内出现过：${all.join(', ')}` : '';
  return <StatusBadge tone={isPacked(key) ? 'attention' : 'neutral'} title={`最近会话的加固类型：${key}${extra}`}>{packerText(key)}</StatusBadge>;
};

const progTitle = (ap?: ApTruth) => (ap
  ? (ap.pstate === 'last_run' ? `会话 #${ap.sid} 最近一次运行的完成度：${ap.step}/${ap.total}`
    : ap.pstate === 'live' ? `会话 #${ap.sid} 正在运行：${ap.step}/${ap.total}` : `会话 #${ap.sid} 尚未启动：0/${ap.total}`)
  : '没有会话数据');

/** Step progress of the most recent session: figures, a bar bound to step / total, and five stage ticks. */
export const ProgressCell: React.FC<{ row: ProjectRow }> = ({ row }) => {
  const { p, ap } = row;
  const prog = progOf(ap);
  const lit = stageLit(ap);
  return (
    <div className="min-w-0 max-w-48">
      <div className="whitespace-nowrap font-mono text-mono tnum text-jz-ink-2" data-probe={`prog-text-${p.id}`}>{ap ? `${ap.step}/${ap.total} 步 · ${prog}%` : '—'}</div>
      <div className="mt-1 h-1 overflow-hidden rounded-pill bg-jz-surface-2" title={progTitle(ap)}
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prog} aria-label="步骤完成度">
        <div data-probe={`prog-bar-${p.id}`} data-running={ap?.running ? '1' : ''} className="h-full rounded-pill bg-jz-brand" style={{ width: `${prog}%` }} />
      </div>
      <ol className="mt-1 flex gap-0.5" aria-label="阶段（按步骤完成度推断）">
        {STAGES.map((s, i) => (
          <li key={s} data-probe={`stage-${p.id}-${i}`} data-lit={i < lit ? '1' : ''}
            title={i < lit ? `${s}：按步骤完成度 ${prog}% 推断为已完成` : `${s}：未完成`}
            className={i < lit ? 'h-0.5 flex-1 bg-jz-teal' : 'h-0.5 flex-1 bg-jz-border-strong'}>
            <span className="sr-only">{s}{i < lit ? '，已完成' : '，未完成'}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};

/** Open risk findings of the project: counts when there are high ones, a plain statement otherwise. */
export const FindingSummary: React.FC<{ row: ProjectRow }> = ({ row }) => {
  const { ps, sevAgg, sevKnown } = row;
  const highN = sevAgg.critical + sevAgg.high;
  if (!ps.length) return <span className="text-meta text-jz-muted">没有会话</span>;
  if (highN > 0) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5" title="未关闭的风险发现数，包含待确认项">
        <SeverityBadge level="high">高危 {highN}</SeverityBadge>
        <SeverityBadge level="medium">中危 {sevAgg.medium}</SeverityBadge>
      </span>
    );
  }
  if (sevKnown) return <StatusBadge tone="success">未检出高危</StatusBadge>;
  return <span className="text-meta text-jz-muted" title="风险发现库中没有这些会话的数据">暂无数据</span>;
};

const PackageCell: React.FC<{ row: ProjectRow }> = ({ row }) => {
  const { p, primary, packages, online } = row;
  const pkg = primary?.package || packages[0] || '';
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(pkg); setCopied(true); setTimeout(() => setCopied(false), 1200); }
    catch { toast.err('无法访问剪贴板，可以手动选择包名复制'); }
  };
  if (!row.ps.length) return <span className="text-meta text-jz-muted">没有会话</span>;
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1">
        <span className="min-w-0 truncate font-mono text-mono text-jz-ink" title={pkg ? `会话 #${primary?.id ?? '—'} 的包名：${pkg}` : '没有会话包名'}>{pkg || '—'}</span>
        {pkg && (
          <IconButton size="sm" label={`复制包名 ${pkg}`} onClick={copy} data-probe={`pkg-copy-${p.id}`} className="flex-none">
            {copied ? <Check size={14} className="text-jz-teal" aria-hidden /> : <Copy size={14} aria-hidden />}
          </IconButton>
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusBadge status={row.statusKey} title={`最近会话的状态：${row.statusKey}`} />
        <PackerBadge raw={row.packerKey} all={row.packers} />
        <span className="inline-flex items-center gap-1 text-meta text-jz-muted" data-probe={`device-dot-${p.id}`} data-online={online.length ? '1' : ''}
          title={online.length ? `在线设备：${online.join(', ')}` : '项目会话使用的设备当前不在线'}>
          <StatusGlyph kind={online.length ? 'active' : 'neutral'} />{online.length ? `${online.length} 台设备在线` : '设备不在线'}
        </span>
        {brandMismatch(p.name || '', pkg) && (
          <span data-probe={`pkg-mix-${p.id}`}>
            <StatusBadge tone="attention" title={`项目名称“${p.name}”与包名“${pkg}”的品牌不一致。项目含多个包名时这里显示最近会话的包名，请核对项目归属。`}>包名待核对</StatusBadge>
          </span>
        )}
      </div>
    </div>
  );
};

const copyConfig = async (row: ProjectRow) => {
  const cfg = {
    id: row.p.id, name: row.p.name, note: row.p.note ?? '', 主档包名: row.primary?.package ?? '', 壳: row.packerKey, 状态: row.statusKey,
    会话数: row.ps.length, 覆盖包名: row.packages, 创建时间: fmtTime(row.p.created_at),
  };
  try { await navigator.clipboard.writeText(JSON.stringify(cfg, null, 2)); toast.ok(`项目 #${row.p.id} 的配置已复制`); }
  catch { toast.err('无法访问剪贴板，配置没有复制'); }
};
const exportSessions = (row: ProjectRow) => {
  const rows = row.ps.map((s) => ({
    sid: s.id, package: s.package, app_name: s.app_name ?? '', packer: s.packer ?? 'unknown', status: s.status, device: s.device ?? '',
    created_at: s.created_at ? fmtTime(s.created_at) : '',
  }));
  exportDataFile(`pentest_project_${row.p.id}`, 'json', rows, {
    columns: ['sid', 'package', 'app_name', 'packer', 'status', 'device', 'created_at'], title: `项目 #${row.p.id} ${row.p.name}（会话清单）`,
  });
};

export const ProjectTable: React.FC<{
  rows: ProjectRow[];
  view: 'cards' | 'table';
  /** The most recently created project (company-level first); its row keeps the `data-company-primary` hooks. */
  leadId?: number;
  onOpenSession: (r: ProjectRow) => void;
  onReport: (r: ProjectRow) => void;
  onNewSession: (r: ProjectRow) => void;
}> = ({ rows, view, leadId, onOpenSession, onReport, onNewSession }) => {
  const columns: Column<ProjectRow>[] = [
    { key: 'name', header: '项目', card: 'title', cell: (r) => (
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Link to={PATHS.project(r.p.id)} className="min-w-0 truncate text-label font-medium text-jz-ink hover:text-jz-brand" title={r.p.name}
            data-project-open={r.p.id} {...(r.p.id === leadId ? { 'data-company-primary-open': '' } : {})}>{r.p.name}</Link>
          <Tag className="flex-none">{SCOPE_LABEL[r.scope]}</Tag>
        </div>
        <div className="mt-0.5 truncate text-meta font-normal text-jz-muted">
          <span className="font-mono">#{r.p.id}</span>
          {' · '}{r.scope === 'company' ? (r.p.company_name || '未填写公司或集团') : `${r.ps.length} 个会话`}
          {r.brands.length > 0 && <> · {r.brands.slice(0, 3).join(' / ')}{r.brands.length > 3 ? ` +${r.brands.length - 3}` : ''}</>}
          {' · '}<span className="font-mono tnum">{fmtTime(r.latestTs ?? r.p.created_at)}</span>
        </div>
      </div>
    ) },
    { key: 'apps', header: '应用', align: 'right', width: 'w-16', cell: (r) => (r.apps
      ? <span className="font-mono tnum">{r.apps}</span>
      : r.scope === 'company' ? <StatusBadge tone="attention">待导入</StatusBadge> : <span className="text-jz-muted">—</span>) },
    { key: 'session', header: '最近会话', cell: (r) => <PackageCell row={r} /> },
    { key: 'progress', header: '进度', width: 'w-32', cell: (r) => <ProgressCell row={r} /> },
    { key: 'findings', header: '风险发现', width: 'w-36', cell: (r) => <div data-probe={`sev-row-${r.p.id}`}><FindingSummary row={r} /></div> },
    { key: 'actions', header: <span className="sr-only">操作</span>, label: '操作', align: 'right', width: 'w-32', card: 'action', cell: (r) => (
      <span className="inline-flex" data-probe={`proj-menu-${r.p.id}`}>
        <RowActions label={`项目 ${r.p.name} 的操作`}
          triggerAttrs={{ 'data-probe': `proj-menu-btn-${r.p.id}` }} menuAttrs={{ 'data-probe': `proj-menu-panel-${r.p.id}` }}
          primary={(
            <Button size="sm" variant="secondary" onClick={() => onOpenSession(r)} disabled={!r.primary} data-probe={`enter-workbench-${r.p.id}`}
              title={r.primary ? `打开会话 #${r.primary.id} 的工作台` : '这个项目还没有会话'}>工作台 <ArrowRight size={14} aria-hidden /></Button>
          )}
          more={[
            { key: 'report', label: '项目报告', icon: <FileText size={14} aria-hidden />, onSelect: () => onReport(r), attrs: { 'data-probe': `report-entry-${r.p.id}` } },
            { key: 'new', label: '新建会话', icon: <Plus size={14} aria-hidden />, onSelect: () => onNewSession(r), attrs: { 'data-probe': `proj-menu-newsession-${r.p.id}` } },
            { key: 'copy', label: '复制项目配置', icon: <Copy size={14} aria-hidden />, onSelect: () => copyConfig(r), attrs: { 'data-probe': `proj-menu-copy-${r.p.id}` } },
            { key: 'export', label: '导出会话清单 JSON', icon: <FileJson size={14} aria-hidden />, onSelect: () => exportSessions(r), attrs: { 'data-probe': `proj-menu-export-${r.p.id}` } },
          ]} />
      </span>
    ) },
  ];
  return (
    <div data-card-grid data-view={view}>
      <DataTable label="项目" density="comfortable" stickyHeader={false} columns={columns} rows={rows} rowKey={(r) => r.p.id}
        layout={view === 'cards' ? 'cards' : 'auto'} cardGrid minTableWidth={940}
        rowDataAttrs={(r) => ({ 'data-probe': view === 'cards' ? `proj-card-${r.p.id}` : `proj-row-${r.p.id}`, 'data-company-project': r.p.id, 'data-project-scope': r.scope,
          'data-company-primary': r.p.id === leadId ? r.p.id : undefined })} />
    </div>
  );
};
