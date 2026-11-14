import React, { Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import { usePentest } from '@/stores/pentest';
import { api } from '@/services/api';
import { TopBar } from '@/layout/TopBar';
import { Sidebar } from '@/layout/Sidebar';
import { AiSidebar } from '@/layout/AiSidebar';
import { ProjectsPage, ProjectSessionsPage } from '@/features/pentest/PentestPages';
import { TaskCenterPage } from '@/features/tasks/TaskCenterPage';
import { NewAuditPage } from '@/features/new-audit/NewAuditPage';
import { AiAssistantPage } from '@/features/ai-assistant/AiAssistantPage';
import { AgentPage } from '@/features/agent/AgentPage';
import { SystemPage } from '@/features/system/SystemPage';
import { SkillsPage } from '@/features/skills/SkillsPage';
import { ReportCenterPage } from '@/features/reports/ReportCenterPage';
import { DiscoveryPage } from '@/features/discovery/DiscoveryPage';
import { CompanyProjectsPage } from '@/features/company/CompanyProjectsPage';
import { CompanyProjectDetailPage } from '@/features/company/CompanyProjectDetailPage';
import { LoginGate } from './LoginGate';
import { ErrorBoundary } from '@/components/ErrorBoundary';
// UI 2.0 阶段A: SessionShell = V3 对话主线 / V2 经典版 切换壳(localStorage apksec-ui-v3 + ?ui= 深链),
// V2 组件本体零改动(并行会话防覆盖: 本轮共享文件仅此两行接线)
import { SessionShell } from '@/features/pentest/v3/SessionShell';
import { CmdPalette } from '@/components/CmdPalette';
import { RefreshCw } from 'lucide-react';
import { useNotifications } from '@/stores/notifications';
// R104-7 收口: R104-1 临时组件展示路由 /dev/ui-kit 已删除(四组件以业务页消费点为验收载体)。
// R108-4 收口: R108-1 临时组件三态展示页 /dev/ui-kit2 已删除(三件套以业务页消费点为验收载体)。

const DashboardPage = React.lazy(() => import('@/features/dashboard/DashboardPage'));

function PentestFlow() {
  const sid = Number(useParams().sid || 0);
  const setSid = usePentest((s) => s.setSid);
  const connect = usePentest((s) => s.connectStream);
  const setWorkbench = usePentest((s) => s.setWorkbench);
  const setProjectId = usePentest((s) => s.setProjectId);
  useEffect(() => { if (sid) { setSid(sid); connect('hook'); } }, [sid]);
  // R52 P0-3: 进入会话 → 工作台模式(导航收折+环境感知条);退出恢复
  useEffect(() => { setWorkbench(true); return () => setWorkbench(false); }, []);
  // R79-2 勘误: 会话无 project_id 时必须清零 store pid——否则上一会话的 pid 残留,
  // 无归属会话会误用他项目 id 跳转(R79 实测: sid29→sid40 残留 pid=2)
  useEffect(() => { if (sid) { api(`/api/pentest/sessions/${sid}`).then((d: any) => { setProjectId(d?.project_id ?? null); }).catch(() => {}); } }, [sid]);
  return (
    // R105-2(指令2): 千层饼(DockView 九面板)→ IDE 三区骨架(复合顶栏 46px/主视口 Tab 化/底部 Dock+右抽屉)
    // EnvBar 语义并入骨架顶栏(组件/门控/数据源不变);R52 workbench 收折语义、R76-5 ?tab=vulns 深链照旧
    <SessionShell />
  );
}


function BuildVersionGuard() {
  const [stale, setStale] = React.useState(false);
  React.useEffect(() => {
    const cur = [...document.querySelectorAll('script[src]')]
      .map((s) => s.getAttribute('src') || '')
      .find((s) => s.includes('index-'));
    let dead = false;
    const check = async () => {
      try {
        const html = await fetch('/v2/', { cache: 'no-store' }).then((r) => r.text());
        const m = html.match(/assets\/index-[^"]+\.js/);
        if (!dead && cur && m && !cur.includes(m[0])) setStale(true);
      } catch { /* 网络瞬断静默,下轮再查 */ }
    };
    check();
    const iv = setInterval(check, 60000);
    return () => { dead = true; clearInterval(iv); };
  }, []);
  if (!stale) return null;
  return (
    <div data-app-stale className="fixed bottom-4 right-4 z-[100] flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-jz-surface shadow-jz-card border border-jz-border/60">
      <RefreshCw className="w-4 h-4 text-jz-accent-cyan flex-none" />
      <span className="text-xs text-jz-text-secondary">平台已发布新版本,当前页面运行的是旧代码</span>
      <button onClick={() => { const sep = location.search ? '&' : '?'; const h = location.hash; location.href = location.pathname + sep + '_v=' + Date.now() + h; }}
        className="px-2.5 py-1 rounded-lg bg-jz-accent-cyan/10 text-jz-accent-cyan text-xs font-semibold hover:bg-jz-accent-cyan/20 transition-colors">
        一键刷新
      </button>
    </div>
  );
}

function Shell() {
  // R101(用户裁定): 「AI 决策助手」栏只在渗透会话工作台渲染——它按会话聚合 Agent 决策时间线,
  // 在仪表盘等无会话页面=静态 IDLE 死占位(kimi 问题②的全局解)。AI 助手页 R100-3 亦被本白名单覆盖。
  const { pathname } = useLocation();
  const onSessionPage = /^\/pentest\/project\/[^/]+\/session\/[^/]+/.test(pathname);
  // R121: 通知中心 SSE——Shell 只在登录态渲染,挂载即连/卸载即断;token 变化(重登)自动重连
  const token = useAuth((s) => s.token);
  const connectNotif = useNotifications((s) => s.connect);
  const disconnectNotif = useNotifications((s) => s.disconnect);
  useEffect(() => {
    if (token) connectNotif();
    return () => disconnectNotif();
  }, [token]);
  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <CmdPalette />
      <BuildVersionGuard />
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Suspense fallback={<div className="p-4 text-xs text-jz-text-muted">加载中…</div>}><DashboardPage /></Suspense>} />
            <Route path="/pentest" element={<ProjectsPage />} />
            <Route path="/pentest/project/:pid" element={<ProjectSessionsPage />} />
            <Route path="/pentest/project/:pid/session/:sid" element={<PentestFlow />} />
            <Route path="/tasks" element={<TaskCenterPage />} />
            <Route path="/new-audit" element={<NewAuditPage />} />
            <Route path="/reports" element={<ReportCenterPage />} />
            <Route path="/company" element={<CompanyProjectsPage />} />
            <Route path="/company/projects/:pid" element={<CompanyProjectDetailPage />} />
            <Route path="/discovery" element={<DiscoveryPage />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route path="/ai-assistant" element={<AiAssistantPage />} />
            <Route path="/agent" element={<AgentPage />} />
            <Route path="/system" element={<SystemPage />} />
            {/* R47 P0-2: catch-all——已退役旧路由的旧书签直接跳 dashboard,不再白屏 */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </ErrorBoundary>
        </main>
        {/* R105-5: 会话页 AI 栏由工作台右抽屉 AiInspectorDrawer 接管(双 Tab=决策助手+对象检查器,
            380↔36 双态=R101 契约载体迁移;防双右栏叠加)。完整对话助手入口保留 /ai-assistant 页
            (R100 身份行/R103-12 会话分组/R80 Token 契约在该页零回归)。 */}
        {false && onSessionPage && <AiSidebar />}
      </div>
    </div>
  );
}

import { useParams } from 'react-router-dom';

export default function App() {
  const ready = useAuth((s) => s.ready);
  const token = useAuth((s) => s.token);
  const bootstrap = useAuth((s) => s.bootstrap);
  useEffect(() => { bootstrap(); }, []);
  if (!ready) return <div />;
  if (!token) return <LoginGate />;
  return <Shell />;
}
