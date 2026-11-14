import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { useToastItems, type ToastKind } from './ToastContext';

// R108-1(指令1③): ToastContainer 全局单容器——右上角毛玻璃质感(backdrop-blur)+自动消失+进度微线。
// 挂载于 main.tsx ThemeProvider 内层(与既有 Toaster z-[60] 并存, 本容器 z-[65] < CmdPalette z-[100])。
// 纯呈现: 数据来自 ToastProvider context, 零请求零业务语义。

const ICON: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 shrink-0 text-jz-teal" />,
  error: <XCircle className="w-4 h-4 shrink-0 text-jz-red" />,
  warning: <AlertTriangle className="w-4 h-4 shrink-0 text-jz-amber" />,
};

const BAR: Record<ToastKind, string> = {
  success: 'bg-jz-teal',
  error: 'bg-jz-red',
  warning: 'bg-jz-amber',
};

export const ToastContainer: React.FC = () => {
  const items = useToastItems();
  if (items.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 z-[65] w-72 space-y-2 pointer-events-none" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          data-testid={`toast-${t.kind}`}
          className="jz-toast-in pointer-events-auto overflow-hidden rounded-control border border-jz-border
                     bg-jz-surface-2/80 backdrop-blur-md shadow-card"
        >
          <div className="flex items-start gap-2 px-3 py-2.5 text-meta text-jz-ink">
            {ICON[t.kind]}
            <span className="flex-1 break-words leading-relaxed">{t.text}</span>
          </div>
          {/* 进度微线: 时长与自动消失同步(内联 animation-duration 按 toast.duration 注入) */}
          <div className="h-0.5 bg-jz-border">
            <div
              className={`jz-toast-progress h-full ${BAR[t.kind]}`}
              style={{ animationDuration: `${t.duration}ms` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
