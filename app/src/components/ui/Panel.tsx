import React from 'react';
import { cx } from './cx';

/** Surface for one distinct object or one grouped action: header (title, description, action) + body + optional footer. */
export const Panel: React.FC<{
  title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; footer?: React.ReactNode;
  /** Remove body padding (tables and lists run edge to edge). */
  flush?: boolean; children?: React.ReactNode; className?: string; bodyClassName?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>> = ({ title, description, actions, footer, flush, children, className, bodyClassName, ...rest }) => (
  <section className={cx('min-w-0 overflow-hidden rounded-card border border-jz-border bg-jz-surface shadow-card', className)} {...rest}>
    {(title || actions) && (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-jz-border px-4 py-3">
        <div className="min-w-0">
          {title && <h3 className="text-body font-semibold text-jz-ink">{title}</h3>}
          {description && <p className="mt-0.5 text-meta text-jz-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    )}
    <div className={cx(!flush && 'p-4', bodyClassName)}>{children}</div>
    {footer && <div className="border-t border-jz-border px-4 py-2.5">{footer}</div>}
  </section>
);

/** Label 12, value 30, hint 12. No icon unless it carries meaning; tone colors the value only for state. */
export const Metric: React.FC<{
  label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode;
  tone?: 'default' | 'success' | 'attention' | 'danger'; loading?: boolean; className?: string;
} & React.HTMLAttributes<HTMLDivElement>> = ({ label, value, hint, tone = 'default', loading, className, ...rest }) => (
  <div className={cx('min-w-0 rounded-card border border-jz-border bg-jz-surface p-4', className)} {...rest}>
    <div className="text-meta text-jz-muted truncate">{label}</div>
    {loading
      ? <div className="mt-2 h-8 w-20 rounded-control bg-jz-surface-2 motion-safe:animate-pulse" role="status" aria-label="加载中" />
      : <div className={cx('mt-1.5 font-display text-metric font-semibold tnum tracking-display truncate',
          tone === 'success' ? 'text-jz-teal' : tone === 'attention' ? 'text-jz-amber' : tone === 'danger' ? 'text-jz-red' : 'text-jz-ink')}>{value}</div>}
    {hint && <div className="mt-1 text-meta text-jz-muted truncate">{hint}</div>}
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
  <article className={cx('flex min-w-0 flex-col rounded-card border border-jz-border bg-jz-surface shadow-card transition-colors duration-hover hover:border-jz-border-strong', className)} {...rest}>
    <div className="flex items-start gap-3 p-4">
      {media && <div className="flex-none">{media}</div>}
      <div className="min-w-0 flex-1">
        <h3 className="text-body font-semibold text-jz-ink break-words">{title}</h3>
        {subtitle && <div className="mt-0.5 text-meta text-jz-muted">{subtitle}</div>}
      </div>
      {badge && <div className="flex-none">{badge}</div>}
    </div>
    {children && <div className="flex-1 px-4 pb-4">{children}</div>}
    {footer && <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-jz-border px-4 py-3">{footer}</div>}
  </article>
);
