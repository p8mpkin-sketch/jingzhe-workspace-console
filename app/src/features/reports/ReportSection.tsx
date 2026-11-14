// ReportSection.tsx — session report preview (key facts + source text), report type switch,
// version diff and session comparison. Downloads live in the page's single export menu.
import React, { useState } from 'react';
import { GitCompare, Columns2, FileX, ChevronDown, ChevronRight } from 'lucide-react';
import { Panel, Button, StatusBadge, SegmentedControl, Select, EmptyState, SkeletonLoader, InlineAlert } from '@/components/ui';
import type { TabItem } from '@/components/ui';
import { ReportDiffPanel } from '@/features/pentest/ReportDiffPanel';
import { KIND_CN, SEV_TXT, parseReportKV } from './shared';
import type { TextPreview } from './DetailView';

type Kind = 'all' | 'added' | 'removed' | 'changed';
const KIND_ITEMS: TabItem<'pentest' | 'apk_audit'>[] = [
  { key: 'pentest', label: '动态验证报告', dataAttrs: { 'data-report-kind': 'pentest' } },
  { key: 'apk_audit', label: '应用评估报告', dataAttrs: { 'data-report-kind': 'apk_audit' } },
];
const STATE_LABEL: Record<string, string> = { confirmed: '已确认', pending: '待复核', excluded: '已排除' };

