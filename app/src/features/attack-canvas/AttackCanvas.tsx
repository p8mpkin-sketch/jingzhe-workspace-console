import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, MiniMap, Panel,
  useNodesState, useEdgesState, useReactFlow,
  type Node, type Edge, type NodeProps, Handle } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ChevronUp, Download, FileJson, Plus, Minus, Scan, LayoutGrid, Shield } from 'lucide-react';
import { toPng } from 'html-to-image';
import { api } from '@/services/api';
import { usePentest } from '@/stores/pentest';
import { useTheme } from '@/theme/ThemeContext';
// R108-2①②: 三件套接入——graph===null(首载)呈 SkeletonLoader 图表骨架(替既有裸 pulse 骨架);
// graph.nodes 为空呈 EmptyStatePlaceholder(文案沿既有「攻击面画布还是空的——等待 autopilot 侦察产出」逐字)。
// 冻结疆域口径: 仅替换既有 loading/empty 呈现,装配层与数据消费零触碰(R108 全局红线 2)。
import { EmptyStatePlaceholder, SkeletonLoader, UnifiedModal } from '@/components/ui';

/* R105-3(指令3)模块3 作战画布 V3: React Flow(@xyflow/react v12)重构。
 * 红线 2①: 本轮只动 UI 展示层+交互接线 —— 节点/边数据构造、利用链链表、R41 聚合/下钻、
 * 折叠(FOLD/CAP)、LAYERS 分层排序、严重度/三态语义全部【只读消费】既有逻辑(下方标注
 * 「数据面(冻结)」的代码块与旧版逐字同源,行为不变);后端 /graph 与 pentest/graph_builder.py 零触碰。
 * ① 滚轮缩放/拖拽平移/Fit View + 左浮工具坞(+/-/适应/智能重排=既有简单分层重排,不引布局库)
 *    + 右下半透明 Minimap;② 节点卡重塑: 根卡=图标+包名+攻击面计数(端点 node_counts 真值)/
 *    组件=exported 琥珀描边(真值: 本图仅绘导出组件,graph_builder 自 exported_components)+ctype 角标
 *    (permission_protected=false 红点警示沿用旧语义)/接口=等宽 Path 采样(graph 数据面无 Method 字段,
 *    诚实不编造)/发现=严重度徽章(无 CVSS 字段,不编评分)+红光/确认/排除三态;③ 边=贝塞尔+链边静态辉光
 *    (运行态流数据源不存在,不假造流动);④ 单击=平滑聚焦+上下游高亮+他节点降透明+写 inspectorTarget
 *    (R105-2 契约红线 4①);双击=UnifiedModal 反编译源码切片(既有 /api/chat/source 数据链)。
 * 视觉编码常量(TYPE_STYLE/SEV)沿 R39 原值 —— 既有画布色板语义不变。
 * R107-5(指令5)布局装配层拉开: 层间距 56→120/垂直步距 ROW=典型卡高72+24=96/节点宽 220+p-3 微排版(正文 12px 标题加粗,
 * 关联数浅灰等宽微徽标)/AppCard 高度自适应;进入/切至画布 Tab 自动平滑 fitView({padding:.2,duration:400})与
 * fit 钮/智能重排合并为单一 fit()。数据面(冻结)块零触碰 —— 聚合/下钻/LAYERS 排序/FOLD 折叠语义逐字保留。 */

// ───────────────────────── 数据面(冻结) ─────────────────────────
const TYPE_STYLE: Record<string, { col: string; kind: string; dash?: boolean; mono?: boolean }> = {
  app: { col: 'rgb(var(--jz-brand))', kind: '目标' },
  component: { col: 'rgb(var(--jz-teal))', kind: '组件' },
  deeplink: { col: 'rgb(var(--jz-teal))', kind: '深链', dash: true },
  api_group: { col: 'rgb(var(--jz-brand))', kind: '接口组', mono: true },
  key: { col: 'rgb(var(--jz-amber))', kind: '密钥', mono: true },
  approval: { col: 'rgb(var(--jz-orange))', kind: '审批' },
  finding: { col: 'rgb(var(--jz-ink-2))', kind: '发现' },
  more: { col: 'rgb(var(--jz-muted))', kind: '更多', dash: true },
};
const TYPE_ICON: Record<string, string> = { app: '📱', component: '🧩', deeplink: '🔗', api_group: '🔌', key: '🔑', approval: '🛡', finding: '🎯', more: '…' };
const SEV: Record<string, string> = { critical: 'rgb(var(--jz-sev-critical))', high: 'rgb(var(--jz-sev-high))', medium: 'rgb(var(--jz-sev-medium))', low: 'rgb(var(--jz-sev-low))', info: 'rgb(var(--jz-sev-info))' };
const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const LAYERS = [
  { key: 'target', title: '目标', types: ['app'] },
  { key: 'surface', title: '攻击面', types: ['component', 'deeplink'] },
  { key: 'asset', title: '接口/资产', types: ['api_group', 'key'] },
  { key: 'approve', title: '审批', types: ['approval'] },
  { key: 'finding', title: '发现', types: ['finding'] },
];
const FOLD = 12, CAP = 60;   // 折叠语义冻结(R105-3 契约: 阈值 12/60 零改动)——NW/NH/ROW 属布局装配层,R107-5 移至下方常量段

interface GNode { id: string; type: string; label: string; severity?: string; state?: string; meta?: any; }
interface GEdge { from: string; to: string; type: string; }
interface GraphData { nodes: GNode[]; edges: GEdge[]; chains?: any[]; node_counts?: Record<string, number>; }
// ────────────────────────────────────────────────────────────────

// ───────────── 布局装配层(R107-5 指令5: 仅间距/尺寸/fitView 调参;聚合/排序/FOLD 折叠语义冻结零触碰) ─────────────
const NW = 220;               // ② 节点宽统一 220px(R105-3 为 200)
const NH = 60;                // 名义高: 仅冻结块 pos 元数据 h:NH 沿用(消费端不读,值不动保冻结块零 diff 语义)
const GAP_Y = 24;             // ① 垂直节点间距 →24px(R105-3 步距内收仅 12px)
const CARD_H = 72;            // 微排版后典型卡高(高度自适应含头带;步距/聚焦算距按此口径,探针实测实距)
const ROW = CARD_H + GAP_Y;   // 垂直步距 96(卡高自适应,实距随内容浮动,探针实测口径)
const GAP_X = 120;            // ① 水平层级间距 →120px(R105-3 为 56);worldW 同步,防右侧长列溢出
// R319: 密度模式常量(紧凑: 宽 -32%/行距 -25%/列距 -33%,同屏信息量约 +40%;
// 冻结口径: FOLD/CAP/排序/聚合语义不动,仅装配层尺寸)
const NW_D = 150, ROW_D = 72, GAP_X_D = 80;

