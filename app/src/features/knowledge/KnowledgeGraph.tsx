// KnowledgeGraph.tsx — relation query (admins): GET /api/kb/relations?q=, drawn as a force graph. ECharts is
// imported only when a query returned nodes, so /knowledge itself no longer downloads it.
import React, { useEffect, useRef, useState } from 'react';
import { api } from '@/services/api';
import { Button, ErrorState, Input, PermissionState, tokenColor, tokenPx, useThemeVersion } from '@/components/ui';
import type { ColorToken } from '@/components/ui';
import { isDenied } from '@/features/dashboard/readout';

const NODE_TOKENS: { name: string; token: ColorToken }[] = [
  { name: 'packer', token: 'orange' }, { name: 'task', token: 'teal' }, { name: 'item', token: 'brand' },
  { name: 'source', token: 'muted' }, { name: 'vuln', token: 'red' },
];

const loadEcharts = async () => {
  const [core, charts, comps, renderers] = await Promise.all([
    import('echarts/core'), import('echarts/charts'), import('echarts/components'), import('echarts/renderers'),
  ]);
  core.use([charts.GraphChart, comps.TooltipComponent, comps.LegendComponent, renderers.CanvasRenderer]);
  return core;
};

const GraphCanvas: React.FC<{ graph: any }> = ({ graph }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const tv = useThemeVersion();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let inst: any = null; let alive = true; const onResize = () => inst?.resize();
    loadEcharts().then((echarts) => {
      if (!alive || !ref.current) return;
      inst = echarts.init(ref.current);
      const cats = NODE_TOKENS.map((c) => ({ name: c.name, color: tokenColor(c.token) }));
      const idx: Record<string, number> = {}; cats.forEach((c, i) => { idx[c.name] = i; });
      const deg: Record<string, number> = {};
      (graph.edges || []).forEach((e: any) => { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; });
      inst.setOption({
        tooltip: { confine: true, formatter: (p: any) => (p.dataType === 'node' ? `${p.data.name}<br/>类型 ${p.data.catName} · 关联 ${deg[p.data.name] || 0}` : `${p.data.sourceName} → ${p.data.targetName}<br/>${p.data.rel} ×${p.data.count || 1}`) },
        legend: { data: cats.map((c) => c.name), textStyle: { color: tokenColor('muted'), fontSize: tokenPx('chart-tick') }, top: 0 },
        series: [{
          type: 'graph', layout: 'force', roam: true, draggable: true,
          force: { repulsion: 140, edgeLength: [40, 110], layoutAnimation: true }, categories: cats,
          label: { show: true, color: tokenColor('ink-2'), fontSize: tokenPx('chart-tick'), formatter: (p: any) => String(p.data.name || '').replace(/^(src|item|packer|vuln|task):/, '').slice(0, 18) },
          data: (graph.nodes || []).map((n: any) => ({ id: n.id, name: n.id, category: idx[n.type] ?? 2, catName: n.type, symbolSize: 14 + Math.min(18, (deg[n.id] || 0) * 3) })),
          edges: (graph.edges || []).map((e: any) => ({ source: e.a, target: e.b, rel: e.rel, count: e.count || 1, lineStyle: { width: Math.min(4, 1 + (e.count || 1) / 4), opacity: 0.55 }, sourceName: e.a, targetName: e.b })),
        }],
      }, { notMerge: true });
      window.addEventListener('resize', onResize);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; window.removeEventListener('resize', onResize); inst?.dispose(); };
  }, [graph, tv]);
  if (failed) return <p className="p-3 text-label text-jz-muted">图形组件没有加载成功;下面的分组列表不受影响。</p>;
  return <div ref={ref} data-kb-graph-canvas className="h-80 w-full" />;
};

export const KnowledgeGraph: React.FC = () => {
  const [q, setQ] = useState('ijiami');
  const [graph, setGraph] = useState<any | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const run = () => {
    if (!q.trim()) return;
    setBusy(true); setErr(null);
    api<any>(`/api/kb/relations?q=${encodeURIComponent(q.trim())}`)
      .then((g) => setGraph(g)).catch((e) => { setGraph(null); setErr(e ?? new Error('查询失败')); }).finally(() => setBusy(false));
  };
  const nodes: any[] = graph?.nodes || [];
  const edges: any[] = graph?.edges || [];
  return (
    <div className="space-y-3" data-kb-graph>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <div className="w-full max-w-xs"><Input value={q} onChange={(e) => setQ(e.target.value)} aria-label="关联查询关键词" placeholder="关键词,例如 ijiami" /></div>
        <Button type="submit" variant="secondary" loading={busy} disabled={busy} data-kb-graph-query>{busy ? '查询中…' : '查询'}</Button>
        {graph && <span className="font-mono text-meta tnum text-jz-muted">{nodes.length} 节点 / {edges.length} 边</span>}
      </form>
      {err != null && (isDenied(err) ? <PermissionState compact title="无权限查询关联" message="当前账号不能查询知识关联。" />
        : <ErrorState compact title="关联查询没有结果返回" message={(err as any)?.message} onRetry={run} />)}
      {graph && nodes.length > 0 && <div className="overflow-hidden rounded-card border border-jz-border" data-kb-graph-box><GraphCanvas graph={graph} /></div>}
      {graph && nodes.length > 0 && (
        <div className="grid grid-cols-1 gap-3 text-label tablet:grid-cols-3">
          <div><div className="mb-1 text-meta text-jz-muted">加固方案</div>{nodes.filter((n) => n.type === 'packer').map((n) => <div key={n.id} className="font-mono text-jz-ink-2">{n.id}</div>)}</div>
          <div><div className="mb-1 text-meta text-jz-muted">发现类型</div>{nodes.filter((n) => n.type === 'vuln').map((n) => <div key={n.id} className="font-mono text-jz-ink-2">{n.id}</div>)}
            {!nodes.some((n) => n.type === 'vuln') && <span className="text-jz-muted">—</span>}</div>
          <div><div className="mb-1 text-meta text-jz-muted">出现 2 次以上的关联</div>{edges.filter((e) => (e.count || 0) >= 2).slice(0, 5).map((e, i) => (
            <div key={i} className="truncate font-mono text-jz-ink-2" title={`${e.a} → ${e.b} (${e.rel})`}>{e.a.replace(/^(src|item):/, '')}→{e.b.replace(/^(src|item|packer|vuln|task):/, '')} ×{e.count}</div>))}</div>
        </div>
      )}
      {graph && nodes.length === 0 && <p className="text-label text-jz-muted">没有找到与这个关键词相关的条目。</p>}
    </div>
  );
};

export default KnowledgeGraph;
