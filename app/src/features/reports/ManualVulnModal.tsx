// ManualVulnModal.tsx — 手动新增漏洞表单(标题/等级/组件/MASVS/证据/建议),
// 追加进当前任务本地合并层(纯前端暂存,零后端写入,导出即持久)。
import React, { useState } from 'react';
import { UnifiedModal, Button, toast } from '@/components/ui';
import type { LocalVuln } from './types';

const SEV_OPTIONS: Array<{ v: string; label: string }> = [
  { v: 'critical', label: 'critical 严重' },
  { v: 'high', label: 'high 高危' },
  { v: 'medium', label: 'medium 中危' },
  { v: 'low', label: 'low 低危' },
  { v: 'info', label: 'info 信息' },
];

const inputCls = 'w-full rounded-lg bg-jz-elevated/60 border border-transparent px-3 py-2 text-sm text-jz-text-primary outline-none focus:border-jz-active/50 placeholder:text-jz-text-muted';

export const ManualVulnModal: React.FC<{
 open: boolean;
 onClose: () => void;
 onAdd: (v: LocalVuln) => void;
}> = ({ open, onClose, onAdd }) => {
 const [title, setTitle] = useState('');
 const [severity, setSeverity] = useState('medium');
 const [component, setComponent] = useState('');
 const [masvs, setMasvs] = useState('');
 const [evidence, setEvidence] = useState('');
 const [repro, setRepro] = useState('');

 const submit = () => {
    if (!title.trim()) { toast.err('标题必填'); return; }
    onAdd({
      id: `M-${Date.now().toString(36)}`,
      rule_id: '手动新增',
      title: title.trim(),
      severity,
      masvs: masvs.trim(),
      evidence: evidence,
      component: component.trim(),
      repro: repro,
      state: 'confirmed',
      source: 'manual',
    });
    toast.ok(`已新增本地漏洞: ${title.trim().slice(0, 24)}`);
    setTitle(''); setSeverity('medium'); setComponent(''); setMasvs(''); setEvidence(''); setRepro('');
    onClose();
  };

  return (
    <UnifiedModal open={open} title={<>＋ 手动新增漏洞<span className="text-xs text-jz-text-muted font-normal ml-2">纯前端暂存(本地合并层),可随 CSV/JSON 导出持久</span></>}
 onClose={onClose} widthClass="w-[560px]">
      <div className="space-y-2.5">
        <div>
          <div className="text-xs text-jz-text-muted mb-1">标题 *</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} data-manual-title
 placeholder="漏洞标题" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-jz-text-muted mb-1">等级</div>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} data-manual-severity
 className={inputCls}>
 {SEV_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs text-jz-text-muted mb-1">MASVS / CWE</div>
            <input value={masvs} onChange={(e) => setMasvs(e.target.value)} data-manual-masvs
 placeholder="如 MASVS-CRYPTO-1" className={inputCls} />
          </div>
        </div>
        <div>
          <div className="text-xs text-jz-text-muted mb-1">组件路径</div>
          <input value={component} onChange={(e) => setComponent(e.target.value)} data-manual-component
 placeholder="如 com/demo/HashUtil.java:88" className={inputCls} />
        </div>
        <div>
          <div className="text-xs text-jz-text-muted mb-1">证据</div>
          <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} data-manual-evidence rows={4}
 placeholder="证据原文(支持 文件:行号 / HTTP 报文行,证据链面板会按三段式分桶)" className={`${inputCls} font-mono`} />
        </div>
        <div>
          <div className="text-xs text-jz-text-muted mb-1">修复建议</div>
          <textarea value={repro} onChange={(e) => setRepro(e.target.value)} data-manual-repro rows={2}
 placeholder="修复建议(可选)" className={inputCls} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="subtle" onClick={onClose}>取消</Button>
        <Button variant="primary" onClick={submit} data-manual-submit>追加漏洞</Button>
      </div>
    </UnifiedModal>
  );
};
