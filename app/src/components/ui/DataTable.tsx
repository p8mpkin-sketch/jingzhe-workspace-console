import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from './cx';
import { useCompactTable } from './useMediaQuery';
import { Select } from './Field';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  /** Numeric columns: right-aligned, tabular numerals. */
  align?: 'left' | 'right' | 'center';
  /** Ids, packages, hashes, timestamps. */
  mono?: boolean;
  /** Tailwind width class for the column (table layout only). */
  width?: string;
  /** In the record-card layout (below 900 px): `title` leads the card, `action` goes to its footer, `hidden` is dropped. */
  card?: 'title' | 'field' | 'action' | 'hidden';
  /** Label used in the card layout when the header is not plain text. */
  label?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  /** Accessible name of the table. */
  label: string;
  /** compact = 44 px rows, comfortable = 52 px. */
  density?: 'compact' | 'comfortable';
  onRowClick?: (row: T) => void;
  /** Selection. All three are required together; the page keeps the selected set. */
  selected?: Set<string | number>;
  onToggle?: (key: string | number, row: T) => void;
  onToggleAll?: (keys: Array<string | number>, allSelected: boolean) => void;
  /** Sticky header inside a scrolling parent. */
  stickyHeader?: boolean;
  rowDataAttrs?: (row: T) => Record<string, string | number | undefined>;
  rowClassName?: (row: T) => string | undefined;
  /** data-* hooks for the selection checkboxes, so existing probes keep their targets. */
  /** `cards` forces the record-card layout above 900 px, for tables too wide for their container. */
  layout?: 'auto' | 'cards';
  selectAttrs?: { all?: Record<string, string | number | undefined>; row?: (row: T) => Record<string, string | number | undefined> };
  /** Rendered instead of rows (loading / empty / error states supplied by the page, usually via AsyncBoundary). */
  state?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

const alignCls = (a?: 'left' | 'right' | 'center') => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

/**
 * The one table. Header 36 px, rows 44 / 52 px, hover surface-2, semantic <th>, numeric columns right-aligned.
 * Below 900 px it renders the same columns as stacked record cards; never a horizontally scrolling table.
 */
