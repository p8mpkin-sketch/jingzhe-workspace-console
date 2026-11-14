import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Target, ClipboardList, FilePlus, FileText, Bot, Building2,
  Sparkles, Activity, Smartphone, Radar, ChevronsLeft,
  ChevronsRight, LogOut,
} from 'lucide-react';
import { usePentest } from '@/stores/pentest';
// R95-UI: SSE 状态改由设备真值承载(R103-1: Frida 点接 /api/pentest/devices 真值,不再绑 SSE)
import { useAuth } from '@/stores/auth';
import { api } from '@/services/api';
// 全平台升级 Step2①: 目标设备卡可点击 → 「设备+Frida 状态浮层」(共享组件,数据=store 既有真值)
import { DeviceFridaFlyout } from './DeviceFridaFlyout';
import { useRouteChrome } from './routeChrome';

/** R95-UI: Sidebar 全高重构——h-screen sticky + flex-col justify-between 三段式:
 *  顶部品牌(惊蛰 JINGZHE 主图标 + 渐变高光 Badge) + 中部双分组导航
 *  (核心渗透/分析中心, 18px 图标 + 14px 标题 + 左侧 3px 指示条 + 呼吸微光)
 *  + 底部常驻工具区(设备健康迷你卡/引擎负载/用户头像/折叠钮)。
 *  R103-1: 底部小工具接真值——设备数/Frida 就绪数(store 共享,TopBar 单点轮询)、
 *  并发任务(/api/tasks-summary running);折叠钮接手动态,与 R52 会话页自动收折合并。 */

const GROUP_CORE = [
  { to: '/new-audit', icon: FilePlus, label: '新建审计' },
  { to: '/company', icon: Building2, label: '公司项目' },
  { to: '/pentest', icon: Target, label: 'AI自动化渗透' },
  { to: '/tasks', icon: ClipboardList, label: '任务中心' },
];
const GROUP_ANALYSIS = [
  { to: '/dashboard', icon: LayoutDashboard, label: '态势仪表盘' },
  { to: '/reports', icon: FileText, label: '报告中心' },
  { to: '/discovery', icon: Radar, label: '发现管线' },
  { to: '/skills', icon: Sparkles, label: '技能知识库' },
  { to: '/agent', icon: Bot, label: 'Agent 工作台' },
];
const BADGES: Record<string, string> = { '/system': 'admin' };

