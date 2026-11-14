import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { useToastItems, type ToastKind } from './ToastContext';

// R108-1(指令1③): ToastContainer 全局单容器——右上角毛玻璃质感(backdrop-blur)+自动消失+进度微线。
// 挂载于 main.tsx ThemeProvider 内层(与既有 Toaster z-[60] 并存, 本容器 z-[65] < CmdPalette z-[100])。
// 纯呈现: 数据来自 ToastProvider context, 零请求零业务语义。

const ICON: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 shrink-0 text-jz-accent-emerald" />,
  error: <XCircle className="w-4 h-4 shrink-0 text-jz-accent-crimson" />,
  warning: <AlertTriangle className="w-4 h-4 shrink-0 text-jz-accent-amber" />,
};

const BAR: Record<ToastKind, string> = {
  success: 'bg-jz-accent-emerald',
  error: 'bg-jz-accent-crimson',
  warning: 'bg-jz-accent-amber',
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
          className="apksec-toast-in pointer-events-auto overflow-hidden rounded-lg border border-jz-border
                     bg-jz-elevated/80 backdrop-blur-md shadow-jz-card"
        >
          <div className="flex items-start gap-2 px-3 py-2.5 text-xs text-jz-text-primary">
            {ICON[t.kind]}
            <span className="flex-1 break-words leading-relaxed">{t.text}</span>
          </div>
          {/* 进度微线: 时长与自动消失同步(内联 animation-duration 按 toast.duration 注入) */}
          <div className="h-0.5 bg-jz-border">
            <div
              className={`apksec-toast-progress h-full ${BAR[t.kind]}`}
              style={{ animationDuration: `${t.duration}ms` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
