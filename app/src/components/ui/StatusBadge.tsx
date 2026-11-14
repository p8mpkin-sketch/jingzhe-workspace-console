import React from 'react';
import { cx } from './cx';
import { stateOf, type Tone } from './stateDictionary';

/**
 * Status = dot + label, never color alone.
 * New tones: success / attention / danger / neutral / brand (dot + label on a quiet outline).
 * Legacy tones (critical / high / medium / low / info / custom) are kept so existing call sites render unchanged
 * in meaning: a tinted capsule without a dot; `custom` takes its colors from className.
 */
export type StatusTone = Tone | 'critical' | 'high' | 'medium' | 'low' | 'info' | 'custom';

const DOT: Record<Tone, string> = {
  success: 'bg-jz-teal', attention: 'bg-jz-amber', danger: 'bg-jz-red', neutral: 'bg-jz-border-strong', brand: 'bg-jz-brand',
};
const LEGACY: Record<'critical' | 'high' | 'medium' | 'low' | 'info', string> = {
  critical: 'bg-jz-sev-critical/10 text-jz-sev-critical',
  high: 'bg-jz-sev-high/10 text-jz-sev-high',
  medium: 'bg-jz-sev-medium/10 text-jz-sev-medium',
  low: 'bg-jz-surface-2 text-jz-sev-low',
  info: 'bg-jz-surface-2 text-jz-ink-2',
};
const isTone = (t: StatusTone): t is Tone => t in DOT;

export const StatusBadge: React.FC<{
  tone?: StatusTone;
  /** Machine status value; label and tone are read from the state dictionary. Overrides `tone`. */
  status?: string | null;
  className?: string;
  title?: string;
  children?: React.ReactNode;
}> = ({ tone = 'info', status, className, title, children }) => {
  const def = status !== undefined ? stateOf(status) : null;
  const t: StatusTone = def ? def.tone : tone;
  const base = 'inline-flex items-center gap-1.5 h-6 px-2 rounded-pill text-meta font-medium whitespace-nowrap';
  if (isTone(t)) {
    return (
      <span title={title} data-status-badge={t} data-status={status ?? undefined} className={cx(base, 'border border-jz-border bg-jz-surface text-jz-ink-2', className)}>
        <span aria-hidden className={cx('h-1.5 w-1.5 flex-none rounded-pill', DOT[t])} />
        {children ?? def?.label}
      </span>
    );
  }
  return (
    <span title={title} data-status-badge={t} className={cx(base, t === 'custom' ? '' : LEGACY[t], className)}>{children}</span>
  );
};
