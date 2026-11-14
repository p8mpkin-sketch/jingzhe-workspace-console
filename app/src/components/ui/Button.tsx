import React from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle';
const V: Record<Variant, string> = {
  primary: 'bg-jz-brand hover:bg-jz-brand/85 text-jz-on-brand ',
  ghost: 'bg-jz-surface-2/70 border border-transparent text-jz-ink-2 hover:text-jz-ink hover:bg-jz-surface-2',
  danger: 'bg-jz-sev-critical/90 hover:bg-jz-sev-critical text-jz-on-brand',
  subtle: 'bg-jz-surface-2 text-jz-ink border border-transparent hover:bg-jz-border/40',
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }> =
 ({ variant = 'primary', className = '', ...rest }) => (
    <button {...rest} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-meta font-medium
 transition-colors disabled:opacity-40 disabled:pointer-events-none ${V[variant]} ${className}`} />
);
