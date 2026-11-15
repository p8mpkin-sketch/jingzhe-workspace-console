import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Info, LayoutGrid, MoreHorizontal, Rows3 } from 'lucide-react';
import { cx } from './cx';
import { SegmentedControl } from './Tabs';
import { Popover, MenuItem } from './Popover';
import { Drawer } from './Drawer';
import { useMediaQuery, BREAKPOINT } from './useMediaQuery';
import { pressable } from './pressable';

/* Phase 11 composition primitives: one dominant object or signal per page, secondary facts as quiet lists,
   master-detail on wide screens, grouped actions instead of repeated buttons. */

// ---------- View preference ----------

/** A per-viewer UI preference kept in localStorage (wrapped: storage can be missing or throw). */
export function useViewPreference<K extends string>(key: string, fallback: K, allowed: readonly K[]): [K, (k: K) => void] {
  const read = (): K => {
    try { const v = localStorage.getItem('jz-view:' + key) as K | null; return v && allowed.includes(v) ? v : fallback; } catch { return fallback; }
  };
  const [value, setValue] = useState<K>(read);
  const set = useCallback((k: K) => {
    setValue(k);
    try { localStorage.setItem('jz-view:' + key, k); } catch { /* preference only */ }
  }, [key]);
  return [value, set];
}

export type ViewMode = 'cards' | 'table';
/** Cards for scanning, table for comparing. */
export const ViewToggle: React.FC<{ value: ViewMode; onChange: (v: ViewMode) => void; className?: string }> = ({ value, onChange, className }) => (
  <SegmentedControl label="视图" value={value} onChange={onChange} className={className}
    items={[
      { key: 'cards', label: <span className="inline-flex items-center gap-1.5"><LayoutGrid size={14} aria-hidden />卡片</span>, dataAttrs: { 'data-view-toggle': 'cards' } },
      { key: 'table', label: <span className="inline-flex items-center gap-1.5"><Rows3 size={14} aria-hidden />表格</span>, dataAttrs: { 'data-view-toggle': 'table' } },
    ]} />
);

// ---------- Feature band ----------

export type Fact = { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; tone?: 'default' | 'success' | 'attention' | 'danger' };

const toneText = (t?: Fact['tone']) => t === 'success' ? 'text-jz-teal' : t === 'attention' ? 'text-jz-amber' : t === 'danger' ? 'text-jz-red' : 'text-jz-ink';

/** Inline facts with large numerals, separated by rules. Used inside bands and signal panels. */
export const FactRow: React.FC<{ facts: Fact[]; className?: string }> = ({ facts, className }) => (
  <dl className={cx('grid grid-cols-2 gap-x-6 gap-y-4 tablet:flex tablet:flex-wrap tablet:gap-x-0', className)}>
    {facts.map((f, i) => (
      <div key={i} className={cx('min-w-0 tablet:pr-6', i > 0 && 'tablet:border-l tablet:border-jz-border tablet:pl-6')}>
        <dt className="text-meta text-jz-muted">{f.label}</dt>
        <dd className={cx('mt-1 font-display text-title font-semibold tnum', toneText(f.tone))}>{f.value}</dd>
        {f.hint && <dd className="mt-0.5 text-meta text-jz-muted">{f.hint}</dd>}
      </div>
    ))}
  </dl>
);

/**
 * The page's primary object (the lead project, the selected report). One per page.
 * `card` is a raised surface; `editorial` sits on the canvas between rules, like a lead story:
 * identity on the left, facts as a column on the right, no card chrome.
 */
