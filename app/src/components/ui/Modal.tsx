import React from 'react';
import { Dialog } from './Dialog';

/** Pre-migration API (open, title, onClose, children) on the shared Dialog implementation. */
export const Modal: React.FC<{ open: boolean; title: string; onClose: () => void; children: React.ReactNode }> =
  ({ open, title, onClose, children }) => <Dialog open={open} title={title} onClose={onClose} widthClass="w-[560px]">{children}</Dialog>;
