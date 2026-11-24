import React from 'react';
import { cx } from './cx';

/**
 * Status glyphs: a fixed set of shapes, so a state is recognisable without color. A glyph never stands alone:
 * the caller renders the state word next to it, or passes `label` when the glyph is the only visible mark
 * (then it becomes an image with that name; otherwise it is hidden from assistive tech).
 */
export type GlyphKind =
  | 'running'   // half-filled circle
  | 'queued'    // hollow circle
  | 'done'      // check
  | 'failed'    // cross
  | 'partial'   // half-filled square
  | 'blocked'   // circle with a slash
  | 'attention' // filled triangle
  | 'paused'    // two bars
  | 'active'    // filled circle
  | 'neutral';  // short dash

const COLOR: Record<GlyphKind, string> = {
  running: 'text-jz-brand', queued: 'text-jz-muted', done: 'text-jz-teal', failed: 'text-jz-red', partial: 'text-jz-amber',
  blocked: 'text-jz-amber', attention: 'text-jz-amber', paused: 'text-jz-amber', active: 'text-jz-brand', neutral: 'text-jz-muted',
};

const SHAPE: Record<GlyphKind, React.ReactNode> = {
  running: (<><circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M6 1.75a4.25 4.25 0 0 1 0 8.5z" fill="currentColor" /></>),
  queued: <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />,
  done: <path d="M2.25 6.4l2.5 2.5 5-5.6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />,
  failed: <path d="M2.75 2.75l6.5 6.5M9.25 2.75l-6.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />,
  partial: (<><rect x="2" y="2" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M2 6h8v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" fill="currentColor" /></>),
  blocked: (<><circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M3 9l6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>),
  attention: <path d="M6 1.6l4.6 8.4H1.4z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />,
  paused: <path d="M4 2.5v7M8 2.5v7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />,
  active: <circle cx="6" cy="6" r="4" fill="currentColor" />,
  neutral: <path d="M3 6h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />,
};

export const StatusGlyph: React.FC<{ kind: GlyphKind; label?: string; className?: string; size?: 12 | 14 }> = ({ kind, label, className, size = 12 }) => (
  <svg viewBox="0 0 12 12" width={size} height={size} data-glyph={kind}
    {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    className={cx('flex-none', COLOR[kind], className)}>
    {SHAPE[kind]}
  </svg>
);

/** Glyph + word. The word carries the meaning; the glyph and its color repeat it. */
export const StatusText: React.FC<{ kind: GlyphKind; children: React.ReactNode; strong?: boolean; className?: string; title?: string } & Omit<React.HTMLAttributes<HTMLSpanElement>, 'children' | 'className' | 'title'>> =
  ({ kind, children, strong, className, title, ...rest }) => (
    <span {...rest} title={title} data-status-text={kind}
      className={cx('inline-flex items-center gap-1.5 whitespace-nowrap text-label', strong ? 'font-medium' : '',
        kind === 'failed' ? 'text-jz-red' : kind === 'queued' || kind === 'neutral' ? 'text-jz-ink-2' : 'text-jz-ink', className)}>
      <StatusGlyph kind={kind} />{children}
    </span>
  );
