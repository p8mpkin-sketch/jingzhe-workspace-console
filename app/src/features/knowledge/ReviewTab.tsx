// ReviewTab.tsx — knowledge candidates for admins: pre-review filter, pre-review trigger, single and batch decisions,
// the decided record, and the relation query below. Requests as before: GET | POST /api/kb/candidates,
// POST /api/kb/candidates/decide-batch {ids, action}, POST /api/kb/candidates/pre-review {limit: 20}.
// The reason shown is the backend's own (note, evidence_refs, source, task, session); no admin reason is collected.
import React, { Suspense, lazy, useMemo, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { api } from '@/services/api';
import { Button, ConfirmDialog, Drawer, EmptyState, ErrorState, Panel, PermissionState, SegmentedControl, SkeletonLoader, StaleNotice, toast } from '@/components/ui';
import { isDenied, isRateLimited, STALE_WORD, useSlow } from '@/features/dashboard/readout';
import type { Read } from '@/features/dashboard/readout';
import { matchPre, parsePre, PRE_FILTERS } from './knowledgeModel';
import type { KBCandidate, PreFilter } from './knowledgeModel';
import { CandidateDetail, CandidateRow, ReasonLine, SourceLines } from './CandidateRow';

const KnowledgeGraph = lazy(() => import('./KnowledgeGraph'));

const why = (e: any) => (isDenied(e) ? '当前账号没有审核权限(403)' : isRateLimited(e) ? '请求太频繁,服务器限制了频率(429),稍后再试' : e?.message || '请求失败');

export const ReviewTab: React.FC<{ read: Read<KBCandidate[]> }> = ({ read }) => {
  const cands = read.value;
  const pending = useMemo(() => (cands || []).filter((c) => c.status === 'pending'), [cands]);
  const decided = useMemo(() => (cands || []).filter((c) => c.status !== 'pending').sort((a, b) => (b.decided_at || 0) - (a.decided_at || 0)), [cands]);
  const [filter, setFilter] = useState<PreFilter>('all');
  const shown = useMemo(() => pending.filter((c) => matchPre(c, filter)), [pending, filter]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [preBusy, setPreBusy] = useState(false);
  const [preMsg, setPreMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [rejectFor, setRejectFor] = useState<KBCandidate | null>(null);
  const [bulkAsk, setBulkAsk] = useState<'approve' | 'reject' | null>(null);
  const [inspect, setInspect] = useState<KBCandidate | null>(null);
  const [showDecided, setShowDecided] = useState(false);
  const slow = useSlow(read.state === 'loading');

  const decide = async (c: KBCandidate, action: 'approve' | 'reject') => {
    setBusyId(c.id); setResult(null);
    try {
      const d = await api<any>('/api/kb/candidates', { method: 'POST', body: JSON.stringify({ id: c.id, action }) });
      const text = action === 'approve' ? `候选 #${c.id} 已通过:${d?.note || '写入正式知识库'}` : `候选 #${c.id} 已拒绝,记录保留,可在“已决定”里查到。`;
      setResult({ ok: true, text }); toast.ok(text);
      read.reload();
    } catch (e: any) { const text = `候选 #${c.id} 没有决定成功:${why(e)}。候选保持待审。`; setResult({ ok: false, text }); toast.err(text); }
    setBusyId(null);
  };
  const runBulk = async (action: 'approve' | 'reject') => {
    const ids = Array.from(sel);
    setBulkBusy(true); setResult(null);
    try {
      const d = await api<any>('/api/kb/candidates/decide-batch', { method: 'POST', body: JSON.stringify({ ids, action }) });
      const n = (d?.decided || []).length;
      const text = `${action === 'approve' ? '批量通过' : '批量拒绝'}:已决定 ${n} / ${ids.length} 条${action === 'reject' ? ',记录保留' : ',已写入知识库'}。`;
      setResult({ ok: true, text }); toast.ok(text);
      setSel(new Set());
    } catch (e: any) { const text = `${action === 'approve' ? '批量通过' : '批量拒绝'}没有成功:${why(e)}。所选候选保持待审。`; setResult({ ok: false, text }); toast.err(text); }
    read.reload();
    setBulkBusy(false);
  };
  const prereview = async () => {
    setPreBusy(true); setPreMsg(null);
    try {
      const d = await api<any>('/api/kb/candidates/pre-review', { method: 'POST', body: JSON.stringify({ limit: 20 }) });
      setPreMsg({ ok: true, text: `预审完成 ${d?.reviewed ?? 0} 条:建议通过 ${d?.adopt ?? 0},建议拒绝 ${d?.reject ?? 0}。决定仍由管理员做。` });
      read.reload();
    } catch (e: any) {
      setPreMsg({ ok: false, text: isRateLimited(e) ? '预审请求太频繁:模型服务限制了调用频率(429)。候选和已有建议都没有改变,稍后再预审。'
        : isDenied(e) ? '当前账号不能触发预审(403)。候选和已有建议都没有改变。'
          : `预审没有完成(模型未配置或网络不可用):${e?.message || ''}。候选和已有建议都没有改变。` });
    }
    setPreBusy(false);
  };

  if (read.state === 'loading') return (
    <div data-state="loading" data-kb-candidates-loading>
      <SkeletonLoader variant="table" rows={4} />
      {slow && <p role="status" className="pt-2 text-label text-jz-muted" data-slow>仍在读取候选,接口响应较慢。</p>}
    </div>
  );
  if (read.state === 'permission') return <div data-kb-candidates-error><PermissionState title="无权限" message="当前账号不能读取知识候选(接口返回 403)。候选审核只对管理员开放。" /></div>;
  if (read.state === 'unread') return <div data-kb-candidates-error><ErrorState title="候选未读取" message={`${(read.error as any)?.message || '接口没有返回候选列表'}。候选数量未知,不按 0 计。`} onRetry={read.reload} /></div>;

  const preCount = pending.filter((c) => parsePre(c.note).verdict).length;
  return (
    <div className="space-y-4" data-knowledge-review>
      {read.state === 'stale' && <StaleNotice reason={`${STALE_WORD},下面是上次读到的候选。`} onRefresh={read.reload} />}
      <Panel title="待审核候选" data-kb-candidates-group
        description="任务复盘时产出的候选,不会自动入库。每行的理由和来源都来自候选本身;通过后写入知识库,拒绝的保留记录。"
        actions={<>
          <span className="font-mono text-meta tnum text-jz-muted" data-kb-pre-count>已预审 {preCount} / {pending.length}</span>
          <Button size="sm" variant="secondary" onClick={prereview} loading={preBusy} disabled={preBusy || pending.length === 0} data-kb-prereview-btn
            title="用模型批量预审待审候选(最多 20 条);只写建议,决定仍由管理员做">{preBusy ? '预审中…' : '预审'}</Button>
        </>}>
        <div className="space-y-3">
          {preMsg && <p role="status" className={preMsg.ok ? 'text-label text-jz-ink-2' : 'text-label text-jz-amber'} data-kb-pre-msg={preMsg.ok ? 'ok' : 'fail'}>{preMsg.text}</p>}
          {result && <p role="status" className={result.ok ? 'text-label text-jz-ink-2' : 'text-label text-jz-red'} data-kb-result={result.ok ? 'ok' : 'fail'}>{result.text}</p>}
          {pending.length > 0 && (
            <div className="max-w-full overflow-x-auto" data-kb-pre-filter>
              <SegmentedControl<PreFilter> label="按预审建议筛选" value={filter} onChange={setFilter}
                items={PRE_FILTERS.map(([k, label]) => ({ key: k, label, count: pending.filter((c) => matchPre(c, k)).length, dataAttrs: { 'data-kb-pre-filter-btn': k } }))} />
            </div>
          )}
          {sel.size > 0 && (
            <div role="region" aria-label="批量审核" className="flex flex-wrap items-center gap-2 rounded-control border border-jz-border bg-jz-brand-soft px-3 py-2 text-label" data-kb-bulk-bar>
              <span className="text-jz-ink">已选 <span className="font-semibold tnum">{sel.size}</span> 条</span>
              <Button size="sm" variant="secondary" onClick={() => setBulkAsk('approve')} disabled={bulkBusy} data-kb-bulk-approve>批量通过</Button>
              <Button size="sm" variant="secondary" className="text-jz-red" onClick={() => setBulkAsk('reject')} disabled={bulkBusy} data-kb-bulk-reject>批量拒绝</Button>
              <Button size="sm" variant="ghost" onClick={() => setSel(new Set())} data-kb-bulk-clear>取消选择</Button>
            </div>
          )}
          {pending.length === 0 ? (
            <div data-kb-candidates-empty>
              <EmptyState compact icon={GraduationCap} title="没有待审核的候选" cause="评估会话完成复盘后,产出的候选会出现在这里等待审核。"
                action={decided.length > 0 ? <Button size="sm" variant="secondary" onClick={() => setShowDecided(true)} data-kb-show-decided-empty>查看已决定的 {decided.length} 条</Button> : undefined} />
            </div>
          ) : shown.length === 0 ? (
            <div data-kb-pre-filter-empty>
              <EmptyState compact title="这个筛选下没有候选" cause={`切回“全部”可查看 ${pending.length} 条待审候选。`}
                action={<Button size="sm" variant="secondary" onClick={() => setFilter('all')}>查看全部</Button>} />
            </div>
          ) : (
            <ul className="-mx-4 border-t border-jz-border" data-kb-cand-grid aria-label="待审核候选">
              {shown.map((c) => (
                <CandidateRow key={c.id} c={c} checked={sel.has(c.id)} busy={busyId === c.id || bulkBusy}
                  onCheck={(id, on) => { const s = new Set(sel); if (on) s.add(id); else s.delete(id); setSel(s); }}
                  onDecide={(x, action) => (action === 'reject' ? setRejectFor(x) : decide(x, action))}
                  onInspect={setInspect} />
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <Panel title="已决定" description="通过和拒绝的候选都保留在这里,带理由、来源和决定时间。" data-kb-decided-group
        actions={<Button size="sm" variant="ghost" aria-expanded={showDecided} onClick={() => setShowDecided((v) => !v)} data-kb-decided-toggle>
          {showDecided ? '收起' : `展开 ${decided.length} 条`}</Button>}>
        {showDecided && (decided.length === 0
          ? <p className="text-label text-jz-muted" data-kb-decided-empty>还没有已决定的候选。</p>
          : <ul className="-mx-4 border-t border-jz-border" data-kb-decided-list>{decided.map((c) => <CandidateRow key={c.id} c={c} onInspect={setInspect} />)}</ul>)}
      </Panel>

      <details className="rounded-card border border-jz-border bg-jz-surface" data-kb-graph-disclosure>
        <summary className="cursor-pointer select-none px-4 py-3 text-label font-semibold text-jz-ink">知识关联查询</summary>
        <div className="border-t border-jz-border px-4 py-3">
          <p className="mb-2 text-label text-jz-muted">按关键词查询加固方案、发现类型和来源之间的关联。图形组件只在查询时加载。</p>
          <Suspense fallback={<div data-state="loading"><SkeletonLoader variant="chart" /></div>}><KnowledgeGraph /></Suspense>
        </div>
      </details>

      <Drawer open={!!inspect} width={640} title={inspect ? `候选 #${inspect.id}` : ''} onClose={() => setInspect(null)}>
        {inspect && <CandidateDetail c={inspect} />}
      </Drawer>
      <ConfirmDialog open={!!rejectFor} busy={busyId === rejectFor?.id} confirmLabel="拒绝"
        title={rejectFor ? `拒绝候选 #${rejectFor.id}?` : ''}
        outcome="这条候选不会写入知识库。拒绝会留档,可在“已决定”里查到;审核结果不能撤回。"
        onCancel={() => setRejectFor(null)}
        onConfirm={async () => { const c = rejectFor; setRejectFor(null); if (c) await decide(c, 'reject'); }}>
        {rejectFor && <div className="space-y-1.5" data-kb-reject-context><ReasonLine c={rejectFor} /><SourceLines c={rejectFor} /></div>}
      </ConfirmDialog>
      <ConfirmDialog open={!!bulkAsk} destructive={bulkAsk === 'reject'} busy={bulkBusy}
        confirmLabel={bulkAsk === 'approve' ? '批量通过' : '批量拒绝'}
        title={bulkAsk === 'approve' ? `通过 ${sel.size} 条候选?` : `拒绝 ${sel.size} 条候选?`}
        outcome={bulkAsk === 'approve' ? '这些候选会写入正式知识库,之后可以被检索。审核结果不能撤回。' : '这些候选不会写入知识库。拒绝会留档,可在“已决定”里查到;审核结果不能撤回。'}
        onCancel={() => setBulkAsk(null)}
        onConfirm={async () => { const a = bulkAsk; setBulkAsk(null); if (a) await runBulk(a); }}>
        {bulkAsk && (
          <ul className="max-h-48 space-y-1 overflow-auto text-label" data-kb-bulk-context>
            {pending.filter((c) => sel.has(c.id)).map((c) => {
              const v = parsePre(c.note);
              return <li key={c.id} className="text-jz-ink-2"><span className="font-mono text-jz-muted">#{c.id}</span> {v.verdict ? `预审${v.verdict === 'adopt' ? '建议通过' : v.verdict === 'reject' ? '建议拒绝' : '待补信息'}` : '未预审'} · {c.source || '未提供来源'}</li>;
            })}
          </ul>
        )}
      </ConfirmDialog>
    </div>
  );
};
