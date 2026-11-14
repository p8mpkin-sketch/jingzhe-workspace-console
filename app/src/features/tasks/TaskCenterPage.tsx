import React, {useEffect, useMemo, useRef, useState , useCallback} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ClipboardList, Download, ExternalLink, MessageSquare, MoreHorizontal, Plus, RefreshCw, Search } from 'lucide-react';
import { api } from '@/services/api';
import { usePentest } from '@/stores/pentest';
// R108-2①②: 三件套接入——tasks===null(首载)呈 SkeletonLoader 表格骨架;非加载且过滤后为空呈 EmptyStatePlaceholder
// (文案沿既有诚实空文案逐字保留);数据获取逻辑零动(loadAll 原样)。
// 本轮重构(并发槽位算术修复+双态势舱+检索工具栏+诚实状态列+显性操作列):
//  - R614 存量全保留: DataToolbar 接入/批量勾选操作栏/底部分页器/全部 data-* 探针(只增不删)
//  - 诚实纪律: 「完成」≠业务码脱出——done 任务按 unpack_outcome+progress 文本解析三分渲染
//    (完整完成/部分完成(脱壳受阻)/失败),解析不到业务码类数=只显状态不编数
// 本轮渲染修复五处(浏览器实-rendering 实证):
//  ①会话滑轨改上下两层(顶部横条标题+翻页/收起,底部卡片区)——旧左侧 9px 竖排文字条一字一行=移除
//  ②顶部 12 列网格左 5 右 7,左卡补卡头+四等高数字指标+全宽进度条(与右卡 p-5 对称)
//  ③清理失败项/导出/新建上移页头右端;检索卡严格两行(搜索+下拉+Checkbox 开关 / 纯状态胶囊)
//  ④honestDone 判定收紧: 业务码类数真实统计严禁覆盖;「脱壳受阻」=明确有壳 且 (类数=0 或 文本明确未脱出)
//    (实证 #785 17类/#786 1类 均无壳=正常完成+真实类数;旧「≤20 类即受阻」规则废除)
//  ⑤操作列统一 px-2.5 py-1 text-meta rounded-control border 胶囊(接力同高同圆角,禁用态同尺寸)
import { Badge, DataToolbar, EmptyStatePlaceholder, exportDataFile, Modal, SkeletonLoader, StatusBadge } from '@/components/ui';
import { ArtifactsModal } from './ArtifactsModal';
import { RerunTaskModal } from './RerunTaskModal';

const ST_CN: Record<string, string> = { done: '完成', running: '运行中', failed: '失败', queued: '排队' };
// R120-2 脱壳语义透出: 「完成」=管线跑完≠业务码脱出(754 东莞银行 ijiami 实证)。判定输入=
// 后端 /api/tasks 既有字段: unpack_outcome(verdict/defined_biz/code_recovered/biz_classes)+progress 文本
// (runner 实证: 阻塞任务 progress=「审计完成(⚠ 脱壳不完整: 业务代码 X 未脱出,…)」);
// 渲染见 honestDone/outcomeProbe——data-unpack-outcome 探针值域与原徽章恒等
// (pass/small_app/32bit_only/install_failed/verdict 原词/recovered/no_biz_code)。
// R103-1: 状态色改双模 CSS 变量(原硬编码 hex 亮色模式不换肤)
const ST_COL: Record<string, string> = { done: 'rgb(var(--jz-teal))', running: 'rgb(var(--jz-brand))', failed: 'rgb(var(--jz-red))', queued: 'rgb(var(--jz-muted))' };
// R103-8②: 类型四色徽章(unpack 紫/audit 蓝/fuzz 琥珀/recon 灰;其余灰兜底)——双模 CSS 变量
const KIND_CLS: Record<string, string> = {
 unpack: 'text-jz-brand bg-jz-brand/10',
 audit: 'text-jz-brand bg-jz-brand/10',
 fuzz: 'text-jz-amber bg-jz-amber/10',
 recon: 'text-jz-muted bg-jz-surface-2',
};
// 操作列按钮统一样式(本轮修复⑤): [接力][报告][产物][重试][详情][删除] 同高同圆角胶囊
// px-2.5 py-1 text-meta rounded-control border;禁用态保留 disabled 视觉但同尺寸;全部 whitespace-nowrap
const ACT_BTN = 'inline-flex items-center justify-center whitespace-nowrap px-2.5 py-1 rounded-control border text-meta font-medium transition-colors';
// R103-9③: 每页条数可选(原固定 20)
const PAGE_SIZES = [20, 50, 100, 200];
// 慢任务标线(规格): 耗时 >15m 琥珀慢任务标
const SLOW_S = 15 * 60;
// 0s 冒烟失败隐藏胶囊口径: 失败且耗时<2s(后端无 svc_smoke 专用标记——诚实降级为本地耗时判据,
// 实测库内 0.02s~0.84s 即时失败族: 「未找到待审 APK」等)
const SMOKE_FAIL_S = 2;

