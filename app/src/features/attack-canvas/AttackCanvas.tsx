// "应用结构": the structure of the application as layers (application, exposed entries, interfaces and
// configuration, approvals, findings) on a pannable canvas (React Flow). Presentation follows the A+ rules:
//   - a node is a hairline card; its type is an icon and a word, never a colour alone;
//   - a finding node carries the orange finding line (3 px with a cap for P0 / P1) and its P label and status word;
//   - nothing is dimmed: the selected node sits on surface-2 with an active outline, its direct neighbours get a
//     stronger outline and their relations are drawn heavier in the active line colour; everything else stays as it is;
//   - a relation says what it is by its stroke: solid heavy = to a confirmed finding, dashed = excluded,
//     dotted = waiting for review, long dash = an interface group that was probed;
//   - the tools are a toolbar above the canvas, not floating cards over it.
// The data blocks marked "数据面(冻结)" (aggregation over 200 nodes, drill-down, layer order, folding at 12 / 60)
// are unchanged from the earlier canvas. Requests are unchanged: graph and api_tree on mount, the session and
// /api/chat/source when a component or deep link is opened.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, MiniMap, Panel,
  useNodesState, useEdgesState, useReactFlow,
  type Node, type Edge, type NodeProps, Handle } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FileJson, Image as ImageIcon, Info, LayoutGrid, LocateFixed, Minus, Plus, Scan } from 'lucide-react';
import { api } from '@/services/api';
import { sourcePathFor } from './sourcePath';
import { usePentest } from '@/stores/pentest';
import { useTheme } from '@/theme/ThemeContext';
import { Button, Dialog, EmptyState, ErrorState, IconButton, PermissionState, Popover, SegmentedControl, SkeletonLoader, StatusGlyph, Tag, cx, stateOf } from '@/components/ui';
import { priorityOf, type FindingVM, type Priority } from '@/features/pentest/workbench/model';
import { PRIORITY_WORD, isStrong } from '@/features/pentest/workbench/surfaces/runtime/trace';
import { FindingCap, StatusMark } from '@/features/pentest/workbench/surfaces/findings/marks';
import { NodeMark } from '@/features/pentest/workbench/surfaces/evidence/GraphOverview';
import { typeLabel } from '@/features/pentest/workbench/surfaces/evidence/graph';

// ───────────────────────── 数据面(冻结) ─────────────────────────
const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const LAYERS = [
  { key: 'target', title: '应用', types: ['app'] },
  { key: 'surface', title: '暴露面', types: ['component', 'deeplink'] },
  { key: 'asset', title: '接口与配置', types: ['api_group', 'key'] },
  { key: 'approve', title: '审批', types: ['approval'] },
  { key: 'finding', title: '风险发现', types: ['finding'] },
];
const FOLD = 12, CAP = 60;   // folding thresholds, unchanged

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

// ── Node cards (custom React Flow nodes; they only read the node they are given) ──
/** How a node relates to what is selected: the selected node, a direct neighbour, or a node on the path in view. */
type Rel = 'sel' | 'near' | 'path';
interface CardData { g: GNode; rel?: Rel; counts?: Record<string, number>; }
const EDGE_OF: Record<'none' | Rel, string> = { none: 'border-jz-border', near: 'border-jz-border-strong', path: 'border-jz-line-active', sel: 'border-jz-line-active' };
const EDGE_OF_FINDING: Record<'none' | Rel, string> = {
  none: 'border-y-jz-border border-r-jz-border', near: 'border-y-jz-border-strong border-r-jz-border-strong',
  path: 'border-y-jz-line-active border-r-jz-line-active', sel: 'border-y-jz-line-active border-r-jz-line-active',
};
const NCard: React.FC<{ children: React.ReactNode; d: CardData; dash?: boolean; priority?: Priority }> = ({ children, d, dash, priority }) => (
  <div data-node-id={d.g.id} data-node-rel={d.rel || 'none'} style={{ width: 'var(--ac-nw)' }}
    className={cx('relative select-none rounded-control border px-2.5 py-1.5', dash && 'border-dashed',
      d.rel === 'sel' ? 'bg-jz-surface-2 ring-1 ring-jz-line-active' : 'bg-jz-surface',
      priority ? cx('border-l-jz-line-finding', isStrong(priority) ? 'border-l-line-strong' : 'border-l-line', EDGE_OF_FINDING[d.rel || 'none']) : EDGE_OF[d.rel || 'none'])}>
    {priority && <FindingCap priority={priority} />}
    {children}
    {/* React Flow only computes connection points for nodes that have handles; these are never shown or used. */}
    <Handle type="target" position={'left' as any} style={{ visibility: 'hidden', pointerEvents: 'none' }} isConnectable={false} />
    <Handle type="source" position={'right' as any} style={{ visibility: 'hidden', pointerEvents: 'none' }} isConnectable={false} />
  </div>
);
const CardHead: React.FC<{ type: string; word?: string; right?: React.ReactNode }> = ({ type, word, right }) => (
  <div className="flex min-w-0 items-center gap-2">
    {word ? <span className="inline-flex min-w-0 items-center gap-1.5 text-meta text-jz-ink-2"><NodeMark type={type} word={false} /><span className="truncate">{word}</span></span> : <NodeMark type={type} />}
    {right && <span className="ml-auto flex min-w-0 flex-none items-center gap-1 text-meta text-jz-ink-2">{right}</span>}
  </div>
);
const CardTitle: React.FC<{ t: string; mono?: boolean }> = ({ t, mono }) => (
  <div className={cx('truncate text-jz-ink', mono ? 'font-mono text-mono' : 'text-label font-medium')} title={t}>{t}</div>
);
const CardRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex min-w-0 items-center gap-2 text-meta text-jz-ink-2">{children}</div>
);

