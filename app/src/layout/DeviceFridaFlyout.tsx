import React from 'react';
import { Smartphone, Syringe, Usb } from 'lucide-react';

/**
 * DeviceFridaFlyout — 「设备+Frida 状态浮层」(本轮壳层升级新增,全平台升级 Step2①)。
 * 数据源=既有 /api/pentest/devices(TopBar 8s 单点轮询写入 usePentest.devices,Sidebar/TopBar 共享,零二次轮询);
 * 纯展示浮层: 设备序列/型号/Android 版本/root/Frida 就绪;无数据=诚实空态(不编造设备)。
 * 消费方: Sidebar 目标设备卡 + TopBar 目标硬件胶囊(各自本地 open 态,浮层自身无全局状态)。
 */

export const DeviceFridaFlyout: React.FC<{
 open: boolean;
 onClose: () => void;
  devices: Array<any>;
}> = ({ open, onClose, devices }) => {
 if (!open) return null;
 const fridaOn = devices.filter((d) => d.frida).length;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div data-device-flyout role="dialog" aria-label="设备与 Frida 状态"
 className="absolute left-0 bottom-full mb-2 z-50 w-[340px] max-w-[90vw] rounded-xl bg-jz-surface
 border border-jz-border shadow-jz-card p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <Usb size={13} className="text-neon-accent flex-none" />
          <span className="font-semibold text-jz-text-primary">设备与 Frida 状态</span>
          <span className="flex-1" />
          <span className="font-mono tnum text-[11px] text-jz-text-muted" data-flyout-count>
            {devices.length} 台 · Frida 就绪 {fridaOn}
          </span>
        </div>
        <div className="text-[11px] text-jz-text-muted">数据源 /api/pentest/devices(8s 轮询真值)</div>
        <div className="max-h-56 overflow-auto space-y-1.5" data-flyout-list>
          {devices.length === 0 && (
            <div className="rounded-lg bg-jz-elevated/50 px-2.5 py-3 text-center text-xs text-jz-text-muted" data-flyout-empty>
              无设备在册——adb 未连接或设备离线(如实空态)
            </div>
 )}
 {devices.map((d: any) => (
            <div key={d.serial} data-flyout-device={d.serial}
 className="rounded-lg bg-jz-elevated/50 px-2.5 py-1.5 space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <Smartphone size={12} className={`flex-none ${d.frida ? 'text-vuln-safe' : 'text-jz-text-muted'}`} />
                <span className="font-mono text-jz-text-primary truncate flex-1" title={d.serial}>{d.model || d.serial}</span>
                {d.root ? <span className="flex-none px-1.5 py-0.5 rounded-md text-[11px] bg-vuln-medium/10 text-vuln-medium">Root</span>
                  : <span className="flex-none px-1.5 py-0.5 rounded-md text-[11px] bg-jz-elevated text-jz-text-muted">未越权</span>}
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-jz-text-muted">
                <span className="truncate" title={d.serial}>{d.serial}</span>
                <span className="flex-none">Android {d.android || '—'}</span>
                <span className="flex-1" />
                <span className={`flex-none inline-flex items-center gap-1 ${d.frida ? 'text-vuln-safe' : 'text-jz-text-muted'}`}>
                  <Syringe size={11} /> {d.frida ? 'Frida 就绪' : 'Frida 未装'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
