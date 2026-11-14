import React from 'react';
import { cx } from './cx';

/**
 * Page container: fills the workspace width, pads 24 / 16 / 12 px by viewport, and caps content at 1680 px
 * (centered only beyond that). Owns the page scroll, so pages never set their own max-width container.
 */
export const Page: React.FC<{ children: React.ReactNode; className?: string; scroll?: boolean } & React.HTMLAttributes<HTMLDivElement>> =
  ({ children, className, scroll = true, ...rest }) => (
    <div className={cx('relative flex-1 min-h-0 min-w-0', scroll && 'overflow-y-auto')} {...rest}>
      {/* One soft tint behind the header block (design-system.md §5); scrolls with the content, never behind body text. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-jz-header-tint" data-page-tint />
      <div className={cx('relative mx-auto w-full max-w-jz-content px-jz-page py-jz-page flex flex-col gap-6', className)}>{children}</div>
    </div>
  );

/** Title block: optional breadcrumb / eyebrow, title, description, meta row, one primary action plus secondaries. */
export const PageHeader: React.FC<{
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  /** Small facts under the title (id, owner, source). */
  meta?: React.ReactNode;
  /** Right side. Put the single primary action last. */
  actions?: React.ReactNode;
  /** A line of status facts under the header, separated from it by a rule (overview pages). */
  summary?: React.ReactNode;
  className?: string;
}> = ({ title, eyebrow, description, meta, actions, summary, className }) => (
  <header className={cx('flex flex-col gap-4 pt-1', className)}>
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 basis-80">
        {eyebrow && <div className="mb-1.5 text-label font-medium text-jz-brand">{eyebrow}</div>}
        <h1 className="jz-page-title text-jz-ink break-words">{title}</h1>
        {description && <p className="mt-2 max-w-jz-prose text-body text-jz-ink-2">{description}</p>}
        {meta && <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-jz-muted">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    {summary && <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-jz-border pt-3 text-label text-jz-ink-2" data-page-summary>{summary}</div>}
  </header>
);

/** A titled block of the page with a consistent header rhythm. Not a surface; wrap content in Panel when it needs one. */
export const Section: React.FC<{
  title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>> = ({ title, description, actions, children, className, ...rest }) => (
  <section className={cx('flex flex-col gap-3 min-w-0', className)} {...rest}>
    {(title || actions) && (
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {title && <h2 className="jz-section text-jz-ink">{title}</h2>}
          {description && <p className="mt-0.5 text-label text-jz-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    )}
    {children}
  </section>
);
