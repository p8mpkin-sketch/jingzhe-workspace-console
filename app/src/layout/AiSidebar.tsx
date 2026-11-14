import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Cpu } from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { usePentest } from '@/stores/pentest';
import { Badge } from '@/components/ui';

/** R40 P0-3 两态 AI 决策助手:
 * 有已激活 LLM → 真实推理流模式(Phase 3 完整思考链,待 key);
 * 无 key → 本地决策摘要卡(autopilot 阶段推进/发现/阻断事件聚合,每条带证据 seq)。 */
export const AiSidebar: React.FC = () => {
 const events = usePentest((s) => s.events);
 const connected = usePentest((s) => s.connected);
 const token = useAuth((s) => s.token);
  const [llm, setLlm] = useState<null | { vendor: string; model: string }>(null);
  const [checked, setChecked] = useState(false);
  const [multi, setMulti] = useState<Array<any>>([]);
  // R52 P0-1: 真实路由状态(推理/兜底→供应商),取代「检测模型配置中…」静态卡死
  const [routing, setRouting] = useState<{ inference?: string; fallback?: string } | null>(null);

 const sid = usePentest((s) => s.sid);
 useEffect(() => {
 if (!token) return;
 (async () => {
 const res = await apiSafe('/api/models/providers');
 const list = (res && (res.providers || res)) as any[] | null;
 const activeId = res && res.active_id;
 const act = (list || []).find((p) => p.id === activeId);
 setLlm(act ? { vendor: act.vendor || act.label || '', model: act.model || '' } : null);
 const rt = await apiSafe('/api/models/routing');
 if (rt && rt.routing) {
 const label = (id?: string | null) =>
 ((rt.providers || []).find((p: any) => p.id === id) || {}).label || (id ? '已配置' : null);
        setRouting({ inference: label(rt.routing.inference), fallback: label(rt.routing.fallback) });
      }
      setChecked(true);
    })();
  }, [token]);
  const [confItems, setConfItems] = useState<Array<{ title: string; severity: string; evidence: string }>>([]);
 const confTitles = confItems.map((x) => x.title);
 const sidNow = usePentest((s) => s.sid);
 useEffect(() => {
 if (!sidNow || !token) { setConfItems([]); return; }
 (async () => {
 try {
 const t = localStorage.getItem('token') || '';
 const r = await fetch(`/api/pentest/sessions/${sidNow}/vulns`, { headers: { Authorization: `Bearer ${t}` } });
 const d = await r.json();
 setConfItems((d.confirmed || []).map((f: any) => ({
 title: f.title || '', severity: f.severity || '', evidence: f.evidence || '',
 })));
 } catch { setConfItems([]); }
 })();
 }, [sidNow, token]);
 // R60 指令2: LLM 洞察卡状态(流式 + Token 计数 + 降级标注 + 每会话每小时节流)
 const [insText, setInsText] = useState('');
 const [insTokens, setInsTokens] = useState(0);
 const [insErr, setInsErr] = useState('');
 const sendFb = (cardId: string, verdict: string) => {
 try {
 const t = localStorage.getItem('token') || '';
 fetch('/api/feedback', { method: 'POST',
 headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
 body: JSON.stringify({ card_id: cardId, verdict, sid: sidNow }) }).catch(() => {});
 } catch { /* 静默 */ }
 };
 const genInsight = async () => {
    setInsErr(''); setInsText(''); setInsTokens(0);
    const key = `insight_${sidNow}`;
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < 3600000) { setInsErr('节流中(每会话每小时 1 次)'); return; }
 try {
 const t = localStorage.getItem('token') || '';
 const ctx = `发现计数: 确认 ${confTitles.length} 条(${confTitles.join('、')})。请基于以上信息给出安全洞察。`;
 const resp = await fetch('/api/llm/insight', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
 body: JSON.stringify({ context: ctx }),
 });
 if (!resp.ok || !resp.body) throw new Error('HTTP ' + resp.status);
 const reader = resp.body.getReader();
 const dec = new TextDecoder();
 let buf = '';
 let finished = false;
 while (!finished) {
 const { value, done: rd } = await reader.read();
 if (rd) break;
 buf += dec.decode(value, { stream: true });
 const parts = buf.split('\n\n');
 buf = parts.pop() || '';
 for (const part of parts) {
 const line = part.trim();
 if (!line.startsWith('data:')) continue;
 try {
 const ev = JSON.parse(line.slice(5).trim());
 if (ev.delta) { setInsText((x) => x + ev.delta); if (ev.tokens) setInsTokens(ev.tokens); }
 if (ev.done) { finished = true; if (ev.error) setInsErr(ev.error); }
 } catch { /* ignore */ }
 }
 }
 localStorage.setItem(key, String(Date.now()));
 } catch (e: any) {
 setInsErr(String(e?.message || e).slice(0, 60));
 }
 };

 // R41 P0-4: 多源决策卡数据(progress/evidence 拉取,与 SSE hook 流互补)
 useEffect(() => {
 if (!token || !sid) return;
 (async () => {
      const out: Array<any> = [];
 for (const src of ['progress', 'evidence']) {
 try {
 const r = await fetch(`/api/pentest/sessions/${sid}/events?source=${src}&limit=200`,
 { headers: { Authorization: `Bearer ${token}` } });
 if (r.ok) {
 const d = await r.json();
 out.push(...(d.events || []).map((e: any) => ({ ...e, _src: src })));
 }
 } catch { /* silent */ }
 }
 setMulti(out);
 })();
 }, [token, sid]);

 // 本地决策卡: 从事件流聚合(阶段推进/发现/审批)
 const cards = useMemo(() => {
 const all = [...events.map((e) => ({ ...e, _src: 'hook' })), ...multi];
    const out: Array<{ seq: number; kind: string; title: string; ts?: string; source: string }> = [];
    for (const e of all) {
      const t = e.type || '';
      const src = e._src || (e as any).__src || '';
      const base = { seq: e.seq, ts: e.ts, source: src };
      if (t === 'phase_run' || t === 'step_done' || t === 'autopilot_start')
        out.push({ ...base, kind: '阶段', title: e.name || e.detail || `${e.phase || ''} 推进` });
      else if (t === 'approval_required')
        out.push({ ...base, kind: '阻断', title: e.reason || '工具待审批' });
      else if (t === 'finding')
        out.push({ ...base, kind: '发现', title: e.title || e.name || '' });
      else if (t === 'storage_scan' || t === 'component_attack')
        out.push({ ...base, kind: '观测', title: e.note || e.name || t });
      else if (t === 'report')
        out.push({ ...base, kind: '报告', title: e.note || '报告生成' });
    }
    return out.slice(-40).reverse();
  }, [events, multi]);

  // R101(用户裁定): 可收起——静态占位批评的全局解;会话页默认展开(动态时间线在位),收起后缩为图标条
  const [collapsed, setCollapsed] = useState(false);
  if (collapsed) {
    return (
      <aside className="w-11 flex-none bg-jz-surface flex flex-col items-center py-2 gap-2" data-ai-rail="collapsed">
        <button onClick={() => setCollapsed(false)} data-ai-rail-expand title="展开 AI 决策助手"
 className="w-7 h-7 rounded-control bg-jz-brand/10 border border-jz-brand/30 grid place-items-center hover:bg-jz-brand/20 transition-colors">
          <Bot className="w-4 h-4 text-jz-brand" />
        </button>
      </aside>
    );
  }
  return (
    <aside className="w-72 flex-none bg-jz-surface flex flex-col" data-ai-rail="expanded">
      <div className="flex items-center gap-2 px-3 h-11">
        <div className="w-6 h-6 rounded-control bg-jz-brand/10 border border-jz-brand/30 grid place-items-center">
          <Bot className="w-3.5 h-3.5 text-jz-brand" />
        </div>
        <span className="text-meta font-semibold text-jz-ink">AI 决策助手</span>
        <span className={`ml-auto text-meta font-mono ${connected ? 'text-jz-teal' : 'text-jz-muted'}`}>
          {connected ? 'STREAM ACTIVE' : 'IDLE'}
        </span>
        <button onClick={() => setCollapsed(true)} data-ai-rail-collapse title="收起 AI 决策助手"
 className="flex-none w-6 h-6 rounded-control grid place-items-center text-jz-muted hover:text-jz-ink hover:bg-jz-surface-2/40 transition-colors text-meta">»</button>
      </div>
      <div className="px-3 py-2 border-b border-jz-border space-y-2">
        <div className="flex items-center gap-1.5 text-meta font-mono">
          <Cpu className="w-3 h-3 text-jz-brand" />
          <button data-llm-insight-btn onClick={genInsight} className="text-jz-brand hover:underline">生成 LLM 洞察</button>
 {insTokens > 0 && <span className="text-jz-muted ml-auto" data-insight-tokens>tokens: {insTokens}</span>}
        </div>
        {insErr && <div className="text-meta text-jz-sev-medium" data-insight-fallback>已降级规则卡(LLM 失败: {insErr.slice(0, 60)})</div>}
        {insText && <div data-insight-text className="rounded-control bg-jz-surface-2 p-2 text-meta whitespace-pre-wrap text-jz-ink-2 max-h-56 overflow-auto">{insText}</div>}
      </div>
      <div className="px-3 py-2 border-b border-jz-border flex items-center gap-1.5 text-meta font-mono">
        <Cpu className="w-3 h-3 text-jz-brand" />
        {llm
          ? <span className="text-jz-teal" data-llm-status="active">LLM: {llm.vendor} · {llm.model}(推理流已接)</span>
          : <span className="text-jz-muted" data-llm-status="unconfigured">
              {routing
                ? `模型路由: 推理→${routing.inference || '未配置'} · 兜底→${routing.fallback || '未配置'} · 系统设置-模型服务可配`
                : '本地规则摘要 · LLM 待 key'}
            </span>}
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {!checked && <div className="text-meta text-jz-muted">检测模型配置中…</div>}
        {checked && cards.length === 0 && (
          <div className="text-meta text-jz-muted leading-5">
            选择渗透会话后,这里按时间线聚合 Agent 决策(阶段推进/发现/审批阻断)。
            {llm ? '推理流已接入。' : '当前为本地规则摘要态,LLM key 配置后自动切换真实推理流。'}
          </div>
 )}
 {/* R57 建/R59 修正: AI 主动建议卡 —— 规则源扩至 confirmed 标题(签名链等发现属 findings 层,
 事件流规则会漏触发;sid27 实测正例)/ 误触发检查: 无签名链会话不出签名卡 */}
 {(() => {
 // R61 指令2: 建议卡升级为四要素结构(规则名/严重度/证据 文件:行号/建议动作)——预填文案全要素
 const evLines = multi.filter((e) => e._src === 'evidence').map((e) => JSON.stringify(e)).join(' ');
          const text = (confTitles || []).join(' ') + ' ' + evLines;
          const cards: Array<{ rule: string; sev: string; evid: string; action: string }> = [];
 if (/签名|mpaas|remote_map/.test(text)) {
 const hit = confItems.find((x) => /签名/.test(x.title) && /签名|key|secret/i.test(x.evidence));
 const anchor = hit ? (hit.evidence.match(/[\w/.]+\.(java|kt|xml):\d+/) || [])[0] || '' : '';
 cards.push({
 rule: '签名链检出', sev: (hit && hit.severity) || 'medium',
 evid: hit ? `确认发现「${hit.title}」证据 ${anchor}` : 'oracle 已就绪',
 action: '配置 remote_map 桥以启用自动重签验证',
 });
 }
 if (/未授权/.test(text)) cards.push({
 rule: '未授权接口检出', sev: 'high',
 evid: '确认发现含 WEB·未授权接口(匿名可访问)',
 action: '挂 Burp 桥做深度授权矩阵',
 });
 if (/壳|360|jiagu|加固/.test(text)) cards.push({
 rule: '强壳目标', sev: 'info',
 evid: 'packer 检测命中(360_jiagu 等),dyn_cap=java-only',
 action: '动态捕获走隐身 spawn 链(错峰:登录后驻留)',
 });
 if (/cronet|原生栈/.test(text)) cards.push({
 rule: '原生网络栈', sev: 'info',
 evid: 'cronet/BoringSSL 原生栈,Java 层捕获受限',
 action: '以网关基线+静态清单为准',
 });
 return cards.slice(0, 2).map((c, i) => (
            <div key={i} data-ai-suggest={i} title="点击到 AI 助手页继续"
 onClick={() => {
 localStorage.setItem('ai_prefill', JSON.stringify({
 kind: 'suggest', title: c.rule, sid: sidNow,
 four: { 规则名: c.rule, 严重度: c.sev, 证据: c.evid, 建议动作: c.action },
 }));
 location.hash = '/ai-assistant';
 }}
 className="rounded-control border border-jz-brand/40 bg-jz-brand/10 p-2 text-meta leading-4 text-jz-brand cursor-pointer hover:bg-jz-brand/20">
              <div className="flex items-center gap-1">
                <span className="flex-1">R59 {c.rule}({c.sev}) — {c.action}</span>
                <button data-fb-up={i} onClick={(e) => { e.stopPropagation(); sendFb('suggest-' + i, 'up'); }}
 className="text-meta px-1 rounded-control hover:bg-jz-surface/10" title="有用">👍</button>
                <button data-fb-down={i} onClick={(e) => { e.stopPropagation(); sendFb('suggest-' + i, 'down'); }}
 className="text-meta px-1 rounded-control hover:bg-jz-surface/10" title="没用">👎</button>
              </div>
            </div>
 ));
 })()}
 {cards.map((c, i) => (
          <div key={`${c.seq}-${i}`} onClick={() => {
 usePentest.getState().setHighlight(c.source || 'progress', c.seq);
 const api = (window as any).__dvApi;
 const t = api && api.getPanel('terminal');
 if (t) t.api.setActive();
 }} className="rounded-control bg-jz-surface-2 p-2 cursor-pointer hover:ring-1 hover:ring-jz-brand/50 transition-all">
            <div className="flex items-center justify-between text-meta font-mono text-jz-muted">
              <span className={c.kind === '阻断' ? 'text-jz-sev-critical font-semibold'
 : c.kind === '发现' ? 'text-jz-sev-medium font-semibold' : 'text-jz-brand font-semibold'}>
                #{c.seq} [{c.kind}]
              </span>
              {c.ts && <span>{String(c.ts).slice(5, 19)}</span>}
            </div>
            <p className="mt-1 text-meta text-jz-ink-2 break-all">{c.title}</p>
          </div>
        ))}
      </div>
    </aside>
  );
};

async function apiSafe(path: string): Promise<any> {
  try {
    const t = localStorage.getItem('token') || '';
    const r = await fetch(path, { headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
