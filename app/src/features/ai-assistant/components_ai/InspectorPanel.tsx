import React, { useEffect, useRef, useState } from 'react';
import { tokenVar } from '@/components/ui';

/** P2-②(修正版④): AI 页专用 Inspector 面板——只复用抽屉视觉(挤压式非遮罩),逻辑不搬
 *  AiInspectorDrawer(该组件绑死渗透工作台 approvals/graph/inspectorTarget 上下文)。
 *  收编: ①会话 Token 遥测(原右侧小卡,数据源=/api/chat/usage-summary 存量端点,含趋势线)
 *       ②调试三件套(任务追问/组装预览/真跑一条,devMode 开启时显示,能力原样保留)。
 *  P3-②: 任务追问升级多选(跨任务对比问答,/api/chat/audit 的 task_ids 口径)。 */

export const InspectorPanel: React.FC<{
  open: boolean;
  devMode: boolean;
  usage: any;
  streamTokens: number;
  onLoadUsage: () => void;
  onClose: () => void;
  auditTasks: any[];
  auditTids: number[];
  toggleAuditTid: (id: number) => void;
  onPreview: () => void;
  onRun: () => void;
  runBusy: boolean;
  canRun: boolean;
  pv: any;
  runRes: any;
}> = ({ open, devMode, usage, streamTokens, onLoadUsage, onClose, auditTasks, auditTids, toggleAuditTid, onPreview, onRun, runBusy, canRun, pv, runRes }) => {
  const [askOpen, setAskOpen] = useState(false);
  const askRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!askOpen) return;
    const onDown = (e: MouseEvent) => { if (askRef.current && !askRef.current.contains(e.target as Node)) setAskOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [askOpen]);
  if (!open) return null;
  return (
    <>
    <div className="fixed inset-0 top-jz-topbar z-40 bg-jz-scrim/30 lg:hidden" onClick={onClose} data-inspector-overlay />
    <div role="complementary" aria-label="检视器"
      className="fixed bottom-0 right-0 top-jz-topbar z-50 w-full max-w-[340px] overflow-auto border-l border-jz-border bg-jz-surface p-2 shadow-dialog lg:static lg:z-auto lg:w-[340px] lg:flex-none lg:bg-jz-surface-2 lg:shadow-none" data-inspector-panel>
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-meta font-semibold text-jz-ink">检视器</span>
        <span className="text-meta text-jz-muted">会话遥测{devMode ? ' + 调试' : ''}</span>
        <span className="flex-1" />
        <button onClick={onClose} data-inspector-close title="收起(消费态不占视窗)"
          className="text-meta text-jz-muted hover:text-jz-ink px-1">✕</button>
      </div>

      {/* ① 会话遥测(原 Token 监控小卡迁入;数据/口径零改动) */}
      <div className="rounded-card bg-jz-surface/60 p-2 space-y-1 mb-2" data-usage-card>
        <div className="flex items-center gap-1">
          <span className="text-meta font-semibold text-jz-ink">Token 遥测</span>
          <span className="flex-1" />
          <button onClick={onLoadUsage} data-usage-refresh className="text-meta text-jz-muted hover:text-jz-ink" title="刷新 usage-summary">↻</button>
          <button onClick={onClose} data-usage-toggle
            title="收起(不挤占分析视窗)"
            className="text-meta text-jz-muted hover:text-jz-brand px-0.5">›</button>
        </div>
        {usage && usage.total?.count > 0 ? (
          <>
            <div className="text-meta text-jz-ink-2 font-mono tabular-nums">
              {usage.recent.length && usage.recent[usage.recent.length - 1].prompt_tokens != null
                ? <>P:{usage.recent[usage.recent.length - 1].prompt_tokens} · C:{usage.recent[usage.recent.length - 1].completion_tokens} · {usage.recent[usage.recent.length - 1].latency_ms}ms</>
                : <span className="text-jz-muted" data-usage-estimate>{streamTokens > 0 ? `流式估记 ~${streamTokens} tokens(模型未回报 usage)` : '模型未回报 usage'}</span>}
            </div>
            {(() => {
              const pts = usage.recent.map((r: any) => r.completion_tokens).filter((v: any) => v != null);
              if (pts.length < 2) return <div className="text-meta text-jz-muted">(样本不足)</div>;
              const W = 300, H = 40, mx = Math.max(...pts), mn = Math.min(...pts);
              const xy = pts.map((v: number, i: number) =>
                `${(i / (pts.length - 1)) * (W - 4) + 2},${H - 3 - ((v - mn) / (mx - mn || 1)) * (H - 8)}`).join(' ');
              return (
                <svg width={W} height={H} data-usage-spark className="w-full">
                  <polyline points={xy} fill="none" stroke={tokenVar('brand')} strokeWidth="1.5" />
                  <text x="2" y="9" fontSize="11" fill={tokenVar('muted')}>近{pts.length}次 completion tokens</text>
                </svg>
              );
            })()}
            <div className="text-meta text-jz-muted font-mono tabular-nums">合计 {usage.total.count} 次 · 均 {usage.total.avg_latency_ms ?? '—'}ms</div>
          </>
        ) : streamTokens > 0 ? (
          <div className="text-meta text-jz-muted font-mono tabular-nums" data-usage-estimate>流式估记 ~{streamTokens} tokens(本会话暂无 usage 落库)</div>
        ) : <div className="text-meta text-jz-muted">本会话暂无调用</div>}
      </div>

      {/* ② 调试三件套(devMode 才显示;任务追问/组装预览/真跑一条能力原样收编,不删) */}
      {devMode && (
        <div className="rounded-card bg-jz-surface/60 p-2 space-y-1.5" data-dev-panel>
          <div className="text-meta font-semibold text-jz-ink mb-0.5">调试</div>
          <div className="flex items-center gap-2 flex-wrap text-meta text-jz-muted">
            <span className="flex-none whitespace-nowrap">任务追问:</span>
            {/* P3-②: 多选(勾选≥1 即对所选任务做对比追问;空=普通对话) */}
            <div className="relative" ref={askRef} data-audit-select-wrap>
              <button onClick={() => setAskOpen((v) => !v)} data-audit-select
                className="flex items-center gap-1 bg-jz-surface-2/60 rounded-control px-1.5 py-0.5 max-w-[220px] hover:ring-1 hover:ring-jz-brand/40"
                title="勾选一个或多个已完成审计任务做对比追问">
                {auditTids.length === 0 ? '关闭(普通对话)' : `#${auditTids.join(' + #')}${auditTids.length > 1 ? '(对比)' : ''}`}
                <span className="text-jz-muted">▾</span>
              </button>
              {askOpen && (
                <div className="absolute left-0 bottom-full mb-1 z-50 w-60 max-h-56 overflow-auto rounded-control border border-jz-border bg-jz-surface/90 backdrop-blur-md shadow-card p-1 modal-panel-in" data-audit-menu>
                  {auditTasks.length === 0 && <div className="px-2 py-1.5 text-meta text-jz-muted">库内暂无已完成审计任务</div>}
                  {auditTasks.map((t) => (
                    <label key={t.id} className="flex items-center gap-1.5 px-2 py-1 rounded-control text-meta text-jz-ink-2 hover:bg-jz-surface-2/60 cursor-pointer" data-audit-item={t.id}>
                      <input type="checkbox" checked={auditTids.includes(Number(t.id))} onChange={() => toggleAuditTid(Number(t.id))} className="accent-jz-brand flex-none" />
                      <span className="truncate" title={`#${t.id} ${t.app_name || t.package}`}>#{t.id} {t.app_name || t.package}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-meta">
            <button onClick={onPreview} className="text-jz-brand hover:underline">组装预览</button>
            <button onClick={onRun} disabled={runBusy || !canRun} className="text-jz-sev-medium hover:underline disabled:opacity-40">{runBusy ? '真跑中…' : '真跑一条'}</button>
          </div>
          {pv && (
            <details className="text-meta">
              <summary className="cursor-pointer text-jz-muted">raw 请求({pv.raw_messages?.length || 0} 条,干跑)</summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded-control bg-jz-canvas/70 p-2 text-meta whitespace-pre-wrap">{JSON.stringify(pv.raw_messages, null, 1)}</pre>
            </details>
          )}
          {runRes && (
            <div className="text-meta" data-prompt-run-result>
              {runRes.error ? <span className="text-jz-sev-critical">真跑失败: {runRes.error}</span> : (
                <details>
                  <summary className="cursor-pointer text-jz-muted">真跑结果(model {runRes.model} · {runRes.latency_ms}ms)</summary>
                  <pre className="mt-1 max-h-40 overflow-auto rounded-control bg-jz-canvas/70 p-2 text-meta whitespace-pre-wrap">{runRes.raw_response}</pre>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
};

export default InspectorPanel;
