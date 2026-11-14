import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckCircle2, XCircle, ShieldAlert, AlertTriangle, Bot, Info,
  CheckCheck, Trash2, Wifi, WifiOff,
} from 'lucide-react';
import { useNotifications, NotifItem } from '@/stores/notifications';
import { cx, EmptyState } from '@/components/ui';

/** R121: 顶栏通知铃铛——下拉通知面板 + 新到通知浮卡(toast)。
 *  数据源=stores/notifications(SSE 实时流 + REST 兜底);点击通知=置已读+深链跳转
 *  (任务→/tasks?focus=N 复用 R94-1 高亮定位,AI 会话→工作台路由)。 */

const KIND_ICON: Record<string, { I: React.ComponentType<any>; cls: string }> = {
  task:     { I: CheckCircle2,  cls: 'text-jz-teal' },
  security: { I: ShieldAlert,   cls: 'text-jz-amber' },
  danger:   { I: AlertTriangle, cls: 'text-jz-amber' },
  ai:       { I: Bot,           cls: 'text-jz-brand' },
  system:   { I: Info,          cls: 'text-jz-ink-2' },
};

function itemVisual(n: NotifItem): { I: React.ComponentType<any>; cls: string } {
  const base = KIND_ICON[n.kind] || KIND_ICON.system;
  if (n.level === 'danger') return { I: XCircle, cls: 'text-jz-red' };
  if (n.kind === 'task' && n.level === 'success') return base;
  return base;
}

/** Level reads from the icon and its color; rows stay on the surface so the list is quiet. */
const LEVEL_LABEL: Record<string, string> = { success: '成功', warning: '需关注', danger: '失败', info: '信息' };

function fmtRel(ts: number): string {
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
 return new Date(ts * 1000).toLocaleDateString();
}

