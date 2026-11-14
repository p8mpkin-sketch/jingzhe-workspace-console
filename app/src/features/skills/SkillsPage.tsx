import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Braces, Copy, Check, FolderOpen, FlaskConical, Plug, GraduationCap, Bell, RefreshCw } from 'lucide-react';
import { api } from '@/services/api';
import { useAuth } from '@/stores/auth';
// 全平台升级 Step4①: DataToolbar(搜索/排序/导入/导出/分页)+ 本地自定义技能 + 技能包导入(前端解析)
// Rxxx 重构: 顶层 KPI 卡 + 一级双工作台 Tab(资产库/候选审核台);卡片拆 SkillCard/CandidateCard 子组件。
import { DataToolbar, UniversalImportModal, exportDataFile } from '@/components/ui';
import type { UniversalImportResult } from '@/components/ui';
import { Badge, Button, ConfirmDialog, Input, Panel, Drawer, EmptyState, ErrorState, SkeletonLoader, EmptyStatePlaceholder, Page, PageHeader, Skeleton, Tabs, toast, tokenColor, useThemeVersion } from '@/components/ui';
import { moduleLabel } from '@/layout/navigation';
import type { ColorToken } from '@/components/ui';
import { SkillCard } from './SkillCard';
import { CandidateCard, CandidateInspector } from './CandidateCard';
import { kindOf, renderSourceCode } from './skillsShared';
import type { SkillRow, KBCandidate } from './skillsShared';
// R355(V3 图谱化第3步): echarts 按需引入(力导向图;R39 Dashboard 同款模式,只注册所需模块)
import * as echarts from 'echarts/core';
import { GraphChart } from 'echarts/charts';
import { TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([GraphChart, TooltipComponent, LegendComponent, CanvasRenderer]);

const KB_NODE_TOKENS: { name: string; token: ColorToken }[] = [
  { name: 'packer', token: 'orange' },
  { name: 'task', token: 'teal' },
  { name: 'item', token: 'brand' },
  { name: 'source', token: 'muted' },
  { name: 'vuln', token: 'red' },
];

/** R355: relations 结果→echarts force 力导向图(分类颜色全部取自 jz 令牌,随主题切换) */
const KbGraph: React.FC<{ graph: any }> = ({ graph }) => {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const tv = useThemeVersion();
 useEffect(() => {
    if (!ref.current || !graph?.nodes?.length) return;
    const inst = echarts.init(ref.current);
    const KB_NODE_CATS = KB_NODE_TOKENS.map((c) => ({ name: c.name, color: tokenColor(c.token) }));
    const catIdx: Record<string, number> = {};
 KB_NODE_CATS.forEach((c, i) => { catIdx[c.name] = i; });
    const deg: Record<string, number> = {};
 (graph.edges || []).forEach((e: any) => { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; });
 inst.setOption({
 tooltip: { confine: true, formatter: (p: any) => p.dataType === 'node'
        ? `${p.data.name}<br/>类型 ${p.data.catName} · 关联 ${deg[p.data.name] || 0}`
        : `${p.data.sourceName} → ${p.data.targetName}<br/>${p.data.rel} ×${p.data.count || 1}` },
 legend: { data: KB_NODE_CATS.map((c) => c.name), textStyle: { color: tokenColor('muted'), fontSize: 10 }, top: 0 },
 series: [{
 type: 'graph', layout: 'force', roam: true, draggable: true,
 force: { repulsion: 140, edgeLength: [40, 110], layoutAnimation: true },
 categories: KB_NODE_CATS,
 label: { show: true, color: tokenColor('ink-2'), fontSize: 9,
 formatter: (p: any) => String(p.data.name || '').replace(/^(src|item|packer|vuln|task):/, '').slice(0, 18) },
 edgeLabel: { show: false },
 data: (graph.nodes || []).map((n: any) => ({
 id: n.id, name: n.id,
 category: catIdx[n.type] ?? 2, catName: n.type,
 symbolSize: 14 + Math.min(18, (deg[n.id] || 0) * 3),
 })),
 edges: (graph.edges || []).map((e: any, i: number) => ({
 source: e.a, target: e.b, rel: e.rel, count: e.count || 1, lineStyle: { width: Math.min(4, 1 + (e.count || 1) / 4), opacity: 0.55 },
 sourceName: e.a, targetName: e.b,
 })),
 }],
 }, { notMerge: true });
 const onResize = () => inst.resize();
 window.addEventListener('resize', onResize);
 return () => { window.removeEventListener('resize', onResize); inst.dispose(); };
   }, [graph, tv]);
  return <div ref={ref} data-kb-graph-canvas className="w-full" style={{ height: 320 }} />;
};

/** R88-1: 技能知识库(纲领B-1 盘点收编)。R103-11 marketplace 化:
 *  ①顶部统计行(列表真算)+ scene 分类 Tabs;②卡片升级(类型图标/来源标签按 source_path·status 推断,
 *  不假造「社区规则」;last_verified_at=mtime 装饰语义 tooltip 如实);③详情抽屉读
 *  GET /api/skills/{id}/source(后端只读端点,库内注册路径防穿越);④Test Run/编辑=挂账不做。
 *  Rxxx 重构: 顶层 5 KPI 卡(点击=快速过滤)+ 一级双工作台 Tab(已入库资产库 / 自学习候选审核台,
 *  治首屏霸屏);候选卡结构化解析(治文字墙);技能卡大字+色彩分层+路径精简(治裸绝对路径)。 */

// R117-7②(方案7.2): 源码抽屉行号对齐+零依赖注释着色(renderSourceCode 迁 skillsShared,口径不变)。

/** Clickable metric: a quick filter for the library list. */
const KpiCard: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: React.ReactNode; sub: string; title?: string;
  active?: boolean; onClick: () => void;
}> = ({ icon: Icon, label, value, sub, title, active, onClick }) => (
  <button type="button" onClick={onClick} title={title} data-skills-kpi={label} aria-pressed={!!active}
    className={`min-w-0 rounded-card border bg-jz-surface p-4 text-left transition-colors duration-hover ${active ? 'border-jz-brand' : 'border-jz-border hover:border-jz-border-strong'}`}>
    <div className="flex items-center gap-1.5 text-label text-jz-muted">
      <Icon className="h-3.5 w-3.5 flex-none" />
      <span className="truncate">{label}</span>
    </div>
    <div className="mt-2 font-display text-metric font-semibold tnum leading-none text-jz-ink">{value}</div>
    <div className="mt-2 truncate text-meta text-jz-muted">{sub}</div>
  </button>
);

