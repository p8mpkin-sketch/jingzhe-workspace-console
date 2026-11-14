import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckCircle2, XCircle, ShieldAlert, AlertTriangle, Bot, Info,
  CheckCheck, Trash2, Wifi, WifiOff,
} from 'lucide-react';
import { useNotifications, NotifItem } from '@/stores/notifications';

/** R121: 顶栏通知铃铛——下拉通知面板 + 新到通知浮卡(toast)。
 *  数据源=stores/notifications(SSE 实时流 + REST 兜底);点击通知=置已读+深链跳转
 *  (任务→/tasks?focus=N 复用 R94-1 高亮定位,AI 会话→工作台路由)。 */

const KIND_ICON: Record<string, { I: React.ComponentType<any>; cls: string }> = {
  task:     { I: CheckCircle2,  cls: 'text-vuln-safe' },
  security: { I: ShieldAlert,   cls: 'text-vuln-critical' },
  danger:   { I: AlertTriangle, cls: 'text-vuln-critical' },
  ai:       { I: Bot,           cls: 'text-neon-accent' },
  system:   { I: Info,          cls: 'text-jz-text-secondary' },
};

function itemVisual(n: NotifItem): { I: React.ComponentType<any>; cls: string } {
  const base = KIND_ICON[n.kind] || KIND_ICON.system;
  if (n.level === 'danger') return { I: XCircle, cls: 'text-vuln-critical' };
  if (n.kind === 'task' && n.level === 'success') return base;
  return base;
}

