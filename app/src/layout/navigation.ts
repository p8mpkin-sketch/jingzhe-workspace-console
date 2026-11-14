import {
  LayoutDashboard, Target, ClipboardList, FilePlus, FileText, Bot, Building2, Sparkles, Radar, Settings, MessagesSquare,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** The one list of destinations and their visible names. The rail, the breadcrumb and the command palette read it,
 *  so a page is called the same thing everywhere. Paths are the existing routes and never change here. */
export interface NavEntry { to: string; label: string; icon: LucideIcon }

export const NAV_GROUPS: Array<{ title: string; items: NavEntry[] }> = [
  {
    title: '工作区',
    items: [
      { to: '/new-audit', icon: FilePlus, label: '新建评估' },
      { to: '/company', icon: Building2, label: '公司项目' },
      { to: '/pentest', icon: Target, label: '评估项目' },
      { to: '/tasks', icon: ClipboardList, label: '任务' },
    ],
  },
  {
    title: '分析',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: '概览' },
      { to: '/reports', icon: FileText, label: '报告' },
      { to: '/discovery', icon: Radar, label: '发现' },
      { to: '/skills', icon: Sparkles, label: '知识' },
      { to: '/agent', icon: Bot, label: 'Agent' },
    ],
  },
];

/** Routes that exist but are reached from the top bar or the command palette, not from the rail. */
export const NAV_EXTRA: NavEntry[] = [
  { to: '/system', icon: Settings, label: '系统' },
  { to: '/ai-assistant', icon: MessagesSquare, label: 'AI 助手（归档）' },
];

export const NAV_ALL: NavEntry[] = [...NAV_GROUPS.flatMap((g) => g.items), ...NAV_EXTRA];

/** Visible name of the module a pathname belongs to; the overview is the fallback, as the router's catch-all is. */
export function moduleLabel(pathname: string): string {
  const first = `/${pathname.split('/')[1] || ''}`;
  return NAV_ALL.find((n) => n.to === first)?.label || '概览';
}
