import React, { Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/stores/auth';
import { usePentest } from '@/stores/pentest';
import { api } from '@/services/api';
import { TopBar } from '@/layout/TopBar';
import { Sidebar } from '@/layout/Sidebar';
import { Redirect, canonicalTaskSearch } from '@/layout/redirects';
import { useDevicePoll } from '@/layout/useDevicePoll';
import { PATHS } from '@/layout/navigation';
import { LoginGate } from './LoginGate';
import { PAGES } from './routes';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CmdPalette } from '@/components/CmdPalette';
import { RefreshCw } from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';
import { useNotifications } from '@/stores/notifications';

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
    <PAGES.session />
  );
}

/** `/tasks` with the retired pseudo-status `degraded` is rewritten to its V3 spelling; everything else renders the page. */
function TasksRoute() {
  const { search } = useLocation();
  const next = canonicalTaskSearch(search);
  if (next) return <Navigate to={{ pathname: PATHS.tasks, search: next }} replace />;
  return <PAGES.tasks />;
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
  // Notification stream: connected while signed in, reconnected when the token changes.
  const token = useAuth((s) => s.token);
  const connectNotif = useNotifications((s) => s.connect);
  const disconnectNotif = useNotifications((s) => s.disconnect);
  useEffect(() => {
    if (token) connectNotif();
    return () => disconnectNotif();
  }, [token]);
  useDevicePoll();
  const [navOpen, setNavOpen] = React.useState(false);
  const { pathname } = useLocation();
  return (
    <div className="flex h-full">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[110] focus:rounded-control focus:bg-jz-overlay focus:px-3 focus:py-2 focus:text-label focus:text-jz-ink focus:shadow-dialog">
        跳到主要内容
      </a>
      <Sidebar mobileOpen={navOpen} onMobileClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenNav={() => setNavOpen(true)} />
        <CmdPalette />
        <BuildVersionGuard />
        <main id="main" tabIndex={-1} className="flex min-h-0 min-w-0 flex-1 flex-col outline-none">
          <ErrorBoundary>
          {/* Keyed by the first path segment: moving between modules fades the content in, moving inside one does not remount it. */}
          <Suspense fallback={<PageFallback />}>
          <div key={pathname.split('/')[1] || ''} className="route-in flex min-h-0 min-w-0 flex-1 flex-col" data-route>
          <Routes>
            <Route path="/" element={<Navigate to={PATHS.dashboard} replace />} />
            <Route path="/dashboard" element={<PAGES.dashboard />} />
            <Route path="/projects" element={<PAGES.projects />} />
            <Route path="/projects/:pid" element={<PAGES.project />} />
            <Route path="/projects/:pid/sessions/:sid" element={<PentestFlow />} />
            <Route path="/tasks" element={<TasksRoute />} />
            <Route path="/evidence" element={<PAGES.evidence />} />
            <Route path="/reports" element={<PAGES.reports />} />
            <Route path="/knowledge" element={<PAGES.knowledge />} />
            <Route path="/agent" element={<PAGES.agent />} />
            <Route path="/new-assessment" element={<PAGES.newAssessment />} />
            <Route path="/system" element={<PAGES.system />} />
            <Route path="/ai-assistant" element={<PAGES.archive />} />

            {/* Pre-V3 paths. Permanent redirects; the query string is forwarded (layout/redirects.tsx). */}
            <Route path="/company" element={<Redirect to={PATHS.projects} add={{ scope: 'company' }} />} />
            <Route path="/company/projects/:pid" element={<Redirect to={(p) => PATHS.project(p.pid || '')} />} />
            <Route path="/pentest/project/:pid/session/:sid" element={<Redirect to={(p) => PATHS.session(p.pid || 0, p.sid || '')} />} />
            <Route path="/new-audit" element={<Redirect to={PATHS.newAssessment} />} />
            <Route path="/skills" element={<Redirect to={PATHS.knowledge} />} />
            <Route path="/discovery" element={<Redirect to={PATHS.evidence} />} />
            {/* Assessment project index and its sessions page stay at their old paths until Phase 2 merges them into /projects. */}
            <Route path="/pentest" element={<PAGES.legacyProjects />} />
            <Route path="/pentest/project/:pid" element={<PAGES.legacyProjectSessions />} />

            {/* Unknown paths (retired routes, old bookmarks) land on the overview instead of a blank page. */}
            <Route path="*" element={<Navigate to={PATHS.dashboard} replace />} />
          </Routes>
          </div>
          </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const ready = useAuth((s) => s.ready);
  const token = useAuth((s) => s.token);
  const bootstrap = useAuth((s) => s.bootstrap);
  useEffect(() => { bootstrap(); }, []);
  if (!ready) return <PageFallback />;
  if (!token) return <LoginGate />;
  return <Shell />;
}
