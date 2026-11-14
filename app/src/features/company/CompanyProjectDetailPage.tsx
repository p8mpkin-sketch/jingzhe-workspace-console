import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Building2, CheckCircle2, ChevronLeft, ChevronRight, Download,
  FileText, Loader2, Play, Plus, RefreshCw, Search, Sparkles, Upload,
  AlertTriangle, Wand2, Layers3, Activity, Clock3, ShieldCheck, X,
} from 'lucide-react';
import { api, getToken } from '@/services/api';

const input = 'rounded-xl border border-jz-border/70 bg-jz-surface px-3 py-2 text-xs text-jz-text-primary outline-none focus:border-jz-accent-cyan/70';
const btn = 'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-45 disabled:pointer-events-none';
const primary = btn + ' bg-jz-accent-cyan text-jz-bg hover:brightness-110';
const ghost = btn + ' border border-jz-border/70 bg-jz-surface text-jz-text-secondary hover:border-jz-accent-cyan/40 hover:text-jz-text-primary';
const tab = (on: boolean) => 'relative shrink-0 px-3 py-2.5 text-xs font-semibold ' + (on ? 'text-jz-accent-cyan' : 'text-jz-text-muted hover:text-jz-text-primary');

type Project = { id: number; name: string; company_name?: string; kind?: string; brands?: string; status?: string; app_count?: number; inventory_count?: number };
type App = { id: number; package: string; app_name?: string; version?: string; brand?: string; ownership_tier?: string; status?: string; report_status?: string };
type Candidate = { id: number; package: string; app_name?: string; developer?: string; source?: string; source_url?: string; confidence?: number; status?: string; ownership_tier?: string };
type Report = { id: number; kind: string; template: string; status: string; pages?: number };
type Run = { id: number; status: string; total: number; succeeded: number; failed: number; skipped: number };

const parseBrands = (s?: string): string[] => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const tone = (s?: string) => s === 'done' || s === 'ready' || s === 'imported' ? 'text-emerald-300 bg-emerald-400/10 border-emerald-400/25' : s === 'failed' || s === 'rejected' ? 'text-red-300 bg-red-400/10 border-red-400/25' : s === 'running' || s === 'queued' || s === 'needs_verification' || s === 'manual_required' ? 'text-amber-300 bg-amber-400/10 border-amber-400/25' : 'text-jz-text-muted bg-jz-elevated/30 border-jz-border/60';
const statusText = (s?: string) => s === 'done' ? '完成' : s === 'running' ? '执行中' : s === 'failed' ? '失败' : s === 'queued' ? '排队' : s === 'discovered' ? '未执行' : s || '未执行';
const candText = (s?: string) => s === 'imported' ? '已导入' : s === 'downloaded' ? '已下载' : s === 'verified' ? '可下载' : s === 'needs_verification' ? '待核验' : s === 'manual_required' ? '需人工' : s === 'rejected' ? '已排除' : s === 'download_failed' ? '下载失败' : s === 'pending' ? '待处理' : s || '候选';
const reportStatus = (s?: string) => s === 'ready' ? '就绪' : s === 'generating' ? '生成中' : s === 'failed' ? '失败' : s || '未知';
const templateText = (s?: string) => s === 'technical' ? '技术证据版' : s === 'executive' ? '管理层摘要' : s === 'forensic' ? '取证版' : s || '技术证据版';
const pagesOf = (n: number, size: number) => Math.max(1, Math.ceil(n / size));
const slice = <T,>(rows: T[], page: number, size: number) => rows.slice((page - 1) * size, page * size);

