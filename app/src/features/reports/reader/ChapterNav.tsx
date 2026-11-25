// Chapter navigation of the report reader: a column beside the paper from 1024 px, a row above it below that.
// The chapter in view is marked with aria-current; nothing else on the reader repeats these labels as navigation.
import React from 'react';
import { cx } from '@/components/ui';

export type Chapter = {
  id: string;
  label: React.ReactNode;
  /** A number the chapter states about itself (rows, findings). Absent when it was not read. */
  count?: number | null;
  /** Hooks kept from the navigation this one replaces. */
  attrs?: Record<string, string | number>;
  countAttrs?: Record<string, string | number>;
};

export const ChapterNav: React.FC<{
  chapters: Chapter[];
  active: string;
  onPick: (id: string) => void;
  label?: string;
  className?: string;
  attrs?: Record<string, string | number>;
  navRef?: React.Ref<HTMLElement>;
}> = ({ chapters, active, onPick, label = '报告章节', className, attrs, navRef }) => (
  <nav ref={navRef} aria-label={label} data-chapter-nav {...attrs}
    className={cx('flex gap-1 overflow-x-auto [scrollbar-width:none] lg:flex-col lg:overflow-visible', className)}>
    {chapters.map((c) => {
      const on = c.id === active;
      return (
        <button key={c.id} type="button" onClick={() => onPick(c.id)} aria-current={on ? 'true' : undefined} data-chapter={c.id} {...c.attrs}
          className={cx('flex h-jz-control flex-none items-center justify-between gap-2 whitespace-nowrap rounded-control border-l-2 px-3 text-label transition-colors duration-hover max-[760px]:h-jz-touch',
            on ? 'border-l-jz-line-active bg-jz-surface-2 font-medium text-jz-ink' : 'border-l-transparent text-jz-ink-2 hover:bg-jz-surface-2 hover:text-jz-ink')}>
          <span className="min-w-0 truncate">{c.label}</span>
          {c.count != null && <span data-chapter-count={c.id} {...c.countAttrs} className="font-mono text-meta tnum text-jz-muted">{c.count}</span>}
        </button>
      );
    })}
  </nav>
);
