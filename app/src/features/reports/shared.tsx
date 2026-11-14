// shared.tsx — 报告中心共享展示层: 既有判色映射/证据三段式解析/KV 解析(自 R104-2 版迁移)/
// 评分环(SVG)/胶囊菜单(Popover)。
import React, { useEffect, useRef, useState } from 'react';
import { Zap, ShieldCheck, ShieldAlert, Minus, ChevronDown } from 'lucide-react';
import type { StatusTone } from '@/components/ui';

export const SEV_TONE = (sev: string): StatusTone =>
  sev === 'critical' ? 'critical' : sev === 'high' ? 'high' : sev === 'medium' ? 'medium' : sev === 'low' ? 'low' : 'info';
export const SEV_WEIGHT: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
export const STATE_ORDER: Record<string, number> = { confirmed: 0, pending: 1, excluded: 2 };
export const KIND_CN: Record<string, string> = { added: '新增', removed: '消失', changed: '变更' };
export const SEV_TXT: Record<string, string> = { critical: 'text-jz-sev-critical', high: 'text-jz-sev-high', medium: 'text-jz-sev-medium', low: 'text-jz-sev-low' };
export const STATE_CN: Record<string, string> = { all: '全部', confirmed: '确认', pending: '待复核', excluded: '已排除' };

// R104-2①: 既有判色 → 状态微图标(映射既有 red/green/gray/yellow,不发明新语义)
export const MX_ICON: Record<string, { Icon: React.ElementType; cls: string; label: string }> = {
 red: { Icon: Zap, cls: 'text-jz-sev-critical animate-pulse', label: '越权暴露: 匿名可达' },
 green: { Icon: ShieldCheck, cls: 'text-jz-teal', label: '已拦截: 重定向/鉴权拒绝' },
 yellow: { Icon: ShieldAlert, cls: 'text-jz-sev-medium', label: '配置疏漏: 登录态可见新数据(UI 走查)' },
 gray: { Icon: Minus, cls: 'text-jz-muted', label: '未判定: SPA 兜底壳/未部署' },
};

// R104-2③: evidence 既有字段如实分桶(零编造)——文件:行号定位行(及随行代码)→ 调用栈;
// HTTP 请求/响应标记行 → 动态报文;其余 → 证据原文。AI 因果链后端无独立字段,展示层诚实标注。
const isTrafficLine = (l: string) =>
 /^(GET|POST|PUT|DELETE|PATCH|HEAD)\s|^HTTP\/\d|→\s*HTTP|^响应片段|^请求片段/.test(l);
const isLocLine = (l: string) => /^[^\s:]+\S*:\d+\s*$/.test(l);
export type EvSeg = { stack: string[]; traffic: string[]; rest: string[] };
export const parseEvidence = (ev: string): EvSeg => {
  const stack: string[] = [], traffic: string[] = [], rest: string[] = [];
  const lines = (ev || '').split('\n');
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim() && isTrafficLine(l)) traffic.push(l);
    else if (l.trim() && isLocLine(l)) {
      stack.push(l);
      while (i + 1 < lines.length && lines[i + 1].trim() && !isTrafficLine(lines[i + 1]) && !isLocLine(lines[i + 1])) {
 stack.push(lines[i + 1]); i++;
 }
 } else if (l.trim()) rest.push(l);
 i++;
 }
 return { stack, traffic, rest };
};

// R104-2④: Markdown 摘要 → Key-Value 对(解析既有报告文本;失败由消费方降级原文折叠)
export type KV = { k: string; v: string };
export const parseReportKV = (md: string): { title: string; pairs: KV[] } => {
  let title = '';
  const pairs: KV[] = [];
  for (const l of (md || '').split('\n')) {
    const th = l.match(/^#\s+(.+)$/);
    if (th && !title) { title = th[1].trim(); continue; }
    if (l.startsWith('- [')) continue;   // 证据清单时间行非 KV
    const m = l.match(/^-\s*([^:：]{1,9}):\s*(.+)$/);
    if (m) pairs.push({ k: m[1].trim(), v: m[2].trim() });
  }
  return { title, pairs };
};

/** 评分环(SVG): rate 0-100;<60 红 / <85 琥珀 / 其余绿;中心文本由调用方叠放 */
export const ScoreRing: React.FC<{
 rate: number;
 size: number;
 stroke?: number;
 children?: React.ReactNode;
 className?: string;
}> = ({ rate, size, stroke = 5, children, className = '' }) => {
 const R = 22 - stroke / 2, C = 2 * Math.PI * R;
 const col = rate >= 85 ? 'text-jz-teal' : rate >= 60 ? 'text-jz-sev-medium' : 'text-jz-sev-critical';
  return (
    <div className={`relative flex-none ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 44 44" className="w-full h-full -rotate-90">
        <circle cx="22" cy="22" r={R} fill="none" strokeWidth={stroke} className="stroke-jz-surface-2" />
        <circle cx="22" cy="22" r={R} fill="none" strokeWidth={stroke} strokeLinecap="round"
 className={col} stroke="currentColor" strokeDasharray={`${(Math.max(0, Math.min(100, rate)) / 100) * C} ${C}`} />
      </svg>
      {children != null && (
        <div className="absolute inset-0 flex items-center justify-center">{children}</div>
      )}
    </div>
  );
};

/** 胶囊下拉菜单(轻量 Popover): 点击外部/ESC 关闭 */
export const Menu: React.FC<{
 label: React.ReactNode;
 children: (close: () => void) => React.ReactNode;
 btnCls?: string;
 align?: 'left' | 'right';
 widthCls?: string;
}> = ({ label, children, btnCls = '', align = 'right', widthCls = 'w-64' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
 useEffect(() => {
 if (!open) return;
 const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
 const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
 document.addEventListener('mousedown', onDoc);
 document.addEventListener('keydown', onKey);
 return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" data-menu-btn className={btnCls} onClick={() => setOpen((v) => !v)}>
        {label}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
 data-menu-panel
 className={`absolute z-40 mt-1.5 ${align === 'right' ? 'right-0' : 'left-0'} ${widthCls} max-h-[420px] overflow-auto rounded-card border border-jz-border bg-jz-surface shadow-card p-1.5 space-y-0.5`}
 >
 {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};

export const menuItemCls = 'w-full flex items-center gap-2 px-3 py-2 rounded-control text-left text-body text-jz-ink-2 hover:bg-jz-surface-2/70 hover:text-jz-ink transition-colors';
