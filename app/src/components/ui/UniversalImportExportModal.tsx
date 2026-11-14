import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, FileJson, FileSpreadsheet, FileText, ShieldCheck, Upload } from 'lucide-react';
// 复用报告中心既有 IO 原语(下载/CSV BOM/CSV 状态机解析)——零重复实现(指令: reportIo 式工具可复用)
import { download, downloadCsv, downloadJson, parseCsv } from '@/features/reports/reportIo';
import { UnifiedModal } from './UnifiedModal';
import { StatusBadge } from './StatusBadge';

/**
 * UniversalImportExportModal — 全平台统一导入/导出底座(本轮全平台升级 Step1 三公共组件之一)。
 *
 * exportDataFile: 通用数据文件导出 —— CSV(\uFEFF BOM, Excel 直开)/JSON(indent 2)/Markdown 表格/
 * SARIF 2.1(安全结果交换标准)四格式,Blob+createObjectURL 下载;列集=opts.columns 或行键并集。
 * 纯展示层封装: 数据一律由调用方传入(既有端点/页面态真值),零后端写入。
 * UniversalImportModal: 通用导入弹窗 —— 拖拽/点选 json·csv·sarif·har·yaml·md → FileReader 解析 →
 * 预览(条数/字段校验/危级分布)→ 合并策略(追加去重/覆盖)→ onImportSuccess 回调。
 * 解析全部前端本地完成;yaml 仅支持扁平 key:value / 单层列表子集(复杂嵌套如实报错,不猜)。
 */

// ---------- 通用导出 ----------
export type ExportFormat = 'csv' | 'json' | 'md' | 'sarif';

const mdEscape = (v: unknown): string => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');

const toMarkdownTable = (rows: Record<string, any>[], columns: string[], title?: string): string => {
 const L: string[] = [];
 if (title) { L.push(`# ${title}`, ''); }
 L.push(`| ${columns.join(' | ')} |`);
 L.push(`| ${columns.map(() => '---').join(' | ')} |`);
 for (const r of rows) L.push(`| ${columns.map((c) => mdEscape(r[c])).join(' | ')} |`);
  L.push('');
  return L.join('\n');
};

/** 通用行 → SARIF 2.1 results(安全发现语义映射: severity→level / title→message.text / component→位置) */
const toSarif = (rows: Record<string, any>[], title?: string) => {
  const LEVEL: Record<string, string> = { critical: 'error', high: 'error', medium: 'warning', low: 'note', info: 'note' };
 return {
 version: '2.1.0',
 $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
 runs: [{
 tool: { driver: { name: 'APK-Sec-Web', informationUri: 'https://github.com/local/apksec', rules: [] } },
 properties: title ? { title } : undefined,
 results: rows.map((r, i) => {
 const comp = String(r.component || r.path || r.file || '');
 const line = Number(r.line || (String(r.evidence || '').match(/:(\d+)/)?.[1]) || 0);
 return {
 ruleId: String(r.rule_id || r.id || `apksec-${i}`),
 level: LEVEL[String(r.severity || '').toLowerCase()] || 'note',
 message: { text: String(r.title || r.name || r.message || r.url || `(行 ${i + 1})`) },
 locations: comp ? [{
 physicalLocation: {
 artifactLocation: { uri: comp },
 ...(line > 0 ? { region: { startLine: line } } : {}),
            },
          }] : [],
          partialFingerprints: r.masvs ? { masvs: String(r.masvs) } : undefined,
          properties: { severity: r.severity, state: r.state, masvs: r.masvs },
        };
      }),
    }],
  };
};

/** 统一导出入口: rows=对象行;columns 缺省=全部行键并集(保持首行键序优先) */
export const exportDataFile = (
  baseName: string,
  format: ExportFormat,
  rows: Record<string, any>[],
 opts?: { columns?: string[]; title?: string },
): void => {
 const columns = opts?.columns?.length
 ? opts.columns
 : [...new Set(rows.flatMap((r) => Object.keys(r || {})))];
 const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
 const file = `${baseName}_${stamp}`;
 if (format === 'csv') {
 downloadCsv(`${file}.csv`, [columns, ...rows.map((r) => columns.map((c) => r[c] ?? ''))] as any);
  } else if (format === 'json') {
    downloadJson(`${file}.json`, { kind: 'apksec_export', title: opts?.title || baseName, exported_at: new Date().toISOString(), count: rows.length, rows });
  } else if (format === 'md') {
    const blobText = toMarkdownTable(rows, columns, opts?.title);
    download(`${file}.md`, blobText, 'text/markdown;charset=utf-8');
  } else {
    downloadJson(`${file}.sarif`, toSarif(rows, opts?.title));
  }
};