const trunc = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
/** R105-3: 新增图形(Background/Minimap)配色从设计令牌解析 —— 零新增裸 hex;主题切换即时生效 */
const cssVar = (name: string, alpha = 1): string | undefined => {
  const t = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parts = t.split(/\s+/).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return undefined;
  const [r, g, b] = parts;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgb(${r},${g},${b},${alpha})`;
};
const PACKER_LABEL: Record<string, string> = { none: '无壳', '360_jiagu': '360加固', ijiami: '爱加密' };

// ── ② 节点卡(RF 自定义节点;全部只读消费 GNode 真值) ──
interface CardData { g: GNode; dim?: boolean; sel?: boolean; }
const NCard: React.FC<{ children: React.ReactNode; d: CardData; accent: string; emphasis?: boolean; dash?: boolean; style?: React.CSSProperties }> =
({ children, d, accent, emphasis, dash, style }) => (
  <div data-node-id={d.g.id}
    style={{
      width: 'var(--ac-nw, 220px)', border: `1.3px ${dash ? 'dashed' : 'solid'} ${accent}`,
      borderLeftWidth: 4, borderRadius: 'var(--jz-radius-card)', opacity: d.dim ? 0.16 : 1,
      boxShadow: d.sel ? '0 0 0 2px rgb(var(--jz-brand))' : undefined, borderWidth: emphasis ? 2 : undefined,
      transition: 'opacity .2s, box-shadow .2s',
      ...style,
    }}
    className="bg-jz-surface-2/80 overflow-hidden select-none">
    {children}
    {/* R315: v12 EdgeRenderer 需节点含 Handle 才计算连接点——自定义卡零 Handle
        导致边全部不渲染(存量断裂,最小边试验实证 {id,source,target} 也不出);
        隐藏样式不参与视觉(nodesConnectable=false 不可拖连) */}
    <Handle type="target" position={'left' as any} style={{ visibility: 'hidden', pointerEvents: 'none' }} isConnectable={false} />
    <Handle type="source" position={'right' as any} style={{ visibility: 'hidden', pointerEvents: 'none' }} isConnectable={false} />
  </div>
);
const CardTitle: React.FC<{ t: string; mono?: boolean; size?: number }> = ({ t, mono, size = 12 }) => (
  <div className={`px-3 pt-1.5 truncate text-jz-ink ${mono ? 'font-mono' : 'font-semibold'}`} style={{ fontSize: size }}>{t}</div>
);
const CardRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-3 pt-1 pb-2 flex items-center gap-1.5 text-meta text-jz-muted min-w-0">{children}</div>
);
const CardHead: React.FC<{ label: React.ReactNode; color: string; right?: React.ReactNode }> = ({ label, color, right }) => (
  // R117-3②: 铬饰去硬编码——rgba(255,255,255,·) 白系底在亮色模式不可辨,改 --jz-canvas token 双模带
  <div className="h-5 flex items-center gap-1.5 px-3" style={{ background: 'rgb(var(--jz-canvas) / 0.45)' }}>
    <span className="text-meta" style={{ color }}>{label}</span>
    {right}
  </div>
);

const AppCard = ({ data }: NodeProps) => {
  const d = data as unknown as CardData; const m = d.g.meta || {};
  const c = (d as any).counts || {};
  const accent = TYPE_STYLE.app.col;
  return (
    <NCard d={d} accent={accent}>
      <CardHead label={<>📱 目标 APP</>} color={accent}
        right={m.packer ? <span className="ml-auto text-meta px-1.5 rounded-pill border border-jz-border text-jz-muted"
          title={`packer 真值: ${m.packer}`}>{PACKER_LABEL[m.packer] || m.packer}</span> : null} />
      <CardTitle t={d.g.label} />
      <CardRow>
        <span className="font-mono" title={`组件(导出) ${c.component || 0}`}>🧩{c.component || 0}</span>
        <span className="font-mono" title={`深链 ${c.deeplink || 0}`}>🔗{c.deeplink || 0}</span>
        <span className="font-mono" title={`接口组 ${c.api_group || 0}`}>🔌{c.api_group || 0}</span>
        <span className="font-mono" title={`密钥 ${c.key || 0}`}>🔑{c.key || 0}</span>
        <span className="font-mono" title={`发现 ${c.finding || 0}`}>🎯{c.finding || 0}</span>
      </CardRow>
      {(m.version || m.device) && <CardRow>
        {m.version ? <span className="font-mono truncate">v{m.version}</span> : null}
        {m.device ? <span className="font-mono truncate">{m.device}</span> : null}
      </CardRow>}
    </NCard>
  );
};

const CompCard = ({ data }: NodeProps) => {
  const d = data as unknown as CardData; const m = d.g.meta || {};
  const st = TYPE_STYLE.component;
  const unprot = m.protected === false;   // 真值警示沿用旧语义(permission_protected=false)
  return (
    <NCard d={d} accent={st.col}>
      <CardHead label={<>🧩 组件</>} color={st.col}
        right={<span className="ml-auto font-mono text-meta px-1 rounded-control" title="组件类型(真值)"
          style={{ background: 'rgb(var(--jz-canvas) / 0.55)', color: st.col }}>{m.ctype || '?'}</span>} />
      <CardTitle t={d.g.label} />
      <CardRow>
        <span className="px-1 rounded-control text-meta" title="exported=true(真值: 画布仅绘 manifest.exported_components 导出组件)"
          style={{ border: '1px solid rgb(var(--jz-amber))', color: 'rgb(var(--jz-amber-ink))' }}>exported</span>
        {unprot && <span className="text-meta" style={{ color: 'rgb(var(--jz-red))' }} title="permission_protected=false(真值)">● 无权限保护</span>}
      </CardRow>
    </NCard>
  );
};

const DlCard = ({ data }: NodeProps) => {
  const d = data as unknown as CardData; const m = d.g.meta || {};
  const st = TYPE_STYLE.deeplink;
  return (
    <NCard d={d} accent={st.col} dash>
      <CardHead label={<>🔗 深链</>} color={st.col}
        right={m.browsable != null ? <span className="ml-auto font-mono text-meta text-jz-muted" title="browsable(真值)">{String(m.browsable)}</span> : null} />
      <CardTitle t={d.g.label} />
      <CardRow><span className="font-mono truncate" title={m.uri || ''}>{trunc(String(m.uri || ''), 26)}</span></CardRow>
    </NCard>
  );
};

const ApiCard = ({ data }: NodeProps) => {
  const d = data as unknown as CardData; const m = d.g.meta || {};
  const st = TYPE_STYLE.api_group;
  const sample: string[] = m.sample || [];
  return (
    <NCard d={d} accent={st.col}>
      <CardHead label={<>🔌 接口组</>} color={st.col}
        right={m.count != null ? <span className="ml-auto font-mono text-meta px-1.5 rounded-pill text-jz-muted" style={{ background: 'rgb(var(--jz-canvas) / 0.55)' }} title={`关联接口数(真值): ${m.count}`}>{Number(m.count) > 999 ? '999+' : m.count}</span> : null} />
      <CardTitle t={d.g.label} />
      <CardRow>
        {sample.length ? <span className="font-mono truncate" title={`采样真值: ${sample.join(', ')}`}>{trunc(sample[0], 22)}</span>
          : <span className="text-jz-muted">无采样</span>}
        {/* graph 数据面无 HTTP Method 字段 —— 诚实只显 Path 采样,不编造 */}
      </CardRow>
    </NCard>
  );
};

const KeyCard = ({ data }: NodeProps) => {
  const d = data as unknown as CardData; const m = d.g.meta || {};
  const st = TYPE_STYLE.key;
  return (
    <NCard d={d} accent={st.col}>
      <CardHead label={<>🔑 密钥</>} color={st.col}
        right={m.verified != null ? <span className="ml-auto text-meta" style={{ color: m.verified ? 'rgb(var(--jz-teal-ink))' : 'rgb(var(--jz-muted))' }}
          title={`verified_exploitable(真值): ${m.verified}`}>{m.verified ? '✓ 已验证可利用' : '未验证'}</span> : null} />
      <CardTitle t={d.g.label} mono />
    </NCard>
  );
};

const ApprCard = ({ data }: NodeProps) => {
  const d = data as unknown as CardData; const m = d.g.meta || {};
  const st = TYPE_STYLE.approval;
  return (
    <NCard d={d} accent={st.col}>
      <CardHead label={<>🛡 审批</>} color={st.col}
        right={<span className="ml-auto font-mono text-meta" style={{ color: m.state === 'pending' ? st.col : 'rgb(var(--jz-muted))' }}>{m.state || ''}</span>} />
      <CardTitle t={d.g.label} />
    </NCard>
  );
};

const FindCard = ({ data }: NodeProps) => {
  const d = data as unknown as CardData;
  const sev = d.g.severity || 'info';
  const accent = SEV[sev] || TYPE_STYLE.finding.col;
  const state = d.g.state;
  const corner = state === 'confirmed' ? '✓' : state === 'excluded' ? '✕' : state ? '…' : '';
  const cornerCol = state === 'confirmed' ? 'rgb(var(--jz-teal))' : state === 'excluded' ? 'rgb(var(--jz-muted))' : 'rgb(var(--jz-amber))';
  const isAgg = d.g.id.startsWith('agg:');
  return (
    <NCard d={d} accent={accent}
      emphasis={sev === 'critical' || sev === 'high'}   // 红光气泡: critical/high 真值,无 CVSS 不编评分
      style={{ opacity: d.dim ? 0.16 : state === 'excluded' ? 0.5 : 1 }}>
      <CardHead label={<>🎯 {isAgg ? '规则族' : '发现'}</>} color={accent}
        right={<span className="ml-auto font-mono text-meta px-1 rounded-control" title="severity(真值,后端无 CVSS 字段)"
          style={{ border: `1px solid ${accent}`, color: accent }}>{sev}</span>} />
      <CardTitle t={d.g.label} />
      <CardRow>
        <span className="font-mono truncate" title={d.g.meta?.rule_id || d.g.meta?.masvs || ''}>
          {trunc(String(d.g.meta?.rule_id || d.g.meta?.masvs || (isAgg ? `聚合 ${d.g.meta?.count || '?'} 条` : '')), 14)}</span>
        {corner && <span className="ml-auto" style={{ color: cornerCol }} title={state || ''}>{corner}</span>}
      </CardRow>
    </NCard>
  );
};

const MoreCard = ({ data }: NodeProps) => {
  const d = data as unknown as CardData;
  return (
    <NCard d={d} accent={TYPE_STYLE.more.col} dash>
      <div className="grid place-items-center text-meta font-semibold text-jz-ink-2" style={{ minHeight: CARD_H - 2 }}>
        更多(点击展开)
      </div>
    </NCard>
  );
};

const HeaderCard = ({ data }: NodeProps) => {
  const d = data as unknown as { title: string; count: number };
  return (
    <div data-layer-header={d.title} style={{ width: NW }} className="flex items-center gap-1.5 select-none">
      <span className="text-meta font-semibold text-jz-ink-2">{d.title}</span>
      <span className="text-meta font-mono text-jz-muted">{d.count}</span>
      <span className="flex-1 h-px" style={{ background: 'rgb(var(--jz-border))' }} />
    </div>
  );
};

const nodeTypes = {
  app: AppCard, component: CompCard, deeplink: DlCard, api_group: ApiCard,
  key: KeyCard, approval: ApprCard, finding: FindCard, more: MoreCard, header: HeaderCard,
};

const Flow: React.FC<{ sid: number }> = ({ sid }) => {
  const setInspectorTarget = usePentest((s) => s.setInspectorTarget);
  const itTarget = usePentest((s) => s.inspectorTarget);
  const { theme } = useTheme();
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [expand, setExpand] = useState<Record<string, boolean>>({});
  const [drill, setDrill] = useState<string | null>(null);   // R41: 下钻的规则族
  const [chainIdx, setChainIdx] = useState<number | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ title: React.ReactNode; body: React.ReactNode } | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [groupFlow, setGroupFlow] = useState<Record<string, { tried: number; ok: number; fb: number }>>({});   // R314
  const [focusOnly, setFocusOnly] = useState(true);   // R317: 默认聚焦战果(全图可切)
  const [dense, setDense] = useState(false);   // R319: 密度模式(紧凑布局,同屏信息量+40%)
  const [legendOpen, setLegendOpen] = useState(false);   // 像素打磨: 图例折叠 Popover(默认收起不遮画布)
  const [apiTreeTotal, setApiTreeTotal] = useState(0);   // R624: /api_tree 接口总数(/graph 无 api 节点时 KPI 诚实回退)
  const groupFlowRef = useRef(groupFlow);
  groupFlowRef.current = groupFlow;
  const rf = useReactFlow();

  useEffect(() => {
    setGraph(null); setSelId(null); setChainIdx(null); setDrill(null); setExpand({});
    api<GraphData>(`/api/pentest/sessions/${sid}/graph`)
      .then((g) => setGraph(g.nodes ? g : { nodes: [], edges: [] })).catch(() => setGraph({ nodes: [], edges: [] }));
    // R314: 虚/实线流程语义——api_tree 真值(module→apis[].tested/last_probe)构建
    // groupFlow(尝试轨迹统计),边装配按此分虚/实(数据源零造假)
    api<any>(`/api/pentest/sessions/${sid}/api_tree`, {}, true).then((d) => {
      setApiTreeTotal((d?.groups || []).reduce((n: number, g: any) => n + (g?.apis || []).length, 0));   // R624: KPI 回退口径
      const gf: Record<string, { tried: number; ok: number; fb: number }> = {};
      for (const g of d?.groups || []) {
        let tried = 0, ok = 0, fb = 0;
        for (const a of g.apis || []) {
          if (a.tested && a.tested !== 'untested') {
            tried++;
            if (a.tested === 'excluded' || a.tested === 'unreachable' || a.tested === 'error') fb++;
            else ok++;
          }
        }
        if (tried) gf[g.module] = { tried, ok, fb };
      }
      groupFlowRef.current = gf;   // R316: 同步写 ref(渲染体赋值在批处理时序下滞后于 effect,实测 flow 恒未命中)
      setGroupFlow(gf);
    }).catch((e) => { (window as any).__gfDbg = { err: String(e).slice(0, 100) }; });
  }, [sid]);

  // ───────── 数据面(冻结): R41 聚合/下钻 + LAYERS 排序 + 折叠,与旧版逐字同源(仅输出容器由 SVG pos 换 RF nodes) ─────────
  const layout = useMemo(() => {
    if (!graph) return null;
    const pos: Record<string, { x: number; y: number; w: number; h: number }> = {};
    const headers: Array<{ x: number; title: string; count: number }> = [];
    // R319: 密度模式取紧凑常量(NCard 卡宽也从 CSS var 读)
    const nw = dense ? NW_D : NW;
    const row = dense ? ROW_D : ROW;
    const gapx = dense ? GAP_X_D : GAP_X;
    let x = 40;
    // R41 P0-4: 超 200 节点 → finding 按规则族聚合(下钻: 点击族节点展开实例)
    let nodesG = graph.nodes;
    // R317: 聚焦战果——confirmed 发现子图(含归属父节点与边);全景开关还原
    let edgeFilter: ((e: GEdge) => boolean) | null = null;
    if (focusOnly) {
      const conf = new Set(nodesG.filter((n) => n.type === 'finding' && n.state === 'confirmed').map((n) => n.id));
      if (!conf.size) {
        // R321: 零战果会话聚焦=孤点——不强制过滤(保留全图)+图例提示
        edgeFilter = null;
      } else {
        const keep = new Set<string>(['app', ...conf]);
        (graph.edges || []).forEach((e) => { if (conf.has(e.to) && !keep.has(e.from)) keep.add(e.from); });
        edgeFilter = (e) => keep.has(e.from) && keep.has(e.to);
        nodesG = nodesG.filter((n) => keep.has(n.id));
      }
    }
    const aggregated = nodesG.length > 200;
    if (aggregated) {
      const fam = new Map<string, { sev: string; count: number; label: string }>();
      const sevRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      for (const n of nodesG) {
        if (n.type !== 'finding') continue;
        const rule = (n.meta && n.meta.rule_id) || n.label.slice(0, 24) || '未归类';
        const cur = fam.get(rule) || { sev: 'info', count: 0, label: rule };
        cur.count += 1;
        if ((SEV_RANK[n.severity || 'info'] ?? 9) < (SEV_RANK[cur.sev] ?? 9)) cur.sev = n.severity || 'info';
        fam.set(rule, cur);
      }
      const aggFamilies = [...fam.entries()].map(([rule, v]) => ({ rule, sev: v.sev, count: v.count }))
        .sort((a, b) => b.count - a.count);
      // 下钻态: 被点击的族展开为实例节点,其余族仍聚合
      const keepIndividual = drill || '';
      const findingAggs = aggFamilies
        .filter((f) => f.rule !== keepIndividual)
        .map((f) => ({
          id: `agg:${f.rule}`, type: 'finding', label: `规则族 ${f.rule.slice(0, 22)}`,
          severity: f.sev, state: 'confirmed', meta: { count: f.count, agg: true, rule: f.rule },
        }));
      nodesG = [
        ...nodesG.filter((n) => n.type !== 'finding'),
        ...(keepIndividual ? nodesG.filter((n) => n.type === 'finding' && (n.meta?.rule_id || '') === keepIndividual) : []),
        ...findingAggs,
      ];
    }
    const visNodes: GNode[] = [];
    const moreNodes: string[] = [];
    LAYERS.forEach((layer) => {
      let all = nodesG.filter((n) => layer.types.includes(n.type));
      if (layer.key === 'surface') all = all.slice().sort((a, b) =>
        ((a.type === 'component' ? 0 : 1) - (b.type === 'component' ? 0 : 1)) ||
        ((b.meta?.protected === false ? 0 : 1) - (a.meta?.protected === false ? 0 : 1)) ||
        String(a.label).localeCompare(String(b.label)));
      else if (layer.key === 'asset') all = all.slice().sort((a, b) => (a.type === 'key' ? 1 : 0) - (b.type === 'key' ? 1 : 0));
      else if (layer.key === 'finding') all = all.slice().sort((a, b) =>
        // R316: 三态优先(confirmed>pending>excluded)——confirmed 是虚实线语义的
        // 核心载体,R314 flow 分类需其在 FOLD=12 可视窗内才有实线呈现
        ((a.state === 'confirmed' ? 0 : a.state === 'pending' ? 1 : 2) - (b.state === 'confirmed' ? 0 : b.state === 'pending' ? 1 : 2)) ||
        (SEV_RANK[a.severity || 'info'] ?? 9) - (SEV_RANK[b.severity || 'info'] ?? 9));
      else all = all.slice().sort((a, b) => String(a.label).localeCompare(String(b.label)));
      const ex = expand[layer.key];
      const visible = all.length > FOLD ? all.slice(0, ex ? CAP : FOLD) : all;
      visible.forEach((nd, i) => { pos[nd.id] = { x, y: 64 + i * row, w: nw, h: NH }; visNodes.push(nd); });
      if (all.length > visible.length) {
        pos[`__more_${layer.key}`] = { x, y: 64 + visible.length * row, w: nw, h: NH };
        moreNodes.push(`__more_${layer.key}`);
      }
      headers.push({ x, title: layer.title, count: all.length });
      x += nw + gapx;   // R107-5①/R319: 层间距(密度模式收紧)
    });
    const worldW = x - GAP_X + 40;
    const worldH = Math.max(600, 64 + Math.max(1, ...Object.values(pos).map((p) => p.y)) * 1 + 40);
    return { pos, headers, worldW, worldH, visNodes, moreNodes, edges: edgeFilter ? graph.edges.filter(edgeFilter) : graph.edges };
  }, [graph, expand, drill, focusOnly, dense]);
  // ────────────────────────────────────────────────────────────────

  // 上下游邻域(BFS 双向)—— 单击高亮的链路集合
  const adj = useMemo(() => {
    const m = new Map<string, Set<string>>();
    graph?.edges.forEach((e) => {
      if (!m.has(e.from)) m.set(e.from, new Set());
      if (!m.has(e.to)) m.set(e.to, new Set());
      m.get(e.from)!.add(e.to); m.get(e.to)!.add(e.from);
    });
    return m;
  }, [graph]);
  const nbhd = useMemo(() => {
    if (!selId) return null;
    const seen = new Set([selId]); const q = [selId];
    while (q.length) { const c = q.shift()!; for (const n of (adj.get(c) || [])) if (!seen.has(n)) { seen.add(n); q.push(n); } }
    return seen;
  }, [selId, adj]);

  const chains: Array<{ path: string[]; severity?: string; title?: string }> = (graph as any)?.chains || [];
  // R624-P2: 画布内聚合 api 节点数(一节点=同族端点聚合;KPI 权威口径走 /api_tree 总数,此值入悬浮与回退)
  const graphApiN = (graph?.nodes || []).filter((n: any) => n.type === 'api').length;
  const chainOn = chainIdx != null ? chains[chainIdx] : null;
  const chainNodes = useMemo(() => new Set(chainOn ? chainOn.path : []), [chainOn]);
  const chainPairs = useMemo(() => new Set(chainOn ? chainOn.path.slice(0, -1).map((n, i) => n + '→' + chainOn.path[i + 1]) : []), [chainOn]);

  // UI 层: 数据面输出(pos/visNodes)→ RF nodes/edges(位置/样式装配,零数据改写)
  const layoutRef = useRef(layout); layoutRef.current = layout;
  const applyLayout = useCallback(() => {
    const lay = layoutRef.current; if (!lay) return;
    const nById = new Map((graph?.nodes || []).map((n) => [n.id, n]));   // R314 边分类用
    const rfNodes: Node[] = [];
    lay.headers.forEach((h) => rfNodes.push({
      id: `__hdr_${h.title}`, type: 'header', position: { x: h.x, y: 24 },
      data: { title: h.title, count: h.count }, draggable: false, selectable: false, deletable: false,
    }));
    lay.visNodes.forEach((nd) => {
      const p = lay.pos[nd.id];
      rfNodes.push({ id: nd.id, type: nd.type, position: { x: p.x, y: p.y }, data: { g: nd } });
    });
    lay.moreNodes.forEach((mid) => {
      const p = lay.pos[mid];
      rfNodes.push({ id: mid, type: 'more', position: { x: p.x, y: p.y }, data: { g: { id: mid, type: 'more', label: '更多(点击展开)' } } });
    });
    const rfEdges: Edge[] = [];
    lay.edges.forEach((e, i) => {
      const a = lay.pos[e.from], b = lay.pos[e.to];
      if (!a || !b) return;
      const chain = e.type === 'invocable';
      // R314: 虚/实线流程语义(展示装配层)——按目标节点真实性分类:
      //  发现 confirmed=实线粗(severity 色);excluded/pending=虚线(尝试未成立/待审);
      //  接口组 groupFlow.tried>0=虚线青(尝试轨迹,统计入 title);未触达=基线实线。
      const tn = nById.get(e.to);
      let flow: string | undefined; let tip = '';
      (window as any).__flowDbg = (window as any).__flowDbg || {};
      (window as any).__flowDbg[flow || (tn ? tn.type : 'noTN')] = ((window as any).__flowDbg[flow || (tn ? tn.type : 'noTN')] || 0) + 1;
      if (tn?.type === 'finding') {
        if (tn.state === 'confirmed') flow = 'confirmed';
        else if (tn.state === 'excluded') { flow = 'excluded'; tip = '尝试未成立(excluded)'; }
        else { flow = 'pending'; tip = '待审(pending)'; }
      } else if (tn?.type === 'api_group') {
        const mod = e.to.startsWith('api:') ? e.to.slice(4) : tn.label;
        const gf = groupFlow[mod] || groupFlowRef.current[mod];
        if (gf?.tried) { flow = 'tried'; tip = `已探测 ${gf.tried} 处(可用 ${gf.ok}/兜底 ${gf.fb})`; }
      }
      const flowStyle = flow === 'confirmed'
        ? { stroke: cssVar('--jz-teal'), strokeWidth: 2.4, opacity: 0.95 }
        : flow === 'excluded' ? { stroke: cssVar('--jz-muted'), strokeWidth: 1, opacity: 0.3, strokeDasharray: '5 4' }
        : flow === 'pending' ? { stroke: cssVar('--jz-muted'), strokeWidth: 1, opacity: 0.5, strokeDasharray: '2 3' }
        : flow === 'tried' ? { stroke: cssVar('--jz-brand'), strokeWidth: 1.3, opacity: 0.6, strokeDasharray: '6 4' }
        : undefined;
      rfEdges.push({
        id: `e${i}:${e.from}->${e.to}`, source: e.from, target: e.to, type: 'default',
        // R117-3②: 初始连线色同走 token(挂载后 restyle 效应即时按主题归一)
        style: flowStyle ? { stroke: (flowStyle as any).stroke, strokeWidth: (flowStyle as any).strokeWidth, opacity: (flowStyle as any).opacity, ...(flowStyle as any).strokeDasharray ? { strokeDasharray: (flowStyle as any).strokeDasharray } : {} }
          : { stroke: chain ? (cssVar('--jz-brand')) : (cssVar('--jz-muted')), strokeWidth: chain ? 1.6 : 1, opacity: chain ? 0.85 : 0.45 },
        ...(chain ? { data: { baseOp: 0.85, chain: true } } : { data: { baseOp: (flowStyle as any)?.opacity ?? 0.45, chain: false, flow, tip } }),
        className: chain ? 'ac-edge-chain' : flow ? `ac-flow-${flow}` : undefined,
        ...(tip ? { title: tip } : {}),
      });
    });
    if ((window as any).__dbgCanvas) console.log('[dbg] rfNodes=' + rfNodes.length + ' rfEdges=' + rfEdges.length);
    setNodes(rfNodes); setEdges(rfEdges);
  }, [graph, setNodes, setEdges, groupFlow]);
  useEffect(() => { applyLayout(); }, [layout, applyLayout, graph, groupFlow]);

  // ③ R107-5: 进入/切至画布 Tab(主视口条件渲染=本组件重挂载)自动平滑 fitView——
  //    与 fit 钮/智能重排合并为单一 fit() 规格(padding 0.2/duration 400),不重复;
  //    替代原 fitView prop(空节点 init 时机不覆盖异步图)。就绪重试: 过早调用会被
  //    v12 静默丢弃(节点测量未入库,实测),故 fit 火忘式调用+独立定时重试,以
  //    「全部节点矩形落于容器内」为收敛判据,300ms 一拍、上限 24 次防悬挂。
  //    fit 经 ref 读取且 deps 只留 [graph]: v12 useReactFlow 返回体逐渲染换_identity,
  //    若把 fit 挂进 deps,重渲染 cleanup 会反复清掉挂起定时器致重试永哑(实测踩坑)。
  const fit = useCallback(() => rf.fitView({ padding: 0.2, duration: 400, maxZoom: 1.25, minZoom: 0.5 }), [rf]);
  const canvasBoxRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef(fit); fitRef.current = fit;
  const didFitRef = useRef(false);
  useEffect(() => {
    if (!graph || didFitRef.current) return;
    didFitRef.current = true;
    let tries = 0, timer = 0;
    const settled = () => {
      const box = canvasBoxRef.current;
      if (!box) return false;
      const b = box.getBoundingClientRect();
      const ns = box.querySelectorAll('.react-flow__node');
      if (!ns.length) return false;
      for (const el of ns) {
        const r = el.getBoundingClientRect();
        if (r.left < b.left || r.right > b.right || r.top < b.top || r.bottom > b.bottom) return false;
      }
      return true;
    };
    const attempt = () => {
      tries++;
      try { void fitRef.current(); } catch { /* 早期调用被 v12 丢弃,下一拍重试 */ }
      if (settled() || tries >= 24) return;
      timer = window.setTimeout(attempt, 300);
    };
    timer = window.setTimeout(attempt, 150);
    return () => window.clearTimeout(timer);
  }, [graph]);

  // 选中/链态/下钻的透明度与链色装配(数据不变,只改展示;守卫防重渲染空转)
  useEffect(() => {
    setNodes((nds) => {
      let changed = false;
      const next = nds.map((n) => {
        if (n.id.startsWith('__hdr_')) return n;
        const cd = (n.data as unknown as CardData) || { g: { id: n.id, type: '', label: '' } };
        const dim = (chainOn ? !chainNodes.has(n.id) : false) || (nbhd ? !nbhd.has(n.id) : false) || false;
        const sel = selId === n.id;
        if (cd.dim === dim && cd.sel === sel) return n;
        changed = true;
        return { ...n, data: { ...cd, dim, sel } };
      });
      return changed ? next : nds;
    });
    setEdges((eds) => {
      // R117-3②(方案3.2 功能等价落位): 连线色双模 token 化——基线=#94a3b8/链=#22d3ee 硬编码
      // 在亮色模式下对比度退化(浅白网格底连线消失),改 cssVar 双模解析(亮=石墨/科技蓝暗亮自适应);
      // deps 增 theme: 主题翻转即重算全部连线色。方案所述「dash-flow 假流动动画」经全文件 grep
      // 不存在(图例既有「静态辉光不假造流动」口径),零动画可剔除,如实披露。
      const edgeBase = cssVar('--jz-muted');
      const edgeChain = cssVar('--jz-brand');
      let changed = false;
      const next = eds.map((e) => {
        const base = (e.data as any) || {};
        const onChain = Boolean(chainOn && chainPairs.has(e.source + '→' + e.target));
        const inNb = !nbhd || (nbhd.has(e.source) && nbhd.has(e.target));
        const op = chainOn ? (onChain ? 1 : 0.08) : (!inNb ? 0.06 : (base.baseOp ?? 0.45));
        const stroke = chainOn && onChain ? (SEV[chainOn?.severity || 'high'])
          : base.chain ? edgeChain : edgeBase;
        const cls = (base.chain || onChain) ? 'ac-edge-chain' : undefined;
        const sw = chainOn && onChain ? 2.6 : base.chain ? 1.6 : 1;
        // R314: flow 虚线语义在 restyle 中保持(dash 阵列/确认色不被归一刷平)
        const flow = base.flow as string | undefined;
        const dash = flow === 'excluded' ? '5 4' : flow === 'pending' ? '2 3' : flow === 'tried' ? '6 4' : undefined;
        const strokeF = flow === 'confirmed' ? (cssVar('--jz-teal'))
          : flow === 'tried' ? (cssVar('--jz-brand')) : stroke;
        if (e.style?.opacity === op && e.style?.stroke === strokeF && e.style?.strokeWidth === sw && e.className === cls && e.style?.strokeDasharray === dash) return e;
        changed = true;
        return { ...e, style: { ...e.style, opacity: op, stroke: strokeF, strokeWidth: sw, ...(dash ? { strokeDasharray: dash } : { strokeDasharray: undefined }) }, className: cls };
      });
      return changed ? next : eds;
    });
  }, [nodes, selId, nbhd, chainOn, chainNodes, chainPairs, setNodes, setEdges, theme]);

  // ④ 单击: 更多/族下钻(既有语义)→ 平滑聚焦+上下游高亮+写 inspectorTarget(契约 4①)
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const id = node.id;
    if (id.startsWith('__hdr_')) {
      // R317: 层头=锚点——平滑平移到该列(替代长拖拽)
      const p = layoutRef.current?.pos?.[`__hdr_${id.slice(6)}`];
      if (p) rf.setCenter(p.x + 110, 200, { zoom: Math.max(rf.getZoom(), 0.6), duration: 400 });
      return;
    }
    if (id.startsWith('__more_')) { setExpand((e) => ({ ...e, [id.slice(7)]: true })); return; }
    if (id.startsWith('agg:')) { const rule = id.slice(4); setDrill((d) => (d === rule ? null : rule)); return; }
    const cur = selId === id ? null : id;
    setSelId(cur);
    const g = (node.data as unknown as CardData)?.g || null;
    // R105-2 契约(红线 4①): {kind, nodeId, data} —— kind=GNode.type 真值, data=节点原始数据只读透传
    setInspectorTarget(cur && g ? { kind: g.type, nodeId: id, data: g } : null);
    if (cur) {
      const p = node.position;
      rf.setCenter(p.x + NW / 2, p.y + CARD_H / 2, { zoom: Math.max(rf.getZoom(), 1.05), duration: 480 });
    }
  }, [selId, rf, setInspectorTarget]);
  const onPaneClick = useCallback(() => { setSelId(null); setInspectorTarget(null); setLegendOpen(false); }, [setInspectorTarget]);

  // ④ 双击: UnifiedModal —— 组件/深链=既有 /api/chat/source 反编译源码切片;其余类型=节点档案(真 meta)
  const onNodeDoubleClick = useCallback(async (_: React.MouseEvent, node: Node) => {
    const g = (node.data as unknown as CardData)?.g; if (!g) return;
    const m = g.meta || {};
    if (g.type === 'component' || g.type === 'deeplink') {
      const cls = String(g.type === 'component' ? (m.full_name || '') : (m.component || ''));
      const path = cls ? cls.split('.').join('/') + '.java' : '';
      setModal({ title: <span className="font-mono">{cls || g.label}</span>,
        body: <div className="text-meta text-jz-muted">读取反编译源码切片…(既有数据链 GET /api/chat/source)</div> });
      try {
        const s = await api<any>(`/api/pentest/sessions/${sid}`);
        const tid = s?.task_id;
        if (!tid) throw new Error('会话无关联任务');
        const d = await api<any>(`/api/chat/source?task_id=${tid}&path=${encodeURIComponent(path)}`, {}, true);
        const text = String(d?.content ?? '');
        setModal({ title: <span className="font-mono">{cls}</span>, body: (
          <>
            <div className="text-meta text-jz-muted mb-1.5 flex items-center gap-2">
              <span className="font-mono">{d?.path || path}</span>
              {d?.truncated ? <span className="px-1.5 rounded-pill border border-jz-border">已截断(500 行)</span> : null}
              <span className="ml-auto">数据链: GET /api/chat/source(既有,只读)</span>
            </div>
            <pre className="font-mono text-meta leading-relaxed text-jz-ink-2 bg-jz-canvas rounded-control border border-jz-border p-2.5 overflow-auto max-h-[62vh] whitespace-pre-wrap break-all">{text || '(空文件)'}</pre>
          </>) });
      } catch (e: any) {
        setModal({ title: <span className="font-mono">{cls || g.label}</span>, body: (
          <div className="text-meta text-jz-sev-medium space-y-1.5">
            <div>反编译源码切片读取失败: {e?.message || '未知错误'}</div>
            <div className="text-jz-muted">诚实降级 —— 路径可能不在反编译产物内(如无 {path}),不假造内容。</div>
          </div>) });
      }
      return;
    }
    const rows: Array<[string, React.ReactNode]> = [];
    if (g.type === 'app') {
      const c = graph?.node_counts || {};
      rows.push(['包名', <span className="font-mono">{g.label}</span>], ['版本', m.version || '(端点未返回)'], ['加固', PACKER_LABEL[m.packer] || m.packer || '—'],
        ['组件(导出)', String(c.component || 0)], ['深链', String(c.deeplink || 0)], ['接口组', String(c.api_group || 0)], ['密钥', String(c.key || 0)], ['发现', String(c.finding || 0)]);
    } else if (g.type === 'api_group') {
      rows.push(['模块', g.label], ['接口数', String(m.count ?? '—')]);
      (m.sample || []).forEach((p: string, i: number) => rows.push([`采样${i + 1}`, <span className="font-mono">{p}</span>]));
    } else if (g.type === 'key') {
      rows.push(['密钥', g.label], ['算法', m.algo || '—'], ['已验证可利用', String(m.verified ?? '—')], ['证据', <span className="font-mono">{String(m.evidence || '—')}</span>]);
    } else if (g.type === 'approval') {
      rows.push(['工具', g.label], ['状态', m.state || '—'], ['时间', m.ts ? new Date(m.ts).toLocaleString() : '—'], ['理由', String(m.reason || '—')], ['结果', m.result ? JSON.stringify(m.result) : '—']);
    } else {   // finding
      rows.push(['标题', g.label], ['严重度', g.severity || 'info'], ['状态', g.state || '—'],
        ['MASVS/CWE', <span className="font-mono">{m.masvs || '—'}</span>], ['规则', <span className="font-mono">{m.rule_id || '—'}</span>],
        ['修复建议', String(m.repro || '—')], ['证据', <pre className="font-mono text-meta whitespace-pre-wrap break-all max-h-[40vh] overflow-auto">{String(m.evidence || '—')}</pre>]);
    }
    setModal({ title: <span className="font-mono">{g.label}</span>, body: (
      <div className="space-y-1.5 text-meta">
        <div className="text-meta text-jz-muted">节点档案(画布真值;{g.type === 'finding' ? '严重级徽章,后端无 CVSS 字段不编评分' : '该节点类型无反编译源码数据链,诚实降级为档案'})</div>
        {rows.map(([k, v], i) => (
          <div key={i} className="grid grid-cols-[84px_1fr] gap-2 items-start">
            <span className="text-jz-muted">{k}</span>
            <span className="text-jz-ink-2 min-w-0 break-all">{v}</span>
          </div>))}
      </div> ) });
  }, [sid, graph]);

  const arrange = useCallback(() => { applyLayout(); fit(); }, [applyLayout, fit]);   // R107-5③: 合并同一 fit() 规格

  if (!graph) return <div className="p-3"><SkeletonLoader variant="chart" /></div>;
  if (!graph.nodes.length)
    return (
      <div className="h-full grid place-items-center">
        <EmptyStatePlaceholder icon={Shield} title="攻击面画布还是空的" subtitle="等待 autopilot 侦察产出" />
      </div>
    );

  return (
    <div data-attack-canvas="v3" data-canvas-sel={selId || ''} data-canvas-it={itTarget?.nodeId || ''} className="h-full flex flex-col">
      <style>{`
        .ac-edge-chain path { stroke-width: 2px; }
        .ac-flow-confirmed path { stroke: rgb(var(--jz-teal)) !important; stroke-width: 2.4 !important; }
        .ac-flow-excluded path { stroke-dasharray: 5 4 !important; opacity: .3 !important; }
        .ac-flow-pending path { stroke-dasharray: 2 3 !important; }
        .ac-flow-tried path { stroke-dasharray: 6 4 !important; stroke: rgb(var(--jz-brand)) !important; }
        .react-flow__attribution { display: none; }
      `}</style>
      <div className="flex items-center gap-2 pb-1.5 text-meta">
        <button data-canvas-chain onClick={() => setChainIdx(chainIdx == null ? 0 : (chainIdx + 1) % Math.max(chains.length, 1))}
          title="逐条浏览攻击链(链边在画布中高亮)"
          className="px-2.5 py-1 rounded-control bg-jz-surface-2 text-jz-ink-2 hover:text-jz-brand font-mono transition-colors">
          ⚡ 利用链{chains.length ? ` ${(chainIdx ?? -1) + 1}/${chains.length}` : ' 0'} 活跃
        </button>
        {chainOn && <span className="text-jz-muted truncate">{chainOn.title || ''}</span>}
        {/* R624: /graph 无 api 节点而 /api_tree 已有资产时回退资产总数(双源口径在悬浮注明,不再显示矛盾的 0) */}
        <span className="hidden md:inline px-2 py-1 rounded-control bg-jz-surface-2 text-jz-muted font-mono tnum"
          title={`已探明端点数(口径: /api_tree 接口资产总数${graphApiN ? `;画布内为聚合 api 节点 ${graphApiN} 个(一节点=同族端点聚合)` : ''})`}>
          已探明端点: {apiTreeTotal || graphApiN || 0}
        </span>
        <span className="flex-1" />
        <span title="滚轮=缩放 · 拖拽=平移 · 单击=聚焦上下游 · 双击=源码切片 · 实线=确认链 · 虚线=尝试轨迹" className="w-6 h-6 grid place-items-center rounded-control bg-jz-surface-2 text-jz-muted cursor-help font-mono text-meta">?</span>
      </div>
      <div ref={canvasBoxRef} className="flex-1 relative border border-jz-border rounded-control overflow-hidden bg-jz-canvas" style={{ minHeight: 480 }}>
        <ReactFlow
          style={{ '--ac-nw': (dense ? NW_D : NW) + 'px' } as React.CSSProperties}
          nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes} colorMode={theme}
          onNodeClick={onNodeClick} onNodeDoubleClick={onNodeDoubleClick} onPaneClick={onPaneClick}
          minZoom={0.25} maxZoom={4} nodesConnectable={false} elevateNodesOnSelect={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color={cssVar('--jz-border', 0.9)} />
          {/* ① 左浮工具坞: +/−/适应/智能重排(简单分层=既有 LAYERS 布局,不引第三方布局库) */}
          <Panel position="top-left">
            <div data-canvas-dock className="flex items-center gap-1 rounded-card bg-jz-surface/85 backdrop-blur-md border border-jz-border/60 shadow-card p-1">
              <button data-canvas-btn="zin" title="放大" onClick={() => rf.zoomIn({ duration: 220 })}
                className="w-7 h-7 grid place-items-center rounded-control text-jz-ink-2 hover:text-jz-ink hover:bg-jz-surface-2/60"><Plus className="w-4 h-4" /></button>
              <button data-canvas-btn="zout" title="缩小" onClick={() => rf.zoomOut({ duration: 220 })}
                className="w-7 h-7 grid place-items-center rounded-control text-jz-ink-2 hover:text-jz-ink hover:bg-jz-surface-2/60"><Minus className="w-4 h-4" /></button>
              <button data-canvas-btn="focus" title="切换: 聚焦战果(默认)/全景"
                onClick={() => setFocusOnly((v) => !v)}
                className={`w-auto px-1.5 h-7 grid place-items-center rounded-control text-meta ${focusOnly ? 'text-jz-teal bg-jz-teal/10' : 'text-jz-ink-2 hover:bg-jz-surface-2/60'}`}>
                {focusOnly ? '🎯 战果' : '🌐 全景'}
              </button>
              <button data-canvas-btn="dense" title="密度模式: 紧凑布局(同屏信息量+40%)"
                onClick={() => setDense((v) => !v)}
                className={`w-auto px-1.5 h-7 grid place-items-center rounded-control text-meta ${dense ? 'text-jz-brand bg-jz-brand/10' : 'text-jz-ink-2 hover:bg-jz-surface-2/60'}`}>
                {dense ? '▦ 紧凑' : '▤ 舒展'}
              </button>
              <button data-canvas-btn="home" title="回到目标节点"
                onClick={() => { const p = layoutRef.current?.pos?.['app']; if (p) rf.setCenter(p.x + 110, p.y + 40, { zoom: Math.max(rf.getZoom(), 0.8), duration: 400 }); }}
                className="w-7 h-7 grid place-items-center rounded-control text-jz-ink-2 hover:text-jz-ink hover:bg-jz-surface-2/60"><Scan className="w-4 h-4" /></button>
              <button data-canvas-btn="png"
                onClick={() => {
                  const vp = document.querySelector('.react-flow__viewport');
                  if (!vp) return;
                  import('html-to-image').then(({ toPng }) => toPng(vp as HTMLElement, { backgroundColor: cssVar('--jz-canvas'), pixelRatio: 2 }))
                    .then((url) => { const a = document.createElement('a'); a.href = url; a.download = `canvas_${sid}.png`; a.click(); });
                }}
                className="w-7 h-7 grid place-items-center rounded-control text-jz-ink-2 hover:text-jz-ink hover:bg-jz-surface-2/60" title="导出 PNG(当前视图)"><Download className="w-4 h-4" /></button>
              <button data-canvas-btn="json"
                onClick={() => {
                  const blob = new Blob([JSON.stringify({ sid, ...graph }, null, 1)], { type: 'application/json' });
                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `canvas_${sid}.json`; a.click();
                }}
                className="w-7 h-7 grid place-items-center rounded-control text-jz-ink-2 hover:text-jz-ink hover:bg-jz-surface-2/60" title="导出图谱 JSON"><FileJson className="w-4 h-4" /></button>
              <button data-canvas-btn="fit" title="适应视口(Fit View)" onClick={fit}
                className="w-7 h-7 grid place-items-center rounded-control text-jz-ink-2 hover:text-jz-ink hover:bg-jz-surface-2/60"><Scan className="w-4 h-4" /></button>
              <button data-canvas-btn="arrange" title="智能重排(简单分层: 既有 LAYERS 布局重排,不引第三方布局库)" onClick={arrange}
                className="w-7 h-7 grid place-items-center rounded-control text-jz-ink-2 hover:text-jz-ink hover:bg-jz-surface-2/60"><LayoutGrid className="w-4 h-4" /></button>
            </div>
          </Panel>
          {/* ① 右下半透明 Minimap */}
          <Panel position="bottom-right">
            <div data-canvas-minimap className="rounded-card overflow-hidden border border-jz-border/70"
              style={{ background: 'rgb(var(--jz-surface))', border: '1px solid rgb(var(--jz-border))', boxShadow: 'var(--jz-shadow-card)' }} title="小地图(半透明,可点选导航)">
              <MiniMap pannable zoomable
                style={{ width: 150, height: 100, background: 'transparent' }}
                maskColor={cssVar('--jz-canvas', 0.72)}
                nodeColor={(n) => {
                  if (n.type === 'header') return 'transparent';
                  const t = (n.data as unknown as CardData)?.g?.type;
                  const col = (t && TYPE_STYLE[t]?.col) || TYPE_STYLE.finding.col;
                  return col.startsWith('rgb') ? col : col + 'B3';
                }}
                nodeStrokeColor={() => 'transparent'} nodeBorderRadius={4} />
            </div>
          </Panel>
          {/* 图例折叠 Popover: 默认细胶囊不遮画布,点开向上毛玻璃面板(外侧点击收起) */}
          <Panel position="bottom-left">
            <div data-canvas-legend className="relative">
              {legendOpen && (
                <div className="absolute bottom-9 left-0 z-20 w-[min(420px,80vw)] rounded-card bg-jz-surface/90 backdrop-blur-md border border-jz-border/60 shadow-card p-3 space-y-2 text-meta text-jz-muted">
                  <div className="flex gap-2.5 flex-wrap">
                    {Object.entries(TYPE_ICON).slice(0, 8).map(([t, ic]) => (
                      <span key={t} className="inline-flex items-center gap-1">{ic} {TYPE_STYLE[t]?.kind || t}</span>
                    ))}
                  </div>
                  <div className="pt-1.5 border-t border-jz-border/50 space-y-1">
                    <div data-canvas-legend-flow className="text-jz-ink-2">── 实线 = 确认链路 · ⋯ 虚线 = 尝试轨迹 · ○ 未触达</div>
                    <div>⚡ 链边高亮 = 当前浏览的攻击链(静态辉光)</div>
                    {focusOnly && !graph?.nodes?.some?.((n: any) => n.type === 'finding' && n.state === 'confirmed') && (
                      <div data-canvas-nofocus className="text-jz-amber">⚠ 本会话暂无 confirmed 战果——聚焦不可用,已显示全景</div>
                    )}
                  </div>
                </div>
              )}
              <button data-canvas-legend-toggle onClick={(ev) => { ev.stopPropagation(); setLegendOpen((v) => !v); }}
                title="图例对照(节点类型/连线语义)"
                className="flex items-center gap-1.5 px-2 py-1 rounded-control bg-jz-surface/85 backdrop-blur-md border border-jz-border/60 shadow-card text-meta text-jz-ink-2 hover:text-jz-ink transition-colors">
                📖 图例对照 <ChevronUp className={`w-3 h-3 transition-transform duration-200 ${legendOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </Panel>
        </ReactFlow>
      </div>
      <UnifiedModal open={!!modal} onClose={() => setModal(null)} widthClass="w-[min(1100px,92vw)]"
        title={modal?.title} footer={<span className="text-meta text-jz-muted">双击节点=反编译源码切片(既有数据链)/节点档案 · ESC 或遮罩关闭</span>}>
        <div data-canvas-src-modal>{modal?.body}</div>
      </UnifiedModal>
    </div>
  );
};

export const AttackCanvas: React.FC = () => {
  const sid = usePentest((s) => s.sid);
  if (!sid) return <div className="p-3 text-meta text-jz-muted">会话未挂载</div>;
  return <ReactFlowProvider><Flow sid={sid} /></ReactFlowProvider>;
};
