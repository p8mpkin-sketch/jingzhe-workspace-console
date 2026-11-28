// evidenceModel.ts — rows, filters and search of /evidence, from GET /api/v2/overview (cross-app confirmed
// hypotheses and counts). Pure functions. The overview carries no session, so a finding id is not linked to a workbench.

export type Confirmed = {
  hypothesis_id: string; task: string; provenance: string; device: string;
  finding_id: string; proof_level: string; synthetic: boolean; source: string;
};
export type TaskRow = { task: string; paths: number; dataflow: number };
export type Stage = { id: string; label: string; state: string };
export type Overview = {
  tasks_total: number; candidates_total: number; confirmed_total: number; real_confirmed: number;
  synthetic_confirmed: number; silver_total: number; unresolved_total: number; apk_with_confirmed: number;
  sink_families: number; tasks: TaskRow[]; confirmed: Confirmed[]; pipeline: Stage[];
};

/** The four counts, in the order the page shows them. 候选路径 is now named 待证假设 (plan §10). */
export const COUNTS = [
  { key: 'tasks_total', label: '已接入应用', hint: '可读取的评估任务' },
  { key: 'candidates_total', label: '待证假设', hint: '由数据流分析生成,尚待证明' },
  { key: 'confirmed_total', label: '已确认', hint: '通过判定并经独立核验' },
  { key: 'unresolved_total', label: '未决', hint: '缺少动态证据' },
] as const;

export type SourceFilter = 'all' | 'real' | 'synthetic';
export const STAGE_STATE: Record<string, string> = { done: '已完成', active: '进行中' };

export const shortTask = (s: string) => String(s || '').replace(/^com\./, '');
export const shortId = (s: string) => (s.length > 22 ? s.slice(0, 12) + '…' + s.slice(-6) : s);
export const rowKey = (r: Confirmed) => r.hypothesis_id || r.finding_id;

export const pickOverview = (raw: any): Overview => ({
  tasks_total: raw?.tasks_total, candidates_total: raw?.candidates_total, confirmed_total: raw?.confirmed_total,
  real_confirmed: raw?.real_confirmed, synthetic_confirmed: raw?.synthetic_confirmed, silver_total: raw?.silver_total,
  unresolved_total: raw?.unresolved_total, apk_with_confirmed: raw?.apk_with_confirmed, sink_families: raw?.sink_families,
  tasks: Array.isArray(raw?.tasks) ? raw.tasks : [], confirmed: Array.isArray(raw?.confirmed) ? raw.confirmed : [],
  pipeline: Array.isArray(raw?.pipeline) ? raw.pipeline : [],
});

export const matchSource = (r: Confirmed, f: SourceFilter) => f === 'all' || (f === 'synthetic' ? !!r.synthetic : !r.synthetic);

/** Search over hypothesis id, app and finding id (case-insensitive). */
export const matchSearch = (r: Confirmed, q: string) => {
  const n = q.trim().toLowerCase();
  return !n || `${r.hypothesis_id} ${r.task} ${r.finding_id}`.toLowerCase().includes(n);
};

export const filterRows = (rows: Confirmed[], f: SourceFilter, q: string) => rows.filter((r) => matchSource(r, f) && matchSearch(r, q));

/** A count the overview returned, or null when the field is absent (never shown as 0). */
export const countOf = (o: Overview | null, key: string): number | null => {
  const v = o ? (o as any)[key] : null;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};
