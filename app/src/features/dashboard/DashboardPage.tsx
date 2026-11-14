import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// R39 P0-1: echarts/core 按需引入(只注册雷达所需模块,替代全量 1.5MB 引入)
import * as echarts from 'echarts/core';
import { RadarChart, PieChart, BarChart } from 'echarts/charts';
import { RadarComponent, GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([RadarChart, RadarComponent, PieChart, BarChart, GridComponent, TooltipComponent, CanvasRenderer]);
import { api, ApiError } from '@/services/api';
import { usePentest } from '@/stores/pentest';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/theme/ThemeContext';
// R104-3: V3 微型状态胶囊/模型路由胶囊消费(R104-1 底座);Badge 调试标签全部收敛为 StatusBadge(三铁律②)
import { StatusBadge, ModelSelectorChip, toast } from '@/components/ui';
import { Database, Activity, AlertTriangle, Bot, Radar, List, Zap, ArrowUpRight } from 'lucide-react';

// R84-3: DOMAINS/domainOf 抽至 features/pentest/masvsDomains.ts(单一来源),本文件仅 import
// R104-3②: 默认态跨会话合规均值雷达同用 domainOf 归域(零第二份映射,后端只回 masvs 原值)
import { DOMAINS, domainOf, OTHER_DOMAIN_NAME } from '@/features/pentest/masvsDomains';

/** R103-6: 评分 A-F 口径(源=会话 report/summary.risk_score;阈值在脚注注明,任务级无评分显「—」) */
const grade = (score: any): { g: string; cls: string } | null => {
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  if (n >= 90) return { g: 'A', cls: 'text-jz-teal bg-jz-teal/10' };
  if (n >= 75) return { g: 'B', cls: 'text-jz-teal bg-jz-teal/10' };
  if (n >= 60) return { g: 'C', cls: 'text-jz-brand bg-jz-brand/10' };
  if (n >= 45) return { g: 'D', cls: 'text-jz-sev-medium bg-jz-sev-medium/10' };
  if (n >= 30) return { g: 'E', cls: 'text-jz-sev-high bg-jz-sev-high/10' };
  return { g: 'F', cls: 'text-jz-sev-critical bg-jz-sev-critical/10' };
};
// R104-3①: CardTitle 图标改可选——卡1 资产图标按规格移至右上角
const CardTitle: React.FC<{ icon?: React.ReactNode; text: string; extra?: React.ReactNode }> = ({ icon, text, extra }) => (
  <div className="flex items-center gap-1.5 mb-1.5">
    {icon && <span className="text-jz-brand flex-none inline-flex">{icon}</span>}
    <span className="text-meta font-semibold text-jz-ink">{text}</span>
    {extra}
  </div>
);

// R103-7: 堆叠柱严重度配色(canvas 吃不了 CSS 变量,按 tailwind vuln 色板镜像;info=中性灰)
const SEV_COLOR: Record<string, string> = {
  critical: '#EF4444', high: '#F97316', medium: '#F59E0B', low: '#06B6D4', info: '#64748B',
};
const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const;
// R104-3④: 资产行微型比例条=红/橙/黄/蓝(critical/high/medium/low,by_session active 真算)
const SEV_BAR_KEYS = ['critical', 'high', 'medium', 'low'] as const;
const SEV_BAR_CLS = ['bg-jz-sev-critical', 'bg-jz-sev-high', 'bg-jz-sev-medium', 'bg-jz-sev-low'];
// R104-3④: 加固/壳厂商展示名映射(字段真值→标准厂商名,未知值原样显;none=「无壳」浅灰)
const PACKER_LABEL: Record<string, string> = { '360_jiagu': '360加固', ijiami: '爱加密', bangcle: '梆梆加固' };

/** R117-5③(方案5.3): 事件流时间统一主显 HH:mm:ss——正则从后端时间串提取时刻段
 *  (兼容 ISO/「MM-DD HH:mm:ss」等形态),无匹配回落原串(不编造不猜格式),全文随 title 悬浮。 */
const formatFeedTs = (ts: any): string => {
  const m = String(ts ?? '').match(/(\d{1,2}:\d{2}:\d{2})/);
  return m ? m[1] : String(ts ?? '—');
};

/** R103-7: 事件流条目文案(全部由真实记录字段派生;未知类型显原始 type,不编造) */
const feedText = (e: any): string => {
  const p = e.payload || {};
  switch (e.type) {
    case 'autopilot_start': return `autopilot 启动(${p.steps ?? '?'} 步)`;
    case 'autopilot_done': return `autopilot 完成,共 ${p.findings ?? 0} 条发现`;
    case 'triage_done': return `预分诊完成(业务 ${p.business ?? 0} · 规则库 ${p.library ?? 0})`;
    case 'step_start': return `开始 ${p.name || p.tool || '步骤'}${p.phase ? `(${p.phase})` : ''}`;
    case 'step_done': return `${p.tool || '步骤'} ${p.status === 'error' ? '出错' : '完成'}${p.findings != null ? `,产出 ${p.findings} 条发现` : ''}`;
    case 'auth_matrix_skip': return `auth_matrix 跳过(${p.reason || '无理由字段'})`;
    default: return e.type || '(无类型事件)';
  }
};

/** R600(六模块优化-仪表盘 P2): 实时耗时格式化(与任务中心 fmtDur 同语义;本文件局部定义) */
const fmtDur = (sec: number): string => {
  if (!isFinite(sec) || sec < 0) return '—';
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
};

/** R125(方案1.2): 事件流三分类视觉锚——全部由真实字段派生,不猜不造:
 *  漏洞发现=findings>0(step_done/autopilot_done 真值);跳过=auth_matrix_skip;
 *  异常=step_done status=error 或 payload.error;其余=探测执行。 */
const feedFinding = (e: any): boolean => {
  const p = e.payload || {};
  return (e.type === 'step_done' || e.type === 'autopilot_done') && Number(p.findings ?? 0) > 0;
};
const feedIsSkip = (e: any): boolean => e.type === 'auth_matrix_skip';
const feedIsError = (e: any): boolean => {
  const p = e.payload || {};
  return (e.type === 'step_done' && p.status === 'error') || !!p.error;
};
const feedTarget = (e: any): string => {
  const p = e.payload || {};
  return String(p.name || p.tool || '');
};
/** R125(方案1.1): 域健康度三阶色(合规均分,阈值显式披露于行 title):
 *  ≥75 良好(翡翠) / 45-74 预警(琥珀) / <45 危险(红);零活跃发现时均分不可算→中性灰不着色。 */
const healthCls = (score: number, counted: boolean): string =>
  !counted ? 'text-jz-muted'
    : score >= 75 ? 'text-jz-teal' : score >= 45 ? 'text-jz-sev-medium' : 'text-jz-sev-critical';

/**
 * R104-3②: 默认态跨会话合规均值雷达聚合(纯前端按 masvsDomains.ts 单一来源归域)。
 * 得分口径=仅计入有活跃发现的会话,每库得分=1−该域违规/该库总违规(R104-2 合规卡同式),
 * 域得分=各库均值;零发现会话不计入分母;全库零活跃发现→均分不可算,全域显 0(诚实标注)。
 * counts=跨会话该域违规实例总数(悬浮展示),otherCount=无标准域归属。
 */
const computeAggRadar = (a: any): { scores: number[]; counts: number[]; otherCount: number; counted: number; scanned: number } => {
  const nAxis = DOMAINS.length + 1;   // R103-7: 9 轴(8 标准域+「其他」),公式自适应
  const counts: number[] = Array(nAxis).fill(0);
  const ratesAcc: number[][] = [];
  let counted = 0;
  if (a?.by_session) {
    for (const mv of Object.values<any>(a.by_session)) {
      const domCounts: number[] = Array(DOMAINS.length).fill(0);
      let other = 0, total = 0;
      for (const [m, n] of Object.entries<any>(mv || {})) {
        total += n;
        const d = domainOf(m);
        if (d) domCounts[DOMAINS.indexOf(d)] += n; else other += n;
      }
      domCounts.forEach((c, i) => { counts[i] += c; });
      counts[DOMAINS.length] += other;
      if (total > 0) {
        counted += 1;
        ratesAcc.push([...domCounts.map((c) => (1 - c / total) * 100), (1 - other / total) * 100]);
      }
    }
  }
  const scores = counted > 0
    ? Array.from({ length: nAxis }, (_, i) =>
        Math.round((ratesAcc.reduce((s, r) => s + r[i], 0) / counted) * 10) / 10)
    : Array(nAxis).fill(0);
  return { scores, counts, otherCount: counts[DOMAINS.length], counted, scanned: a?.sessions_scanned ?? 0 };
};

/** 态势仪表盘(Phase 2): R103-6 SOC HUD → R104-3 V3 HUD 质感重塑(四指标卡+双态雷达+事件流+资产表) */
export const DashboardPage: React.FC = () => {
  const nav = useNavigate();
  const { theme } = useTheme();   // R103-1: 雷达双模色板随主题
  const sid = usePentest((s) => s.sid);
  const pid = usePentest((s) => s.projectId);
  const ref = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);   // R103-7: 堆叠柱(域×严重度)
  const ringRef = useRef<HTMLDivElement>(null);
  const [kpis, setKpis] = useState<{ total?: number; high?: number; risk?: string } | null>(null);
  const [unmapped, setUnmapped] = useState(0);

  // R200(V3 节点化第4步): 执行节点状态卡数据(admin 可见)
  const [nodes, setNodes] = useState<any[] | null>(null);
  const [me, setMe] = useState<any>(null);
  useEffect(() => { api<any>('/api/me').then(setMe).catch(() => setMe(null)); }, []);
  const isAdmin = me?.role === 'admin' || me?.role === 'super_admin';
  useEffect(() => {
    if (!isAdmin) { setNodes(null); return; }
    api<{ items: any[] }>('/api/nodes').then((d) => setNodes(d.items || [])).catch(() => setNodes([]));
  }, [isAdmin]);

  // ─── R104-3②: 雷达数据口径切换(右上角紧凑过滤切换器) ───
  // 会话选中→默认按会话数据(既有逻辑回归);无会话→默认全量合规均值;用户可手动切换互看。
  const [radarMode, setRadarMode] = useState<'all' | 'session'>('all');
  useEffect(() => { if (sid) setRadarMode('session'); }, [sid]);
  const [agg, setAgg] = useState<any | null>(null);
  useEffect(() => {
    let dead = false;
    api<any>('/api/pentest/vulns/domain-summary')
      .then((d) => { if (!dead) setAgg(d); }).catch(() => {});
    return () => { dead = true; };
  }, [radarMode]);   // 切回全量均值时顺带刷新(只读聚合,开销有界)
  // useMemo 锁对象身份——aggRadar 是图表 effect 依赖,逐渲染新建会导致 effect 循环重跑
  const aggRadar = useMemo(() => computeAggRadar(agg), [agg]);
  // R125(方案1.1): 各域违规聚合 Top-5(右栏真值条形图数据源=aggRadar.counts,与雷达同源同口径:
  // domain-summary by_session 跨会话逐库聚合;含「其他」轴;零后端改动)
  const domainStats = useMemo(() => {
    const rows = DOMAINS.map((d, i) => ({ name: d.name, count: aggRadar.counts[i] ?? 0, score: aggRadar.scores[i] ?? 0 }));
    rows.push({ name: OTHER_DOMAIN_NAME, count: aggRadar.counts[DOMAINS.length] ?? 0, score: aggRadar.scores[DOMAINS.length] ?? 0 });
    rows.sort((a, b) => b.count - a.count || b.score - a.score);
    return rows;
  }, [aggRadar]);
  const topDomains = domainStats.slice(0, 5);
  const restDomains = domainStats.slice(5);
  const restCount = restDomains.reduce((s, r) => s + r.count, 0);
  const topMax = Math.max(1, ...topDomains.map((r) => r.count));
  const hoverIdxRef = useRef<number[]>([]);   // 当前渲染雷达的值数组(悬浮读数用,由图表 effect 写入)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    let chart: echarts.ECharts | null = null;
    let barChart: echarts.ECharts | null = null;
    const load = async () => {
      // R104-3②: 会话态=既有逻辑(分组卡发现计数);全量态=跨会话合规均值(scores, max 100)
      const useSession = radarMode === 'session' && !!sid;
      if (!useSession) {
        setUnmapped(aggRadar.otherCount);
        if (!ref.current) return;
        const inst = echarts.init(ref.current, undefined, { renderer: 'canvas' });
        chart = inst;
        hoverIdxRef.current = aggRadar.scores;
        chart.setOption({
          backgroundColor: 'transparent',
          radar: {
            // R126(D-FIX-1/§5 等价映射): 轴标签直接附带真值读数(合规均分整数)——不重写 SVG 雷达,
            // 保留 echarts 悬浮读数/主题重绘链路;zr 几何点击按索引归一,不受名称变化影响
            indicator: [...DOMAINS.map((d, i) => ({ name: `${d.name}·${Math.round(aggRadar.scores[i])}`, max: 100 })),
                        { name: `${OTHER_DOMAIN_NAME}·${Math.round(aggRadar.scores[DOMAINS.length])}`, max: 100 }],
            radius: '62%',
            // R103-1: 双模色板(ECharts canvas 吃不了 CSS 变量,按主题取值)
            splitArea: { areaStyle: { color: theme === 'dark' ? ['#131B2E', '#0f172a'] : ['#FFFFFF', '#F1F5F9'] } },
            axisLine: { lineStyle: { color: theme === 'dark' ? '#1F2E47' : '#CBD5E1' } },
            axisName: { color: theme === 'dark' ? '#94A3B8' : '#475569', fontSize: 11 },
            splitLine: { lineStyle: { color: theme === 'dark' ? '#1F2E47' : '#CBD5E1' } },
          },
          series: [{
            type: 'radar', symbolSize: 4,
            data: [{ value: aggRadar.scores, name: '跨会话合规均值',
              areaStyle: { color: 'rgba(99,102,241,.25)' },
              lineStyle: { color: '#6366F1' }, itemStyle: { color: '#6366F1' } }],
          }],
        });
        // R104-3②: 全量态无会话上下文,域下钻不可用(navDomain 无 sid 守卫),悬浮读数照常
        attachZr(inst, null);
        return;
      }
      const [grouped, summary] = await Promise.all([
        api<any>(`/api/pentest/sessions/${sid}/vulns/grouped`, {}, true).catch(() => null),
        api<any>(`/api/pentest/sessions/${sid}/report/summary`, {}, true).catch(() => null),
      ]);
      const cards: any[] = grouped?.cards || [];
      setKpis({ total: summary?.web_focus?.total ?? cards.reduce((n, c) => n + c.instance_count, 0),
                high: summary?.web_focus?.web_high ?? cards.filter((c) => c.severity === 'high').length,
                risk: summary?.risk_score != null ? String(summary.risk_score) : undefined });
      // R77-3: 标准域计数 + 「其他」兜底域(masvs 不命中任何标准域的显式入桶,不静默丢弃)
      // R103-7: DOMAINS 扩 8 域(逆向防护/权限独立成域),雷达=9 轴(8 标准+「其他」)
      const counts = DOMAINS.map((d) => cards
        .filter((c) => domainOf(c.masvs || '') === d)
        .reduce((n, c) => n + c.instance_count, 0));
      const totalInstances = cards.reduce((n, c) => n + c.instance_count, 0);
      const otherCount = Math.max(0, totalInstances - counts.reduce((a, b) => a + b, 0));
      const radarCounts = [...counts, otherCount];   // 末轴=「其他」
      setUnmapped(otherCount);
      // R103-7: 堆叠柱数据(域×严重度;grouped 真数,与雷达同源同口径——卡实例逐条按卡归域入桶)
      const domNames = [...DOMAINS.map((d) => d.name), '其他'];
      const domSev: Record<string, Record<string, number>> = {};
      for (const n of domNames) domSev[n] = {};
      for (const c of cards) {
        const dom = domainOf(c.masvs || '');
        const b = domSev[dom ? dom.name : '其他'];
        for (const it of c.instances || []) {
          const sv = it.severity || 'info';
          b[sv] = (b[sv] || 0) + 1;
        }
      }
      const max = Math.max(5, ...radarCounts);
      if (!ref.current) return;
      const inst = echarts.init(ref.current, undefined, { renderer: 'canvas' });
      chart = inst;
      hoverIdxRef.current = radarCounts;
      chart.setOption({
        backgroundColor: 'transparent',
        radar: {
          indicator: [...DOMAINS.map((d) => ({ name: d.name, max })), { name: '其他', max }],
          radius: '62%',   // R103-7: 9 轴留标签空间
          // R103-1: 双模色板(原硬编码暗色 hex 亮色不换肤;ECharts canvas 吃不了 CSS 变量,按主题取值)
          splitArea: { areaStyle: { color: theme === 'dark' ? ['#131B2E', '#0f172a'] : ['#FFFFFF', '#F1F5F9'] } },
          axisLine: { lineStyle: { color: theme === 'dark' ? '#1F2E47' : '#CBD5E1' } },
          axisName: { color: theme === 'dark' ? '#94A3B8' : '#475569', fontSize: 11 },
          splitLine: { lineStyle: { color: theme === 'dark' ? '#1F2E47' : '#CBD5E1' } },
        },
        series: [{
          type: 'radar', symbolSize: 4,
          data: [{ value: radarCounts, name: '发现分布',
            areaStyle: { color: 'rgba(99,102,241,.25)' },
            lineStyle: { color: '#6366F1' }, itemStyle: { color: '#6366F1' } }],
        }],
      });
      // R76-5: 雷达域可点 → ?tab=vulns&masvs=<域匹配器列表>(VulnsPanel 消费)
      // ECharts 雷达 indicator 名多数版本不触发 series click,故加 zr 层几何命中:
      // 点击向量归一到最近域(轴角按 360/nAxis 均分、起始 90 度,nAxis=DOMAINS+1);series click 兼容保留。
      const navDomain = (d?: { masvs: string[]; cwe?: string[] }) => {
        if (!sid) return;
        if (!pid) { toast.info('该会话未归属项目,域下钻不可用'); return; }   // R79-2: 轻提示替代静默
        // R78-2: 「其他」兜底轴(无 d)下钻 → masvs=__none__(VulnsPanel 解析为 masvs 空过滤)
        if (!d) { nav(`/pentest/project/${pid}/session/${sid}?tab=vulns&masvs=__none__`); return; }
        const matchers = [...d.masvs, ...(d.cwe || [])].join(',');
        if (!matchers) return;
        nav(`/pentest/project/${pid}/session/${sid}?tab=vulns&masvs=${encodeURIComponent(matchers)}`);
      };
      chart.on('click', (p: any) => {
        navDomain(DOMAINS.find((x) => x.name === p?.name));
      });
      attachZr(inst, navDomain);
      // R103-7: 堆叠柱(域×严重度,grouped 真数;vuln 色板镜像,双模中性网格)——会话级视图专属
      if (barRef.current) {
        const barInst = echarts.init(barRef.current, undefined, { renderer: 'canvas' });
        barChart = barInst;
        barInst.setOption({
          backgroundColor: 'transparent',
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          grid: { left: 6, right: 6, top: 20, bottom: 0, containLabel: true },
          xAxis: {
            type: 'category', data: domNames,
            axisLabel: { color: theme === 'dark' ? '#94A3B8' : '#475569', fontSize: 10, interval: 0, rotate: 36 },
            axisLine: { lineStyle: { color: theme === 'dark' ? '#1F2E47' : '#CBD5E1' } },
            axisTick: { show: false },
          },
          yAxis: {
            type: 'value',
            axisLabel: { color: theme === 'dark' ? '#64748B' : '#64748B', fontSize: 10 },
            splitLine: { lineStyle: { color: theme === 'dark' ? '#1F2E47' : '#E2E8F0' } },
          },
          series: SEV_ORDER.map((sv) => ({
            name: sv, type: 'bar', stack: 'total', barMaxWidth: 16,
            data: domNames.map((n) => domSev[n][sv] || 0),
            itemStyle: { color: SEV_COLOR[sv] },
          })),
        });
      }
    };
    // R104-3②: zr 层几何命中(轴角逆时针归一,R78-2 勘误公式)——点击=域下钻(会话态),
    // 悬浮=域读数(两态通用,hoverIdx 状态承载「悬浮查看各域得分」)
    const attachZr = (inst: echarts.ECharts, navDomain: ((d?: any) => void) | null) => {
      const axisFromPoint = (x: number, y: number): number | null => {
        const dx = x - inst.getWidth() / 2, dy = y - inst.getHeight() / 2;
        const r = Math.hypot(dx, dy);
        if (r < 12 || r > (Math.min(inst.getWidth(), inst.getHeight()) / 2) * 0.62) return null;
        const theta = (Math.atan2(-dy, dx) * 180) / Math.PI;
        const nAxis = DOMAINS.length + 1;
        let idx = Math.round((theta - 90) / (360 / nAxis)) % nAxis;
        if (idx < 0) idx += nAxis;
        return idx;
      };
      inst.getZr().on('click', (e: any) => {
        if (!navDomain) return;
        // R79-2: 守卫收敛至 navDomain(此处双守卫会吞掉无 pid 轻提示)
        const idx = axisFromPoint(e.offsetX, e.offsetY);
        if (idx == null) return;
        navDomain(idx < DOMAINS.length ? DOMAINS[idx] : undefined);   // 「其他」→ masvs=__none__ 下钻
      });
      inst.getZr().on('mousemove', (e: any) => {
        setHoverIdx(axisFromPoint(e.offsetX, e.offsetY));
      });
      inst.getZr().on('globalout', () => setHoverIdx(null));
    };
    load();
    const onResize = () => { chart?.resize(); barChart?.resize(); };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); chart?.dispose(); chart = null; barChart?.dispose(); barChart = null; };
  }, [sid, theme, radarMode, aggRadar]);   // R103-1: 主题切换重绘;R104-3②: 口径/聚合数据变化重绘

  // ─── R103-6: SOC HUD 数据面(全真实端点,零 mock) ───
  const [glob, setGlob] = useState<{ total?: number; done?: number; running?: number; failed?: number } | null>(null);
  const [unpk, setUnpk] = useState<{ count?: number; done?: number; dex_total?: number } | null>(null);
  const [sev, setSev] = useState<any | null>(null);
  const [ai, setAi] = useState<{ activeModel?: string; enabled?: number; total?: number; gated?: boolean } | null>(null);
  const [apkRows, setApkRows] = useState<any[]>([]);
  const [sessMap, setSessMap] = useState<Record<number, { pid: number; sid: number }>>({});
  // R128: 会话映射纳入无项目会话(pid=0,工作台按 sid 加载/返回键回 /pentest)——
  // 旧口径 project_id!=null 过滤会让仪表盘发起的无主会话永远显示「待关联作战」
  const loadSessMap = useCallback(() => {
    api<any[]>('/api/pentest/sessions').then((rows) => {
      const m: Record<number, { pid: number; sid: number }> = {};
      for (const r of rows || []) { if (r.task_id) m[r.task_id] = { pid: r.project_id ?? 0, sid: r.id }; }
      setSessMap(m);
    }).catch(() => {});
  }, []);
  // R128: 资产表「发起渗透」——消费既有 POST /api/pentest/sessions(此前前端零消费);
  // 409=任务未完成(后端守卫),404=无运行目录;成功后刷新映射并直入工作台
  const [creatingTid, setCreatingTid] = useState<number | null>(null);
  const launchPentest = async (r: any) => {
    if (creatingTid != null) return;
    setCreatingTid(r.id);
    try {
      const s = await api<any>('/api/pentest/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: r.id }),
      });
      toast.ok(`渗透会话 #${s.id} 已创建 · ${r.app_name || r.package || `#${r.id}`}`);
      loadSessMap();
      nav(`/pentest/project/${s.project_id ?? 0}/session/${s.id}`);
    } catch (e) {
      toast.err(e instanceof ApiError ? e.message : '发起渗透失败');
      setCreatingTid(null);
      return;
    }
    setCreatingTid(null);
  };
  const [rowSev, setRowSev] = useState<Record<number, any>>({});        // sid → severity entry
  const [rowScore, setRowScore] = useState<Record<number, any>>({});    // sid → risk_score
  const [queued, setQueued] = useState<number | null>(null);            // R104-3①: 排队=queued 真值
  const ringDone = useRef(false);

  // R600(六模块优化-仪表盘 P2): 实时活跃工作流泳道数据源——running 任务真值 30s 轮询
  // (与任务中心泳道同口径: 实时耗时=created_at→now 时钟 10s 跳动;进度=后端 progress 文本真值)
  const [runningTasks, setRunningTasks] = useState<any[]>([]);
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    let dead = false;
    const pull = () => api<any[]>('/api/tasks?status=running&limit=50')
      .then((r) => { if (!dead) setRunningTasks(Array.isArray(r) ? r : []); }).catch(() => {});
    pull();
    const t = setInterval(pull, 30000);
    return () => { dead = true; clearInterval(t); };
  }, []);
  useEffect(() => { const iv = setInterval(() => setNow(Date.now() / 1000), 10000); return () => clearInterval(iv); }, []);

  // ─── R103-7: 实时渗透事件流(轮询 8s 即可;SSE 推送版=挂账;空数据诚实显空态) ───
  const [feed, setFeed] = useState<{ events: any[]; total: number; sessions_scanned: number } | null>(null);
  useEffect(() => {
    let dead = false;
    const pull = () => api<any>('/api/pentest/events/recent?limit=30')
      .then((d) => { if (!dead) setFeed(d); }).catch(() => {});
    pull();
    const t = setInterval(pull, 8000);
    return () => { dead = true; clearInterval(t); };
  }, []);
  // R125(方案二.4): 新到行淡入——key 集合与上次快照差集=真实新到事件,挂 feed-row-in(200ms 一次);
  // 首拉不动画(整屏入场无意义);静止行零动画,禁循环跑马灯。
  const seenFeedKeys = useRef<Set<string> | null>(null);
  const freshFeedKeys = useMemo(() => {
    const cur = new Set<string>((feed?.events ?? []).map((e: any, i: number) => `${e.sid}-${e.seq ?? i}`));
    if (seenFeedKeys.current === null) { seenFeedKeys.current = cur; return new Set<string>(); }
    const fresh = new Set<string>([...cur].filter((k) => !seenFeedKeys.current!.has(k)));
    seenFeedKeys.current = cur;
    return fresh;
  }, [feed]);
  // R125(方案二.1): 事件流快速过滤(全部/仅看漏洞/异常阻断)——纯客户端派生过滤,数据源不变
  const [feedFilter, setFeedFilter] = useState<'all' | 'findings' | 'errors'>('all');
  const shownFeed = useMemo(() => {
    const evs = feed?.events ?? [];
    const rows = evs.map((e: any, i: number) => {
      const k = `${e.sid}-${e.seq ?? i}`;
      return { e, k, fnd: feedFinding(e), skip: feedIsSkip(e), err: feedIsError(e) };
    });
    if (feedFilter === 'findings') return rows.filter((r) => r.fnd);
    if (feedFilter === 'errors') return rows.filter((r) => r.err);
    return rows;
  }, [feed, feedFilter]);

  useEffect(() => {
    api<any>('/api/tasks-summary').then(setGlob).catch(() => {});
    api<any>('/api/tasks/batch-unpack-summary').then(setUnpk).catch(() => {});
    api<any>('/api/pentest/vulns/severity-summary').then(setSev).catch(() => {});
    // R104-3①: 排队真值=既有 /api/tasks status 过滤行数(零后端改动;失败显「—」不假造 0)
    api<any[]>('/api/tasks?status=queued&limit=2000').then((r) => setQueued(Array.isArray(r) ? r.length : null)).catch(() => {});
    // AI 负载卡: providers/routing 读面 admin-gated(R97-2),非 admin 诚实降级
    Promise.all([
      api<any>('/api/models/providers').then((d) => d).catch(() => null),
      api<any>('/api/models/routing').then((d) => d).catch(() => null),
    ]).then(([pv, rt]) => {
      if (!pv && !rt) { setAi({ gated: true }); return; }
      const providers = pv?.providers || [];
      const active = providers.find((p: any) => p.id === pv?.active_id);
      setAi({ activeModel: active ? `${active.label || active.vendor} · ${active.model}` : rt?.routing?.inference || undefined,
              enabled: providers.filter((p: any) => p.enabled !== false).length, total: providers.length });
    });
    api<any[]>('/api/tasks?limit=500').then((rows) => {
      setApkRows((rows || []).filter((r: any) => r.kind === 'audit').slice(0, 10));
    }).catch(() => {});
    loadSessMap();
  }, [loadSessMap]);

  // severity by_session → 行计数;行 risk_score(仅前 8 行有会话链路者,Promise.all 有界)
  useEffect(() => {
    if (!sev?.by_session) return;
    setRowSev(sev.by_session);
    const linked = apkRows.filter((r) => sessMap[r.id]).slice(0, 8);
    Promise.all(linked.map((r) =>
      api<any>(`/api/pentest/sessions/${sessMap[r.id].sid}/report/summary`, {}, true).catch(() => null)
    )).then((sums) => {
      const m: Record<number, any> = {};
      linked.forEach((r, i) => { const sc = sums[i]?.risk_score; if (sc != null) m[r.id] = sc; });
      setRowScore(m);
    });
  }, [sev, apkRows, sessMap]);

  // 迷你环形(渗透状态卡: done/failed/running 真算)
  useEffect(() => {
    if (!glob || !ringRef.current || ringDone.current) return;
    const done = glob.done ?? 0, failed = glob.failed ?? 0, running = glob.running ?? 0;
    ringDone.current = true;
    const inst = echarts.init(ringRef.current, undefined, { renderer: 'canvas' });
    // R117-5②: 零数据静默灰环——全 0 时不再以 0.001 ε 值渲染三色残丝(视觉噪声),
    // 改单段静默灰环如实呈现「零任务」态;有数据时三段真值原样(除零防护本就在位)。
    const allZero = done + failed + running === 0;
    inst.setOption({
      backgroundColor: 'transparent',
      series: [{
        type: 'pie', radius: ['62%', '88%'], label: { show: false }, silent: true,
        data: allZero
          ? [{ value: 1, itemStyle: { color: 'rgb(var(--jz-surface-2))' } }]
          : [
            { value: done || 0.001, itemStyle: { color: '#10B981' } },
            { value: failed || 0.001, itemStyle: { color: '#EF4444' } },
            { value: running || 0.001, itemStyle: { color: '#00E5FF' } },
          ],
      }],
    });
    return () => { inst.dispose(); };
  }, [glob]);

  const rate = glob && (glob.done != null) && ((glob.done ?? 0) + (glob.failed ?? 0)) > 0
    ? `${Math.round(((glob.done ?? 0) / ((glob.done ?? 0) + (glob.failed ?? 0))) * 100)}%` : '—';
  const coverage = unpk && (unpk.count ?? 0) > 0 ? Math.round(((unpk.done ?? 0) / (unpk.count ?? 1)) * 100) : null;

  const goSession = (r: any) => {
    const link = sessMap[r.id];
    if (!link) return;
    nav(`/pentest/project/${link.pid}/session/${link.sid}`);
  };

  // R104-3②: 雷达悬浮读数(「悬浮查看各域得分」;hoverIdx=null 时行位保留防跳动)
  const radarSessionView = radarMode === 'session' && !!sid;
  const hoverName = hoverIdx != null ? (hoverIdx < DOMAINS.length ? DOMAINS[hoverIdx].name : OTHER_DOMAIN_NAME) : null;
  const hoverVal = hoverIdx != null ? hoverIdxRef.current[hoverIdx] : null;
  const hoverCount = hoverIdx != null && !radarSessionView ? aggRadar.counts[hoverIdx] : null;
  const radarModeOptions = [
    { id: 'all', label: '全量合规均值', vendor: 'V3' },
    ...(sid ? [{ id: 'session', label: `会话 #${sid}`, vendor: 'SID' }] : []),
  ];

  return (
    // R125(方案二.3): 八档间距纪律 p-6 space-y-6——主工作区容器补齐标准节奏,卡片已有 shadow-card 漂浮层次
    <div className="p-6 h-full overflow-auto space-y-6">
      {/* ─── R104-3①: SOC 四指标卡 V3 精细化(全真实端点;大号数字=八档内 28px) ─── */}
      {/* R200(V3 节点化第4步): 执行节点状态条(admin)——自治节点在线/设备数/心跳年龄 */}
      {isAdmin && (nodes || []).length > 0 && (
        <div className="flex items-center gap-3 flex-wrap rounded-panel bg-jz-surface shadow-card px-3 py-2" data-node-strip>
          <span className="text-meta font-semibold text-jz-ink-2">执行节点</span>
          {(nodes || []).slice(0, 6).map((n: any) => (
            <span key={n.node_id} className="flex items-center gap-1.5 text-meta font-mono"
              title={`心跳 ${Math.max(0, Math.round(Date.now() / 1000 - (n.last_seen || 0)))}s 前 · 设备: ${(n.devices || []).join(', ') || '—'}`}>
              <span className={`w-1.5 h-1.5 rounded-pill ${n.online ? 'bg-jz-teal animate-pulse' : 'bg-jz-muted/40'}`} />
              <span className={n.online ? 'text-jz-ink' : 'text-jz-muted'}>{n.node_id}</span>
              <span className="text-jz-muted">{(n.devices || []).length} 设备</span>
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-kpi-row>
        <div className="relative rounded-panel bg-jz-surface shadow-card p-4">
          <span className="absolute top-3 right-3 text-jz-brand/50" data-kpi-asset-icon><Database size={16} /></span>
          <CardTitle text="累计审计资产" />
          <div className="text-title md:text-page leading-none font-mono font-semibold text-jz-ink tnum" data-kpi-total>{glob?.total ?? '—'}</div>
          <div className="text-meta text-jz-muted mt-1.5">
            已完成 <span className="text-jz-teal tnum font-mono">{glob?.done ?? '—'}</span> · 异常 <span className="text-jz-sev-critical tnum font-mono">{glob?.failed ?? '—'}</span>
          </div>
          <div className="mt-2">
            <div className="flex justify-between text-meta text-jz-muted"><span>脱壳率</span><span className="font-mono tnum">{coverage != null ? `${coverage}%` : '—'}</span></div>
            <div className="h-1 rounded-control bg-jz-surface-2 overflow-hidden mt-0.5"><span className="block h-full bg-jz-brand/70" style={{ width: coverage != null ? `${coverage}%` : '0%' }} /></div>
          </div>
        </div>
        <div className="rounded-panel bg-jz-surface shadow-card p-4 flex flex-col">
          <CardTitle icon={<Activity size={13} />} text="渗透任务状态"
            extra={
              /* R126(D-FIX-2): 公式彻底退出正文文本流,收敛至徽章 title 悬浮层 */
              <StatusBadge tone="info" title="统计口径: 任务成功率 = done/(done+failed)×100%,进行中与排队中不计入分母;排队=GET /api/tasks?status=queued 实时行数真值(现库无排队任务即显 0),非估算">成功率口径</StatusBadge>
            } />
          <div className="flex items-center gap-2.5">
            <div ref={ringRef} className="w-11 h-11 flex-none" data-status-ring />
            <div className="min-w-0">
              <div className="text-title md:text-page leading-none font-mono font-semibold text-jz-ink tnum">{rate}</div>
              <div className="text-meta text-jz-muted mt-0.5">成功率</div>
            </div>
          </div>
          {/* R126(D-FIX-2): 规整底栏——呼吸点真值门控(running>0),失败计数右沉(近邻成功率读数) */}
          <div className="mt-auto pt-2 flex items-center gap-1.5 text-meta text-jz-muted">
            <span className={`w-1.5 h-1.5 rounded-pill flex-none ${(glob?.running ?? 0) > 0 ? 'bg-jz-teal animate-pulse' : 'bg-jz-muted/40'}`}
              title={(glob?.running ?? 0) > 0 ? '有渗透任务进行中' : '无进行中任务'} />
            <span>进行中 <span className="text-jz-brand tnum font-mono" data-running-num>{glob?.running ?? '—'}</span></span>
            <span className="text-jz-muted">·</span>
            <span>排队 <span className="tnum font-mono" data-queued-num>{queued ?? '—'}</span></span>
            <span className="flex-1" />
            <span>失败 <span className="tnum font-mono text-jz-sev-critical">{glob?.failed ?? '—'}</span></span>
          </div>
        </div>
        <div className="rounded-panel bg-jz-surface shadow-card p-4 flex flex-col" data-sev-card>
          <CardTitle icon={<AlertTriangle size={13} />} text="高危与严重漏洞发现"
            extra={<StatusBadge tone="info" title="active=pending+confirmed(排除 excluded),与 severity-summary 同口径;confirmed 已确认数单列不混入 active">活跃口径</StatusBadge>} />
          {/* R126(D-FIX-3): Critical/High 双轨并列主视线——法定最高优先级 Critical 居首(0=中性置灰,>0=警示红),
              High 琥珀紧随;废除 R125 的 High 独占大数+Critical 沉底小字的层级倒置 */}
          <div className="flex items-baseline gap-5 mt-1">
            <div className="flex items-baseline gap-1.5">
              <span className={`text-title md:text-page leading-none font-mono font-semibold tnum ${Number(sev?.by_severity?.critical ?? 0) > 0 ? 'text-jz-sev-critical' : 'text-jz-muted'}`} data-critical-num>{sev?.by_severity?.critical ?? '—'}</span>
              <span className={`text-meta font-semibold ${Number(sev?.by_severity?.critical ?? 0) > 0 ? 'text-jz-sev-critical' : 'text-jz-muted'}`}
                title={Number(sev?.by_severity?.critical ?? 0) > 0 ? `Critical 严重级发现 ${sev.by_severity.critical} 条` : 'Critical=0(中性置灰: 零值不以红色渲染,防误读)'}>Critical</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-title md:text-page leading-none font-mono font-semibold text-jz-sev-high tnum" data-high-num>{sev?.by_severity?.high ?? '—'}</span>
              <span className="text-meta font-semibold text-jz-sev-high">High</span>
            </div>
          </div>
          {/* R126(D-FIX-3): 底栏规整——覆盖度与活跃总数对齐,不再悬空孤挂 */}
          <div className="mt-auto pt-2 flex items-center justify-between text-meta text-jz-muted">
            <span title="severity-summary 逐库扫描进度真值">计入 <span className="tnum font-mono text-jz-ink-2">{sev?.sessions_scanned ?? '—'}/{sev?.sessions_total ?? '—'}</span> 会话库</span>
            <span className="font-mono tnum" title="全量活跃检出(active 口径,含中低危)">活跃共 <span className="text-jz-ink-2 font-semibold">{sev?.total_active ?? '—'}</span> 项</span>
          </div>
        </div>
        <div className="rounded-panel bg-jz-surface shadow-card p-4 flex flex-col overflow-hidden">
          <CardTitle icon={<Bot size={13} />} text="AI 引擎负载"
            extra={
              ai?.gated ? undefined : (
                <StatusBadge tone="info" title="providers 列表 enabled 计数(R97-2 读面收口);切换与连通性详情在系统页">{ai?.enabled ?? '—'}/{ai?.total ?? '—'} 已接入</StatusBadge>
              )
            } />
          {ai?.gated ? (
            <div className="text-meta text-jz-muted py-2" data-ai-gated>模型配置仅管理员可见(R97-2 读面收口)——连通状态请在系统页查看</div>
          ) : (
            <>
              {/* R127(D-R127-1): 表单控件绝迹——假 select 化的 ModelSelectorChip(点击开菜单但 onChange 有意空转)
                  改为纯状态模型卡(只读遥测语义): 静态绿点=有已接入节点(enabled 真值门控,不假充心跳),
                  模型名 truncate+title 全文 */}
              <div className="flex items-center justify-between gap-2 min-w-0 mt-0.5">
                <div className="shrink-0">
                  <div className="text-title md:text-page leading-none font-mono font-semibold text-jz-ink tnum" data-ai-enabled-num>
                    {ai?.enabled ?? '—'}<span className="text-body text-jz-muted">/{ai?.total ?? '—'}</span>
                  </div>
                  <div className="text-meta text-jz-muted mt-0.5">节点就绪</div>
                </div>
                <div className="flex items-center gap-1.5 min-w-0 max-w-[150px] rounded-control bg-jz-surface-2/60 px-2.5 py-1 flex-none"
                  data-ai-model title={`当前主力模型: ${ai?.activeModel || '未配置'}(切换请到系统页)`}>
                  <span className={`w-2 h-2 rounded-pill flex-none ${Number(ai?.enabled ?? 0) > 0 ? 'bg-jz-teal' : 'bg-jz-muted/50'}`} />
                  <span className="font-mono text-meta font-medium text-jz-ink truncate">{ai?.activeModel || '未配置'}</span>
                </div>
              </div>
              {/* R127(D-R127-1): 遥测底栏——待探针工程草稿字样退役为「遥测待命」(诚实语义不变: 无全局聚合端点未采集) */}
              <div className="mt-auto pt-2 flex items-center justify-between text-meta">
                <span className="text-jz-muted">实时推理遥测</span>
                <span className="flex items-center gap-1.5 font-mono tnum">
                  <span className="text-jz-ink-2">-- tok/s</span>
                  <span className="rounded-control bg-jz-surface-2 px-1 py-px text-meta text-jz-muted"
                    title="usage-summary 为会话级(需 chat sid),仪表盘无全局吞吐/时延聚合端点——未采集,不估算不假造">遥测待命</span>
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* R600(六模块优化-仪表盘 P2): 实时活跃工作流泳道——running 任务逐卡(真值同任务中心泳道口径:
          30s 轮询+now 时钟+progress 后端文本真值+关联会话工作台直达);无运行任务不渲染整卡
          (KPI 渗透任务卡的进行中计数已承载零任务态,诚实空态不重复) */}
      {runningTasks.length > 0 && (
        <div className="rounded-panel bg-jz-surface shadow-card p-3 space-y-2" data-live-workflows>
          <div className="flex items-center gap-2 flex-wrap">
            <Zap size={13} className="text-jz-brand flex-none" />
            <span className="text-meta font-semibold text-jz-ink">实时活跃工作流</span>
            <StatusBadge tone="info" title="统计口径: status=running 任务计数真值(30s 轮询);耗时=created_at→now 实时时钟;进度=后端 progress 文本真值,无结构化子阶段=如实不画子步骤">{runningTasks.length} 个进行中</StatusBadge>
            <span className="flex-1" />
            <button onClick={() => nav('/tasks')} data-lw-goto-tasks
              className="text-meta text-jz-muted hover:text-jz-brand transition-colors">任务中心 →</button>
          </div>
          <div className="flex gap-2 overflow-x-auto scroll-smooth pb-1">
            {runningTasks.map((t: any) => {
              const hit = sessMap[t.id];
              return (
                <div key={t.id} data-live-lane={t.id}
                  className="flex-none w-72 rounded-card bg-jz-surface-2/50 px-3 py-2 space-y-1">
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
                    <span className="text-meta text-jz-muted font-mono">{t.kind || 'audit'}</span>
                    <span className="flex-1" />
                    {hit && (
                      <button onClick={() => nav(`/pentest/project/${hit.pid}/session/${hit.sid}`)}
                        data-lw-goto-session={t.id} title={`进入渗透会话 #${hit.sid}`}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-control text-meta text-jz-brand hover:bg-jz-brand/10">
                        <ArrowUpRight size={11} /> 工作台
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── R103-7 → R104-3② → R125(方案二.1) → R126(D-FIX-1): 60/40 双栏锁高 500px——
              右栏事件流固定视口内部滚动,不再撑长行高;左栏消灭 R125 实测的 ~300px 留白死区 ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-[60fr_40fr] gap-3 items-stretch">
        <div className="rounded-panel bg-jz-surface shadow-card p-4 flex flex-col lg:h-[500px]">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="inline-flex text-jz-brand"><Radar size={13} /></span>
            <span className="text-meta font-semibold text-jz-ink">OWASP MASTG 域雷达{radarSessionView ? ' + 域×严重度堆叠柱' : '(全量合规均值)'}</span>
            <span data-radar-mode={radarMode} data-radar-counted={aggRadar.counted} />
            {radarSessionView ? (
              unmapped > 0
                // R77-3: 黄条改口径——无标准域归属的已入「其他」轴,不再「不计入雷达」;归零则显全归类徽标
                ? <StatusBadge tone="info" title="已计入「其他」轴(masvs=__none__ 下钻),不静默丢弃">{unmapped} 条无标准域归属</StatusBadge>
                : <StatusBadge tone="custom" className="text-jz-teal bg-jz-teal/10" title="全部发现已按域归类(零未映射)">✓ 全部发现已按域归类</StatusBadge>
            ) : (
              <StatusBadge tone="info" title={`数据源=GET /api/pentest/vulns/domain-summary 只读聚合;计入 ${aggRadar.counted}/${aggRadar.scanned} 个有活跃发现的会话;每库得分=1−该域违规/该库总违规(与报告中心合规卡同式),域均分,零发现会话不计入分母;「其他」轴=${aggRadar.otherCount} 条无标准域归属(masvs 原值由后端逐库聚合,域映射=前端 masvsDomains.ts 单一来源)${aggRadar.counted === 0 ? ';全库零活跃发现,均分不可算,全域显 0(诚实口径,不假造)' : ''}`}>跨会话 {aggRadar.counted}/{aggRadar.scanned} 库计入</StatusBadge>
            )}
            {/* R104-3②: 右上角紧凑过滤切换器(ModelSelectorChip,选项消费方传入) */}
            <span className="flex-1" />
            <ModelSelectorChip className="flex-none" options={radarModeOptions} value={radarMode}
              onChange={(id) => setRadarMode(id as 'all' | 'session')} />
          </div>
          {/* R125(方案1.1): 悬浮读数行保留(固定高度防跳动;全量态=域均分+跨会话违规数,会话态=发现实例数) */}
          <div className="h-4 text-meta font-mono tnum text-jz-ink-2" data-radar-hover>
            {hoverName && hoverVal != null
              ? (radarSessionView
                  ? `${hoverName} · 发现 ${hoverVal}`
                  : `${hoverName} · 合规均分 ${hoverVal}% · 跨会话违规 ${hoverCount}`)
              : null}
          </div>
          {/* R125(方案1.1)→R126(D-FIX-1): Bento 双栏 1:1——左=雷达(收敛死区),右=全量态 Top-5 域违规条形图/会话态 域×严重度堆叠柱。
              口径收敛至头部 StatusBadge title;flex-1 my-auto 垂直居中吃掉锁高 500px 的余量,不留底部死区 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-center mt-1 flex-1 my-auto min-h-0">
            <div ref={ref} className="h-56 lg:h-60" title={radarSessionView ? undefined : '默认态=跨会话均值视图(只读);域下钻需在切换器选会话'} />
            {radarSessionView ? (
              <div className="flex flex-col justify-center min-w-0">
                <div className="flex items-center gap-2 text-meta text-jz-muted mb-0.5">
                  <span>堆叠柱=当前会话发现按域×严重度(与雷达同源同口径)</span>
                  <span className="inline-flex items-center gap-1 flex-wrap">
                    {SEV_ORDER.map((sv) => (
                      <span key={sv} className="inline-flex items-center gap-0.5">
                        <span className="inline-block w-2 h-2 rounded-tag" style={{ background: SEV_COLOR[sv] }} />
                        {sv}
                      </span>
                    ))}
                  </span>
                </div>
                <div ref={barRef} className="h-52" data-sev-bar />
              </div>
            ) : (
              <div className="flex flex-col justify-center gap-2.5 lg:pr-2" data-domain-top>
                <div className="text-meta font-semibold text-jz-ink-2">
                  各域违规聚合 Top-5<span className="text-jz-muted font-normal">(跨会话 {aggRadar.counted} 库真值,含全部严重度)</span>
                </div>
                {topDomains.map((r) => (
                  <div key={r.name}
                    title={`${r.name}: 跨会话违规实例 ${r.count} 项(含全部严重度)· 合规均分 ${aggRadar.counted > 0 ? `${r.score}%` : '不可算(零活跃发现)'} · 健康度色阶: ≥75 良好 / 45-74 预警 / <45 危险(与报告中心合规卡同式: 每库得分=1−该域违规/该库总违规,域均分)`}>
                    <div className="flex justify-between items-baseline text-meta mb-0.5">
                      <span className="text-jz-ink font-medium truncate max-w-[150px]">
                        {r.name}
                        <span className={`ml-1.5 font-mono tnum ${healthCls(r.score, aggRadar.counted > 0)}`}>
                          {aggRadar.counted > 0 ? r.score : '—'}
                        </span>
                      </span>
                      <span className="font-mono tnum text-jz-ink-2">{r.count} 项</span>
                    </div>
                    <div className="h-1.5 w-full rounded-pill bg-jz-surface-2 overflow-hidden">
                      <div className="h-full rounded-pill bg-jz-sev-high/80 transition-all" style={{ width: `${Math.round((r.count / topMax) * 100)}%` }} />
                    </div>
                  </div>
                ))}
                {restCount > 0 && (
                  <div className="text-meta text-jz-muted" title={`其余 ${restDomains.length} 个域(含「其他」兜底轴)合计 ${restCount} 项违规,完整九轴分布见左侧雷达`}>
                    其余 {restDomains.length} 域合计 {restCount} 项 · 完整分布见雷达九轴
                  </div>
                )}
              </div>
            )}
          </div>
          {/* R126(D-FIX-1/§5 等价映射): 底部合规汇总胶囊行——填实锁高余量,增强态势感知;措辞按真值语义
              (违规实例总计,非「拦截」——聚合口径无拦截概念,不假造) */}
          {!radarSessionView && (
            <div className="shrink-0 mt-1 rounded-card bg-jz-surface-2/60 px-3 py-1.5 flex items-center justify-between"
              data-mastg-capsule
              title={`口径: ${aggRadar.counted}/${aggRadar.scanned} 个有活跃发现的会话库聚合;含「其他」兜底轴;与雷达九轴同源同口径${aggRadar.counted === 0 ? '(零活跃发现,均分不可算全域显 0,诚实口径)' : ''}`}>
              <span className="text-meta text-jz-ink-2">全量 {DOMAINS.length + 1} 轴合规评估概览(8 标准域+其他)</span>
              <span className="text-meta font-mono tnum text-jz-ink-2">
                违规实例总计 <span className="text-jz-ink font-semibold">{domainStats.reduce((s, r) => s + r.count, 0)}</span> 项
              </span>
            </div>
          )}
        </div>

        {/* R126(D-FIX-1): 锁高 500px——事件流 30 行在卡片内部视口滚动(flex-1 min-h-0 overflow-auto 既有链路生效),不撑长页面 */}
        <div className="rounded-panel bg-jz-surface shadow-card p-4 flex flex-col min-h-0 h-[500px]" data-live-feed>
          <CardTitle icon={<Zap size={13} />} text="实时渗透事件流"
            extra={
              /* R104-3③→R125: 活动会话数→呼吸绿点(活动>0 才呼吸,真值脉冲);数据源口径收敛至 title */
              <StatusBadge tone="custom" className="text-jz-teal bg-jz-teal/10"
                title="活动=未关闭会话;8s 轮询 /api/pentest/events/recent 真实 progress 事件(各活动会话 pentest/events/progress.jsonl 尾部);SSE 推送版=挂账;空数据不造数">
                <span className={`w-1.5 h-1.5 rounded-pill flex-none ${(feed?.sessions_scanned ?? 0) > 0 ? 'bg-jz-teal animate-pulse' : 'bg-jz-muted/40'}`} />
                活动会话 {feed ? feed.sessions_scanned : '—'}
              </StatusBadge>
            } />
          {/* R125(方案二.1): 快速过滤 Tab(全部/仅看漏洞/异常阻断)——客户端派生过滤,计数真值 */}
          {feed && feed.events.length > 0 && (
            <div className="flex items-center gap-1 pb-1.5 mb-0.5" data-feed-filter>
              {([['all', '全部'], ['findings', '仅看漏洞'], ['errors', '异常']] as const).map(([id, label]) => (
                <button key={id} onClick={() => setFeedFilter(id)} data-feed-filter-id={id}
                  className={`px-2 py-0.5 rounded-control text-meta transition-colors ${feedFilter === id ? 'bg-jz-brand/15 text-jz-brand font-semibold' : 'text-jz-muted hover:text-jz-ink-2 hover:bg-jz-surface-2/50'}`}>
                  {label}
                </button>
              ))}
              <span className="flex-1" />
              <span className="text-meta text-jz-muted tnum font-mono" title="当前过滤视图事件数 / 流内总事件数">{shownFeed.length} / {feed.events.length} 事件</span>
            </div>
          )}
          {!feed ? (
            <div className="text-meta text-jz-muted p-2">加载中…</div>
          ) : shownFeed.length === 0 ? (
            <div className="text-meta text-jz-muted flex-1 flex items-center justify-center text-center p-3" data-feed-empty>
              {feed.events.length === 0
                ? '暂无活动会话事件——活动=未关闭会话的 progress 流;无事件不造数'
                : `当前过滤(${feedFilter === 'findings' ? '仅看漏洞' : '异常'})下无匹配事件——真实流里暂无此类事件`}
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto scroll-smooth flex flex-col gap-1 pr-0.5" data-feed-list>
              {shownFeed.map(({ e, k, fnd, skip, err }: any) => {
                const isNew = freshFeedKeys.has(k);
                return (
                  <div key={k} data-feed-row={k} data-feed-finding={fnd ? '1' : '0'}
                    className={`flex items-start gap-2 rounded-control px-2 py-1.5 transition-colors ${isNew ? 'feed-row-in' : ''} ${
                      fnd
                        ? 'bg-jz-sev-critical/5 hover:bg-jz-sev-critical/10'
                        : 'hover:bg-jz-surface-2/30'}`}>
                    <span className="font-mono text-meta text-jz-muted flex-none tnum pt-0.5" title={`事件时间戳全文: ${String(e.ts ?? '—')}`}>{formatFeedTs(e.ts)}</span>
                    {/* R125(方案1.2): 三分类状态徽标——漏洞发现=实心红/跳过=灰染底/异常=琥珀/探测执行=品牌蓝(回访轮: 徽章去border线,染底+文字色承载语义);原始 type 收敛至 title */}
                    <span className={`flex-none rounded-control px-1.5 py-px text-meta font-semibold ${
                      fnd ? 'bg-jz-sev-critical text-jz-on-brand'
                        : err ? 'bg-jz-sev-medium/15 text-jz-sev-medium'
                        : skip ? 'bg-jz-surface-2/70 text-jz-muted'
                        : 'bg-jz-brand/10 text-jz-brand'}`}
                      title={`事件类型: ${e.type || '(无类型)'}${feedTarget(e) ? ` · ${feedTarget(e)}` : ''}`}>
                      {fnd ? '漏洞发现' : err ? '异常' : skip ? '跳过' : '探测执行'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-meta leading-tight truncate ${fnd ? 'text-jz-sev-critical font-medium' : 'text-jz-ink-2'}`}
                        title={feedText(e)}>
                        <span className="font-mono text-meta text-jz-muted mr-1">[#{e.sid}]</span>
                        {feedText(e)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── R103-6 → R104-3④ → R127(D-R127-2/3): 最近审计资产=规范表格(表头六列/固定列宽语义/
              无会话行静默胶囊/动作列右对齐)——标题算法字符串收敛 StatusBadge title(正文断言 /评分 A≥90/ =0) ─── */}
      <div className="rounded-panel bg-jz-surface shadow-card p-4">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="inline-flex text-jz-brand"><List size={13} /></span>
          <span className="text-meta font-semibold text-jz-ink">最近审计资产</span>
          <StatusBadge tone="info"
            title="评分阈值: A≥90(优秀) B≥75(良好) C≥60(中危) D≥45(高危) E≥30(严重) F<30;源=会话 risk_score,任务级无评分显「未评估」;隐患计数=该资产关联会话 active(pending+confirmed,排除 excluded)">健康评级基准</StatusBadge>
          <span className="flex-1" />
          <span className="text-meta text-jz-muted font-mono tnum">共 {apkRows.length} 资产</span>
          <button onClick={() => nav('/tasks')} data-assets-goto-tasks
            className="text-meta font-semibold text-jz-brand hover:underline"
            title="全部审计/脱壳任务与产物见任务中心">任务中心 →</button>
        </div>
        {apkRows.length === 0 && <div className="text-meta text-jz-muted p-2">暂无审计任务——先到「新建审计」向导创建</div>}
        {apkRows.length > 0 && (
          <table className="w-full text-left" data-apk-list>
            <thead>
              <tr className="text-meta font-semibold text-jz-ink-2">
                <th className="py-1.5 pl-2 font-medium">应用 / 包名</th>
                <th className="py-1.5 font-medium">加固特征</th>
                <th className="py-1.5 font-medium">安全健康度</th>
                <th className="py-1.5 font-medium">隐患分布 (C/H/M)</th>
                <th className="py-1.5 font-medium">关联渗透会话</th>
                <th className="py-1.5 pr-2 text-right font-medium">动作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-jz-border">
              {apkRows.map((r: any) => {
                const link = sessMap[r.id];
                const sentry = link ? rowSev[link.sid] : null;
                const sevCounts = sentry ? SEV_BAR_KEYS.map((k) => sentry[k]?.active || 0) : null;
                const gd = grade(rowScore[r.id]);
                const pk = String(r.packer || '').trim();
                return (
                  <tr key={r.id} className="group hover:bg-jz-surface-2/30 transition-colors" data-apk-row={r.id}>
                    <td className="py-2 pl-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-7 h-7 rounded-control bg-jz-surface-2 flex items-center justify-center text-meta font-semibold text-jz-ink-2 flex-none">
                          {(r.app_name || r.package || 'A').slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="text-meta font-semibold text-jz-ink truncate max-w-[160px]">{r.app_name || r.package || '—'}</div>
                          <div className="font-mono text-meta text-jz-muted truncate max-w-[200px]" title={r.package || ''}>#{r.id} {r.package || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2">
                      {/* R104-3④: 加固轻量 Badge(已知厂商显示名,未知值原样;无壳=浅灰) */}
                      {pk && pk !== 'none'
                        ? <span className="inline-flex rounded-control px-1.5 py-0.5 text-meta font-mono bg-jz-sev-medium/10 text-jz-sev-medium" title={`加固/壳检测: ${pk}`}>{PACKER_LABEL[pk] || pk}</span>
                        : <span className="inline-flex rounded-control px-1.5 py-0.5 text-meta font-mono bg-jz-surface-2 text-jz-muted" title="无壳(packer=none 或未检出)">未加固</span>}
                    </td>
                    <td className="py-2">
                      {gd ? (
                        <span className="inline-flex items-center gap-1.5" title={`risk_score ${rowScore[r.id]}`}>
                          <span className={`px-1.5 py-0.5 rounded-control font-semibold tnum text-meta ${gd.cls}`}>{gd.g}</span>
                          <span className="text-meta font-mono tnum text-jz-ink-2">{Number(rowScore[r.id])} 分</span>
                        </span>
                      ) : <span className="text-meta text-jz-muted" title="任务级无评分">未评估</span>}
                    </td>
                    <td className="py-2">
                      {/* R127(D-R127-3): 隐患分布 C/H/M 三色计数胶囊(by_session active 真算;low/info 收敛至 title) */}
                      {sevCounts ? (
                        <span className="inline-flex items-center gap-1"
                          title={`关联会话 #${link.sid} 发现(active 口径)· ${SEV_BAR_KEYS.map((k, i2) => `${k} ${sevCounts[i2]}`).join(' · ')}`}>
                          {['critical', 'high', 'medium'].map((sv, i2) => (
                            <span key={sv} className={`inline-flex rounded-control px-1 py-0.5 text-meta font-semibold tnum ${
                              sv === 'critical' ? 'bg-jz-sev-critical/10 text-jz-sev-critical'
                                : sv === 'high' ? 'bg-jz-sev-high/10 text-jz-sev-high'
                                : 'bg-jz-sev-medium/10 text-jz-sev-medium'}`}>{sevCounts[i2]}</span>
                          ))}
                        </span>
                      ) : <span className="text-meta text-jz-muted">—</span>}
                    </td>
                    <td className="py-2">
                      {/* R128: 关联渗透会话列全面实义化——有关联=会话链;已完成未关联=发起渗透(真建会话直入工作台);
                          未完成=未就绪胶囊(后端 409 守卫同语义,诚实标注原因)。「待关联作战」静态占位退役 */}
                      {link ? (
                        <button onClick={() => goSession(r)} data-apk-session={link.sid}
                          className="inline-flex items-center gap-1 text-meta text-jz-brand hover:underline"
                          title={`进入会话 #${link.sid} 工作台`}>
                          <span className="w-1.5 h-1.5 rounded-pill bg-jz-teal flex-none" />
                          会话 #{link.sid}
                        </button>
                      ) : r.status === 'done' ? (
                        <button onClick={() => launchPentest(r)} data-launch-pentest={r.id} disabled={creatingTid != null}
                          className="inline-flex items-center gap-1 rounded-control bg-jz-brand/10 px-2 py-0.5 text-meta font-semibold text-jz-brand hover:bg-jz-brand/20 transition-colors disabled:opacity-50 disabled:cursor-wait"
                          title={`对已完成审计 #${r.id} 发起渗透会话并进入工作台`}>
                          {creatingTid === r.id ? '创建中…' : '+ 发起渗透'}
                        </button>
                      ) : (
                        <span className="inline-flex rounded-control bg-jz-surface-2 px-2 py-0.5 text-meta text-jz-muted"
                          title={`任务状态 ${r.status || '未知'}——仅已完成审计可发起渗透,可先到任务中心查看进度`}>未就绪</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      {/* R128: 动作列全行实义——有关联=下钻工作台;无关联=查看任务详情(/tasks?focus=N 深链,复用 R94-1) */}
                      {link
                        ? <button onClick={() => goSession(r)} data-drill-btn
                            className="w-7 h-7 rounded-control inline-flex items-center justify-center text-jz-muted hover:text-jz-brand hover:bg-jz-brand/10 transition-colors"
                            title={`下钻工作台(会话 #${link.sid})`}>
                            <ArrowUpRight size={14} />
                          </button>
                        : <button onClick={() => nav(`/tasks?focus=${r.id}`)} data-apk-view-task={r.id}
                            className="w-7 h-7 rounded-control inline-flex items-center justify-center text-jz-muted hover:text-jz-brand hover:bg-jz-brand/10 transition-colors"
                            title={`查看任务详情(#${r.id},产物与报告在任务中心)`}>
                            <ArrowUpRight size={14} />
                          </button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
