// knowledgeModel.ts — the knowledge page's data model: row types, source classification, path shortening,
// candidate parsing and the pre-review verdict. Pure functions only; moved from the retired skills page.
// Every reason shown on a candidate comes from fields the backend already returns (note, evidence_refs, source,
// task_id, session_id, decided_at); a field that is missing is named as missing, never filled in.

export type SkillRow = {
  id: number; name: string; scene?: string | null; success_rate?: number | null;
  source_path: string; last_verified_at?: number | null; description?: string | null; status?: string;
  uses?: number | null; wins?: number | null;   // R125 回流真值(R126 透出)
};

/** R113-1③: KB 自学习候选(post_mortem 产出,人工审核零自动转正)。
 *  「待审核」分组仅 admin 可见(后端 /api/kb/candidates 同闸);通过→写入 kb_index 正式条目,拒绝→留档不删。 */
export type KBCandidate = {
  id: number; task_id: number; session_id?: number | null;
  category: string; content: string; evidence_refs: string[];
  status: 'pending' | 'approved' | 'rejected';
  source?: string; created_at?: number; decided_at?: number | null;
  note?: string | null;   // R268: LLM 预审建议([预审] verdict: reason)
};

export const KB_CAT_LABEL: Record<string, string> = {
 burp_capture: 'Burp 抓包路径', decrypt_recipe: '解密方法',
 biz_extract: '信息提取规则', waf_bypass: 'WAF 规则核对',
};

export const fmtTime = (ts?: number | null) => {
 if (!ts) return '—';
 const d = new Date(ts * 1000);
 return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 来源归类(单一推导,同时供 Tabs 与来源标签):场景串为扫描/导入端点写入的真值,蒸馏以 status/task: 指针判定。
 * R127: disabled 不再抢 Tab(33 条平台模块停用后仍留在原 Tab,卡上停用徽章+灰度+启用钮标识)。 */
export const kindOf = (s: SkillRow): { tab: string; label: string } => {
  if (s.status === 'draft' || (s.source_path || '').startsWith('task:')) return { tab: '蒸馏草案', label: '蒸馏' };
  const sc = s.scene || '';
  if (sc.startsWith('导入')) return { tab: '导入', label: '导入' };
  if (sc.startsWith('claude skill 归档')) return { tab: 'Claude 归档', label: '内置' };
  if (sc.startsWith('claude skill')) return { tab: 'Claude 技能', label: '内置' };
  if (sc.startsWith('pentest 平台模块')) return { tab: '平台模块', label: '内置' };
  if (sc.startsWith('项目 rules')) return { tab: '项目 rules', label: '内置' };
  return { tab: sc || '未分类', label: '其他' };
};


/** Candidate category: a quiet dot colour next to the label (no tinted fills). */
export const catDotCls = (c: KBCandidate): string => {
  if (c.category === '壳档案') return 'bg-jz-brand';
  if (c.category === 'decrypt_recipe') return 'bg-jz-sev-low';
  if (c.category === 'burp_capture') return 'bg-jz-sev-high';
  if (c.category === 'waf_bypass') return 'bg-jz-sev-critical';
  if (c.category === 'biz_extract') return 'bg-jz-teal';
  return 'bg-jz-border-strong';
};

/** 绝对路径缩短(来源行/任务目录防裸奔): 保留末 3 段,前缀 …/ 标记截断。 */
export const shortenAbsPath = (p: string): string => {
 const norm = String(p || '').replace(/\\/g, '/');
 const parts = norm.split('/').filter(Boolean);
 return parts.length > 3 ? '…/' + parts.slice(-3).join('/') : norm;
};

export type ShortPath = { icon: string; label: string };

/** formatSkillPath — 技能注册路径精简(严禁裸露 /Users/... 绝对路径):
 * .claude/skills/xxx / pentest/xxx.py / task:N / 本地层 / host/path;
 * 完整原文由调用方放 title+复制。 */
export const formatSkillPath = (raw: string): ShortPath => {
 if (!raw) return { icon: '', label: '(无注册路径)' };
 if (raw.startsWith('local:')) return { icon: '', label: '本地层(浏览器视图内)' };
 if (raw.startsWith('task:')) return { icon: '', label: raw.length > 34 ? raw.slice(0, 34) + '…' : raw };
 if (/^https?:\/\//i.test(raw)) {
 try {
 const u = new URL(raw);
 return { icon: '', label: cutPath(u.host + u.pathname, 48) };
 } catch { /* 畸形 URL 走通用路径 */ }
 }
 const norm = raw.replace(/\\/g, '/');
 const low = norm.toLowerCase();
 const cIdx = low.indexOf('.claude/skills/');
 if (cIdx >= 0) {
 const seg = norm.slice(cIdx).replace(/\/SKILL\.md$/i, '');
 return { icon: '', label: cutPath(seg, 48) };
 }
 const pIdx = low.lastIndexOf('/pentest/');
 if (pIdx >= 0) {
 const seg = norm.slice(pIdx + 1);
 return { icon: /\.py(?::|$)/i.test(seg) ? '' : '', label: cutPath(seg, 48) };
 }
 const rIdx = low.lastIndexOf('/rules/');
 if (rIdx >= 0) return { icon: '', label: cutPath(norm.slice(rIdx + 1), 48) };
  const parts = norm.split('/').filter(Boolean);
  if (parts.length <= 2) return { icon: '', label: cutPath(norm, 48) };
 return { icon: '', label: cutPath('…/' + parts.slice(-2).join('/'), 48) };
};

const cutPath = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);

