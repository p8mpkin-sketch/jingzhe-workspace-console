// Context chips, above the input. The session chip is fixed; the others were picked from real lists and can be
// removed. They travel as quoted text at the top of the message, and the row says so whenever one is attached.
import React from 'react';
import { Plus, X } from 'lucide-react';
import { cx } from '@/components/ui';
import type { ContextChip } from './useComposer';

const KIND: Record<ContextChip['kind'], string> = { session: '会话', finding: '风险发现', request: '请求' };

export const ContextChips: React.FC<{
  chips: ContextChip[]; onRemove: (key: string) => void; onAdd: () => void; canAdd: boolean; addHint: string; disabled?: boolean;
}> = ({ chips, onRemove, onAdd, canAdd, addHint, disabled }) => {
  const quoting = chips.some((c) => !c.fixed);
  return (
    <div className="flex min-w-0 items-center gap-2 px-3 pt-2" data-composer-chips>
      <ul aria-label="上下文" className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {chips.map((c) => (
          <li key={c.key} data-composer-chip={c.kind} className="flex h-6 flex-none items-center gap-1 rounded-tag border border-jz-border bg-jz-surface pl-2 text-meta text-jz-ink-2">
            <span className="text-jz-muted">{KIND[c.kind]}</span>
            <span className={cx('max-w-56 truncate text-jz-ink', c.fixed && 'pr-2', c.kind !== 'finding' && 'font-mono text-mono')} title={c.text}>{c.label}</span>
            {!c.fixed && (
              <button type="button" aria-label={`移除引用：${c.label}`} title="移除引用" onClick={() => onRemove(c.key)} disabled={disabled}
                className="grid h-6 w-6 place-items-center rounded-tag text-jz-muted hover:bg-jz-hover hover:text-jz-ink">
                <X size={12} aria-hidden />
              </button>
            )}
          </li>
        ))}
        <li className="flex-none">
          <button type="button" onClick={onAdd} disabled={!canAdd || disabled} title={addHint} data-composer-add
            className="inline-flex h-6 items-center gap-1 rounded-tag border border-dashed border-jz-border-strong px-2 text-meta text-jz-ink-2 hover:text-jz-ink disabled:cursor-not-allowed disabled:text-jz-muted">
            <Plus size={12} aria-hidden />上下文
          </button>
        </li>
      </ul>
      {quoting && <span className="ml-auto flex-none text-meta text-jz-muted max-[760px]:hidden" data-composer-quote-note>引用会作为文本随消息发送</span>}
    </div>
  );
};
