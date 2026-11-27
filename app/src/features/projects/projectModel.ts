// The one project model. A project is a single entity (`GET /api/pentest/projects`); "company" and "single" are a
// scope of that entity, not two kinds of page. Everything here is derived from responses the pages already load:
// no request is issued from this file and no value is invented when a field is missing.
import type { StatusTone } from '@/components/ui';

export type Scope = 'all' | 'company' | 'single';
export const SCOPES: Scope[] = ['all', 'company', 'single'];
export const SCOPE_LABEL: Record<Scope, string> = { all: '全部', company: '公司级', single: '单应用' };

export type TabKey = 'overview' | 'reports' | 'apps' | 'candidates' | 'runs';
export const TABS: TabKey[] = ['overview', 'reports', 'apps', 'candidates', 'runs'];
export const TAB_LABEL: Record<TabKey, string> = { overview: '概览', reports: '报告', apps: '应用', candidates: '候选应用', runs: '执行' };

/** Project as the list and the overview endpoint return it. Every field but id / name is optional on the wire. */
export type ProjectEntity = {
  id: number; name: string; note?: string | null; company_name?: string; kind?: string; brands?: string;
  source?: string; status?: string; app_count?: number; inventory_count?: number; created_at?: number;
};
/** Row of `/api/pentest/sessions?limit=500`. */
export type FlatSession = {
  id: number; project_id: number | null; task_id?: number; package: string; device?: string;
  status: string; packer?: string; app_name?: string | null; created_at?: number;
};
/** Step progress of a project's most recent session (`/api/pentest/projects/:pid/sessions`, first row). */
export type ApTruth = { sid: number; step: number; total: number; running: boolean; pstate?: 'live' | 'last_run' | 'none' };
export type SevEntry = { active: number; total: number };
export type SevSummary = { by_session?: Record<string, Record<string, SevEntry>>; total_active?: number };

/** One project with everything the index derives for it. `packerKey` / `statusKey` come from the most recent
 *  session only, so each project falls in exactly one class per dimension and class counts add up to the total. */
export type ProjectRow = {
  p: ProjectEntity;
  scope: 'company' | 'single';
  brands: string[];
  apps: number;
  ps: FlatSession[];
  primary?: FlatSession;
  packerKey: string;
  packers: string[];
  statusKey: string;
  statuses: string[];
  packages: string[];
  online: string[];
  sevAgg: { critical: number; high: number; medium: number };
  sevKnown: boolean;
  ap?: ApTruth;
  latestTs?: number;
};

export const ACTIVE_STATES = new Set(['running', 'waiting_login']);
export const isLive = (status?: string) => /^(running|waiting_login|paused)$/.test(status || '');

export const parseBrands = (s?: string): string[] => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
export const appCount = (p: ProjectEntity) => Number(p.inventory_count ?? p.app_count ?? 0) || 0;
export const scopeOf = (p: ProjectEntity): 'company' | 'single' => (p.kind === 'company' ? 'company' : 'single');
export const kindLabel = (p: ProjectEntity) => SCOPE_LABEL[scopeOf(p)];
export const sourceLabel = (s?: string) => s === 'public' ? '公开渠道' : s === 'upload' ? '人工上传' : s === 'device' ? '设备提取' : s === 'client' ? '客户提供' : '来源未标注';

export const PACKER_LABEL: Record<string, string> = { none: '无壳', '360_jiagu': '360加固', ijiami: '爱加密' };
/** Raw-to-label for exports (unknown stays as the raw key). */
export const packerLabel = (raw?: string) => (raw ? PACKER_LABEL[raw] ?? raw : '—');
/** Display name for badges and chips. */
export const packerText = (raw?: string) => (!raw || raw === 'unknown' ? '未识别' : packerLabel(raw));
export const isPacked = (raw?: string) => !!raw && !['', 'none', 'unknown'].includes(raw);

const BRANDS: Array<{ name: RegExp; pkg: RegExp }> = [
  { name: /央视|cntv/i, pkg: /cctv|cntv/i }, { name: /平安/, pkg: /pingan/i }, { name: /京东/, pkg: /(jd|jingdong)/i },
  { name: /抖音|字节/, pkg: /(douyin|bytedance|zijie|snssdk)/i }, { name: /腾讯|微信/, pkg: /(tencent|wechat|weixin)/i },
  { name: /支付宝/, pkg: /alipay/i }, { name: /百度/, pkg: /baidu/i }, { name: /银行/, pkg: /bank/i }, { name: /河马/, pkg: /hema/i },
];
/** The project name names one known brand while the package belongs to another. A display hint for a human check. */
export const brandMismatch = (name: string, pkg?: string): boolean => {
  if (!pkg) return false;
  const named = BRANDS.filter((b) => b.name.test(name));
  if (!named.length) return false;
  return !named.some((b) => b.pkg.test(pkg)) && BRANDS.some((b) => b.pkg.test(pkg));
};

export const STAGES = ['加固识别', '静态分析', '接口梳理', '动态验证', '报告归档'] as const;
/** Stages lit by step share (step / total in fifths). An inference from progress, stated as such where it is shown. */
export const stageLit = (ap?: ApTruth): number => (ap && ap.total > 0 ? Math.min(5, Math.floor((ap.step / ap.total) * 5)) : 0);
export const progOf = (ap?: ApTruth): number => (ap ? Math.min(100, ap.total > 0 ? Math.round((ap.step / ap.total) * 100) : 0) : 0);
export const fmtTime = (ts?: number) =>
  ts ? new Date(ts * 1000).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

