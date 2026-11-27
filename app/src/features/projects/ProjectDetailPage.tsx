// The one project detail shell: /projects/:pid?tab=overview|reports|apps|candidates|runs. It replaces the company
// project detail and the project sessions page. Every endpoint is its own resource, so each tab loads and fails
// independently; the shell only needs the project's identity, which it takes from the overview endpoint or, when
// that fails, from the project list.
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Play, Plus, RefreshCw, Upload } from 'lucide-react';
import { api, getToken } from '@/services/api';
import {
  Button, ConfirmDialog, EmptyState, IconButton, ErrorState, InlineAlert, Page, PageHeader, Panel, PermissionState, Readout, SkeletonLoader,
  StaleNotice, Tabs, Tag, useScrolledPast,
} from '@/components/ui';
import { PATHS, moduleLabel } from '@/layout/navigation';
import { useCrumbName } from '@/layout/breadcrumb';
import { NewProjectWizard } from '@/features/pentest/NewProjectWizard';
import { TABS, TAB_LABEL, isLive, kindLabel, parseBrands, reportStatus, templateText } from './projectModel';
import type { AppRow, BatchRun, CandidateRow, ProjectEntity, ReportRow, SessionItem, TabKey } from './projectModel';
import { errStatus, errText, useResource } from './useResource';
import { downloadProjectReport } from '@/features/reports/reportScopes';
import type { Resource } from './useResource';
import { OverviewTab } from './tabs/OverviewTab';
import { ReportsTab } from './tabs/ReportsTab';
import { AppsTab } from './tabs/AppsTab';
import { CandidatesTab } from './tabs/CandidatesTab';
import { RunsTab } from './tabs/RunsTab';

/** What the shell hands to every tab: the project, its resources, and the actions that are shared between tabs. */
export interface ProjectCtx {
  id: number;
  project: ProjectEntity;
  brands: string[];
  apps: Resource<AppRow[]>;
  candidates: Resource<CandidateRow[]>;
  reports: Resource<ReportRow[]>;
  runs: Resource<BatchRun[]>;
  sessions: Resource<SessionItem[]>;
  /** Key of the action in flight ('' when idle); actions disable each other while one runs. */
  busy: string;
  setBusy: (k: string) => void;
  /** Report the outcome of an action in the page-level message line. */
  say: (text: string, bad?: boolean) => void;
  template: string;
  setTemplate: (t: string) => void;
  /** Report option shared by the project report and the single-app reports. */
  useLlm: boolean;
  setUseLlm: (v: boolean) => void;
  goTab: (t: TabKey) => void;
  pickFiles: () => void;
  askRun: () => void;
  newSession: () => void;
  openSession: (sid: number) => void;
  download: (rid: number, format: 'docx' | 'pdf') => Promise<void>;
}

