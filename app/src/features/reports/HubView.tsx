// HubView.tsx — 报告中心 Level 1 项目大厅: KPI 大卡 ×4 / 检索工具栏 / 任务卡网格 + 高密表格 /
// 分页器(12/24/48 + 页码跳转)/ 多选批量导出汇总 CSV。
import React, { useState } from 'react';
import {
  Search, LayoutGrid, Table2, ChevronLeft, ChevronRight, FileDown, Eye, ShieldAlert,
  ClipboardList, Gauge, FileOutput, Loader2,
} from 'lucide-react';
import { Button, StatusBadge, CodePill, Skeleton } from '@/components/ui';
import type { StatusTone } from '@/components/ui';
import { ScoreRing, Menu, menuItemCls } from './shared';
import type { HubEntry } from './types';
import { complianceScoreOf } from './types';

// 字号八档口径: 本文件 font 一律 11/12/13/14/16/20/24/28(text-[11px]/text-xs/text-[13px]/text-sm/text-base/text-xl/text-2xl/text-[28px])
const RISK_LABEL: Record<string, string> = { all: '全部', highrisk: '有高危', lowscore: '合规分<60' };
const SORT_LABEL: Record<string, string> = { new: '最新', risk: '风险最高', score: '合规分升序' };

export type HubState = {
  q: string;
  risk: 'all' | 'highrisk' | 'lowscore';
  sort: 'new' | 'risk' | 'score';
  view: 'cards' | 'table';
  page: number;
  pageSize: number;
  checked: Set<number>;
};

