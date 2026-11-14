import React from 'react';
import { cx } from './cx';

/** Placeholder block for content that is loading. */
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div aria-hidden className={cx('animate-pulse rounded-control bg-jz-surface-2', className)} />
);
