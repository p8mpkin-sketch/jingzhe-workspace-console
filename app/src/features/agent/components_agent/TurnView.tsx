import React from 'react';
import { ChevronRight, CircleAlert, CircleCheck } from 'lucide-react';
import { AnswerCard } from './AnswerCard';
import { ApprovalCard } from './ApprovalCard';
import { ToolCard } from './ToolCard';
import type { TurnView as TurnViewModel } from '../model/turnProjection';
import type { EvidenceView } from '../content/types';

const UserBubble: React.FC<{ text?: string }> = ({ text }) => (
  <div className="flex justify-end mb-5" data-agent-user>
    <div className="max-w-[72%] rounded-panel rounded-br-tag px-4 py-2.5 bg-jz-brand text-jz-on-brand text-body leading-[1.7] whitespace-pre-wrap break-words shadow-card">
      {text}
    </div>
  </div>
);

export const TurnView: React.FC<{
  turn: TurnViewModel;
  sessionId?: string;
  evidenceIndex?: EvidenceView[];
  allowFeedback: boolean;
  onFeedback: (rating: 'up' | 'down') => void;
  onDecide: (id: string, decision: 'approve' | 'deny') => void;
  defaultProcessOpen?: boolean;
}> = ({ turn, sessionId, evidenceIndex, allowFeedback, onFeedback, onDecide, defaultProcessOpen }) => {
  const narration = turn.process.filter((n) => n.kind === 'assistant' && !!n.text);
  const processCount = turn.metrics.models + turn.metrics.tools + turn.metrics.errors;
  const hasProcessDetail = narration.length > 0 || turn.tools.length > 0 || turn.errors.length > 0 || turn.compactions.length > 0;
  return (
    <div className="mb-3" data-agent-turn-block>
      {turn.user && <UserBubble text={turn.user.text} />}
      {turn.approvals.map((n) => <ApprovalCard key={n.id} node={n} onDecide={onDecide} />)}
      {turn.final && <AnswerCard node={turn.final} sessionId={sessionId}
        tools={turn.tools} evidenceIndex={evidenceIndex}
        toolsCount={turn.metrics.tools} usage={turn.turnEnd?.usage}
        allowFeedback={allowFeedback} onFeedback={onFeedback} />}
      {hasProcessDetail && (
        <details className="mb-3 group" data-agent-process open={defaultProcessOpen ?? !!turn.errors.length}>
          <summary className="flex items-center gap-1.5 cursor-pointer list-none text-meta text-jz-muted hover:text-jz-ink-2 select-none">
            <ChevronRight size={11} className="group-open:rotate-90 transition-transform" />
            执行过程
            <span className="font-mono">· {turn.metrics.models} 模型 / {turn.metrics.tools} 工具{turn.metrics.errors ? ` / ${turn.metrics.errors} 错误` : ''}</span>
            {!!turn.errors.length && <span className="px-1.5 py-0.5 rounded-control bg-jz-sev-critical/10 text-jz-sev-critical">需注意</span>}
          </summary>
          <div className="mt-2 pl-4 border-l border-jz-border/50 space-y-1">
            {narration.map((n) => (
              <div key={n.id} className="text-meta leading-5 text-jz-muted py-0.5" data-agent-narration>{n.text}</div>
            ))}
            {turn.tools.map((n) => <ToolCard key={n.id} node={n} />)}
            {turn.errors.map((n) => (
              <div key={n.id} className="my-1 px-2.5 py-1.5 rounded-control bg-jz-sev-critical/10 text-meta text-jz-sev-critical flex items-center gap-1.5" data-agent-node-error>
                <CircleAlert size={11} /> {n.message}
              </div>
            ))}
            {turn.compactions.map((n) => (
              <details key={n.id} className="my-1 rounded-control bg-jz-surface-2/40 px-2.5 py-1.5">
                <summary className="cursor-pointer text-meta text-jz-muted">
                  上下文已压缩（{n.source_events || 0} 个旧事件，覆盖至 seq {n.covered_until_seq}）
                </summary>
                <pre className="mt-1 max-h-40 overflow-auto text-meta whitespace-pre-wrap text-jz-muted">{n.summary}</pre>
              </details>
            ))}
          </div>
        </details>
      )}
      {turn.turnEnd && (
        <div className="my-3 flex items-center gap-2 text-meta text-jz-muted" data-agent-turn-end data-reason={turn.turnEnd.reason}>
          <span className="flex-1 border-t border-jz-border/40" />
          <span className="flex items-center gap-1"><CircleCheck size={10} /> {turn.turnEnd.reason}</span>
          <span className="flex-1 border-t border-jz-border/40" />
        </div>
      )}
    </div>
  );
};
