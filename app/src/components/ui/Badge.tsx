import React from 'react';

export type SevLevel = 'critical' | 'high' | 'medium' | 'low' | 'safe' | 'info';
/* 回访轮对齐 StatusBadge 语言: 状态=染底+文字色不用 border(规范#3),胶囊圆角;border 保留宽度但透明,几何零位移 */
const SEV: Record<SevLevel, string> = {
  critical: 'bg-vuln-critical/15 text-vuln-critical',
  high: 'bg-vuln-high/15 text-vuln-high',
  medium: 'bg-vuln-medium/15 text-vuln-medium',
  low: 'bg-vuln-low/15 text-vuln-low',
  safe: 'bg-vuln-safe/15 text-vuln-safe',
  info: 'bg-jz-elevated text-jz-text-secondary',
};

export const Badge: React.FC<{ level?: SevLevel; className?: string; children: React.ReactNode }> =
 ({ level = 'info', className = '', children }) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono font-bold border border-transparent ${SEV[level]} ${className}`}>
      {children}
    </span>
  );
