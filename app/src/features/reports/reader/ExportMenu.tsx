// The one export control of a report reader: a button that opens a menu. The reader owns no export logic; every
// item calls what the page hands it.
import React from 'react';
import { Download } from 'lucide-react';
import { Button, MenuItem, Popover } from '@/components/ui';

export type ExportItem = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Why the item is disabled, or what it produces. */
  title?: string;
  attrs?: Record<string, string | number>;
};
export type ExportGroup = { label?: string; items: ExportItem[] };

export const ExportMenu: React.FC<{
  groups: ExportGroup[];
  label?: string;
  menuLabel?: string;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md';
  /** Name of the hook each item carries with its key (default `data-export-item`). */
  itemAttr?: string;
  triggerAttrs?: Record<string, string | number>;
  panelAttrs?: Record<string, string | number>;
}> = ({ groups, label = '导出', menuLabel = '导出报告', variant = 'primary', size = 'md', itemAttr = 'data-export-item', triggerAttrs, panelAttrs }) => (
  <Popover label={menuLabel} role="menu" align="end" className="w-64"
    trigger={(tp) => <Button variant={variant} size={size} icon={<Download size={14} aria-hidden />} data-reader-export {...triggerAttrs} {...tp}>{label}</Button>}>
    {(close) => (
      <div data-reader-export-panel {...panelAttrs}>
        {groups.filter((g) => g.items.length > 0).map((g, gi) => (
          <React.Fragment key={g.label || gi}>
            {gi > 0 && <div className="mx-1 my-1 h-px bg-jz-border" role="separator" />}
            {g.label && <div className="px-2.5 pb-1 pt-1.5 text-meta text-jz-muted">{g.label}</div>}
            {g.items.map((it) => (
              <MenuItem key={it.key} icon={it.icon} disabled={it.disabled} title={it.title} {...{ [itemAttr]: it.key }} {...it.attrs}
                onClick={() => { close(); it.onSelect(); }}>{it.label}</MenuItem>
            ))}
          </React.Fragment>
        ))}
      </div>
    )}
  </Popover>
);
