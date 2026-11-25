// What the artifact browser knows about a file from its name and size alone. No request is made here.
export type FlatFile = { name: string; rel: string; size_kb: number };
export type FileKind = 'markdown' | 'json' | 'image' | 'text' | 'binary';

/** Report files the backend serves through /report-file (same list as its REPORT_FILES). */
export const REPORT_FILES: Record<string, true> = {
  'executive_summary.md': true,
  'security_report.md': true,
  'pentest_report.md': true,
  'native_report.md': true,
};
export const TEXT_RE = /\.(xml|json|log|txt|md|py|java|smali|yml|yaml|cfg|ini|properties|html|csv)$/i;
export const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
export const PREVIEW_MAX_KB = 512;
/** Characters of a text file shown in the preview; the rest is in the download. */
export const PREVIEW_MAX_CHARS = 300 * 1024;

export const kindOf = (name: string): FileKind =>
  /\.md$/i.test(name) ? 'markdown' : /\.json$/i.test(name) ? 'json' : IMAGE_RE.test(name) ? 'image' : TEXT_RE.test(name) ? 'text' : 'binary';
export const KIND_WORD: Record<FileKind, string> = { markdown: 'Markdown', json: 'JSON', image: '图片', text: '文本', binary: '二进制' };

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' };
export const imageMime = (name: string) => MIME[(name.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

/** Why a file has no preview, or null when it has one. */
export const noPreviewReason = (f: FlatFile): 'binary' | 'large' | null => {
  if (REPORT_FILES[f.name]) return null;
  if (kindOf(f.name) === 'binary') return 'binary';
  return f.size_kb > PREVIEW_MAX_KB ? 'large' : null;
};

export const fmtSize = (kb: number) => (kb >= 1024 ? `${(kb / 1024).toFixed(kb >= 10240 ? 0 : 1)} MB` : `${kb} kB`);

// Categories of the file list. A file belongs to the first that matches; one that matches none shows under 全部 only.
export const ART_CATS: Array<{ key: string; label: string; hint: string; test: (rel: string, name: string) => boolean }> = [
  { key: 'dex', label: '脱壳 DEX', hint: 'unpacked/ 目录下的文件或 .dex', test: (rel, name) => /(^|\/)unpacked(\/|$)/i.test(rel) || /\.dex$/i.test(name) },
  { key: 'manifest', label: 'Manifest', hint: '路径含 manifest 或 .xml', test: (rel, name) => /manifest/i.test(rel) || /\.xml$/i.test(name) },
  { key: 'report', label: '报告', hint: 'report/ 目录下的文件或 .md、.html', test: (rel, name) => /(^|\/)report(\/|$)/i.test(rel) || /\.(md|html)$/i.test(name) },
  { key: 'log', label: '日志', hint: '.log 和 .txt', test: (_rel, name) => /\.(log|txt)$/i.test(name) },
];
export const catOf = (rel: string, name: string): string | null => ART_CATS.find((c) => c.test(rel, name))?.key || null;

export const EXT_GROUPS: Array<{ key: string; label: string; test: (n: string) => boolean }> = [
  { key: 'md', label: '.md', test: (n) => /\.md$/i.test(n) },
  { key: 'json', label: '.json', test: (n) => /\.json$/i.test(n) },
  { key: 'xml', label: '.xml', test: (n) => /\.xml$/i.test(n) },
  { key: 'logtxt', label: '.log / .txt', test: (n) => /\.(log|txt)$/i.test(n) },
  { key: 'code', label: '代码文件', test: (n) => /\.(java|kt|smali|py|js|html)$/i.test(n) },
  { key: 'db', label: '.db', test: (n) => /\.(db|sqlite)$/i.test(n) },
];

/** The directory walk stops here: one request per directory, on the existing list endpoint. */
export const SCAN_MAX_REQ = 60;
export const SCAN_MAX_DEPTH = 3;
