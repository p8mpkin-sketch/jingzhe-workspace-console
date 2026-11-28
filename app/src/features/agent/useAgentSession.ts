import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getToken } from '@/services/api';
import { createBackoff, scheduleReconnect } from '@/services/backoff';
import type { AgentEvent, AgentNode, AgentSession, AgentSnapshot } from './types';

/** Event-sourced session hook: snapshot + SSE(seq) + a pure node reducer.
 *  No fake progress: every durable node comes from an event appended by the
 *  backend agent runtime. */
export function useAgentSession() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [current, setCurrent] = useState('');
  const [mode, setMode] = useState<'agent' | 'quick'>('agent');
  const [webEnabled, setWebEnabled] = useState(false);
  const [nodes, setNodes] = useState<AgentNode[]>([]);
  const [running, setRunning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [liveText, setLiveText] = useState('');
  const [liveReasoning, setLiveReasoning] = useState('');
  const [lastSeq, setLastSeq] = useState(0);
  const [lastEvent, setLastEvent] = useState('');
  const [metrics, setMetrics] = useState<any>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  // Read states (Phase 9, presentation only): whether the session list and the web setting were read, and the
  // status of a failed list read, so the page can say 未读取 / 无权限 instead of an empty list or "off".
  const [listRead, setListRead] = useState<{ state: 'loading' | 'ok' | 'failed'; status?: number }>({ state: 'loading' });
  const [webKnown, setWebKnown] = useState<'loading' | 'ok' | 'failed'>('loading');

  const currentRef = useRef('');
  const modeRef = useRef<'agent' | 'quick'>('agent');
  const lastSeqRef = useRef(0);
  const seenRef = useRef<Set<number>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const cancelRetryRef = useRef<() => void>(() => {});
  const backoffRef = useRef(createBackoff());
  const connectRef = useRef<(sid: string, since: number) => void>(() => {});

  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { lastSeqRef.current = lastSeq; }, [lastSeq]);
  useEffect(() => () => { mountedRef.current = false; abortRef.current?.abort(); cancelRetryRef.current(); backoffRef.current.reset(); }, []);

  const loadSessions = useCallback(async () => {
    try {
      const rows = await api<AgentSession[]>('/api/agent/sessions');
      if (!mountedRef.current) return;
      setSessions(rows || []);
      setListRead({ state: 'ok' });
      if (!currentRef.current && rows?.length) setCurrent(rows[0].id);
    } catch (e: any) {
      if (mountedRef.current) { setError(e?.message || '会话列表加载失败'); setListRead({ state: 'failed', status: e?.status }); }
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const loadSettings = useCallback(async () => {
    try {
      const s = await api<{ web_enabled: boolean }>('/api/agent/settings');
      setWebEnabled(!!s.web_enabled);
      setWebKnown('ok');
    } catch { setWebKnown('failed'); /* the switch value is unknown, not off */ }
  }, []);
  useEffect(() => { loadSettings(); }, [loadSettings]);

  const toggleWeb = useCallback(async () => {
    const next = !webEnabled;
    try {
      const s = await api<{ web_enabled: boolean }>('/api/agent/settings', {
        method: 'PATCH', body: JSON.stringify({ web_enabled: next }),
      });
      setWebEnabled(!!s.web_enabled);
    } catch (e: any) {
      setError(e?.message || '联网开关保存失败');
    }
  }, [webEnabled]);

  const reduce = useCallback((prev: AgentNode[], e: AgentEvent): AgentNode[] => {
    const d: any = e.data || {};
    if (e.type === 'user/message') {
      const text = typeof d.content === 'string' ? d.content : String(d.text || '');
      if (!text) return prev;
      return [...prev, { id: `u${e.seq}`, seq: e.seq, kind: 'user', text, turn: e.turn_id ?? undefined }];
    }
    if (e.type === 'assistant/message') {
      const text = typeof d.content === 'string' ? d.content : '';
      const calls = d.tool_calls || [];
      if (!text && !calls.length) return prev;
      return [...prev, {
        id: `a${e.seq}`, seq: e.seq, kind: 'assistant', text, blocks: d.blocks, tool_calls: calls,
        usage: d.usage, model: d.model, interrupted: !!d.interrupted,
        turn: e.turn_id ?? undefined,
      }];
    }
    if (e.type === 'tool/call') {
      const callId = d.call_id || `c${e.seq}`;
      const node: AgentNode = {
        id: `t${e.seq}`, seq: e.seq, kind: 'tool', call_id: callId,
        tool_call_id: callId, name: d.name || '', args: d.args || {},
        status: 'running', turn: e.turn_id ?? undefined,
      };
      return [...prev, node];
    }
    if (e.type === 'tool/result') {
      const callId = d.tool_call_id || d.call_id || '';
      const idx = prev.findIndex((n) => n.kind === 'tool' && n.call_id === callId);
      const patch: Partial<AgentNode> = {
        status: d.status === 'error' ? 'error' : 'success',
        summary: d.summary || '', data: d.data || [], citations: d.citations || [],
        elapsed_ms: d.elapsed_ms,
      };
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...patch };
        return copy;
      }
      return [...prev, {
        id: `t${e.seq}`, seq: e.seq, kind: 'tool', call_id: callId,
        tool_call_id: callId, name: d.name || '', args: {}, ...patch,
        turn: e.turn_id ?? undefined,
      }];
    }
    if (e.type === 'approval/request') {
      const aid = d.approval_id || `ap${e.seq}`;
      return [...prev, {
        id: `ap${e.seq}`, seq: e.seq, kind: 'approval', approval_id: aid,
        call_id: d.call_id || '', tool: d.tool || '', args: d.args || {},
        reason: d.reason || '', status: 'pending', turn: e.turn_id ?? undefined,
      }];
    }
    if (e.type === 'approval/decision') {
      const aid = d.approval_id || '';
      const idx = prev.findIndex((n) => n.kind === 'approval' && n.approval_id === aid);
      if (idx < 0) return prev;
      const copy = [...prev];
      copy[idx] = { ...copy[idx], status: d.decision || 'expired', decision: d.decision || 'expired' };
      return copy;
    }
    if (e.type === 'goal/update') {
      return [...prev, { id: `gl${e.seq}`, seq: e.seq, kind: 'goal',
                         objective: d.objective || '', status: d.status || 'active',
                         criteria: d.criteria || [], turn: e.turn_id ?? undefined }];
    }
    if (e.type === 'todo/update') {
      return [...prev, { id: `td${e.seq}`, seq: e.seq, kind: 'todo',
                         items: d.items || [], turn: e.turn_id ?? undefined }];
    }
    if (e.type === 'error') {
      return [...prev, { id: `e${e.seq}`, seq: e.seq, kind: 'error',
                         message: d.message || 'Agent 运行失败', turn: e.turn_id ?? undefined }];
    }
    if (e.type === 'turn/end') {
      return [...prev, { id: `end${e.seq}`, seq: e.seq, kind: 'turn_end',
                         reason: d.reason || 'done', usage: d.usage,
                         turn: e.turn_id ?? undefined }];
    }
    return prev;
  }, []);

  const applyDurable = useCallback((e: AgentEvent) => {
    if (!e || typeof e.seq !== 'number' || e.seq <= 0) return;
    if (seenRef.current.has(e.seq)) return;
    seenRef.current.add(e.seq);
    if (e.seq > lastSeqRef.current) {
      lastSeqRef.current = e.seq;
      setLastSeq(e.seq);
    }
    setLastEvent(e.type);
    const patchSessionStatus = (status: string) => setSessions((prev) => prev.map((s) =>
      s.id === currentRef.current ? { ...s, status } : s));
    if (e.type === 'turn/start') { setRunning(true); patchSessionStatus('running'); }
    if (e.type === 'approval/request') { setRunning(true); patchSessionStatus('waiting_approval'); }
    if (e.type === 'approval/decision') { setRunning(true); patchSessionStatus('running'); }
    if (e.type === 'turn/end') {
      setRunning(false);
      const r = e.data?.reason || 'done';
      patchSessionStatus(r === 'cancelled' ? 'cancelled' : r === 'error' ? 'error' : 'done');
      api(`/api/agent/sessions/${currentRef.current}/eval`).then(setMetrics).catch(() => {});
    }
    if (e.type === 'assistant/message') { setLiveText(''); setLiveReasoning(''); }
    setNodes((prev) => reduce(prev, e));
    setEvents((prev) => (prev.some((x) => x.seq === e.seq) ? prev : [...prev, e]));
  }, [reduce]);

  const reconcile = useCallback(async (sid: string) => {
    try {
      const snap = await api<AgentSnapshot>(`/api/agent/sessions/${sid}/snapshot`);
      if (currentRef.current !== sid) return;
      setRunning(!!snap.running);
      // The cursor never moves backwards: a snapshot older than what the stream already delivered is ignored,
      // so the reconnect resumes from the last seen seq instead of replaying.
      if ((snap.last_seq || 0) >= lastSeqRef.current) {
        setNodes(snap.nodes || []);
        setEvents(snap.events || []);
        seenRef.current = new Set((snap.events || []).map((e) => e.seq).filter(Boolean));
        lastSeqRef.current = snap.last_seq || 0;
        setLastSeq(snap.last_seq || 0);
      }
      const rows = await api<AgentSession[]>('/api/agent/sessions');
      if (currentRef.current === sid) setSessions(rows || []);
    } catch {
      // server still down; SSE retry will reconcile again
    }
  }, []);

  // The stream ended or failed. Reconcile once per outage, then reconnect from the last seen seq with
  // exponential backoff and jitter (1 s doubling to 30 s). The delay resets only after a connection delivers
  // data or stays open; a hidden tab waits and reconnects when it is shown again.
  const dropped = (sid: string) => {
    setConnected(false);
    if (currentRef.current !== sid) return;
    const backoff = backoffRef.current;
    if (backoff.attempt === 0) reconcile(sid);
    cancelRetryRef.current();
    cancelRetryRef.current = scheduleReconnect(backoff, () => {
      if (mountedRef.current && currentRef.current === sid) connectRef.current(sid, lastSeqRef.current);
    });
  };

  const connect = useCallback(async (sid: string, since: number) => {
    if (!sid) return;
    cancelRetryRef.current();
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const resp = await fetch(`/api/agent/sessions/${sid}/events?since_seq=${since}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) throw new Error(`SSE HTTP ${resp.status}`);
      backoffRef.current.opened();
      setConnected(true);
      setError('');
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const lines = part.split('\n');
          let evType = 'message';
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith('event:')) evType = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          }
          if (!dataLines.length) continue;
          let payload: any;
          try { payload = JSON.parse(dataLines.join('\n')); } catch { continue; }
          if (evType === 'assistant/delta' || payload?.type === 'assistant/delta') {
            backoffRef.current.alive(); // live output: the connection is real
            if (payload.reasoning) setLiveReasoning((v) => v + String(payload.text || ''));
            else setLiveText((v) => v + String(payload.text || ''));
            continue;
          }
          if (payload?.seq) {
            // Only an event past the cursor proves progress; a replay-then-close server stays backed off.
            const before = lastSeqRef.current;
            applyDurable(payload as AgentEvent);
            if (lastSeqRef.current > before) backoffRef.current.alive();
          }
        }
      }
      if (!ctrl.signal.aborted) dropped(sid);
    } catch (e: any) {
      if (ctrl.signal.aborted || !mountedRef.current) return;
      dropped(sid);
    }
  }, [applyDurable, reconcile]);
  connectRef.current = connect;

  // Load snapshot whenever the selected session changes, then start SSE.
  useEffect(() => {
    if (!current) {
      setNodes([]); setRunning(false); setConnected(false); setLiveText(''); setLiveReasoning('');
      return;
    }
    let dead = false;
    setLoading(true);
    setError('');
    setNodes([]); setEvents([]); setLiveText(''); setLiveReasoning('');
    seenRef.current = new Set();
    lastSeqRef.current = 0;
    setLastSeq(0);
    setMetrics(null);
    api<AgentSnapshot>(`/api/agent/sessions/${current}/snapshot`)
      .then((snap) => {
        if (dead) return;
        setNodes(snap.nodes || []);
        setEvents(snap.events || []);
        (snap.events || []).forEach((e) => { if (e.seq) seenRef.current.add(e.seq); });
        lastSeqRef.current = snap.last_seq || 0;
        setLastSeq(snap.last_seq || 0);
        setRunning(!!snap.running);
        setMode((snap.session?.mode as 'agent' | 'quick') || 'agent');
        setLoading(false);
        api(`/api/agent/sessions/${current}/eval`).then(setMetrics).catch(() => setMetrics(null));
        connect(current, snap.last_seq || 0);
      })
      .catch((e: any) => {
        if (dead) return;
        setLoading(false);
        setError(e?.message || '会话加载失败');
      });
    return () => {
      dead = true;
      abortRef.current?.abort();
      cancelRetryRef.current(); backoffRef.current.reset();
    };
  }, [current, connect]);

  const createSession = useCallback(async (taskId?: number, title?: string,
                                          modeArg?: 'agent' | 'quick') => {
    const m = modeArg || modeRef.current;
    const s = await api<AgentSession>('/api/agent/sessions', {
      method: 'POST', body: JSON.stringify({ title: title || '新 Agent 会话',
                                              task_id: taskId, mode: m }),
    });
    setMode(m);
    setSessions((prev) => [s, ...prev]);
    setCurrent(s.id);
    return s;
  }, []);

  const send = useCallback(async (text: string, model = '') => {
    const q = text.trim();
    if (!q) return;
    let sid = currentRef.current;
    if (!sid) {
      const s = await createSession(undefined, undefined, modeRef.current);
      sid = s.id;
    }
    setRunning(true);
    setError('');
    setSessions((prev) => prev.map((s) => s.id === sid
      ? { ...s, status: 'running', title: (!s.title || s.title === '新 Agent 会话') ? q.slice(0, 40) : s.title }
      : s));
    try {
      await api(`/api/agent/sessions/${sid}/messages`, {
        method: 'POST', body: JSON.stringify({ text: q, model: model || undefined }),
      });
      // If the API accepted but the process died before starting the run,
      // the UI must not stay "running" forever. Reconcile from durable state.
      window.setTimeout(() => { if (currentRef.current === sid) reconcile(sid); }, 4000);
    } catch (e: any) {
      setRunning(false);
      setSessions((prev) => prev.map((s) => s.id === sid && s.status === 'running'
        ? { ...s, status: 'idle' } : s));
      setError('发送失败（服务可能刚重启），请重试');
      reconcile(sid);
      throw e;
    }
  }, [createSession, reconcile]);

  const stop = useCallback(async () => {
    const sid = currentRef.current;
    if (!sid) return;
    try {
      await api(`/api/agent/sessions/${sid}/cancel`, { method: 'POST' });
    } catch (e: any) {
      setError(e?.message || '停止失败');
    }
  }, []);

  const decideApproval = useCallback(async (aid: string, decision: 'approve' | 'deny') => {
    const sid = currentRef.current;
    if (!sid || !aid) return;
    setNodes((prev) => prev.map((n) => n.kind === 'approval' && n.approval_id === aid
      ? { ...n, status: decision === 'approve' ? 'approved' : 'denied' } : n));
    try {
      await api(`/api/agent/sessions/${sid}/approvals/${aid}`, {
        method: 'POST', body: JSON.stringify({ decision }),
      });
    } catch (e: any) {
      setError(e?.message || '审批提交失败');
    }
  }, []);

  const submitFeedback = useCallback(async (rating: 'up' | 'down') => {
    const sid = currentRef.current;
    if (!sid) return;
    try {
      await api(`/api/agent/sessions/${sid}/feedback`, {
        method: 'POST', body: JSON.stringify({ rating, category: 'answer' }),
      });
    } catch (e: any) {
      setError(e?.message || '反馈提交失败');
    }
  }, []);

  const forkSession = useCallback(async () => {
    const sid = currentRef.current;
    if (!sid) return;
    const s = await api<AgentSession>(`/api/agent/sessions/${sid}/fork`, {
      method: 'POST', body: JSON.stringify({}),
    });
    await loadSessions();
    if (s?.id) setCurrent(s.id);
  }, [loadSessions]);

  const exportTrajectory = useCallback(async () => {
    const sid = currentRef.current;
    if (!sid) return;
    const r = await fetch(`/api/agent/sessions/${sid}/trajectory.md`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!r.ok) throw new Error(`导出失败 HTTP ${r.status}`);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `agent-${sid}.md`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const remove = useCallback(async (sid: string) => {
    try {
      await api(`/api/agent/sessions/${sid}`, { method: 'DELETE' });
    } catch (e: any) {
      setError(e?.message || '删除失败');
      return;
    }
    setSessions((prev) => prev.filter((s) => s.id !== sid));
    if (currentRef.current === sid) {
      const rest = sessions.filter((s) => s.id !== sid);
      setCurrent(rest[0]?.id || '');
    }
  }, [sessions]);

  return {
    sessions, current, setCurrent, nodes, running, connected, loading, error,
    liveText, liveReasoning, lastSeq, lastEvent, metrics, events,
    loadSessions, createSession, send, stop, remove, decideApproval, submitFeedback, exportTrajectory, forkSession,
    mode, setMode, webEnabled, toggleWeb, listRead, webKnown,
    reconnect: () => { backoffRef.current.reset(); connect(currentRef.current, lastSeqRef.current); },
  };
}
