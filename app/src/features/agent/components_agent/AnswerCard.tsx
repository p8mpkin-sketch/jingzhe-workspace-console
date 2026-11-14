import React, { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, FileCode2, Link2, ShieldCheck, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { ContentRenderer } from '../content/ContentRenderer';
import type { ContentBlock, EvidenceView } from '../content/types';
import { normalizeContent } from '../content/normalize';
import type { AgentNode } from '../types';

/** One final answer. Content is normalized into blocks; the page never parses tables. */
export const AnswerCard: React.FC<{
  node: AgentNode;
  sessionId?: string;
  tools?: AgentNode[];
  evidenceIndex?: EvidenceView[];
  toolsCount?: number;
  usage?: any;
  live?: boolean;
  allowFeedback?: boolean;
  onFeedback?: (rating: 'up' | 'down') => void;
}> = ({ node, sessionId, tools = [], evidenceIndex, toolsCount = 0, usage, live, allowFeedback, onFeedback }) => {
  const [fb, setFb] = useState<'up' | 'down' | ''>('');
  const [copied, setCopied] = useState(false);
  const backendBlocks = Array.isArray(node.blocks) && node.blocks.length ? node.blocks as ContentBlock[] : null;
  const blocks = useMemo(() => (
    backendBlocks || normalizeContent(node.text || '', { reveal: true })
  ), [backendBlocks, node.text]);
  const copyText = node.text || '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true); setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  };
  const [previewUrl, setPreviewUrl] = useState('');
  const filterKey = sessionId ? `agent-evidence-filter:${sessionId}` : '';
  const [evidenceFilter, setEvidenceFilter] = useState<'all' | EvidenceView['kind']>(() => {
    try {
      const v = filterKey ? sessionStorage.getItem(filterKey) : '';
      return (['all', 'source', 'link', 'task', 'verification'] as const).includes(v as any) ? (v as any) : 'all';
    } catch { return 'all'; }
  });
  const evidence = useMemo<EvidenceView[]>(() => {
    const seen = new Set<string>();
    const out: EvidenceView[] = [];
    const push = (e: EvidenceView) => {
      if (!e || !e.label || seen.has(e.key)) return;
      seen.add(e.key); out.push(e);
    };
    for (const t of tools) {
      for (const c of t.citations || []) {
        if (!c) continue;
        const key = `c-${JSON.stringify(c)}`;
        const label = c.url
          ? String(c.url).replace(/^https?:\/\//, '')
          : [c.task_id ? `task#${c.task_id}` : '', c.ref || '', c.path ? `${c.path}${c.line ? `:${c.line}` : ''}` : ''].filter(Boolean).join(' · ');
        push({
          key,
          kind: c.url ? 'link' : c.path ? 'source' : 'task',
          label: label || '来源',
          detail: c.quote || c.title || undefined,
          url: c.url,
          path: c.path || undefined,
          toolId: String(t.id || ''),
        });
      }
      const v = t.data?.verification;
      if (v?.level) {
        push({
          key: `v-${t.id}`,
          kind: 'verification',
          label: `验证 · ${v.level}`,
          detail: `${t.name || 'tool'} · fact=${v.fact ?? '—'} · reach=${v.reachability ?? '—'}`,
          toolId: String(t.id || ''),
        });
      }
    }
    return out.slice(0, 30);
  }, [tools]);
  const tokenCount = Number(usage?.total_tokens ?? usage?.total ?? 0);
  const focusEvidence = (e: EvidenceView) => {
    const openAncestors = (el: Element | null | undefined) => {
      let node: Element | null = el || null;
      while (node) {
        if (node.tagName === 'DETAILS') (node as HTMLDetailsElement).open = true;
        node = node.parentElement;
      }
    };
    const flash = (el: Element | null | undefined, scroll = true) => {
      if (!el) return false;
      openAncestors(el);
      if (scroll) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-jz-brand');
      window.setTimeout(() => el.classList.remove('ring-2', 'ring-jz-brand'), 1600);
      return true;
    };
    let found = false;
    if (e.path) {
      const path = String(e.path);
      const rows = Array.from(document.querySelectorAll('[data-finding-file]'));
      const row = rows.find((x) => {
        const f = String(x.getAttribute('data-finding-file') || '');
        return f.includes(path) || path.includes(f.split(':')[0]);
      });
      found = flash(row);
    }
    if (e.toolId) {
      const cards = Array.from(document.querySelectorAll('[data-tool-id]'));
      const tool = cards.find((x) => x.getAttribute('data-tool-id') === e.toolId);
      if (tool) {
        openAncestors(tool);
        if (tool.getAttribute('data-tool-expanded') !== '1') {
          (tool.querySelector('[data-tool-toggle]') as HTMLElement | null)?.click();
        }
        if (!found) found = flash(tool);
      }
    }
  };
  const shownEvidence = evidenceFilter === 'all' ? evidence : evidence.filter((e) => e.kind === evidenceFilter);
  const evidenceKinds = Array.from(new Set(evidence.map((e) => e.kind)));
  useEffect(() => {
    if (evidenceFilter !== 'all' && !evidenceKinds.includes(evidenceFilter)) setEvidenceFilter('all');
  }, [evidenceFilter, evidenceKinds]);
  useEffect(() => {
    if (!filterKey) return;
    try { sessionStorage.setItem(filterKey, evidenceFilter); } catch { /* ignore */ }
  }, [evidenceFilter, filterKey]);
  return (
    <div className="mb-4 last:mb-0" data-agent-assistant-card data-live={live ? '1' : '0'}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="flex-none w-6 h-6 rounded-pill bg-jz-brand grid place-items-center text-jz-on-brand text-meta font-semibold shadow-card">AI</span>
        <span className="text-meta text-jz-muted">审计 Agent{node.model ? <span className="font-mono text-jz-muted"> · {node.model}</span> : null}</span>
        {!!toolsCount && <span className="text-meta text-jz-muted">· {toolsCount} 工具</span>}
        {!!tokenCount && <span className="text-meta font-mono text-jz-muted">· {tokenCount.toLocaleString()} tokens</span>}
        {node.interrupted && <span className="px-1.5 py-0.5 rounded-control bg-jz-sev-medium/15 text-jz-sev-medium text-meta">已中断</span>}
        {live && <span className="px-1.5 py-0.5 rounded-control bg-jz-brand/10 text-jz-brand text-meta">生成中</span>}
      </div>
      <div className="rounded-card border border-jz-border/45 bg-jz-surface/55 px-4 py-3" data-agent-content>
        {node.text ? <ContentRenderer blocks={blocks} sessionId={sessionId} evidence={evidenceIndex || evidence} /> : (
          <div className="text-meta text-jz-muted flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-pill bg-jz-brand" /> 正在整理工具结果…
          </div>
        )}
        {!!node.reasoning && (
          <details className="mt-2 rounded-control bg-jz-surface-2/40 px-2 py-1" data-agent-reasoning-panel>
            <summary className="cursor-pointer text-meta text-jz-muted">思考过程（{node.reasoning.length} 字）</summary>
            <pre className="max-h-40 overflow-auto text-meta whitespace-pre-wrap text-jz-muted">{node.reasoning}</pre>
          </details>
        )}
        {!!evidence.length && (
          <details className="mt-2 rounded-control border border-jz-border/35 bg-jz-surface-2/25 px-2 py-1" data-agent-evidence>
            <summary className="cursor-pointer select-none flex items-center gap-1 text-meta text-jz-muted hover:text-jz-ink-2">
              <ShieldCheck size={11} /> 证据 · {evidence.length}
            </summary>
            <div className="mt-1 flex items-center gap-1 flex-wrap" data-evidence-filters>
              {(['all', ...evidenceKinds] as const).map((k) => {
                const label = k === 'all' ? '全部' : k === 'source' ? '源码' : k === 'link' ? '链接' : k === 'task' ? '任务' : '验证';
                return (
                  <button key={k} onClick={() => setEvidenceFilter(k)} data-evidence-filter={k}
                    className={`px-1.5 py-0.5 rounded-control text-meta ${evidenceFilter === k ? 'bg-jz-surface text-jz-ink' : 'text-jz-muted hover:text-jz-ink-2'}`}>
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-52 overflow-auto">
              {shownEvidence.map((e) => {
                const Icon = e.kind === 'verification' ? ShieldCheck : e.kind === 'source' ? FileCode2 : Link2;
                const kindLabel = e.kind === 'verification' ? '验证' : e.kind === 'source' ? '源码' : e.kind === 'link' ? '链接' : '任务';
                const body = (
                  <>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Icon size={11} className="flex-none text-jz-muted" />
                      <span className="min-w-0 flex-1 truncate font-mono text-meta text-jz-ink-2" title={e.label}>{e.label}</span>
                      <span className="flex-none text-meta text-jz-muted">{kindLabel}</span>
                    </div>
                    {!!e.detail && <div className="mt-0.5 text-meta leading-4 text-jz-muted line-clamp-2">{e.detail}</div>}
                  </>
                );
                return (
                  <div key={e.key} data-evidence-key={e.key} data-evidence-kind={e.kind} data-evidence-path={e.path || ''} data-evidence-tool={e.toolId || ''}
                    className={`min-w-0 rounded-control bg-jz-surface/55 border border-jz-border/30 px-2 py-1.5 ${!e.url ? 'cursor-pointer hover:border-jz-brand/40' : ''}`}
                    onClick={() => { if (!e.url) focusEvidence(e); }}
                    title={!e.url ? '定位到对应 finding / tool' : '预览链接证据'}>
                    {e.url ? (
                      <button type="button" onClick={(ev) => { ev.stopPropagation(); setPreviewUrl(e.url || ''); }}
                        className="block w-full text-left" data-evidence-preview-open={e.key}>
                        {body}
                      </button>
                    ) : body}
                  </div>
                );
              })}
            </div>
          </details>
        )}
        <div className="mt-2 flex items-center gap-3 text-meta text-jz-muted">
          {!!node.text && (
            <button onClick={copy} className="flex items-center gap-1 hover:text-jz-brand" data-agent-copy>
              <Copy size={11} /> {copied ? '已复制' : '复制'}
            </button>
          )}
          {allowFeedback && !live && (
            <>
              <span className="flex-1" />
              <button onClick={() => { setFb('up'); onFeedback?.('up'); }}
                className={`flex items-center gap-1 ${fb === 'up' ? 'text-jz-teal' : 'hover:text-jz-teal'}`}>
                <ThumbsUp size={11} /> 有帮助
              </button>
              <button onClick={() => { setFb('down'); onFeedback?.('down'); }}
                className={`flex items-center gap-1 ${fb === 'down' ? 'text-jz-sev-critical' : 'hover:text-jz-sev-critical'}`}>
                <ThumbsDown size={11} /> 没帮助
              </button>
              {fb && <span>已记录</span>}
            </>
          )}
        </div>
      </div>
      {!!previewUrl && (
        <div className="fixed inset-0 z-[70] bg-jz-scrim/40  flex items-center justify-center p-4" onClick={() => setPreviewUrl('')} data-evidence-preview>
          <div className="w-full max-w-lg rounded-panel bg-jz-surface border border-jz-border/50 shadow-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-jz-border/35">
              <Link2 size={13} className="text-jz-brand" />
              <span className="text-label font-semibold text-jz-ink">链接证据</span>
              <span className="flex-1" />
              <button onClick={() => setPreviewUrl('')} data-evidence-preview-close className="w-6 h-6 rounded-control grid place-items-center text-jz-muted hover:text-jz-ink hover:bg-jz-surface-2/60"><X size={14} /></button>
            </div>
            <div className="px-4 py-3">
              <div className="rounded-card bg-jz-canvas/50 border border-jz-border/35 px-3 py-2 font-mono text-meta leading-5 text-jz-ink-2 break-all">{previewUrl}</div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-meta text-jz-muted">不自动跳转；需要时在新标签打开</span>
                <span className="flex-1" />
                {/^https?:\/\//.test(previewUrl) && (
                  <a href={previewUrl} target="_blank" rel="noreferrer" data-evidence-preview-external
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-control bg-jz-brand/10 text-jz-brand text-meta font-semibold hover:bg-jz-brand/15">
                    <ExternalLink size={11} /> 在新标签打开
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