/** Projects (deduplicated by id) joined with their sessions, device presence, progress and open-finding counts. */
export function buildRows(
  projects: ProjectEntity[], sessions: FlatSession[], online: Set<string>, ap: Record<number, ApTruth | undefined>, sev: SevSummary | null,
): ProjectRow[] {
  const byId = new Map<number, ProjectEntity>();
  for (const p of projects) if (!byId.has(p.id)) byId.set(p.id, p);
  const dedup = new Map<number, FlatSession>();
  for (const s of sessions) if (!dedup.has(s.id)) dedup.set(s.id, s);
  const all = [...dedup.values()];
  return [...byId.values()].map((p) => {
    const ps = all.filter((s) => s.project_id === p.id); // endpoint order is id DESC, so ps[0] is the most recent
    const primary = ps[0];
    const sevAgg = { critical: 0, high: 0, medium: 0 };
    let sevKnown = false;
    ps.forEach((s) => {
      const e = sev?.by_session?.[String(s.id)];
      if (e) { sevKnown = true; (['critical', 'high', 'medium'] as const).forEach((k) => { sevAgg[k] += e[k]?.active ?? 0; }); }
    });
    return {
      p, scope: scopeOf(p), brands: parseBrands(p.brands), apps: appCount(p), ps, primary,
      packerKey: primary?.packer || 'unknown',
      packers: [...new Set(ps.map((s) => s.packer || 'unknown'))],
      statusKey: primary?.status || 'unknown',
      statuses: [...new Set(ps.map((s) => s.status))],
      packages: [...new Set(ps.map((s) => (s.package || '').trim()).filter(Boolean))],
      online: [...new Set(ps.map((s) => (s.device ?? '').trim()).filter((d) => d && online.has(d)))],
      sevAgg, sevKnown, ap: ap[p.id], latestTs: primary?.created_at ?? p.created_at,
    };
  });
}

/** The lead project: most recently created, company-level first. Ordered by `created_at` only when every candidate
 *  carries one; otherwise by id, which grows with creation. No date is derived that the API did not give. */
const byRecency = (list: ProjectEntity[]): ProjectEntity[] => {
  const timed = list.length > 0 && list.every((p) => typeof p.created_at === 'number' && Number.isFinite(p.created_at) && p.created_at > 0);
  return [...list].sort((a, b) => (timed ? (b.created_at as number) - (a.created_at as number) : 0) || b.id - a.id);
};
export const pickPrimary = (rows: ProjectEntity[]): ProjectEntity | undefined =>
  byRecency(rows.filter((p) => p.kind === 'company'))[0] ?? byRecency(rows)[0];

// ── Detail: resource rows and their state words ──
export type AppRow = { id: number; package: string; app_name?: string; version?: string; brand?: string; ownership_tier?: string; status?: string; report_status?: string };
export type CandidateRow = { id: number; package: string; app_name?: string; developer?: string; source?: string; source_url?: string; confidence?: number; status?: string; ownership_tier?: string };
export type ReportRow = { id: number; kind: string; template: string; status: string; pages?: number };
export type BatchRun = { id: number; status: string; total: number; succeeded: number; failed: number; skipped: number };
/** Row of `/api/pentest/projects/:pid/sessions`. */
export type SessionItem = { id: number; app?: string; package?: string; device?: string; status?: string; step?: number; total_steps?: number; created?: string; idle_days?: number; task_id?: number };
/** Row of `/api/tasks`: only the fields the runs tab shows. */
export type TaskItem = { id: number; kind?: string; app_name?: string; package?: string; status: string; progress?: string; error?: string; error_msg?: string; updated_at?: number; created_at?: number };

export const tone = (s?: string): StatusTone => s === 'done' || s === 'ready' || s === 'imported' ? 'success'
  : s === 'failed' || s === 'rejected' || s === 'download_failed' ? 'danger'
  : s === 'running' || s === 'queued' || s === 'generating' || s === 'needs_verification' || s === 'manual_required' ? 'attention' : 'neutral';
export const statusText = (s?: string) => s === 'done' ? '完成' : s === 'running' ? '执行中' : s === 'failed' ? '失败' : s === 'queued' ? '排队中' : s === 'discovered' ? '未执行' : s || '未执行';
export const candText = (s?: string) => s === 'imported' ? '已导入' : s === 'downloaded' ? '已下载' : s === 'verified' ? '可下载' : s === 'needs_verification' ? '待核验'
  : s === 'manual_required' ? '需人工' : s === 'rejected' ? '已排除' : s === 'download_failed' ? '下载失败' : s === 'pending' ? '待处理' : s || '候选';
export const reportStatus = (s?: string) => s === 'ready' ? '就绪' : s === 'generating' ? '生成中' : s === 'failed' ? '失败' : s || '未知';
export const templateText = (s?: string) => s === 'technical' ? '技术证据版' : s === 'executive' ? '管理层摘要' : s === 'forensic' ? '取证版' : s || '技术证据版';
/** kind portfolio (written by the backend) or project (older rows) is a project report; anything else a single-app report. */
export const reportName = (r: ReportRow) => `#${r.id} · ${r.kind === 'portfolio' || r.kind === 'project' ? '项目总报告' : '单应用报告'}`;
export const pagesOf = (n: number, size: number) => Math.max(1, Math.ceil(n / size));
export const slice = <T,>(rows: T[], page: number, size: number) => rows.slice((page - 1) * size, page * size);
