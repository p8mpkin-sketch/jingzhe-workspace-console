import React from 'react';
import { X } from 'lucide-react';

export const Drawer: React.FC<{ open: boolean; title: string; onClose: () => void; width?: number; children: React.ReactNode }> =
 ({ open, title, onClose, width, children }) => {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onMouseDown={onClose}>
        <div style={width ? { width } : undefined}
 className="w-[440px] max-w-[92vw] h-full bg-jz-surface border-l border-jz-border shadow-jz-card p-4 overflow-auto space-y-3"
 onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-jz-text-primary">{title}</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-jz-elevated text-jz-text-muted">
              <X className="w-4 h-4" />
            </button>
          </div>
          {children}
        </div>
      </div>
    );
  };
