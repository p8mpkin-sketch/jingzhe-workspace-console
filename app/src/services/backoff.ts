// Reconnect pacing shared by every stream the app keeps open (agent events, notifications).
// Exponential backoff with jitter, capped; the delay only resets once a connection has proven itself
// (it delivered data, or stayed open for `stableMs`), so a server that accepts and immediately closes
// is still backed off. While the tab is hidden nothing reconnects; it resumes when the tab is shown.

export interface Backoff {
  /** Delay before the next attempt, in ms; each call escalates. */
  next(): number;
  /** The connection opened. The delay resets after it has stayed open for `stableMs`. */
  opened(): void;
  /** The connection delivered data: reset now. */
  alive(): void;
  /** The connection ended (cancels the pending "stayed open" reset). */
  closed(): void;
  reset(): void;
  readonly attempt: number;
}

export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_CAP_MS = 30_000;
export const BACKOFF_STABLE_MS = 5_000;

export function createBackoff(opts: { base?: number; cap?: number; stableMs?: number } = {}): Backoff {
  const base = opts.base ?? BACKOFF_BASE_MS;
  const cap = opts.cap ?? BACKOFF_CAP_MS;
  const stableMs = opts.stableMs ?? BACKOFF_STABLE_MS;
  let attempt = 0;
  let stable: ReturnType<typeof setTimeout> | undefined;
  const closed = () => { if (stable) { clearTimeout(stable); stable = undefined; } };
  const reset = () => { closed(); attempt = 0; };
  return {
    next() {
      const ceiling = Math.min(cap, base * 2 ** attempt);
      attempt += 1;
      // Equal jitter: half fixed, half random, so clients spread out but never retry instantly.
      return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
    },
    opened() { closed(); stable = setTimeout(() => { attempt = 0; stable = undefined; }, stableMs); },
    alive: reset,
    closed,
    reset,
    get attempt() { return attempt; },
  };
}

/**
 * Run `fn` after the backoff delay. If the tab is hidden when the delay ends (or already is), wait until it
 * becomes visible and run then. Returns a cancel function.
 */
export function scheduleReconnect(backoff: Backoff, fn: () => void): () => void {
  backoff.closed();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waiting = false;
  const onVisible = () => {
    if (document.hidden) return;
    document.removeEventListener('visibilitychange', onVisible);
    waiting = false;
    fn();
  };
  timer = setTimeout(() => {
    timer = undefined;
    if (typeof document !== 'undefined' && document.hidden) { waiting = true; document.addEventListener('visibilitychange', onVisible); }
    else fn();
  }, backoff.next());
  return () => {
    if (timer) clearTimeout(timer);
    if (waiting) document.removeEventListener('visibilitychange', onVisible);
  };
}
