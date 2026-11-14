import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, Copy, Check, Download, Eye, FileArchive, FileCode2, FileText, FlaskConical,
  FolderOpen, PackageOpen, ScrollText, Upload, X,
} from 'lucide-react';
import { api, getToken } from '@/services/api';
import { StatusBadge, Dialog, Button, IconButton, SearchField, EmptyState, ErrorState, InlineAlert, SkeletonLoader, cx } from '@/components/ui';
import { downloadJson } from '@/features/reports/reportIo';

/**
 * R104-5②: 产物文件树弹窗(V3 重写——UnifiedModal 基底替换手绘固定遮罩, 三铁律③ 禁纯白方框)。
 * 全平台升级 Step2③: 升级为 max-w-6xl / h-[82vh] 双栏资源管理器——
 *  左栏 = 扁平文件清单(文件名搜索 + 语义类型分类胶囊[全部|DEX脱壳|Manifest配置|审计报告|日志] +
 *        扩展名分类过滤;树遍历=既有 GET /api/tasks/{tid}/artifacts
 *        ?prefix= 逐目录循环,零新端点,深度 3/请求 60 封顶防呆);
 *  右栏 = 等宽大字号(text-body mono)预览 + 一键复制 + 单文件下载;
 *  顶栏 = 上传补充(既有 POST /api/upload→审计池;后端无「写入 run_dir」端点=如实标注挂账)+
 *        导出产物清单 JSON(本地 Blob,exportDataFile 同族)。
 * 数据=既有产物清单端点 /api/tasks/{tid}/artifacts(app.py:1051, 实时列目录+防穿越);
 * 分类彩色文件夹图标 analysis/decompiled/report/unpacked——目录真实缺失如实不显,
 *   库外真实目录(如 pentest/)走兜底图标原样渲染, 不假造分类;
 * 预览=既有预览能力(R55 G7 /api/tasks/{tid}/report-file, 白名单与后端 REPORT_FILES 恒等),
 *   白名单外文本文件经既有单文件产物端点 /api/tasks/{tid}/artifact 取文本(≤512KB 真值闸),
 *   二进制/超大文件预览钮诚实置灰不假造;
 * 单文件下载=既有端点 /api/tasks/{tid}/artifact——通用 /api/download 通道未接通=挂账照记;
 * 一键打包 ZIP=既有会话报告包端点 /api/pentest/sessions/{sid}/report/package(R60)——
 *   任务无关联渗透会话(sessMap 真值)时诚实置灰。
 */

// 预览白名单(与后端 REPORT_FILES 恒等)——走既有报告预览端点
const PREVIEWABLE: Record<string, true> = {
  'executive_summary.md': true,
  'security_report.md': true,
  'pentest_report.md': true,
  'native_report.md': true,
};
const TEXT_PREVIEW_RE = /\.(xml|json|log|txt|md|py|java|smali|yml|yaml|cfg|ini|properties|html|csv)$/i;
const PREVIEW_MAX_KB = 512;
// 树遍历防呆封顶(既有端点循环,零新端点;防异常深的目录树拖死前端)
const FLATTEN_MAX_REQ = 60;
const FLATTEN_MAX_DEPTH = 3;

// 分类彩色文件夹图标(四类;其余真实目录走 FolderOpen 兜底)
const CAT: Record<string, { Icon: React.ElementType; cls: string }> = {
  analysis: { Icon: FlaskConical, cls: '' },
  decompiled: { Icon: FileCode2, cls: '' },
  report: { Icon: ScrollText, cls: '' },
  unpacked: { Icon: PackageOpen, cls: '' },
};

// 扩展名分类过滤(动态由清单真实扩展名派生,不假造分组)
const EXT_GROUPS: Array<{ key: string; label: string; test: (n: string) => boolean }> = [
 { key: 'md', label: '.md', test: (n) => /\.md$/i.test(n) },
 { key: 'json', label: '.json', test: (n) => /\.json$/i.test(n) },
 { key: 'xml', label: '.xml', test: (n) => /\.xml$/i.test(n) },
 { key: 'logtxt', label: '.log / .txt', test: (n) => /\.(log|txt)$/i.test(n) },
 { key: 'code', label: '代码文件', test: (n) => /\.(java|kt|smali|py|js|html)$/i.test(n) },
 { key: 'db', label: '.db', test: (n) => /\.(db|sqlite)$/i.test(n) },
];

