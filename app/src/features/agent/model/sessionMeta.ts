import type { AgentSession } from '../types';

export type SessionKind = 'task' | 'test' | 'quick' | 'agent';

export interface SessionMeta {
  id: string;
  kind: SessionKind;
  taskId?: number | null;
  titleSource: 'task' | 'user' | 'system';
}

/** Single fallback point for legacy sessions without explicit backend kind. */
export function sessionMeta(s: AgentSession): SessionMeta {
  const explicit = s.kind as SessionKind | undefined;
  if (explicit && ['task', 'test', 'quick', 'agent'].includes(explicit)) {
    return { id: s.id, kind: explicit, taskId: s.task_id, titleSource: explicit === 'task' ? 'task' : 'system' };
  }
  if (s.mode === 'quick') return { id: s.id, kind: 'quick', taskId: s.task_id, titleSource: 'system' };
  if (s.task_id != null || /^任务 #\d+/.test(String(s.title || ''))) {
    return { id: s.id, kind: 'task', taskId: s.task_id, titleSource: 'task' };
  }
  return { id: s.id, kind: 'agent', taskId: s.task_id, titleSource: 'system' };
}

export function isTestSession(s: AgentSession): boolean {
  return sessionMeta(s).kind === 'test';
}