const Pager: React.FC<{ page: number; pages: number; total: number; setPage: (n: number) => void }> = ({ page, pages, total, setPage }) => (
  <div className="flex items-center justify-between border-t border-jz-border/50 px-3 py-2.5 text-[11px] text-jz-text-muted">
    <span>共 {total} 条</span>
    <div className="flex items-center gap-1"><button className={ghost + ' !px-2 !py-1'} disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={12} /></button><span className="px-2">{page} / {pages}</span><button className={ghost + ' !px-2 !py-1'} disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={12} /></button></div>
  </div>
);
const Kpi: React.FC<{ label: string; value: React.ReactNode; hint: string; icon: React.ReactNode; tone?: string }> = ({ label, value, hint, icon, tone: t }) => (
  <div className="rounded-2xl border border-jz-border/70 bg-jz-surface p-4 shadow-jz-card"><div className="flex items-start justify-between"><div className="text-[11px] text-jz-text-muted">{label}</div><div className={'grid h-8 w-8 place-items-center rounded-lg border ' + (t || 'border-jz-accent-cyan/25 bg-jz-accent-cyan/10 text-jz-accent-cyan')}>{icon}</div></div><div className="mt-1 text-2xl font-bold text-jz-text-primary">{value}</div><div className="mt-1 text-[10px] text-jz-text-muted">{hint}</div></div>
);
const Card: React.FC<{ title?: string; hint?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ title, hint, action, className = '', children }) => (
  <section className={'overflow-hidden rounded-2xl border border-jz-border/70 bg-jz-surface shadow-jz-card ' + className}>{(title || action) && <div className="flex items-start justify-between gap-3 border-b border-jz-border/60 px-4 py-3"><div><div className="text-sm font-semibold text-jz-text-primary">{title}</div>{hint && <div className="mt-0.5 text-[11px] text-jz-text-muted">{hint}</div>}</div>{action}</div>}{children}</section>
);

