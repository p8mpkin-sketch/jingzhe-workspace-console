import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { api } from '@/services/api';
import { Button, Page, PageHeader, PermissionState, ErrorState, toast, useOverlay } from '@/components/ui';
import { moduleLabel } from '@/layout/navigation';
import { DOMAINS, domainOf } from '@/features/pentest/masvsDomains';
import { HubView } from './HubView';
import type { HubState } from './HubView';
import { DetailView } from './DetailView';
import type { TextPreview } from './DetailView';
import { SEV_WEIGHT } from './shared';
import type { TaskAgg, HubEntry, DomainAgg, LocalVuln, MxCounts } from './types';
import { emptyAgg, complianceScoreOf } from './types';
import {
 vulnsCsvRows, matrixCsvRows, matrixExportJson, buildFullReportJson, buildFullReportMarkdown,
 hubSummaryCsvRows, downloadCsv, downloadJson, downloadText, mergeLocalVulns, mergeMatrixRows, recountMatrix,
} from './reportIo';
import type { ReportCtx, ImportTarget } from './reportIo';

/**
 * R55 G7 建 / R104-2 V3 重构 / V4 两级主从重构: 报告中心。
 * Level 1 大厅(hub): KPI 大卡 ×4 + 检索工具栏(搜索/风险/排序/视图/分页)+ 任务卡网格/高密表格 + 批量导出汇总 CSV。
 * Level 2 详情(detail): 吸顶头(返回/标题/可搜索任务切换器/导入+导出下拉)+ 胶囊二级 Tab(R598 TOC 升级形态)
 * + 五区块(鉴权矩阵 API×Role 交叉表 / MASVS 合规图谱 / 漏洞明细证据链 / 会话报告 / 审计报告)。
 * 数据端点契约: 只用既有端点(页面既有调用 + /api/pentest/sessions 列表 + /sessions/{sid}/report/summary),零新增零改签名;
 * 导入/导出=纯前端闭环(本地合并层零后端写入);R602 ?sid=&cmp= 深链、R598 锚点 TOC、「在 AI 助手追问」全部保留。
 */

// 简易并发队列(大厅聚合后台拉取限流,避免一次打满)
const makeQueue = (limit: number) => {
  let active = 0;
  const pend: Array<() => void> = [];
 const next = () => { if (active >= limit || !pend.length) return; active++; pend.shift()!(); };
 return (fn: () => Promise<void>) => {
 pend.push(() => fn().finally(() => { active--; next(); }));
 next();
 };
};

const AUTH_H = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });

