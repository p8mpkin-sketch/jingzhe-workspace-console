import React from 'react';

/**
 * Route-level code splitting. Every page is its own chunk; the shell (rail, top bar, palette) is the only eager
 * code. `preloadRoute` lets the rail start a page's download on hover or focus, so the fallback rarely shows.
 */
type Loader = () => Promise<{ default: React.ComponentType<any> }>;

const LOADERS = {
  dashboard: () => import('@/features/dashboard/DashboardPage'),
  projects: () => import('@/features/company/CompanyProjectsPage').then((m) => ({ default: m.CompanyProjectsPage })),
  project: () => import('@/features/company/CompanyProjectDetailPage').then((m) => ({ default: m.CompanyProjectDetailPage })),
  // Pre-merge assessment project pages: alive at their old paths until Phase 2 gives their capabilities a new owner.
  legacyProjects: () => import('@/features/pentest/PentestPages').then((m) => ({ default: m.ProjectsPage })),
  legacyProjectSessions: () => import('@/features/pentest/PentestPages').then((m) => ({ default: m.ProjectSessionsPage })),
  session: () => import('@/features/pentest/v3/SessionShell').then((m) => ({ default: m.SessionShell })),
  tasks: () => import('@/features/tasks/TaskCenterPage').then((m) => ({ default: m.TaskCenterPage })),
  newAssessment: () => import('@/features/new-audit/NewAuditPage').then((m) => ({ default: m.NewAuditPage })),
  reports: () => import('@/features/reports/ReportCenterPage').then((m) => ({ default: m.ReportCenterPage })),
  evidence: () => import('@/features/discovery/DiscoveryPage').then((m) => ({ default: m.DiscoveryPage })),
  knowledge: () => import('@/features/skills/SkillsPage').then((m) => ({ default: m.SkillsPage })),
  archive: () => import('@/features/ai-assistant/AiAssistantPage').then((m) => ({ default: m.AiAssistantPage })),
  agent: () => import('@/features/agent/AgentPage').then((m) => ({ default: m.AgentPage })),
  system: () => import('@/features/system/SystemPage').then((m) => ({ default: m.SystemPage })),
} satisfies Record<string, Loader>;

export type RouteKey = keyof typeof LOADERS;

export const PAGES = Object.fromEntries(
  Object.entries(LOADERS).map(([k, load]) => [k, React.lazy(load as Loader)]),
) as Record<RouteKey, React.LazyExoticComponent<React.ComponentType<any>>>;

const BY_PATH: Record<string, RouteKey> = {
  '/dashboard': 'dashboard', '/projects': 'projects', '/tasks': 'tasks', '/evidence': 'evidence', '/reports': 'reports',
  '/knowledge': 'knowledge', '/agent': 'agent', '/new-assessment': 'newAssessment', '/system': 'system', '/ai-assistant': 'archive',
};
const started = new Set<RouteKey>();

/** Start downloading the chunk behind a rail destination. Safe to call repeatedly; failures are left to the route itself. */
export function preloadRoute(path: string): void {
  const key = BY_PATH[path];
  if (!key || started.has(key)) return;
  started.add(key);
  (LOADERS[key] as Loader)().catch(() => { started.delete(key); });
}
