// taskParts.tsx — constants, pure helpers and small cells shared by the task page.
// The helpers are unchanged from the previous implementation: they decide what a status means, not how it looks.
import React from 'react';
import { Tag } from '@/components/ui';

export const ST_CN: Record<string, string> = { done: '完成', running: '运行中', failed: '失败', queued: '排队' };
export const PAGE_SIZES = [20, 50, 100, 200];
/** Tasks running longer than 15 minutes are marked slow. */
export const SLOW_S = 15 * 60;
/** A task that failed in under 2 seconds never really started; the page can hide these. */
export const SMOKE_FAIL_S = 2;

export const fmtDur = (sec: number): string => {
  if (!isFinite(sec) || sec < 0) return '—';
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
};
export const fmtTime = (ts?: number | null): string => {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const PACKER_NAMES: Record<string, string> = {
  bangcle: '梆梆安全', ijiami: '爱加密', jiagu: '360加固', qihoo: '360加固', '360_jiagu': '360加固',
  naqiu: '娜迦', wrap: '渠道壳', 'wrap-channel': '渠道壳',
};
export const STAGE_CN: Record<string, string> = {
  'Security Analysis': '安全分析', 'Symbol Analysis': '符号分析',
  'Struct Analysis': '结构分析', 'Report Generation': '报告生成',
};

export const bizOf = (o: any): number | null => {
  if (!o) return null;
  const v = o.verdict != null ? o.defined_biz : o.biz_classes;
  return typeof v === 'number' && v >= 0 ? v : null;
};
export const honestDone = (t: any): { blocked: boolean; label: string; biz: number | null; positive: boolean; shell: boolean } => {
  const o = t.unpack_outcome || null;
  const biz = bizOf(o);
  const shell = !!t.packer && t.packer !== 'none';   // 明确存在加固壳(none/缺失=无壳/未检出)
  const prog = typeof t.progress === 'string' ? t.progress : '';
  const progNoBiz = /未脱出|脱壳不完整/.test(prog);   // runner 实证阻塞文案:「⚠ 脱壳不完整: 业务代码 X 未脱出」
  const positive = !!(o && (o.verdict === 'pass' || o.code_recovered === 1));
  let blocked = false;
  let label = '';
  if (biz != null && biz > 0) {
    blocked = false;   // ① 有真实业务码类数=权威正向,任何其他信号不得覆盖
  } else if (shell && (biz === 0 || progNoBiz || (o != null && o.code_recovered === 0))) {
    // ② 收紧后的受阻判定: 必须明确有壳 + 明确「未脱出业务码」证据(类数=0/文本/结构化)三者同存
    blocked = true;
    label = o && o.verdict && o.verdict !== 'pass'
      ? (o.verdict === 'small_app' ? '非能力项 small_app'
        : o.verdict === '32bit_only' ? '非能力项 32bit_only'
        : o.verdict === 'install_failed' ? '未装上 install_failed'
        : `未脱出(${o.verdict})`)
      : '未脱出业务码';
  }
  return { blocked, label, biz, positive, shell };
};
export const outcomeProbe = (o: any): string | null => {
  if (!o) return null;
  if (o.verdict) return o.verdict;
  if (o.strict_ok === true || o.code_recovered === 1) return 'recovered';
  return 'no_biz_code';
};

export const whenFull = (ts?: number | null): string => ts ? new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false }) : '—';

/** Live progress of a running task, parsed from the backend progress text. */
export const TaskLiveProgress: React.FC<{ progress: string }> = ({ progress }) => {
  const segs = String(progress).split('→').map(s => s.trim()).filter(Boolean);
  const unpack = segs.find(s => /^Unpack:/i.test(s));
  const decomp = segs.find(s => /^Decompile:/i.test(s));
  const last = segs[segs.length - 1] || '';
  const post = decomp ? segs[segs.indexOf(decomp) + 1] : null;
  const pctOf = (s: string): number | null => {
    const m = /(\d+)%/.exec(s || '');
    return m ? Math.max(0, Math.min(100, parseInt(m[1], 10))) : null;
  };
  const dp = decomp ? pctOf(decomp) : null;
  const detail = decomp
    ? decomp.replace(/^Decompile:\s*\d+%\s*(·\s*)?/i, '').trim()
    : last.replace(/^(Security Analysis|Symbol Analysis|Struct Analysis|Report Generation):\s*/i, '').trim();
  return (
    <div className="mt-1.5 w-full max-w-64 space-y-1" data-task-progress>
      {unpack && (
        <div className="flex items-start gap-1 text-meta text-jz-ink-2" title={unpack}>
          <span className="flex-none text-jz-teal">脱壳 100%</span>
          <span className="min-w-0 break-words text-jz-muted">{unpack.replace(/^Unpack:\s*100%\s*(·\s*)?/i, '')}</span>
        </div>
      )}
      {decomp ? (
        <div>
          <div className="flex items-baseline justify-between gap-2 text-meta">
            <span className="flex-none font-medium text-jz-ink-2">反编译 <span className="tnum">{dp ?? 0}%</span></span>
            <span className="min-w-0 truncate text-jz-muted" title={detail}>{detail || 'jadx…'}</span>
          </div>
          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-pill bg-jz-surface-2" data-progress-bar={dp ?? 0}
            role="progressbar" aria-label="反编译进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={dp ?? 0}>
            <div className="h-full bg-jz-brand" style={{ width: String(dp ?? 0) + '%' }} />
          </div>
          {post && <div className="text-meta text-jz-muted">当前:{STAGE_CN[post.split(':')[0]] || post}</div>}
        </div>
      ) : (
        <div className="text-meta text-jz-muted">当前:{STAGE_CN[last.split(':')[0]] || last}</div>
      )}
    </div>
  );
};

export const PackerChip: React.FC<{ packer?: string | null }> = ({ packer }) => {
  if (!packer) return null;
  if (packer === 'none') return <Tag title="没有检测到加固">无加固</Tag>;
  return <Tag title={`加固类型:${packer}`}>{PACKER_NAMES[packer] || packer}</Tag>;
};

/** Device kind from the serial: emulator-* is an emulator, anything else a physical device. */
export const devKind = (d?: string | null): string => !d ? '无设备' : /^emulator/i.test(d) ? '模拟器' : '真机';
