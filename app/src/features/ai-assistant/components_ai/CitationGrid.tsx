import React from 'react';

/** P2-⑤(修正版①): Citations 溯源卡网格——citations 结构=后端既有真值 {task_id, ref, snippet};
 *  score/confidence 字段后端当前不返回——有则渲染置信度徽章,没有则不渲染(禁编造);
 *  命中原文摘要(snippet)为存量已有能力,此处升级为双列卡片 + 序号徽章 + 摘要两行截断。
 *  正文中提取到的代码出处(source chips)同网格收编,点击走既有 /api/chat/source 链。 */

export const CitationGrid: React.FC<{
  citations: Array<{ task_id: number; ref: string; snippet?: string; score?: number; confidence_level?: string }>;
  sources: string[];
  sourceTaskId: number;
  onOpenSource: (taskId: number, path: string) => void;
  onInspect?: (c: { task_id: number; ref: string; title?: string }) => void;
}> = ({ citations, sources, sourceTaskId, onOpenSource, onInspect }) => {
  if (!citations.length && !sources.length) return null;
  return (
    <div className="mt-2" data-citation-grid>
      <div className="text-[11px] text-jz-text-muted mb-1">📚 报告溯源出处{citations.length > 0 && `(命中 ${citations.length} 处)`}</div>
      <div className="grid sm:grid-cols-2 gap-1.5">
        {citations.map((c, j) => (
          <div key={j} role="button" tabIndex={0} onClick={() => { window.location.hash = `/tasks?focus=${c.task_id}`; }}
            onKeyDown={(e) => { if (e.key === 'Enter') window.location.hash = `/tasks?focus=${c.task_id}`; }}
            className="text-left px-2 py-1.5 rounded-lg bg-jz-elevated/60 hover:ring-1 hover:ring-neon-accent/50 transition-all cursor-pointer" data-citation-card
            title={`task${c.task_id} ${c.ref}——点击跳转任务`}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="flex-none w-4 h-4 rounded bg-neon-accent/15 text-neon-accent text-[11px] font-bold grid place-items-center tabular-nums">{j + 1}</span>
              <span className="text-[11px] font-mono text-jz-text-secondary truncate flex-1">task{c.task_id} · {c.ref}</span>
              {c.score != null && (
                <span data-citation-score title="bm25 相对相关度(同查询组内归一,榜首=1.00;FTS5 关键词检索,非向量相似度)"
                  className={`flex-none px-1 rounded text-[11px] font-mono tabular-nums ${c.score >= 0.85 ? 'bg-vuln-safe/15 text-vuln-safe' : 'bg-vuln-medium/15 text-vuln-medium'}`}>
                  {Number(c.score).toFixed(2)}
                </span>
              )}
            </div>
            {c.snippet && <div className="text-[11px] text-jz-text-muted leading-snug line-clamp-2">{String(c.snippet).slice(0, 120)}</div>}
            {onInspect && (
              <button onClick={(e) => { e.stopPropagation(); onInspect(c); }} data-citation-inspect
                title="展开原文对照(双栏阅读)"
                className="mt-1 text-[11px] text-neon-accent hover:underline">⤢ 原文对照</button>
            )}
          </div>
        ))}
        {sources.map((p2) => (
          <button key={p2} onClick={() => onOpenSource(sourceTaskId, p2)}
            className="text-left px-2 py-1.5 rounded-lg bg-jz-elevated/40 hover:ring-1 hover:ring-neon-accent/50 transition-all" data-source-chip
            title={`代码出处: ${p2}——点击加载片段`}>
            <div className="flex items-center gap-1.5">
              <span className="flex-none text-[11px] text-neon-accent font-bold">‹/›</span>
              <span className="text-[11px] font-mono text-jz-text-secondary truncate">{p2}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default CitationGrid;
