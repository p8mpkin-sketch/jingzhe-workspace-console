import React from 'react';
import { X } from 'lucide-react';

export const Modal: React.FC<{ open: boolean; title: string; onClose: () => void; children: React.ReactNode }> =
 ({ open, title, onClose, children }) => {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-jz-scrim/70" onMouseDown={onClose}>
        <div className="w-[560px] max-w-[92vw] max-h-[86vh] overflow-auto bg-jz-surface border border-jz-border
 rounded-control shadow-card p-4 space-y-3"
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
