import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';

/**
 * Permanent redirect from a pre-V3 path to its canonical route. The query string and hash fragment of the old link
 * are forwarded untouched, so deep links (`?view=`, `?tab=`, `?masvs=`, `?focus=` …) written by bookmarks, by
 * notifications or by the backend keep working. `add` supplies defaults that the incoming link may override.
 */
export const Redirect: React.FC<{
  to: string | ((params: Record<string, string | undefined>) => string);
  add?: Record<string, string>;
}> = ({ to, add }) => {
  const params = useParams();
  const { search, hash } = useLocation();
  const path = typeof to === 'function' ? to(params) : to;
  const qs = new URLSearchParams(search);
  if (add) for (const [k, v] of Object.entries(add)) if (!qs.has(k)) qs.set(k, v);
  const s = qs.toString();
  return <Navigate to={{ pathname: path, search: s ? `?${s}` : '', hash }} replace />;
};

/** `/tasks?status=degraded` was a pseudo-status; V3 spells it as a filter on completed tasks. */
export function canonicalTaskSearch(search: string): string | null {
  const qs = new URLSearchParams(search);
  if (qs.get('status') !== 'degraded') return null;
  qs.set('status', 'done');
  qs.set('partial', '1');
  return `?${qs.toString()}`;
}
