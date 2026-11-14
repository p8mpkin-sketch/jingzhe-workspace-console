import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Smartphone, Sun, Moon, Settings, RefreshCw, ChevronDown, Copy, Check, Menu, LogOut, History } from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { api } from '@/services/api';
import { listDevices } from '@/services/pentestService';
import { usePentest } from '@/stores/pentest';
import { cx, IconButton, Popover, MenuItem } from '@/components/ui';
import { useRouteChrome } from './routeChrome';
import { moduleLabel } from './navigation';
import { useTheme } from '@/theme/ThemeContext';
import { NotificationBell } from '@/layout/NotificationBell';
import { DeviceFridaFlyout } from '@/layout/DeviceFridaFlyout';

/**
 * Top bar, 52 px. Left: navigation button (mobile) and the current module with the session in context.
 * Middle: session context pills (platform, session stream, package, device). Right: refresh, theme,
 * notifications, settings, account menu.
 * Data is unchanged from before the redesign: session detail on sid change, and the single 8 s device poll
 * that also feeds the rail through the shared store.
 */
const PILL = 'inline-flex h-7 items-center gap-1.5 rounded-pill border border-jz-border bg-jz-surface px-2.5 text-meta text-jz-ink-2';

export const TopBar: React.FC<{ onOpenNav?: () => void }> = ({ onOpenNav }) => {
  const me = useAuth((s) => s.me);
  const sid = usePentest((s) => s.sid);
  const sse = usePentest((s) => s.sse);
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const [fingerprint, setFingerprint] = useState('—');
  const [pf, setPf] = useState('android');
  const [device, setDevice] = useState<{ serial: string; online: boolean; model?: string; android?: string } | null>(null);
  const [devices, setDevices] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const liveDevices = usePentest((s) => s.devices);
  const [devPop, setDevPop] = useState(false);

  useEffect(() => {
    if (!sid) return;
    api(`/api/pentest/sessions/${sid}`).then((d) => {
      const pkg: string = d.package || '';
      const ver = d?.manifest?.version ? ` v${d.manifest.version}` : '';
      setFingerprint(pkg ? pkg + ver : '—');
      setPf(d?.manifest?.platform || 'android');
      setDevice({ serial: d.device || '', online: false });
    }).catch(() => {});
  }, [sid]);

  useEffect(() => {
    const poll = async () => {
      try {
        const ds = await listDevices(true);
        const list = Array.isArray(ds) ? ds : [];
        setDevices(list.length);
        usePentest.getState().setDevices(list); // single poll, shared with the rail through the store
        setDevice((prev) => {
          if (!prev) return prev;
          const hit = list.find((d: any) => d.serial === prev.serial);
          return { ...prev, online: !!hit, model: hit?.model || prev.model, android: hit?.android || prev.android };
        });
      } catch { /* silent */ }
    };
    poll();
    const t = setInterval(poll, 8000);
    return () => clearInterval(t);
  }, []);

  const crumb = moduleLabel(location.pathname);
  const chrome = useRouteChrome();
  const copyPkg = async () => {
    try {
      await navigator.clipboard.writeText(fingerprint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  };
  const hasSession = sid != null && fingerprint !== '—';
  const platform = pf === 'harmony' ? 'HarmonyOS' : pf === 'ios' ? 'iOS' : 'Android';
  const live = sid != null && sse === 'live';

  return (
    <header className="sticky top-0 z-40 flex h-jz-topbar flex-none items-center gap-2 border-b border-jz-border bg-jz-canvas px-jz-page" data-topbar>
      {onOpenNav && (
        <IconButton label="打开导航" onClick={onOpenNav} data-nav-open className="-ml-2 tablet:hidden"><Menu size={18} aria-hidden /></IconButton>
      )}

      <div className="flex min-w-0 items-center gap-1.5 text-label" data-breadcrumb>
        <span className="whitespace-nowrap font-semibold text-jz-ink">{crumb}</span>
        {hasSession && (
          <>
            <span className="text-jz-muted" aria-hidden>/</span>
            <span className="max-w-[220px] truncate font-mono text-meta text-jz-ink-2">#{sid} {fingerprint}</span>
          </>
        )}
      </div>

      <span className="flex-1" />

      {/* Session context. Routes that are not about an assessment session hide it. */}
      {!chrome.hidePentestTelemetry && (
        <div className="flex min-w-0 items-center gap-2">
          {hasSession && (
            <div data-pf-badge className={cx(PILL, 'hidden lg:inline-flex')} title={`会话平台：${platform}`}>{platform}</div>
          )}
          <div className={cx(PILL, 'hidden font-mono tablet:inline-flex')} data-capsule-session
            title={sse === 'live' ? `会话 #${sid} 的实时事件流已连接` : '当前没有打开的会话'}>
            <span aria-hidden className={cx('h-1.5 w-1.5 rounded-pill', live ? 'bg-jz-teal' : 'bg-jz-border-strong')} />
            {sid != null ? `#${sid}` : '无会话'}
          </div>
          {fingerprint !== '—' && (
            <button type="button" onClick={copyPkg} title={`复制 ${fingerprint}`} aria-label={`复制包名 ${fingerprint}`} data-capsule-pkg
              className={cx(PILL, 'hidden max-w-[220px] font-mono transition-colors duration-hover hover:border-jz-border-strong hover:text-jz-ink lg:inline-flex')}>
              <span className="truncate">{fingerprint}</span>
              {copied ? <Check size={12} className="flex-none text-jz-teal" aria-hidden /> : <Copy size={12} className="flex-none text-jz-muted" aria-hidden />}
            </button>
          )}
          <div className="relative hidden md:block" data-capsule-device-wrap>
            <button type="button" onClick={() => setDevPop((v) => !v)} data-capsule-device data-capsule-device-clickable
              aria-haspopup="dialog" aria-expanded={devPop} title="查看设备与 Frida 状态"
              className={cx(PILL, 'max-w-[280px] transition-colors duration-hover hover:border-jz-border-strong hover:text-jz-ink')}>
              <Smartphone size={14} className={cx('flex-none', device?.online ? 'text-jz-teal' : 'text-jz-muted')} aria-hidden />
              <span className="truncate">
                {device?.serial
                  ? `${device.model || device.serial}${device.android ? ` · Android ${device.android}` : ''} · ${device.online ? '在线' : '离线'}`
                  : `${devices} 台设备`}
              </span>
            </button>
            <DeviceFridaFlyout open={devPop} onClose={() => setDevPop(false)} devices={liveDevices} placement="below-end" />
          </div>
        </div>
      )}

      <div className="flex flex-none items-center gap-0.5">
        <IconButton label="刷新当前页面" onClick={() => window.location.reload()} data-topbar-refresh><RefreshCw size={16} aria-hidden /></IconButton>
        <IconButton label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'} onClick={toggle} data-theme-toggle>
          <span key={theme} className="theme-icon-swap inline-flex">{theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}</span>
        </IconButton>
        <NotificationBell />
        <Link to="/system" aria-label="系统设置" title="系统设置"
          className="hidden h-jz-control w-jz-control place-items-center rounded-control text-jz-ink-2 transition-colors duration-hover hover:bg-jz-surface-2 hover:text-jz-ink tablet:grid">
          <Settings size={16} aria-hidden />
        </Link>

        <div data-user-menu className="ml-1 inline-flex">
          <Popover label="账户" role="menu" className="w-52"
            trigger={(p) => (
              <button type="button" {...p} aria-label={`账户：${me?.username || '未登录'}`}
                className="flex h-jz-control items-center gap-1 rounded-control pl-1 pr-1.5 transition-colors duration-hover hover:bg-jz-surface-2 max-[760px]:min-h-jz-touch">
                <span aria-hidden className="grid h-7 w-7 place-items-center rounded-pill bg-jz-brand-soft text-meta font-semibold text-jz-brand">
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
                <MenuItem icon={<Settings size={16} aria-hidden />} onClick={() => { close(); window.location.hash = '/system'; }}>系统设置</MenuItem>
                <a href="/" role="menuitem" className="flex h-jz-control w-full items-center gap-2 whitespace-nowrap rounded-control px-2.5 text-label text-jz-ink hover:bg-jz-surface-2 max-[760px]:h-jz-touch">
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
