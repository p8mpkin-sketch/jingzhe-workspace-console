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
      className={`my-2 rounded-card bg-jz-surface/80 shadow-card overflow-hidden ${failed ? 'ring-1 ring-jz-sev-critical/30' : ''}`}>
      <button onClick={() => setOpen((v) => !v)} data-tool-toggle
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-jz-surface-2/30">
        <span className={`flex-none w-6 h-6 rounded-control grid place-items-center ${running ? 'bg-jz-brand/10 text-jz-brand' : failed ? 'bg-jz-sev-critical/10 text-jz-sev-critical' : 'bg-jz-teal/10 text-jz-teal'}`}>
          <Icon size={13} className={running ? 'animate-spin' : ''} />
        </span>
        <span className="text-meta font-mono text-jz-ink-2 truncate">{node.name || 'tool'}</span>
        <span className={`flex-none px-1.5 py-0.5 rounded-control text-meta ${running ? 'bg-jz-brand/10 text-jz-brand' : failed ? 'bg-jz-sev-critical/10 text-jz-sev-critical' : 'bg-jz-teal/10 text-jz-teal'}`}>
          {statusText}
        </span>
        <span className="flex-1" />
        {typeof node.elapsed_ms === 'number' && (
          <span className="text-meta font-mono text-jz-muted tabular-nums">{node.elapsed_ms}ms</span>
        )}
        {open ? <ChevronDown size={12} className="text-jz-muted" /> : <ChevronRight size={12} className="text-jz-muted" />}
      </button>
      {!!node.summary && (
        <div className="px-3 pb-2 text-meta leading-5 text-jz-ink-2" data-tool-summary>{node.summary}</div>
      )}
      {node.data?.verification?.level && (
        <div className="px-3 pb-2" data-tool-verification={node.data.verification.level}>
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-control text-meta font-mono ${
            node.data.verification.level === 'verified_dynamic' ? 'bg-jz-sev-critical/10 text-jz-sev-critical' :
            node.data.verification.level === 'confirmed_static' ? 'bg-jz-teal/10 text-jz-teal' :
            node.data.verification.level === 'needs_context' ? 'bg-jz-sev-medium/10 text-jz-sev-medium' :
            'bg-jz-surface-2/60 text-jz-muted'}`}>
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
                className="px-1.5 py-0.5 rounded-control bg-jz-surface-2/60 text-meta font-mono text-jz-brand/80 truncate max-w-[220px] hover:underline"
                title={title}>{label}</a>
            ) : (
              <span key={i} className="px-1.5 py-0.5 rounded-control bg-jz-surface-2/60 text-meta font-mono text-jz-muted truncate max-w-[220px]"
                title={title}>{label}</span>
            );
          })}
        </div>
      )}
      {open && (
        <div className="px-3 pb-2 space-y-2" data-tool-detail>
          <div>
            <div className="text-meta uppercase text-jz-muted mb-1">参数</div>
            <pre className="max-h-32 overflow-auto rounded-control bg-jz-canvas/60 p-2 text-meta text-jz-muted whitespace-pre-wrap break-words">{argsText}</pre>
          </div>
          {!running && (
            <div>
              <div className="text-meta uppercase text-jz-muted mb-1">结果</div>
              <pre className="max-h-56 overflow-auto rounded-control bg-jz-canvas/60 p-2 text-meta text-jz-ink-2 whitespace-pre-wrap break-words">{dataText}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolCard;