const AppCard = ({ data }: NodeProps) => {
  const d = data as unknown as CardData; const m = d.g.meta || {};
  const c = d.counts || {};
  return (
    <NCard d={d}>
      <CardHead type="app" right={m.packer ? <Tag title={`加固：${m.packer}`}>{PACKER_LABEL[m.packer] || m.packer}</Tag> : null} />
      <CardTitle t={d.g.label} />
      <CardRow>
        {(['component', 'deeplink', 'api_group', 'key', 'finding'] as const).map((t) => (
          <span key={t} className="inline-flex items-center gap-1 font-mono tnum text-jz-ink" title={`${typeLabel(t)} ${c[t] || 0}`}><NodeMark type={t} word={false} />{c[t] || 0}</span>
        ))}
      </CardRow>
      {(m.version || m.device) && <CardRow>
        {m.version ? <span className="truncate font-mono">v{m.version}</span> : null}
        {m.device ? <span className="truncate font-mono">{m.device}</span> : null}
      </CardRow>}
    </NCard>
  );
};

const CompCard = ({ data }: NodeProps) => {
  const d = data as unknown as CardData; const m = d.g.meta || {};
  return (
    <NCard d={d}>
      <CardHead type="component" right={<span className="font-mono" title="组件类型">{m.ctype || '未知类型'}</span>} />
      <CardTitle t={d.g.label} />
      <CardRow>
        <span className="whitespace-nowrap" title="清单里声明为导出（exported=true）；这里只列导出的组件">已导出</span>
        {m.protected === false && <span className="inline-flex items-center gap-1 whitespace-nowrap text-jz-ink" title="清单里没有为它声明权限（permission_protected=false）"><StatusGlyph kind="attention" />无权限保护</span>}
      </CardRow>
    </NCard>
  );
};

const DlCard = ({ data }: NodeProps) => {
  const d = data as unknown as CardData; const m = d.g.meta || {};
  return (
    <NCard d={d} dash>
      <CardHead type="deeplink" right={m.browsable != null ? <span title={`browsable=${String(m.browsable)}`}>{m.browsable ? '可从浏览器打开' : '不可从浏览器打开'}</span> : null} />
      <CardTitle t={d.g.label} />
      <CardRow><span className="truncate font-mono" title={m.uri || ''}>{trunc(String(m.uri || ''), 26)}</span></CardRow>
    </NCard>
  );
};

const ApiCard = ({ data }: NodeProps) => {
  const d = data as unknown as CardData; const m = d.g.meta || {};
  const sample: string[] = m.sample || [];
  return (
    <NCard d={d}>
      <CardHead type="api_group" right={m.count != null ? <span className="font-mono tnum text-jz-ink" title={`这个组里的接口数：${m.count}`}>{Number(m.count) > 999 ? '999+' : m.count}</span> : null} />
      <CardTitle t={d.g.label} />
      <CardRow>
        {sample.length ? <span className="truncate font-mono" title={`路径采样：${sample.join(', ')}`}>{trunc(sample[0], 22)}</span> : <span>没有路径采样</span>}
      </CardRow>
    </NCard>
  );
};

const KeyCard = ({ data }: NodeProps) => {
  const d = data as unknown as CardData; const m = d.g.meta || {};
  return (
    <NCard d={d}>
      <CardHead type="key" right={m.verified != null ? (
        <span className="inline-flex items-center gap-1 whitespace-nowrap" title={`verified_exploitable=${m.verified}`}><StatusGlyph kind={m.verified ? 'done' : 'queued'} />{m.verified ? '已验证' : '未验证'}</span>
      ) : null} />
      <CardTitle t={d.g.label} mono />
    </NCard>
  );
};

const ApprCard = ({ data }: NodeProps) => {
  const d = data as unknown as CardData; const m = d.g.meta || {};
  return (
    <NCard d={d}>
      <CardHead type="approval" right={m.state ? <span className={m.state === 'pending' ? 'text-jz-ink' : undefined}>{m.state === 'pending' ? '待审批' : stateOf(m.state).label}</span> : null} />
      <CardTitle t={d.g.label} />
    </NCard>
  );
};

