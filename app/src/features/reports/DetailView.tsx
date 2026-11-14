// DetailView.tsx — report detail: header (back, title, task switcher, session choice, import, one export menu),
// section navigation on the left, the five report sections on the right.
import React, { useRef, useState } from 'react';
import {
  ArrowLeft, Download, Upload, FileDown, FileJson, FileText, Printer, Braces, Table2, ScrollText, FileX,
} from 'lucide-react';
import {
  Button, StatusBadge, CodePill, Skeleton, Panel, Popover, MenuItem, SegmentedControl, EmptyState, InlineAlert, SkeletonLoader,
} from '@/components/ui';
import type { TabItem } from '@/components/ui';
import { TaskSwitcher } from './TaskSwitcher';
import { MatrixSection } from './MatrixSection';
import { MasvsSection } from './MasvsSection';
import { VulnSection } from './VulnSection';
import { ReportSection } from './ReportSection';
import { ImportModal } from './ImportModal';
import { ManualVulnModal } from './ManualVulnModal';
import type { ImportTarget } from './reportIo';
import type { LocalVuln } from './types';
import type { HubEntry } from './types';

const AUDIT_REPORT_FILES = ['executive_summary.md', 'security_report.md', 'pentest_report.md', 'native_report.md'];
const FILE_LABEL: Record<string, string> = {
  'executive_summary.md': '管理摘要',
  'security_report.md': '安全评估报告',
  'pentest_report.md': '动态验证报告',
  'native_report.md': '原生库报告',
};

/** Text preview state the parent derives from its own request: loading, the API's failure, or the text. */
export type TextPreview = { state: 'loading' | 'ok' | 'error'; text: string; message?: string };


