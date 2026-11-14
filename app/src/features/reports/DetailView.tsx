// DetailView.tsx — 报告中心 Level 2 详情页: 吸顶头(返回/大标题/包名徽章/可搜索任务切换器/导入+导出下拉)
// + 胶囊式二级 Tab(动态计数,即 R598 章节 TOC 的升级形态,锚点直达保留)+ 五大区块
// (鉴权矩阵/MASVS 图谱/漏洞明细/会话报告/审计报告)。
import React, { useRef, useState } from 'react';
import {
  ArrowLeft, Download, Upload, FileDown, FileJson, FileText, Printer, Braces, Table2, Gauge,
  ShieldAlert, ScrollText, Layers,
} from 'lucide-react';
import { StatusBadge, CodePill, Skeleton } from '@/components/ui';
import { Menu, menuItemCls } from './shared';
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
  'executive_summary.md': '高管摘要',
  'security_report.md': '安全报告',
  'pentest_report.md': '渗透报告',
  'native_report.md': '原生库报告',
};

export const DetailView: React.FC<{
 task: any | null;
 entries: HubEntry[];
 taskSessions: any[];
 selected: number | null;
 aggLoading: boolean;
 onPickSession: (sid: number) => void;
 onBack: () => void;
 onPickTask: (tid: number) => void;
 // 鉴权矩阵
 mx: any | null;
 mxState: 'loading' | 'ok' | 'error' | 'empty';
 reloadMatrix: (refresh: boolean) => void;
 // MASVS 图谱
 cm: { rows: any[]; otherCount: number; total: number } | null;
 cmFilter: string | null;
 setCmFilter: (v: string | null) => void;
 goDrill: (name: string) => void;
  // 漏洞明细
  vm: { confirmed: any[]; pending: any[]; excluded: any[]; counts: Record<string, number> } | null;
 localVulns: LocalVuln[];
 onMergeImport: (target: ImportTarget, rows: any[], strategy: 'dedupe' | 'override') => void;
 onAddManualVuln: (v: LocalVuln) => void;
 // 会话报告
 sessKind: 'pentest' | 'apk_audit';
 setSessKind: (k: 'pentest' | 'apk_audit') => void;
 sessPreview: string;
 sessions: any[];
 // 审计报告(pipeline)
 fileName: string;
 setFileName: (f: string) => void;
 preview: string;
 // 对比/Diff
 showDiff: boolean; setShowDiff: (v: boolean) => void;
 showCompare: boolean; setShowCompare: (v: boolean) => void;
 cmpSid: number | null; setCmpSid: (v: number) => void;
  cmp: { a: any; b: any } | null;
  diffRows: Array<{ kind: 'added' | 'removed' | 'changed'; title: string; sev: string; note: string }> | null;
 // 导出(全部走父层: 端点下载 + 纯前端合成)
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
  // R598 章节锚点 refs(TOC 直达;纯定位,无 scroll-spy 假活跃态)
  const mxSecRef = useRef<HTMLElement>(null);
  const cmSecRef = useRef<HTMLElement>(null);
  const vulnSecRef = useRef<HTMLElement>(null);
  const sessReportRef = useRef<HTMLElement>(null);
  const pipelineSecRef = useRef<HTMLElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const goSec = (ref: React.RefObject<HTMLElement | null>) =>
 ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

 const mxN = p.mx?.rows?.length;
 const cmActiveN = p.cm ? p.cm.rows.filter((r) => r.count > 0).length : null;
  const vmN = p.vm ? p.vm.confirmed.length + p.vm.pending.length + p.vm.excluded.length : null;
  const TABS: Array<{ key: string; label: string; icon: React.ElementType; n: number | null | undefined; ref: React.RefObject<HTMLElement | null> }> = [
 { key: 'mx', label: '鉴权矩阵', icon: Table2, n: mxN, ref: mxSecRef },
 { key: 'cm', label: 'MASVS 图谱', icon: Gauge, n: cmActiveN, ref: cmSecRef },
 { key: 'vulns', label: '漏洞明细', icon: ShieldAlert, n: vmN, ref: vulnSecRef },
 { key: 'sess', label: '会话报告', icon: ScrollText, n: null as number | null, ref: sessReportRef },
 { key: 'pipe', label: '审计报告', icon: Layers, n: AUDIT_REPORT_FILES.length, ref: pipelineSecRef },
 ];

 const t = p.task;
 const multiSess = p.taskSessions.length > 1;

  return (
    <div className="space-y-4" data-reports-detail>
      {/* 吸顶头 */}
      <div className="sticky top-0 z-30 -mx-1 px-6 py-3.5 rounded-2xl bg-jz-surface/95 backdrop-blur-sm shadow-jz-card space-y-2.5" data-detail-header>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button type="button" onClick={p.onBack} data-detail-back
 className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-jz-elevated/60 hover:bg-jz-elevated text-sm text-jz-text-secondary hover:text-jz-text-primary transition-colors flex-none">
            <ArrowLeft size={14} />返回报告大厅
          </button>
          {t ? (
            <>
              <h2 className="text-base md:text-xl font-bold text-jz-text-primary truncate max-w-[380px]" data-detail-title
 title={t.app_name || t.package || `任务 #${t.id}`}>
                {t.app_name || t.package || `任务 #${t.id}`}
              </h2>
              <span className="font-mono text-sm text-neon-accent tnum flex-none">#{t.id}</span>
              <CodePill value={t.package || '未返回包名'} textCls="text-sm" maxW="max-w-[240px]" />
              {t.packer && t.packer !== 'none' && <StatusBadge tone="medium">壳 {t.packer}</StatusBadge>}
            </>
          ) : (
            <Skeleton className="h-6 w-64" />
          )}
          <TaskSwitcher entries={p.entries} currentTaskId={t?.id ?? null}
 currentLabel={t ? `#${t.id} ${t.app_name || t.package || ''}`.slice(0, 40) : '切换任务…'}
 onPick={p.onPickTask} />
          {multiSess && (
            <div className="flex items-center gap-1 flex-wrap" data-session-pills>
              <span className="text-[11px] text-jz-text-muted">会话</span>
 {p.taskSessions.slice(0, 8).map((s) => (
                <button key={s.id} type="button" data-session-pill={s.id} onClick={() => p.onPickSession(s.id)}
 title={`切换到会话 #${s.id}${s.id === p.selected ? '(当前)' : ''}`}
 className={`px-2 py-0.5 rounded-full font-mono text-[11px] tnum transition-colors ${s.id === p.selected ? 'bg-neon-accent/15 text-neon-accent ring-1 ring-jz-active/40' : 'text-jz-text-muted hover:text-jz-text-primary hover:bg-jz-elevated/60'}`}>
                  #{s.id}
                </button>
 ))}
 {p.taskSessions.length > 8 && <span className="text-[11px] text-jz-text-muted tnum">+{p.taskSessions.length - 8}</span>}
            </div>
          )}
          <span className="flex-1" />
          <button type="button" onClick={() => setImportOpen(true)} data-detail-import
 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-jz-elevated/60 hover:bg-neon-accent/10 text-sm text-jz-text-primary transition-colors">
            <Upload size={14} className="text-neon-accent" />导入数据
          </button>
          <Menu
            label={<span className="inline-flex items-center gap-1.5"><Download size={14} className="text-neon-accent" />导出报告</span>}
 btnCls="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neon-accent/15 hover:bg-neon-accent/25 text-sm font-medium text-neon-accent"
 widthCls="w-60">
 {(close) => (
              <>
                <button type="button" className={menuItemCls} data-detail-export="vulns-csv" onClick={() => { close(); p.onExportVulnsCsv(); }}><Table2 size={13} className="text-neon-accent" />漏洞明细 CSV</button>
                <button type="button" className={menuItemCls} data-detail-export="matrix-csv" onClick={() => { close(); p.onExportMatrixCsv(); }}><Table2 size={13} className="text-neon-accent" />鉴权矩阵 CSV</button>
                <button type="button" className={menuItemCls} data-detail-export="matrix-json" onClick={() => { close(); p.onExportMatrixJson(); }}><FileJson size={13} className="text-neon-accent" />鉴权矩阵 JSON</button>
                <button type="button" className={menuItemCls} data-detail-export="full-json" onClick={() => { close(); p.onExportFullJson(); }}><Braces size={13} className="text-neon-accent" />完整审计报告 JSON</button>
                <button type="button" className={menuItemCls} data-detail-export="full-md" onClick={() => { close(); p.onExportFullMd(); }}><FileText size={13} className="text-neon-accent" />完整审计报告 Markdown</button>
                <button type="button" className={menuItemCls} data-detail-export="print" onClick={() => { close(); p.onPrint(); }}><Printer size={13} className="text-neon-accent" />打印 / PDF 视图</button>
                <div className="h-px bg-jz-border my-1 mx-1" />
                <button type="button" className={menuItemCls} data-detail-export="pdf" onClick={() => { close(); p.onDl('pdf'); }}><FileText size={13} className="text-jz-text-muted" />报告 PDF(端点)</button>
                <button type="button" className={menuItemCls} data-detail-export="exec" onClick={() => { close(); p.onDlExec(); }}><ScrollText size={13} className="text-jz-text-muted" />高管摘要 PDF(端点)</button>
                <button type="button" className={menuItemCls} data-detail-export="evidence" onClick={() => { close(); p.onExportEvidenceJson(); }}><Braces size={13} className="text-jz-text-muted" />JSON 证据包(端点口径)</button>
                <button type="button" className={menuItemCls} data-detail-export="zip" onClick={() => { close(); p.onDl('package'); }}><FileDown size={13} className="text-jz-text-muted" />报告包 zip(端点)</button>
              </>
            )}
          </Menu>
        </div>
        {/* 二级 Tab(胶囊式 + 动态计数徽章)= R598 章节 TOC 升级形态 */}
        <div className="flex items-center gap-1.5 flex-wrap" data-toc-nav data-detail-tabs>
 {TABS.map((s) => (
            <button key={s.key} type="button" onClick={() => goSec(s.ref)} data-toc-item={s.key}
 title={`跳到「${s.label}」章节`}
 className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${s.n != null
 ? 'text-jz-text-secondary hover:text-jz-text-primary hover:bg-jz-elevated/60 bg-jz-elevated/30'
 : 'text-jz-text-muted hover:text-jz-text-primary bg-jz-elevated/20'}`}>
              <s.icon size={13} className="text-neon-accent" />
              {s.label}
              {s.n != null && (
                <span data-toc-count={s.key} className="px-1.5 py-0.5 rounded-full bg-jz-elevated text-[11px] font-mono tnum text-jz-text-secondary">{s.n}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {p.aggLoading && !t && <Skeleton className="h-40 rounded-2xl" />}

      {/* ① 鉴权矩阵 */}
      <MatrixSection mx={p.mx} state={p.mxState} reload={p.reloadMatrix} secRef={mxSecRef}
 onExportCsv={p.onExportMatrixCsv} onExportJson={p.onExportMatrixJson} />

      {/* ② MASVS 图谱 */}
      <MasvsSection cm={p.cm} selected={p.selected} cmFilter={p.cmFilter}
 onFilter={(name) => { p.setCmFilter(p.cmFilter === name ? null : name); goSec(vulnSecRef); }}
 clearFilter={() => p.setCmFilter(null)} onDrill={p.goDrill} secRef={cmSecRef} />

      {/* ③ 漏洞明细 */}
      <VulnSection vm={p.vm} selected={p.selected} cmFilter={p.cmFilter}
 clearCmFilter={() => p.setCmFilter(null)} sessions={p.sessions}
 localVulns={p.localVulns} onAddManual={() => setManualOpen(true)} secRef={vulnSecRef} />

      {/* ④ 会话报告 + 对比 */}
      <ReportSection
 selected={p.selected} sessKind={p.sessKind} setSessKind={p.setSessKind} sessPreview={p.sessPreview}
 sessions={p.sessions} showDiff={p.showDiff} setShowDiff={p.setShowDiff}
 showCompare={p.showCompare} setShowCompare={p.setShowCompare}
 cmpSid={p.cmpSid} setCmpSid={p.setCmpSid} cmp={p.cmp} diffRows={p.diffRows}
 onDl={p.onDl} onDlExec={p.onDlExec} onExportEvidenceJson={p.onExportEvidenceJson}
 secRef={sessReportRef} />

      {/* ⑤ 审计报告(pipeline,锚定当前任务) */}
      <section className="rounded-2xl bg-jz-surface shadow-jz-card p-3 space-y-2" data-pipeline-reports ref={pipelineSecRef}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-jz-text-primary">审计报告(pipeline)</span>
          <span className="text-xs text-jz-text-muted">锚定当前任务 #{t?.id ?? '—'}</span>
          <span className="flex-1" />
 {AUDIT_REPORT_FILES.map((f) => (
            <button key={f} type="button" onClick={() => p.setFileName(f)} data-pipeline-file={f}
 className={`px-2.5 py-1 rounded-full text-sm font-mono transition-colors ${p.fileName === f ? 'bg-neon-accent/10 text-neon-accent font-semibold' : 'text-jz-text-muted hover:bg-jz-elevated/50'}`}>
              {FILE_LABEL[f]}
            </button>
          ))}
        </div>
        {t && (
          <pre data-report-preview className="max-h-96 overflow-auto rounded-lg bg-jz-elevated/50 p-3 text-[13px] leading-5 text-jz-text-secondary whitespace-pre-wrap">{p.preview || '(空)'}</pre>
        )}
      </section>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onMerge={p.onMergeImport} />
      <ManualVulnModal open={manualOpen} onClose={() => setManualOpen(false)} onAdd={p.onAddManualVuln} />
    </div>
  );
};
