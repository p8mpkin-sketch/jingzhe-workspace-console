import React from 'react';
import { Smartphone, Syringe } from 'lucide-react';
import { cx, useOverlay, StatusBadge, EmptyState } from '@/components/ui';

/**
 * Device and Frida status popover. Presentation only: the list is the shared `usePentest.devices` value that the
 * shell's single 8 s poll writes (layout/useDevicePoll), so opening it issues no request. Opened from the rail's
 * device entry; this is where device counts live.
 */
export const DeviceFridaFlyout: React.FC<{
  open: boolean;
  onClose: () => void;
  devices: Array<any>;
  /** Where the panel opens relative to its trigger: above the rail card, or below the top bar pill. */
  placement?: 'above-start' | 'below-end';
}> = ({ open, onClose, devices, placement = 'above-start' }) => {
  const ref = useOverlay(open, onClose);
  if (!open) return null;
  const fridaOn = devices.filter((d) => d.frida).length;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div ref={ref} tabIndex={-1} data-device-flyout role="dialog" aria-label="设备与 Frida 状态"
        className={cx('absolute z-50 w-[340px] max-w-[calc(100vw-1.5rem)] space-y-2 rounded-card border border-jz-border bg-jz-raised p-3 shadow-raised outline-none',
          placement === 'above-start' ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-3')}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-label font-semibold text-jz-ink">设备与 Frida 状态</span>
          <span className="font-mono tnum text-meta text-jz-muted" data-flyout-count>
            {devices.length} 台 · Frida 就绪 {fridaOn}
          </span>
        </div>
        <div className="max-h-56 space-y-1.5 overflow-auto" data-flyout-list>
          {devices.length === 0 && (
            <div data-flyout-empty>
              <EmptyState compact icon={Smartphone} title="没有已连接的设备" cause="adb 未连接，或设备处于离线状态。连接后约 8 秒内出现在这里。" />
            </div>
          )}
          {devices.map((d: any) => (
            <div key={d.serial} data-flyout-device={d.serial} className="space-y-1 rounded-control border border-jz-border px-2.5 py-2">
              <div className="flex items-center gap-2">
                <Smartphone size={14} className="flex-none text-jz-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-label font-medium text-jz-ink" title={d.serial}>{d.model || d.serial}</span>
                <StatusBadge tone={d.root ? 'attention' : 'neutral'}>{d.root ? '已 Root' : '未 Root'}</StatusBadge>
              </div>
              <div className="flex items-center gap-2 text-meta text-jz-muted">
                <span className="min-w-0 truncate font-mono" title={d.serial}>{d.serial}</span>
                <span className="flex-none">Android {d.android || '—'}</span>
                <span className="flex-1" />
                <span className={cx('inline-flex flex-none items-center gap-1', d.frida ? 'text-jz-teal' : 'text-jz-muted')}>
                  <Syringe size={12} aria-hidden /> {d.frida ? 'Frida 就绪' : 'Frida 未安装'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
