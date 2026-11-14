import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '@/services/api';
import { Button, Dialog, Field, Select, InlineAlert } from '@/components/ui';

type Device = { serial: string; model?: string; root?: boolean; wrap_ready?: { ok?: boolean } };

/** Rerun with a chance to pick device, mode and depth again; the choices go to the new task. */
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
    <Dialog open onClose={onClose} title={`重新运行任务 #${task.id}`}
      description="会新建一个任务重新执行,原任务和它的报告保持不变。"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>取消</Button>
          <Button variant="primary" onClick={submit} loading={busy} icon={<RefreshCw size={16} aria-hidden />} data-rerun-confirm>
            {busy ? '创建中…' : '重新运行'}
          </Button>
        </>
      )}>
      <div className="space-y-4" data-rerun-modal>
        <div className="rounded-card bg-jz-surface-2 px-3 py-2.5">
          <div className="text-meta text-jz-muted">目标</div>
          <div className="mt-0.5 break-all text-label font-semibold text-jz-ink">{task.app_name || task.package || task.apk_path || '—'}</div>
          <div className="mt-0.5 break-all font-mono text-meta text-jz-muted">{task.apk_path || '没有记录安装包路径'}</div>
        </div>
        <Field label="脱壳设备" hint="不选时由系统自动选择设备。">
          {(ids) => (
            <Select ids={ids} value={device} onChange={(e) => setDevice(e.target.value)} data-rerun-device>
              <option value="">自动选择(优先已 root 且环境就绪的真机)</option>
              {devices.map((d) => (
                <option key={d.serial} value={d.serial}>
                  {d.model || d.serial} · {d.serial}{d.wrap_ready?.ok ? ' · 环境就绪' : ' · 环境未就绪'}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="执行模式">
            {(ids) => (
              <Select ids={ids} value={mode} onChange={(e) => setMode(e.target.value)} data-rerun-mode>
                <option value="auto">自动(静态加可用的动态通道)</option>
                <option value="step">分步</option>
                <option value="online">在线设备</option>
              </Select>
            )}
          </Field>
          <Field label="分析深度">
            {(ids) => (
              <Select ids={ids} value={depth} onChange={(e) => setDepth(e.target.value)} data-rerun-depth>
                <option value="deep">深度(默认)</option>
                <option value="shallow">浅层</option>
                <option value="full">全量</option>
              </Select>
            )}
          </Field>
        </div>
        {err && <InlineAlert tone="danger" title="没有创建成功" data-rerun-error>{err}</InlineAlert>}
      </div>
    </Dialog>
  );
};

export default RerunTaskModal;
