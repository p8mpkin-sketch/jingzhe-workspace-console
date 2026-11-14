import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '@/services/api';
import { Button, Modal } from '@/components/ui';

type Device = { serial: string; model?: string; root?: boolean; wrap_ready?: { ok?: boolean } };

/** 重跑不是“同参数盲重跑”：允许重选设备、执行模式与深度，参数落到新任务。 */
export const RerunTaskModal: React.FC<{
  task: any;
  devices: Device[];
  onClose: () => void;
  onDone: (nt: number) => void;
}> = ({ task, devices, onClose, onDone }) => {
  const [device, setDevice] = useState('');
  const [mode, setMode] = useState('auto');
  const [depth, setDepth] = useState('deep');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api<any>(`/api/tasks/${task.id}/rerun`, {
        method: 'POST',
        body: JSON.stringify({ device_serial: device, mode, depth }),
      });
      onDone(r.task_id);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally { setBusy(false); }
  };
  return (
    <Modal open title={`重跑任务 #${task.id}`} onClose={onClose}>
      <div className="space-y-3 text-meta" data-rerun-modal>
        <div className="rounded-control bg-jz-surface-2/50 p-2.5 space-y-1">
          <div className="text-jz-muted">目标应用</div>
          <div className="font-semibold text-jz-ink break-all">{task.app_name || task.package || task.apk_path || '—'}</div>
          <div className="font-mono text-meta text-jz-muted break-all">{task.apk_path || '原始 APK 路径未记录'}</div>
          <div className="text-meta text-jz-muted">新任务会重新执行，原任务及其报告保持不变。</div>
        </div>
        <label className="block space-y-1 text-jz-muted">脱壳设备
          <select value={device} onChange={(e) => setDevice(e.target.value)} data-rerun-device
            className="w-full h-8 px-2 rounded-control bg-jz-surface-2 border border-jz-border text-meta text-jz-ink">
            <option value="">自动选择（优先真机 root / wrap 就绪）</option>
            {devices.map((d) => (
              <option key={d.serial} value={d.serial}>
                {d.model || d.serial} · {d.serial}{d.wrap_ready?.ok ? ' · wrap就绪' : ' · wrap未就绪'}
              </option>
            ))}
          </select>
          <span className="text-meta text-jz-muted">设备列表来自 /api/pentest/devices；未选则沿用引擎自动选机。</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1 text-jz-muted">执行模式
            <select value={mode} onChange={(e) => setMode(e.target.value)} data-rerun-mode
              className="w-full h-8 px-2 rounded-control bg-jz-surface-2 border border-jz-border text-meta text-jz-ink">
              <option value="auto">自动（静态+动态可用通道）</option>
              <option value="step">分步</option>
              <option value="online">在线设备</option>
            </select>
          </label>
          <label className="block space-y-1 text-jz-muted">分析深度
            <select value={depth} onChange={(e) => setDepth(e.target.value)} data-rerun-depth
              className="w-full h-8 px-2 rounded-control bg-jz-surface-2 border border-jz-border text-meta text-jz-ink">
              <option value="deep">深度（默认）</option>
              <option value="shallow">浅层</option>
              <option value="full">全量</option>
            </select>
          </label>
        </div>
        {err && <div className="text-jz-sev-critical text-meta" data-rerun-error>{err}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={busy}>取消</Button>
          <Button onClick={submit} disabled={busy} data-rerun-confirm>
            <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> {busy ? '创建中…' : '开始重跑'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default RerunTaskModal;
