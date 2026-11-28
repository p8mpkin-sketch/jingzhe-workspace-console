// useKnowledgeReads.ts — the three first-load reads of /knowledge, each with its own state (Phase 8 readout.ts).
// Same requests as 777f03e: GET /api/skills, GET /api/kb/candidates (admins only, the backend's own gate),
// GET /api/tasks?limit=200. A failed candidate read is 未读取, never an empty list; a 403 is 无权限.
import { useCallback } from 'react';
import { useRead } from '@/features/dashboard/readout';
import type { Read } from '@/features/dashboard/readout';
import type { KBCandidate, SkillRow } from './knowledgeModel';

export type TaskOption = { id: number; app_name?: string; package?: string };

const pickSkills = (r: any): SkillRow[] => (Array.isArray(r) ? r : []);
const pickCands = (r: any): KBCandidate[] => (Array.isArray(r?.items) ? r.items : []);
const pickTasks = (r: any): TaskOption[] => (Array.isArray(r) ? r : []).filter((t: any) => t.kind === 'audit' && t.status === 'done' && t.result_id);

export function useKnowledgeReads(isAdmin: boolean): { skills: Read<SkillRow[]>; cands: Read<KBCandidate[]>; tasks: Read<TaskOption[]>; reloadAll: () => void } {
  const skills = useRead('/api/skills', pickSkills);
  const cands = useRead(isAdmin ? '/api/kb/candidates' : null, pickCands);
  const tasks = useRead('/api/tasks?limit=200', pickTasks);
  const reloadAll = useCallback(() => { skills.reload(); if (isAdmin) cands.reload(); }, [skills.reload, cands.reload, isAdmin]);
  return { skills, cands, tasks, reloadAll };
}