// 本轮升级: 语义类型分类胶囊(规格: 全部|DEX脱壳|Manifest配置|审计报告|日志)——
// 谓词=相对路径+文件名既有真值(unpacked/ 目录与 .dex=脱壳产物;manifest 路径/.xml=配置;
// report/ 目录与 .md/.html=报告;.log/.txt=日志),首中归类(互斥),都不中=仅「全部」可见不硬塞
const ART_CATS: Array<{ key: string; label: string; test: (rel: string, name: string) => boolean }> = [
 { key: 'dex', label: '脱壳 DEX', test: (rel, name) => /(^|\/)unpacked(\/|$)/i.test(rel) || /\.dex$/i.test(name) },
 { key: 'manifest', label: 'Manifest', test: (rel, name) => /manifest/i.test(rel) || /\.xml$/i.test(name) },
 { key: 'report', label: '报告', test: (rel, name) => /(^|\/)report(\/|$)/i.test(rel) || /\.(md|html)$/i.test(name) },
 { key: 'log', label: '日志', test: (_rel, name) => /\.(log|txt)$/i.test(name) },
];
const catOf = (rel: string, name: string): string | null => ART_CATS.find((c) => c.test(rel, name))?.key || null;

type FlatFile = { name: string; rel: string; size_kb: number };

