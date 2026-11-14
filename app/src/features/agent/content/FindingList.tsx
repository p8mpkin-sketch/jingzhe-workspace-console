import React from 'react';
import { pressable } from '@/components/ui';
import { AlertTriangle, CircleCheck } from 'lucide-react';
import type { EvidenceView, FindingView } from './types';

const sevClass = (s: string) => {
  if (s.includes('critical')) return 'bg-jz-sev-critical/15 text-jz-sev-critical border-jz-sev-critical/30';
  if (s.includes('high')) return 'bg-jz-sev-high/15 text-jz-sev-high border-jz-sev-high/30';
  if (s.includes('medium')) return 'bg-jz-sev-medium/15 text-jz-sev-medium border-jz-sev-medium/30';
  return 'bg-jz-surface-2/60 text-jz-muted border-jz-border/40';
};
const barClass = (s: string) => {
  if (s.includes('critical')) return 'border-l-jz-sev-critical';
  if (s.includes('high')) return 'border-l-jz-sev-high';
  if (s.includes('medium')) return 'border-l-jz-sev-medium';
  return 'border-l-jz-border';
};

/** Finding cards render raw values (masking disabled by user order). */
export const FindingList: React.FC<{ items: FindingView[]; sessionId?: string; evidence?: EvidenceView[] }> = ({ items, evidence = [] }) => {
  const count = (name: string) => items.filter((x) => x.severity.includes(name)).length;
  const critical = count('critical');
  const high = count('high');
  const medium = count('medium');
  const focusEvidence = (item: FindingView) => {
    const path = String(item.fileLine || '');
    const cards = Array.from(document.querySelectorAll('[data-evidence-path]')).filter((el) => {
      const p = String(el.getAttribute('data-evidence-path') || '');
      return p && (path.includes(p) || p.includes(path.split(':')[0]));
    });
    cards.forEach((el) => {
      const details = el.closest('details');
      if (details) details.open = true;
      el.classList.add('ring-2', 'ring-jz-brand');
      window.setTimeout(() => el.classList.remove('ring-2', 'ring-jz-brand'), 1600);
    });
    cards[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const focusTool = (item: FindingView) => {
    const path = String(item.fileLine || '');
    const tools = Array.from(document.querySelectorAll('[data-tool-paths]'));
    const tool = tools.find((el) => {
      const paths = String(el.getAttribute('data-tool-paths') || '').split('|').filter(Boolean);
      return paths.some((p) => path.includes(p) || p.includes(path.split(':')[0]));
    });
    if (!tool) return;
    let node: Element | null = tool;
    while (node) {
      if (node.tagName === 'DETAILS') (node as HTMLDetailsElement).open = true;
      node = node.parentElement;
    }
    if (tool.getAttribute('data-tool-expanded') !== '1') {
      (tool.querySelector('[data-tool-toggle]') as HTMLElement | null)?.click();
    }
    tool.scrollIntoView({ behavior: 'smooth', block: 'center' });
    tool.classList.add('ring-2', 'ring-jz-brand');
    window.setTimeout(() => tool.classList.remove('ring-2', 'ring-jz-brand'), 1600);
  };
  const evidenceFor = (item: FindingView) => evidence.filter((e) => {
    if (!e.path) return false;
    const p = String(e.path);
    const f = String(item.fileLine || '');
    return f.includes(p) || p.includes(f.split(':')[0]);
  }).length;
  return (
    <div className="space-y-2" data-finding-list>
      <div className="flex items-center gap-2 flex-wrap" data-finding-summary>
        <span className="text-label font-semibold text-jz-ink">结构化发现</span>
        <span className="font-mono text-meta text-jz-muted">{items.length} 条</span>
        <span className="flex-1" />
        {!!critical && <span className="px-1.5 py-0.5 rounded-control bg-jz-sev-critical/10 text-jz-sev-critical text-meta font-mono">{critical} critical</span>}
        {!!high && <span className="px-1.5 py-0.5 rounded-control bg-jz-sev-high/10 text-jz-sev-high text-meta font-mono">{high} high</span>}
        {!!medium && <span className="px-1.5 py-0.5 rounded-control bg-jz-sev-medium/10 text-jz-sev-medium text-meta font-mono">{medium} medium</span>}
      </div>
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={`${it.index}-${i}`} onClick={() => focusTool(it)} {...pressable()} className={`group cursor-pointer rounded-card border border-jz-border/40 border-l-2 ${barClass(it.severity)} bg-jz-surface/45 px-3 py-2 hover:border-jz-brand/40`} data-finding-row={it.index} data-finding-file={it.fileLine}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`flex-none px-1.5 py-0.5 rounded-control border text-meta font-semibold uppercase ${sevClass(it.severity)}`}>{it.severity || 'info'}</span>
              <code className="text-meta text-jz-brand break-all">{it.fileLine}</code>
              <span className={`flex items-center gap-1 text-meta ${it.verified ? 'text-jz-teal' : 'text-jz-sev-medium'}`}>
                {it.verified ? <CircleCheck size={11} /> : <AlertTriangle size={11} />}
                {it.verified ? '已读源码' : '未验证'}
              </span>
              {!!evidenceFor(it) && (
                <button onClick={(e) => { e.stopPropagation(); focusEvidence(it); }} data-finding-evidence={evidenceFor(it)} data-finding-evidence-link={it.fileLine}
                  className="px-1.5 py-0.5 rounded-control bg-jz-surface-2/60 text-meta font-mono text-jz-muted hover:text-jz-brand hover:bg-jz-brand/10"
                  title="定位到对应证据">
                  证据 {evidenceFor(it)}
                </button>
              )}
            </div>
            <div className="mt-1.5 rounded-control bg-jz-canvas/50 px-2 py-1 font-mono text-meta leading-5 text-jz-ink-2 break-all">
              {it.value || '—'}
            </div>
            {!!it.purpose && <div className="mt-1 text-meta leading-5 text-jz-muted">{it.purpose}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};