export function DataTable<T>({ columns, rows, rowKey, label, density = 'compact', onRowClick, selected, onToggle, onToggleAll,
  stickyHeader = true, rowDataAttrs, rowClassName, selectAttrs, layout = 'auto', state, footer, className }: DataTableProps<T>) {
  const narrow = useCompactTable();
  const compact = narrow || layout === 'cards';
  const selectable = !!(selected && onToggle);
  const keys = rows.map(rowKey);
  const allSelected = selectable && keys.length > 0 && keys.every((k) => selected!.has(k));
  const someSelected = selectable && keys.some((k) => selected!.has(k));
  const rowH = density === 'compact' ? 'h-jz-row' : 'h-jz-row-lg';
  const activate = (row: T) => (e: React.KeyboardEvent) => { if (onRowClick && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onRowClick(row); } };

  if (compact) {
    const title = columns.find((c) => c.card === 'title') ?? columns[0];
    const actions = columns.filter((c) => c.card === 'action');
    const fields = columns.filter((c) => c !== title && c.card !== 'action' && c.card !== 'hidden');
    return (
      <div className={cx('min-w-0', className)} data-table-layout="cards">
        {state ?? (
          <ul aria-label={label} className="divide-y divide-jz-border">
            {rows.map((row, i) => {
              const k = keys[i];
              return (
                <li key={k} {...rowDataAttrs?.(row)} className={cx('flex gap-3 px-4 py-3', rowClassName?.(row))}>
                  {selectable && (
                    <label className="flex h-jz-touch w-6 flex-none items-start justify-center pt-1">
                      <input type="checkbox" className="h-4 w-4 rounded-tag accent-jz-brand" checked={selected!.has(k)} onChange={() => onToggle!(k, row)} aria-label="选择此行" {...selectAttrs?.row?.(row)} />
                    </label>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={cx('text-body font-medium text-jz-ink break-words', onRowClick && 'cursor-pointer')} role={onRowClick ? 'button' : undefined}
                      tabIndex={onRowClick ? 0 : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined} onKeyDown={activate(row)}>
                      {title.cell(row, i)}
                    </div>
                    <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-label">
                      {fields.map((c) => (
                        <React.Fragment key={c.key}>
                          <dt className="text-jz-muted">{c.label ?? c.header}</dt>
                          <dd className={cx('min-w-0 break-words text-jz-ink-2', c.mono && 'font-mono', c.align === 'right' && 'tnum')}>{c.cell(row, i)}</dd>
                        </React.Fragment>
                      ))}
                    </dl>
                    {actions.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2">{actions.map((c) => <React.Fragment key={c.key}>{c.cell(row, i)}</React.Fragment>)}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {footer}
      </div>
    );
  }

  return (
    <div className={cx('min-w-0', className)} data-table-layout="table">
      <table aria-label={label} className="w-full border-collapse text-label">
        <thead className={cx(stickyHeader && 'sticky top-0 z-[1]')}>
          <tr className="h-jz-table-head bg-jz-surface-2/70 text-meta text-jz-muted">
            {selectable && (
              <th scope="col" className="w-10 pl-4 text-left">
                <input type="checkbox" className="h-4 w-4 rounded-tag accent-jz-brand align-middle" checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                  onChange={() => onToggleAll?.(keys, allSelected)} aria-label="选择本页全部" {...selectAttrs?.all} />
              </th>
            )}
            {columns.map((c) => <th key={c.key} scope="col" className={cx('px-4 font-medium whitespace-nowrap', alignCls(c.align), c.width)}>{c.header}</th>)}
          </tr>
        </thead>
        {!state && (
          <tbody>
            {rows.map((row, i) => {
              const k = keys[i];
              const on = selectable && selected!.has(k);
              return (
                <tr key={k} {...rowDataAttrs?.(row)} aria-selected={selectable ? on : undefined} tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined} onKeyDown={activate(row)}
                  className={cx(rowH, 'border-t border-jz-border text-jz-ink transition-colors duration-hover hover:bg-jz-surface-2', on && 'bg-jz-brand-soft', onRowClick && 'cursor-pointer', rowClassName?.(row))}>
                  {selectable && (
                    <td className="w-10 pl-4" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="h-4 w-4 rounded-tag accent-jz-brand align-middle" checked={on} onChange={() => onToggle!(k, row)} aria-label="选择此行" {...selectAttrs?.row?.(row)} />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={cx('px-4 py-2 align-middle', alignCls(c.align), c.mono && 'font-mono text-meta', c.align === 'right' && 'tnum')}>{c.cell(row, i)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        )}
      </table>
      {state}
      {footer}
    </div>
  );
}

/** Shared table footer: total, page size, previous / next, optional jump-to-page. The page owns the numbers. */
export const Pagination: React.FC<{
  page: number; pageSize: number; total: number; onPage: (p: number) => void;
  onPageSize?: (n: number) => void; pageSizes?: number[]; className?: string; dataAttrs?: Record<string, string | number | undefined>;
  /** Adds a page-number input (Enter to go). Use on long client-side lists. */
  jump?: boolean;
  /** data-* hooks for the inner controls, so existing probes keep their targets. */
  controlAttrs?: {
    prev?: Record<string, string | number | undefined>; next?: Record<string, string | number | undefined>;
    jump?: Record<string, string | number | undefined>; size?: (n: number) => Record<string, string | number | undefined>;
  };
  /** Replaces the default "共 N 条" summary. */
  summary?: React.ReactNode;
}> = ({ page, pageSize, total, onPage, onPageSize, pageSizes = [12, 24, 50, 100], className, dataAttrs, jump, controlAttrs, summary }) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const [to, setTo] = React.useState('');
  const nav = 'grid h-8 w-8 place-items-center rounded-control border border-jz-border text-jz-ink-2 hover:bg-jz-surface-2 disabled:opacity-45 disabled:pointer-events-none max-[760px]:h-jz-touch max-[760px]:w-jz-touch';
  return (
    <nav aria-label="分页" className={cx('flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-jz-border px-4 py-2.5 text-label text-jz-muted', className)} {...dataAttrs}>
      <span>{summary ?? <>共 <span className="tnum text-jz-ink-2">{total}</span> 条</>}</span>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSize && (
          <label className="flex items-center gap-2">
            <span className="max-[760px]:sr-only">每页</span>
            <span className="w-24 flex-none">
              <Select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="!h-8 text-label" aria-label="每页条数">
                {pageSizes.map((n) => <option key={n} value={n} {...controlAttrs?.size?.(n)}>{n}</option>)}
              </Select>
            </span>
          </label>
        )}
        {jump && pages > 1 && (
          <label className="flex items-center gap-2">
            <span className="max-[760px]:sr-only">跳至</span>
            <input value={to} inputMode="numeric" aria-label="跳至页码" placeholder="页码" {...controlAttrs?.jump}
              onChange={(e) => setTo(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') { const p = Number(to); if (p >= 1 && p <= pages) onPage(p); setTo(''); } }}
              className="h-8 w-16 rounded-control border border-jz-border-strong bg-jz-surface px-2 text-center font-mono text-label tnum text-jz-ink placeholder:text-jz-muted" />
          </label>
        )}
        <button type="button" className={nav} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="上一页" title="上一页" {...controlAttrs?.prev}><ChevronLeft size={16} aria-hidden /></button>
        <span className="tnum text-jz-ink-2" aria-live="polite">{page} / {pages}</span>
        <button type="button" className={nav} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="下一页" title="下一页" {...controlAttrs?.next}><ChevronRight size={16} aria-hidden /></button>
      </div>
    </nav>
  );
};

/** Appears when rows are selected: count on the left, batch actions on the right, clear at the end. */
export const BulkBar: React.FC<{ count: number; onClear: () => void; children: React.ReactNode; className?: string }> = ({ count, onClear, children, className }) => {
  if (count <= 0) return null;
  return (
    <div role="region" aria-label="批量操作" data-bulk-bar className={cx('flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-jz-border bg-jz-brand-soft px-4 py-2 text-label text-jz-ink', className)}>
      <span>已选 <span className="tnum font-semibold">{count}</span> 项</span>
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
      <button type="button" onClick={onClear} className="rounded-control px-2 h-8 text-jz-ink-2 hover:bg-jz-surface hover:text-jz-ink">取消选择</button>
    </div>
  );
};
