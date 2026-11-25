// Output of a task, grouped by stage. There is no task log endpoint: the output is the task's progress text, plus
// a log file when the task's artifact list has one (read through the existing artifact endpoint) and the unpack
// result the task row carries. The bar above the list says where each part comes from.
// The list is the workbench's StageStack with its two slots (row and stage summary); following is the same hook.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Copy, Download, Pin, PinOff, WrapText } from 'lucide-react';
import { api, getToken } from '@/services/api';
import { Button, Checkbox, IconButton, SearchField, cx } from '@/components/ui';
import { StageStack, type StageStackHandle } from '@/features/pentest/workbench/surfaces/runtime/StageStack';
import { useFollow } from '@/features/pentest/workbench/surfaces/runtime/useFollow';
import type { StageTraceVM, TraceRowVM } from '@/features/pentest/workbench/surfaces/runtime/trace';
import { buildTaskTrace, runStatusOf, type OutputGroup, type ParsedProgress, type TaskItem } from './taskModel';
import { errStatus } from './useTasks';

const LOG_MAX = 512 * 1024;
type LogState = { state: 'off' } | { state: 'loading' } | { state: 'none' } | { state: 'forbidden' | 'error' } | { state: 'too-large'; name: string; size: number } | { state: 'ok'; name: string; text: string };

