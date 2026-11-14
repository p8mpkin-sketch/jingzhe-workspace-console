// TaskCenterPage.tsx — task list: search, status, owner; bulk rerun and delete; detail drawer.
// Requests, payloads, query params, timers and data-* hooks are unchanged; only the presentation is new.
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ClipboardList, Download, ExternalLink, FileText, FolderOpen, Info, MessageSquare, MoreHorizontal, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '@/services/api';
import { usePentest } from '@/stores/pentest';
import {
  Page, PageHeader, Panel, Metric, MetricGrid, DataTable, Pagination, BulkBar, Tabs, Button, IconButton, Select, Checkbox, SearchField,
  StatusBadge, Tag, Dialog, ConfirmDialog, Drawer, Popover, MenuItem, EmptyState, StaleNotice, InlineAlert, AsyncBoundary,
  exportDataFile, useMediaQuery, cx,
} from '@/components/ui';
import type { Column, TabItem } from '@/components/ui';
import { moduleLabel } from '@/layout/navigation';
import { ArtifactsModal } from './ArtifactsModal';
import { RerunTaskModal } from './RerunTaskModal';
import {
  ST_CN, PAGE_SIZES, SLOW_S, SMOKE_FAIL_S, PACKER_NAMES, fmtDur, fmtTime, whenFull, honestDone, outcomeProbe,
  TaskLiveProgress, PackerChip, devKind,
} from './taskParts';

