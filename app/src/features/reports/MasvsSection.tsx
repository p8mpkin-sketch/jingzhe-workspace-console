// MasvsSection.tsx — MASVS 合规图谱: grid 1/2/3 列九宫格,72×72 评分环(中心分 text-2xl font-mono),
// 领域标题 text-base,下钻按钮 text-sm;<60 红警示边框 / <85 琥珀;条款清单展开 + 域点击平滑过滤漏洞列表。
// 得分口径沿用 R103-10①: 该域无违规占比(相对口径);下钻链契约(R103-7)保留。
import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { StatusBadge } from '@/components/ui';
import { ScoreRing, SEV_TONE } from './shared';
import type { CmRow } from './types';

export const MasvsSection: React.FC<{
 cm: { rows: CmRow[]; otherCount: number; total: number } | null;
 selected: number | null;
 cmFilter: string | null;
 onFilter: (name: string) => void;
 clearFilter: () => void;
 onDrill: (name: string) => void;
  secRef: React.RefObject<HTMLElement>;
}> = ({ cm, selected, cmFilter, onFilter, clearFilter, onDrill, secRef }) => {
  const [cmOpen, setCmOpen] = useState<string | null>(null);

  return (
    <section className="space-y-3" data-compliance-map ref={secRef}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-jz-text-primary">MASVS 合规图谱</span>
        <StatusBadge tone="info">违规计数口径: 规则卡实例数(与雷达一致)</StatusBadge>
        {cmFilter && (
          <button type="button" onClick={clearFilter} data-compliance-filter-active
 className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-neon-accent/15 text-neon-accent"
 title="点击清除域过滤">
            过滤: {cmFilter} ✕
          </button>
        )}
        <span className="flex-1" />
        <span className="text-xs text-jz-text-muted">会话: #{selected ?? '—'}</span>
      </div>

      {!cm ? (
        <div className="text-sm text-jz-text-muted px-4 py-3 rounded-2xl bg-jz-surface shadow-jz-card">
          {selected ? '加载中…' : '先在上方切换器选择任务,合规图谱按代表会话发现聚合'}
        </div>
      ) : cm.total === 0 ? (
        <div className="text-sm text-jz-text-muted px-4 py-3 rounded-2xl bg-jz-surface shadow-jz-card">
          该会话暂无漏洞发现,合规图谱空(全域 100% 无违规实例)。
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
 {cm.rows.map((r) => {
 const isOther = r.name === '其他';
 // 合规率真算: 全会话违规实例中非本域占比(无 MASVS 检查项目录,绝对合规率=挂账,脚注注明)
 const rate = cm.total > 0 ? Math.max(0, (1 - r.count / cm.total) * 100) : 100;
              const rateStr = rate.toFixed(1);
              const active = cmFilter === r.name;
              const warn = rate < 60 ? 'ring-1 ring-vuln-critical/50 bg-vuln-critical/5' : rate < 85 ? 'ring-1 ring-vuln-medium/40 bg-vuln-medium/5' : '';
              // 点状违规计数: 按严重级着色点(每级至多 3 点),溢出并入 +N;悬浮 title 为精确分档
              const dotSpec: Array<{ cls: string; n: number }> = [
                { cls: 'bg-vuln-critical', n: r.sev.critical || 0 },
                { cls: 'bg-vuln-high', n: r.sev.high || 0 },
                { cls: 'bg-vuln-medium', n: r.sev.medium || 0 },
                { cls: 'bg-vuln-low', n: r.sev.low || 0 },
              ];
              const dots: string[] = [];
              for (const d of dotSpec) for (let k = 0; k < Math.min(d.n, 3); k++) dots.push(d.cls);
 const dotTotal = Math.min(dots.length, 6);
 const overflow = r.count - dotTotal;
 const sevTip = ['critical', 'high', 'medium', 'low', 'info'].map((sv) => `${sv}:${r.sev[sv] || 0}`).join(' · ');
              const open = cmOpen === r.name;
              return (
                <div key={r.name} data-compliance-card={r.name}
 className={`relative rounded-2xl p-4 space-y-2 transition-all hover:-translate-y-0.5 ${active ? 'bg-neon-accent/5 shadow-[0_0_0_1.5px_rgb(var(--c-border-active)/0.4),0_0_16px_rgb(var(--c-border-active)/0.2)]' : `${warn || 'bg-jz-surface'} shadow-jz-card`}`}>
                  <button type="button"
 onClick={() => onFilter(r.name)}
 title={`${r.name} — 合规率 ${rateStr}%(口径见脚注) · ${sevTip}\n点击${active ? '取消' : ''}过滤下方漏洞列表`}
 className="w-full space-y-2 text-left">
                    <div className="relative mx-auto" data-compliance-gauge={r.name} style={{ width: 72, height: 72 }}>
                      <ScoreRing rate={rate} size={72} stroke={4.5}>
                        <span className="text-2xl font-bold font-mono tnum text-jz-text-primary">{rateStr}</span>
                      </ScoreRing>
                    </div>
                    <div className="text-base font-semibold text-jz-text-primary truncate text-center">{r.name}</div>
                    <div className="flex items-center justify-center gap-1.5 h-5">
                      {r.count === 0 ? (
                        <span className="text-sm text-vuln-safe">无违规</span>
                      ) : (
                        <>
                          <span className="flex items-center gap-0.5" title={sevTip}>
 {dots.slice(0, dotTotal).map((cls, k) => <span key={k} className={`w-1.5 h-1.5 rounded-full flex-none ${cls}`} />)}
                          </span>
                          <span className="font-mono text-sm tnum text-jz-text-muted">×{r.count}{overflow > 0 ? ` +${overflow}` : ''}</span>
                        </>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center justify-between px-0.5">
 {r.cards.length > 0 ? (
                      <button type="button" onClick={() => setCmOpen(open ? null : r.name)} data-compliance-terms={r.name}
 className="font-mono text-sm tnum text-jz-text-muted hover:text-jz-text-primary transition-colors"
 title={`条款清单 ${r.cards.length} 条`}>{open ? '收起' : `${r.cards.length}条`}</button>
                    ) : <span className="text-xs text-jz-text-muted/50">无条款</span>}
                    <button type="button" onClick={() => onDrill(r.name)} data-compliance-drill={r.name}
 className="inline-flex items-center gap-1 text-sm text-jz-text-muted hover:text-neon-accent transition-colors"
 title={isOther ? '下钻工作台(masvs 空)' : '下钻工作台(域过滤)'}>
                      <ExternalLink size={13} />下钻
                    </button>
                  </div>
                  {open && (
                    <div className="rounded-lg bg-jz-elevated/50 max-h-40 overflow-auto" data-compliance-terms-list={r.name}>
 {r.cards.map((c, i2) => (
                        <div key={i2} className="px-2 py-1 flex items-center gap-2 text-xs">
                          <StatusBadge tone={SEV_TONE(c.severity)}>{c.severity}</StatusBadge>
                          <span className="flex-1 truncate text-jz-text-secondary" title={c.title}>{c.title}</span>
                          <span className="font-mono tnum text-jz-text-muted">×{c.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="text-xs text-jz-text-muted" data-compliance-footnote>
 得分口径 = 该域无违规占比(全会话违规实例中非本域占比,相对口径,零发现域即 100%);平台无 MASVS 检查项目录,绝对合规率=挂账。点卡片平滑过滤下方漏洞明细,「下钻」跳漏洞列表(域过滤,未归属项目会话不可下钻);{cm.otherCount > 0 && <>「其他」卡={cm.otherCount} 条无标准域归属(masvs=__none__)。</>}{cm.otherCount === 0 && <>零「其他」残留。</>}合规率&lt;60 红 / &lt;85 琥珀警示边框=展示层阈值,非平台判级。
          </div>
        </div>
      )}
    </section>
  );
};
