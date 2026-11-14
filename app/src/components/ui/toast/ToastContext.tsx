import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

// R108-1(指令1③): Toast 系统 Context 层——ToastProvider + useToast(toast.success/error/warning)。
// 与既有 Toast.tsx(zustand, ok/err/info, 右下)并存零触碰(只加不改): 本套为新增消费入口(success/error/warning),
// 渲染容器=ToastContainer(右上毛玻璃+进度微线, main.tsx ThemeProvider 内层全局单挂载)。
// 行为零变化红线: 仅增反馈通道, 不接管既有 toast.ok/err/info 调用点(R108-2 接入轮按需切换)。

export type ToastKind = 'success' | 'error' | 'warning';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
  /** 自动消失时长 ms(进度微线同步用) */
  duration: number;
}

export interface ToastApi {
  success: (text: string, duration?: number) => void;
  error: (text: string, duration?: number) => void;
  warning: (text: string, duration?: number) => void;
}

/** 默认自动消失 3.5s(指令1③) */
export const DEFAULT_TOAST_DURATION = 3500;
/** 栈上限: 超出时挤掉最旧一条, 防止连发刷屏 */
const MAX_STACK = 5;

const ToastItemsCtx = createContext<ToastItem[]>([]);
const ToastApiCtx = createContext<ToastApi | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((kind: ToastKind, text: string, duration: number = DEFAULT_TOAST_DURATION) => {
    const id = ++seq.current;
    setItems((s) => [...s.slice(-(MAX_STACK - 1)), { id, kind, text, duration }]);
    window.setTimeout(() => {
      setItems((s) => s.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (text, duration) => push('success', text, duration),
      error: (text, duration) => push('error', text, duration),
      warning: (text, duration) => push('warning', text, duration),
    }),
    [push]
  );

  return (
    <ToastApiCtx.Provider value={api}>
      <ToastItemsCtx.Provider value={items}>{children}</ToastItemsCtx.Provider>
    </ToastApiCtx.Provider>
  );
};

/** 触发入口: const toast = useToast(); toast.success('…') / error / warning */
export function useToast(): ToastApi {
  const ctx = useContext(ToastApiCtx);
  if (!ctx) throw new Error('useToast 必须在 <ToastProvider> 内使用');
  return ctx;
}

/** 容器订阅(仅 ToastContainer 消费; Api 与 Items 分离, 触发方不因 items 变化重渲染) */
export function useToastItems(): ToastItem[] {
  return useContext(ToastItemsCtx);
}
