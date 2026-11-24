// The inline menu of the composer: slash commands, or context to quote. It is a listbox owned by the textarea
// (focus never leaves the input), so arrow keys, Enter and Escape are handled there.
import React from 'react';
import { cx } from '@/components/ui';

export interface MenuRow { key: string; label: string; hint?: string; disabled?: string }

export const CommandMenu: React.FC<{
  id: string; title: string; rows: MenuRow[]; index: number; onHover: (i: number) => void; onPick: (i: number) => void; empty: string;
}> = ({ id, title, rows, index, onHover, onPick, empty }) => (
  <div data-composer-menu className="absolute bottom-full left-3 z-20 mb-1 w-96 max-w-[calc(100%-1.5rem)] rounded-card border border-jz-border bg-jz-raised p-1 shadow-raised">
    <div className="px-2.5 py-1 text-meta text-jz-muted">{title}</div>
    {rows.length === 0 ? <div className="px-2.5 py-2 text-label text-jz-ink-2">{empty}</div> : (
      <ul id={id} role="listbox" aria-label={title} className="max-h-64 overflow-auto">
        {rows.map((r, i) => (
          <li key={r.key} id={`${id}-${i}`} role="option" aria-selected={i === index} aria-disabled={!!r.disabled || undefined} data-menu-row={r.key}
            onMouseEnter={() => onHover(i)} onMouseDown={(e) => { e.preventDefault(); onPick(i); }}
            className={cx('flex min-h-jz-control cursor-default items-baseline gap-3 rounded-control px-2.5 py-1.5 max-[760px]:min-h-jz-touch max-[760px]:items-center', i === index && 'bg-jz-selected')}>
            <span className={cx('flex-none text-label', r.disabled ? 'text-jz-muted' : 'font-medium text-jz-ink')}>{r.label}</span>
            <span className="min-w-0 truncate text-meta text-jz-ink-2">{r.disabled || r.hint}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);
