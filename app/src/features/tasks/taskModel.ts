// Task model of the task list and the task detail. Everything here is derived from the task row the list request
// returns (`GET /api/tasks?limit=2000`): there is no task log, stage or timeline endpoint, so stages are read from
// the `progress` text and nothing is added to what that text says.
import type { GlyphKind } from '@/components/ui';
import type { RunStatus, StageVM } from '@/features/pentest/workbench/model';
import type { StageTraceVM, TraceRowVM } from '@/features/pentest/workbench/surfaces/runtime/trace';
import { ST_CN, SMOKE_FAIL_S, STAGE_CN, honestDone } from './taskParts';

export interface TaskItem {
  id: number;
  kind?: string;
  type?: string;
  app_name?: string;
  package?: string;
  apk_path?: string;
  status: string;
  created_at?: number;
  updated_at?: number;
  started_at?: number | null;
  finished_at?: number | null;
  result_id?: number | null;
  progress?: string;
  user_id?: number | null;
  error_msg?: string;
  error?: string;
  unpack_outcome?: any;
  packer?: string | null;
}
export interface SessionLink { pid: number; sid: number }
export type SessionMap = Record<number, SessionLink>;

/** How many tasks the list request asks for. The detail page can only find a task inside this window. */
export const TASK_WINDOW = 2000;
export const TASKS_URL = `/api/tasks?limit=${TASK_WINDOW}`;
export const SESSIONS_URL = '/api/pentest/sessions';
/** The detail page re-reads the list this often while its task is running or queued and the page is visible. */
export const POLL_MS = 10_000;

export type Scope = '' | 'running' | 'queued' | 'failed' | 'done';
export const SCOPES: Array<{ key: Scope; label: string }> = [
  { key: '', label: '全部' }, { key: 'running', label: '运行中' }, { key: 'queued', label: '排队' }, { key: 'failed', label: '失败' }, { key: 'done', label: '已完成' },
];
export const isScope = (s: string): s is Scope => SCOPES.some((x) => x.key === s);

export const kindOf = (t: TaskItem) => t.kind || t.type || 'audit';
export const KIND_CN: Record<string, string> = { audit: '评估', unpack: '脱壳' };
export const kindWord = (t: TaskItem) => KIND_CN[kindOf(t)] || kindOf(t);
export const nameOf = (t: TaskItem) => t.app_name || t.package || `任务 #${t.id}`;
export const isLive = (t: Pick<TaskItem, 'status'>) => t.status === 'running' || t.status === 'queued';

/** Seconds a task has taken: created to last update once it ended, created to now while it has not. */
export const durOf = (t: TaskItem, now: number) =>
  (t.status === 'done' || t.status === 'failed') ? (t.updated_at || t.created_at || 0) - (t.created_at || 0) : now - (t.created_at || now);
export const isSmokeFail = (t: TaskItem) => t.status === 'failed' && ((t.updated_at || t.created_at || 0) - (t.created_at || 0)) < SMOKE_FAIL_S;
export const isPartial = (t: TaskItem) => t.status === 'done' && honestDone(t).blocked;

/** The failure reason the server gave: `error_msg`, else the progress text a failed task ended on. Empty when neither. */
export const failureReason = (t: TaskItem): string => (t.status === 'failed' ? String(t.error_msg || t.error || t.progress || '') : '');
export const NO_REASON = '服务端没有返回失败原因';

/**
 * Which tasks get the artifacts entry (rule of 766a717). Decided from what the page already holds: the task's own
 * kind and status (a finished audit or unpack has a run directory) and the session list (a linked session has a
 * report package). The artifacts endpoint is not asked: what it answers is shown inside the browser.
 */
export const artifactsReady = (t: TaskItem, sess: SessionMap) => ((kindOf(t) === 'unpack' || kindOf(t) === 'audit') && t.status === 'done') || !!sess[t.id];
/** A finished audit with a result has a report and can be asked about. */
export const hasReport = (t: TaskItem) => kindOf(t) === 'audit' && t.status === 'done' && !!t.result_id;

export const sessionMapOf = (rows: any[] | null | undefined): SessionMap => {
  // pid 0 (a session started from the dashboard, without a project) is kept: `project_id ?? 0`.
  const m: SessionMap = {};
  for (const r of rows || []) if (r?.task_id) m[r.task_id] = { pid: r.project_id ?? 0, sid: r.id };
  return m;
};

