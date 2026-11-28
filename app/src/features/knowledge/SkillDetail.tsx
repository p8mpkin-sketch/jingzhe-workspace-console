// SkillDetail.tsx — the right-hand detail of one knowledge entry: facts, actions (enable / disable / promote /
// delete), mounting to a task, and the source text. Requests are the ones the old skill card and drawer sent:
// GET /api/skills/{id}/source, PATCH /api/skills/{id}/status, DELETE /api/skills/{id} (through the page's confirm),
// GET /api/tasks/{tid}/skills, POST | DELETE /api/tasks/{tid}/skills/{sid}/mount.
import React, { useEffect, useState } from 'react';
import { Check, Copy, FlaskConical, Plug, Trash2, Unplug } from 'lucide-react';
import { api } from '@/services/api';
import { Button, EmptyState, ErrorState, PermissionState, Select, Skeleton, StatusBadge, toast } from '@/components/ui';
import { isDenied } from '@/features/dashboard/readout';
import { fmtTime, formatSkillPath, isLocal, kindOf, STATUS_LABEL } from './knowledgeModel';
import type { SkillRow } from './knowledgeModel';
import type { TaskOption } from './useKnowledgeReads';

export const SRC_RENDER_MAX_LINES = 400;
/** Source text with right-aligned line numbers; `#` comment lines muted. Long files show the first 400 lines. */
export const renderSourceCode = (code: string): React.ReactNode => {
  const lines = code.split('\n');
  return (
    <>
      {lines.slice(0, SRC_RENDER_MAX_LINES).map((ln, i) => (
        <div key={i} className="flex">
          <span className="w-9 shrink-0 select-none pr-2 text-right text-jz-muted tnum">{i + 1}</span>
          <span className={`flex-1 whitespace-pre ${/^\s*#/.test(ln) ? 'italic text-jz-muted' : ''}`}>{ln || ' '}</span>
        </div>
      ))}
      {lines.length > SRC_RENDER_MAX_LINES && (
        <div className="pl-11 text-jz-muted">…(共 {lines.length} 行,这里只显示前 {SRC_RENDER_MAX_LINES} 行;复制按钮会复制全文)</div>
      )}
    </>
  );
};

const Fact: React.FC<{ label: string; children: React.ReactNode; mono?: boolean }> = ({ label, children, mono }) => (
  <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 border-b border-jz-border py-1.5 text-label last:border-b-0">
    <dt className="text-jz-muted">{label}</dt>
    <dd className={`min-w-0 break-words text-jz-ink-2 ${mono ? 'font-mono text-mono' : ''}`}>{children}</dd>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode; attrs?: Record<string, string> }> = ({ title, children, attrs }) => (
  <section className="border-t border-jz-border pt-3" {...attrs}>
    <h3 className="mb-2 text-label font-semibold text-jz-ink">{title}</h3>
    {children}
  </section>
);

