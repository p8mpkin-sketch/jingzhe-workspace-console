// reportScopes.ts — the report scope model shared by /reports and the project 报告 tab.
// One existing parameter, ?scope= (all | session | project | app), read the way /projects?scope= is read.
// Session reports come from finished assessment tasks (the hub); project and single-app reports come from
// GET /api/pentest/projects/{id}/reports, one read per project, four at a time.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getToken } from '@/services/api';
import { isDenied, stateOf } from '@/features/dashboard/readout';
import type { ReadState } from '@/features/dashboard/readout';
import type { ReportRow } from '@/features/projects/projectModel';
import type { HubEntry } from './types';

export type Scope = 'all' | 'session' | 'project' | 'app';
export const SCOPES: Scope[] = ['all', 'session', 'project', 'app'];
export const SCOPE_LABEL: Record<Scope, string> = { all: '全部', session: '会话报告', project: '项目报告', app: '单应用报告' };

/** ?scope= value → scope; an unknown value reads as 全部 and `valid` is false (the page then drops it with replace). */
export const parseScope = (raw: string | null): { scope: Scope; valid: boolean } =>
  raw == null || raw === '' ? { scope: 'all', valid: true }
    : (SCOPES as string[]).includes(raw) ? { scope: raw as Scope, valid: raw !== 'all' } : { scope: 'all', valid: false };
/** The query for a scope: 全部 has none. */
export const scopeQuery = (s: Scope): Record<string, string> => (s === 'all' ? {} : { scope: s });

/** The backend writes kind=portfolio for a project report; older rows say project. Everything else is a single-app report. */
export const isProjectKind = (kind?: string) => kind === 'portfolio' || kind === 'project';
export const kindScope = (kind?: string): 'project' | 'app' => (isProjectKind(kind) ? 'project' : 'app');

export type ProjectReport = ReportRow & { pid: number; projectName: string; created_at?: number | string };

/** One row of the report table: a session report (a finished assessment) or a project / single-app report. */
export type ReportItem =
  | { type: 'session'; key: string; when: number | null; entry: HubEntry }
  | { type: 'project' | 'app'; key: string; when: number | null; report: ProjectReport };

/** Seconds since epoch from a number (s or ms) or a date string; null when there is none. */
export const epochOf = (v: unknown): number | null => {
  if (typeof v === 'number' && v > 0) return v > 1e12 ? Math.round(v / 1000) : v;
  if (typeof v === 'string' && v) { const t = Date.parse(v.replace(' ', 'T')); return Number.isFinite(t) ? Math.round(t / 1000) : null; }
  return null;
};
export const sessionItem = (entry: HubEntry): ReportItem => ({ type: 'session', key: `s-${entry.task.id}`, when: epochOf(entry.task.updated_at), entry });
export const projectItem = (report: ProjectReport): ReportItem => ({ type: kindScope(report.kind), key: `p-${report.pid}-${report.id}`, when: epochOf(report.created_at), report });
/** Newest first; rows without a time go last, then by id. */
export const byTime = (a: ReportItem, b: ReportItem) => (b.when ?? -1) - (a.when ?? -1) || a.key.localeCompare(b.key);

