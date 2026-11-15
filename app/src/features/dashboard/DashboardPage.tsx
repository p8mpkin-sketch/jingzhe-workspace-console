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
import {
  Page, PageHeader, Panel, DataTable, Button, IconButton, StatusBadge, Tag, Tabs, SegmentedControl, EmptyState,
  StaleNotice, SkeletonLoader, toast, cx, tokenColor, tokenPx, useThemeVersion, SignalPanel, MetricList, ChartPanel,
} from '@/components/ui';
import type { Column, TabItem } from '@/components/ui';
import { moduleLabel } from '@/layout/navigation';
import { Database, Activity, Radar, List, Zap, ArrowUpRight, RefreshCw, Plus, Boxes, ShieldAlert, Cpu } from 'lucide-react';

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
const SEV_TOKEN = { critical: 'sev-critical', high: 'sev-high', medium: 'sev-medium', low: 'sev-low', info: 'sev-info' } as const;
const SEV_SWATCH: Record<string, string> = { critical: 'bg-jz-sev-critical', high: 'bg-jz-sev-high', medium: 'bg-jz-sev-medium', low: 'bg-jz-sev-low', info: 'bg-jz-sev-info' };
const SEV_NAME: Record<string, string> = { critical: '严重', high: '高', medium: '中', low: '低', info: '提示' };
/** Chart chrome from the jz tokens, read at draw time so both themes follow the stylesheet. */
const chartChrome = () => ({
  split: [tokenColor('surface'), tokenColor('surface-2')], line: tokenColor('border'), label: tokenColor('ink-2'), muted: tokenColor('muted'),
  brand: tokenColor('brand'), brandArea: tokenColor('brand', 0.18),
});
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
    : score >= 75 ? 'text-jz-teal' : score >= 45 ? 'text-jz-amber' : 'text-jz-red';

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
  const tv = useThemeVersion();   // re-read token colors after the theme class changes
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
    const cc = chartChrome();
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
            splitArea: { areaStyle: { color: cc.split } },
            axisLine: { lineStyle: { color: cc.line } },
            axisName: { color: cc.label, fontSize: tokenPx('chart-label') },
            splitLine: { lineStyle: { color: cc.line } },
          },
          series: [{
            type: 'radar', symbolSize: 4,
            data: [{ value: aggRadar.scores, name: '跨会话合规均值',
              areaStyle: { color: cc.brandArea },
              lineStyle: { color: cc.brand }, itemStyle: { color: cc.brand } }],
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
          splitArea: { areaStyle: { color: cc.split } },
          axisLine: { lineStyle: { color: cc.line } },
          axisName: { color: cc.label, fontSize: tokenPx('chart-label') },
          splitLine: { lineStyle: { color: cc.line } },
        },
        series: [{
          type: 'radar', symbolSize: 4,
          data: [{ value: radarCounts, name: '发现分布',
            areaStyle: { color: cc.brandArea },
            lineStyle: { color: cc.brand }, itemStyle: { color: cc.brand } }],
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
            axisLabel: { color: cc.label, fontSize: tokenPx('chart-tick'), interval: 0, rotate: 36 },
            axisLine: { lineStyle: { color: cc.line } },
            axisTick: { show: false },
          },
          yAxis: {
            type: 'value',
            axisLabel: { color: cc.muted, fontSize: tokenPx('chart-tick') },
            splitLine: { lineStyle: { color: cc.line } },
          },
          series: SEV_ORDER.map((sv) => ({
            type: 'bar', stack: 'total', barMaxWidth: 16,
            data: domNames.map((n) => domSev[n][sv] || 0),
            itemStyle: { color: tokenColor(SEV_TOKEN[sv]) }, name: SEV_NAME[sv],
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
  }, [sid, theme, tv, radarMode, aggRadar]);   // R103-1: 主题切换重绘;R104-3②: 口径/聚合数据变化重绘

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

  const [sumErr, setSumErr] = useState(false);
  const [apkLoading, setApkLoading] = useState(true);
  // Same requests, same order as before; failures are now recorded so the page can say the numbers may be incomplete.
  const loadSummary = useCallback(() => {
    setSumErr(false);
    const fail = () => setSumErr(true);
    api<any>('/api/tasks-summary').then(setGlob).catch(() => { setGlob((g) => g ?? {}); fail(); });
    api<any>('/api/tasks/batch-unpack-summary').then(setUnpk).catch(fail);
    api<any>('/api/pentest/vulns/severity-summary').then(setSev).catch(() => { setSev((v: any) => v ?? {}); fail(); });
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
      setAi({ activeModel: active ? [active.label || active.vendor || active.name, active.model].filter(Boolean).join(' · ') : rt?.routing?.inference || undefined,
              enabled: providers.filter((p: any) => p.enabled !== false).length, total: providers.length });
    });
    api<any[]>('/api/tasks?limit=500').then((rows) => {
      setApkRows((rows || []).filter((r: any) => r.kind === 'audit').slice(0, 10));
    }).catch(fail).finally(() => setApkLoading(false));
    loadSessMap();
  }, [loadSessMap]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

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
    if (!glob || !ringRef.current) return;
    const done = glob.done ?? 0, failed = glob.failed ?? 0, running = glob.running ?? 0;
    const inst = echarts.init(ringRef.current, undefined, { renderer: 'canvas' });
    // R117-5②: 零数据静默灰环——全 0 时不再以 0.001 ε 值渲染三色残丝(视觉噪声),
    // 改单段静默灰环如实呈现「零任务」态;有数据时三段真值原样(除零防护本就在位)。
    const allZero = done + failed + running === 0;
    inst.setOption({
      backgroundColor: 'transparent',
      series: [{
        type: 'pie', radius: ['62%', '88%'], label: { show: false }, silent: true,
        data: allZero
          ? [{ value: 1, itemStyle: { color: tokenColor('surface-2') } }]
          : [
            { value: done || 0.001, itemStyle: { color: tokenColor('teal') } },
            { value: failed || 0.001, itemStyle: { color: tokenColor('red') } },
            { value: running || 0.001, itemStyle: { color: tokenColor('brand') } },
          ],
      }],
    });
    return () => { inst.dispose(); };
  }, [glob, tv]);

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

  const gradeTone = (g: string): 'success' | 'neutral' | 'attention' | 'danger' => (g === 'A' || g === 'B' ? 'success' : g === 'C' ? 'neutral' : g === 'D' ? 'attention' : 'danger');
  const critN = Number(sev?.by_severity?.critical ?? 0);
  const feedTabs: TabItem<'all' | 'findings' | 'errors'>[] = feed ? ([['all', '全部'], ['findings', '有发现'], ['errors', '异常']] as const).map(([id, label]) => ({
    key: id, label,
    count: id === 'all' ? feed.events.length : feed.events.filter((e: any) => (id === 'findings' ? feedFinding(e) : feedIsError(e))).length,
    dataAttrs: { 'data-feed-filter-id': id },
  })) : [];
  const radarTabs: TabItem<'all' | 'session'>[] = radarModeOptions.map((o) => ({ key: o.id as 'all' | 'session', label: o.label, dataAttrs: { 'data-radar-mode-opt': o.id } }));

  const assetCols: Column<any>[] = [
    { key: 'app', header: '应用', card: 'title', cell: (r) => (
      <span className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-control bg-jz-surface-2 text-label font-semibold text-jz-ink-2">
          {(r.app_name || r.package || 'A').slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block max-w-48 truncate text-label font-semibold text-jz-ink">{r.app_name || r.package || '—'}</span>
          <span className="block max-w-56 truncate font-mono text-meta text-jz-muted" title={r.package || ''}>#{r.id} {r.package || ''}</span>
        </span>
      </span>
    ) },
    { key: 'packer', header: '加固', cell: (r) => {
      const pk = String(r.packer || '').trim();
      return pk && pk !== 'none' ? <Tag title={`加固类型:${pk}`}>{PACKER_LABEL[pk] || pk}</Tag> : <span className="text-meta text-jz-muted" title="没有检测到加固">无加固</span>;
    } },
    { key: 'grade', header: <span title="依据会话的风险分:A≥90,B≥75,C≥60,D≥45,E≥30,F<30。没有会话的任务没有评分。">评级</span>, label: '评级', cell: (r) => {
      const gd = grade(rowScore[r.id]);
      return gd ? (
        <span className="inline-flex items-center gap-1.5" title={`风险分 ${rowScore[r.id]}`}>
          <StatusBadge tone={gradeTone(gd.g)}>{gd.g}</StatusBadge>
          <span className="font-mono text-meta tnum text-jz-ink-2">{Number(rowScore[r.id])} 分</span>
        </span>
      ) : <span className="text-meta text-jz-muted" title="没有关联会话,无法评分">未评估</span>;
    } },
    { key: 'sev', header: <span title="关联会话中待确认和已确认的发现,依次为严重、高、中">发现 (严重/高/中)</span>, label: '发现', cell: (r) => {
      const link = sessMap[r.id];
      const sentry = link ? rowSev[link.sid] : null;
      const sevCounts = sentry ? SEV_BAR_KEYS.map((k) => sentry[k]?.active || 0) : null;
      if (!sevCounts) return <span className="text-meta text-jz-muted">—</span>;
      return (
        <span className="inline-flex items-center gap-2 font-mono text-meta tnum" title={`会话 #${link.sid}:${SEV_BAR_KEYS.map((k, i) => `${k} ${sevCounts[i]}`).join(' · ')}`}>
          {sevCounts.slice(0, 3).map((n, i) => <span key={i} className={n > 0 ? 'font-semibold text-jz-ink' : 'text-jz-muted'}>{n}</span>)}
        </span>
      );
    } },
    { key: 'session', header: '渗透会话', cell: (r) => {
      const link = sessMap[r.id];
      if (link) return <Button size="sm" variant="ghost" onClick={() => goSession(r)} data-apk-session={link.sid} title={`打开会话 #${link.sid}`}>会话 #{link.sid}</Button>;
      if (r.status === 'done') return (
        <Button size="sm" variant="secondary" onClick={() => launchPentest(r)} data-launch-pentest={r.id} disabled={creatingTid != null} loading={creatingTid === r.id}
          title={`为评估 #${r.id} 创建渗透会话并打开`}>{creatingTid === r.id ? '创建中…' : '创建会话'}</Button>
      );
      return <span className="text-meta text-jz-muted" title={`任务状态:${r.status || '未知'}。评估完成后才能创建会话。`}>未完成</span>;
    } },
    { key: 'go', header: <span className="sr-only">打开</span>, label: '打开', align: 'right', card: 'action', cell: (r) => {
      const link = sessMap[r.id];
      return link
        ? <IconButton size="sm" label={`打开会话 #${link.sid}`} onClick={() => goSession(r)} data-drill-btn><ArrowUpRight size={16} aria-hidden /></IconButton>
        : <IconButton size="sm" label={`在任务页查看 #${r.id}`} onClick={() => nav(`/tasks?focus=${r.id}`)} data-apk-view-task={r.id}><ArrowUpRight size={16} aria-hidden /></IconButton>;
    } },
  ];

  return (
    <Page data-dashboard-page>
      <PageHeader title={moduleLabel('/dashboard')} description="评估、渗透会话和发现的整体情况。"
        eyebrow={<span data-dashboard-eyebrow>{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}{me?.username ? ` · ${me.username}` : ''}</span>}
        meta={isAdmin && (nodes || []).length > 0 ? (
          <span className="flex flex-wrap items-center gap-2" data-node-strip>
            <span className="text-meta text-jz-muted">执行节点</span>
            {(nodes || []).slice(0, 6).map((n: any) => (
              <span key={n.node_id} title={`上次心跳 ${Math.max(0, Math.round(Date.now() / 1000 - (n.last_seen || 0)))} 秒前 · 设备:${(n.devices || []).join(', ') || '—'}`}>
                <StatusBadge tone={n.online ? 'success' : 'neutral'}>
                  <span className="font-mono">{n.node_id}</span> · {(n.devices || []).length} 台设备{n.online ? '' : ' · 离线'}
                </StatusBadge>
              </span>
            ))}
          </span>
        ) : undefined}
        actions={(
          <>
            <Button variant="secondary" icon={<RefreshCw size={16} aria-hidden />} onClick={loadSummary} data-dashboard-refresh>刷新</Button>
            <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => nav('/new-audit')} data-dashboard-new>新建评估</Button>
          </>
        )} />

      {sumErr && <StaleNotice reason="部分汇总数据没有加载成功,显示的数字可能不完整。" onRefresh={loadSummary} />}

      {/* Row 1: the one operational signal (the queue) leads; supporting metrics are a quiet list beside it. */}
      <div className="grid grid-cols-1 gap-6 desktop:grid-cols-12" data-kpi-row>
        <SignalPanel className="desktop:col-span-8" data-queue-signal loading={glob === null && !sumErr}
          question="评估队列现在的状态"
          value={<span data-running-num>{glob?.running ?? '—'}</span>}
          statement={glob && glob.running == null ? '队列数据没有加载成功，暂时无法判断运行和失败情况。' : glob ? <>个任务正在运行，<span className="tnum" data-queued-num>{queued ?? '—'}</span> 个排队。{(glob.failed ?? 0) > 0 ? `${glob.failed} 个失败的任务需要查看原因。` : '没有失败的任务。'}</> : '正在读取队列。'}
          actions={(glob?.failed ?? 0) > 0
            ? <Button size="sm" variant="secondary" onClick={() => nav('/tasks?status=failed')} data-summary-failed>查看失败任务 <span className="tnum">{glob?.failed}</span></Button>
            : undefined}
          breakdown={[
            { label: '排队', value: queued ?? '—' },
            { label: '失败', value: glob?.failed ?? '—', tone: (glob?.failed ?? 0) > 0 ? 'attention' : 'default' },
            { label: '已完成', value: glob?.done ?? '—' },
            { label: <span title="成功率 = 完成 / (完成 + 失败)。运行中和排队中的任务不计入。">任务成功率</span>,
              value: <span className="inline-flex items-center gap-2"><span ref={ringRef} className="h-6 w-6 flex-none" data-status-ring aria-hidden />{rate}</span>,
              tone: rate === '—' ? 'default' : parseInt(rate, 10) >= 90 ? 'success' : 'attention' },
          ]}>
          <div data-live-workflows>
            <div className="flex items-center justify-between gap-3 px-6 pt-4">
              <h3 className="flex items-center gap-2 text-label font-semibold text-jz-ink"><Activity size={14} aria-hidden className="text-jz-muted" />正在运行 <span className="font-normal text-jz-muted">· 每 30 秒刷新</span></h3>
              <Button size="sm" variant="ghost" onClick={() => nav('/tasks')} data-lw-goto-tasks>全部任务<ArrowUpRight size={14} aria-hidden /></Button>
            </div>
            {runningTasks.length > 0 ? (
              <ul className="divide-y divide-jz-border px-6 pb-2">
                {runningTasks.slice(0, 4).map((t: any) => {
                  const hit = sessMap[t.id];
                  return (
                    <li key={t.id} data-live-lane={t.id} className="flex min-w-0 items-center gap-3 py-2.5">
                      <span className="flex-none font-mono text-meta tnum text-jz-muted">#{t.id}</span>
                      <span className="w-36 flex-none truncate text-label font-semibold text-jz-ink" title={t.app_name || t.package || ''}>{t.app_name || t.package || '—'}</span>
                      <span className="min-w-0 flex-1 truncate text-meta text-jz-muted" title={t.progress || '还没有上报进度'}>{t.progress || '正在执行，还没有上报进度'}</span>
                      <span className="hidden flex-none font-mono text-meta tnum text-jz-ink-2 tablet:inline" title="从创建到现在">{fmtDur(now - t.created_at)}</span>
                      {hit
                        ? <Button size="sm" variant="ghost" icon={<ArrowUpRight size={14} aria-hidden />} onClick={() => nav(`/pentest/project/${hit.pid}/session/${hit.sid}`)} data-lw-goto-session={t.id}>会话</Button>
                        : <Tag mono>{t.kind || 'audit'}</Tag>}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="px-6 pb-4 pt-2 text-label text-jz-muted">{glob && glob.running == null ? '运行中的任务暂时无法读取。' : '现在没有运行中的任务。'}</p>}
          </div>
        </SignalPanel>

        <MetricList className="desktop:col-span-4" title="其他指标" loading={false} items={[
          { key: 'asset', label: '评估资产', icon: <Boxes aria-hidden />,
            value: glob === null && !sumErr ? '…' : <span data-kpi-asset><span data-kpi-total>{glob?.total ?? '—'}</span></span>,
            hint: <>已完成 <span className="tnum">{glob?.done ?? '—'}</span> · 失败 <span className="tnum">{glob?.failed ?? '—'}</span> · 脱壳完成 <span className="tnum">{coverage != null ? `${coverage}%` : '—'}</span></> },
          { key: 'sev', label: <span title="待确认和已确认的发现，不含已排除的。">严重 / 高 发现</span>, icon: <ShieldAlert aria-hidden />, tone: critN > 0 ? 'danger' : 'default',
            value: sev === null && !sumErr ? '…' : <span data-sev-card><span data-critical-num>{sev?.by_severity?.critical ?? '—'}</span><span className="text-jz-muted"> / </span><span data-high-num>{sev?.by_severity?.high ?? '—'}</span></span>,
            hint: <>共 <span className="tnum">{sev?.total_active ?? '—'}</span> 项 · 来自 <span className="tnum">{sev?.sessions_scanned ?? '—'}/{sev?.sessions_total ?? '—'}</span> 个会话</> },
          { key: 'model', label: '模型', icon: <Cpu aria-hidden />,
            value: ai === null ? '…' : ai?.gated ? <span className="text-label text-jz-muted" data-ai-gated>仅管理员可见</span>
              : <span data-ai-enabled-num>{ai?.enabled ?? '—'}<span className="text-label text-jz-muted">/{ai?.total ?? '—'}</span></span>,
            hint: ai?.gated ? '连接状态可在系统页查看' : <span data-ai-model title={`当前模型：${ai?.activeModel || '未配置'}。可在系统页切换。`}>已启用 · 当前 {ai?.activeModel || '未配置'}</span> },
          { key: 'sessions', label: '未关闭的会话', icon: <Zap aria-hidden />,
            value: feed?.sessions_scanned ?? '—', hint: '会话事件在下方，每 8 秒刷新' },
        ]} />
      </div>

      {/* Row 2: the chart answers one question; the event feed beside it is bounded to the chart's height. */}
      <div className="grid grid-cols-1 gap-6 desktop:grid-cols-12">
        <ChartPanel className="desktop:col-span-8" data-radar-panel
          question={radarSessionView ? `会话 #${sid} 的发现集中在哪些域？` : '哪些合规域的发现最多？'}
          method={radarSessionView
            ? (unmapped > 0 ? `会话 #${sid} 的发现数；${unmapped} 条没有标准域，计入“其他”。` : `会话 #${sid} 的发现数，全部已按域归类。`)
            : `按 MASTG 域聚合 ${aggRadar.counted}/${aggRadar.scanned} 个有发现的会话。合规均分 = 1 − 该域发现 / 全部发现。`}
          actions={radarTabs.length > 1 ? <SegmentedControl items={radarTabs} value={radarMode} onChange={setRadarMode} label="数据范围" /> : undefined}
          empty={!radarSessionView && domainStats.reduce((n, r) => n + r.count, 0) === 0}
          emptyState={<div data-radar-empty className="flex h-full min-h-48 flex-col items-center justify-center gap-2">
            <span data-radar-mode={radarMode} data-radar-counted={aggRadar.counted} hidden />
            <EmptyState compact icon={Radar} title="还没有可以按域归类的发现"
              cause={`已扫描 ${aggRadar.scanned} 个会话，没有活跃发现。会话产生发现后，这里会按 ${DOMAINS.length + 1} 个域显示分布。`} />
            <p className="text-meta text-jz-muted" data-mastg-capsule>{DOMAINS.length + 1} 个域（8 个标准域和“其他”）共 <span className="font-mono tnum">0</span> 项发现。</p>
          </div>}>
          <span data-radar-mode={radarMode} data-radar-counted={aggRadar.counted} hidden />
          <div className="h-5 font-mono text-meta tnum text-jz-ink-2" data-radar-hover aria-live="polite">
            {hoverName && hoverVal != null
              ? (radarSessionView ? `${hoverName} · 发现 ${hoverVal}` : `${hoverName} · 合规均分 ${hoverVal}% · 发现 ${hoverCount}`)
              : <span className="text-jz-muted">把鼠标移到图上查看各域的数值{radarSessionView ? '，点击可查看该域的发现' : ''}</span>}
          </div>
          <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-2">
            <div ref={ref} className="h-64" role="img" aria-label={radarSessionView ? `会话 #${sid} 各域发现数雷达图` : '各域合规均分雷达图'} />
            {radarSessionView ? (
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-jz-muted">
                  <span>各域按严重度</span>
                  {SEV_ORDER.map((sv) => (
                    <span key={sv} className="inline-flex items-center gap-1">
                      <span aria-hidden className={cx('inline-block h-2 w-2 rounded-tag', SEV_SWATCH[sv])} />{SEV_NAME[sv]}
                    </span>
                  ))}
                </div>
                <div ref={barRef} className="h-56" data-sev-bar role="img" aria-label="各域按严重度的发现数" />
              </div>
            ) : (
              <div className="space-y-3" data-domain-top>
                <h3 className="text-label font-semibold text-jz-ink">发现最多的 5 个域</h3>
                {topDomains.map((r) => (
                  <div key={r.name} title={`${r.name}:发现 ${r.count} 项 · 合规均分 ${aggRadar.counted > 0 ? `${r.score}%` : '无法计算(没有发现)'}。≥75 良好,45–74 需关注,<45 较差。`}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-label">
                      <span className="min-w-0 truncate font-medium text-jz-ink">
                        {r.name}
                        <span className={cx('ml-1.5 font-mono text-meta tnum', healthCls(r.score, aggRadar.counted > 0))}>{aggRadar.counted > 0 ? r.score : '—'}</span>
                      </span>
                      <span className="flex-none font-mono text-meta tnum text-jz-ink-2">{r.count} 项</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-pill bg-jz-surface-2">
                      <div className="h-full rounded-pill bg-jz-brand" style={{ width: `${Math.round((r.count / topMax) * 100)}%` }} />
                    </div>
                  </div>
                ))}
                {restCount > 0 && <p className="text-meta text-jz-muted">其余 {restDomains.length} 个域共 {restCount} 项,完整分布见雷达图。</p>}
                <p className="border-t border-jz-border pt-3 text-meta text-jz-muted" data-mastg-capsule>
                  {DOMAINS.length + 1} 个域(8 个标准域和“其他”)共 <span className="font-mono tnum text-jz-ink-2">{domainStats.reduce((s, r) => s + r.count, 0)}</span> 项发现。
                </p>
              </div>
            )}
          </div>
        </ChartPanel>

        <div className="relative min-w-0 desktop:col-span-4">
        <Panel flush title="会话事件" description={feed && feed.sessions_scanned != null ? `${feed.sessions_scanned} 个未关闭的会话,每 8 秒刷新` : '每 8 秒刷新'} data-live-feed
          className="flex min-h-0 flex-col max-desktop:h-[28rem] desktop:absolute desktop:inset-0" bodyClassName="flex min-h-0 flex-1 flex-col">
          {feed && feed.events.length > 0 && (
            <div className="px-4 pt-1" data-feed-filter>
              <Tabs items={feedTabs} value={feedFilter} onChange={setFeedFilter} label="按事件类型筛选" />
            </div>
          )}
          {!feed ? (
            <div className="p-4"><SkeletonLoader variant="table" rows={5} /></div>
          ) : shownFeed.length === 0 ? (
            <div data-feed-empty className="flex flex-1 items-center justify-center">
              <EmptyState compact icon={Zap}
                title={feed.events.length === 0 ? '没有会话事件' : '没有符合条件的事件'}
                cause={feed.events.length === 0 ? '未关闭的会话产生进度事件后会显示在这里。' : '换一个筛选看看。'} />
            </div>
          ) : (
            <ol className="min-h-0 flex-1 divide-y divide-jz-border overflow-auto" data-feed-list aria-live="off">
              {shownFeed.map(({ e, k, fnd, skip, err }: any) => (
                <li key={k} data-feed-row={k} data-feed-finding={fnd ? '1' : '0'} className={cx('flex items-start gap-3 px-4 py-2.5', freshFeedKeys.has(k) && 'feed-row-in')}>
                  <span className="flex-none pt-0.5 font-mono text-meta tnum text-jz-muted" title={String(e.ts ?? '—')}>{formatFeedTs(e.ts)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <StatusBadge tone={fnd ? 'danger' : err ? 'attention' : skip ? 'neutral' : 'brand'} title={`事件类型:${e.type || '无'}${feedTarget(e) ? ` · ${feedTarget(e)}` : ''}`}>
                        {fnd ? '有发现' : err ? '异常' : skip ? '跳过' : '执行'}
                      </StatusBadge>
                      <span className="font-mono text-meta text-jz-muted">#{e.sid}</span>
                    </span>
                    <span className="mt-1 block truncate text-label text-jz-ink-2" title={feedText(e)}>{feedText(e)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
        </div>
      </div>

      <Panel flush title={<span className="flex items-center gap-2"><List size={16} aria-hidden className="text-jz-muted" />最近的评估</span>}
        description={apkRows.length ? `最近 ${apkRows.length} 个评估任务` : undefined}
        actions={<Button size="sm" variant="ghost" onClick={() => nav('/tasks')} data-assets-goto-tasks>全部任务</Button>}>
        <div data-apk-list>
          <DataTable<any> label="最近的评估" columns={assetCols} rows={apkRows} rowKey={(r) => r.id} stickyHeader={false}
            rowDataAttrs={(r) => ({ 'data-apk-row': r.id })}
            state={apkRows.length === 0 ? (
              apkLoading ? <div className="p-4"><SkeletonLoader variant="table" rows={4} /></div>
                : <EmptyState icon={Database} title="还没有评估" cause="创建评估后,最近的任务会显示在这里。"
                    action={<Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => nav('/new-audit')}>新建评估</Button>} />
            ) : undefined} />
        </div>
      </Panel>
    </Page>
  );
};

export default DashboardPage;
