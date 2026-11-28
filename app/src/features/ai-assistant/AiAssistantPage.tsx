import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bug, DoorOpen, KeyRound, Link2, PanelLeft, ShieldOff, X } from 'lucide-react';
import { api } from '@/services/api';
import { Badge, ModelSelectorChip, ExportMenu, SearchableTaskCombobox, UniversalImportModal } from '@/components/ui';
// The confirm and rename dialogs load when one of them opens (the page chunk does not grow).
const ArchiveDialogs = React.lazy(() => import('./ArchiveDialogs'));
import type { ArchiveAsk } from './ArchiveDialogs';
// The inspector renders nothing while closed, so it loads the first time it is opened.
const InspectorPanel = React.lazy(() => import('./components_ai/InspectorPanel'));
import { Link } from 'react-router-dom';
import type { ModelOption, ComboTaskItem, UniversalImportResult } from '@/components/ui';
import { MarkdownMessage } from './MarkdownMessage';
import { SessionSidebar } from './components_ai/SessionSidebar';
import type { ChatSession, ListRead } from './components_ai/SessionSidebar';
import { ContextualChips } from './components_ai/ContextualChips';
import { CitationGrid } from './components_ai/CitationGrid';
import { LiveStreamCard, AnswerMetaLine } from './components_ai/DecisionStreamCard';
import type { StreamPhase } from './components_ai/DecisionStreamCard';

/** AI 助手页 P2(采纳 Gemini 方案 + 五项代码级修正):
 *  ① Hero 空态聚拢——欢迎/输入底座/建议卡垂直居中,首问后输入底座下沉锚定(hero/docked 单实例互斥渲染);
 *  ② 检视器面板——原右侧 Token 小卡收编进 InspectorPanel(会话遥测+调试三件套),顶栏遥测胶囊常驻;
 *     修正④: 只复用抽屉视觉,不搬 AiInspectorDrawer(其绑死渗透工作台上下文);
 *  ③ 决策流诚实回填(修正⑤)——只展示真实可观测信号(连接/思维链帧/正文增量),done 回填 SSE tokens
 *     真值+端到端实测时延,不虚构分步耗时;
 *  ④ 会话列增强(修正②)——搜索/任务树折叠/批量删除(复用既有单删端点);
 *  ⑤ chips 上下文感知(任务关联后插值切换)+ Citations 卡片网格(修正①: snippet 存量已有,score 字段存在才渲染)。
 *  存量契约零回归: ai_prefill 联动/自动标题/SSE 流+降级发送/audit 追问/link 关联/置顶重命名删除/prompt 预览真跑/
 *  usage-summary/403 诚实降级。smoke AUI 资产闸五关键串全保留。 */