export const SkillDetail: React.FC<{
  s: SkillRow; isAdmin: boolean; tasks: TaskOption[] | null;
  mountTid: number | null; onMountTid: (tid: number | null) => void;
  onStatus: (s: SkillRow, status: 'active' | 'disabled') => Promise<void>;
  onDelete: (s: SkillRow) => void;
}> = ({ s, isAdmin, tasks, mountTid, onMountTid, onStatus, onDelete }) => {
  const local = isLocal(s);
  const kind = kindOf(s);
  const path = formatSkillPath(s.source_path);
  const uses = s.uses || 0, wins = s.wins || 0;
  const pct = uses > 0 ? Math.round((wins / uses) * 100) : null;

  // Source text, read when the detail opens (as the old drawer did).
  const [src, setSrc] = useState<any>(null);
  const [srcErr, setSrcErr] = useState<unknown>(null);
  const [copied, setCopied] = useState<'' | 'src' | 'path'>('');
  useEffect(() => {
    setSrc(null); setSrcErr(null);
    if (local) return;
    let live = true;
    api<any>(`/api/skills/${s.id}/source`).then((d) => { if (live) setSrc(d); }).catch((e) => { if (live) setSrcErr(e ?? new Error('读取失败')); });
    return () => { live = false; };
  }, [s.id, local]);
  const copy = async (what: 'src' | 'path', value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(what); setTimeout(() => setCopied(''), 1400); } catch { /* clipboard unavailable: the text stays on screen */ }
  };

  // Mounting: the mounted list of the chosen task.
  const [mounted, setMounted] = useState<any[] | null>(null);
  const [mountErr, setMountErr] = useState('');
  const [mountBusy, setMountBusy] = useState(false);
  const loadMounted = (tid: number) => api<any[]>(`/api/tasks/${tid}/skills`).then((d) => { setMounted(Array.isArray(d) ? d : []); setMountErr(''); })
    .catch((e) => { setMounted(null); setMountErr(e?.message || '读取失败'); });
  useEffect(() => { setMounted(null); setMountErr(''); if (mountTid) loadMounted(mountTid); }, [mountTid]);
  const isMounted = !!mounted?.some((m) => m.skill_id === s.id);
  const mount = async (on: boolean) => {
    if (!mountTid) return;
    setMountBusy(true);
    try {
      const d = await api<any>(`/api/tasks/${mountTid}/skills/${s.id}/mount`, { method: on ? 'POST' : 'DELETE' });
      toast.ok(on ? (d?.newly === false ? `「${s.name}」已挂载(重复操作,结果不变)` : `已挂载「${s.name}」到任务 #${mountTid}`) : `已卸载「${s.name}」`);
      await loadMounted(mountTid);
    } catch (e: any) { toast.err((on ? '挂载失败: ' : '卸载失败: ') + e.message); }
    setMountBusy(false);
  };

  const [statusBusy, setStatusBusy] = useState(false);
  const status = async (to: 'active' | 'disabled') => { setStatusBusy(true); try { await onStatus(s, to); } finally { setStatusBusy(false); } };

  return (
    <div className="space-y-4" data-skill-detail={s.name}>
      <dl>
        <Fact label="来源分类">{kind.tab}{local && ' · 本地条目'}</Fact>
        <Fact label="状态">
          <StatusBadge tone={s.status === 'disabled' ? 'neutral' : s.status === 'draft' ? 'attention' : 'success'}>{STATUS_LABEL[s.status || 'active'] || s.status}</StatusBadge>
          <span className="ml-2 text-jz-muted">{s.status === 'draft' ? '蒸馏草案,复核后可转正' : s.status === 'disabled' ? '保留在册,AI 不再选用' : '在册,AI 可以自动选用'}</span>
        </Fact>
        <Fact label="实战">{uses > 0 ? <span className="font-mono tnum" data-skill-winbar={s.name}>{uses} 次 · 成功 {wins} · {pct}%</span> : <span className="text-jz-muted">还没有任务结果记录</span>}</Fact>
        <Fact label="最近验证" mono>{fmtTime(s.last_verified_at)}</Fact>
        <Fact label="场景" mono>{s.scene || '—'}</Fact>
        <Fact label="说明">{s.description || '—'}</Fact>
        <Fact label="注册路径" mono>
          <span title={s.source_path}>{path.label}</span>
          {s.source_path && !local && (
            <button type="button" onClick={() => copy('path', s.source_path)} data-skill-path-pill
              className="ml-2 inline-flex items-center gap-1 rounded-control px-1 text-meta text-jz-ink-2 hover:text-jz-ink" aria-label="复制完整注册路径">
              {copied === 'path' ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}{copied === 'path' ? '已复制' : '复制'}
            </button>
          )}
        </Fact>
      </dl>

      <Section title="操作" attrs={{ 'data-skill-actions': s.name }}>
        <div className="flex flex-wrap gap-2">
          {isAdmin && !local && s.status === 'draft' && (
            <Button size="sm" variant="secondary" icon={<FlaskConical size={14} aria-hidden />} loading={statusBusy} onClick={() => status('active')} data-skill-promote={s.name}>草案转正</Button>
          )}
          {isAdmin && !local && s.status !== 'draft' && s.status !== 'disabled' && (
            <Button size="sm" variant="secondary" loading={statusBusy} onClick={() => status('disabled')} data-skill-disable={s.name}>停用</Button>
          )}
          {isAdmin && !local && s.status === 'disabled' && (
            <Button size="sm" variant="secondary" loading={statusBusy} onClick={() => status('active')} data-skill-enable={s.name}>启用</Button>
          )}
          {isAdmin && (
            <Button size="sm" variant="ghost" className="text-jz-red" icon={<Trash2 size={14} aria-hidden />} onClick={() => onDelete(s)} data-skill-delete={s.name}>删除</Button>
          )}
          {!isAdmin && <p className="text-label text-jz-muted">启用、停用、转正和删除需要管理员账号。</p>}
        </div>
      </Section>

      {!local && (
        <Section title="挂载到任务" attrs={{ 'data-skill-mount': s.name }}>
          <p className="mb-2 text-label text-jz-muted">新任务由 AI 自动挂载;这里只用于给历史任务补挂,或覆盖 AI 的选择。</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full max-w-xs">
              <Select aria-label="目标任务" value={mountTid ?? ''} onChange={(e) => onMountTid(Number(e.target.value) || null)} data-mount-task-select>
                <option value="">{tasks == null ? '任务列表未读取' : tasks.length ? '选择目标任务…' : '没有已完成的评估任务'}</option>
                {(tasks || []).map((t) => <option key={t.id} value={t.id}>#{t.id} {t.app_name || t.package || '评估'}</option>)}
              </Select>
            </div>
            {mountTid && mounted && (isMounted
              ? <Button size="sm" variant="secondary" icon={<Unplug size={14} aria-hidden />} loading={mountBusy} onClick={() => mount(false)} data-unmount-btn={s.name}>卸载</Button>
              : <Button size="sm" variant="secondary" icon={<Plug size={14} aria-hidden />} loading={mountBusy} onClick={() => mount(true)} data-mount-btn={s.name}>挂载</Button>)}
          </div>
          {mountTid && mountErr && <p className="mt-2 text-label text-jz-red" data-mounted-error>任务 #{mountTid} 的挂载列表未读取:{mountErr}</p>}
          {mountTid && mounted && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-label" data-mounted-panel>
              <span className="text-jz-muted">任务 #{mountTid} 已挂载 {mounted.length} 条{mounted.length ? ':' : ''}</span>
              {mounted.map((m) => <span key={m.skill_id} className="rounded-control border border-jz-border px-1.5 py-0.5 text-meta text-jz-ink-2" data-mounted-chip={m.name}>{m.name}</span>)}
            </div>
          )}
        </Section>
      )}

      <Section title="来源原文" attrs={{ 'data-skill-source': s.name }}>
        {local && <p className="text-label text-jz-muted">本地条目只保存在这个浏览器里,没有来源文件。</p>}
        {!local && !src && !srcErr && <Skeleton className="h-40" />}
        {!local && srcErr != null && (isDenied(srcErr)
          ? <PermissionState compact title="无权限读取来源" message="当前账号不能查看这条的来源文件。" />
          : <div data-source-error><ErrorState compact title="来源原文未读取" message={(srcErr as any)?.message} /></div>)}
        {src && typeof src.content !== 'string' && <EmptyState compact title="没有可显示的源码" cause="接口没有返回文件内容。注册路径和说明见上方。" />}
        {src && typeof src.content === 'string' && (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-meta text-jz-muted">
              <span className="min-w-0 break-all font-mono">{src.file}</span>
              <span className="tnum">{src.bytes} 字节</span>
              {src.truncated && <span className="text-jz-amber">超过 256KB,已截断</span>}
              <span className="flex-1" />
              <Button size="sm" variant="ghost" icon={copied === 'src' ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} onClick={() => copy('src', src.content)} data-source-copy>
                {copied === 'src' ? '已复制' : '复制'}
              </Button>
            </div>
            <pre data-source-pre className="max-h-[calc(100vh-320px)] overflow-auto whitespace-pre rounded-control bg-jz-surface-2 p-2 font-mono text-meta leading-4 text-jz-ink-2">
              <code>{renderSourceCode(src.content)}</code>
            </pre>
          </div>
        )}
      </Section>
    </div>
  );
};
