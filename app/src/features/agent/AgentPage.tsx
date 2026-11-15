import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Bot, Bug, CircleAlert, DoorOpen, Download, GitBranch, Globe, KeyRound, MoreHorizontal, PanelLeft, PanelRight, Radio, ShieldAlert, Sparkles } from 'lucide-react';
import { AgentSidebar } from './components_agent/AgentSidebar';
import { AgentComposer } from './components_agent/AgentComposer';
import { AgentInspector } from './components_agent/AgentInspector';
import { AgentWorkspace } from './components_agent/AgentWorkspace';
import { AnswerCard } from './components_agent/AnswerCard';
import { TurnView } from './components_agent/TurnView';
import { useAgentSession } from './useAgentSession';
import { api } from '@/services/api';
import { useMediaQuery, useViewPreference } from '@/components/ui';
import { projectTurns } from './model/turnProjection';
import type { EvidenceView } from './content/types';
import { EXAMPLE_TASK } from './model/sessionMeta';

const SUGGESTS_AGENT = [
  { icon: ShieldAlert, tint: 'text-jz-sev-critical', label: '高危漏洞清单', desc: '按任务聚合高危发现，给出文件位置和修复优先级', q: `${EXAMPLE_TASK} 有哪些高危发现？给出文件位置和修复优先级` },
  { icon: KeyRound, tint: 'text-jz-sev-medium', label: '硬编码密钥提取', desc: '汇总密钥、证书与凭据，标注文件、置信度和用途', q: `汇总${EXAMPLE_TASK} 中的硬编码密钥/证书，列出文件与置信度` },
  { icon: DoorOpen, tint: 'text-jz-brand', label: '导出组件审计', desc: '检查 exported 组件及其权限保护状态', q: `列出${EXAMPLE_TASK} 的 exported 组件，标出未加权限保护的` },
  { icon: Bug, tint: 'text-jz-teal', label: '危险 API 清单', desc: '按风险等级整理危险调用与高危权限', q: `汇总${EXAMPLE_TASK} 中危险 API 调用，按风险等级排序` },
];
const SUGGESTS_QUICK = [
  { icon: ShieldAlert, tint: 'text-jz-sev-critical', label: '证书锁定结论', desc: '检索本地知识库中的 SSL Pinning 结论与出处', q: '检索本地知识库里关于证书锁定（SSL Pinning）的结论与出处' },
  { icon: KeyRound, tint: 'text-jz-sev-medium', label: '硬编码密钥', desc: '查看历史密钥/凭据发现与出处', q: '检索本地知识库中硬编码密钥/凭据的历史发现与出处' },
  { icon: Sparkles, tint: 'text-jz-brand', label: '会话要点小结', desc: '总结结论、证据和未验证项', q: '总结当前会话的结论、证据和未验证项' },
];

