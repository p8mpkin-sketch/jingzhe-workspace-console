import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/services/api';

/**
 * One GET with its own lifecycle. The project detail uses one per endpoint, so each tab loads and fails on its
 * own: a failing endpoint shows its error in its tab and leaves the others on screen. A failed refresh keeps the
 * last data and reports `stale`.
 */
export interface Resource<T> {
  data: T | null;
  error: unknown;
  /** First load in flight (nothing to show yet). */
  loading: boolean;
  /** A refresh is in flight. */
  refreshing: boolean;
  /** Data is on screen but the latest refresh failed. */
  stale: boolean;
  reload: () => Promise<void>;
}

export function useResource<T>(url: string | null, pick: (raw: any) => T): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [settled, setSettled] = useState(false);
  const pickRef = useRef(pick); pickRef.current = pick;
  const seq = useRef(0);
  const reload = useCallback(async () => {
    if (!url) return;
    const mine = ++seq.current;
    setBusy(true);
    try {
      const raw = await api<any>(url);
      if (mine !== seq.current) return;
      setData(pickRef.current(raw)); setError(null);
    } catch (e) {
      if (mine !== seq.current) return;
      setError(e ?? new Error('加载失败'));
    } finally {
      if (mine === seq.current) { setBusy(false); setSettled(true); }
    }
  }, [url]);
  useEffect(() => { setData(null); setError(null); setSettled(false); reload(); return () => { seq.current++; }; }, [reload]);
  const idle = !url;
  return { data, error, loading: !idle && !settled, refreshing: busy && settled, stale: !!error && data != null, reload };
}

export const errStatus = (e: unknown): number => (e && typeof e === 'object' && 'status' in e ? Number((e as { status: unknown }).status) : 0);
export const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e ?? ''));
