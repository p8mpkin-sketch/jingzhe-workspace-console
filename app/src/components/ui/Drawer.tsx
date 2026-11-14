import React from 'react';
import { X } from 'lucide-react';

export const Drawer: React.FC<{ open: boolean; title: string; onClose: () => void; width?: number; children: React.ReactNode }> =
 ({ open, title, onClose, width, children }) => {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-40 flex justify-end bg-jz-scrim/50" onMouseDown={onClose}>
        <div style={width ? { width } : undefined}
 className="w-[440px] max-w-[92vw] h-full bg-jz-surface border-l border-jz-border shadow-card p-4 overflow-auto space-y-3"
 onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h3 className="text-body font-semibold text-jz-ink">{title}</h3>
            <button onClick={onClose} className="p-1 rounded-control hover:bg-jz-surface-2 text-jz-muted">
              <X className="w-4 h-4" />
            </button>
          </div>
          {children}
        </div>
      </div>
    );
  };
