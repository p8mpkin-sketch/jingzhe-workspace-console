// skillsShared.tsx — 技能知识库页共享类型/纯函数/常量(审核台结构化解析器 + 技能卡路径精简)。
// 字号八档口径: 本目录 font 一律 11/12/13/14/16/20/24/28(text-meta/text-meta/text-label/text-body/text-section/text-title/text-title/text-page)
import React from 'react';
import { Puzzle, FileArchive, FileCode2, ScrollText, Download, FlaskConical, Braces } from 'lucide-react';

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
 burp_capture: 'Burp 抓包路径', decrypt_recipe: '解密套路',
 biz_extract: '信息提取 pattern', waf_bypass: 'WAF 绕过组合',
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

export const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
 'Claude 技能': Puzzle, 'Claude 归档': FileArchive, '平台模块': FileCode2,
 '项目 rules': ScrollText, '导入': Download, '蒸馏草案': FlaskConical,
};
export const iconOf = (s: SkillRow) => KIND_ICON[kindOf(s).tab] || Braces;

/** 色彩分层: 类别→顶部 h-1 渐变指示条(规格锚定: Claude 技能 indigo→purple / 平台模块 emerald→sky;
 *  标准色 500 系双主题可读,带 dark: 400 变体补亮主题差)。 */
export const KIND_GRADIENT: Record<string, string> = {
 'Claude 技能': 'from-jz-brand to-jz-brand dark:from-jz-brand dark:to-jz-brand',
 'Claude 归档': 'from-jz-brand to-jz-brand dark:from-jz-brand dark:to-jz-brand',
 '平台模块': 'from-jz-teal to-jz-brand dark:from-jz-teal dark:to-jz-brand',
 '项目 rules': 'from-jz-amber to-jz-orange dark:from-jz-amber dark:to-jz-orange',
 '导入': 'from-jz-brand to-jz-brand dark:from-jz-brand dark:to-jz-brand',
 '蒸馏草案': 'from-jz-red to-jz-orange dark:from-jz-red dark:to-jz-orange',
};

/** 候选分类彩色徽章(壳档案紫/解密套路青;其余按 vuln token 分色,双主题)。 */
export const catBadgeCls = (c: KBCandidate): string => {
 if (c.category === '壳档案') return 'bg-jz-brand/10 dark:bg-jz-brand/15 text-jz-brand dark:text-jz-brand ring-1 ring-inset ring-jz-brand/25';
 if (c.category === 'decrypt_recipe') return 'bg-jz-sev-low/10 text-jz-sev-low ring-1 ring-inset ring-jz-sev-low/25';
 if (c.category === 'burp_capture') return 'bg-jz-sev-high/10 text-jz-sev-high ring-1 ring-inset ring-jz-sev-high/25';
 if (c.category === 'waf_bypass') return 'bg-jz-sev-critical/10 text-jz-sev-critical ring-1 ring-inset ring-jz-sev-critical/25';
 if (c.category === 'biz_extract') return 'bg-jz-teal/10 text-jz-teal ring-1 ring-inset ring-jz-teal/25';
 return 'bg-jz-brand/10 text-jz-brand ring-1 ring-inset ring-jz-brand/25';
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
 if (!raw) return { icon: '📎', label: '(无注册路径)' };
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

// ---------------- 源码抽屉渲染(R117-7② 口径原样迁入) ----------------

export const SRC_RENDER_MAX_LINES = 400;
/** 源码抽屉行号对齐+零依赖注释着色——行号列等宽右对齐,# 注释灰斜体,
 * 其余原样(不猜语法);超长文件展示层截断 400 行(复制取全量,截断如实标注)。 */
export const renderSourceCode = (code: string): React.ReactNode => {
  const lines = code.split('\n');
  const shown = lines.slice(0, SRC_RENDER_MAX_LINES);
  return (
    <>
 {shown.map((ln, i) => {
        const isComment = /^\s*#/.test(ln);
        return (
          <div key={i} className="flex">
            <span className="w-9 shrink-0 select-none pr-2 text-right text-jz-muted tnum">{i + 1}</span>
            <span className={`whitespace-pre flex-1 ${isComment ? 'text-jz-muted italic' : ''}`}>{ln || ' '}</span>
          </div>
 );
 })}
 {lines.length > SRC_RENDER_MAX_LINES && (
        <div className="pl-11 text-jz-muted">…(共 {lines.length} 行,展示层截断;复制按钮取全量原文)</div>
      )}
    </>
  );
};
