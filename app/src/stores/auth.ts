import { create } from 'zustand';
import { api, getToken, setToken, clearToken, ApiError } from '@/services/api';

interface AuthState {
  token: string;
  me: { username?: string; role?: string } | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  bootstrap: () => Promise<void>;
  logout: () => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  token: getToken(),
  me: null,
  ready: false,
  login: async (username, password) => {
    const r = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const d = await r.json();
    if (!r.ok || !d.token) throw new Error(d.detail || '登录失败');
    setToken(d.token);
    set({ token: d.token });
    await get().bootstrap();
  },
  bootstrap: async () => {
    if (!getToken()) { set({ ready: true }); return; }
    try {
      const me = await api<{ username?: string }>('/api/me');
      set({ me, ready: true });
    } catch (e) {
      // R77-4: 仅 401(令牌真失效)清 token;网络瞬断/服务重启等非鉴权失败降级放行,
      // 不再把用户踢回登录页(reload 回登录的根因之一即是 catch 全清)
      if (e instanceof ApiError && e.status === 401) {
        clearToken();
        set({ token: '', me: null, ready: true });
      } else {
        set({ ready: true });
      }
    }
  },
  logout: () => { clearToken(); set({ token: '', me: null }); },
}));

// R78-1③: 验收/排障调试句柄(R36 __dvApi 同款先例)——供控制台直接驱动/观测登录态
if (typeof window !== 'undefined') (window as any).__authStore = useAuth;