export const AgentPage: React.FC = () => {
  const a = useAgentSession();
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  // From 1440 px the run context is a third, pinned pane (collapsible); below that it stays a drawer.
  // The choice to pin or collapse is remembered; the pane also yields to the drawer when pinning would
  // squeeze the conversation below AGENT_CENTER_MIN (narrow window, open session rail).
  const wide = useMediaQuery('(min-width: 1440px)');
  const [fits, setFits] = useState(true);
  const [pinPref, setPinPref] = useViewPreference<'pinned' | 'collapsed'>('agent-inspector', 'pinned', ['pinned', 'collapsed']);
  const pinned = pinPref === 'pinned';
  const pinMode = wide && fits;
  const toggleInspector = () => (pinMode ? setPinPref(pinned ? 'collapsed' : 'pinned') : setInspectorOpen(true));
  const closeInspector = () => (pinMode ? setPinPref('collapsed') : setInspectorOpen(false));
  const [sessionOpen, setSessionOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [webStatus, setWebStatus] = useState<any>(null);
  useEffect(() => {
    api<any>('/api/agent/web/status').then(setWebStatus).catch(() => setWebStatus(null));
  }, []);
  const currentSession = a.sessions.find((s) => s.id === a.current);
  const turns = useMemo(() => projectTurns(a.nodes), [a.nodes]);
  const showHero = !a.current || (turns.length === 0 && !a.liveText && !a.liveReasoning && !a.loading);
  const tools = useMemo(() => a.nodes.filter((n) => n.kind === 'tool'), [a.nodes]);
  const evidenceIndex = useMemo<EvidenceView[]>(() => {
    const seen = new Set<string>();
    const out: EvidenceView[] = [];
    for (const t of tools) {
      for (const c of t.citations || []) {
        const key = JSON.stringify(c);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          key,
          kind: c.url ? 'link' : c.path ? 'source' : 'task',
          label: c.url || [c.task_id ? `task#${c.task_id}` : '', c.ref || '', c.path || ''].filter(Boolean).join(' · '),
          path: c.path || undefined,
          url: c.url || undefined,
        });
      }
    }
    return out;
  }, [tools]);
  const lastFinalId = useMemo(() => {
    const finals = turns.filter((t) => t.final);
    return finals.length ? finals[finals.length - 1].final?.id : undefined;
  }, [turns]);
  const goal = useMemo(() => {
    const rows = a.nodes.filter((n) => n.kind === 'goal');
    return rows.length ? rows[rows.length - 1] : null;
  }, [a.nodes]);
  const todos = useMemo(() => {
    const rows = a.nodes.filter((n) => n.kind === 'todo');
    return (rows[rows.length - 1]?.items || []) as Array<{ text: string; status: string }>;
  }, [a.nodes]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [a.nodes.length, a.liveText, a.liveReasoning]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = near;
    setShowJump(!near);
  };
  const jumpBottom = () => {
    const el = scrollRef.current;
    if (el) { el.scrollTop = el.scrollHeight; atBottomRef.current = true; setShowJump(false); }
  };

  const onNew = async () => {
    try { await a.createSession(undefined, undefined, a.mode); } catch { /* surfaced */ }
  };
  const deepLinkRef = useRef(false);
  useEffect(() => {
    if (deepLinkRef.current) return;
    const raw = window.location.hash.split('?')[1] || '';
    const task = Number(new URLSearchParams(raw).get('task') || 0);
    if (!task) return;
    deepLinkRef.current = true;
    a.createSession(task, `任务 #${task} 追问`, 'agent').catch(() => {});
  }, [a.createSession]);
  const onDelete = async (id: string) => {
    if (!window.confirm('删除这个 Agent 会话？事件日志会软删除，不物理销毁。')) return;
    await a.remove(id);
  };
  const onBatchDelete = async (ids: string[]) => {
    if (!ids.length) return;
    if (!window.confirm(`删除选中的 ${ids.length} 个 Agent 会话？事件日志会软删除，不物理销毁。`)) return;
    for (const id of ids) await a.remove(id);
  };
  const ask = async (q: string, model = '') => {
    try { await a.send(q, model); } catch { /* surfaced */ }
  };

  const composerNode = (
    <AgentComposer running={a.running} disabled={a.loading}
      mode={a.mode} modeLocked={!!a.current}
      onModeChange={a.setMode}
      onSend={(text, model) => { ask(text, model).catch(() => {}); }}
      onStop={() => { a.stop(); }} />
  );
  const composerHint = (
    <div className="mt-1 text-meta text-jz-muted text-center">
      审计 Agent：任务/发现/报告/源码/KB + 审批写；快速问答：只查本地 KB。
    </div>
  );

  return (
    <div className="h-full" data-agent-page>
      <AgentWorkspace
        sessionOpen={sessionOpen}
        onCloseSession={() => setSessionOpen(false)}
        sessionRail={<AgentSidebar sessions={a.sessions} current={a.current} onNew={onNew}
          onSelect={(id) => { a.setCurrent(id); setSessionOpen(false); }} onDelete={onDelete} onBatchDelete={onBatchDelete}
          className="h-full" />}
        inspectorOpen={!pinMode && inspectorOpen}
        inspectorPinned={pinMode && pinned}
        onPinFitChange={setFits}
        onCloseInspector={() => setInspectorOpen(false)}
        inspector={<AgentInspector nodes={a.nodes} tools={tools} events={a.events}
          lastSeq={a.lastSeq} lastEvent={a.lastEvent}
          goal={goal} todos={todos} metrics={a.metrics}
          onClose={closeInspector} />}
      >
      <div className="flex-1 min-w-0 flex flex-col relative">
        <div className="flex items-center gap-2 px-3 sm:px-5 py-2 border-b border-jz-border/40">
          <button onClick={() => setSessionOpen(true)} data-agent-session-toggle
            className="lg:hidden w-7 h-7 rounded-control grid place-items-center text-jz-muted hover:text-jz-ink hover:bg-jz-surface-2/60">
            <PanelLeft size={15} />
          </button>
          <Bot size={15} className="text-jz-brand flex-none" />
          <span className="text-label font-semibold text-jz-ink truncate max-w-[180px] sm:max-w-[360px]">
            {currentSession?.title || 'Agent 工作台'}
          </span>
          <span className={`hidden sm:inline px-1.5 py-0.5 rounded-control text-meta font-semibold ${a.mode === 'quick' ? 'bg-jz-teal/10 text-jz-teal' : 'bg-jz-brand/10 text-jz-brand'}`} data-agent-mode-badge>
            {a.mode === 'quick' ? '快速问答' : '审计 Agent'}
          </span>
          {currentSession?.task_id != null && (
            <span className="hidden md:inline px-1.5 py-0.5 rounded-control bg-jz-surface-2/70 text-meta font-mono text-jz-muted">task #{currentSession.task_id}</span>
          )}
          <span className="flex-1" />
          <span data-agent-status className={`hidden md:flex items-center gap-1 px-2 py-0.5 rounded-pill text-meta ${a.running ? 'bg-jz-brand/10 text-jz-brand' : 'bg-jz-surface-2/60 text-jz-muted'}`}>
            <span className={`w-1.5 h-1.5 rounded-pill ${a.running ? 'bg-jz-brand' : 'bg-jz-muted/50'}`} />
            {a.running ? 'running' : (currentSession?.status || 'idle')}
          </span>
          <span data-agent-connected className={`hidden md:flex items-center gap-1 text-meta ${a.connected ? 'text-jz-teal' : 'text-jz-muted'}`}>
            <Radio size={10} /> {a.connected ? '已连接' : '回放'}
          </span>
          <button onClick={toggleInspector} data-agent-inspector-toggle={pinMode ? (pinned ? 'pinned' : 'collapsed') : 'drawer'} aria-pressed={pinMode ? pinned : undefined}
            title={pinMode ? (pinned ? '收起运行详情栏（会记住）' : '固定运行详情栏（会记住）') : wide ? '当前宽度放不下固定栏，运行详情以抽屉打开' : '打开运行详情'}
            className={`flex items-center gap-1 px-2 py-1 rounded-control text-meta hover:text-jz-brand hover:bg-jz-surface-2/60 ${pinMode && pinned ? 'text-jz-brand' : 'text-jz-muted'}`}>
            <PanelRight size={12} /> <span className="hidden sm:inline">运行详情</span>
          </button>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} data-agent-more
              className="w-7 h-7 rounded-control grid place-items-center text-jz-muted hover:text-jz-ink hover:bg-jz-surface-2/60">
              <MoreHorizontal size={15} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 rounded-card bg-jz-surface shadow-card border border-jz-border/50 p-1 z-30" data-agent-more-menu>
                <button onClick={() => { a.toggleWeb(); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-control text-meta text-jz-ink-2 hover:bg-jz-surface-2 text-left"
                  title={webStatus ? `搜索源：${webStatus.provider === 'tavily' ? 'Tavily' : 'DuckDuckGo（免 Key）'}` : '联网搜索'}>
                  <Globe size={12} /> 联网 {a.webEnabled ? '开' : '关'}
                  {webStatus && <span className="ml-auto font-mono text-meta text-jz-muted">{webStatus.provider === 'tavily' ? 'Tavily' : 'DDG'}</span>}
                </button>
                <button onClick={() => { a.forkSession().catch(() => {}); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-control text-meta text-jz-ink-2 hover:bg-jz-surface-2 text-left">
                  <GitBranch size={12} /> Fork 分支
                </button>
                <button onClick={() => { a.exportTrajectory().catch(() => {}); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-control text-meta text-jz-ink-2 hover:bg-jz-surface-2 text-left">
                  <Download size={12} /> 导出轨迹
                </button>
                <div className="px-2 py-1 text-meta font-mono text-jz-muted">seq {a.lastSeq}</div>
              </div>
            )}
          </div>
        </div>

        {a.error && (
          <div className="mx-5 mt-2 px-2.5 py-2 rounded-control bg-jz-sev-critical/10 text-meta text-jz-sev-critical flex items-center gap-1.5" data-agent-error>
            <CircleAlert size={12} /> {a.error}
          </div>
        )}

        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto [scrollbar-gutter:stable]" data-agent-transcript>
          <div className="max-w-[1040px] mx-auto px-5 py-5 pb-6">
            {showHero && (
              <div className="min-h-[55vh] flex flex-col justify-center" data-agent-empty>
                <div className="text-center mb-6">
                  <div className="mx-auto mb-3 w-11 h-11 rounded-panel bg-jz-brand grid place-items-center text-jz-on-brand shadow-card">
                    <Sparkles size={21} />
                  </div>
                  <h1 className="text-title leading-8 font-semibold tracking-tight text-jz-ink">APK 安全审计 Agent</h1>
                  <p className="mt-1.5 text-meta text-jz-muted">读取任务、发现、报告和源码；结论带证据，未知项单独标注。</p>
                </div>
                <div className="max-w-[780px] mx-auto w-full mb-4" data-agent-hero-composer>
                  {composerNode}
                  {composerHint}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-[780px] mx-auto w-full">
                  {(a.mode === 'quick' ? SUGGESTS_QUICK : SUGGESTS_AGENT).map((s) => (
                    <button key={s.q} onClick={() => ask(s.q)} data-agent-suggest
                      className="group text-left px-4 py-3.5 rounded-panel bg-jz-surface border border-jz-border/40 shadow-card hover:border-jz-brand transition-colors duration-hover">
                      <div className="flex items-start gap-3">
                        <span className={`w-8 h-8 rounded-card bg-jz-surface-2 ${s.tint} grid place-items-center flex-none`}>
                          <s.icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-label font-semibold text-jz-ink">
                            {s.label}
                            <ArrowUpRight size={12} className="opacity-0 -translate-y-0.5 group-hover:opacity-50 transition-opacity" />
                          </span>
                          <span className="mt-1 block text-meta leading-5 text-jz-muted">{s.desc}</span>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="text-meta text-jz-muted text-center mt-4">{a.current ? '发送后进入当前会话' : '首次发送会自动创建 Agent 会话'} · 结论以 citations 为准</div>
              </div>
            )}
            {a.loading && <div className="text-meta text-jz-muted py-4" data-agent-loading>加载事件中…</div>}
            {turns.map((turn) => (
              <TurnView key={turn.key} turn={turn} sessionId={a.current || undefined}
                evidenceIndex={evidenceIndex}
                allowFeedback={!!turn.final && turn.final.id === lastFinalId}
                onFeedback={(r) => a.submitFeedback(r)}
                onDecide={(id, d) => a.decideApproval(id, d)} />
            ))}
            {(a.liveText || a.liveReasoning) && (
              <AnswerCard live sessionId={a.current || undefined} node={{ id: 'live', kind: 'assistant', text: a.liveText,
                reasoning: a.liveReasoning, model: '流式', usage: null }} />
            )}
          </div>
          {showJump && (
            <button onClick={jumpBottom} data-agent-jump-bottom
              className="absolute right-6 bottom-28 z-20 px-3 py-1.5 rounded-pill bg-jz-surface shadow-card text-meta text-jz-ink-2 border border-jz-border/50 hover:text-jz-brand">
              回到最新 ↓
            </button>
          )}
        </div>

        {!showHero && (
          <div className="max-w-[1040px] mx-auto px-5 py-3 w-full">
            {composerNode}
            {composerHint}
          </div>
        )}
      </div>

      </AgentWorkspace>
    </div>
  );
};

export default AgentPage;