export const ProjectDetailPage: React.FC = () => {
  const nav = useNavigate();
  const id = Number(useParams().pid || 0);
  const [params, setParams] = useSearchParams();
  const tab: TabKey = (TABS as string[]).includes(params.get('tab') || '') ? (params.get('tab') as TabKey) : 'overview';
  const goTab = (t: TabKey) => setParams((prev) => { const n = new URLSearchParams(prev); if (t === 'overview') n.delete('tab'); else n.set('tab', t); return n; }, { replace: true });

  const base = id ? `/api/pentest/projects/${id}` : null;
  const list = useResource<ProjectEntity[]>(id ? '/api/pentest/projects' : null, (r) => (Array.isArray(r) ? r : []));
  const overview = useResource<ProjectEntity | null>(base && `${base}/overview`, (r) => r?.project ?? null);
  const apps = useResource<AppRow[]>(base && `${base}/apps`, (r) => r?.apps || []);
  const candidates = useResource<CandidateRow[]>(base && `${base}/candidates`, (r) => r?.candidates || []);
  const reports = useResource<ReportRow[]>(base && `${base}/reports`, (r) => r?.reports || []);
  const runs = useResource<BatchRun[]>(base && `${base}/runs`, (r) => r?.runs || []);
  const sessions = useResource<SessionItem[]>(base && `${base}/sessions`, (r) => r?.sessions || []);
  const all = [list, overview, apps, candidates, reports, runs, sessions];
  const reloadAll = () => Promise.all(all.map((r) => r.reload()));

  const project = overview.data ?? list.data?.find((p) => p.id === id) ?? null;
  useCrumbName(id ? PATHS.project(id) : null, project?.name);

  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [template, setTemplate] = useState('technical');
  const [useLlm, setUseLlm] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [wizard, setWizard] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const say = (text: string, bad?: boolean) => setMsg({ text, bad });

  // ?new=1 (set by the create dialog for a single-app project) opens the session wizard once.
  useEffect(() => {
    if (params.get('new') !== '1' || !project) return;
    setWizard(true);
    setParams((prev) => { const n = new URLSearchParams(prev); n.delete('new'); return n; }, { replace: true });
  }, [params, project, setParams]);

  const [headRef, pastHead] = useScrolledPast<HTMLDivElement>();
  // The tab bar sticks to the top of the page scroller; reserve its height as scroll padding so keyboard focus and
  // in-page scrolling never land underneath it.
  const [stickyEl, bindSticky] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const scroller = stickyEl?.closest<HTMLElement>('[data-project-detail]');
    if (!stickyEl || !scroller) return;
    const apply = () => { scroller.style.scrollPaddingTop = `${stickyEl.offsetHeight + 8}px`; };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(stickyEl);
    return () => { ro.disconnect(); scroller.style.scrollPaddingTop = ''; };
  }, [stickyEl]);

  // The same request as before, now shared with /reports (reportScopes.downloadProjectReport).
  const download = async (rid: number, format: 'docx' | 'pdf') => {
    const res = await downloadProjectReport(id, rid, format);
    if (!res.ok) say('下载失败：' + res.status, true);
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true); setMsg(null);
    try {
      const rows: any[] = [];
      for (const f of Array.from(files)) {
        const fd = new FormData(); fd.append('file', f);
        const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + (getToken() || '') }, body: fd });
        if (!res.ok) throw new Error('上传失败 ' + f.name);
        const up = await res.json();
        rows.push({ apk_path: up.apk_path, app_name: f.name.replace(/\.(apk|xapk)$/i, '') });
      }
      await api(`/api/pentest/projects/${id}/apps`, { method: 'POST', body: JSON.stringify({ apps: rows }) });
      say(`已导入 ${rows.length} 个 APK。`);
      await Promise.all([apps.reload(), overview.reload()]);
    } catch (e: any) { say(String(e?.message || e), true); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const run = async () => {
    setBusy('run'); setMsg(null);
    try {
      const r = await api<any>(`/api/pentest/projects/${id}/run`, { method: 'POST', body: JSON.stringify({ concurrency: 2, template }) });
      say(`已入队 ${r.queued} 个应用。`);
      goTab('runs');
      await Promise.all([runs.reload(), apps.reload()]);
    } catch (e: any) { say('执行失败：' + (e?.message || e), true); } finally { setBusy(''); }
  };

  const back = <Link to={PATHS.projects} className="inline-flex items-center gap-1 hover:text-jz-ink"><ArrowLeft size={14} aria-hidden />{moduleLabel('/projects')}</Link>;
  const hooks = { 'data-project-detail': id, 'data-company-project-detail': '', 'data-project-sessions': '' };

  if (!project) {
    const settled = !overview.loading && !list.loading;
    const err = overview.error || list.error;
    const st = errStatus(overview.error) || errStatus(list.error);
    return (
      <Page {...hooks}>
        <PageHeader eyebrow={back} title={settled ? `项目 #${id}` : '正在加载项目'} />
        {!settled ? <><SkeletonLoader variant="metrics" /><SkeletonLoader variant="table" rows={6} /></> : (
          <Panel>
            {st === 401 || st === 403 ? <PermissionState />
              : err ? <ErrorState message={errText(err)} onRetry={reloadAll} />
              : <EmptyState title="没有找到这个项目" cause="项目可能已被移除，或编号不正确。" action={<Link to={PATHS.projects} className="text-label font-medium text-jz-brand hover:underline">返回项目</Link>} />}
          </Panel>
        )}
      </Page>
    );
  }

  const brands = parseBrands(project.brands);
  const appRows = apps.data ?? [];
  const done = appRows.filter((x) => x.status === 'done').length;
  const failed = appRows.filter((x) => x.status === 'failed').length;
  const active = appRows.filter((x) => x.status === 'running' || x.status === 'queued').length;
  const pct = appRows.length ? Math.round((done / appRows.length) * 100) : 0;
  const latest = reports.data?.[0];
  const liveN = (sessions.data ?? []).filter((x) => isLive(x.status)).length;
  const stale = all.filter((r) => r.stale);
  const n = (r: Resource<unknown[]>) => (r.data ? r.data.length : r.error ? '—' : '…');
  const runDisabled = !appRows.length;

  const ctx: ProjectCtx = {
    id, project, brands, apps, candidates, reports, runs, sessions, busy, setBusy, say, template, setTemplate, useLlm, setUseLlm, goTab, download,
    pickFiles: () => fileRef.current?.click(), askRun: () => setConfirmRun(true), newSession: () => setWizard(true),
    openSession: (sid) => nav(PATHS.session(id, sid)),
  };

  return (
    <Page {...hooks}>
      <div ref={headRef} className="flex flex-col gap-4">
        <PageHeader eyebrow={back} title={project.name || '项目'}
          meta={<>
            <span className="font-mono">#{project.id}</span>
            <Tag>{kindLabel(project)}</Tag>
            {(project.kind === 'company' || project.company_name) && <span>{project.company_name || '未填写公司'}</span>}
            {brands.length > 0 && <span>{brands.join(' / ')}</span>}
            {project.note && <span className="min-w-0 max-w-md truncate" title={project.note}>{project.note}</span>}
          </>}
          actions={<>
            <input ref={fileRef} type="file" multiple accept=".apk,.xapk" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => upload(e.target.files)} />
            <IconButton label="刷新" variant="secondary" disabled={all.some((r) => r.refreshing)} onClick={reloadAll}><RefreshCw size={16} aria-hidden /></IconButton>
            <Button variant="secondary" icon={<Upload size={16} aria-hidden />} loading={uploading} onClick={ctx.pickFiles} data-company-upload>导入 APK</Button>
            <Button variant={runDisabled ? 'primary' : 'secondary'} icon={<Plus size={16} aria-hidden />} onClick={ctx.newSession} data-new-session>新建会话</Button>
            <Button variant={runDisabled ? 'secondary' : 'primary'} icon={<Play size={16} aria-hidden />} loading={busy === 'run'} disabled={runDisabled} onClick={ctx.askRun}
              title={runDisabled ? '清单里还没有应用' : undefined} data-company-run>批量执行</Button>
          </>} />
        <div data-company-context>
          <Readout label="项目状态" cells={[
            { label: '应用', value: n(apps) },
            { label: '评估完成', value: apps.data ? `${done}/${appRows.length}` : n(apps), hint: apps.data && appRows.length ? `${pct}%` : undefined },
            { label: '执行中', value: apps.data ? active : n(apps) },
            { label: '失败', value: apps.data ? failed : n(apps) },
            { label: '报告', value: n(reports), hint: latest ? `最近 #${latest.id} ${reportStatus(latest.status)}` : undefined },
            { label: '会话', value: n(sessions), hint: liveN ? `进行中 ${liveN}` : undefined },
          ]} />
        </div>
      </div>

      {stale.length > 0 && <StaleNotice reason={'刷新失败：' + errText(stale[0].error)} onRefresh={reloadAll} />}
      {msg && (
        <InlineAlert tone={msg.bad ? 'danger' : 'success'} data-company-msg
          action={<Button size="sm" variant="ghost" onClick={() => setMsg(null)}>关闭</Button>}>{msg.text}</InlineAlert>
      )}

      {/* Context stays visible while scrolling: the tab bar sticks, and once the header is out of view it carries the project name and the primary action. */}
      <div ref={bindSticky} className="sticky top-0 z-10 -mx-jz-page -mt-2 bg-jz-canvas px-jz-page pt-1" data-company-sticky={pastHead ? 'compact' : 'full'}>
        <div className="flex min-w-0 items-center gap-4 border-b border-jz-border">
          {pastHead && (
            <div className="hidden min-w-0 max-w-xs flex-none items-center gap-2 lg:flex" data-company-sticky-title>
              <span className="truncate text-label font-semibold text-jz-ink">{project.name}</span>
              <Tag>{kindLabel(project)}</Tag>
            </div>
          )}
          <Tabs<TabKey> label="项目内容" value={tab} onChange={goTab} className="min-w-0 flex-1 border-b-0" items={TABS.map((k) => ({
            key: k, label: TAB_LABEL[k], dataAttrs: { 'data-company-tab': k, 'data-project-tab': k },
            count: k === 'reports' ? reports.data?.length : k === 'apps' ? apps.data?.length : k === 'candidates' ? candidates.data?.length
              : k === 'runs' ? sessions.data?.length : undefined,
          }))} />
          {pastHead && !runDisabled && (
            <Button size="sm" className="hidden flex-none lg:inline-flex" icon={<Play size={14} aria-hidden />} loading={busy === 'run'}
              onClick={ctx.askRun} data-company-sticky-run>批量执行</Button>
          )}
        </div>
      </div>

      <div role="tabpanel" aria-label={TAB_LABEL[tab]} data-project-panel={tab} className="flex min-w-0 flex-col gap-4">
        {tab === 'overview' && <OverviewTab ctx={ctx} />}
        {tab === 'reports' && <ReportsTab ctx={ctx} />}
        {tab === 'apps' && <AppsTab ctx={ctx} />}
        {tab === 'candidates' && <CandidatesTab ctx={ctx} />}
        {tab === 'runs' && <RunsTab ctx={ctx} />}
      </div>

      {wizard && (
        <NewProjectWizard pid={id} hostName={project.name || undefined}
          onClose={(sid, newPid) => { setWizard(false); if (sid) nav(PATHS.session(newPid ?? id, sid)); }} />
      )}
      <ConfirmDialog open={confirmRun} destructive={false} title="批量执行评估" confirmLabel="开始执行"
        outcome="执行开始后可以在“执行”标签里查看进度。"
        onCancel={() => setConfirmRun(false)} onConfirm={() => { setConfirmRun(false); run(); }}>
        将为清单内的应用排队执行评估，当前清单有 {appRows.length} 个应用，并发 2，模板为{templateText(template)}。
      </ConfirmDialog>
    </Page>
  );
};

export default ProjectDetailPage;