// ---------- 通用导入 ----------
export type ImportFormat = 'json' | 'csv' | 'sarif' | 'har' | 'yaml' | 'md';

export type UniversalImportResult = {
  rows: Record<string, any>[];
  format: ImportFormat;
  strategy: 'dedupe' | 'override';
  invalid: number;
  errors: string[];
};

/** 扁平 YAML 子集解析(键值/单层列表;嵌套缩进如实报错不猜) */
const parseFlatYaml = (text: string): { rows: Record<string, any>[]; errors: string[] } => {
  const errors: string[] = [];
  const rows: Record<string, any>[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let cur: Record<string, any> | null = null;
  let listKey: string | null = null;
  for (const ln of lines) {
    if (!ln.trim() || /^#/.test(ln.trim())) continue;
    if (/^\s*-\s+/.test(ln)) {
      const val = ln.replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, '');
      if (cur) { (cur as any)[listKey || 'items'] = ((cur as any)[listKey || 'items'] || []).concat(val); }
      else rows.push({ value: val });
      continue;
    }
    const m = ln.match(/^(\s*)([A-Za-z0-9_\-\u4e00-\u9fa5]+):\s*(.*)$/);
    if (!m) { if (errors.length < 3) errors.push(`无法解析行: ${ln.slice(0, 40)}`); continue; }
 const [, indent, key, rawVal] = m;
 const val = rawVal.trim().replace(/^["']|["']$/g, '');
 if (indent.length > 0) { if (errors.length < 3) errors.push('嵌套 YAML 暂不支持(仅扁平键值/单层列表),请转 JSON 导入'); break; }
    if (val === '' ) { cur = {}; listKey = key; (cur as any)[key] = []; rows.push(cur); }
    else { cur = { [key]: val }; listKey = null; rows.push(cur); }
  }
  return { rows, errors };
};

/** Markdown 表格解析(| 分隔,表头+分隔线+数据行) */
const parseMdTable = (text: string): { rows: Record<string, any>[]; errors: string[] } => {
 const lines = text.split('\n').map((l) => l.trim()).filter((l) => /^\|.*\|?$/.test(l));
  if (lines.length < 2) return { rows: [], errors: ['未找到 Markdown 表格(| 表头 | … |)'] };
 const cells = (l: string) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim().replace(/\\\|/g, '|'));
  const header = cells(lines[0]);
  const rows: Record<string, any>[] = [];
  for (const l of lines.slice(1)) {
    if (/^[\s|:-]+$/.test(l)) continue;   // 分隔线
    const cs = cells(l);
    const o: Record<string, any> = {};
 header.forEach((h, i) => { o[h || `col${i}`] = (cs[i] ?? '').replace(/<br\s*\/?>/gi, '\n'); });
 rows.push(o);
 }
 return { rows, errors: [] };
};

const unwrapJsonArray = (d: any): any[] | null => {
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') {
    for (const k of ['rows', 'items', 'vulns', 'findings', 'data', 'results']) if (Array.isArray(d[k])) return d[k];
    if (Array.isArray(d?.log?.entries)) return d.log.entries;   // HAR
  }
  return null;
};

/** SARIF → 通用行(results 摊平) */
const sarifToRows = (d: any): Record<string, any>[] => {
  const out: Record<string, any>[] = [];
  for (const run of d.runs || []) {
    for (const res of run?.results || []) {
      const loc = res?.locations?.[0]?.physicalLocation;
      out.push({
        rule_id: res.ruleId, severity: res.level || 'note',
        title: res?.message?.text || res.ruleId,
        component: loc?.artifactLocation?.uri || '',
        line: loc?.region?.startLine ?? '',
        masvs: res?.partialFingerprints?.masvs || res?.properties?.masvs || '',
      });
    }
  }
  return out;
};

/** HAR → 通用行(log.entries 摊平为请求行) */
const harToRows = (d: any): Record<string, any>[] =>
 (d?.log?.entries || []).map((e: any) => ({
    url: e?.request?.url || '', method: e?.request?.method || '', status: e?.response?.status ?? '',
    mime: e?.response?.content?.mimeType || '', size: e?.response?.content?.size ?? e?.response?.bodySize ?? '',
    started: e?.startedDateTime || '',
  }));

/** 通用文本解析: 按扩展名/内容嗅探分发(嗅探优先级: SARIF→HAR→JSON→CSV→MD) */
export const parseUniversalText = (text: string, ext: string): { rows: Record<string, any>[]; format: ImportFormat; errors: string[] } => {
 const t = text.trim();
 const errors: string[] = [];
 if (!t) return { rows: [], format: 'json', errors: ['文件为空'] };
 if (t.startsWith('{') || t.startsWith('[')) {
 let d: any;
 try { d = JSON.parse(t); } catch (e: any) { return { rows: [], format: 'json', errors: [`JSON 解析失败: ${e.message}`] }; }
 if (d && typeof d === 'object' && Array.isArray(d.runs)) {
 const rows = sarifToRows(d);
 return rows.length ? { rows, format: 'sarif', errors } : { rows, format: 'sarif', errors: ['SARIF 无 results 条目'] };
 }
 if (d?.log?.entries) return { rows: harToRows(d), format: 'har', errors };
 const raw = unwrapJsonArray(d);
 if (!raw) {
 // 对象映射形态(如 OpenAPI paths: {"/x": {get:{...}}}): 键升列摊平为行(值=对象则展开合并)
 if (d && typeof d === 'object' && !Array.isArray(d)) {
 const entries = Object.entries(d).filter(([, v]) => v && typeof v === 'object');
 if (entries.length) {
 return {
 rows: entries.map(([k, v]) => ({ path: k, ...(v as Record<string, any>) })),
 format: 'json', errors,
 };
 }
 }
 return { rows: [], format: 'json', errors: ['JSON 未找到行数组(支持数组或 {rows|items|vulns|findings|data|results:[...]})'] };
 }
 return { rows: raw.map((r: any) => (typeof r === 'object' && r !== null ? r : { value: r })), format: 'json', errors };
 }
 const lower = ext.toLowerCase();
 if (lower === 'yaml' || lower === 'yml') {
 const { rows, errors: ye } = parseFlatYaml(t);
 return { rows, format: 'yaml', errors: ye };
 }
 if (lower === 'md' || lower === 'markdown') {
 const { rows, errors: me } = parseMdTable(t);
 return rows.length ? { rows, format: 'md', errors: me } : { rows: [], format: 'md', errors: ['Markdown 中未找到表格'] };
 }
 // csv(含 .csv 与兜底)
 const grid = parseCsv(t);
 if (!grid.length) return { rows: [], format: 'csv', errors: ['CSV 无数据行'] };
 const header = grid[0].map((h) => h.trim());
 const rows = grid.slice(1).map((cells) => {
    const o: Record<string, any> = {};
 header.forEach((h, i) => { o[h || `col${i}`] = (cells[i] ?? '').trim(); });
    return o;
  });
  return { rows, format: 'csv', errors };
};

const SEV_KEYS = ['severity', '等级', '危级', '严重度', 'level'];

export const UniversalImportModal: React.FC<{
 open: boolean;
 title?: string;
 hint?: string;
 onClose: () => void;
  /** 字段校验: 返回该行缺失说明;空串=有效。缺省仅要求行非空对象 */
  validateRow?: (row: Record<string, any>, idx: number) => string;
 onImportSuccess: (r: UniversalImportResult) => void;
}> = ({ open, title = '通用导入(本地解析)', hint, onClose, validateRow, onImportSuccess }) => {
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [fmt, setFmt] = useState<ImportFormat>('json');
  const [invalid, setInvalid] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [strategy, setStrategy] = useState<'dedupe' | 'override'>('dedupe');
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

 useEffect(() => {
 if (!open) { setRows([]); setErrors([]); setInvalid(0); setFileName(''); setStrategy('dedupe'); setFmt('json'); }
 }, [open]);

 const ingest = (f: File) => {
 setFileName(f.name);
 const ext = f.name.split('.').pop() || '';
 const rd = new FileReader();
 rd.onload = () => {
 const { rows: parsed, format, errors: pe } = parseUniversalText(String(rd.result || ''), ext);
 let bad = 0;
 const errs = [...pe];
 parsed.forEach((r, i) => {
        const msg = validateRow ? validateRow(r, i) : '';
        if (msg) { bad++; if (errs.length < 6) errs.push(`第 ${i + 1} 行: ${msg}`); }
 });
 setRows(parsed); setFmt(format); setInvalid(bad); setErrors(errs);
 };
 rd.onerror = () => setErrors(['文件读取失败(权限/编码)']);
 rd.readAsText(f);
 };

 const columns = useMemo(() => [...new Set(rows.flatMap((r) => Object.keys(r || {})))].slice(0, 12), [rows]);
 const sevKey = useMemo(() => SEV_KEYS.find((k) => columns.includes(k)), [columns]);
 const sevDist = useMemo(() => {
    if (!sevKey) return null;
    const d: Record<string, number> = {};
 for (const r of rows) { const s = String(r[sevKey] || '—').toLowerCase(); d[s] = (d[s] || 0) + 1; }
 return d;
 }, [rows, sevKey]);

 const doImport = () => {
 const valid = validateRow ? rows.filter((r, i) => !validateRow(r, i)) : rows;
    if (!valid.length) return;
    onImportSuccess({ rows: valid, format: fmt, strategy, invalid, errors });
  };

  return (
    <UnifiedModal open={open} onClose={onClose} title={title} widthClass="w-[620px]"
      footer={(
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-meta text-jz-muted" data-uie-note>
            解析/合并在前端本地完成,经回调交由调用方落位(不直写后端)
          </span>
          <span className="flex-1" />
          <button onClick={onClose} className="px-3 py-1.5 rounded-control bg-jz-surface-2/60 text-jz-ink-2 text-meta hover:bg-jz-surface-2">取消</button>
          <button onClick={doImport} disabled={!rows.length || rows.length === invalid} data-uie-import-btn
 className="px-3 py-1.5 rounded-control bg-jz-brand/15 text-jz-brand text-meta font-semibold hover:bg-jz-brand/25 disabled:opacity-40 disabled:cursor-not-allowed">
            导入 {rows.length - invalid} 行
          </button>
        </div>
 )}>
      {/* 拖拽区 */}
      <label data-uie-dropzone={drag ? 'drag' : 'idle'}
 onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
 onDragLeave={() => setDrag(false)}
 onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) ingest(f); }}
 className={`block border-2 border-dashed rounded-card p-5 text-center cursor-pointer transition-colors
 ${drag ? 'border-jz-brand/70 bg-jz-brand/5' : 'border-jz-border/60 bg-jz-surface-2/40 hover:border-jz-brand/40'}`}>
        <input ref={inputRef} type="file" accept=".json,.csv,.sarif,.har,.yaml,.yml,.md,.markdown" className="hidden"
 onChange={(e) => { const f = e.target.files?.[0]; if (f) ingest(f); }} data-uie-file-input />
        <Upload size={18} className={`mx-auto ${drag ? 'text-jz-brand' : 'text-jz-muted'}`} />
        <div className="text-meta text-jz-ink-2 mt-1.5">拖入或点击选择文件(json / csv / sarif / har / yaml / md)</div>
        <div className="text-meta text-jz-muted mt-1">{hint || '全部前端本地解析预览,确认后经回调合并'}</div>
        {fileName && <div className="text-meta font-mono text-jz-ink-2 mt-1.5" data-uie-file-name>{fileName}</div>}
      </label>

 {errors.length > 0 && (
        <div className="rounded-control bg-jz-sev-critical/10 px-2.5 py-1.5 text-meta text-jz-sev-critical space-y-0.5" data-uie-errors>
 {errors.map((e, i) => <div key={i} className="break-all">{e}</div>)}
        </div>
 )}

 {/* 预览: 条数/字段/危级分布 */}
 {rows.length > 0 && (
        <div className="space-y-2" data-uie-preview>
          <div className="flex items-center gap-2 flex-wrap text-meta">
            <StatusBadge tone="info" title={`解析格式: ${fmt}`}>{rows.length} 行 · {fmt.toUpperCase()}</StatusBadge>
 {invalid > 0 && <StatusBadge tone="critical" title="未通过字段校验的行数(导入时跳过)">{invalid} 行无效</StatusBadge>}
 {sevDist && Object.entries(sevDist).map(([k, n]) => (
              <span key={k} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-control font-mono text-meta tnum ${
 k === 'critical' || k === 'error' ? 'bg-jz-sev-critical/10 text-jz-sev-critical'
 : k === 'high' || k === 'warning' ? 'bg-jz-sev-high/10 text-jz-sev-high'
 : k === 'medium' ? 'bg-jz-sev-medium/10 text-jz-sev-medium'
 : k === 'low' || k === 'note' ? 'bg-jz-sev-low/10 text-jz-sev-low'
 : 'bg-jz-surface-2 text-jz-muted'}`}>{k}: {n}</span>
            ))}
            <span className="flex-1" />
            <span className="text-jz-muted font-mono text-meta tnum">{columns.length} 字段</span>
          </div>
          <div className="rounded-control bg-jz-surface-2/50 p-2 max-h-40 overflow-auto">
            <table className="w-full text-meta font-mono text-jz-ink-2">
              <thead><tr className="text-jz-muted">
 {columns.slice(0, 6).map((c) => <th key={c} className="text-left py-0.5 pr-2 font-medium truncate max-w-[140px]">{c}</th>)}
              </tr></thead>
              <tbody>
 {rows.slice(0, 8).map((r, i) => (
                  <tr key={i} className="border-t border-jz-border/40">
 {columns.slice(0, 6).map((c) => (
                      <td key={c} className="py-0.5 pr-2 truncate max-w-[140px]" title={String(r[c] ?? '')}>{String(r[c] ?? '').slice(0, 40) || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
 {rows.length > 8 && <div className="text-meta text-jz-muted pt-1">…(仅预览前 8 行,共 {rows.length} 行)</div>}
          </div>
          {/* 合并策略 */}
          <div className="flex items-center gap-3 text-meta" data-uie-strategy>
            <span className="text-jz-muted">合并策略:</span>
            <label className="flex items-center gap-1 cursor-pointer text-jz-ink-2">
              <input type="radio" checked={strategy === 'dedupe'} onChange={() => setStrategy('dedupe')} data-uie-strategy-dedupe /> 追加(按全字段去重)
            </label>
            <label className="flex items-center gap-1 cursor-pointer text-jz-ink-2">
              <input type="radio" checked={strategy === 'override'} onChange={() => setStrategy('override')} data-uie-strategy-override /> 覆盖同键行
            </label>
          </div>
        </div>
      )}
    </UnifiedModal>
  );
};

/** 导出格式下拉(与 DataToolbar 导出▾ 同构的独立小件,供弹窗内/工具条复用) */
export const ExportMenu: React.FC<{
  baseName: string;
  rows: Record<string, any>[];
 columns?: string[];
 title?: string;
 label?: string;
 probe?: string;
}> = ({ baseName, rows, columns, title, label = '导出', probe }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
 useEffect(() => {
 if (!open) return;
 const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
 document.addEventListener('mousedown', onDown);
 return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const ITEMS: Array<[ExportFormat, string, React.ComponentType<any>]> = [
    ['csv', 'CSV(Excel 直开)', FileSpreadsheet],
    ['json', 'JSON(indent 2)', FileJson],
    ['md', 'Markdown 表格', FileText],
    ['sarif', 'SARIF 2.1', ShieldCheck],
  ];
  return (
    <div className="relative" ref={ref} {...(probe ? { 'data-export-menu': probe } : {})}>
      <button onClick={() => setOpen((v) => !v)} disabled={!rows.length} data-export-toggle={probe || ''}
 title={rows.length ? `导出 ${rows.length} 行` : '无数据可导出'}
 className="inline-flex items-center gap-1 px-2.5 h-8 rounded-control bg-jz-surface-2/60 text-meta
 text-jz-ink-2 hover:text-jz-brand disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        <FileUp size={12} /> {label} ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-card bg-jz-surface border border-jz-border shadow-card py-1" data-export-panel>
 {ITEMS.map(([fmt, lbl, Icon]) => (
            <button key={fmt} onClick={() => { exportDataFile(baseName, fmt, rows, { columns, title }); setOpen(false); }}
 data-export-item={fmt}
 className="w-full text-left px-2.5 py-1.5 text-meta text-jz-ink-2 hover:bg-jz-surface-2/60 flex items-center gap-1.5">
              <Icon size={12} className="flex-none" /> {lbl}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
