import React from 'react';

export type SevLevel = 'critical' | 'high' | 'medium' | 'low' | 'safe' | 'info';
/* 回访轮对齐 StatusBadge 语言: 状态=染底+文字色不用 border(规范#3),胶囊圆角;border 保留宽度但透明,几何零位移 */
const SEV: Record<SevLevel, string> = {
  critical: 'bg-jz-sev-critical/15 text-jz-sev-critical',
  high: 'bg-jz-sev-high/15 text-jz-sev-high',
  medium: 'bg-jz-sev-medium/15 text-jz-sev-medium',
  low: 'bg-jz-sev-low/15 text-jz-sev-low',
  safe: 'bg-jz-teal/15 text-jz-teal',
  info: 'bg-jz-surface-2 text-jz-ink-2',
};

export const Badge: React.FC<{ level?: SevLevel; className?: string; children: React.ReactNode }> =
 ({ level = 'info', className = '', children }) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-pill text-meta font-mono font-semibold border border-transparent ${SEV[level]} ${className}`}>
      {children}
    </span>
  );
