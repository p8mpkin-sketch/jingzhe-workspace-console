import React from 'react';

/**
 * R104-1 ①: 状态/危险级微胶囊(V3 三铁律②「调试标签一律封装微型状态胶囊」的标准载体)。
 * 五档危险/状态级 + custom 自由档(消费方经 className 自带配色, 本组件不预设)。
 * 全 token 化零裸 hex: 面色/字符色均消费主题 token(vuln-* 危险级色板 / jz-* 中性档),
 * 微光背景 + 同色系深色字符; 无边框(杜绝生硬黑线框), 柔和边缘光晕由 .status-glow
 * 以 currentColor 派生(styles/index.css), 暗色光晕更明显、亮色自动衰减。
 */
export type StatusTone = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'custom';

const TONE: Record<Exclude<StatusTone, 'custom'>, string> = {
  critical: 'bg-vuln-critical/10 text-vuln-critical',
  high: 'bg-vuln-high/10 text-vuln-high',
  medium: 'bg-vuln-medium/10 text-vuln-medium',
  low: 'bg-vuln-low/10 text-vuln-low',
  info: 'bg-jz-elevated text-jz-text-secondary',
};

export const StatusBadge: React.FC<{
 tone?: StatusTone;
 className?: string;
 title?: string;
 children: React.ReactNode;
}> = ({ tone = 'info', className = '', title, children }) => (
  <span
 title={title}
 data-status-badge={tone}
 className={`status-glow inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold whitespace-nowrap ${tone === 'custom' ? '' : TONE[tone]} ${className}`}
 >
    {children}
  </span>
);
