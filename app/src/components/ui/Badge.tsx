import React from 'react';
import { cx } from './cx';
import { SEVERITY_LABEL } from './stateDictionary';

export type SevLevel = 'critical' | 'high' | 'medium' | 'low' | 'safe' | 'info';
const SEV: Record<SevLevel, string> = {
  // Critical and high share the finding hue (orange); critical is the filled one. Red is never a finding color.
  critical: 'bg-jz-sev-critical text-jz-on-red font-semibold',
  high: 'bg-jz-sev-high/10 text-jz-sev-high',
  medium: 'bg-jz-sev-medium/10 text-jz-sev-medium',
  low: 'bg-jz-surface-2 text-jz-sev-low',
  safe: 'bg-jz-teal/10 text-jz-teal',
  info: 'bg-jz-surface-2 text-jz-ink-2',
};

/** Finding severity capsule. Always carries text; children default to the level's label. */
export const Badge: React.FC<{ level?: SevLevel; className?: string; children?: React.ReactNode }> =
  ({ level = 'info', className, children }) => (
    <span data-severity={level} className={cx('inline-flex items-center h-5 px-1.5 rounded-tag text-meta font-medium whitespace-nowrap', SEV[level], className)}>
      {children ?? SEVERITY_LABEL[level]}
    </span>
  );
export const SeverityBadge = Badge;

/** Neutral label for categories and keywords. Mono only when the value is an id, package or hash. */
export const Tag: React.FC<{ children: React.ReactNode; mono?: boolean; className?: string; title?: string }> = ({ children, mono, className, title }) => (
  <span title={title} className={cx('inline-flex items-center h-5 max-w-full px-1.5 rounded-tag bg-jz-surface-2 text-meta text-jz-ink-2', mono && 'font-mono', className)}>
    <span className="truncate">{children}</span>
  </span>
);