export const ReportCenterPage: React.FC = () => {
  const nav = useNavigate();
  // R602(挂账池收口): 任务中心「对比报告」深链——?sid=&cmp= 预置会话选择与对比面板;
  // V4: ?taskId= 与两级主从(viewMode)同步,深链 sid 折算其归属任务进入详情
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessLoaded, setSessLoaded] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [taskId, setTaskId] = useState<number | null>(null);
  const viewMode: 'hub' | 'detail' = taskId != null ? 'detail' : 'hub';
  // Error of the task list request (same request as before; only its failure is now kept for the error / permission state).
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const loadTasks = useCallback(() => {
    api<any[]>('/api/tasks?limit=500').then((rows) => {
      setTasks((rows || []).filter((r: any) => r.kind === 'audit' && r.status === 'done'));
      setLoadErr(null);
      setTasksLoaded(true);
    }).catch((e) => { setLoadErr(e || new Error('请求失败')); setTasksLoaded(true); });
  }, []);

  // ---- 大厅状态(提升至根,详情往返不丢检索/分页) ----
  const [hub, setHub] = useState<HubState>({ q: '', risk: 'all', sort: 'new', view: 'cards', page: 1, pageSize: 12, checked: new Set() });
  const patchHub = useCallback((p: Partial<HubState>) => setHub((s) => ({ ...s, ...p })), []);
  const [batchBusy, setBatchBusy] = useState(false);

  // ---- 大厅聚合引擎(summary/auth_matrix/vulns grouped 三端点/任务,队列限流,展示层派生) ----
  const [agg, setAgg] = useState<Record<number, TaskAgg>>({});
  const aggRef = useRef<Record<number, TaskAgg>>({});
  const inflight = useRef<Set<number>>(new Set());
  const waiters = useRef<Map<number, Array<() => void>>>(new Map());
  const queueRef = useRef<((fn: () => Promise<void>) => void) | null>(null);
 if (!queueRef.current) queueRef.current = makeQueue(4);
 const bumpAgg = useCallback(() => setAgg({ ...aggRef.current }), []);
  const sessionsRef = useRef<any[]>([]);
 sessionsRef.current = sessions;

 const repSessionOf = useCallback((tid: number) => {
 const list = sessionsRef.current.filter((s) => s.task_id === tid).sort((a, b) => b.id - a.id);
    return list[0] || null;
  }, []);

  const ensureAgg = useCallback((tid: number): Promise<void> => {
 const cur = aggRef.current[tid];
 if (cur?.done && !cur?.loading) return Promise.resolve();
 if (waiters.current.has(tid)) return new Promise((res) => { waiters.current.get(tid)!.push(res); });
 const sess = repSessionOf(tid);
 if (!sess) {
 aggRef.current[tid] = { ...emptyAgg, done: true };
 bumpAgg();
 return Promise.resolve();
 }
 waiters.current.set(tid, []);
 aggRef.current[tid] = { ...(cur || emptyAgg), sid: sess.id, loading: true, done: false };
 bumpAgg();
 queueRef.current!(async () => {
 const H = AUTH_H();
 const [sumR, mxR, grpR] = await Promise.allSettled([
 fetch(`/api/pentest/sessions/${sess.id}/report/summary`, { headers: H }).then((r) => (r.ok ? r.json() : null)),
 fetch(`/api/pentest/sessions/${sess.id}/auth_matrix`, { headers: H }).then((r) => (r.ok ? r.json() : null)),
 fetch(`/api/pentest/sessions/${sess.id}/vulns/grouped`, { headers: H }).then((r) => (r.ok ? r.json() : null)),
 ]);
 const summary = sumR.status === 'fulfilled' ? sumR.value : null;
 const mxd = mxR.status === 'fulfilled' ? mxR.value : null;
 const grp = grpR.status === 'fulfilled' ? grpR.value : null;
 const mxc: MxCounts | 'error' = mxd && mxd.status !== 'error' && mxd.counts
 ? { red: mxd.counts.red || 0, yellow: mxd.counts.yellow || 0, green: mxd.counts.green || 0, gray: mxd.counts.gray || 0 }
 : 'error';
 let domains: DomainAgg | null = null;
 if (grp && Array.isArray(grp.cards)) {
 const mk = (name: string) => ({ name, count: 0, sev: {} as Record<string, number>, cards: [] as any[] });
 const rows = DOMAINS.map((d) => mk(d.name));
 const other = mk('其他');
 for (const c of grp.cards) {
 const dom = domainOf(c.masvs || '');
 const bucket = dom ? rows[DOMAINS.indexOf(dom)] : other;
 const n = c.instance_count || 1;
 bucket.count += n;
 bucket.sev[c.severity] = (bucket.sev[c.severity] || 0) + n;
 bucket.cards.push({ rule_id: String(c.rule_id || ''), title: c.title || '', severity: c.severity || 'info', count: n });
 }
 domains = { rows: [...rows, other], otherCount: other.count, total: rows.reduce((a, b) => a + b.count, 0) + other.count };
 }
 aggRef.current[tid] = { sid: sess.id, summary, mx: mxc, domains, loading: false, done: true };
 bumpAgg();
 const ws = waiters.current.get(tid) || [];
 waiters.current.delete(tid);
 ws.forEach((fn) => fn());
 });
 return new Promise((res) => { waiters.current.get(tid)!.push(res); });
 }, [bumpAgg, repSessionOf]);

 // ---- 数据装载(既有端点,零改动) ----
 useEffect(() => {
    api<any[]>('/api/pentest/sessions').then((ss) => {
 const live = ss.filter((s: any) => s.status !== 'closed');
 setSessions(live);
 setSessLoaded(true);
 // R602: ?sid=&cmp= 深链(任务中心「对比报告」入口)——sid 折算归属任务进详情,cmp 同时展开对比面板;
 // 深链参数消费后收敛为 ?taskId= 单参(刷新回落同任务详情态)
 const sidP = Number(searchParams.get('sid') || 0);
 const cmpP = Number(searchParams.get('cmp') || 0);
 const tidP = Number(searchParams.get('taskId') || 0);
 if (sidP && live.some((s: any) => s.id === sidP)) {
 const sess = live.find((s: any) => s.id === sidP);
 setSelected(sidP);
 const tid = Number(sess?.task_id || 0);
 if (tid) { setTaskId(tid); setSearchParams({ taskId: String(tid) }, { replace: true }); }
 else setSearchParams({}, { replace: true });
 if (cmpP && cmpP !== sidP) { setCmpSid(cmpP); setShowCompare(true); }
 } else if (tidP) {
 setTaskId(tidP); // 合法性在 tasks 装载后校验(无效回落大厅);代表会话即刻预选
 const rep = live.filter((s: any) => s.task_id === tidP).sort((a: any, b: any) => b.id - a.id)[0];
 if (rep) setSelected(rep.id);
 } else if (live.length) {
 setSelected(live[0].id);
 }
 }).catch(() => { setSessLoaded(true); });
    loadTasks();
 }, []); // eslint-disable-line — 深链只在挂载时消费一次(searchParams/setSearchParams 稳定)

 const hubTasks = tasks;
 const taskById = useMemo(() => new Map(hubTasks.map((t) => [t.id, t])), [hubTasks]);
 // ?taskId= 深链指向不存在/非审计完成任务 → 回落大厅
 useEffect(() => {
 if (taskId != null && tasksLoaded && !loadErr && !taskById.has(taskId)) {
 setTaskId(null);
 setSearchParams({}, { replace: true });
 toast.info('任务不存在,或不是已完成的评估任务,已返回报告列表');
 }
 }, [taskId, tasksLoaded, loadErr, taskById, setSearchParams]);

 // 大厅聚合: 任务清单就绪即全量后台聚合(队列限流;无会话任务零请求即刻 done)
 const hubTaskIds = hubTasks.map((t) => t.id).join(',');
 useEffect(() => {
 if (!sessLoaded || !hubTaskIds) return;
 for (const tid of hubTaskIds.split(',').map(Number)) ensureAgg(tid);
 }, [sessLoaded, hubTaskIds, ensureAgg]);

 const entries: HubEntry[] = useMemo(() => hubTasks.map((t) => ({ task: t, agg: agg[t.id] })), [hubTasks, agg]);

 // ---- KPI(口径见各卡 title;合规分=100−risk_score 挂账口径) ----
 const kpi = useMemo(() => {
 let highRisk: number | null = null;
 const scores: number[] = [];
 let aggDone = 0;
 for (const t of hubTasks) {
 const a = agg[t.id];
 if (a?.done) aggDone++;
 if (a?.summary && typeof a.summary.confirmed_high === 'number') highRisk = (highRisk ?? 0) + a.summary.confirmed_high;
 const sc = complianceScoreOf(a?.summary);
 if (sc != null) scores.push(sc);
 }
 const exportable = new Set(sessions.map((s) => s.task_id).filter((tid) => tid && taskById.has(tid))).size;
 return { total: hubTasks.length, highRisk, avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null, exportable, aggDone, aggTotal: hubTasks.length };
 }, [hubTasks, agg, sessions, taskById]);

 // ---- 检索/排序/分页(useMemo 实时过滤) ----
 const filtered = useMemo(() => {
 const k = hub.q.trim().toLowerCase();
 let list = entries;
 if (k) list = list.filter((e) =>
 String(e.task.id).includes(k.replace(/^#/, ''))
 || String(e.task.package || '').toLowerCase().includes(k)
 || String(e.task.app_name || '').toLowerCase().includes(k));
 if (hub.risk === 'highrisk') list = list.filter((e) => (e.agg?.summary?.confirmed_high ?? 0) > 0);
 if (hub.risk === 'lowscore') list = list.filter((e) => { const s = complianceScoreOf(e.agg?.summary); return s != null && s < 60; });
 const unk = Number.MAX_SAFE_INTEGER;
 const sorted = [...list];
 if (hub.sort === 'new') sorted.sort((a, b) => String(b.task.updated_at || '').localeCompare(String(a.task.updated_at || '')) || b.task.id - a.task.id);
 if (hub.sort === 'risk') sorted.sort((a, b) => ((b.agg?.summary?.risk_score ?? -1) - (a.agg?.summary?.risk_score ?? -1)) || b.task.id - a.task.id);
 if (hub.sort === 'score') sorted.sort((a, b) => ((complianceScoreOf(a.agg?.summary) ?? unk) - (complianceScoreOf(b.agg?.summary) ?? unk)) || b.task.id - a.task.id);
    return sorted;
  }, [entries, hub.q, hub.risk, hub.sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / hub.pageSize));
  const page = Math.min(hub.page, pages);
  const paged = filtered.slice((page - 1) * hub.pageSize, page * hub.pageSize);

  // ================= 详情数据(既有链路,全部跟随 selected 会话) =================
  const [showDiff, setShowDiff] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [fileName, setFileName] = useState('executive_summary.md');
  const [preview, setPreview] = useState<TextPreview>({ state: 'loading', text: '' });

  // R60 指令4: 会话报告在线预览(含高管摘要段)——R104-2④ 解析为 KV 看板
  const [sessPreview, setSessPreview] = useState<TextPreview>({ state: 'loading', text: '' });
  // R110-3: 报告类型入口卡(渗透测试报告 / APK 级审计报告,三段=审计信息/漏洞信息/提取信息)
  const [sessKind, setSessKind] = useState<'pentest' | 'apk_audit'>('pentest');
 useEffect(() => {
 if (viewMode !== 'detail' || !selected) { setSessPreview({ state: 'loading', text: '' }); return; }
 setSessPreview({ state: 'loading', text: '' });
 const tt = localStorage.getItem('token') || '';
 fetch(`/api/pentest/sessions/${selected}/${sessKind === 'apk_audit' ? 'apk-audit-report' : 'report'}`, { headers: { Authorization: `Bearer ${tt}` } })
 .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
 .then((text) => setSessPreview({ state: 'ok', text }))
 .catch((e) => setSessPreview({ state: 'error', text: '', message: e.message }));
  }, [selected, sessKind, viewMode]);

  // R84-3 建/R103-10① 升级/R104-2② 网格化: 详情页域聚合(8 标准域+其他,同源 masvsDomains.ts)
  type CmCard = { rule_id: string; title: string; severity: string; count: number };
  type CmRow = { name: string; count: number; sev: Record<string, number>; cards: CmCard[] };
  const [cm, setCm] = useState<{ rows: CmRow[]; otherCount: number; total: number } | null>(null);
  const [cmFilter, setCmFilter] = useState<string | null>(null);
  const [cmState, setCmState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [vmState, setVmState] = useState<'loading' | 'ok' | 'error'>('loading');
 useEffect(() => {
 if (viewMode !== 'detail' || !selected) { setCm(null); return; }
 setCmState('loading');
 const tt = localStorage.getItem('token') || '';
 fetch(`/api/pentest/sessions/${selected}/vulns/grouped`, { headers: { Authorization: `Bearer ${tt}` } })
 .then((r) => r.json())
 .then((d) => {
 const cards: any[] = d.cards || [];
 const mk = (name: string): CmRow => ({ name, count: 0, sev: {}, cards: [] });
 const aggRows = DOMAINS.map((d2) => mk(d2.name));
 const other = mk('其他');
 for (const c of cards) {
 const dom = domainOf(c.masvs || '');
 const bucket = dom ? aggRows[DOMAINS.indexOf(dom)] : other;
 const n = c.instance_count || 1;
 bucket.count += n;
 bucket.sev[c.severity] = (bucket.sev[c.severity] || 0) + n;
 bucket.cards.push({ rule_id: String(c.rule_id || ''), title: c.title || '', severity: c.severity || 'info', count: n });
 }
 const total = aggRows.reduce((a2, b2) => a2 + b2.count, 0) + other.count;
 setCm({ rows: [...aggRows, other], otherCount: other.count, total });
 setCmState('ok');
 })
 .catch(() => { setCm(null); setCmState('error'); });
 }, [selected, viewMode]);
 const goDrill = (name: string) => {
 const sess = sessions.find((x) => x.id === selected);
 if (!sess?.project_id) { toast.info('该会话没有归属项目,不能在工作区查看'); return; } // R79-2 同规矩
 const dom = DOMAINS.find((x) => x.name === name);
    const masvs = dom ? [...dom.masvs, ...(dom.cwe || [])].join(',') : '__none__';   // 「其他」行 → __none__
    nav(`/pentest/project/${sess.project_id}/session/${selected}?tab=vulns&masvs=${encodeURIComponent(masvs)}`);
  };

  // R103-10② 建/R104-2③ 收敛: 漏洞明细(扁平 /vulns 三态桶)+ 本地合并层(导入/手动新增)
  const [vm, setVm] = useState<{ confirmed: any[]; pending: any[]; excluded: any[]; counts: Record<string, number> } | null>(null);
 useEffect(() => {
 if (viewMode !== 'detail' || !selected) { setVm(null); return; }
 setVmState('loading');
 const tt = localStorage.getItem('token') || '';
 fetch(`/api/pentest/sessions/${selected}/vulns`, { headers: { Authorization: `Bearer ${tt}` } })
 .then((r) => r.json())
 .then((d) => { setVm({ confirmed: d.confirmed || [], pending: d.pending || [], excluded: d.excluded || [], counts: d.counts || {} }); setVmState('ok'); })
 .catch(() => { setVm(null); setVmState('error'); });
  }, [selected, viewMode]);
  // 鉴权矩阵状态(声明前置于 effMx;获取实现 loadMatrix 见下,随 selected 会话)
  const [mx, setMx] = useState<any>(null);
  const [mxState, setMxState] = useState<'loading' | 'ok' | 'error' | 'empty'>('loading');

  // 本地合并层(纯前端暂存,零后端写入;导出即持久)
  const [localVulnsMap, setLocalVulnsMap] = useState<Record<number, LocalVuln[]>>({});
  const [localMxMap, setLocalMxMap] = useState<Record<number, any[]>>({});
 const localVulns: LocalVuln[] = selected != null ? (localVulnsMap[selected] || []) : [];
 const localMxRows: any[] | null = selected != null ? (localMxMap[selected] || null) : null;
 const effVm = useMemo(() => {
 if (!vm) return vm;
 if (!localVulns.length) return vm;
 return {
 confirmed: [...vm.confirmed, ...localVulns.filter((v) => v.state === 'confirmed')],
 pending: [...vm.pending, ...localVulns.filter((v) => v.state === 'pending')],
 excluded: [...vm.excluded, ...localVulns.filter((v) => v.state === 'excluded')],
 counts: {},
 };
 }, [vm, localVulns]);
 const effMx = useMemo(() => {
 if (!localMxRows?.length) return mx;
 if (!mx) return { rows: localMxRows, counts: recountMatrix(localMxRows), base_url: '(本地导入合并)', stale: false, watermark: 0 };
 return { ...mx, rows: localMxRows, counts: recountMatrix(localMxRows) };
 }, [mx, localMxRows]);

 const onAddManualVuln = (v: LocalVuln) => {
 if (selected == null) return;
 setLocalVulnsMap((m) => ({ ...m, [selected]: [...(m[selected] || []), v] }));
 };
 const onMergeImport = (target: ImportTarget, rows: any[], strategy: 'dedupe' | 'override') => {
 if (selected == null) return;
 if (target === 'vulns') {
 const base = vm ? [...vm.confirmed, ...vm.pending, ...vm.excluded] : [];
 const existing = [...base, ...(localVulnsMap[selected] || [])];
 const { merged, added, replaced } = mergeLocalVulns(existing, rows, strategy);
 // 本地合并层只存本地条目(导入/手动);与后端行的去重已按 标题+组件路径 键完成
 const keep = merged.filter((v: any) => v.source === 'import' || v.source === 'manual') as LocalVuln[];
 setLocalVulnsMap((m) => ({ ...m, [selected]: keep }));
 toast.ok(`发现明细已合并: 新增 ${added} 条${replaced ? `,替换 ${replaced} 条` : ''}。数据只在当前页面,导出后保留`);
 } else {
 const { rows: mergedRows, added, replaced } = mergeMatrixRows(effMx?.rows || null, rows, strategy);
 setLocalMxMap((m) => ({ ...m, [selected]: mergedRows }));
      toast.ok(`鉴权矩阵已合并: 新增 ${added} 条${replaced ? `,替换 ${replaced} 条` : ''}。数据只在当前页面,导出后保留`);
    }
  };

  // R78-3: 交互式 Diff 预览(报告中心)——发现级 added/removed/changed + kind/severity 双过滤 + 展开行
  const [cmpSid, setCmpSid] = useState<number | null>(null);
  const [cmp, setCmp] = useState<{ a: any; b: any } | null>(null);
  type DiffRow = { kind: 'added' | 'removed' | 'changed'; title: string; sev: string; note: string };
  const [diffRows, setDiffRows] = useState<DiffRow[] | null>(null);
 useEffect(() => {
 if (!showCompare || !selected || !cmpSid) { setCmp(null); setDiffRows(null); return; }
 const H = AUTH_H();
 Promise.all([
 fetch(`/api/pentest/sessions/${selected}/vulns`, { headers: H }).then((r) => r.json()),
 fetch(`/api/pentest/sessions/${cmpSid}/vulns`, { headers: H }).then((r) => r.json()),
 ]).then(([a, b]) => {
 setCmp({ a: a.counts, b: b.counts });
 const setOf = (d: any) => {
        const m = new Map<string, any>();
 for (const bucket of 'confirmed pending excluded'.split(' '))
 for (const f of d[bucket] || []) if (!m.has(f.title)) m.set(f.title, { ...f, state: f.state || bucket });
 return m;
 };
 const ma = setOf(a), mb = setOf(b);
 const rows: DiffRow[] = [];
 for (const [title, f] of mb) {
 const old = ma.get(title);
 if (!old) rows.push({ kind: 'added', title, sev: f.severity, note: `仅存在于 B 会话(状态 ${f.state})` });
 else if (old.state !== f.state || old.severity !== f.severity) {
 // R79-1②: severity 变化也算 changed;状态/严重度双变合并写
 const parts: string[] = [];
 if (old.state !== f.state) parts.push(`状态变更 ${old.state} → ${f.state}`);
 if (old.severity !== f.severity) parts.push(`严重度变更 ${old.severity} → ${f.severity}`);
 rows.push({ kind: 'changed', title, sev: f.severity, note: parts.join(' · ') });
 }
 }
 for (const [title, f] of ma)
 if (!mb.has(title)) rows.push({ kind: 'removed', title, sev: f.severity, note: `仅存在于 A 会话(状态 ${f.state})` });
 // R79-1②: 排序改 severity 权重(critical>high>medium>low>info)优先,kind 次之
 rows.sort((x, y) => (SEV_WEIGHT[x.sev] ?? 9) - (SEV_WEIGHT[y.sev] ?? 9) || x.kind.localeCompare(y.kind));
 setDiffRows(rows);
 }).catch(() => { setCmp(null); setDiffRows([]); });
 }, [showCompare, selected, cmpSid]);

 // R61 指令3 建/R63 指令1 修: 矩阵面板跟随选中会话(无硬编码 sid),三态(骨架/错误/空态)
 const loadMatrix = useCallback((refresh = false) => {
 if (!selected) { setMxState('empty'); return; }
 setMxState('loading'); setMx(null);
 const tt = localStorage.getItem('token') || '';
 fetch(`/api/pentest/sessions/${selected}/auth_matrix${refresh ? '?refresh=1' : ''}`, { headers: { Authorization: `Bearer ${tt}` } })
 .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
 .then((d) => {
 if (d && (d.rows || []).length > 0) { setMx(d); setMxState('ok'); }
 else setMxState('empty');
 })
 .catch(() => setMxState('error'));
 }, [selected]);
 useEffect(() => { if (viewMode === 'detail') loadMatrix(false); }, [selected, viewMode]);

 // 审计报告(pipeline)——锚定当前任务
 useEffect(() => {
 if (viewMode !== 'detail' || !taskId) { setPreview({ state: 'loading', text: '' }); return; }
 setPreview({ state: 'loading', text: '' });
 const H = { Authorization: `Bearer ${localStorage.getItem('token') || ''}` };
 fetch(`/api/tasks/${taskId}/report-file?name=${fileName}`, { headers: H })
 .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
 .then((text) => setPreview({ state: 'ok', text }))
 .catch((e) => setPreview({ state: 'error', text: '', message: e.message }));
 }, [taskId, fileName, viewMode]);

 // ---- 导出/下载(端点既有能力 + 纯前端合成) ----
 const dl = (kind: 'package' | 'pdf') => {
 if (!selected) return;
 const url = kind === 'package'
 ? `/api/pentest/sessions/${selected}/report/package`
 : `/api/pentest/sessions/${selected}/report/pdf${sessKind === 'apk_audit' ? '?kind=apk_audit' : ''}`;
 fetch(url, { headers: AUTH_H() }).then((r) => r.blob()).then((blob) => {
 const a = document.createElement('a');
 a.href = URL.createObjectURL(blob);
 a.download = kind === 'package' ? `report_${selected}.zip` : `report_${selected}.html`;
 a.click();
 URL.revokeObjectURL(a.href);
 });
 };
 const dlExec = () => {
 if (!selected) return;
 fetch(`/api/pentest/sessions/${selected}/executive-summary.pdf`, { headers: AUTH_H() })
 .then((r) => r.blob()).then((blob) => {
 const a = document.createElement('a');
 a.href = URL.createObjectURL(blob);
 a.download = `exec_summary_${selected}.pdf`;
 a.click();
 URL.revokeObjectURL(a.href);
 });
 };
 const exportEvidenceJson = () => {
 if (!selected || !vm) return;
 const sess = sessions.find((x) => x.id === selected);
 const pack = {
 kind: 'vulns_evidence_pack',
 session_id: selected,
 package: sess?.package || '',
 exported_at: new Date().toISOString(),
 caliber: '扁平 GET /api/pentest/sessions/{sid}/vulns 响应原样封装(三态桶+counts);rule_id 后端现返回空串',
 data: vm,
 };
 downloadJson(`vulns_evidence_${selected}.json`, pack);
 };

 const detailTask = taskId != null ? (taskById.get(taskId) || null) : null;
 const detailAgg: TaskAgg | undefined = taskId != null ? agg[taskId] : undefined;
 const taskSessions = useMemo(() =>
 taskId != null ? sessions.filter((s) => s.task_id === taskId).sort((a, b) => b.id - a.id) : [],
 [sessions, taskId]);
 const repSid = taskSessions[0]?.id ?? null;

 const buildCtx = useCallback((): ReportCtx => ({
 task: detailTask,
 session: sessions.find((x) => x.id === selected) || null,
 summary: detailAgg?.summary || null,
 domains: detailAgg?.domains ? detailAgg.domains.rows.map((r) => ({ name: r.name, count: r.count })) : null,
 domainsTotal: detailAgg?.domains?.total ?? 0,
 vulns: effVm ? [...effVm.confirmed, ...effVm.pending, ...effVm.excluded] : [],
 mx: effMx || null,
 compliance: complianceScoreOf(detailAgg?.summary),
 }), [detailTask, sessions, selected, detailAgg, effVm, effMx]);

 const guardVm = () => { if (!effVm) { toast.info('发现明细还没有加载完成,稍后再导出'); return false; } return true; };
 const guardMx = () => { if (!effMx?.rows?.length) { toast.info('鉴权矩阵还没有加载,或该会话没有矩阵'); return false; } return true; };
 const onExportVulnsCsv = () => {
 if (!guardVm() || selected == null) return;
 downloadCsv(`vulns_${selected}.csv`, vulnsCsvRows([...effVm!.confirmed, ...effVm!.pending, ...effVm!.excluded]));
 toast.ok(`发现明细 CSV 已导出(${effVm!.confirmed.length + effVm!.pending.length + effVm!.excluded.length} 条)`);
 };
 const onExportMatrixCsv = () => {
 if (!guardMx()) return;
 downloadCsv(`auth_matrix_${selected}.csv`, matrixCsvRows(effMx));
 toast.ok('鉴权矩阵 CSV 已导出');
 };
 const onExportMatrixJson = () => {
 if (!guardMx()) return;
 downloadJson(`auth_matrix_${selected}.json`, matrixExportJson(effMx, selected));
 toast.ok('鉴权矩阵 JSON 已导出');
 };
 const onExportFullJson = () => { downloadJson(`full_audit_report_task${taskId}.json`, buildFullReportJson(buildCtx())); toast.ok('完整报告 JSON 已导出'); };
 const onExportFullMd = () => { downloadText(`full_audit_report_task${taskId}.md`, buildFullReportMarkdown(buildCtx())); toast.ok('完整报告 Markdown 已导出'); };
 const [printMd, setPrintMd] = useState('');
 const [printMode, setPrintMode] = useState(false);
 const onPrint = () => { setPrintMd(buildFullReportMarkdown(buildCtx())); setPrintMode(true); };

 // ---- 大厅单任务/批量导出(先 ensure 聚合再合成) ----
 const onExportOne = (tid: number) => {
 ensureAgg(tid).then(() => {
 const e = { task: taskById.get(tid), agg: aggRef.current[tid] };
 if (!e.task) return;
 downloadCsv(`task_${tid}_summary.csv`, hubSummaryCsvRows([e]));
 toast.ok(`任务 #${tid} 汇总 CSV 已导出`);
 });
 };
 const onExportBatch = () => {
 const ids = [...hub.checked];
 if (!ids.length) return;
 setBatchBusy(true);
 Promise.all(ids.map((tid) => ensureAgg(tid))).then(() => {
 const rows = ids.map((tid) => ({ task: taskById.get(tid), agg: aggRef.current[tid] })).filter((e) => e.task);
 downloadCsv(`audit_tasks_summary_${rows.length}.csv`, hubSummaryCsvRows(rows));
 toast.ok(`已导出 ${rows.length} 个任务的汇总 CSV`);
 setBatchBusy(false);
 }).catch(() => { toast.err('批量导出失败'); setBatchBusy(false); });
 };

 // ---- 导航 ----
 const openTask = (tid: number) => {
 setTaskId(tid);
 setSearchParams({ taskId: String(tid) }, { replace: true });
 const sess = repSessionOf(tid);
 if (sess) setSelected(sess.id);
 };
 const backToHub = () => {
    setTaskId(null);
    setSearchParams({}, { replace: true });
  };

  const printRef = useOverlay(printMode, () => setPrintMode(false));
  const detailBlocked = viewMode === 'detail' && !detailTask && !!loadErr;
  const errStatus = loadErr && typeof loadErr === 'object' && 'status' in (loadErr as any) ? Number((loadErr as any).status) : undefined;

  return (
    <>
      <Page className={printMode ? 'hidden' : undefined} data-reports-page>
        {viewMode === 'hub' || !detailTask ? (
          <>
            <PageHeader title={moduleLabel('/reports')}
              description="已完成评估任务的报告。打开任务可以查看鉴权矩阵、合规域分布、发现明细,并导出报告。"
              meta={kpi.aggDone < kpi.aggTotal && kpi.aggTotal > 0 ? (
                <span role="status" data-agg-progress className="tnum">正在汇总各任务的会话指标 {kpi.aggDone}/{kpi.aggTotal}</span>
              ) : undefined} />
            {detailBlocked ? (
              errStatus === 401 || errStatus === 403 ? <PermissionState /> : <ErrorState title="报告加载失败" message="任务列表请求没有成功,无法打开这份报告。" onRetry={loadTasks} />
            ) : (
              <HubView
                loading={!tasksLoaded} error={loadErr} onRetry={loadTasks} onCreate={() => nav('/new-audit')}
                entries={entries} filtered={filtered} paged={paged} kpi={kpi}
                hub={{ ...hub, page }} patch={patchHub}
                onOpen={openTask} onExportOne={onExportOne} onExportBatch={onExportBatch} batchBusy={batchBusy}
              />
            )}
          </>
        ) : (
          <DetailView
            task={detailTask} entries={entries} taskSessions={taskSessions}
            selected={selected ?? repSid} aggLoading={!tasksLoaded || !sessLoaded}
            onPickSession={(sid) => setSelected(sid)}
            onBack={backToHub} onPickTask={openTask}
            mx={effMx} mxState={effMx ? 'ok' : mxState} reloadMatrix={loadMatrix}
            cm={cm} cmState={cmState} cmFilter={cmFilter} setCmFilter={setCmFilter} goDrill={goDrill}
            vm={effVm} vmState={vmState} localVulns={localVulns}
            onMergeImport={onMergeImport} onAddManualVuln={onAddManualVuln}
            sessKind={sessKind} setSessKind={setSessKind} sessPreview={sessPreview} sessions={sessions}
            fileName={fileName} setFileName={setFileName} preview={preview}
            showDiff={showDiff} setShowDiff={setShowDiff}
            showCompare={showCompare} setShowCompare={setShowCompare}
            cmpSid={cmpSid} setCmpSid={setCmpSid} cmp={cmp} diffRows={diffRows}
            onDl={dl} onDlExec={dlExec} onExportEvidenceJson={exportEvidenceJson}
            onExportVulnsCsv={onExportVulnsCsv}
            onExportMatrixCsv={onExportMatrixCsv} onExportMatrixJson={onExportMatrixJson}
            onExportFullJson={onExportFullJson} onExportFullMd={onExportFullMd} onPrint={onPrint}
          />
        )}
      </Page>

      {/* Print view of the full report. window.print() uses the existing report-print-container isolation and the paper tokens. */}
      {printMode && (
        <div ref={printRef} role="dialog" aria-modal="true" aria-label="打印预览" tabIndex={-1} data-print-view
          className="fixed inset-0 z-50 overflow-auto bg-jz-scrim/50 p-4 tablet:p-6 print:static print:overflow-visible print:bg-transparent print:p-0">
          <div className="mx-auto w-full max-w-4xl print:max-w-none">
            <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-3 rounded-card border border-jz-border bg-jz-surface px-4 py-3 shadow-card">
              <div className="min-w-0">
                <div className="text-body font-semibold text-jz-ink">打印预览</div>
                <div className="text-meta text-jz-muted">完整报告。在浏览器的打印对话框里选择「另存为 PDF」可以得到文件。</div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setPrintMode(false)}>关闭</Button>
                <Button icon={<Printer size={16} aria-hidden />} onClick={() => window.print()} data-print-go>打印</Button>
              </div>
            </div>
            <div className="report-print-container rounded-card border border-jz-border bg-jz-surface p-6 shadow-card print:rounded-none print:border-0 print:p-0 print:shadow-none">
              <pre className="whitespace-pre-wrap break-words font-mono text-label text-jz-ink">{printMd}</pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
