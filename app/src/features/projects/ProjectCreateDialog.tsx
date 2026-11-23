// The one way to create a project. The type is chosen inside the dialog; both types post to the same existing
// endpoint with the payload their previous entry used (company: the company form; single: name and note).
import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/services/api';
import { Button, Dialog, Field, InlineAlert, Input, SegmentedControl, Select } from '@/components/ui';

type Kind = 'company' | 'single';
const EMPTY = { name: '', company_name: '', brands: '', source: 'device', note: '' };

export const ProjectCreateDialog: React.FC<{
  open: boolean;
  /** Preselected type: the scope the index is showing. */
  initialKind?: Kind;
  onClose: () => void;
  /** Called with the new project id and its type after the API accepted it. */
  onCreated: (id: number, kind: Kind) => void;
}> = ({ open, initialKind = 'company', onClose, onCreated }) => {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setKind(initialKind); setForm(EMPTY); setErr(''); } }, [open, initialKind]);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const nameMissing = !!err && !form.name.trim();

  const create = async () => {
    const name = form.name.trim();
    if (!name) { setErr('请填写项目名称'); return; }
    setBusy(true); setErr('');
    try {
      const body = kind === 'company'
        ? { ...form, kind: 'company', status: 'draft', brands: form.brands.split(',').map((x) => x.trim()).filter(Boolean) }
        : { name, note: form.note.trim() };
      const r = await api<{ id: number }>('/api/pentest/projects', { method: 'POST', body: JSON.stringify(body) });
      onCreated(r.id, kind);
    } catch (e: any) {
      setErr('创建失败：' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="新建项目" dataAttrs={{ 'data-project-create-dialog': kind }}
      description={kind === 'company' ? '以一家公司或集团为范围。创建后进入项目，再导入应用清单。' : '以一个应用为范围。创建后进入项目，选择应用和设备建立第一个会话。'}
      footer={<>
        <Button variant="secondary" onClick={onClose}>取消</Button>
        <Button icon={<Plus size={16} aria-hidden />} loading={busy} onClick={create} data-project-create-submit>
          {kind === 'company' ? '创建项目' : '创建并新建会话'}
        </Button>
      </>}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <span className="text-label font-medium text-jz-ink-2" id="project-kind-label">项目类型</span>
          <SegmentedControl<Kind> label="项目类型" value={kind} onChange={setKind} className="self-start"
            items={[
              { key: 'company', label: '公司级', dataAttrs: { 'data-project-kind': 'company' } },
              { key: 'single', label: '单应用', dataAttrs: { 'data-project-kind': 'single' } },
            ]} />
        </div>
        <Field label="项目名称" required className="md:col-span-2" error={nameMissing ? err : undefined}>
          {(ids) => <Input ids={ids} data-autofocus data-wizard-project-name value={form.name} onChange={set('name')}
            placeholder={kind === 'company' ? '例如：某集团 2026 应用批量评估' : '例如：某应用 3.2 版本评估'} />}
        </Field>
        {kind === 'company' && (
          <>
            <Field label="公司或集团">
              {(ids) => <Input ids={ids} value={form.company_name} onChange={set('company_name')} />}
            </Field>
            <Field label="来源">
              {(ids) => (
                <Select ids={ids} value={form.source} onChange={set('source')}>
                  <option value="device">设备提取</option><option value="public">公开渠道</option><option value="client">客户提供</option>
                </Select>
              )}
            </Field>
            <Field label="品牌" hint="多个品牌用英文逗号分隔" className="md:col-span-2">
              {(ids) => <Input ids={ids} value={form.brands} onChange={set('brands')} />}
            </Field>
          </>
        )}
        <Field label="备注与授权范围" className="md:col-span-2">
          {(ids) => <Input ids={ids} value={form.note} onChange={set('note')} placeholder="例如：仅评估公司自有应用，授权编号" />}
        </Field>
      </div>
      {err && !nameMissing && <InlineAlert tone="danger" className="mt-4">{err}</InlineAlert>}
    </Dialog>
  );
};