export interface StatusView { glyph: GlyphKind; word: string; key: 'running' | 'queued' | 'failed' | 'done' | 'partial' | 'other' }
export const statusView = (t: TaskItem): StatusView => {
  if (t.status === 'failed') return { glyph: 'failed', word: '失败', key: 'failed' };
  if (t.status === 'done') return isPartial(t) ? { glyph: 'partial', word: '部分完成', key: 'partial' } : { glyph: 'done', word: '完成', key: 'done' };
  if (t.status === 'running') return { glyph: 'running', word: '运行中', key: 'running' };
  if (t.status === 'queued') return { glyph: 'queued', word: '排队', key: 'queued' };
  return { glyph: 'neutral', word: ST_CN[t.status] || t.status || '未知', key: 'other' };
};
export const runStatusOf = (t: TaskItem): RunStatus =>
  t.status === 'running' ? 'running' : t.status === 'done' ? 'completed' : t.status === 'failed' ? 'failed' : 'idle';

// ---------- Stages, from the progress text ----------

const STAGE_HEAD = /^(Unpack|Decompile|Security Analysis|Symbol Analysis|Struct Analysis|Report Generation)\s*:\s*/i;
const STAGE_NAME: Record<string, string> = { unpack: '脱壳', decompile: '反编译', ...Object.fromEntries(Object.entries(STAGE_CN).map(([k, v]) => [k.toLowerCase(), v])) };

export interface TaskStage {
  id: string;
  /** The stage key as the progress text spells it; empty for the single “输出” stage. */
  key: string;
  name: string;
  /** Percentage the segment states, when it states one. */
  pct: number | null;
  lines: string[];
}
export interface ParsedProgress {
  stages: TaskStage[];
  /** False when no segment of the text names a stage: the whole text is then the one “输出” stage. */
  parsed: boolean;
}
export const OUTPUT_STAGE = '输出';
const linesOf = (s: string) => s.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim() !== '');

/**
 * Stages of a task as its progress text states them: segments separated by “→”, each opening with a stage name the
 * backend is known to write (the same names the row's live progress reads). A stage the text does not name is not
 * added. Text that names no stage becomes one stage called “输出”.
 */
export function parseProgress(progress: string | null | undefined): ParsedProgress {
  const text = typeof progress === 'string' ? progress : '';
  if (!text.trim()) return { stages: [], parsed: false };
  const segs = text.split('→').map((s) => s.trim()).filter(Boolean);
  if (!segs.some((s) => STAGE_HEAD.test(s))) return { stages: [{ id: '1', key: '', name: OUTPUT_STAGE, pct: null, lines: linesOf(text) }], parsed: false };
  const stages: TaskStage[] = [];
  let lead: string[] = [];
  for (const seg of segs) {
    const m = STAGE_HEAD.exec(seg);
    if (!m) { if (stages.length) stages[stages.length - 1].lines.push(...linesOf(seg)); else lead.push(...linesOf(seg)); continue; }
    const key = m[1];
    const pct = /(\d{1,3})%/.exec(seg);
    stages.push({ id: String(stages.length + 1), key, name: STAGE_NAME[key.toLowerCase()] || key, pct: pct ? Math.max(0, Math.min(100, parseInt(pct[1], 10))) : null, lines: [...lead, ...linesOf(seg)] });
    lead = [];
  }
  return { stages, parsed: true };
}

const ERR_LINE = /error|fail|timeout|exception|traceback|失败|错误|超时/i;
const ZERO = { events: 0, judgments: 0, guidance: 0, tools: 0, findings: 0, errors: 0, approvalsPending: 0, approvalsDecided: 0 };

/** An extra group of output lines that is not a stage of the task (a log file, the unpack result). */
export interface OutputGroup { id: string; name: string; lines: string[] }

/**
 * The parsed stages in the shape the workbench's run strip and stage stack take. A stage is past unless it is the
 * last one of a task that has not finished; that one carries the task's own status. No stage is ever "future":
 * the text only speaks of stages that were reached.
 */