/** Search over the fields a row shows (id, names, package, kind, template, status). */
export const matches = (it: ReportItem, q: string): boolean => {
  const k = q.trim().toLowerCase();
  if (!k) return true;
  if (it.type === 'session') {
    const t = it.entry.task;
    return String(t.id).includes(k.replace(/^#/, '')) || String(t.package || '').toLowerCase().includes(k) || String(t.app_name || '').toLowerCase().includes(k);
  }
  const r = it.report;
  return (`#${r.id}` + r.kind + r.template + r.status + r.projectName).toLowerCase().includes(k);
};

/** GET …/projects/{pid}/reports/{rid}/download (the request the project page always sent). */
export async function downloadProjectReport(pid: number, rid: number, format: 'docx' | 'pdf'): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(`/api/pentest/projects/${pid}/reports/${rid}/download?format=${format}`, { headers: { Authorization: 'Bearer ' + (getToken() || '') } });
  if (!res.ok) return { ok: false, status: res.status };
  const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `project-${pid}-report-${rid}.${format}`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return { ok: true, status: res.status };
}

export type ProjectReportsRead = {
  /** State of the project list read. */
  state: ReadState;
  rows: ProjectReport[];
  /** Per project: loading / value / unread / permission. */
  perProject: Record<number, ReadState>;
  total: number | null;
  read: number;
  failed: number;
  denied: number;
  /** Re-read what did not answer; `full` re-reads the list and every project (page 刷新). */
  reload: (full?: boolean) => void;
  /** Projects whose latest re-read failed (their last rows stay). */
  stale: number;
};

const queue = (limit: number) => {
  let active = 0; const pend: Array<() => void> = [];
  const next = () => { if (active >= limit || !pend.length) return; active++; pend.shift()!(); };
  return (fn: () => Promise<void>) => { pend.push(() => { fn().finally(() => { active--; next(); }); }); next(); };
};

/**
 * Project and single-app reports of every project the account can read. Sends nothing until `enabled`;
 * each project is read once (a retry re-reads only the ones that failed). A failure or 403 of one project
 * affects only that project.
 */
export function useProjectReports(enabled: boolean): ProjectReportsRead {
  const [projects, setProjects] = useState<Array<{ id: number; name: string }> | null>(null);
  const [listErr, setListErr] = useState<unknown>(null);
  const [settled, setSettled] = useState(false);
  const [per, setPer] = useState<Record<number, ReadState>>({});
  const perRef = useRef(per); perRef.current = per;
  const [rowsBy, setRowsBy] = useState<Record<number, ProjectReport[]>>({});
  const started = useRef(false);
  const hadRows = useRef(new Set<number>());
  const forceAll = useRef(false);
  const q = useRef(queue(4));
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const readProject = useCallback((p: { id: number; name: string }) => {
    setPer((m) => ({ ...m, [p.id]: 'loading' }));
    q.current(() => api<any>(`/api/pentest/projects/${p.id}/reports`).then((d) => {
      if (!alive.current) return;
      const list: ProjectReport[] = (Array.isArray(d?.reports) ? d.reports : []).map((r: any) => ({ ...r, pid: p.id, projectName: p.name }));
      hadRows.current.add(p.id); setRowsBy((m) => ({ ...m, [p.id]: list })); setPer((m) => ({ ...m, [p.id]: 'value' }));
    }).catch((e) => { if (alive.current) setPer((m) => ({ ...m, [p.id]: hadRows.current.has(p.id) ? 'stale' : isDenied(e) ? 'permission' : 'unread' })); }));
  }, []);

  const loadList = useCallback(() => {
    setSettled(false);
    api<any[]>('/api/pentest/projects').then((rows) => {
      if (!alive.current) return;
      const list = (Array.isArray(rows) ? rows : []).map((p: any) => ({ id: Number(p.id), name: String(p.name || `项目 #${p.id}`) }));
      setProjects(list); setListErr(null);
      const all = forceAll.current; forceAll.current = false;
      for (const p of list) if (all || (perRef.current[p.id] !== 'value' && perRef.current[p.id] !== 'loading')) readProject(p);
    }).catch((e) => { if (alive.current) setListErr(e ?? new Error('请求失败')); })
      .finally(() => { if (alive.current) setSettled(true); });
  }, [readProject]);

  useEffect(() => { if (enabled && !started.current) { started.current = true; loadList(); } }, [enabled, loadList]);

  /** Header 刷新 (`full`): the list and every project again; otherwise only what did not answer. */
  const reload = useCallback((full = false) => {
    if (full) { forceAll.current = true; started.current = true; loadList(); return; }
    if (!projects) { loadList(); return; }
    for (const p of projects) if (per[p.id] === 'unread' || per[p.id] === 'permission') readProject(p);
  }, [projects, per, loadList, readProject]);

  const ids = projects?.map((p) => p.id) ?? [];
  const states = ids.map((id) => per[id]);
  return {
    state: !enabled && !started.current ? 'loading' : stateOf(settled, projects != null, listErr),
    rows: ids.flatMap((id) => rowsBy[id] || []),
    perProject: per,
    total: projects ? projects.length : null,
    read: states.filter((s) => s === 'value').length,
    failed: states.filter((s) => s === 'unread').length,
    stale: states.filter((s) => s === 'stale').length,
    denied: states.filter((s) => s === 'permission').length,
    reload,
  };
}

/** "x/y 个项目已读取" plus what did not answer. */
export const projectProgress = (r: ProjectReportsRead): string | null => {
  if (r.total == null) return null;
  const parts = [`${r.read}/${r.total} 个项目已读取`];
  if (r.failed) parts.push(`${r.failed} 个未读取`);
  if (r.denied) parts.push(`${r.denied} 个无权限`);
  return parts.join('，');
};
