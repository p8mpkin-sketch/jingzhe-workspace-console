// CandidateRow.tsx — one knowledge candidate with its reason and source always on the row, and the full
// candidate detail. Every line comes from GET /api/kb/candidates: note (pre-review verdict and reason),
// evidence_refs, source, task_id, session_id, created_at, decided_at, status. Missing fields say so.
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { Button, Checkbox, StatusBadge, cx } from '@/components/ui';
import { catDotCls, fmtTime, KB_CAT_LABEL, parseCandidateRawText, parsePre, PRE_LABEL, shortenAbsPath } from './knowledgeModel';
import type { KBCandidate } from './knowledgeModel';

const CopyText: React.FC<{ value: string; label: string; attrs?: Record<string, string> }> = ({ value, label, attrs }) => {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={`复制${label}`} title={value} {...attrs}
      onClick={async (e) => { e.stopPropagation(); try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* clipboard unavailable */ } }}
      className="inline-flex max-w-full items-center gap-1 rounded-control border border-jz-border px-1.5 py-0.5 font-mono text-meta text-jz-ink-2 hover:bg-jz-hover">
      <span className="truncate">{label}</span>{done ? <Check size={12} aria-hidden className="flex-none" /> : <Copy size={12} aria-hidden className="flex-none text-jz-muted" />}
    </button>
  );
};

/** The reason line: the pre-review verdict and its reason, or the word for what is missing. */
export const ReasonLine: React.FC<{ c: KBCandidate }> = ({ c }) => {
  const { verdict, reason } = parsePre(c.note);
  return (
    <div className="flex min-w-0 items-start gap-2 text-label" data-kb-reason={c.id} data-kb-pre-note={verdict ? c.id : undefined}>
      <span className="w-10 flex-none text-jz-muted">理由</span>
      {verdict ? (
        <span className="min-w-0 break-words">
          <span className={cx('font-medium', verdict === 'needs_info' ? 'text-jz-amber-ink' : 'text-jz-ink')} data-kb-verdict={verdict}>{PRE_LABEL[verdict]}</span>
          <span className="text-jz-ink-2">{reason ? `:${reason}` : ':预审未附理由'}</span>
          <span className="ml-1 text-meta text-jz-muted">(预审建议,决定权在管理员)</span>
        </span>
      ) : <span className="text-jz-muted" data-kb-verdict="none">未预审</span>}
    </div>
  );
};

