import React from 'react';
import { AlertTriangle, Check, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import type { AgentNode } from '../types';

/** Durable approval card.  A write tool is blocked until the user decides;
 *  the runtime appends approval/decision and then either executes or returns
 *  an honest "not executed" tool result. */
export const ApprovalCard: React.FC<{
  node: AgentNode;
  onDecide: (approvalId: string, decision: 'approve' | 'deny') => void;
}> = ({ node, onDecide }) => {
  const pending = node.status === 'pending';
  const approved = node.status === 'approved';
  const denied = node.status === 'denied' || node.status === 'expired';
  const Icon = pending ? ShieldAlert : approved ? ShieldCheck : AlertTriangle;
  const color = pending ? 'text-jz-sev-medium' : approved ? 'text-jz-teal' : 'text-jz-sev-critical';
  return (
    <div data-agent-approval data-approval-status={node.status || 'pending'}
      className={`my-2 rounded-card bg-jz-surface/80 shadow-card px-3 py-2.5 ${pending ? 'ring-1 ring-jz-sev-medium/40' : ''}`}>
      <div className="flex items-center gap-2">
        <Icon size={14} className={color} />
        <span className="text-meta font-semibold text-jz-ink">写操作审批</span>
        <span className={`px-1.5 py-0.5 rounded-control text-meta ${pending ? 'bg-jz-sev-medium/15 text-jz-sev-medium' : approved ? 'bg-jz-teal/15 text-jz-teal' : 'bg-jz-sev-critical/15 text-jz-sev-critical'}`}>
          {node.status || 'pending'}
        </span>
        <span className="flex-1" />
        <span className="text-meta font-mono text-jz-muted truncate max-w-[240px]">{node.tool || 'tool'}</span>
      </div>
      {!!node.reason && <div className="mt-1 text-meta text-jz-ink-2">{node.reason}</div>}
      <pre className="mt-1.5 max-h-32 overflow-auto rounded-control bg-jz-canvas/60 p-2 text-meta text-jz-muted whitespace-pre-wrap break-words">
        {JSON.stringify(node.args || {}, null, 1)}
      </pre>
      {pending ? (
        <div className="mt-2 flex items-center gap-2">
          <button data-approval-approve
            onClick={() => onDecide(node.approval_id || '', 'approve')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-control bg-jz-teal/15 text-jz-teal text-meta font-semibold hover:bg-jz-teal/25">
            <Check size={11} /> 批准执行
          </button>
          <button data-approval-deny
            onClick={() => onDecide(node.approval_id || '', 'deny')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-control bg-jz-sev-critical/10 text-jz-sev-critical text-meta font-semibold hover:bg-jz-sev-critical/20">
            <X size={11} /> 拒绝
          </button>
          <span className="text-meta text-jz-muted">5 分钟未决自动拒绝</span>
        </div>
      ) : (
        <div className={`mt-1.5 text-meta ${denied ? 'text-jz-sev-critical' : 'text-jz-teal'}`}>
          {approved ? '已批准，等待工具结果' : denied ? '未执行（拒绝/超时）' : node.status}
        </div>
      )}
    </div>
  );
};

export default ApprovalCard;
