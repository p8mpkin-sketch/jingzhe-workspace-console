import {
  LayoutDashboard, FolderKanban, ListChecks, FileText, Bot, BookOpen, Waypoints, Settings, Archive, Plus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The one list of destinations and their visible names (V3). The rail, the breadcrumb, the command palette and
 * every page title read it, so a place is called the same thing everywhere.
 *
 * Seven destinations. "新建评估" is the global primary action, not a destination; "系统" and the assistant
 * archive are reached from the account menu and the palette.
 */
export interface NavEntry { to: string; label: string; icon: LucideIcon; hint?: string }

/** Canonical paths. Old paths redirect here (layout/redirects.tsx); nothing else in the app spells a route by hand. */
export const PATHS = {
  dashboard: '/dashboard',
  projects: '/projects',
  project: (pid: number | string) => `/projects/${pid}`,
  session: (pid: number | string, sid: number | string) => `/projects/${pid || 0}/sessions/${sid}`,
  tasks: '/tasks',
  task: (id: number | string) => `/tasks/${id}`,
  evidence: '/evidence',
  reports: '/reports',
  knowledge: '/knowledge',
  agent: '/agent',
  newAssessment: '/new-assessment',
  system: '/system',
  archive: '/ai-assistant',
} as const;

export const NAV_PRIMARY: NavEntry[] = [
  { to: PATHS.dashboard, icon: LayoutDashboard, label: '概览' },
  { to: PATHS.projects, icon: FolderKanban, label: '项目' },
  { to: PATHS.tasks, icon: ListChecks, label: '任务' },
  { to: PATHS.evidence, icon: Waypoints, label: '证据' },
  { to: PATHS.reports, icon: FileText, label: '报告' },
  { to: PATHS.knowledge, icon: BookOpen, label: '知识' },
  { to: PATHS.agent, icon: Bot, label: 'Agent' },
];

/** The global primary action. Shown as a button in the rail, on the phone top bar and first in the palette. */
export const NAV_ACTION: NavEntry = { to: PATHS.newAssessment, icon: Plus, label: '新建评估' };

/** Routes that exist but are reached from the account menu or the command palette, not from the rail. */
export const NAV_EXTRA: NavEntry[] = [
  { to: PATHS.system, icon: Settings, label: '系统' },
  { to: PATHS.archive, icon: Archive, label: 'AI 助手归档' },
];

export const NAV_ALL: NavEntry[] = [...NAV_PRIMARY, NAV_ACTION, ...NAV_EXTRA];

/** Sub-scopes of a destination. The palette lists them under the same words the page tabs use. */
export const NAV_SCOPES: Array<{ to: string; label: string; parent: string }> = [
  { parent: '项目', label: '公司级', to: `${PATHS.projects}?scope=company` },
  { parent: '项目', label: '单应用', to: `${PATHS.projects}?scope=single` },
  { parent: '任务', label: '运行中', to: `${PATHS.tasks}?status=running` },
  { parent: '任务', label: '排队', to: `${PATHS.tasks}?status=queued` },
  { parent: '任务', label: '失败', to: `${PATHS.tasks}?status=failed` },
  { parent: '任务', label: '已完成', to: `${PATHS.tasks}?status=done` },
  { parent: '报告', label: '项目报告', to: `${PATHS.reports}?scope=project` },
  { parent: '报告', label: '会话报告', to: `${PATHS.reports}?scope=session` },
  { parent: '报告', label: '单应用报告', to: `${PATHS.reports}?scope=app` },
  { parent: '知识', label: '候选审核', to: `${PATHS.knowledge}?tab=review` },
  { parent: '系统', label: '模型', to: `${PATHS.system}?tab=models` },
  { parent: '系统', label: '运行', to: `${PATHS.system}?tab=runtime` },
  { parent: '系统', label: '设备', to: `${PATHS.system}?tab=devices` },
  { parent: '系统', label: '诊断', to: `${PATHS.system}?tab=diagnostics` },
  { parent: '系统', label: '审计日志', to: `${PATHS.system}?tab=audit` },
  { parent: '系统', label: '用户与权限', to: `${PATHS.system}?tab=users` },
  { parent: '系统', label: 'API Token', to: `${PATHS.system}?tab=tokens` },
];

/** First path segment → destination. Old segments are listed so a page that still asks by its old path gets the V3 name. */
const SEGMENT: Record<string, string> = {
  dashboard: '概览', projects: '项目', pentest: '项目', company: '项目', tasks: '任务', evidence: '证据', discovery: '证据',
  reports: '报告', knowledge: '知识', skills: '知识', agent: 'Agent', 'new-assessment': '新建评估', 'new-audit': '新建评估',
  system: '系统', 'ai-assistant': 'AI 助手归档',
};

/** Visible name of the module a pathname belongs to; the overview is the fallback, as the router's catch-all is. */
export function moduleLabel(pathname: string): string {
  return SEGMENT[pathname.split('/')[1] || ''] || '概览';
}

/** Path of the rail item that owns a pathname (a session belongs to 项目, a task detail to 任务). */
export function ownerPath(pathname: string): string {
  const label = moduleLabel(pathname);
  return NAV_ALL.find((n) => n.label === label)?.to || PATHS.dashboard;
}