export const SourceLines: React.FC<{ c: KBCandidate }> = ({ c }) => {
  const refs = Array.isArray(c.evidence_refs) ? c.evidence_refs : [];
  return (
    <>
      <div className="flex min-w-0 items-start gap-2 text-label" data-kb-refs={c.id}>
        <span className="w-10 flex-none text-jz-muted">证据</span>
        {refs.length ? (
          <span className="flex min-w-0 flex-wrap gap-1">{refs.map((r, i) => <CopyText key={i} value={r} label={shortenAbsPath(r)} attrs={{ 'data-kb-ref': String(i) }} />)}</span>
        ) : <span className="text-jz-muted">没有证据引用</span>}
      </div>
      <div className="flex min-w-0 items-start gap-2 text-label" data-kb-source={c.id}>
        <span className="w-10 flex-none text-jz-muted">来源</span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {c.source ? <span className="break-all font-mono text-mono text-jz-ink-2" title={c.source}>{shortenAbsPath(c.source)}</span> : <span className="text-jz-muted">未提供来源</span>}
          {c.task_id ? <Link to={`/tasks/${c.task_id}`} className="rounded-control text-jz-ink-2 underline underline-offset-2 hover:text-jz-ink" data-kb-task-link={c.task_id}>来自任务 #{c.task_id}</Link>
            : <span className="text-jz-muted">未关联任务</span>}
          {c.session_id ? <span className="font-mono text-mono text-jz-muted" title="候选里没有项目编号,这里只显示会话编号">会话 #{c.session_id}</span> : <span className="text-jz-muted">未关联会话</span>}
        </span>
      </div>
    </>
  );
};

export const CandidateRow: React.FC<{
  c: KBCandidate; checked?: boolean; busy?: boolean;
  onCheck?: (id: number, on: boolean) => void;
  onDecide?: (c: KBCandidate, action: 'approve' | 'reject') => void;
  onInspect: (c: KBCandidate) => void;
}> = ({ c, checked, busy, onCheck, onDecide, onInspect }) => {
  const p = useMemo(() => parseCandidateRawText(c.content), [c.content]);
  const pending = c.status === 'pending';
  return (
    <li className="border-b border-jz-border px-4 py-3 last:border-b-0" data-kb-cand-card={c.id} data-kb-cand-status={c.status}>
      <div className="flex min-w-0 items-start gap-3">
        {pending && onCheck && (
          <span className="pt-0.5"><Checkbox checked={!!checked} onChange={(e) => onCheck(c.id, e.target.checked)} aria-label={`选择候选 #${c.id}`} data-kb-cand-check={c.id} /></span>
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-mono tnum text-jz-muted">#{c.id}</span>
            <span className="inline-flex items-center gap-1.5 text-meta text-jz-ink-2"><span aria-hidden className={cx('h-2 w-2 flex-none rounded-pill', catDotCls(c))} />{KB_CAT_LABEL[c.category] || c.category || '未分类'}</span>
            <button type="button" onClick={() => onInspect(c)} data-kb-cand-inspect={c.id} data-kb-cand-title
              className="min-w-0 max-w-full truncate rounded-control text-left font-medium text-jz-ink underline-offset-2 hover:underline" title={p.title || c.content}>
              {p.title || '(候选没有正文)'}
            </button>
            <span className="ml-auto font-mono text-meta tnum text-jz-muted">提出 {fmtTime(c.created_at)}</span>
          </div>
          <ReasonLine c={c} />
          <SourceLines c={c} />
          {!pending && (
            <div className="flex items-center gap-2 text-label" data-kb-decided={c.id}>
              <span className="w-10 flex-none text-jz-muted">结果</span>
              <StatusBadge tone={c.status === 'approved' ? 'success' : 'neutral'}>{c.status === 'approved' ? '已通过,写入知识库' : '已拒绝,记录保留'}</StatusBadge>
              <span className="font-mono text-meta tnum text-jz-muted">决定于 {fmtTime(c.decided_at)}</span>
            </div>
          )}
        </div>
        {pending && onDecide && (
          <div className="flex flex-none flex-col gap-1.5 tablet:flex-row max-[760px]:hidden">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(c, 'approve')} data-kb-approve={c.id}>通过</Button>
            <Button size="sm" variant="ghost" className="text-jz-red" disabled={busy} onClick={() => onDecide(c, 'reject')} data-kb-reject={c.id}>拒绝</Button>
          </div>
        )}
      </div>
      {pending && onDecide && (
        <div className="mt-2 hidden gap-2 max-[760px]:flex">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onDecide(c, 'approve')} data-kb-approve-m={c.id}>通过</Button>
          <Button size="sm" variant="ghost" className="text-jz-red" disabled={busy} onClick={() => onDecide(c, 'reject')} data-kb-reject-m={c.id}>拒绝</Button>
        </div>
      )}
    </li>
  );
};

/** Full candidate: the same parser as the row, every field expanded, and the raw text. */
export const CandidateDetail: React.FC<{ c: KBCandidate }> = ({ c }) => {
  const p = useMemo(() => parseCandidateRawText(c.content), [c.content]);
  const block = 'rounded-control border border-jz-border bg-jz-surface-2 px-3 py-2';
  return (
    <div className="space-y-3" data-kb-cand-inspector={c.id}>
      <div className="flex flex-wrap items-center gap-2 text-meta">
        <span className="inline-flex items-center gap-1.5 text-jz-ink-2"><span aria-hidden className={cx('h-2 w-2 rounded-pill', catDotCls(c))} />{KB_CAT_LABEL[c.category] || c.category}</span>
        <StatusBadge tone={c.status === 'pending' ? 'attention' : c.status === 'approved' ? 'success' : 'neutral'}>{c.status === 'pending' ? '待审' : c.status === 'approved' ? '已通过' : '已拒绝'}</StatusBadge>
        <span className="font-mono text-jz-muted">#{c.id}</span>
      </div>
      <div className="space-y-1.5 border-y border-jz-border py-2">
        <ReasonLine c={c} />
        <SourceLines c={c} />
      </div>
      {p.trigger && <div className={block}><div className="mb-0.5 text-meta font-semibold text-jz-muted">触发条件 / 核心策略</div><div className="whitespace-pre-wrap break-words text-body text-jz-ink">{p.trigger}</div></div>}
      {(p.vectors.length > 0 || p.vectorStray) && (
        <div className={cx(block, 'max-h-72 space-y-1.5 overflow-y-auto font-mono text-meta')}>
          <div className="font-sans font-semibold text-jz-muted">检测向量</div>
          {p.vectors.map((b) => (
            <div key={b.key}>
              <div className={b.empty ? 'text-jz-muted' : 'font-semibold text-jz-ink'}>▍{b.key}:{b.empty ? ' 未检出特征' : ''}</div>
              {b.items.map((it, i) => <div key={i} className="break-all pl-3 text-jz-ink-2">- {it}</div>)}
              {b.ai && <div className="break-all pl-3 text-jz-ink-2">▸分析: {b.ai}</div>}
            </div>
          ))}
          {p.vectorStray && <div className="whitespace-pre-wrap break-words text-jz-ink-2">{p.vectorStray}</div>}
        </div>
      )}
      {p.soFingerprint && <div className={cx(block, 'break-all font-mono text-meta text-jz-ink-2')}>So 指纹: {p.soFingerprint}</div>}
      {p.weapons.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-meta">
          <span className="text-jz-muted">工具映射</span>
          {p.weapons.map((w, i) => <span key={i} className="rounded-control border border-jz-border px-1.5 py-0.5 font-mono text-jz-ink-2">{w.from} → {w.to || '—'}</span>)}
        </div>
      )}
      {p.verify && <div className="text-meta text-jz-ink-2">验证状态(候选自报): {p.verify}</div>}
      {p.others.map((o, i) => (
        <div key={i} className={block}>
          <div className="mb-0.5 text-meta font-semibold text-jz-muted">【{o.label}】</div>
          <div className="whitespace-pre-wrap break-words text-meta leading-relaxed text-jz-ink-2">{o.body}</div>
        </div>
      ))}
      <details className={block}>
        <summary className="cursor-pointer select-none text-meta text-jz-muted">候选原文</summary>
        <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-meta text-jz-ink-2" data-kb-cand-raw={c.id}>{c.content}</pre>
      </details>
    </div>
  );
};
