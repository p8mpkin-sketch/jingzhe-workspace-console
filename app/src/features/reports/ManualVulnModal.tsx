// ManualVulnModal.tsx — add a finding by hand. It is appended to the page's local layer by the parent
// (page state only; kept through CSV / JSON export).
import React, { useState } from 'react';
import { Dialog, Button, Field, Input, Select, Textarea, toast } from '@/components/ui';
import type { LocalVuln } from './types';

const SEV_OPTIONS: Array<{ v: string; label: string }> = [
  { v: 'critical', label: 'critical 严重' },
  { v: 'high', label: 'high 高危' },
  { v: 'medium', label: 'medium 中危' },
  { v: 'low', label: 'low 低危' },
  { v: 'info', label: 'info 信息' },
];

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
  const [titleErr, setTitleErr] = useState(false);

  const submit = () => {
    if (!title.trim()) { setTitleErr(true); toast.err('标题必填'); return; }
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
    toast.ok(`已添加本地发现: ${title.trim().slice(0, 24)}`);
    setTitle(''); setSeverity('medium'); setComponent(''); setMasvs(''); setEvidence(''); setRepro(''); setTitleErr(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="手动添加发现" widthClass="w-full max-w-jz-dialog"
      description="添加的发现只保存在当前页面,状态为已确认;导出 CSV 或 JSON 后才会保留。"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={submit} data-manual-submit>添加发现</Button>
        </>
      )}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="标题" required error={titleErr ? '请填写标题' : undefined}>
          {(ids) => <Input ids={ids} value={title} onChange={(e) => { setTitle(e.target.value); if (titleErr) setTitleErr(false); }} data-manual-title data-autofocus />}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="等级">
            {(ids) => (
              <Select ids={ids} value={severity} onChange={(e) => setSeverity(e.target.value)} data-manual-severity>
                {SEV_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="MASVS / CWE" hint="例如 MASVS-CRYPTO-1">
            {(ids) => <Input ids={ids} className="font-mono" value={masvs} onChange={(e) => setMasvs(e.target.value)} data-manual-masvs />}
          </Field>
        </div>
        <Field label="组件路径" hint="例如 com/demo/HashUtil.java:88">
          {(ids) => <Input ids={ids} className="font-mono" value={component} onChange={(e) => setComponent(e.target.value)} data-manual-component />}
        </Field>
        <Field label="证据" hint="「文件:行号」和 HTTP 报文行会在明细里分别归到代码位置、请求与响应">
          {(ids) => <Textarea ids={ids} className="font-mono" rows={4} value={evidence} onChange={(e) => setEvidence(e.target.value)} data-manual-evidence />}
        </Field>
        <Field label="修复建议" hint="可选">
          {(ids) => <Textarea ids={ids} rows={2} value={repro} onChange={(e) => setRepro(e.target.value)} data-manual-repro />}
        </Field>
      </form>
    </Dialog>
  );
};
