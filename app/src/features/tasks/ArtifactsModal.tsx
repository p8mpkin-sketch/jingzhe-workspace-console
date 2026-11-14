import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, Copy, Check, Download, Eye, FileArchive, FileCode2, FileText, FlaskConical,
  FolderOpen, PackageOpen, ScrollText, Search, Upload, X,
} from 'lucide-react';
import { api, getToken } from '@/services/api';
import { StatusBadge, UnifiedModal } from '@/components/ui';
import { downloadJson } from '@/features/reports/reportIo';

/**
 * R104-5②: 产物文件树弹窗(V3 重写——UnifiedModal 基底替换手绘固定遮罩, 三铁律③ 禁纯白方框)。
 * 全平台升级 Step2③: 升级为 max-w-6xl / h-[82vh] 双栏资源管理器——
 *  左栏 = 扁平文件清单(文件名搜索 + 语义类型分类胶囊[全部|DEX脱壳|Manifest配置|审计报告|日志] +
 *        扩展名分类过滤;树遍历=既有 GET /api/tasks/{tid}/artifacts
 *        ?prefix= 逐目录循环,零新端点,深度 3/请求 60 封顶防呆);
 *  右栏 = 等宽大字号(text-sm mono)预览 + 一键复制 + 单文件下载;
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
  analysis: { Icon: FlaskConical, cls: 'text-jz-accent-cyan' },
  decompiled: { Icon: FileCode2, cls: 'text-neon-accent' },
  report: { Icon: ScrollText, cls: 'text-jz-accent-amber' },
  unpacked: { Icon: PackageOpen, cls: 'text-vuln-safe' },
};

// 扩展名分类过滤(动态由清单真实扩展名派生,不假造分组)
const EXT_GROUPS: Array<{ key: string; label: string; test: (n: string) => boolean }> = [
 { key: 'md', label: '报告 .md', test: (n) => /\.md$/i.test(n) },
 { key: 'json', label: '数据 .json', test: (n) => /\.json$/i.test(n) },
 { key: 'xml', label: '清单 .xml', test: (n) => /\.xml$/i.test(n) },
 { key: 'logtxt', label: '日志 .log/.txt', test: (n) => /\.(log|txt)$/i.test(n) },
 { key: 'code', label: '代码 .java/.kt/.smali/.py', test: (n) => /\.(java|kt|smali|py|js|html)$/i.test(n) },
 { key: 'db', label: '库 .db', test: (n) => /\.(db|sqlite)$/i.test(n) },
];

// 本轮升级: 语义类型分类胶囊(规格: 全部|DEX脱壳|Manifest配置|审计报告|日志)——
// 谓词=相对路径+文件名既有真值(unpacked/ 目录与 .dex=脱壳产物;manifest 路径/.xml=配置;
// report/ 目录与 .md/.html=报告;.log/.txt=日志),首中归类(互斥),都不中=仅「全部」可见不硬塞
const ART_CATS: Array<{ key: string; label: string; test: (rel: string, name: string) => boolean }> = [
 { key: 'dex', label: 'DEX脱壳', test: (rel, name) => /(^|\/)unpacked(\/|$)/i.test(rel) || /\.dex$/i.test(name) },
 { key: 'manifest', label: 'Manifest配置', test: (rel, name) => /manifest/i.test(rel) || /\.xml$/i.test(name) },
 { key: 'report', label: '审计报告', test: (rel, name) => /(^|\/)report(\/|$)/i.test(rel) || /\.(md|html)$/i.test(name) },
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
 if (text.length > 300 * 1024) text = text.slice(0, 300 * 1024) + `\n…(超长截断,原文约 ${text.length} 字符,完整内容请下载)`;
 setPreview({ name, rel, text: text || '(空文件)', via: viaReport ? 'report' : 'artifact' });
 } catch (e: any) {
 setPreview({ name, rel, text: `(预览失败: ${e.message})`, via: viaReport ? 'report' : 'artifact' });
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
   'source-apk', '已下载原始 APK',
 );
 const dlDexBundle = () => dlBlob(
   `/api/tasks/${taskId}/dex-package`,
   `task${taskId}_dex.zip`,
   'dex-package', '已下载脱壳 DEX ZIP（unpacked + fixed_dex）',
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
 setNote(`已下载会话 #${linked.sid} 报告包 zip`);
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
 setNote(`已上传审计池: ${d.apk_path}(落点=审计池非本任务产物目录——后端无写入 run_dir 端点,如实标注)`);
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
 setNote(`已导出产物清单 JSON(${flat.length} 个文件)`);
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

  return (
    <UnifiedModal
      open
      widthClass="w-[min(1152px,94vw)]"
      onClose={onClose}
      title={(
        <span className="inline-flex items-center gap-2 min-w-0" data-art-header>
          <StatusBadge tone="custom" className="bg-jz-elevated text-jz-text-primary">#{taskId}</StatusBadge>
          <span className="truncate" title={taskName}>{taskName || '产物'}</span>
          <StatusBadge tone="info">双栏资源管理器 · {flat ? `${flat.length} 文件` : '清点中…'}</StatusBadge>
        </span>
      )}
      footer={(
        <div className="flex items-center gap-2 flex-wrap" data-art-footer>
          <input ref={upRef} type="file" accept=".apk,.xapk,.hap,.app,.ipa" className="hidden"
 onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSupplement(f); e.target.value = ''; }} data-art-upload-input />
          <button onClick={() => upRef.current?.click()} disabled={busy === 'upload'} data-art-upload-btn
 title="上传补充走既有 POST /api/upload(落点=审计池,新审计可直接用);后端无「写入本任务产物目录」端点——如实标注,不假造落点"
 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-jz-elevated text-jz-text-secondary border border-jz-border/60 hover:text-neon-accent hover:border-neon-accent/40 disabled:opacity-50 transition-colors">
            <Upload size={13} /> {busy === 'upload' ? '上传中…' : '上传补充(→审计池)'}
          </button>
          <button onClick={dlSourceApk} disabled={busy === 'source-apk'} data-art-source-apk
 title="下载本任务原始 APK（独立 source-apk 端点）"
 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-jz-elevated text-jz-text-secondary border border-jz-border/60 hover:text-neon-accent hover:border-neon-accent/40 disabled:opacity-50 transition-colors">
            <Download size={13} /> {busy === 'source-apk' ? '下载中…' : '下载原始 APK'}
          </button>
          <button onClick={dlDexBundle} disabled={busy === 'dex-package'} data-art-dex-package
 title="打包下载本任务脱壳后的 DEX（unpacked + decompiled/fixed_dex）"
 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-neon-accent/15 text-neon-accent border border-neon-accent/40 hover:bg-neon-accent/25 disabled:opacity-50 transition-colors">
            <FileArchive size={13} /> {busy === 'dex-package' ? '打包中…' : '下载脱壳 DEX ZIP'}
          </button>
          <button onClick={exportList} disabled={!flat?.length} data-art-export-list
 title="导出产物清单 JSON(数据=扁平遍历真值,本地 Blob 下载)"
 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-jz-elevated text-jz-text-secondary border border-jz-border/60 hover:text-neon-accent hover:border-neon-accent/40 disabled:opacity-50 transition-colors">
            <FileText size={13} /> 导出清单 JSON
          </button>
          {linked ? (
            <button onClick={dlZip} disabled={busy === 'zip'} data-art-zip="ready"
 title={`一键打包下载会话 #${linked.sid} 报告包 zip(既有端点 /api/pentest/sessions/${linked.sid}/report/package,R60)`}
 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-neon-accent/15 text-neon-accent border border-neon-accent/40 hover:bg-neon-accent/25 disabled:opacity-50 transition-colors">
              <FileArchive size={13} /> 一键打包下载 ZIP
            </button>
          ) : (
            <button disabled data-art-zip="disabled"
 title="该任务无关联渗透会话——报告包端点为会话域(/api/pentest/sessions/{sid}/report/package),一键打包置灰=挂账,不假造"
 className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-jz-elevated text-jz-text-muted border border-transparent opacity-60 cursor-not-allowed">
              <FileArchive size={13} /> 一键打包下载 ZIP(无打包端点)
            </button>
          )}
          <span className="flex-1" />
          {/* 数据真实性红线1 选项②: 通用 /api/download 未接通=挂账照记;单文件下载走既有真实端点 */}
          <span className="text-xs text-jz-text-muted"
 title="通用 /api/download 端点后端不存在(A-4 同族外部依赖)=挂账;本弹窗单文件下载走既有 /api/tasks/{tid}/artifact">
            /api/download 未接通=挂账
          </span>
        </div>
 )}
 >
      <div className="flex flex-col h-[76vh]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 flex-1 min-h-0">
          {/* ── 左栏: 文件资源浏览器(搜索+扩展名分类+扁平清单;保留既有目录导航) ── */}
          <div className="flex flex-col min-h-0 rounded-xl bg-jz-elevated/30 border border-jz-border/50" data-art-explorer>
            <div className="flex-none p-2 space-y-1.5 border-b border-jz-border/60">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-jz-text-muted pointer-events-none" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索文件名 / 相对路径…"
 data-art-search
 className="w-full pl-8 pr-2 h-8 rounded-lg bg-jz-surface text-xs text-jz-text-primary
 placeholder:text-jz-text-muted outline-none focus:ring-2 focus:ring-neon-accent/30" />
              </div>
              {/* 语义类型分类胶囊(规格: 全部|DEX脱壳|Manifest配置|审计报告|日志;计数=全量清单真值) */}
              <div className="flex items-center gap-1 flex-wrap" data-art-cat-filter>
                <button onClick={() => setCatF('all')} data-art-cat-chip="all"
 className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${catF === 'all' ? 'bg-jz-accent-cyan/10 text-jz-accent-cyan font-semibold' : 'text-jz-text-muted hover:bg-jz-surface'}`}>
                  全部 {flat?.length ?? 0}
                </button>
                {ART_CATS.map((c) => (
                  <button key={c.key} onClick={() => setCatF(catF === c.key ? 'all' : c.key)} data-art-cat-chip={c.key}
 title={`谓词: ${c.key === 'dex' ? 'unpacked/ 目录或 .dex' : c.key === 'manifest' ? 'manifest 路径或 .xml' : c.key === 'report' ? 'report/ 目录或 .md/.html' : '.log/.txt'};不归类文件仅在「全部」可见`}
 className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${catF === c.key ? 'bg-jz-accent-cyan/10 text-jz-accent-cyan font-semibold' : 'text-jz-text-muted hover:bg-jz-surface'}`}>
                    {c.label} {catCounts[c.key] || 0}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 flex-wrap" data-art-ext-filter>
                <button onClick={() => setExtF('all')} data-art-ext-chip="all"
 className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${extF === 'all' ? 'bg-neon-accent/10 text-neon-accent font-semibold' : 'text-jz-text-muted hover:bg-jz-surface'}`}>
                  全部 {flat?.length ?? 0}
                </button>
 {extOptions.map(([k, label]) => (
                  <button key={k} onClick={() => setExtF(extF === k ? 'all' : k)} data-art-ext-chip={k}
 className={`px-2 py-0.5 rounded-full text-[11px] transition-colors ${extF === k ? 'bg-neon-accent/10 text-neon-accent font-semibold' : 'text-jz-text-muted hover:bg-jz-surface'}`}>
                    {label}
                  </button>
                ))}
                {flatBusy && <span className="text-[11px] text-jz-text-muted">清点中…</span>}
              </div>
              {/* 既有目录导航(面包屑/上级)保留 */}
              <div className="flex items-center gap-2 text-xs min-h-[20px]">
                {prefix ? (
                  <button onClick={goUp} data-art-up className="inline-flex items-center gap-0.5 text-neon-accent hover:underline">
                    <ChevronLeft size={12} /> 上级
                  </button>
                ) : (
                  <span className="text-jz-text-muted">run_dir 根目录</span>
                )}
                {prefix && <span className="font-mono text-jz-text-muted truncate" title={prefix}>{prefix}</span>}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto divided-card-list" data-art-tree>
              {err && <div className="text-xs text-vuln-critical p-2">加载失败: {err}</div>}
              {data?.empty_reason && !prefix && <div className="text-xs text-jz-text-muted p-2">{data.empty_reason}</div>}
 {/* 目录(树浏览;真实存在才渲染,不假造分类) */}
 {entries.filter((e: any) => e.type === 'dir').map((e: any) => {
                const cat = CAT[e.name];
                return (
                  <button key={e.rel} onClick={() => enter(e.rel)} data-art-dir={e.name}
 title={`进入 ${e.rel}(${e.files} 文件)`}
 className="w-full flex items-center gap-2 px-2 py-1.5 text-xs min-h-[32px] text-left hover:bg-jz-surface/60">
                    {cat
                      ? <cat.Icon size={14} className={`flex-none ${cat.cls}`} />
                      : <FolderOpen size={14} className="flex-none text-jz-text-muted" />}
                    <span className="truncate text-jz-text-primary">{e.name}</span>
                    <span className="flex-none font-mono text-jz-text-muted tnum">{e.files} 文件</span>
                  </button>
 );
 })}
 {/* 扁平文件清单(搜索+分类过滤后) */}
 {shownFlat.map((f) => {
                const canPreview = !!PREVIEWABLE[f.name] || (TEXT_PREVIEW_RE.test(f.name) && f.size_kb <= PREVIEW_MAX_KB);
 const previewTip = PREVIEWABLE[f.name]
 ? `预览 ${f.name}(既有报告预览能力 R55 G7)`
 : canPreview
 ? `在线预览 ${f.name}(文本类 ≤${PREVIEW_MAX_KB}KB,经既有单文件产物端点取文本)`
 : `不可在线预览(二进制/未识别格式或 >${PREVIEW_MAX_KB}KB)=诚实置灰,可下载后查看`;
                const active = preview?.rel === f.rel;
                return (
                  <div key={f.rel} data-art-file={f.rel}
 className={`flex items-center gap-2 px-2 py-1.5 text-xs min-h-[32px] ${active ? 'bg-neon-accent/10' : 'hover:bg-jz-surface/60'}`}>
                    <FileText size={13} className="flex-none text-jz-text-muted" />
                    <button onClick={() => openPreview(f.name, f.rel, f.size_kb)} disabled={!canPreview || busy === f.name}
 data-art-file-name={f.name}
 title={`${f.rel} · ${f.size_kb}KB${canPreview ? '(点击预览)' : ''}`}
 className="flex-1 min-w-0 truncate text-left text-jz-text-secondary disabled:cursor-default disabled:text-jz-text-muted hover:text-neon-accent transition-colors">
                      {f.rel}
                    </button>
                    <span className="flex-none font-mono tnum text-jz-text-muted" data-art-size>{f.size_kb}KB</span>
                    <button onClick={() => openPreview(f.name, f.rel, f.size_kb)} disabled={!canPreview || busy === f.name}
 data-art-preview-btn={f.name}
 title={previewTip}
 className="p-1 rounded text-jz-accent-cyan hover:bg-jz-surface/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                      <Eye size={13} />
                    </button>
                    <button onClick={() => dlFile(f.rel, f.name)} disabled={busy === f.rel}
 data-art-dl-btn={f.name}
 title={`下载 ${f.name}(经既有单文件产物端点 /api/tasks/{tid}/artifact,携带 Authorization 头;通用 /api/download 未接通=挂账)`}
 className="p-1 rounded text-neon-accent hover:bg-jz-surface/80 disabled:opacity-30 transition-colors">
                      <Download size={13} className={busy === f.rel ? 'animate-spin' : ''} />
                    </button>
                  </div>
                );
              })}
              {!shownFlat.length && !flatBusy && !err && (
                <div className="px-3 py-6 text-center text-xs text-jz-text-muted" data-art-empty>
                  {flat && flat.length ? '无匹配文件(调整搜索词/分类过滤)' : '产物目录为空(如实空态)'}
                </div>
              )}
            </div>
          </div>

          {/* ── 右栏: 等宽大字号预览/复制/下载 ── */}
          <div className="flex flex-col min-h-0 rounded-xl bg-jz-elevated/30 border border-jz-border/50" data-art-preview>
            {!preview ? (
              <div className="flex-1 grid place-items-center p-4 text-center">
                <div className="space-y-1.5">
                  <Eye size={20} className="mx-auto text-jz-text-muted/60" />
                  <div className="text-xs text-jz-text-muted">点击左侧文件名 / 预览钮查看内容</div>
                  <div className="text-[11px] text-jz-text-muted/70">报告白名单走报告端点;其余文本类 ≤{PREVIEW_MAX_KB}KB 走产物端点(真值闸)</div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs flex-none p-2 border-b border-jz-border/60">
                  <Eye size={12} className="text-jz-accent-cyan flex-none" />
                  <span className="font-mono text-jz-text-secondary truncate flex-1" title={preview.rel}>{preview.rel}</span>
                  <StatusBadge tone="info" title={preview.via === 'report'
 ? '预览源=既有报告预览端点 /api/tasks/{tid}/report-file(白名单恒等)'
 : '预览源=既有单文件产物端点 /api/tasks/{tid}/artifact(文本类 ≤512KB 真值闸)'}>
                    {preview.via === 'report' ? '报告端点' : '产物端点'}
                  </StatusBadge>
                  <button onClick={copyPreview} data-art-copy title="复制全文到剪贴板"
 className="p-1 rounded text-jz-text-secondary hover:text-neon-accent transition-colors">
                    {copied ? <Check size={13} className="text-vuln-safe" /> : <Copy size={13} />}
                  </button>
                  <button onClick={() => dlFile(preview.rel, preview.name)} disabled={busy === preview.rel} data-art-preview-dl
 title="下载当前预览文件" className="p-1 rounded text-neon-accent hover:bg-jz-surface/80 transition-colors">
                    <Download size={13} />
                  </button>
                  <button onClick={() => setPreview(null)} aria-label="关闭预览" className="text-jz-text-muted hover:text-jz-text-primary"><X size={12} /></button>
                </div>
                {/* 等宽大字号预览(text-sm=14px mono,行高 6) */}
                <pre className="flex-1 min-h-0 overflow-auto m-0 p-3 text-sm leading-6 text-jz-text-secondary whitespace-pre-wrap break-all font-mono" data-art-preview-body>{preview.text}</pre>
              </>
            )}
          </div>
        </div>

        {note && (
          <div className="flex-none mt-1.5 text-xs text-jz-text-secondary" data-art-note>
            {note}<button onClick={() => setNote(null)} className="ml-1.5 text-jz-text-muted hover:text-jz-text-primary">✕</button>
          </div>
        )}

        <div className="flex-none mt-1 text-xs text-jz-text-muted truncate font-mono" title={data?.run_dir || ''}>
          {data?.run_dir || ''}
        </div>
      </div>
    </UnifiedModal>
  );
};
