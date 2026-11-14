// SkillCard.tsx: one entry in the knowledge library grid.
// Name, source tags, short description, outcome bar, shortened registration path (full path in title, click to copy),
// and footer actions (mount / source / promote / disable / enable / delete). Delete confirmation lives in the page.
import React, { useState } from 'react';
import { Check, Code2, FlaskConical, Plug, Trash2, Unplug } from 'lucide-react';
import { Button, IconButton, StatusBadge, Tag } from '@/components/ui';
import { fmtTime, formatSkillPath, iconOf, kindOf } from './skillsShared';
import type { SkillRow } from './skillsShared';

/** Registration-path pill: shortened label, full path in the title, click to copy. */
const PathPill: React.FC<{ rawPath: string }> = ({ rawPath }) => {
  const fp = formatSkillPath(rawPath);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(rawPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard unavailable: full path still in title */ }
  };
  return (
    <button onClick={copy} data-skill-path-pill type="button"
      title={`完整注册路径(点击复制):\n${rawPath}`}
      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-control bg-jz-surface-2 px-2 py-0.5 font-mono text-meta text-jz-muted transition-colors hover:text-jz-ink">
      <span className="min-w-0 truncate">{fp.label}</span>
      {copied && <Check size={12} className="flex-none text-jz-teal" aria-hidden />}
    </button>
  );
};