export const ArtifactsModal: React.FC<{
 taskId: number;
 taskName: string;
 /** 任务关联渗透会话(sessMap 真值)——有则 ZIP 报告包可用, 无则诚实置灰 */
 linked: { pid: number; sid: number } | null;
 onClose: () => void;
}> = ({ taskId, taskName, linked, onClose }) => {
  const [prefix, setPrefix] = useState('');           // 当前目录(树模式浏览用,保留既有目录导航语义)
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flat, setFlat] = useState<FlatFile[] | null>(null);   // 扁平清单(异步遍历)
  const [flatBusy, setFlatBusy] = useState(false);
  const [q, setQ] = useState('');                     // 左栏文件名搜索
  const [catF, setCatF] = useState('all');            // 语义类型分类(全部|DEX脱壳|Manifest配置|审计报告|日志)
  const [extF, setExtF] = useState('all');            // 扩展名分类过滤
  const [preview, setPreview] = useState<{ name: string; rel: string; text: string; via: 'report' | 'artifact' } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);   // 正在预览/下载的文件名 / 'zip' / 'upload'
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);   // 下载/上传结果如实回显
  const upRef = useRef<HTMLInputElement>(null);

 const load = useCallback(async (tid: number, p: string) => {
    setErr(null);
    try {
      setData(await api<any>(`/api/tasks/${tid}/artifacts?prefix=${encodeURIComponent(p)}`));
 } catch (e: any) {
 setData({ entries: [] });
 setErr(e.message || String(e));
 }
 }, []);

 // 扁平遍历(既有端点逐目录循环;BFS,深度 3/请求 60 封顶)
 const flatten = useCallback(async (tid: number) => {
    setFlatBusy(true);
    const out: FlatFile[] = [];
    let reqs = 0;
    const queue: Array<{ rel: string; depth: number }> = [{ rel: '', depth: 0 }];
    while (queue.length && reqs < FLATTEN_MAX_REQ) {
      const { rel, depth } = queue.shift()!;
      reqs++;
      try {
        const d = await api<any>(`/api/tasks/${tid}/artifacts?prefix=${encodeURIComponent(rel)}`);
        for (const e of d?.entries || []) {
          if (e.type === 'dir') {
            if (depth + 1 < FLATTEN_MAX_DEPTH) queue.push({ rel: e.rel, depth: depth + 1 });
 } else {
 out.push({ name: e.name, rel: e.rel, size_kb: e.size_kb ?? 0 });
 }
 }
 } catch { /* 单目录失败如实跳过(清单以其余目录为准) */ }
 }
 out.sort((a, b) => a.rel.localeCompare(b.rel));
 setFlat(out);
 setFlatBusy(false);
 }, []);

 useEffect(() => {
 setPrefix(''); setPreview(null); setNote(null); setQ(''); setCatF('all'); setExtF('all'); setFlat(null);
 load(taskId, '');
 flatten(taskId);
 }, [taskId, load, flatten]);

 const enter = (rel: string) => { setPreview(null); setPrefix(rel); load(taskId, rel); };
 const goUp = () => {
 setPreview(null);
 const p = prefix.split('/').slice(0, -1).join('/');
 setPrefix(p); load(taskId, p);
 };

 // 预览=R55 G7 既有能力(report-file 回 PlainText);其余文本类经既有 artifact 端点取文本
 const openPreview = async (name: string, rel: string, sizeKb?: number) => {
    const viaReport = !!PREVIEWABLE[name];
    const viaArtifact = !viaReport && TEXT_PREVIEW_RE.test(name) && (sizeKb == null || sizeKb <= PREVIEW_MAX_KB);
 if (!viaReport && !viaArtifact) return;
 setBusy(name);
 try {
 const url = viaReport
 ? `/api/tasks/${taskId}/report-file?name=${encodeURIComponent(name)}`
 : `/api/tasks/${taskId}/artifact?path=${encodeURIComponent(rel)}`;
 const r = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
 if (!r.ok) throw new Error(`HTTP ${r.status}`);
 let text = await r.text();
 if (text.length > 300 * 1024) text = text.slice(0, 300 * 1024) + `\n…(内容过长已截断,原文约 ${text.length} 个字符,完整内容请下载)`;
 setPreview({ name, rel, text: text || '(空文件)', via: viaReport ? 'report' : 'artifact' });
 } catch (e: any) {
 setPreview({ name, rel, text: `预览失败:${e.message}`, via: viaReport ? 'report' : 'artifact' });
 } finally { setBusy(null); }
 };

 const copyPreview = async () => {
 if (!preview) return;
 try { await navigator.clipboard.writeText(preview.text); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* 静默 */ }
 };

 // 单文件下载=既有 /api/tasks/{tid}/artifact 端点(FileResponse)
 // 原始 APK / 脱壳 DEX 包：独立端点，避免从产物树里找原件
 const dlBlob = async (url: string, name: string, key: string, okNote: string) => {
   setBusy(key);
   try {
     const r = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
     if (!r.ok) throw new Error(`HTTP ${r.status}`);
     const blob = await r.blob();
     const a = document.createElement('a');
     a.href = URL.createObjectURL(blob);
     a.download = name;
     a.click();
     URL.revokeObjectURL(a.href);
     setNote(okNote);
   } catch (e: any) {
     setNote(`下载失败: ${e.message}`);
   } finally { setBusy(null); }
 };
 const dlSourceApk = () => dlBlob(
   `/api/tasks/${taskId}/source-apk`,
   `${(taskName || 'task' + taskId).replace(/[\\/:*?"<>|]/g, '_')}.apk`,
   'source-apk', '已下载原始安装包',
 );
 const dlDexBundle = () => dlBlob(
   `/api/tasks/${taskId}/dex-package`,
   `task${taskId}_dex.zip`,
   'dex-package', '已下载脱壳 DEX 压缩包',
 );

 const dlFile = async (rel: string, name: string) => {
 setBusy(rel);
 try {
 const r = await fetch(`/api/tasks/${taskId}/artifact?path=${encodeURIComponent(rel)}`,
 { headers: { Authorization: `Bearer ${getToken()}` } });
 if (!r.ok) throw new Error(`HTTP ${r.status}`);
 const blob = await r.blob();
 const a = document.createElement('a');
 a.href = URL.createObjectURL(blob);
 a.download = name;
 a.click();
 URL.revokeObjectURL(a.href);
 setNote(`已下载 ${name}`);
 } catch (e: any) {
 setNote(`下载失败: ${e.message}`);
 } finally { setBusy(null); }
 };

 // 一键打包 ZIP=既有会话报告包端点(R60)——经 sessMap 关联会话, 会话域端点
 const dlZip = async () => {
 if (!linked) return;
 setBusy('zip');
 try {
 const r = await fetch(`/api/pentest/sessions/${linked.sid}/report/package`,
 { headers: { Authorization: `Bearer ${getToken()}` } });
 if (!r.ok) throw new Error(`HTTP ${r.status}`);
 const blob = await r.blob();
 const a = document.createElement('a');
 a.href = URL.createObjectURL(blob);
 a.download = `report_${linked.sid}.zip`;
 a.click();
 URL.revokeObjectURL(a.href);
 setNote(`已下载会话 #${linked.sid} 的报告包`);
 } catch (e: any) {
 setNote(`打包下载失败: ${e.message}`);
 } finally { setBusy(null); }
 };

 // 上传补充=既有 POST /api/upload(审计池)——后端无「写入 run_dir」端点,落点如实标注
 const uploadSupplement = async (f: File) => {
 setBusy('upload');
 try {
 const fd = new FormData(); fd.append('file', f);
 const r = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
 const d = await r.json();
 if (!r.ok || !d.apk_path) throw new Error(d.detail || '上传失败');
 setNote(`已上传到样本库:${d.apk_path}。文件没有写入这个任务的产物目录。`);
 } catch (e: any) {
 setNote(`上传失败: ${e.message}`);
 } finally { setBusy(null); }
 };

 // 导出产物清单 JSON(本地 Blob;数据=扁平遍历真值)
 const exportList = () => {
 if (!flat) return;
 downloadJson(`task${taskId}_artifacts_manifest`, {
 kind: 'apksec_artifacts_manifest', task_id: taskId, task: taskName,
 run_dir: data?.run_dir || '', exported_at: new Date().toISOString(),
 count: flat.length, files: flat,
 });
 setNote(`已导出文件清单(${flat.length} 个文件)`);
 };

 const entries: any[] = data?.entries || [];
 const shownFlat = useMemo(() => {
 let list = flat || [];
 const kw = q.trim().toLowerCase();
 if (kw) list = list.filter((f) => f.rel.toLowerCase().includes(kw));
 if (catF !== 'all') list = list.filter((f) => catOf(f.rel, f.name) === catF);
 if (extF !== 'all') {
 const g = EXT_GROUPS.find((x) => x.key === extF);
 if (g) list = list.filter((f) => g.test(f.name));
 else list = list.filter((f) => !EXT_GROUPS.some((x) => x.test(f.name)));
 }
 return list;
 }, [flat, q, catF, extF]);
 // 语义分类计数(全量清单真值;互斥首中归类,和≤总数,差额=不归类文件仅在「全部」可见)
 const catCounts = useMemo(() => {
 const m: Record<string, number> = {};
 for (const f of flat || []) { const k = catOf(f.rel, f.name); if (k) m[k] = (m[k] || 0) + 1; }
 return m;
 }, [flat]);
 const extOptions = useMemo(() => {
 const present = EXT_GROUPS.filter((g) => (flat || []).some((f) => g.test(f.name))).map((g) => [g.key, g.label] as [string, string]);
 const otherN = (flat || []).filter((f) => !EXT_GROUPS.some((g) => g.test(f.name))).length;
 if (otherN > 0) present.push(['other', `其他(${otherN})`]);
    return present;
  }, [flat]);

  const chip = (on: boolean) => cx('rounded-pill border px-2.5 py-1 text-meta transition-colors duration-hover',
    on ? 'border-jz-brand bg-jz-brand-soft font-semibold text-jz-ink' : 'border-jz-border text-jz-ink-2 hover:border-jz-border-strong hover:bg-jz-surface-2');

  return (
    <Dialog open onClose={onClose} widthClass="w-full max-w-jz-content"
      title={(
        <span className="flex min-w-0 items-center gap-2" data-art-header>
          <span className="flex-none font-mono text-label tnum text-jz-muted">#{taskId}</span>
          <span className="truncate" title={taskName}>{taskName || '产物'}</span>
          <StatusBadge tone="neutral">{flat ? `${flat.length} 个文件` : '正在清点'}</StatusBadge>
        </span>
      )}
      footer={(
        <div className="flex w-full flex-wrap items-center gap-2" data-art-footer>
          <input ref={upRef} type="file" accept=".apk,.xapk,.hap,.app,.ipa" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSupplement(f); e.target.value = ''; }} data-art-upload-input />
          <Button size="sm" variant="ghost" icon={<Upload size={14} aria-hidden />} onClick={() => upRef.current?.click()} loading={busy === 'upload'} data-art-upload-btn
            title="上传一个安装包到样本库,新的评估可以直接使用。文件不会写入这个任务的产物目录。">
            {busy === 'upload' ? '上传中…' : '上传到样本库'}
          </Button>
          <span className="flex-1" />
          <Button size="sm" variant="secondary" icon={<FileText size={14} aria-hidden />} onClick={exportList} disabled={!flat?.length} data-art-export-list
            title="把文件清单导出为 JSON">导出清单</Button>
          <Button size="sm" variant="secondary" icon={<Download size={14} aria-hidden />} onClick={dlSourceApk} loading={busy === 'source-apk'} data-art-source-apk
            title="下载这个任务的原始安装包">原始安装包</Button>
          <Button size="sm" variant="secondary" icon={<FileArchive size={14} aria-hidden />} onClick={dlDexBundle} loading={busy === 'dex-package'} data-art-dex-package
            title="打包下载脱壳得到的 DEX">脱壳 DEX</Button>
          {linked ? (
            <Button size="sm" variant="secondary" icon={<FileArchive size={14} aria-hidden />} onClick={dlZip} loading={busy === 'zip'} data-art-zip="ready"
              title={`下载渗透会话 #${linked.sid} 的报告包`}>报告包</Button>
          ) : (
            <Button size="sm" variant="secondary" icon={<FileArchive size={14} aria-hidden />} disabled data-art-zip="disabled"
              title="这个任务没有关联的渗透会话,没有报告包可以下载">报告包</Button>
          )}
        </div>
      )}>
      <div className="flex h-[68vh] min-h-80 flex-col gap-3">
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="flex min-h-0 flex-col rounded-card border border-jz-border" data-art-explorer>
            <div className="flex-none space-y-2 border-b border-jz-border p-3">
              <SearchField value={q} onValueChange={setQ} label="搜索文件" placeholder="搜索文件名或路径" data-art-search />
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="按类型筛选" data-art-cat-filter>
                <button type="button" aria-pressed={catF === 'all'} onClick={() => setCatF('all')} data-art-cat-chip="all" className={chip(catF === 'all')}>
                  全部 <span className="tnum">{flat?.length ?? 0}</span>
                </button>
                {ART_CATS.map((c) => (
                  <button type="button" key={c.key} aria-pressed={catF === c.key} onClick={() => setCatF(catF === c.key ? 'all' : c.key)} data-art-cat-chip={c.key}
                    title={c.key === 'dex' ? 'unpacked/ 目录下的文件或 .dex' : c.key === 'manifest' ? '路径含 manifest 或 .xml' : c.key === 'report' ? 'report/ 目录下的文件或 .md、.html' : '.log 和 .txt'}
                    className={chip(catF === c.key)}>
                    {c.label} <span className="tnum">{catCounts[c.key] || 0}</span>
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
              <div className="flex min-h-6 items-center gap-2 text-meta">
                {prefix ? (
                  <Button size="sm" variant="ghost" icon={<ChevronLeft size={14} aria-hidden />} onClick={goUp} data-art-up>上一级</Button>
                ) : (
                  <span className="text-jz-muted">根目录</span>
                )}
                {prefix && <span className="truncate font-mono text-jz-muted" title={prefix}>{prefix}</span>}
                {flatBusy && <span className="ml-auto text-jz-muted" role="status">正在清点文件…</span>}
              </div>
            </div>
            <div className="min-h-0 flex-1 divide-y divide-jz-border overflow-auto" data-art-tree>
              {err && <ErrorState compact title="产物列表加载失败" message={err} onRetry={() => { load(taskId, prefix); flatten(taskId); }} />}
              {data?.empty_reason && !prefix && <p className="px-3 py-2 text-meta text-jz-muted">{data.empty_reason}</p>}
              {!data && !err && <div className="p-3"><SkeletonLoader variant="table" rows={5} /></div>}
              {entries.filter((e: any) => e.type === 'dir').map((e: any) => {
                const cat = CAT[e.name];
                const Icon = cat ? cat.Icon : FolderOpen;
                return (
                  <button type="button" key={e.rel} onClick={() => enter(e.rel)} data-art-dir={e.name} title={`打开 ${e.rel}`}
                    className="flex min-h-jz-control w-full items-center gap-2 px-3 py-1.5 text-left text-label hover:bg-jz-surface-2">
                    <Icon size={16} aria-hidden className="flex-none text-jz-muted" />
                    <span className="min-w-0 flex-1 truncate text-jz-ink">{e.name}</span>
                    <span className="flex-none font-mono text-meta tnum text-jz-muted">{e.files} 个文件</span>
                  </button>
                );
              })}
              {shownFlat.map((f) => {
                const canPreview = !!PREVIEWABLE[f.name] || (TEXT_PREVIEW_RE.test(f.name) && f.size_kb <= PREVIEW_MAX_KB);
                const active = preview?.rel === f.rel;
                return (
                  <div key={f.rel} data-art-file={f.rel} className={cx('flex min-h-jz-control items-center gap-2 px-3 py-1', active ? 'bg-jz-brand-soft' : 'hover:bg-jz-surface-2')}>
                    <FileText size={14} aria-hidden className="flex-none text-jz-muted" />
                    <button type="button" onClick={() => openPreview(f.name, f.rel, f.size_kb)} disabled={!canPreview || busy === f.name}
                      data-art-file-name={f.name} title={`${f.rel} · ${f.size_kb}KB`}
                      className="min-w-0 flex-1 truncate text-left font-mono text-meta text-jz-ink enabled:hover:text-jz-brand disabled:cursor-default disabled:text-jz-ink-2">
                      {f.rel}
                    </button>
                    <span className="flex-none font-mono text-meta tnum text-jz-muted" data-art-size>{f.size_kb}KB</span>
                    <IconButton size="sm" label={canPreview ? `预览 ${f.name}` : `不能在线预览:二进制文件或超过 ${PREVIEW_MAX_KB}KB,可以下载后查看`}
                      onClick={() => openPreview(f.name, f.rel, f.size_kb)} disabled={!canPreview || busy === f.name} data-art-preview-btn={f.name}>
                      <Eye size={14} aria-hidden />
                    </IconButton>
                    <IconButton size="sm" label={`下载 ${f.name}`} onClick={() => dlFile(f.rel, f.name)} disabled={busy === f.rel} data-art-dl-btn={f.name}>
                      <Download size={14} aria-hidden />
                    </IconButton>
                  </div>
                );
              })}
              {!shownFlat.length && !flatBusy && !err && (
                <div data-art-empty>
                  <EmptyState compact icon={FolderOpen}
                    title={flat && flat.length ? '没有符合条件的文件' : '没有产物文件'}
                    cause={flat && flat.length ? '换一个搜索词,或者调整类型和扩展名筛选。' : '这个任务的产物目录是空的。'} />
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col rounded-card border border-jz-border" data-art-preview>
            {!preview ? (
              <EmptyState icon={Eye} title="选择一个文件预览" cause={`报告和不超过 ${PREVIEW_MAX_KB}KB 的文本文件可以在线预览,其余文件请下载后查看。`} className="flex-1" />
            ) : (
              <>
                <div className="flex flex-none items-center gap-1 border-b border-jz-border py-1.5 pl-3 pr-1.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-meta text-jz-ink" title={preview.rel}>{preview.rel}</span>
                  <IconButton size="sm" label={copied ? '已复制' : '复制全文'} onClick={copyPreview} data-art-copy>
                    {copied ? <Check size={14} aria-hidden className="text-jz-teal" /> : <Copy size={14} aria-hidden />}
                  </IconButton>
                  <IconButton size="sm" label="下载这个文件" onClick={() => dlFile(preview.rel, preview.name)} disabled={busy === preview.rel} data-art-preview-dl>
                    <Download size={14} aria-hidden />
                  </IconButton>
                  <IconButton size="sm" label="关闭预览" onClick={() => setPreview(null)}><X size={14} aria-hidden /></IconButton>
                </div>
                <pre tabIndex={0} className="m-0 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-label text-jz-ink-2" data-art-preview-body>{preview.text}</pre>
              </>
            )}
          </div>
        </div>

        {note && (
          <InlineAlert tone="info" className="flex-none" data-art-note
            action={<Button size="sm" variant="ghost" onClick={() => setNote(null)}>知道了</Button>}>{note}</InlineAlert>
        )}
        {data?.run_dir && <p className="flex-none truncate font-mono text-meta text-jz-muted" title={data.run_dir}>{data.run_dir}</p>}
      </div>
    </Dialog>
  );
};
