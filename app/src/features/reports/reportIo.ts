// reportIo.ts — 报告中心纯前端导入/导出工具(Blob+createObjectURL 下载 / CSV 加 \uFEFF BOM /
// JSON+Markdown 完整报告合成 / json·csv·sarif 导入解析 / 去重追加与覆盖合并 / 导入模板)。
// 零后端写入: 一切导出=既有端点/页面态数据的展示层封装;一切导入=本地暂存层合并。

// ---------- 下载原语 ----------
export const download = (name: string, data: BlobPart, mime: string) => {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

// ---------- CSV(带 BOM,Excel 直开不乱码) ----------
export const csvCell = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export type CsvRow = Array<string | number | null | undefined>;
export const toCsv = (rows: CsvRow[]): string =>
  '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
export const downloadCsv = (name: string, rows: CsvRow[]) => download(name, toCsv(rows), 'text/csv;charset=utf-8');
export const downloadJson = (name: string, obj: unknown) =>
  download(name, JSON.stringify(obj, null, 2), 'application/json');
export const downloadText = (name: string, text: string, mime = 'text/markdown;charset=utf-8') =>
  download(name, text, mime);

/** CSV 解析(状态机: 引号内逗号/换行/双写引号;容忍 CRLF/BOM) */
export const parseCsv = (text: string): string[][] => {
  const s = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
};

// ---------- 组件路径派生(后端无 component 字段: 从 evidence 文件:行号 定位行提取,无则空串) ----------
export const componentOf = (f: any): string => {
  if (f?.component) return String(f.component);
  const m = String(f?.evidence || '').match(/([A-Za-z0-9_./$\\-]+(?:\.java|\.kt|\.smali|\.xml|\.so|\.js)):\d+/);
  return m ? m[1] : '';
};

// ---------- ① 漏洞明细 CSV(ID/等级/名称/组件路径/MASVS/证据/建议) ----------
export const vulnsCsvRows = (rows: any[]): CsvRow[] => [
  ['ID', '等级', '名称', '组件路径', 'MASVS', '证据', '建议'],
  ...rows.map((f) => [f.id, f.severity, f.title, componentOf(f), f.masvs || '', f.evidence || '', f.repro || '']),
];

// ---------- ② 鉴权矩阵 CSV/JSON(序号/端点/匿名/普通/提权状态) ----------
const MX_COLOR_CN: Record<string, string> = { red: '越权暴露', green: '已拦截', yellow: '配置疏漏', gray: '未判定' };
export const matrixCsvRows = (mx: any): CsvRow[] => [
  ['序号', '端点路径', '匿名', '普通', '提权', '匿名响应码', '耗时ms', 'final_url'],
  ...(mx?.rows || []).map((r: any, i: number) => [
    i + 1,
    r.path,
    MX_COLOR_CN[r.color] || (r.color || '未判定'),
    r.authed === 'ui-verified' ? 'UI走查实证' : '未探测',
    '未探测',
    r.anon_code ?? '',
    r.ms ?? '',
    r.final_url || '',
  ]),
];
export const matrixExportJson = (mx: any, sid: number | null) => ({
  kind: 'auth_matrix_export',
  session_id: sid,
  base_url: mx?.base_url || '',
  exported_at: new Date().toISOString(),
  counts: mx?.counts || {},
  rows: mx?.rows || [],
});

// ---------- ③ 完整审计报告(JSON + Markdown) ----------
export type ReportCtx = {
  task: any | null;
  session: any | null;
  summary: any | null;
  domains: Array<{ name: string; count: number }> | null;
  domainsTotal: number;
  vulns: any[];
  mx: any | null;
  compliance: number | null;
};

export const buildFullReportJson = (c: ReportCtx) => ({
  kind: 'apksec_full_audit_report',
  version: 4,
  generated_at: new Date().toISOString(),
  task: c.task ? { id: c.task.id, kind: c.task.kind, package: c.task.package, app_name: c.task.app_name, packer: c.task.packer, status: c.task.status, updated_at: c.task.updated_at } : null,
  session: c.session ? { id: c.session.id, package: c.session.package, status: c.session.status } : null,
  compliance_score: c.compliance,
  compliance_caliber: '100 − report/summary.risk_score 截断 0-100(平台无 MASVS 绝对合规分,挂账)',
  summary: c.summary,
  masvs_domains: c.domains,
  masvs_domains_caliber: '域计数=规则卡实例数(与雷达/图谱一致,同源 masvsDomains.ts)',
  auth_matrix: c.mx ? { base_url: c.mx.base_url, counts: c.mx.counts, rows: c.mx.rows } : null,
  vulns: c.vulns,
});

export const buildFullReportMarkdown = (c: ReportCtx): string => {
  const L: string[] = [];
  const title = `审计报告: ${c.task?.app_name || c.task?.package || c.session?.package || `任务 #${c.task?.id ?? '—'}`}`;
  L.push(`# ${title}`);
  L.push('');
  L.push(`- 生成时间: ${new Date().toLocaleString()}`);
  if (c.task) L.push(`- 任务: #${c.task.id}(${c.task.kind || 'audit'} · ${c.task.status || '—'} · 壳=${c.task.packer || '无'})`);
  if (c.task?.package) L.push(`- 包名: ${c.task.package}`);
  if (c.session) L.push(`- 代表会话: #${c.session.id}`);
  if (c.compliance != null) L.push(`- 合规分: ${c.compliance}/100(口径: 100−risk_score;平台无 MASVS 绝对分,挂账)`);
  if (c.summary) {
    L.push(`- 风险分: ${c.summary.risk_score}(${c.summary.risk_level || '—'}) · 确认高危: ${c.summary.confirmed_high} · 确认: ${c.summary.confirmed_total}`);
    const rp = c.summary.review_progress || {};
    L.push(`- 复核进度: ${rp.pct ?? 0}%(确认 ${rp.confirmed ?? 0} / 排除 ${rp.excluded ?? 0} / 待复核 ${rp.pending ?? 0})`);
    if (c.summary.priority) L.push(`- 修复优先级: ${c.summary.priority}`);
    const top3 = c.summary.top3 || [];
    if (top3.length) L.push(`- Top 风险: ${top3.map((t: any) => `[${t.severity}] ${t.title}`).join(' · ')}`);
  }
  L.push('');
  L.push('## MASVS 合规图谱');
  L.push('');
  L.push('> 计数口径: 规则卡实例数(与雷达一致);无 MASVS 检查项目录,绝对合规率=挂账。');
  L.push('');
  if (c.domains?.length) for (const d of c.domains) L.push(`- ${d.name}: ${d.count} 处违规实例`);
  else L.push('(暂无域聚合数据)');
  L.push('');
  L.push('## 鉴权矩阵(API×Role)');
  L.push('');
  if (c.mx?.rows?.length) {
    if (c.mx.base_url) L.push(`> base_url: ${c.mx.base_url} · 判色: 红=匿名可达 绿=已拦截 黄=配置疏漏 灰=未判定;普通/提权列无探测数据源如实留白。`);
    L.push('');
    L.push('| 序号 | 端点路径 | 匿名 | 普通 | 提权 |');
    L.push('| --- | --- | --- | --- | --- |');
    c.mx.rows.forEach((r: any, i: number) => {
      L.push(`| ${i + 1} | ${String(r.path).replace(/\|/g, '\\|')} | ${MX_COLOR_CN[r.color] || r.color} | ${r.authed === 'ui-verified' ? 'UI走查实证' : '未探测'} | 未探测 |`);
    });
  } else {
    L.push('(该会话无鉴权矩阵: 未完成网关推导或未生成)');
  }
  L.push('');
  L.push(`## 漏洞明细(全部 ${c.vulns.length} 条)`);
  L.push('');
  if (!c.vulns.length) L.push('(无发现)');
  for (const f of c.vulns) {
    L.push(`### [${f.severity}] ${f.title}`);
    L.push('');
    const meta = [`ID: ${f.id}`, f.masvs ? `MASVS: ${f.masvs}` : '', f.state ? `状态: ${f.state}` : '', f.source ? `来源: ${f.source === 'manual' ? '手动新增(本地)' : f.source === 'import' ? '导入(本地)' : '规则引擎'}` : ''].filter(Boolean);
    L.push(meta.join(' · '));
    const comp = componentOf(f);
    if (comp) L.push(`- 组件路径: ${comp}`);
    if (f.evidence) L.push(`- 证据:\n\n\`\`\`\n${String(f.evidence).slice(0, 800)}\n\`\`\``);
    if (f.repro) L.push(`- 建议: ${String(f.repro).slice(0, 400)}`);
    L.push('');
  }
  return L.join('\n');
};

// ---------- ④ 大厅批量汇总 CSV ----------
export const hubSummaryCsvRows = (entries: Array<{ task: any; agg: any }>): CsvRow[] => [
  ['任务ID', '应用名', '包名', '壳', '合规分', '风险级', '确认高危', '确认', '待复核', '已排除', '矩阵红', '矩阵黄', '矩阵绿', '矩阵灰', 'Top域违规', '更新时间'],
  ...entries.map(({ task: t, agg }) => {
    const s = agg?.summary;
    const comp = complianceScoreLocal(s);
    const mc = agg?.mx && agg.mx !== 'error' ? agg.mx : null;
    const top = (agg?.domains?.rows || []).filter((d: any) => d.count > 0).slice(0, 3)
      .map((d: any) => `${d.name}×${d.count}`).join(' ') || (agg?.sid ? '无违规' : '无会话');
    return [
      t.id, t.app_name || '', t.package || '', t.packer || '无壳',
      comp ?? '—', s?.risk_level ?? '—', s?.confirmed_high ?? '—',
      s?.counts?.confirmed ?? '—', s?.counts?.pending ?? '—', s?.counts?.excluded ?? '—',
      mc?.red ?? '—', mc?.yellow ?? '—', mc?.green ?? '—', mc?.gray ?? '—',
      top, t.updated_at || '',
    ];
  }),
];
const complianceScoreLocal = (s: any): number | null =>
  s && typeof s.risk_score === 'number' ? Math.max(0, Math.min(100, 100 - s.risk_score)) : null;

// ---------- 导入: 解析(json/csv/sarif)+ 校验 + 模板 + 合并 ----------
export type ImportTarget = 'vulns' | 'matrix';
export type ImportPreview = {
  target: ImportTarget;
  rows: any[];
  invalid: number;
  errors: string[];
  sevDist: Record<string, number>;
  colorDist: Record<string, number>;
  format: 'json' | 'csv' | 'sarif';
};

const SEV_ALIAS: Record<string, string> = {
  critical: 'critical', high: 'high', medium: 'medium', low: 'low', info: 'info',
  严重: 'critical', 高: 'high', 中: 'medium', 低: 'low', 信息: 'info',
  error: 'high', warning: 'medium', note: 'low', none: 'info',
};
const normSev = (v: string): string => SEV_ALIAS[String(v || '').trim().toLowerCase()] || SEV_ALIAS[String(v || '').trim()] || '';
const COLOR_ALIAS: Record<string, string> = {
  red: 'red', green: 'green', yellow: 'yellow', gray: 'gray', grey: 'gray',
  红: 'red', 绿: 'green', 黄: 'yellow', 灰: 'gray',
  越权: 'red', 越权暴露: 'red', 已拦截: 'green', 拦截: 'green', 配置疏漏: 'yellow', 疏漏: 'yellow', 未判定: 'gray',
};
const normColor = (v: string): string => {
  const k = String(v || '').trim().toLowerCase();
  return COLOR_ALIAS[k] || COLOR_ALIAS[String(v || '').trim()] || '';
};

type ColMap = Record<string, string>;
const matchCols = (header: string[], aliases: ColMap): (string | null)[] =>
  header.map((h) => {
    const k = h.trim().toLowerCase();
    return aliases[k] || aliases[h.trim()] || null;
  });

const VULN_ALIASES: ColMap = {
  '标题': 'title', '名称': 'title', 'title': 'title', 'name': 'title', '规则名': 'title', 'rule': 'title', 'rule_id': 'title',
  '等级': 'severity', '危级': 'severity', '严重度': 'severity', 'severity': 'severity', 'level': 'severity',
  '组件路径': 'component', '组件': 'component', 'component': 'component', 'path': 'component', '文件': 'component',
  'masvs': 'masvs', 'MASVS': 'masvs',
  '证据': 'evidence', 'evidence': 'evidence',
  '建议': 'repro', '修复建议': 'repro', '建议动作': 'repro', 'repro': 'repro', 'recommendation': 'repro', 'advice': 'repro',
};
const MATRIX_ALIASES: ColMap = {
  '端点路径': 'path', '端点': 'path', 'path': 'path', 'url': 'path',
  '匿名': 'anon', 'anon': 'anon', '匿名状态': 'anon',
  '普通': 'authed', 'authed': 'authed', '登录态': 'authed',
  '提权': 'esc', 'esc': 'esc', 'privilege': 'esc',
};

const sevDistOf = (rows: any[]): Record<string, number> => {
  const d: Record<string, number> = {};
  for (const r of rows) d[r.severity] = (d[r.severity] || 0) + 1;
  return d;
};
const colorDistOf = (rows: any[]): Record<string, number> => {
  const d: Record<string, number> = {};
  for (const r of rows) d[r.color] = (d[r.color] || 0) + 1;
  return d;
};

const mkVuln = (o: Partial<any>, i: number, ruleId: string): any => ({
  id: `IMP-${Date.now().toString(36)}-${i}`,
  rule_id: ruleId,
  title: String(o.title || '').trim(),
  severity: normSev(String(o.severity || '')) || 'info',
  masvs: String(o.masvs || '').trim(),
  evidence: String(o.evidence || ''),
  component: String(o.component || ''),
  repro: String(o.repro || ''),
  state: 'confirmed' as const,
  source: 'import' as const,
  phase: 'import',
});

/** 解析导入文本: 按内容嗅探 json/sarif/csv(声明格式仅作提示);返回预览(rows=规范化行,invalid=坏行数) */
export const parseImportText = (text: string, target: ImportTarget): ImportPreview => {
  const t = text.trim();
  const blank: ImportPreview = { target, rows: [], invalid: 0, errors: [], sevDist: {}, colorDist: {}, format: 'csv' };
  if (!t) return { ...blank, errors: ['文件为空'] };

  if (t.startsWith('{') || t.startsWith('[')) {
    let data: any;
    try { data = JSON.parse(t); } catch (e: any) { return { ...blank, format: 'json', errors: [`JSON 解析失败: ${e.message}`] }; }
    // SARIF: runs[].results[]
    if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.runs)) {
      if (target !== 'vulns') return { ...blank, format: 'sarif', errors: ['SARIF 仅支持导入目标=漏洞明细'] };
      const rows: any[] = []; const errors: string[] = [];
      let i = 0;
      for (const run of data.runs) {
        const rules = new Map<string, any>((run?.tool?.driver?.rules || []).map((r: any) => [r.id, r]));
        for (const res of run?.results || []) {
          const rule = rules.get(res.ruleId) || {};
          const msg = res?.message?.text || rule?.shortDescription?.text || res.ruleId || `sarif-${i}`;
          const loc = res?.locations?.[0]?.physicalLocation;
          const comp = loc?.artifactLocation?.uri || '';
          rows.push(mkVuln({
            title: msg, severity: res.level || 'warning', masvs: res?.properties?.masvs || rule?.properties?.masvs || '',
            evidence: [msg, comp ? `文件定位: ${loc?.region?.startLine ? comp + ':' + loc.region.startLine : comp}` : ''].join('\n'),
            component: comp, repro: res?.properties?.fix || rule?.help?.text || '',
          }, i++, String(res.ruleId || 'sarif')));
        }
      }
      const valid = rows.filter((r) => r.title);
      return { target, rows: valid, invalid: rows.length - valid.length, errors, sevDist: sevDistOf(valid), colorDist: {}, format: 'sarif' };
    }
    // 本平台证据包(vulns_evidence_pack): data 三态桶摊平
    if (data && typeof data === 'object' && !Array.isArray(data) && String(data.kind) === 'vulns_evidence_pack' && data.data) {
      const buckets = data.data;
      const rows: any[] = [];
      let i = 0;
      for (const b of 'confirmed pending excluded'.split(' '))
        for (const f of buckets[b] || []) rows.push({ ...mkVuln(f, i++, String(f.rule_id || '')), state: f.state || b });
      return { target, rows, invalid: 0, errors: [], sevDist: sevDistOf(rows), colorDist: {}, format: 'json' };
    }
    // 鉴权矩阵 JSON: {rows:[...]}
    if (target === 'matrix') {
      const raw = Array.isArray(data) ? data : Array.isArray(data.rows) ? data.rows : null;
      if (!raw) return { ...blank, format: 'json', errors: ['JSON 未找到 rows 数组(鉴权矩阵导入需 {rows:[{path,匿名色,authed}]} 或行数组)'] };
      const rows: any[] = []; const errors: string[] = [];
      raw.forEach((r: any, i: number) => {
        const color = normColor(r.color || r.anon || r.匿名 || '');
        if (!r.path && !r['端点路径']) { if (errors.length < 5) errors.push(`第 ${i + 1} 行缺 path`); return; }
        rows.push({
          path: String(r.path || r['端点路径']),
          color: color || 'gray',
          authed: r.authed === 'ui-verified' || r.authed === 'ui走查实证' ? 'ui-verified' : 'skip',
          anon_code: r.anon_code ?? null, ms: r.ms ?? null, final_url: r.final_url || '',
          imported: true,
        });
      });
      return { target, rows, invalid: raw.length - rows.length, errors, sevDist: {}, colorDist: colorDistOf(rows), format: 'json' };
    }
    // 漏洞 JSON: 数组或 {vulns:[]}/{findings:[]}
    const raw = Array.isArray(data) ? data : data && typeof data === 'object' ? (data.vulns || data.findings || data.items || null) : null;
    if (!Array.isArray(raw)) return { ...blank, format: 'json', errors: ['JSON 未找到漏洞数组(支持数组或 {vulns|findings|items:[...]})'] };
    const rows: any[] = []; const errors: string[] = [];
    raw.forEach((r: any, i: number) => {
      const title = r.title || r.name || r['标题'] || r['名称'];
      if (!title) { if (errors.length < 5) errors.push(`第 ${i + 1} 条缺 title/name`); return; }
      rows.push(mkVuln({ ...r, title, severity: r.severity || r.level || r['等级'] || 'info' }, i, String(r.rule_id || r.rule || 'import')));
    });
    const valid = rows.filter((r) => r.title);
    return { target, rows: valid, invalid: raw.length - valid.length, errors, sevDist: sevDistOf(valid), colorDist: {}, format: 'json' };
  }

  // CSV: 表头别名映射
  const grid = parseCsv(text);
  if (!grid.length) return { ...blank, errors: ['CSV 无数据行'] };
  const header = grid[0];
  const aliases = target === 'vulns' ? VULN_ALIASES : MATRIX_ALIASES;
  const cols = matchCols(header, aliases);
  const missing = target === 'vulns' ? ['title', 'severity'] : ['path'];
  for (const need of missing) if (!cols.includes(need))
    return { ...blank, errors: [`CSV 表头缺必需列(${need === 'title' ? '标题/等级' : '端点路径'}),实际表头: ${header.join(' · ')}`] };
  const rows: any[] = []; const errors: string[] = [];
  grid.slice(1).forEach((cells, i) => {
    const o: any = {};
    cols.forEach((c, j) => { if (c) o[c] = (cells[j] ?? '').trim(); });
    if (target === 'vulns') {
      if (!o.title) { if (errors.length < 5) errors.push(`第 ${i + 2} 行缺标题`); return; }
      rows.push(mkVuln(o, i, String(o.rule_id || 'import')));
    } else {
      if (!o.path) { if (errors.length < 5) errors.push(`第 ${i + 2} 行缺端点路径`); return; }
      rows.push({ path: o.path, color: normColor(o.anon) || 'gray', authed: 'skip', anon_code: null, ms: null, final_url: '', imported: true });
    }
  });
  return {
    target, rows, invalid: (grid.length - 1) - rows.length, errors,
    sevDist: target === 'vulns' ? sevDistOf(rows) : {}, colorDist: target === 'matrix' ? colorDistOf(rows) : {},
    format: 'csv',
  };
};

