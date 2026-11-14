import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
 Shield, Smartphone, Sun, Moon, Settings, RefreshCw,
 ChevronDown, Copy, Check,
} from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { api } from '@/services/api';
import { listDevices } from '@/services/pentestService';
import { usePentest } from '@/stores/pentest';
import { useRouteChrome } from './routeChrome';
import { useTheme } from '@/theme/ThemeContext';
import { NotificationBell } from '@/layout/NotificationBell';
import { DeviceFridaFlyout } from '@/layout/DeviceFridaFlyout';
import { useEffect, useState } from 'react';

/** R95-UI: 全局顶栏重构——48px 毛玻璃(backdrop-blur-md):
 * 左=模块面包屑(如 任务中心 / #357 xxx);中=环境遥测胶囊组(会话状态/SSE/包名可复制/目标硬件);
 * 右=主题切换(Sun/Moon 平滑动效)+通知中心(实时 SSE,R121)+设置入口+管理员下拉。
 * R121: 原「待办」静态气泡退役(轮询 /api/user-actions 无点击无跳转)——通知中心承接
 * 任务终态/登录安全/危险操作/AI 编排的实时推送。 */

export const TopBar: React.FC = () => {
 const me = useAuth((s) => s.me);
 const sid = usePentest((s) => s.sid);
 const sse = usePentest((s) => s.sse);
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const [fingerprint, setFingerprint] = useState('—');
  // R590-P4b: 平台维度(明细端点 manifest.platform,缺省 android=存量零破坏)
  const [pf, setPf] = useState('android');
  const [device, setDevice] = useState<{ serial: string; online: boolean; model?: string; android?: string } | null>(null);
  const [devices, setDevices] = useState<number>(0);
 const [copied, setCopied] = useState(false);
 const [menuOpen, setMenuOpen] = useState(false);
 // 全平台升级 Step2①: 状态胶囊放大可点击 → 「设备+Frida 状态浮层」(数据=store 既有轮询真值)
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
 usePentest.getState().setDevices(list); // R103-1: 单点轮询写入 store,Sidebar 共享(勿双轮询)
 setDevice((prev) => {
 if (!prev) return prev;
 const hit = list.find((d: any) => d.serial === prev.serial);
 return { ...prev, online: !!hit, model: hit?.model || prev.model, android: hit?.android || prev.android };
 });
 } catch { /* silent */ }
 };
 poll(); // R124: 首拍立即执行——挂载即取设备真值, 侧栏不再空窗等首个 8s 周期
 const t = setInterval(poll, 8000);
 return () => clearInterval(t);
 }, []);

 // 面包屑: HashRouter 下从 useLocation.pathname 解析当前模块名
 const crumb = (() => {
    const map: Record<string, string> = {
 dashboard: '态势仪表盘', pentest: 'AI自动化渗透', tasks: '任务中心',
 'new-audit': '新建审计', reports: '报告中心', skills: '技能知识库',
 'ai-assistant': 'AI 助手（归档）', agent: 'Agent 工作台', system: '系统',
 };
 const first = location.pathname.split('/')[1];
 return map[first] || '态势仪表盘';
 })();

 const chrome = useRouteChrome();
 const copyPkg = async () => {
 try {
 await navigator.clipboard.writeText(fingerprint);
 setCopied(true);
 setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  };

  return (
    <header className="h-12 flex-none flex items-center gap-3 px-4 bg-jz-surface/95 backdrop-blur-md shadow-card sticky top-0 z-40" data-topbar>
      {/* 左: 模块面包屑 */}
      <div className="flex items-center gap-1.5 text-meta min-w-0" data-breadcrumb>
        <Shield className="w-4 h-4 text-jz-brand flex-none" />
        <span className="font-semibold text-jz-ink whitespace-nowrap">{crumb}</span>
        {sid != null && fingerprint !== '—' && (
          <>
            <span className="text-jz-muted">/</span>
            <span className="font-mono text-jz-ink-2 truncate max-w-[220px]">#{sid} {fingerprint}</span>
          </>
        )}
      </div>

      <span className="flex-1" />

      {/* Agent 页不显示渗透会话/设备遥测 */}
      {!chrome.hidePentestTelemetry && (
      <div className="flex items-center gap-2">
        {/* R590-P4b: 平台徽章(三端维度,Android 绿/鸿蒙 紫/iOS 蓝) */}
        {sid != null && fingerprint !== '—' && (
          <div data-pf-badge
 className="flex items-center gap-1.5 px-2 py-1 rounded-pill bg-jz-surface-2 text-meta font-mono text-jz-ink-2"
 title={`会话平台: ${pf === 'harmony' ? 'HarmonyOS' : pf === 'ios' ? 'iOS' : 'Android'}`}>
            <span className={`w-1.5 h-1.5 rounded-pill ${
 pf === 'harmony' ? 'bg-jz-brand' : pf === 'ios' ? 'bg-jz-brand' : 'bg-jz-teal'}`} />
            {pf === 'harmony' ? '鸿蒙' : pf === 'ios' ? 'iOS' : 'Android'}
          </div>
        )}
        {/* 会话状态胶囊(绿点=已挂载会话/灰点=无活动会话) */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-pill bg-jz-surface-2 border border-transparent text-meta font-mono"
 title={sse === 'live' ? `SSE 已连接 · 会话 #${sid} 实时事件流` : '未选中渗透会话'} data-capsule-session>
          <span className={`w-1.5 h-1.5 rounded-pill ${sid != null && sse === 'live' ? 'bg-jz-teal' : 'bg-jz-muted'}`} />
          {sid != null ? `#${sid}` : '无会话'}
        </div>
        {/* 目标包名胶囊(截断+悬浮显复制钮,点击写剪贴板) */}
        {fingerprint !== '—' && (
          <button onClick={copyPkg} title={`复制: ${fingerprint}`}
 className="group flex items-center gap-1 px-2 py-1 rounded-pill bg-jz-surface-2 border border-transparent text-meta font-mono text-jz-ink-2 hover:border-jz-brand/50 max-w-[220px]" data-capsule-pkg>
            <span className="truncate">{fingerprint}</span>
            {copied
              ? <Check size={11} className="text-jz-teal flex-none" />
              : <Copy size={11} className="flex-none opacity-0 group-hover:opacity-60 transition-opacity" />}
          </button>
        )}
        {/* 目标硬件胶囊(型号优先于序列号,R103-1 接 devices.model/android)
            全平台升级 Step2①: 字号放大 13px + 可点击 → 「设备+Frida 状态浮层」 */}
        <div className="relative" data-capsule-device-wrap>
          <button type="button" onClick={() => setDevPop((v) => !v)} data-capsule-device data-capsule-device-clickable
 title="点击展开设备与 Frida 状态明细(数据源 /api/pentest/devices)"
 className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-pill bg-jz-surface-2 border border-transparent
 text-label font-mono text-jz-ink-2 hover:border-jz-brand/50 transition-colors max-w-[280px]">
            <Smartphone size={12} className={device?.online ? 'text-jz-teal' : 'text-jz-muted'} />
            <span className="truncate">
              {device?.serial
                ? `${device.model || device.serial}${device.android ? ` · Android ${device.android}` : ''} | ${device.online ? '在线' : '离线'}`
                : `${devices} 台在册`}
            </span>
          </button>
          <DeviceFridaFlyout open={devPop} onClose={() => setDevPop(false)} devices={liveDevices} />
        </div>
      </div>

      )}

      <span className="flex-1" />

      {/* R116: 全局刷新按钮(点击重新加载当前页面所有数据) */}
      <button onClick={() => window.location.reload()} data-topbar-refresh
 title="刷新当前页面数据"
 className="w-8 h-8 rounded-control flex items-center justify-center text-jz-ink-2 hover:text-jz-brand hover:bg-jz-surface-2/60 transition-colors">
        <RefreshCw size={15} />
      </button>

      {/* 右: 主题切换(Sun/Moon 平滑旋转动效,R103-1) */}
      <button onClick={toggle} data-theme-toggle title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
 className="w-8 h-8 rounded-control flex items-center justify-center text-jz-ink-2 hover:text-jz-brand hover:bg-jz-surface-2/60 transition-colors"
 aria-label="切换亮/暗主题">
        <span key={theme} className="theme-icon-swap inline-flex">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </span>
      </button>

      {/* R121: 通知中心铃铛(SSE 实时推送+下拉面板+新到浮卡;替代原静态「待办」气泡) */}
      <NotificationBell />

      {/* 设置快捷入口 */}
      <Link to="/system" className="w-8 h-8 rounded-control flex items-center justify-center text-jz-ink-2 hover:text-jz-brand hover:bg-jz-surface-2/60 transition-colors" title="系统设置">
        <Settings size={15} />
      </Link>

      {/* 管理员下拉菜单 */}
      <div className="relative" data-user-menu>
        <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-1 px-1 py-1 rounded-control hover:bg-jz-surface-2/60 transition-colors">
          <div className="w-7 h-7 rounded-pill bg-jz-brand flex items-center justify-center text-meta font-semibold text-jz-on-brand">
            {(me?.username || 'U').slice(0, 1).toUpperCase()}
          </div>
          <ChevronDown size={13} className="text-jz-muted" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-44 rounded-control bg-jz-surface shadow-card p-1 z-50" onMouseLeave={() => setMenuOpen(false)}>
            <div className="px-2.5 py-1.5 text-meta text-jz-muted border-b border-jz-border mb-1">
              {me?.username || '未登录'} · {me?.role || ''}
            </div>
            <button onClick={() => { setMenuOpen(false); window.location.hash = '/system'; }}
 className="w-full text-left px-2.5 py-1.5 rounded-control text-meta text-jz-ink-2 hover:bg-jz-surface-2/60">系统设置</button>
            <a href="/" className="block px-2.5 py-1.5 rounded-control text-meta text-jz-ink-2 hover:bg-jz-surface-2/60">回老版</a>
            <button onClick={() => { localStorage.removeItem('token'); window.location.hash = ''; window.location.reload(); }}
 className="w-full text-left px-2.5 py-1.5 rounded-control text-meta text-jz-sev-critical hover:bg-jz-sev-critical/10">退出登录</button>
          </div>
        )}
      </div>
    </header>
  );
};
