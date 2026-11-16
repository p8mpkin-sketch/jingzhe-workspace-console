/**
 * Path of a decompiled class for GET /api/chat/source.
 * Manifest component names may be relative (".MainActivity"); Android resolves them against the
 * application package, so the same is done here before dots become slashes. Without it the path
 * starts with "/" and the backend refuses it as outside the decompiled tree (Phase 17 real-backend check).
 */
export function sourcePathFor(cls: string, pkg?: string | null): string {
  const full = cls.startsWith('.') && pkg ? pkg + cls : cls;
  return full ? full.split('.').join('/') + '.java' : '';
}
