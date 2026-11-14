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
      <div className="text-meta text-jz-muted mb-1">📚 报告溯源出处{citations.length > 0 && `(命中 ${citations.length} 处)`}</div>
      <div className="grid sm:grid-cols-2 gap-1.5">
        {citations.map((c, j) => (
          <div key={j} role="button" tabIndex={0} onClick={() => { window.location.hash = `/tasks?focus=${c.task_id}`; }}
            onKeyDown={(e) => { if (e.key === 'Enter') window.location.hash = `/tasks?focus=${c.task_id}`; }}
            className="text-left px-2 py-1.5 rounded-control bg-jz-surface-2/60 hover:ring-1 hover:ring-jz-brand/50 transition-all cursor-pointer" data-citation-card
            title={`task${c.task_id} ${c.ref}——点击跳转任务`}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="flex-none w-4 h-4 rounded-control bg-jz-brand/15 text-jz-brand text-meta font-semibold grid place-items-center tabular-nums">{j + 1}</span>
              <span className="text-meta font-mono text-jz-ink-2 truncate flex-1">task{c.task_id} · {c.ref}</span>
              {c.score != null && (
                <span data-citation-score title="bm25 相对相关度(同查询组内归一,榜首=1.00;FTS5 关键词检索,非向量相似度)"
                  className={`flex-none px-1 rounded-control text-meta font-mono tabular-nums ${c.score >= 0.85 ? 'bg-jz-teal/15 text-jz-teal' : 'bg-jz-sev-medium/15 text-jz-sev-medium'}`}>
                  {Number(c.score).toFixed(2)}
                </span>
              )}
            </div>
            {c.snippet && <div className="text-meta text-jz-muted leading-snug line-clamp-2">{String(c.snippet).slice(0, 120)}</div>}
            {onInspect && (
              <button onClick={(e) => { e.stopPropagation(); onInspect(c); }} data-citation-inspect
                title="展开原文对照(双栏阅读)"
                className="mt-1 text-meta text-jz-brand hover:underline">⤢ 原文对照</button>
            )}
          </div>
        ))}
        {sources.map((p2) => (
          <button key={p2} onClick={() => onOpenSource(sourceTaskId, p2)}
            className="text-left px-2 py-1.5 rounded-control bg-jz-surface-2/40 hover:ring-1 hover:ring-jz-brand/50 transition-all" data-source-chip
            title={`代码出处: ${p2}——点击加载片段`}>
            <div className="flex items-center gap-1.5">
              <span className="flex-none text-meta text-jz-brand font-semibold">‹/›</span>
              <span className="text-meta font-mono text-jz-ink-2 truncate">{p2}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default CitationGrid;
