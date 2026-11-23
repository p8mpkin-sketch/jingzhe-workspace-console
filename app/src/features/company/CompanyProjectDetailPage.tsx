import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Download, FileText, Play, RefreshCw, Sparkles, Upload, Wand2, Check, ExternalLink, SearchX, Layers3, Activity, ChevronDown } from 'lucide-react';
import { api, getToken } from '@/services/api';
import {
  Button, Checkbox, ConfirmDialog, DataTable, BulkBar, EmptyState, ErrorState, Field, InlineAlert, Input, Page, PageHeader,
  Pagination, Panel, PermissionState, SearchField, Select, SkeletonLoader, StaleNotice, StatusBadge, Tabs, Tag, Textarea,
  ActionMenu, FactRow, SignalPanel, StackedBar, useScrolledPast,
} from '@/components/ui';
import type { Column, StatusTone } from '@/components/ui';

type TabKey = 'reports' | 'overview' | 'apps' | 'candidates' | 'runs';
type Project = { id: number; name: string; company_name?: string; kind?: string; brands?: string; status?: string; app_count?: number; inventory_count?: number };
type App = { id: number; package: string; app_name?: string; version?: string; brand?: string; ownership_tier?: string; status?: string; report_status?: string };
type Candidate = { id: number; package: string; app_name?: string; developer?: string; source?: string; source_url?: string; confidence?: number; status?: string; ownership_tier?: string };
type Report = { id: number; kind: string; template: string; status: string; pages?: number };
type Run = { id: number; status: string; total: number; succeeded: number; failed: number; skipped: number };

const parseBrands = (s?: string): string[] => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const tone = (s?: string): StatusTone => s === 'done' || s === 'ready' || s === 'imported' ? 'success' : s === 'failed' || s === 'rejected' || s === 'download_failed' ? 'danger' : s === 'running' || s === 'queued' || s === 'generating' || s === 'needs_verification' || s === 'manual_required' ? 'attention' : 'neutral';
const statusText = (s?: string) => s === 'done' ? '完成' : s === 'running' ? '执行中' : s === 'failed' ? '失败' : s === 'queued' ? '排队中' : s === 'discovered' ? '未执行' : s || '未执行';
const candText = (s?: string) => s === 'imported' ? '已导入' : s === 'downloaded' ? '已下载' : s === 'verified' ? '可下载' : s === 'needs_verification' ? '待核验' : s === 'manual_required' ? '需人工' : s === 'rejected' ? '已排除' : s === 'download_failed' ? '下载失败' : s === 'pending' ? '待处理' : s || '候选';
const reportStatus = (s?: string) => s === 'ready' ? '就绪' : s === 'generating' ? '生成中' : s === 'failed' ? '失败' : s || '未知';
const templateText = (s?: string) => s === 'technical' ? '技术证据版' : s === 'executive' ? '管理层摘要' : s === 'forensic' ? '取证版' : s || '技术证据版';
const pagesOf = (n: number, size: number) => Math.max(1, Math.ceil(n / size));
const slice = <T,>(rows: T[], page: number, size: number) => rows.slice((page - 1) * size, page * size);

const reportName = (r: Report) => `#${r.id} · ${r.kind === 'portfolio' ? '项目总报告' : '单应用报告'}`;
const REPORT_CONTENTS = ['封面与目录页码', '应用全量清单', '重点发现总表', '密钥、签名与加固', '逐应用证据图', '误报与待复核', '覆盖与限制', '证据索引'];
const Bar: React.FC<{ pct: number; label: string }> = ({ pct, label }) => (
  <div className="h-1.5 overflow-hidden rounded-pill bg-jz-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
    <div className="h-full rounded-pill bg-jz-brand" style={{ width: pct + '%' }} />
  </div>
);
const ToolbarSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ children, ...rest }) => (
  <div className="w-32 flex-none"><Select {...rest}>{children}</Select></div>
);

/** Numbered marker for a step in a workflow; `line` draws the connector down to the next step. */
const StepRail: React.FC<{ n: number; line?: boolean }> = ({ n, line }) => (
  <div aria-hidden className="flex w-6 flex-none flex-col items-center">
    <span className="grid h-6 w-6 flex-none place-items-center rounded-pill border border-jz-brand bg-jz-brand-soft font-mono text-meta font-semibold text-jz-brand">{n}</span>
    {line && <span className="mt-1 w-px flex-1 bg-jz-border-strong" />}
  </div>
);

