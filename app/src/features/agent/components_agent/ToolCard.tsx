import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type { AgentNode } from '../types';

/** One tool call, rendered from durable tool/call + tool/result events.
 *  A running card is a fact, not a fake progress animation. */
export const ToolCard: React.FC<{ node: AgentNode }> = ({ node }) => {
  const [open, setOpen] = useState(false);
  const running = node.status === 'running';
  const failed = node.status === 'error';
  const Icon = running ? Loader2 : failed ? AlertTriangle : CheckCircle2;
  const statusText = running ? '执行中' : failed ? '失败' : '完成';
  const argsText = (() => {
    try { return JSON.stringify(node.args || {}, null, 0); } catch { return '{}'; }
  })();
  const dataText = (() => {
    try { return JSON.stringify(node.data ?? [], null, 1); } catch { return String(node.data || ''); }
  })();
  return (
    <div data-agent-tool-card data-tool-id={node.id} data-tool-name={node.name} data-tool-paths={(node.citations || []).map((c: any) => c.path).filter(Boolean).join('|')} data-tool-status={node.status || 'unknown'} data-tool-expanded={open ? '1' : '0'}
      className={`my-2 rounded-xl bg-jz-surface/80 shadow-jz-card overflow-hidden ${failed ? 'ring-1 ring-vuln-critical/30' : ''}`}>
      <button onClick={() => setOpen((v) => !v)} data-tool-toggle
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-jz-elevated/30">
        <span className={`flex-none w-6 h-6 rounded-lg grid place-items-center ${running ? 'bg-neon-accent/10 text-neon-accent' : failed ? 'bg-vuln-critical/10 text-vuln-critical' : 'bg-vuln-safe/10 text-vuln-safe'}`}>
          <Icon size={13} className={running ? 'animate-spin' : ''} />
        </span>
        <span className="text-xs font-mono text-jz-text-secondary truncate">{node.name || 'tool'}</span>
        <span className={`flex-none px-1.5 py-0.5 rounded text-[11px] ${running ? 'bg-neon-accent/10 text-neon-accent' : failed ? 'bg-vuln-critical/10 text-vuln-critical' : 'bg-vuln-safe/10 text-vuln-safe'}`}>
          {statusText}
        </span>
        <span className="flex-1" />
        {typeof node.elapsed_ms === 'number' && (
          <span className="text-[11px] font-mono text-jz-text-muted tabular-nums">{node.elapsed_ms}ms</span>
        )}
        {open ? <ChevronDown size={12} className="text-jz-text-muted" /> : <ChevronRight size={12} className="text-jz-text-muted" />}
      </button>
      {!!node.summary && (
        <div className="px-3 pb-2 text-xs leading-5 text-jz-text-secondary" data-tool-summary>{node.summary}</div>
      )}
      {node.data?.verification?.level && (
        <div className="px-3 pb-2" data-tool-verification={node.data.verification.level}>
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono ${
            node.data.verification.level === 'verified_dynamic' ? 'bg-vuln-critical/10 text-vuln-critical' :
            node.data.verification.level === 'confirmed_static' ? 'bg-vuln-safe/10 text-vuln-safe' :
            node.data.verification.level === 'needs_context' ? 'bg-vuln-medium/10 text-vuln-medium' :
            'bg-jz-elevated/60 text-jz-text-muted'}`}>
            {node.data.verification.level} · fact={node.data.verification.fact} · reach={node.data.verification.reachability}
          </span>
        </div>
      )}
      {!!node.citations?.length && (
        <div className="px-3 pb-2 flex flex-wrap gap-1" data-tool-citations>
          {node.citations.slice(0, 6).map((c: any, i: number) => {
            const label = c.url
              ? String(c.url).replace(/^https?:\/\//, '').slice(0, 52)
              : `${c.task_id ? `task${c.task_id}` : ''}${c.ref ? `・${c.ref}` : ''}${c.path ? `・${c.path}` : ''}`;
            const title = c.url || `${c.task_id || ''} ${c.ref || ''} ${c.path || ''}`;
            return c.url ? (
              <a key={i} href={c.url} target="_blank" rel="noreferrer" data-tool-citation-url
                className="px-1.5 py-0.5 rounded bg-jz-elevated/60 text-[11px] font-mono text-neon-accent/80 truncate max-w-[220px] hover:underline"
                title={title}>{label}</a>
            ) : (
              <span key={i} className="px-1.5 py-0.5 rounded bg-jz-elevated/60 text-[11px] font-mono text-jz-text-muted truncate max-w-[220px]"
                title={title}>{label}</span>
            );
          })}
        </div>
      )}
      {open && (
        <div className="px-3 pb-2 space-y-2" data-tool-detail>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-jz-text-muted mb-1">参数</div>
            <pre className="max-h-32 overflow-auto rounded-lg bg-jz-bg/60 p-2 text-[11px] text-jz-text-muted whitespace-pre-wrap break-words">{argsText}</pre>
          </div>
          {!running && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-jz-text-muted mb-1">结果</div>
              <pre className="max-h-56 overflow-auto rounded-lg bg-jz-bg/60 p-2 text-[11px] text-jz-text-secondary whitespace-pre-wrap break-words">{dataText}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolCard;