/** Looks for a log file at the top of the task's artifact list and reads it. Only for tasks that have artifacts. */
function useTaskLog(taskId: number, enabled: boolean): LogState {
  const [st, setSt] = useState<LogState>({ state: enabled ? 'loading' : 'off' });
  useEffect(() => {
    if (!enabled) { setSt({ state: 'off' }); return; }
    let alive = true;
    setSt({ state: 'loading' });
    (async () => {
      try {
        const head = await api<any>(`/api/tasks/${taskId}/artifacts?prefix=`);
        const f = (head?.entries || []).find((e: any) => e?.type === 'file' && /\.log$/i.test(String(e.name || '')));
        if (!alive) return;
        if (!f) { setSt({ state: 'none' }); return; }
        const bytes = typeof f.size_kb === 'number' ? f.size_kb * 1024 : typeof f.size === 'number' ? f.size : 0;
        if (bytes > LOG_MAX) { setSt({ state: 'too-large', name: f.name, size: bytes }); return; }
        // The file is text, not JSON: read it the way the artifact preview does.
        const r = await fetch(`/api/tasks/${taskId}/artifact?path=${encodeURIComponent(f.rel || f.name)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
        if (!alive) return;
        if (r.status === 401 || r.status === 403) { setSt({ state: 'forbidden' }); return; }
        if (!r.ok) { setSt({ state: 'error' }); return; }
        const body = await r.text();
        if (alive) setSt({ state: 'ok', name: f.name, text: body });
      } catch (e) {
        const s = errStatus(e);
        if (alive) setSt({ state: s === 401 || s === 403 ? 'forbidden' : 'error' });
      }
    })();
    return () => { alive = false; };
  }, [taskId, enabled]);
  return st;
}

const Marked: React.FC<{ text: string; q: string }> = ({ text, q }) => {
  if (!q) return <>{text}</>;
  const out: React.ReactNode[] = [];
  const low = text.toLowerCase();
  let i = 0, n = 0;
  for (;;) {
    const j = low.indexOf(q, i);
    if (j < 0) break;
    if (j > i) out.push(text.slice(i, j));
    out.push(<mark key={n++} className="rounded-tag bg-jz-amber/30 text-jz-ink" data-output-hit>{text.slice(j, j + q.length)}</mark>);
    i = j + q.length;
  }
  out.push(text.slice(i));
  return <>{out}</>;
};
const hitsIn = (text: string, q: string) => { if (!q) return 0; let n = 0, i = 0; const low = text.toLowerCase(); for (;;) { const j = low.indexOf(q, i); if (j < 0) return n; n++; i = j + q.length; } };

export const TaskOutput: React.FC<{ task: TaskItem; parsed: ParsedProgress; hasArtifacts: boolean; className?: string }> = ({ task, parsed, hasArtifacts, className }) => {
  const log = useTaskLog(task.id, hasArtifacts);
  const extra = useMemo<OutputGroup[]>(() => {
    const g: OutputGroup[] = [];
    if (log.state === 'ok') g.push({ id: '日志', name: `日志文件 ${log.name}`, lines: log.text.split(/\r?\n/).filter((l) => l.trim() !== '') });
    if (task.unpack_outcome) g.push({ id: '结果', name: '脱壳结果', lines: JSON.stringify(task.unpack_outcome, null, 2).split('\n') });
    return g;
  }, [log, task.unpack_outcome]);
  const full = useMemo(() => buildTaskTrace(task, parsed, extra), [task, parsed, extra]);
  const status = runStatusOf(task);

  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const [wrap, setWrap] = useState(true);
  const [userOpen, setUserOpen] = useState<Record<string, boolean>>({});
  const [pinned, setPinned] = useState<string | null>(null);
  const [viewStage, setViewStage] = useState<string | null>(null);
  const [copied, setCopied] = useState<'' | 'ok' | 'no'>('');
  const stack = useRef<StageStackHandle>(null);
  const box = useRef<HTMLDivElement>(null);

  // Searching keeps only the lines that contain the text; the count is of occurrences, across every group.
  const trace = useMemo<StageTraceVM[]>(() => (needle ? full.map((t) => ({ ...t, rows: t.rows.filter((r) => r.title.toLowerCase().includes(needle)) })) : full), [full, needle]);
  const lineTotal = full.reduce((n, t) => n + t.rows.length, 0);
  const lineShown = trace.reduce((n, t) => n + t.rows.length, 0);
  const hits = useMemo(() => (needle ? full.reduce((n, t) => n + t.rows.reduce((m, r) => m + hitsIn(r.title, needle), 0), 0) : 0), [full, needle]);
  const follow = useFollow(lineTotal, !!pinned);
  const live = task.status === 'running';

  const activeId = full.find((t) => t.mode === 'active')?.stage.id ?? null;
  const isOpen = useCallback((id: string) => userOpen[id] ?? true, [userOpen]);
  const pause = follow.pause;
  const toggleStage = useCallback((id: string) => { setUserOpen((u) => ({ ...u, [id]: !(u[id] ?? true) })); if (id !== activeId) pause(); }, [activeId, pause]);
  const togglePin = () => {
    if (pinned) { setPinned(null); return; }
    const id = viewStage ?? activeId ?? full[full.length - 1]?.stage.id;
    if (id) setPinned(id);
  };
  const resume = () => { follow.resume(); stack.current?.scrollToEnd(); };
  // An upward wheel or key pauses following before the list scrolls. The list re-pins itself to the end whenever its
  // content is re-measured while it follows, so a jump of a page at once would otherwise be undone before the
  // scroll is noticed.
  const pauseForUp = () => {
    const el = box.current?.querySelector<HTMLElement>('[data-trace-scroller]');
    if (el && follow.following && el.scrollHeight > el.clientHeight + 1) flushSync(() => follow.pause());
  };

  // The list's own label says "Agent 轨迹" (it is the workbench's list); here it is the task output.
  useEffect(() => { box.current?.querySelector('[data-trace-scroller]')?.setAttribute('aria-label', '任务输出'); });

  const plain = useMemo(() => trace.filter((t) => t.rows.length).map((t) => `## ${t.stage.id} ${t.stage.name}\n${t.rows.map((r) => r.title).join('\n')}`).join('\n\n'), [trace]);
  const copy = async () => { try { await navigator.clipboard.writeText(plain); setCopied('ok'); } catch { setCopied('no'); } window.setTimeout(() => setCopied(''), 2000); };
  const download = () => {
    const url = URL.createObjectURL(new Blob([plain + '\n'], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `task-${task.id}-output.txt`; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const lineNo = useMemo(() => { const m = new Map<string, number>(); for (const t of full) t.rows.forEach((r, i) => m.set(r.id, i + 1)); return m; }, [full]);
  const renderRow = useCallback((r: TraceRowVM) => {
    const err = r.variant === 'error';
    return (
      <div role="listitem" data-output-line={r.id} data-output-error={err ? '1' : undefined}
        className={cx('flex min-w-0 items-baseline gap-3 border-b border-jz-border px-3 py-1 font-mono text-mono', err ? 'border-l-line-strong border-l-jz-red bg-jz-red/10' : '')}>
        <span className="w-8 flex-none select-none text-right tnum text-jz-trace-time" aria-hidden>{lineNo.get(r.id)}</span>
        {err && <span className="flex-none font-sans text-meta font-medium text-jz-red" data-output-error-label>错误</span>}
        <span className={cx('min-w-0 flex-1 select-text text-jz-trace-body', wrap ? 'whitespace-pre-wrap break-words [overflow-wrap:anywhere]' : 'overflow-x-auto whitespace-pre')} data-output-text>
          <Marked text={r.title} q={needle} />
        </span>
      </div>
    );
  }, [lineNo, wrap, needle]);
  const stageSummary = useCallback((t: StageTraceVM) => {
    const total = full.find((x) => x.stage.id === t.stage.id)?.rows.length ?? t.rows.length;
    const src = t.stage.id === '日志' ? '来自产物里的日志文件' : t.stage.id === '结果' ? '来自任务行的脱壳结果' : parsed.parsed ? '来自进度文本' : '进度文本里没有阶段信息';
    return <span data-output-summary><span className="font-mono tnum">{needle ? `${t.rows.length} / ${total}` : total}</span> 行 · {src}{t.counts.errors > 0 && <> · <span className="font-mono tnum">{t.counts.errors}</span> 行错误</>}</span>;
  }, [full, needle, parsed.parsed]);
  const noop = useMemo(() => ({ busy: false, onSelect: () => {}, onOpenFinding: () => {}, onReview: () => {}, onDecide: async () => {}, onExpand: () => {} }), []);
  const none = useMemo(() => new Set<string>(), []);

  const source = (() => {
    const parts = [parsed.stages.length ? (parsed.parsed ? '输出来自任务的进度文本，按文本里出现的阶段分组。' : '输出来自任务的进度文本。文本里没有阶段信息，所以只有“输出”一个阶段。') : ''];
    if (log.state === 'ok') parts.push(`另有产物里的日志文件 ${log.name}。`);
    else if (log.state === 'none') parts.push('产物列表里没有日志文件。');
    else if (log.state === 'forbidden') parts.push('产物列表没有权限读取，无法判断有没有日志文件。');
    else if (log.state === 'error') parts.push('产物列表没有读到，无法判断有没有日志文件。');
    else if (log.state === 'too-large') parts.push(`日志文件 ${log.name} 超过 512 kB，没有在这里读取，可以在“产物”里下载。`);
    else if (log.state === 'loading') parts.push('正在查看产物里有没有日志文件。');
    return parts.filter(Boolean).join('');
  })();

  // The pane is as tall as its content needs, up to 60% of the viewport: a short output leaves no empty box under it.
  const paneRem = Math.max(18, 9 + full.length * 2.75 + lineTotal * 2);

  if (lineTotal === 0) {
    return (
      <div className={cx('border border-jz-border bg-jz-surface px-4 py-8', className)} data-task-output data-output-state="empty" data-state="empty" data-log-state={log.state}>
        <h3 className="text-body font-semibold text-jz-ink">还没有输出</h3>
        <p className="mt-1 max-w-jz-prose text-label text-jz-ink-2">
          {task.status === 'queued' ? '任务还在排队，没有开始运行，所以没有进度文本。开始之后这里会出现它上报的内容。'
            : task.status === 'running' ? '任务在运行，但还没有上报进度文本。上报之后这里会自动出现，不需要刷新。'
            : '这个任务没有留下进度文本。如果它有产物，可以在“产物”里查看落盘的文件。'}
        </p>
        {source && <p className="mt-2 text-meta text-jz-ink-2" data-output-source>{source}</p>}
      </div>
    );
  }

  return (
    <div ref={box} className={cx('flex min-h-0 flex-col border border-jz-border bg-jz-surface', className)} style={{ height: `min(60vh, ${paneRem}rem)` }} data-task-output data-output-state="ok" data-output-follow={follow.active && live ? 'on' : 'off'}
      data-output-pinned={pinned || undefined} data-output-parsed={parsed.parsed ? '1' : '0'} data-output-lines={lineTotal} data-log-state={log.state}>
      <div className="flex min-w-0 flex-none flex-wrap items-center gap-2 border-b border-jz-border px-3 py-2" data-output-bar>
        <SearchField className="min-w-40 flex-1 basis-48" value={q} onValueChange={setQ} label="在输出里搜索" placeholder="在输出里搜索" data-output-search="" />
        <span className="w-36 flex-none text-meta text-jz-ink-2" data-output-count data-hits={hits} role="status">
          {needle ? <>命中 <span className="font-mono tnum text-jz-ink">{hits}</span> 处，<span className="font-mono tnum text-jz-ink">{lineShown}</span> 行</> : <>共 <span className="font-mono tnum text-jz-ink">{lineTotal}</span> 行</>}
        </span>
        <label className="inline-flex flex-none cursor-pointer items-center whitespace-nowrap" data-output-follow-toggle={!live ? 'idle' : follow.following ? 'on' : 'off'}
          title={pinned ? '已固定阶段：取消固定后才会跟随' : live ? '有新输出时保持在末尾' : '任务没有在运行，不会有新输出'}>
          <Checkbox checked={live && follow.following} disabled={!live} onChange={() => (follow.following ? follow.pause() : resume())} label="跟随" />
        </label>
        <IconButton label={pinned ? `取消固定（${pinned}）` : '固定当前阶段：有新输出时不改变滚动位置'} variant={pinned ? 'secondary' : 'ghost'} aria-pressed={!!pinned} onClick={togglePin} data-output-pin>
          {pinned ? <PinOff size={16} aria-hidden /> : <Pin size={16} aria-hidden />}
        </IconButton>
        <IconButton label={wrap ? '关闭自动换行' : '打开自动换行'} variant={wrap ? 'secondary' : 'ghost'} aria-pressed={wrap} onClick={() => setWrap((v) => !v)} data-output-wrap><WrapText size={16} aria-hidden /></IconButton>
        <Button size="sm" variant="secondary" icon={<Copy size={14} aria-hidden />} onClick={copy} data-output-copy data-copied={copied || undefined}>{copied === 'ok' ? '已复制' : copied === 'no' ? '复制失败' : '复制'}</Button>
        <Button size="sm" variant="secondary" icon={<Download size={14} aria-hidden />} onClick={download} data-output-download>下载</Button>
      </div>
      <p className="flex-none border-b border-jz-border bg-jz-inset px-3 py-1.5 text-meta text-jz-ink-2" data-output-source>{source}</p>
      <div className="relative flex min-h-0 flex-1 flex-col" onWheelCapture={(e) => { if (e.deltaY < 0) pauseForUp(); }}
        onKeyDownCapture={(e) => { if ((e.key === 'PageUp' || e.key === 'Home' || e.key === 'ArrowUp') && (e.target as HTMLElement).hasAttribute?.('data-trace-scroller')) pauseForUp(); }}>
        {needle && lineShown === 0 ? (
          <div className="px-4 py-6" data-output-state="no-match" data-state="empty">
            <h3 className="text-body font-semibold text-jz-ink">没有匹配的行</h3>
            <p className="mt-1 text-label text-jz-ink-2">输出有 <span className="font-mono tnum">{lineTotal}</span> 行，没有一行包含“{q.trim()}”。</p>
            <Button variant="secondary" className="mt-3" onClick={() => setQ('')} data-output-clear>清除搜索</Button>
          </div>
        ) : (
          <StageStack ref={stack} trace={trace} status={status} now={0} filter="all" only={null} isOpen={isOpen} onToggleStage={toggleStage} leaving={null}
            futureOpen={false} onToggleFuture={() => {}} follow={follow.active && live} onScrolled={follow.onScrolled} onViewStage={setViewStage}
            expanded={none} currentRow={null} row={noop} renderRow={renderRow} stageSummary={stageSummary} />
        )}
        {follow.fresh > 0 && (
          <button type="button" onClick={resume} data-output-new
            className="absolute bottom-3 right-6 z-10 inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-control border border-jz-border-strong bg-jz-raised px-3 text-label font-medium text-jz-ink shadow-card hover:bg-jz-hover">
            <span className="font-mono tnum">{follow.fresh}</span> 行新输出 ↓
          </button>
        )}
      </div>
    </div>
  );
};
