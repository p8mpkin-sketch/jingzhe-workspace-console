import React from 'react';
import { cx } from './cx';

/**
 * Readout: a row of labelled cells divided by hairlines, the V3 replacement for KPI cards. One cell = one fact
 * (label 12 muted above, value in mono with tabular figures). It reads as part of the pane it sits in: no card,
 * no shadow, no icon tile. Use `emphasis` on at most one cell.
 */
export interface ReadoutCell {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  emphasis?: boolean;
  /** Plain text value (state word) instead of mono data. */
  text?: boolean;
  title?: string;
  dataAttrs?: Record<string, string | number | undefined>;
}

export const Readout: React.FC<{ cells: ReadoutCell[]; className?: string; dense?: boolean; label?: string }> = ({ cells, className, dense, label }) => (
  <dl aria-label={label} data-readout
    className={cx('flex min-w-0 flex-wrap items-stretch overflow-hidden rounded-card border border-jz-border bg-jz-surface', className)}>
    {cells.map((c, i) => (
      <div key={i} title={c.title} {...c.dataAttrs}
        className={cx('min-w-0 flex-1 basis-28 border-jz-border [&:not(:last-child)]:border-r', dense ? 'px-3 py-1.5' : 'px-4 py-2.5',
          'max-[760px]:basis-1/3 max-[760px]:border-b')}>
        <dt className="truncate text-meta text-jz-muted">{c.label}</dt>
        <dd className={cx('mt-0.5 truncate', c.text ? 'text-label font-medium text-jz-ink' : 'font-mono tnum text-jz-ink',
          !c.text && (c.emphasis ? 'text-title font-semibold' : dense ? 'text-data' : 'text-section font-medium'))}>{c.value}</dd>
        {c.hint && <dd className="break-words text-meta text-jz-muted">{c.hint}</dd>}
      </div>
    ))}
  </dl>
);
