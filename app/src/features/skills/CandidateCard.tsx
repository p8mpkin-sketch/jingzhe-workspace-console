// CandidateCard.tsx — 自学习候选审核台结构化宽幅卡(Rxxx 重构):
// 候选原文经 parseCandidateRawText 拆解为 标题/触发条件(sky 高亮框)/检测向量(深色等宽代码容器+展开切换)/
// So 指纹/绕过武器映射(战术胶囊组)/验证状态/来源;预审「? 待信息」→琥珀警示盒;卡高均匀 360px(体内滚动)。
// 字号八档口径: 本文件 font 一律 11/12/13/14/16/20/24/28。
import React, { useMemo, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { Badge } from '@/components/ui';
import { parseCandidateRawText, catBadgeCls, KB_CAT_LABEL } from './skillsShared';
import type { KBCandidate, ParsedCand } from './skillsShared';

const PreNote: React.FC<{ cand: KBCandidate }> = ({ cand }) => {
  const note = cand.note || '';
  if (!note.startsWith('[预审]')) return null;
  const adopt = note.includes('[预审] adopt');
  const reject = note.includes('[预审] reject');
  const reason = note.replace(/^\[预审\] \w+: /, '');
  if (adopt || reject) {
    return (
      <div data-kb-pre-note={cand.id}
 className={`flex items-start gap-1.5 rounded-control px-3 py-2 text-meta leading-relaxed ${adopt
 ? 'bg-jz-teal/10 text-jz-teal' : 'bg-jz-sev-critical/10 text-jz-sev-critical'}`}>
        <span className="font-semibold shrink-0" title="LLM 预审建议(R267/268),决定权在 admin">
          {adopt ? '✓ 建议通过' : '✕ 建议拒绝'}
        </span>
        <span className="break-words opacity-90">{reason || '(预审未附理由)'}</span>
      </div>
    );
  }
  // 「? 待信息」缺实证 → 琥珀警示盒(单列整行)
  return (
    <div data-kb-pre-note={cand.id}
 className="rounded-control bg-jz-sev-medium/10 border border-jz-sev-medium/30 px-3 py-2 text-meta text-jz-sev-medium flex items-start gap-1.5 leading-relaxed">
      <span className="font-semibold shrink-0" title="LLM 预审建议(R267/268),决定权在 admin">? 待信息</span>
      <span className="break-words">预审判定实证不足:{reason || '需补充 findings 产物后再审'}——建议挂账补证,勿盲过。</span>
    </div>
  );
};

/** 检测向量深色等宽代码容器(折叠 max-h-48 滚动 / 展开全量,卡体自滚)。 */
const VectorsBox: React.FC<{ p: ParsedCand; candId: number }> = ({ p, candId }) => {
 const [open, setOpen] = useState(false);
 const total = p.vectors.reduce((n, b) => n + b.items.length, 0);
  return (
    <div className="rounded-card bg-jz-surface-2/80 ring-1 ring-jz-border/40 overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 pt-2.5 pb-1">
        <span className="text-meta font-mono text-jz-muted">检测向量 · {p.vectors.length} 类 {total} 条</span>
        <span className="flex-1" />
        <button onClick={() => setOpen((v) => !v)} data-kb-cand-vec-toggle={candId}
 className="text-meta text-jz-brand hover:underline">
          {open ? '收起' : '展开全部'}
        </button>
      </div>
      <div className={`px-3.5 pb-3 space-y-1.5 font-mono text-meta overflow-y-auto ${open ? 'max-h-none' : 'max-h-48'}`}>
 {p.vectors.map((b) => (
          <div key={b.key}>
            <div className={b.empty ? 'text-jz-muted' : 'text-jz-sev-low font-semibold'}>▍{b.key}:{b.empty ? ' 未检出特征(诚实记账,待实战补)' : ''}</div>
 {b.items.map((it, i) => (
              <div key={i} className="pl-3 text-jz-ink-2 break-all">- {it}</div>
            ))}
            {b.ai && <div className="pl-3 text-jz-brand/80 break-all">▸AI分析: {b.ai}</div>}
          </div>
        ))}
        {p.vectorStray && <div className="text-jz-ink-2 whitespace-pre-wrap break-words">{p.vectorStray}</div>}
      </div>
    </div>
  );
};

export const CandidateCard: React.FC<{
 cand: KBCandidate;
 checked: boolean;
 busy: boolean;
 onCheck: (id: number, on: boolean) => void;
 onDecide: (id: number, action: 'approve' | 'reject') => void;
 onInspect: (c: KBCandidate) => void;
}> = ({ cand, checked, busy, onCheck, onDecide, onInspect }) => {
 const p = useMemo(() => parseCandidateRawText(cand.content), [cand.content]);
  return (
    <div data-kb-cand-card={cand.id}
 className="flex flex-col gap-2.5 h-[360px] rounded-panel bg-jz-surface shadow-card ring-1 ring-jz-border/40 p-4 hover:ring-jz-brand/30 transition-all">
      {/* 卡头: 分类彩色徽章 + #ID(font-mono text-body) + 来源胶囊 / 标题大字 */}
      <div className="flex items-start gap-2.5 shrink-0">
        <span className="w-7 h-7 rounded-control bg-jz-brand/10 text-jz-brand grid place-items-center shrink-0">
          <GraduationCap className="w-3.5 h-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`px-2 py-0.5 rounded-control text-meta font-medium ${catBadgeCls(cand)}`}>
              {KB_CAT_LABEL[cand.category] || cand.category}
            </span>
            <span className="px-1.5 py-0.5 rounded-control bg-jz-surface-2/60 text-meta font-mono text-jz-muted"
 title={`候选产源: ${cand.source || '未知'}`}>{cand.source || '未知来源'}</span>
            <span className="text-meta text-jz-muted font-mono">task#{cand.task_id}{cand.session_id ? ` · sid${cand.session_id}` : ''}</span>
          </div>
          <div className="text-section font-semibold text-jz-ink leading-snug mt-1 line-clamp-1" title={p.title}>{p.title}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="font-mono text-body text-jz-muted tnum" title="候选 ID">#{cand.id}</span>
          <input type="checkbox" data-kb-cand-check={cand.id}
 checked={checked}
 onChange={(e) => onCheck(cand.id, e.target.checked)}
 className="w-3 h-3 accent-jz-brand" title="勾选加入批量终审" />
        </div>
      </div>

      {/* 卡体(均匀高 360px: 体内滚动,零内容丢失) */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5" data-kb-cand-content={cand.id}>
        {p.trigger && (
          <div data-kb-cand-trigger={cand.id}
 className="border-l-2 border-jz-brand/70 dark:border-jz-brand/70 bg-jz-brand/5 dark:bg-jz-brand/10 text-jz-brand dark:text-jz-brand p-3.5 rounded-r-card text-body leading-relaxed whitespace-pre-wrap break-words">
            <span className="font-semibold text-jz-brand dark:text-jz-brand">触发条件 / 核心策略 </span>
            {p.trigger}
          </div>
        )}
        <PreNote cand={cand} />
 {(p.vectors.length > 0 || p.vectorStray) && <VectorsBox p={p} candId={cand.id} />}
        {p.soFingerprint && (
          <div className="font-mono text-meta text-jz-ink-2 bg-jz-surface-2/50 rounded-control px-2.5 py-1.5 break-all">
            🧬 So 指纹: {p.soFingerprint}
          </div>
 )}
 {p.weapons.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-meta text-jz-muted shrink-0">绕过武器映射</span>
 {p.weapons.map((w, i) => (
              <span key={i} className="px-2 py-0.5 rounded-pill bg-jz-teal/10 text-jz-teal text-meta font-mono"
 title={`战术映射: ${w.from} → ${w.to || '(原文未附映射)'}`}>
                {w.from} ➔ {w.to || '—'}
              </span>
            ))}
          </div>
        )}
        {(p.verify || p.source) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {p.verify && (
              <span className="px-2 py-0.5 rounded-control bg-jz-surface-2/60 text-meta text-jz-ink-2 break-all"
 title="候选自报验证状态(原文如实透出,不冒充平台复核)">验证状态: {p.verify}</span>
            )}
            {p.source && (
              <span className="px-2 py-0.5 rounded-control bg-jz-surface-2/60 text-meta font-mono text-jz-muted break-all"
 title="候选产源原文(绝对路径已缩短展示)">{p.source}</span>
            )}
          </div>
 )}
 {p.others.map((o, i) => (
          <div key={i} className="rounded-control bg-jz-surface-2/40 px-3 py-2">
            <div className="text-meta font-semibold text-jz-muted mb-0.5">【{o.label}】</div>
            {o.long ? (
              <div className="font-mono text-meta text-jz-ink-2 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">{o.body}</div>
            ) : (
              <div className="text-meta text-jz-ink-2 whitespace-pre-wrap break-words leading-relaxed">{o.body}</div>
            )}
          </div>
 ))}
 {p.plain.map((t, i) => (
          <div key={i} className="text-body text-jz-ink-2 leading-relaxed whitespace-pre-wrap break-words">{t}</div>
 ))}
 {Array.isArray(cand.evidence_refs) && cand.evidence_refs.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
 {cand.evidence_refs.map((r, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded-control bg-jz-surface-2/60 text-meta font-mono text-jz-muted break-all" title="真实产物出处">{r}</span>
            ))}
          </div>
        )}
      </div>

      {/* 底部操作栏: 绿实心批准 + 玫红描边拒绝 + 抽屉全屏检视(审核不可逆) */}
      <div className="flex items-center gap-2 shrink-0 pt-2 border-t border-jz-border/40">
        <button onClick={() => onDecide(cand.id, 'approve')} disabled={busy} data-kb-approve={cand.id}
 title="通过→写入正式知识库(kb_index),可被 /api/kb/search 检索;审核不可逆(已决定不改写)"
 className="h-9 px-4 rounded-control bg-jz-teal text-jz-on-brand text-body font-semibold hover:bg-jz-teal/85 disabled:opacity-40 transition-colors">
          ✓ 批准写入知识库
        </button>
        <button onClick={() => onDecide(cand.id, 'reject')} disabled={busy} data-kb-reject={cand.id}
 title="拒绝→留档不删(审计可查),不写入知识库;审核不可逆(已决定不改写)"
 className="h-9 px-4 rounded-control border border-jz-sev-critical/60 text-jz-sev-critical text-body font-semibold hover:bg-jz-sev-critical/10 disabled:opacity-40 transition-colors">
          ✕ 拒绝留档
        </button>
        <span className="flex-1" />
        <button onClick={() => onInspect(cand)} data-kb-cand-inspect={cand.id}
 title="抽屉全屏检视: 结构化字段完整展开+原文兜底"
 className="h-9 px-3 rounded-control bg-jz-surface-2/60 text-jz-ink-2 text-body hover:text-jz-brand transition-colors">
           抽屉全屏检视
        </button>
      </div>
    </div>
  );
};

