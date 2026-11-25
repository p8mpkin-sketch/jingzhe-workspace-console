// The frame of a report: a status line with the one export menu, chapter navigation, and the chapters.
// It is a frame only. What a chapter contains, what is imported, exported or edited belongs to the page that uses it:
// the report draft of the assessment workbench (`scroll="own"`) and the report workspace at /reports (`scroll="page"`).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cx } from '@/components/ui';
import { ChapterNav, type Chapter } from './ChapterNav';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const ReaderLayout: React.FC<{
  chapters: Chapter[];
  /** Accessible name of the reader. */
  label: string;
  /** `own`: the reader fills its container and scrolls the chapters itself. `page`: the page scrolls. */
  scroll: 'own' | 'page';
  /** For `scroll="page"`: selector of the scrolling ancestor. */
  pageScroller?: string;
  /** Above the frame: the title block of the page that owns the report. */
  header?: React.ReactNode;
  /** Left of the bar: the state of the report in words. */
  status?: React.ReactNode;
  /** Right of the bar: the export menu. */
  actions?: React.ReactNode;
  /** Between the bar and the chapters: a notice about the data (stale, partly unread). */
  notice?: React.ReactNode;
  /** Only this reader is printed: the application frame is left out (styles/print.css). */
  printable?: boolean;
  navAttrs?: Record<string, string | number>;
  attrs?: Record<string, string | number>;
  children: React.ReactNode;
}> = ({ chapters, label, scroll, pageScroller, header, status, actions, notice, printable = false, navAttrs, attrs, children }) => {
  const [active, setActive] = useState(chapters[0]?.id ?? '');
  const own = scroll === 'own';
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);
  const jumping = useRef(0);

  const scroller = useCallback((): HTMLElement | null => (own ? box.current : (pageScroller ? body.current?.closest<HTMLElement>(pageScroller) ?? null : null)), [own, pageScroller]);
  // In page mode the chapter row sticks to the top of the scroller below 1024 px and covers what scrolls under it.
  const covered = useCallback(() => (!own && nav.current && window.matchMedia('(max-width: 1023px)').matches ? nav.current.offsetHeight : 0), [own]);
  const topOf = (el: HTMLElement, sc: HTMLElement) => el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;

  const pick = (id: string) => {
    const sc = scroller(); const el = body.current?.querySelector<HTMLElement>(`[data-reader-chapter="${id}"]`);
    setActive(id);
    if (!sc || !el) return;
    // The chapter picked stays marked while the scroll it started is under way.
    jumping.current = Date.now() + (reducedMotion() ? 0 : 600);
    sc.scrollTo({ top: Math.max(0, topOf(el, sc) - covered() - 16), behavior: reducedMotion() ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    const sc = scroller();
    if (!sc) return;
    const mark = () => {
      if (Date.now() < jumping.current) return;
      const marks = [...(body.current?.querySelectorAll<HTMLElement>('[data-reader-chapter]') || [])];
      if (!marks.length) return;
      const line = sc.scrollTop + covered() + 24;
      let cur = marks[0];
      for (const m of marks) if (topOf(m, sc) <= line) cur = m;
      // At the end of the scroll the last chapter is in view even when its top never reaches the line.
      if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2 && sc.scrollTop > 0) cur = marks[marks.length - 1];
      const id = cur.getAttribute('data-reader-chapter') || '';
      setActive((a) => (a === id ? a : id));
    };
    mark();
    sc.addEventListener('scroll', mark, { passive: true });
    return () => sc.removeEventListener('scroll', mark);
  }, [scroller, covered, chapters.length]);

  const bar = (status || actions) && (
    <div data-reader-bar className={cx('flex flex-none flex-wrap items-center justify-between gap-x-4 gap-y-2', own ? 'border-b border-jz-border bg-jz-surface px-4 py-2' : '')}>
      <div className="min-w-0 text-label text-jz-ink-2" data-reader-status>{status}</div>
      <div className="flex flex-none items-center gap-2">{actions}</div>
    </div>
  );

  if (own) {
    return (
      <div data-reader="own" role="region" aria-label={label} className="flex h-full min-h-0 flex-col bg-jz-surface" {...attrs}>
        {header}
        {bar}
        {notice}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex-none border-b border-jz-border px-2 py-1.5 lg:w-56 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:py-3" data-reader-nav>
            <ChapterNav chapters={chapters} active={active} onPick={pick} navRef={nav} attrs={navAttrs} />
          </div>
          <div ref={box} tabIndex={0} aria-label={`${label}正文`} data-reader-scroll className="min-h-0 min-w-0 flex-1 overflow-auto bg-jz-canvas px-4 py-6 max-[760px]:px-3 max-[760px]:py-4">
            <div ref={body} data-reader-paper {...(printable ? { 'data-reader-print': '' } : {})}
              className="mx-auto w-full max-w-4xl border border-jz-border bg-jz-surface px-8 py-7 max-[760px]:px-4 max-[760px]:py-5">
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div data-reader="page" role="region" aria-label={label} className="flex flex-col gap-6" {...attrs}>
      {header}
      {bar}
      {notice}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <ChapterNav chapters={chapters} active={active} onPick={pick} navRef={nav} attrs={navAttrs}
          className="sticky top-0 z-10 -mx-jz-page border-b border-jz-border bg-jz-canvas px-jz-page py-2 lg:top-4 lg:mx-0 lg:self-start lg:border-b-0 lg:px-0 lg:py-0" />
        <div ref={body} data-reader-paper {...(printable ? { 'data-reader-print': '' } : {})} className="flex min-w-0 flex-col gap-6">
          {children}
        </div>
      </div>
    </div>
  );
};

/** One chapter of a reader. The id is the one its `Chapter` entry carries. */
export const ReaderChapter: React.FC<{ id: string; children: React.ReactNode; className?: string; attrs?: Record<string, string | number> }> = ({ id, children, className, attrs }) => (
  <section data-reader-chapter={id} className={className} {...attrs}>{children}</section>
);
