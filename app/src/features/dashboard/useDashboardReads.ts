// useDashboardReads.ts — every read of the overview, each with its own state (readout.ts).
// Same URLs and polling intervals as the page had at 470c6bf. Retired with Phase 8: the model readout
// (/api/models/providers, /api/models/routing → /system, D1), the unpack summary (/api/tasks/batch-unpack-summary
// → /tasks) and the per-session radar reads (D2). Added: one /api/pentest/projects read for project names (D3).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { useRead, isDenied } from './readout';
import type { Read, ReadState } from './readout';

export type TaskSummary = { total?: number; running?: number; failed?: number; done?: number; queued?: number };
export type SevEntry = { active?: number; total?: number };
export type SevSummary = {
  total_active?: number; by_session?: Record<string, Record<string, SevEntry>>;
  by_severity?: Record<string, number>; sessions_scanned?: number; sessions_total?: number;
};
export type DomainSummary = { by_session?: Record<string, Record<string, number>>; sessions_scanned?: number };
export type FeedEvent = { sid: number; seq?: number; ts?: string; type?: string; payload?: Record<string, any> };
export type Feed = { events: FeedEvent[]; total?: number; sessions_scanned?: number };
export type NodeRow = { node_id: string; online?: boolean; devices?: string[]; last_seen?: number };
export type SessionLink = { pid: number; sid: number };
export type ProjectName = { id: number; name: string };

/** The queued read asks for at most this many rows; a full page means "at least". */
export const QUEUED_LIMIT = 2000;
const POLL_RUNNING_MS = 30_000;
const POLL_FEED_MS = 8_000;

const arr = (r: any) => (Array.isArray(r) ? r : []);

export interface DashboardReads {
  isAdmin: boolean;
  summary: Read<TaskSummary>;
  queued: Read<number>;
  running: Read<any[]>;
  sev: Read<SevSummary>;
  domains: Read<DomainSummary>;
  feed: Read<Feed>;
  /** null for non-admins: no request is sent. */
  nodes: Read<NodeRow[]> | null;
  tasks: Read<any[]>;
  sessions: Read<Record<number, SessionLink>>;
  projects: Read<Map<number, string>>;
  /** risk_score per task id from report/summary of its session (first 8 linked rows). */
  scores: Record<number, { state: ReadState; value: number | null }>;
  /** Re-send every read of the page (header 刷新). */
  refresh: () => void;
  /** POST /api/pentest/sessions { task_id } — unchanged; re-reads the session map after it. */
  reloadSessions: () => void;
}

export function useDashboardReads(): DashboardReads {
  const me = useAuth((st) => st.me) as any;
  const isAdmin = me?.role === 'admin' || me?.role === 'super_admin';

  const nodesRead = useRead<NodeRow[]>(isAdmin ? '/api/nodes' : null, (d) => arr(d?.items));
  const domains = useRead<DomainSummary>('/api/pentest/vulns/domain-summary', (d) => d || {});
  const running = useRead<any[]>('/api/tasks?status=running&limit=50', arr, { interval: POLL_RUNNING_MS });
  const feed = useRead<Feed>('/api/pentest/events/recent?limit=30', (d) => ({ events: arr(d?.events), total: d?.total, sessions_scanned: d?.sessions_scanned }), { interval: POLL_FEED_MS });
  const summary = useRead<TaskSummary>('/api/tasks-summary', (d) => d || {});
  const sev = useRead<SevSummary>('/api/pentest/vulns/severity-summary', (d) => d || {});
  const queued = useRead<number>(`/api/tasks?status=queued&limit=${QUEUED_LIMIT}`, (r) => arr(r).length);
  const tasks = useRead<any[]>('/api/tasks?limit=500', (rows) => arr(rows).filter((r: any) => r.kind === 'audit').slice(0, 10));
  // Sessions without a project are kept (pid 0): the workbench opens them by sid.
  const sessions = useRead<Record<number, SessionLink>>('/api/pentest/sessions', (rows) => {
    const m: Record<number, SessionLink> = {};
    for (const r of arr(rows)) if (r.task_id) m[r.task_id] = { pid: r.project_id ?? 0, sid: r.id };
    return m;
  });
  const projects = useRead<Map<number, string>>('/api/pentest/projects', (rows) => new Map(arr(rows).map((p: any) => [Number(p.id), String(p.name || '')])));

  // Risk score of the first 8 rows that have a session (report/summary, as before). Each row keeps its own state.
  const [scores, setScores] = useState<DashboardReads['scores']>({});
  const scoreSeq = useRef(0);
  const linked = useMemo(() => {
    if (!tasks.value || !sessions.value) return [] as Array<{ tid: number; sid: number }>;
    return tasks.value.filter((t) => sessions.value![t.id]).slice(0, 8).map((t) => ({ tid: t.id as number, sid: sessions.value![t.id].sid }));
  }, [tasks.value, sessions.value]);
  const linkedKey = linked.map((l) => `${l.tid}:${l.sid}`).join(',');
  const loadScores = useCallback(() => {
    const mine = ++scoreSeq.current;
    setScores((cur) => Object.fromEntries(linked.map((l) => [l.tid, cur[l.tid] ?? { state: 'loading' as ReadState, value: null }])));
    for (const l of linked) {
      api<any>(`/api/pentest/sessions/${l.sid}/report/summary`, {}, true).then((s) => {
        if (mine !== scoreSeq.current) return;
        const v = typeof s?.risk_score === 'number' ? s.risk_score : Number.isFinite(Number(s?.risk_score)) && s?.risk_score != null ? Number(s.risk_score) : null;
        setScores((cur) => ({ ...cur, [l.tid]: { state: v == null ? 'unread' : 'value', value: v } }));
      }).catch((e) => {
        if (mine !== scoreSeq.current) return;
        setScores((cur) => ({ ...cur, [l.tid]: cur[l.tid]?.value != null ? { state: 'stale', value: cur[l.tid].value } : { state: isDenied(e) ? 'permission' : 'unread', value: null } }));
      });
    }
  }, [linkedKey]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed by the linked rows
  useEffect(() => { if (linked.length) loadScores(); }, [loadScores]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    summary.reload(); sev.reload(); queued.reload(); tasks.reload(); sessions.reload(); projects.reload();
    domains.reload(); running.reload(); feed.reload(); nodesRead.reload();
    if (linked.length) loadScores();
  }, [summary, sev, queued, tasks, sessions, projects, domains, running, feed, nodesRead, linked.length, loadScores]);

  return {
    isAdmin, summary, queued, running, sev, domains, feed, nodes: isAdmin ? nodesRead : null, tasks, sessions, projects,
    scores, refresh, reloadSessions: sessions.reload,
  };
}
