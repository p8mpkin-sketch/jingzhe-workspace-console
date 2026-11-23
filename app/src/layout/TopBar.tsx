import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Sun, Moon, Settings, ChevronDown, ChevronRight, Menu, LogOut, History, Search, Archive } from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { cx, IconButton, Popover, MenuItem } from '@/components/ui';
import { NAV_ACTION, PATHS } from './navigation';
import { buildCrumbs, useCrumbs } from './breadcrumb';
import { useTheme } from '@/theme/ThemeContext';
import { NotificationBell } from '@/layout/NotificationBell';
import { openCommandPalette } from '@/components/CmdPalette';

/**
 * Top bar (V3), 48 px. Left: navigation button (phone) and the breadcrumb, which names the place and nothing else.
 * Right: command button, the primary action on phones, notifications, theme, account.
 * It shows no device, queue or session facts: those belong to the rail entries and to the page that owns them.
 * It issues no request (the device poll moved to the shell, layout/useDevicePoll).
 */
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

export const TopBar: React.FC<{ onOpenNav?: () => void }> = ({ onOpenNav }) => {
  const me = useAuth((s) => s.me);
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const names = useCrumbs((s) => s.names);
  const crumbs = buildCrumbs(pathname, names);

  return (
    <header className="sticky top-0 z-40 flex h-jz-topbar flex-none items-center gap-2 border-b border-jz-border bg-jz-canvas px-jz-page" data-topbar>
      {onOpenNav && (
        <IconButton label="打开导航" onClick={onOpenNav} data-nav-open className="-ml-2 tablet:hidden"><Menu size={18} aria-hidden /></IconButton>
      )}

      <nav aria-label="位置" className="flex min-w-0 flex-1 items-center gap-1 text-label" data-breadcrumb>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          const cls = cx('truncate', c.mono && 'font-mono', last ? 'font-semibold text-jz-ink' : 'text-jz-ink-2',
            // On phones only the last two levels are shown, so the current place always fits.
            i < crumbs.length - 2 && 'max-[760px]:hidden');
          return (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight size={14} className={cx('flex-none text-jz-muted', i < crumbs.length - 1 && i < 2 && crumbs.length > 2 && 'max-[760px]:hidden')} aria-hidden />}
              {c.to && !last
                ? <Link to={c.to} className={cx(cls, 'rounded-tag hover:text-jz-ink')}>{c.label}</Link>
                : <span className={cls} aria-current={last ? 'page' : undefined}>{c.label}</span>}
            </React.Fragment>
          );
        })}
      </nav>

      <button type="button" onClick={openCommandPalette} data-cmdk-open aria-label="搜索或跳转" aria-keyshortcuts="Control+K Meta+K"
        className="hidden h-jz-control w-56 flex-none items-center gap-2 rounded-control border border-jz-border bg-jz-surface px-2.5 text-label text-jz-muted transition-colors duration-fast hover:border-jz-border-strong hover:text-jz-ink-2 lg:flex">
        <Search size={14} className="flex-none" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">搜索或跳转</span>
        <kbd className="flex-none rounded-tag border border-jz-border bg-jz-inset px-1 font-mono text-meta text-jz-muted">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>

      <div className="flex flex-none items-center gap-0.5">
        <IconButton label="搜索或跳转" onClick={openCommandPalette} className="lg:hidden" data-cmdk-open-compact><Search size={16} aria-hidden /></IconButton>
        {pathname !== NAV_ACTION.to && (
          <IconButton label={NAV_ACTION.label} variant="primary" onClick={() => navigate(NAV_ACTION.to)} className="tablet:hidden" data-topbar-action>
            <NAV_ACTION.icon size={16} aria-hidden />
          </IconButton>
        )}
        <NotificationBell />
        <IconButton label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'} onClick={toggle} data-theme-toggle>
          <span key={theme} className="theme-icon-swap inline-flex">{theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}</span>
        </IconButton>

        <div data-user-menu className="ml-1 inline-flex">
          <Popover label="账户" role="menu" className="w-52"
            trigger={(p) => (
              <button type="button" {...p} aria-label={`账户：${me?.username || '未登录'}`}
                className="flex h-jz-control items-center gap-1 rounded-control pl-1 pr-1.5 transition-colors duration-fast hover:bg-jz-hover max-[760px]:min-h-jz-touch">
                <span aria-hidden className="grid h-6 w-6 place-items-center rounded-pill bg-jz-brand-soft text-meta font-semibold text-jz-brand">
                  {(me?.username || 'U').slice(0, 1).toUpperCase()}
                </span>
                <ChevronDown size={14} className="text-jz-muted" aria-hidden />
              </button>
            )}>
            {(close) => (
              <>
                <div className="mb-1 border-b border-jz-border px-2.5 pb-2 pt-1">
                  <div className="truncate text-label font-medium text-jz-ink">{me?.username || '未登录'}</div>
                  <div className="truncate text-meta text-jz-muted">{me?.role || ''}</div>
                </div>
                <MenuItem icon={<Settings size={16} aria-hidden />} onClick={() => { close(); navigate(PATHS.system); }} data-menu-system>系统</MenuItem>
                <MenuItem icon={<Archive size={16} aria-hidden />} onClick={() => { close(); navigate(PATHS.archive); }} data-menu-archive>AI 助手归档</MenuItem>
                <a href="/" role="menuitem" className="flex h-jz-control w-full items-center gap-2 whitespace-nowrap rounded-control px-2.5 text-label text-jz-ink hover:bg-jz-hover max-[760px]:h-jz-touch">
                  <History size={16} aria-hidden />返回旧版界面
                </a>
                <MenuItem icon={<LogOut size={16} aria-hidden />} onClick={() => { localStorage.removeItem('token'); window.location.hash = ''; window.location.reload(); }}>退出登录</MenuItem>
              </>
            )}
          </Popover>
        </div>
      </div>
    </header>
  );
};
