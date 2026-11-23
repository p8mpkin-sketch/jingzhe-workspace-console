import { useEffect } from 'react';
import { create } from 'zustand';
import { moduleLabel, ownerPath } from './navigation';

/**
 * Breadcrumb = where you are, nothing else. The trail is derived from the pathname; a page that knows the name of
 * its object (project, session, task) publishes it with `useCrumbName`, otherwise the id is shown.
 * Facts about the object (package, device, status) belong to the page header, not here.
 */
interface CrumbState { names: Record<string, string>; setName: (path: string, name: string) => void }
export const useCrumbs = create<CrumbState>((set) => ({
  names: {},
  setName: (path, name) => set((s) => (s.names[path] === name ? s : { names: { ...s.names, [path]: name } })),
}));

/** Publish the visible name of the object at `path` (for example `/projects/3` → the project's name). */
export function useCrumbName(path: string | null | undefined, name: string | null | undefined): void {
  const setName = useCrumbs((s) => s.setName);
  useEffect(() => { if (path && name) setName(path, name); }, [path, name, setName]);
}

export interface Crumb { label: string; to?: string; mono?: boolean }

export function buildCrumbs(pathname: string, names: Record<string, string>): Crumb[] {
  const seg = pathname.split('/').filter(Boolean);
  const root: Crumb = { label: moduleLabel(pathname), to: ownerPath(pathname) };
  const named = (path: string, fallback: string): Crumb => (names[path] ? { label: names[path], to: path } : { label: fallback, to: path, mono: true });
  // /projects/:pid and /projects/:pid/sessions/:sid
  if (seg[0] === 'projects' && seg[1]) {
    const out = [root, named(`/projects/${seg[1]}`, `#${seg[1]}`)];
    if (seg[2] === 'sessions' && seg[3]) out.push(named(pathname, `会话 #${seg[3]}`));
    return out;
  }
  if (seg[0] === 'tasks' && seg[1]) return [root, named(pathname, `#${seg[1]}`)];
  return [{ label: root.label }];
}