/** 合并策略: dedupe=按标题+组件路径去重追加;override=同键本地条目覆盖(仅本地合并层,后端只读) */
export const mergeLocalVulns = (existing: any[], incoming: any[], strategy: 'dedupe' | 'override'): { merged: any[]; added: number; replaced: number } => {
  const key = (v: any) => `${v.title}|${v.component || ''}`;
  if (strategy === 'override') {
    const map = new Map(existing.map((v) => [key(v), v]));
    let replaced = 0;
    for (const v of incoming) { if (map.has(key(v))) replaced++; map.set(key(v), v); }
    return { merged: Array.from(map.values()), added: incoming.length - replaced, replaced };
  }
  const have = new Set(existing.map(key));
  const add = incoming.filter((v) => !have.has(key(v)));
  return { merged: [...existing, ...add], added: add.length, replaced: 0 };
};

export const mergeMatrixRows = (existingRows: any[] | null, incoming: any[], strategy: 'dedupe' | 'override'): { rows: any[]; added: number; replaced: number } => {
  const base = existingRows || [];
  const byPath = new Map<string, any>(base.map((r) => [r.path, r]));
  let replaced = 0, added = 0;
  for (const r of incoming) {
    if (byPath.has(r.path)) { replaced++; if (strategy === 'override') byPath.set(r.path, r); }
    else { added++; byPath.set(r.path, r); }
  }
  return { rows: Array.from(byPath.values()), added, replaced };
};

export const recountMatrix = (rows: any[]): Record<string, number> => ({
  red: rows.filter((r) => r.color === 'red').length,
  yellow: rows.filter((r) => r.color === 'yellow').length,
  green: rows.filter((r) => r.color === 'green').length,
  gray: rows.filter((r) => r.color === 'gray').length,
});

// ---------- 导入模板 ----------
export const vulnTemplateCsv = (): string => toCsv([
  ['标题', '等级', '组件路径', 'MASVS', '证据', '建议'],
  ['示例: 硬编码 SHA1 摘要(靶场设计样例行,可整行删除后填入)', 'high', 'com/demo/crypto/HashUtil.java:88', 'MASVS-CRYPTO-1', '文件定位: com/demo/crypto/HashUtil.java:88\nString digest = DigestUtils.sha1Hex(input);', '迁移到 AES-GCM/SHA-256,密钥入 KeyStore'],
]);
export const matrixTemplateCsv = (): string => toCsv([
  ['端点路径', '匿名', '普通', '提权'],
  ['/api/user/info', '红', '未探测', '未探测'],
]);
