import React from 'react';
import { create } from 'zustand';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';

type ToastKind = 'ok' | 'err' | 'info';
interface ToastItem { id: number; kind: ToastKind; text: string; }
interface ToastState { items: ToastItem[]; push: (kind: ToastKind, text: string) => void; }

export const useToasts = create<ToastState>((set) => ({
 items: [],
 push: (kind, text) => {
 const id = Date.now() + Math.random();
 set((s) => ({ items: [...s.items, { id, kind, text }] }));
 setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), 3500);
 },
}));
export const toast = { ok: (t: string) => useToasts.getState().push('ok', t),
 err: (t: string) => useToasts.getState().push('err', t),
 info: (t: string) => useToasts.getState().push('info', t) };

const ICON: Record<ToastKind, React.ReactNode> = {
  ok: <CheckCircle2 className="w-4 h-4 text-jz-teal" />,
  err: <AlertTriangle className="w-4 h-4 text-jz-sev-critical" />,
  info: <Info className="w-4 h-4 text-jz-brand" />,
};

export const Toaster: React.FC = () => {
 const items = useToasts((s) => s.items);
  return (
    <div className="fixed bottom-4 right-4 z-[60] space-y-2">
 {items.map((t) => (
        <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-control bg-jz-surface-2 border border-jz-border
 shadow-card text-meta text-jz-ink">
          {ICON[t.kind]}<span>{t.text}</span>
        </div>
      ))}
    </div>
  );
};
