// Cells of a task row: identity, status, second line (failure reason, live progress, partial-completion reason),
// duration, finding counts and the row actions. The table and the card list of TaskTable both compose these, so a
// task reads the same at every width.
import React, { useState } from 'react';
import { Check, Copy, ExternalLink, FileText, FolderOpen, Info, MessageSquare, RefreshCw, Trash2 } from 'lucide-react';
import { Button, RowActions, StatusText, cx } from '@/components/ui';
import type { MenuAction } from '@/components/ui';
import { PACKER_NAMES, SLOW_S, TaskLiveProgress, fmtDur, fmtTime, honestDone, outcomeProbe, whenFull } from './taskParts';
import { NO_REASON, artifactsReady, durOf, failureReason, hasReport, kindOf, kindWord, statusView, type SessionMap, type TaskItem } from './taskModel';
import type { CountsState } from './useTasks';

/** Copies text and says so for two seconds. The text is the caller's full string, never what is visible. */
export const CopyText: React.FC<{ text: string; label: string; className?: string } & Record<`data-${string}`, string | number | undefined>> = ({ text, label, className, ...rest }) => {
  const [done, setDone] = useState<'' | 'ok' | 'no'>('');
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(text); setDone('ok'); } catch { setDone('no'); }
    window.setTimeout(() => setDone(''), 2000);
  };
  return (
    <button type="button" onClick={copy} aria-label={label} title={label} data-copied={done || undefined} {...rest}
      className={cx('inline-flex h-7 flex-none items-center gap-1 rounded-control px-1.5 text-meta text-jz-ink-2 hover:bg-jz-surface-2 hover:text-jz-ink max-[760px]:h-jz-touch max-[760px]:px-2.5', className)}>
      {done === 'ok' ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      <span aria-live="polite">{done === 'ok' ? '已复制' : done === 'no' ? '复制失败' : '复制'}</span>
    </button>
  );
};

const packerWord = (p?: string | null) => (!p ? '' : p === 'none' ? '无加固' : PACKER_NAMES[p] || p);

/** First line: the application; second line: id, type, package and packer as plain text. */
export const TaskIdentity: React.FC<{ t: TaskItem }> = ({ t }) => (
  <span className="flex min-w-0 flex-col">
    <span className="truncate text-label font-semibold text-jz-ink" title={t.app_name || t.package || ''}>{t.app_name || t.package || '—'}</span>
    <span className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 text-meta text-jz-muted">
      <span className="flex-none font-mono tnum text-jz-ink-2" data-task-id>#{t.id}</span>
      <span className="flex-none" data-task-kind={kindOf(t)}>{kindWord(t)}</span>
      <span className="min-w-0 truncate font-mono" title={t.package || '服务端没有返回包名'}>{t.package || '没有包名'}</span>
      {t.packer ? <span className="flex-none" data-task-packer={t.packer} title={t.packer === 'none' ? '没有检测到加固' : `加固类型:${t.packer}`}>{packerWord(t.packer)}</span>
        : t.status === 'running' ? <span className="flex-none" title="正在识别加固类型">加固识别中</span> : null}
    </span>
  </span>
);

/** Status: a glyph and a word, then what the result says about the business code. Never colour alone. */
export const TaskStatus: React.FC<{ t: TaskItem }> = ({ t }) => {
  const v = statusView(t);
  const h = honestDone(t);
  const probe = outcomeProbe(t.unpack_outcome) || undefined;
  const hook = v.key === 'failed' ? 'failed' : v.key === 'partial' ? 'degraded' : v.key === 'done' ? 'complete' : undefined;
  return (
    <span className="flex flex-col items-start gap-0.5" data-honest-status={hook} data-task-status={t.status} data-unpack-outcome={v.key === 'done' ? probe : undefined}>
      <StatusText kind={v.glyph} strong title={v.key === 'partial' ? '流程已跑完,但有加固且业务代码没有脱出。结论只覆盖部分代码。' : undefined}>{v.word}</StatusText>
      {v.key === 'partial' && <span className="break-all text-meta text-jz-ink-2" data-unpack-outcome={probe}>{h.label}</span>}
      {v.key === 'done' && (
        <span className="text-meta text-jz-muted">
          {h.biz != null ? <>业务代码 <span className="font-mono tnum text-jz-ink-2">{h.biz}</span> 类</>
            : h.shell ? (h.positive ? '没有上报业务代码类数' : '没有脱壳结果数据') : '无加固,不需要脱壳'}
        </span>
      )}
    </span>
  );
};

