import React from 'react';

/**
 * Route-level code splitting. Every page is its own chunk; the shell (rail, top bar, palette) is the only eager
 * code. `preloadRoute` lets the rail start a page's download on hover or focus, so the fallback rarely shows.
 */
type Loader = () => Promise<{ default: React.ComponentType<any> }>;

const LOADERS = {
  dashboard: () => import('@/features/dashboard/DashboardPage'),
  projects: () => import('@/features/projects/ProjectsPage'),
  project: () => import('@/features/projects/ProjectDetailPage'),
  session: () => import('@/features/pentest/v3/SessionShell').then((m) => ({ default: m.SessionShell })),
  tasks: () => import('@/features/tasks/TaskListPage').then((m) => ({ default: m.TaskListPage })),
  taskDetail: () => import('@/features/tasks/TaskDetailPage').then((m) => ({ default: m.TaskDetailPage })),
  newAssessment: () => import('@/features/new-audit/NewAuditPage').then((m) => ({ default: m.NewAuditPage })),
  reports: () => import('@/features/reports/ReportCenterPage').then((m) => ({ default: m.ReportCenterPage })),
  evidence: () => import('@/features/evidence/EvidencePage'),
  knowledge: () => import('@/features/knowledge/KnowledgePage'),
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
