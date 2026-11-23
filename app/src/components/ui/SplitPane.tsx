import React, { useCallback, useRef } from 'react';
import { cx } from './cx';

/**
 * Two panes with a keyboard-operable separator. The secondary pane (right) has a pixel width between `min` and
 * `max`; the primary pane takes the rest. Drag the separator, or focus it and use ← / → (Shift = larger step),
 * Home / End for the limits, double-click or Enter to reset. No animation while dragging.
 */
export const SplitPane: React.FC<{
  primary: React.ReactNode;
  secondary: React.ReactNode | null;
  width: number;
  onWidth: (w: number) => void;
  min: number;
  max: number;
  reset: number;
  label: string;
  className?: string;
}> = ({ primary, secondary, width, onWidth, min, max, reset, label, className }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const clamp = useCallback((w: number) => Math.round(Math.min(max, Math.max(min, w))), [min, max]);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const right = wrap.current?.getBoundingClientRect().right ?? window.innerWidth;
    const move = (ev: PointerEvent) => onWidth(clamp(right - ev.clientX));
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === 'ArrowLeft') { e.preventDefault(); onWidth(clamp(width + step)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onWidth(clamp(width - step)); }
    else if (e.key === 'Home') { e.preventDefault(); onWidth(max); }
    else if (e.key === 'End') { e.preventDefault(); onWidth(min); }
    else if (e.key === 'Enter') { e.preventDefault(); onWidth(reset); }
  };
  return (
    <div ref={wrap} className={cx('flex min-h-0 min-w-0 flex-1', className)} data-split-pane>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{primary}</div>
      {secondary != null && (
        <>
          <div role="separator" tabIndex={0} aria-orientation="vertical" aria-label={label}
            aria-valuemin={min} aria-valuemax={max} aria-valuenow={width}
            onPointerDown={onPointerDown} onKeyDown={onKeyDown} onDoubleClick={() => onWidth(reset)} data-split-separator
            className="group relative w-px flex-none cursor-col-resize touch-none bg-jz-border outline-none before:absolute before:inset-y-0 before:-left-1.5 before:w-3 before:content-[''] hover:bg-jz-border-strong focus-visible:bg-jz-brand">
            <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-jz-border-strong opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:bg-jz-brand group-focus-visible:opacity-100" />
          </div>
          <div className="flex min-h-0 flex-none flex-col" style={{ width }} data-split-secondary>{secondary}</div>
        </>
      )}
    </div>
  );
};
