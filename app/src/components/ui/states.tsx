import React from 'react';
import { AlertTriangle, CheckCircle2, Info, Inbox, Lock, RefreshCw, XCircle, type LucideIcon } from 'lucide-react';
import { cx } from './cx';
import { Button } from './Button';
import { SkeletonLoader, type SkeletonVariant } from './SkeletonLoader';

type AlertTone = 'info' | 'success' | 'attention' | 'danger';
const ALERT: Record<AlertTone, { icon: LucideIcon; cls: string; ic: string }> = {
  info: { icon: Info, cls: 'border-jz-border bg-jz-surface-2', ic: 'text-jz-brand' },
  success: { icon: CheckCircle2, cls: 'border-jz-teal/30 bg-jz-teal/10', ic: 'text-jz-teal' },
  attention: { icon: AlertTriangle, cls: 'border-jz-amber/40 bg-jz-amber/10', ic: 'text-jz-amber' },
  danger: { icon: XCircle, cls: 'border-jz-red/30 bg-jz-red/10', ic: 'text-jz-red' },
};

/** Inline message inside the page flow: result of an action, a caveat, a stale or partial-data notice. */
export const InlineAlert: React.FC<{
  tone?: AlertTone; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>> = ({ tone = 'info', title, children, action, className, ...rest }) => {
  const a = ALERT[tone]; const Icon = a.icon;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex flex-wrap items-start gap-x-3 gap-y-2 rounded-control border px-3 py-2.5 text-label text-jz-ink', a.cls, className)} {...rest}>
      <Icon size={16} className={cx('mt-0.5 flex-none', a.ic)} aria-hidden />
      <div className="min-w-0 flex-1 basis-56">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={cx('text-jz-ink-2', !!title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="flex flex-none items-center gap-2">{action}</div>}
    </div>
  );
};

/** Empty is never a dead end: say why it is empty, offer the next action, and at most one shortcut. */
export const EmptyState: React.FC<{
  icon?: LucideIcon; title: React.ReactNode;
  /** Why there is nothing here. */
  cause?: React.ReactNode;
  /** The next action, usually a Button. */
  action?: React.ReactNode;
  /** One relevant shortcut (a link). */
  shortcut?: React.ReactNode;
  compact?: boolean; className?: string;
}> = ({ icon: Icon = Inbox, title, cause, action, shortcut, compact, className }) => (
  <div data-state="empty" className={cx('flex flex-col items-center justify-center text-center', compact ? 'gap-1.5 px-4 py-6' : 'gap-2 px-6 py-12', className)}>
    <div className="grid h-10 w-10 place-items-center rounded-card bg-jz-surface-2 text-jz-muted"><Icon size={compact ? 16 : 18} aria-hidden /></div>
    <div className="text-body font-semibold text-jz-ink">{title}</div>
    {cause && <p className="max-w-sm text-label text-jz-muted">{cause}</p>}
    {(action || shortcut) && <div className="mt-2 flex flex-wrap items-center justify-center gap-3">{action}{shortcut && <span className="text-label">{shortcut}</span>}</div>}
  </div>
);

/** A load failed. Shows the message the API returned and a retry. Red is reserved for this blocking case. */
export const ErrorState: React.FC<{ title?: React.ReactNode; message?: React.ReactNode; onRetry?: () => void; compact?: boolean; className?: string }> =
  ({ title = '加载失败', message, onRetry, compact, className }) => (
    <div role="alert" data-state="error" className={cx('flex flex-col items-center justify-center text-center', compact ? 'gap-1.5 px-4 py-6' : 'gap-2 px-6 py-12', className)}>
      <div className="grid h-10 w-10 place-items-center rounded-card bg-jz-red/10 text-jz-red"><XCircle size={18} aria-hidden /></div>
      <div className="text-body font-semibold text-jz-ink">{title}</div>
      {message && <p className="max-w-md break-words text-label text-jz-muted">{message}</p>}
      {onRetry && <Button variant="secondary" className="mt-2" icon={<RefreshCw size={16} aria-hidden />} onClick={onRetry}>重试</Button>}
    </div>
  );

/** The API answered 401 / 403. The page keeps its place; nothing is hidden or revealed beyond what the API decided. */
export const PermissionState: React.FC<{ title?: React.ReactNode; message?: React.ReactNode; action?: React.ReactNode; compact?: boolean; className?: string }> =
  ({ title = '没有访问权限', message = '当前账号无权查看这部分内容。如需访问,请联系管理员。', action, compact, className }) => (
    <div data-state="permission" className={cx('flex flex-col items-center justify-center text-center', compact ? 'gap-1.5 px-4 py-6' : 'gap-2 px-6 py-12', className)}>
      <div className="grid h-10 w-10 place-items-center rounded-card bg-jz-surface-2 text-jz-muted"><Lock size={18} aria-hidden /></div>
      <div className="text-body font-semibold text-jz-ink">{title}</div>
      {message && <p className="max-w-sm text-label text-jz-muted">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );

/** Data is on screen but a refresh failed or it is older than expected: say so, with the time and a refresh. */
export const StaleNotice: React.FC<{ since?: React.ReactNode; reason?: React.ReactNode; onRefresh?: () => void; refreshing?: boolean; className?: string }> =
  ({ since, reason, onRefresh, refreshing, className }) => (
    <InlineAlert tone="attention" data-state="stale" className={className} title="显示的可能不是最新数据"
      action={onRefresh && <Button size="sm" variant="secondary" loading={refreshing} icon={<RefreshCw size={14} aria-hidden />} onClick={onRefresh}>刷新</Button>}>
      {reason ?? '最近一次刷新未成功。'}{since && <> 上次更新: <span className="tnum">{since}</span></>}
    </InlineAlert>
  );

export interface AsyncState {
  loading?: boolean;
  /** Error from the load; an object with `status` 401 / 403 renders the permission state. */
  error?: unknown;
  empty?: boolean;
  /** Data is shown but a later refresh failed. */
  stale?: boolean;
}
const statusOf = (e: unknown): number | undefined => (e && typeof e === 'object' && 'status' in e ? Number((e as { status: unknown }).status) : undefined);
const messageOf = (e: unknown): string => (typeof e === 'string' ? e : e instanceof Error ? e.message : e ? String(e) : '');

/**
 * Picks loading → permission → error → empty → content (+ stale notice) from flags the page already holds.
 * It does not fetch and does not decide permissions; it only renders what the page's own request returned.
 */
export const AsyncBoundary: React.FC<AsyncState & {
  skeleton?: SkeletonVariant | React.ReactNode;
  emptyState?: React.ReactNode;
  onRetry?: () => void;
  staleSince?: React.ReactNode;
  compact?: boolean;
  children: React.ReactNode;
}> = ({ loading, error, empty, stale, skeleton = 'table', emptyState, onRetry, staleSince, compact, children }) => {
  if (loading) return <div data-state="loading" className="p-4">{typeof skeleton === 'string' ? <SkeletonLoader variant={skeleton as SkeletonVariant} /> : skeleton}</div>;
  if (error && !stale) {
    const st = statusOf(error);
    if (st === 401 || st === 403) return <PermissionState compact={compact} />;
    return <ErrorState message={messageOf(error)} onRetry={onRetry} compact={compact} />;
  }
  if (empty) return <>{emptyState ?? <EmptyState title="暂无数据" compact={compact} />}</>;
  return (
    <>
      {stale && <StaleNotice className="mb-3" since={staleSince} reason={messageOf(error) || undefined} onRefresh={onRetry} />}
      {children}
    </>
  );
};
