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
    <div className="h-full flex flex-col bg-jz-surface-2/95 backdrop-blur-xl" data-agent-inspector>
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-jz-border/50">
        <Activity size={13} className="text-jz-brand" />
        <span className="text-meta font-semibold text-jz-ink">运行详情</span>
        <span className="flex-1" />
        <span className="text-meta font-mono text-jz-muted">{lastEvent || '—'}</span>
        <button onClick={onClose} data-agent-inspector-close
          className="w-6 h-6 rounded-control grid place-items-center text-jz-muted hover:text-jz-ink hover:bg-jz-surface-2">
          <X size={13} />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2.5 space-y-2">
        <div className="rounded-control bg-jz-surface/60 p-2 space-y-1.5" data-agent-stats>
          <div className="flex justify-between text-meta"><span className="text-jz-muted">事件</span><span className="font-mono text-jz-ink-2">{nodes.length}</span></div>
          <div className="flex justify-between text-meta"><span className="text-jz-muted">工具调用</span><span className="font-mono text-jz-ink-2">{tools.length}</span></div>
          <div className="flex justify-between text-meta"><span className="text-jz-muted">错误</span><span className="font-mono text-jz-sev-critical">{errors.length}</span></div>
          <div className="flex justify-between text-meta"><span className="text-jz-muted">模型调用</span><span className="font-mono text-jz-ink-2">{usage.calls}</span></div>
          <div className="flex justify-between text-meta"><span className="text-jz-muted">prompt / completion</span><span className="font-mono text-jz-ink-2">{usage.prompt}/{usage.completion}</span></div>
          <div className="flex justify-between text-meta"><span className="text-jz-muted">last seq</span><span className="font-mono text-jz-ink-2">{lastSeq}</span></div>
        </div>
        <div className="rounded-control bg-jz-surface/60 p-2" data-agent-goal>
          <div className="flex items-center gap-1 mb-1"><Target size={11} className="text-jz-muted" /><span className="text-meta font-semibold text-jz-ink">会话目标</span></div>
          {!goal && <div className="text-meta text-jz-muted">尚未设置</div>}
          {goal && (
            <>
              <div className={`text-meta ${goal.status === 'completed' ? 'text-jz-teal' : goal.status === 'blocked' ? 'text-jz-sev-critical' : 'text-jz-ink-2'}`}>{goal.objective}</div>
              <div className="text-meta text-jz-muted mt-0.5">{goal.status}</div>
              {(goal.criteria || []).map((c, i) => <div key={i} className="text-meta text-jz-muted">· {c}</div>)}
            </>
          )}
        </div>
        <div className="rounded-control bg-jz-surface/60 p-2" data-agent-todo>
          <div className="flex items-center gap-1 mb-1"><ListTodo size={11} className="text-jz-muted" /><span className="text-meta font-semibold text-jz-ink">任务清单</span></div>
          {!todos.length && <div className="text-meta text-jz-muted">尚未建立</div>}
          {todos.map((t, i) => (
            <div key={i} className="flex items-start gap-1.5 text-meta py-0.5">
              <span className={`mt-0.5 w-1.5 h-1.5 rounded-pill flex-none ${t.status === 'completed' ? 'bg-jz-teal' : t.status === 'in_progress' ? 'bg-jz-brand animate-pulse' : 'bg-jz-muted/40'}`} />
              <span className={`${t.status === 'completed' ? 'text-jz-muted line-through' : 'text-jz-ink-2'}`}>{t.text}</span>
            </div>
          ))}
        </div>
        <div className="rounded-control bg-jz-surface/60 p-2" data-agent-eval>
          <div className="flex items-center gap-1 mb-1"><CircleCheck size={11} className="text-jz-muted" /><span className="text-meta font-semibold text-jz-ink">评估指标</span><span className="ml-auto text-meta uppercase text-jz-muted">debug</span></div>
          {metrics ? (
            <div className="space-y-1">
              <div className="flex justify-between text-meta"><span className="text-jz-muted">工具成功率</span><span className="font-mono text-jz-ink-2">{metrics.tool_success_pct == null ? '—' : metrics.tool_success_pct + '%'}</span></div>
              <div className="flex justify-between text-meta"><span className="text-jz-muted">引用/tool</span><span className="font-mono text-jz-ink-2">{metrics.citation_per_tool ?? '—'}</span></div>
              <div className="flex justify-between text-meta"><span className="text-jz-muted">最终答案</span><span className="font-mono text-jz-ink-2">{metrics.has_final ? `${metrics.final_chars} 字` : '缺失'}</span></div>
              <div className="flex justify-between text-meta"><span className="text-jz-muted">tokens / 时延</span><span className="font-mono text-jz-ink-2">{metrics.tokens} / {metrics.latency_ms}ms</span></div>
            </div>
          ) : <div className="text-meta text-jz-muted">完成一轮后生成</div>}
        </div>
        <div className="rounded-control bg-jz-surface/60 p-2" data-agent-tools>
          <div className="flex items-center gap-1 mb-1"><Wrench size={11} className="text-jz-muted" /><span className="text-meta font-semibold text-jz-ink">工具轨迹</span></div>
          {!tools.length && <div className="text-meta text-jz-muted">尚无工具调用</div>}
          {tools.map((t) => (
            <div key={t.id} className="flex items-center gap-1 text-meta font-mono py-0.5" data-agent-tool-row>
              <span className={`w-1.5 h-1.5 rounded-pill ${t.status === 'running' ? 'bg-jz-brand animate-pulse' : t.status === 'error' ? 'bg-jz-sev-critical' : 'bg-jz-teal'}`} />
              <span className="text-jz-ink-2 truncate">{t.name}</span>
              <span className="flex-1" />
              <span className="text-jz-muted">{t.status}</span>
            </div>
          ))}
        </div>
        <details className="rounded-control bg-jz-surface/60 p-2" data-agent-event-ledger>
          <summary className="cursor-pointer text-meta font-semibold text-jz-ink">事件时间线（{events.length}）</summary>
          <div className="mt-1 max-h-56 overflow-auto space-y-0.5">
            {events.slice(-60).reverse().map((e) => (
              <div key={e.seq} data-agent-event-row={e.seq}
                className="flex items-center gap-1.5 text-meta font-mono py-0.5 border-b border-jz-border/20 last:border-0">
                <span className="text-jz-muted w-6 text-right tabular-nums">{e.seq}</span>
                <span className="text-jz-ink-2 truncate flex-1">{e.type}</span>
                <span className="text-jz-muted">{e.turn_id ? `T${e.turn_id}` : ''}{e.step_id ? `·S${e.step_id}` : ''}</span>
              </div>
            ))}
          </div>
        </details>
        <div className="text-meta text-jz-muted leading-4 px-1">
          <Database size={10} className="inline mr-1" />
          事件日志是事实源；刷新/断线会从 seq 回放。停止会保留已输出文本。
        </div>
      </div>
    </div>
  );
};

export default AgentInspector;
