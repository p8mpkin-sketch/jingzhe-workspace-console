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
// SessionShell renders the six-tab workbench; the legacy ?ui=v3 / ?ui=v2 shells were retired in Phase 17.
import { SessionShell } from '@/features/pentest/v3/SessionShell';
import { CmdPalette } from '@/components/CmdPalette';
import { RefreshCw } from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';
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
    <div data-app-stale role="status" className="fixed bottom-4 right-4 z-[100] flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-3 rounded-card border border-jz-border bg-jz-surface px-4 py-3 shadow-dialog">
      <RefreshCw className="h-4 w-4 flex-none text-jz-brand" aria-hidden />
      <span className="min-w-0 flex-1 basis-48 text-label text-jz-ink">工作区已发布新版本，此页面仍在运行旧版本。</span>
      <Button size="sm" onClick={() => { const sep = location.search ? '&' : '?'; const h = location.hash; location.href = location.pathname + sep + '_v=' + Date.now() + h; }}>
        刷新页面
      </Button>
    </div>
  );
}

/** Placeholder while a lazy route or the session check loads. */
function PageFallback() {
  return (
    <div className="space-y-4 p-jz-page" role="status" aria-label="正在加载">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
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
  const [navOpen, setNavOpen] = React.useState(false);
  return (
    <div className="flex h-full">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[110] focus:rounded-control focus:bg-jz-surface focus:px-3 focus:py-2 focus:text-label focus:text-jz-ink focus:shadow-dialog">
        跳到主要内容
      </a>
      <Sidebar mobileOpen={navOpen} onMobileClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenNav={() => setNavOpen(true)} />
        <CmdPalette />
        <BuildVersionGuard />
        <main id="main" tabIndex={-1} className="flex min-h-0 min-w-0 flex-1 flex-col outline-none">
          <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Suspense fallback={<PageFallback />}><DashboardPage /></Suspense>} />
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
      </div>
      {/* Session pages show the assistant in the workspace's own right drawer; the global side panel stays off. */}
      {false && onSessionPage && <AiSidebar />}
    </div>
  );
}

import { useParams } from 'react-router-dom';

export default function App() {
  const ready = useAuth((s) => s.ready);
  const token = useAuth((s) => s.token);
  const bootstrap = useAuth((s) => s.bootstrap);
  useEffect(() => { bootstrap(); }, []);
  if (!ready) return <PageFallback />;
  if (!token) return <LoginGate />;
  return <Shell />;
}