const MxChip: React.FC<{ tone: StatusTone; label: string; n: number | null | 'error' }> = ({ tone, label, n }) => (
  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-mono text-[11px] tnum ${
 n === 'error' ? 'bg-jz-elevated/60 text-jz-text-muted' : tone === 'critical' ? 'bg-vuln-critical/10 text-vuln-critical'
 : tone === 'medium' ? 'bg-vuln-medium/10 text-vuln-medium' : tone === 'low' ? 'bg-vuln-low/10 text-vuln-low' : 'bg-jz-elevated/60 text-jz-text-secondary'
 }`} title={`${label}: ${n === 'error' ? '无矩阵(未完成网关推导或未生成)' : n ?? '统计中'}`}>
    {n === 'error' ? '—' : n ?? '·'}{label}
  </span>
);

const KpiCard: React.FC<{ icon: React.ElementType; label: string; value: React.ReactNode; sub: React.ReactNode; title?: string }> =
 ({ icon: Icon, label, value, sub, title }) => (
    <div className="rounded-2xl bg-jz-surface shadow-jz-card p-5 space-y-1.5" data-hub-kpi={label}>
      <div className="flex items-center gap-2 text-sm text-jz-text-muted" title={title}>
        <Icon size={15} className="text-neon-accent flex-none" />
        <span>{label}</span>
      </div>
      <div className="text-2xl md:text-[28px] font-bold font-mono tnum text-jz-text-primary leading-none">{value}</div>
      <div className="text-xs text-jz-text-muted min-h-[16px]">{sub}</div>
    </div>
  );

export const HubView: React.FC<{
  loading: boolean;
  entries: HubEntry[];
  filtered: HubEntry[];
  paged: HubEntry[];
  kpi: { total: number; highRisk: number | null; avgScore: number | null; exportable: number; aggDone: number; aggTotal: number };
  hub: HubState;
  patch: (p: Partial<HubState>) => void;
 onOpen: (tid: number) => void;
 onExportOne: (tid: number) => void;
 onExportBatch: () => void;
 batchBusy: boolean;
}> = ({ loading, entries, filtered, paged, kpi, hub, patch, onOpen, onExportOne, onExportBatch, batchBusy }) => {
 const [jump, setJump] = useState('');
 const pages = Math.max(1, Math.ceil(filtered.length / hub.pageSize));
 const page = Math.min(hub.page, pages);
 const allChecked = paged.length > 0 && paged.every((e) => hub.checked.has(e.task.id));
  const aggRunning = kpi.aggDone < kpi.aggTotal;

 const toggleAll = () => {
 const next = new Set(hub.checked);
 if (allChecked) paged.forEach((e) => next.delete(e.task.id));
 else paged.forEach((e) => next.add(e.task.id));
 patch({ checked: next });
 };
 const toggleOne = (id: number) => {
    const next = new Set(hub.checked);
    if (next.has(id)) next.delete(id); else next.add(id);
    patch({ checked: next });
  };

  return (
    <div className="space-y-4" data-reports-hub>
      {/* KPI 大卡 ×4 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard icon={ClipboardList} label="已审计任务" value={kpi.total}
          sub={<span>口径: kind=audit 且 status=done</span>} />
        <KpiCard icon={ShieldAlert} label="累计高危" value={kpi.highRisk == null ? '—' : kpi.highRisk}
          title="口径: 各任务代表会话 report/summary.confirmed_high 之和(确认的 critical+high)"
          sub={aggRunning ? <span className="inline-flex items-center gap-1 text-neon-accent"><Loader2 size={11} className="animate-spin" />聚合中 {kpi.aggDone}/{kpi.aggTotal}</span> : <span>{kpi.aggTotal ? '关联会话任务聚合完成' : '暂无关联会话任务'}</span>} />
        <KpiCard icon={Gauge} label="平均 MASVS 分" value={kpi.avgScore == null ? '—' : kpi.avgScore}
          title="口径: 各任务合规分均值;合规分=100−risk_score 截断 0-100(平台无 MASVS 绝对分,挂账)"
          sub={aggRunning ? <span className="inline-flex items-center gap-1 text-neon-accent"><Loader2 size={11} className="animate-spin" />聚合中 {kpi.aggDone}/{kpi.aggTotal}</span> : <span>合规分=100−risk_score(挂账口径)</span>} />
        <KpiCard icon={FileOutput} label="可导出完整报告" value={kpi.exportable}
          title="口径: 关联活跃渗透会话的审计任务数(可一键导出 PDF/zip/CSV 全套);其余任务仍可导审计报告 md"
          sub={<span>关联活跃会话 · 全部任务仍可导报告文件</span>} />
      </div>

      {/* 检索工具栏 */}
      <div className="rounded-2xl bg-jz-surface shadow-jz-card p-3 space-y-3" data-hub-toolbar>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-jz-text-muted" />
            <input
 value={hub.q}
 onChange={(e) => patch({ q: e.target.value, page: 1 })}
 placeholder="搜索包名 / #任务ID / 应用名…"
 data-hub-search
 className="w-full h-11 pl-11 pr-4 rounded-xl bg-jz-elevated/60 border border-transparent text-base text-jz-text-primary placeholder:text-jz-text-muted focus:border-jz-active/50 outline-none"
 />
          </div>
          <div className="flex items-center rounded-xl bg-jz-elevated/50 p-1" data-hub-risk>
 {(['all', 'highrisk', 'lowscore'] as const).map((k) => (
              <button key={k} type="button" data-hub-risk-btn={k}
 title={k === 'highrisk' ? '有确认高危(confirmed_high>0)' : k === 'lowscore' ? '合规分<60(需聚合完成)' : '不过滤'}
 onClick={() => patch({ risk: k, page: 1 })}
 className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${hub.risk === k ? 'bg-neon-accent text-white shadow-neon-glow' : 'text-jz-text-muted hover:text-jz-text-primary'}`}>
                {RISK_LABEL[k]}
              </button>
            ))}
          </div>
          <Menu
            label={<span className="text-sm font-medium">{SORT_LABEL[hub.sort]}</span>}
 btnCls="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-jz-elevated/60 text-jz-text-primary hover:bg-jz-elevated"
 align="left" widthCls="w-44">
 {(close) => (
              <>
 {(['new', 'risk', 'score'] as const).map((k) => (
                  <button key={k} type="button" className={menuItemCls} data-hub-sort={k}
 onClick={() => { patch({ sort: k, page: 1 }); close(); }}>
                    {SORT_LABEL[k]}{hub.sort === k && <span className="ml-auto text-neon-accent">✓</span>}
                  </button>
                ))}
              </>
            )}
          </Menu>
          <div className="flex items-center rounded-xl bg-jz-elevated/50 p-1" data-hub-view-toggle>
 {(['cards', 'table'] as const).map((k) => (
              <button key={k} type="button" data-hub-view-btn={k} title={k === 'cards' ? '卡片网格' : '高密表格'}
 onClick={() => patch({ view: k })}
 className={`px-2.5 py-1.5 rounded-lg transition-colors ${hub.view === k ? 'bg-jz-surface shadow-jz-card text-neon-accent' : 'text-jz-text-muted hover:text-jz-text-primary'}`}>
                {k === 'cards' ? <LayoutGrid size={15} /> : <Table2 size={15} />}
              </button>
            ))}
          </div>
        </div>
        {/* 批量条 */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-jz-text-muted">
          <span className="tnum">共 {entries.length} 个审计任务 · 命中 {filtered.length}</span>
          <button type="button" onClick={toggleAll} data-hub-check-all className="text-neon-accent hover:underline">
            {allChecked ? '取消本页全选' : '本页全选'}
          </button>
 {hub.checked.size > 0 && (
            <>
              <span className="tnum text-jz-text-primary">已选 {hub.checked.size}</span>
              <Button variant="primary" onClick={onExportBatch} disabled={batchBusy} data-hub-batch-export>
                <FileDown size={13} />{batchBusy ? '聚合导出中…' : '导出汇总 CSV'}
              </Button>
              <button type="button" onClick={() => patch({ checked: new Set() })} className="hover:text-jz-text-primary">清空选择</button>
            </>
          )}
        </div>
      </div>

      {/* 主体: 卡片网格 / 高密表格 */}
      {loading && entries.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
 {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-jz-surface shadow-jz-card p-8 text-center" data-hub-empty>
          <div className="text-2xl opacity-30 mb-2"></div>
          <div className="text-sm text-jz-text-muted">{entries.length === 0 ? '暂无已完成审计任务' : '当前检索条件无匹配任务'}</div>
        </div>
      ) : hub.view === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4" data-hub-cards>
 {paged.map(({ task: t, agg }) => {
 const score = complianceScoreOf(agg?.summary);
 const s = agg?.summary;
 const mc = agg?.mx;
 const topDom = (agg?.domains?.rows || []).filter((d) => d.count > 0).sort((a, b) => b.count - a.count);
 const domTxt = topDom.length
 ? topDom.slice(0, 3).map((d) => `${d.name}×${d.count}`).join(' · ')
              : agg?.sid ? '无违规实例' : '无关联会话';
            return (
              <div key={t.id} data-hub-card={t.id}
 className="rounded-2xl bg-jz-surface shadow-jz-card p-4 space-y-2.5 transition-transform hover:-translate-y-0.5">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={hub.checked.has(t.id)} onChange={() => toggleOne(t.id)}
 data-hub-check={t.id} title="选择(批量导出)"
 className="w-3.5 h-3.5 rounded accent-neon-accent cursor-pointer flex-none" />
                  <span className="font-mono text-sm font-bold text-neon-accent tnum">#{t.id}</span>
                  {t.packer && t.packer !== 'none' && <StatusBadge tone="medium" title="壳类型">{t.packer}</StatusBadge>}
                  <span className="flex-1" />
                  <span className="text-[11px] text-jz-text-muted font-mono tnum" title="任务更新时间">{String(t.updated_at || '').slice(5, 16).replace('T', ' ')}</span>
                </div>
                <div className="text-sm font-semibold text-jz-text-primary truncate" title={t.app_name || t.package || ''}>
                  {t.app_name || t.package || `任务 #${t.id}`}
                </div>
                <CodePill value={t.package || `任务#${t.id}未返回包名`} textCls="text-sm" maxW="max-w-full" />
                <div className="flex items-center gap-3">
                  <ScoreRing rate={score ?? 0} size={48} stroke={4.5}>
                    <span className={`font-mono font-bold tnum text-sm ${score == null ? 'text-jz-text-muted' : 'text-jz-text-primary'}`}>
                      {score ?? '—'}
                    </span>
                  </ScoreRing>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {s ? <StatusBadge tone={s.risk_level === '严重' || s.risk_level === '高' ? 'critical' : s.risk_level === '中' ? 'medium' : 'low'}>风险{s.risk_level}</StatusBadge> : <StatusBadge tone="info">{agg?.loading ? '统计中…' : '无会话数据'}</StatusBadge>}
                      <span className="font-mono text-[11px] tnum text-jz-text-muted">高危 {s ? s.confirmed_high : '—'}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <MxChip tone="critical" label="红" n={mc == null ? null : mc === 'error' ? 'error' : mc.red} />
                      <MxChip tone="medium" label="黄" n={mc == null ? null : mc === 'error' ? 'error' : mc.yellow} />
                      <MxChip tone="low" label="绿" n={mc == null ? null : mc === 'error' ? 'error' : mc.green} />
                      <MxChip tone="info" label="灰" n={mc == null ? null : mc === 'error' ? 'error' : mc.gray} />
                    </div>
                  </div>
                </div>
                <div className="text-xs text-jz-text-secondary truncate" title={`域违规摘要: ${domTxt}`} data-hub-domains={t.id}>
                  域违规: {domTxt}
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <button type="button" onClick={() => onExportOne(t.id)} data-hub-export-one={t.id}
 title="快速导出该任务汇总 CSV(实时聚合代表会话数据)"
 className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-jz-elevated/60 hover:bg-neon-accent/10 text-xs text-jz-text-primary transition-colors">
                    <FileDown size={12} className="text-neon-accent" />快速导出 CSV
                  </button>
                  <button type="button" onClick={() => onOpen(t.id)} data-hub-open={t.id}
 className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neon-accent/15 hover:bg-neon-accent/25 text-xs text-neon-accent font-medium transition-colors">
                    <Eye size={12} />查看详细报告
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="divided-card-list overflow-x-auto" data-hub-table>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-jz-text-muted">
                <th className="px-3 py-2.5 text-left w-8"><input type="checkbox" checked={allChecked} onChange={toggleAll} className="w-3.5 h-3.5 accent-neon-accent cursor-pointer" /></th>
                <th className="px-2 py-2.5 text-left">任务</th>
                <th className="px-2 py-2.5 text-left">应用 / 包名</th>
                <th className="px-2 py-2.5 text-left">壳</th>
                <th className="px-2 py-2.5 text-right">合规分</th>
                <th className="px-2 py-2.5 text-right">高危</th>
                <th className="px-2 py-2.5 text-right">确认/待复核/排除</th>
                <th className="px-2 py-2.5 text-center">红/黄/绿/灰</th>
                <th className="px-2 py-2.5 text-left">域违规</th>
                <th className="px-2 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
 {paged.map(({ task: t, agg }) => {
 const score = complianceScoreOf(agg?.summary);
 const s = agg?.summary;
 const mc = agg?.mx;
 const counts = mc && mc !== 'error' ? mc : null;
 const topDom = (agg?.domains?.rows || []).filter((d) => d.count > 0).sort((a, b) => b.count - a.count);
                return (
                  <tr key={t.id} data-hub-row={t.id} className="hover:bg-jz-elevated/30 transition-colors">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={hub.checked.has(t.id)} onChange={() => toggleOne(t.id)} className="w-3.5 h-3.5 accent-neon-accent cursor-pointer" />
                    </td>
                    <td className="px-2 py-2 font-mono text-neon-accent tnum whitespace-nowrap">#{t.id}</td>
                    <td className="px-2 py-2 max-w-[260px]">
                      <div className="truncate text-jz-text-primary" title={t.app_name || ''}>{t.app_name || '—'}</div>
                      <div className="font-mono text-[11px] text-jz-text-muted truncate" title={t.package}>{t.package || '—'}</div>
                    </td>
                    <td className="px-2 py-2 text-jz-text-secondary whitespace-nowrap">{t.packer && t.packer !== 'none' ? t.packer : '无'}</td>
                    <td className={`px-2 py-2 text-right font-mono tnum ${score == null ? 'text-jz-text-muted' : score < 60 ? 'text-vuln-critical' : score < 85 ? 'text-vuln-medium' : 'text-vuln-safe'}`}>
                      {score ?? '—'}
                    </td>
                    <td className={`px-2 py-2 text-right font-mono tnum ${s?.confirmed_high ? 'text-vuln-critical font-semibold' : 'text-jz-text-muted'}`}>{s ? s.confirmed_high : '—'}</td>
                    <td className="px-2 py-2 text-right font-mono tnum text-jz-text-secondary whitespace-nowrap">
                      {s ? `${s.counts?.confirmed ?? 0} / ${s.counts?.pending ?? 0} / ${s.counts?.excluded ?? 0}` : '—'}
                    </td>
                    <td className="px-2 py-2 text-center font-mono tnum whitespace-nowrap">
                      {counts ? (
                        <><span className="text-vuln-critical">{counts.red}</span>/<span className="text-vuln-medium">{counts.yellow}</span>/<span className="text-vuln-safe">{counts.green}</span>/<span className="text-jz-text-muted">{counts.gray}</span></>
                      ) : mc === 'error' ? <span className="text-jz-text-muted">无矩阵</span> : <span className="text-jz-text-muted">…</span>}
                    </td>
                    <td className="px-2 py-2 max-w-[180px] truncate text-jz-text-secondary" title={topDom.map((d) => `${d.name}×${d.count}`).join(' · ')}>
 {topDom.length ? topDom.slice(0, 3).map((d) => `${d.name}×${d.count}`).join(' ') : agg?.sid ? '无违规' : '—'}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <button type="button" onClick={() => onExportOne(t.id)} title="快速导出该任务汇总 CSV" className="p-1 rounded hover:bg-jz-elevated text-jz-text-muted hover:text-neon-accent"><FileDown size={13} /></button>
                      <button type="button" onClick={() => onOpen(t.id)} title="查看详细报告" className="p-1 rounded hover:bg-jz-elevated text-jz-text-muted hover:text-neon-accent"><Eye size={13} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
 )}

 {/* 分页器 */}
 {filtered.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-xs text-jz-text-muted" data-hub-pager>
          <span className="tnum">第 {page}/{pages} 页 · 共 {filtered.length} 条</span>
          <Menu
            label={<span className="font-mono tnum">{hub.pageSize}/页</span>}
 btnCls="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-jz-elevated/60 text-jz-text-primary hover:bg-jz-elevated"
 align="left" widthCls="w-32">
 {(close) => (
              <> {[12, 24, 48].map((n) => (
                <button key={n} type="button" className={menuItemCls} data-hub-pagesize={n}
 onClick={() => { patch({ pageSize: n, page: 1 }); close(); }}>
                  每页 {n}{hub.pageSize === n && <span className="ml-auto text-neon-accent">✓</span>}
                </button>))}</>
            )}
          </Menu>
          <div className="flex items-center gap-1">
            <button type="button" disabled={page <= 1} onClick={() => patch({ page: page - 1 })} data-hub-page-prev
 className="p-1.5 rounded-lg bg-jz-elevated/60 disabled:opacity-40 hover:bg-jz-elevated"><ChevronLeft size={13} /></button>
            <span className="px-1 font-mono tnum">{page}</span>
            <button type="button" disabled={page >= pages} onClick={() => patch({ page: page + 1 })} data-hub-page-next
 className="p-1.5 rounded-lg bg-jz-elevated/60 disabled:opacity-40 hover:bg-jz-elevated"><ChevronRight size={13} /></button>
          </div>
          <span className="inline-flex items-center gap-1">
            跳至
            <input value={jump} onChange={(e) => setJump(e.target.value.replace(/\D/g, ''))}
 onKeyDown={(e) => { if (e.key === 'Enter') { const p = Number(jump); if (p >= 1 && p <= pages) patch({ page: p }); setJump(''); } }}
 placeholder="页码" data-hub-page-jump
 className="w-14 h-7 px-2 rounded-lg bg-jz-elevated/60 text-center font-mono tnum text-jz-text-primary outline-none focus:border-jz-active/50 border border-transparent" />
            页
          </span>
        </div>
      )}
    </div>
  );
};
