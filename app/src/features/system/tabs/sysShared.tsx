// sysShared.tsx — small pieces shared by the system tabs: a read's state block and number helpers.
import React from 'react';
import { ErrorState, PermissionState, SkeletonLoader, StaleNotice } from '@/components/ui';
import { STALE_WORD, useSlow } from '@/features/dashboard/readout';
import type { Read } from '@/features/dashboard/readout';

/** A finite number from a field, or null when the field is absent: shown as 未返回, never as 0. */
export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const MISSING = '未返回';

/** Loading (with a slow note after 2 s), 403 without retry, failure with retry; null when there is a value. */
export function ReadBlock<T>({ read, what, skeleton = 'table' }: { read: Read<T>; what: string; skeleton?: 'table' | 'metrics' | 'card' }): React.ReactElement | null {
  const slow = useSlow(read.state === 'loading');
  if (read.state === 'loading') return (
    <div data-state="loading"><SkeletonLoader variant={skeleton} rows={3} />{slow && <p role="status" className="pt-2 text-label text-jz-muted" data-slow>仍在读取{what},接口响应较慢。</p>}</div>
  );
  if (read.state === 'permission') return <PermissionState compact title="无权限" message={`当前账号不能读取${what}(接口返回 403)。`} />;
  if (read.state === 'unread') return <ErrorState compact title={`${what}未读取`} message={(read.error as any)?.message} onRetry={read.reload} />;
  return null;
}

export function StaleLine<T>({ read, what }: { read: Read<T>; what: string }): React.ReactElement | null {
  if (read.state !== 'stale') return null;
  return <StaleNotice reason={`${STALE_WORD},下面是上次读到的${what}。`} onRefresh={read.reload} />;
}
