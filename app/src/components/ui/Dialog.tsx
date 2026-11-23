import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cx } from './cx';
import { Button } from './Button';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Focus trap + Escape + focus restore for any overlay surface. */
export function useOverlay(open: boolean, onClose: () => void, opts: { closeOnEscape?: boolean } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const esc = opts.closeOnEscape !== false;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    if (panel && !panel.contains(document.activeElement)) {
      const first = panel.querySelector<HTMLElement>('[data-autofocus],input,textarea,select,button:not([data-modal-close])');
      (first || panel).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && esc) { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !panel) return;
      const els = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (els.length === 0) { e.preventDefault(); return; }
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); prev?.focus?.(); };
  }, [open, esc]);
  return ref;
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Footer row: cancel on the left of the primary action, primary last. */
  footer?: React.ReactNode;
  /** Width class. Default caps at the 640 px dialog token; always full-width sheet below 760 px. */
  widthClass?: string;
  /** Destructive confirms pass false: neither backdrop nor Escape dismisses them. */
  dismissible?: boolean;
  role?: 'dialog' | 'alertdialog';
  dataAttrs?: Record<string, string | undefined>;
}

/** The one dialog implementation. Header, scrolling body, footer. Mobile: bottom sheet, full width. */
export const Dialog: React.FC<DialogProps> = ({ open, onClose, title, description, children, footer, widthClass = 'w-full max-w-jz-dialog', dismissible = true, role = 'dialog', dataAttrs }) => {
  const ref = useOverlay(open, onClose, { closeOnEscape: dismissible });
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-jz-scrim/50 p-4 modal-overlay-in max-[760px]:items-end max-[760px]:p-0"
      onMouseDown={dismissible ? onClose : undefined} data-unified-modal {...dataAttrs}>
      <div ref={ref} role={role} aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : '对话框'} tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx(widthClass, 'flex max-h-[86vh] max-w-[92vw] flex-col rounded-dialog border border-jz-border bg-jz-overlay shadow-dialog outline-none modal-panel-in',
          'max-[760px]:w-full max-[760px]:max-w-full max-[760px]:max-h-[92vh] max-[760px]:rounded-b-none')}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {title && <h2 id={titleId} className="text-section font-semibold text-jz-ink break-words">{title}</h2>}
            {description && <p className="mt-1 text-label text-jz-muted">{description}</p>}
          </div>
          {dismissible && (
            <button type="button" data-modal-close onClick={onClose} aria-label="关闭" title="关闭"
              className="-mr-1.5 grid h-8 w-8 flex-none place-items-center rounded-control text-jz-muted hover:bg-jz-surface-2 hover:text-jz-ink">
              <X size={16} aria-hidden />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto px-5 pb-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-jz-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
};

/**
 * Confirmation for every destructive or bulk action. States what will happen and whether it can be undone;
 * the confirm button is the only filled red control. Not dismissible by backdrop or Escape.
 */
export const ConfirmDialog: React.FC<{
  open: boolean;
  title: React.ReactNode;
  /** What will happen, in plain words. */
  children?: React.ReactNode;
  /** One line on the outcome: reversible or permanent. */
  outcome?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, children, outcome, confirmLabel = '确认', cancelLabel = '取消', destructive = true, busy = false, onConfirm, onCancel }) => (
  <Dialog open={open} onClose={onCancel} title={title} role="alertdialog" dismissible={false} widthClass="w-full max-w-md"
    footer={<>
      <Button variant="secondary" onClick={onCancel} disabled={busy} data-autofocus data-confirm-cancel>{cancelLabel}</Button>
      <Button variant={destructive ? 'danger-solid' : 'primary'} onClick={onConfirm} loading={busy} data-confirm-ok>{confirmLabel}</Button>
    </>}>
    {children && <div className="text-body text-jz-ink-2">{children}</div>}
    {outcome && <p className="text-label text-jz-muted">{outcome}</p>}
  </Dialog>
);
