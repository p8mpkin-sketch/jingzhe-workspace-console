import React, { useMemo, useState } from 'react';
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
  s.status === 'done' ? 'bg-vuln-safe' : s.status === 'running' ? 'bg-neon-accent animate-pulse' : 'bg-jz-text-muted/40'
);
const statusBar = (s: AgentSession) => (
  s.status === 'done' ? 'bg-vuln-safe/70' : s.status === 'running' ? 'bg-neon-accent/80' : 'bg-jz-text-muted/30'
);
const statusPill = (s: AgentSession) => (
  s.status === 'done'
    ? 'bg-vuln-safe/10 text-vuln-safe'
    : s.status === 'running'
      ? 'bg-neon-accent/10 text-neon-accent'
      : 'bg-jz-text-muted/10 text-jz-text-muted'
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
    <div className={`w-[248px] flex-none bg-jz-elevated/70 px-2.5 py-3 overflow-auto flex flex-col ${className}`} data-agent-sidebar>
      <div className="flex items-center gap-1.5 px-1 mb-2.5">
        <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 grid place-items-center text-white shadow-sm">
          <Bot size={13} />
        </span>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-jz-text-primary leading-4">Agent 工作台</div>
          <div className="text-[11px] text-jz-text-muted/70 leading-4">审计任务与测试轨迹</div>
        </div>
        <button onClick={() => { setManage((v) => !v); setSelected(new Set()); }} data-agent-manage={manage ? '1' : '0'}
          title={manage ? '退出批量管理' : '批量管理会话'}
          className={`ml-auto w-6 h-6 rounded-md grid place-items-center ${manage ? 'bg-neon-accent/15 text-neon-accent' : 'text-jz-text-muted/60 hover:text-jz-text-primary hover:bg-jz-surface/60'}`}>
          <CheckSquare size={13} />
        </button>
        <span className="text-[11px] font-mono text-jz-text-muted/60">{real.length}/{tests.length}</span>
      </div>

      <button onClick={onNew} data-agent-new
        className="w-full flex items-center justify-center gap-1.5 mb-2.5 px-2 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-[12px] font-semibold shadow-sm hover:opacity-90 transition-opacity">
        <MessageSquarePlus size={14} /> 新建 Agent 会话
      </button>

      <div className="relative mb-2">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-jz-text-muted/60" />
        <input value={q} onChange={(e) => setQ(e.target.value)} data-agent-search
          placeholder="搜索会话 / 标题 / 任务"
          className="w-full pl-8 pr-2.5 py-1.5 rounded-xl bg-jz-surface/70 border border-jz-border/40 text-[11px] text-jz-text-primary placeholder:text-jz-text-muted/50 outline-none focus:ring-1 focus:ring-neon-accent/40" />
      </div>

      <div className="flex items-center gap-0.5 mb-2 p-0.5 rounded-xl bg-jz-surface/70 border border-jz-border/40" data-agent-session-tabs>
        <button onClick={() => setTab('tasks')} data-agent-tab="tasks"
          className={`flex-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${tab === 'tasks' ? 'bg-jz-surface text-jz-text-primary shadow-sm' : 'text-jz-text-muted hover:text-jz-text-secondary'}`}>
          任务 <span className="font-mono opacity-60">{real.length}</span>
        </button>
        <button onClick={() => setTab('tests')} data-agent-tab="tests"
          className={`flex-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${tab === 'tests' ? 'bg-jz-surface text-jz-text-primary shadow-sm' : 'text-jz-text-muted hover:text-jz-text-secondary'}`}>
          测试 <span className="font-mono opacity-60">{tests.length}</span>
        </button>
      </div>

      <div className="flex items-center gap-1 mb-2 px-1 text-[11px] text-jz-text-muted/60" data-agent-group-switch>
        <span>分组</span>
        <button onClick={() => setGroupBy('time')} data-agent-group-time
          className={`px-1.5 py-0.5 rounded ${groupBy === 'time' ? 'bg-jz-surface text-jz-text-secondary' : 'hover:text-jz-text-secondary'}`}>按时间</button>
        <span className="opacity-30">/</span>
        <button onClick={() => setGroupBy('task')} data-agent-group-task
          className={`px-1.5 py-0.5 rounded ${groupBy === 'task' ? 'bg-jz-surface text-jz-text-secondary' : 'hover:text-jz-text-secondary'}`}>按任务</button>
        <button onClick={() => setSortBy('risk')} data-agent-sort-risk
          className={`px-1.5 py-0.5 rounded ${sortBy === 'risk' ? 'bg-vuln-critical/10 text-vuln-critical' : 'hover:text-jz-text-secondary'}`}>风险</button>
        <span className="flex-1" />
        <button onClick={() => setOnlyRisk((v) => !v)} data-agent-only-risk
          className={`px-1.5 py-0.5 rounded ${onlyRisk ? 'bg-vuln-critical/10 text-vuln-critical' : 'hover:text-jz-text-secondary'}`}>高危</button>
        <button onClick={() => setOnlyOpen((v) => !v)} data-agent-only-open
          className={`px-1.5 py-0.5 rounded ${onlyOpen ? 'bg-neon-accent/10 text-neon-accent' : 'hover:text-jz-text-secondary'}`}>未完成</button>
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
                  {closed ? <ChevronRight size={11} className="text-jz-text-muted/60" /> : <ChevronDown size={11} className="text-jz-text-muted/60" />}
                  <span className="text-[11px] font-mono text-jz-text-muted/80">{g.label}</span>
                  <span className="flex-1 border-t border-jz-border/25" />
                  {!!g.risk?.total && (
                    <span className="text-[11px] font-mono text-vuln-critical/80 whitespace-nowrap" data-agent-task-risk
                      title={`${g.risk.critical} critical / ${g.risk.high} high / ${g.risk.medium} medium`}>
                      {!!g.risk.critical && `${g.risk.critical}C `}{!!g.risk.high && `${g.risk.high}H`}
                    </span>
                  )}
                  <span className="text-[11px] font-mono text-jz-text-muted/45 whitespace-nowrap" data-agent-task-summary title={`${done} 完成 / ${running} 进行 / ${idle} 待继续`}>
                    {done} 完成{!!running ? ` · ${running} 进行` : (!!idle ? ` · ${idle} 待继续` : '')}
                  </span>
                </button>
              ) : (
                <div className="flex items-center gap-2 px-1 mb-1">
                  <span className="text-[11px] font-mono text-jz-text-muted/60">{g.label}</span>
                  <span className="flex-1 border-t border-jz-border/30" />
                  <span className="text-[11px] font-mono text-jz-text-muted/40">{g.items.length}</span>
                </div>
              )}
              {!closed && (
                <div className={isTask ? 'ml-2 pl-2 border-l border-jz-border/25' : ''}>
                  {g.items.map((s, si) => {
                    const active = current === s.id;
                    return (
                      <div key={s.id} data-agent-session-item={s.id} data-agent-selected={selected.has(s.id) ? '1' : '0'}
                        onClick={() => { if (manage) setSelected((prev) => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; }); else onSelect(s.id); }}
                        data-agent-session-index={si + 1}
                        className={`group relative flex items-start gap-2 pl-3 pr-2.5 py-2.5 mb-1.5 rounded-xl cursor-pointer transition-all border
                          ${selected.has(s.id) ? 'bg-neon-accent/10 border-neon-accent/45' : active ? 'bg-jz-surface border-neon-accent/55 shadow-jz-card' : 'bg-jz-surface/45 border-jz-border/25 hover:bg-jz-surface/80 hover:border-jz-border/55'}`}>
                        <span className={`absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-full ${statusBar(s)}`} />
                        {manage && (
                          <span className={`flex-none mt-0.5 w-4 h-4 rounded border grid place-items-center ${selected.has(s.id) ? 'bg-neon-accent border-neon-accent text-white' : 'border-jz-border/70'}`}>
                            {selected.has(s.id) && <Check size={10} />}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="flex-none text-[11px] font-mono text-jz-text-muted/45">#{String(si + 1).padStart(2, '0')}</span>
                            <span className={`flex-1 min-w-0 text-[12px] font-semibold truncate leading-5 ${active ? 'text-jz-text-primary' : 'text-jz-text-secondary'}`}>
                              {s.title || '(未命名)'}
                            </span>
                          </div>
                          {!!s.preview && (
                            <div className="text-[11px] leading-4 text-jz-text-muted/65 truncate mt-0.5" data-agent-session-preview>{s.preview}</div>
                          )}
                          <div className="flex items-center gap-1.5 mt-1 text-[11px] min-w-0">
                            <span className={`px-1.5 py-0.5 rounded flex-none font-semibold ${statusPill(s)}`}>{statusLabel(s)}</span>
                            <span className="font-mono text-jz-text-muted/60 flex-none">{fmt(s.updated_at)}</span>
                            {s.task_id != null && !isTask && <><span className="text-jz-text-muted/30">·</span><span className="font-mono text-jz-text-muted/60 truncate">#{s.task_id}</span></>}
                          </div>
                        </div>
                        {!manage && <button onClick={(e) => { e.stopPropagation(); onDelete(s.id); }} data-agent-delete
                          className="hidden group-hover:grid place-items-center w-5 h-5 mt-0.5 rounded text-jz-text-muted hover:text-vuln-critical hover:bg-vuln-critical/10 flex-none" title="删除会话">
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
        <div className="text-[11px] text-jz-text-muted px-2 py-5 leading-5">
          {q ? '没有匹配的会话。' : onlyOpen ? '没有未完成会话。' : onlyRisk ? '没有高风险会话。' : (tab === 'tests' ? '暂无测试/批量会话。' : '还没有 Agent 会话。新建后发送一个审计问题，Agent 会调用平台工具并留下完整事件轨迹。')}
        </div>
      )}

      {manage && (
        <div className="mt-2 rounded-xl border border-jz-border/40 bg-jz-surface/70 p-2" data-agent-batch-bar>
          <div className="flex items-center gap-1.5 text-[11px] text-jz-text-muted">
            <span>已选 <b className="font-mono text-jz-text-primary">{selected.size}</b></span>
            <span className="flex-1" />
            <button onClick={() => setSelected(new Set(visible.map((s) => s.id)))} className="px-1.5 py-0.5 rounded hover:text-jz-text-primary">全选</button>
            <button onClick={() => setSelected(new Set())} className="px-1.5 py-0.5 rounded hover:text-jz-text-primary">清空</button>
          </div>
          <button onClick={() => { onBatchDelete([...selected]); setSelected(new Set()); }} disabled={!selected.size}
            data-agent-batch-delete
            className="mt-1.5 w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-vuln-critical/10 text-vuln-critical text-[11px] font-semibold disabled:opacity-40 hover:bg-vuln-critical/15">
            <Trash2 size={11} /> 删除选中 {selected.size ? `(${selected.size})` : ''}
          </button>
        </div>
      )}
      <div className="flex-1 min-h-4" />
      <div className="text-[11px] text-jz-text-muted/50 px-1.5 py-1 leading-4 border-t border-jz-border/30 pt-2">
        L4 主链：event log + tool loop + replay<br />旧对话归档：<a className="underline hover:text-neon-accent" href="#/ai-assistant">/ai-assistant</a>
      </div>
    </div>
  );
};

export default AgentSidebar;
