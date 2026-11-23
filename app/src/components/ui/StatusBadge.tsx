import React from 'react';
import { cx } from './cx';
import { stateOf, type Tone } from './stateDictionary';
import { StatusGlyph, type GlyphKind } from './StatusGlyph';

/**
 * Status = glyph + word, never color alone and never a pill (V3): the shape says the state, the word names it.
 * Tones: success / attention / danger / neutral / brand. A machine `status` picks a more specific glyph
 * (running, queued, paused, failed …) from the same fixed set.
 * Legacy tones (critical / high / medium / low / info / custom) are kept so existing call sites render unchanged
 * in meaning: a tinted capsule without a dot; `custom` takes its colors from className.
 */
export type StatusTone = Tone | 'critical' | 'high' | 'medium' | 'low' | 'info' | 'custom';

const DOT: Record<Tone, GlyphKind> = { success: 'done', attention: 'attention', danger: 'failed', neutral: 'queued', brand: 'active' };
/** Machine values whose shape is more specific than their tone. */
const BY_STATUS: Record<string, GlyphKind> = {
  running: 'running', generating: 'running', queued: 'queued', pending: 'queued', paused: 'paused', interrupted: 'paused',
  waiting_login: 'blocked', manual_required: 'blocked', cancelled: 'neutral', skipped: 'neutral', closed: 'neutral', rejected: 'neutral',
  offline: 'queued', online: 'active',
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
  const base = 'inline-flex items-center gap-1.5 h-6 px-2 rounded-tag text-meta font-medium whitespace-nowrap';
  if (isTone(t)) {
    const kind = (status && BY_STATUS[status]) || DOT[t];
    return (
      <span title={title} data-status-badge={t} data-status={status ?? undefined}
        className={cx('inline-flex items-center gap-1.5 whitespace-nowrap text-label', t === 'danger' ? 'font-medium text-jz-red' : t === 'neutral' ? 'text-jz-ink-2' : 'text-jz-ink', className)}>
        <StatusGlyph kind={kind} />
        {children ?? def?.label}
      </span>
    );
  }
  return (
    <span title={title} data-status-badge={t} className={cx(base, t === 'custom' ? '' : LEGACY[t], className)}>{children}</span>
  );
};