export const ReportSection: React.FC<{
  selected: number | null;
  sessKind: 'pentest' | 'apk_audit';
  setSessKind: (k: 'pentest' | 'apk_audit') => void;
  sessPreview: TextPreview;
  sessions: any[];
  showDiff: boolean;
  setShowDiff: (v: boolean) => void;
  showCompare: boolean;
  setShowCompare: (v: boolean) => void;
  cmpSid: number | null;
  setCmpSid: (v: number) => void;
  cmp: { a: any; b: any } | null;
  diffRows: Array<{ kind: 'added' | 'removed' | 'changed'; title: string; sev: string; note: string }> | null;
}> = (p) => {
  const [kindF, setKindF] = useState<Kind>('all');
  const [sevF, setSevF] = useState<string>('all');
  const [openRow, setOpenRow] = useState<number | null>(null);

  const text = p.sessPreview.state === 'ok' ? p.sessPreview.text : '';
  const reportKV = text ? parseReportKV(text) : null;
  const kvOk = !!reportKV && reportKV.pairs.length >= 2;
  const others = p.sessions.filter((s) => s.id !== p.selected);
  const dr = p.diffRows;
  const shownDiff = (dr || []).filter((r) => (kindF === 'all' || r.kind === kindF) && (sevF === 'all' || r.sev === sevF));
  const kindItems: TabItem<Kind>[] = dr ? (['all', 'added', 'removed', 'changed'] as const).map((k) => ({
    key: k, label: k === 'all' ? '全部' : KIND_CN[k], count: k === 'all' ? dr.length : dr.filter((r) => r.kind === k).length,
  })) : [];
  const raw = (open: boolean) => (
    <details data-report-raw open={open} className="text-label">
      <summary className="cursor-pointer rounded-control py-1 text-jz-ink-2 hover:text-jz-ink">报告原文(Markdown,前 3000 字)</summary>
      <pre data-session-report-preview tabIndex={0} className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-control bg-jz-surface-2 p-3 font-mono text-meta text-jz-ink-2">{text.slice(0, 3000)}</pre>
    </details>
  );

  return (
    <Panel title="会话报告" description={p.selected ? `会话 #${p.selected} 的报告预览;报告类型同时决定导出的 PDF` : '会话报告的预览;报告类型同时决定导出的 PDF'}
      actions={(
        <>
          <SegmentedControl items={KIND_ITEMS} value={p.sessKind} onChange={p.setSessKind} label="报告类型" />
          <Button size="sm" variant="secondary" icon={<GitCompare size={14} aria-hidden />} disabled={!p.selected} aria-pressed={p.showDiff}
            onClick={() => p.setShowDiff(!p.showDiff)} data-export-btn="diff" title="比较两份报告的版本差异">版本差异</Button>
          <Button size="sm" variant="secondary" icon={<Columns2 size={14} aria-hidden />} aria-pressed={p.showCompare}
            onClick={() => p.setShowCompare(!p.showCompare)} title="与另一个会话比较发现">会话对比</Button>
        </>
      )}>
      <div className="space-y-4">
        {!p.selected ? (
          <EmptyState compact icon={FileX} title="没有可预览的会话报告" cause="会话报告来自任务的会话数据。" />
        ) : p.sessPreview.state === 'loading' ? <SkeletonLoader variant="card" />
          : p.sessPreview.state === 'error' ? (
            <EmptyState compact icon={FileX} title="报告预览不可用" cause={`服务端没有返回这份报告(${p.sessPreview.message || '未知原因'})。`} />
          ) : !text ? (
            <EmptyState compact icon={FileX} title="报告内容为空" cause="服务端返回了空内容。" />
          ) : kvOk && reportKV ? (
            <div className="report-print-container space-y-3" data-report-kv>
              {reportKV.title && <div className="text-body font-semibold text-jz-ink break-words">{reportKV.title}</div>}
              <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {reportKV.pairs.map((pair, i) => (
                  <div key={i} className="flex min-w-0 items-baseline gap-3 text-label">
                    <dt className="flex-none text-jz-muted">{pair.k}</dt>
                    <dd className="min-w-0 truncate font-mono tnum text-jz-ink-2" title={pair.v}>{pair.v}</dd>
                  </div>
                ))}
              </dl>
              {raw(false)}
            </div>
          ) : (
            <div className="report-print-container space-y-3" data-report-kv-fallback>
              <InlineAlert tone="info">这份报告没有可提取的摘要字段,下面直接显示原文。</InlineAlert>
              {raw(true)}
            </div>
          )}

        {p.showDiff && (
          <div className="h-[25rem] overflow-hidden rounded-card border border-jz-border" data-diff-panel>
            <ReportDiffPanel />
          </div>
        )}

        {p.showCompare && (
          <div data-compare-panel className="space-y-3 rounded-card border border-jz-border p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h4 className="text-label font-semibold text-jz-ink">会话对比</h4>
              <label className="flex items-center gap-2 text-label text-jz-muted">
                与会话
                <span className="w-72 max-w-full">
                  <Select value={p.cmpSid != null ? String(p.cmpSid) : ''} onChange={(e) => { if (e.target.value) p.setCmpSid(Number(e.target.value)); }} aria-label="对比会话">
                    <option value="">选择会话</option>
                    {others.map((s) => <option key={s.id} value={s.id}>#{s.id} {s.package}</option>)}
                  </Select>
                </span>
              </label>
            </div>
            {!p.cmpSid && <p className="text-label text-jz-muted">选择另一个会话后,这里会列出两边发现的数量和逐条差异。</p>}
            {p.cmp && (
              <table className="w-full max-w-md border-collapse text-label" aria-label="两会话发现数量">
                <thead>
                  <tr className="text-jz-muted">
                    <th scope="col" className="py-1.5 text-left font-medium">状态</th>
                    <th scope="col" className="text-right font-medium">A(#{p.selected})</th>
                    <th scope="col" className="text-right font-medium">B(#{p.cmpSid})</th>
                  </tr>
                </thead>
                <tbody>
                  {(['confirmed', 'pending', 'excluded'] as const).map((k) => (
                    <tr key={k} className="border-t border-jz-border">
                      <th scope="row" className="py-1.5 text-left font-normal text-jz-ink-2">{STATE_LABEL[k]}</th>
                      <td className="text-right font-mono tnum">{p.cmp?.a?.[k] ?? 0}</td>
                      <td className="text-right font-mono tnum">{p.cmp?.b?.[k] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {dr && (
              <div className="space-y-2" data-diff-preview>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="max-w-full overflow-x-auto"><SegmentedControl items={kindItems} value={kindF} onChange={setKindF} label="按差异类型筛选" /></div>
                  <span className="w-36 flex-none">
                    <Select value={sevF} onChange={(e) => setSevF(e.target.value)} aria-label="按严重度筛选">
                      <option value="all">全部严重度</option>
                      {['critical', 'high', 'medium', 'low'].map((sv) => <option key={sv} value={sv}>{sv}</option>)}
                    </Select>
                  </span>
                </div>
                {shownDiff.length === 0 ? (
                  <p className="rounded-control bg-jz-surface-2 px-3 py-2.5 text-label text-jz-muted">
                    {dr.length === 0 ? '两个会话的发现完全一致,或对比请求没有返回数据。' : '没有符合筛选条件的差异。'}
                  </p>
                ) : (
                  <ul className="max-h-72 divide-y divide-jz-border overflow-y-auto rounded-control border border-jz-border">
                    {shownDiff.slice(0, 100).map((r, i) => (
                      <li key={i}>
                        <button type="button" aria-expanded={openRow === i} onClick={() => setOpenRow(openRow === i ? null : i)}
                          className="flex min-h-jz-control w-full items-center gap-2 px-3 text-left text-label hover:bg-jz-surface-2 max-[760px]:min-h-jz-touch">
                          {openRow === i ? <ChevronDown size={14} className="flex-none text-jz-muted" aria-hidden /> : <ChevronRight size={14} className="flex-none text-jz-muted" aria-hidden />}
                          <StatusBadge tone={r.kind === 'added' ? 'brand' : r.kind === 'removed' ? 'neutral' : 'attention'}>{KIND_CN[r.kind]}</StatusBadge>
                          <span className="min-w-0 flex-1 truncate text-jz-ink">{r.title}</span>
                          <span className={`font-mono text-meta ${SEV_TXT[r.sev] || 'text-jz-muted'}`}>{r.sev}</span>
                        </button>
                        {openRow === i && <p className="px-3 pb-2 pl-9 text-meta text-jz-muted">{r.note}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                {shownDiff.length > 100 && <p className="text-meta text-jz-muted">只显示前 100 行,共 {shownDiff.length} 行。</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
};