export const DetailView: React.FC<{
  task: any | null;
  entries: HubEntry[];
  taskSessions: any[];
  selected: number | null;
  aggLoading: boolean;
  onPickSession: (sid: number) => void;
  onBack: () => void;
  onPickTask: (tid: number) => void;
  // auth matrix
  mx: any | null;
  mxState: 'loading' | 'ok' | 'error' | 'empty';
  reloadMatrix: (refresh: boolean) => void;
  // domain map
  cm: { rows: any[]; otherCount: number; total: number } | null;
  cmState: 'loading' | 'ok' | 'error';
  cmFilter: string | null;
  setCmFilter: (v: string | null) => void;
  goDrill: (name: string) => void;
  // findings
  vm: { confirmed: any[]; pending: any[]; excluded: any[]; counts: Record<string, number> } | null;
  vmState: 'loading' | 'ok' | 'error';
  localVulns: LocalVuln[];
  onMergeImport: (target: ImportTarget, rows: any[], strategy: 'dedupe' | 'override') => void;
  onAddManualVuln: (v: LocalVuln) => void;
  // session report
  sessKind: 'pentest' | 'apk_audit';
  setSessKind: (k: 'pentest' | 'apk_audit') => void;
  sessPreview: TextPreview;
  sessions: any[];
  // report files of the task
  fileName: string;
  setFileName: (f: string) => void;
  preview: TextPreview;
  // compare / diff
  showDiff: boolean; setShowDiff: (v: boolean) => void;
  showCompare: boolean; setShowCompare: (v: boolean) => void;
  cmpSid: number | null; setCmpSid: (v: number) => void;
  cmp: { a: any; b: any } | null;
  diffRows: Array<{ kind: 'added' | 'removed' | 'changed'; title: string; sev: string; note: string }> | null;
  // exports (all owned by the parent: endpoint downloads and client-side composition)
  onDl: (kind: 'package' | 'pdf') => void;
  onDlExec: () => void;
  onExportEvidenceJson: () => void;
  onExportVulnsCsv: () => void;
  onExportMatrixCsv: () => void;
  onExportMatrixJson: () => void;
  onExportFullJson: () => void;
  onExportFullMd: () => void;
  onPrint: () => void;
}> = (p) => {
  const mxSecRef = useRef<HTMLDivElement>(null);
  const cmSecRef = useRef<HTMLDivElement>(null);
  const vulnSecRef = useRef<HTMLDivElement>(null);
  const sessReportRef = useRef<HTMLDivElement>(null);
  const pipelineSecRef = useRef<HTMLDivElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  // Scroll the page's own scroller (not scrollIntoView, which also moves clipped ancestors) and clear the sticky section bar.
  const navRef = useRef<HTMLElement>(null);
  const goSec = (ref: React.RefObject<HTMLElement | null>) => {
    const el = ref.current;
    const sc = el?.closest<HTMLElement>('[data-reports-page]');
    if (!el || !sc) return;
    const bar = navRef.current && window.matchMedia('(max-width: 1023px)').matches ? navRef.current.offsetHeight : 0;
    const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - bar - 16;
    sc.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  const mxN = p.mx?.rows?.length;
  const cmActiveN = p.cm ? p.cm.rows.filter((r) => r.count > 0).length : null;
  const vmN = p.vm ? p.vm.confirmed.length + p.vm.pending.length + p.vm.excluded.length : null;
  const SECTIONS: Array<{ key: string; label: string; n: number | null | undefined; ref: React.RefObject<HTMLDivElement | null> }> = [
    { key: 'mx', label: '鉴权矩阵', n: mxN, ref: mxSecRef },
    { key: 'cm', label: '合规域分布', n: cmActiveN, ref: cmSecRef },
    { key: 'vulns', label: '发现明细', n: vmN, ref: vulnSecRef },
    { key: 'sess', label: '会话报告', n: null, ref: sessReportRef },
    { key: 'pipe', label: '报告文件', n: AUDIT_REPORT_FILES.length, ref: pipelineSecRef },
  ];

  const t = p.task;
  const noSession = p.selected == null;
  const sessionItems: TabItem<string>[] = p.taskSessions.slice(0, 8).map((s) => ({ key: String(s.id), label: <span className="font-mono tnum">#{s.id}</span>, dataAttrs: { 'data-session-pill': s.id } }));
  const fileItems: TabItem<string>[] = AUDIT_REPORT_FILES.map((f) => ({ key: f, label: FILE_LABEL[f], dataAttrs: { 'data-pipeline-file': f } }));

  return (
    <div className="flex flex-col gap-6" data-reports-detail>
      <div className="flex flex-col gap-3" data-detail-header>
        <div>
          <Button variant="ghost" size="sm" className="-ml-2" icon={<ArrowLeft size={14} aria-hidden />} onClick={p.onBack} data-detail-back>返回报告列表</Button>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-80">
            {t ? (
              <>
                <h1 className="jz-page-title break-words text-jz-ink" data-detail-title>{t.app_name || t.package || `任务 #${t.id}`}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-label text-jz-muted">
                  <span className="font-mono tnum">任务 #{t.id}</span>
                  <CodePill value={t.package || '未返回包名'} maxW="max-w-[280px]" />
                  {t.packer && t.packer !== 'none' && <StatusBadge tone="neutral">加固 {t.packer}</StatusBadge>}
                </div>
              </>
            ) : <Skeleton className="h-8 w-64" />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TaskSwitcher entries={p.entries} currentTaskId={t?.id ?? null} onPick={p.onPickTask} />
            <Button variant="secondary" icon={<Upload size={14} aria-hidden />} onClick={() => setImportOpen(true)} data-detail-import>导入数据</Button>
            <Popover label="导出报告" role="menu" align="end" className="w-64"
              trigger={(tp) => <Button icon={<Download size={14} aria-hidden />} data-menu-btn {...tp}>导出</Button>}>
              {(close) => {
                const run = (fn: () => void) => () => { close(); fn(); };
                // One export menu for the page. Each item keeps the hooks of the buttons it replaces.
                const item = (key: string, icon: React.ReactNode, label: string, fn: () => void, extra: Record<string, string> = {}, disabled = false) => (
                  <MenuItem key={key} icon={icon} disabled={disabled} data-detail-export={key} onClick={run(fn)} {...extra}>{label}</MenuItem>
                );
                return (
                  <div data-menu-panel>
                    <div className="px-2.5 pb-1 pt-1.5 text-meta text-jz-muted">在浏览器中生成</div>
                    {item('vulns-csv', <Table2 size={14} aria-hidden />, '发现明细 CSV', p.onExportVulnsCsv)}
                    {item('matrix-csv', <Table2 size={14} aria-hidden />, '鉴权矩阵 CSV', p.onExportMatrixCsv, { 'data-matrix-export-csv': '' })}
                    {item('matrix-json', <FileJson size={14} aria-hidden />, '鉴权矩阵 JSON', p.onExportMatrixJson, { 'data-matrix-export-json': '' })}
                    {item('full-json', <Braces size={14} aria-hidden />, '完整报告 JSON', p.onExportFullJson)}
                    {item('full-md', <FileText size={14} aria-hidden />, '完整报告 Markdown', p.onExportFullMd)}
                    {item('evidence', <Braces size={14} aria-hidden />, '发现证据包 JSON', p.onExportEvidenceJson, { 'data-export-btn': 'json' }, noSession || !p.vm)}
                    {item('print', <Printer size={14} aria-hidden />, '打印或另存为 PDF', p.onPrint)}
                    <div className="mx-1 my-1 h-px bg-jz-border" role="separator" />
                    <div className="px-2.5 pb-1 pt-1.5 text-meta text-jz-muted">由服务端生成{noSession ? '(需要关联会话)' : ''}</div>
                    {item('pdf', <FileText size={14} aria-hidden />, '会话报告 PDF', () => p.onDl('pdf'), { 'data-export-btn': 'pdf' }, noSession)}
                    {item('exec', <ScrollText size={14} aria-hidden />, '管理摘要 PDF', p.onDlExec, { 'data-export-btn': 'exec' }, noSession)}
                    {item('zip', <FileDown size={14} aria-hidden />, '报告包 ZIP', () => p.onDl('package'), { 'data-export-btn': 'zip' }, noSession)}
                  </div>
                );
              }}
            </Popover>
          </div>
        </div>
        {p.taskSessions.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-label text-jz-muted" data-session-pills>
            <span>会话</span>
            <SegmentedControl items={sessionItems} value={String(p.selected ?? '')} onChange={(k) => p.onPickSession(Number(k))} label="选择会话" className="max-w-full overflow-x-auto" />
            {p.taskSessions.length > 8 && <span className="tnum">另有 {p.taskSessions.length - 8} 个</span>}
          </div>
        )}
      </div>

      {t && noSession && (
        <InlineAlert tone="info" title="该任务没有关联的活跃会话">鉴权矩阵、合规域分布、发现明细和会话报告来自会话数据,当前不可用。报告文件仍可查看和导出。</InlineAlert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <nav ref={navRef} aria-label="报告章节" data-toc-nav data-detail-tabs
          className="sticky top-0 z-10 -mx-jz-page flex gap-1 overflow-x-auto border-b border-jz-border bg-jz-canvas px-jz-page py-2 [scrollbar-width:none] lg:top-4 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:border-b-0 lg:px-0 lg:py-0">
          {SECTIONS.map((s) => (
            <button key={s.key} type="button" onClick={() => goSec(s.ref)} data-toc-item={s.key}
              className="flex h-jz-control flex-none items-center justify-between gap-2 whitespace-nowrap rounded-control px-3 text-label text-jz-ink-2 transition-colors duration-hover hover:bg-jz-surface-2 hover:text-jz-ink max-[760px]:h-jz-touch">
              {s.label}
              {s.n != null && <span data-toc-count={s.key} className="font-mono text-meta tnum text-jz-muted">{s.n}</span>}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          {p.aggLoading && !t && <SkeletonLoader variant="card" />}

          <div ref={mxSecRef}>
            <MatrixSection mx={p.mx} state={p.mxState} reload={p.reloadMatrix} hasSession={!noSession} />
          </div>

          <div ref={cmSecRef}>
            <MasvsSection cm={p.cm} state={p.cmState} selected={p.selected} cmFilter={p.cmFilter}
              onFilter={(name) => { p.setCmFilter(p.cmFilter === name ? null : name); goSec(vulnSecRef); }}
              clearFilter={() => p.setCmFilter(null)} onDrill={p.goDrill} />
          </div>

          <div ref={vulnSecRef}>
            <VulnSection vm={p.vm} state={p.vmState} selected={p.selected} cmFilter={p.cmFilter}
              clearCmFilter={() => p.setCmFilter(null)} sessions={p.sessions}
              localVulns={p.localVulns} onAddManual={() => setManualOpen(true)} />
          </div>

          <div ref={sessReportRef}>
            <ReportSection
              selected={p.selected} sessKind={p.sessKind} setSessKind={p.setSessKind} sessPreview={p.sessPreview}
              sessions={p.sessions} showDiff={p.showDiff} setShowDiff={p.setShowDiff}
              showCompare={p.showCompare} setShowCompare={p.setShowCompare}
              cmpSid={p.cmpSid} setCmpSid={p.setCmpSid} cmp={p.cmp} diffRows={p.diffRows} />
          </div>

          <div ref={pipelineSecRef}>
            <Panel title="报告文件" description={`评估流程为任务 #${t?.id ?? '—'} 生成的报告`} data-pipeline-reports
              actions={<SegmentedControl items={fileItems} value={p.fileName} onChange={p.setFileName} label="报告文件" className="max-w-full overflow-x-auto" />}>
              {p.preview.state === 'loading' ? <SkeletonLoader variant="card" />
                : p.preview.state === 'error' ? (
                  <EmptyState compact icon={FileX} title="这份报告文件不可用" cause={`服务端没有返回「${FILE_LABEL[p.fileName]}」(${p.preview.message || '未知原因'})。评估流程可能没有生成它。`} />
                ) : p.preview.text ? (
                  <pre data-report-preview tabIndex={0} className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-control bg-jz-surface-2 p-3 font-mono text-label text-jz-ink-2">{p.preview.text}</pre>
                ) : <EmptyState compact icon={FileX} title="报告文件为空" cause="服务端返回了空内容。" />}
            </Panel>
          </div>
        </div>
      </div>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onMerge={p.onMergeImport} />
      <ManualVulnModal open={manualOpen} onClose={() => setManualOpen(false)} onAdd={p.onAddManualVuln} />
    </div>
  );
};
