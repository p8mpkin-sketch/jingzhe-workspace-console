// VulnSection.tsx — 漏洞明细(证据链三段式,自 R103-10②/R104-2③ 迁移)+ V4 增强:
// 胶囊式三态 Tab(动态计数)/ 本地合并层(导入+手动新增,纯前端暂存如实标注)/ 在 AI 助手追问(R598 契约保留)。
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, MessageSquare, Plus } from 'lucide-react';
import { StatusBadge, CodePill } from '@/components/ui';
import { SEV_TONE, SEV_WEIGHT, STATE_ORDER, STATE_CN, parseEvidence } from './shared';
import { domainOf } from '@/features/pentest/masvsDomains';
import type { LocalVuln } from './types';

export const VulnSection: React.FC<{
  vm: { confirmed: any[]; pending: any[]; excluded: any[]; counts: Record<string, number> } | null;
 selected: number | null;
 cmFilter: string | null;
 clearCmFilter: () => void;
 sessions: any[];
 localVulns: LocalVuln[];
 onAddManual: () => void;
  secRef: React.RefObject<HTMLElement>;
}> = ({ vm, selected, cmFilter, clearCmFilter, sessions, localVulns, onAddManual, secRef }) => {
  const [vmF, setVmF] = useState<'all' | 'confirmed' | 'pending' | 'excluded'>('all');
  const [vmOpen, setVmOpen] = useState<string | null>(null);

 const inFilter = (f: any) => {
 if (vmF !== 'all' && f.state !== vmF) return false;
 if (cmFilter) {
 const dom = domainOf(f.masvs || '');
 if ((cmFilter === '其他' ? dom !== null : dom?.name !== cmFilter)) return false;
 }
 return true;
 };

 const rows = vm
 ? ([...vm.confirmed, ...vm.pending, ...vm.excluded] as any[])
 .filter(inFilter)
 .sort((a, b) => (SEV_WEIGHT[a.severity] ?? 9) - (SEV_WEIGHT[b.severity] ?? 9)
        || (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9)
        || String(a.id).localeCompare(String(b.id)))
    : [];
  const shownVm = rows.slice(0, 200);

  const STATE_TABS: Array<{ key: 'all' | 'confirmed' | 'pending' | 'excluded'; label: string; tone: ReturnType<typeof SEV_TONE>; n: number; caliber: string }> = vm ? [
    { key: 'all', label: '全部', tone: 'info', n: vm.confirmed.length + vm.pending.length + vm.excluded.length, caliber: '统计口径: 该会话全部漏洞条目数(confirmed+pending+excluded+本地合并层,实例级)' },
    { key: 'confirmed', label: '确认', tone: 'low', n: vm.confirmed.length, caliber: '统计口径: 确认成立(含本地导入/手动新增,实例级,计入风险结论)' },
    { key: 'pending', label: '待复核', tone: 'medium', n: vm.pending.length, caliber: '统计口径: 已触发规则等待人工复核的漏洞条目数(不计入确认结论)' },
    { key: 'excluded', label: '已排除', tone: 'info', n: vm.excluded.length, caliber: '统计口径: 经人工判定误报/不适用而被排除的条目数(不计入风险合计)' },
  ] : [];

  return (
    <section className="space-y-2" data-vuln-matrix ref={secRef}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-jz-text-primary">漏洞明细(证据链)</span>
 {STATE_TABS.map((s) => (
          <button key={s.key} type="button" onClick={() => setVmF(s.key)} data-vuln-tab={s.key}
 title={s.caliber}
 className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${vmF === s.key
 ? 'bg-neon-accent/15 text-neon-accent ring-1 ring-jz-active/50'
 : 'text-jz-text-muted hover:text-jz-text-primary hover:bg-jz-elevated/50'}`}>
            {s.label} <span className="font-mono tnum">{s.n}</span>
          </button>
        ))}
        {cmFilter && (
          <button type="button" onClick={clearCmFilter} data-vuln-filter-active
 className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-neon-accent/15 text-neon-accent"
 title="点击清除域过滤(来自合规图谱卡点击)">
            域: {cmFilter} ✕
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={onAddManual} data-vuln-add-manual
 title="手动新增漏洞(纯前端暂存入本地合并层,可随 CSV/JSON 导出持久;不写后端)"
 className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-jz-elevated/60 hover:bg-neon-accent/10 text-xs font-medium text-jz-text-primary transition-colors">
          <Plus size={13} className="text-neon-accent" />手动新增漏洞
        </button>
 {localVulns.length > 0 && (
          <StatusBadge tone="custom" className="bg-vuln-low/10 text-vuln-low" title="本地合并层条数(导入+手动新增;仅当前页面状态,导出即持久)">
            本地 {localVulns.length}
          </StatusBadge>
        )}
        <span className="text-xs text-jz-text-muted tnum">会话: #{selected ?? '—'} · 屏显 {shownVm.length}/{rows.length}</span>
      </div>

      {!vm ? (
        <div className="text-sm text-jz-text-muted px-4 py-3 rounded-2xl bg-jz-surface shadow-jz-card">
          {selected ? '加载中…' : '先在上方切换器选择任务'}
        </div>
      ) : shownVm.length === 0 ? (
        <div className="text-sm text-jz-text-muted px-4 py-3 rounded-2xl bg-jz-elevated">
          当前过滤条件({STATE_CN[vmF] || vmF}{cmFilter ? ` · 域=${cmFilter}` : ''})无匹配发现
        </div>
      ) : (
        <div className="divided-card-list max-h-[620px] overflow-y-auto" data-vuln-list>
 {shownVm.map((f) => {
            const k = `${f.state}:${f.id}`;
            const open = vmOpen === k;
            const seg = parseEvidence(f.evidence || '');
            return (
              <div key={k} data-vuln-row={k}>
                <button type="button"
 className="w-full min-h-[40px] py-1 px-3 flex items-center gap-2 text-left hover:bg-jz-elevated/30 transition-colors"
 onClick={() => setVmOpen(open ? null : k)}>
                  {open ? <ChevronDown size={14} className="flex-none text-jz-text-muted" /> : <ChevronRight size={14} className="flex-none text-jz-text-muted" />}
                  <StatusBadge tone={SEV_TONE(f.severity)}>{f.severity}</StatusBadge>
                  <span className="flex-1 min-w-0 truncate text-sm font-semibold text-jz-text-primary" title={f.title}>{f.title}</span>
                  {f.source === 'manual' && <StatusBadge tone="custom" className="bg-neon-accent/15 text-neon-accent">手动新增</StatusBadge>}
                  {f.source === 'import' && <StatusBadge tone="custom" className="bg-vuln-low/10 text-vuln-low">导入</StatusBadge>}
                  {f.masvs && <CodePill value={f.masvs} maxW="max-w-[120px]" />}
                </button>
                {open && (
                  <div className="px-3 pb-3" data-vuln-detail={k}>
                    <div className="bg-jz-elevated rounded-lg p-3 space-y-2 text-xs">
                      <div className="flex items-center gap-2 flex-wrap font-mono text-jz-text-muted">
                        <span title={f.rule_id ? '规则号' : '后端 rule_id 现返回空串(指纹 id 为准)'}>rule_id: {f.rule_id || '—'}</span>
                        <span>·</span><span title="发现指纹 id">id: {f.id}</span>
                        <span>·</span><span>phase: {f.phase || '—'}</span>
                        <span>·</span><span>state: {f.state}{f.source ? `(${f.source === 'manual' ? '本地手动' : '本地导入'})` : ''}</span>
                      </div>
                      {/* ① 代码调用栈行号: evidence 中 文件:行号 定位行+随行代码(既有字段如实分桶) */}
                      <div>
                        <div className="text-jz-text-secondary font-semibold mb-0.5">代码调用栈行号</div>
                        {seg.stack.length ? (
                          <pre className="whitespace-pre-wrap break-all font-mono leading-4">
 {seg.stack.map((l, j) => (
                              <span key={j} className={j === 0 ? 'text-jz-text-primary' : 'text-jz-text-secondary'}>{l + '\n'}</span>
                            ))}
                          </pre>
                        ) : (
                          <div className="text-jz-text-muted">该证据维度暂无数据</div>
                        )}
                      </div>
                      {/* ② 动态报文: evidence 中 HTTP 请求/响应标记行(既有字段如实分桶) */}
                      <div>
                        <div className="text-jz-text-secondary font-semibold mb-0.5">动态报文</div>
                        {seg.traffic.length ? (
                          <pre className="whitespace-pre-wrap break-all font-mono leading-4 text-jz-text-secondary">{seg.traffic.join('\n')}</pre>
                        ) : (
                          <div className="text-jz-text-muted">该证据维度暂无数据</div>
                        )}
                      </div>
                      {/* ③ AI 因果链: 后端无独立 AI 生成字段——诚实标注,不编造;repro 字段如实另列 */}
                      <div>
                        <div className="text-jz-text-secondary font-semibold mb-0.5">AI 因果链</div>
                        <div className="text-jz-text-muted">该证据维度暂无数据(后端无独立 AI 因果链字段;evidence/repro 为规则引擎原始输出,如实呈现)</div>
                        {f.repro && (
                          <div className="pt-1">
                            <div className="text-jz-text-muted mb-0.5">复现/修复建议 · repro</div>
                            <pre className="whitespace-pre-wrap break-all font-mono leading-4 text-jz-text-secondary">{f.repro}</pre>
                          </div>
                        )}
                      </div>
 {seg.rest.length > 0 && (
                        <div>
                          <div className="text-jz-text-secondary font-semibold mb-0.5">证据原文(其余)</div>
                          <pre className="whitespace-pre-wrap break-all font-mono leading-4 text-jz-text-muted">{seg.rest.join('\n')}</pre>
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        <button type="button" disabled
 title="生成修复补丁——后端无 AI 补丁生成能力,挂账(R104 挂账区)"
 className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-jz-elevated/50 text-jz-text-muted opacity-50 cursor-not-allowed">
                          <Wrench size={11} />生成修复补丁
                        </button>
 {/* R598(方案5.1③ 联动): 在 AI 助手追问此发现——经既有 ?task= 审计追问链(R538/R543 编排已通)
 + ai_prefill 消费链(问题预填),会话有 task_id 才可用(无关联如实标注) */}
 {(() => {
 const sess = sessions.find((x) => x.id === selected);
                          const tid = sess?.task_id;
                          if (!tid) return (
                            <span className="text-xs text-jz-text-muted" title="该会话无关联审计任务(task_id 缺失),AI 追问链不可用=诚实标注">无关联任务,AI 追问不可用</span>
                          );
                          return (
                            <button type="button" data-vuln-ask-ai
 title={`带任务 #${tid} 上下文在 AI 助手追问此发现(经 ?task= 审计追问链,问题预填)`}
 className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-neon-accent/15 text-neon-accent hover:bg-neon-accent/25 transition-colors"
 onClick={() => {
 try {
 localStorage.setItem('ai_prefill', JSON.stringify({
 label: '报告中心',
 title: `追问: ${f.title}`.slice(0, 60),
 sid: selected,
 ts: Date.now(),
 }));
 } catch { /* 如实忽略 */ }
 window.location.hash = `/agent?task=${tid}`;
 }}>
                              <MessageSquare size={11} /> 在 AI 助手追问
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
 )}
 {vm && rows.length > 200 && (
        <div className="text-xs text-jz-text-muted">(仅显示前 200 行,共 {rows.length} 行;完整数据见 JSON 证据包/CSV 导出)</div>
      )}
      <div className="text-xs text-jz-text-muted" data-vuln-footnote>
        CVSS 评分/受影响组件:后端无字段,挂账不显(零假字段);masvs 列承载 MASVS/CWE 编号(rule_id 后端现返回空串,发现以指纹 id 为准);证据三段式=evidence 既有字段如实分桶,无该维度诚实标注;本地合并层(导入/手动新增)仅存在于当前页面状态、零后端写入,导出 CSV/JSON 即持久。
      </div>
    </section>
  );
};
