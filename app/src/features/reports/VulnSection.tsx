// VulnSection.tsx — findings with their evidence. State filter, domain filter from the section above,
// local additions (import / manual, kept in page state only), and the follow-up link to the Agent page.
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, MessageSquare, Plus, X, ListChecks } from 'lucide-react';
import { Panel, Button, SeverityBadge, StatusBadge, CodePill, SegmentedControl, EmptyState, ErrorState, SkeletonLoader, Tag } from '@/components/ui';
import type { TabItem } from '@/components/ui';
import { SEV_WEIGHT, STATE_ORDER, STATE_CN, parseEvidence, sevLevel, BlockLabel } from './shared';
import { domainOf } from '@/features/pentest/masvsDomains';
import type { LocalVuln } from './types';

type StateKey = 'all' | 'confirmed' | 'pending' | 'excluded';
const STATE_HINT: Record<StateKey, string> = {
  all: '该会话的全部发现,含本地添加的条目',
  confirmed: '已确认成立,计入风险结论',
  pending: '已命中规则,等待人工复核',
  excluded: '经人工判定为误报或不适用',
};
const PRE = 'whitespace-pre-wrap break-all rounded-control bg-jz-surface p-2.5 font-mono text-meta text-jz-ink-2';

export const VulnSection: React.FC<{
  vm: { confirmed: any[]; pending: any[]; excluded: any[]; counts: Record<string, number> } | null;
  state: 'loading' | 'ok' | 'error';
  selected: number | null;
  cmFilter: string | null;
  clearCmFilter: () => void;
  sessions: any[];
  localVulns: LocalVuln[];
  onAddManual: () => void;
}> = ({ vm, state, selected, cmFilter, clearCmFilter, sessions, localVulns, onAddManual }) => {
  const [vmF, setVmF] = useState<StateKey>('all');
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
  const total = vm ? vm.confirmed.length + vm.pending.length + vm.excluded.length : 0;

  const stateItems: TabItem<StateKey>[] = vm ? (['all', 'confirmed', 'pending', 'excluded'] as const).map((k) => ({
    key: k, label: <span title={STATE_HINT[k]}>{STATE_CN[k]}</span>, count: k === 'all' ? total : vm[k].length, dataAttrs: { 'data-vuln-tab': k },
  })) : [];
  const sess = sessions.find((x) => x.id === selected);
  const tid = sess?.task_id;

  return (
    <Panel flush data-vuln-matrix title="发现明细"
      description={<>{selected ? `会话 #${selected}` : '会话的全部发现及其证据'}{vm && <> · 显示 {shownVm.length} / {rows.length} 条</>}{localVulns.length > 0 && <> · 其中 {localVulns.length} 条为本地添加</>}</>}
      actions={<Button variant="secondary" size="sm" icon={<Plus size={14} aria-hidden />} onClick={onAddManual} data-vuln-add-manual
        title="添加的发现只保存在当前页面,随导出文件一起保留">手动添加发现</Button>}>
      {vm && (
        <div className="flex flex-wrap items-center gap-3 border-b border-jz-border px-4 py-3">
          <div className="max-w-full overflow-x-auto"><SegmentedControl items={stateItems} value={vmF} onChange={setVmF} label="按状态筛选" /></div>
          {cmFilter && (
            <Button size="sm" variant="secondary" icon={<X size={14} aria-hidden />} onClick={clearCmFilter} data-vuln-filter-active title="清除域筛选">域: {cmFilter}</Button>
          )}
        </div>
      )}

      {!vm ? (
        !selected ? <EmptyState compact icon={ListChecks} title="没有可显示的会话" cause="发现明细来自任务的会话数据。" />
          : state === 'error' ? <ErrorState compact title="发现明细加载失败" message="服务端没有返回该会话的发现。" />
            : <div className="p-4"><SkeletonLoader variant="table" rows={5} /></div>
      ) : shownVm.length === 0 ? (
        <EmptyState compact icon={ListChecks} title={total === 0 ? '该会话没有发现' : '没有符合条件的发现'}
          cause={total === 0 ? '可以手动添加,或从文件导入。' : `状态为「${STATE_CN[vmF] || vmF}」${cmFilter ? `、域为「${cmFilter}」` : ''}的发现不存在。`} />
      ) : (
        <ul className="max-h-[38rem] divide-y divide-jz-border overflow-y-auto" data-vuln-list>
          {shownVm.map((f) => {
            const k = `${f.state}:${f.id}`;
            const open = vmOpen === k;
            const seg = open ? parseEvidence(f.evidence || '') : null;
            return (
              <li key={k} data-vuln-row={k}>
                <button type="button" aria-expanded={open}
                  className="flex min-h-jz-row w-full items-center gap-2 px-4 py-1.5 text-left transition-colors duration-hover hover:bg-jz-surface-2 max-[760px]:min-h-jz-touch"
                  onClick={() => setVmOpen(open ? null : k)}>
                  {open ? <ChevronDown size={14} className="flex-none text-jz-muted" aria-hidden /> : <ChevronRight size={14} className="flex-none text-jz-muted" aria-hidden />}
                  <SeverityBadge level={sevLevel(f.severity)} />
                  <span className="min-w-0 flex-1 truncate text-label font-medium text-jz-ink" title={f.title}>{f.title}</span>
                  {f.source === 'manual' && <Tag>手动添加</Tag>}
                  {f.source === 'import' && <Tag>导入</Tag>}
                  {vmF === 'all' && <span className="hidden text-meta text-jz-muted tablet:inline">{STATE_CN[f.state] || f.state}</span>}
                  {f.masvs && <span className="hidden tablet:inline-flex"><Tag mono>{f.masvs}</Tag></span>}
                </button>
                {open && seg && (
                  <div className="space-y-3 bg-jz-surface-2 px-4 py-3 pl-10" data-vuln-detail={k}>
                    <dl className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-meta text-jz-muted">
                      <div className="flex gap-1.5"><dt>规则</dt><dd className="text-jz-ink-2" title={f.rule_id ? undefined : '服务端没有返回规则编号'}>{f.rule_id || '—'}</dd></div>
                      <div className="flex gap-1.5"><dt>编号</dt><dd className="text-jz-ink-2">{f.id}</dd></div>
                      <div className="flex gap-1.5"><dt>阶段</dt><dd className="text-jz-ink-2">{f.phase || '—'}</dd></div>
                      <div className="flex gap-1.5"><dt>状态</dt><dd className="text-jz-ink-2">{STATE_CN[f.state] || f.state}{f.source ? `(${f.source === 'manual' ? '本地手动' : '本地导入'})` : ''}</dd></div>
                      {f.masvs && <div className="flex items-center gap-1.5 tablet:hidden"><dt>MASVS</dt><dd><CodePill value={f.masvs} maxW="max-w-[160px]" /></dd></div>}
                    </dl>
                    <div>
                      <BlockLabel>代码位置</BlockLabel>
                      {seg.stack.length
                        ? <pre className={PRE}>{seg.stack.map((l, j) => <span key={j} className={j === 0 ? 'text-jz-ink' : undefined}>{l + '\n'}</span>)}</pre>
                        : <p className="text-meta text-jz-muted">证据中没有「文件:行号」形式的定位。</p>}
                    </div>
                    <div>
                      <BlockLabel>请求与响应</BlockLabel>
                      {seg.traffic.length
                        ? <pre className={PRE}>{seg.traffic.join('\n')}</pre>
                        : <p className="text-meta text-jz-muted">证据中没有 HTTP 报文。</p>}
                    </div>
                    {f.repro && (
                      <div>
                        <BlockLabel>复现与修复建议</BlockLabel>
                        <pre className={PRE}>{f.repro}</pre>
                      </div>
                    )}
                    {seg.rest.length > 0 && (
                      <div>
                        <BlockLabel>其余证据原文</BlockLabel>
                        <pre className={PRE}>{seg.rest.join('\n')}</pre>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {tid ? (
                        <Button size="sm" variant="secondary" icon={<MessageSquare size={14} aria-hidden />} data-vuln-ask-ai
                          title={`带上任务 #${tid} 的上下文,在 Agent 中继续询问这条发现`}
                          onClick={() => {
                            try {
                              localStorage.setItem('ai_prefill', JSON.stringify({
                                label: '报告中心',
                                title: `追问: ${f.title}`.slice(0, 60),
                                sid: selected,
                                ts: Date.now(),
                              }));
                            } catch { /* storage unavailable: the link still opens */ }
                            window.location.hash = `/agent?task=${tid}`;
                          }}>在 Agent 中追问</Button>
                      ) : (
                        <StatusBadge tone="neutral" title="该会话没有关联的评估任务">无关联任务,不能在 Agent 中追问</StatusBadge>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {vm && rows.length > 200 && (
        <p className="border-t border-jz-border px-4 py-2 text-meta text-jz-muted">只显示前 200 条,共 {rows.length} 条。完整数据请导出 CSV 或证据包。</p>
      )}
      <p className="border-t border-jz-border px-4 py-2.5 text-meta text-jz-muted" data-vuln-footnote>
        证据按原文拆成代码位置、请求与响应、其余三部分,不做改写。服务端不提供 CVSS 评分和受影响组件,所以这里不显示。本地添加和导入的发现只存在于当前页面,导出后才会保留。
      </p>
    </Panel>
  );
};