/**
 * The second line of a row, across the remaining columns. A failed task shows the whole failure reason as text
 * that can be selected and copied; it is not shortened and not kept in a tooltip. A running task shows its live
 * progress; a partly finished one shows why the business code did not come out.
 */
export const TaskSubline: React.FC<{ t: TaskItem }> = ({ t }) => {
  if (t.status === 'failed') {
    const reason = failureReason(t);
    return (
      <div className="flex min-w-0 items-start gap-2" data-task-reason={t.id} data-has-reason={reason ? '1' : '0'}>
        <span className="mt-0.5 flex-none text-meta font-medium text-jz-ink-2">失败原因</span>
        <p className="min-w-0 flex-1 cursor-text select-text whitespace-pre-wrap break-words font-mono text-meta text-jz-ink [overflow-wrap:anywhere]" data-task-reason-text>{reason || NO_REASON}</p>
        {reason && <CopyText text={reason} label={`复制任务 #${t.id} 的失败原因`} data-task-reason-copy={t.id} />}
      </div>
    );
  }
  if (t.status === 'running' && t.progress) return <TaskLiveProgress progress={t.progress} />;
  if (statusView(t).key === 'partial') {
    const d = t.unpack_outcome?.diagnosis || {};
    const labelMap: Record<string, string> = { zygisk_off: 'Zygisk 关闭', debuggable: 'debuggable', permissive: 'SELinux', libzzp: 'libzzp' };
    const unmet = Object.entries(d.checks || {}).filter(([, v]) => !v).map(([k]) => labelMap[k] || k);
    const reason = d.reason || t.progress || '';
    const channel = t.unpack_outcome?.unpack_method || '';
    const engine = t.unpack_outcome?.engine_commit || '';
    return (
      <p data-unpack-reason className="min-w-0 select-text break-words text-meta text-jz-ink-2 [overflow-wrap:anywhere]">
        {[channel && `通道 ${channel}`, unmet.length ? `未满足:${unmet.join('、')}` : '', reason || '没有返回具体原因', engine && `engine ${engine}`].filter(Boolean).join(' · ')}
      </p>
    );
  }
  return null;
};
export const hasSubline = (t: TaskItem) => t.status === 'failed' || (t.status === 'running' && !!t.progress) || statusView(t).key === 'partial';

export const TaskDuration: React.FC<{ t: TaskItem; now: number }> = ({ t, now }) => {
  const dur = durOf(t, now);
  return (
    <span className="flex flex-col whitespace-nowrap" data-dur title={`${Math.round(dur)} 秒(${t.status === 'running' || t.status === 'queued' ? '从创建到现在' : '从创建到最后更新'})`}>
      <span className="font-mono tnum text-jz-ink">
        {fmtDur(dur)}
        {dur > SLOW_S && <span className="ml-1.5 font-sans text-meta text-jz-ink-2" title="已超过 15 分钟" data-task-slow>慢</span>}
      </span>
      <span className="font-mono text-meta text-jz-muted" title={`创建 ${whenFull(t.created_at)} · 更新 ${whenFull(t.updated_at)}`}>{fmtTime(t.created_at)}</span>
    </span>
  );
};

const SEV: Array<[string, string, string]> = [['critical', 'C', '严重'], ['high', 'H', '高'], ['medium', 'M', '中'], ['low', 'L', '低']];

/**
 * Finding counts of a task: four fixed mono cells. A count is a statement about data that was read, so a request
 * that was refused or failed shows “未读取”, and one still in flight shows nothing but a mark; neither shows 0.
 */
