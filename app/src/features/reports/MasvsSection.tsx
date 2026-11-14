// MasvsSection.tsx — findings by MASVS domain. The share shown per domain is relative (see the footnote);
// the drill-down link contract is unchanged.
import React, { useState } from 'react';
import { ExternalLink, ShieldCheck, X } from 'lucide-react';
import { Panel, Button, SeverityBadge, EmptyState, ErrorState, SkeletonLoader } from '@/components/ui';
import { ScoreRing, sevLevel } from './shared';
import type { CmRow } from './types';

const SEV_DOT: Array<[string, string]> = [['critical', 'bg-jz-sev-critical'], ['high', 'bg-jz-sev-high'], ['medium', 'bg-jz-sev-medium'], ['low', 'bg-jz-sev-low']];

export const MasvsSection: React.FC<{
  cm: { rows: CmRow[]; otherCount: number; total: number } | null;
  state: 'loading' | 'ok' | 'error';
  selected: number | null;
  cmFilter: string | null;
  onFilter: (name: string) => void;
  clearFilter: () => void;
  onDrill: (name: string) => void;
}> = ({ cm, state, selected, cmFilter, onFilter, clearFilter, onDrill }) => {
  const [cmOpen, setCmOpen] = useState<string | null>(null);

  return (
    <Panel data-compliance-map title="合规域分布" description={selected ? `按 MASVS 域汇总会话 #${selected} 的发现;计数为规则卡的实例数` : '按 MASVS 域汇总会话的发现'}
      actions={cmFilter && (
        <Button size="sm" variant="secondary" icon={<X size={14} aria-hidden />} onClick={clearFilter} data-compliance-filter-active title="清除域筛选">筛选: {cmFilter}</Button>
      )}>
      {!cm ? (
        !selected ? <EmptyState compact icon={ShieldCheck} title="没有可汇总的会话" cause="合规域分布按任务的最新会话汇总。" />
          : state === 'error' ? <ErrorState compact title="合规域分布加载失败" message="服务端没有返回分组后的发现。" />
            : <SkeletonLoader variant="cards" rows={3} />
      ) : cm.total === 0 ? (
        <EmptyState compact icon={ShieldCheck} title="该会话没有发现" cause="所有域的实例数都是 0。" />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 desktop:grid-cols-3">
            {cm.rows.map((r) => {
              // Share of the session's instances that are NOT in this domain (relative; there is no MASVS checklist to score against).
              const rate = cm.total > 0 ? Math.max(0, (1 - r.count / cm.total) * 100) : 100;
              const rateStr = rate.toFixed(1);
              const active = cmFilter === r.name;
              const open = cmOpen === r.name;
              const sevTip = ['critical', 'high', 'medium', 'low', 'info'].map((sv) => `${sv} ${r.sev[sv] || 0}`).join(' · ');
              return (
                <li key={r.name} data-compliance-card={r.name}
                  className={`flex min-w-0 flex-col rounded-card border bg-jz-surface transition-colors duration-hover ${active ? 'border-jz-brand bg-jz-brand-soft' : 'border-jz-border hover:border-jz-border-strong'}`}>
                  <button type="button" onClick={() => onFilter(r.name)} aria-pressed={active}
                    title={`${active ? '取消' : ''}按「${r.name}」筛选下方的发现明细`}
                    className="flex min-w-0 items-center gap-3 rounded-card p-3 text-left">
                    <span data-compliance-gauge={r.name} className="flex-none">
                      <ScoreRing rate={rate} size={56} stroke={4.5}>
                        <span className="font-mono text-meta font-semibold tnum text-jz-ink">{rateStr}</span>
                      </ScoreRing>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-semibold text-jz-ink">{r.name}</span>
                      {r.count === 0 ? (
                        <span className="mt-0.5 block text-label text-jz-muted">无发现</span>
                      ) : (
                        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-meta text-jz-ink-2" title={sevTip}>
                          <span className="tnum">{r.count} 个实例</span>
                          {SEV_DOT.filter(([k]) => r.sev[k]).map(([k, cls]) => (
                            <span key={k} className="inline-flex items-center gap-1"><span aria-hidden className={`h-1.5 w-1.5 rounded-pill ${cls}`} /><span className="font-mono tnum">{r.sev[k]}</span><span className="sr-only">{k}</span></span>
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="flex items-center justify-between gap-2 border-t border-jz-border px-3 py-1.5">
                    {r.cards.length > 0 ? (
                      <Button size="sm" variant="ghost" className="-ml-2" onClick={() => setCmOpen(open ? null : r.name)} data-compliance-terms={r.name} aria-expanded={open}>
                        {open ? '收起规则' : `${r.cards.length} 条规则`}
                      </Button>
                    ) : <span className="text-meta text-jz-muted">无规则命中</span>}
                    <Button size="sm" variant="ghost" className="-mr-2" icon={<ExternalLink size={14} aria-hidden />} onClick={() => onDrill(r.name)} data-compliance-drill={r.name}
                      title="在项目工作区按该域查看发现">在工作区查看</Button>
                  </div>
                  {open && (
                    <ul className="max-h-40 overflow-auto border-t border-jz-border" data-compliance-terms-list={r.name}>
                      {r.cards.map((c, i2) => (
                        <li key={i2} className="flex items-center gap-2 px-3 py-1.5 text-meta">
                          <SeverityBadge level={sevLevel(c.severity)} />
                          <span className="min-w-0 flex-1 truncate text-jz-ink-2" title={c.title}>{c.title}</span>
                          <span className="font-mono tnum text-jz-muted">×{c.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-meta text-jz-muted" data-compliance-footnote>
            圆环数值 = 会话全部实例中不属于该域的占比,是相对口径;平台没有 MASVS 检查项目录,无法给出绝对合规率。低于 60 和低于 85 的配色只是显示阈值,不是平台评级。
            {cm.otherCount > 0 ? ` 「其他」包含 ${cm.otherCount} 个没有标准域归属的实例。` : ' 所有实例都有标准域归属。'}
            {' '}会话未归属项目时不能在工作区查看。
          </p>
        </>
      )}
    </Panel>
  );
};
