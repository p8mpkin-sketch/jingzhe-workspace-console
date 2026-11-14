// ImportModal.tsx — 导入数据 Modal(纯前端闭环): 目标选择(漏洞明细/鉴权矩阵)→ 格式(json/csv/sarif
// 拖拽或选择,内容嗅探)→ FileReader 解析 → 预览清单(条数/危级分布/字段校验)→ 合并策略
// (按标题+路径去重追加 / 覆盖)→ 确认合并入当前任务本地合并层 + Toast。
import React, { useRef, useState } from 'react';
import { UploadCloud, FileDown, Loader2 } from 'lucide-react';
import { UnifiedModal, Button, StatusBadge } from '@/components/ui';
import { toast } from '@/components/ui';
import { parseImportText, download, vulnTemplateCsv, matrixTemplateCsv } from './reportIo';
import type { ImportTarget, ImportPreview } from './reportIo';

const TARGET_LABEL: Record<ImportTarget, string> = { vulns: '漏洞明细', matrix: '鉴权矩阵' };

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

  return (
    <UnifiedModal open={open} title={<> 导入数据<span className="text-meta text-jz-muted font-normal ml-2">纯前端闭环: 合并入当前任务本地合并层,零后端写入,导出即持久</span></>}
 onClose={() => { reset(); onClose(); }} widthClass="w-[640px]">
      {/* ① 目标 */}
      <div className="space-y-1.5">
        <div className="text-meta font-semibold text-jz-ink-2">① 导入目标</div>
        <div className="flex items-center gap-2">
 {(['vulns', 'matrix'] as const).map((k) => (
            <button key={k} type="button" data-import-target={k}
 onClick={() => { setTarget(k); reset(); }}
 className={`px-4 py-2 rounded-control text-body font-medium transition-colors ${target === k ? 'bg-jz-brand/15 text-jz-brand ring-1 ring-jz-brand/50' : 'bg-jz-surface-2/50 text-jz-muted hover:text-jz-ink'}`}>
              {TARGET_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      {/* ② 格式与文件 */}
      <div className="space-y-1.5">
        <div className="text-meta font-semibold text-jz-ink-2">② 格式与文件(json / csv / sarif,按内容自动嗅探)</div>
        <div
 onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
 onDragLeave={() => setDragOver(false)}
 onDrop={(e) => {
 e.preventDefault(); setDragOver(false);
 const f = e.dataTransfer.files?.[0];
 if (f) readFile(f);
 }}
 data-import-dropzone
 className={`relative rounded-card border border-dashed px-4 py-6 text-center transition-colors overflow-hidden ${dragOver ? 'border-jz-brand bg-jz-brand/5' : 'border-jz-border hover:border-jz-brand/50'}`}>
          <input ref={fileRef} type="file" accept=".json,.csv,.sarif,.txt,application/json,text/csv"
 className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }} />
          <div className="relative flex items-center justify-center gap-2 text-body text-jz-ink-2">
            {busy ? <Loader2 size={15} className="animate-spin text-jz-brand" /> : <UploadCloud size={15} className="text-jz-brand" />}
            {fileName ? <span className="font-mono text-jz-ink truncate max-w-[300px]" title={fileName}>{fileName}</span> : <span>拖拽文件到此处,或</span>}
            <button type="button" onClick={() => fileRef.current?.click()} data-import-pick
 className="px-2.5 py-1 rounded-control bg-jz-surface-2/70 hover:bg-jz-brand/10 text-meta text-jz-ink">选择文件</button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-meta">
          <button type="button" data-import-template
 onClick={() => download(target === 'vulns' ? 'vuln_import_template.csv' : 'matrix_import_template.csv',
 target === 'vulns' ? vulnTemplateCsv() : matrixTemplateCsv(), 'text/csv;charset=utf-8')}
 className="inline-flex items-center gap-1 text-jz-brand hover:underline">
            <FileDown size={12} />下载导入模板
          </button>
          <span className="text-jz-muted">({target === 'vulns' ? '列: 标题/等级/组件路径/MASVS/证据/建议' : '列: 端点路径/匿名(红|黄|绿|灰)/普通/提权'})</span>
        </div>
      </div>
      {/* ③ 预览清单 */}
      <div className="space-y-1.5">
        <div className="text-meta font-semibold text-jz-ink-2">③ 预览与字段校验</div>
        {!pv ? (
          <div className="rounded-card bg-jz-surface-2/40 px-3 py-3 text-meta text-jz-muted">尚未解析文件</div>
        ) : (
          <div className="rounded-card bg-jz-surface-2/40 px-3 py-2.5 space-y-1.5 text-meta" data-import-preview>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge tone="info">嗅探格式: {pv.format.toUpperCase()}</StatusBadge>
              <span className="font-mono tnum text-jz-ink">有效 {total} 条</span>
 {pv.invalid > 0 && <span className="font-mono tnum text-jz-sev-medium">无效剔除 {pv.invalid} 条</span>}
 {target === 'vulns' && total > 0 && (
                <span className="flex items-center gap-1 flex-wrap">
 {Object.entries(pv.sevDist).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([sv, n]) => (
                    <StatusBadge key={sv} tone={sv === 'critical' ? 'critical' : sv === 'high' ? 'high' : sv === 'medium' ? 'medium' : sv === 'low' ? 'low' : 'info'}>{sv} {n}</StatusBadge>
                  ))}
                </span>
 )}
 {target === 'matrix' && total > 0 && (
                <span className="font-mono tnum text-jz-muted">
                  红 {pv.colorDist.red || 0} · 黄 {pv.colorDist.yellow || 0} · 绿 {pv.colorDist.green || 0} · 灰 {pv.colorDist.gray || 0}
                </span>
              )}
            </div>
 {pv.errors.length > 0 && (
              <div className="text-jz-sev-medium space-y-0.5" data-import-errors>
 {pv.errors.slice(0, 5).map((e, i) => <div key={i}>· {e}</div>)}
 {pv.errors.length > 5 && <div>… 共 {pv.errors.length} 条校验提示</div>}
              </div>
 )}
 {total > 0 && (
              <div className="max-h-28 overflow-auto rounded-control bg-jz-surface/60 divide-y divide-jz-border" data-import-rows>
 {pv.rows.slice(0, 8).map((r, i) => (
                  <div key={i} className="px-2 py-1 flex items-center gap-2 min-w-0">
                    <span className="font-mono text-jz-muted tnum flex-none">{i + 1}</span>
                    <span className="truncate text-jz-ink">{target === 'vulns' ? `[${r.severity}] ${r.title}` : `${r.path}(${r.color})`}</span>
                  </div>
 ))}
 {total > 8 && <div className="px-2 py-1 text-jz-muted">… 共 {total} 条</div>}
              </div>
            )}
          </div>
        )}
      </div>
      {/* ④ 合并策略 + 确认 */}
      <div className="space-y-1.5">
        <div className="text-meta font-semibold text-jz-ink-2">④ 合并策略</div>
        <div className="flex items-center gap-2 flex-wrap">
 {([['dedupe', '去重追加(按标题+路径跳过重复)'], ['override', '覆盖(同键本地条目被新数据替换)']] as const).map(([k, label]) => (
            <button key={k} type="button" data-import-strategy={k}
 onClick={() => setStrategy(k)}
 className={`px-3 py-1.5 rounded-control text-meta transition-colors ${strategy === k ? 'bg-jz-brand/15 text-jz-brand ring-1 ring-jz-brand/50' : 'bg-jz-surface-2/50 text-jz-muted hover:text-jz-ink'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="subtle" onClick={() => { reset(); onClose(); }}>取消</Button>
        <Button variant="primary" disabled={!canMerge} data-import-confirm
 onClick={() => { if (pv) { onMerge(target, pv.rows, strategy); reset(); onClose(); } }}>
          确认合并{canMerge ? `(${total} 条)` : ''}
        </Button>
      </div>
    </UnifiedModal>
  );
};
