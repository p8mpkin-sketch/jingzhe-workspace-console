import React from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from './cx';

/** `subtle` is the pre-migration name for `secondary`; it is kept so existing call sites compile. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-jz-brand text-jz-on-brand border border-transparent hover:bg-jz-brand/90',
  secondary: 'bg-jz-surface text-jz-ink border border-jz-border hover:bg-jz-surface-2',
  subtle: 'bg-jz-surface text-jz-ink border border-jz-border hover:bg-jz-surface-2',
  ghost: 'bg-transparent text-jz-ink-2 border border-transparent hover:bg-jz-surface-2 hover:text-jz-ink',
  danger: 'bg-transparent text-jz-red border border-jz-red/40 hover:bg-jz-red/10',
  'danger-solid': 'bg-jz-red text-jz-on-red border border-transparent hover:bg-jz-red/90',
};
/** sm is for dense toolbars and table rows only; md / lg are the 36 / 40 px controls of the design system. */
const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-meta gap-1.5',
  md: 'h-jz-control px-3.5 text-label gap-2',
  lg: 'h-jz-control-lg px-4 text-label gap-2',
};
const BASE = 'inline-flex items-center justify-center rounded-control font-medium whitespace-nowrap select-none ' +
  'transition-colors duration-hover disabled:opacity-45 disabled:pointer-events-none';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks clicks while an action is in flight. */
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, icon, className, children, disabled, type = 'button', ...rest }, ref) => (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx(BASE, SIZE[size], VARIANT[variant], className)} {...rest}>
      {loading ? <Loader2 size={16} className="animate-spin flex-none" aria-hidden /> : icon}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'title'> {
  /** Required: an icon-only control always carries a name, shown as tooltip and read by assistive tech. */
  label: string;
  variant?: Exclude<ButtonVariant, 'subtle'>;
  size?: ButtonSize;
}
const ICON_SIZE: Record<ButtonSize, string> = { sm: 'h-8 w-8', md: 'h-jz-control w-jz-control', lg: 'h-jz-control-lg w-jz-control-lg' };

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, variant = 'ghost', size = 'md', className, children, type = 'button', ...rest }, ref) => (
    <button ref={ref} type={type} aria-label={label} title={label}
      className={cx(BASE, ICON_SIZE[size], VARIANT[variant], 'max-[760px]:min-h-jz-touch max-[760px]:min-w-jz-touch', className)} {...rest}>
      {children}
    </button>
  ),
);
IconButton.displayName = 'IconButton';
