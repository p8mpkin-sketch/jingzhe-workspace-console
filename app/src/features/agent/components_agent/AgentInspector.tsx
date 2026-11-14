import React from 'react';
import { Activity, CircleCheck, Database, ListTodo, Target, Wrench, X } from 'lucide-react';
import type { AgentEvent, AgentNode } from '../types';

export const AgentInspector: React.FC<{
  nodes: AgentNode[];
  tools: AgentNode[];
  events: AgentEvent[];
  lastSeq: number;
  lastEvent?: string;
  goal: AgentNode | null;
  todos: Array<{ text: string; status: string }>;
  metrics: any;
  onClose: () => void;
}> = ({ nodes, tools, events, lastSeq, lastEvent, goal, todos, metrics, onClose }) => {
  const errors = nodes.filter((n) => n.kind === 'error');
  const usage = (() => {
    const rows = nodes.filter((n) => n.kind === 'assistant' && n.usage).map((n) => n.usage);
    return {
      prompt: rows.reduce((s, u) => s + (u?.prompt_tokens || 0), 0),
      completion: rows.reduce((s, u) => s + (u?.completion_tokens || 0), 0),
      calls: rows.length,
    };
  })();
  return (
    <div className="h-full flex flex-col bg-jz-elevated/95 backdrop-blur-xl" data-agent-inspector>
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-jz-border/50">
        <Activity size={13} className="text-neon-accent" />
        <span className="text-xs font-semibold text-jz-text-primary">运行详情</span>
        <span className="flex-1" />
        <span className="text-[11px] font-mono text-jz-text-muted">{lastEvent || '—'}</span>
        <button onClick={onClose} data-agent-inspector-close
          className="w-6 h-6 rounded-md grid place-items-center text-jz-text-muted hover:text-jz-text-primary hover:bg-jz-elevated">
          <X size={13} />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2.5 space-y-2">
        <div className="rounded-lg bg-jz-surface/60 p-2 space-y-1.5" data-agent-stats>
          <div className="flex justify-between text-[11px]"><span className="text-jz-text-muted">事件</span><span className="font-mono text-jz-text-secondary">{nodes.length}</span></div>
          <div className="flex justify-between text-[11px]"><span className="text-jz-text-muted">工具调用</span><span className="font-mono text-jz-text-secondary">{tools.length}</span></div>
          <div className="flex justify-between text-[11px]"><span className="text-jz-text-muted">错误</span><span className="font-mono text-vuln-critical">{errors.length}</span></div>
          <div className="flex justify-between text-[11px]"><span className="text-jz-text-muted">模型调用</span><span className="font-mono text-jz-text-secondary">{usage.calls}</span></div>
          <div className="flex justify-between text-[11px]"><span className="text-jz-text-muted">prompt / completion</span><span className="font-mono text-jz-text-secondary">{usage.prompt}/{usage.completion}</span></div>
          <div className="flex justify-between text-[11px]"><span className="text-jz-text-muted">last seq</span><span className="font-mono text-jz-text-secondary">{lastSeq}</span></div>
        </div>
        <div className="rounded-lg bg-jz-surface/60 p-2" data-agent-goal>
          <div className="flex items-center gap-1 mb-1"><Target size={11} className="text-jz-text-muted" /><span className="text-[11px] font-semibold text-jz-text-primary">会话目标</span></div>
          {!goal && <div className="text-[11px] text-jz-text-muted">尚未设置</div>}
          {goal && (
            <>
              <div className={`text-[11px] ${goal.status === 'completed' ? 'text-vuln-safe' : goal.status === 'blocked' ? 'text-vuln-critical' : 'text-jz-text-secondary'}`}>{goal.objective}</div>
              <div className="text-[11px] text-jz-text-muted/60 mt-0.5">{goal.status}</div>
              {(goal.criteria || []).map((c, i) => <div key={i} className="text-[11px] text-jz-text-muted/70">· {c}</div>)}
            </>
          )}
        </div>
        <div className="rounded-lg bg-jz-surface/60 p-2" data-agent-todo>
          <div className="flex items-center gap-1 mb-1"><ListTodo size={11} className="text-jz-text-muted" /><span className="text-[11px] font-semibold text-jz-text-primary">任务清单</span></div>
          {!todos.length && <div className="text-[11px] text-jz-text-muted">尚未建立</div>}
          {todos.map((t, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] py-0.5">
              <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-none ${t.status === 'completed' ? 'bg-vuln-safe' : t.status === 'in_progress' ? 'bg-neon-accent animate-pulse' : 'bg-jz-text-muted/40'}`} />
              <span className={`${t.status === 'completed' ? 'text-jz-text-muted line-through' : 'text-jz-text-secondary'}`}>{t.text}</span>
            </div>
          ))}
        </div>
        <div className="rounded-lg bg-jz-surface/60 p-2" data-agent-eval>
          <div className="flex items-center gap-1 mb-1"><CircleCheck size={11} className="text-jz-text-muted" /><span className="text-[11px] font-semibold text-jz-text-primary">评估指标</span><span className="ml-auto text-[11px] uppercase tracking-wide text-jz-text-muted/60">debug</span></div>
          {metrics ? (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]"><span className="text-jz-text-muted">工具成功率</span><span className="font-mono text-jz-text-secondary">{metrics.tool_success_pct == null ? '—' : metrics.tool_success_pct + '%'}</span></div>
              <div className="flex justify-between text-[11px]"><span className="text-jz-text-muted">引用/tool</span><span className="font-mono text-jz-text-secondary">{metrics.citation_per_tool ?? '—'}</span></div>
              <div className="flex justify-between text-[11px]"><span className="text-jz-text-muted">最终答案</span><span className="font-mono text-jz-text-secondary">{metrics.has_final ? `${metrics.final_chars} 字` : '缺失'}</span></div>
              <div className="flex justify-between text-[11px]"><span className="text-jz-text-muted">tokens / 时延</span><span className="font-mono text-jz-text-secondary">{metrics.tokens} / {metrics.latency_ms}ms</span></div>
            </div>
          ) : <div className="text-[11px] text-jz-text-muted">完成一轮后生成</div>}
        </div>
        <div className="rounded-lg bg-jz-surface/60 p-2" data-agent-tools>
          <div className="flex items-center gap-1 mb-1"><Wrench size={11} className="text-jz-text-muted" /><span className="text-[11px] font-semibold text-jz-text-primary">工具轨迹</span></div>
          {!tools.length && <div className="text-[11px] text-jz-text-muted">尚无工具调用</div>}
          {tools.map((t) => (
            <div key={t.id} className="flex items-center gap-1 text-[11px] font-mono py-0.5" data-agent-tool-row>
              <span className={`w-1.5 h-1.5 rounded-full ${t.status === 'running' ? 'bg-neon-accent animate-pulse' : t.status === 'error' ? 'bg-vuln-critical' : 'bg-vuln-safe'}`} />
              <span className="text-jz-text-secondary truncate">{t.name}</span>
              <span className="flex-1" />
              <span className="text-jz-text-muted">{t.status}</span>
            </div>
          ))}
        </div>
        <details className="rounded-lg bg-jz-surface/60 p-2" data-agent-event-ledger>
          <summary className="cursor-pointer text-[11px] font-semibold text-jz-text-primary">事件时间线（{events.length}）</summary>
          <div className="mt-1 max-h-56 overflow-auto space-y-0.5">
            {events.slice(-60).reverse().map((e) => (
              <div key={e.seq} data-agent-event-row={e.seq}
                className="flex items-center gap-1.5 text-[11px] font-mono py-0.5 border-b border-jz-border/20 last:border-0">
                <span className="text-jz-text-muted/60 w-6 text-right tabular-nums">{e.seq}</span>
                <span className="text-jz-text-secondary truncate flex-1">{e.type}</span>
                <span className="text-jz-text-muted/60">{e.turn_id ? `T${e.turn_id}` : ''}{e.step_id ? `·S${e.step_id}` : ''}</span>
              </div>
            ))}
          </div>
        </details>
        <div className="text-[11px] text-jz-text-muted/60 leading-4 px-1">
          <Database size={10} className="inline mr-1" />
          事件日志是事实源；刷新/断线会从 seq 回放。停止会保留已输出文本。
        </div>
      </div>
    </div>
  );
};

export default AgentInspector;