export const CompanyProjectDetailPage: React.FC = () => {
  const { pid } = useParams();
  const id = Number(pid || 0);
  const [active, setActive] = useState<'reports' | 'overview' | 'apps' | 'candidates' | 'runs'>('reports');
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

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [o, a, c, r, j] = await Promise.all([
        api<any>('/api/pentest/projects/' + id + '/overview'), api<any>('/api/pentest/projects/' + id + '/apps'),
        api<any>('/api/pentest/projects/' + id + '/candidates'), api<any>('/api/pentest/projects/' + id + '/reports'),
        api<any>('/api/pentest/projects/' + id + '/runs'),
      ]);
      setProject(o.project); setApps(a.apps || []); setCandidates(c.candidates || []); setReports(r.reports || []); setRuns(j.runs || []);
    } catch (e: any) { setMsg({ text: '加载失败：' + (e?.message || e), bad: true }); } finally { setLoading(false); }
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
    try { const r = await api<any>('/api/pentest/projects/' + id + '/run', { method: 'POST', body: JSON.stringify({ concurrency: 2, template }) }); setMsg({ text: '已入队 ' + r.queued + ' 个 APP。' }); setActive('runs'); await load(); }
    catch (e: any) { setMsg({ text: '执行失败：' + (e?.message || e), bad: true }); } finally { setBusy(''); }
  };
  const discover = async () => {
    setBusy('discover'); setMsg(null);
    try { const r = await api<any>('/api/pentest/projects/' + id + '/discover', { method: 'POST', body: JSON.stringify({ company_name: project?.company_name || project?.name || '', brands, packages: seed, catalog_text: catalog, use_aptoide: aptoide, use_play: play, use_ai: ai }) }); setMsg({ text: '发现完成：' + (r.stats?.total || 0) + ' 个候选。' }); await load(); setActive('candidates'); }
    catch (e: any) { setMsg({ text: '发现失败：' + (e?.message || e), bad: true }); } finally { setBusy(''); }
  };
  const batch = async (kind: 'verify' | 'download' | 'import') => {
    const ids = Array.from(selected); if (!ids.length) return; setBusy(kind); setMsg(null);
    try { const r = await api<any>('/api/pentest/projects/' + id + '/candidates/' + (kind === 'verify' ? 'verify' : kind), { method: 'POST', body: JSON.stringify({ ids }) }); setMsg({ text: kind === 'verify' ? '核验完成：可下载 ' + r.verified + '，待人工 ' + r.manual + '。' : kind === 'download' ? '下载完成 ' + r.ok + '，失败 ' + r.failed + '。' : '已导入 ' + r.imported + ' 个 APP。' }); await load(); }
    catch (e: any) { setMsg({ text: '操作失败：' + (e?.message || e), bad: true }); } finally { setBusy(''); }
  };

  if (loading && !project) return <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-jz-text-muted"><Loader2 size={16} className="animate-spin" />加载项目…</div>;

  return (
    <div className="min-h-full w-full p-4 md:p-6 lg:p-8 xl:p-10" data-company-project-detail>
      <Link to="/company" className="inline-flex items-center gap-1 text-xs text-jz-text-muted hover:text-jz-text-primary"><ArrowLeft size={13} />公司项目</Link>
      <div className="mt-2 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-bold tracking-tight text-jz-text-primary md:text-[28px]">{project?.name || '项目'}</h1><span className="rounded border border-jz-border/60 px-1.5 py-0.5 font-mono text-[10px] text-jz-text-muted">#{project?.id}</span><span className={'rounded border px-1.5 py-0.5 text-[10px] ' + (project?.kind === 'company' ? 'border-jz-accent-cyan/25 bg-jz-accent-cyan/10 text-jz-accent-cyan' : 'text-jz-text-muted')}>{project?.kind === 'company' ? '公司级' : '单 APP'}</span></div><div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-jz-text-muted"><span className="inline-flex items-center gap-1"><Building2 size={12} />{project?.company_name || '未填写公司'}</span><span className="h-3 w-px bg-jz-border/70" /><span>{brands.join(' / ') || '未设置品牌'}</span></div></div>
        <div className="flex flex-wrap gap-2"><label className={ghost + ' cursor-pointer'}>{uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}导入 APK<input type="file" multiple accept=".apk,.xapk" className="hidden" onChange={(e) => upload(e.target.files)} /></label><button className={ghost} onClick={load}><RefreshCw size={14} />刷新</button><button className={primary} disabled={busy === 'run' || !apps.length} onClick={run}>{busy === 'run' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}批量执行</button></div>
      </div>
      {msg && <div className={'mt-4 flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs ' + (msg.bad ? 'border-red-400/30 bg-red-400/10 text-red-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200')}><span className="flex items-center gap-2">{msg.bad ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}{msg.text}</span><button onClick={() => setMsg(null)}><X size={14} /></button></div>}
      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-jz-border/60">{[['reports', '报告', reports.length], ['overview', '概览', apps.length], ['apps', 'APP 清单', apps.length], ['candidates', '候选发现', candidates.length], ['runs', '执行记录', runs.length]].map(([k, label, n]) => <button key={String(k)} className={tab(active === k)} onClick={() => setActive(k as any)}>{label}<span className={'ml-1 rounded px-1 py-0.5 text-[10px] ' + (active === k ? 'bg-jz-accent-cyan/10 text-jz-accent-cyan' : 'bg-jz-elevated/40 text-jz-text-muted')}>{n}</span>{active === k && <span className="absolute inset-x-3 -bottom-px h-0.5 bg-jz-accent-cyan" />}</button>)}</div>
      <div className="pt-5">
        {active === 'reports' && <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Kpi label="项目报告" value={reports.length} hint="DOCX / PDF" icon={<FileText size={15} />} /><Kpi label="覆盖 APP" value={apps.length} hint={done + ' 个已完成'} icon={<Layers3 size={15} />} tone="border-emerald-400/25 bg-emerald-400/10 text-emerald-300" /><Kpi label="候选证据" value={candidates.length} hint="不写入正文" icon={<Sparkles size={15} />} tone="border-violet-400/25 bg-violet-400/10 text-violet-300" /><Kpi label="最近报告" value={reports[0] ? '#' + reports[0].id : '—'} hint={reportStatus(reports[0]?.status) || '暂无'} icon={<Clock3 size={15} />} tone="border-amber-400/25 bg-amber-400/10 text-amber-300" /></div>
          <Card title="生成项目总报告" hint="模板化输出 · DOCX / PDF">
            <div className="grid items-end gap-4 p-4 xl:grid-cols-[minmax(220px,300px)_1fr_auto]">
              <label className="block text-[11px] text-jz-text-muted">模板<select className={input + ' mt-1 w-full'} value={template} onChange={(e) => setTemplate(e.target.value)}><option value="technical">技术证据版</option><option value="executive">管理层摘要</option><option value="forensic">取证版</option></select></label>
              <div><label className="flex items-center gap-2 text-[11px] text-jz-text-muted"><input type="checkbox" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} />LLM 叙述（可选）</label><p className="mt-1 text-[10px] leading-4 text-jz-text-muted">生成后自动下载 PDF；正文不含明文密钥。当前覆盖 {apps.length} 个 APP、{reports.length} 份历史报告。</p></div>
              <button className={primary + ' h-[38px] px-5'} disabled={!!busy || !apps.length} onClick={() => gen('portfolio')}>{busy === 'report:portfolio:' ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}生成 DOCX + PDF</button>
            </div>
            <div className="grid gap-2 border-t border-jz-border/50 p-4 text-[10px] text-jz-text-muted sm:grid-cols-2 xl:grid-cols-4">{['封面 / 目录页码', 'APP 全量清单', '重点发现总表', '密钥/签名/加固', '逐 APP 证据图', '误报与待复核', '覆盖与限制', '证据索引'].map((x) => <div key={x} className="flex items-center gap-1.5"><CheckCircle2 size={11} className="shrink-0 text-jz-accent-cyan" />{x}</div>)}</div>
          </Card>
          <Card title="报告历史" hint="搜索、分页、单份下载" action={<div className="relative"><Search size={12} className="absolute left-2 top-2 text-jz-text-muted" /><input value={reportQ} onChange={(e) => setReportQ(e.target.value)} className={input + ' !py-1 pl-6'} placeholder="搜索报告" /></div>}>
            <div className="divide-y divide-jz-border/40"><table className="w-full text-xs"><thead className="bg-jz-elevated/20 text-jz-text-muted"><tr>{['报告', '模板', '状态', '操作'].map((h) => <th key={h} className="px-4 py-2.5 text-left font-medium first:pl-4 last:text-right">{h}</th>)}</tr></thead><tbody>{shownReports.map((r) => <tr key={r.id} className="border-t border-jz-border/40 hover:bg-jz-elevated/10"><td className="px-4 py-2.5"><div className="font-medium text-jz-text-primary">#{r.id} · {r.kind === 'portfolio' ? '项目总报告' : '单 APP'}</div></td><td className="px-4 py-2.5 text-jz-text-muted">{templateText(r.template)}</td><td className="px-4 py-2.5"><span className={'inline-flex rounded border px-1.5 py-0.5 text-[10px] ' + tone(r.status)}>{reportStatus(r.status)}</span></td><td className="px-4 py-2.5"><div className="flex justify-end gap-1.5"><button className={ghost + ' !px-2.5 !py-1.5'} onClick={() => download(r.id, 'docx')}><Download size={11} />DOCX</button><button className={ghost + ' !px-2.5 !py-1.5'} onClick={() => download(r.id, 'pdf')}><Download size={11} />PDF</button></div></td></tr>)}{!shownReports.length && <tr><td colSpan={4} className="px-4 py-14 text-center text-jz-text-muted">没有报告，先生成项目总报告。</td></tr>}</tbody></table>{!shownReports.length && <div className="px-4 py-14 text-center text-xs text-jz-text-muted">没有报告，先生成项目总报告。</div>}</div>
            <Pager page={reportPage} pages={reportPages} total={filteredReports.length} setPage={setReportPage} />
          </Card>
        </div>}
        {active === 'overview' && <div className="space-y-3"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Kpi label="APP 总数" value={apps.length} hint="项目清单" icon={<Layers3 size={15} />} /><Kpi label="已完成" value={done} hint={apps.length ? Math.round(done / apps.length * 100) + '% 覆盖' : '未执行'} icon={<CheckCircle2 size={15} />} tone="border-emerald-400/25 bg-emerald-400/10 text-emerald-300" /><Kpi label="候选" value={candidates.length} hint="待核验 / 导入" icon={<Sparkles size={15} />} tone="border-violet-400/25 bg-violet-400/10 text-violet-300" /><Kpi label="报告" value={reports.length} hint="DOCX / PDF" icon={<FileText size={15} />} tone="border-amber-400/25 bg-amber-400/10 text-amber-300" /></div><div className="grid gap-3 lg:grid-cols-2"><Card title="执行覆盖" hint="按 APP 状态"><div className="p-4"><div className="flex items-end justify-between"><span className="text-3xl font-bold text-jz-text-primary">{done}<span className="ml-1 text-xs font-normal text-jz-text-muted">/ {apps.length}</span></span><span className="text-xs text-jz-accent-cyan">{apps.length ? Math.round(done / apps.length * 100) : 0}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-jz-elevated/50"><div className="h-full bg-jz-accent-cyan" style={{ width: (apps.length ? Math.round(done / apps.length * 100) : 0) + '%' }} /></div><div className="mt-4 grid grid-cols-3 gap-2 text-center">{[['完成', done, 'text-emerald-300'], ['执行中', activeApps, 'text-amber-300'], ['失败', failed, 'text-red-300']].map(([k, v, c]) => <div key={String(k)} className="rounded-xl border border-jz-border/50 py-2"><div className={'text-lg font-bold ' + c}>{v}</div><div className="text-[10px] text-jz-text-muted">{k}</div></div>)}</div></div></Card><Card title="快捷入口" hint="继续项目工作"><div className="grid gap-2 p-4"><button className={ghost + ' justify-between'} onClick={() => setActive('reports')}><span className="flex gap-2"><FileText size={14} />生成 / 查看报告</span><ChevronRight size={14} /></button><button className={ghost + ' justify-between'} onClick={() => setActive('apps')}><span className="flex gap-2"><Layers3 size={14} />查看 APP 清单</span><ChevronRight size={14} /></button><button className={ghost + ' justify-between'} onClick={() => setActive('candidates')}><span className="flex gap-2"><Sparkles size={14} />核验候选</span><ChevronRight size={14} /></button><button className={ghost + ' justify-between'} onClick={() => setActive('runs')}><span className="flex gap-2"><Activity size={14} />执行记录</span><ChevronRight size={14} /></button></div></Card></div><div className="grid gap-3 lg:grid-cols-2"><Card title="最近报告" hint="最近产物" action={<button className={ghost + ' !px-2 !py-1'} onClick={() => setActive('reports')}>全部</button>}><div className="divide-y divide-jz-border/40">{reports.slice(0, 5).map((r) => <div key={r.id} className="flex items-center justify-between px-4 py-2 text-xs"><span className="truncate text-jz-text-primary">#{r.id} · {r.kind === 'portfolio' ? '项目总报告' : '单 APP'} · {templateText(r.template)}</span><span className={'rounded border px-1.5 py-0.5 text-[9px] ' + tone(r.status)}>{reportStatus(r.status)}</span></div>)}{!reports.length && <div className="px-4 py-8 text-center text-xs text-jz-text-muted">暂无报告</div>}</div></Card><Card title="最近执行" hint="批量执行" action={<button className={ghost + ' !px-2 !py-1'} onClick={() => setActive('runs')}>全部</button>}><div className="divide-y divide-jz-border/40">{runs.slice(0, 4).map((r) => <div key={r.id} className="flex items-center justify-between px-4 py-2 text-xs"><span className="text-jz-text-primary">#{r.id} · {statusText(r.status)}</span><span className="text-jz-text-muted">{r.succeeded}/{r.total} · {r.failed} 失败</span></div>)}{!runs.length && <div className="px-4 py-8 text-center text-xs text-jz-text-muted">暂无执行记录</div>}</div></Card></div></div>}
        {active === 'apps' && <div className="space-y-3"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Kpi label="APP 总数" value={apps.length} hint="清单" icon={<Layers3 size={15} />} /><Kpi label="已完成" value={done} hint="可生成报告" icon={<CheckCircle2 size={15} />} tone="border-emerald-400/25 bg-emerald-400/10 text-emerald-300" /><Kpi label="执行中" value={activeApps} hint="排队 / 运行" icon={<Activity size={15} />} tone="border-amber-400/25 bg-amber-400/10 text-amber-300" /><Kpi label="失败" value={failed} hint="可重试" icon={<AlertTriangle size={15} />} tone="border-red-400/25 bg-red-400/10 text-red-300" /></div><Card title="APP 清单" hint={filteredApps.length + ' / ' + apps.length + ' 条'} action={<div className="flex flex-wrap gap-2"><div className="relative"><Search size={13} className="absolute left-2 top-2 text-jz-text-muted" /><input className={input + ' !py-1 pl-6'} placeholder="搜索 APP / 包名" value={appQ} onChange={(e) => setAppQ(e.target.value)} /></div><select className={input + ' !py-1'} value={appStatus} onChange={(e) => setAppStatus(e.target.value)}><option value="all">状态</option>{Array.from(new Set(apps.map((a) => a.status).filter(Boolean))).map((s) => <option key={s} value={s}>{statusText(s)}</option>)}</select><select className={input + ' !py-1'} value={appTier} onChange={(e) => setAppTier(e.target.value)}><option value="all">归属</option>{Array.from(new Set(apps.map((a) => a.ownership_tier).filter(Boolean))).map((s) => <option key={s} value={s}>{s}</option>)}</select></div>}><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead className="bg-jz-elevated/25 text-jz-text-muted"><tr>{['APP', '包名', '版本', '品牌', '归属', '状态', '报告', ''].map((h) => <th key={h} className="px-3 py-2.5 text-left font-medium">{h}</th>)}</tr></thead><tbody>{shownApps.map((a) => <tr key={a.id} className="border-t border-jz-border/40"><td className="max-w-[160px] truncate px-3 py-2.5 text-jz-text-primary">{a.app_name || '—'}</td><td className="max-w-[240px] break-all px-3 py-2.5 font-mono text-[10px] text-jz-text-secondary">{a.package}</td><td className="px-3 py-2.5 text-jz-text-muted">{a.version || '—'}</td><td className="px-3 py-2.5 text-jz-text-muted">{a.brand || '—'}</td><td className="px-3 py-2.5 text-jz-text-muted">{a.ownership_tier || '—'}</td><td className="px-3 py-2.5"><span className={'rounded border px-1.5 py-0.5 text-[10px] ' + tone(a.status)}>{statusText(a.status)}</span></td><td className="px-3 py-2.5 text-[10px] text-jz-text-muted">{a.report_status ? reportStatus(a.report_status) : '未生成'}</td><td className="px-3 py-2.5 text-right"><button className={ghost + ' !px-2 !py-1'} disabled={!!busy || a.status !== 'done'} onClick={() => gen('app', a.id)}>单 APP 报告</button></td></tr>)}{!shownApps.length && <tr><td colSpan={8} className="py-14 text-center text-jz-text-muted">没有匹配的 APP。</td></tr>}</tbody></table></div><Pager page={appPage} pages={appPages} total={filteredApps.length} setPage={setAppPage} /></Card></div>}
        {active === 'candidates' && <div className="space-y-3"><Card title="发现候选" hint="公开源发现 → 核验 → 下载 / 导入"><div className="space-y-3 p-4"><div className="flex flex-wrap items-center gap-2"><input className={input + ' min-w-[220px] flex-1'} placeholder="指定包名（可选，逗号分隔）" value={seed} onChange={(e) => setSeed(e.target.value)} /><label className="flex items-center gap-1 text-[11px] text-jz-text-muted"><input type="checkbox" checked={aptoide} onChange={(e) => setAptoide(e.target.checked)} />Aptoide 分页</label><label className="flex items-center gap-1 text-[11px] text-jz-text-muted"><input type="checkbox" checked={play} onChange={(e) => setPlay(e.target.checked)} />Play 开发者页</label><label className="flex items-center gap-1 text-[11px] text-jz-text-muted"><input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} />AI 解析</label><button className={primary} disabled={busy === 'discover'} onClick={discover}>{busy === 'discover' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}发现候选</button></div><textarea className={input + ' min-h-[56px] w-full resize-y'} placeholder="官方应用清单 / 客户授权清单（包名或应用清单）" value={catalog} onChange={(e) => setCatalog(e.target.value)} /><div className="flex flex-wrap items-center gap-2 border-t border-jz-border/50 pt-3"><span className="text-[11px] text-jz-text-muted">已选 {selected.size}</span><button className={ghost} disabled={!selected.size || !!busy} onClick={() => batch('verify')}>核验</button><button className={ghost} disabled={!selected.size || !!busy} onClick={() => batch('download')}>下载</button><button className={primary} disabled={!selected.size || !!busy} onClick={() => batch('import')}>导入项目</button></div></div></Card><Card title="候选列表" hint={filteredCands.length + ' / ' + candidates.length} action={<div className="flex gap-2"><div className="relative"><Search size={13} className="absolute left-2 top-2 text-jz-text-muted" /><input className={input + ' !py-1 pl-6'} placeholder="搜索候选" value={candQ} onChange={(e) => setCandQ(e.target.value)} /></div><select className={input + ' !py-1'} value={candStatus} onChange={(e) => setCandStatus(e.target.value)}><option value="all">状态</option>{Array.from(new Set(candidates.map((c) => c.status).filter(Boolean))).map((s) => <option key={s} value={s}>{candText(s)}</option>)}</select></div>}><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-[10px]"><thead className="bg-jz-elevated/25 text-jz-text-muted"><tr>{['', 'APP / 包名', '开发者', '来源', '归属', '置信度', '状态', ''].map((h) => <th key={h} className="px-2 py-2.5 text-left font-medium">{h}</th>)}</tr></thead><tbody>{shownCands.map((c) => <tr key={c.id} className="border-t border-jz-border/40"><td className="px-2 py-2"><input type="checkbox" checked={selected.has(c.id)} onChange={(e) => setSelected((p) => { const n = new Set(p); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} /></td><td className="px-2 py-2"><div className="truncate text-jz-text-primary">{c.app_name || '—'}</div><div className="break-all font-mono text-[9px] text-jz-text-muted">{c.package}</div></td><td className="px-2 py-2 text-jz-text-muted">{c.developer || '—'}</td><td className="px-2 py-2 text-jz-text-muted">{c.source || '—'}</td><td className="px-2 py-2 text-jz-text-muted">{c.ownership_tier || '—'}</td><td className="px-2 py-2 text-jz-text-muted">{Math.round((c.confidence || 0) * 100)}%</td><td className="px-2 py-2"><span className={'rounded border px-1.5 py-0.5 text-[9px] ' + tone(c.status)}>{candText(c.status)}</span></td><td className="px-2 py-2">{c.source_url ? <a className={ghost + ' !px-2 !py-1'} href={c.source_url} target="_blank" rel="noreferrer">打开</a> : '—'}</td></tr>)}{!shownCands.length && <tr><td colSpan={8} className="py-14 text-center text-jz-text-muted">没有候选，点“发现候选”。</td></tr>}</tbody></table></div><Pager page={candPage} pages={candPages} total={filteredCands.length} setPage={setCandPage} /></Card></div>}
        {active === 'runs' && <Card title="执行记录" hint="每次批量执行的进度与结果" action={<button className={ghost} onClick={load}><RefreshCw size={13} />刷新</button>}><div className="grid grid-cols-2 gap-2 border-b border-jz-border/50 p-4 sm:grid-cols-4">{[["批次",runs.length],["成功 APP",runs.reduce((n,r)=>n+(r.succeeded||0),0)],["失败 APP",runs.reduce((n,r)=>n+(r.failed||0),0)],["跳过",runs.reduce((n,r)=>n+(r.skipped||0),0)]].map(([k,v]) => <div key={String(k)} className="rounded-xl border border-jz-border/50 bg-jz-elevated/15 px-3 py-2"><div className="text-[10px] text-jz-text-muted">{k}</div><div className="mt-0.5 text-lg font-bold text-jz-text-primary">{v}</div></div>)}</div><div className="divide-y divide-jz-border/40">{runs.map((r) => { const pct = r.total ? Math.round(r.succeeded / r.total * 100) : 0; return <div key={r.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_180px_60px] sm:items-center"><div><div className="flex items-center gap-2 text-xs font-semibold text-jz-text-primary">#{r.id}<span className={'rounded border px-1.5 py-0.5 text-[9px] ' + tone(r.status)}>{statusText(r.status)}</span></div><div className="mt-1 text-[10px] text-jz-text-muted">{r.succeeded} 成功 · {r.failed} 失败 · {r.skipped} 跳过 / 共 {r.total}</div></div><div className="h-1.5 overflow-hidden rounded-full bg-jz-elevated/50"><div className="h-full bg-jz-accent-cyan" style={{ width: pct + '%' }} /></div><div className="text-right text-[10px] text-jz-text-muted">{pct}%</div></div>; })}{!runs.length && <div className="py-16 text-center text-xs text-jz-text-muted">还没有执行记录。</div>}</div><div className="grid gap-3 border-t border-jz-border/50 p-4 sm:grid-cols-3"><div className="rounded-xl border border-jz-border/50 bg-jz-elevated/15 p-3"><div className="text-[10px] font-semibold text-jz-text-secondary">执行策略</div><div className="mt-1 text-[10px] leading-4 text-jz-text-muted">并发 2 · 模板技术证据版</div></div><div className="rounded-xl border border-jz-border/50 bg-jz-elevated/15 p-3"><div className="text-[10px] font-semibold text-jz-text-secondary">失败处理</div><div className="mt-1 text-[10px] leading-4 text-jz-text-muted">保留失败 APP，可重新勾选执行</div></div><div className="rounded-xl border border-jz-border/50 bg-jz-elevated/15 p-3"><div className="text-[10px] font-semibold text-jz-text-secondary">产物</div><div className="mt-1 text-[10px] leading-4 text-jz-text-muted">逐 APP 报告 / 项目总报告</div></div></div></Card>}
      </div>
    </div>
  );
};
