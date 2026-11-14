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
  const color = pending ? 'text-vuln-medium' : approved ? 'text-vuln-safe' : 'text-vuln-critical';
  return (
    <div data-agent-approval data-approval-status={node.status || 'pending'}
      className={`my-2 rounded-xl bg-jz-surface/80 shadow-jz-card px-3 py-2.5 ${pending ? 'ring-1 ring-vuln-medium/40' : ''}`}>
      <div className="flex items-center gap-2">
        <Icon size={14} className={color} />
        <span className="text-xs font-semibold text-jz-text-primary">写操作审批</span>
        <span className={`px-1.5 py-0.5 rounded text-[11px] ${pending ? 'bg-vuln-medium/15 text-vuln-medium' : approved ? 'bg-vuln-safe/15 text-vuln-safe' : 'bg-vuln-critical/15 text-vuln-critical'}`}>
          {node.status || 'pending'}
        </span>
        <span className="flex-1" />
        <span className="text-[11px] font-mono text-jz-text-muted truncate max-w-[240px]">{node.tool || 'tool'}</span>
      </div>
      {!!node.reason && <div className="mt-1 text-[11px] text-jz-text-secondary">{node.reason}</div>}
      <pre className="mt-1.5 max-h-32 overflow-auto rounded-lg bg-jz-bg/60 p-2 text-[11px] text-jz-text-muted whitespace-pre-wrap break-words">
        {JSON.stringify(node.args || {}, null, 1)}
      </pre>
      {pending ? (
        <div className="mt-2 flex items-center gap-2">
          <button data-approval-approve
            onClick={() => onDecide(node.approval_id || '', 'approve')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-vuln-safe/15 text-vuln-safe text-[11px] font-semibold hover:bg-vuln-safe/25">
            <Check size={11} /> 批准执行
          </button>
          <button data-approval-deny
            onClick={() => onDecide(node.approval_id || '', 'deny')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-vuln-critical/10 text-vuln-critical text-[11px] font-semibold hover:bg-vuln-critical/20">
            <X size={11} /> 拒绝
          </button>
          <span className="text-[11px] text-jz-text-muted/60">5 分钟未决自动拒绝</span>
        </div>
      ) : (
        <div className={`mt-1.5 text-[11px] ${denied ? 'text-vuln-critical' : 'text-vuln-safe'}`}>
          {approved ? '已批准，等待工具结果' : denied ? '未执行（拒绝/超时）' : node.status}
        </div>
      )}
    </div>
  );
};

export default ApprovalCard;
