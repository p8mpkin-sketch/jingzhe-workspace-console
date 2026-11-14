import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Smartphone, ChevronsLeft, ChevronsRight, LogOut, X } from 'lucide-react';
import { usePentest } from '@/stores/pentest';
import { useAuth } from '@/stores/auth';
import { api } from '@/services/api';
import { cx, IconButton, useIsMobile, useMediaQuery, useOverlay, BREAKPOINT } from '@/components/ui';
import { DeviceFridaFlyout } from './DeviceFridaFlyout';
import { useRouteChrome } from './routeChrome';
import { NAV_GROUPS } from './navigation';

/**
 * Left navigation. 232 px expanded, 68 px collapsed, a drawer at 760 px and below.
 * Data is unchanged from before the redesign: device list from the shared store (written by the top bar's single
 * 8 s poll), queue counts from /api/tasks-summary every 30 s. The component stays mounted on mobile while the
 * drawer is closed, so the polling does not depend on the viewport.
 */
export const Sidebar: React.FC<{ mobileOpen?: boolean; onMobileClose?: () => void }> = ({ mobileOpen = false, onMobileClose }) => {
  const workbench = usePentest((s) => s.workbench);
  const devices = usePentest((s) => s.devices);
  const location = useLocation();
  const navigate = useNavigate();
  const logout = () => { localStorage.removeItem('token'); navigate(0); };
  const me = useAuth((s) => s.me);
  const [manual, setManual] = useState(false);
  const chrome = useRouteChrome();
  const mobile = useIsMobile();
  // Between the mobile breakpoint and 1024 px the rail starts collapsed so the page keeps its width.
  const narrow = useMediaQuery(`(min-width: ${BREAKPOINT.mobile + 1}px) and (max-width: 1023px)`);
  // Collapsed = session workspace (automatic) or the manual toggle; routes with their own side list and narrow
  // viewports start collapsed and the toggle expands them.
  const collapsed = !mobile && (workbench || ((chrome.autoCollapseNav || narrow) ? !manual : manual));

  const [running, setRunning] = useState<number | null>(null);
  const [failedCnt, setFailedCnt] = useState<number | null>(null);
  useEffect(() => {
    const load = () => api<any>('/api/tasks-summary').then((d) => {
      setRunning(typeof d?.running === 'number' ? d.running : null);
      setFailedCnt(typeof d?.failed === 'number' ? d.failed : null);
    }).catch(() => {});
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);
  const devCount = devices.length;
  const fridaOn = devices.filter((d) => d.frida).length;
  const failed = failedCnt ?? 0;
  const [devPop, setDevPop] = useState(false);

  const close = () => onMobileClose?.();
  const drawerRef = useOverlay(mobile && mobileOpen, close);
  // A route change closes the drawer.
  useEffect(() => { if (mobile) close(); }, [location.pathname]);

  if (mobile && !mobileOpen) return null;

  const openFailed = () => { window.location.hash = '/tasks?status=failed'; };
  const queueTitle = failed > 0 ? `${failed} 个任务失败，点击查看` : '运行中与失败的任务数，每 30 秒更新';

  const rail = (
    <nav ref={mobile ? drawerRef : undefined} tabIndex={mobile ? -1 : undefined} aria-label="主导航"
      data-nav-rail={collapsed ? 'collapsed' : 'full'}
      onMouseDown={mobile ? (e) => e.stopPropagation() : undefined}
      className={cx('relative z-30 flex h-full flex-none flex-col border-r border-jz-border bg-jz-rail outline-none',
        'transition-[width] duration-expand',
        mobile ? 'w-[280px] max-w-[86vw] shadow-dialog' : collapsed ? 'w-jz-sidebar-collapsed' : 'w-jz-sidebar')}>

      <div className={cx('flex h-jz-topbar flex-none items-center gap-2.5', collapsed ? 'justify-center px-2' : 'px-4')}>
        <img src="/v2/brand/icon.svg" alt="" className="h-8 w-8 flex-none rounded-control shadow-card" />
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <div className="whitespace-nowrap font-display text-section font-semibold text-jz-ink">惊蛰</div>
            <div className="whitespace-nowrap font-mono text-meta text-jz-muted">JINGZHE WORKSPACE</div>
          </div>
        )}
        {mobile && <IconButton label="关闭导航" onClick={close} data-nav-close><X size={18} aria-hidden /></IconButton>}
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-3 py-3">
        {NAV_GROUPS.map((g) => (
          <div key={g.title}>
            {!collapsed && <div className="mb-1.5 px-2.5 text-meta font-medium text-jz-muted">{g.title}</div>}
            <ul className="space-y-0.5">
              {g.items.map(({ to, icon: Icon, label }) => (
                <li key={to}>
                  <NavLink to={to} title={collapsed ? label : undefined} aria-label={collapsed ? label : undefined}
                    onClick={mobile ? close : undefined} data-nav-item={to}
                    className={({ isActive }) => cx('group relative flex h-jz-control items-center gap-2.5 whitespace-nowrap rounded-control text-label transition-[background-color,color,box-shadow] duration-hover max-[760px]:h-jz-touch',
                      collapsed ? 'justify-center px-0' : 'px-2.5',
                      isActive ? 'bg-jz-surface font-semibold text-jz-ink shadow-card' : 'font-medium text-jz-ink-2 hover:bg-jz-surface/70 hover:text-jz-ink')}>
                    {({ isActive }) => (<>
                      {isActive && !collapsed && <span aria-hidden className="absolute inset-y-2 -left-3 w-[3px] rounded-r-pill bg-jz-brand" />}
                      <Icon size={18} className={cx('flex-none', isActive ? 'text-jz-brand' : 'text-jz-muted group-hover:text-jz-ink-2')} aria-hidden />
                      {!collapsed && <span className="truncate">{label}</span>}
                    </>)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className={cx('flex-none space-y-2 border-t border-jz-border py-3', collapsed ? 'px-2' : 'px-3')}>
        <div className="relative">
          {collapsed ? (
            <button type="button" onClick={() => setDevPop((v) => !v)} data-sidebar-devices data-devices-clickable
              aria-label={`设备：${devCount} 台已连接，Frida 就绪 ${fridaOn}`} title={`设备 ${devCount} 台 · Frida 就绪 ${fridaOn}`}
              className="relative mx-auto grid h-jz-control w-jz-control place-items-center rounded-control text-jz-ink-2 hover:bg-jz-surface-2 hover:text-jz-ink">
              <Smartphone size={18} aria-hidden />
              <span aria-hidden data-frida-dot className={cx('absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-pill', fridaOn > 0 ? 'bg-jz-teal' : 'bg-jz-border-strong')} />
            </button>
          ) : (
            <button type="button" onClick={() => setDevPop((v) => !v)} data-sidebar-devices data-devices-clickable
              aria-haspopup="dialog" aria-expanded={devPop}
              className="w-full space-y-1 rounded-card border border-jz-border bg-jz-surface px-3 py-2.5 text-left transition-colors duration-hover hover:border-jz-border-strong">
              <div className="flex items-center gap-1.5 text-meta text-jz-muted"><Smartphone size={14} aria-hidden /> 设备</div>
              <div className="text-label text-jz-ink" data-sidebar-dev-count>{devCount > 0 ? `${devCount} 台已连接` : '没有已连接的设备'}</div>
              <div className="flex items-center gap-1.5 text-meta text-jz-ink-2">
                <span aria-hidden data-frida-dot className={cx('h-1.5 w-1.5 rounded-pill', fridaOn > 0 ? 'bg-jz-teal' : 'bg-jz-border-strong')} />
                Frida 就绪 <span className="flex-1" /> <span className="font-mono tnum" data-sidebar-frida>{fridaOn}/{devCount}</span>
              </div>
            </button>
          )}
          <DeviceFridaFlyout open={devPop} onClose={() => setDevPop(false)} devices={devices} />
        </div>

        {collapsed ? (
          <button type="button" onClick={openFailed} disabled={!failed} data-sidebar-load data-engine-load-clickable={failed > 0 ? 'warn' : 'off'}
            aria-label={`任务队列：运行中 ${running ?? '—'}，失败 ${failedCnt ?? '—'}`} title={queueTitle}
            className="relative mx-auto grid h-jz-control w-jz-control place-items-center rounded-control text-jz-ink-2 enabled:hover:bg-jz-surface-2 enabled:hover:text-jz-ink">
            <Activity size={18} aria-hidden />
            {failed > 0 && <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-pill bg-jz-amber" />}
          </button>
        ) : (
          <button type="button" onClick={openFailed} disabled={!failed} title={queueTitle}
            data-sidebar-load data-engine-load-clickable={failed > 0 ? 'warn' : 'off'}
            className={cx('w-full space-y-1 rounded-card border px-3 py-2.5 text-left transition-colors duration-hover',
              failed > 0 ? 'border-jz-amber/40 bg-jz-amber/10 hover:bg-jz-amber/20' : 'cursor-default border-jz-border bg-jz-surface')}>
            <div className="flex items-center gap-1.5 text-meta text-jz-muted">
              <Activity size={14} aria-hidden /> 任务队列
              {failed > 0 && <span className="ml-auto font-medium text-jz-amber" data-engine-fail-badge>查看失败项</span>}
            </div>
            <div className="flex items-center text-label text-jz-ink-2">
              运行中 <span className="flex-1" />
              <span className={cx('font-mono tnum', running ? 'font-semibold text-jz-ink' : 'text-jz-muted')} data-engine-running>{running ?? '—'}</span>
            </div>
            <div className="flex items-center text-label text-jz-ink-2">
              失败 <span className="flex-1" />
              <span className={cx('font-mono tnum', failed > 0 ? 'font-semibold text-jz-amber' : 'text-jz-muted')} data-engine-failed>{failedCnt ?? '—'}</span>
            </div>
          </button>
        )}

        <div className={cx('flex items-center gap-2', collapsed && 'justify-center')}>
          <div aria-hidden className="grid h-8 w-8 flex-none place-items-center rounded-pill bg-jz-brand-soft text-meta font-semibold text-jz-brand">
            {(me?.username || 'U').slice(0, 1).toUpperCase()}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-label font-medium text-jz-ink">{me?.username || '未登录'}</div>
                <div className="truncate text-meta text-jz-muted">{me?.role || ''}</div>
              </div>
              <IconButton label="退出登录" size="sm" onClick={logout}><LogOut size={16} aria-hidden /></IconButton>
            </>
          )}
        </div>

        {mobile ? (
          <div className="px-1 font-mono text-meta text-jz-muted" data-app-version>{__APP_VERSION__}</div>
        ) : workbench ? (
          <div aria-hidden className="flex items-center justify-center pt-1 text-jz-muted" data-nav-collapse="auto">
            <ChevronsRight size={14} />
          </div>
        ) : (
          <button type="button" onClick={() => setManual((m) => !m)} data-nav-collapse={manual ? 'expand' : 'collapse'}
            aria-label={collapsed ? '展开导航' : '收起导航'} title={collapsed ? '展开导航' : '收起导航'}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-control text-jz-muted transition-colors duration-hover hover:bg-jz-surface-2 hover:text-jz-ink">
            {collapsed ? <ChevronsRight size={16} aria-hidden /> : <ChevronsLeft size={16} aria-hidden />}
            {!collapsed && <span className="font-mono text-meta" data-app-version>{__APP_VERSION__}</span>}
          </button>
        )}
      </div>
    </nav>
  );

  if (!mobile) return rail;
  return (
    <div className="fixed inset-0 z-50 flex bg-jz-scrim/50 modal-overlay-in" onMouseDown={close} data-nav-drawer>
      {rail}
    </div>
  );
};