export const SkillCard: React.FC<{
  s: SkillRow;
  isLocal: boolean;
  isMounted: boolean;
  mountTid: number | null;
  isAdmin: boolean;
  onMount: (s: SkillRow) => void;
  onUnmount: (s: SkillRow) => void;
  onSource: (s: SkillRow) => void;
  onStatus: (s: SkillRow, status: 'active' | 'disabled') => void;
  onDelete: (s: SkillRow) => void;
}> = ({ s, isLocal, isMounted, mountTid, isAdmin, onMount, onUnmount, onSource, onStatus, onDelete }) => {
  const kind = kindOf(s);
  const Icon = iconOf(s);
  const isDraft = s.status === 'draft';
  const isDisabled = s.status === 'disabled';
  const active = !isDraft && !isDisabled;
  const uses = s.uses || 0;
  const wins = s.wins || 0;
  const pct = uses > 0 ? Math.round((wins / uses) * 100) : null;

  return (
    <div data-skill-card={s.name}
      className={`flex min-w-0 flex-col gap-2.5 rounded-card border bg-jz-surface p-4 ${active ? 'border-jz-border' : 'border-jz-border bg-jz-surface-2'}`}>
      {/* Header: icon + name + source/verify tags; status or outcome badge on the right. */}
      <div className="flex items-start gap-2.5">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-control bg-jz-surface-2 text-jz-ink-2" title={kind.tab}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-section font-semibold text-jz-ink" title={s.name}>{s.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Tag title={`来源按 source_path 和 status 推断:${s.source_path}`}>{kind.label}</Tag>
            <span className="text-meta text-jz-muted">{kind.tab}</span>
            {isLocal && <StatusBadge tone="neutral" title="本地层技能(localStorage);后端没有自建技能接口,这里显式标注。">本地</StatusBadge>}
            <span className="font-mono text-meta text-jz-muted"
              title="last_verified_at 是收编或导入时的文件修改时间,仅作参考,不是运行验证时间。">验证 {fmtTime(s.last_verified_at)}</span>
          </div>
        </div>
        <div className="flex-none">
          {isDraft ? (
            <StatusBadge tone="attention" title="蒸馏草案,复核后可转正">待转正</StatusBadge>
          ) : isDisabled ? (
            <StatusBadge tone="neutral">已停用</StatusBadge>
          ) : uses > 0 ? (
            <StatusBadge tone="brand" title={`实战回流真值:${wins}/${uses} 个任务脱出成功,来自 skill_outcomes 表。`}>
              实战 {uses} · 胜 {wins}
            </StatusBadge>
          ) : s.success_rate != null ? (
            <StatusBadge tone="brand" title="success_rate 为后端口径真值">成功率 {Math.round(s.success_rate * 100)}%</StatusBadge>
          ) : (
            <StatusBadge tone="success" title="在册且启用,参与 AI 自动选技">已启用</StatusBadge>
          )}
        </div>
      </div>

      {/* Description: two-line clamp with a reserved height so the grid stays even. */}
      <p className="line-clamp-2 min-h-[40px] text-label leading-relaxed text-jz-ink-2" title={s.description || undefined}>
        {s.description || '—'}
      </p>

      {/* Outcome bar: wins/uses ratio, only drawn when there is real battle data. */}
      {pct != null && (
        <div className="flex items-center gap-2" data-skill-winbar={s.name} title={`实战胜率真值:${wins}/${uses} = ${pct}%(skill_outcomes 回流)`}>
          <span className="h-1.5 w-20 flex-none overflow-hidden rounded-pill bg-jz-surface-2">
            <span className={`block h-full ${pct >= 80 ? 'bg-jz-teal' : pct >= 50 ? 'bg-jz-amber' : 'bg-jz-red'}`} style={{ width: `${pct}%` }} />
          </span>
          <span className="font-mono text-meta tnum text-jz-muted">{pct}%</span>
        </div>
      )}

      {/* Registration path (no bare absolute paths; full path in title, click to copy). */}
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="flex-none text-meta text-jz-muted">来源</span>
        <PathPill rawPath={s.source_path} />
      </div>

      {/* Footer actions: mount on the left; source / promote / disable / enable / delete on the right. */}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-jz-border pt-2.5">
        {isLocal ? (
          <span className="inline-flex items-center gap-1 text-meta text-jz-muted"
            title="本地层技能不参与挂载;挂载链路属于后端 /api/tasks/{tid}/skills 接口。">
            <Plug size={13} aria-hidden />本地 · 不参与挂载
          </span>
        ) : isMounted ? (
          <Button size="sm" variant="secondary" icon={<Unplug size={14} aria-hidden />} onClick={() => onUnmount(s)} data-unmount-btn={s.name}>卸载</Button>
        ) : (
          <Button size="sm" variant="secondary" icon={<Plug size={14} aria-hidden />} onClick={() => onMount(s)} data-mount-btn={s.name}>挂载</Button>
        )}
        {isMounted && <span className="font-mono text-meta text-jz-teal">{`已挂 #${mountTid}`}</span>}
        <span className="flex-1" />
        {isAdmin && isDraft && (
          <Button size="sm" variant="subtle" icon={<FlaskConical size={14} aria-hidden />} onClick={() => onStatus(s, 'active')} data-skill-promote={s.name}
            title="草案转正,参与 AI 自动选技">转正</Button>
        )}
        <Button size="sm" variant="subtle" icon={<Code2 size={14} aria-hidden />} onClick={() => onSource(s)} data-source-btn={s.name}
          title="只读源码预览(GET /api/skills/{id}/source)">源码</Button>
        {isAdmin && active && (
          <Button size="sm" variant="ghost" onClick={() => onStatus(s, 'disabled')} data-skill-disable={s.name}
            title="停用,保留在册与实战统计,AI 不再自动选它">停用</Button>
        )}
        {isAdmin && isDisabled && (
          <Button size="sm" variant="subtle" onClick={() => onStatus(s, 'active')} data-skill-enable={s.name}
            title="启用,恢复参与 AI 自动选技">启用</Button>
        )}
        {isAdmin && (
          <IconButton label={`删除 ${s.name}`} size="sm" className="text-jz-muted hover:text-jz-red" onClick={() => onDelete(s)} data-skill-delete={s.name}>
            <Trash2 size={14} aria-hidden />
          </IconButton>
        )}
      </div>
    </div>
  );
};
