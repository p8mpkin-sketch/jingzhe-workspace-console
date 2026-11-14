import React from 'react';
import { cx } from './cx';

/** Skeleton layouts shared by every page: one card, table rows, a chart, a card grid, a metric row. */
export type SkeletonVariant = 'card' | 'table' | 'chart' | 'cards' | 'metrics';

const Bone: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', style, ...rest }) => (
  <div className={cx('jz-shimmer rounded-control bg-jz-surface-2', className)} style={style} aria-hidden="true" {...rest} />
);
const Card: React.FC = () => (
  <div className="space-y-3 rounded-card border border-jz-border bg-jz-surface p-4">
    <div className="flex items-center gap-3"><Bone className="h-8 w-8 shrink-0" /><Bone className="h-3 w-1/3" /></div>
    <Bone className="h-3 w-full" /><Bone className="h-3 w-5/6" /><Bone className="h-3 w-2/3" />
  </div>
);

export const SkeletonLoader: React.FC<{
  variant?: SkeletonVariant;
  /** Row count for `table`, card count for `cards` (default 6), tile count for `metrics` (default 4). */
  rows?: number;
  className?: string;
}> = ({ variant = 'card', rows, className = '' }) => {
  const a11y = { role: 'status', 'aria-label': '加载中' } as const;
  if (variant === 'table') {
    return (
      <div className={cx('space-y-3', className)} {...a11y}>
        {Array.from({ length: Math.max(rows ?? 4, 1) }).map((_, i) => (
          <div key={i} className="flex items-center gap-3"><Bone className="h-3 w-8 shrink-0" /><Bone className="h-3 flex-1" /><Bone className="h-3 w-14 shrink-0" /></div>
        ))}
      </div>
    );
  }
  if (variant === 'chart') {
    return (
      <div className={cx('flex h-40 items-end gap-2 rounded-card border border-jz-border bg-jz-surface p-3', className)} {...a11y}>
        {[38, 62, 46, 74, 56, 86, 68, 50].map((h, i) => <Bone key={i} className="flex-1" style={{ height: `${h}%` }} />)}
      </div>
    );
  }
  if (variant === 'cards') {
    return (
      <div className={cx('grid grid-cols-1 gap-4 table:grid-cols-2 desktop:grid-cols-3', className)} {...a11y}>
        {Array.from({ length: rows ?? 6 }).map((_, i) => <Card key={i} />)}
      </div>
    );
  }
  if (variant === 'metrics') {
    return (
      <div className={cx('grid grid-cols-2 gap-3 desktop:grid-cols-4 desktop:gap-4', className)} {...a11y}>
        {Array.from({ length: rows ?? 4 }).map((_, i) => (
          <div key={i} className="space-y-2.5 rounded-card border border-jz-border bg-jz-surface p-4"><Bone className="h-3 w-16" /><Bone className="h-7 w-20" /><Bone className="h-3 w-24" /></div>
        ))}
      </div>
    );
  }
  return <div className={className} {...a11y}><Card /></div>;
};
