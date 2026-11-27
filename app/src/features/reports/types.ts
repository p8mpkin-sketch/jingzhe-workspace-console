// types.ts — 报告中心 V4 两级主从(大厅 hub / 详情 detail)共享类型与纯派生。
// 数据口径纪律: 全部指标只由既有端点数据展示层派生,不发明后端字段;
// 合规分 = clamp(0,100, 100 − report/summary.risk_score)(summary 风险分越高越危,取反即"越干净分越高"),
// 平台无 MASVS 绝对合规分(挂账),凡消费处脚注如实注明口径。

export type MxColor = 'red' | 'yellow' | 'green' | 'gray';
export type MxCounts = Record<MxColor, number>;

export type CmCard = { rule_id: string; title: string; severity: string; count: number };
export type CmRow = { name: string; count: number; sev: Record<string, number>; cards: CmCard[] };
export type DomainAgg = { rows: CmRow[]; otherCount: number; total: number };

/** 大厅任务聚合(展示层派生缓存,零后端写入) */
export type TaskAgg = {
  sid: number | null;                 // 代表会话(该任务最新活跃会话)
  summary: any | null;                // GET /api/pentest/sessions/{sid}/report/summary
  mx: MxCounts | null | 'error';      // GET auth_matrix counts('error'=NO_BASELINE 等无矩阵,如实区分)
  domains: DomainAgg | null;          // GET /vulns/grouped 按域聚合(同源 masvsDomains.ts)
  loading: boolean;
  done: boolean;
  /** HTTP status each of the three reads answered with (0 = no answer), so 403 reads 无权限 and not "—". */
  http?: { summary: number; mx: number; domains: number };
};

export const emptyAgg: TaskAgg = { sid: null, summary: null, mx: null, domains: null, loading: false, done: false };

/** State of one part of a task's aggregate: still loading, no session at all, denied, failed, or read. */
export const aggPart = (agg: TaskAgg | undefined, part: 'summary' | 'mx' | 'domains'): 'loading' | 'none' | 'permission' | 'unread' | 'value' => {
  if (!agg || agg.loading || !agg.done) return 'loading';
  if (!agg.sid) return 'none';
  const st = agg.http?.[part];
  if (st === 401 || st === 403) return 'permission';
  // No answer or a server error: not read. Other 4xx keep their earlier meaning (no data of that kind).
  if (st != null && (st === 0 || st >= 500)) return 'unread';
  return 'value';
};

/** 合规分(0-100): 100 − risk_score 截断;无 summary → null(未知,展示 '—') */
export const complianceScoreOf = (summary: any): number | null =>
  summary && typeof summary.risk_score === 'number'
    ? Math.max(0, Math.min(100, 100 - summary.risk_score))
    : null;

/** 大厅 enriched 行 = 任务行 + 聚合 */
export type HubEntry = { task: any; agg: TaskAgg | undefined };

/** 本地合并漏洞(导入/手动新增;纯前端暂存,零后端写入,导出即持久) */
export type LocalVuln = {
  id: string;
  rule_id: string;
  title: string;
  severity: string;
  masvs: string;
  evidence: string;
  component: string;
  repro: string;
  state: 'confirmed' | 'pending' | 'excluded';
  source: 'import' | 'manual';
};
