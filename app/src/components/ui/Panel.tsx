import React from 'react';
import { cx } from './cx';

/** Surface for one distinct object or one grouped action: header (title, description, action) + body + optional footer. */
export const Panel: React.FC<{
  title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; footer?: React.ReactNode;
  /** Remove body padding (tables and lists run edge to edge). */
  flush?: boolean; children?: React.ReactNode; className?: string; bodyClassName?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>> = ({ title, description, actions, footer, flush, children, className, bodyClassName, ...rest }) => (
  <section className={cx('min-w-0 overflow-hidden rounded-panel border border-jz-border bg-jz-surface shadow-card', className)} {...rest}>
    {(title || actions) && (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-jz-border px-5 py-3.5">
        <div className="min-w-0">
          {title && <h3 className="text-body font-semibold text-jz-ink [&_svg]:text-jz-brand">{title}</h3>}
          {description && <p className="mt-0.5 text-meta text-jz-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    )}
    <div className={cx(!flush && 'p-5', bodyClassName)}>{children}</div>
    {footer && <div className="border-t border-jz-border bg-jz-surface-2/40 px-5 py-2.5">{footer}</div>}
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
  <div className={cx('relative min-w-0 overflow-hidden rounded-panel border border-jz-border bg-jz-surface px-5 py-4 shadow-card',
      onClick && 'cursor-pointer transition-shadow duration-hover hover:shadow-raised', className)}
    onClick={onClick} {...(onClick ? { role: 'button', tabIndex: 0, onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click(); } } } : {})} {...rest}>
    <span aria-hidden className={cx('absolute inset-y-4 left-0 w-[3px] rounded-r-pill',
      tone === 'success' ? 'bg-jz-teal' : tone === 'attention' ? 'bg-jz-amber' : tone === 'danger' ? 'bg-jz-red' : 'bg-transparent')} />
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1 truncate text-label font-medium text-jz-ink-2">{label}</div>
      {icon && <span aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-control bg-jz-surface-2 text-jz-muted [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
    </div>
    {loading
      ? <div className="mt-2.5 h-9 w-24 rounded-control bg-jz-surface-2 motion-safe:animate-pulse" role="status" aria-label="加载中" />
      : <div className={cx('mt-2 font-display text-metric font-semibold tnum tracking-display truncate',
          tone === 'success' ? 'text-jz-teal' : tone === 'attention' ? 'text-jz-amber' : tone === 'danger' ? 'text-jz-red' : 'text-jz-ink')}>{value}</div>}
    {hint && <div className="mt-3 truncate border-t border-jz-border pt-2.5 text-meta text-jz-muted">{hint}</div>}
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
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>> = ({ title, subtitle, badge, media, children, footer, className, ...rest }) => (
  <article className={cx('flex min-w-0 flex-col rounded-panel border border-jz-border bg-jz-surface shadow-card transition-[box-shadow,border-color] duration-hover hover:border-jz-border-strong hover:shadow-raised', className)} {...rest}>
    <div className="flex items-start gap-3 p-5">
      {media && <div className="flex-none">{media}</div>}
      <div className="min-w-0 flex-1">
        <h3 className="text-body font-semibold text-jz-ink break-words">{title}</h3>
        {subtitle && <div className="mt-0.5 text-meta text-jz-muted">{subtitle}</div>}
      </div>
      {badge && <div className="flex-none">{badge}</div>}
    </div>
    {children && <div className="flex-1 px-5 pb-5">{children}</div>}
    {footer && <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-jz-border bg-jz-surface-2/40 px-5 py-3">{footer}</div>}
  </article>
);