export function buildTaskTrace(t: TaskItem, parsed: ParsedProgress, extra: OutputGroup[] = []): StageTraceVM[] {
  const finished = t.status === 'done';
  const failed = t.status === 'failed';
  const out: StageTraceVM[] = parsed.stages.map((s, i) => {
    const last = i === parsed.stages.length - 1;
    const active = last && !finished;
    const stage: StageVM = {
      id: s.id, index: i, name: s.name, status: active ? (failed ? 'failed' : t.status === 'running' ? 'running' : 'reached') : 'done',
      done: 0, total: 0, findings: 0, steps: [], current: active,
    };
    const rows: TraceRowVM[] = s.lines.map((line, n) => ({
      id: `${s.id}:${n}`, kind: 'result', stage: s.id, title: line,
      ...(failed && last && ERR_LINE.test(line) ? { variant: 'error' as const } : {}),
    }));
    return { stage, mode: active ? 'active' : 'past', rows, counts: { ...ZERO, events: rows.length, errors: rows.filter((r) => r.variant === 'error').length }, upcoming: [] };
  });
  extra.forEach((g, i) => {
    const rows: TraceRowVM[] = g.lines.map((line, n) => ({ id: `${g.id}:${n}`, kind: 'result', stage: g.id, title: line }));
    out.push({
      stage: { id: g.id, index: parsed.stages.length + i, name: g.name, status: 'done', done: 0, total: 0, findings: 0, steps: [], current: false },
      mode: 'past', rows, counts: { ...ZERO, events: rows.length }, upcoming: [],
    });
  });
  return out;
}

/** The stage a task is at, for the page header: the last stage its progress names, with the percentage it states. */
export const currentStageText = (t: TaskItem, parsed: ParsedProgress): string => {
  if (!parsed.stages.length) return t.status === 'queued' ? '尚未开始' : '没有上报阶段';
  if (!parsed.parsed) return '没有阶段信息';
  const s = parsed.stages[parsed.stages.length - 1];
  return `${s.name}${s.pct != null ? ` ${s.pct}%` : ''}`;
};

// ---------- Filters, search, export ----------

export interface TaskFilters {
  scope: Scope;
  /** Only finished tasks whose business code did not come out (the former pseudo-status `degraded`). */
  partial: boolean;
  search: string;
  kind: string;
  packer: string;
  operator: string;
  hideSmoke: boolean;
}

export function filterTasks(tasks: TaskItem[], f: TaskFilters, users: Record<string, string>): TaskItem[] {
  let r = f.scope ? tasks.filter((t) => t.status === f.scope) : tasks;
  if (f.partial) r = r.filter(isPartial);
  if (f.kind) r = r.filter((t) => kindOf(t) === f.kind);
  if (f.packer === '__packed') r = r.filter((t) => t.packer && t.packer !== 'none');
  else if (f.packer !== 'all') r = r.filter((t) => t.packer === f.packer);
  if (f.operator) r = r.filter((t) => String(t.user_id ?? '') === f.operator);
  if (f.hideSmoke) r = r.filter((t) => !isSmokeFail(t));
  const q = f.search.trim().toLowerCase();
  if (q) {
    r = r.filter((t) => (t.app_name || '').toLowerCase().includes(q) || (t.package || '').toLowerCase().includes(q) || String(t.id).includes(q)
      || (users[String(t.user_id)] || '').toLowerCase().includes(q) || (t.error_msg || '').toLowerCase().includes(q));
  }
  return r;
}

const when = (ts?: number | null) => (ts ? new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false }) : '');

/** Export rows: the fields of the previous task page, unchanged. Counts that were not read stay empty. */
export function exportRows(rows: TaskItem[], counts: Record<string, any>, users: Record<string, string>, now: number) {
  return rows.map((t) => {
    const c = counts[String(t.id)] || {};
    const h = honestDone(t);
    return {
      'ID': t.id,
      '类型': kindOf(t),
      '目标应用': t.app_name || t.package || '',
      '包名': t.package || '',
      '壳': t.packer || '',
      '状态语义': t.status === 'failed' ? '失败' : t.status === 'done' ? (h.blocked ? `完成(脱壳受阻·${h.label})` : h.biz != null ? `完成·业务码${h.biz}类` : h.shell ? '完成(无脱壳判定数据)' : '完成(无壳应用·无脱壳环节)') : (ST_CN[t.status] || t.status),
      '业务码类数': t.status === 'done' && h.biz != null ? h.biz : '',
      '漏洞C': c.critical ?? '', '漏洞H': c.high ?? '', '漏洞M': c.medium ?? '', '漏洞L': c.low ?? '',
      '操作员': users[String(t.user_id)] || (t.user_id != null ? `#${t.user_id}` : ''),
      '耗时秒': Math.round(durOf(t, now)),
      '创建时间': when(t.created_at),
      '更新时间': when(t.updated_at),
      '失败原因': t.status === 'failed' ? (t.error_msg || t.progress || '') : '',
    };
  });
}

export const rerunBody = (t: TaskItem) => ({ kind: t.kind || 'audit', app_name: t.app_name, apk_path: t.apk_path, authorized: '任务中心重跑' });