export const FeatureBand: React.FC<{
  eyebrow?: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode; tags?: React.ReactNode;
  facts?: Fact[]; actions?: React.ReactNode; aside?: React.ReactNode; variant?: 'card' | 'editorial'; className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>> = ({ eyebrow, title, subtitle, tags, facts, actions, aside, variant = 'card', className, ...rest }) => {
  if (variant === 'editorial') {
    return (
      <section className={cx('min-w-0 border-y border-jz-border', className)} data-band="editorial" {...rest}>
        <div className="grid gap-x-10 gap-y-6 py-6 desktop:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-4 desktop:col-span-7">
            <div>
              {eyebrow && <div className="mb-2 text-label font-medium text-jz-brand">{eyebrow}</div>}
              <h2 className="font-display text-page font-semibold tracking-page text-jz-ink break-words">{title}</h2>
              {subtitle && <div className="mt-2 text-body text-jz-ink-2">{subtitle}</div>}
              {tags && <div className="mt-3 flex flex-wrap gap-1.5">{tags}</div>}
            </div>
            {actions && <div className="mt-auto flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
          <div className="min-w-0 desktop:col-span-5 desktop:border-l desktop:border-jz-border desktop:pl-10">
            {facts && facts.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 tablet:grid-cols-3 desktop:grid-cols-3">
                {facts.map((f, i) => (
                  <div key={i} className="min-w-0">
                    <dt className="text-meta text-jz-muted">{f.label}</dt>
                    <dd className={cx('mt-1 font-semibold', typeof f.value === 'number' ? 'font-display text-headline tnum' : 'pt-1.5 text-body', toneText(f.tone))}>{f.value}</dd>
                    {f.hint && <dd className="mt-0.5 text-meta text-jz-muted">{f.hint}</dd>}
                  </div>
                ))}
              </dl>
            )}
            {aside && <div className={cx(facts && facts.length > 0 && 'mt-5 border-t border-jz-border pt-4')}>{aside}</div>}
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className={cx('relative min-w-0 overflow-hidden rounded-panel border border-jz-border bg-jz-surface shadow-card', className)} {...rest}>
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-jz-brand" />
      <div className="grid gap-6 p-6 pl-7 desktop:grid-cols-12">
        <div className={cx('min-w-0 flex flex-col gap-5', aside ? 'desktop:col-span-8' : 'desktop:col-span-12')}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 basis-72">
              {eyebrow && <div className="mb-1.5 text-label font-medium text-jz-brand">{eyebrow}</div>}
              <h2 className="font-display text-headline font-semibold tracking-page text-jz-ink break-words">{title}</h2>
              {subtitle && <div className="mt-1.5 text-body text-jz-ink-2">{subtitle}</div>}
              {tags && <div className="mt-3 flex flex-wrap gap-1.5">{tags}</div>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
          {facts && facts.length > 0 && <FactRow facts={facts} className="border-t border-jz-border pt-4" />}
        </div>
        {aside && <div className="min-w-0 border-t border-jz-border pt-5 desktop:col-span-4 desktop:border-l desktop:border-t-0 desktop:pl-6 desktop:pt-0">{aside}</div>}
      </div>
    </section>
  );
};

// ---------- Signal panel and metric list ----------

/** The one operational signal a page leads with: a question, a large answer, a breakdown, then detail. */
export const SignalPanel: React.FC<{
  question: React.ReactNode; value: React.ReactNode; statement?: React.ReactNode; tone?: Fact['tone'];
  breakdown?: Fact[]; actions?: React.ReactNode; loading?: boolean; children?: React.ReactNode; className?: string;
} & React.HTMLAttributes<HTMLElement>> = ({ question, value, statement, tone, breakdown, actions, loading, children, className, ...rest }) => (
  <section className={cx('flex min-w-0 flex-col overflow-hidden rounded-panel border border-jz-border bg-jz-surface shadow-card', className)} {...rest}>
    <div className="flex flex-col gap-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-label font-medium text-jz-ink-2">{question}</h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
        {loading
          ? <div className="h-14 w-32 rounded-control bg-jz-surface-2 motion-safe:animate-pulse" role="status" aria-label="加载中" />
          : <div className={cx('font-display text-display font-semibold tnum tracking-display', toneText(tone))}>{value}</div>}
        {statement && <p className="max-w-jz-prose pb-1.5 text-body text-jz-ink-2">{statement}</p>}
      </div>
      {breakdown && breakdown.length > 0 && <FactRow facts={breakdown} className="border-t border-jz-border pt-4" />}
    </div>
    {children && <div className="flex flex-1 flex-col justify-end border-t border-jz-border">{children}</div>}
  </section>
);

/** One bar split by state (done / in progress / failed / rest), with the legend in text so color is never the only cue. */
export const StackedBar: React.FC<{ parts: { key: string; label: string; value: number; tone: 'success' | 'attention' | 'danger' | 'neutral' }[]; label: string; className?: string }> = ({ parts, label, className }) => {
  const total = parts.reduce((n, p) => n + p.value, 0) || 1;
  const fill = (t: string) => t === 'success' ? 'bg-jz-teal' : t === 'attention' ? 'bg-jz-amber' : t === 'danger' ? 'bg-jz-red' : 'bg-jz-border-strong';
  return (
    <div className={cx('flex flex-col gap-2.5', className)}>
      <div className="flex h-2 overflow-hidden rounded-pill bg-jz-surface-2" role="img" aria-label={label + '：' + parts.map((p) => `${p.label} ${p.value}`).join('，')}>
        {parts.map((p) => p.value > 0 && <span key={p.key} className={cx('h-full', fill(p.tone))} style={{ width: (p.value / total) * 100 + '%' }} />)}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-jz-ink-2" aria-hidden>
        {parts.map((p) => <li key={p.key} className="flex items-center gap-1.5"><span className={cx('h-2 w-2 rounded-pill', fill(p.tone))} />{p.label} <span className="tnum">{Math.round((p.value / total) * 100)}%</span></li>)}
      </ul>
    </div>
  );
};

export type ListMetric = Fact & { key: string; onClick?: () => void; icon?: React.ReactNode };
/** Secondary metrics as a quiet stacked list (label left, value right), not as equal cards. */
export const MetricList: React.FC<{ title?: React.ReactNode; items: ListMetric[]; loading?: boolean; className?: string } & React.HTMLAttributes<HTMLElement>> =
  ({ title, items, loading, className, ...rest }) => (
    <section className={cx('min-w-0 overflow-hidden rounded-panel border border-jz-border bg-jz-surface shadow-card', className)} {...rest}>
      {title && <h2 className="border-b border-jz-border px-5 py-3.5 text-body font-semibold text-jz-ink">{title}</h2>}
      <ul className="divide-y divide-jz-border">
        {items.map((m) => (
          <li key={m.key}>
            <div className={cx('flex items-center gap-3 px-5 py-3.5', m.onClick && 'cursor-pointer hover:bg-jz-surface-2 focus-visible:bg-jz-surface-2')}
              {...(m.onClick ? { onClick: m.onClick, ...pressable(true) } : {})} data-metric={m.key}>
              {m.icon && <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-control bg-jz-surface-2 text-jz-muted [&_svg]:h-4 [&_svg]:w-4">{m.icon}</span>}
              <div className="min-w-0 flex-1">
                <div className="truncate text-label font-medium text-jz-ink-2">{m.label}</div>
                {m.hint && <div className="mt-0.5 truncate text-meta text-jz-muted">{m.hint}</div>}
              </div>
              {loading
                ? <span className="h-6 w-12 rounded-control bg-jz-surface-2 motion-safe:animate-pulse" role="status" aria-label="加载中" />
                : <span className={cx('flex-none font-display text-title font-semibold tnum', toneText(m.tone))}>{m.value}</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );

// ---------- Actions ----------

export type MenuAction = { key: string; label: React.ReactNode; icon?: React.ReactNode; onSelect: () => void; disabled?: boolean; danger?: boolean; attrs?: Record<string, string | number | undefined> };

/** One labelled button that opens a grouped list of related actions (export formats, downloads). */
export const ActionMenu: React.FC<{
  label: React.ReactNode; menuLabel: string; items: MenuAction[]; icon?: React.ReactNode; variant?: 'secondary' | 'ghost';
  align?: 'start' | 'end'; disabled?: boolean; className?: string; triggerAttrs?: Record<string, string | number | undefined>;
}> = ({ label, menuLabel, items, icon, variant = 'secondary', align = 'end', disabled, className, triggerAttrs }) => (
  <Popover label={menuLabel} role="menu" align={align}
    trigger={(p) => (
      <button type="button" {...p} disabled={disabled} {...triggerAttrs}
        className={cx('inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-control px-2.5 text-label font-medium transition-colors duration-hover disabled:opacity-45 max-[760px]:h-jz-touch',
          variant === 'secondary' ? 'border border-jz-border bg-jz-surface text-jz-ink hover:bg-jz-surface-2' : 'text-jz-ink-2 hover:bg-jz-surface-2 hover:text-jz-ink', className)}>
        {icon}{label}<ChevronDown size={14} aria-hidden className="text-jz-muted" />
      </button>
    )}>
    {(close) => items.map((a) => (
      <MenuItem key={a.key} icon={a.icon} danger={a.danger} disabled={a.disabled} {...a.attrs}
        onClick={() => { close(); a.onSelect(); }}>{a.label}</MenuItem>
    ))}
  </Popover>
);

/** One visible primary action per row; everything else in an overflow menu. */
export const RowActions: React.FC<{ primary?: React.ReactNode; more?: MenuAction[]; label: string; className?: string }> = ({ primary, more, label, className }) => (
  <div className={cx('flex items-center justify-end gap-1', className)} onClick={(e) => e.stopPropagation()}>
    {primary}
    {more && more.length > 0 && (
      <Popover label={label} role="menu"
        trigger={(p) => (
          <button type="button" {...p} aria-label={label} title={label}
            className="grid h-8 w-8 place-items-center rounded-control text-jz-muted hover:bg-jz-surface-2 hover:text-jz-ink max-[760px]:h-jz-touch max-[760px]:w-jz-touch">
            <MoreHorizontal size={16} aria-hidden />
          </button>
        )}>
        {(close) => more.map((a) => (
          <MenuItem key={a.key} icon={a.icon} danger={a.danger} disabled={a.disabled} {...a.attrs}
            onClick={() => { close(); a.onSelect(); }}>{a.label}</MenuItem>
        ))}
      </Popover>
    )}
  </div>
);

// ---------- Master-detail ----------

/**
 * List on the left, readable detail on the right from 1280 px. Below that the detail opens in a drawer,
 * so the list keeps the full width. The detail pane is sticky inside the page scroller.
 */
export const SplitView: React.FC<{
  list: React.ReactNode; detail: React.ReactNode; detailTitle: React.ReactNode; open: boolean; onClose: () => void;
  /** Rendered in the detail column when nothing is selected (wide screens only). */
  placeholder?: React.ReactNode; className?: string;
} & React.HTMLAttributes<HTMLDivElement>> = ({ list, detail, detailTitle, open, onClose, placeholder, className, ...rest }) => {
  const wide = useMediaQuery(`(min-width: ${BREAKPOINT.desktop}px)`);
  return (
    <div className={cx('grid min-w-0 gap-6', wide && 'grid-cols-12 items-start', className)} data-split={wide ? 'side' : 'drawer'} {...rest}>
      <div className={cx('min-w-0', wide && 'col-span-5')}>{list}</div>
      {wide
        ? <aside aria-label={typeof detailTitle === 'string' ? detailTitle : '详情'} className="sticky top-4 col-span-7 min-w-0" data-split-detail>{open ? detail : placeholder}</aside>
        : <Drawer open={open} onClose={onClose} title={detailTitle} width={560}>{detail}</Drawer>}
    </div>
  );
};

// ---------- Disclosure ----------

export type CoverageSource = { key: string; label: React.ReactNode; state: 'used' | 'failed' | 'unavailable' | 'unused'; detail?: React.ReactNode; count?: React.ReactNode };
const SOURCE_STATE: Record<CoverageSource['state'], { label: string; dot: string }> = {
  used: { label: '已使用', dot: 'bg-jz-teal' },
  failed: { label: '失败', dot: 'bg-jz-red' },
  unavailable: { label: '不可用', dot: 'bg-jz-amber' },
  unused: { label: '未使用', dot: 'bg-jz-border-strong' },
};

/** Which sources a number came from, which failed, and the standing caveat that public sources are incomplete. */
export const CoverageDisclosure: React.FC<{ title?: React.ReactNode; sources: CoverageSource[]; note?: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>> =
  ({ title = '来源覆盖', sources, note, className, ...rest }) => (
    <section className={cx('min-w-0 overflow-hidden rounded-panel border border-jz-border bg-jz-surface shadow-card', className)} data-coverage {...rest}>
      <h2 className="border-b border-jz-border px-5 py-3.5 text-body font-semibold text-jz-ink">{title}</h2>
      <ul className="divide-y divide-jz-border">
        {sources.map((s) => (
          <li key={s.key} className="flex items-start gap-3 px-5 py-3">
            <span aria-hidden className={cx('mt-1.5 h-2 w-2 flex-none rounded-pill', SOURCE_STATE[s.state].dot)} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-label font-medium text-jz-ink">{s.label}</span>
                <span className="text-meta text-jz-muted">{SOURCE_STATE[s.state].label}{s.count != null && <> · <span className="tnum">{s.count}</span></>}</span>
              </div>
              {s.detail && <div className="mt-0.5 text-meta text-jz-muted">{s.detail}</div>}
            </div>
          </li>
        ))}
      </ul>
      <p className="flex gap-2 border-t border-jz-border bg-jz-surface-2/50 px-5 py-3 text-meta text-jz-ink-2">
        <Info size={14} aria-hidden className="mt-0.5 flex-none text-jz-muted" />
        <span>{note ?? '公开来源无法保证覆盖完整；这里的数字只反映已接入和已核验的部分。'}</span>
      </p>
    </section>
  );

// ---------- Chart frame ----------

/** A chart answers one question: the title is that question, the description says how it is measured. */
export const ChartPanel: React.FC<{
  question: React.ReactNode; method?: React.ReactNode; actions?: React.ReactNode; empty?: boolean; emptyState?: React.ReactNode;
  children: React.ReactNode; className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>> = ({ question, method, actions, empty, emptyState, children, className, ...rest }) => (
  <section className={cx('flex min-w-0 flex-col overflow-hidden rounded-panel border border-jz-border bg-jz-surface shadow-card', className)} {...rest}>
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
      <div className="min-w-0">
        <h2 className="text-section font-semibold text-jz-ink">{question}</h2>
        {method && <p className="mt-0.5 text-meta text-jz-muted">{method}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    <div className="min-h-0 flex-1 p-5">{empty ? emptyState : children}</div>
  </section>
);

// ---------- Sticky context ----------

/** True once the element has scrolled out of its scroll container (used for compact sticky headers). Pass the callback as `ref`. */
export function useScrolledPast<T extends HTMLElement>(): [(el: T | null) => void, boolean] {
  const [node, setNode] = useState<T | null>(null);
  const [past, setPast] = useState(false);
  useEffect(() => {
    if (!node || typeof IntersectionObserver === 'undefined') return;
    let root: HTMLElement | null = node.parentElement;
    while (root && !/(auto|scroll)/.test(getComputedStyle(root).overflowY)) root = root.parentElement;
    const io = new IntersectionObserver(([e]) => setPast(!e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 0) + 1), { root, threshold: 0 });
    io.observe(node);
    return () => io.disconnect();
  }, [node]);
  return [setNode, past];
}
