import type { ContentBlock, FindingView } from './types';

const SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;
const isTableLine = (line: string) => /^\s*\|.*\|\s*$/.test(line);

const splitCells = (line: string): string[] => {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((x) => x.trim());
};

const plain = (s: string): string => s
  .replace(/`/g, '')
  .replace(/\*\*/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const findHeader = (headers: string[], names: string[]): number =>
  headers.findIndex((h) => names.some((n) => plain(h).includes(n)));

const isFindingTable = (headers: string[]): boolean => {
  const h = headers.map(plain);
  const hasSeverity = h.some((x) => x.includes('严重度'));
  const hasFile = h.some((x) => x.includes('文件'));
  const hasValue = h.some((x) => x.includes('内容') || x.includes('硬编码') || x === '值');
  return hasSeverity && hasFile && hasValue;
};

const classify = (value: string, purpose: string): 'public' | 'secret' => {
  const text = `${value} ${purpose}`;
  const publicKey = /RSA_?PUBLIC_?KEY|PUBLIC KEY|appKey|appId|公钥/i.test(text);
  const privateKey = /private|私钥|secret|password|passwd|DB_KEY|DESEDE|对称密钥|token/i.test(text);
  return publicKey && !privateKey ? 'public' : 'secret';
};

const toFinding = (cells: string[], headers: string[], reveal: boolean): FindingView | null => {
  const idx = findHeader(headers, ['#']) >= 0 ? cells[findHeader(headers, ['#'])] : '';
  const sev = findHeader(headers, ['严重度']);
  const file = findHeader(headers, ['文件']);
  const value = findHeader(headers, ['硬编码内容', '内容', '值']);
  const purpose = findHeader(headers, ['用途', '说明']);
  const verify = findHeader(headers, ['源码验证', '验证']);
  if (sev < 0 || file < 0 || value < 0) return null;
  const rawValue = plain(cells[value] || '');
  const purposeText = plain(cells[purpose] || '');
  const sensitivity = classify(rawValue, purposeText);
  const verification = plain(cells[verify] || '');
  const verified = /已确认|✅|confirmed/i.test(verification);
  return {
    index: plain(idx || ''),
    severity: plain(cells[sev] || '').toLowerCase(),
    fileLine: plain(cells[file] || ''),
    value: rawValue,
    rawValue,
    purpose: purposeText,
    verification,
    verified,
    sensitivity,
  };
};

export function normalizeContent(text: string, opts: { reveal?: boolean } = {}): ContentBlock[] {
  const reveal = !!opts.reveal;
  const lines = String(text || '').split('\n');
  const blocks: ContentBlock[] = [];
  let md: string[] = [];
  let fence = false;

  const flushMd = () => {
    const t = md.join('\n').trim();
    if (t) blocks.push({ type: 'markdown', text: t });
    md = [];
  };

  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { fence = !fence; md.push(line); i++; continue; }
    if (fence) { md.push(line); i++; continue; }
    if (isTableLine(line) && i + 1 < lines.length && SEPARATOR.test(lines[i + 1])) {
      flushMd();
      const headers = splitCells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableLine(lines[i])) {
        rows.push(splitCells(lines[i]));
        i++;
      }
      if (isFindingTable(headers)) {
        const items = rows
          .map((row) => toFinding(row, headers, reveal))
          .filter((x): x is FindingView => !!x);
        if (items.length) blocks.push({ type: 'finding_list', items });
        else blocks.push({ type: 'markdown', text: lines.slice(0, i).join('\n') });
      } else {
        blocks.push({
          type: 'data_table',
          headers: headers.map((h) => plain(h)),
          rows: rows.map((r) => r.map((c) => plain(c))),
        });
      }
      continue;
    }
    md.push(line);
    i++;
  }
  flushMd();
  return blocks;
}
