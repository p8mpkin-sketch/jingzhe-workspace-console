import React, { useMemo, useState } from 'react';
import { pressable } from '@/components/ui';
import { ChevronDown, ChevronRight, Pin, Search } from 'lucide-react';
import { Button } from '@/components/ui';

/** P2-②(修正版): 会话列工作台——在 C-UI 会话列(自动标题/时间分组/置顶/重命名/删除)之上增强:
 *  关键词搜索(title/last_msg/包名模糊,前端 useMemo 真值过滤)+ 任务树可折叠 + 批量管理模式
 *  (勾选→批量删除,复用既有单会话 DELETE 端点并发提交,后端零改动)。
 *  零消息会话隐藏口径沿用(空会话自动清理语义)。 */

export interface ChatSession { id: string; title: string; task_id?: number; kind?: string; pinned?: number; updated_at?: number; last_msg?: string; }

const fmtTime = (ts?: number) => {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d.getTime() >= today.getTime()
    ? d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
};

export const SessionSidebar: React.FC<{
  sessions: ChatSession[];
  current: string;
  taskMap: Record<number, { name: string; pkg: string }>;
  grp: 'time' | 'task';
  setGrp: (g: 'time' | 'task') => void;
  searchRef?: React.RefObject<HTMLInputElement>;
  onSelect: (id: string) => void;
  onNew: () => void;
  onTogglePin: (s: ChatSession) => void;
  onRename: (s: ChatSession) => void;
  onDelete: (s: ChatSession) => void;
  onBatchDelete: (ids: string[]) => void;
}> = ({ sessions, current, taskMap, grp, setGrp, searchRef, onSelect, onNew, onTogglePin, onRename, onDelete, onBatchDelete }) => {
  const [q, setQ] = useState('');
  const [batch, setBatch] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const vis = useMemo(() => sessions.filter((s) => s.last_msg || s.id === current), [sessions, current]);
  const matches = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return null;
    return vis.filter((s) => {
      const t = s.task_id ? taskMap[s.task_id] : undefined;
      return [s.title, s.last_msg, t?.name, t?.pkg, String(s.task_id ?? '')]
        .some((v) => String(v || '').toLowerCase().includes(kw));
    });
  }, [vis, q, taskMap]);

  const { pinned, timeGroups, taskGroups } = useMemo(() => {
    const base = matches ?? vis;
    const pin = base.filter((s) => s.pinned);
    const rest = base.filter((s) => !s.pinned);
    const day0 = new Date(); day0.setHours(0, 0, 0, 0);
    const day1 = day0.getTime() / 1000 - 86400;
    const tg: Record<string, ChatSession[]> = { 今天: [], 昨天: [], 更早: [] };
    for (const s of rest) {
      const ts = s.updated_at || 0;
      if (ts >= day0.getTime() / 1000) tg.今天.push(s);
      else if (ts >= day1) tg.昨天.push(s);
      else tg.更早.push(s);
    }
    const kmap = new Map<string, ChatSession[]>();
    for (const s of rest) {
      const label = s.task_id ? `#${s.task_id} ${(taskMap[s.task_id] || {}).name || ''}`.trim() : '自由对话';
      if (!kmap.has(label)) kmap.set(label, []);
      kmap.get(label)!.push(s);
    }
    const kg = [...kmap.entries()].map(([key, items]) => ({ key, items }));
    return { pinned: pin, timeGroups: tg, taskGroups: kg };
  }, [vis, matches, taskMap]);

  const toggleCollapse = (key: string) => setCollapsed((prev) => {
    const n = new Set(prev);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });
  const togglePick = (id: string) => setPicked((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const renderItem = (s: ChatSession) => (
    <div key={s.id} className={`group flex items-center gap-1 px-2.5 py-2 mb-1.5 rounded-card bg-jz-surface shadow-card cursor-pointer transition-all
      ${current === s.id ? 'ring-1 ring-jz-brand/60' : 'hover:ring-1 hover:ring-jz-border'}`}
      onClick={() => { if (!batch) onSelect(s.id); }} {...pressable(!batch)} aria-current={current === s.id ? 'true' : undefined} data-chat-item={s.title}>
      {batch && (
        <input type="checkbox" checked={picked.has(s.id)} onChange={() => togglePick(s.id)}
          onClick={(e) => e.stopPropagation()} data-batch-check={s.id} className="flex-none accent-jz-brand" />
      )}
      <div className="flex-1 min-w-0">
        <div className={`text-meta font-semibold truncate ${current === s.id ? 'text-jz-brand' : 'text-jz-ink'}`}>
          {s.title?.trim() || '(未命名)'}
        </div>
        <div className="text-meta font-mono text-jz-muted truncate tabular-nums">{fmtTime(s.updated_at)} · {(s.last_msg || '').slice(0, 16)}</div>
      </div>
      {s.pinned ? <Pin size={10} className="flex-none text-jz-brand fill-current group-hover:hidden" /> : null}
      {!batch && (
        <span className="hidden group-hover:flex group-focus-within:flex gap-0.5 flex-none" data-chat-actions>
          <button onClick={(e) => { e.stopPropagation(); onTogglePin(s); }} data-pin-btn
            className={`px-0.5 ${s.pinned ? 'text-jz-brand' : 'text-jz-muted hover:text-jz-brand'}`}
            title={s.pinned ? '取消置顶' : '置顶'} aria-label={s.pinned ? '取消置顶' : '置顶'}>
            <Pin size={11} className={s.pinned ? 'fill-current' : ''} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onRename(s); }} className="text-meta text-jz-muted hover:text-jz-brand px-0.5" title="重命名" aria-label="重命名">✎</button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(s); }} className="text-meta text-jz-muted hover:text-jz-sev-critical px-0.5" title="删除" aria-label="删除会话">✕</button>
        </span>
      )}
    </div>
  );

  const grpHeader = (label: string, key?: string, count?: number) => {
    const isCollapsed = key ? collapsed.has(key) : false;
    return (
      <div className={`text-meta text-jz-muted px-1.5 mb-1 ${key ? 'cursor-pointer flex items-center gap-0.5 select-none hover:text-jz-ink-2' : ''}`}
        onClick={key ? () => toggleCollapse(key) : undefined} {...pressable(!!key)} aria-expanded={key ? !isCollapsed : undefined}
        data-grp-head={key}>
        {key && (isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />)}
        <span className="truncate" title={label}>{label}{count != null ? `(${count})` : ''}</span>
      </div>
    );
  };

  return (
    <div className="w-60 flex-none bg-jz-surface-2 p-2 overflow-auto flex flex-col" data-chat-list>
      <Button variant="primary" className="w-full justify-center mb-2" onClick={onNew}>＋ 新建对话</Button>
      {/* P2-②: 会话/包名关键词搜索(前端真值过滤) */}
      <div className="relative mb-2" data-session-search>
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-jz-muted" />
        <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="搜索会话 / 包名…(⌘K)"
          data-session-search-input
          className="w-full pl-7 pr-2 py-1.5 rounded-control bg-jz-surface/70 text-meta text-jz-ink placeholder:text-jz-muted outline-none focus:ring-1 focus:ring-jz-brand/50" />
      </div>
      {matches ? (
        <div className="mb-2" data-grp-search>
          {grpHeader(`搜索结果(${matches.length})`)}
          {matches.map(renderItem)}
          {matches.length === 0 && <div className="text-meta text-jz-muted px-1.5 py-2">无匹配会话</div>}
        </div>
      ) : (
        <>
          <div className="flex gap-1 mb-2" data-grp-toggle>
            {(['time', 'task'] as const).map((k) => (
              <button key={k} data-grp={k} onClick={() => setGrp(k)}
                className={`flex-1 rounded-pill px-1 py-0.5 text-meta transition-colors ${grp === k ? 'bg-jz-brand/10 text-jz-brand font-semibold' : 'text-jz-muted hover:bg-jz-surface-2/60'}`}>
                {k === 'time' ? '按时间' : '按任务'}
              </button>
            ))}
          </div>
          {pinned.length > 0 && (
            <div className="mb-2" data-grp-pinned>
              {grpHeader('置顶')}
              {pinned.map(renderItem)}
            </div>
          )}
          {grp === 'time'
            ? (['今天', '昨天', '更早'] as const).map((g) => timeGroups[g].length > 0 && (
                <div key={g} className="mb-2" data-grp-time={g}>
                  {grpHeader(g)}
                  {timeGroups[g].map(renderItem)}
                </div>
              ))
            : taskGroups.map((g) => (
                <div key={g.key} className="mb-2" data-grp-task={g.key}>
                  {grpHeader(g.key, g.key, g.items.length)}
                  {!collapsed.has(g.key) && g.items.map(renderItem)}
                </div>
              ))}
        </>
      )}
      <div className="flex-1" />
      {/* P2-②: 批量管理(勾选→并发调既有单删端点;确认聚合一次) */}
      <div className="pt-1 border-t border-jz-border/60 flex items-center gap-2" data-batch-bar>
        <button onClick={() => { setBatch((v) => !v); setPicked(new Set()); }}
          data-batch-toggle
          className={`text-meta px-1.5 py-1 rounded-control transition-colors ${batch ? 'bg-jz-brand/10 text-jz-brand' : 'text-jz-muted hover:text-jz-ink-2'}`}>
          {batch ? '退出批量' : '批量管理'}
        </button>
        {batch && (
          <>
            <span className="text-meta text-jz-muted tabular-nums">已选 {picked.size}</span>
            <span className="flex-1" />
            <button disabled={picked.size === 0}
              onClick={() => { onBatchDelete([...picked]); setPicked(new Set()); }}
              data-batch-delete
              className="text-meta px-1.5 py-1 rounded-control text-jz-sev-critical hover:bg-jz-sev-critical/10 disabled:opacity-40">
              删除所选
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default SessionSidebar;
