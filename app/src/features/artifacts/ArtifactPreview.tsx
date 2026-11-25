// Preview of the file selected in the artifact browser: its facts (type, size, source, state), the one download
// control, and the content when it can be shown: text, JSON, Markdown, an image. A file that cannot be shown says
// why and still states its size and type. Reads go to the two endpoints the old dialog used.
import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Eye, FileQuestion, X } from 'lucide-react';
import { Button, EmptyState, ErrorState, IconButton, PermissionState, SegmentedControl, SkeletonLoader, StatusText } from '@/components/ui';
import { getToken } from '@/services/api';
import { KIND_WORD, PREVIEW_MAX_CHARS, PREVIEW_MAX_KB, REPORT_FILES, fmtSize, imageMime, kindOf, noPreviewReason, type FlatFile } from './artifactModel';

const MarkdownView = React.lazy(() => import('./MarkdownView'));

type Loaded =
  | { state: 'loading' }
  | { state: 'ok'; text: string; cut: number; image?: string }
  | { state: 'error'; message: string }
  | { state: 'forbidden' };

const pretty = (text: string) => { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return null; } };

export const ArtifactPreview: React.FC<{
  taskId: number;
  file: FlatFile | null;
  /** Where the file comes from, in words (the task). */
  source: string;
  downloading: boolean;
  onDownload: (f: FlatFile) => void;
  onClose: () => void;
}> = ({ taskId, file, source, downloading, onDownload, onClose }) => {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [raw, setRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = useRef<string | null>(null);
  const reason = file ? noPreviewReason(file) : null;
  const kind = file ? kindOf(file.name) : 'binary';

  useEffect(() => {
    setRaw(false); setCopied(false);
    if (url.current) { URL.revokeObjectURL(url.current); url.current = null; }
    if (!file || reason) return;
    let dead = false;
    setLoaded({ state: 'loading' });
    (async () => {
      const viaReport = !!REPORT_FILES[file.name];
      const target = viaReport
        ? `/api/tasks/${taskId}/report-file?name=${encodeURIComponent(file.name)}`
        : `/api/tasks/${taskId}/artifact?path=${encodeURIComponent(file.rel)}`;
      try {
        const r = await fetch(target, { headers: { Authorization: `Bearer ${getToken()}` } });
        if (dead) return;
        if (r.status === 403) { setLoaded({ state: 'forbidden' }); return; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        if (kind === 'image') {
          const blob = new Blob([await r.arrayBuffer()], { type: imageMime(file.name) });
          if (dead) return;
          url.current = URL.createObjectURL(blob);
          setLoaded({ state: 'ok', text: '', cut: 0, image: url.current });
          return;
        }
        const text = await r.text();
        if (dead) return;
        setLoaded({ state: 'ok', text: text.slice(0, PREVIEW_MAX_CHARS), cut: Math.max(0, text.length - PREVIEW_MAX_CHARS) });
      } catch (e: any) {
        if (!dead) setLoaded({ state: 'error', message: e?.message || '请求没有完成' });
      }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, file?.rel, file?.name, reason, kind, attempt]);
  useEffect(() => () => { if (url.current) URL.revokeObjectURL(url.current); }, []);

  if (!file) {
    return (
      <div className="flex min-h-64 flex-col lg:min-h-0" data-art-preview="none">
        <EmptyState icon={Eye} className="flex-1" title="选择一个文件" cause={`文本、JSON、Markdown 和图片可以在这里预览（不超过 ${PREVIEW_MAX_KB} kB）；其余文件显示大小和类型，可以下载。`} />
      </div>
    );
  }

  const text = loaded.state === 'ok' ? loaded.text : '';
  const json = kind === 'json' && loaded.state === 'ok' ? pretty(text) : null;
  const shown = kind === 'json' && json && !raw ? json : text;
  const canCopy = loaded.state === 'ok' && !loaded.image && !reason;
  const stateWord: React.ReactNode = reason ? <StatusText kind="neutral">不能预览</StatusText>
    : loaded.state === 'loading' ? <StatusText kind="queued">读取中</StatusText>
      : loaded.state === 'ok' ? <StatusText kind="done">已就绪</StatusText>
        : loaded.state === 'forbidden' ? <StatusText kind="blocked">无权限</StatusText>
          : <StatusText kind="failed">读取失败</StatusText>;
  const copy = async () => {
    try { await navigator.clipboard.writeText(shown); setCopied(true); window.setTimeout(() => setCopied(false), 1400); } catch { /* the clipboard is not available */ }
  };

  return (
    <div className="flex min-h-64 min-w-0 flex-col lg:min-h-0" data-art-preview={reason ? 'unsupported' : loaded.state} data-art-preview-kind={kind}>
      <div className="flex-none border-b border-jz-border px-4 py-2.5" data-art-preview-head>
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 break-all font-mono text-label font-medium text-jz-ink" data-art-preview-path>{file.rel}</h3>
          {canCopy && (
            <IconButton size="sm" label={copied ? '已复制' : '复制全文'} onClick={() => void copy()} data-art-copy={copied ? 'done' : 'idle'}>
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            </IconButton>
          )}
          <Button size="sm" variant="secondary" icon={<Download size={14} aria-hidden />} loading={downloading} onClick={() => onDownload(file)} data-art-download>下载</Button>
          <IconButton size="sm" label="关闭预览" onClick={onClose} data-art-preview-close><X size={14} aria-hidden /></IconButton>
        </div>
        <dl className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-jz-muted" data-art-facts>
          <div className="flex gap-1.5"><dt>类型</dt><dd className="text-jz-ink-2" data-art-fact="type">{KIND_WORD[kind]}</dd></div>
          <div className="flex gap-1.5"><dt>大小</dt><dd className="font-mono tnum text-jz-ink-2" data-art-fact="size">{fmtSize(file.size_kb)}</dd></div>
          <div className="flex gap-1.5"><dt>来源</dt><dd className="text-jz-ink-2" data-art-fact="source">{source}</dd></div>
          <div className="flex items-center gap-1.5"><dt>状态</dt><dd data-art-fact="state">{stateWord}</dd></div>
        </dl>
      </div>

      {(kind === 'markdown' || (kind === 'json' && json)) && loaded.state === 'ok' && (
        <div className="flex-none border-b border-jz-border px-4 py-1.5">
          <SegmentedControl label="预览方式" value={raw ? 'raw' : 'rendered'} onChange={(k) => setRaw(k === 'raw')}
            items={[{ key: 'rendered', label: kind === 'json' ? '格式化' : '渲染', dataAttrs: { 'data-art-view': 'rendered' } }, { key: 'raw', label: '原文', dataAttrs: { 'data-art-view': 'raw' } }]} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto" tabIndex={0} aria-label={`${file.name} 的内容`} data-art-preview-body>
        {reason ? (
          <EmptyState icon={FileQuestion} title="这个文件不能在线预览"
            cause={reason === 'large'
              ? `文件有 ${fmtSize(file.size_kb)}，超过了在线预览的上限 ${PREVIEW_MAX_KB} kB。可以下载后查看。`
              : `这是二进制文件或不支持预览的类型（${fmtSize(file.size_kb)}）。可以下载后查看。`} />
        ) : loaded.state === 'loading' ? (
          <div className="p-4" aria-busy="true"><SkeletonLoader variant="table" rows={6} /></div>
        ) : loaded.state === 'forbidden' ? (
          <PermissionState title="没有权限读取这个文件" message="当前账号不能读取这个任务的产物文件。请切换账号或联系管理员。" />
        ) : loaded.state === 'error' ? (
          <ErrorState title="文件内容没有读到" message={`${loaded.message}。文件本身没有变化，可以再读一次或直接下载。`} onRetry={() => setAttempt((n) => n + 1)} />
        ) : loaded.image ? (
          <div className="grid min-h-full place-items-center bg-jz-surface-2 p-4"><img src={loaded.image} alt={`${file.name} 的预览`} className="max-h-full max-w-full" data-art-image /></div>
        ) : !text ? (
          <EmptyState icon={FileQuestion} title="这个文件是空的" cause="服务端返回了空内容。" />
        ) : kind === 'markdown' && !raw ? (
          <div className="p-4"><Suspense fallback={<SkeletonLoader variant="table" rows={6} />}><MarkdownView text={text} /></Suspense></div>
        ) : (
          <pre className="m-0 whitespace-pre-wrap break-all p-4 font-mono text-label text-jz-ink-2" data-art-text>{shown}</pre>
        )}
        {loaded.state === 'ok' && loaded.cut > 0 && (
          <p className="border-t border-jz-border px-4 py-2 text-meta text-jz-muted" data-art-cut>预览只显示前 {PREVIEW_MAX_CHARS.toLocaleString()} 个字符，还有 {loaded.cut.toLocaleString()} 个字符没有显示。完整内容在下载的文件里。</p>
        )}
      </div>
    </div>
  );
};