export const Sidebar: React.FC = () => {
 const workbench = usePentest((s) => s.workbench);
 const devices = usePentest((s) => s.devices); // R103-1: TopBar 8s 轮询写入的共享真值
 const location = useLocation();
 const navigate = useNavigate();
 const logout = () => { localStorage.removeItem('token'); navigate(0); };
 const me = useAuth((s) => s.me);
  // R103-1: 折叠= 会话页自动(R52 workbench)∨ 手动(本组件内);展开仅在非会话页提供,避免与 R52 互覆
  const [manual, setManual] = useState(false);
  const chrome = useRouteChrome();
  // Agent 页已有自己的会话栏，全局导航默认收成图标栏，避免双左栏挤压正文。
  const collapsed = workbench || (chrome.autoCollapseNav ? !manual : manual);
  // R103-1: 引擎负载真值(并发任务=running;内存无采集端点,不显示假条)
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
 // 全平台升级 Step2①: ①目标设备卡点击 → 设备+Frida 浮层;②引擎负载卡失败累计 N>0 → 可点击警示卡跳任务中心
  const [devPop, setDevPop] = useState(false);

  const groups = [
    { title: '核心渗透', items: GROUP_CORE },
    { title: '分析中心', items: GROUP_ANALYSIS },
  ];

  return (
    <nav data-nav-rail={collapsed ? 'collapsed' : 'full'}
 className="flex-none h-full sticky top-0 bg-jz-surface flex flex-col justify-between py-3 transition-all duration-300 overflow-hidden overflow-y-auto"
 style={{ scrollbarWidth: 'thin' }}>

      {/* 顶部: 品牌 Logo + 标题 + JINGZHE 渐变高光 Badge(品牌资产 /v2/brand 显式挂载路径) */}
      <div>
        <div className="flex items-center gap-2 px-3 mb-4">
          <img src="/v2/brand/icon.svg" alt="惊蛰" className="w-8 h-8 rounded-control flex-none" />
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <div className="font-display text-section font-semibold text-jz-ink whitespace-nowrap">惊蛰</div>
              <span className="font-mono text-meta font-medium text-jz-muted">JINGZHE</span>
            </div>
          )}
        </div>

        {/* 中部: 双分组导航(核心渗透/分析中心) */}
        <div className="space-y-4">
 {groups.map((g) => (
            <div key={g.title}>
              {!collapsed && (
                <div className="px-3 mb-1 text-meta font-semibold uppercase text-jz-muted">{g.title}</div>
              )}
              <div className="space-y-0.5 px-2">
 {g.items.map(({ to, icon: Icon, label }) => {
                  const active = location.pathname.startsWith(to);
                  return (
                    <NavLink key={to} to={to} title={collapsed ? label : undefined}
 className={({ isActive }) => `relative flex items-center gap-2.5 px-3 py-2 rounded-control text-body font-medium whitespace-nowrap transition-colors
 ${isActive
 ? 'text-jz-brand font-semibold bg-jz-brand/10 ring-1 ring-jz-brand/40'
 : 'text-jz-ink-2 hover:text-jz-ink hover:bg-jz-surface-2'}`}
 data-nav-item={to}>
                      <Icon size={18} className="flex-none" />
                      {!collapsed && <span className="truncate">{label}</span>}
                      {BADGES[to] && !collapsed && (
                        <span className="ml-auto text-meta font-mono text-jz-muted">{BADGES[to]}</span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 底部常驻小工具区(填充底部空白): 设备健康 / 引擎负载 / 用户头像 + 折叠钮 */}
      <div className="px-2 space-y-2">
        {!collapsed && (
          <>
            {/* 目标设备迷你健康卡(R103-1 真值: 已连接设备数 + Frida-Server 就绪数,数据=/api/pentest/devices)
                全平台升级 Step2①: 字号放大 13-14px + 可点击 → 「设备+Frida 状态浮层」 */}
            <div className="relative">
              <button type="button" onClick={() => setDevPop((v) => !v)} data-sidebar-devices data-devices-clickable
 title="点击展开设备与 Frida 状态明细(数据源 /api/pentest/devices)"
 className="w-full text-left rounded-card bg-jz-surface-2 hover:bg-jz-border/40 transition-colors p-2 space-y-1.5">
                <div className="flex items-center gap-1.5 text-label uppercase text-jz-muted">
                  <Smartphone size={13} /> 目标设备
                </div>
                <div className="flex items-center gap-1.5 text-label text-jz-ink-2 font-mono" data-sidebar-dev-count>
 {devCount > 0 ? `${devCount} 台已连接` : '无设备在册'}
                </div>
                <div className="flex items-center gap-1.5 text-body text-jz-ink-2" title="Frida-Server 就绪设备数">
                  <span className={`w-1.5 h-1.5 rounded-pill ${fridaOn > 0 ? 'bg-jz-teal' : 'bg-jz-muted'}`} data-frida-dot />
                  Frida 就绪 <span className="flex-1" /> <span className="font-mono tnum" data-sidebar-frida>{fridaOn}/{devCount}</span>
                </div>
              </button>
              <DeviceFridaFlyout open={devPop} onClose={() => setDevPop(false)} devices={devices} />
            </div>
 {/* 引擎负载微型指示器(R103-1 真值: 并发任务=running;内存后端无采集端点,不显示假条)
 全平台升级 Step2①: 失败累计 N>0 → 可点击警示卡(琥珀警示样式)→ /tasks?status=failed */}
            <button type="button"
 onClick={() => { window.location.hash = '/tasks?status=failed'; }}
 disabled={!(failedCnt ?? 0)}
 data-sidebar-load data-engine-load-clickable={((failedCnt ?? 0) > 0) ? 'warn' : 'off'}
 title={(failedCnt ?? 0) > 0
 ? `失败累计 ${failedCnt} 个任务——点击跳转任务中心查看失败明细(数据源 /api/tasks-summary)`
 : '数据源 /api/tasks-summary(30s 轮询);内存指标后端未采集,不显示假值;失败累计为 0 时不可点'}
 className={`w-full text-left rounded-card p-2 space-y-1 transition-colors
 ${(failedCnt ?? 0) > 0
 ? 'bg-jz-sev-medium/10 ring-1 ring-jz-sev-medium/40 hover:bg-jz-sev-medium/20 cursor-pointer'
 : 'bg-jz-surface-2 cursor-default'}`}>
              <div className="flex items-center gap-1.5 text-label uppercase text-jz-muted">
                <Activity size={13} /> 引擎负载
 {(failedCnt ?? 0) > 0 && <span className="ml-auto px-1.5 rounded-control text-meta font-mono bg-jz-sev-medium/15 text-jz-sev-medium" data-engine-fail-badge>⚠ 点击处理</span>}
              </div>
              <div className="flex items-center gap-1.5 text-label text-jz-ink-2">
                并发任务 <span className="flex-1" />
                <span className={`font-mono tnum ${running ? 'text-jz-brand' : 'text-jz-muted'}`} data-engine-running>{running ?? '—'}</span>
              </div>
              <div className={`text-label font-mono ${((failedCnt ?? 0) > 0) ? 'text-jz-sev-medium font-semibold' : 'text-jz-muted'}`}>失败累计 <span className="tnum" data-engine-failed>{failedCnt ?? '—'}</span></div>
            </button>
          </>
        )}
        {/* 用户头像信息 + 折叠收缩按钮 */}
        <div className="rounded-card bg-jz-surface-2 p-2 flex items-center gap-2">
          <div className="w-7 h-7 rounded-pill bg-jz-brand flex items-center justify-center text-meta font-semibold text-jz-on-brand flex-none">
            {(me?.username || 'U').slice(0, 1).toUpperCase()}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <div className="text-meta font-medium text-jz-ink truncate">{me?.username || '未登录'}</div>
                <div className="text-meta text-jz-muted truncate">{me?.role || ''}</div>
              </div>
              <button onClick={logout}
 title="退出登录" className="text-jz-muted hover:text-jz-sev-critical"><LogOut size={14} /></button>
            </>
          )}
        </div>
        {/* 折叠收缩按钮(R103-1: 非会话页可手动收/展;会话页保持 R52 自动收折图标轨,不互覆) */}
        {workbench ? (
          <div className="flex items-center justify-center pt-1 text-jz-muted" data-nav-collapse="auto">
            <ChevronsRight size={14} />
          </div>
        ) : (
          <button onClick={() => setManual((m) => !m)} data-nav-collapse={manual ? 'expand' : 'collapse'}
 title={manual ? '展开侧边栏' : '收起侧边栏'}
 className="w-full flex items-center justify-center gap-1 py-1 rounded-control text-jz-muted hover:bg-jz-surface-2/60 hover:text-jz-ink transition-colors">
            {manual ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
            {!collapsed && <span className="text-meta font-mono ml-1" data-app-version>{__APP_VERSION__}</span>}
          </button>
        )}
      </div>
    </nav>
  );
};
