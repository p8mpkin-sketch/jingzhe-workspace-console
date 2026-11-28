// State of the composer: the draft, its context chips, the inline menu, the send round trip and its failure.
// Context chips never add a field to the request: they are written as quoted lines at the top of the message.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { api } from '@/services/api';

export interface ContextChip { key: string; kind: 'session' | 'finding' | 'request' | 'task'; label: string; /** The quoted line. */ text: string; fixed?: boolean }
export interface ComposerCommand { id: string; label: string; hint: string; /** Why the command cannot run now. */ disabled?: string; run: () => void }
export interface ContextOption { key: string; label: string; hint?: string; chip: ContextChip }
export type SendResult = { ok: true } | { ok: false; status?: number; message: string };

// Chips picked on another surface (a request in "接口与请求") wait here until the composer is on screen.
const drafts = new Map<string, ContextChip[]>();
const listeners = new Set<() => void>();
const EMPTY: ContextChip[] = [];
const emit = () => listeners.forEach((l) => l());
export function addDraftChip(scope: string, chip: ContextChip) {
  const cur = drafts.get(scope) || EMPTY;
  if (cur.some((c) => c.key === chip.key)) return;
  drafts.set(scope, [...cur, chip]); emit();
}
function setDraft(scope: string, chips: ContextChip[]) { drafts.set(scope, chips); emit(); }
export function useDraftChips(scope: string): ContextChip[] {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => drafts.get(scope) || EMPTY);
}

export type ModelRoute =
  | { state: 'reading' }
  | { state: 'ok'; active: string; models: Array<{ value: string; label: string }> }
  | { state: 'unavailable' };

/** Current model route, read-only: the catalog, or the provider list when the catalog is empty or fails. */
export function useModelRoute(): ModelRoute {
  const [route, setRoute] = useState<ModelRoute>({ state: 'reading' });
  useEffect(() => {
    let dead = false;
    const fallback = () => api<any>('/api/models/providers').then((d) => {
      const ps = (d?.providers || []).filter((p: any) => p.enabled !== false && p.model);
      const active = ps.find((p: any) => p.id === d?.active_id);
      return { active: String(active?.model || ''), models: ps.map((p: any) => ({ value: String(p.model), label: `${p.label || p.name || p.vendor || '模型服务'} · ${p.catalog_name || p.model}` })) };
    });
    api<any>('/api/models/catalog').then((d) => {
      const models = (d?.models || []).map((m: any) => ({ value: String(m.value), label: `${m.provider_label || '模型服务'} · ${m.catalog_name || m.value}` }));
      return models.length ? { active: String(d?.active_model || ''), models } : fallback();
    }).catch(fallback).then((r) => { if (!dead) setRoute(r.models.length ? { state: 'ok', ...r } : { state: 'unavailable' }); })
      .catch(() => { if (!dead) setRoute({ state: 'unavailable' }); });
    return () => { dead = true; };
  }, []);
  return route;
}

export type MenuState = { type: 'command' | 'context'; query: string } | null;

export function useComposer(opts: {
  scope: string;
  fixed: ContextChip[];
  commands: ComposerCommand[];
  contextOptions: ContextOption[];
  canSend: boolean;
  onSend: (message: string) => Promise<SendResult>;
  /** Without context quoting (the Agent): no built-in "/引用" command. */
  noCite?: boolean;
}) {
  const { scope, fixed, contextOptions, canSend, onSend, noCite } = opts;
  const [text, setText] = useState('');
  const added = useDraftChips(scope);
  const chips = useMemo(() => [...fixed, ...added], [fixed, added]);
  const [forced, setForced] = useState<'context' | null>(null);
  // "/引用" belongs to the composer itself: it opens the context menu, like the "+" beside the chips.
  const commands = useMemo<ComposerCommand[]>(() => (noCite ? opts.commands : [...opts.commands, {
    id: 'cite', label: '/引用', hint: '引用一条风险发现作为上下文',
    disabled: contextOptions.length ? undefined : '这个会话还没有可引用的风险发现', run: () => setForced('context'),
  }]), [opts.commands, contextOptions.length, noCite]);
  const [dismissed, setDismissed] = useState('');
  const [index, setIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ status?: number; message: string } | null>(null);
  const last = useRef('');

  // "/" at the start opens the command menu; "@" at the end of the draft opens the context menu.
  const menu: MenuState = useMemo(() => {
    if (forced) return { type: 'context', query: '' };
    if (dismissed === text) return null;
    if (/^\/\S*$/.test(text)) return { type: 'command', query: text.slice(1) };
    if (noCite) return null;
    const at = /(?:^|\s)@(\S*)$/.exec(text);
    if (at) return { type: 'context', query: at[1] };
    return null;
  }, [text, forced, dismissed, noCite]);

  const commandHits = useMemo(() => (menu?.type === 'command' ? commands.filter((c) => c.label.slice(1).includes(menu.query) || c.id.includes(menu.query.toLowerCase())) : []), [menu, commands]);
  const contextHits = useMemo(() => (menu?.type === 'context'
    ? contextOptions.filter((o) => !added.some((c) => c.key === o.chip.key) && (!menu.query || o.label.toLowerCase().includes(menu.query.toLowerCase()))).slice(0, 8) : []), [menu, contextOptions, added]);
  const count = menu?.type === 'command' ? commandHits.length : contextHits.length;
  useEffect(() => { setIndex(0); }, [menu?.type, menu?.query]);

  const closeMenu = useCallback(() => { setForced(null); setDismissed(text); }, [text]);
  const addChip = useCallback((chip: ContextChip) => {
    addDraftChip(scope, chip);
    setForced(null);
    setText((t) => t.replace(/(^|\s)@\S*$/, '$1'));
  }, [scope]);
  const removeChip = useCallback((key: string) => setDraft(scope, (drafts.get(scope) || EMPTY).filter((c) => c.key !== key)), [scope]);

  const pick = useCallback((i: number) => {
    if (menu?.type === 'command') {
      const c = commandHits[i];
      if (!c || c.disabled) return;
      setText(''); setDismissed('');
      c.run();
    } else if (menu?.type === 'context') {
      const o = contextHits[i];
      if (o) addChip(o.chip);
    }
  }, [menu, commandHits, contextHits, addChip]);

  const send = useCallback(async () => {
    const body = text.trim();
    if (!body || sending || !canSend) return;
    const quotes = added.map((c) => `> 引用 ${c.text}`).join('\n');
    setSending(true); setError(null);
    const r = await onSend(quotes ? `${quotes}\n\n${body}` : body);
    setSending(false);
    if (r.ok) { last.current = body; setText(''); setDraft(scope, []); } else setError({ status: r.status, message: r.message });
  }, [text, sending, canSend, added, onSend, scope]);

  return {
    text, setText: (v: string) => { setText(v); if (error && error.status !== 403) setError(null); },
    chips, added, menu, commandHits, contextHits, count, index, setIndex, pick, closeMenu,
    openContext: () => setForced('context'), addChip, removeChip,
    sending, error, denied: error?.status === 403, send,
    recall: () => { if (last.current) setText(last.current); return !!last.current; },
  };
}
