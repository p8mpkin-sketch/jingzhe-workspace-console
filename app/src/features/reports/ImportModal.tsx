// ImportModal.tsx — import dialog (client side only): target, file (json / csv / sarif, sniffed by content),
// parsed preview with validation, merge strategy, confirm. Rows are merged into the page's local layer by the parent.
import React, { useRef, useState } from 'react';
import { UploadCloud, FileDown, Loader2 } from 'lucide-react';
import { Dialog, Button, SegmentedControl, SeverityBadge, Tag, InlineAlert, Radio, toast } from '@/components/ui';
import type { TabItem } from '@/components/ui';
import { sevLevel, MX_LABEL, BlockLabel } from './shared';
import { parseImportText, download, vulnTemplateCsv, matrixTemplateCsv } from './reportIo';
import type { ImportTarget, ImportPreview } from './reportIo';

const TARGET_ITEMS: TabItem<ImportTarget>[] = [
  { key: 'vulns', label: '发现明细', dataAttrs: { 'data-import-target': 'vulns' } },
  { key: 'matrix', label: '鉴权矩阵', dataAttrs: { 'data-import-target': 'matrix' } },
];

export const ImportModal: React.FC<{
 open: boolean;
 onClose: () => void;
 /** 确认合并: 交父层写入本地合并层(漏洞/矩阵),父层负责 Toast */
 onMerge: (target: ImportTarget, rows: any[], strategy: 'dedupe' | 'override') => void;
}> = ({ open, onClose, onMerge }) => {
  const [target, setTarget] = useState<ImportTarget>('vulns');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [strategy, setStrategy] = useState<'dedupe' | 'override'>('dedupe');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

 const reset = () => { setPreview(null); setFileName(''); setStrategy('dedupe'); };

 const handleText = (text: string, name: string) => {
 setFileName(name);
 setPreview(parseImportText(text, target));
 };
 const readFile = (f: File) => {
 setBusy(true);
 const rd = new FileReader();
 rd.onload = () => { handleText(String(rd.result || ''), f.name); setBusy(false); };
 rd.onerror = () => { toast.err('文件读取失败'); setBusy(false); };
 rd.readAsText(f, 'utf-8');
 };

 const pv = preview;
 const total = pv?.rows.length ?? 0;
 const canMerge = total > 0;

  const close = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onClose={close} title="导入数据" widthClass="w-full max-w-jz-dialog"
      description="导入的数据只合并到当前页面,不会写入服务端;导出后才会保留。"
      footer={(
        <>
          <Button variant="secondary" onClick={close}>取消</Button>
          <Button disabled={!canMerge} data-import-confirm onClick={() => { if (pv) { onMerge(target, pv.rows, strategy); reset(); onClose(); } }}>
            {canMerge ? `合并 ${total} 条` : '合并'}
          </Button>
        </>
      )}>
      <div className="space-y-5">
        <div>
          <BlockLabel>导入到</BlockLabel>
          <SegmentedControl items={TARGET_ITEMS} value={target} onChange={(k) => { setTarget(k); reset(); }} label="导入目标" />
        </div>

        <div>
          <BlockLabel>文件</BlockLabel>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault(); setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) readFile(f);
            }}
            data-import-dropzone
            className={`flex flex-col items-center gap-2 rounded-card border border-dashed px-4 py-6 text-center transition-colors duration-hover ${dragOver ? 'border-jz-brand bg-jz-brand-soft' : 'border-jz-border-strong'}`}>
            <input ref={fileRef} type="file" accept=".json,.csv,.sarif,.txt,application/json,text/csv" tabIndex={-1} aria-hidden
              className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }} />
            {busy ? <Loader2 size={18} className="animate-spin text-jz-muted" aria-hidden /> : <UploadCloud size={18} className="text-jz-muted" aria-hidden />}
            {fileName
              ? <span className="max-w-full truncate font-mono text-label text-jz-ink" title={fileName}>{fileName}</span>
              : <span className="text-label text-jz-ink-2">把文件拖到这里,或从本机选择</span>}
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} data-import-pick>{fileName ? '换一个文件' : '选择文件'}</Button>
            <span className="text-meta text-jz-muted">支持 JSON、CSV、SARIF,按内容自动识别格式</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-jz-muted">
            <Button size="sm" variant="ghost" className="-ml-2" icon={<FileDown size={14} aria-hidden />} data-import-template
              onClick={() => download(target === 'vulns' ? 'vuln_import_template.csv' : 'matrix_import_template.csv',
                target === 'vulns' ? vulnTemplateCsv() : matrixTemplateCsv(), 'text/csv;charset=utf-8')}>
              下载 CSV 模板
            </Button>
            <span>{target === 'vulns' ? '列: 标题、等级、组件路径、MASVS、证据、建议' : '列: 端点路径、匿名(红 / 黄 / 绿 / 灰)、普通、提权'}</span>
          </div>
        </div>

        <div>
          <BlockLabel>解析结果</BlockLabel>
          {!pv ? (
            <p className="rounded-control bg-jz-surface-2 px-3 py-2.5 text-label text-jz-muted">选择文件后在这里显示解析结果。</p>
          ) : (
            <div className="space-y-2.5" data-import-preview>
              <div className="flex flex-wrap items-center gap-2 text-label">
                <Tag mono>{pv.format.toUpperCase()}</Tag>
                <span className="tnum text-jz-ink">有效 {total} 条</span>
                {pv.invalid > 0 && <span className="tnum text-jz-amber">已剔除无效 {pv.invalid} 条</span>}
                {target === 'vulns' && total > 0 && Object.entries(pv.sevDist).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([sv, n]) => (
                  <SeverityBadge key={sv} level={sevLevel(sv)}>{sv} {n}</SeverityBadge>
                ))}
                {target === 'matrix' && total > 0 && (
                  <span className="tnum text-jz-muted">
                    {(['red', 'yellow', 'green', 'gray'] as const).map((k) => `${MX_LABEL[k]} ${pv.colorDist[k] || 0}`).join(' · ')}
                  </span>
                )}
              </div>
              {total === 0 && pv.errors.length === 0 && <InlineAlert tone="attention">文件里没有可导入的行。</InlineAlert>}
              {pv.errors.length > 0 && (
                <InlineAlert tone="attention" title="部分内容没有通过校验" data-import-errors>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {pv.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                    {pv.errors.length > 5 && <li>共 {pv.errors.length} 条提示</li>}
                  </ul>
                </InlineAlert>
              )}
              {total > 0 && (
                <ol className="max-h-32 divide-y divide-jz-border overflow-auto rounded-control border border-jz-border text-label" data-import-rows>
                  {pv.rows.slice(0, 8).map((r, i) => (
                    <li key={i} className="flex min-w-0 items-center gap-2 px-3 py-1.5">
                      <span className="flex-none font-mono text-meta tnum text-jz-muted">{i + 1}</span>
                      <span className="truncate text-jz-ink">{target === 'vulns' ? `[${r.severity}] ${r.title}` : `${r.path}(${MX_LABEL[r.color] || r.color})`}</span>
                    </li>
                  ))}
                  {total > 8 && <li className="px-3 py-1.5 text-meta text-jz-muted">其余 {total - 8} 条未列出</li>}
                </ol>
              )}
            </div>
          )}
        </div>

        <fieldset>
          <legend className="mb-1 text-meta font-medium text-jz-ink-2">遇到重复条目时</legend>
          <div className="flex flex-col gap-1.5">
            <Radio name="import-strategy" checked={strategy === 'dedupe'} onChange={() => setStrategy('dedupe')} data-import-strategy="dedupe"
              label="跳过重复" hint="标题和路径都相同的条目保留现有内容,只追加新条目" />
            <Radio name="import-strategy" checked={strategy === 'override'} onChange={() => setStrategy('override')} data-import-strategy="override"
              label="用导入内容替换" hint="标题和路径都相同的本地条目会被导入的内容替换" />
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
};
