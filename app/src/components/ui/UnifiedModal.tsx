import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * R104-1 ④: 现代对话框基底(V3 三铁律③「禁纯白方框弹窗」的标准载体)。
 * ESC 退出 / 遮罩平滑淡入 + 入场放大动效(modal-overlay-in / modal-panel-in, styles/index.css)
 * / 标准投影(shadow-card token, 双模变量承载)/ 面色=jz-surface token(非纯白方框)。
 * focus trap 基础可达性: 开启时聚焦面板内首个可聚焦元素(缺省面板本身), Tab 循环锁定在
 * 对话框内; role=dialog + aria-modal + aria-label。
 */
export const UnifiedModal: React.FC<{
 open: boolean;
 /** R104-5: 放宽为 ReactNode(徽章+名称复合标题)——string 既有消费方渲染零变化 */
 title?: React.ReactNode;
 onClose: () => void;
 children: React.ReactNode;
 footer?: React.ReactNode;
 /** 宽度类, 缺省 w-[560px](恒受 max-w-[92vw] 约束) */
 widthClass?: string;
}> = ({ open, title, onClose, children, footer, widthClass = 'w-[560px]' }) => {
  const panelRef = useRef<HTMLDivElement>(null);

 useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (panel) {
      const first = panel.querySelector<HTMLElement>(
 'input,textarea,select,button:not([data-modal-close])',
 );
 (first || panel).focus();
 }
 const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key === 'Tab' && panel) {
        const els = Array.from(panel.querySelectorAll<HTMLElement>(
 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
 )).filter((el) => el.offsetParent !== null);
 if (els.length === 0) return;
 const firstEl = els[0];
 const lastEl = els[els.length - 1];
 if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
 else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
 }
 };
 document.addEventListener('keydown', onKey, true);
 return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
 className="fixed inset-0 z-50 flex items-center justify-center bg-jz-scrim/60 modal-overlay-in p-4"
 onMouseDown={onClose}
 data-unified-modal
 >
      <div
 ref={panelRef}
 role="dialog"
 aria-modal="true"
 aria-label={typeof title === 'string' ? title : '对话框'}
 tabIndex={-1}
 onMouseDown={(e) => e.stopPropagation()}
 className={`${widthClass} max-w-[92vw] max-h-[86vh] overflow-auto bg-jz-surface border border-jz-border
 rounded-card shadow-card modal-panel-in outline-none p-4 space-y-3`}
 >
        <div className="flex items-center justify-between gap-2">
          {title && <h3 className="text-body font-semibold text-jz-ink truncate">{title}</h3>}
          <button
 type="button"
 data-modal-close
 onClick={onClose}
 aria-label="关闭"
 className={`p-1 rounded-control hover:bg-jz-surface-2 text-jz-muted transition-colors ${title ? '' : 'ml-auto'}`}
 >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
        {footer && <div className="pt-1">{footer}</div>}
      </div>
    </div>
  );
};
