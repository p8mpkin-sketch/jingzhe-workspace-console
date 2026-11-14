import React from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle';
const V: Record<Variant, string> = {
  primary: 'bg-neon-accent hover:bg-neon-accent/85 text-white shadow-neon-glow',
  ghost: 'bg-jz-elevated/70 border border-transparent text-jz-text-secondary hover:text-jz-text-primary hover:bg-jz-elevated',
  danger: 'bg-vuln-critical/90 hover:bg-vuln-critical text-white',
  subtle: 'bg-jz-elevated text-jz-text-primary border border-transparent hover:bg-jz-border/40',
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }> =
 ({ variant = 'primary', className = '', ...rest }) => (
    <button {...rest} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
 transition-colors disabled:opacity-40 disabled:pointer-events-none ${V[variant]} ${className}`} />
);