/** 修正⑤: 403 锁态胶囊——点击弹透明权限边界说明(不掩盖、不假造选项);数据不可见语义不变 */
const ModelGatePill: React.FC<{ msg: string }> = ({ msg }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
 useEffect(() => {
 if (!open) return;
 const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
 document.addEventListener('mousedown', onDown);
 return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div ref={ref} className="relative" data-model-gate-pill>
      <button onClick={() => setOpen((v) => !v)} data-model-gated title={msg}
 className="inline-flex items-center gap-1 px-2 py-1 rounded-pill bg-jz-surface/70 border border-jz-border
 font-mono text-meta text-jz-muted hover:border-jz-brand/50 transition-colors">
        🔒 跟随系统默认路由(403)
      </button>
      {open && (
        <div className="absolute left-0 bottom-full mb-1.5 z-50 w-72 rounded-control border border-jz-border bg-jz-surface/90 backdrop-blur-md shadow-card p-2.5 text-meta text-jz-ink-2 leading-relaxed modal-panel-in" data-model-gate-pop>
          当前账号读取模型路由返回 403(仅管理员可见,读面收口 R97-2)。按平台诚实原则,不掩盖权限边界:问答与知识库检索能力不受影响,模型路由由管理员统一托管,当前使用系统默认路由。
        </div>
      )}
    </div>
 );
};

export const AiAssistantPage: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [current, setCurrent] = useState<string>('');
  const [messages, setMessages] = useState<Array<any>>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [tokens, setTokens] = useState(0);
  const [devMode, setDevMode] = useState(false);          // C-UI-3: 开发者模式(默认关)
  const [sessOpen, setSessOpen] = useState(false);   // below 1024 px the session list is a drawer
  const [inspOpen, setInspOpen] = useState(false);        // P2-②: 检视器面板(顶栏胶囊/开关唤起)
  const [live, setLive] = useState<{ phase: StreamPhase; hitCount?: number; historyMsgs?: number; promptChars?: number; routeModel?: string }>({ phase: 'idle' });
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null); // P2-④: ⌘K 聚焦会话搜索
 const currentRef = useRef(''); // C-UI: send 闭包读实时会话 id(建议卡异步发送竞态)
 useEffect(() => { currentRef.current = current; }, [current]);

 const [listRead, setListRead] = useState<ListRead>({ state: 'loading' });
 const hadList = useRef(false);
 const loadSessions = () => api<ChatSession[]>('/api/chat/sessions').then((r) => { hadList.current = true; setSessions(r); setListRead({ state: 'ok' }); })
   .catch((e) => setListRead({ state: 'failed', status: e?.status, stale: hadList.current }));
 useEffect(() => { loadSessions(); }, []);
  // R103-12①: 会话轨分组模式(按时间/按任务)+ 任务标签映射(真值,来自 /api/tasks 同一批响应)
  const [grp, setGrp] = useState<'time' | 'task'>('time');
  const [taskMap, setTaskMap] = useState<Record<number, { name: string; pkg: string }>>({});
  const [linkOpen, setLinkOpen] = useState(false);
  // 全平台升级 Step4②: 关联任务选择器换 SearchableTaskCombobox(#ID/包名/应用名模糊+快速筛选);
  // 导入会话(本地只读视图,后端无消息追加端点=不假写);导出当前问答 Markdown/JSON。
  const [linkItems, setLinkItems] = useState<ComboTaskItem[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importedLocal, setImportedLocal] = useState<{ name: string; messages: Array<{ role: string; content: string }> } | null>(null);
 // R60 建议卡→AI 助手联动
 const [prefilled, setPrefilled] = useState(false);
 useEffect(() => {
 if (prefilled) return;
 try {
 const raw = localStorage.getItem('ai_prefill');
 if (!raw) return;
 const d = JSON.parse(raw);
 localStorage.removeItem('ai_prefill');
 (async () => {
 const s2 = await api('/api/chat/sessions', { method: 'POST', body: JSON.stringify({ title: '建议卡联动: ' + (d.title || '').slice(0, 30) }) });
 if (s2 && s2.id) { setCurrent(s2.id); loadSessions(); }
 const four = d.four ? `\n规则名: ${d.four['规则名']}\n严重度: ${d.four['严重度']}\n证据: ${d.four['证据']}\n建议动作: ${d.four['建议动作']}` : '';
 // R598: 来源标签可传(报告中心等新消费方语义如实;缺省沿用建议卡口径零回归)
 setInput((d.label ? `[${d.label}] ` : '[来自建议卡] ') + (d.title || '') + (d.sid ? `(关联会话 #${d.sid})` : '') + four + '\n请针对上述内容给出分析建议:');
 })();
 setPrefilled(true);
 } catch { /* ignore */ }
 }, [prefilled]);
 useEffect(() => {
    if (!current) { setMessages([]); return; }
    // R103-12 顺手修: 会话历史走既有 GET /api/chat/sessions/{sid}(自带 messages 数组),零后端改动
    // P2.5: 水合——metadata 里的 reasoning/citations 挂回内存字段(流式 citations 随消息持久化后重载可回看)
    api<any>(`/api/chat/sessions/${current}`).then((d) => setMessages((d.messages || []).map((mm: any) => {
 try {
 const mt = typeof mm.metadata === 'string' ? JSON.parse(mm.metadata) : mm.metadata;
 if (mt?.reasoning && !mm._reasoning) mm._reasoning = mt.reasoning;
 if (mt?.citations?.length && !mm._citations) mm._citations = mt.citations;
 } catch { /* 如实忽略 */ }
 return mm;
 }))).catch(() => setMessages([]));
 }, [current]);
 useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  // ---- 开发者模式内的能力(追问/Prompt 调试/真跑;P2-② 收编检视器面板) ----
  const [pv, setPv] = useState<any>(null);
  const [auditTasks, setAuditTasks] = useState<any[]>([]);
  const [auditTids, setAuditTids] = useState<number[]>([]); // P3-②: 多任务对比追问
 const toggleAuditTid = (id: number) => setAuditTids((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id].sort((a, b) => a - b)));
  const [srcPreview, setSrcPreview] = useState<{ path: string; text: string } | null>(null);
 const [searchParams] = useSearchParams();
 useEffect(() => {
    api<any[]>('/api/tasks?limit=500').then((rows) => {
      const m: Record<number, { name: string; pkg: string }> = {};
 for (const r of rows || []) m[r.id] = { name: r.app_name || r.package || '', pkg: r.package || '' };
 setTaskMap(m);
 const audits = (rows || []).filter((r: any) => r.kind === 'audit' && r.status === 'done' && r.result_id);
 setAuditTasks(audits);
 setLinkItems(audits.map((r: any) => ({
 id: r.id, package: r.package || null, app_name: r.app_name || null,
 status: r.status, created_at: r.created_at ?? null,
 })));
 }).catch(() => {});
 }, []);
 useEffect(() => {
 const t = Number(searchParams.get('task') || 0);
 if (t) { setAuditTids([t]); setDevMode(true); } // 任务中心追问入口自动开开发者模式
 }, [searchParams]);
 useEffect(() => { if (devMode) setInspOpen(true); }, [devMode]); // P2-②: 开调试即开检视器
 const openSource = async (tid: number, path: string) => {
    try {
      const d = await api<any>(`/api/chat/source?task_id=${tid}&path=${encodeURIComponent(path.split(':')[0])}`, {}, true);
      setSrcPreview({ path, text: String(d?.content ?? '').slice(0, 3000) || '(空文件)' });
    } catch (e: any) { setSrcPreview({ path, text: '(出处读取失败: ' + e.message + ')' }); }
  };

  // P3-①: 溯源对照双栏——citation ⤢ 原文对照 → /api/chat/kb-chunk 全文,右栏 Markdown 渲染
  const [chunkPreview, setChunkPreview] = useState<{ task_id: string; ref: string; title: string; body: string } | null>(null);
 const inspectChunk = async (c: { task_id: number; ref: string }) => {
    setChunkPreview({ task_id: String(c.task_id), ref: c.ref, title: '加载中…', body: '' });
    try {
      const d = await api<any>(`/api/chat/kb-chunk?task_id=${encodeURIComponent(String(c.task_id))}&ref=${encodeURIComponent(c.ref)}`);
      setChunkPreview({ task_id: String(d.task_id), ref: d.ref, title: d.title || '(无标题)', body: d.body || '(空)' });
    } catch (e: any) {
      setChunkPreview({ task_id: String(c.task_id), ref: c.ref, title: '(对照加载失败)', body: e.message });
    }
  };

  // Token 遥测 + 真跑(usage-summary 存量端点;修正③: 趋势/累计继续吃该端点,不做前端假累加)
  const [usage, setUsage] = useState<any>(null);
  const [runRes, setRunRes] = useState<any>(null);
 const [runBusy, setRunBusy] = useState(false);
 const [ask, setAsk] = useState<ArchiveAsk | null>(null);
 const loadUsage = async () => {
    if (!current) { setUsage(null); return; }
    try { setUsage(await api<any>(`/api/chat/usage-summary?sid=${current}`)); } catch { setUsage(null); }
 };
 useEffect(() => { loadUsage(); }, [current]); // eslint-disable-line
 const runPrompt = async () => {
    if (!current || !input.trim()) return;
    setAsk({ kind: 'run' });
 };
 // Confirmed in the kit's dialog (it was the browser confirm); the request is unchanged.
 const doRunPrompt = async () => {
    if (!current || !input.trim()) return;
    setRunBusy(true); setRunRes(null);
    try {
      setRunRes(await api<any>(`/api/chat/sessions/${current}/prompt-run`, { method: 'POST', body: JSON.stringify({ q: input }) }));
 } catch (e: any) { setRunRes({ error: e.message }); }
 setRunBusy(false);
 };
 const loadPromptPreview = async () => {
    if (!current) return;
    try { setPv(await api<any>(`/api/chat/sessions/${current}/prompt-preview?q=${encodeURIComponent(input)}`)); } catch { setPv(null); }
  };

  // R-ai③: 模型选择器——providers(激活)+routing 当前 inference;选定后 chat/audit 带 model
  const [providers, setProviders] = useState<any[]>([]);
  const [routing, setRouting] = useState<any>({});
 const [chatModel, setChatModel] = useState(''); // '' = 跟随 routing
 // R104-4①: 路由数据读取失败(svc 403)→ 锁态胶囊+透明说明(R103-6 口径),不假造选项
 const [modelErr, setModelErr] = useState('');
 useEffect(() => {
    api<any>('/api/models/providers').then((d) => setProviders((d.providers || []).filter((p: any) => p.enabled !== false)))
 .catch((e: any) => setModelErr(e?.status === 403 ? '模型路由仅管理员可见(403,读面收口 R97-2)' : (e?.message || '路由数据读取失败')));
    api<any>('/api/models/routing').then((d) => { setRouting(d.routing || {}); }).catch(() => {});
 }, []);
 const modelOptions: ModelOption[] = useMemo(() => [
 { id: '', label: `跟随路由(${routing.inference || '默认'})`, vendor: 'Auto' },
 ...providers.map((p: any) => ({ id: String(p.model || p.id), label: `${p.model}(${p.label})`, vendor: String(p.label || p.vendor || p.id) })),
 ], [providers, routing]);

 // 追问(chat/audit)——时延实测随 _meta 落消息(诚实回填);P3-②: task_ids 多任务对比
 const askAudit = async () => {
 if (!input.trim() || !auditTids.length) return;
 setBusy(true);
 const q = input; setInput('');
 const t0 = Date.now();
 setMessages((m) => [...m, { role: 'user', content: `[#${auditTids.join('+')}] ${q}` }]);
 try {
 const hist = messages.slice(-4).map((m2) => ({ role: m2.role, content: m2.content }));
      const d = await api<any>('/api/chat/audit', { method: 'POST', body: JSON.stringify({ task_ids: auditTids, question: q, history: hist, model: chatModel || undefined }) });
 const ans = d.answer || '(空回答)';
 setMessages((m) => [...m, { role: 'assistant', content: ans, _meta: { latencyMs: Date.now() - t0, genChars: ans.length, model: d.model }, _audit: { tid: auditTids[0], llm_used: d.llm_used, model: d.model, llm: d.llm, citations: d.citations || [], mounted: d.mounted_skills || [] } }]);
 } catch (e: any) {
 setMessages((m) => [...m, { role: 'assistant', content: '(追问失败: ' + e.message + ')' }]);
 }
 setBusy(false);
 loadUsage();
 };

 const send = async (text?: string) => {
 const q0 = text ?? input;
 const sid = currentRef.current || current;
 if (!q0.trim() || !sid || busy) return;
 setBusy(true);
 const q = q0; setInput('');
 setTokens(0);
 setLive({ phase: 'connecting' });
 const t0 = Date.now();
 setMessages((m) => [...m, { role: 'user', content: q }]);
 setMessages((m) => [...m, { role: 'assistant', content: '' }]);
 // C-UI-2: 自动标题——首问 20 字摘要替换「新对话」
 const sess = sessions.find((s) => s.id === current);
 if (sess && /^(新对话|测试)?$/.test(sess.title || '')) {
 const title = q.replace(/\s+/g, ' ').trim().slice(0, 20) || '新对话';
 api(`/api/chat/sessions/${sid}`, { method: 'PATCH', body: JSON.stringify({ title }) }).then(loadSessions).catch(() => {});
 }
 try {
 const t = localStorage.getItem('token') || '';
 const resp = await fetch(`/api/chat/sessions/${sid}/send_stream`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
 body: JSON.stringify({ question: q, model: chatModel || undefined }),
 });
 if (!resp.ok || !resp.body) throw new Error('HTTP ' + resp.status);
 const reader = resp.body.getReader();
 const dec = new TextDecoder();
 let buf = '';
 let tok = 0;
 let done = false;
 while (!done) {
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
 if (ev.step === 'retrieve') {
 // P2.5: 后端真实检索步事件——命中数+出处(带 bm25 相对分)此刻即真值,citations 渐进渲染
 setLive((v) => ({ ...v, hitCount: ev.hit_count || 0 }));
 if (Array.isArray(ev.citations) && ev.citations.length) {
 setMessages((m) => {
 const copy = [...m];
 const last = { ...(copy[copy.length - 1] || { role: 'assistant', content: '' }) };
 last._citations = ev.citations;
 copy[copy.length - 1] = last;
 return copy;
 });
 }
 }
 if (ev.step === 'assemble') {
 // P3-①: 装配+路由步真值(历史条数/载荷字符/路由解析)
 setLive((v) => ({ ...v, historyMsgs: ev.history_msgs, promptChars: ev.prompt_chars, routeModel: ev.model || undefined }));
 }
 if (ev.reasoning) {
 setLive((v) => (v.phase === 'connecting' || v.phase === 'idle' ? { ...v, phase: 'thinking' } : v));
 // R103-12④: 思维链帧累计到当前 assistant 消息(折叠面板展示,不与正文混排)
 setMessages((m) => {
 const copy = [...m];
 const last = { ...(copy[copy.length - 1] || { role: 'assistant', content: '' }) };
 last._reasoning = (last._reasoning || '') + ev.reasoning;
 copy[copy.length - 1] = last;
 return copy;
 });
 }
 if (ev.delta) {
 setLive((v) => (v.phase !== 'generating' ? { ...v, phase: 'generating' } : v));
 setMessages((m) => {
 const copy = [...m];
 // P2.5: 展开保留既有挂载字段(_citations/_reasoning/_meta),否则检索步刚挂的出处会被首帧 delta 冲掉
 const prev = copy[copy.length - 1] || { role: 'assistant', content: '' };
 copy[copy.length - 1] = { ...prev, role: 'assistant', content: (prev.content || '') + ev.delta };
 return copy;
 });
 }
 if (ev.tokens) { tok = ev.tokens; setTokens(ev.tokens); }
 if (ev.done) {
 done = true;
 // R100-1: done 尾包带身份三元组;P2-③: 同帧回填诚实 _meta(tokens 真值/模型/端到端实测)
 setMessages((m) => {
                const c = [...m];
                const last = { ...(c[c.length - 1] || { role: 'assistant', content: '' }) };
                if (ev.error) last.content = ev.error;
                if (ev.username || ev.model) { last._identity = true; last._identity_user = ev.username; last._identity_model = ev.model; }
                if (ev.llm) last._identity_llm = ev.llm;
                last._meta = {
                  model: ev.model, tokens: tok || undefined, latencyMs: Date.now() - t0,
                  reasoningLen: (last._reasoning || '').length, genChars: (last.content || '').length,
                };
                c[c.length - 1] = last;
                return c;
              });
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e: any) {
      try {
        const d = await api<any>(`/api/chat/sessions/${sid}/send`, { method: 'POST', body: JSON.stringify({ question: q }) });
 setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: d.answer || d.content || '(无回复)', _meta: { latencyMs: Date.now() - t0 } }; return c; });
 } catch (e2: any) {
 setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', content: '错误: ' + (e2?.message || e.message) }; return c; });
 }
 }
 setLive({ phase: 'idle' });
 setBusy(false);
 loadSessions();
 loadUsage();
 };

 const doSend = () => (auditTids.length ? askAudit() : send());
 const onKey = (e: React.KeyboardEvent) => {
 if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
 };
 // C-UI-2: 输入框多行自适应 56-200px
 const fitTA = () => {
 const ta = taRef.current;
 if (!ta) return;
 ta.style.height = 'auto';
 ta.style.height = Math.min(200, Math.max(56, ta.scrollHeight)) + 'px';
 };

 // 会话管理(传入 SessionSidebar;批量=并发调既有单删端点,聚合确认一次)
 const togglePin = async (s: ChatSession) => {
 try { await api(`/api/chat/sessions/${s.id}/pin`, { method: 'POST', body: JSON.stringify({ pinned: !s.pinned }) }); } catch { /* 如实忽略 */ }
 loadSessions();
 };
 const linkTask = async (tid: number) => {
 if (!current) return;
 try { await api(`/api/chat/sessions/${current}/link`, { method: 'POST', body: JSON.stringify({ task_id: tid }) }); } catch { /* 如实忽略 */ }
 setLinkOpen(false);
 loadSessions();
 };
 const unlinkTask = async () => {
 if (!current) return;
 try { await api(`/api/chat/sessions/${current}/link`, { method: 'POST', body: JSON.stringify({ task_id: null }) }); } catch { /* 如实忽略 */ }
 loadSessions();
 };
 const newChat = async () => {
 const s = await api('/api/chat/sessions', { method: 'POST', body: JSON.stringify({ title: '' }) });
 if (s.id) { setCurrent(s.id); setMessages([]); loadSessions(); setTimeout(() => taRef.current?.focus(), 300); }
 };
 // Rename, delete and batch delete ask in the kit's dialogs (they were the browser prompt and confirm); the dialogs
 // send the same requests as before, cancel sends nothing, and focus returns to the trigger.
 const batchDelete = async (ids: string[]) => { if (ids.length) setAsk({ kind: 'batch', ids }); };
 const afterAsk = (removed: string[]) => { setAsk(null); if (removed.includes(current)) { setCurrent(''); setMessages([]); } loadSessions(); };

 // C-UI-2 空态四建议卡 → R104-4②: 内容=真实系统能力,禁编造(在案口径不变)
 const SUGGESTS = [
 { icon: KeyRound, tint: 'text-jz-sev-medium', title: '硬编码密钥提取', q: '汇总当前项目全部 APK 中发现的所有硬编码 key,按任务分组列出' },
 { icon: ShieldOff, tint: 'text-jz-amber', title: '证书锁定绕过提示', q: '哪些 APP 启用了证书锁定(SSL Pinning)?结合 ssl_bypass 钩子给出绕过思路与风险提示' },
 { icon: DoorOpen, tint: 'text-jz-brand', title: '导出组件审计', q: '汇总所有 APP 的导出组件(exported activity/service/receiver/provider),标出未加权限保护的' },
 { icon: Bug, tint: 'text-jz-sev-critical', title: '危险 API 清单', q: '列出各 APP 的危险函数调用与高危权限使用,按风险等级分组' },
 ];
 const askSuggest = async (q: string) => {
 let sid = current;
 if (!sid) {
 const s = await api('/api/chat/sessions', { method: 'POST', body: JSON.stringify({ title: q.slice(0, 20) }) });
 if (s && s.id) { sid = s.id; setCurrent(s.id); loadSessions(); }
 }
 // 会话切换后 messages effect 拉取竞态: 等拉取完成再发送(否则空列表覆盖流式写入)
 if (sid) setTimeout(() => send(q), 600);
 };

 // P2-①: Hero 空态聚拢——空态时欢迎+输入底座+建议卡垂直居中;首条消息后转 docked 布局(单实例互斥)
 const heroMode = messages.length === 0 && !busy;
 const boundTask = useMemo(() => {
 const sess = sessions.find((s) => s.id === current);
 if (!sess?.task_id) return null;
 const t = taskMap[sess.task_id];
 return { id: sess.task_id, name: t?.name, pkg: t?.pkg };
 }, [sessions, current, taskMap]);

 // ⌘K/⌘I 快捷键(会话搜索聚焦 / 开发者模式切换)
 useEffect(() => {
 const onKey = (e: KeyboardEvent) => {
 if (!(e.metaKey || e.ctrlKey)) return;
 if (e.key === 'k' || e.key === 'K') { e.preventDefault(); searchRef.current?.focus(); }
 else if (e.key === 'i' || e.key === 'I') { e.preventDefault(); setDevMode((v) => { if (!v) setInspOpen(true); return !v; }); }
 };
 document.addEventListener('keydown', onKey);
 return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ---- 输入底座(hero/docked 共用同一 JSX 实例,互斥渲染保证 refs 唯一) ----
  const composer = (
    <div className="rounded-panel bg-jz-surface px-3 py-2 transition-all shadow-card " data-input-area>
      <ContextualChips boundTask={boundTask} onPick={(q) => { setInput(q); taRef.current?.focus(); }} />
      <textarea ref={taRef} value={input} onChange={(e) => { setInput(e.target.value); fitTA(); }} onKeyDown={onKey}
 rows={1} placeholder={auditTids.length ? `对任务 #${auditTids.join('+')} 追问…(Enter 发送,Shift+Enter 换行)` : '输入安全问题…(Enter 发送,Shift+Enter 换行)'}
 className="block w-full resize-none bg-transparent text-body leading-[1.6] text-jz-ink placeholder:text-jz-muted outline-none"
 style={{ minHeight: 56, maxHeight: 200, fontFamily: 'inherit' }} data-chat-input />
      <div className="flex items-center gap-2 mt-1 pt-1.5 flex-wrap" data-composer-bar>
        {/* R103-12③: 上下文挂载指示器(真值=会话 task_id + 任务映射包名) */}
        {boundTask && (
          <span data-ctx-chip
 className="flex items-center gap-1 px-1.5 py-0.5 rounded-pill bg-jz-brand/10 text-meta text-jz-brand hover:bg-jz-brand/20 transition-colors"
 title={`上下文挂载:审计任务 #${boundTask.id}${boundTask.pkg ? ' · ' + boundTask.pkg : ''}(真值)`}>
            已关联 #{boundTask.id}{boundTask.name ? ` ${boundTask.name}` : ''}
            <button data-ctx-unlink onClick={unlinkTask} className="hover:text-jz-sev-critical" title="解除关联(转自由对话,沿用端点既有语义)"><X size={10} /></button>
          </span>
        )}
        <span data-model-select>
          {modelErr ? <ModelGatePill msg={modelErr} /> : (
            <ModelSelectorChip
 options={modelOptions}
 value={chatModel}
 onChange={setChatModel}
 placeholder="跟随路由(默认)"
 className="max-w-[240px]"
 dropUp
 />
          )}
        </span>
        <span className="flex-1" />
        {/* R104-4①: Token 诚实口径——SSE tokens 帧=usage 真值;无真值按字符长度粗估并注明「估算」,禁假计费数 */}
        <span className="text-meta font-mono text-jz-muted whitespace-nowrap tabular-nums" data-token-hint
 title={tokens > 0 ? '本次回答 usage 真值(SSE tokens 帧)' : '按字符长度粗估(≈4 字符/token,估算口径,非计费值)'}>
 {tokens > 0 ? `本次 ${tokens} tokens(真值)` : input.trim() ? `≈${Math.max(1, Math.ceil(input.length / 4))} tokens(估算)` : ''}
        </span>
        <span className="hidden xl:inline text-meta text-jz-muted whitespace-nowrap" data-ai-disclaimer>
          回答基于本地知识库检索增强,出处以 citations 为准
        </span>
        <button onClick={doSend} disabled={busy || !input.trim()}
 className="flex-none w-9 h-9 rounded-pill bg-jz-brand text-jz-on-brand flex items-center justify-center text-section font-semibold disabled:opacity-30 hover: transition-shadow"
 data-send-btn title="发送(Enter / Shift+Enter 换行)">➤</button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
    <p className="flex flex-none items-center gap-2 border-b border-jz-border bg-jz-inset px-4 py-1.5 text-meta text-jz-ink-2" data-ai-archive-note>
      <span className="flex-1">AI 助手归档。新的审计对话请用 <Link to="/agent" className="font-medium text-jz-ink underline" data-ai-archive-agent>Agent</Link>。</span>
      {listRead.state === 'failed' && (
        <span className="lg:hidden" data-state={listRead.status === 403 || listRead.status === 401 ? 'forbidden' : listRead.stale ? 'stale' : 'error'} data-ai-list-note>
          {listRead.status === 403 || listRead.status === 401 ? '当前账号不能读取会话列表。' : listRead.stale ? '刷新失败,会话列表是上次读到的。' : '会话列表未读取,数量未知。'}
        </span>
      )}
      <button type="button" onClick={loadSessions} className="rounded-control underline" data-ai-refresh>{listRead.state === 'failed' && listRead.status !== 403 && listRead.status !== 401 && !listRead.stale ? '重试' : '刷新'}</button>
    </p>
    <div className="flex min-h-0 flex-1">
      {/* Session list: a column from 1024 px, a drawer below. */}
      {sessOpen && <div className="fixed inset-0 top-jz-topbar z-40 bg-jz-scrim/30 lg:hidden" onClick={() => setSessOpen(false)} data-ai-session-overlay />}
      <div className={`${sessOpen ? 'fixed bottom-0 left-0 top-jz-topbar z-50 flex shadow-dialog tablet:left-jz-sidebar-collapsed' : 'hidden'} lg:static lg:flex lg:shadow-none`} data-ai-session-pane>
        <SessionSidebar
 sessions={sessions} current={current} taskMap={taskMap} grp={grp} setGrp={setGrp} searchRef={searchRef}
 onSelect={(id) => { setCurrent(id); setSessOpen(false); }} onNew={newChat} onTogglePin={togglePin} onRename={(s) => setAsk({ kind: 'rename', s })} onDelete={(s) => setAsk({ kind: 'del', s })}
 onBatchDelete={batchDelete} read={listRead} onReload={loadSessions}
 />
      </div>

      {/* 中列: 对话 */}
      <div className="flex-1 min-w-0 flex flex-col relative">
        {/* 顶栏: 遥测胶囊 + 关联任务 + 开发者模式 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-jz-border px-4 py-1.5 [&>*]:whitespace-nowrap">
          <button type="button" onClick={() => setSessOpen(true)} data-ai-session-toggle aria-label="打开会话列表" title="会话列表"
            className="grid h-8 w-8 place-items-center rounded-control text-jz-muted hover:bg-jz-surface-2 hover:text-jz-ink lg:hidden max-[760px]:h-jz-touch max-[760px]:w-jz-touch">
            <PanelLeft size={16} aria-hidden />
          </button>
          <span className="min-w-0 truncate text-meta text-jz-muted">{auditTids.length ? `任务追问模式 #${auditTids.join('+')}` : 'APK 安全审计助手'}</span>
          <span className="flex-1" />
          {/* P2-②: 会话遥测胶囊(usage-summary 真值;点击唤起检视器) */}
          <button onClick={() => setInspOpen((v) => !v)} data-usage-pill
 className="flex items-center gap-1 px-2 py-0.5 rounded-pill bg-jz-surface/70 border border-jz-border text-meta font-mono text-jz-muted hover:text-jz-brand hover:border-jz-brand/50 tabular-nums whitespace-nowrap"
 title="会话 Token 遥测(点击展开检视器)">
 {usage?.total?.count > 0 ? `${usage.total.count} 次 · 均 ${usage.total.avg_latency_ms ?? '—'}ms` : '无调用'}
          </button>
          {/* R103-12①: 关联已完成审计任务(既有 POST /link 端点零改动,按任务归类数据入口)
              全平台升级 Step4②: 下拉换 SearchableTaskCombobox(#ID/包名/应用名模糊+快速筛选) */}
          <div className="relative">
            <button onClick={() => setLinkOpen((v) => !v)} disabled={!current} data-link-btn
 className="flex items-center gap-0.5 text-meta text-jz-muted hover:text-jz-brand disabled:opacity-40"
 title="关联已完成审计任务(会话按任务归类)">
              <Link2 size={12} /> 关联任务
            </button>
            {linkOpen && (
              <div className="absolute right-0 top-6 z-20 w-[320px] rounded-card bg-jz-surface p-2 shadow-card space-y-1.5" data-link-menu>
                <SearchableTaskCombobox
 items={linkItems}
 value={boundTask?.id ?? null}
 onChange={(tid) => { if (tid) { linkTask(tid); setLinkOpen(false); } }}
 probe="ai-link"
 align="right"
 placeholder="选择已完成审计任务(#ID/包名)…"
 emptyText="库内暂无已完成审计任务"
 />
                {boundTask && (
                  <button onClick={() => { unlinkTask(); setLinkOpen(false); }} data-link-unlink
 className="w-full text-left px-2 py-1 rounded-control text-meta text-jz-sev-critical hover:bg-jz-sev-critical/10"
 title="解除关联(转自由对话,沿用端点既有语义)">
                    解除当前关联(#{boundTask.id})
                  </button>
                )}
              </div>
            )}
          </div>
          {/* 全平台升级 Step4②: 导出当前问答(Markdown/JSON)+ 导入会话(本地只读) */}
          <ExportMenu baseName={`ai_chat_${current || 'session'}`}
 rows={messages.map((m, i) => ({ idx: i + 1, role: m.role, content: m.content }))}
 columns={['idx', 'role', 'content']}
 title={`AI 助手问答记录(${messages.length} 条)`} label="导出问答" probe="ai-chat" />
          <button onClick={() => setImportOpen(true)} data-chat-import-btn
 title="导入会话(json/csv/md)——前端本地解析,只读视图呈现;后端无消息追加端点,不假写会话"
 className="flex items-center gap-0.5 text-meta text-jz-muted hover:text-jz-brand">
            导入会话(本地)
          </button>
          <label className="flex items-center gap-1.5 cursor-pointer text-meta text-jz-muted" data-devmode-toggle>
            <input type="checkbox" checked={devMode} onChange={(e) => setDevMode(e.target.checked)} />
            开发者模式
          </label>
        </div>

        {/* 全平台升级 Step4②: 导入会话本地只读视图(后端无消息追加端点——不假写,显式标注) */}
        {importedLocal && (
          <div className="mx-4 mt-1 rounded-card bg-jz-sev-medium/10 border border-jz-sev-medium/30 px-3 py-2 space-y-1.5" data-chat-imported-view>
            <div className="flex items-center gap-2 text-meta">
              <span className="font-semibold text-jz-sev-medium">导入会话(本地只读): {importedLocal.name}</span>
              <span className="text-jz-muted tnum">{importedLocal.messages.length} 条</span>
              <span className="flex-1" />
              <button onClick={() => setImportedLocal(null)} className="text-jz-muted hover:text-jz-sev-critical">✕ 关闭</button>
            </div>
            <div className="max-h-60 overflow-auto space-y-1.5">
 {importedLocal.messages.map((m, i) => (
                <div key={i} className="text-meta leading-5">
                  <span className={`font-mono mr-1.5 flex-none ${m.role === 'user' ? 'text-jz-brand' : 'text-jz-brand'}`}>{m.role === 'user' ? '问' : '答'}</span>
                  <span className="text-jz-ink-2 whitespace-pre-wrap break-words">{String(m.content).slice(0, 600)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {heroMode ? (
          /* P2-①: Hero 空态——欢迎/输入底座/建议卡聚拢视口中心 */
          <div className="flex-1 overflow-auto" data-empty-state>
            <div className="min-h-full flex flex-col justify-center max-w-[760px] mx-auto px-4 py-8 w-full">
              <div className="text-center mb-5">
                <div className="text-title font-semibold text-jz-ink mb-1">APK 安全审计助手</div>
                <div className="text-meta text-jz-muted">基于本地知识库的检索增强问答——回答带出处</div>
              </div>
              {composer}
              <div className="grid grid-cols-2 gap-3 mt-5">
 {SUGGESTS.map((s, i) => (
                  <button key={i} onClick={() => askSuggest(s.q)} data-suggest-card={i}
 className="text-left px-3.5 py-3 rounded-panel bg-jz-surface shadow-card
 hover:-translate-y-0.5 hover:shadow-card transition-all duration-150">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span aria-hidden className={`w-7 h-7 rounded-control bg-jz-surface-2 ${s.tint} inline-flex items-center justify-center flex-none`}>
                        <s.icon size={15} />
                      </span>
                      <span className="text-body font-semibold text-jz-ink" data-suggest-title>{s.title}</span>
                    </div>
                    <div className="text-meta text-jz-muted leading-relaxed line-clamp-2" data-suggest-preview>{s.q}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* 消息区(docked) */}
            <div className="flex-1 overflow-auto" ref={scrollRef}>
              <div className="max-w-[760px] mx-auto px-4 py-4">
 {messages.map((m, i) => m.role === 'user' ? (
                  <div key={i} className="flex justify-end mb-6" data-user-bubble>
                    {/* R117-8①: break-words 防长无空格串撑破气泡 */}
                    <div className="max-w-[76%] rounded-panel rounded-br-tag px-4 py-2.5 bg-jz-brand text-jz-on-brand shadow-card text-body leading-[1.7] whitespace-pre-wrap break-words">{m.content}</div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-start mb-6" data-assistant-card>
                    {/* R104-4③: AI 气泡靠左透明底无厚框(V3);身份行/思维链/出处/代码块各自带轻底不依赖父容器 */}
                    <div className="max-w-[92%] w-full px-3 py-2">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span aria-hidden data-ai-avatar className="flex-none w-6 h-6 rounded-pill bg-jz-brand grid place-items-center text-jz-on-brand text-meta font-semibold shadow-card">AI</span>
                        {(m as any)._audit || m._identity ? (
                          <div className="flex items-center gap-1.5 text-meta text-jz-muted" data-identity-line>
                            <span className="px-1.5 rounded-control bg-jz-brand/10 text-jz-brand">{m._identity_user || 'admin'}</span>
                            <span>·</span>
                            <span className="font-mono">{(m as any)._audit?.model || m._identity_model || 'deepseek-chat'}</span>
                            {(m as any)._audit?.llm === 'degraded' && <span className="px-1 rounded-control bg-jz-sev-medium/15 text-jz-sev-medium">离线模板(降级)</span>}
                            {(m as any)._identity_llm === 'degraded' && <span className="px-1 rounded-control bg-jz-sev-medium/15 text-jz-sev-medium" data-identity-degraded>降级(LLM 失败)</span>}
                            {(m as any)._audit?.mounted?.length ? <span className="text-jz-muted">· 技能: {(m as any)._audit.mounted.join(' / ')}</span> : null}
                          </div>
                        ) : null}
                      </div>
                      {/* P2-③: 流式观测卡(仅流式目标消息渲染;真值相位+真实检索命中数) */}
                      {busy && i === messages.length - 1 && live.phase !== 'idle' && (
                        <LiveStreamCard phase={live.phase} reasoningLen={(m._reasoning || '').length} genChars={(m.content || '').length}
 hitCount={live.hitCount} historyMsgs={live.historyMsgs} promptChars={live.promptChars} routeModel={live.routeModel} />
 )}
 {(() => {
 // R103-12④: 思维链折叠面板——流式 _reasoning 优先;历史消息读 metadata.reasoning;空=模型无思维链,面板不渲染不造假
 const r: string = (m as any)._reasoning || (() => {
                          try { const mt = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata; return mt?.reasoning || ''; } catch { return ''; }
                        })();
                        if (!r) return null;
                        return (
                          <details className="mb-2 rounded-card bg-jz-surface-2/40" data-reasoning-panel>
                            <summary className="cursor-pointer select-none px-2 py-1 text-meta text-jz-muted">深度思考过程({r.length} 字 · 模型思维链)</summary>
                            <pre className="px-2 pb-1.5 max-h-48 overflow-auto text-meta leading-4 text-jz-muted whitespace-pre-wrap">{r}</pre>
                          </details>
                        );
                      })()}
                      {m.content ? <MarkdownMessage content={m.content} /> : busy && i === messages.length - 1 && live.phase !== 'idle' ? null : <span className="text-meta text-jz-muted">思考中…</span>}
                      {/* P2-③: done 实测摘要行(_meta 真值回填) */}
                      {(m as any)._meta && <AnswerMetaLine meta={(m as any)._meta} />}
 {(m._audit || (m as any)._citations) && (() => {
                        // P2.5: 普通流式回答也带出处(done 前随 retrieve 步事件渐进到达);audit 链保留模型行+代码出处
                        const cits = m._audit?.citations || (m as any)._citations || [];
                        const srcs = m._audit ? [...new Set((String(m.content || '').match(/[\w./$-]+\.(?:java|kt|smali|xml|md)(?::\d+)?/g) || []))].slice(0, 6) : [];
                        return (
                          <div className="mt-2 pt-2">
                            {m._audit?.llm === 'degraded' && <div className="mb-1"><Badge level="medium">离线模板(降级)</Badge></div>}
                            {m._audit && (
                              <div className="text-meta text-jz-muted mb-1">
                                {(m._audit.llm_used ? `模型: ${m._audit.model}` : '离线摘要')} · 出处:{(srcs.length || cits.length) ? '' : ' 本回答无本地出处'}
                              </div>
                            )}
                            {/* P2-⑤: Citations 卡片网格(snippet 存量真值;score 后端有 bm25 相对分才渲染;⤢ 对照=kb-chunk 全文双栏) */}
                            <CitationGrid citations={cits} sources={srcs} sourceTaskId={m._audit?.tid || Number(cits[0]?.task_id) || 0} onOpenSource={openSource} onInspect={inspectChunk} />
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
                {srcPreview && (
                  <div className="mb-6 rounded-panel bg-jz-surface-2 p-2" data-source-preview>
                    <div className="flex items-center gap-2 text-meta">
                      <span className="text-jz-brand font-mono truncate">{srcPreview.path}</span>
                      <span className="flex-1" />
                      <button onClick={() => setSrcPreview(null)} className="text-jz-muted hover:text-jz-ink">✕</button>
                    </div>
                    <pre className="mt-1 max-h-48 overflow-auto text-meta leading-4 text-jz-ink-2 whitespace-pre">{srcPreview.text}</pre>
                  </div>
                )}
              </div>
            </div>
            {/* 底部输入(docked 锚定) */}
            <div className="max-w-[760px] mx-auto px-4 py-3 w-full">{composer}</div>
          </>
        )}
      </div>

      {/* 右列: 溯源对照双栏(P3-①: citation ⤢ → kb-chunk 全文,Markdown 渲染) */}
      {chunkPreview && <div className="fixed inset-0 top-jz-topbar z-40 bg-jz-scrim/30 lg:hidden" onClick={() => setChunkPreview(null)} data-chunk-overlay />}
      {chunkPreview && (
        <div role="complementary" aria-label="引用原文"
          className="fixed bottom-0 right-0 top-jz-topbar z-50 flex w-full max-w-[380px] flex-col border-l border-jz-border bg-jz-surface shadow-dialog lg:static lg:z-auto lg:w-[380px] lg:flex-none lg:bg-jz-surface-2 lg:shadow-none" data-chunk-pane>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-jz-border/60">
            <span className="text-meta font-semibold text-jz-ink truncate flex-1" title={chunkPreview.title}>{chunkPreview.title}</span>
            <span className="text-meta font-mono text-jz-muted whitespace-nowrap">task{chunkPreview.task_id}</span>
            <button type="button" onClick={() => setChunkPreview(null)} data-chunk-close title="关闭对照" aria-label="关闭引用原文"
 className="grid h-8 w-8 place-items-center rounded-control text-jz-muted hover:bg-jz-surface-2 hover:text-jz-ink"><X size={14} aria-hidden /></button>
          </div>
          <div className="flex-1 overflow-auto px-2.5 py-2">
            <div className="text-meta font-mono text-jz-muted mb-1.5 truncate">{chunkPreview.ref}</div>
            <MarkdownMessage content={chunkPreview.body} />
          </div>
        </div>
      )}

      {/* 全平台升级 Step4②: 通用导入弹窗(会话本地只读视图) */}
      <UniversalImportModal
 open={importOpen}
 title="导入会话(本地只读视图)"
 hint="json: [{role, content}] 或 {messages:[...]};csv: role/content 两列;md 问答表——解析后仅本地只读呈现,不写后端"
 onClose={() => setImportOpen(false)}
 validateRow={(row) => (String(row.role || '').trim() && String(row.content ?? '').trim() ? '' : '行需含 role 与 content 字段')}
 onImportSuccess={(r: UniversalImportResult) => {
 setImportedLocal({
 name: `${r.format.toUpperCase()} 导入`,
 messages: r.rows.map((x) => ({ role: String(x.role || 'user').toLowerCase().includes('assistant') ? 'assistant' : 'user', content: String(x.content ?? '') })),
 });
 setImportOpen(false);
 }}
 />

      {/* 右列: 检视器面板(P2-②: 遥测+调试收编;修正④: AI 页专用轻量件,不搬渗透工作台抽屉) */}
      {inspOpen && <React.Suspense fallback={null}><InspectorPanel
 open={inspOpen} devMode={devMode} usage={usage} streamTokens={tokens}
 onLoadUsage={loadUsage} onClose={() => setInspOpen(false)}
 auditTasks={auditTasks} auditTids={auditTids} toggleAuditTid={toggleAuditTid}
 onPreview={loadPromptPreview} onRun={runPrompt} runBusy={runBusy} canRun={!!(current && input.trim())}
 pv={pv} runRes={runRes}
 /></React.Suspense>}
    </div>
      {ask && (
        <React.Suspense fallback={null}>
          <ArchiveDialogs ask={ask} onClose={() => setAsk(null)} onRun={() => { void doRunPrompt(); }} onDone={afterAsk} />
        </React.Suspense>
      )}
    </div>
  );
};

export default AiAssistantPage;
