import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { cx, IconButton, useIsMobile, useMediaQuery, useOverlay, BREAKPOINT } from '@/components/ui';
import { NAV_PRIMARY, NAV_ACTION, ownerPath } from './navigation';
import { QueueDeviceEntry } from './QueueDeviceEntry';
import { preloadRoute } from '@/app/routes';

/**
 * Navigation rail (V3). Desktop default is 220 px; it collapses to 56 px by choice only. Below 1024 px it starts
 * collapsed (and can be expanded); at 760 px and below it is a drawer. No route collapses it on its own: the
 * workbench and Agent keep the full rail unless the user collapses it.
 * Top: the mark and the one global primary action (新建评估). Middle: seven destinations. Bottom: the device and
 * queue entry points (state, not counts) and the collapse control. The account lives in the top bar only.
 * The manual collapse choice is remembered on this device.
 */
const KEY = 'jz.rail';
const readManual = (): boolean | null => { try { const v = localStorage.getItem(KEY); return v === '1' ? true : v === '0' ? false : null; } catch { return null; } };

export const Sidebar: React.FC<{ mobileOpen?: boolean; onMobileClose?: () => void }> = ({ mobileOpen = false, onMobileClose }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const mobile = useIsMobile();
  // Between the phone breakpoint and 1024 px the rail starts collapsed so the page keeps its width.
  const auto = useMediaQuery(`(min-width: ${BREAKPOINT.mobile + 1}px) and (max-width: 1023px)`);
  // `choice` is the user's explicit choice for the current context; null = follow the default.
  const [choice, setChoice] = useState<boolean | null>(null);
  const [saved, setSaved] = useState<boolean | null>(readManual);
  useEffect(() => { setChoice(null); }, [auto]);
  const collapsed = !mobile && (choice ?? (auto ? true : saved ?? false));
  const toggle = () => {
    const next = !collapsed;
    setChoice(next);
    if (!auto) { setSaved(next); try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* storage unavailable */ } }
  };

  const close = () => onMobileClose?.();
  const drawerRef = useOverlay(mobile && mobileOpen, close);
  useEffect(() => { if (mobile) close(); }, [location.pathname]);

  if (mobile && !mobileOpen) return null;
  const owner = ownerPath(location.pathname);
  const onAction = location.pathname === NAV_ACTION.to;

  const rail = (
    <nav ref={mobile ? drawerRef : undefined} tabIndex={mobile ? -1 : undefined} aria-label="主导航"
      data-nav-rail={collapsed ? 'collapsed' : 'full'}
      onMouseDown={mobile ? (e) => e.stopPropagation() : undefined}
      className={cx('relative z-30 flex h-full flex-none flex-col border-r border-jz-border bg-jz-rail outline-none',
        'transition-[width] duration-base ease-jz',
        mobile ? 'w-[280px] max-w-[86vw] shadow-dialog' : collapsed ? 'w-jz-sidebar-collapsed' : 'w-jz-sidebar')}>

      <div className={cx('flex h-jz-topbar flex-none items-center gap-2.5 border-b border-jz-border', collapsed ? 'justify-center px-2' : 'px-4')}>
        <img src="/v2/brand/icon.svg" alt="" className="h-6 w-6 flex-none rounded-tag" />
        {!collapsed && (
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="whitespace-nowrap font-display text-section font-semibold text-jz-ink">惊蛰</span>
            <span className="truncate font-mono text-meta text-jz-muted" data-app-version>{__APP_VERSION__}</span>
          </div>
        )}
        {mobile && <IconButton label="关闭导航" onClick={close} data-nav-close><X size={18} aria-hidden /></IconButton>}
      </div>

      <div className={cx('flex-none pb-1 pt-3', collapsed ? 'px-2' : 'px-3')}>
        <button type="button" onClick={() => { navigate(NAV_ACTION.to); if (mobile) close(); }}
          onMouseEnter={() => preloadRoute(NAV_ACTION.to)} onFocus={() => preloadRoute(NAV_ACTION.to)}
          aria-label={NAV_ACTION.label} title={collapsed ? NAV_ACTION.label : undefined} aria-current={onAction ? 'page' : undefined}
          data-nav-action data-nav-item={NAV_ACTION.to}
          className={cx('flex h-jz-control w-full items-center justify-center gap-2 rounded-control bg-jz-brand text-label font-medium text-jz-on-brand transition-colors duration-fast hover:bg-jz-brand/90 max-[760px]:h-jz-touch',
            collapsed ? 'px-0' : 'px-3')}>
          <NAV_ACTION.icon size={16} className="flex-none" aria-hidden />
          {!collapsed && <span className="truncate">{NAV_ACTION.label}</span>}
        </button>
      </div>

      <ul className={cx('min-h-0 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden py-2', collapsed ? 'px-2' : 'px-3')}>
        {NAV_PRIMARY.map(({ to, icon: Icon, label }) => {
          const active = owner === to && !onAction;
          return (
            <li key={to}>
              <NavLink to={to} title={collapsed ? label : undefined} aria-label={collapsed ? label : undefined}
                aria-current={active ? 'page' : undefined}
                onClick={mobile ? close : undefined} onMouseEnter={() => preloadRoute(to)} onFocus={() => preloadRoute(to)} data-nav-item={to}
                className={cx('group relative flex h-jz-control items-center gap-2.5 whitespace-nowrap rounded-control border text-label transition-colors duration-fast max-[760px]:h-jz-touch',
                  collapsed ? 'justify-center px-0' : 'px-2.5',
                  active ? 'border-jz-border bg-jz-raised font-semibold text-jz-ink' : 'border-transparent font-medium text-jz-ink-2 hover:bg-jz-hover hover:text-jz-ink')}>
                {active && <span aria-hidden className={cx('absolute inset-y-1.5 w-0.5 rounded-pill bg-jz-brand', collapsed ? '-left-2' : '-left-3')} />}
                <Icon size={18} className={cx('flex-none', active ? 'text-jz-brand' : 'text-jz-muted group-hover:text-jz-ink-2')} aria-hidden />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
            </li>
          );
        })}
      </ul>

      <div className={cx('flex-none space-y-1 border-t border-jz-border py-2', collapsed ? 'px-2' : 'px-3')}>
        <QueueDeviceEntry collapsed={collapsed} />
        {!mobile && (
          <button type="button" onClick={toggle} data-nav-collapse={collapsed ? 'expand' : 'collapse'}
            aria-label={collapsed ? '展开导航' : '收起导航'} title={collapsed ? '展开导航' : '收起导航'}
            className={cx('flex h-jz-control w-full items-center gap-2.5 rounded-control text-label text-jz-muted transition-colors duration-fast hover:bg-jz-hover hover:text-jz-ink',
              collapsed ? 'justify-center px-0' : 'px-2.5')}>
            {collapsed ? <ChevronsRight size={18} aria-hidden /> : <ChevronsLeft size={18} aria-hidden />}
            {!collapsed && <span>收起</span>}
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
