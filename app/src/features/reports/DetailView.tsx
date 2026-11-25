// DetailView.tsx — report detail in the shared report reader (features/reports/reader): header (back, title, task
// switcher, session choice, import, the one export menu), chapter navigation, the five report sections. The reader
// is the frame only; the sections, import, manual entry and every export are what they were.
import React, { useRef, useState } from 'react';
import {
  ArrowLeft, Upload, FileDown, FileJson, FileText, Printer, Braces, Table2, ScrollText, FileX,
} from 'lucide-react';
import {
  Button, StatusBadge, CodePill, Skeleton, Panel, SegmentedControl, EmptyState, InlineAlert, SkeletonLoader,
} from '@/components/ui';
import { ReaderChapter, ReaderLayout } from './reader/ReaderLayout';
import { ExportMenu, type ExportGroup, type ExportItem } from './reader/ExportMenu';
import type { Chapter } from './reader/ChapterNav';
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

  // Scroll the page's own scroller (not scrollIntoView, which also moves clipped ancestors) and clear the sticky chapter row.
  const goSec = (ref: React.RefObject<HTMLElement | null>) => {
    const el = ref.current;
    const sc = el?.closest<HTMLElement>('[data-reports-page]');
    if (!el || !sc) return;
    const nav = sc.querySelector<HTMLElement>('[data-toc-nav]');
    const bar = nav && window.matchMedia('(max-width: 1023px)').matches ? nav.offsetHeight : 0;
    const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - bar - 16;
    sc.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  const mxN = p.mx?.rows?.length;
  const cmActiveN = p.cm ? p.cm.rows.filter((r) => r.count > 0).length : null;
  const vmN = p.vm ? p.vm.confirmed.length + p.vm.pending.length + p.vm.excluded.length : null;
  const chapter = (key: string, label: string, n: number | null | undefined): Chapter => ({ id: key, label, count: n, attrs: { 'data-toc-item': key }, countAttrs: { 'data-toc-count': key } });
  const chapters: Chapter[] = [
    chapter('mx', '鉴权矩阵', mxN),
    chapter('cm', '合规域分布', cmActiveN),
    chapter('vulns', '发现明细', vmN),
    chapter('sess', '会话报告', null),
    chapter('pipe', '报告文件', AUDIT_REPORT_FILES.length),
  ];

  const t = p.task;
  const noSession = p.selected == null;
  const sessionItems: TabItem<string>[] = p.taskSessions.slice(0, 8).map((s) => ({ key: String(s.id), label: <span className="font-mono tnum">#{s.id}</span>, dataAttrs: { 'data-session-pill': s.id } }));
  const fileItems: TabItem<string>[] = AUDIT_REPORT_FILES.map((f) => ({ key: f, label: FILE_LABEL[f], dataAttrs: { 'data-pipeline-file': f } }));

  // One export menu for the page. Each item keeps the hooks of the buttons it replaced.
  const item = (key: string, icon: React.ReactNode, label: string, fn: () => void, attrs: Record<string, string> = {}, disabled = false): ExportItem => ({ key, icon, label, onSelect: fn, attrs, disabled });
  const exportGroups: ExportGroup[] = [
    { label: '在浏览器中生成', items: [
      item('vulns-csv', <Table2 size={14} aria-hidden />, '发现明细 CSV', p.onExportVulnsCsv),
      item('matrix-csv', <Table2 size={14} aria-hidden />, '鉴权矩阵 CSV', p.onExportMatrixCsv, { 'data-matrix-export-csv': '' }),
      item('matrix-json', <FileJson size={14} aria-hidden />, '鉴权矩阵 JSON', p.onExportMatrixJson, { 'data-matrix-export-json': '' }),
      item('full-json', <Braces size={14} aria-hidden />, '完整报告 JSON', p.onExportFullJson),
      item('full-md', <FileText size={14} aria-hidden />, '完整报告 Markdown', p.onExportFullMd),
      item('evidence', <Braces size={14} aria-hidden />, '发现证据包 JSON', p.onExportEvidenceJson, { 'data-export-btn': 'json' }, noSession || !p.vm),
      item('print', <Printer size={14} aria-hidden />, '打印或另存为 PDF', p.onPrint),
    ] },
    { label: `由服务端生成${noSession ? '(需要关联会话)' : ''}`, items: [
      item('pdf', <FileText size={14} aria-hidden />, '会话报告 PDF', () => p.onDl('pdf'), { 'data-export-btn': 'pdf' }, noSession),
      item('exec', <ScrollText size={14} aria-hidden />, '管理摘要 PDF', p.onDlExec, { 'data-export-btn': 'exec' }, noSession),
      item('zip', <FileDown size={14} aria-hidden />, '报告包 ZIP', () => p.onDl('package'), { 'data-export-btn': 'zip' }, noSession),
    ] },
  ];

  const header = (
    <>
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
            <ExportMenu groups={exportGroups} itemAttr="data-detail-export" triggerAttrs={{ 'data-menu-btn': '' }} panelAttrs={{ 'data-menu-panel': '' }} />
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

    </>
  );

  return (
    <>
      <ReaderLayout label="报告" scroll="page" pageScroller="[data-reports-page]" chapters={chapters} header={header}
        attrs={{ 'data-reports-detail': '' }} navAttrs={{ 'data-toc-nav': '', 'data-detail-tabs': '' }}>
          {p.aggLoading && !t && <SkeletonLoader variant="card" />}

          <ReaderChapter id="mx"><div ref={mxSecRef}>
            <MatrixSection mx={p.mx} state={p.mxState} reload={p.reloadMatrix} hasSession={!noSession} />
          </div></ReaderChapter>

          <ReaderChapter id="cm"><div ref={cmSecRef}>
            <MasvsSection cm={p.cm} state={p.cmState} selected={p.selected} cmFilter={p.cmFilter}
              onFilter={(name) => { p.setCmFilter(p.cmFilter === name ? null : name); goSec(vulnSecRef); }}
              clearFilter={() => p.setCmFilter(null)} onDrill={p.goDrill} />
          </div></ReaderChapter>

          <ReaderChapter id="vulns"><div ref={vulnSecRef}>
            <VulnSection vm={p.vm} state={p.vmState} selected={p.selected} cmFilter={p.cmFilter}
              clearCmFilter={() => p.setCmFilter(null)} sessions={p.sessions}
              localVulns={p.localVulns} onAddManual={() => setManualOpen(true)} />
          </div></ReaderChapter>

          <ReaderChapter id="sess"><div ref={sessReportRef}>
            <ReportSection
              selected={p.selected} sessKind={p.sessKind} setSessKind={p.setSessKind} sessPreview={p.sessPreview}
              sessions={p.sessions} showDiff={p.showDiff} setShowDiff={p.setShowDiff}
              showCompare={p.showCompare} setShowCompare={p.setShowCompare}
              cmpSid={p.cmpSid} setCmpSid={p.setCmpSid} cmp={p.cmp} diffRows={p.diffRows} />
          </div></ReaderChapter>

          <ReaderChapter id="pipe"><div ref={pipelineSecRef}>
            <Panel title="报告文件" description={`评估流程为任务 #${t?.id ?? '—'} 生成的报告`} data-pipeline-reports
              actions={<SegmentedControl items={fileItems} value={p.fileName} onChange={p.setFileName} label="报告文件" className="max-w-full overflow-x-auto" />}>
              {p.preview.state === 'loading' ? <SkeletonLoader variant="card" />
                : p.preview.state === 'error' ? (
                  <EmptyState compact icon={FileX} title="这份报告文件不可用" cause={`服务端没有返回「${FILE_LABEL[p.fileName]}」(${p.preview.message || '未知原因'})。评估流程可能没有生成它。`} />
                ) : p.preview.text ? (
                  <pre data-report-preview tabIndex={0} className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-control bg-jz-surface-2 p-3 font-mono text-label text-jz-ink-2">{p.preview.text}</pre>
                ) : <EmptyState compact icon={FileX} title="报告文件为空" cause="服务端返回了空内容。" />}
            </Panel>
          </div></ReaderChapter>
      </ReaderLayout>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onMerge={p.onMergeImport} />
      <ManualVulnModal open={manualOpen} onClose={() => setManualOpen(false)} onAdd={p.onAddManualVuln} />
    </>
  );
};