// R103-8②: 耗时格式化(2m 14s / 1h 03m);实时耗时由调用方传 now 驱动
// R103-9④: floor→round(亚秒均值 0.8s 不再显「0s」;59.7s→1m 00s 由 s>=60 分支自然承接)
const fmtDur = (sec: number): string => {
  if (!isFinite(sec) || sec < 0) return '—';
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
};
// 时间列副行: created_at/updated_at(epoch 秒,后端 tasks 表两列实存)→ MM-DD HH:mm;悬停显全量
const fmtTime = (ts?: number | null): string => {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// R103-8②: 壳标签(packer 字段实存;none=无壳,未知值原样显不编造)
const PACKER_NAMES: Record<string, string> = {
  bangcle: '梆梆安全', ijiami: '爱加密', jiagu: '360加固', qihoo: '360加固', '360_jiagu': '360加固',
  naqiu: '娜迦', wrap: '渠道壳', 'wrap-channel': '渠道壳',
};
const STAGE_CN: Record<string, string> = {
  'Security Analysis': '安全分析', 'Symbol Analysis': '符号分析',
  'Struct Analysis': '结构分析', 'Report Generation': '报告生成',
};

const TaskLiveProgress: React.FC<{ progress: string }> = ({ progress }) => {
  const segs = String(progress).split('→').map(s => s.trim()).filter(Boolean);
  const unpack = segs.find(s => /^Unpack:/i.test(s));
  const decomp = segs.find(s => /^Decompile:/i.test(s));
  const last = segs[segs.length - 1] || '';
  const post = decomp ? segs[segs.indexOf(decomp) + 1] : null;
  const pctOf = (s: string): number | null => {
    const m = /(\d+)%/.exec(s || '');
    return m ? Math.max(0, Math.min(100, parseInt(m[1], 10))) : null;
  };
  const dp = decomp ? pctOf(decomp) : null;
  const detail = decomp
    ? decomp.replace(/^Decompile:\s*\d+%\s*(·\s*)?/i, '').trim()
    : last.replace(/^(Security Analysis|Symbol Analysis|Struct Analysis|Report Generation):\s*/i, '').trim();
  return (
    <div className="mt-1.5 w-[270px] max-w-[270px] space-y-1" data-task-progress>
      {unpack && (
        <div className="flex items-start gap-1 text-meta leading-snug text-jz-teal" title={unpack}>
          <span className="flex-none">✓ 脱壳 100%</span>
          <span className="min-w-0 break-words text-jz-teal/80">
            {unpack.replace(/^Unpack:\s*100%\s*(·\s*)?/i, '')}
          </span>
        </div>
      )}
      {decomp ? (
        <div>
          <div className="flex items-baseline justify-between gap-2 text-meta">
            <span className="flex-none font-medium text-jz-brand">反编译 {dp ?? 0}%</span>
            <span className="min-w-0 truncate text-jz-muted" title={detail}>{detail || 'jadx…'}</span>
          </div>
          <div className="mt-0.5 h-1 w-full rounded-pill bg-jz-surface-2 overflow-hidden" data-progress-bar={dp ?? 0}>
            <div className="h-full bg-jz-brand transition-all" style={{ width: String(dp ?? 0) + '%' }} />
          </div>
          {post && <div className="text-meta text-jz-muted">当前：{STAGE_CN[post.split(':')[0]] || post}</div>}
        </div>
      ) : (
        <div className="text-meta text-jz-muted">当前：{STAGE_CN[last.split(':')[0]] || last}</div>
      )}
    </div>
  );
};

const PackerChip: React.FC<{ packer?: string | null }> = ({ packer }) => {
  if (!packer) return null;
  const name = PACKER_NAMES[packer] || packer;
  if (packer === 'none') return <span className="flex-none rounded-control px-1.5 py-0.5 text-meta font-mono bg-jz-surface-2 text-jz-muted" title="未检出加固防护">无壳</span>;
  return <span className="inline-flex flex-none items-center rounded-control px-1.5 py-0.5 text-meta font-mono font-medium bg-jz-sev-medium/10 text-jz-sev-medium" title={`防护指纹: ${packer}`}>
    {name}
  </span>;
};

// ── 诚实状态列解析(本轮新增)────────────────────────────────────────────
// 业务码类数: 仅从 /api/tasks 既有 unpack_outcome 解析(unpack 通道=defined_biz / audit 通道=biz_classes);
// 解析不到返回 null=只显状态不编数(诚实纪律)
const bizOf = (o: any): number | null => {
  if (!o) return null;
  const v = o.verdict != null ? o.defined_biz : o.biz_classes;
  return typeof v === 'number' && v >= 0 ? v : null;
};
// done 任务阻塞判定(本轮修正: 业务码误判 bug):
//   ①真实业务统计优先: 任务解析出业务码类数(哪怕 1 类/17 类)=后端真实统计,严禁被受阻判定覆盖——
//     一律正常完成并原样显示「业务码 X 类」;
//   ②「脱壳受阻」收紧: 仅当任务明确存在加固壳(packer 非空且非 none)且(业务码类数===0 或 progress 原文
//     明确「未脱出/脱壳不完整」或 code_recovered===0 结构化证据)才判受阻;
//   ③凡无壳(packer=none/缺失=未检出)或已解析出业务码类的完成任务,一律 🟢 完成+✓业务码 X 类。
//   实证: #785 业务码 17 类 / #786 业务码 1 类 均为无壳——正常完成+真实类数,不再琥珀受阻;
//   旧「业务码 ≤20 即受阻」规则废除(类数低≠未脱出,以真实统计为准;verdict 例外词仅作受阻时的标签措辞)
const honestDone = (t: any): { blocked: boolean; label: string; biz: number | null; positive: boolean; shell: boolean } => {
  const o = t.unpack_outcome || null;
  const biz = bizOf(o);
  const shell = !!t.packer && t.packer !== 'none';   // 明确存在加固壳(none/缺失=无壳/未检出)
  const prog = typeof t.progress === 'string' ? t.progress : '';
  const progNoBiz = /未脱出|脱壳不完整/.test(prog);   // runner 实证阻塞文案:「⚠ 脱壳不完整: 业务代码 X 未脱出」
  const positive = !!(o && (o.verdict === 'pass' || o.code_recovered === 1));
  let blocked = false;
  let label = '';
  if (biz != null && biz > 0) {
    blocked = false;   // ① 有真实业务码类数=权威正向,任何其他信号不得覆盖
  } else if (shell && (biz === 0 || progNoBiz || (o != null && o.code_recovered === 0))) {
    // ② 收紧后的受阻判定: 必须明确有壳 + 明确「未脱出业务码」证据(类数=0/文本/结构化)三者同存
    blocked = true;
    label = o && o.verdict && o.verdict !== 'pass'
      ? (o.verdict === 'small_app' ? '非能力项 small_app'
        : o.verdict === '32bit_only' ? '非能力项 32bit_only'
        : o.verdict === 'install_failed' ? '未装上 install_failed'
        : `未脱出(${o.verdict})`)
      : '未脱出业务码';
  }
  return { blocked, label, biz, positive, shell };
};
// done 任务 data-unpack-outcome 探针值(R120-2 原值域恒等: pass/small_app/32bit_only/install_failed/verdict 原词/recovered/no_biz_code)
const outcomeProbe = (o: any): string | null => {
  if (!o) return null;
  if (o.verdict) return o.verdict;
  if (o.strict_ok === true || o.code_recovered === 1) return 'recovered';
  return 'no_biz_code';
};

// 设备标签(会话卡): emulator-* 序列=模拟器,其余非空=真机,空=无设备(本地启发,真值来自既有 device 字段)
const devTagOf = (d?: string | null): { label: string; cls: string } =>
  !d ? { label: '无设备', cls: 'text-jz-muted bg-jz-surface-2' }
    : /^emulator/i.test(d) ? { label: '模拟器', cls: 'text-jz-brand bg-jz-brand/10' }
    : { label: '真机', cls: 'text-jz-teal bg-jz-teal/10' };

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
  const [menuFor, setMenuFor] = useState<number | null>(null);
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
  // 本轮修复③: 导出▾下拉自 DataToolbar 上移至页头操作区(自带外点关闭)
  const [expOpen, setExpOpen] = useState(false);
  const expRef = useRef<HTMLDivElement>(null);
  // 本轮修复②: 在线设备真值=usePentest.devices(TopBar 8s 单点轮询 /api/pentest/devices 写入的共享 store,
  // 仅 state='device' 的在线设备入池——零二次轮询,勿再直连端点)
  const liveDevices = usePentest((s) => s.devices);

 useEffect(() => { if (searchTimer.current) clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => setSearchDeb(search), 200); return () => clearTimeout(searchTimer.current); }, [search]);
 // 导出▾外点关闭(DataToolbar 同款交互,随钮上移页头)
 useEffect(() => {
   if (!expOpen) return;
   const onDown = (e: MouseEvent) => { if (expRef.current && !expRef.current.contains(e.target as Node)) setExpOpen(false); };
   document.addEventListener('mousedown', onDown);
   return () => document.removeEventListener('mousedown', onDown);
 }, [expOpen]);
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
 setTasks(rows || []);
 setSel((prev) => { // R103-9①: 勾选集随列表修剪(被删行不再滞留)
 const ids = new Set((rows || []).map((r: any) => r.id));
 const nx = new Set([...prev].filter((id) => ids.has(id)));
 return nx.size === prev.size ? prev : nx;
 });
 }).catch(() => setTasks([]));
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
 setBatchMsg(`批量重跑已发起 ${ok} 个${fail ? ` · 失败 ${fail} 个` : ''}`); setSel(new Set()); setTimeout(loadAll, 800);
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
 setBatchMsg(`批量清理已删除 ${ok} 个${skip ? ` · 跳过 ${skip} 个(运行中/排队后端拒绝删除)` : ''}`); setSel(new Set()); loadAll();
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
 setBatchMsg(`已清理失败任务 ${ok} 个${skip ? ` · 跳过 ${skip} 个(后端拒绝)` : ''}(范围=当前过滤视图)`); loadAll();
 } finally { setBatchBusy(false); }
 };
 // 导出所选(底部批量条): 与工具栏导出同字段(exportRows 真值;缺加载的计数留空不编造)
 const exportSelCsv = () => {
 exportDataFile('tasks_export', 'csv', exportRows(selTasks));
 setBatchMsg(`已导出所选 ${selTasks.length} 行 CSV`);
 };
 const exportSelJson = () => {
 exportDataFile('tasks_export', 'json', exportRows(selTasks));
 setBatchMsg(`已导出所选 ${selTasks.length} 行 JSON`);
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

  // ── 顶部态势舱①: 调度引擎与并发槽位(本轮修复②: 左卡补齐,与右卡同构对称)──
  // 旧 bug1: used=0 时显示「0% 空闲」语义颠倒(占用/负载/空闲三值各显各义);
  // 旧 bug2: 左卡仅一行横排,lg 宽屏下 ~85% 空白失衡——改为与右侧批卡同构:
  //   卡头标题栏(左「调度引擎与并发槽位」纯文字 + 右状态徽章「空闲 N 槽」)+
  //   四个等高数字指标(0/99 并发占用 · N 运行中 · N 排队中 · N 在线设备)+ 底部全宽进度条;双卡 p-5 对称。
  // 真值源: 并发占用/配额=/api/org → usage.running(running+queued COUNT)/usage.quota_concurrent(429 配额闸同源);
  // 运行中/排队中=/api/tasks 状态计数真值;在线设备=usePentest.devices 共享真值(见 liveDevices 注)
  const slotPod = slots ? (() => {
 const used = slots.running;
 const quota = slots.quota;
 const unlim = quota == null || quota < 0;
 const load = !unlim && quota > 0 ? Math.round((used / quota) * 100) : null;
 const free = unlim ? null : Math.max(0, quota - used);
 const full = !unlim && quota > 0 && used >= quota;
 const hot = full || (load != null && load >= 80);
 const warm = !hot && load != null && load >= 50;
 const runningN = runningTasks.length;
 const queuedN = (tasks || []).filter((t: any) => t.status === 'queued').length;
 const devN = liveDevices.length;
 const metrics: Array<{ v: string; label: string; title: string }> = [
   { v: `${used}/${unlim ? '∞' : quota}`, label: '并发占用', title: '统计口径: 当前正在执行或排队的审计任务数(running+queued 真值) / 组织套餐最大并发数(quota_concurrent)。达上限新建任务将被 429 拒绝(M4 配额闸)' },
   { v: String(runningN), label: '运行中', title: '统计口径: status=running 任务计数真值' },
   { v: String(queuedN), label: '排队中', title: '统计口径: status=queued 任务计数真值' },
   { v: String(devN), label: '在线设备', title: '在线设备数(adb device 态入池;数据=TopBar 8s 轮询 /api/pentest/devices 写入的共享真值)' },
 ];
    return (
      <div className="rounded-panel bg-jz-surface shadow-card p-5 h-full flex flex-col" data-slot-pod>
        <div className="flex items-center justify-between gap-2">
          <span className="text-body font-semibold text-jz-ink whitespace-nowrap">调度引擎与并发槽位</span>
          <span className="inline-flex items-center gap-1.5 flex-none">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className={` absolute inline-flex h-full w-full rounded-pill opacity-60 ${hot ? 'bg-jz-sev-critical' : warm ? 'bg-jz-amber' : 'bg-jz-teal'}`} />
              <span className={`relative inline-flex rounded-pill h-2 w-2 ${hot ? 'bg-jz-sev-critical' : warm ? 'bg-jz-amber' : 'bg-jz-teal'}`} />
            </span>
            <span data-slot-indicator
 title={`统计口径: 当前正在执行或排队的审计任务数(running+queued 真值) / 组织套餐最大并发数(quota_concurrent)。达上限新建任务将被 429 拒绝(M4 配额闸)`}
 className={`px-1.5 rounded-control font-mono text-meta tnum whitespace-nowrap ${hot ? 'bg-jz-sev-critical/10 text-jz-sev-critical' : warm ? 'bg-jz-amber/10 text-jz-amber' : 'bg-jz-teal/10 text-jz-teal'}`}>
              空闲 {unlim ? '不限' : `${free} 槽`}
            </span>
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 flex-1 items-stretch">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-card bg-jz-surface-2/40 px-3 py-2.5 flex flex-col justify-center min-w-0" title={m.title}>
              <div className="text-title font-semibold font-mono tnum text-jz-ink leading-none truncate">{m.v}</div>
              <div className="mt-1.5 text-meta text-jz-muted whitespace-nowrap">{m.label}</div>
            </div>
          ))}
        </div>
        {!unlim && quota > 0 && (
          <div className="mt-4 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-pill bg-jz-surface-2 overflow-hidden" aria-hidden>
              <span className="block h-full rounded-pill transition-all" style={{ width: `${Math.min(100, Math.round((used / quota) * 100))}%`, background: hot ? 'rgb(var(--jz-red))' : warm ? 'rgb(var(--jz-amber))' : 'rgb(var(--jz-teal))' }} />
            </div>
            <span className="text-meta font-mono tnum text-jz-muted whitespace-nowrap">负载 {load == null ? '—' : `${load}%`}</span>
          </div>
        )}
      </div>
    );
  })() : null;

  // ── 顶部态势舱②: 批量脱壳聚合仪表板(升级: 完成/失败/待执行/均值/DEX 高对比瓦片+双色分段进度条)──
  const batchPod = batchSum && batchSum.count > 0 ? (() => {
 const doneN = batchSum.done || 0;
 const failN = batchSum.failed || 0;
 const pendingN = Math.max(0, batchSum.count - doneN - failN);
 const donePct = batchSum.count ? Math.round((doneN / batchSum.count) * 100) : 0;
    return (
      <div className="rounded-panel bg-jz-surface shadow-card p-5 h-full" data-batch-summary data-batch-dashboard>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-meta font-semibold text-jz-ink">批量脱壳聚合</span>
          {/* R117-4④: 完成率计数器口径注(方案 4.4 槽位指标不存在,映射到本页并发槽位舱) */}
          <span title="统计口径: 批量脱壳任务群 done 数/总任务数(updated_at 落定即计 done, failed 单列不计入 done)"><Badge level="safe">完成率 {donePct}%</Badge></span>
          <span className="flex-1" />
          <button onClick={() => setBatchOpen(!batchOpen)} className="text-jz-muted hover:text-jz-ink text-meta">{batchOpen ? '收起' : '明细'}</button>
          <button onClick={loadBatch} className="text-jz-muted hover:text-jz-ink text-meta">刷新</button>
        </div>
        <div className="mt-2 flex items-stretch gap-3 flex-wrap">
          <div className="min-w-[64px]">
            <div className="text-title font-semibold font-mono tnum text-jz-teal leading-none">{doneN}<span className="text-meta text-jz-muted font-normal">/{batchSum.count}</span></div>
            <div className="mt-1 text-meta text-jz-muted">完成</div>
          </div>
          <div className="w-px bg-jz-border/60" aria-hidden />
          <div className="min-w-[64px]">
            <div className={`text-title font-semibold font-mono tnum leading-none ${failN > 0 ? 'text-jz-sev-critical' : 'text-jz-muted'}`}>{failN}</div>
            <div className="mt-1 text-meta text-jz-muted">失败</div>
          </div>
          <div className="w-px bg-jz-border/60" aria-hidden />
          <div className="min-w-[64px]">
            <div className="text-title font-semibold font-mono tnum text-jz-ink-2 leading-none">{pendingN}</div>
            <div className="mt-1 text-meta text-jz-muted">待执行</div>
          </div>
          <div className="w-px bg-jz-border/60" aria-hidden />
          <div className="min-w-[64px]">
            <div className="text-title font-semibold font-mono tnum text-jz-ink leading-none">{batchSum.avg_dur_s != null ? fmtDur(batchSum.avg_dur_s) : '—'}</div>
            <div className="mt-1 text-meta text-jz-muted" title={`done 任务耗时均值(updated_at−created_at, n 项)`}>均值</div>
          </div>
          <div className="w-px bg-jz-border/60" aria-hidden />
          <div className="min-w-[64px]">
            {/* R103-9④: 后端无体积字段(batch-unpack-summary 仅 dex_files_count 条数)——如实显条数并更正文案,不冒充体积 */}
            <div className="text-title font-semibold font-mono tnum text-jz-ink leading-none">{batchSum.dex_total}</div>
            <div className="mt-1 text-meta text-jz-muted" title="后端无体积字段,此处为 DEX 文件条数(非总体积);体积采集=挂账">DEX 个数</div>
          </div>
          <span className="flex-1" />
          <div className="flex flex-col justify-center gap-1 min-w-[200px]">
            {/* 双色分段进度条(规格): 翠绿=成功占比 + 玫红=失败占比,余段=待执行 */}
            <span className="inline-flex h-2 w-full rounded-pill bg-jz-surface-2 overflow-hidden" data-batch-bar-track title={`完成 ${doneN} · 失败 ${failN} · 待执行 ${pendingN}`}>
              {doneN > 0 && <span className="block h-full" style={{ width: `${(doneN / batchSum.count) * 100}%`, background: 'rgb(var(--jz-teal))' }} data-batch-bar-fill />}
              {failN > 0 && <span className="block h-full" style={{ width: `${(failN / batchSum.count) * 100}%`, background: 'rgb(var(--jz-red))' }} data-batch-bar-fail />}
            </span>
            <span className="text-meta font-mono tnum text-jz-muted">完成 {donePct}%{failN > 0 ? ` · 失败 ${Math.round((failN / batchSum.count) * 100)}%` : ''}</span>
          </div>
        </div>
        {batchOpen && (
          <table className="w-full mt-2 text-meta">
            <thead><tr className="text-meta font-semibold text-jz-ink-2 bg-jz-surface-2/40"><th className="text-left py-1">#</th><th className="text-left">APP</th><th className="text-left">状态</th><th className="text-left">壳</th><th className="text-left">方式</th><th className="text-left">DEX</th><th className="text-left" title="done=updated_at−created_at;运行中/失败无耗时">耗时</th></tr></thead>
            <tbody>
 {(batchSum.items || []).map((it: any) => (
                <tr key={it.task_id} className="hover:bg-jz-surface-2/30 rounded-control">
                  <td className="py-1 font-mono">{it.task_id}</td>
                  <td className="truncate max-w-[180px]">{it.app_name}</td>
                  <td>{it.status}</td>
                  <td>{it.packer ?? '—'}</td>
                  <td>{it.method ?? '—'}</td>
                  <td className="font-mono">{it.dex ?? '—'}</td>
                  <td className="font-mono tnum">{it.dur_s != null ? fmtDur(it.dur_s) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  })() : (
    <div className="rounded-panel bg-jz-surface shadow-card p-5 h-full text-meta text-jz-muted" data-batch-dashboard-empty>
      批量脱壳聚合 · 暂无批量任务群(口径: kind=unpack 且 params.batch 标记;有批量任务后此处呈现 完成/失败/均值/DEX 仪表板)
    </div>
  );

  return (
    <div className="p-4 space-y-3 h-full overflow-auto">
      {/* 页头(本轮修复③): 「任务中心」大标题 + 右侧常驻操作区 [清理失败项][导出▾][新建审计任务]——
          原三钮挤在检索工具栏行尾窄容器内折行悬空,上移至页头与标题两端对齐(全部 whitespace-nowrap shrink-0) */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-title font-semibold text-jz-ink whitespace-nowrap">任务中心</h2>
        <div className="flex items-center gap-2 flex-none" data-toolbar-actions>
          <button onClick={() => setCleanOpen(true)} disabled={batchBusy || failedInView.length === 0} data-clean-failed
 title="清理当前过滤视图内全部失败任务(所见即所删,先二次确认;运行中/排队不受影响)"
 className="inline-flex items-center gap-1 h-8 px-2.5 rounded-control bg-jz-sev-critical/10 text-meta text-jz-sev-critical hover:bg-jz-sev-critical/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0">
            清理失败项({failedInView.length})
          </button>
          <div className="relative shrink-0" ref={expRef} data-toolbar-export>
            <button onClick={() => setExpOpen((v) => !v)} data-toolbar-export-toggle
 className="inline-flex items-center gap-1 h-8 px-2.5 rounded-control bg-jz-surface-2/60 text-meta text-jz-ink-2 hover:text-jz-brand transition-colors whitespace-nowrap">
              <Download size={12} /> 导出 ▾
            </button>
            {expOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-card bg-jz-surface border border-jz-border shadow-card py-1" data-toolbar-export-panel>
                {([{ id: 'csv', label: '导出任务列表 CSV' }, { id: 'json', label: '导出任务列表 JSON' }]).map((it) => (
                  <button key={it.id} onClick={() => { const rows = exportRows(filtered); exportDataFile('tasks_export', it.id as 'csv' | 'json', rows); setBatchMsg(`已导出当前过滤视图 ${rows.length} 行 ${it.id.toUpperCase()}`); setExpOpen(false); }}
 data-toolbar-export-item={it.id}
 className="w-full text-left px-2.5 py-1.5 text-meta text-jz-ink-2 hover:bg-jz-surface-2/60 whitespace-nowrap">
                    {it.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => nav('/new-audit')} data-toolbar-create
 className="inline-flex items-center gap-1 h-8 px-2.5 rounded-control bg-jz-brand/15 text-meta text-jz-brand font-semibold hover:bg-jz-brand/25 transition-colors whitespace-nowrap shrink-0">
            <Plus size={12} /> 新建审计任务
          </button>
        </div>
      </div>

      {/* ── 顶部双态势舱(本轮修复②): lg 12 列网格 左卡 col-span-5 / 右卡 col-span-7(旧 md 两等列致左卡 85% 空白
          失衡),双卡 p-5 等高对称: ①调度引擎与并发槽位 ②批量脱壳聚合仪表板 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch" data-situation-pods>
        <div className="lg:col-span-5 min-w-0">{slotPod}</div>
        <div className="lg:col-span-7 min-w-0">{batchPod}</div>
      </div>

 {/* R597(六模块优化-任务中心 P2): 运行中任务泳道——running 任务置顶卡片,与历史表格分离;
 耗时=created_at→now 实时时钟(10s 粒度既有真值),进度=后端 progress 文本真值(无结构化子阶段=如实不画子步骤) */}
 {runningTasks.length > 0 && (
        <div className="space-y-1.5" data-running-lanes>
          <div className="flex items-center gap-2">
            <span className="text-meta font-semibold text-jz-ink">运行中任务</span>
            <StatusBadge tone="info" title="统计口径: status=running 任务计数真值;耗时=created_at→now 实时时钟;进度=后端 progress 文本真值,无结构化子阶段=如实不画子步骤">{runningTasks.length} 个</StatusBadge>
          </div>
          <div className="flex gap-2 overflow-x-auto scroll-smooth pb-1">
 {runningTasks.map((t: any) => {
              const hit = sessMap[t.id];
              return (
                <div key={t.id} data-running-lane={t.id}
 className="flex-none w-72 rounded-panel bg-jz-surface shadow-card px-3 py-2 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-pill bg-jz-brand animate-pulse flex-none" />
                    <span className="font-mono text-meta text-jz-muted tnum flex-none">{t.id}</span>
                    <span className="text-meta font-semibold text-jz-ink truncate flex-1" title={t.app_name || t.package || ''}>{t.app_name || t.package || '—'}</span>
                    <span className="flex-none font-mono text-meta text-jz-ink-2 tnum" title="created_at→now 实时耗时">{fmtDur(now - t.created_at)}</span>
                  </div>
                  <div className="text-meta text-jz-muted truncate" title={t.progress || '后端暂无进度文本'}>
                    {t.progress ? t.progress : '执行中(后端未上报进度文本)'}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-control text-meta font-mono font-semibold ${KIND_CLS[t.kind || 'audit'] || 'text-jz-muted bg-jz-surface-2'}`}>{t.kind || 'audit'}</span>
                    {t.packer && <PackerChip packer={t.packer} />}
                    <span className="flex-1" />
                    {hit && (
                      <button onClick={() => { window.location.hash = `/pentest/project/${hit.pid}/session/${hit.sid}`; }}
 data-lane-goto={t.id} title={`进入渗透会话 #${hit.sid}`}
 className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-control text-meta text-jz-brand hover:bg-jz-brand/10">
                        <ExternalLink size={11} /> 工作台
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
 )}
 {/* 中部活跃会话卡(本轮修复①): 上下两层结构——顶部横条=左「近期关联渗透会话 (N)」水平标题+
     右 [◀][▶] 翻页与 [收起▲/展开▼];底部=展开时卡片区(grid 响应式 1/2/5 列水平排列,
     横滚容器 80% 步进翻页,到头如实禁用)。旧左侧 9px 竖排文字条(writing-mode:vertical-rl)被挤成
     一字一行=彻底移除;每卡 #会话ID/应用名/设备标签(真机/模拟器,device 序列本地启发),
     点击跳对应会话(R76-2 无项目禁跳) */}
 {activeSids.length>0 && (
        <div className="rounded-panel bg-jz-surface shadow-card flex flex-col overflow-hidden" data-session-rail>
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-jz-border/60">
            <span className="whitespace-nowrap font-semibold text-body text-jz-ink">近期关联渗透会话 ({activeSids.length})</span>
            <div className="flex items-center gap-1.5 flex-none">
              <button onClick={()=>scrollRail(-1)} disabled={!railNav.prev} data-sess-prev title="向左翻页"
 className="w-7 h-7 grid place-items-center rounded-control border border-jz-border/60 bg-jz-surface text-jz-ink-2 hover:bg-jz-surface-2/40 hover:text-jz-ink disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft size={14} />
              </button>
              <button onClick={()=>scrollRail(1)} disabled={!railNav.next} data-sess-next title="向右翻页"
 className="w-7 h-7 grid place-items-center rounded-control border border-jz-border/60 bg-jz-surface text-jz-ink-2 hover:bg-jz-surface-2/40 hover:text-jz-ink disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronRight size={14} />
              </button>
              <button onClick={()=>setSessRailOpen(v=>!v)} data-sess-rail-collapse title={sessRailOpen?'收起会话栏':'展开会话栏'}
 className="h-7 px-2 rounded-control border border-jz-border/60 text-meta text-jz-ink-2 hover:bg-jz-surface-2/40 hover:text-jz-ink transition-colors whitespace-nowrap">
                {sessRailOpen?'收起 ▲':'展开 ▼'}
              </button>
            </div>
          </div>
          {sessRailOpen && (
            <div ref={railRef} onScroll={updateRailNav} className="overflow-x-auto scroll-smooth">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-3.5">
 {/* 数据=既有会话列表真值(后端 /api/pentest/sessions 联表回填 app_name;缺失回落 package 真值) */}
 {activeSids.map((s:any)=>{
                  const canGo = s.project_id!=null;
                  const dev = devTagOf(s.device);
                  return (
                    <div key={s.id} data-running-session={s.id} data-sess-card={canGo?'go':'blocked'}
 role="button" tabIndex={canGo?0:-1} aria-disabled={!canGo}
 onClick={()=>{ if(canGo) window.location.hash=`/pentest/project/${s.project_id}/session/${s.id}`; }}
 onKeyDown={(e)=>{ if(canGo&&(e.key==='Enter'||e.key===' ')){ e.preventDefault(); window.location.hash=`/pentest/project/${s.project_id}/session/${s.id}`; } }}
 title={canGo?`点击进入渗透会话 #${s.id}`:'无关联项目(R76-2 禁跳)'}
 className={`min-w-0 rounded-card bg-jz-surface-2/40 border border-jz-border/40 px-3 h-16 flex items-center gap-2 outline-none transition-all
 ${canGo?'cursor-pointer hover:bg-jz-surface-2/60':'opacity-50 cursor-not-allowed'}`}>
                      <span data-sess-pulse className="h-1.5 w-1.5 rounded-pill bg-jz-teal animate-pulse flex-none" title="活动会话" />
                      <span className="flex-1 min-w-0 leading-tight">
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono text-meta text-jz-ink tnum">#{s.id}</span>
                          <span className={`flex-none px-1 rounded-control text-meta ${dev.cls}`}>{dev.label}</span>
                        </span>
                        <span className="block text-meta text-jz-ink-2 truncate mt-0.5" title={s.app_name||s.package||''}>{s.app_name||s.package||'—'}</span>
                        <span className="block font-mono text-meta text-jz-muted truncate" title={s.device||''}>{s.device||'无设备'}</span>
                      </span>
                      <button onClick={(e)=>{ e.stopPropagation(); if(canGo) window.location.hash=`/pentest/project/${s.project_id}/session/${s.id}`; }}
 disabled={!canGo} data-sess-go
 title={canGo?`进入渗透会话 #${s.id}`:'无关联项目(R76-2 禁跳)'}
 className={`flex-none text-meta px-1.5 py-0.5 rounded-control transition-colors whitespace-nowrap ${canGo?'text-jz-brand hover:bg-jz-brand/10':'text-jz-muted cursor-not-allowed'}`}>
                        进入
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {/* 检索筛选卡(本轮修复③): 严格两行——
          第 1 行=宽搜索框(flex-1 min-w-[280px],应用名/包名/#ID/操作员/失败原因)+ 右侧「全部壳态」「全部操作员」下拉 +
          独立 Checkbox 开关「隐藏 0s 冒烟失败(svc_smoke · N)」(开关样式,不与状态胶囊混排);
          第 2 行=纯状态单选胶囊 [全部][完成][运行中][失败][排队][脱壳受阻](计数真值,全部 whitespace-nowrap)。
          [清理失败项][导出▾][新建审计任务] 已上移页头右端(见页头)。
          (data-toolbar/data-task-search/data-toolbar-search/data-toolbar-filter/data-toolbar-dot/
           data-filter-chip-row/data-filter-chip/data-smoke-toggle/data-packer-filter/data-operator-filter
           存量探针原样保留,存量资产闸只增不删) */}
      <div className="rounded-panel bg-jz-surface shadow-card p-3 space-y-2" data-toolbar="tasks">
        <div className="flex items-center gap-2 flex-wrap min-h-10" data-toolbar-main>
          <div className="relative flex-1 min-w-[280px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-jz-muted pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索 APP 名 / 包名 / #ID / 操作员 / 失败原因…"
 data-task-search="" data-toolbar-search
 className="h-10 w-full pl-8 pr-3 rounded-card bg-jz-surface-2/60 text-body text-jz-ink placeholder:text-jz-muted outline-none focus:ring-2 focus:ring-jz-brand/30" />
          </div>
          {/* 加固壳筛选(选项=已加载任务真实 packer 值派生;库外值原样显) */}
          <select value={packerF} onChange={(e) => setPackerF(e.target.value)} data-packer-filter title="按加固壳指纹筛选(选项来自当前列表真实 packer 值)"
 className="h-8 px-2 rounded-control bg-jz-surface-2/60 text-meta text-jz-ink-2 outline-none focus:ring-2 focus:ring-jz-brand/30 cursor-pointer whitespace-nowrap shrink-0">
            <option value="all">全部壳态</option>
            {packerOptions.length > 0 && <option value="__packed">有壳(任意)</option>}
            {allTasks.some((t: any) => t.packer === 'none') && <option value="none">无壳</option>}
            {packerOptions.map(([v, n]) => <option key={v} value={v}>{PACKER_NAMES[v] || v}({n})</option>)}
          </select>
          {/* 操作员筛选(名字=/api/tasks/counts users 映射;未加载到名字的先显 #uid,不编名) */}
          <select value={operatorF} onChange={(e) => setOperatorF(e.target.value)} data-operator-filter title="按操作员筛选(名字来自任务计数端点 id→username 只读映射)"
 className="h-8 px-2 rounded-control bg-jz-surface-2/60 text-meta text-jz-ink-2 outline-none focus:ring-2 focus:ring-jz-brand/30 cursor-pointer whitespace-nowrap shrink-0">
            <option value="">全部操作员</option>
            {operatorOptions.map(([uid, n]) => <option key={uid} value={uid}>{usersMap[uid] ? `${usersMap[uid]}(#${uid})` : `#${uid}`}·{n}</option>)}
          </select>
          {/* 0s 冒烟失败隐藏开关(独立 Checkbox 开关): 后端无 svc_smoke 专用标记——诚实降级为本地耗时判据(failed 且耗时<2s) */}
          <label data-smoke-toggle data-active={hideSmokeFail ? '1' : ''}
 title={`口径: status=failed 且耗时<${SMOKE_FAIL_S}s(0s 冒烟失败特征,实测 0.02s~0.84s 即时失败族)。后端无 svc_smoke 专用标记=本地耗时判据,诚实降级`}
 className="inline-flex items-center gap-2 h-8 pl-2.5 pr-2.5 rounded-pill border border-jz-border/60 cursor-pointer select-none whitespace-nowrap shrink-0 hover:bg-jz-surface-2/40 transition-colors">
            <span className={`relative inline-flex h-4 w-7 flex-none rounded-pill transition-colors ${hideSmokeFail ? 'bg-jz-amber' : 'bg-jz-border'}`}>
              <input type="checkbox" checked={hideSmokeFail} onChange={() => setHideSmokeFail((v) => !v)} className="sr-only" />
              <span className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-pill bg-jz-surface shadow-card transition-transform ${hideSmokeFail ? 'translate-x-3' : ''}`} />
            </span>
            <span className={`text-meta whitespace-nowrap ${hideSmokeFail ? 'text-jz-amber font-semibold' : 'text-jz-muted'}`}>
              隐藏 0s 冒烟失败 (svc_smoke · <span className="font-mono tnum">{smokeFailCount}</span>)
            </span>
          </label>
        </div>
        {/* 第 2 行: 纯状态单选胶囊(计数=当前已加载列表真值;degraded=脱壳受阻,honestDone 收紧判定) */}
        <div className="flex items-center gap-1.5 flex-wrap" data-toolbar-filters {...(hasFilterChip ? { 'data-filter-chip-row': statusParam ? `status=${statusParam}` : `status=${filter}` } : {})}>
          {([
            { key: '', label: '全部', count: focusTasks.length, title: '统计口径: 已加载任务总数', dot: false },
            { key: 'done', label: '完成', count: focusTasks.filter((t: any) => t.status === 'done').length, title: undefined, dot: false },
            { key: 'running', label: '运行中', count: focusTasks.filter((t: any) => t.status === 'running').length, title: '统计口径: status=running 任务计数真值', dot: hasRunning },
            { key: 'failed', label: '失败', count: focusTasks.filter((t: any) => t.status === 'failed').length, title: undefined, dot: false },
            { key: 'queued', label: '排队', count: focusTasks.filter((t: any) => t.status === 'queued').length, title: undefined, dot: false },
            { key: 'degraded', label: '脱壳受阻', count: degradedCount, title: '伪状态筛: 明确有壳且(业务码=0 或文本明确未脱出)的受阻完成任务(honestDone 收紧判定)', dot: false },
          ] as Array<{ key: string; label: string; count: number; title?: string; dot?: boolean }>).map((f) => {
            const on = filter === f.key;
            return (
              <button key={f.key || 'all'} onClick={() => { setFilter(f.key); if (!f.key) setSearchParams({}); }} title={f.title}
 data-toolbar-filter={f.key} data-active={on ? '1' : ''}
 className={`flex items-center gap-1.5 h-8 px-3 rounded-pill text-meta font-medium transition-colors whitespace-nowrap
 ${on ? 'bg-jz-brand/10 text-jz-brand font-semibold' : 'text-jz-muted hover:text-jz-ink hover:bg-jz-surface-2/50'}`}>
                {f.dot && <span className="inline-block h-1.5 w-1.5 rounded-pill bg-jz-brand animate-pulse" data-toolbar-dot />}
                {f.label}
                <span className={`px-1.5 rounded-pill font-mono tnum text-meta ${on ? 'bg-jz-brand/15 text-jz-brand' : 'bg-jz-surface-2 text-jz-muted'}`}>{f.count}</span>
              </button>
            );
          })}
          {hasFilterChip && (
            <span data-filter-chip className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-jz-brand/15 text-jz-brand text-meta font-mono">
              {statusParam ? `status=${statusParam}` : `status=${filter}`}<button onClick={()=>{setFilter('');setSearchParams({});}} className="ml-0.5 hover:text-jz-ink">✕</button>
            </span>
          )}
        </div>
      </div>
      <div className="rounded-panel bg-jz-surface shadow-card overflow-hidden flex flex-col">
        {/* R108-2①②: 首载(tasks===null)呈表格骨架;加载完成且过滤后为空呈统一空态(文案沿既有逐字) */}
        {tasks === null && (<div className="p-4"><SkeletonLoader variant="table" rows={6} /></div>)}
        {tasks !== null && !filtered.length && (
          <EmptyStatePlaceholder icon={ClipboardList} title="暂无任务" subtitle="从「新建审计」开始第一个扫描" />
        )}
        {/* 核心表格(规格): 应用名 text-body font-semibold/包名 #ID mono/行 py-3.5/诚实状态列/耗时+时间双行/
            漏洞四色胶囊+微缩比例条/显性文字操作列 */}
        <table className="w-full text-body">
          <thead><tr className="text-meta font-semibold text-jz-ink-2 bg-jz-surface-2/40">
            <th className="px-3 py-1.5 text-left w-8"><input type="checkbox" checked={allPageSel} onChange={toggleAllPage} data-sel-all title="全选/取消本页" className="align-middle accent-[rgb(var(--jz-brand))] cursor-pointer" /></th>
            <th className="px-3 py-1.5 text-left">#</th><th className="px-3 py-1.5 text-left">类型</th><th className="px-3 py-1.5 text-left">目标应用</th>
            <th className="px-3 py-1.5 text-left">状态</th><th className="px-3 py-1.5 text-left">耗时 / 时间</th><th className="px-3 py-1.5 text-left">
              <span className="inline-flex items-center gap-1" title="漏洞计数=审计+渗透两域真算(审计域=security_report.json findings 全量;渗透域=findings.db active=pending+confirmed);C/H/M/L=Critical/High/Medium/Low">
                漏洞态势 <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-pill bg-jz-surface-2 text-jz-muted text-meta font-mono cursor-help hover:bg-jz-border hover:text-jz-ink-2 transition-colors">?</span>
              </span>
            </th>
            <th className="px-3 py-1.5 text-left">操作员</th><th className="px-3 py-1.5 text-right">操作</th>
          </tr></thead>
          <tbody>
 {(pageRows||[]).map((t:any,i:number)=>{
 const dur = (t.status==='done'||t.status==='failed') ? (t.updated_at||t.created_at)-t.created_at : now-t.created_at;
 const c = counts[String(t.id)];
 const kind = t.kind||t.type||'audit';
 const canAsk = t.kind==='audit'&&t.status==='done'&&!!t.result_id;
 const artifactsReady = (t.kind==='unpack'||t.kind==='audit')&&t.status==='done';
 const h = honestDone(t);
 const slow = dur > SLOW_S;
 // 行点击: 有渗透会话→工作台;无会话且产物可用→产物/报告弹窗;两者皆无=不动作(诚实)
 const openRow = () => {
                const hit = sessMap[t.id];
                if (hit) { window.location.hash = `/pentest/project/${hit.pid}/session/${hit.sid}`; return; }
                if (artifactsReady) setArtTask(t.id);
              };
              const probeVal = outcomeProbe(t.unpack_outcome);
              return (
              <tr key={t.id||i} data-task-row={t.id}
 onClick={openRow}
 title={sessMap[t.id] ? `点击进入渗透会话 #${sessMap[t.id].sid} 工作台` : artifactsReady ? '点击浏览产物/报告' : undefined}
 className={`cursor-pointer ${(focusParam&&String(t.id)===focusParam?'ring-1 ring-jz-brand/60 bg-jz-brand/10 ':(i%2?'bg-jz-canvas/40 ':''))+'hover:bg-jz-surface-2/30'}`}>
                <td className="px-3 py-3.5" onClick={(e)=>e.stopPropagation()}><input type="checkbox" checked={sel.has(t.id)} onChange={()=>toggleRow(t.id)} data-sel-row={t.id} className="align-middle accent-[rgb(var(--jz-brand))] cursor-pointer" /></td>
                <td className="px-3 py-3.5 font-mono text-jz-muted tnum">{t.id}</td>
                <td className="px-3 py-3.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-control text-meta font-mono font-semibold ${KIND_CLS[kind]||'text-jz-muted bg-jz-surface-2'}`}>{kind}</span>
                </td>
                <td className="px-3 py-3.5 max-w-[240px]">
                  {/* 排版层级(规格): 主标=产品名 text-body font-semibold;副标=包名 mono 11px+防护徽章;缺包名=占位符保 Baseline 统一 */}
                  <div className="flex flex-col justify-center min-h-[36px] py-0.5 min-w-0">
                    <div className="flex items-center">
                      <span className="text-body font-semibold text-jz-ink truncate leading-snug" title={t.app_name||t.package||''}>{t.app_name||t.package||'—'}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 min-w-0">
                      <span className="font-mono text-meta font-normal text-jz-muted truncate max-w-[200px]" title={t.package||'后端未返回包名'}>{t.package||'包名待解析'}</span>
                      {t.packer ? <PackerChip packer={t.packer} /> : t.status==='running' ? (
                        <span className="flex-none rounded-control px-1.5 py-0.5 text-meta font-mono bg-jz-surface-2 text-jz-muted" title="壳识别中；完成后写入真实壳型">识别中</span>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  {t.status==='failed' ? (
                    /* 失败态(规格): 红「失败」+完整失败原因(换行不截断;悬停显全文;后端无 error_msg=如实标注) */
                    <div className="flex flex-col gap-1 max-w-[280px]" data-honest-status="failed">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-control text-meta font-medium bg-jz-sev-critical/10 text-jz-sev-critical border border-jz-sev-critical/25 self-start flex-shrink-0">
                        <span className="w-1.5 h-1.5 rounded-pill bg-jz-sev-critical animate-pulse" />
                        失败
                      </span>
                      <span className="text-meta font-mono text-jz-sev-critical bg-jz-sev-critical/5 border border-jz-sev-critical/15 px-2 py-0.5 rounded-control break-all cursor-help"
 title={t.error_msg || '后端未返回失败原因(Progress 列为空)'}>
                        {t.error_msg || t.progress || '后端未返回失败原因'}
                      </span>
                    </div>
                  ) : t.status==='done' ? (
                    /* 诚实状态列(本轮修复④): ①业务码类数=后端真实统计,哪怕 1 类/17 类一律原样显示,
                       严禁被受阻判定覆盖;②「脱壳受阻」收紧=明确有壳 且(业务码=0 或文本明确未脱出);
                       ③凡无壳或已解析出业务码类=🟢 完成+✓业务码 X 类(实证 #785 17类/#786 1类 均无壳正常完成) */
                    h.blocked ? (
                      <div className="flex flex-col gap-1 max-w-[280px]" data-honest-status="degraded">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-control text-meta font-medium bg-jz-amber/10 text-jz-amber border border-jz-amber/25 self-start flex-shrink-0 whitespace-nowrap" title="管线跑完≠业务码脱出——明确有壳且未脱出业务码,风险结论仅覆盖部分层,严禁当纯绿完整完成消费">
                          <span className="w-1.5 h-1.5 rounded-pill bg-jz-amber" />
                          完成(脱壳受阻)
                        </span>
                        <span data-unpack-outcome={probeVal || undefined} className="text-meta font-mono text-jz-amber bg-jz-amber/5 border border-jz-amber/15 px-2 py-0.5 rounded-control break-all cursor-help self-start"
 title={t.unpack_outcome?.diagnosis?.reason || t.progress || '阻塞判定来自 unpack_outcome 结果摘要'}>
                          {h.label}
                        </span>
                        {(() => {
                          const d = t.unpack_outcome?.diagnosis || {};
                          const checks = d.checks || {};
                          const labelMap: Record<string, string> = {
                            zygisk_off: 'Zygisk关闭', debuggable: 'debuggable', permissive: 'SELinux', libzzp: 'libzzp',
                          };
                          const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => labelMap[k] || k);
                          const checkTxt = failed.length ? '未满足: ' + failed.join('、') : '';
                          const reason = d.reason || t.progress || '';
                          const channel = t.unpack_outcome?.unpack_method || '';
                          const engine = t.unpack_outcome?.engine_commit || '';
                          return (
                            <span data-unpack-reason className="text-meta font-mono text-jz-muted break-words max-w-[280px]" title={reason}>
                              {channel && <span className="text-jz-ink-2">通道 {channel}</span>}
                              {channel && (checkTxt || reason) ? ' · ' : ''}
                              {checkTxt && <span className="text-jz-amber">{checkTxt}</span>}
                              {checkTxt && reason ? ' · ' : ''}
                              {reason ? reason.slice(0, 140) : '未返回具体失败原因'}
                              {engine && <span className="text-jz-muted"> · engine {engine}</span>}
                            </span>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5" data-honest-status="complete" data-unpack-outcome={probeVal || undefined}>
                        <span className="inline-flex items-center gap-1.5 text-body font-medium text-jz-teal whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-pill flex-none bg-jz-teal" />
                          完成 <span title={h.biz != null ? '后端真实业务码统计(严禁受阻覆盖)' : '脱壳判定无阻塞'}>✓</span>
                          {h.biz != null && <span className="text-meta font-mono tnum">业务码 {h.biz} 类</span>}
                        </span>
                        {h.biz == null && (
                          <span className="text-meta text-jz-muted font-mono whitespace-nowrap">
                            {h.shell ? (h.positive ? '业务码类数未上报' : '无脱壳判定数据(不编数)') : '无壳应用(无脱壳环节)'}
                          </span>
                        )}
                      </div>
                    )
                  ) : (
                  <span className="inline-flex items-center gap-1.5 font-medium" style={{color:ST_COL[t.status]||'rgb(var(--jz-muted))'}}>
                    <span className="w-1.5 h-1.5 rounded-pill flex-none" style={{ background: ST_COL[t.status] || 'rgb(var(--jz-muted))' }} />
                    {ST_CN[t.status]||t.status}
                  </span>
                  )}
                  {t.status==='running' && t.progress && <TaskLiveProgress progress={t.progress} />}
                </td>
                <td className="px-3 py-3.5 font-mono tnum text-jz-ink-2 whitespace-nowrap" data-dur
 title={`精确耗时: ${Math.round(dur)}s(${t.status === 'running' ? 'created_at→now 实时' : 'created_at→updated_at'} 端点真值)`}>
                  <div className="flex flex-col leading-tight">
                    <span>
                      {t.status==='running'&&<span className="inline-block h-1.5 w-1.5 rounded-pill bg-jz-brand animate-pulse mr-1 align-middle" />}{fmtDur(dur)}
                      {slow && <span className="ml-1.5 px-1 rounded-control text-meta font-medium bg-jz-amber/10 text-jz-amber align-middle" title={`耗时 ${Math.round(dur)}s 超 15m 慢任务标线`}>慢</span>}
                    </span>
                    {/* 时间副行(规格): 创建/更新时间格式化——两字段后端 tasks 表实存(NOT NULL),优雅回退 '—' */}
                    <span className="text-meta text-jz-muted font-mono" title={`创建 ${t.created_at ? new Date(t.created_at*1000).toLocaleString('zh-CN', { hour12: false }) : '—'} · 更新 ${t.updated_at ? new Date(t.updated_at*1000).toLocaleString('zh-CN', { hour12: false }) : '—'}`}>
                      {fmtTime(t.created_at)} → {fmtTime(t.updated_at)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3.5" data-vuln-counts>
                  {!c ? <span className="text-jz-muted">…</span>
 : c.total>0 ? (
                    <span className="inline-flex flex-col gap-1">
                      <span className="inline-flex items-center gap-1 font-mono text-meta" title={`审计域+渗透域(${(c.sources||[]).join('+')||'无'}); active=pending+confirmed`
                        + (c.contract ? `\n引擎口径: 原始命中 ${c.contract.raw ?? '—'} → 去重 ${c.contract.kept ?? '—'} → 确认 ${c.contract.confirmed ?? '—'} · 候选 ${c.contract.candidate ?? '—'} · 压制 ${c.contract.suppressed ?? '—'} · 主报告 ${c.contract.report_total ?? '—'}(LLM 实审 ${c.contract.reviewed ?? '—'})` : '')}>
                        <span className={`px-1.5 py-0.5 rounded-control border ${c.critical > 0 ? 'bg-jz-sev-critical/10 text-jz-sev-critical border-jz-sev-critical/25 font-semibold' : 'bg-jz-surface-2/60 text-jz-muted border-transparent'}`} title="致命 Critical">C:{c.critical}</span>
                        <span className={`px-1.5 py-0.5 rounded-control border ${c.high > 0 ? 'bg-jz-sev-high/10 text-jz-sev-high border-jz-sev-high/25 font-semibold' : 'bg-jz-surface-2/60 text-jz-muted border-transparent'}`} title="高危 High">H:{c.high}</span>
                        <span className={`px-1.5 py-0.5 rounded-control border ${c.medium > 0 ? 'bg-jz-sev-medium/10 text-jz-sev-medium border-jz-sev-medium/25' : 'bg-jz-surface-2/60 text-jz-muted border-transparent'}`} title="中危 Medium">M:{c.medium}</span>
                        <span className={`px-1.5 py-0.5 rounded-control border ${c.low > 0 ? 'bg-jz-brand/10 text-jz-brand border-jz-brand/25' : 'bg-jz-surface-2/60 text-jz-muted border-transparent'}`} title="低危 Low">L:{c.low}</span>
                      </span>
                      {/* 4 色微缩比例条(规格): C/H/M/L 占比,h-1 等宽分段(色值=vuln token 同源 hex) */}
                      <span className="inline-flex h-1 w-28 rounded-pill bg-jz-surface-2 overflow-hidden" data-vuln-bar
 title={`占比: C ${c.critical} · H ${c.high} · M ${c.medium} · L ${c.low}(共 ${c.total})`}>
                        {c.critical > 0 && <span className="block h-full" style={{ width: `${(c.critical / c.total) * 100}%`, background: '#EF4444' }} />}
                        {c.high > 0 && <span className="block h-full" style={{ width: `${(c.high / c.total) * 100}%`, background: '#F97316' }} />}
                        {c.medium > 0 && <span className="block h-full" style={{ width: `${(c.medium / c.total) * 100}%`, background: '#F59E0B' }} />}
                        {c.low > 0 && <span className="block h-full" style={{ width: `${(c.low / c.total) * 100}%`, background: '#06B6D4' }} />}
                      </span>
                    </span>
                  ) : <span className="inline-flex px-2 py-0.5 rounded-control bg-jz-surface-2/60 text-jz-muted font-mono text-meta" title="脱壳任务不执行漏洞检测(两域均无记录)">未涉及审计</span>}
                </td>
                <td className="px-3 py-3.5 font-mono text-body text-jz-ink-2 truncate max-w-[90px]" data-operator title={t.user_id!=null?`uid=${t.user_id}`:''}>{usersMap[String(t.user_id)]||(t.user_id!=null?`#${t.user_id}`:'—')}</td>
                <td className="px-3 py-3.5 whitespace-nowrap text-right relative" onClick={(e)=>e.stopPropagation()}>
                  {/* 操作列显性化+样式统一(本轮修复⑤): 全部按钮同高同圆角胶囊(ACT_BTN: px-2.5 py-1 text-meta
                      rounded-control border,whitespace-nowrap);接力禁用态保留 disabled 视觉但同尺寸;
                      完成=[工作台/接力][报告][产物][⋯] 失败=[重试][详情][删除];会话跳转/接力占位探针原样保留 */}
                  <span className="inline-flex items-center gap-1">
                    {sessMap[t.id]&&(
                      <button onClick={()=>window.location.hash=`/pentest/project/${sessMap[t.id].pid}/session/${sessMap[t.id].sid}`} data-goto-session
 className={`${ACT_BTN} text-jz-brand bg-jz-brand/10 border-jz-brand/25 hover:bg-jz-brand/20`} title="查看渗透会话">工作台</button>
                    )}
                    {t.status==='done'&&!sessMap[t.id]&&(
                      <button disabled title="无关联项目(R76-2 禁跳)" onClick={()=>relay(t)} data-relay-btn className={`${ACT_BTN} text-jz-muted bg-jz-surface-2/40 border-jz-border/40 cursor-not-allowed`}>接力</button>
                    )}
                    {t.status==='done'&&canAsk&&(
                      <button onClick={()=>nav(`/reports?taskId=${t.id}`)} data-act-report title="打开报告中心(该任务审计报告)"
 className={`${ACT_BTN} text-jz-brand bg-jz-brand/10 border-jz-brand/25 hover:bg-jz-brand/20`}>报告</button>
                    )}
                    {artifactsReady&&(
                      <button onClick={()=>setArtTask(t.id)} data-artifacts-btn title="产物浏览"
 className={`${ACT_BTN} text-jz-brand bg-jz-brand/10 border-jz-brand/25 hover:bg-jz-brand/20`}>产物</button>
                    )}
                    {t.status==='failed'&&(
                      <button onClick={()=>setRerunTask(t)} data-act-retry title="重跑任务（可重选设备/模式/深度）"
 className={`${ACT_BTN} text-jz-ink-2 bg-jz-surface-2/60 border-jz-border/50 hover:text-jz-brand`}>重试</button>
                    )}
                    {(t.status==='failed'||t.status==='running'||t.status==='queued')&&(
                      <button onClick={()=>setDetailTask(t)} data-act-detail title="任务详情(后端原始字段,失败原因全文)"
 className={`${ACT_BTN} text-jz-ink-2 bg-jz-surface-2/60 border-jz-border/50 hover:text-jz-ink`}>详情</button>
                    )}
                    {t.status==='failed'&&(
                      <button onClick={()=>{ if(window.confirm(`确认删除任务 #${t.id}?`))removeTask(t); }} data-act-del title="删除该任务(不可恢复)"
 className={`${ACT_BTN} text-jz-sev-critical bg-jz-sev-critical/10 border-jz-sev-critical/25 hover:bg-jz-sev-critical/20`}>删除</button>
                    )}
                    <button onClick={()=>setMenuFor(menuFor===t.id?null:t.id)} data-more-btn className="inline-flex items-center justify-center whitespace-nowrap p-1 rounded-control text-jz-muted hover:text-jz-ink hover:bg-jz-surface-2/40" title="更多操作"><MoreHorizontal size={14} /></button>
                  </span>
                  {menuFor===t.id&&(
                    <>
                      <div className="fixed inset-0 z-40" onClick={()=>setMenuFor(null)} />
                      <div className="absolute right-2 top-7 z-50 w-32 rounded-card bg-jz-surface shadow-card py-1 text-left" data-more-menu>
                        {canAsk&&(
                          <button onClick={()=>{setMenuFor(null);window.location.hash=`/agent?task=${t.id}`;}} data-ask-btn className="w-full px-3 py-1.5 text-meta text-jz-teal hover:bg-jz-surface-2/40 flex items-center gap-1.5"><MessageSquare size={12} /> 追问 AI</button>
                        )}
                        <button onClick={()=>{setMenuFor(null);setRerunTask(t);}} className="w-full px-3 py-1.5 text-meta text-jz-ink-2 hover:bg-jz-surface-2/40 flex items-center gap-1.5">重跑</button>
                        <button onClick={()=>{setMenuFor(null);if(window.confirm(`确认删除任务 #${t.id}?`))removeTask(t);}} className="w-full px-3 py-1.5 text-meta text-jz-sev-critical hover:bg-jz-surface-2/40 flex items-center gap-1.5">删除</button>
                      </div>
                    </>
                  )}
                </td>
              </tr>
            );})}
          </tbody>
        </table>
        {/* 底部分页器(规格): 20/50/100+页码+跳页——DataToolbar 纯 pager 实例,位置=表格底部
            (data-v3-pagination/data-jump-input 存量探针透传保留) */}
        <div className="flex-none px-4 py-2.5 bg-jz-surface-2/30">
          <DataToolbar
 pager={{ total: filtered.length, page: safePage, pageSize, onPage: setPage, onPageSize: (n) => setPageSize(n) }}
 pageSizes={PAGE_SIZES}
 pagerDataAttrs={{ 'data-v3-pagination': '', 'data-jump-input': 'present' }}
 />
        </div>
      </div>
 {/* R103-9①: 底部已选批量条(选中行>0 时出现;规格文案对齐: 已选择 N 项/批量重新扫描/导出所选 CSV/JSON/批量删除/取消选择) */}
 {sel.size>0&&(
        <div className="sticky bottom-0 z-30 flex items-center gap-2 flex-wrap px-3 py-2 rounded-panel bg-jz-surface/95 shadow-card text-meta" data-batch-bar>
          <span className="font-semibold text-jz-ink">已选择 {sel.size} 项:</span>
          <button onClick={()=>setRetryOpen(true)} disabled={batchBusy} data-batch-retry
 title={batchBusy ? '批量操作进行中,已锁定防重复提交' : '对选中任务发起批量重跑(先二次确认)'}
 className="inline-flex items-center gap-1 px-2 py-1 rounded-control bg-jz-surface-2/60 text-jz-ink-2 hover:text-jz-brand disabled:opacity-40 disabled:cursor-not-allowed"><RefreshCw size={12} /> 批量重新扫描</button>
          <button onClick={exportSelCsv} disabled={batchBusy} data-batch-csv
 title="导出所选任务 CSV(字段=表格列;业务码/漏洞计数缺加载时留空不编造)"
 className="inline-flex items-center gap-1 px-2 py-1 rounded-control bg-jz-surface-2/60 text-jz-ink-2 hover:text-jz-brand disabled:opacity-40 disabled:cursor-not-allowed">导出所选 CSV</button>
          <button onClick={exportSelJson} disabled={batchBusy} data-batch-json
 title="导出所选任务 JSON(字段=表格列;业务码/漏洞计数缺加载时留空不编造)"
 className="inline-flex items-center gap-1 px-2 py-1 rounded-control bg-jz-surface-2/60 text-jz-ink-2 hover:text-jz-brand disabled:opacity-40 disabled:cursor-not-allowed">导出所选 JSON</button>
          <button onClick={()=>setDelOpen(true)} disabled={batchBusy} data-batch-del
 title={batchBusy ? '批量操作进行中,已锁定防重复提交' : '批量清理选中任务(先二次确认)'}
 className="inline-flex items-center gap-1 px-2 py-1 rounded-control bg-jz-sev-critical/10 text-jz-sev-critical hover:bg-jz-sev-critical/20 disabled:opacity-40 disabled:cursor-not-allowed">批量删除</button>
          {/* R602: 恰选 2 个有关联会话的任务 → 报告中心对比(URL 参数驱动既有发现级 Diff 面板) */}
          {cmpPair && (
            <button onClick={() => nav(`/reports?sid=${cmpPair.a}&cmp=${cmpPair.b}`)} data-batch-compare
 title={`跳转报告中心对比会话 #${cmpPair.a} vs #${cmpPair.b}(发现级 added/removed/changed Diff)`}
 className="inline-flex items-center gap-1 px-2 py-1 rounded-control bg-jz-surface-2/60 text-jz-ink-2 hover:text-jz-brand">对比报告</button>
          )}
          <button onClick={()=>setSel(new Set())} className="text-jz-muted hover:text-jz-ink">取消选择</button>
        </div>
      )}
      {batchMsg&&(
        <div className="text-meta text-jz-ink-2" data-batch-msg>{batchMsg}<button onClick={()=>setBatchMsg(null)} className="ml-1.5 text-jz-muted hover:text-jz-ink">✕</button></div>
      )}
      {/* R117-4③: 批量重跑统一模态二次确认(明示条数+不可逆提示;确认后锁定) */}
      <Modal open={retryOpen} title={`确认批量重跑 ${sel.size} 个任务?`} onClose={()=>setRetryOpen(false)}>
        <div className="text-meta text-jz-ink-2 space-y-2" data-batch-retry-modal>
          <div>将对以下 {selTasks.length} 个任务逐个创建重跑任务(新增任务,原任务保留):</div>
          <div className="max-h-32 overflow-auto rounded-control bg-jz-canvas p-2 font-mono text-meta text-jz-muted">
 {selTasks.map((t:any)=>(`#${t.id} ${t.app_name||t.package||''} [${t.status}]`)).join('\n')}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setRetryOpen(false)} className="px-3 py-1.5 rounded-control bg-jz-surface-2/60 text-jz-ink-2 text-meta hover:bg-jz-surface-2">取消</button>
            <button onClick={batchRetry} disabled={batchBusy} data-batch-retry-confirm
 className="px-3 py-1.5 rounded-control bg-jz-brand/15 text-jz-brand text-meta font-semibold hover:bg-jz-brand/25 disabled:opacity-40 disabled:cursor-not-allowed">确认重跑</button>
          </div>
        </div>
      </Modal>
      <Modal open={delOpen} title={`确认批量清理 ${sel.size} 个任务?`} onClose={()=>setDelOpen(false)}>
        <div className="text-meta text-jz-ink-2 space-y-2" data-batch-del-modal>
          <div>将循环调用 DELETE 逐个删除以下任务(不可恢复):</div>
          <div className="max-h-32 overflow-auto rounded-control bg-jz-canvas p-2 font-mono text-meta text-jz-muted">
 {selTasks.map((t:any)=>(`#${t.id} ${t.app_name||t.package||''} [${t.status}]`)).join('\n')}
          </div>
          <div className="text-jz-sev-critical">运行中/排队状态的任务后端会拒绝删除,将如实跳过并回显数量。</div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setDelOpen(false)} className="px-3 py-1.5 rounded-control bg-jz-surface-2/60 text-jz-ink-2 text-meta hover:bg-jz-surface-2">取消</button>
            <button onClick={batchDelete} disabled={batchBusy} data-batch-del-confirm className="px-3 py-1.5 rounded-control bg-jz-sev-critical/15 text-jz-sev-critical text-meta font-semibold hover:bg-jz-sev-critical/25 disabled:opacity-40 disabled:cursor-not-allowed">确认删除</button>
          </div>
        </div>
      </Modal>
      {/* 清理失败项二次确认(范围=当前过滤视图内 failed;所见即所删) */}
      <Modal open={cleanOpen} title={`确认清理当前视图内 ${failedInView.length} 个失败任务?`} onClose={()=>setCleanOpen(false)}>
        <div className="text-meta text-jz-ink-2 space-y-2" data-clean-failed-modal>
          <div>删除范围=当前过滤视图(含搜索/筛选)内 status=failed 的任务,不可恢复;运行中/排队任务不在范围内。</div>
          <div className="max-h-32 overflow-auto rounded-control bg-jz-canvas p-2 font-mono text-meta text-jz-muted">
 {failedInView.slice(0, 12).map((t:any)=>(`#${t.id} ${t.app_name||t.package||''} ${(t.error_msg||'').slice(0,40)}`)).join('\n')}
 {failedInView.length > 12 ? `\n… 共 ${failedInView.length} 个` : ''}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={()=>setCleanOpen(false)} className="px-3 py-1.5 rounded-control bg-jz-surface-2/60 text-jz-ink-2 text-meta hover:bg-jz-surface-2">取消</button>
            <button onClick={cleanFailed} disabled={batchBusy} data-clean-failed-confirm className="px-3 py-1.5 rounded-control bg-jz-sev-critical/15 text-jz-sev-critical text-meta font-semibold hover:bg-jz-sev-critical/25 disabled:opacity-40 disabled:cursor-not-allowed">确认清理</button>
          </div>
        </div>
      </Modal>
      {/* 行内任务详情(规格失败态 [详情]): 后端原始字段如实呈现,失败原因全文不截断 */}
      <Modal open={!!detailTask} title={`任务 #${detailTask?.id ?? ''} 详情`} onClose={()=>setDetailTask(null)}>
        {detailTask && (
          <div className="text-meta text-jz-ink-2 space-y-1.5 max-h-[60vh] overflow-auto" data-detail-modal>
            {([
              ['ID / 类型', `#${detailTask.id} · ${detailTask.kind || 'audit'}`],
              ['目标应用', detailTask.app_name || '—'],
              ['包名', detailTask.package || '后端未返回包名'],
              ['状态', ST_CN[detailTask.status] || detailTask.status],
              ['壳', detailTask.packer ? `${PACKER_NAMES[detailTask.packer] || detailTask.packer}(${detailTask.packer})` : '未检出'],
              ['操作员', usersMap[String(detailTask.user_id)] || (detailTask.user_id != null ? `#${detailTask.user_id}` : '—')],
              ['创建时间', detailTask.created_at ? new Date(detailTask.created_at * 1000).toLocaleString('zh-CN', { hour12: false }) : '—'],
              ['更新时间', detailTask.updated_at ? new Date(detailTask.updated_at * 1000).toLocaleString('zh-CN', { hour12: false }) : '—'],
              ['APK 路径', detailTask.apk_path || '—'],
              ['结果 ID', detailTask.result_id != null ? `#${detailTask.result_id}` : '无'],
            ] as Array<[string, string]>).map(([k, v]) => (
              <div key={k} className="flex gap-2"><span className="flex-none w-16 text-jz-muted">{k}</span><span className="font-mono break-all">{v}</span></div>
            ))}
            <div className="pt-1"><span className="text-jz-muted">进度全文</span><pre className="mt-1 p-2 rounded-control bg-jz-canvas font-mono whitespace-pre-wrap break-all text-jz-ink-2">{detailTask.progress || '(后端无进度文本)'}</pre></div>
            {detailTask.status === 'failed' && (
              <div><span className="text-jz-muted">失败原因全文(不截断)</span><pre className="mt-1 p-2 rounded-control bg-jz-canvas font-mono whitespace-pre-wrap break-all text-jz-sev-critical" data-detail-error>{detailTask.error_msg || detailTask.progress || '(后端未返回失败原因)'}</pre></div>
            )}
            {detailTask.unpack_outcome && (
              <div><span className="text-jz-muted">脱壳判定(unpack_outcome 原值)</span><pre className="mt-1 p-2 rounded-control bg-jz-canvas font-mono whitespace-pre-wrap break-all text-jz-ink-2">{JSON.stringify(detailTask.unpack_outcome, null, 2)}</pre></div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              {detailTask.status === 'failed' && (
                <button onClick={()=>{ const t = detailTask; setDetailTask(null); setRerunTask(t); }} data-detail-retry
 className="px-3 py-1.5 rounded-control bg-jz-surface-2/60 text-jz-ink-2 text-meta hover:text-jz-brand">重试该任务</button>
              )}
              <button onClick={()=>setDetailTask(null)} className="px-3 py-1.5 rounded-control bg-jz-surface-2/60 text-jz-ink-2 text-meta hover:bg-jz-surface-2">关闭</button>
            </div>
          </div>
        )}
      </Modal>
      {/* R104-5②: 产物弹窗=ArtifactsModal(UnifiedModal 基底+文件树+预览/下载+ZIP, 语义见组件头注) */}
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
    </div>
  );
};
