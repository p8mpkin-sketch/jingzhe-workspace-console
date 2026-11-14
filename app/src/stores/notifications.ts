import { create } from 'zustand';
import { api, getToken } from '@/services/api';

/** R121: 站内实时通知中心 store——SSE 流(后端 /api/notifications/stream,token 走 query,
 * pentest events/stream R23 P0-3 同款先例)+ REST 兜底拉取。Toast 由本 store 持有队列,
 * NotificationBell 渲染(顶栏铃铛下拉=通知面板)。 */

export interface NotifItem {
  id: number;
  kind: string;              // task | security | danger | ai | system
  level: string;             // info | success | warning | danger
  title: string;
  body?: string;
  link?: string;
  created_at: number;        // epoch 秒(后端 REAL)
  read_at: number | null;
}

interface NotificationsState {
  items: NotifItem[];        // 最近 50 条(后端 LIMIT 50)
  unread: number;
  live: boolean;             // SSE 连接态(断线 EventSource 自动重连,onopen 翻回)
  es: EventSource | null;
  toasts: NotifItem[];       // 新到通知浮卡(最多 3 张,自动消失由组件定时器驱动)
  connect: () => void;
  disconnect: () => void;
  refresh: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismissToast: (id: number) => void;
}

const MAX_TOASTS = 3;

export const useNotifications = create<NotificationsState>((set, get) => ({
  items: [],
  unread: 0,
  live: false,
  es: null,
  toasts: [],

  connect: () => {
    const token = getToken();
    if (!token) return;
    get().es?.close();
    get().refresh();
    const es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
    es.onopen = () => set({ live: true });
    es.onerror = () => set({ live: false });
    es.onmessage = (m) => {
      try {
        const d = JSON.parse(m.data);
        if (d.unread === undefined) return;    // 注释帧/done 帧无负载
        set((st) => {
          // 去重合并(流帧=增量,SSE 重连后 cursor=当下,理论无重叠;防御式按 id 去重)
          const seen = new Set(st.items.map((x) => x.id));
          const fresh: NotifItem[] = (d.items || []).filter((x: NotifItem) => !seen.has(x.id));
          const items = [...fresh, ...st.items].slice(0, 50);
          // 新到即浮卡(仅经流到达的,REST refresh 不弹)
          const toasts = [...fresh.slice(0, MAX_TOASTS), ...st.toasts].slice(0, MAX_TOASTS);
          return { items, unread: d.unread, toasts };
        });
      } catch { /* ping/注释帧 */ }
    };
    set({ es });
  },

  disconnect: () => { get().es?.close(); set({ es: null, live: false }); },

  refresh: async () => {
    try {
      const d = await api<{ items: NotifItem[]; unread: number }>('/api/notifications?limit=50');
      set({ items: d.items || [], unread: d.unread || 0 });
    } catch { /* 未登录/网络瞬断静默,下次 connect/动作再刷 */ }
  },

  markRead: async (id) => {
    try {
      const d = await api<{ unread: number }>('/api/notifications/read', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
      set((st) => ({
        unread: d.unread ?? st.unread,
        items: st.items.map((x) => (x.id === id && !x.read_at ? { ...x, read_at: Date.now() / 1000 } : x)),
      }));
    } catch { /* 静默: 下次 refresh 校正 */ }
  },

  markAllRead: async () => {
    try {
      const d = await api<{ unread: number }>('/api/notifications/read', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      set((st) => ({
        unread: 0,
        items: st.items.map((x) => (x.read_at ? x : { ...x, read_at: Date.now() / 1000 })),
      }));
    } catch { /* 静默 */ }
  },

  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
}));

// R78-1③ 先例: 验收/排障调试句柄
if (typeof window !== 'undefined') (window as any).__notifStore = useNotifications;