/** 抽屉全屏检视体: 与卡片同解析器,字段全展开(向量不折叠),附原文兜底(零丢失)。 */
export const CandidateInspector: React.FC<{ cand: KBCandidate }> = ({ cand }) => {
 const p = useMemo(() => parseCandidateRawText(cand.content), [cand.content]);
  return (
    <div className="space-y-3" data-kb-cand-inspector={cand.id}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`px-2 py-0.5 rounded-control text-meta font-medium ${catBadgeCls(cand)}`}>
          {KB_CAT_LABEL[cand.category] || cand.category}
        </span>
        <Badge level={cand.status === 'pending' ? 'medium' : cand.status === 'approved' ? 'safe' : 'info'}>{cand.status}</Badge>
        <span className="font-mono text-body text-jz-muted">#{cand.id}</span>
        <span className="text-meta text-jz-muted font-mono">task#{cand.task_id}{cand.session_id ? ` · sid${cand.session_id}` : ''}</span>
        {cand.source && <span className="px-1.5 py-0.5 rounded-control bg-jz-surface-2/60 text-meta font-mono text-jz-muted">{cand.source}</span>}
      </div>
      <div className="text-section font-semibold text-jz-ink break-words">{p.title}</div>
      {p.trigger && (
        <div className="border-l-2 border-jz-brand/70 dark:border-jz-brand/70 bg-jz-brand/5 dark:bg-jz-brand/10 text-jz-brand dark:text-jz-brand p-3.5 rounded-r-card text-body leading-relaxed whitespace-pre-wrap break-words">
          <span className="font-semibold text-jz-brand dark:text-jz-brand">触发条件 / 核心策略 </span>{p.trigger}
        </div>
 )}
 {(p.vectors.length > 0 || p.vectorStray) && (
        <div className="rounded-card bg-jz-surface-2/80 ring-1 ring-jz-border/40 p-3.5 space-y-1.5 font-mono text-meta overflow-y-auto max-h-72">
 {p.vectors.map((b) => (
            <div key={b.key}>
              <div className={b.empty ? 'text-jz-muted' : 'text-jz-sev-low font-semibold'}>▍{b.key}:{b.empty ? ' 未检出特征(诚实记账,待实战补)' : ''}</div>
 {b.items.map((it, i) => <div key={i} className="pl-3 text-jz-ink-2 break-all">- {it}</div>)}
              {b.ai && <div className="pl-3 text-jz-brand/80 break-all">▸AI分析: {b.ai}</div>}
            </div>
          ))}
          {p.vectorStray && <div className="text-jz-ink-2 whitespace-pre-wrap break-words">{p.vectorStray}</div>}
        </div>
 )}
 {p.weapons.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-meta text-jz-muted shrink-0">绕过武器映射</span>
 {p.weapons.map((w, i) => (
            <span key={i} className="px-2 py-0.5 rounded-pill bg-jz-teal/10 text-jz-teal text-meta font-mono">{w.from} ➔ {w.to || '—'}</span>
          ))}
        </div>
      )}
      {p.soFingerprint && (
        <div className="font-mono text-meta text-jz-ink-2 bg-jz-surface-2/50 rounded-control px-2.5 py-1.5 break-all">🧬 So 指纹: {p.soFingerprint}</div>
 )}
 {p.others.map((o, i) => (
        <div key={i} className="rounded-control bg-jz-surface-2/40 px-3 py-2">
          <div className="text-meta font-semibold text-jz-muted mb-0.5">【{o.label}】</div>
          <div className="text-meta text-jz-ink-2 whitespace-pre-wrap break-words leading-relaxed">{o.body}</div>
        </div>
 ))}
 {p.plain.map((t, i) => (
        <div key={i} className="text-body text-jz-ink-2 leading-relaxed whitespace-pre-wrap break-words">{t}</div>
      ))}
      <PreNote cand={cand} />
      {(p.verify || p.source) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {p.verify && <span className="px-2 py-0.5 rounded-control bg-jz-surface-2/60 text-meta text-jz-ink-2 break-all">验证状态: {p.verify}</span>}
          {p.source && <span className="px-2 py-0.5 rounded-control bg-jz-surface-2/60 text-meta font-mono text-jz-muted break-all">{p.source}</span>}
        </div>
 )}
 {Array.isArray(cand.evidence_refs) && cand.evidence_refs.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
 {cand.evidence_refs.map((r, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded-control bg-jz-surface-2/60 text-meta font-mono text-jz-muted break-all" title="真实产物出处">{r}</span>
          ))}
        </div>
      )}
      <details className="rounded-control bg-jz-surface-2/40 px-3 py-2">
        <summary className="text-meta text-jz-muted cursor-pointer select-none">候选原文兜底(解析器全覆盖核对用)</summary>
        <pre className="mt-1.5 font-mono text-meta text-jz-ink-2 whitespace-pre-wrap break-words" data-kb-cand-raw={cand.id}>{cand.content}</pre>
      </details>
    </div>
  );
};
