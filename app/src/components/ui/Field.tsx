import React, { useId } from 'react';
import { Search, X } from 'lucide-react';
import { cx } from './cx';

/** Shared control surface: 36 px, 8 px radius, strong outline (3:1), brand focus ring from the global layer. */
export const CONTROL = 'w-full rounded-control border border-jz-border-strong bg-jz-surface text-body text-jz-ink ' +
  'placeholder:text-jz-muted transition-colors duration-hover hover:border-jz-ink-2 ' +
  'disabled:bg-jz-surface-2 disabled:text-jz-muted disabled:cursor-not-allowed ' +
  'aria-[invalid=true]:border-jz-red';

export interface FieldProps {
  label: React.ReactNode;
  /** Helper text under the control. */
  hint?: React.ReactNode;
  /** Error text under the control; replaces the hint and marks the control invalid. */
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  /** Receives the ids to wire onto the control. */
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
}

/** Label above, helper or error below. */
export const Field: React.FC<FieldProps> = ({ label, hint, error, required, className, children }) => {
  const id = useId();
  const noteId = hint || error ? `${id}-note` : undefined;
  return (
    <div className={cx('flex flex-col gap-1.5 min-w-0', className)}>
      <label htmlFor={id} className="text-label font-medium text-jz-ink-2">
        {label}{required && <span className="text-jz-red" aria-hidden> *</span>}
      </label>
      {children({ id, describedBy: noteId, invalid: !!error })}
      {(error || hint) && (
        <p id={noteId} role={error ? 'alert' : undefined} className={cx('text-meta', error ? 'text-jz-red' : 'text-jz-muted')}>{error || hint}</p>
      )}
    </div>
  );
};

type Ids = { id?: string; describedBy?: string; invalid?: boolean };
const wire = (ids?: Ids) => ({ id: ids?.id, 'aria-describedby': ids?.describedBy, 'aria-invalid': ids?.invalid || undefined });

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { ids?: Ids }>(
  ({ ids, className, ...rest }, ref) => <input ref={ref} {...wire(ids)} className={cx(CONTROL, 'h-jz-control px-3', className)} {...rest} />,
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { ids?: Ids }>(
  ({ ids, className, rows = 3, ...rest }, ref) => <textarea ref={ref} rows={rows} {...wire(ids)} className={cx(CONTROL, 'px-3 py-2 resize-y', className)} {...rest} />,
);
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { ids?: Ids }>(
  ({ ids, className, children, ...rest }, ref) => (
    <select ref={ref} {...wire(ids)} className={cx(CONTROL, 'h-jz-control pl-3 pr-8', className)} {...rest}>{children}</select>
  ),
);
Select.displayName = 'Select';

type CheckProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { label?: React.ReactNode; hint?: React.ReactNode };
const choice = (type: 'checkbox' | 'radio') => {
  const C = React.forwardRef<HTMLInputElement, CheckProps>(({ label, hint, className, disabled, ...rest }, ref) => (
    <label className={cx('inline-flex items-start gap-2 text-body text-jz-ink max-[760px]:min-h-jz-touch max-[760px]:items-center', disabled && 'text-jz-muted cursor-not-allowed', className)}>
      <input ref={ref} type={type} disabled={disabled}
        className={cx('mt-1 max-[760px]:mt-0 h-4 w-4 flex-none border border-jz-border-strong accent-jz-brand', type === 'radio' ? 'rounded-pill' : 'rounded-tag')} {...rest} />
      {(label || hint) && (
        <span className="min-w-0">
          {label}
          {hint && <span className="block text-meta text-jz-muted">{hint}</span>}
        </span>
      )}
    </label>
  ));
  C.displayName = type === 'radio' ? 'Radio' : 'Checkbox';
  return C;
};
export const Checkbox = choice('checkbox');
export const Radio = choice('radio');

export interface SearchFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: string;
  onValueChange: (v: string) => void;
  /** Accessible name; the placeholder alone is not a label. */
  label: string;
}
export const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(
  ({ value, onValueChange, label, className, placeholder, ...rest }, ref) => (
    <div className={cx('relative min-w-0', className)}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-jz-muted pointer-events-none" aria-hidden />
      <input ref={ref} type="search" value={value} onChange={(e) => onValueChange(e.target.value)} aria-label={label}
        placeholder={placeholder ?? label} className={cx(CONTROL, 'h-jz-control pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden')} {...rest} />
      {value && (
        <button type="button" aria-label="清空搜索" title="清空搜索" onClick={() => onValueChange('')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-control text-jz-muted hover:bg-jz-surface-2 hover:text-jz-ink">
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  ),
);
SearchField.displayName = 'SearchField';
