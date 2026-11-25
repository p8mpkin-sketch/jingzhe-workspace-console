// Reads of the task domain. One hook per GET, each with the five outcomes a data surface has to show: loading
// (and slow), answered, refused (403), failed, and stale (data on screen, a later refresh failed).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/services/api';
import { POLL_MS, SESSIONS_URL, TASKS_URL, isLive, sessionMapOf, type SessionMap, type TaskItem } from './taskModel';

export const errStatus = (e: unknown): number => (e && typeof e === 'object' && 'status' in e ? Number((e as { status: unknown }).status) : 0);
export const errText = (e: unknown): string => (e instanceof Error ? e.message : e && typeof e === 'object' && 'detail' in e ? String((e as any).detail) : String(e ?? ''));
const refused = (e: unknown) => { const s = errStatus(e); return s === 401 || s === 403; };

/** A read is "slow" when its first answer has not arrived after this long. */
export const SLOW_MS = 4000;

export interface Read<T> {
  data: T | null;
  error: unknown;
  /** First answer still outstanding. */
  loading: boolean;
  /** Loading for longer than SLOW_MS. */
  slow: boolean;
  /** The server answered 401 / 403. Nothing that was read before is kept. */
  forbidden: boolean;
  /** The first read failed (not a refusal). */
  failed: boolean;
  /** Data is on screen and the latest refresh failed. */
  stale: boolean;
  refreshing: boolean;
  /** When the data on screen arrived. */
  at: number | null;
  reload: () => Promise<void>;
}

export function useRead<T>(url: string | null, pick: (raw: any) => T): Read<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [settled, setSettled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [at, setAt] = useState<number | null>(null);
  const pickRef = useRef(pick); pickRef.current = pick;
  const seq = useRef(0);
  const reload = useCallback(async () => {
    if (!url) return;
    const mine = ++seq.current;
    setBusy(true);
    try {
      const raw = await api<any>(url);
      if (mine !== seq.current) return;
      setData(pickRef.current(raw)); setError(null); setAt(Date.now());
    } catch (e) {
      if (mine !== seq.current) return;
      // A refusal is a statement about the account: what an earlier read returned is not shown any more.
      if (refused(e)) setData(null);
      setError(e ?? new Error('加载失败'));
    } finally {
      if (mine === seq.current) { setBusy(false); setSettled(true); }
    }
  }, [url]);
  useEffect(() => { setData(null); setError(null); setSettled(false); setAt(null); void reload(); return () => { seq.current++; }; }, [reload]);
  const loading = !!url && !settled;
  useEffect(() => {
    if (!loading) { setSlow(false); return; }
    const t = window.setTimeout(() => setSlow(true), SLOW_MS);
    return () => window.clearTimeout(t);
  }, [loading]);
  const forbidden = !!error && refused(error);
  return {
    data, error, loading, slow, forbidden, failed: !!error && !forbidden && data == null, stale: !!error && !forbidden && data != null,
    refreshing: busy && settled, at, reload,
  };
}

const asList = (r: any): any[] => (Array.isArray(r) ? r : []);

export const useTaskList = () => useRead<TaskItem[]>(TASKS_URL, asList);
/** Task ↔ session links, from the session list. `null` until it answers: a link that was not read is not "no link". */
export function useSessionLinks(): { map: SessionMap; read: Read<any[]> } {
  const read = useRead<any[]>(SESSIONS_URL, asList);
  const map = useMemo(() => sessionMapOf(read.data), [read.data]);
  return { map, read };
}

export interface CountsState {
  items: Record<string, any>;
  users: Record<string, string>;
  /** Ids whose counts request was refused, and ids whose request failed: neither is shown as zero. */
  refused: Set<number>;
  failedIds: Set<number>;
}
/** Finding counts and operator names of the given task ids: one `GET /api/tasks/counts?ids=` per distinct id list. */
export function useTaskCounts(ids: number[]): CountsState {
  const key = ids.join(',');
  const [st, setSt] = useState<CountsState>({ items: {}, users: {}, refused: new Set(), failedIds: new Set() });
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const list = key.split(',').map(Number);
    api<any>(`/api/tasks/counts?ids=${key}`).then((d) => {
      if (!alive) return;
      setSt((p) => {
        const r = new Set(p.refused), f = new Set(p.failedIds);
        list.forEach((id) => { r.delete(id); f.delete(id); });
        return { items: { ...p.items, ...(d?.items || {}) }, users: { ...p.users, ...(d?.users || {}) }, refused: r, failedIds: f };
      });
    }).catch((e) => {
      if (!alive) return;
      setSt((p) => {
        const r = new Set(p.refused), f = new Set(p.failedIds);
        list.forEach((id) => (refused(e) ? r : f).add(id));
        return { ...p, refused: r, failedIds: f };
      });
    });
    return () => { alive = false; };
  }, [key]);
  return st;
}

/** A clock for running durations: ten-second steps, no fake progress in between. */
export function useNowSeconds(stepMs = 10_000): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => { const iv = window.setInterval(() => setNow(Date.now() / 1000), stepMs); return () => window.clearInterval(iv); }, [stepMs]);
  return now;
}

/**
 * Polling rule of the task detail. While the task is running or queued and the page is visible, the full task list
 * (`limit=2000`, the request the page already makes) is read again every POLL_MS. The same full list is what says
 * the task has left running / queued; a shorter list is never used to decide that. A hidden page does not poll; when
 * it becomes visible again and the task is still live, it reads once and resumes. A finished task is not polled.
 */
export function usePollWhileLive(task: TaskItem | null, reload: () => Promise<void>): { polling: boolean } {
  const live = !!task && isLive(task);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const polling = live && visible;
  const reloadRef = useRef(reload); reloadRef.current = reload;
  const wasHidden = useRef(false);
  useEffect(() => {
    if (!visible) { wasHidden.current = true; return; }
    if (!polling) return;
    if (wasHidden.current) { wasHidden.current = false; void reloadRef.current(); }
    const iv = window.setInterval(() => { void reloadRef.current(); }, POLL_MS);
    return () => window.clearInterval(iv);
  }, [polling, visible]);
  return { polling };
}