export const NotificationBell: React.FC = () => {
  const { items, unread, live, toasts, markRead, markAllRead, dismissToast } = useNotifications();
  const [open, setOpen] = React.useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  // Filter by kind and "clear" are view-only: the API has list / read / stream and no delete, so clearing
  // marks everything read and hides the current list locally; a reload shows the server's list again.
  const [kindF, setKindF] = useState('');
  const [clearedIds, setClearedIds] = useState<Set<number>>(new Set());

 // 点击面板外关闭 + Escape 关闭
 useEffect(() => {
 const onDown = (e: MouseEvent) => { if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
 const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
 document.addEventListener('mousedown', onDown);
 document.addEventListener('keydown', onKey);
 return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
 }, [open]);

 const go = (n: NotifItem) => {
    if (!n.read_at) markRead(n.id);
    setOpen(false);
    dismissToast(n.id);
    if (n.link) navigate(n.link);
  };

  // 面板视图列表: kind 过滤 + 本地清空隐藏(真值=store items,本地仅视图裁剪)
  const KIND_TABS: Array<[string, string]> = [['', '全部'], ['task', '任务'], ['security', '安全'], ['danger', '危险'], ['ai', 'AI'], ['system', '系统']];
 const shown = items
 .filter((n) => !clearedIds.has(n.id))
 .filter((n) => !kindF || n.kind === kindF);
 const clearLocal = () => {
 // 本地清空: 当前列表全部标记已读(既有 /api/notifications/read 端点)+ 本地视图隐藏
 markAllRead();
 setClearedIds(new Set(items.map((n) => n.id)));
  };

  return (
    <>
      <div className="relative inline-flex" ref={ref} data-notif-bell>
        <button type="button" onClick={() => setOpen(!open)} data-notif-toggle
          aria-haspopup="dialog" aria-expanded={open}
          aria-label={`通知${unread > 0 ? `，${unread} 条未读` : ''}${live ? '' : '，实时推送未连接'}`}
          title={live ? '通知' : '通知（实时推送未连接，正在重连）'}
          className={cx('relative grid h-jz-control w-jz-control place-items-center rounded-control transition-colors duration-hover hover:bg-jz-surface-2 hover:text-jz-ink max-[760px]:min-h-jz-touch max-[760px]:min-w-jz-touch',
            open ? 'bg-jz-surface-2 text-jz-ink' : 'text-jz-ink-2')}>
          <Bell size={16} aria-hidden />
          {unread > 0 && (
            <span data-notif-unread aria-hidden
              className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-pill bg-jz-brand px-1 font-mono text-meta font-semibold leading-none text-jz-on-brand">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>

        {open && (
          <div data-notif-panel role="dialog" aria-label="通知"
            className="absolute right-0 top-full z-50 mt-2 flex max-h-[min(560px,calc(100vh-72px))] w-[380px] flex-col overflow-hidden rounded-card border border-jz-border bg-jz-surface shadow-dialog max-[760px]:fixed max-[760px]:inset-x-2 max-[760px]:top-[60px] max-[760px]:mt-0 max-[760px]:w-auto">
            <div className="flex flex-none items-center gap-2 border-b border-jz-border px-3 py-2.5">
              <span className="text-label font-semibold text-jz-ink">通知</span>
              <span className={cx('inline-flex items-center gap-1 text-meta', live ? 'text-jz-teal' : 'text-jz-muted')}>
                {live ? <Wifi size={12} aria-hidden /> : <WifiOff size={12} aria-hidden />}{live ? '实时' : '未连接，正在重连'}
              </span>
              <span className="flex-1" />
              <button type="button" onClick={() => markAllRead()} data-notif-readall disabled={unread === 0}
                className="inline-flex h-7 items-center gap-1 rounded-control px-1.5 text-meta text-jz-ink-2 hover:bg-jz-surface-2 hover:text-jz-ink disabled:pointer-events-none disabled:opacity-45">
                <CheckCheck size={14} aria-hidden /> 全部已读
              </button>
              <button type="button" onClick={clearLocal} data-notif-clear-local disabled={items.length === 0}
                title="把当前列表全部标为已读并从此视图隐藏。服务器上的通知不会删除，刷新页面后仍可看到。"
                className="inline-flex h-7 items-center gap-1 rounded-control px-1.5 text-meta text-jz-ink-2 hover:bg-jz-surface-2 hover:text-jz-ink disabled:pointer-events-none disabled:opacity-45">
                <Trash2 size={14} aria-hidden /> 清空视图
              </button>
            </div>
            <div className="flex flex-none flex-wrap items-center gap-1 border-b border-jz-border px-3 py-2" data-notif-filter>
              {KIND_TABS.map(([k, label]) => {
                const n = k ? items.filter((x) => x.kind === k).length : items.length;
                if (k && n === 0) return null;
                return (
                  <button type="button" key={k || 'all'} onClick={() => setKindF(k)} data-notif-filter-tab={k || 'all'} aria-pressed={kindF === k}
                    className={cx('inline-flex h-6 items-center gap-1 rounded-pill px-2 text-meta transition-colors duration-hover',
                      kindF === k ? 'bg-jz-brand-soft font-semibold text-jz-brand' : 'text-jz-ink-2 hover:bg-jz-surface-2 hover:text-jz-ink')}>
                    {label} <span className="tnum font-mono">{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="min-h-0 flex-1 divide-y divide-jz-border overflow-y-auto">
              {shown.length === 0 && (
                <div data-notif-empty>
                  {items.length > 0 && clearedIds.size > 0
                    ? <EmptyState compact icon={CheckCheck} title="视图已清空" cause="新通知到达后会出现在这里。服务器上的通知没有删除，刷新页面后仍可看到。" />
                    : <EmptyState compact icon={Bell} title="暂无通知" cause="任务完成、安全事件和 Agent 进展会实时出现在这里。" />}
                </div>
              )}
              {shown.map((n) => {
                const { I, cls } = itemVisual(n);
                return (
                  <button type="button" key={n.id} onClick={() => go(n)} data-notif-item data-notif-level={n.level}
                    className="flex w-full gap-2.5 px-3 py-2.5 text-left transition-colors duration-hover hover:bg-jz-surface-2">
                    <I size={16} className={cx('mt-0.5 flex-none', cls)} aria-label={LEVEL_LABEL[n.level] || undefined} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={cx('truncate text-label', n.read_at ? 'text-jz-ink-2' : 'font-semibold text-jz-ink')}>{n.title}</span>
                        {!n.read_at && <span className="h-1.5 w-1.5 flex-none rounded-pill bg-jz-brand" aria-label="未读" />}
                      </div>
                      {n.body && <div className="mt-0.5 line-clamp-2 text-meta text-jz-ink-2">{n.body}</div>}
                      <div className="mt-1 font-mono text-meta text-jz-muted">{fmtRel(n.created_at)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex-none border-t border-jz-border px-3 py-2 text-meta text-jz-muted">
              显示最近 50 条。点击通知打开对应页面。
            </div>
          </div>
        )}
      </div>

      {/* New-arrival cards: stacked under the top bar, dismissed after 6 s, click opens the target. */}
      <div className="fixed right-4 top-[60px] z-[60] flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2" data-notif-toasts aria-live="polite">
        {toasts.map((n) => <NotifToast key={n.id} n={n} onGo={go} onDismiss={dismissToast} />)}
      </div>
    </>
  );
};

const NotifToast: React.FC<{ n: NotifItem; onGo: (n: NotifItem) => void; onDismiss: (id: number) => void }> = ({ n, onGo, onDismiss }) => {
  const { I, cls } = itemVisual(n);
  useEffect(() => {
    const t = setTimeout(() => onDismiss(n.id), 6000);
    return () => clearTimeout(t);
  }, [n.id]);
  return (
    <button type="button" onClick={() => onGo(n)} data-notif-toast data-notif-level={n.level}
      className="jz-toast-in flex w-full gap-2.5 rounded-card border border-jz-border bg-jz-surface px-3 py-2.5 text-left shadow-dialog transition-colors duration-hover hover:bg-jz-surface-2">
      <I size={16} className={cx('mt-0.5 flex-none', cls)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate text-label font-semibold text-jz-ink">{n.title}</div>
        {n.body && <div className="mt-0.5 line-clamp-2 text-meta text-jz-ink-2">{n.body}</div>}
      </div>
      <span className="flex-none text-meta text-jz-muted">刚刚</span>
    </button>
  );
};