export const TaskCenterPage: React.FC = () => {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusParam = searchParams.get('focus');   // R94-1: AI 助手出处卡跳转高亮目标任务行
  const statusParam = searchParams.get('status') || '';
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [sessions, setSessions] = useState<any[] | null>(null);
  const [filter, setFilter] = useState(statusParam);
  const [search, setSearch] = useState('');
  const [searchDeb, setSearchDeb] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);   // R103-9③
  const [sessMap, setSessMap] = useState<Record<number, { pid: number; sid: number }>>({});
  const [delAsk, setDelAsk] = useState<any | null>(null);   // single-task delete confirmation
  const [loadErr, setLoadErr] = useState<unknown>(null);
  // Width tiers: owner column from 1600, all row actions inline from 1440, record cards below 1280.
  const showOwner = useMediaQuery('(min-width: 1600px)');
  const wide = useMediaQuery('(min-width: 1440px)');
  const tableFits = useMediaQuery('(min-width: 1280px)');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  // R103-9①: 勾选批量(跨页累计;底部批量条)
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [delOpen, setDelOpen] = useState(false);   // R103-9① 批量清理二次确认
  const [retryOpen, setRetryOpen] = useState(false);   // R117-4③ 批量重跑二次确认(危险批操作前置确认补齐)
  const [batchBusy, setBatchBusy] = useState(false);   // R117-4③ 批处理期锁: 三钮置灰防重复批处理雪崩,finally 无条件解灰
  const [batchMsg, setBatchMsg] = useState<string | null>(null); // 批量操作结果如实回显
  // 本轮新增: 检索扩展(加固壳/操作员筛选 + 0s 冒烟失败隐藏胶囊)+ 行内详情弹窗 + 会话滑轨折叠/翻页
  const [packerF, setPackerF] = useState('all');
  const [operatorF, setOperatorF] = useState('');
  const [hideSmokeFail, setHideSmokeFail] = useState(false);
  const [detailTask, setDetailTask] = useState<any | null>(null);
  const [cleanOpen, setCleanOpen] = useState(false);   // 清理失败项(当前过滤视图内 failed)二次确认
  const [sessRailOpen, setSessRailOpen] = useState(true);
  const railRef = useRef<HTMLDivElement>(null);
  const [railNav, setRailNav] = useState<{ prev: boolean; next: boolean }>({ prev: false, next: false });
  // 本轮修复②: 在线设备真值=usePentest.devices(TopBar 8s 单点轮询 /api/pentest/devices 写入的共享 store,
  // 仅 state='device' 的在线设备入池——零二次轮询,勿再直连端点)
  const liveDevices = usePentest((s) => s.devices);

 useEffect(() => { if (searchTimer.current) clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => setSearchDeb(search), 200); return () => clearTimeout(searchTimer.current); }, [search]);
 useEffect(() => { setPage(1); }, [searchDeb, pageSize, filter, packerF, operatorF, hideSmokeFail]); // R103-9③: 口径变化回第一页
 // 全平台升级 Step2②: 深链 status 参数变化即同步过滤器(侧栏引擎负载警示卡 → /tasks?status=failed 落点)
 useEffect(() => { setFilter(statusParam); setPage(1); }, [statusParam]);

 // R103-9②: `/` 键聚焦搜索框(输入态/组合键不劫持,与 CmdPalette meta/ctrl+k 无冲突)
 // 全平台升级 Step2②: 搜索框迁入 DataToolbar,聚焦改探针定位(data-task-search 存量探针保留)
 useEffect(() => {
 const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      document.querySelector<HTMLInputElement>('[data-task-search]')?.focus();
 };
 window.addEventListener('keydown', onKey);
 return () => window.removeEventListener('keydown', onKey);
 }, []);

 // R103-8①: sessions 死 state 复活——同一响应双写(会话条 activeSids + 接力映射 sessMap)
 const loadAll = useCallback(() => {
    api<any[]>('/api/pentest/sessions').then((rows) => {
      setSessions(rows || []);
      // R602: 对齐 R128 同族口径——pid=0(仪表盘发起的无主会话)不再被 project_id!=null 过滤排除
      const m: Record<number, { pid: number; sid: number }> = {};
 for (const r of rows || []) { if (r.task_id) m[r.task_id] = { pid: r.project_id ?? 0, sid: r.id }; }
 setSessMap(m);
 }).catch(() => {});
    api<any[]>('/api/tasks?limit=2000').then((rows) => {
 setLoadErr(null);
 setTasks(rows || []);
 setSel((prev) => { // R103-9①: 勾选集随列表修剪(被删行不再滞留)
 const ids = new Set((rows || []).map((r: any) => r.id));
 const nx = new Set([...prev].filter((id) => ids.has(id)));
 return nx.size === prev.size ? prev : nx;
 });
 }).catch((e) => { setTasks((prev) => prev ?? []); setLoadErr(e || new Error('加载失败')); }); // keep the last list on a failed refresh
 }, []);
 // R121: focus 深链(通知中心跳转/AI 助手出处卡)变化即重载列表——否则点击「任务失败 #N」通知
 // 落地时新任务行尚不在挂载时拉取的列表里,聚焦落空
 useEffect(() => { loadAll(); }, [loadAll, focusParam]);

 // R103-8②: 运行中任务耗时真算的跳动时钟(10s 粒度,零假进度)
 const [now, setNow] = useState(() => Date.now() / 1000);
 useEffect(() => { const iv = setInterval(() => setNow(Date.now() / 1000), 10000); return () => clearInterval(iv); }, []);

  // 阶段A-1: 产物浏览——R104-5② 重写为 ArtifactsModal(UnifiedModal 基底, 数据/预览/下载/ZIP 语义见组件头注)
  const [artTask, setArtTask] = useState<number | null>(null);
  const [rerunTask, setRerunTask] = useState<any | null>(null);

  // 阶段A挂账收口: 批量脱壳聚合报告卡(只读 batch 标记任务群)
  const [batchSum, setBatchSum] = useState<any>(null);
 const [batchOpen, setBatchOpen] = useState(false);
 const loadBatch = () => api<any>('/api/tasks/batch-unpack-summary').then((d) => { setBatchSum(d); setBatchOpen(true); }).catch(() => {});
 useEffect(() => { api<any>('/api/tasks/batch-unpack-summary').then((d) => { if ((d.count || 0) > 0) setBatchSum(d); }).catch(() => {}); }, []);   // eslint-disable-line

  // R103-8②: 漏洞四色计数+操作员名(允许清单端点 /api/tasks/counts,按当前页行拉取)
  const [counts, setCounts] = useState<Record<string, any>>({});
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  // R118-2(方案4.4 字面落地): 并发执行槽位 N/M——真值源=/api/org usage(后端实证:
  // running=COUNT(status IN ('running','queued')) org 域真值, quota_concurrent=组织套餐并发闸, 429 配额闸同源)
  const [slots, setSlots] = useState<{ running: number; quota: number } | null>(null);
 useEffect(() => {
    api<any>('/api/org').then((o) => setSlots({ running: o?.usage?.running ?? 0, quota: o?.usage?.quota_concurrent ?? -1 })).catch(() => setSlots(null));
 }, []);

 const rerun = async (t: any) => {
 await api('/api/tasks', { method: 'POST', body: JSON.stringify({ kind: t.kind || 'audit', app_name: t.app_name, apk_path: t.apk_path, authorized: '任务中心重跑' }) });
 setTimeout(loadAll, 600); // R103-8③: 局部刷新替代整页 reload
 };
 const removeTask = async (t: any) => { await api(`/api/tasks/${t.id}`, { method: 'DELETE' }); setTimeout(loadAll, 600); };

 // R103-9①: 批量操作——循环既有 rerun 语义/循环 DELETE(运行中·排队后端 400 如实跳过)
 // R117-4③(方案4.3): 批量重跑接入统一模态二次确认(明示将重跑的任务条数);批处理生命周期
 // batchBusy 锁——触发即置灰阻断二次请求,finally 无条件解灰(异步防死锁铁律);批量清理同锁。
 const selTasks = useMemo(() => (tasks || []).filter((t: any) => sel.has(t.id)), [tasks, sel]);
 // R602(挂账池收口): 恰选 2 个且均有渗透会话关联 → 报告中心对比(经 ?sid=&cmp= URL 参数驱动既有对比面板,零新端点)
 const cmpPair = useMemo(() => {
 if (sel.size !== 2) return null;
 const [x, y] = [...sel];
 const a = sessMap[x], b = sessMap[y];
 return a && b ? { a: a.sid, b: b.sid } : null;
 }, [sel, sessMap]);
 const batchRetry = async () => {
 if (batchBusy) return;
 setRetryOpen(false);
 setBatchBusy(true);
 let ok = 0, fail = 0;
 try {
 for (const t of selTasks) {
 try { await api('/api/tasks', { method: 'POST', body: JSON.stringify({ kind: t.kind || 'audit', app_name: t.app_name, apk_path: t.apk_path, authorized: '任务中心重跑' }) }); ok++; }
 catch { fail++; }
 }
 setBatchMsg(`已重新运行 ${ok} 个任务${fail ? `,${fail} 个没有成功` : ''}`); setSel(new Set()); setTimeout(loadAll, 800);
 } finally { setBatchBusy(false); }
 };
 const batchDelete = async () => {
 if (batchBusy) return;
 setDelOpen(false);
 setBatchBusy(true);
 let ok = 0, skip = 0;
 try {
 for (const t of selTasks) {
 try { await api(`/api/tasks/${t.id}`, { method: 'DELETE' }); ok++; } catch { skip++; }
 }
 setBatchMsg(`已删除 ${ok} 个任务${skip ? `,跳过 ${skip} 个(运行中或排队中的任务不能删除)` : ''}`); setSel(new Set()); loadAll();
 } finally { setBatchBusy(false); }
 };
 // 本轮新增: 清理失败项——范围=当前过滤视图内 status=failed(所见即所删,二次确认列明细);
 // 复用既有单任务 DELETE 与 batchBusy 锁

 // ── 导出(任务列表 CSV/JSON)── 数据=当前过滤视图真值;业务码类数解析不到=留空不编造
 const exportRows = (rows: any[]) => rows.map((t: any) => {
   const dur = (t.status === 'done' || t.status === 'failed') ? (t.updated_at || t.created_at) - t.created_at : now - t.created_at;
   const c = counts[String(t.id)] || {};
   const h = honestDone(t);
   return {
     'ID': t.id,
     '类型': t.kind || t.type || 'audit',
     '目标应用': t.app_name || t.package || '',
     '包名': t.package || '',
     '壳': t.packer || '',
     '状态语义': t.status === 'failed' ? '失败' : t.status === 'done' ? (h.blocked ? `完成(脱壳受阻·${h.label})` : h.biz != null ? `完成·业务码${h.biz}类` : h.shell ? '完成(无脱壳判定数据)' : '完成(无壳应用·无脱壳环节)') : (ST_CN[t.status] || t.status),
     '业务码类数': t.status === 'done' && h.biz != null ? h.biz : '',
     '漏洞C': c.critical ?? '', '漏洞H': c.high ?? '', '漏洞M': c.medium ?? '', '漏洞L': c.low ?? '',
     '操作员': usersMap[String(t.user_id)] || (t.user_id != null ? `#${t.user_id}` : ''),
     '耗时秒': Math.round(dur),
     '创建时间': t.created_at ? new Date(t.created_at * 1000).toLocaleString('zh-CN', { hour12: false }) : '',
     '更新时间': t.updated_at ? new Date(t.updated_at * 1000).toLocaleString('zh-CN', { hour12: false }) : '',
     '失败原因': t.status === 'failed' ? (t.error_msg || t.progress || '') : '',
   };
 });

 const relay = async (t: any) => {
    // R76-2: 无项目关联禁跳——不许兜底 project/1
    const hit = sessMap[t.id];
    if (!hit) return;
    const s = await api<any>(`/api/pentest/projects/${hit.pid}/sessions`, { method: 'POST', body: JSON.stringify({ task_id: t.id, device: 'emulator-5554', authorized: '任务中心接力' }) });
 if (s?.id) window.location.hash = `/pentest/project/${hit.pid}/session/${s.id}`;
 };

 const allTasks = tasks || [];
 // R597(六模块优化-任务中心 P2): 运行中任务泳道数据源(running 任务与历史表格分离置顶)
 const runningTasks = useMemo(() => (tasks || []).filter((t: any) => t.status === 'running'), [tasks]);
 // R94-1: focus 目标任务置顶(否则分页挡在高亮页之外)
 const focusTasks = focusParam
 ? [...allTasks].sort((a: any, b: any) => (String(b.id) === focusParam ? 1 : 0) - (String(a.id) === focusParam ? 1 : 0))
 : allTasks;
 // 状态计数(工具栏胶囊): degraded=伪状态——明确有壳且(业务码=0 或文本明确未脱出)的受阻完成任务(收紧判定见 honestDone)
 const degradedCount = useMemo(() => focusTasks.filter((t: any) => t.status === 'done' && honestDone(t).blocked).length, [focusTasks]);
 // 0s 冒烟失败计数(口径: failed 且耗时<2s;后端无 svc_smoke 标记=诚实降级为耗时判据)
 const smokeFailCount = useMemo(() => focusTasks.filter((t: any) => t.status === 'failed' && ((t.updated_at || t.created_at) - t.created_at) < SMOKE_FAIL_S).length, [focusTasks]);
 // 加固壳筛选下拉选项: 由已加载任务真实 packer 值派生(库外值原样显,不假造分组)
 const packerOptions = useMemo(() => {
 const m = new Map<string, number>();
 for (const t of allTasks) { if (t.packer && t.packer !== 'none') m.set(t.packer, (m.get(t.packer) || 0) + 1); }
 return [...m.entries()].sort((a, b) => b[1] - a[1]);
 }, [allTasks]);
 // 操作员筛选下拉选项: 已加载任务真实 user_id 派生;名字来自 /api/tasks/counts users 映射(未加载页先显 #id,不编名)
 const operatorOptions = useMemo(() => {
 const m = new Map<string, number>();
 for (const t of allTasks) { if (t.user_id != null) { const k = String(t.user_id); m.set(k, (m.get(k) || 0) + 1); } }
 return [...m.entries()].sort((a, b) => b[1] - a[1]);
 }, [allTasks]);

 const filtered = useMemo(() => {
 let f = filter
 ? focusTasks.filter((t: any) => filter === 'degraded' ? (t.status === 'done' && honestDone(t).blocked) : t.status === filter)
 : focusTasks;
 if (packerF === '__packed') f = f.filter((t: any) => t.packer && t.packer !== 'none');
 else if (packerF !== 'all') f = f.filter((t: any) => t.packer === packerF);
 if (operatorF) f = f.filter((t: any) => String(t.user_id ?? '') === operatorF);
 if (hideSmokeFail) f = f.filter((t: any) => !(t.status === 'failed' && ((t.updated_at || t.created_at) - t.created_at) < SMOKE_FAIL_S));
 // 搜索域(规格): 应用名/包名/#ID/操作员/失败原因——失败原因=后端派生 error_msg(failed 任务 progress 前 200 字)
 if (searchDeb) {
 const q = searchDeb.toLowerCase();
 f = f.filter((t: any) => (t.app_name || '').toLowerCase().includes(q)
 || (t.package || '').toLowerCase().includes(q)
 || String(t.id).includes(q)
 || (usersMap[String(t.user_id)] || '').toLowerCase().includes(q)
 || (t.error_msg || '').toLowerCase().includes(q));
 }
 return f;
 }, [focusTasks, filter, searchDeb, packerF, operatorF, hideSmokeFail, usersMap]);
 // 清理失败项目标(过滤视图内 failed;由 filtered 派生,所见即所删)
 const failedInView = useMemo(() => filtered.filter((t: any) => t.status === 'failed'), [filtered]);
 const cleanFailed = async () => {
 if (batchBusy) return;
 setCleanOpen(false);
 setBatchBusy(true);
 let ok = 0, skip = 0;
 try {
 for (const t of failedInView) {
 try { await api(`/api/tasks/${t.id}`, { method: 'DELETE' }); ok++; } catch { skip++; }
 }
 setBatchMsg(`已删除 ${ok} 个失败任务${skip ? `,跳过 ${skip} 个(服务端拒绝)` : ''}`); loadAll();
 } finally { setBatchBusy(false); }
 };
 // 导出所选(底部批量条): 与工具栏导出同字段(exportRows 真值;缺加载的计数留空不编造)
 const exportSelCsv = () => {
 exportDataFile('tasks_export', 'csv', exportRows(selTasks));
 setBatchMsg(`已导出选中的 ${selTasks.length} 行(CSV)`);
 };
 const exportSelJson = () => {
 exportDataFile('tasks_export', 'json', exportRows(selTasks));
 setBatchMsg(`已导出选中的 ${selTasks.length} 行(JSON)`);
 };

 const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
 const safePage = Math.min(page, totalPages);
 const pageRows = useMemo(() => filtered.slice((safePage-1)*pageSize, safePage*pageSize), [filtered, safePage, pageSize]);
 // R103-9①: 本页全选/单选切换
 const pageIds = useMemo(() => (pageRows || []).map((t: any) => t.id), [pageRows]);
 const allPageSel = pageIds.length > 0 && pageIds.every((id: number) => sel.has(id));
 const toggleRow = (id: number) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
 const toggleAllPage = () => setSel((p) => { const n = new Set(p); if (allPageSel) pageIds.forEach((id: number) => n.delete(id)); else pageIds.forEach((id: number) => n.add(id)); return n; });
 const pageIdsKey = useMemo(() => (pageRows||[]).map((t:any)=>t.id).join(','), [pageRows]);
 useEffect(() => {
    if (!pageIdsKey) return;
    let alive = true;
    api<any>(`/api/tasks/counts?ids=${pageIdsKey}`).then((d) => {
 if (!alive) return;
 setCounts((prev) => ({ ...prev, ...(d.items || {}) }));
 setUsersMap((prev) => ({ ...prev, ...(d.users || {}) }));
 }).catch(() => {});
 return () => { alive = false; };
 }, [pageIdsKey]);
 const activeSids = (sessions||[]).filter((s:any)=>s.status!=='closed'&&s.device);
 const hasRunning = (tasks||[]).some((t:any)=>t.status==='running'); // R103-9②: 微光点真值门控
 const hasFilterChip = !!filter;

 // 会话滑轨翻页箭头: 按容器 80% 步进横滚(防截断);滚动到头按钮如实禁用
 const updateRailNav = useCallback(() => {
 const el = railRef.current;
 if (!el) return;
 setRailNav({ prev: el.scrollLeft > 4, next: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
 }, []);
 useEffect(() => { updateRailNav(); }, [activeSids.length, sessRailOpen, updateRailNav]);
 const scrollRail = (dir: number) => {
 const el = railRef.current;
 if (!el) return;
 el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' });
 };
  // ── Derived display values ──
  const queuedN = allTasks.filter((t: any) => t.status === 'queued').length;
  const slotInfo = slots ? (() => {
    const used = slots.running;
    const quota = slots.quota;
    const unlim = quota == null || quota < 0;
    const load = !unlim && quota > 0 ? Math.round((used / quota) * 100) : null;
    const free = unlim ? null : Math.max(0, quota - used);
    const full = !unlim && quota > 0 && used >= quota;
    const hot = full || (load != null && load >= 80);
    const warm = !hot && load != null && load >= 50;
    return { used, quota, unlim, load, free, hot, warm };
  })() : null;

  const durOf = (t: any) => (t.status === 'done' || t.status === 'failed') ? (t.updated_at || t.created_at) - t.created_at : now - t.created_at;
  const artifactsReadyOf = (t: any) => (t.kind === 'unpack' || t.kind === 'audit') && t.status === 'done';
  const canAskOf = (t: any) => t.kind === 'audit' && t.status === 'done' && !!t.result_id;
  const gotoSession = (hit: { pid: number; sid: number }) => { window.location.hash = `/pentest/project/${hit.pid}/session/${hit.sid}`; };
  // Row click: linked session first, then artifacts. Rows with neither do nothing.
  const openRow = (t: any) => {
    const hit = sessMap[t.id];
    if (hit) { gotoSession(hit); return; }
    if (artifactsReadyOf(t)) setArtTask(t.id);
  };
  const operatorOf = (t: any) => usersMap[String(t.user_id)] || (t.user_id != null ? `#${t.user_id}` : '—');
  const taskLine = (t: any) => `#${t.id} ${t.app_name || t.package || ''} [${ST_CN[t.status] || t.status}]`;

  const statusTabs: TabItem<string>[] = ([
    { key: '', label: '全部', count: focusTasks.length },
    { key: 'done', label: '完成', count: focusTasks.filter((t: any) => t.status === 'done').length },
    { key: 'running', label: '运行中', count: focusTasks.filter((t: any) => t.status === 'running').length, dot: hasRunning },
    { key: 'failed', label: '失败', count: focusTasks.filter((t: any) => t.status === 'failed').length },
    { key: 'queued', label: '排队', count: focusTasks.filter((t: any) => t.status === 'queued').length },
    { key: 'degraded', label: '部分完成', count: degradedCount, title: '已完成但有加固且业务代码没有脱出的任务' },
  ] as Array<{ key: string; label: string; count: number; dot?: boolean; title?: string }>).map((f) => ({
    key: f.key, count: f.count,
    label: <>{f.dot && <span aria-hidden className="h-1.5 w-1.5 rounded-pill bg-jz-brand" data-toolbar-dot />}{f.label}</>,
    dataAttrs: { 'data-toolbar-filter': f.key, 'data-active': filter === f.key ? '1' : '', title: f.title },
  }));
  const filtersOn = !!filter || !!searchDeb || packerF !== 'all' || !!operatorF || hideSmokeFail;
  const clearFilters = () => { setFilter(''); setSearchParams({}); setSearch(''); setPackerF('all'); setOperatorF(''); setHideSmokeFail(false); };

  const statusCell = (t: any) => {
    const h = honestDone(t);
    const probeVal = outcomeProbe(t.unpack_outcome);
    if (t.status === 'failed') {
      return (
        <div className="flex max-w-56 flex-col items-start gap-1" data-honest-status="failed">
          <StatusBadge tone="danger">失败</StatusBadge>
          <span className="line-clamp-2 break-all text-meta text-jz-ink-2" title={t.error_msg || '服务端没有返回失败原因'}>
            {t.error_msg || t.progress || '服务端没有返回失败原因'}
          </span>
        </div>
      );
    }
    if (t.status === 'done' && h.blocked) {
      const d = t.unpack_outcome?.diagnosis || {};
      const checks = d.checks || {};
      const labelMap: Record<string, string> = { zygisk_off: 'Zygisk 关闭', debuggable: 'debuggable', permissive: 'SELinux', libzzp: 'libzzp' };
      const unmet = Object.entries(checks).filter(([, v]) => !v).map(([k]) => labelMap[k] || k);
      const reason = d.reason || t.progress || '';
      const channel = t.unpack_outcome?.unpack_method || '';
      const engine = t.unpack_outcome?.engine_commit || '';
      return (
        <div className="flex max-w-56 flex-col items-start gap-1" data-honest-status="degraded">
          <StatusBadge tone="attention" title="流程已跑完,但有加固且业务代码没有脱出。结论只覆盖部分代码。">部分完成</StatusBadge>
          <span data-unpack-outcome={probeVal || undefined} className="break-all text-meta text-jz-ink-2"
            title={t.unpack_outcome?.diagnosis?.reason || t.progress || '依据任务的脱壳结果判断'}>{h.label}</span>
          <span data-unpack-reason className="line-clamp-2 break-words text-meta text-jz-muted" title={reason}>
            {[channel && `通道 ${channel}`, unmet.length ? `未满足:${unmet.join('、')}` : '', reason ? reason.slice(0, 140) : '没有返回具体原因', engine && `engine ${engine}`].filter(Boolean).join(' · ')}
          </span>
        </div>
      );
    }
    if (t.status === 'done') {
      return (
        <div className="flex flex-col items-start gap-1" data-honest-status="complete" data-unpack-outcome={probeVal || undefined}>
          <StatusBadge tone="success">完成</StatusBadge>
          <span className="whitespace-nowrap text-meta text-jz-muted">
            {h.biz != null ? <>业务代码 <span className="font-mono tnum text-jz-ink-2">{h.biz}</span> 类</>
              : h.shell ? (h.positive ? '没有上报业务代码类数' : '没有脱壳结果数据') : '无加固,不需要脱壳'}
          </span>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-start">
        <StatusBadge tone={t.status === 'running' ? 'brand' : 'neutral'}>{ST_CN[t.status] || t.status}</StatusBadge>
        {t.status === 'running' && t.progress && <TaskLiveProgress progress={t.progress} />}
      </div>
    );
  };

  const SEV: Array<[string, string, string, string]> = [
    ['critical', 'C', '严重', 'bg-jz-sev-critical'], ['high', 'H', '高', 'bg-jz-sev-high'],
    ['medium', 'M', '中', 'bg-jz-sev-medium'], ['low', 'L', '低', 'bg-jz-sev-low'],
  ];
  const resultCell = (t: any) => {
    const c = counts[String(t.id)];
    if (!c) return <span className="text-jz-muted" aria-label="加载中">…</span>;
    if (!(c.total > 0)) return <span className="text-meta text-jz-muted" title="评估和渗透两边都没有发现记录">没有发现</span>;
    return (
      <span className="inline-flex flex-col gap-1.5">
        <span className="inline-flex items-center gap-2 font-mono text-meta tnum"
          title={`来源:${(c.sources || []).join(' + ') || '无'}。渗透部分只计待确认和已确认。`
            + (c.contract ? `\n原始命中 ${c.contract.raw ?? '—'},去重后 ${c.contract.kept ?? '—'},已确认 ${c.contract.confirmed ?? '—'},候选 ${c.contract.candidate ?? '—'},已排除 ${c.contract.suppressed ?? '—'},写入报告 ${c.contract.report_total ?? '—'}(模型复核 ${c.contract.reviewed ?? '—'})` : '')}>
          {SEV.map(([k, short, name]) => (
            <span key={k} title={name} className={c[k] > 0 ? 'font-semibold text-jz-ink' : 'text-jz-muted'}>{short}{c[k]}</span>
          ))}
        </span>
        <span className="inline-flex h-1 w-24 overflow-hidden rounded-pill bg-jz-surface-2" data-vuln-bar aria-hidden
          title={`严重 ${c.critical} · 高 ${c.high} · 中 ${c.medium} · 低 ${c.low}(共 ${c.total})`}>
          {SEV.map(([k, , , cls]) => c[k] > 0 && <span key={k} className={cx('block h-full', cls)} style={{ width: `${(c[k] / c.total) * 100}%` }} />)}
        </span>
      </span>
    );
  };

  const actionCell = (t: any) => {
    const hit = sessMap[t.id];
    const canAsk = canAskOf(t);
    const arts = artifactsReadyOf(t);
    // Between 1280 and 1440 only the first action stays inline; the rest move into the menu with their hooks.
    const fold = tableFits && !wide;
    const inline: Array<{ key: string; node: React.ReactNode; item: (close: () => void) => React.ReactNode }> = [];
    if (hit) inline.push({ key: 'session',
      node: <Button size="sm" variant="secondary" onClick={() => gotoSession(hit)} data-goto-session title={`打开渗透会话 #${hit.sid}`}>会话</Button>,
      item: (close) => <MenuItem icon={<ExternalLink size={14} aria-hidden />} onClick={() => { close(); gotoSession(hit); }} data-goto-session>打开渗透会话</MenuItem> });
    if (t.status === 'failed') inline.push({ key: 'retry',
      node: <Button size="sm" variant="secondary" onClick={() => setRerunTask(t)} data-act-retry title="重新运行,可以重选设备、模式和深度">重试</Button>,
      item: (close) => <MenuItem icon={<RefreshCw size={14} aria-hidden />} onClick={() => { close(); setRerunTask(t); }} data-act-retry>重试</MenuItem> });
    if (t.status === 'done' && canAsk) inline.push({ key: 'report',
      node: <Button size="sm" variant="ghost" onClick={() => nav(`/reports?taskId=${t.id}`)} data-act-report title="打开这个任务的报告">报告</Button>,
      item: (close) => <MenuItem icon={<FileText size={14} aria-hidden />} onClick={() => { close(); nav(`/reports?taskId=${t.id}`); }} data-act-report>打开报告</MenuItem> });
    if (arts) inline.push({ key: 'artifacts',
      node: <Button size="sm" variant="ghost" onClick={() => setArtTask(t.id)} data-artifacts-btn title="浏览任务产物">产物</Button>,
      item: (close) => <MenuItem icon={<FolderOpen size={14} aria-hidden />} onClick={() => { close(); setArtTask(t.id); }} data-artifacts-btn>浏览产物</MenuItem> });
    const shown = fold ? inline.slice(0, 1) : inline;
    const folded = fold ? inline.slice(1) : [];
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-1 desktop:flex-nowrap" onClick={(e) => e.stopPropagation()}>
        {t.status === 'done' && !hit && !fold && (
          <Button size="sm" variant="ghost" disabled onClick={() => relay(t)} data-relay-btn title="没有关联的项目,无法进入渗透会话">会话</Button>
        )}
        {shown.map((a) => <React.Fragment key={a.key}>{a.node}</React.Fragment>)}
        <Popover role="menu" align="end" label={`任务 #${t.id} 的更多操作`}
          trigger={(tp) => <IconButton size="sm" label="更多操作" data-more-btn {...tp}><MoreHorizontal size={16} aria-hidden /></IconButton>}>
          {(close) => (
            <div data-more-menu>
              {folded.map((a) => <React.Fragment key={a.key}>{a.item(close)}</React.Fragment>)}
              <MenuItem icon={<Info size={14} aria-hidden />} onClick={() => { close(); setDetailTask(t); }} data-act-detail>详情</MenuItem>
              {canAsk && <MenuItem icon={<MessageSquare size={14} aria-hidden />} onClick={() => { close(); window.location.hash = `/agent?task=${t.id}`; }} data-ask-btn>向智能体提问</MenuItem>}
              {t.status !== 'failed' && <MenuItem icon={<RefreshCw size={14} aria-hidden />} onClick={() => { close(); setRerunTask(t); }}>重新运行</MenuItem>}
              <MenuItem danger icon={<Trash2 size={14} aria-hidden />} onClick={() => { close(); setDelAsk(t); }} data-act-del>删除</MenuItem>
            </div>
          )}
        </Popover>
      </span>
    );
  };

  const columns: Column<any>[] = [
    { key: 'task', header: '任务', width: 'w-20', cell: (t) => (
      <span className="flex flex-col items-start gap-1">
        <span className="font-mono text-meta tnum text-jz-muted">#{t.id}</span>
        <Tag mono>{t.kind || t.type || 'audit'}</Tag>
      </span>
    ) },
    { key: 'target', header: '目标', card: 'title', cell: (t) => (
      <span className="flex min-w-0 max-w-56 flex-col">
        <span className="truncate text-label font-semibold text-jz-ink" title={t.app_name || t.package || ''}>{t.app_name || t.package || '—'}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate font-mono text-meta font-normal text-jz-muted" title={t.package || '服务端没有返回包名'}>{t.package || '没有包名'}</span>
          {t.packer ? <PackerChip packer={t.packer} /> : t.status === 'running' ? <Tag title="正在识别加固类型">识别中</Tag> : null}
        </span>
      </span>
    ) },
    { key: 'status', header: '状态', cell: statusCell },
    { key: 'dur', header: '耗时', cell: (t) => {
      const dur = durOf(t);
      return (
        <span className="flex flex-col whitespace-nowrap" data-dur title={`${Math.round(dur)} 秒(${t.status === 'running' ? '从创建到现在' : '从创建到最后更新'})`}>
          <span className="font-mono tnum text-jz-ink">
            {fmtDur(dur)}
            {dur > SLOW_S && <StatusBadge tone="attention" className="ml-1.5" title="已超过 15 分钟">慢</StatusBadge>}
          </span>
          <span className="font-mono text-meta text-jz-muted" title={`创建 ${whenFull(t.created_at)} · 更新 ${whenFull(t.updated_at)}`}>{fmtTime(t.created_at)}</span>
        </span>
      );
    } },
    { key: 'result', header: <span title="评估和渗透两部分的发现数。C/H/M/L 为严重、高、中、低。">结果</span>, label: '结果', cell: (t) => <span data-vuln-counts>{resultCell(t)}</span> },
    ...(showOwner ? [{ key: 'owner', header: '负责人', cell: (t: any) => (
      <span className="block max-w-24 truncate font-mono text-meta text-jz-ink-2" data-operator title={t.user_id != null ? `uid=${t.user_id}` : ''}>{operatorOf(t)}</span>
    ) } as Column<any>] : []),
    { key: 'actions', header: '操作', align: 'right', card: 'action', cell: actionCell },
  ];

  const detailRows: Array<[string, React.ReactNode]> = detailTask ? [
    ['类型', detailTask.kind || 'audit'],
    ['目标', detailTask.app_name || '—'],
    ['包名', detailTask.package || '服务端没有返回包名'],
    ['状态', ST_CN[detailTask.status] || detailTask.status],
    ['加固', detailTask.packer ? `${PACKER_NAMES[detailTask.packer] || detailTask.packer} (${detailTask.packer})` : '未检测到'],
    ['负责人', operatorOf(detailTask)],
    ['创建时间', whenFull(detailTask.created_at)],
    ['更新时间', whenFull(detailTask.updated_at)],
    ['安装包路径', detailTask.apk_path || '—'],
    ['结果 ID', detailTask.result_id != null ? `#${detailTask.result_id}` : '无'],
  ] : [];

  return (
    <Page data-tasks-page>
      <PageHeader title={moduleLabel('/tasks')} description="评估和脱壳任务的状态、结果与产物。"
        actions={(
          <div className="flex flex-wrap items-center gap-2" data-toolbar-actions>
            <IconButton label="刷新任务列表" variant="secondary" onClick={loadAll} data-tasks-refresh><RefreshCw size={16} aria-hidden /></IconButton>
            <span data-toolbar-export>
              <Popover role="menu" align="end" label="导出任务列表"
                trigger={(tp) => <Button variant="secondary" icon={<Download size={16} aria-hidden />} data-toolbar-export-toggle {...tp}>导出</Button>}>
                {(close) => (
                  <div data-toolbar-export-panel>
                    {(['csv', 'json'] as const).map((id) => (
                      <MenuItem key={id} data-toolbar-export-item={id}
                        onClick={() => { const rows = exportRows(filtered); exportDataFile('tasks_export', id, rows); setBatchMsg(`已导出当前筛选结果 ${rows.length} 行(${id.toUpperCase()})`); close(); }}>
                        导出为 {id.toUpperCase()}
                      </MenuItem>
                    ))}
                  </div>
                )}
              </Popover>
            </span>
            <Button variant="secondary" onClick={() => setCleanOpen(true)} disabled={batchBusy || failedInView.length === 0} data-clean-failed
              title="删除当前筛选结果里的全部失败任务,会先请你确认">
              清理失败任务 ({failedInView.length})
            </Button>
            <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => nav('/new-audit')} data-toolbar-create>新建评估</Button>
          </div>
        )} />

      {loadErr && tasks !== null && allTasks.length > 0 && <StaleNotice onRefresh={loadAll} />}

      <div data-situation-pods>
        <div {...(slotInfo ? { 'data-slot-pod': '' } : {})}>
          <MetricGrid>
            <Metric label="并发占用" loading={!slotInfo && tasks === null}
              tone={slotInfo?.hot ? 'danger' : slotInfo?.warm ? 'attention' : 'default'}
              title="正在运行和排队的任务数,对比组织的最大并发数。达到上限后新任务会被拒绝。"
              value={slotInfo ? `${slotInfo.used}/${slotInfo.unlim ? '∞' : slotInfo.quota}` : '—'}
              hint={slotInfo
                ? <span data-slot-indicator>空闲 {slotInfo.unlim ? '不限' : `${slotInfo.free} 个`}{slotInfo.load != null ? ` · 负载 ${slotInfo.load}%` : ''}</span>
                : '无法读取并发配额'} />
            <Metric label="运行中" loading={tasks === null} value={runningTasks.length} />
            <Metric label="排队中" loading={tasks === null} value={queuedN} />
            <Metric label="在线设备" value={liveDevices.length} hint="与顶栏的设备状态一致" />
          </MetricGrid>
        </div>
        {!(batchSum && batchSum.count > 0) && <span className="sr-only" data-batch-dashboard-empty>没有批量脱壳任务</span>}
      </div>

      <Panel flush data-tasks-list>
        <div className="space-y-3 px-4 pt-4" data-toolbar="tasks">
          <div className="flex flex-wrap items-center gap-2" data-toolbar-main>
            <SearchField className="min-w-56 flex-1 max-[760px]:basis-full" value={search} onValueChange={setSearch} label="搜索任务"
              placeholder="搜索应用名、包名、任务 ID、负责人或失败原因" data-task-search="" data-toolbar-search />
            <div className="w-40 flex-none max-[760px]:w-full max-[760px]:flex-1">
              <Select value={packerF} onChange={(e) => setPackerF(e.target.value)} data-packer-filter aria-label="按加固类型筛选">
                <option value="all">全部加固类型</option>
                {packerOptions.length > 0 && <option value="__packed">有加固</option>}
                {allTasks.some((t: any) => t.packer === 'none') && <option value="none">无加固</option>}
                {packerOptions.map(([v, n]) => <option key={v} value={v}>{PACKER_NAMES[v] || v} ({n})</option>)}
              </Select>
            </div>
            <div className="w-40 flex-none max-[760px]:w-full max-[760px]:flex-1">
              <Select value={operatorF} onChange={(e) => setOperatorF(e.target.value)} data-operator-filter aria-label="按负责人筛选">
                <option value="">全部负责人</option>
                {operatorOptions.map(([uid, n]) => <option key={uid} value={uid}>{usersMap[uid] ? `${usersMap[uid]} (#${uid})` : `#${uid}`} · {n}</option>)}
              </Select>
            </div>
            <span data-smoke-toggle data-active={hideSmokeFail ? '1' : ''} title={`隐藏在 ${SMOKE_FAIL_S} 秒内就失败的任务。这类任务通常没有真正开始。`}>
              <Checkbox checked={hideSmokeFail} onChange={() => setHideSmokeFail((v) => !v)} label={<>隐藏即时失败 (<span className="font-mono tnum">{smokeFailCount}</span>)</>} />
            </span>
          </div>
          <div className="flex items-end gap-2" data-toolbar-filters {...(hasFilterChip ? { 'data-filter-chip-row': statusParam ? `status=${statusParam}` : `status=${filter}` } : {})}>
            <Tabs className="min-w-0 flex-1" label="按状态筛选" items={statusTabs} value={filter} onChange={(k) => { setFilter(k); if (!k) setSearchParams({}); }} />
            {hasFilterChip && (
              <span data-filter-chip className="sr-only">
                {statusParam ? `status=${statusParam}` : `status=${filter}`}
                <button type="button" tabIndex={-1} onClick={() => { setFilter(''); setSearchParams({}); }}>清除状态筛选</button>
              </span>
            )}
          </div>
        </div>

        <div data-batch-bar={sel.size > 0 ? '' : undefined}>
          <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} aria-hidden />} onClick={() => setRetryOpen(true)} disabled={batchBusy} data-batch-retry
              title={batchBusy ? '批量操作进行中' : '重新运行选中的任务,会先请你确认'}>重新运行</Button>
            <Popover role="menu" label="导出选中的任务"
              trigger={(tp) => <Button size="sm" variant="secondary" icon={<Download size={14} aria-hidden />} disabled={batchBusy} data-batch-export {...tp}>导出</Button>}>
              {(close) => (
                <>
                  <MenuItem onClick={() => { exportSelCsv(); close(); }} data-batch-csv>导出为 CSV</MenuItem>
                  <MenuItem onClick={() => { exportSelJson(); close(); }} data-batch-json>导出为 JSON</MenuItem>
                </>
              )}
            </Popover>
            {cmpPair && (
              <Button size="sm" variant="secondary" onClick={() => nav(`/reports?sid=${cmpPair.a}&cmp=${cmpPair.b}`)} data-batch-compare
                title={`在报告页对比会话 #${cmpPair.a} 和 #${cmpPair.b}`}>对比报告</Button>
            )}
            <Button size="sm" variant="danger" icon={<Trash2 size={14} aria-hidden />} onClick={() => setDelOpen(true)} disabled={batchBusy} data-batch-del
              title={batchBusy ? '批量操作进行中' : '删除选中的任务,会先请你确认'}>删除</Button>
          </BulkBar>
        </div>
        {batchMsg && (
          <div className="px-4 pt-3">
            <InlineAlert tone="info" data-batch-msg
              action={<Button size="sm" variant="ghost" onClick={() => setBatchMsg(null)}>知道了</Button>}>{batchMsg}</InlineAlert>
          </div>
        )}

        <div className="overflow-x-auto">
        <AsyncBoundary loading={tasks === null} error={loadErr && allTasks.length === 0 ? loadErr : null} onRetry={loadAll} skeleton="table">
          <DataTable<any> label="任务列表" columns={columns} rows={pageRows} rowKey={(t) => t.id} density="comfortable" stickyHeader={false} layout={tableFits ? 'auto' : 'cards'}
            selected={sel as Set<string | number>} onToggle={(k) => toggleRow(k as number)} onToggleAll={toggleAllPage}
            selectAttrs={{ all: { 'data-sel-all': '' }, row: (t) => ({ 'data-sel-row': t.id }) }}
            onRowClick={openRow}
            rowDataAttrs={(t) => ({
              'data-task-row': t.id,
              'data-focused': focusParam && String(t.id) === focusParam ? '1' : undefined,
              title: sessMap[t.id] ? `打开渗透会话 #${sessMap[t.id].sid}` : artifactsReadyOf(t) ? '浏览任务产物' : undefined,
            })}
            rowClassName={(t) => cx(focusParam && String(t.id) === focusParam && 'bg-jz-brand-soft', !sessMap[t.id] && !artifactsReadyOf(t) && '!cursor-default')}
            state={filtered.length === 0 ? (
              allTasks.length === 0
                ? <EmptyState icon={ClipboardList} title="还没有任务" cause="创建评估后,任务会出现在这里。"
                    action={<Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => nav('/new-audit')}>新建评估</Button>} />
                : <EmptyState icon={ClipboardList} title="没有符合条件的任务" cause="当前的搜索或筛选条件下没有任务。"
                    action={filtersOn ? <Button variant="secondary" onClick={clearFilters}>清除筛选</Button> : undefined} />
            ) : undefined} />
        </AsyncBoundary>
        </div>
        <Pagination total={filtered.length} page={safePage} pageSize={pageSize} onPage={setPage} onPageSize={(n) => setPageSize(n)} pageSizes={PAGE_SIZES} jump
          dataAttrs={{ 'data-v3-pagination': '', 'data-jump-input': 'present' }} />
      </Panel>

      {runningTasks.length > 0 && (
        <Panel title="运行中的任务" actions={<StatusBadge tone="brand">{runningTasks.length} 个</StatusBadge>} data-running-lanes>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 desktop:grid-cols-4">
            {runningTasks.map((t: any) => {
              const hit = sessMap[t.id];
              return (
                <li key={t.id} data-running-lane={t.id} className="min-w-0 rounded-card border border-jz-border px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex-none font-mono text-meta tnum text-jz-muted">#{t.id}</span>
                    <span className="min-w-0 flex-1 truncate text-label font-semibold text-jz-ink" title={t.app_name || t.package || ''}>{t.app_name || t.package || '—'}</span>
                    <span className="flex-none font-mono text-meta tnum text-jz-ink-2" title="从创建到现在">{fmtDur(now - t.created_at)}</span>
                  </div>
                  <p className="mt-1 truncate text-meta text-jz-muted" title={t.progress || '服务端还没有上报进度'}>{t.progress || '正在执行,还没有上报进度'}</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <Tag mono>{t.kind || 'audit'}</Tag>
                    {t.packer && <PackerChip packer={t.packer} />}
                    <span className="flex-1" />
                    {hit && <Button size="sm" variant="ghost" icon={<ExternalLink size={14} aria-hidden />} onClick={() => gotoSession(hit)} data-lane-goto={t.id} title={`打开渗透会话 #${hit.sid}`}>会话</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {activeSids.length > 0 && (
        <Panel flush title={`关联的渗透会话 (${activeSids.length})`} data-session-rail
          actions={(
            <>
              <IconButton size="sm" label="向前翻" onClick={() => scrollRail(-1)} disabled={!railNav.prev || !sessRailOpen} data-sess-prev><ChevronLeft size={16} aria-hidden /></IconButton>
              <IconButton size="sm" label="向后翻" onClick={() => scrollRail(1)} disabled={!railNav.next || !sessRailOpen} data-sess-next><ChevronRight size={16} aria-hidden /></IconButton>
              <Button size="sm" variant="ghost" onClick={() => setSessRailOpen((v) => !v)} aria-expanded={sessRailOpen} data-sess-rail-collapse>{sessRailOpen ? '收起' : '展开'}</Button>
            </>
          )}>
          {sessRailOpen && (
            <div ref={railRef} onScroll={updateRailNav} className="overflow-x-auto">
              <ul className="flex gap-3 p-4">
                {activeSids.map((s: any) => {
                  const canGo = s.project_id != null;
                  const go = () => { if (canGo) window.location.hash = `/pentest/project/${s.project_id}/session/${s.id}`; };
                  return (
                    <li key={s.id} data-running-session={s.id} data-sess-card={canGo ? 'go' : 'blocked'}
                      className="flex w-64 flex-none items-center gap-3 rounded-card border border-jz-border px-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span data-sess-pulse aria-hidden className="h-1.5 w-1.5 flex-none rounded-pill bg-jz-teal" />
                          <span className="font-mono text-meta tnum text-jz-ink">#{s.id}</span>
                          <Tag>{devKind(s.device)}</Tag>
                        </span>
                        <span className="mt-1 block truncate text-label text-jz-ink-2" title={s.app_name || s.package || ''}>{s.app_name || s.package || '—'}</span>
                        <span className="block truncate font-mono text-meta text-jz-muted" title={s.device || ''}>{s.device || '无设备'}</span>
                      </span>
                      <Button size="sm" variant="secondary" onClick={go} disabled={!canGo} data-sess-go
                        title={canGo ? `打开渗透会话 #${s.id}` : '没有关联的项目,无法打开'}>打开</Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Panel>
      )}

      {batchSum && batchSum.count > 0 && (() => {
        const doneN = batchSum.done || 0;
        const failN = batchSum.failed || 0;
        const pendingN = Math.max(0, batchSum.count - doneN - failN);
        const donePct = batchSum.count ? Math.round((doneN / batchSum.count) * 100) : 0;
        const stats: Array<[string, React.ReactNode, string?]> = [
          ['完成', <>{doneN}<span className="text-label font-normal text-jz-muted">/{batchSum.count}</span></>],
          ['失败', failN],
          ['待执行', pendingN],
          ['平均耗时', batchSum.avg_dur_s != null ? fmtDur(batchSum.avg_dur_s) : '—', '已完成任务从创建到最后更新的平均时间'],
          ['DEX 文件数', batchSum.dex_total, '脱出的 DEX 文件个数,不是体积'],
        ];
        return (
          <Panel title="批量脱壳" description={`完成率 ${donePct}%`} data-batch-summary data-batch-dashboard flush={false}
            actions={(
              <>
                <Button size="sm" variant="ghost" onClick={() => setBatchOpen(!batchOpen)} aria-expanded={batchOpen}>{batchOpen ? '收起明细' : '查看明细'}</Button>
                <Button size="sm" variant="ghost" icon={<RefreshCw size={14} aria-hidden />} onClick={loadBatch}>刷新</Button>
              </>
            )}>
            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
              <dl className="flex flex-wrap gap-x-8 gap-y-3">
                {stats.map(([k, v, tip]) => (
                  <div key={k} title={tip}>
                    <dt className="text-meta text-jz-muted">{k}</dt>
                    <dd className={cx('mt-1 font-display text-title font-semibold tnum', k === '失败' && failN > 0 ? 'text-jz-red' : 'text-jz-ink')}>{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="min-w-48 flex-1 basis-48">
                <span className="flex h-2 w-full overflow-hidden rounded-pill bg-jz-surface-2" data-batch-bar-track title={`完成 ${doneN} · 失败 ${failN} · 待执行 ${pendingN}`}>
                  {doneN > 0 && <span className="block h-full bg-jz-teal" style={{ width: `${(doneN / batchSum.count) * 100}%` }} data-batch-bar-fill />}
                  {failN > 0 && <span className="block h-full bg-jz-red" style={{ width: `${(failN / batchSum.count) * 100}%` }} data-batch-bar-fail />}
                </span>
                <p className="mt-1 text-meta tnum text-jz-muted">完成 {donePct}%{failN > 0 ? ` · 失败 ${Math.round((failN / batchSum.count) * 100)}%` : ''}</p>
              </div>
            </div>
            {batchOpen && (
              <div className="mt-4 overflow-x-auto rounded-card border border-jz-border">
                <DataTable<any> label="批量脱壳明细" stickyHeader={false} rows={batchSum.items || []} rowKey={(it) => it.task_id}
                  columns={[
                    { key: 'id', header: '任务', mono: true, cell: (it) => `#${it.task_id}` },
                    { key: 'app', header: '应用', card: 'title', cell: (it) => <span className="block max-w-48 truncate">{it.app_name}</span> },
                    { key: 'st', header: '状态', cell: (it) => ST_CN[it.status] || it.status },
                    { key: 'packer', header: '加固', cell: (it) => it.packer ?? '—' },
                    { key: 'method', header: '方式', cell: (it) => it.method ?? '—' },
                    { key: 'dex', header: 'DEX', mono: true, align: 'right', cell: (it) => it.dex ?? '—' },
                    { key: 'dur', header: '耗时', mono: true, align: 'right', cell: (it) => it.dur_s != null ? fmtDur(it.dur_s) : '—' },
                  ]}
                  state={(batchSum.items || []).length === 0 ? <EmptyState compact title="没有明细" cause="服务端没有返回任务明细。" /> : undefined} />
              </div>
            )}
          </Panel>
        );
      })()}

      <Dialog open={retryOpen} onClose={() => setRetryOpen(false)} title={`重新运行 ${sel.size} 个任务`}
        description="会为每个任务新建一个任务,原任务和它的报告保持不变。" dataAttrs={{ 'data-batch-retry-modal': '' }}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setRetryOpen(false)}>取消</Button>
            <Button variant="primary" onClick={batchRetry} disabled={batchBusy} data-batch-retry-confirm>重新运行</Button>
          </>
        )}>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-control bg-jz-surface-2 p-3 font-mono text-meta text-jz-ink-2">{selTasks.map(taskLine).join('\n')}</pre>
      </Dialog>

      <Dialog open={delOpen} onClose={() => setDelOpen(false)} title={`删除 ${sel.size} 个任务`} role="alertdialog"
        description="删除后无法恢复。运行中和排队中的任务不会被删除,结果里会说明跳过了几个。" dataAttrs={{ 'data-batch-del-modal': '' }}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDelOpen(false)}>取消</Button>
            <Button variant="danger-solid" onClick={batchDelete} disabled={batchBusy} data-batch-del-confirm>删除</Button>
          </>
        )}>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-control bg-jz-surface-2 p-3 font-mono text-meta text-jz-ink-2">{selTasks.map(taskLine).join('\n')}</pre>
      </Dialog>

      <Dialog open={cleanOpen} onClose={() => setCleanOpen(false)} title={`删除 ${failedInView.length} 个失败任务`} role="alertdialog"
        description="范围是当前搜索和筛选结果里的失败任务。删除后无法恢复,运行中和排队中的任务不受影响。" dataAttrs={{ 'data-clean-failed-modal': '' }}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setCleanOpen(false)}>取消</Button>
            <Button variant="danger-solid" onClick={cleanFailed} disabled={batchBusy} data-clean-failed-confirm>删除</Button>
          </>
        )}>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-control bg-jz-surface-2 p-3 font-mono text-meta text-jz-ink-2">
          {failedInView.slice(0, 12).map((t: any) => `#${t.id} ${t.app_name || t.package || ''} ${(t.error_msg || '').slice(0, 40)}`).join('\n')}
          {failedInView.length > 12 ? `\n… 共 ${failedInView.length} 个` : ''}
        </pre>
      </Dialog>

      <ConfirmDialog open={!!delAsk} destructive title={`删除任务 #${delAsk?.id ?? ''}`} confirmLabel="删除"
        outcome="删除后无法恢复。"
        onCancel={() => setDelAsk(null)}
        onConfirm={() => { const t = delAsk; setDelAsk(null); if (t) removeTask(t); }}>
        {delAsk ? (delAsk.app_name || delAsk.package || '这个任务') : ''} 的任务记录将被删除。
      </ConfirmDialog>

      <Drawer open={!!detailTask} title={`任务 #${detailTask?.id ?? ''}`} onClose={() => setDetailTask(null)} width={520}
        footer={detailTask && (
          <>
            {artifactsReadyOf(detailTask) && <Button variant="secondary" onClick={() => { const id = detailTask.id; setDetailTask(null); setArtTask(id); }}>浏览产物</Button>}
            {detailTask.status === 'failed' && (
              <Button variant="secondary" icon={<RefreshCw size={16} aria-hidden />} onClick={() => { const t = detailTask; setDetailTask(null); setRerunTask(t); }} data-detail-retry>重试</Button>
            )}
            <Button variant="primary" onClick={() => setDetailTask(null)}>关闭</Button>
          </>
        )}>
        {detailTask && (
          <div className="space-y-4" data-detail-modal>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-label">
              {detailRows.map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt className="text-jz-muted">{k}</dt>
                  <dd className="break-all font-mono text-meta text-jz-ink">{v}</dd>
                </React.Fragment>
              ))}
            </dl>
            <section>
              <h3 className="text-label font-semibold text-jz-ink">进度日志</h3>
              <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-control bg-jz-surface-2 p-3 font-mono text-meta text-jz-ink-2">{detailTask.progress || '服务端没有进度记录'}</pre>
            </section>
            {detailTask.status === 'failed' && (
              <section>
                <h3 className="text-label font-semibold text-jz-ink">失败原因</h3>
                <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-control border border-jz-red/40 bg-jz-red/10 p-3 font-mono text-meta text-jz-ink" data-detail-error>{detailTask.error_msg || detailTask.progress || '服务端没有返回失败原因'}</pre>
              </section>
            )}
            {detailTask.unpack_outcome && (
              <section>
                <h3 className="text-label font-semibold text-jz-ink">脱壳结果</h3>
                <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-control bg-jz-surface-2 p-3 font-mono text-meta text-jz-ink-2">{JSON.stringify(detailTask.unpack_outcome, null, 2)}</pre>
              </section>
            )}
          </div>
        )}
      </Drawer>

      {artTask != null && (
        <ArtifactsModal taskId={artTask}
          taskName={(() => { const t = allTasks.find((x: any) => x.id === artTask); return t?.app_name || t?.package || `任务 #${artTask}`; })()}
          linked={sessMap[artTask] ?? null}
          onClose={() => setArtTask(null)} />
      )}
      {rerunTask && (
        <RerunTaskModal task={rerunTask} devices={liveDevices || []}
          onClose={() => setRerunTask(null)}
          onDone={(nt: number) => {
            setRerunTask(null);
            setSearchParams({ focus: String(nt) }, { replace: false });
            setTimeout(loadAll, 600);
          }} />
      )}
    </Page>
  );
};