export const SkillsPage: React.FC = () => {
  const [rows, setRows] = useState<SkillRow[] | null>(null);
  const [err, setErr] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [tab, setTab] = useState('全部');
  const [q, setQ] = useState('');   // R126: 搜索(名称/描述/来源实时过滤,前端纯筛零新端点)
  const [manualOpen, setManualOpen] = useState(false);   // R127: 手动模式折叠区(AI 主路径之外的兜底)
  // 全平台升级 Step4①: 分页 + 本地自定义技能 + 技能包导入(前端解析,localStorage 本地层)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [localSkills, setLocalSkills] = useState<SkillRow[]>(() => {
    try { return JSON.parse(localStorage.getItem('apksec-skills-local') || '[]'); } catch { return []; }
  });
  const [newOpen, setNewOpen] = useState(false);
  const [packImpOpen, setPackImpOpen] = useState(false);
  const [newForm, setNewForm] = useState<{ name: string; description: string; scene: string }>({ name: '', description: '', scene: '自定义(本地)' });
 const persistLocal = (list: SkillRow[]) => {
 setLocalSkills(list);
 try { localStorage.setItem('apksec-skills-local', JSON.stringify(list)); } catch { /* 配额静默 */ }
 };
 const addLocalSkill = () => {
 const name = newForm.name.trim();
 if (!name) return;
 if ([...localSkills, ...(rows || [])].some((s) => s.name === name)) { toast.err('同名技能已存在(本地/库内)'); return; }
    persistLocal([...localSkills, {
      id: 100000 + Date.now() % 100000, name,
      scene: newForm.scene || '自定义(本地)', source_path: 'local:自定义(本地视图层,不参与 AI 自动选技)',
      description: newForm.description, status: 'active', last_verified_at: Math.floor(Date.now() / 1000),
    } as SkillRow]);
    setNewForm({ name: '', description: '', scene: '自定义(本地)' });
    setNewOpen(false);
    toast.ok('自定义技能已保存(本地层——后端无自建技能端点,显式标注)');
  };
  const onImportPack = (imported: Array<Partial<SkillRow>>) => {
 const existing = [...localSkills];
 const have = new Set([...existing, ...(rows || [])].map((s) => s.name));
    let added = 0;
    for (const r of imported) {
      const name = String(r.name || '').trim();
      if (!name || have.has(name)) continue;
      existing.push({
        id: 100000 + Date.now() % 100000 + added, name,
        scene: String(r.scene || '导入技能包(本地)'), source_path: `local:导入技能包(本地视图层)`,
        description: String(r.description || ''), status: 'active', last_verified_at: Math.floor(Date.now() / 1000),
      } as SkillRow);
      added++;
    }
    persistLocal(existing);
    setPackImpOpen(false);
    toast.ok(`技能包导入完成: 新增 ${added} 条(本地层,不写后端)`);
  };

  // R113-1③: KB 自学习候选「待审核」分组(admin 可见,与后端 /api/kb/candidates 同闸)
  const { me } = useAuth();
  const isAdmin = me?.role === 'admin' || me?.role === 'super_admin';
  const [cands, setCands] = useState<KBCandidate[] | null>(null);
  const [candBusy, setCandBusy] = useState<number | null>(null);
  const [prerevBusy, setPrerevBusy] = useState(false);   // R268: LLM 预审按钮态
  const [preFilter, setPreFilter] = useState<'all' | 'adopt' | 'reject' | 'needs' | 'none'>('all');  // R273: 按建议过滤
  const [selCands, setSelCands] = useState<Set<number>>(new Set());   // R274: 批量终审勾选
  const [bulkBusy, setBulkBusy] = useState(false);
  // Rxxx: 一级工作台(资产库默认 / 候选审核台)+ 候选抽屉全屏检视
  const [workbench, setWorkbench] = useState<'library' | 'review'>('library');
  const [candFor, setCandFor] = useState<KBCandidate | null>(null);
 const effectiveWb = isAdmin ? workbench : 'library';
 const loadCands = () => {
    if (!isAdmin) { setCands(null); return; }
    api<{ items: KBCandidate[] }>('/api/kb/candidates').then((d) => setCands(d.items || [])).catch(() => setCands([]));
 };
 useEffect(loadCands, [isAdmin]);
 const decideCand = async (id: number, action: 'approve' | 'reject') => {
    setCandBusy(id);
    try {
      const d = await api<any>('/api/kb/candidates', { method: 'POST', body: JSON.stringify({ id, action }) });
 if (action === 'approve') toast.ok(`候选 #${id} 已通过: ${d.note || '写入正式知识库'}`);
 else toast.ok(`候选 #${id} 已拒绝留档(审计可查)`);
 loadCands();
 } catch (e: any) { toast.err('审核失败: ' + e.message); }
 setCandBusy(null);
 };
 const pendingCands = useMemo(() => (cands || []).filter((c) => c.status === 'pending'), [cands]);
 const decidedCounts = useMemo(() => ({
 approved: (cands || []).filter((c) => c.status === 'approved').length,
 rejected: (cands || []).filter((c) => c.status === 'rejected').length,
 }), [cands]);
 const filteredCands = useMemo(() => pendingCands.filter((c) => {
    const n = c.note || '';
    if (preFilter === 'all') return true;
    if (preFilter === 'none') return !n.startsWith('[预审]');
    return n.startsWith(`[预审] ${preFilter === 'needs' ? 'needs_info' : preFilter}`);
  }), [pendingCands, preFilter]);

  // R195(V3 图谱化第2步): 知识图谱查询面板(admin)——q→/api/kb/relations→分组渲染
  const [gq, setGq] = useState('ijiami');
  const [graph, setGraph] = useState<any | null>(null);
 const [gBusy, setGBusy] = useState(false);
 const loadGraph = () => {
    if (!isAdmin || !gq.trim()) return;
    setGBusy(true);
    api<any>(`/api/kb/relations?q=${encodeURIComponent(gq.trim())}`)
 .then(setGraph).catch(() => setGraph(null)).finally(() => setGBusy(false));
 };

 const load = () => {
    setRows(null); setErr('');
    api<SkillRow[]>('/api/skills').then(setRows).catch((e) => setErr(e.message));
  };
  useEffect(load, []);

  // ① 统计行+scene Tabs(列表真算;类别只列库内真实存在的)+ 本地自定义技能并入展示层(带 local 标记)
  const allRows = useMemo<SkillRow[]>(() => [...(rows || []), ...localSkills], [rows, localSkills]);
 const cats = useMemo(() => {
    const m = new Map<string, number>();
 (allRows).forEach((s) => { const k = kindOf(s).tab; m.set(k, (m.get(k) || 0) + 1); });
 return [...m.entries()].sort((a, b) => b[1] - a[1]);
 }, [allRows]);
 const distilledCount = useMemo(() =>
 (allRows).filter((s) => kindOf(s).label === '蒸馏').length, [allRows]);
  // R126: 搜索+Tab 复合过滤(名称/描述/来源/scene 大小写不敏感)
  // R599(六模块优化-技能知识库 P1): 排序器——默认注册序/实战次数↓/胜率↓/最近验证↓(全部列表真值字段,零推断)
  const [sortKey, setSortKey] = useState<'default' | 'uses' | 'winrate' | 'verified'>('default');
 const shown = useMemo(() => {
 let list = tab === '全部' ? allRows : allRows.filter((s) => kindOf(s).tab === tab);
 const needle = q.trim().toLowerCase();
 if (needle) {
 list = list.filter((s) =>
 `${s.name} ${s.description || ''} ${s.scene || ''} ${s.source_path}`.toLowerCase().includes(needle));
 }
 if (sortKey !== 'default') {
 list = [...list].sort((a, b) => {
 if (sortKey === 'uses') return (b.uses || 0) - (a.uses || 0);
 if (sortKey === 'verified') return (b.last_verified_at || 0) - (a.last_verified_at || 0);
 const au = a.uses ?? 0, bu = b.uses ?? 0;
 const ra = au > 0 ? (a.wins || 0) / au : -1; // 无实战样本排末位(真值边界,不假设 0%)
 const rb = bu > 0 ? (b.wins || 0) / bu : -1;
 return rb - ra;
 });
 }
 return list;
 }, [allRows, tab, q, sortKey]);
 // 全平台升级 Step4①: 分页切片(12/24/50/100)
 const total = shown.length;
 const pages = Math.max(1, Math.ceil(total / pageSize));
 const safePage = Math.min(page, pages);
 const paged = useMemo(() => shown.slice((safePage - 1) * pageSize, safePage * pageSize), [shown, safePage, pageSize]);
 useEffect(() => { setPage(1); }, [q, tab, sortKey, pageSize]);
 // 导出技能清单(过滤视图真值;JSON/CSV)
 const exportSkillRows = useMemo(() => shown.map((s) => ({
 name: s.name, scene: s.scene || '', description: s.description || '',
 status: s.status || '', source_path: s.source_path,
 uses: s.uses ?? 0, wins: s.wins ?? 0, last_verified_at: s.last_verified_at ?? '',
 layer: s.source_path?.startsWith('local:') ? '本地' : '后端库',
 })), [shown]);
 // R126: 生命周期操作(admin)——draft 转正/停用/启用/删除(删除带挂载引用防呆,后端 409 如实透出)
 const setSkillStatus = async (s: SkillRow, status: 'active' | 'disabled') => {
 try {
 await api(`/api/skills/${s.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
 toast.ok(status === 'active' ? `「${s.name}」${s.status === 'draft' ? '草案转正' : '已启用'}(参与 AI 自动选技)` : `「${s.name}」已停用(保留在册,AI 不再选它)`);
 load();
 } catch (e: any) { toast.err('状态变更失败: ' + e.message); }
 };
 // Delete goes through a confirm dialog (delFor); the requests are unchanged.
 const [delFor, setDelFor] = useState<SkillRow | null>(null);
 const [delBusy, setDelBusy] = useState(false);
 const delSkill = (s: SkillRow) => setDelFor(s);
 const [bulkAsk, setBulkAsk] = useState<'approve' | 'reject' | null>(null);
 const runBulk = async (action: 'approve' | 'reject') => {
 setBulkBusy(true);
 if (action === 'approve') {
 try {
 const d = await api<any>('/api/kb/candidates/decide-batch', {
 method: 'POST', body: JSON.stringify({ ids: Array.from(selCands), action: 'approve' }) });
 toast.ok(`批量通过 ${(d.decided || []).length}/${selCands.size} 条,已写入知识库`);
 } catch { toast.err('批量通过失败'); }
 setSelCands(new Set());
 const l = await api<{ items: KBCandidate[] }>('/api/kb/candidates');
 setCands(l.items || []);
 setBulkBusy(false);
 return;
 }
 try {
 const d = await api<any>('/api/kb/candidates/decide-batch', {
 method: 'POST', body: JSON.stringify({ ids: Array.from(selCands), action: 'reject' }) });
 toast.ok(`批量拒绝 ${(d.decided || []).length}/${selCands.size} 条(保留记录)`);
 setSelCands(new Set());
 const l = await api<{ items: KBCandidate[] }>('/api/kb/candidates');
 setCands(l.items || []);
 } catch { toast.err('批量拒绝失败'); }
 finally { setBulkBusy(false); }
 };
 const doDelete = async (s: SkillRow) => {
 if ((s.source_path || '').startsWith('local:')) {
 persistLocal(localSkills.filter((x) => x.id !== s.id));
 toast.ok(`已删除本地技能「${s.name}」`);
 return;
 }
 try {
 await api(`/api/skills/${s.id}`, { method: 'DELETE' });
 toast.ok(`已删除「${s.name}」`);
 load();
 } catch (e: any) { toast.err('删除失败: ' + e.message); }
 };
 const battleTotal = useMemo(() => (rows || []).reduce((n, s) => n + (s.uses || 0), 0), [rows]);

 // Rxxx: KPI 卡快速过滤(点击卡片=过滤列表;激活态随过滤条件回显)
 const applyKpi = (k: 'total' | 'distill' | 'local' | 'battle' | 'mount') => {
    if (k === 'total') { setWorkbench('library'); setTab('全部'); setQ(''); }
    else if (k === 'distill') { setWorkbench('library'); setTab('蒸馏草案'); setQ(''); }
    else if (k === 'local') { setWorkbench('library'); setTab('全部'); setQ('local:'); }
    else if (k === 'battle') { setWorkbench('library'); setTab('全部'); setQ(''); setSortKey('uses'); }
    else { setManualOpen(true); toast.info('在「手动模式」面板选择目标任务后,此处统计该任务挂载数'); }
  };
  const kpiActive = {
    total: tab === '全部' && !q.trim(),
    distill: tab === '蒸馏草案',
    local: q.trim() === 'local:',
    battle: sortKey === 'uses',
    mount: manualOpen,
  };

  // ③ 详情抽屉(源码只读;Rxxx 升大号宽幅预览)
  const [srcFor, setSrcFor] = useState<SkillRow | null>(null);
  const [srcData, setSrcData] = useState<any>(null);
 const [srcErr, setSrcErr] = useState('');
 const [srcCopied, setSrcCopied] = useState(false); // R117-7②: 一键复制(成功打勾 1.4s 回弹)
 const copySource = async () => {
 if (!srcData?.content) return;
 try {
 await navigator.clipboard.writeText(srcData.content);
 setSrcCopied(true);
 setTimeout(() => setSrcCopied(false), 1400);
 } catch { /* 剪贴板不可用静默(全文仍在抽屉可见) */ }
 };
 const openSource = (s: SkillRow) => {
    setSrcFor(s); setSrcData(null); setSrcErr('');
    api<any>(`/api/skills/${s.id}/source`)
 .then(setSrcData)
 .catch((e) => setSrcErr(e.message));
  };

  // R90-1: 蒸馏入口(选任务→DeepSeek 生成草案→toast)
  const [distillTid, setDistillTid] = useState<number | null>(null);
 const [distilling, setDistilling] = useState(false);
 const doDistill = async () => {
    if (!distillTid) { toast.info('先选择要蒸馏的任务'); return; }
    setDistilling(true);
    try {
      const d = await api<any>('/api/skills/distill', { method: 'POST', body: JSON.stringify({ task_id: distillTid }) });
 toast.ok(d.added ? `草案已生成: ${d.name}` : `草案已存在(幂等跳过): ${d.name}`);
 load();
 } catch (e: any) { toast.err('蒸馏失败: ' + e.message); }
 setDistilling(false);
 };

 // R89-1: 导入弹窗(路径/URL 二选一)+ 挂载管理(闭环端点零改动)
 const [impOpen, setImpOpen] = useState(false);
 const [impPath, setImpPath] = useState('');
 const [impUrl, setImpUrl] = useState('');
 const [impBusy, setImpBusy] = useState(false);
 const doImport = async () => {
    if (!impPath && !impUrl) { toast.err('路径与 URL 至少填一项'); return; }
    setImpBusy(true);
    try {
      const d = await api<any>('/api/skills/import', { method: 'POST',
        body: JSON.stringify(impPath ? { path: impPath } : { url: impUrl }) });
      toast.ok(`导入完成: 新增 ${d.added} · 跳过已存在 ${d.skipped}${(d.errors || []).length ? ' · 错误 ' + d.errors.length : ''}`);
      setImpOpen(false); setImpPath(''); setImpUrl(''); load();
    } catch (e: any) { toast.err('导入失败: ' + e.message); }
    setImpBusy(false);
  };
  const [tasks, setTasks] = useState<any[]>([]);
  const [mountTid, setMountTid] = useState<number | null>(null);
  const [mounted, setMounted] = useState<any[]>([]);
 useEffect(() => {
    api<any[]>('/api/tasks?limit=200').then((rows) =>
 setTasks((rows || []).filter((r: any) => r.kind === 'audit' && r.status === 'done' && r.result_id))).catch(() => {});
 }, []);
 useEffect(() => {
    if (mountTid) api<any[]>(`/api/tasks/${mountTid}/skills`).then(setMounted).catch(() => setMounted([]));
 else setMounted([]);
 }, [mountTid]);
 const doMount = async (sid: number, name: string) => {
    if (!mountTid) { toast.info('先在页头选择目标任务'); return; }
    try {
      const d = await api<any>(`/api/tasks/${mountTid}/skills/${sid}/mount`, { method: 'POST' });
      toast.ok(d.newly ? `已挂载「${name}」到任务 #${mountTid}` : `「${name}」已挂载(幂等跳过)`);
      api<any[]>(`/api/tasks/${mountTid}/skills`).then(setMounted).catch(() => {});
 } catch (e: any) { toast.err('挂载失败: ' + e.message); }
 };
 const doUnmount = async (sid: number, name: string) => {
    if (!mountTid) return;
    try {
      await api(`/api/tasks/${mountTid}/skills/${sid}/mount`, { method: 'DELETE' });
      toast.ok(`已卸载「${name}」`);
      api<any[]>(`/api/tasks/${mountTid}/skills`).then(setMounted).catch(() => {});
 } catch (e: any) { toast.err('卸载失败: ' + e.message); }
 };

 const rescan = async () => {
    setScanning(true); setScanMsg('');
    try {
      const d = await api<any>('/api/skills/scan', { method: 'POST' });
      setScanMsg(`扫描完成: 新收编 ${d.added} · 跳过已存在 ${d.skipped} · 总计 ${d.total}(幂等)`);
      load();
    } catch (e: any) { setScanMsg('扫描失败: ' + e.message); }
    setScanning(false);
  };

  return (
    <Page data-skills-page>
      <PageHeader title={moduleLabel('/skills')}
        description="评估中沉淀的可复用技能。AI 会自动选用、挂载并记录结果;手动操作只用于补挂历史任务和从成功任务提炼。"
        actions={<>
          <Button variant="secondary" onClick={() => setManualOpen(!manualOpen)} data-manual-toggle aria-expanded={manualOpen}
            title="AI 自动流程之外的人工操作:给历史任务补挂或覆盖 AI 的选择,从成功任务手动提炼。日常流程不依赖它。">
            {manualOpen ? '收起手动操作' : '手动操作'}
          </Button>
          <Button variant="secondary" icon={<RefreshCw size={16} aria-hidden />} onClick={rescan} loading={scanning} disabled={scanning} data-skills-rescan
            title="重新扫描已收编的技能目录(POST /api/skills/scan,重复执行结果不变)">
            {scanning ? '扫描中…' : '重新扫描'}
          </Button>
        </>} />

      <div className="grid grid-cols-2 gap-3 tablet:grid-cols-3 desktop:grid-cols-5 desktop:gap-4">
        <KpiCard icon={Braces} label="总技能" value={rows ? allRows.length : err ? '—' : '…'}
          sub={`${cats.length} 个来源分类`} active={kpiActive.total}
          title="/api/skills 列表加本地自定义条目,按列表实际计数"
          onClick={() => applyKpi('total')} />
        <KpiCard icon={FlaskConical} label="蒸馏自研" value={rows ? distilledCount : err ? '—' : '…'}
          sub="草案或由任务提炼" active={kpiActive.distill}
          title="status=draft 或 source_path 以 task: 开头的条目数"
          onClick={() => applyKpi('distill')} />
        <KpiCard icon={FolderOpen} label="本地自定义" value={localSkills.length}
          sub="只保存在本浏览器" active={kpiActive.local}
          title="本地自定义和导入技能包的条目数(localStorage,不写入后端)"
          onClick={() => applyKpi('local')} />
        <KpiCard icon={Activity} label="实战回流" value={rows ? battleTotal : err ? '—' : '…'}
          sub="任务结果记录" active={kpiActive.battle}
          title="skill_outcomes 记录总数(任务结束时按 code_recovered / unpack_ok 回写);点击按使用次数排序"
          onClick={() => applyKpi('battle')} />
        <KpiCard icon={Plug} label="已挂载" value={mountTid ? mounted.length : '—'}
          sub={mountTid ? `任务 #${mountTid}` : '未选目标任务'} active={kpiActive.mount}
          title={mountTid ? `任务 #${mountTid} 当前挂载的技能数` : '在手动操作里选择目标任务后显示;后端没有全局挂载计数接口'}
          onClick={() => applyKpi('mount')} />
      </div>

      <div className="flex flex-wrap items-end gap-3" data-skills-primary-tabs>
        <Tabs<'library' | 'review'> label="知识库工作区" value={effectiveWb} onChange={setWorkbench} className="min-w-0 flex-1"
          items={[
            { key: 'library', label: '技能库', count: allRows.length, dataAttrs: { 'data-skills-primary-tab': 'library' } },
            ...(isAdmin ? [{ key: 'review' as const, label: '候选审核', count: pendingCands.length, dataAttrs: { 'data-skills-primary-tab': 'review' } }] : []),
          ]} />
        {isAdmin && effectiveWb === 'library' && pendingCands.length > 0 && (
          <Button size="sm" variant="subtle" icon={<Bell size={14} aria-hidden />} onClick={() => setWorkbench('review')} data-skills-cand-pill
            title="切换到候选审核(复盘产出的候选,不会自动入库)">
            {pendingCands.length} 条候选待审核
          </Button>
        )}
      </div>
      {isAdmin && effectiveWb === 'review' && (
        <p className="-mt-3 text-meta text-jz-muted">待审 {pendingCands.length} · 已通过 {decidedCounts.approved} · 已拒绝 {decidedCounts.rejected}</p>
      )}

      {effectiveWb === 'library' && (
        <div className="space-y-4">
          {/* R127: 手动模式折叠区——AI 自动编排(R125)后的降级归宿: 人工兜底/覆盖/历史任务补挂/成功任务蒸馏 */}
          {manualOpen && (
            <div className="rounded-panel bg-jz-surface-2 p-3 flex items-center gap-2 flex-wrap" data-manual-panel>
              <span className="text-meta text-jz-muted"
 title="新任务由 AI 编排器自动选技挂载(R125),此处仅兜底: R125 前历史任务补挂 / 人工覆盖 AI 选择">手动补挂:</span>
              <select value={mountTid ?? ''} onChange={(e) => setMountTid(Number(e.target.value) || null)} data-mount-task-select
 className="bg-jz-surface-2/60 rounded-control px-1.5 py-1 text-meta text-jz-ink max-w-[220px] outline-none">
                <option value="">选择目标任务(历史/覆盖)…</option>
 {tasks.map((t) => <option key={t.id} value={t.id}>#{t.id} {t.app_name || t.package || '审计'}</option>)}
              </select>
              <span className="text-meta text-jz-muted"
 title="失败缺口已自动蒸馏(R125);此处从成功任务手动提炼新技能">手动蒸馏:</span>
              <select value={distillTid ?? ''} onChange={(e) => setDistillTid(Number(e.target.value) || null)} data-distill-task-select
 className="bg-jz-surface-2/60 rounded-control px-1.5 py-1 text-meta text-jz-ink max-w-[200px] outline-none">
                <option value="">选成功任务提炼…</option>
 {tasks.map((t) => <option key={t.id} value={t.id}>#{t.id} {t.app_name || t.package || '审计'}</option>)}
              </select>
              <button onClick={doDistill} disabled={distilling} data-distill-btn
 className="px-2 py-1 rounded-control bg-jz-sev-medium/10 text-jz-sev-medium text-meta hover:bg-jz-sev-medium/20 disabled:opacity-40">
                {distilling ? '蒸馏中…' : '⚗️ 蒸馏'}
              </button>
              <button onClick={() => setImpOpen(!impOpen)} data-skills-import-btn
 className="px-2 py-1 rounded-control bg-jz-brand/10 text-jz-brand text-meta hover:bg-jz-brand/20"> 导入</button>
            </div>
          )}
          {scanMsg && <div className="text-meta text-jz-brand" data-scan-msg>{scanMsg}</div>}
          {impOpen && (
            <div className="rounded-panel bg-jz-surface shadow-card p-4 space-y-2" data-import-panel>
              <div className="text-meta font-semibold text-jz-ink">导入技能(二选一)</div>
              <input value={impPath} onChange={(e) => setImpPath(e.target.value)} placeholder="本地路径(目录含 SKILL.md,或 .zip 文件)"
 className="w-full px-2 py-1.5 rounded-control bg-jz-surface-2/60 text-meta text-jz-ink outline-none" />
              <input value={impUrl} onChange={(e) => setImpUrl(e.target.value)} placeholder="在线 URL(http(s) 指向 SKILL.md 文本)"
 className="w-full px-2 py-1.5 rounded-control bg-jz-surface-2/60 text-meta text-jz-ink outline-none" />
              <div className="flex gap-2">
                <button onClick={doImport} disabled={impBusy} data-import-submit
 className="px-2 py-1 rounded-control bg-jz-brand/15 text-jz-brand text-meta disabled:opacity-40">
                  {impBusy ? '导入中…' : '导入'}</button>
                <button onClick={() => setImpOpen(false)} className="px-2 py-1 rounded-control bg-jz-surface-2/60 text-jz-muted text-meta">取消</button>
              </div>
            </div>
          )}
          {mountTid && (
            <div className="rounded-panel bg-jz-surface shadow-card p-3 flex items-center gap-2 flex-wrap" data-mounted-panel>
              <span className="text-meta text-jz-muted">任务 #{mountTid} 已挂载:</span>
              {mounted.length === 0 && <span className="text-meta text-jz-muted">(空——在下方卡片点「挂载」)</span>}
 {mounted.map((m) => (
                <span key={m.skill_id} className="px-1.5 py-0.5 rounded-control bg-jz-brand/10 text-jz-brand text-meta" data-mounted-chip={m.name}>
                  {m.name}
                  <button onClick={() => doUnmount(m.skill_id, m.name)} className="ml-1 opacity-70 hover:opacity-100">✕</button>
                </span>
              ))}
            </div>
          )}
          {/* 全平台升级 Step4①: 新建自定义技能表单(本地层) */}
          {newOpen && (
            <div className="rounded-panel bg-jz-surface shadow-card p-4 space-y-2" data-skill-new-form>
              <div className="flex items-center gap-2 text-meta">
                <span className="font-semibold text-jz-ink">新建自定义技能</span>
                <span className="px-1.5 py-0.5 rounded-control text-meta bg-jz-sev-medium/10 text-jz-sev-medium">本地层 · 不参与 AI 自动选技</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-1.5">
                <input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder="技能名称(必填,唯一)" data-skill-new-name
 className="px-2.5 py-1.5 rounded-control bg-jz-surface-2/60 text-meta text-jz-ink outline-none focus:ring-2 focus:ring-jz-brand/30" />
                <input value={newForm.scene} onChange={(e) => setNewForm({ ...newForm, scene: e.target.value })} placeholder="场景标签" data-skill-new-scene
 className="px-2.5 py-1.5 rounded-control bg-jz-surface-2/60 text-meta text-jz-ink outline-none focus:ring-2 focus:ring-jz-brand/30" />
              </div>
              <textarea value={newForm.description} onChange={(e) => setNewForm({ ...newForm, description: e.target.value })} rows={2}
 placeholder="描述/用途(可选)" data-skill-new-desc
 className="w-full px-2.5 py-1.5 rounded-control bg-jz-surface-2/60 text-meta text-jz-ink outline-none focus:ring-2 focus:ring-jz-brand/30 resize-y" />
              <div className="flex items-center gap-2">
                <button onClick={addLocalSkill} disabled={!newForm.name.trim()} data-skill-new-submit
 className="px-2.5 py-1 rounded-control bg-jz-brand/15 text-jz-brand text-meta font-semibold hover:bg-jz-brand/25 disabled:opacity-40 disabled:cursor-not-allowed">保存(本地)</button>
                <button onClick={() => setNewOpen(false)} className="px-2.5 py-1 rounded-control bg-jz-surface-2/60 text-jz-muted text-meta hover:bg-jz-surface-2">取消</button>
              </div>
            </div>
 )}
 {/* scene 分类 Tabs(类别与计数均由列表真算,只列库内存在的)+ 全平台升级 Step4① DataToolbar */}
 {rows && allRows.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap" data-scene-tabs>
 {['全部', ...cats.map(([k]) => k)].map((k) => (
                <button key={k} onClick={() => setTab(k)} data-scene-tab={k}
 className={`px-2.5 py-1 rounded-pill text-meta transition-colors ${tab === k
 ? 'bg-jz-brand/10 text-jz-brand font-semibold'
 : 'bg-jz-surface-2/50 text-jz-muted hover:text-jz-ink-2'}`}>
                  {k}
                  {/* R117-7③: 计数口径注(列表真算,含草案) */}
                  <span className="ml-1 tnum font-mono opacity-70"
 title="统计口径: /api/skills 列表按来源分类真算的条目数(含蒸馏草案与本地自定义,零推断)">
 {k === '全部' ? allRows.length : (cats.find(([c]) => c === k)?.[1] ?? 0)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <DataToolbar
 probe="skills"
 search={q} onSearch={setQ} searchPlaceholder="搜索名称/描述/来源/标签…"
 searchDataAttrs={{ 'data-skill-search': '' }}
 sortOptions={[
 { id: 'default', label: '默认排序' },
 { id: 'uses', label: '实战次数↓' },
 { id: 'winrate', label: '胜率↓' },
 { id: 'verified', label: '最近验证↓' },
 ]}
 sort={sortKey} onSort={(id) => setSortKey(id as typeof sortKey)}
 sortDataAttrs={{ 'data-skill-sort': '' }}
 onImport={() => setPackImpOpen(true)} importLabel="导入技能包"
 exportItems={[{ id: 'json', label: '技能清单 JSON' }, { id: 'csv', label: '技能清单 CSV' }]}
 onExport={(id) => exportDataFile('skills_list', id as 'json' | 'csv', exportSkillRows, { title: '技能知识库清单(当前过滤视图)' })}
 onCreate={() => setNewOpen(true)} createLabel="新建自定义技能"
 pager={{ total, page: safePage, pageSize, onPage: setPage, onPageSize: setPageSize }}
 />
          {err && (
            <div className="rounded-card border border-jz-border bg-jz-surface" data-skills-error>
              <ErrorState title="技能列表没有加载成功" message={err} onRetry={load} />
            </div>
          )}
          {!rows && !err && <SkeletonLoader variant="card" rows={3} />}
          {rows && allRows.length === 0 && (
            <div className="rounded-card border border-jz-border bg-jz-surface" data-skills-empty>
              <EmptyState icon={FolderOpen} title="还没有技能"
                cause="重新扫描会收编已有的技能目录、项目规则和平台模块;也可以新建本地技能或导入技能包。"
                action={<Button variant="secondary" icon={<RefreshCw size={16} aria-hidden />} onClick={rescan} loading={scanning} data-skills-empty-rescan>重新扫描</Button>} />
            </div>
          )}
          {rows && allRows.length > 0 && shown.length === 0 && (
            <div className="rounded-card border border-jz-border bg-jz-surface" data-skills-tab-empty>
              <div data-skill-search-empty>
                <EmptyState icon={Braces} title="没有符合条件的技能"
                  cause={q ? `“${q}”在“${tab}”中没有匹配项,共 ${allRows.length} 条技能。` : `“${tab}”下没有条目。`}
                  action={<Button variant="secondary" onClick={() => { setTab('全部'); setQ(''); }} data-skills-reset-tab>清除筛选</Button>} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3" data-skill-grid>
 {paged.map((s) => (
              <SkillCard key={s.id} s={s}
 isLocal={(s.source_path || '').startsWith('local:')}
 isMounted={!!mountTid && mounted.some((m) => m.skill_id === s.id)}
 mountTid={mountTid} isAdmin={isAdmin}
 onMount={(x) => doMount(x.id, x.name)}
 onUnmount={(x) => doUnmount(x.id, x.name)}
 onSource={openSource}
 onStatus={setSkillStatus}
 onDelete={delSkill}
 />
            ))}
          </div>
          {/* R195(V3 图谱化第2步): 知识图谱查询面板(admin)——壳↔漏洞↔来源 跨维关联人工研判(置于库尾,不占首屏) */}
          {isAdmin && (
            <Panel title="知识关联" description="按关键词查询加固方案、发现类型和来源之间的关联(/api/kb/relations)。" data-kb-graph
              actions={graph ? <span className="font-mono text-meta tnum text-jz-muted">{graph.nodes?.length || 0} 节点 / {graph.edges?.length || 0} 边</span> : undefined}>
              <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); loadGraph(); }}>
                <div className="w-full max-w-xs">
                  <Input value={gq} onChange={(e) => setGq(e.target.value)} aria-label="关联查询关键词" placeholder="关键词,例如 ijiami" />
                </div>
                <Button type="submit" variant="secondary" loading={gBusy} disabled={gBusy} data-kb-graph-query>{gBusy ? '查询中…' : '查询'}</Button>
              </form>
 {graph && (graph.nodes?.length > 0) && (
                <div className="mt-3 overflow-hidden rounded-card border border-jz-border" data-kb-graph-box>
                  <KbGraph graph={graph} />
                </div>
 )}
 {graph && (graph.nodes?.length > 0) && (
                <div className="mt-3 grid grid-cols-1 gap-3 text-label tablet:grid-cols-3">
                  <div>
                    <div className="mb-1 text-meta text-jz-muted">加固方案</div>
 {(graph.nodes || []).filter((n: any) => n.type === 'packer').map((n: any) => (
                      <div key={n.id} className="font-mono text-jz-ink-2">{n.id}</div>))}
                  </div>
                  <div>
                    <div className="mb-1 text-meta text-jz-muted">发现类型</div>
 {(graph.nodes || []).filter((n: any) => n.type === 'vuln').map((n: any) => (
                      <div key={n.id} className="font-mono text-jz-ink-2">{n.id}</div>))}
 {!(graph.nodes || []).some((n: any) => n.type === 'vuln') && <span className="text-jz-muted">—</span>}
                  </div>
                  <div>
                    <div className="mb-1 text-meta text-jz-muted">出现 2 次以上的关联</div>
 {(graph.edges || []).filter((e: any) => (e.count || 0) >= 2).slice(0, 5).map((e: any, i: number) => (
                      <div key={i} className="font-mono text-jz-ink-2 truncate" title={`${e.a} → ${e.b} (${e.rel})`}>
                        {e.a.replace(/^(src|item):/, '')}→{e.b.replace(/^(src|item|packer|vuln|task):/, '')} ×{e.count}</div>))}
                  </div>
                </div>
              )}
              {graph && (graph.nodes?.length === 0) && (
                <p className="mt-3 text-label text-jz-muted">没有找到与这个关键词相关的条目。</p>)}
            </Panel>
          )}
        </div>
      )}

      {/* ② 候选审核台(工作台 Tab2,admin): 结构化宽幅卡 2 列(治文字墙);审核端点/探针零回退 */}
      {isAdmin && effectiveWb === 'review' && cands && (
        <div className="rounded-panel bg-jz-surface shadow-card p-4 space-y-3" data-kb-candidates-group>
          <div className="flex items-center gap-2 flex-wrap">
            <GraduationCap className="w-3.5 h-3.5 text-jz-brand" />
            <span className="text-body font-semibold text-jz-ink">待审核候选(自学习)</span>
            <Badge level={pendingCands.length ? 'medium' : 'safe'}>待审 {pendingCands.length}</Badge>
            <Badge level="safe">已通过 {decidedCounts.approved}</Badge>
            <Badge level="info">已拒绝 {decidedCounts.rejected}</Badge>
            <span className="text-meta text-jz-muted">post_mortem 复盘产出 · 零自动转正 · 通过写入知识库 / 拒绝留档</span>
            <span className="flex-1" />
 {(() => {
 const pre = pendingCands.filter((c) => (c.note || '').startsWith('[预审]'));
 const adoptN = pre.filter((c) => (c.note || '').includes('[预审] adopt')).length;
              return <>
                <span className="text-meta font-mono text-jz-muted" data-kb-pre-count>
                  预审 {pre.length}(建议通过 {adoptN}/拒绝 {pre.length - adoptN})
                </span>
                <button
 onClick={async () => {
                    try {
                      setPrerevBusy(true);
                      const d = await api<any>('/api/kb/candidates/pre-review', { method: 'POST', body: JSON.stringify({ limit: 20 }) });
                      toast.ok(`LLM 预审 ${d.reviewed} 条: 建议 ${d.adopt} 通过 / ${d.reject} 拒绝`);
                      const l = await api<{ items: KBCandidate[] }>('/api/kb/candidates');
 setCands(l.items || []);
 } catch { toast.err('预审失败(LLM 未配置或网络)'); }
 finally { setPrerevBusy(false); }
 }}
 disabled={prerevBusy}
 data-kb-prereview-btn
 title="LLM 批量预审 pending 候选(建议写 note,不替 admin 决定)"
 className="px-1.5 py-0.5 rounded-control bg-jz-brand/10 text-jz-brand text-meta hover:bg-jz-brand/20 disabled:opacity-40">
                  {prerevBusy ? '预审中…' : ' LLM 预审'}
                </button>
              </>;
            })()}
          </div>
 {(() => {
 const kinds: [typeof preFilter, string][] = [['all', '全部'], ['adopt', '建议通过'], ['reject', '建议拒绝'], ['needs', '待信息'], ['none', '未预审']];
 const cnt = (k: typeof preFilter) => pendingCands.filter((c) => {
              const n = c.note || '';
              if (k === 'all') return true;
              if (k === 'none') return !n.startsWith('[预审]');
              return n.startsWith(`[预审] ${k === 'needs' ? 'needs_info' : k}`);
            }).length;
            return (
              <div className="flex items-center gap-1 flex-wrap" data-kb-pre-filter>
 {kinds.map(([k, label]) => (
                  <button key={k} onClick={() => setPreFilter(k)} data-kb-pre-filter-btn={k}
 className={`px-1.5 py-0.5 rounded-control text-meta transition-colors ${preFilter === k
 ? 'bg-jz-brand/10 text-jz-brand font-semibold'
 : 'bg-jz-surface-2/50 text-jz-muted hover:bg-jz-surface-2'}`}>
                    {label} <span className="tnum">{cnt(k)}</span>
                  </button>
                ))}
              </div>
 );
 })()}
 {selCands.size > 0 && (
            <div role="region" aria-label="批量审核" className="flex flex-wrap items-center gap-2 rounded-control border border-jz-border bg-jz-brand-soft px-3 py-2 text-label" data-kb-bulk-bar>
              <span className="text-jz-ink">已选 <span className="font-semibold tnum">{selCands.size}</span> 条</span>
              <Button size="sm" variant="secondary" onClick={() => setBulkAsk('approve')} disabled={bulkBusy} data-kb-bulk-approve>批量通过</Button>
              <Button size="sm" variant="secondary" className="text-jz-red" onClick={() => setBulkAsk('reject')} disabled={bulkBusy} data-kb-bulk-reject>批量拒绝</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelCands(new Set())} data-kb-bulk-clear>取消选择</Button>
            </div>
          )}
          {pendingCands.length === 0 && (
            <div className="text-meta text-jz-muted" data-kb-candidates-empty>暂无待审核候选(pentest 会话跑 post_mortem 复盘后在此人工审核)</div>
          )}
          {/* 结构化宽幅卡 2 列(治文字墙): 解析/渲染见 CandidateCard(卡高均匀 360px) */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6" data-kb-cand-grid>
 {filteredCands.map((c) => (
              <CandidateCard key={c.id} cand={c}
 checked={selCands.has(c.id)}
 busy={candBusy === c.id}
 onCheck={(id, on) => {
 const s = new Set(selCands);
 if (on) s.add(id); else s.delete(id);
 setSelCands(s);
 }}
 onDecide={decideCand}
 onInspect={setCandFor}
 />
 ))}
 {pendingCands.length > 0 && filteredCands.length === 0 && (
              <div className="col-span-full text-meta text-jz-muted py-6 text-center" data-kb-pre-filter-empty>
                当前预审过滤下无候选(切回「全部」查看 {pendingCands.length} 条)
              </div>
            )}
          </div>
        </div>
      )}

      {/* 全平台升级 Step4①: 技能包导入(前端解析 json/csv;本地层合并,行需含 name 字段) */}
      <UniversalImportModal
 open={packImpOpen}
 title="导入技能包(前端解析,本地层)"
 hint="json 数组或 {skills|items|rows:[...]} / csv 表格;行字段: name(必填)/description/scene"
 onClose={() => setPackImpOpen(false)}
 validateRow={(row) => (String(row.name || row['名称'] || '').trim() ? '' : '缺 name(名称)字段')}
 onImportSuccess={(r: UniversalImportResult) => onImportPack(r.rows)}
 />
      {/* 候选抽屉全屏检视(Rxxx 新增): 同解析器全展开+原文兜底;端点零新增 */}
      <Drawer open={!!candFor} width={620}
 title={candFor ? `候选全屏检视 · #${candFor.id}` : ''}
 onClose={() => setCandFor(null)}>
        {candFor && <CandidateInspector cand={candFor} />}
      </Drawer>
      {/* ③ 详情抽屉:源码+场景+说明(数据源 GET /api/skills/{id}/source,后端只读防穿越;Rxxx 升大号宽幅) */}
      <Drawer open={!!srcFor} width={680}
 title={srcFor ? `技能详情 · ${srcFor.name}` : ''} onClose={() => setSrcFor(null)}>
        {srcFor && (
          <>
            <div className="space-y-1 text-meta">
              <div className="flex gap-2"><span className="text-jz-muted w-16 shrink-0">场景</span>
                <span className="text-jz-ink-2 font-mono break-all">{srcFor.scene || '—'}</span></div>
              <div className="flex gap-2"><span className="text-jz-muted w-16 shrink-0">状态</span>
                <span className="text-jz-ink-2">
 {srcFor.status === 'draft' ? 'draft(蒸馏草案,复核后可转正)' : srcFor.status === 'disabled' ? 'disabled(停用,AI 不选)' : 'active(在册,AI 可自动选技)'}
 {(srcFor.uses || 0) > 0 ? ` · 实战 ${srcFor.uses} 次 · 胜 ${srcFor.wins}` : ''}
                </span></div>
              <div className="flex gap-2"><span className="text-jz-muted w-16 shrink-0">说明</span>
                <span className="text-jz-ink-2 break-words">{srcFor.description || '—'}</span></div>
              <div className="flex gap-2"><span className="text-jz-muted w-16 shrink-0">注册路径</span>
                <span className="text-jz-ink-2 font-mono break-all">{srcFor.source_path}</span></div>
            </div>
            {srcErr && (
              <div className="rounded-control bg-jz-sev-medium/10 p-2 text-meta text-jz-sev-medium" data-source-error>
                源码不可读: {srcErr}(端点如实回告,不展示占位内容)
              </div>
            )}
            {!srcData && !srcErr && <Skeleton className="h-40" />}
            {srcData && typeof srcData.content !== 'string' && (
              <EmptyState compact icon={Braces} title="没有可显示的源码" cause="接口没有返回文件内容。注册路径和说明见上方。" />
            )}
            {srcData && typeof srcData.content === 'string' && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-meta text-jz-muted">
                  <span>源文件 <span className="font-mono break-all">{srcData.file}</span>
                    <span className="tnum"> · {srcData.bytes} 字节</span>
                    {srcData.truncated && <span className="text-jz-sev-medium"> · 超 256KB 已截断</span>}</span>
                  <span className="flex-1" />
                  {/* R117-7②: 一键复制源码(Copy→Check 回弹) */}
                  <button onClick={copySource} data-source-copy
 title="复制源码全文到剪贴板"
 className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-control bg-jz-surface-2/60 text-jz-ink-2 hover:text-jz-brand transition-colors">
                    {srcCopied ? <Check className="w-3 h-3 text-jz-teal" /> : <Copy className="w-3 h-3" />}
                    {srcCopied ? '已复制' : '复制'}
                  </button>
                </div>
                <pre data-source-pre
 className="text-meta leading-4 font-mono text-jz-ink-2 bg-jz-surface-2 rounded-control p-2 overflow-auto max-h-[calc(100vh-320px)] whitespace-pre">
                  <code>{renderSourceCode(srcData.content)}</code>
                </pre>
              </div>
            )}
          </>
        )}
      </Drawer>
      <ConfirmDialog open={!!delFor} destructive busy={delBusy} confirmLabel="删除"
        title={delFor ? `删除「${delFor.name}」?` : ''}
        outcome={!delFor ? null : (delFor.source_path || '').startsWith('local:')
          ? '只移除本浏览器里的这条本地记录,不影响后端。'
          : kindOf(delFor).label === '内置'
            ? `这是内置技能(${kindOf(delFor).tab})。删除后 AI 不会再选用它,实战记录和挂载关系一并清除,无法恢复。只想暂停使用请改为“停用”。`
            : '实战记录和挂载关系会一并清除,无法恢复。只想暂停使用请改为“停用”。'}
        onCancel={() => setDelFor(null)}
        onConfirm={async () => { if (!delFor) return; setDelBusy(true); try { await doDelete(delFor); } finally { setDelBusy(false); setDelFor(null); } }} />
      <ConfirmDialog open={!!bulkAsk} destructive={bulkAsk === 'reject'} busy={bulkBusy}
        confirmLabel={bulkAsk === 'approve' ? '批量通过' : '批量拒绝'}
        title={bulkAsk === 'approve' ? `通过 ${selCands.size} 条候选?` : `拒绝 ${selCands.size} 条候选?`}
        outcome={bulkAsk === 'approve' ? '这些候选会写入正式知识库,之后可以被检索。审核结果不能撤回。' : '这些候选不会写入知识库,但记录会保留,可在审计中查看。审核结果不能撤回。'}
        onCancel={() => setBulkAsk(null)}
        onConfirm={async () => { const a = bulkAsk; setBulkAsk(null); if (a) await runBulk(a); }} />
    </Page>
  );
};

export default SkillsPage;