// ---------------- 候选原文结构化解析器 ----------------

export type CandVectorBlock = { key: string; items: string[]; empty: boolean; ai?: string };
export type CandSection = { label: string; body: string; long: boolean };
export type ParsedCand = {
 title: string;
 trigger: string; // 【触发条件】/【核心策略】→ sky 高亮框
 vectors: CandVectorBlock[]; // 检测向量段内 ▍xxx: 分块
 vectorStray: string; // 检测向量段内无分块宿主的散行(兜底不丢内容)
 soFingerprint: string; // 【So 指纹】
 weapons: { from: string; to: string }[]; // 【绕过武器映射】按 ;/；拆
 verify: string; // 【验证状态】
 source: string; // 【来源】(绝对路径已缩短)
 others: CandSection[]; // 其余【】段(症状/根因/处置/步骤/预期/AI 剧本/结构化事实…)
 plain: string[]; // 无标记兼容段落
 refs: string[]; // findings.db#xxx 引用
};

/** parseCandidateRawText — 候选原文→结构化字段(纯函数,零端点)。
 * 标记段: 【标题】【触发条件】【检测向量…】【So 指纹】【绕过武器映射】【验证状态】【来源】;
 * ▍root:/▍frida:/▍proxy:/▍ptrace:/▍debug: 等向量分块按行归组,`- x :: y` 为证据项,▸AI分析 为注解;
 * 无方括号内容(如 post_mortem 自由段)兼容: 首句截断为标题,全文进核心策略高亮框(零丢内容);
 * findings.db# 引用全局提取。真实数据覆盖: packer_probe 壳档案全标记段 / post_mortem 自由段 /
 * 探索剧本与异常处置的通用【】段(落入 others,不丢不吞)。 */
