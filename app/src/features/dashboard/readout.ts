// readout.ts — one read and its state, shared by the dashboard and the report list.
// A number is a statement about data that was read: 0 appears only when 0 was read. A read that failed says
// 未读取 (with a retry on its block); a 403 says 无权限 (no retry wording); a later failure keeps the last value
// and says the latest refresh failed.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/services/api';

export type ReadState = 'loading' | 'value' | 'unread' | 'permission' | 'stale';

export interface Read<T> {
  state: ReadState;
  /** The last value that was read (kept while stale); null when nothing was read. */
  value: T | null;
  error: unknown;
  /** Re-send the same request. */
  reload: () => void;
}

export const statusOf = (e: unknown): number => (e && typeof e === 'object' && 'status' in e ? Number((e as { status: unknown }).status) : 0);
export const isDenied = (e: unknown): boolean => { const s = statusOf(e); return s === 401 || s === 403; };

/** State of a read from what the page holds: nothing settled yet, a value, an error, or both. */
export const stateOf = (settled: boolean, hasValue: boolean, error: unknown): ReadState =>
  !settled ? 'loading' : error ? (hasValue ? 'stale' : isDenied(error) ? 'permission' : 'unread') : hasValue ? 'value' : 'unread';

/** The word a read shows when it has no value. */
export const READ_WORD: Record<Exclude<ReadState, 'value' | 'stale'>, string> = { loading: '读取中', unread: '未读取', permission: '无权限' };
export const STALE_WORD = '最近一次刷新未成功';

/** True when the read holds a value that can be shown (value or stale). */
export const hasValue = <T,>(r: Pick<Read<T>, 'state' | 'value'>): r is Pick<Read<T>, 'state'> & { value: T } =>
  (r.state === 'value' || r.state === 'stale') && r.value != null;

/** Worst state of several reads, for a block that depends on all of them. */
export const worstOf = (...states: ReadState[]): ReadState =>
  (['permission', 'unread', 'loading', 'stale', 'value'] as ReadState[]).find((s) => states.includes(s)) ?? 'value';

/**
 * One GET through the shared client with its own state. `url` null sends nothing (state stays loading only
 * while `enabled` is unset; pass `enabled: false` for a read the account does not send, such as non-admins).
 * `interval` polls the same URL; a failed poll keeps the last value (stale).
 */
export function useRead<T>(url: string | null, pick: (raw: any) => T, opts: { interval?: number } = {}): Read<T> {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [settled, setSettled] = useState(false);
  const pickRef = useRef(pick); pickRef.current = pick;
  const seq = useRef(0);
  const has = useRef(false);
  const load = useCallback(() => {
    if (!url) return;
    const mine = ++seq.current;
    api<any>(url).then((raw) => {
      if (mine !== seq.current) return;
      setValue(pickRef.current(raw)); has.current = true; setError(null);
    }).catch((e) => {
      if (mine !== seq.current) return;
      setError(e ?? new Error('请求失败'));
    }).finally(() => { if (mine === seq.current) setSettled(true); });
  }, [url]);
  useEffect(() => {
    setValue(null); setError(null); setSettled(false); has.current = false;
    if (!url) return undefined;
    load();
    const t = opts.interval ? setInterval(load, opts.interval) : null;
    return () => { seq.current++; if (t) clearInterval(t); };
  }, [url, load, opts.interval]);
  return { state: stateOf(settled, value != null, error), value, error, reload: load };
}

/** True once `loading` has lasted `ms` (default 2 s), so a surface can say the read is still under way. */
export function useSlow(loading: boolean, ms = 2000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) { setSlow(false); return undefined; }
    const t = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(t);
  }, [loading, ms]);
  return slow;
}

/** HTTP 429: the server limited the request rate. */
export const isRateLimited = (e: unknown): boolean => statusOf(e) === 429;
