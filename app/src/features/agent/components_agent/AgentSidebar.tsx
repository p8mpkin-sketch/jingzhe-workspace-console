import React, { useMemo, useState } from 'react';
import { pressable } from '@/components/ui';
import { Bot, Check, CheckSquare, ChevronDown, ChevronRight, MessageSquarePlus, Search, Trash2 } from 'lucide-react';
import type { AgentSession } from '../types';
import { sessionMeta } from '../model/sessionMeta';

const fmt = (ts?: number) => {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
};
const dayKey = (ts?: number) => (ts ? new Date(ts * 1000).toDateString() : '');
const groupLabel = (ts?: number) => {
  if (!ts) return '更早';
  const d = new Date(ts * 1000);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((today - day) / 86400000);
  if (diff <= 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff < 7) return '本周';
  return '更早';
};

const statusLabel = (s: AgentSession) => {
  if (s.status === 'done') return '已完成';
  if (s.status === 'idle') return '待继续';
  if (s.status === 'running') return '执行中';
  return s.status || 'idle';
};
const statusTone = (s: AgentSession) => (
  s.status === 'done' ? 'bg-jz-teal' : s.status === 'running' ? 'bg-jz-brand' : 'bg-jz-muted/40'
);
const statusBar = (s: AgentSession) => (
  s.status === 'done' ? 'bg-jz-teal/70' : s.status === 'running' ? 'bg-jz-brand/80' : 'bg-jz-muted/30'
);
const statusPill = (s: AgentSession) => (
  s.status === 'done'
    ? 'bg-jz-teal/10 text-jz-teal'
    : s.status === 'running'
      ? 'bg-jz-brand/10 text-jz-brand'
      : 'bg-jz-muted/10 text-jz-muted'
);

