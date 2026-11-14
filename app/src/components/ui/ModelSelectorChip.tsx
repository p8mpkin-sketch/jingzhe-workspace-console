import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * R104-1 ③: 模型路由胶囊下拉(纯前端组件)。
 * 选项数据一律由消费方经 props.options 传入, 本组件不内置任何端点/请求/默认模型语义;
 * 厂商小图标=首字母徽章(消费方可传 vendor; 亦可经 options 外部渲染自绘图标需求由
 * vendorIcon 覆盖); 低延迟绿色指示点由 option.lowLatency 真值门控——无数据不亮, 不假造。
 * 弹出卡片磨砂质感(backdrop-blur + jz-surface token), ESC/点外关闭。
 */
export interface ModelOption {
  id: string;
  label: string;
  /** 厂商名: 徽章取首字母, 并入悬浮 title */
  vendor?: string;
  /** 低延迟→绿色指示点(真值门控) */
  lowLatency?: boolean;
}

const VendorBadge: React.FC<{ vendor?: string; label?: string }> = ({ vendor, label }) => {
  const ch = (vendor || label || '?').trim().charAt(0).toUpperCase();
  return (
    <span
 aria-hidden
 className="w-4 h-4 flex-none rounded-full bg-jz-elevated border border-jz-border inline-flex items-center justify-center text-[11px] font-semibold leading-none text-jz-text-muted"
 >
      {ch}
    </span>
  );
};

export const ModelSelectorChip: React.FC<{
 options: ModelOption[];
 value: string | null;
 onChange: (id: string) => void;
 disabled?: boolean;
 placeholder?: string;
 className?: string;
 /** R104-4: 贴视口底的输入坞场景下拉向下必被裁切——true=向上展开(默认 false,既有消费方零影响) */
 dropUp?: boolean;
}> = ({ options, value, onChange, disabled = false, placeholder = '选择模型', className = '', dropUp = false }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
 const current = options.find((o) => o.id === value) || null;

 useEffect(() => {
 if (!open) return;
 const onDown = (e: MouseEvent) => {
 if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
 };
 const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
 document.addEventListener('mousedown', onDown);
 document.addEventListener('keydown', onKey);
 return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`} data-model-chip={open ? 'open' : 'closed'}>
      <button
 type="button"
 disabled={disabled}
 aria-haspopup="listbox"
 aria-expanded={open}
 onClick={() => setOpen((v) => !v)}
 className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-jz-surface/70 border border-jz-border
 font-mono text-[11px] text-jz-text-secondary hover:border-jz-active/50
 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-0 max-w-full"
 >
        <VendorBadge vendor={current?.vendor} label={current?.label} />
        <span className="truncate max-w-[180px]">{current?.label ?? placeholder}</span>
        {current?.lowLatency && (
          <span data-low-latency-dot title="低延迟" className="w-1.5 h-1.5 rounded-full bg-vuln-safe flex-none" />
        )}
        <ChevronDown size={11} className={`flex-none transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
 role="listbox"
 data-model-chip-menu
 className={`absolute left-0 z-50 min-w-[220px] max-h-64 overflow-auto rounded-lg border border-jz-border
 bg-jz-surface/85 backdrop-blur-md shadow-jz-card p-1 modal-panel-in
 ${dropUp ? 'bottom-full mb-1.5' : 'mt-1.5'}`}
 >
          {options.length === 0 && (
            <div className="px-2 py-1.5 text-[11px] text-jz-text-muted">无可用选项</div>
 )}
 {options.map((o) => (
            <button
 key={o.id}
 type="button"
 role="option"
 aria-selected={o.id === value}
 onClick={() => { onChange(o.id); setOpen(false); }}
 className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left text-[11px] font-mono transition-colors
 ${o.id === value ? 'bg-jz-elevated text-jz-text-primary' : 'text-jz-text-secondary hover:bg-jz-elevated/60'}`}
 >
              <VendorBadge vendor={o.vendor} label={o.label} />
              <span className="truncate flex-1" title={o.vendor ? `${o.vendor} · ${o.label}` : o.label}>{o.label}</span>
              {o.lowLatency && <span title="低延迟" className="w-1.5 h-1.5 rounded-full bg-vuln-safe flex-none" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