export const CompanyProjectDetailPage: React.FC = () => {
  const { pid } = useParams();
  const id = Number(pid || 0);
  const [active, setActive] = useState<TabKey>('reports');
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [confirmRun, setConfirmRun] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [apps, setApps] = useState<App[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [template, setTemplate] = useState('technical');
  const [useLlm, setUseLlm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [q, setQ] = useState('');
  const [reportQ, setReportQ] = useState('');
  const [reportPage, setReportPage] = useState(1);
  const [appQ, setAppQ] = useState('');
  const [appStatus, setAppStatus] = useState('all');
  const [appTier, setAppTier] = useState('all');
  const [appPage, setAppPage] = useState(1);
  const [candQ, setCandQ] = useState('');
  const [candStatus, setCandStatus] = useState('all');
  const [candPage, setCandPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [seed, setSeed] = useState('');
  const [catalog, setCatalog] = useState('');
  const [aptoide, setAptoide] = useState(true);
  const [play, setPlay] = useState(true);
  const [ai, setAi] = useState(false);

  const [headRef, pastHead] = useScrolledPast<HTMLDivElement>();
  // The tab bar sticks to the top of the page scroller; reserve its height as scroll padding so
  // keyboard focus and in-page scrolling never land underneath it.
  const [stickyEl, bindSticky] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const scroller = stickyEl?.closest<HTMLElement>('[data-company-project-detail]');
    if (!stickyEl || !scroller) return;
    const apply = () => { scroller.style.scrollPaddingTop = `${stickyEl.offsetHeight + 8}px`; };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(stickyEl);
    return () => { ro.disconnect(); scroller.style.scrollPaddingTop = ''; };
  }, [stickyEl]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [o, a, c, r, j] = await Promise.all([
        api<any>('/api/pentest/projects/' + id + '/overview'), api<any>('/api/pentest/projects/' + id + '/apps'),
        api<any>('/api/pentest/projects/' + id + '/candidates'), api<any>('/api/pentest/projects/' + id + '/reports'),
        api<any>('/api/pentest/projects/' + id + '/runs'),
      ]);
      setProject(o.project); setApps(a.apps || []); setCandidates(c.candidates || []); setReports(r.reports || []); setRuns(j.runs || []); setLoadErr(null);
    } catch (e: any) { setLoadErr(e ?? new Error('加载失败')); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const brands = parseBrands(project?.brands);
  const done = apps.filter((x) => x.status === 'done').length;
  const failed = apps.filter((x) => x.status === 'failed').length;
  const activeApps = apps.filter((x) => x.status === 'running' || x.status === 'queued').length;
  const filteredReports = useMemo(() => { const v = reportQ.trim().toLowerCase(); return reports.filter((r) => !v || (('#' + r.id) + r.kind + r.template + r.status).toLowerCase().includes(v)); }, [reports, reportQ]);
  const shownReports = slice(filteredReports, reportPage, 8);
  const reportPages = pagesOf(filteredReports.length, 8);
  const filteredApps = useMemo(() => { const v = appQ.trim().toLowerCase(); return apps.filter((a) => (!v || ((a.app_name || '') + ' ' + a.package + ' ' + (a.version || '')).toLowerCase().includes(v)) && (appStatus === 'all' || a.status === appStatus) && (appTier === 'all' || a.ownership_tier === appTier)); }, [apps, appQ, appStatus, appTier]);
  const shownApps = slice(filteredApps, appPage, 10);
  const appPages = pagesOf(filteredApps.length, 10);
  const filteredCands = useMemo(() => { const v = candQ.trim().toLowerCase(); return candidates.filter((c) => (!v || ((c.app_name || '') + ' ' + c.package + ' ' + (c.developer || '')).toLowerCase().includes(v)) && (candStatus === 'all' || c.status === candStatus)); }, [candidates, candQ, candStatus]);
  const shownCands = slice(filteredCands, candPage, 8);
  const candPages = pagesOf(filteredCands.length, 8);
  useEffect(() => { setAppPage(1); }, [appQ, appStatus, appTier]);
  useEffect(() => { setCandPage(1); }, [candQ, candStatus]);
  useEffect(() => { setReportPage(1); }, [reportQ]);

  const download = async (rid: number, format: 'docx' | 'pdf') => {
    const res = await fetch('/api/pentest/projects/' + id + '/reports/' + rid + '/download?format=' + format, { headers: { Authorization: 'Bearer ' + (getToken() || '') } });
    if (!res.ok) { setMsg({ text: '下载失败：' + res.status, bad: true }); return; }
    const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'project-' + id + '-report-' + rid + '.' + format; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const gen = async (kind: 'portfolio' | 'app', appId?: number) => {
    setBusy('report:' + kind + ':' + (appId || '')); setMsg(null);
    try { const r = await api<any>('/api/pentest/projects/' + id + '/reports', { method: 'POST', body: JSON.stringify({ kind, app_id: appId, template, use_llm: useLlm }) }); setMsg({ text: '报告已生成：' + (r.pages || '-') + ' 页。' }); await load(); if (r.id) await download(r.id, 'pdf'); }
    catch (e: any) { setMsg({ text: '生成失败：' + (e?.message || e), bad: true }); } finally { setBusy(''); }
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return; setUploading(true); setMsg(null);
    try { const rows: any[] = []; for (const f of Array.from(files)) { const fd = new FormData(); fd.append('file', f); const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + (getToken() || '') }, body: fd }); if (!res.ok) throw new Error('上传失败 ' + f.name); const up = await res.json(); rows.push({ apk_path: up.apk_path, app_name: f.name.replace(/\.(apk|xapk)$/i, '') }); } await api('/api/pentest/projects/' + id + '/apps', { method: 'POST', body: JSON.stringify({ apps: rows }) }); setMsg({ text: '已导入 ' + rows.length + ' 个 APK。' }); await load(); }
    catch (e: any) { setMsg({ text: String(e?.message || e), bad: true }); } finally { setUploading(false); }
  };
  const run = async () => {
    setBusy('run'); setMsg(null);
    try { const r = await api<any>('/api/pentest/projects/' + id + '/run', { method: 'POST', body: JSON.stringify({ concurrency: 2, template }) }); setMsg({ text: '已入队 ' + r.queued + ' 个应用。' }); setActive('runs'); await load(); }
    catch (e: any) { setMsg({ text: '执行失败：' + (e?.message || e), bad: true }); } finally { setBusy(''); }
  };
  const discover = async () => {
    setBusy('discover'); setMsg(null);
    try { const r = await api<any>('/api/pentest/projects/' + id + '/discover', { method: 'POST', body: JSON.stringify({ company_name: project?.company_name || project?.name || '', brands, packages: seed, catalog_text: catalog, use_aptoide: aptoide, use_play: play, use_ai: ai }) }); setMsg({ text: '发现完成：' + (r.stats?.total || 0) + ' 个候选。' }); await load(); setActive('candidates'); }
    catch (e: any) { setMsg({ text: '发现失败：' + (e?.message || e), bad: true }); } finally { setBusy(''); }
  };
  const batch = async (kind: 'verify' | 'download' | 'import') => {
    const ids = Array.from(selected); if (!ids.length) return; setBusy(kind); setMsg(null);
    try { const r = await api<any>('/api/pentest/projects/' + id + '/candidates/' + (kind === 'verify' ? 'verify' : kind), { method: 'POST', body: JSON.stringify({ ids }) }); setMsg({ text: kind === 'verify' ? '核验完成：可下载 ' + r.verified + '，待人工 ' + r.manual + '。' : kind === 'download' ? '下载完成 ' + r.ok + '，失败 ' + r.failed + '。' : '已导入 ' + r.imported + ' 个应用。' }); await load(); }
    catch (e: any) { setMsg({ text: '操作失败：' + (e?.message || e), bad: true }); } finally { setBusy(''); }
  };

  const pct = apps.length ? Math.round(done / apps.length * 100) : 0;
  const back = <Link to="/projects" className="inline-flex items-center gap-1 hover:text-jz-ink"><ArrowLeft size={14} aria-hidden />公司项目</Link>;

  if (loading && !project) {
    return (
      <Page data-company-project-detail>
        <PageHeader eyebrow={back} title="正在加载项目" />
        <SkeletonLoader variant="metrics" />
        <SkeletonLoader variant="table" rows={6} />
      </Page>
    );
  }
  if (!project) {
    const st = loadErr && typeof loadErr === 'object' && 'status' in loadErr ? Number((loadErr as { status: unknown }).status) : 0;
    return (
      <Page data-company-project-detail>
        <PageHeader eyebrow={back} title={'项目 #' + id} />
        <Panel>
          {st === 401 || st === 403 ? <PermissionState />
            : loadErr ? <ErrorState message={loadErr instanceof Error ? loadErr.message : String(loadErr)} onRetry={load} />
            : <EmptyState title="没有找到这个项目" cause="项目可能已被移除，或编号不正确。" action={<Link to="/projects" className="text-label font-medium text-jz-brand hover:underline">返回公司项目</Link>} />}
        </Panel>
      </Page>
    );
  }

  const reportCols: Column<Report>[] = [
    { key: 'name', header: '报告', card: 'title', cell: (r) => <span className="font-medium text-jz-ink">{reportName(r)}</span> },
    { key: 'template', header: '模板', cell: (r) => templateText(r.template) },
    { key: 'status', header: '状态', cell: (r) => <StatusBadge tone={tone(r.status)}>{reportStatus(r.status)}</StatusBadge> },
    { key: 'actions', header: <span className="sr-only">下载</span>, label: '下载', align: 'right', card: 'action', cell: (r) => (
      <ActionMenu label="下载" menuLabel={`下载报告 #${r.id}`} icon={<Download size={14} aria-hidden />}
        triggerAttrs={{ 'data-report-download': r.id }}
        items={[
          { key: 'pdf', label: 'PDF', onSelect: () => download(r.id, 'pdf'), attrs: { 'aria-label': `下载报告 #${r.id} 的 PDF` } },
          { key: 'docx', label: 'DOCX', onSelect: () => download(r.id, 'docx'), attrs: { 'aria-label': `下载报告 #${r.id} 的 DOCX` } },
        ]} />
    ) },
  ];
  const appCols: Column<App>[] = [
    { key: 'app', header: '应用', card: 'title', cell: (a) => <span className="font-medium text-jz-ink">{a.app_name || '—'}</span> },
    { key: 'package', header: '包名', mono: true, cell: (a) => <span className="break-all">{a.package}</span> },
    { key: 'version', header: '版本', cell: (a) => a.version || '—' },
    { key: 'brand', header: '品牌', cell: (a) => a.brand || '—' },
    { key: 'tier', header: '归属', cell: (a) => a.ownership_tier || '—' },
    { key: 'status', header: '状态', cell: (a) => <StatusBadge tone={tone(a.status)}>{statusText(a.status)}</StatusBadge> },
    { key: 'report', header: '报告', cell: (a) => (a.report_status ? reportStatus(a.report_status) : '未生成') },
    { key: 'actions', header: '操作', align: 'right', card: 'action', cell: (a) => (
      <Button size="sm" variant="secondary" disabled={!!busy || a.status !== 'done'} loading={busy === 'report:app:' + a.id} onClick={() => gen('app', a.id)}
        title={a.status !== 'done' ? '应用评估完成后才能生成报告' : undefined}>生成报告</Button>
    ) },
  ];
  const candCols: Column<Candidate>[] = [
    { key: 'app', header: '应用', card: 'title', cell: (c) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-jz-ink">{c.app_name || '—'}</div>
        <div className="break-all font-mono text-meta text-jz-muted">{c.package}</div>
      </div>
    ) },
    { key: 'developer', header: '开发者', cell: (c) => c.developer || '—' },
    { key: 'source', header: '来源', cell: (c) => c.source || '—' },
    { key: 'tier', header: '归属', cell: (c) => c.ownership_tier || '—' },
    { key: 'confidence', header: '置信度', align: 'right', cell: (c) => Math.round((c.confidence || 0) * 100) + '%' },
    { key: 'status', header: '状态', cell: (c) => <StatusBadge tone={tone(c.status)}>{candText(c.status)}</StatusBadge> },
    { key: 'link', header: '来源页', align: 'right', card: 'action', cell: (c) => (c.source_url
      ? <a href={c.source_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-control px-2 text-label text-jz-brand hover:bg-jz-brand-soft">打开 <ExternalLink size={14} aria-hidden /></a>
      : '—') },
  ];
  const toggleCand = (key: string | number) => setSelected((p) => { const n = new Set(p); if (n.has(Number(key))) n.delete(Number(key)); else n.add(Number(key)); return n; });
  const toggleAllCands = (keys: Array<string | number>, all: boolean) => setSelected((p) => { const n = new Set(p); keys.forEach((k) => { if (all) n.delete(Number(k)); else n.add(Number(k)); }); return n; });
  const noMatch = (text: string) => <EmptyState compact icon={SearchX} title={text} />;

  const kindText = project.kind === 'company' ? '公司级' : '单应用';
  const latest = reports[0];
  const pending = Math.max(0, apps.length - done - activeApps - failed);
  // What to do next, in workflow order; only steps that apply to the current data.
  const nextSteps: { key: string; text: React.ReactNode; action: React.ReactNode }[] = [];
  if (!apps.length) nextSteps.push({ key: 'import', text: '清单里还没有应用。导入 APK，或在候选应用里发现并导入。', action: <Button size="sm" variant="secondary" icon={<Upload size={14} aria-hidden />} onClick={() => fileRef.current?.click()}>导入 APK</Button> });
  if (apps.length && done < apps.length) nextSteps.push({ key: 'run', text: `${apps.length - done} 个应用还没有完成评估。`, action: <Button size="sm" variant="secondary" onClick={() => setActive('apps')}>查看应用清单</Button> });
  if (candidates.length) nextSteps.push({ key: 'cand', text: `${candidates.length} 个候选应用待核验或导入。`, action: <Button size="sm" variant="secondary" onClick={() => setActive('candidates')}>处理候选应用</Button> });
  if (done) nextSteps.push({ key: 'report', text: latest ? `最近一份报告是 #${latest.id}（${reportStatus(latest.status)}）。` : '已有完成的应用，可以生成第一份项目总报告。', action: <Button size="sm" variant="secondary" onClick={() => setActive('reports')}>去生成报告</Button> });

  return (
    <Page data-company-project-detail>
      <div ref={headRef} className="flex flex-col gap-4">
        <PageHeader eyebrow={back} title={project.name || '项目'}
          meta={<>
            <span className="font-mono">#{project.id}</span>
            <Tag>{kindText}</Tag>
            <span>{project.company_name || '未填写公司'}</span>
            <span>{brands.join(' / ') || '未设置品牌'}</span>
          </>}
          actions={<>
            <input ref={fileRef} type="file" multiple accept=".apk,.xapk" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => upload(e.target.files)} />
            <Button variant="secondary" icon={<Upload size={16} aria-hidden />} loading={uploading} onClick={() => fileRef.current?.click()} data-company-upload>导入 APK</Button>
            <Button variant="secondary" icon={<RefreshCw size={16} aria-hidden />} onClick={load}>刷新</Button>
            <Button icon={<Play size={16} aria-hidden />} loading={busy === 'run'} disabled={!apps.length} onClick={() => setConfirmRun(true)}
              title={apps.length ? undefined : '清单里还没有应用'} data-company-run>批量执行</Button>
          </>} />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-panel border border-jz-border bg-jz-surface px-4 py-3 text-label text-jz-ink-2" data-company-context>
            <span>应用 <b className="font-semibold tnum text-jz-ink">{apps.length}</b></span>
            <span className="flex items-center gap-2">评估完成 <b className="font-semibold tnum text-jz-ink">{done}/{apps.length}</b>
              <span className="w-24"><Bar pct={pct} label="已完成应用占比" /></span><span className="tnum text-jz-muted">{pct}%</span></span>
            {activeApps > 0 && <StatusBadge tone="attention">执行中 {activeApps}</StatusBadge>}
            {failed > 0 && <StatusBadge tone="danger">失败 {failed}</StatusBadge>}
            <span>候选 <b className="font-semibold tnum text-jz-ink">{candidates.length}</b></span>
            <span>报告 <b className="font-semibold tnum text-jz-ink">{reports.length}</b>{latest && <span className="text-jz-muted"> · 最近 #{latest.id} {reportStatus(latest.status)}</span>}</span>
        </div>
      </div>

      {!!loadErr && <StaleNotice reason={'刷新失败：' + (loadErr instanceof Error ? loadErr.message : String(loadErr))} onRefresh={load} />}
      {msg && (
        <InlineAlert tone={msg.bad ? 'danger' : 'success'} data-company-msg
          action={<Button size="sm" variant="ghost" onClick={() => setMsg(null)}>关闭</Button>}>{msg.text}</InlineAlert>
      )}

      {/* Context stays visible while scrolling: the tab bar sticks, and once the header is out of view it carries the project name and the primary action. */}
      <div ref={bindSticky} className="sticky top-0 z-10 -mx-jz-page -mt-4 bg-jz-canvas px-jz-page pt-2" data-company-sticky={pastHead ? 'compact' : 'full'}>
        <div className="flex min-w-0 items-center gap-4 border-b border-jz-border">
          {pastHead && (
            <div className="hidden min-w-0 max-w-xs flex-none items-center gap-2 lg:flex" data-company-sticky-title>
              <span className="truncate text-label font-semibold text-jz-ink">{project.name}</span>
              <Tag>{kindText}</Tag>
            </div>
          )}
          <Tabs<TabKey> label="项目内容" value={active} onChange={setActive} className="min-w-0 flex-1 border-b-0" items={[
            { key: 'reports', label: '报告', count: reports.length, dataAttrs: { 'data-company-tab': 'reports' } },
            { key: 'overview', label: '概览', dataAttrs: { 'data-company-tab': 'overview' } },
            { key: 'apps', label: '应用清单', count: apps.length, dataAttrs: { 'data-company-tab': 'apps' } },
            { key: 'candidates', label: '候选应用', count: candidates.length, dataAttrs: { 'data-company-tab': 'candidates' } },
            { key: 'runs', label: '执行记录', count: runs.length, dataAttrs: { 'data-company-tab': 'runs' } },
          ]} />
          {pastHead && (
            <Button size="sm" className="hidden flex-none lg:inline-flex" icon={<Play size={14} aria-hidden />} loading={busy === 'run'} disabled={!apps.length}
              onClick={() => setConfirmRun(true)} data-company-sticky-run>批量执行</Button>
          )}
        </div>
      </div>

      {active === 'reports' && (
        <section className="min-w-0 overflow-hidden rounded-panel border border-jz-border bg-jz-surface shadow-card" role="tabpanel" aria-label="报告" data-report-workflow>
          {/* One workflow in two numbered steps; the rail ties the generator to the history it feeds. */}
          <div className="flex gap-4 px-5 pt-4" data-report-step="generate">
            <StepRail n={1} line />
            <div className="min-w-0 flex-1 pb-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-section font-semibold text-jz-ink">生成项目总报告</h2>
                <p className="text-meta text-jz-muted">生成后自动下载 PDF，并出现在下方历史的第一行。</p>
              </div>
              <div className="mt-4 grid items-end gap-4 desktop:grid-cols-[minmax(220px,300px)_1fr_auto]">
                <Field label="模板">
                  {(ids) => (
                    <Select ids={ids} value={template} onChange={(e) => setTemplate(e.target.value)}>
                      <option value="technical">技术证据版</option><option value="executive">管理层摘要</option><option value="forensic">取证版</option>
                    </Select>
                  )}
                </Field>
                <Checkbox checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} label="使用 LLM 撰写叙述（可选）"
                  hint={`报告正文不含明文密钥。当前覆盖 ${apps.length} 个应用，${done} 个已完成。`} />
                <Button icon={<Wand2 size={16} aria-hidden />} loading={busy === 'report:portfolio:'} disabled={!!busy || !apps.length} onClick={() => gen('portfolio')}
                  title={apps.length ? undefined : '清单里还没有应用'}>生成报告</Button>
              </div>
              <details className="group mt-3">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-control text-label text-jz-ink-2 hover:text-jz-ink [&::-webkit-details-marker]:hidden">
                  <ChevronDown size={14} aria-hidden className="transition-transform duration-expand group-open:rotate-180" />报告包含 {REPORT_CONTENTS.length} 个章节
                </summary>
                <ul className="mt-2 grid gap-x-4 gap-y-1.5 text-label text-jz-ink-2 sm:grid-cols-2 desktop:grid-cols-4" aria-label="报告包含的章节">
                  {REPORT_CONTENTS.map((x) => <li key={x} className="flex items-center gap-1.5"><Check size={14} className="flex-none text-jz-muted" aria-hidden />{x}</li>)}
                </ul>
              </details>
            </div>
          </div>
          <div className="flex gap-4 px-5 pb-3" data-report-step="history">
            <StepRail n={2} />
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-section font-semibold text-jz-ink">历史与下载</h2>
                <p className="text-meta text-jz-muted">{filteredReports.length} / {reports.length} 份报告</p>
              </div>
              <SearchField value={reportQ} onValueChange={setReportQ} label="搜索报告" className="w-56 max-w-full" />
            </div>
          </div>
          <DataTable stickyHeader={false} label="报告历史" columns={reportCols} rows={shownReports} rowKey={(r) => r.id}
            rowClassName={(r) => r.status === 'generating' ? 'bg-jz-brand-soft/50' : undefined}
            rowDataAttrs={(r) => ({ 'data-report-row': r.id, 'data-report-latest': latest && r.id === latest.id ? '' : undefined })}
            state={!shownReports.length ? (reports.length
              ? noMatch('没有匹配的报告')
              : <EmptyState compact icon={FileText} title="还没有报告" cause="在上方生成第一份项目总报告。" />) : undefined} />
          <Pagination page={reportPage} pageSize={8} total={filteredReports.length} onPage={setReportPage} />
        </section>
      )}

      {active === 'overview' && (
        <div className="grid gap-4 desktop:grid-cols-12" role="tabpanel" aria-label="概览">
          <SignalPanel className="desktop:col-span-8" question="这个项目评估到哪一步了？"
            value={<>{pct}<span className="text-title text-jz-muted">%</span></>}
            tone={apps.length && pct === 100 ? 'success' : 'default'}
            statement={apps.length ? `清单内 ${apps.length} 个应用，${done} 个已完成评估。` : '清单里还没有应用，导入后才能执行评估。'}
            breakdown={[
              { label: '完成', value: done, tone: done ? 'success' : 'default' },
              { label: '执行中', value: activeApps, tone: activeApps ? 'attention' : 'default' },
              { label: '失败', value: failed, tone: failed ? 'danger' : 'default' },
              { label: '未执行', value: pending },
            ]}>
            <StackedBar className="px-6 py-4" label="应用状态分布" parts={[
              { key: 'done', label: '完成', value: done, tone: 'success' },
              { key: 'active', label: '执行中', value: activeApps, tone: 'attention' },
              { key: 'failed', label: '失败', value: failed, tone: 'danger' },
              { key: 'pending', label: '未执行', value: pending, tone: 'neutral' },
            ]} />
          </SignalPanel>
          <Panel flush className="desktop:col-span-4" title="接下来">
            {nextSteps.length ? (
              <ol className="divide-y divide-jz-border">
                {nextSteps.map((n, i) => (
                  <li key={n.key} className="flex flex-col gap-2 px-5 py-3.5" data-company-next={n.key}>
                    <p className="text-label text-jz-ink"><span className="mr-1.5 font-mono text-jz-muted">{i + 1}</span>{n.text}</p>
                    <div>{n.action}</div>
                  </li>
                ))}
              </ol>
            ) : <EmptyState compact icon={Check} title="没有待处理的步骤" cause="应用全部完成，报告已生成。" />}
          </Panel>
          <Panel flush className="desktop:col-span-6" title="最近报告" actions={<Button size="sm" variant="ghost" onClick={() => setActive('reports')}>全部报告<ArrowRight size={14} aria-hidden /></Button>}>
            <ul className="divide-y divide-jz-border">
              {reports.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-label">
                  <span className="min-w-0 truncate text-jz-ink">{reportName(r)} · <span className="text-jz-ink-2">{templateText(r.template)}</span></span>
                  <StatusBadge tone={tone(r.status)}>{reportStatus(r.status)}</StatusBadge>
                </li>
              ))}
            </ul>
            {!reports.length && <EmptyState compact icon={FileText} title="还没有报告" />}
          </Panel>
          <Panel flush className="desktop:col-span-6" title="最近执行" actions={<Button size="sm" variant="ghost" onClick={() => setActive('runs')}>全部记录<ArrowRight size={14} aria-hidden /></Button>}>
            <ul className="divide-y divide-jz-border">
              {runs.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-label">
                  <span className="flex items-center gap-2 text-jz-ink"><span className="font-mono">#{r.id}</span><StatusBadge tone={tone(r.status)}>{statusText(r.status)}</StatusBadge></span>
                  <span className="tnum text-jz-muted">{r.succeeded}/{r.total} 成功 · {r.failed} 失败</span>
                </li>
              ))}
            </ul>
            {!runs.length && <EmptyState compact icon={Activity} title="还没有执行记录" />}
          </Panel>
        </div>
      )}

      {active === 'apps' && (
        <div className="flex flex-col gap-4" role="tabpanel">
          <Panel flush title="应用清单" description={`${filteredApps.length} / ${apps.length} 个`}
            actions={<>
              <SearchField value={appQ} onValueChange={setAppQ} label="搜索应用或包名" className="w-56 max-w-full" />
              <ToolbarSelect aria-label="按状态筛选" value={appStatus} onChange={(e) => setAppStatus(e.target.value)}>
                <option value="all">全部状态</option>
                {Array.from(new Set(apps.map((a) => a.status).filter(Boolean))).map((s) => <option key={s} value={s}>{statusText(s)}</option>)}
              </ToolbarSelect>
              <ToolbarSelect aria-label="按归属筛选" value={appTier} onChange={(e) => setAppTier(e.target.value)}>
                <option value="all">全部归属</option>
                {Array.from(new Set(apps.map((a) => a.ownership_tier).filter(Boolean))).map((s) => <option key={s} value={s}>{s}</option>)}
              </ToolbarSelect>
            </>}>
            <DataTable stickyHeader={false} label="应用清单" columns={appCols} rows={shownApps} rowKey={(a) => a.id}
              state={!shownApps.length ? (apps.length
                ? noMatch('没有匹配的应用')
                : <EmptyState compact icon={Layers3} title="清单里还没有应用" cause="导入 APK，或在“候选应用”里发现并导入。"
                    action={<Button variant="secondary" icon={<Upload size={16} aria-hidden />} onClick={() => fileRef.current?.click()}>导入 APK</Button>} />) : undefined} />
            <Pagination page={appPage} pageSize={10} total={filteredApps.length} onPage={setAppPage} />
          </Panel>
        </div>
      )}

      {active === 'candidates' && (
        <div className="flex flex-col gap-4" role="tabpanel">
          <Panel title="发现候选应用" description="从公开来源发现，核验后下载或导入项目。公开来源无法保证覆盖完整，未出现的应用不代表不存在。">
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="指定包名" hint="可选，多个包名用英文逗号分隔">
                {(ids) => <Input ids={ids} value={seed} onChange={(e) => setSeed(e.target.value)} />}
              </Field>
              <Field label="应用清单" hint="可选，粘贴官方应用清单或客户授权清单">
                {(ids) => <Textarea ids={ids} rows={2} value={catalog} onChange={(e) => setCatalog(e.target.value)} />}
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <Checkbox checked={aptoide} onChange={(e) => setAptoide(e.target.checked)} label="Aptoide" />
              <Checkbox checked={play} onChange={(e) => setPlay(e.target.checked)} label="Play 开发者页" />
              <Checkbox checked={ai} onChange={(e) => setAi(e.target.checked)} label="AI 解析" />
              <span className="flex-1" />
              <Button icon={<Sparkles size={16} aria-hidden />} loading={busy === 'discover'} onClick={discover}>发现候选应用</Button>
            </div>
          </Panel>
          <Panel flush title="候选列表" description={`${filteredCands.length} / ${candidates.length} 个`}
            actions={<>
              <SearchField value={candQ} onValueChange={setCandQ} label="搜索候选应用" className="w-56 max-w-full" />
              <ToolbarSelect aria-label="按状态筛选" value={candStatus} onChange={(e) => setCandStatus(e.target.value)}>
                <option value="all">全部状态</option>
                {Array.from(new Set(candidates.map((c) => c.status).filter(Boolean))).map((s) => <option key={s} value={s}>{candText(s)}</option>)}
              </ToolbarSelect>
            </>}>
            <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
              <Button size="sm" variant="secondary" disabled={!!busy} loading={busy === 'verify'} onClick={() => batch('verify')}>核验</Button>
              <Button size="sm" variant="secondary" disabled={!!busy} loading={busy === 'download'} onClick={() => batch('download')}>下载</Button>
              <Button size="sm" disabled={!!busy} loading={busy === 'import'} onClick={() => batch('import')}>导入项目</Button>
            </BulkBar>
            <DataTable stickyHeader={false} label="候选应用" columns={candCols} rows={shownCands} rowKey={(c) => c.id}
              selected={selected as Set<string | number>} onToggle={toggleCand} onToggleAll={toggleAllCands}
              state={!shownCands.length ? (candidates.length
                ? noMatch('没有匹配的候选应用')
                : <EmptyState compact icon={Sparkles} title="还没有候选应用" cause="在上方选择来源，然后发现候选应用。" />) : undefined} />
            <Pagination page={candPage} pageSize={8} total={filteredCands.length} onPage={setCandPage} />
          </Panel>
        </div>
      )}

      {active === 'runs' && (
        <div className="flex flex-col gap-4" role="tabpanel">
          <Panel flush title="执行记录" description="每次批量执行的进度与结果。并发 2；失败的应用保留在清单中，可以重新执行。"
            actions={<Button size="sm" variant="secondary" icon={<RefreshCw size={14} aria-hidden />} onClick={load}>刷新</Button>}>
            <FactRow className="border-b border-jz-border px-5 py-4" facts={[
              { label: '批次', value: runs.length },
              { label: '成功应用', value: runs.reduce((n, r) => n + (r.succeeded || 0), 0), tone: 'success' },
              { label: '失败应用', value: runs.reduce((n, r) => n + (r.failed || 0), 0), tone: runs.some((r) => r.failed) ? 'danger' : 'default' },
              { label: '跳过', value: runs.reduce((n, r) => n + (r.skipped || 0), 0) },
            ]} />
            <ul className="divide-y divide-jz-border">
              {runs.map((r) => {
                const p = r.total ? Math.round(r.succeeded / r.total * 100) : 0;
                return (
                  <li key={r.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[1fr_200px_48px] sm:items-center">
                    <div>
                      <div className="flex items-center gap-2 text-label font-medium text-jz-ink"><span className="font-mono">#{r.id}</span><StatusBadge tone={tone(r.status)}>{statusText(r.status)}</StatusBadge></div>
                      <div className="mt-1 text-meta tnum text-jz-muted">{r.succeeded} 成功 · {r.failed} 失败 · {r.skipped} 跳过，共 {r.total}</div>
                    </div>
                    <Bar pct={p} label={`批次 #${r.id} 成功占比`} />
                    <div className="text-label tnum text-jz-ink-2 sm:text-right">{p}%</div>
                  </li>
                );
              })}
            </ul>
            {!runs.length && <EmptyState compact icon={Activity} title="还没有执行记录" cause="清单里有应用后，使用“批量执行”。" />}
          </Panel>
        </div>
      )}

      <ConfirmDialog open={confirmRun} destructive={false} title="批量执行评估" confirmLabel="开始执行"
        outcome="执行开始后可以在“执行记录”里查看进度。"
        onCancel={() => setConfirmRun(false)} onConfirm={() => { setConfirmRun(false); run(); }}>
        将为清单内的应用排队执行评估，当前清单有 {apps.length} 个应用，并发 2，模板为{templateText(template)}。
      </ConfirmDialog>
    </Page>
  );
};
