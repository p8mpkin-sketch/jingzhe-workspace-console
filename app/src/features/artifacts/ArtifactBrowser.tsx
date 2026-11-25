// The artifact browser: the files a task left behind, as a tree with a preview beside it. Used by the assessment
// workbench (产物 › 分析输出) and by the task dialog; both get the same component and the same requests.
//   list      GET /api/tasks/{tid}/artifacts?prefix=   one request per directory (at most 60, three levels deep;
//             a deeper directory is read when it is opened)
//   preview   GET /api/tasks/{tid}/report-file?name= | /artifact?path=      (ArtifactPreview)
//   download  GET /api/tasks/{tid}/artifact?path=      the one download control, on the selected file
//   bundles   GET /api/pentest/sessions/{sid}/report/package (打包下载), /api/tasks/{tid}/source-apk, /dex-package
//   upload    POST /api/upload                         goes to the sample library, not into this task's directory
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, File, FileArchive, FileCode2, FileImage, FileJson, FileText, FlaskConical, Folder, FolderOpen,
  MoreHorizontal, PackageOpen, RefreshCw, ScrollText, Upload,
} from 'lucide-react';
import { api, getToken } from '@/services/api';
import { Button, EmptyState, ErrorState, IconButton, InlineAlert, MenuItem, PermissionState, Popover, SearchField, SkeletonLoader, cx } from '@/components/ui';
import { downloadJson } from '@/features/reports/reportIo';
import { ArtifactPreview } from './ArtifactPreview';
import {
  ART_CATS, EXT_GROUPS, KIND_WORD, SCAN_MAX_DEPTH, SCAN_MAX_REQ, catOf, fmtSize, kindOf, noPreviewReason, type FileKind, type FlatFile,
} from './artifactModel';

type Dir = { name: string; rel: string; files?: number; loaded: boolean; failed?: 'error' | 'forbidden' };
type Root = { state: 'loading' | 'ok' | 'error' | 'forbidden'; runDir?: string; emptyReason?: string; message?: string };
type Note = { tone: 'info' | 'danger'; text: string };

const DIR_ICON: Record<string, React.ElementType> = { analysis: FlaskConical, decompiled: FileCode2, report: ScrollText, unpacked: PackageOpen };
const KIND_ICON: Record<FileKind, React.ElementType> = { markdown: FileText, json: FileJson, image: FileImage, text: FileText, binary: File };
const parentOf = (rel: string) => rel.split('/').slice(0, -1).join('/');
const pad = (depth: number): React.CSSProperties => ({ paddingLeft: `calc(var(--jz-space-3) + ${depth} * var(--jz-space-4))` });

