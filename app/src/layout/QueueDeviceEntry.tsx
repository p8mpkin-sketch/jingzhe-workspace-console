import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Smartphone } from 'lucide-react';
import { usePentest } from '@/stores/pentest';
import { api } from '@/services/api';
import { cx, StatusGlyph } from '@/components/ui';
import type { GlyphKind } from '@/components/ui';
import { DeviceFridaFlyout } from './DeviceFridaFlyout';
import { PATHS } from './navigation';

/**
 * Rail footer: the two entry points to shared infrastructure. Each shows a state word and a shape-coded glyph,
 * never a count: device counts live in the flyout, queue numbers on the dashboard, concurrency on /tasks.
 * Data is unchanged: the device list comes from the shared store (single 8 s poll), the queue state from
 * /api/tasks-summary every 30 s. The numbers stay available to assistive tech and audits through the
 * accessible name and data attributes.
 */
const ROW = 'flex h-jz-control w-full items-center gap-2.5 rounded-control text-label text-jz-ink-2 transition-colors duration-fast hover:bg-jz-hover hover:text-jz-ink max-[760px]:h-jz-touch';

export const QueueDeviceEntry: React.FC<{ collapsed: boolean }> = ({ collapsed }) => {
  const devices = usePentest((s) => s.devices);
  const navigate = useNavigate();
  const [devPop, setDevPop] = useState(false);
  const [running, setRunning] = useState<number | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  useEffect(() => {
    const load = () => api<any>('/api/tasks-summary').then((d) => {
      setRunning(typeof d?.running === 'number' ? d.running : null);
      setFailed(typeof d?.failed === 'number' ? d.failed : null);
    }).catch(() => {});
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  const devCount = devices.length;
  const fridaOn = devices.filter((d) => d.frida).length;
  const dev: { kind: GlyphKind; word: string } = devCount > 0 ? { kind: 'active', word: '在线' } : { kind: 'queued', word: '未连接' };
  const queue: { kind: GlyphKind; word: string; to: string } =
    failed == null && running == null ? { kind: 'neutral', word: '未知', to: PATHS.tasks }
      : (failed ?? 0) > 0 ? { kind: 'attention', word: '有失败', to: `${PATHS.tasks}?status=failed` }
        : (running ?? 0) > 0 ? { kind: 'running', word: '运行中', to: `${PATHS.tasks}?status=running` }
          : { kind: 'queued', word: '空闲', to: PATHS.tasks };
  const devName = `设备：${dev.word}，${devCount} 台已连接，Frida 就绪 ${fridaOn}`;
  const queueName = `队列：${queue.word}，运行中 ${running ?? '未知'}，失败 ${failed ?? '未知'}`;

  return (
    <div className="space-y-0.5" data-rail-infra>
      <div className="relative">
        <button type="button" onClick={() => setDevPop((v) => !v)} aria-haspopup="dialog" aria-expanded={devPop}
          aria-label={devName} title={collapsed ? devName : '查看设备与 Frida 状态'}
          data-sidebar-devices data-devices-clickable data-device-state={devCount > 0 ? 'online' : 'none'}
          className={cx(ROW, collapsed ? 'justify-center px-0' : 'px-2.5')}>
          <span className="relative flex-none">
            <Smartphone size={18} className="text-jz-muted" aria-hidden />
            {collapsed && <StatusGlyph kind={dev.kind} className="absolute -right-1.5 -top-1 rounded-pill bg-jz-rail" />}
          </span>
          {!collapsed && (<>
            <span className="min-w-0 flex-1 truncate text-left">设备</span>
            <span className="inline-flex flex-none items-center gap-1.5 text-meta" data-sidebar-dev-state><StatusGlyph kind={dev.kind} />{dev.word}</span>
          </>)}
        </button>
        <DeviceFridaFlyout open={devPop} onClose={() => setDevPop(false)} devices={devices} />
      </div>
      <button type="button" onClick={() => navigate(queue.to)} aria-label={queueName} title={collapsed ? queueName : `${queueName}。打开任务`}
        data-sidebar-load data-engine-load-clickable={(failed ?? 0) > 0 ? 'warn' : 'off'} data-engine-running={running ?? ''} data-engine-failed={failed ?? ''}
        className={cx(ROW, collapsed ? 'justify-center px-0' : 'px-2.5')}>
        <span className="relative flex-none">
          <Activity size={18} className="text-jz-muted" aria-hidden />
          {collapsed && <StatusGlyph kind={queue.kind} className="absolute -right-1.5 -top-1 rounded-pill bg-jz-rail" />}
        </span>
        {!collapsed && (<>
          <span className="min-w-0 flex-1 truncate text-left">队列</span>
          <span className="inline-flex flex-none items-center gap-1.5 text-meta" data-sidebar-queue-state><StatusGlyph kind={queue.kind} />{queue.word}</span>
        </>)}
      </button>
    </div>
  );
};
