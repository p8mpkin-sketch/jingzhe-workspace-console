import React, { useEffect, useId, useRef, useState } from 'react';
import { cx } from './cx';

/** Click-triggered floating panel anchored to its trigger. Closes on outside click and Escape; returns focus. */
export const Popover: React.FC<{
  /** Render the trigger; spread the props onto a button. */
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-controls': string; 'aria-haspopup': 'dialog' | 'menu' }) => React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  align?: 'start' | 'end';
  side?: 'bottom' | 'top';
  label: string;
  role?: 'dialog' | 'menu';
  className?: string;
}> = ({ trigger, children, align = 'end', side = 'bottom', label, role = 'dialog', className }) => {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      wrap.current?.querySelector<HTMLElement>('button')?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <span ref={wrap} className="relative inline-flex">
      {trigger({ onClick: () => setOpen((v) => !v), 'aria-expanded': open, 'aria-controls': id, 'aria-haspopup': role })}
      {open && (
        <div id={id} role={role} aria-label={label}
          className={cx('absolute z-30 min-w-48 max-w-[92vw] rounded-card border border-jz-border bg-jz-surface p-1.5 shadow-dialog',
            side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5', align === 'end' ? 'right-0' : 'left-0', className)}>
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </span>
  );
};

/** One row of a Popover used as a menu. */
export const MenuItem: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode; danger?: boolean }> =
  ({ icon, danger, className, children, type = 'button', ...rest }) => (
    <button type={type} role="menuitem" className={cx('flex w-full items-center gap-2 rounded-control px-2.5 h-jz-control max-[760px]:h-jz-touch text-label text-left whitespace-nowrap disabled:opacity-45',
      danger ? 'text-jz-red hover:bg-jz-red/10' : 'text-jz-ink hover:bg-jz-surface-2', className)} {...rest}>
      {icon}{children}
    </button>
  );

/** Text hint on hover and keyboard focus. The child keeps its own accessible name; this only adds a description. */
export const Tooltip: React.FC<{ content: React.ReactNode; children: React.ReactElement; side?: 'top' | 'bottom' }> = ({ content, children, side = 'top' }) => {
  const id = useId();
  return (
    <span className="group/tt relative inline-flex">
      {React.cloneElement(children, { 'aria-describedby': id })}
      <span id={id} role="tooltip"
        className={cx('pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-control bg-jz-ink px-2 py-1 text-meta text-jz-canvas opacity-0 transition-opacity duration-hover',
          'group-hover/tt:opacity-100 group-focus-within/tt:opacity-100', side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5')}>
        {content}
      </span>
    </span>
  );
};
