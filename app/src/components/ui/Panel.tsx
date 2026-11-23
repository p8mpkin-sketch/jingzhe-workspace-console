import React from 'react';
import { cx } from './cx';

/** Pane for one distinct object or one grouped action: header (title, description, action) + body + optional footer.
 *  Bounded by a hairline; it does not float (no shadow). */
export const Panel: React.FC<{
  title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; footer?: React.ReactNode;
  /** Remove body padding (tables and lists run edge to edge). */
  flush?: boolean; children?: React.ReactNode; className?: string; bodyClassName?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>> = ({ title, description, actions, footer, flush, children, className, bodyClassName, ...rest }) => (
  <section className={cx('min-w-0 overflow-hidden rounded-card border border-jz-border bg-jz-surface', className)} {...rest}>
    {(title || actions) && (
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3 border-b border-jz-border px-4 py-2">
        <div className="min-w-0">
          {title && <h3 className="text-label font-semibold text-jz-ink [&_svg]:text-jz-muted">{title}</h3>}
          {description && <p className="mt-0.5 text-meta text-jz-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    )}
    <div className={cx(!flush && 'p-4', bodyClassName)}>{children}</div>
    {footer && <div className="border-t border-jz-border bg-jz-inset/60 px-4 py-2">{footer}</div>}
  </section>
);

/**
 * Label 12, value 32, hint 12. A thin rail on the left carries the tone (state only, always with text);
 * an optional icon sits in a quiet tile when it adds meaning. Pass onClick to make the whole card a button.
 */
export const Metric: React.FC<{
  label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'attention' | 'danger'; loading?: boolean; className?: string;
} & React.HTMLAttributes<HTMLDivElement>> = ({ label, value, hint, icon, tone = 'default', loading, className, onClick, ...rest }) => (
  <div className={cx('relative min-w-0 overflow-hidden rounded-card border border-jz-border bg-jz-surface px-4 py-3',
      onClick && 'cursor-pointer transition-colors duration-fast hover:border-jz-border-strong', className)}
    onClick={onClick} {...(onClick ? { role: 'button', tabIndex: 0, onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click(); } } } : {})} {...rest}>
    <span aria-hidden className={cx('absolute inset-y-3 left-0 w-0.5 rounded-r-pill',
      tone === 'success' ? 'bg-jz-teal' : tone === 'attention' ? 'bg-jz-amber' : tone === 'danger' ? 'bg-jz-red' : 'bg-transparent')} />
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1 truncate text-label font-medium text-jz-ink-2">{label}</div>
      {icon && <span aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-control bg-jz-surface-2 text-jz-muted [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
    </div>
    {loading
      ? <div className="mt-2.5 h-9 w-24 rounded-control bg-jz-surface-2 motion-safe:animate-pulse" role="status" aria-label="加载中" />
      : <div className={cx('mt-2 font-display text-metric font-semibold tnum tracking-display truncate',
          tone === 'success' ? 'text-jz-teal' : tone === 'attention' ? 'text-jz-amber' : tone === 'danger' ? 'text-jz-red' : 'text-jz-ink')}>{value}</div>}
    {hint && <div className="mt-1.5 truncate text-meta text-jz-muted">{hint}</div>}
  </div>
);

/** Metric row on the shared grid: 4 across on desktop, 2 on tablet and mobile. */
export const MetricGrid: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cx('grid grid-cols-2 gap-3 desktop:grid-cols-4 desktop:gap-4', className)}>{children}</div>
);

/** Card for one object in an index grid (project, knowledge entry): name, meta, body, footer with the primary action. */
export const ObjectCard: React.FC<{
  title: React.ReactNode; subtitle?: React.ReactNode; badge?: React.ReactNode; media?: React.ReactNode;
  children?: React.ReactNode; footer?: React.ReactNode; className?: string;
  /** Tighter padding for secondary lists; put the open action in `badge` and leave `footer` out. */
  compact?: boolean;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>> = ({ title, subtitle, badge, media, children, footer, compact, className, ...rest }) => (
  <article className={cx('flex min-w-0 flex-col rounded-card border border-jz-border bg-jz-surface transition-colors duration-fast hover:border-jz-border-strong', className)} {...rest}>
    <div className={cx('flex items-start gap-3', compact ? 'px-4 pb-2 pt-3' : 'p-4')}>
      {media && <div className="flex-none">{media}</div>}
      <div className="min-w-0 flex-1">
        <h3 className="text-body font-semibold text-jz-ink break-words">{title}</h3>
        {subtitle && <div className="mt-0.5 text-meta text-jz-muted">{subtitle}</div>}
      </div>
      {badge && <div className="flex-none">{badge}</div>}
    </div>
    {children && <div className={cx('flex-1', compact ? 'px-4 pb-3' : 'px-4 pb-4')}>{children}</div>}
    {footer && <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-jz-border bg-jz-inset/60 px-4 py-2">{footer}</div>}
  </article>
);