const LEVEL_BORDER: Record<string, string> = {
  success: 'border-l-vuln-safe',
  warning: 'border-l-vuln-medium',
  danger: 'border-l-vuln-critical',
  info: 'border-l-neon-accent',
};
/* 回访轮: 严重级=染底不用 border-l 线(规范#3);弹层卡与内联行两处统一 */
const LEVEL_BG: Record<string, string> = {
  success: 'bg-vuln-safe/8',
  warning: 'bg-vuln-medium/8',
  danger: 'bg-vuln-critical/8',
  info: 'bg-jz-elevated',
};

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
  // 全平台升级 Step2①: 面板增强——kind 过滤 + 清空(本地视图层;后端仅有 list/read/stream 端点,
  // 无删除/清空端点=诚实标注「本地」: 清空=本地隐藏当前列表 + 全部已读,刷新或新通知到达不受影响)
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
      <div className="relative" ref={ref} data-notif-bell>
        <button onClick={() => setOpen(!open)} data-notif-toggle
 title={live ? '通知中心(实时)' : '通知中心(未连接)'}
 className="relative w-8 h-8 rounded-lg flex items-center justify-center text-jz-text-secondary hover:text-neon-accent hover:bg-jz-elevated/60 transition-colors"
 aria-label="通知中心">
          <Bell size={16} className={open ? 'text-neon-accent' : ''} />
          {/* 连接态小点: SSE live=翡翠 / 断线=灰 */}
          <span className={`absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${live ? 'bg-vuln-safe' : 'bg-jz-text-muted'}`}
 title={live ? '实时推送已连接' : '实时推送未连接(自动重连)'} />
 {unread > 0 && (
            <span data-notif-unread
 className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-vuln-critical text-white text-[11px] font-bold flex items-center justify-center">
 {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>

        {open && (
          <div data-notif-panel
 className="absolute right-0 top-full mt-2 w-[360px] rounded-xl bg-jz-surface shadow-jz-card z-50 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-jz-border">
              <span className="text-[12px] font-semibold text-jz-text-primary flex items-center gap-1.5">
                通知中心
                <span title={live ? 'SSE 实时推送已连接' : '未连接(自动重连中)'}>
                  {live ? <Wifi size={11} className="text-vuln-safe" /> : <WifiOff size={11} className="text-jz-text-muted" />}
                </span>
              </span>
              <button onClick={() => markAllRead()} data-notif-readall
 disabled={unread === 0}
 className="flex items-center gap-1 text-[11px] text-jz-text-secondary hover:text-neon-accent disabled:opacity-40 disabled:hover:text-jz-text-secondary">
                <CheckCheck size={12} /> 全部已读
              </button>
              <button onClick={clearLocal} data-notif-clear-local
 disabled={items.length === 0}
 title="后端无通知清空/删除端点——本地视图清空(隐藏当前列表并全部已读),新通知到达或刷新后如实恢复"
 className="ml-1.5 flex items-center gap-1 text-[11px] text-jz-text-secondary hover:text-vuln-critical disabled:opacity-40">
                <Trash2 size={11} /> 清空(本地)
              </button>
            </div>
            {/* kind 过滤 Tab(计数=store 列表真算,本地视图层过滤) */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-jz-border flex-wrap" data-notif-filter>
 {KIND_TABS.map(([k, label]) => {
 const n = k ? items.filter((x) => x.kind === k).length : items.length;
                if (k && n === 0) return null;
                return (
                  <button key={k || 'all'} onClick={() => setKindF(k)} data-notif-filter-tab={k || 'all'}
 className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${kindF === k
 ? 'bg-neon-accent/10 text-neon-accent font-semibold'
 : 'text-jz-text-muted hover:text-jz-text-secondary hover:bg-jz-elevated/60'}`}>
                    {label} <span className="tnum font-mono opacity-70">{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {shown.length === 0 && (
                <div className="px-3 py-8 text-center text-[12px] text-jz-text-muted" data-notif-empty>
 {items.length > 0 && shown.length === 0 && clearedIds.size > 0
                    ? '本地视图已清空——新通知到达后此处恢复(数据仍在服务端,刷新页面可见)'
                    : '暂无通知 — 任务完成 / 安全事件 / AI 编排进展会实时推送到这里'}
                </div>
 )}
 {shown.map((n) => {
                const { I, cls } = itemVisual(n);
                return (
                  <button key={n.id} onClick={() => go(n)} data-notif-item data-notif-level={n.level}
 className={`w-full text-left flex gap-2.5 px-3 py-2.5 ${LEVEL_BG[n.level] || LEVEL_BG.info} hover:shadow-[inset_0_0_0_1px_rgb(var(--c-border))] transition-all ${n.read_at ? 'opacity-60' : ''}`}>
                    <I size={15} className={`flex-none mt-0.5 ${cls}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {!n.read_at && <span className="w-1.5 h-1.5 rounded-full bg-vuln-critical flex-none" />}
                        <span className="text-[12px] font-medium text-jz-text-primary truncate">{n.title}</span>
                      </div>
                      {n.body && <div className="text-[11px] text-jz-text-secondary mt-0.5 line-clamp-2">{n.body}</div>}
                      <div className="text-[11px] text-jz-text-muted mt-1 font-mono">{fmtRel(n.created_at)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="px-3 py-1.5 border-t border-jz-border text-[11px] text-jz-text-muted">
              实时推送 · 最近 50 条 · 点击通知跳转对应页面
            </div>
          </div>
        )}
      </div>

      {/* 新到通知浮卡(右上堆叠,6s 自动消失,点击跳转) */}
      <div className="fixed right-4 top-14 z-[60] flex flex-col gap-2 w-[320px]" data-notif-toasts>
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
    <button onClick={() => onGo(n)} data-notif-toast data-notif-level={n.level}
 className={`w-full text-left flex gap-2.5 rounded-xl ${LEVEL_BG[n.level] || LEVEL_BG.info} shadow-jz-card px-3 py-2.5 hover:shadow-[0_8px_24px_-10px_rgba(15,23,42,0.25)] transition-all`}>
      <I size={15} className={`flex-none mt-0.5 ${cls}`} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-jz-text-primary truncate">{n.title}</div>
        {n.body && <div className="text-[11px] text-jz-text-secondary mt-0.5 line-clamp-2">{n.body}</div>}
      </div>
      <span className="flex-none text-[11px] text-jz-text-muted font-mono">刚到</span>
    </button>
  );
};