export const AgentSidebar: React.FC<{
  sessions: AgentSession[];
  current: string;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onBatchDelete: (ids: string[]) => void;
  className?: string;
}> = ({ sessions, current, onNew, onSelect, onDelete, onBatchDelete, className = '' }) => {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'tasks' | 'tests'>('tasks');
  const [groupBy, setGroupBy] = useState<'time' | 'task'>('time');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [onlyRisk, setOnlyRisk] = useState(false);
  const [manage, setManage] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'recent' | 'risk'>('recent');
  const real = sessions.filter((s) => sessionMeta(s).kind === 'task');
  const tests = sessions.filter((s) => sessionMeta(s).kind !== 'task');
  const basePool = q.trim() ? sessions : (tab === 'tests' ? tests : real);
  let pool = onlyOpen ? basePool.filter((s) => s.status !== 'done') : basePool;
  if (onlyRisk) pool = pool.filter((s) => !!s.risk && (s.risk.critical > 0 || s.risk.high > 0));
  const visible = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return pool;
    return pool.filter((s) => [s.title, s.id, s.status, s.task_id, s.preview]
      .some((v) => String(v || '').toLowerCase().includes(kw)));
  }, [pool, q]);
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, { key: string; label: string; items: AgentSession[]; risk?: AgentSession['risk'] }>();
    for (const s of visible) {
      const key = groupBy === 'task'
        ? (s.task_id != null ? `task-${s.task_id}` : 'unassigned')
        : dayKey(s.updated_at);
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: groupBy === 'task'
            ? (s.task_id != null ? `任务 #${s.task_id}` : '未关联任务')
            : groupLabel(s.updated_at),
          items: [],
          risk: s.risk,
        });
        order.push(key);
      }
      map.get(key)!.items.push(s);
    }
    const arr = order.map((k) => map.get(k)!);
    if (groupBy === 'task' && sortBy === 'risk') {
      arr.sort((a, b) => {
        const score = (r?: AgentSession['risk']) => (r ? r.critical * 1000 + r.high * 100 + r.medium * 10 + r.low : 0);
        return score(b.risk) - score(a.risk);
      });
    }
    return arr;
  }, [visible, groupBy, sortBy]);

  return (
    <div className={`w-[248px] flex-none bg-jz-surface-2/70 px-2.5 py-3 overflow-auto flex flex-col ${className}`} data-agent-sidebar>
      <div className="flex items-center gap-1.5 px-1 mb-2.5">
        <span className="w-6 h-6 rounded-control bg-jz-brand grid place-items-center text-jz-on-brand shadow-card">
          <Bot size={13} />
        </span>
        <div className="min-w-0">
          <div className="text-meta font-semibold text-jz-ink leading-4">Agent 工作台</div>
          <div className="text-meta text-jz-muted leading-4">审计任务与测试轨迹</div>
        </div>
        <button onClick={() => { setManage((v) => !v); setSelected(new Set()); }} data-agent-manage={manage ? '1' : '0'}
          title={manage ? '退出批量管理' : '批量管理会话'}
          className={`ml-auto w-6 h-6 rounded-control grid place-items-center ${manage ? 'bg-jz-brand/15 text-jz-brand' : 'text-jz-muted hover:text-jz-ink hover:bg-jz-surface/60'}`}>
          <CheckSquare size={13} />
        </button>
        <span className="text-meta font-mono text-jz-muted">{real.length}/{tests.length}</span>
      </div>

      <button onClick={onNew} data-agent-new
        className="w-full flex items-center justify-center gap-1.5 mb-2.5 px-2 py-2 rounded-card bg-jz-brand text-jz-on-brand text-meta font-semibold shadow-card hover:opacity-90 transition-opacity">
        <MessageSquarePlus size={14} /> 新建 Agent 会话
      </button>

      <div className="relative mb-2">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-jz-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} data-agent-search
          placeholder="搜索会话 / 标题 / 任务"
          className="w-full pl-8 pr-2.5 py-1.5 rounded-card bg-jz-surface/70 border border-jz-border/40 text-meta text-jz-ink placeholder:text-jz-muted outline-none focus:ring-1 focus:ring-jz-brand/40" />
      </div>

      <div className="flex items-center gap-0.5 mb-2 p-0.5 rounded-card bg-jz-surface/70 border border-jz-border/40" data-agent-session-tabs>
        <button onClick={() => setTab('tasks')} data-agent-tab="tasks"
          className={`flex-1 px-2 py-1 rounded-control text-meta font-semibold transition-colors ${tab === 'tasks' ? 'bg-jz-surface text-jz-ink shadow-card' : 'text-jz-muted hover:text-jz-ink-2'}`}>
          任务 <span className="font-mono opacity-60">{real.length}</span>
        </button>
        <button onClick={() => setTab('tests')} data-agent-tab="tests"
          className={`flex-1 px-2 py-1 rounded-control text-meta font-semibold transition-colors ${tab === 'tests' ? 'bg-jz-surface text-jz-ink shadow-card' : 'text-jz-muted hover:text-jz-ink-2'}`}>
          测试 <span className="font-mono opacity-60">{tests.length}</span>
        </button>
      </div>

      <div className="mb-2 space-y-1 px-1 text-meta text-jz-muted" data-agent-group-switch>
        <div className="flex items-center gap-1">
          <span className="w-8 flex-none">分组</span>
          <button type="button" onClick={() => setGroupBy('time')} data-agent-group-time aria-pressed={groupBy === 'time'}
            className={`whitespace-nowrap rounded-control px-2 py-0.5 ${groupBy === 'time' ? 'bg-jz-surface text-jz-ink' : 'hover:text-jz-ink-2'}`}>按时间</button>
          <button type="button" onClick={() => setGroupBy('task')} data-agent-group-task aria-pressed={groupBy === 'task'}
            className={`whitespace-nowrap rounded-control px-2 py-0.5 ${groupBy === 'task' ? 'bg-jz-surface text-jz-ink' : 'hover:text-jz-ink-2'}`}>按任务</button>
          <button type="button" onClick={() => setSortBy('risk')} data-agent-sort-risk aria-pressed={sortBy === 'risk'} title="按风险排序"
            className={`whitespace-nowrap rounded-control px-2 py-0.5 ${sortBy === 'risk' ? 'bg-jz-surface text-jz-ink' : 'hover:text-jz-ink-2'}`}>按风险</button>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-8 flex-none">筛选</span>
          <button type="button" onClick={() => setOnlyRisk((v) => !v)} data-agent-only-risk aria-pressed={onlyRisk}
            className={`whitespace-nowrap rounded-control px-2 py-0.5 ${onlyRisk ? 'bg-jz-surface text-jz-red' : 'hover:text-jz-ink-2'}`}>只看高危</button>
          <button type="button" onClick={() => setOnlyOpen((v) => !v)} data-agent-only-open aria-pressed={onlyOpen}
            className={`whitespace-nowrap rounded-control px-2 py-0.5 ${onlyOpen ? 'bg-jz-surface text-jz-brand' : 'hover:text-jz-ink-2'}`}>只看未完成</button>
        </div>
      </div>

      <div className="space-y-3" data-agent-task-tree={groupBy === 'task' ? '1' : '0'}>
        {groups.map((g) => {
          const isTask = groupBy === 'task';
          const closed = isTask && collapsed.has(g.key);
          const done = g.items.filter((x) => x.status === 'done').length;
          const running = g.items.filter((x) => x.status === 'running').length;
          const idle = g.items.length - done - running;
          return (
            <section key={g.key} data-agent-session-group={g.label} data-agent-task-group={isTask ? g.label : undefined}>
              {isTask ? (
                <button onClick={() => setCollapsed((prev) => {
                  const n = new Set(prev);
                  if (n.has(g.key)) n.delete(g.key); else n.add(g.key);
                  return n;
                })} data-agent-task-toggle={g.key}
                  className="w-full flex items-center gap-1.5 px-1 mb-1 text-left group/task">
                  {closed ? <ChevronRight size={11} className="text-jz-muted" /> : <ChevronDown size={11} className="text-jz-muted" />}
                  <span className="text-meta font-mono text-jz-muted">{g.label}</span>
                  <span className="flex-1 border-t border-jz-border/25" />
                  {!!g.risk?.total && (
                    <span className="text-meta font-mono text-jz-sev-critical/80 whitespace-nowrap" data-agent-task-risk
                      title={`${g.risk.critical} critical / ${g.risk.high} high / ${g.risk.medium} medium`}>
                      {!!g.risk.critical && `${g.risk.critical}C `}{!!g.risk.high && `${g.risk.high}H`}
                    </span>
                  )}
                  <span className="text-meta font-mono text-jz-muted whitespace-nowrap" data-agent-task-summary title={`${done} 完成 / ${running} 进行 / ${idle} 待继续`}>
                    {done} 完成{!!running ? ` · ${running} 进行` : (!!idle ? ` · ${idle} 待继续` : '')}
                  </span>
                </button>
              ) : (
                <div className="flex items-center gap-2 px-1 mb-1">
                  <span className="text-meta font-mono text-jz-muted">{g.label}</span>
                  <span className="flex-1 border-t border-jz-border/30" />
                  <span className="text-meta font-mono text-jz-muted">{g.items.length}</span>
                </div>
              )}
              {!closed && (
                <div className={isTask ? 'ml-2 pl-2 border-l border-jz-border/25' : ''}>
                  {g.items.map((s, si) => {
                    const active = current === s.id;
                    return (
                      <div key={s.id} data-agent-session-item={s.id} data-agent-selected={selected.has(s.id) ? '1' : '0'}
                        onClick={() => { if (manage) setSelected((prev) => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; }); else onSelect(s.id); }} {...pressable()} aria-current={active ? 'true' : undefined} aria-pressed={manage ? selected.has(s.id) : undefined}
                        data-agent-session-index={si + 1}
                        className={`group relative flex items-start gap-2 pl-3 pr-2.5 py-2.5 mb-1.5 rounded-card cursor-pointer transition-all border
                          ${selected.has(s.id) ? 'bg-jz-brand/10 border-jz-brand/45' : active ? 'bg-jz-surface border-jz-brand/55 shadow-card' : 'bg-jz-surface/45 border-jz-border/25 hover:bg-jz-surface/80 hover:border-jz-border/55'}`}>
                        <span className={`absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-pill ${statusBar(s)}`} />
                        {manage && (
                          <span className={`flex-none mt-0.5 w-4 h-4 rounded-control border grid place-items-center ${selected.has(s.id) ? 'bg-jz-brand border-jz-brand text-jz-on-brand' : 'border-jz-border/70'}`}>
                            {selected.has(s.id) && <Check size={10} />}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="flex-none text-meta font-mono text-jz-muted">#{String(si + 1).padStart(2, '0')}</span>
                            <span className={`flex-1 min-w-0 text-meta font-semibold truncate leading-5 ${active ? 'text-jz-ink' : 'text-jz-ink-2'}`}>
                              {s.title || '(未命名)'}
                            </span>
                          </div>
                          {!!s.preview && (
                            <div className="text-meta leading-4 text-jz-muted truncate mt-0.5" data-agent-session-preview>{s.preview}</div>
                          )}
                          <div className="flex items-center gap-1.5 mt-1 text-meta min-w-0">
                            <span className={`px-1.5 py-0.5 rounded-control flex-none font-semibold ${statusPill(s)}`}>{statusLabel(s)}</span>
                            <span className="font-mono text-jz-muted flex-none">{fmt(s.updated_at)}</span>
                            {s.task_id != null && !isTask && <><span className="text-jz-muted">·</span><span className="font-mono text-jz-muted truncate">#{s.task_id}</span></>}
                          </div>
                        </div>
                        {!manage && <button onClick={(e) => { e.stopPropagation(); onDelete(s.id); }} data-agent-delete
                          className="hidden group-hover:grid place-items-center w-5 h-5 mt-0.5 rounded-control text-jz-muted hover:text-jz-sev-critical hover:bg-jz-sev-critical/10 flex-none" title="删除会话">
                          <Trash2 size={12} />
                        </button>}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {!visible.length && (
        <div className="text-meta text-jz-muted px-2 py-5 leading-5">
          {q ? '没有匹配的会话。' : onlyOpen ? '没有未完成会话。' : onlyRisk ? '没有高风险会话。' : (tab === 'tests' ? '暂无测试/批量会话。' : '还没有 Agent 会话。新建后发送一个审计问题，Agent 会调用平台工具并留下完整事件轨迹。')}
        </div>
      )}

      {manage && (
        <div className="mt-2 rounded-card border border-jz-border/40 bg-jz-surface/70 p-2" data-agent-batch-bar>
          <div className="flex items-center gap-1.5 text-meta text-jz-muted">
            <span>已选 <b className="font-mono text-jz-ink">{selected.size}</b></span>
            <span className="flex-1" />
            <button onClick={() => setSelected(new Set(visible.map((s) => s.id)))} className="px-1.5 py-0.5 rounded-control hover:text-jz-ink">全选</button>
            <button onClick={() => setSelected(new Set())} className="px-1.5 py-0.5 rounded-control hover:text-jz-ink">清空</button>
          </div>
          <button onClick={() => { onBatchDelete([...selected]); setSelected(new Set()); }} disabled={!selected.size}
            data-agent-batch-delete
            className="mt-1.5 w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-control bg-jz-sev-critical/10 text-jz-sev-critical text-meta font-semibold disabled:opacity-40 hover:bg-jz-sev-critical/15">
            <Trash2 size={11} /> 删除选中 {selected.size ? `(${selected.size})` : ''}
          </button>
        </div>
      )}
      <div className="flex-1 min-h-4" />
      <div className="text-meta text-jz-muted px-1.5 py-1 leading-4 border-t border-jz-border/30 pt-2">
        L4 主链：event log + tool loop + replay<br />旧对话归档：<a className="underline hover:text-jz-brand" href="#/ai-assistant">/ai-assistant</a>
      </div>
    </div>
  );
};

export default AgentSidebar;
