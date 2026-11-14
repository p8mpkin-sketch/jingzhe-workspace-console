import React from 'react';
import { Dialog } from './Dialog';

/** Pre-migration API (title as node, footer, widthClass) on the shared Dialog implementation. */
export const UnifiedModal: React.FC<{
  open: boolean;
  title?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Width class; default 560 px, always capped by the viewport. */
  widthClass?: string;
}> = ({ open, title, onClose, children, footer, widthClass = 'w-[560px]' }) => (
  <Dialog open={open} title={title} onClose={onClose} footer={footer} widthClass={widthClass}>{children}</Dialog>
);
