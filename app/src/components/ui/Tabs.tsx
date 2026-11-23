import React, { useRef } from 'react';
import { cx } from './cx';

export interface TabItem<K extends string = string> {
  key: K;
  label: React.ReactNode;
  count?: number | null;
  disabled?: boolean;
  /** Extra data-* hooks to keep on the tab button. */
  dataAttrs?: Record<string, string | number | undefined>;
}

function useRoving<K extends string>(items: TabItem<K>[], value: K, onChange: (k: K) => void) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKeyDown = (e: React.KeyboardEvent) => {
    const enabled = items.filter((t) => !t.disabled);
    const i = enabled.findIndex((t) => t.key === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % enabled.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(enabled[next].key);
    refs.current[enabled[next].key]?.focus();
  };
  return { refs, onKeyDown };
}

/** Primary in-page navigation: text + count with an underline indicator. Scrolls horizontally when it does not fit. */
export function Tabs<K extends string>({ items, value, onChange, label, sticky = false, className }: {
  items: TabItem<K>[]; value: K; onChange: (k: K) => void; label: string; sticky?: boolean; className?: string;
}) {
  const { refs, onKeyDown } = useRoving(items, value, onChange);
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown}
      className={cx('flex items-stretch gap-1 overflow-x-auto overflow-y-hidden border-b border-jz-border [scrollbar-width:none]', sticky && 'sticky top-0 z-10 bg-jz-canvas', className)}>
      {items.map((t) => {
        const on = t.key === value;
        return (
          <button key={t.key} ref={(el) => { refs.current[t.key] = el; }} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1}
            disabled={t.disabled} onClick={() => onChange(t.key)} {...t.dataAttrs}
            className={cx('relative flex-none inline-flex items-center gap-1.5 px-2.5 h-jz-control-lg max-[760px]:h-jz-touch text-label whitespace-nowrap -mb-px border-b-2 transition-colors duration-fast disabled:opacity-45',
              on ? 'border-jz-brand text-jz-ink font-semibold' : 'border-transparent font-medium text-jz-ink-2 hover:text-jz-ink hover:border-jz-border-strong')}>
            {t.label}
            {t.count != null && <span className={cx('font-mono text-mono tnum', on ? 'text-jz-brand' : 'text-jz-muted')}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Small exclusive choice inside a toolbar (view mode, range). Not for page navigation. */
export function SegmentedControl<K extends string>({ items, value, onChange, label, className }: {
  items: TabItem<K>[]; value: K; onChange: (k: K) => void; label: string; className?: string;
}) {
  const { refs, onKeyDown } = useRoving(items, value, onChange);
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown}
      className={cx('inline-flex items-center gap-px rounded-control border border-jz-border bg-jz-inset p-px', className)}>
      {items.map((t) => {
        const on = t.key === value;
        return (
          <button key={t.key} ref={(el) => { refs.current[t.key] = el; }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
            disabled={t.disabled} onClick={() => onChange(t.key)} {...t.dataAttrs}
            className={cx('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-tag text-label whitespace-nowrap transition-colors duration-fast disabled:opacity-45 max-[760px]:h-9',
              on ? 'bg-jz-raised text-jz-ink font-medium ring-1 ring-jz-border' : 'text-jz-ink-2 hover:text-jz-ink')}>
            {t.label}
            {t.count != null && <span className="font-mono text-mono tnum text-jz-muted">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
