import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * R104-1 ②: 技术标识/包名/CVE 等宽胶囊。
 * font-mono 强制; 长文本省略号截断 + title 悬浮显全文(Tooltip);
 * 悬浮显复制钮、点击一键复制 —— R103 TopBar 包名胶囊同款交互(Copy→Check 1.2s 回弹)。
 */
export const CodePill: React.FC<{
 value: string;
 /** 展示文本, 缺省渲染 value 本身(复制的永远是 value) */
 label?: React.ReactNode;
 className?: string;
 /** 截断宽度类, 缺省 max-w-[220px] */
 maxW?: string;
 /** 字号档(报告中心大厅卡用 text-sm;八档闸白名单内自选), 缺省沿用 text-[11px] */
 textCls?: string;
}> = ({ value, label, className = '', maxW = 'max-w-[220px]', textCls = 'text-[11px]' }) => {
 const [copied, setCopied] = useState(false);
 const copy = async () => {
 try {
 await navigator.clipboard.writeText(value);
 setCopied(true);
 setTimeout(() => setCopied(false), 1200);
    } catch { /* 剪贴板不可用时静默, 全文仍可经 title 手选 */ }
  };
  return (
    <button
 type="button"
 onClick={copy}
 title={`复制: ${value}`}
 data-code-pill={copied ? 'copied' : ''}
 className={`group inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-jz-elevated/70 border border-transparent font-mono ${textCls} text-jz-text-secondary hover:border-neon-accent/50 transition-colors min-w-0 ${maxW} ${className}`}
 >
      <span className="truncate">{label ?? value}</span>
      {copied
        ? <Check size={11} className="text-vuln-safe flex-none" />
        : <Copy size={11} className="flex-none opacity-0 group-hover:opacity-60 transition-opacity" />}
    </button>
  );
};
