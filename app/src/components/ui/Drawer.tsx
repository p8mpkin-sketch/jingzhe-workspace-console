import React, { useId } from 'react';
import { X } from 'lucide-react';
import { cx } from './cx';
import { useOverlay } from './Dialog';

/** Side panel for detail views. Focus trap, Escape and backdrop close; full width below 760 px. */
export const Drawer: React.FC<{
  open: boolean; title: React.ReactNode; onClose: () => void; width?: number; side?: 'right' | 'left';
  footer?: React.ReactNode; children: React.ReactNode;
}> = ({ open, title, onClose, width, side = 'right', footer, children }) => {
  const ref = useOverlay(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className={cx('fixed inset-0 z-40 flex bg-jz-scrim/50 modal-overlay-in', side === 'right' ? 'justify-end' : 'justify-start')} onMouseDown={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} style={width ? { width } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx('flex h-full w-[440px] max-w-[92vw] flex-col bg-jz-surface shadow-dialog outline-none max-[760px]:!w-full max-[760px]:max-w-full',
          side === 'right' ? 'border-l border-jz-border' : 'border-r border-jz-border')}>
        <div className="flex items-center justify-between gap-3 border-b border-jz-border px-4 py-3">
          <h2 id={titleId} className="min-w-0 truncate text-section font-semibold text-jz-ink">{title}</h2>
          <button type="button" data-modal-close onClick={onClose} aria-label="关闭" title="关闭"
            className="grid h-8 w-8 flex-none place-items-center rounded-control text-jz-muted hover:bg-jz-surface-2 hover:text-jz-ink">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-jz-border px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
};