export const TaskCounts: React.FC<{ t: TaskItem; counts: CountsState }> = ({ t, counts }) => {
  const c = counts.items[String(t.id)];
  if (!c) {
    const denied = counts.refused.has(t.id), failed = counts.failedIds.has(t.id);
    if (denied || failed) {
      return <span data-vuln-counts data-counts-state={denied ? 'forbidden' : 'failed'} className="text-meta text-jz-ink-2"
        title={denied ? '当前账号没有权限读取发现计数' : '发现计数没有读到'}>未读取</span>;
    }
    return <span data-vuln-counts data-counts-state="loading" className="text-jz-muted" aria-label="正在读取发现计数">…</span>;
  }
  if (!(c.total > 0)) return <span data-vuln-counts data-counts-state="ok" className="text-meta text-jz-muted" title="评估和渗透两边都没有发现记录">没有发现</span>;
  return (
    <span data-vuln-counts data-counts-state="ok" className="inline-grid grid-cols-4 gap-x-1 font-mono text-meta tnum"
      title={`来源:${(c.sources || []).join(' + ') || '无'}。渗透部分只计待确认和已确认。`
        + (c.contract ? `\n原始命中 ${c.contract.raw ?? '—'},去重后 ${c.contract.kept ?? '—'},已确认 ${c.contract.confirmed ?? '—'},候选 ${c.contract.candidate ?? '—'},已排除 ${c.contract.suppressed ?? '—'},写入报告 ${c.contract.report_total ?? '—'}(模型复核 ${c.contract.reviewed ?? '—'})` : '')}>
      {SEV.map(([k, short, name]) => (
        <span key={k} title={name} className={cx('min-w-7 whitespace-nowrap', c[k] > 0 ? 'font-semibold text-jz-ink' : 'text-jz-muted')}>{short}{c[k] ?? 0}</span>
      ))}
    </span>
  );
};

export interface RowHandlers {
  openSession: (hit: { pid: number; sid: number }) => void;
  openArtifacts: (t: TaskItem) => void;
  openReport: (t: TaskItem) => void;
  openDetail: (t: TaskItem) => void;
  rerun: (t: TaskItem) => void;
  ask: (t: TaskItem) => void;
  remove: (t: TaskItem) => void;
}

/**
 * Row actions. Session and artifacts are buttons in the row itself whenever the task has them (the artifacts entry
 * never waits for the artifacts endpoint); a failed task also shows 重新运行. The menu holds the rest.
 */
/** `dense`: in the table between 1024 and 1279 px the inline buttons show their icon only; the word stays as the accessible name and the tooltip. */
export const TaskActions: React.FC<{ t: TaskItem; sess: SessionMap; wide: boolean; dense?: boolean; on: RowHandlers }> = ({ t, sess, wide, dense, on }) => {
  const word = (w: string) => <span className={dense ? 'max-xl:sr-only' : undefined}>{w}</span>;
  const hit = sess[t.id];
  const report = hasReport(t);
  const arts = artifactsReady(t, sess);
  const failed = t.status === 'failed';
  const reportInline = report && wide;
  const more: MenuAction[] = [
    { key: 'detail', label: '详情', icon: <Info size={14} aria-hidden />, onSelect: () => on.openDetail(t), attrs: { 'data-act-detail': '' } },
    ...(report && !reportInline ? [{ key: 'report', label: '打开报告', icon: <FileText size={14} aria-hidden />, onSelect: () => on.openReport(t), attrs: { 'data-act-report': '' } }] : []),
    ...(!failed ? [{ key: 'rerun', label: '重新运行', icon: <RefreshCw size={14} aria-hidden />, onSelect: () => on.rerun(t), attrs: { 'data-act-rerun': '' } }] : []),
    ...(report ? [{ key: 'ask', label: '向智能体提问', icon: <MessageSquare size={14} aria-hidden />, onSelect: () => on.ask(t), attrs: { 'data-ask-btn': '' } }] : []),
    { key: 'del', label: '删除', danger: true, icon: <Trash2 size={14} aria-hidden />, onSelect: () => on.remove(t), attrs: { 'data-act-del': '' } },
  ];
  return (
    <RowActions label={`任务 #${t.id} 的更多操作`} more={more} triggerAttrs={{ 'data-more-btn': '' }} menuAttrs={{ 'data-more-menu': '' }} className="flex-wrap"
      primary={<>
        {hit && <Button size="sm" variant="secondary" icon={<ExternalLink size={14} aria-hidden />} onClick={() => on.openSession(hit)} data-goto-session title={`打开渗透会话 #${hit.sid}`}>{word('会话')}</Button>}
        {failed && <Button size="sm" variant="secondary" icon={<RefreshCw size={14} aria-hidden />} onClick={() => on.rerun(t)} data-act-retry title="重新运行,可以重选设备、模式和深度">{word('重新运行')}</Button>}
        {reportInline && <Button size="sm" variant="ghost" icon={<FileText size={14} aria-hidden />} onClick={() => on.openReport(t)} data-act-report title="打开这个任务的报告">{word('报告')}</Button>}
        {arts && <Button size="sm" variant="ghost" icon={<FolderOpen size={14} aria-hidden />} onClick={() => on.openArtifacts(t)} data-artifacts-btn={t.id} title={`浏览任务 #${t.id} 的产物`}>{word('产物')}</Button>}
      </>} />
  );
};