const REVIEW: Record<string, FindingVM['status']> = { confirmed: 'confirmed', excluded: 'excluded', pending: 'pending' };
const FindCard = ({ data }: NodeProps) => {
  const d = data as unknown as CardData;
  const p = priorityOf(d.g.severity);
  const isAgg = d.g.id.startsWith('agg:');
  const tail = String(d.g.meta?.rule_id || d.g.meta?.masvs || (isAgg ? `聚合 ${d.g.meta?.count || '?'} 条` : ''));
  return (
    <NCard d={d} priority={p}>
      <CardHead type="finding" word={isAgg ? '规则族' : undefined}
        right={<span className={cx('whitespace-nowrap font-mono tnum text-jz-ink', isStrong(p) && 'font-semibold')} title={`等级 ${d.g.severity || 'info'}`}>{p} <span className="font-sans font-normal">{PRIORITY_WORD[p]}</span></span>} />
      <CardTitle t={d.g.label} />
      <CardRow>
        <span className="min-w-0 truncate font-mono" title={tail}>{trunc(tail, 14)}</span>
        {d.g.state && REVIEW[d.g.state] && <StatusMark status={REVIEW[d.g.state]} className="ml-auto flex-none" />}
      </CardRow>
    </NCard>
  );
};

const MoreCard = ({ data }: NodeProps) => {
  const d = data as unknown as CardData;
  return (
    <NCard d={d} dash>
      <div className="grid min-h-12 place-items-center text-meta font-medium text-jz-ink-2">这一层还有更多，点击展开</div>
    </NCard>
  );
};

const HeaderCard = ({ data }: NodeProps) => {
  const d = data as unknown as { title: string; count: number };
  return (
    <div data-layer-header={d.title} style={{ width: 'var(--ac-nw)' }} className="flex select-none items-center gap-2">
      <span className="text-meta font-medium text-jz-ink-2">{d.title}</span>
      <span className="font-mono text-mono tnum text-jz-ink-2">{d.count}</span>
      <span className="h-px flex-1 bg-jz-border" />
    </div>
  );
};

const nodeTypes = {
  app: AppCard, component: CompCard, deeplink: DlCard, api_group: ApiCard,
  key: KeyCard, approval: ApprCard, finding: FindCard, more: MoreCard, header: HeaderCard,
};

/** Nodes per type: the counts the endpoint states, and the nodes of the graph itself for a type it does not state. */
function countsOf(graph: GraphData | null): Record<string, number> {
  const c: Record<string, number> = {};
  for (const n of graph?.nodes || []) c[n.type] = (c[n.type] || 0) + 1;
  return { ...c, ...(graph?.node_counts || {}) };
}

type FlowKind = 'confirmed' | 'excluded' | 'pending' | 'tried';
const FLOW_DASH: Record<FlowKind, string | undefined> = { confirmed: undefined, excluded: '5 4', pending: '2 3', tried: '6 4' };
const FLOW_WIDTH: Record<FlowKind, number> = { confirmed: 2, excluded: 1, pending: 1, tried: 1.5 };
const LEGEND_LINES: Array<[string | undefined, number, string]> = [
  [undefined, 2, '实线加粗：通向已确认的风险发现'], ['5 4', 1, '短划线：通向已排除的风险发现'], ['2 3', 1, '点线：通向待复核的风险发现'],
  ['6 4', 1.5, '长划线：这个接口组已经探测过'], [undefined, 1, '细实线：其余关系'],
];