export function parseCandidateRawText(rawText: string): ParsedCand {
 const text = String(rawText || '');
 const p: ParsedCand = {
 title: '', trigger: '', vectors: [], vectorStray: '', soFingerprint: '',
 weapons: [], verify: '', source: '', others: [], plain: [], refs: [],
 };
 p.refs = [...new Set(text.match(/findings\.db#[0-9a-zA-Z]{4,}/g) || [])];

 // ── 无标记兼容: 段落内容整体视为核心策略正文 ──
 if (!/【[^】]+】/.test(text)) {
 const paras = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
 if (paras.length === 0) return p;
 p.title = cutSentence(paras[0], 48);
 p.trigger = text.trim();
 return p;
 }

 // ── 按【…】切段(header 与余文同行兼容)──
 type Sec = { label: string; lines: string[] };
 const secs: Sec[] = [];
 let cur: Sec | null = null;
 for (const ln of text.split('\n')) {
 const m = ln.match(/^\s*【([^】]{1,30})】\s*(.*)$/);
 if (m) {
 cur = { label: m[1].trim(), lines: m[2] ? [m[2]] : [] };
 secs.push(cur);
 } else if (cur) {
 cur.lines.push(ln);
 } else if (ln.trim() && !p.title) {
 p.title = ln.trim().slice(0, 60); // 标记前导散行兜底为标题
 }
 }

 let vecOpen: CandVectorBlock | null = null;
 for (const sec of secs) {
 const body = sec.lines.join('\n').trim();
 if (/^标题$|^主题$/.test(sec.label)) {
 p.title = body.split('\n')[0] || body;
 } else if (/触发|核心策略|适用场景/.test(sec.label)) {
 p.trigger = p.trigger ? `${p.trigger}\n${body}` : body;
 } else if (sec.label.includes('检测向量')) {
 for (const ln of sec.lines) {
 const bm = ln.match(/^\s*[▍▌]\s*([^:：]{1,24}):(.*)$/);
 if (bm) {
 vecOpen = { key: bm[1].trim(), items: [], empty: /未检出|无/.test(bm[2]) };
 p.vectors.push(vecOpen);
 continue;
 }
 if (!vecOpen) {
 if (ln.trim()) p.vectorStray += (p.vectorStray ? '\n' : '') + ln.trim();
 continue;
 }
 const im = ln.match(/^\s*[-•]\s+(.+)$/);
 if (im) { vecOpen.items.push(im[1].trim()); vecOpen.empty = false; continue; }
 const am = ln.match(/▸\s*AI分析[:：]\s*(.*)$/);
 if (am) { vecOpen.ai = am[1].trim(); continue; }
 if (ln.trim()) vecOpen.items.push(ln.trim());
 }
 } else if (/So 指纹|指纹/.test(sec.label)) {
 p.soFingerprint = body.replace(/\n+/g, ' ');
 } else if (sec.label.includes('绕过武器映射') || sec.label.includes('武器映射')) {
 p.weapons = body.split(/[;；]/).map((s) => s.trim()).filter(Boolean).map((seg) => {
 const m = seg.match(/^(.+?)\s*(?:→|➔|->|=>)\s*(.*)$/);
 if (!m) return { from: seg, to: '' };
 const to = m[2].trim().replace(/^\[/, '').replace(/\]$/, '').replace(/[,，]\s*/g, ' / ').trim();
 return { from: m[1].trim(), to };
 });
 } else if (/验证/.test(sec.label)) {
 p.verify = body.replace(/\n+/g, ' ');
 } else if (/来源|出处/.test(sec.label)) {
 // 来源行内绝对路径缩短(防 /Users/... 裸奔)
 p.source = body.replace(/\n+/g, ' ').replace(/\/Users\/[^\s"')]+/g, (mm) => shortenAbsPath(mm));
 } else if (body) {
 p.others.push({ label: sec.label, body, long: body.length > 220 || body.split('\n').length > 6 });
 }
 }
 if (!p.title) {
 const firstLine = text.split('\n').map((s) => s.trim()).find(Boolean) || '';
 p.title = cutSentence(firstLine, 48);
 }
 return p;
}

const cutSentence = (s: string, n: number) => {
  if (s.length <= n) return s;
 const head = s.slice(0, n);
 const stop = Math.max(head.lastIndexOf('。'), head.lastIndexOf('；'), head.lastIndexOf(';'), head.lastIndexOf('，'), head.lastIndexOf(','));
 return (stop > 12 ? head.slice(0, stop + 1) : head) + '…';
};


/** The pre-review verdict written into `note` by POST /api/kb/candidates/pre-review: `[预审] adopt|reject|needs_info: reason`. */
export type PreVerdict = 'adopt' | 'reject' | 'needs_info';
export const PRE_LABEL: Record<PreVerdict, string> = { adopt: '建议通过', reject: '建议拒绝', needs_info: '待补信息' };
export const parsePre = (note?: string | null): { verdict: PreVerdict | null; reason: string } => {
  const n = String(note || '');
  const m = n.match(/^\[预审\]\s*(adopt|reject|needs_info)\s*:?\s*([\s\S]*)$/);
  if (!m) return { verdict: null, reason: '' };
  return { verdict: m[1] as PreVerdict, reason: m[2].trim() };
};
export type PreFilter = 'all' | 'adopt' | 'reject' | 'needs' | 'none' | 'norefs';
export const PRE_FILTERS: Array<[PreFilter, string]> = [['all', '全部'], ['adopt', '建议通过'], ['reject', '建议拒绝'], ['needs', '待补信息'], ['none', '未预审'], ['norefs', '没有证据引用']];
export const matchPre = (c: KBCandidate, f: PreFilter): boolean => {
  const v = parsePre(c.note).verdict;
  if (f === 'all') return true;
  if (f === 'none') return v == null;
  if (f === 'norefs') return !(Array.isArray(c.evidence_refs) && c.evidence_refs.length);
  return v === (f === 'needs' ? 'needs_info' : f);
};

export const isLocal = (s: SkillRow) => (s.source_path || '').startsWith('local:');
export const STATUS_LABEL: Record<string, string> = { active: '在用', draft: '草案', disabled: '已停用' };

export type SortKey = 'default' | 'uses' | 'winrate' | 'verified';
export const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'default', label: '默认排序' }, { id: 'uses', label: '实战次数↓' }, { id: 'winrate', label: '胜率↓' }, { id: 'verified', label: '最近验证↓' },
];

/** Category, search and sort over the library rows (search: name, description, scene, source path). */
export const filterSkills = (rows: SkillRow[], tab: string, q: string, sort: SortKey): SkillRow[] => {
  let list = tab === '全部' ? rows : rows.filter((s) => kindOf(s).tab === tab);
  const needle = q.trim().toLowerCase();
  if (needle) list = list.filter((s) => `${s.name} ${s.description || ''} ${s.scene || ''} ${s.source_path || ''}`.toLowerCase().includes(needle));
  if (sort === 'default') return list;
  return [...list].sort((a, b) => {
    if (sort === 'uses') return (b.uses || 0) - (a.uses || 0);
    if (sort === 'verified') return (b.last_verified_at || 0) - (a.last_verified_at || 0);
    const au = a.uses ?? 0, bu = b.uses ?? 0;
    const ra = au > 0 ? (a.wins || 0) / au : -1; // no outcome samples sort last; never treated as 0 %
    const rb = bu > 0 ? (b.wins || 0) / bu : -1;
    return rb - ra;
  });
};

/** Categories present in the rows, with counts, most first. */
export const categoriesOf = (rows: SkillRow[]): Array<[string, number]> => {
  const m = new Map<string, number>();
  rows.forEach((s) => { const k = kindOf(s).tab; m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

export const LOCAL_KEY = 'apksec-skills-local';
export const readLocal = (): SkillRow[] => { try { const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
export const writeLocal = (list: SkillRow[]) => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch { /* quota: the list stays in memory */ } };