export const ArtifactBrowser: React.FC<{
  taskId: number;
  taskName: string;
  /** The assessment session of the task. With one, the report package can be downloaded. */
  linked: { pid: number; sid: number } | null;
  className?: string;
}> = ({ taskId, taskName, linked, className }) => {
  const [root, setRoot] = useState<Root>({ state: 'loading' });
  const [files, setFiles] = useState<FlatFile[] | null>(null);
  const [dirs, setDirs] = useState<Dir[]>([]);
  const [scanning, setScanning] = useState(false);
  const [stale, setStale] = useState<null | 'error' | 'forbidden'>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [catF, setCatF] = useState('all');
  const [extF, setExtF] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const upRef = useRef<HTMLInputElement>(null);
  const run = useRef(0);
  const have = useRef(false);

  // One pass over the directories, breadth first. A refresh that fails keeps what was read before and says so.
  const scan = useCallback(async (tid: number) => {
    const me = ++run.current;
    setScanning(true);
    if (!have.current) setRoot({ state: 'loading' });
    let head: any;
    try {
      head = await api<any>(`/api/tasks/${tid}/artifacts?prefix=`, {}, true);
    } catch (e: any) {
      if (me !== run.current) return;
      const kind = e?.status === 403 ? 'forbidden' : 'error';
      if (have.current) setStale(kind); else setRoot({ state: kind, message: e?.message || '请求没有完成' });
      setScanning(false);
      return;
    }
    if (me !== run.current) return;
    const outFiles: FlatFile[] = []; const outDirs: Dir[] = [];
    const queue: Array<{ rel: string; depth: number }> = [{ rel: '', depth: 0 }];
    let reqs = 0;
    while (queue.length && reqs < SCAN_MAX_REQ) {
      const { rel, depth } = queue.shift()!;
      reqs++;
      let d: any = null;
      try { d = await api<any>(`/api/tasks/${tid}/artifacts?prefix=${encodeURIComponent(rel)}`, {}, true); }
      catch (e: any) { const at = outDirs.find((x) => x.rel === rel); if (at) { at.loaded = false; at.failed = e?.status === 403 ? 'forbidden' : 'error'; } }
      if (me !== run.current) return;
      for (const e of d?.entries || []) {
        if (e.type === 'dir') {
          const walk = depth + 1 < SCAN_MAX_DEPTH;
          outDirs.push({ name: e.name, rel: e.rel, files: e.files, loaded: walk });
          if (walk) queue.push({ rel: e.rel, depth: depth + 1 });
        } else outFiles.push({ name: e.name, rel: e.rel, size_kb: e.size_kb ?? 0 });
      }
    }
    // Directories the walk did not reach (request cap) are read when they are opened.
    for (const left of queue) { const at = outDirs.find((x) => x.rel === left.rel); if (at) at.loaded = false; }
    outFiles.sort((a, b) => a.rel.localeCompare(b.rel));
    const first = !have.current;
    have.current = true;
    setFiles(outFiles); setDirs(outDirs); setStale(null);
    setRoot({ state: 'ok', runDir: head?.run_dir || '', emptyReason: head?.empty_reason || '' });
    if (first) setOpen(new Set(outFiles.length <= 40 ? outDirs.filter((x) => x.loaded).map((x) => x.rel) : []));
    setScanning(false);
  }, []);

  useEffect(() => {
    have.current = false;
    setFiles(null); setDirs([]); setSelected(null); setNote(null); setQ(''); setCatF('all'); setExtF('all'); setStale(null); setOpen(new Set());
    void scan(taskId);
    return () => { run.current++; };
  }, [taskId, scan]);

  // A directory beyond the walk, or one whose read failed: one request for its entries when it is opened.
  const loadDir = async (rel: string) => {
    setBusy(`dir:${rel}`);
    try {
      const d = await api<any>(`/api/tasks/${taskId}/artifacts?prefix=${encodeURIComponent(rel)}`, {}, true);
      const addF: FlatFile[] = []; const addD: Dir[] = [];
      for (const e of d?.entries || []) (e.type === 'dir' ? addD.push({ name: e.name, rel: e.rel, files: e.files, loaded: false }) : addF.push({ name: e.name, rel: e.rel, size_kb: e.size_kb ?? 0 }));
      setFiles((cur) => [...(cur || []).filter((f) => !addF.some((x) => x.rel === f.rel)), ...addF].sort((a, b) => a.rel.localeCompare(b.rel)));
      setDirs((cur) => [...cur.filter((x) => !addD.some((y) => y.rel === x.rel)).map((x) => (x.rel === rel ? { ...x, loaded: true, failed: undefined } : x)), ...addD]);
    } catch (e: any) {
      setDirs((cur) => cur.map((x) => (x.rel === rel ? { ...x, failed: e?.status === 403 ? 'forbidden' : 'error' } : x)));
    } finally { setBusy(null); }
  };
  const toggleDir = (d: Dir) => {
    const next = new Set(open);
    if (next.has(d.rel)) next.delete(d.rel); else { next.add(d.rel); if (!d.loaded) void loadDir(d.rel); }
    setOpen(next);
  };

  const fetchBlob = async (url: string, name: string, key: string, done: string, what: string) => {
    setBusy(key); setNote(null);
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (r.status === 403) { setNote({ tone: 'danger', text: `当前账号无权下载${what}。请切换账号或联系管理员。` }); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      setNote({ tone: 'info', text: done });
    } catch (e: any) {
      setNote({ tone: 'danger', text: `${what}没有下载成功：${e?.message || '请求没有完成'}。` });
    } finally { setBusy(null); }
  };
  const dlFile = (f: FlatFile) => fetchBlob(`/api/tasks/${taskId}/artifact?path=${encodeURIComponent(f.rel)}`, f.name, `file:${f.rel}`, `已下载 ${f.name}`, `文件 ${f.name} `);
  const dlZip = () => linked && fetchBlob(`/api/pentest/sessions/${linked.sid}/report/package`, `report_${linked.sid}.zip`, 'zip', `已下载会话 #${linked.sid} 的报告包`, '报告包');
  const dlSourceApk = () => fetchBlob(`/api/tasks/${taskId}/source-apk`, `${(taskName || 'task' + taskId).replace(/[\\/:*?"<>|]/g, '_')}.apk`, 'source-apk', '已下载原始安装包', '原始安装包');
  const dlDex = () => fetchBlob(`/api/tasks/${taskId}/dex-package`, `task${taskId}_dex.zip`, 'dex-package', '已下载脱壳 DEX 压缩包', '脱壳 DEX 压缩包');

  const upload = async (f: File) => {
    setBusy('upload'); setNote(null);
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
      if (r.status === 403) { setNote({ tone: 'danger', text: '当前账号无权上传到样本库。请切换账号或联系管理员。' }); return; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.apk_path) throw new Error(d.detail || `HTTP ${r.status}`);
      setNote({ tone: 'info', text: `已上传到样本库：${d.apk_path}。文件没有写入这个任务的产物目录。` });
    } catch (e: any) {
      setNote({ tone: 'danger', text: `上传没有成功：${e?.message || '请求没有完成'}。` });
    } finally { setBusy(null); }
  };
  const exportList = () => {
    if (!files) return;
    downloadJson(`task${taskId}_artifacts_manifest`, {
      kind: 'apksec_artifacts_manifest', task_id: taskId, task: taskName,
      run_dir: root.runDir || '', exported_at: new Date().toISOString(),
      count: files.length, files,
    });
    setNote({ tone: 'info', text: `已导出文件清单（${files.length} 个文件）` });
  };

  const all = files || [];
  const filtering = !!q.trim() || catF !== 'all' || extF !== 'all';
  const shown = useMemo(() => {
    let list = all;
    const kw = q.trim().toLowerCase();
    if (kw) list = list.filter((f) => f.rel.toLowerCase().includes(kw));
    if (catF !== 'all') list = list.filter((f) => catOf(f.rel, f.name) === catF);
    if (extF !== 'all') {
      const g = EXT_GROUPS.find((x) => x.key === extF);
      list = g ? list.filter((f) => g.test(f.name)) : list.filter((f) => !EXT_GROUPS.some((x) => x.test(f.name)));
    }
    return list;
  }, [all, q, catF, extF]);
  const catCounts = useMemo(() => { const m: Record<string, number> = {}; for (const f of all) { const k = catOf(f.rel, f.name); if (k) m[k] = (m[k] || 0) + 1; } return m; }, [all]);
  const extOptions = useMemo(() => {
    const present = EXT_GROUPS.filter((g) => all.some((f) => g.test(f.name))).map((g) => [g.key, g.label] as [string, string]);
    const other = all.filter((f) => !EXT_GROUPS.some((g) => g.test(f.name))).length;
    if (other > 0) present.push(['other', `其他（${other}）`]);
    return present;
  }, [all]);
  const current = useMemo(() => all.find((f) => f.rel === selected) || null, [all, selected]);
  const unreadDirs = dirs.filter((d) => d.failed);

  const chip = (on: boolean) => cx('inline-flex h-7 items-center gap-1.5 rounded-control border px-2 text-meta transition-colors duration-hover max-[760px]:h-jz-touch',
    on ? 'border-jz-border-strong bg-jz-surface-2 font-medium text-jz-ink' : 'border-jz-border text-jz-ink-2 hover:border-jz-border-strong hover:bg-jz-surface-2');

  const fileRow = (f: FlatFile, depth: number, full: boolean) => {
    const kind = kindOf(f.name); const Icon = KIND_ICON[kind]; const on = selected === f.rel; const why = noPreviewReason(f);
    return (
      <li key={f.rel} role="none">
        <button type="button" onClick={() => setSelected(f.rel)} aria-current={on ? 'true' : undefined} data-art-file={f.rel} data-art-file-kind={kind} data-art-previewable={why ? 'no' : 'yes'}
          title={`${f.rel} · ${KIND_WORD[kind]} · ${fmtSize(f.size_kb)}${why ? ' · 不能在线预览' : ''}`} style={pad(depth)}
          className={cx('flex min-h-jz-control w-full items-center gap-2 border-l-2 py-1 pr-3 text-left max-[760px]:min-h-jz-touch',
            on ? 'border-l-jz-line-active bg-jz-surface-2' : 'border-l-transparent hover:bg-jz-surface-2')}>
          <Icon size={14} aria-hidden className="flex-none text-jz-muted" />
          <span className={cx('min-w-0 flex-1 truncate font-mono text-meta', on ? 'font-medium text-jz-ink' : 'text-jz-ink')}>{full ? f.rel : f.name}</span>
          <span className="flex-none text-meta text-jz-muted">{KIND_WORD[kind]}</span>
          <span className="w-16 flex-none text-right font-mono text-meta tnum text-jz-muted" data-art-size>{fmtSize(f.size_kb)}</span>
        </button>
      </li>
    );
  };
  const level = (parent: string, depth: number): React.ReactNode => (
    <>
      {dirs.filter((d) => parentOf(d.rel) === parent).sort((a, b) => a.name.localeCompare(b.name)).map((d) => {
        const isOpen = open.has(d.rel); const Icon = DIR_ICON[d.name] || (isOpen ? FolderOpen : Folder);
        const n = d.files ?? all.filter((f) => f.rel.startsWith(d.rel + '/')).length;
        return (
          <li key={d.rel} role="none">
            <button type="button" onClick={() => toggleDir(d)} aria-expanded={isOpen} data-art-dir={d.rel} title={`${isOpen ? '收起' : '展开'} ${d.rel}`} style={pad(depth)}
              className="flex min-h-jz-control w-full items-center gap-2 border-l-2 border-l-transparent py-1 pr-3 text-left hover:bg-jz-surface-2 max-[760px]:min-h-jz-touch">
              {isOpen ? <ChevronDown size={14} aria-hidden className="flex-none text-jz-muted" /> : <ChevronRight size={14} aria-hidden className="flex-none text-jz-muted" />}
              <Icon size={14} aria-hidden className="flex-none text-jz-muted" />
              <span className="min-w-0 flex-1 truncate text-label text-jz-ink">{d.name}/</span>
              <span className="flex-none font-mono text-meta tnum text-jz-muted">{n} 个文件</span>
            </button>
            {isOpen && (
              <ul role="group" aria-label={d.rel}>
                {busy === `dir:${d.rel}` && <li className="py-1.5 text-meta text-jz-muted" style={pad(depth + 1)} role="status">正在读取这个目录…</li>}
                {d.failed === 'forbidden' && <li className="py-1.5 text-meta text-jz-ink-2" style={pad(depth + 1)} data-art-dir-state="forbidden">当前账号无权读取这个目录。</li>}
                {d.failed === 'error' && (
                  <li className="flex flex-wrap items-center gap-2 py-1 text-meta text-jz-ink-2" style={pad(depth + 1)} data-art-dir-state="error">
                    这个目录没有读到。<Button size="sm" variant="ghost" onClick={() => void loadDir(d.rel)}>再读一次</Button>
                  </li>
                )}
                {level(d.rel, depth + 1)}
              </ul>
            )}
          </li>
        );
      })}
      {all.filter((f) => parentOf(f.rel) === parent).map((f) => fileRow(f, depth, false))}
    </>
  );

  const head = (
    <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-jz-border px-4 py-2.5" data-art-header>
      <div className="flex min-w-0 flex-1 basis-56 items-baseline gap-2">
        <span className="flex-none font-mono text-label tnum text-jz-muted">任务 #{taskId}</span>
        <span className="min-w-0 truncate text-label font-medium text-jz-ink" title={taskName}>{taskName || '产物'}</span>
        <span className="flex-none text-meta text-jz-muted" data-art-scope role="status">
          {root.state !== 'ok' ? '' : scanning && !files ? '正在清点' : filtering ? `显示 ${shown.length} / ${all.length} 个文件` : `${all.length} 个文件`}{scanning && files ? ' · 正在刷新' : ''}
        </span>
      </div>
      <div className="flex flex-none flex-wrap items-center gap-2" data-art-actions>
        <IconButton size="sm" label="重新读取文件列表" onClick={() => void scan(taskId)} disabled={scanning} data-art-refresh><RefreshCw size={14} aria-hidden /></IconButton>
        <input ref={upRef} type="file" accept=".apk,.xapk,.hap,.app,.ipa" className="hidden" tabIndex={-1} aria-hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} data-art-upload-input />
        <Button size="sm" variant="secondary" icon={<Upload size={14} aria-hidden />} onClick={() => upRef.current?.click()} loading={busy === 'upload'} data-art-upload-btn
          title="上传一个安装包到样本库，新的评估可以直接使用。文件不会写入这个任务的产物目录。">上传到样本库</Button>
        <Popover label="更多产物操作" role="menu" align="end" className="w-56"
          trigger={(tp) => <Button size="sm" variant="secondary" icon={<MoreHorizontal size={14} aria-hidden />} data-art-more {...tp}>更多</Button>}>
          {(close) => (
            <div data-art-more-menu>
              <MenuItem icon={<FileJson size={14} aria-hidden />} disabled={!all.length} onClick={() => { close(); exportList(); }} data-art-export-list>导出文件清单 JSON</MenuItem>
              <MenuItem icon={<FileArchive size={14} aria-hidden />} onClick={() => { close(); void dlSourceApk(); }} data-art-source-apk>下载原始安装包</MenuItem>
              <MenuItem icon={<FileArchive size={14} aria-hidden />} onClick={() => { close(); void dlDex(); }} data-art-dex-package>下载脱壳 DEX 压缩包</MenuItem>
            </div>
          )}
        </Popover>
        <Button size="sm" icon={<FileArchive size={14} aria-hidden />} onClick={() => void dlZip()} disabled={!linked} loading={busy === 'zip'} data-art-zip={linked ? 'ready' : 'disabled'}
          title={linked ? `下载会话 #${linked.sid} 的报告包（ZIP）` : '这个任务没有关联的评估会话，没有报告包可以下载'}>打包下载</Button>
      </div>
    </div>
  );

  const frame = (state: string, node: React.ReactNode) => (
    <div className={cx('flex min-h-0 flex-col bg-jz-surface', className)} data-art-browser data-state={state}>
      {head}
      {note && (
        <InlineAlert tone={note.tone} className="mx-4 mt-3 flex-none" data-art-note={note.tone}
          action={<Button size="sm" variant="ghost" onClick={() => setNote(null)}>知道了</Button>}>{note.text}</InlineAlert>
      )}
      {node}
    </div>
  );
  if (root.state === 'forbidden') {
    return frame('forbidden', <PermissionState className="flex-1" title="没有权限读取产物文件" message="当前账号不能读取这个任务的产物目录，所以这里没有文件列表。请切换账号或联系管理员。" />);
  }
  if (root.state === 'error') {
    return frame('error', <ErrorState className="flex-1" title="产物列表没有读到" message={`${root.message}。没有读到列表，不代表这个任务没有产物。`} onRetry={() => void scan(taskId)} />);
  }
  if (root.state === 'loading' || !files) {
    return frame('loading', <div className="flex-1 p-4" aria-busy="true"><SkeletonLoader variant="table" rows={7} /></div>);
  }
  if (all.length === 0 && dirs.length === 0) {
    return frame('empty', <EmptyState className="flex-1" icon={FolderOpen} title="这个任务没有产物文件" cause={root.emptyReason || '任务的产物目录是空的。评估运行后，报告、脱壳文件和日志会出现在这里。'} />);
  }

  return frame(stale ? 'stale' : 'ok', (
    <>
      {stale && (
        <InlineAlert tone="attention" data-state="stale" data-art-stale className="mx-4 mt-3 flex-none"
          action={stale === 'error' ? <Button size="sm" variant="secondary" onClick={() => void scan(taskId)}>再读一次</Button> : undefined}>
          {stale === 'forbidden' ? '刷新被拒绝：当前账号无权读取这个任务的产物目录。' : '刷新没有成功。'}下面是之前读到的列表，可能不是最新的。
        </InlineAlert>
      )}
      <div className="mt-0 grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(20rem,2fr)_3fr] lg:overflow-hidden">
        <div className="flex min-w-0 flex-col border-b border-jz-border lg:min-h-0 lg:border-b-0 lg:border-r" data-art-explorer>
          <div className="flex-none space-y-2 border-b border-jz-border p-3" data-art-filters>
            <SearchField value={q} onValueChange={setQ} label="搜索文件" placeholder="搜索文件名或路径" data-art-search />
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="按类型筛选" data-art-cat-filter>
              <button type="button" aria-pressed={catF === 'all'} onClick={() => setCatF('all')} data-art-cat-chip="all" className={chip(catF === 'all')}>全部 <span className="font-mono tnum">{all.length}</span></button>
              {ART_CATS.map((c) => (
                <button type="button" key={c.key} aria-pressed={catF === c.key} onClick={() => setCatF(catF === c.key ? 'all' : c.key)} data-art-cat-chip={c.key} title={c.hint} className={chip(catF === c.key)}>
                  {c.label} <span className="font-mono tnum">{catCounts[c.key] || 0}</span>
                </button>
              ))}
            </div>
            {extOptions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="按扩展名筛选" data-art-ext-filter>
                <button type="button" aria-pressed={extF === 'all'} onClick={() => setExtF('all')} data-art-ext-chip="all" className={chip(extF === 'all')}>全部扩展名</button>
                {extOptions.map(([k, label]) => (
                  <button type="button" key={k} aria-pressed={extF === k} onClick={() => setExtF(extF === k ? 'all' : k)} data-art-ext-chip={k} className={chip(extF === k)}>{label}</button>
                ))}
              </div>
            )}
            {unreadDirs.length > 0 && (
              <p className="text-meta text-jz-ink-2" data-art-unread role="status">有 {unreadDirs.length} 个目录没有读到（{unreadDirs.map((d) => d.rel).join('、')}），文件数不包含它们。展开目录可以再读一次。</p>
            )}
          </div>
          <div className="max-h-96 min-h-40 flex-1 overflow-auto lg:max-h-none lg:min-h-0" data-art-tree data-art-mode={filtering ? 'list' : 'tree'}>
            {filtering ? (
              shown.length
                ? <ul aria-label="符合条件的文件">{shown.map((f) => fileRow(f, 0, true))}</ul>
                : (
                  <div data-art-empty>
                    <EmptyState compact icon={FolderOpen} title="没有符合条件的文件" cause="换一个搜索词，或者调整类型和扩展名筛选。"
                      action={<Button size="sm" variant="secondary" onClick={() => { setQ(''); setCatF('all'); setExtF('all'); }} data-art-clear>清除筛选</Button>} />
                  </div>
                )
            ) : <ul aria-label="产物目录">{level('', 0)}</ul>}
          </div>
          {root.runDir && <p className="flex-none truncate border-t border-jz-border px-3 py-1.5 font-mono text-meta text-jz-muted" title={root.runDir} data-art-rundir>{root.runDir}</p>}
        </div>
        <ArtifactPreview taskId={taskId} file={current} source={`任务 #${taskId}`} downloading={!!current && busy === `file:${current.rel}`}
          onDownload={(f) => void dlFile(f)} onClose={() => setSelected(null)} />
      </div>
    </>
  ));
};