const Flow: React.FC<{ sid: number }> = ({ sid }) => {
  const setInspectorTarget = usePentest((s) => s.setInspectorTarget);
  const itTarget = usePentest((s) => s.inspectorTarget);
  const { theme } = useTheme();
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [fail, setFail] = useState<'' | 'error' | 'forbidden'>('');
  const [attempt, setAttempt] = useState(0);
  const [expand, setExpand] = useState<Record<string, boolean>>({});
  const [drill, setDrill] = useState<string | null>(null);   // the rule family that is drilled into
  const [chainIdx, setChainIdx] = useState<number | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ title: React.ReactNode; body: React.ReactNode } | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [groupFlow, setGroupFlow] = useState<Record<string, { tried: number; ok: number; fb: number }>>({});
  const [focusOnly, setFocusOnly] = useState(true);   // confirmed findings and what leads to them, or everything
  const [dense, setDense] = useState(false);
  const [apiTreeTotal, setApiTreeTotal] = useState(0);
  const groupFlowRef = useRef(groupFlow);
  groupFlowRef.current = groupFlow;
  const rf = useReactFlow();

  useEffect(() => {
    setGraph(null); setFail(''); setSelId(null); setChainIdx(null); setDrill(null); setExpand({});
    api<GraphData>(`/api/pentest/sessions/${sid}/graph`, {}, true)
      .then((g) => setGraph(g.nodes ? g : { nodes: [], edges: [] }))
      .catch((e) => setFail(e?.status === 403 ? 'forbidden' : 'error'));
    // Which interface groups were probed comes from api_tree (module → apis[].tested); it only styles relations.
    api<any>(`/api/pentest/sessions/${sid}/api_tree`, {}, true).then((d) => {
      setApiTreeTotal((d?.groups || []).reduce((n: number, g: any) => n + (g?.apis || []).length, 0));
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
      groupFlowRef.current = gf;
      setGroupFlow(gf);
    }).catch(() => { /* without api_tree the relations keep their plain stroke */ });
  }, [sid, attempt]);

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
    // R317: 只看已确认发现——confirmed 发现子图(含归属父节点与边);全景开关还原
    let edgeFilter: ((e: GEdge) => boolean) | null = null;
    if (focusOnly) {
      const conf = new Set(nodesG.filter((n) => n.type === 'finding' && n.state === 'confirmed').map((n) => n.id));
      if (!conf.size) {
        // R321: 没有已确认发现的会话聚焦=孤点——不强制过滤(保留全图)+图例提示
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

  // Direct neighbours of the selected node: they and their relations are drawn heavier; nothing else changes.
  const adj = useMemo(() => {
    const m = new Map<string, Set<string>>();
    graph?.edges.forEach((e) => {
      if (!m.has(e.from)) m.set(e.from, new Set());
      if (!m.has(e.to)) m.set(e.to, new Set());
      m.get(e.from)!.add(e.to); m.get(e.to)!.add(e.from);
    });
    return m;
  }, [graph]);
  const near = useMemo(() => (selId ? adj.get(selId) || new Set<string>() : null), [selId, adj]);

  const chains: Array<{ path: string[]; severity?: string; title?: string }> = (graph as any)?.chains || [];
  // R624-P2: 画布内聚合 api 节点数(一节点=同族端点聚合;KPI 权威口径走 /api_tree 总数,此值入悬浮与回退)
  const graphApiN = (graph?.nodes || []).filter((n: any) => n.type === 'api').length;
  const chainOn = chainIdx != null ? chains[chainIdx] : null;
  const chainNodes = useMemo(() => new Set(chainOn ? chainOn.path : []), [chainOn]);
  const chainPairs = useMemo(() => new Set(chainOn ? chainOn.path.slice(0, -1).map((n, i) => n + '→' + chainOn.path[i + 1]) : []), [chainOn]);

  // Layout output (pos / visNodes) → React Flow nodes and edges. Positions and strokes only; no data is rewritten.
  const layoutRef = useRef(layout); layoutRef.current = layout;
  const applyLayout = useCallback(() => {
    const lay = layoutRef.current; if (!lay) return;
    const nById = new Map((graph?.nodes || []).map((n) => [n.id, n]));
    const counts = countsOf(graph);
    const rfNodes: Node[] = [];
    lay.headers.forEach((h) => rfNodes.push({
      id: `__hdr_${h.title}`, type: 'header', position: { x: h.x, y: 24 },
      data: { title: h.title, count: h.count }, draggable: false, selectable: false, deletable: false, focusable: false,
    }));
    lay.visNodes.forEach((nd) => {
      const p = lay.pos[nd.id];
      rfNodes.push({ id: nd.id, type: nd.type, position: { x: p.x, y: p.y }, ariaLabel: `${typeLabel(nd.type)}：${nd.label}`,
        data: { g: nd, ...(nd.type === 'app' ? { counts } : {}) } });
    });
    lay.moreNodes.forEach((mid) => {
      const p = lay.pos[mid];
      rfNodes.push({ id: mid, type: 'more', position: { x: p.x, y: p.y }, ariaLabel: '展开这一层的其余节点', data: { g: { id: mid, type: 'more', label: '展开这一层的其余节点' } } });
    });
    const rfEdges: Edge[] = [];
    lay.edges.forEach((e, i) => {
      const a = lay.pos[e.from], b = lay.pos[e.to];
      if (!a || !b) return;
      const chain = e.type === 'invocable';
      // What a relation leads to decides its stroke: a confirmed finding, an excluded one, one waiting for review,
      // or an interface group that was probed (counts from api_tree).
      const tn = nById.get(e.to);
      let flow: FlowKind | undefined; let tip = '';
      if (tn?.type === 'finding') {
        if (tn.state === 'confirmed') flow = 'confirmed';
        else if (tn.state === 'excluded') { flow = 'excluded'; tip = '通向已排除的风险发现'; }
        else { flow = 'pending'; tip = '通向待复核的风险发现'; }
      } else if (tn?.type === 'api_group') {
        const mod = e.to.startsWith('api:') ? e.to.slice(4) : tn.label;
        const gf = groupFlow[mod] || groupFlowRef.current[mod];
        if (gf?.tried) { flow = 'tried'; tip = `已探测 ${gf.tried} 个接口（有结果 ${gf.ok}，排除、不可达或出错 ${gf.fb}）`; }
      }
      rfEdges.push({
        id: `e${i}:${e.from}->${e.to}`, source: e.from, target: e.to, type: 'default', focusable: false,
        data: { chain, flow, tip },
        className: chain ? 'ac-edge-chain' : flow ? `ac-flow-${flow}` : undefined,
      });
    });
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

  // Selection, the path in view and the theme decide outline and stroke. No opacity is involved.
  useEffect(() => {
    setNodes((nds) => {
      let changed = false;
      const next = nds.map((n) => {
        if (n.id.startsWith('__hdr_')) return n;
        const cd = (n.data as unknown as CardData) || { g: { id: n.id, type: '', label: '' } };
        const rel: Rel | undefined = selId === n.id ? 'sel' : chainOn && chainNodes.has(n.id) ? 'path' : near?.has(n.id) ? 'near' : undefined;
        if (cd.rel === rel) return n;
        changed = true;
        return { ...n, data: { ...cd, rel } };
      });
      return changed ? next : nds;
    });
    setEdges((eds) => {
      const plain = cssVar('--jz-border-strong');
      const ink = cssVar('--jz-ink-2');
      const active = cssVar('--jz-brand');
      let changed = false;
      const next = eds.map((e) => {
        const base = (e.data as any) || {};
        const flow = base.flow as FlowKind | undefined;
        const onPath = Boolean(chainOn && chainPairs.has(e.source + '→' + e.target));
        const touches = Boolean(selId && (e.source === selId || e.target === selId));
        const stroke = onPath || touches ? active : flow === 'confirmed' || base.chain ? ink : plain;
        const sw = onPath ? 2.5 : touches ? 2 : flow ? FLOW_WIDTH[flow] : base.chain ? 1.5 : 1;
        const dash = flow ? FLOW_DASH[flow] : undefined;
        const z = onPath || touches ? 1 : 0;
        if (e.style?.stroke === stroke && e.style?.strokeWidth === sw && e.style?.strokeDasharray === dash && e.zIndex === z) return e;
        changed = true;
        return { ...e, zIndex: z, style: { stroke, strokeWidth: sw, strokeDasharray: dash } };
      });
      return changed ? next : eds;
    });
  }, [nodes, edges.length, selId, near, chainOn, chainNodes, chainPairs, setNodes, setEdges, theme]);

  // A node is picked by a click or by Enter / Space on it: a layer head scrolls to its column, "more" unfolds the
  // layer, a rule family drills in, any other node becomes the inspect target (and is centred).
  const pick = useCallback((id: string) => {
    if (id.startsWith('__hdr_')) {
      const p = layoutRef.current?.headers.find((h) => `__hdr_${h.title}` === id);
      if (p) rf.setCenter(p.x + 110, 200, { zoom: Math.max(rf.getZoom(), 0.6), duration: 400 });
      return;
    }
    if (id.startsWith('__more_')) { setExpand((e) => ({ ...e, [id.slice(7)]: true })); return; }
    if (id.startsWith('agg:')) { const rule = id.slice(4); setDrill((d) => (d === rule ? null : rule)); return; }
    const cur = selId === id ? null : id;
    setSelId(cur);
    const g = layoutRef.current?.visNodes.find((n) => n.id === id) || null;
    // Contract of the inspector: { kind, nodeId, data }, where kind is the node type and data the node as read.
    setInspectorTarget(cur && g ? { kind: g.type, nodeId: id, data: g } : null);
    const p = layoutRef.current?.pos[id];
    if (cur && p) rf.setCenter(p.x + NW / 2, p.y + CARD_H / 2, { zoom: Math.max(rf.getZoom(), 1.05), duration: 480 });
  }, [selId, rf, setInspectorTarget]);
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => pick(node.id), [pick]);
  const onPaneClick = useCallback(() => { setSelId(null); setInspectorTarget(null); }, [setInspectorTarget]);
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target as HTMLElement;
    if (!el.classList?.contains('react-flow__node')) return;
    const id = el.getAttribute('data-id');
    if (id) { e.preventDefault(); e.stopPropagation(); pick(id); }
  };

  // Opening a node (double click, or the toolbar button for the selected node): a component or a deep link shows
  // its decompiled source through /api/chat/source; every other type shows the fields the graph carries for it.
  const openNode = useCallback(async (g: GNode) => {
    const m = g.meta || {};
    if (g.type === 'component' || g.type === 'deeplink') {
      const cls = String(g.type === 'component' ? (m.full_name || '') : (m.component || ''));
      let path = sourcePathFor(cls);
      const title = <span className="font-mono">{cls || g.label}</span>;
      setModal({ title, body: <p className="text-label text-jz-ink-2" aria-busy="true">正在读取反编译源码…</p> });
      try {
        const s = await api<any>(`/api/pentest/sessions/${sid}`);
        const tid = s?.task_id;
        if (!tid) throw new Error('这个会话没有关联的任务');
        path = sourcePathFor(cls, s?.package);
        const d = await api<any>(`/api/chat/source?task_id=${tid}&path=${encodeURIComponent(path)}`, {}, true);
        const text = String(d?.content ?? '');
        setModal({ title, body: (
          <>
            <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2 text-meta text-jz-ink-2">
              <span className="min-w-0 break-all font-mono">{d?.path || path}</span>
              {d?.truncated ? <Tag>只显示前 500 行</Tag> : null}
            </div>
            <pre tabIndex={0} className="max-h-[62vh] overflow-auto whitespace-pre-wrap break-all rounded-control border border-jz-border bg-jz-inset p-3 font-mono text-log text-jz-ink">{text || '（文件是空的）'}</pre>
          </>) });
      } catch (e: any) {
        const denied = e?.status === 403;
        setModal({ title, body: (
          <div className="space-y-1 text-label" role="alert" data-state={denied ? 'forbidden' : 'error'}>
            <p className="font-medium text-jz-ink">{denied ? '没有权限读取这份源码' : '源码没有读到'}</p>
            <p className="text-jz-ink-2">{denied ? '当前账号不能读取这个任务的反编译产物。请切换账号或联系管理员。' : <>原因：{e?.message || '请求没有完成'}。路径 <span className="break-all font-mono">{path}</span> 可能不在反编译产物里。</>}</p>
          </div>) });
      }
      return;
    }
    const rows: Array<[string, React.ReactNode]> = [];
    if (g.type === 'app') {
      const c = countsOf(graph);
      rows.push(['包名', <span className="font-mono">{g.label}</span>], ['版本', m.version || '没有返回'], ['加固', PACKER_LABEL[m.packer] || m.packer || '没有记录'],
        ['导出组件', String(c.component || 0)], ['深链', String(c.deeplink || 0)], ['接口组', String(c.api_group || 0)], ['配置项', String(c.key || 0)], ['风险发现', String(c.finding || 0)]);
    } else if (g.type === 'api_group') {
      rows.push(['模块', g.label], ['接口数', String(m.count ?? '没有记录')]);
      (m.sample || []).forEach((p: string, i: number) => rows.push([`路径采样 ${i + 1}`, <span className="font-mono">{p}</span>]));
    } else if (g.type === 'key') {
      rows.push(['名称', g.label], ['算法', m.algo || '没有记录'], ['是否已验证', m.verified == null ? '没有记录' : m.verified ? '已验证' : '未验证'], ['证据', <span className="font-mono">{String(m.evidence || '没有记录')}</span>]);
    } else if (g.type === 'approval') {
      rows.push(['工具', g.label], ['状态', m.state === 'pending' ? '待审批' : m.state ? stateOf(m.state).label : '没有记录'], ['时间', m.ts ? new Date(m.ts).toLocaleString() : '没有记录'], ['理由', String(m.reason || '没有记录')], ['结果', m.result ? JSON.stringify(m.result) : '没有记录']);
    } else {
      const p = priorityOf(g.severity);
      rows.push(['标题', g.label], ['优先级', `${p} ${PRIORITY_WORD[p]}`], ['状态', g.state && REVIEW[g.state] ? <StatusMark status={REVIEW[g.state]} /> : '没有记录'],
        ['MASVS / CWE', <span className="font-mono">{m.masvs || '没有记录'}</span>], ['规则', <span className="font-mono">{m.rule_id || '没有记录'}</span>],
        ['修复建议', String(m.repro || '没有记录')], ['证据', <pre tabIndex={0} className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-all font-mono text-log">{String(m.evidence || '没有记录')}</pre>]);
    }
    setModal({ title: <span className="font-mono">{g.label}</span>, body: (
      <dl data-canvas-node-info>
        {rows.map(([k, v], i) => (
          <div key={i} className="flex min-w-0 items-baseline gap-3 py-1">
            <dt className="w-24 flex-none text-meta text-jz-ink-2">{k}</dt>
            <dd className="min-w-0 flex-1 break-all text-label text-jz-ink">{v}</dd>
          </div>))}
      </dl>) });
  }, [sid, graph]);
  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    const g = (node.data as unknown as CardData)?.g;
    if (g && !node.id.startsWith('__')) void openNode(g);
  }, [openNode]);

  const arrange = useCallback(() => { applyLayout(); fit(); }, [applyLayout, fit]);
  const exportPng = () => {
    const vp = canvasBoxRef.current?.querySelector('.react-flow__viewport');
    if (!vp) return;
    import('html-to-image').then(({ toPng }) => toPng(vp as HTMLElement, { backgroundColor: cssVar('--jz-canvas'), pixelRatio: 2 }))
      .then((url) => { const a = document.createElement('a'); a.href = url; a.download = `canvas_${sid}.png`; a.click(); });
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ sid, ...graph }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `canvas_${sid}.json`; a.click();
  };

  if (fail === 'forbidden') return <div data-attack-canvas="v3" data-state="forbidden"><PermissionState title="没有权限读取应用结构" message="当前账号不能读取这个会话的结构图。请切换账号或联系管理员。" /></div>;
  if (fail === 'error') return <div data-attack-canvas="v3"><ErrorState title="应用结构没有读到" message="结构图接口这次没有返回，所以没有可以画出的内容。" onRetry={() => setAttempt((n) => n + 1)} /></div>;
  if (!graph) return <div className="p-3" aria-busy="true" data-attack-canvas="v3" data-state="loading"><SkeletonLoader variant="chart" /></div>;
  if (!graph.nodes.length)
    return <div data-attack-canvas="v3" data-state="empty"><EmptyState title="应用结构还没有数据" cause="评估运行后，这里显示应用的组件、接口、配置项和它们之间的关系。" /></div>;

  const hasConfirmed = graph.nodes.some((n) => n.type === 'finding' && n.state === 'confirmed');
  const selected = selId ? layout?.visNodes.find((n) => n.id === selId) || null : null;
  const interfaces = apiTreeTotal || graphApiN || 0;
  const shownNodes = layout?.visNodes.length ?? graph.nodes.length;

  return (
    <div data-attack-canvas="v3" data-canvas-sel={selId || ''} data-canvas-it={itTarget?.nodeId || ''} data-state="ok" className="flex h-full min-w-0 flex-col bg-jz-surface">
      <style>{`
        .react-flow__attribution { display: none; }
        /* A node is a tab stop (Enter picks it); the library removes its outline, so the kit's focus ring is restored. */
        .react-flow__node.selectable:focus-visible, .react-flow__node:focus-visible { outline: var(--jz-focus-width) solid var(--jz-focus); outline-offset: var(--jz-focus-offset); }
      `}</style>
      <div className="flex min-w-0 flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-jz-border px-3 py-2" role="toolbar" aria-label="应用结构的工具" data-canvas-dock>
        <span className="whitespace-nowrap text-meta text-jz-ink-2" data-canvas-scope>
          {shownNodes < graph.nodes.length
            ? <>显示 <span className="font-mono tnum text-jz-ink">{shownNodes}</span> / <span className="font-mono tnum">{graph.nodes.length}</span> 个节点</>
            : <>节点 <span className="font-mono tnum text-jz-ink">{graph.nodes.length}</span> · 关系 <span className="font-mono tnum text-jz-ink">{graph.edges.length}</span></>} ·{' '}
          <span title={`接口总数来自接口清单${graphApiN ? `；图上另有 ${graphApiN} 个聚合后的接口节点` : ''}`}>已识别接口 <span className="font-mono tnum text-jz-ink">{interfaces}</span></span>
        </span>
        <Button size="sm" variant="secondary" disabled={!chains.length} data-canvas-chain title="逐条查看关联路径；路径上的节点和关系用活动线色画出"
          onClick={() => setChainIdx(chainIdx == null ? 0 : chainIdx + 1 >= chains.length ? null : chainIdx + 1)} className="max-[760px]:min-h-jz-touch">
          关联路径 <span className="font-mono tnum">{chains.length ? `${chainIdx == null ? 0 : chainIdx + 1}/${chains.length}` : '0'}</span>
        </Button>
        {chainOn && <span className="min-w-0 max-w-xs truncate text-meta text-jz-ink-2" title={chainOn.title || ''}>{chainOn.title || ''}</span>}
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2 max-[760px]:ml-0">
          <SegmentedControl<'confirmed' | 'all'> label="显示范围" value={focusOnly ? 'confirmed' : 'all'} onChange={(k) => setFocusOnly(k === 'confirmed')}
            items={[{ key: 'confirmed', label: '已确认发现', dataAttrs: { 'data-canvas-btn': 'focus' } }, { key: 'all', label: '全部', dataAttrs: { 'data-canvas-btn': 'all' } }]} />
          <SegmentedControl<'loose' | 'dense'> label="节点密度" value={dense ? 'dense' : 'loose'} onChange={(k) => setDense(k === 'dense')}
            items={[{ key: 'loose', label: '宽松' }, { key: 'dense', label: '紧凑', dataAttrs: { 'data-canvas-btn': 'dense' } }]} />
          <span className="flex flex-none items-center">
            <IconButton size="sm" label="放大" data-canvas-btn="zin" onClick={() => rf.zoomIn({ duration: 220 })}><Plus size={16} aria-hidden /></IconButton>
            <IconButton size="sm" label="缩小" data-canvas-btn="zout" onClick={() => rf.zoomOut({ duration: 220 })}><Minus size={16} aria-hidden /></IconButton>
            <IconButton size="sm" label="适应视口" data-canvas-btn="fit" onClick={fit}><Scan size={16} aria-hidden /></IconButton>
            <IconButton size="sm" label="回到应用节点" data-canvas-btn="home"
              onClick={() => { const p = layoutRef.current?.pos?.['app']; if (p) rf.setCenter(p.x + 110, p.y + 40, { zoom: Math.max(rf.getZoom(), 0.8), duration: 400 }); }}><LocateFixed size={16} aria-hidden /></IconButton>
            <IconButton size="sm" label="按层重新排布" data-canvas-btn="arrange" onClick={arrange}><LayoutGrid size={16} aria-hidden /></IconButton>
            <IconButton size="sm" label="导出当前视图为 PNG" data-canvas-btn="png" onClick={exportPng}><ImageIcon size={16} aria-hidden /></IconButton>
            <IconButton size="sm" label="导出结构图 JSON" data-canvas-btn="json" onClick={exportJson}><FileJson size={16} aria-hidden /></IconButton>
          </span>
          <Popover label="图例和操作" align="end"
            trigger={(p) => <Button {...p} size="sm" variant="ghost" icon={<Info size={14} aria-hidden />} data-canvas-legend-toggle className="max-[760px]:min-h-jz-touch">图例</Button>}>
            <div className="w-80 max-w-[80vw] space-y-3 p-1 text-meta text-jz-ink-2" data-canvas-legend>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {['app', 'component', 'deeplink', 'api_group', 'key', 'approval', 'finding'].map((t) => <NodeMark key={t} type={t} className="!text-jz-ink" />)}
              </div>
              <ul className="space-y-1 border-t border-jz-border pt-2" data-canvas-legend-flow>
                {LEGEND_LINES.map(([dash, w, text]) => (
                  <li key={text} className="flex items-center gap-2">
                    <svg width="28" height="8" aria-hidden className="flex-none text-jz-ink-2"><path d="M0 4h28" stroke="currentColor" strokeWidth={w} strokeDasharray={dash} fill="none" /></svg>{text}
                  </li>
                ))}
                <li>选中的节点、它的直接关系和正在查看的关联路径用活动线色加粗；其余内容保持原样。</li>
              </ul>
              <p className="border-t border-jz-border pt-2">滚轮缩放，拖动平移。点一个节点（或聚焦后按 Enter）设为检查对象；双击，或用“打开所选节点”，看组件和深链的源码或节点信息。</p>
            </div>
          </Popover>
        </div>
        {(selected || (focusOnly && !hasConfirmed)) && (
          <div className="flex min-w-0 basis-full flex-wrap items-center gap-x-3 gap-y-1 text-meta text-jz-ink-2">
            {selected && (
              <>
                <span className="inline-flex min-w-0 items-center gap-1.5" data-canvas-selected>已选 <NodeMark type={selected.type} /><span className="min-w-0 max-w-xs truncate text-jz-ink">{selected.label}</span></span>
                <Button size="sm" variant="secondary" onClick={() => void openNode(selected)} data-canvas-open className="max-[760px]:min-h-jz-touch">
                  {selected.type === 'component' || selected.type === 'deeplink' ? '打开所选节点的源码' : '打开所选节点的信息'}
                </Button>
                <Button size="sm" variant="ghost" onClick={onPaneClick}>取消选择</Button>
              </>
            )}
            {focusOnly && !hasConfirmed && <span data-canvas-nofocus>这个会话还没有已确认的风险发现，所以现在画的是全部节点。</span>}
          </div>
        )}
      </div>
      <div ref={canvasBoxRef} className="relative min-h-[30rem] flex-1 overflow-hidden bg-jz-canvas" onKeyDownCapture={onKeyDown}>
        <ReactFlow
          style={{ '--ac-nw': (dense ? NW_D : NW) + 'px' } as React.CSSProperties}
          nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes} colorMode={theme}
          onNodeClick={onNodeClick} onNodeDoubleClick={onNodeDoubleClick} onPaneClick={onPaneClick}
          minZoom={0.25} maxZoom={4} nodesConnectable={false} elevateNodesOnSelect={false} edgesFocusable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Panel position="bottom-right" className="max-[760px]:hidden">
            <div data-canvas-minimap className="overflow-hidden rounded-control border border-jz-border bg-jz-surface" title="小地图：点或拖动可以移动视口">
              <MiniMap pannable zoomable ariaLabel="应用结构的小地图"
                style={{ width: 150, height: 100, background: 'transparent' }}
                maskColor={cssVar('--jz-canvas', 0.72)}
                nodeColor={(n) => (n.type === 'header' ? 'transparent' : (n.type === 'finding' ? cssVar('--jz-orange') : cssVar('--jz-border-strong')) || 'transparent')}
                nodeStrokeColor={() => 'transparent'} nodeBorderRadius={4} />
            </div>
          </Panel>
        </ReactFlow>
      </div>
      <Dialog open={!!modal} onClose={() => setModal(null)} widthClass="w-[min(68rem,92vw)]" title={modal?.title}>
        <div data-canvas-src-modal>{modal?.body}</div>
      </Dialog>
    </div>
  );
};

export const AttackCanvas: React.FC = () => {
  const sid = usePentest((s) => s.sid);
  if (!sid) return <div className="p-3 text-label text-jz-ink-2">会话未挂载</div>;
  return <ReactFlowProvider><Flow sid={sid} /></ReactFlowProvider>;
};
