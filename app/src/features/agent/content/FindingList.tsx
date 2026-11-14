import React from 'react';
import { AlertTriangle, CircleCheck } from 'lucide-react';
import type { EvidenceView, FindingView } from './types';

const sevClass = (s: string) => {
  if (s.includes('critical')) return 'bg-vuln-critical/15 text-vuln-critical border-vuln-critical/30';
  if (s.includes('high')) return 'bg-vuln-high/15 text-vuln-high border-vuln-high/30';
  if (s.includes('medium')) return 'bg-vuln-medium/15 text-vuln-medium border-vuln-medium/30';
  return 'bg-jz-elevated/60 text-jz-text-muted border-jz-border/40';
};
const barClass = (s: string) => {
  if (s.includes('critical')) return 'border-l-vuln-critical';
  if (s.includes('high')) return 'border-l-vuln-high';
  if (s.includes('medium')) return 'border-l-vuln-medium';
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
      el.classList.add('ring-2', 'ring-neon-accent');
      window.setTimeout(() => el.classList.remove('ring-2', 'ring-neon-accent'), 1600);
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
    tool.classList.add('ring-2', 'ring-neon-accent');
    window.setTimeout(() => tool.classList.remove('ring-2', 'ring-neon-accent'), 1600);
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
        <span className="text-[13px] font-semibold text-jz-text-primary">结构化发现</span>
        <span className="font-mono text-[11px] text-jz-text-muted">{items.length} 条</span>
        <span className="flex-1" />
        {!!critical && <span className="px-1.5 py-0.5 rounded-md bg-vuln-critical/10 text-vuln-critical text-[11px] font-mono">{critical} critical</span>}
        {!!high && <span className="px-1.5 py-0.5 rounded-md bg-vuln-high/10 text-vuln-high text-[11px] font-mono">{high} high</span>}
        {!!medium && <span className="px-1.5 py-0.5 rounded-md bg-vuln-medium/10 text-vuln-medium text-[11px] font-mono">{medium} medium</span>}
      </div>
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={`${it.index}-${i}`} onClick={() => focusTool(it)} className={`group cursor-pointer rounded-xl border border-jz-border/40 border-l-2 ${barClass(it.severity)} bg-jz-surface/45 px-3 py-2 hover:border-neon-accent/40`} data-finding-row={it.index} data-finding-file={it.fileLine}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`flex-none px-1.5 py-0.5 rounded border text-[11px] font-semibold uppercase ${sevClass(it.severity)}`}>{it.severity || 'info'}</span>
              <code className="text-[12px] text-jz-accent-cyan break-all">{it.fileLine}</code>
              <span className={`flex items-center gap-1 text-[11px] ${it.verified ? 'text-vuln-safe' : 'text-vuln-medium'}`}>
                {it.verified ? <CircleCheck size={11} /> : <AlertTriangle size={11} />}
                {it.verified ? '已读源码' : '未验证'}
              </span>
              {!!evidenceFor(it) && (
                <button onClick={(e) => { e.stopPropagation(); focusEvidence(it); }} data-finding-evidence={evidenceFor(it)} data-finding-evidence-link={it.fileLine}
                  className="px-1.5 py-0.5 rounded bg-jz-elevated/60 text-[11px] font-mono text-jz-text-muted hover:text-neon-accent hover:bg-neon-accent/10"
                  title="定位到对应证据">
                  证据 {evidenceFor(it)}
                </button>
              )}
            </div>
            <div className="mt-1.5 rounded-lg bg-jz-bg/50 px-2 py-1 font-mono text-[12px] leading-5 text-jz-text-secondary break-all">
              {it.value || '—'}
            </div>
            {!!it.purpose && <div className="mt-1 text-[11px] leading-5 text-jz-text-muted">{it.purpose}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};
