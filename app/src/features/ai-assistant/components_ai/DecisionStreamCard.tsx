import React, { useState } from 'react';

/** P2-③(修正版⑤·诚实回填): AI 回答观测卡——只展示前端真实可观测的信号,不虚构分步耗时:
 *  流式等待/思维链帧(reasoning)/正文增量帧(delta)三态是真值;done 后回填 SSE tokens 帧
 *  (usage 真值)、实际模型、端到端实测时延。模型未回报 usage 时如实标注,不编造。 */

export type StreamPhase = 'idle' | 'connecting' | 'thinking' | 'generating';

/** done 后随消息持久化的实测元数据(全部真值,缺项=后端未回报) */
export interface AnswerMeta {
  model?: string;
  tokens?: number;
  latencyMs?: number;
  reasoningLen?: number;
  genChars?: number;
}

const PhaseDot: React.FC<{ phase: StreamPhase }> = ({ phase }) => (
  <span aria-hidden className={`w-1.5 h-1.5 rounded-pill flex-none ${phase === 'generating' ? 'bg-jz-teal' : 'bg-jz-brand'}`} />
);

/** 流式进行中的观测卡(phase !== idle 时渲染);facts 全部来自后端步事件真值,缺省不显示 */
export const LiveStreamCard: React.FC<{
  phase: StreamPhase;
  reasoningLen: number;
  genChars: number;
  hitCount?: number;
  historyMsgs?: number;
  promptChars?: number;
  routeModel?: string;
}> = ({ phase, reasoningLen, genChars, hitCount, historyMsgs, promptChars, routeModel }) => {
  const label = phase === 'connecting' ? '连接模型…'
    : phase === 'thinking' ? `模型思考中…(思维链已收到 ${reasoningLen} 字)`
    : `生成回答中…(已输出 ${genChars} 字)`;
  const facts: string[] = [];
  if (hitCount != null) facts.push(`检索命中 ${hitCount}`);
  if (historyMsgs != null) facts.push(`历史 ${historyMsgs} 条`);
  if (promptChars != null) facts.push(`载荷 ${promptChars} 字`);
  if (routeModel) facts.push(`路由 ${routeModel}`);
  return (
    <div className="mb-2" data-live-stream-card-wrap>
      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-control bg-jz-surface-2/50 text-meta text-jz-muted" data-live-stream-card data-stream-phase={phase}>
        <PhaseDot phase={phase} />
        <span className="tabular-nums">{label}</span>
      </div>
      {facts.length > 0 && (
        <div className="flex items-center gap-1 mt-1 flex-wrap" data-stream-facts>
          {facts.map((f) => (
            <span key={f} className="px-1.5 py-0.5 rounded-control bg-jz-surface-2/40 text-meta font-mono text-jz-muted tabular-nums">{f}</span>
          ))}
        </div>
      )}
    </div>
  );
};

/** done 后的折叠摘要行(消息 _meta 真值回填;可展开看口径说明) */
export const AnswerMetaLine: React.FC<{ meta: AnswerMeta }> = ({ meta }) => {
  const [open, setOpen] = useState(false);
  const parts: string[] = [];
  if (meta.model) parts.push(meta.model);
  if (meta.tokens != null) parts.push(`${meta.tokens} tokens(usage 真值)`);
  if (meta.latencyMs != null) parts.push(`${meta.latencyMs}ms 端到端实测`);
  if (!parts.length) return null;
  return (
    <div className="mt-1" data-answer-meta>
      <button onClick={() => setOpen((v) => !v)} data-answer-meta-toggle
        className="inline-flex items-center gap-1 text-meta font-mono text-jz-muted hover:text-jz-brand tabular-nums">
        ⚡ {parts.join(' · ')} <span className="text-jz-muted">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-1 px-2 py-1.5 rounded-control bg-jz-surface-2/40 text-meta text-jz-muted leading-relaxed" data-answer-meta-detail>
          <div>观测口径:回答为检索增强流式输出;tokens={meta.tokens != null ? 'SSE done 帧 usage 真值' : '模型未回报 usage,如实省略'};时延=前端请求发出到 done 帧的端到端墙钟实测。</div>
          {meta.reasoningLen != null && meta.reasoningLen > 0 && <div className="tabular-nums">本次收到思维链 {meta.reasoningLen} 字;正文输出 {meta.genChars ?? '—'} 字。</div>}
        </div>
      )}
    </div>
  );
};
