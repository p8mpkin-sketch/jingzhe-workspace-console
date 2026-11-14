// ReportSection.tsx — 渗透会话报告预览(KV 看板,R104-2④)+ 报告类型入口卡(R110-3)+
// 导出动作条(PDF/高管摘要/JSON 证据/版本 Diff/报告包 zip,全部既有端点)+ 会话对比(R78-3 发现级 Diff)。
import React, { useState } from 'react';
import { FileArchive, FileText, ScrollText, Braces, GitCompare } from 'lucide-react';
import { Button, StatusBadge, ModelSelectorChip } from '@/components/ui';
import { ReportDiffPanel } from '@/features/pentest/ReportDiffPanel';
import { KIND_CN, SEV_TXT, parseReportKV } from './shared';

export const ReportSection: React.FC<{
 selected: number | null;
 sessKind: 'pentest' | 'apk_audit';
 setSessKind: (k: 'pentest' | 'apk_audit') => void;
 sessPreview: string;
 sessions: any[];
 showDiff: boolean;
 setShowDiff: (v: boolean) => void;
 showCompare: boolean;
 setShowCompare: (v: boolean) => void;
 cmpSid: number | null;
 setCmpSid: (v: number) => void;
  cmp: { a: any; b: any } | null;
  diffRows: Array<{ kind: 'added' | 'removed' | 'changed'; title: string; sev: string; note: string }> | null;
 onDl: (kind: 'package' | 'pdf') => void;
 onDlExec: () => void;
 onExportEvidenceJson: () => void;
  secRef: React.RefObject<HTMLElement>;
}> = (p) => {
  const [kindF, setKindF] = useState<'all' | 'added' | 'removed' | 'changed'>('all');
  const [sevF, setSevF] = useState<string>('all');
  const [openRow, setOpenRow] = useState<number | null>(null);

 const reportKV = p.sessPreview && !p.sessPreview.startsWith('(') ? parseReportKV(p.sessPreview) : null;
 const kvOk = !!reportKV && reportKV.pairs.length >= 2;
 const cmpOptions = p.sessions.filter((s) => s.id !== p.selected).map((s) => ({ id: String(s.id), label: `#${s.id} ${s.package}`, vendor: String(s.id) }));
 const dr = p.diffRows;
 const shownDiff = (dr || []).filter((r) => (kindF === 'all' || r.kind === kindF) && (sevF === 'all' || r.sev === sevF));

  return (
    <section className="space-y-2" ref={p.secRef}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-jz-text-primary">渗透会话报告</span>
        {/* R110-3: 报告类型入口卡(类型切换驱动预览与 PDF 导出口径);R117-6③: 选中态增 ring+对勾标记 */}
        <button type="button" onClick={() => p.setSessKind('pentest')} data-report-kind="pentest"
 title="渗透测试报告( pentest_report.md,既有类型)"
 className={`px-2.5 py-0.5 rounded-full text-sm font-mono transition-colors ${p.sessKind === 'pentest' ? 'bg-neon-accent/10 text-neon-accent font-semibold' : 'text-jz-text-muted hover:text-jz-text-secondary hover:bg-jz-elevated/50'}`}>
          {p.sessKind === 'pentest' ? '✓ ' : ''}渗透测试报告
        </button>
        <button type="button" onClick={() => p.setSessKind('apk_audit')} data-report-kind="apk_audit"
 title="APK 级审计报告(三段: 审计信息/漏洞信息/提取信息,提取段=extractor_results)"
 className={`px-2.5 py-0.5 rounded-full text-sm font-mono transition-colors ${p.sessKind === 'apk_audit' ? 'bg-neon-accent/10 text-neon-accent font-semibold' : 'text-jz-text-muted hover:text-jz-text-secondary hover:bg-jz-elevated/50'}`}>
          {p.sessKind === 'apk_audit' ? '✓ ' : ''}APK 级审计报告
        </button>
        <span className="flex-1" />
      </div>

      {p.sessPreview && (
        kvOk && reportKV ? (
          <div className="report-print-container rounded-2xl bg-jz-surface shadow-jz-card p-4 space-y-2" data-report-kv>
            {reportKV.title && <div className="text-sm font-semibold text-jz-text-primary truncate" title={reportKV.title}>{reportKV.title}</div>}
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
 {reportKV.pairs.map((pair, i) => (
                <div key={i} className="flex items-baseline gap-2 min-w-0">
                  <span className="font-mono text-xs text-jz-text-muted flex-none">{pair.k}</span>
                  <span className="font-mono text-xs tnum text-jz-text-secondary truncate" title={pair.v}>{pair.v}</span>
                </div>
              ))}
            </div>
            <details data-report-raw>
              <summary className="text-xs text-jz-text-muted cursor-pointer hover:text-jz-text-secondary">报告原文(Markdown)</summary>
              <pre data-session-report-preview className="mt-1 max-h-72 overflow-auto text-xs leading-4 text-jz-text-secondary whitespace-pre-wrap">{p.sessPreview.slice(0, 3000)}</pre>
            </details>
          </div>
        ) : (
          <div className="report-print-container rounded-2xl bg-jz-surface shadow-jz-card p-4" data-report-kv-fallback>
            <div className="text-xs text-jz-text-muted mb-1">摘要解析失败,降级原文折叠</div>
            <details data-report-raw open>
              <summary className="text-xs text-jz-text-muted cursor-pointer">报告原文(Markdown)</summary>
              <pre data-session-report-preview className="mt-1 max-h-72 overflow-auto text-xs leading-4 text-jz-text-secondary whitespace-pre-wrap">{p.sessPreview.slice(0, 3000)}</pre>
            </details>
          </div>
        )
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-jz-text-muted">导出动作条</span>
        <div className="flex items-center gap-1.5 flex-wrap" data-export-group>
 {([
 { key: 'pdf', icon: FileText, label: 'PDF', sub: '报告 PDF(随类型卡切换)', on: () => p.onDl('pdf'), dis: !p.selected },
 { key: 'exec', icon: ScrollText, label: '高管摘要', sub: '一页摘要 PDF', on: p.onDlExec, dis: !p.selected },
 { key: 'json', icon: Braces, label: 'JSON 证据', sub: '漏洞明细原样封装', on: p.onExportEvidenceJson, dis: !p.selected },
 { key: 'diff', icon: GitCompare, label: '版本 Diff', sub: '报告 Diff 对比', on: () => p.setShowDiff(!p.showDiff), dis: !p.selected },
 ] as const).map((b) => (
            <button key={b.key} type="button" onClick={b.on} disabled={b.dis} data-export-btn={b.key}
 title={`${b.label} — ${b.sub}`}
 className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-jz-elevated/60 hover:bg-neon-accent/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm text-jz-text-primary">
              <b.icon className="w-3.5 h-3.5 text-neon-accent" />
              <span className="text-xs leading-tight">{b.label}</span>
            </button>
          ))}
        </div>
        <Button variant="subtle" onClick={() => p.setShowCompare(!p.showCompare)}>对比</Button>
        <button type="button" onClick={() => p.onDl('package')} disabled={!p.selected} data-export-btn="zip"
 title="报告包 zip — 完整取证包(R60 既有能力,保留于四钮动作条之外)"
 className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-jz-elevated/60 hover:bg-neon-accent/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-xs text-jz-text-primary">
          <FileArchive className="w-3.5 h-3.5 text-neon-accent" />报告包 zip
        </button>
      </div>
      {p.showDiff && (
        <div className="h-[400px]" data-diff-panel>
          <ReportDiffPanel />
        </div>
      )}
      {p.showCompare && (
        <div data-compare-panel className="rounded-2xl bg-jz-surface shadow-jz-card p-3 space-y-2">
          <div className="text-sm font-semibold text-jz-text-primary">会话对比(复用 R51 多 APP 对比口径)</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-jz-text-muted">对比会话:</span>
            <ModelSelectorChip options={cmpOptions} value={p.cmpSid != null ? String(p.cmpSid) : null}
 onChange={(id) => p.setCmpSid(Number(id))} placeholder="选择…" />
          </div>
          {p.cmp && (
            <table className="w-full text-xs">
              <thead><tr className="text-jz-text-muted"><th className="text-left py-1">口径</th><th className="text-left">A(#{p.selected})</th><th className="text-left">B(#{p.cmpSid})</th></tr></thead>
              <tbody>
 {(['confirmed', 'pending', 'excluded'] as const).map((k) => (
                  <tr key={k} className="border-t border-jz-border"><td className="py-1">{k}</td><td>{p.cmp?.a?.[k] ?? 0}</td><td>{p.cmp?.b?.[k] ?? 0}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {/* R78-3: 发现级交互式 Diff 预览 */}
          {dr && (
            <div className="space-y-1.5 pt-1" data-diff-preview>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-jz-text-muted">差异过滤:</span>
 {(['all', 'added', 'removed', 'changed'] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setKindF(k)}
 className={`px-2.5 py-0.5 rounded-full text-xs font-mono transition-colors ${kindF === k ? 'bg-neon-accent/10 text-neon-accent font-semibold' : 'text-jz-text-muted hover:bg-jz-elevated/50'}`}>
 {k === 'all' ? `全部 ${dr.length}` : `${KIND_CN[k]} ${dr.filter((r) => r.kind === k).length}`}
                  </button>
                ))}
                <span className="flex-1" />
                <ModelSelectorChip
 options={[{ id: 'all', label: '全部严重度' }, ...['critical', 'high', 'medium', 'low'].map((sv) => ({ id: sv, label: sv }))]}
 value={sevF} onChange={(id) => setSevF(id)} placeholder="严重度" />
              </div>
              {shownDiff.length === 0 && (
                <div className="text-xs text-jz-text-muted px-2 py-1.5 rounded-xl bg-jz-elevated/30">
                  {dr.length === 0 ? '两会话发现完全一致(零差异)' : '当前过滤条件无匹配行'}
                </div>
              )}
              <div className="divided-card-list max-h-72 overflow-y-auto">
 {shownDiff.slice(0, 100).map((r, i) => (
                  <div key={i}>
                    <button type="button" className="w-full h-9 px-2.5 flex items-center gap-2 text-left hover:bg-jz-elevated/30 text-xs"
 onClick={() => setOpenRow(openRow === i ? null : i)}>
                      <StatusBadge tone={r.kind === 'added' ? 'low' : r.kind === 'removed' ? 'critical' : 'medium'}>{KIND_CN[r.kind]}</StatusBadge>
                      <span className="flex-1 truncate text-jz-text-primary">{r.title}</span>
                      <span className={`font-mono ${SEV_TXT[r.sev] || 'text-jz-text-muted'}`}>{r.sev}</span>
                    </button>
                    {openRow === i && (
                      <div className="px-2.5 pb-1.5 text-xs text-jz-text-muted pt-1">{r.note}</div>
                    )}
                  </div>
                ))}
              </div>
 {shownDiff.length > 100 && <div className="text-xs text-jz-text-muted">(仅显示前 100 行,共 {shownDiff.length} 行)</div>}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
