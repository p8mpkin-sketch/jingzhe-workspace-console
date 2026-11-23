// The one project index: /projects?scope=all|company|single. It replaces the company project index and the
// assessment project index; both read the same list, so this page issues the union of their requests and nothing new.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Download, FileJson, FileSpreadsheet, FileText, FileUp, FolderKanban, LayoutGrid, Plus, RefreshCw, SearchX, Table2 } from 'lucide-react';
import { api } from '@/services/api';
import { listProjects } from '@/services/pentestService';
import { usePentest } from '@/stores/pentest';
import {
  AsyncBoundary, Button, DataToolbar, EmptyState, MenuItem, Page, PageHeader, Popover, Readout, SearchField, SegmentedControl, Select,
  StaleNotice, StatusBadge, Tabs, UniversalImportModal, cx, exportDataFile, stateOf, toast, useViewPreference,
} from '@/components/ui';
import type { ExportFormat, UniversalImportResult } from '@/components/ui';
import { PATHS, moduleLabel } from '@/layout/navigation';
import { NewProjectWizard } from '@/features/pentest/NewProjectWizard';
import { ProjectCreateDialog } from './ProjectCreateDialog';
import { ProjectTable } from './ProjectTable';
import {
  ACTIVE_STATES, SCOPES, SCOPE_LABEL, buildRows, fmtTime, isLive, isPacked, packerLabel, packerText, pickPrimary, progOf,
} from './projectModel';
import type { ApTruth, FlatSession, ProjectEntity, ProjectRow, Scope, SevSummary } from './projectModel';

type SortKey = 'active' | 'recent' | 'sessions' | 'progress' | 'apps' | 'name';
const SORT_LABEL: Record<SortKey, string> = { active: '最近活跃', recent: '最近创建', sessions: '会话最多', progress: '进度最高', apps: '应用最多', name: '按名称' };
const RISKS: Array<{ key: 'all' | 'high' | 'medium' | 'clean'; label: string; title: string }> = [
  { key: 'all', label: '全部', title: '不按风险发现筛选' },
  { key: 'high', label: '有高危', title: '严重与高危的未关闭风险发现数大于 0' },
  { key: 'medium', label: '仅中危', title: '有中危未关闭风险发现，且没有严重或高危' },
  { key: 'clean', label: '无发现', title: '严重、高危、中危的未关闭风险发现数都为 0' },
];
const riskOf = (r: ProjectRow): 'high' | 'medium' | 'clean' =>
  r.sevAgg.critical + r.sevAgg.high > 0 ? 'high' : r.sevAgg.medium > 0 ? 'medium' : 'clean';
const stored = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };

const FilterChip: React.FC<{
  active: boolean; onClick: () => void; title?: string; count?: number; dataAttrs?: Record<string, string | number | undefined>; children: React.ReactNode;
}> = ({ active, onClick, title, dataAttrs, count, children }) => (
  <button type="button" onClick={onClick} title={title} aria-pressed={active} data-active={active ? '1' : ''} {...(dataAttrs || {})}
    className={cx('inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-tag border px-2 text-meta transition-colors duration-fast max-[760px]:h-9',
      active ? 'border-jz-brand bg-jz-brand-soft font-medium text-jz-brand' : 'border-jz-border text-jz-ink-2 hover:border-jz-border-strong hover:text-jz-ink')}>
    {children}
    {count != null && <span className="font-mono tnum">{count}</span>}
  </button>
);
const FilterGroup: React.FC<{ label: string; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>> = ({ label, children, ...rest }) => (
  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label} {...rest}>
    <span className="jz-eyebrow mr-0.5">{label}</span>
    {children}
  </div>
);

const STEPS = [
  ['确定范围', '新建项目并选择类型：公司级以一家公司或集团为范围，单应用围绕一个应用。'],
  ['建立清单或会话', '公司级项目导入应用清单或确认候选应用；单应用项目选择应用和设备建立会话。'],
  ['评估与报告', '执行评估，复核风险发现，再生成单应用报告或项目总报告。'],
] as const;
const textLink = 'inline-flex h-8 items-center gap-1 rounded-control px-2 text-label font-medium text-jz-brand hover:bg-jz-brand-soft max-[760px]:h-jz-touch';

export const ProjectsPage: React.FC = () => {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const scope: Scope = (SCOPES as string[]).includes(params.get('scope') || '') ? (params.get('scope') as Scope) : 'all';
  const setScope = (s: Scope) => setParams((prev) => { const n = new URLSearchParams(prev); if (s === 'all') n.delete('scope'); else n.set('scope', s); return n; }, { replace: true });

  const [projects, setProjects] = useState<ProjectEntity[] | null>(null);
  const [sessions, setSessions] = useState<FlatSession[] | null>(null);
  const [sev, setSev] = useState<SevSummary | null>(null);
  const [apTruth, setApTruth] = useState<Record<number, ApTruth | undefined>>({});
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const devices = usePentest((s) => s.devices); // written by the shell's single device poll; no second request here

  const [createOpen, setCreateOpen] = useState(false);
  const [wizardPid, setWizardPid] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [q, setQ] = useState('');
  const [riskF, setRiskF] = useState<'all' | 'high' | 'medium' | 'clean'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('active');
  const [view, setView] = useViewPreference<'cards' | 'table'>('projects', 'table', ['cards', 'table']);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  // Packer and status chips persist (keys unchanged). A restored value that no longer exists falls back to "all".
  const [packerF, setPackerF] = useState<string>(() => stored('apksec-ws-ov-packer'));
  const [statusF, setStatusF] = useState<string>(() => stored('apksec-ws-ov-status'));
  useEffect(() => { try { localStorage.setItem('apksec-ws-ov-packer', packerF); } catch { /* preference only */ } }, [packerF]);
  useEffect(() => { try { localStorage.setItem('apksec-ws-ov-status', statusF); } catch { /* preference only */ } }, [statusF]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    // Sessions and open-finding counts enrich the rows; when either fails the list still renders without them.
    api<FlatSession[]>('/api/pentest/sessions?limit=500').then((d) => setSessions(d || [])).catch(() => setSessions((cur) => cur ?? []));
    api<SevSummary>('/api/pentest/vulns/severity-summary').then(setSev).catch(() => setSev((cur) => cur));
    try {
      setProjects((await listProjects()) as ProjectEntity[]);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e ?? new Error('加载失败'));
      setProjects((cur) => cur ?? null);
    } finally { setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Step progress of each project's most recent session (existing read-only endpoint, one call per project).
  useEffect(() => {
    (projects ?? []).forEach((p) => {
      api<{ sessions?: { id: number; status: string; step: number; total_steps: number; progress_state?: ApTruth['pstate'] }[] }>(`/api/pentest/projects/${p.id}/sessions`)
        .then((d) => {
          const s0 = (d.sessions ?? [])[0];
          if (s0) setApTruth((m) => ({ ...m, [p.id]: { sid: s0.id, step: s0.step ?? 0, total: s0.total_steps ?? 0, running: ACTIVE_STATES.has(s0.status), pstate: s0.progress_state } }));
        })
        .catch(() => {});
    });
  }, [projects]);

  const online = useMemo(() => new Set((devices ?? []).map((d) => d.serial)), [devices]);
  const rows = useMemo<ProjectRow[] | null>(() => (projects && sessions ? buildRows(projects, sessions, online, apTruth, sev) : null), [projects, sessions, online, apTruth, sev]);
  const scoped = useMemo(() => (rows ?? []).filter((r) => scope === 'all' || r.scope === scope), [rows, scope]);
  const scopeCount = useMemo(() => ({ all: (rows ?? []).length, company: (rows ?? []).filter((r) => r.scope === 'company').length, single: (rows ?? []).filter((r) => r.scope === 'single').length }), [rows]);

  // Each project falls in exactly one class per dimension, so the chip counts add up to the scope total.
  const classCounts = (key: 'packerKey' | 'statusKey') => {
    const m = new Map<string, number>();
    scoped.forEach((r) => m.set(r[key], (m.get(r[key]) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const packerOptions = useMemo(() => classCounts('packerKey'), [scoped]); // eslint-disable-line react-hooks/exhaustive-deps
  const statusOptions = useMemo(() => classCounts('statusKey'), [scoped]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!rows) return;
    if (packerF && !packerOptions.some(([k]) => k === packerF)) setPackerF('');
    if (statusF && !statusOptions.some(([k]) => k === statusF)) setStatusF('');
  }, [packerF, statusF, packerOptions, statusOptions, rows]);
  const riskCounts = useMemo(() => ({
    all: scoped.length, high: scoped.filter((r) => riskOf(r) === 'high').length,
    medium: scoped.filter((r) => riskOf(r) === 'medium').length, clean: scoped.filter((r) => riskOf(r) === 'clean').length,
  }), [scoped]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return scoped.filter((r) => {
      if (packerF && r.packerKey !== packerF) return false;
      if (statusF && r.statusKey !== statusF) return false;
      if (riskF !== 'all' && riskOf(r) !== riskF) return false;
      if (!kw) return true;
      return [r.p.name, r.p.note, r.p.company_name, r.p.brands, r.primary?.package, r.primary?.app_name, `#${r.p.id}`]
        .map((v) => (v ?? '').toLowerCase()).join(' ').includes(kw);
    });
  }, [scoped, q, packerF, statusF, riskF]);
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const ts = (r: ProjectRow) => r.latestTs ?? 0;
    if (sortKey === 'sessions') arr.sort((a, b) => b.ps.length - a.ps.length || ts(b) - ts(a));
    else if (sortKey === 'progress') arr.sort((a, b) => progOf(b.ap) - progOf(a.ap) || ts(b) - ts(a));
    else if (sortKey === 'apps') arr.sort((a, b) => b.apps - a.apps || b.p.id - a.p.id);
    else if (sortKey === 'name') arr.sort((a, b) => a.p.name.localeCompare(b.p.name, 'zh-CN'));
    else if (sortKey === 'recent') arr.sort((a, b) => b.p.id - a.p.id);
    else arr.sort((a, b) => ts(b) - ts(a) || b.p.id - a.p.id);
    return arr;
  }, [filtered, sortKey]);
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const paged = useMemo(() => sorted.slice((safePage - 1) * pageSize, safePage * pageSize), [sorted, safePage, pageSize]);
  useEffect(() => { setPage(1); }, [q, packerF, statusF, riskF, pageSize, sortKey, scope]);

  const kpi = useMemo(() => {
    const all = rows ?? [];
    const aps = all.map((r) => r.ap).filter(Boolean) as ApTruth[];
    return {
      total: all.length,
      running: all.filter((r) => r.statusKey !== 'closed').length,
      done: all.filter((r) => r.statusKey === 'closed').length,
      apps: all.reduce((n, r) => n + r.apps, 0),
      withApps: all.filter((r) => r.apps > 0).length,
      pkgUnion: new Set(all.flatMap((r) => r.packages)).size,
      packed: all.filter((r) => isPacked(r.packerKey)).length,
      sessions: all.reduce((n, r) => n + r.ps.length, 0),
      avgProg: aps.length ? Math.round(aps.reduce((n, a) => n + progOf(a), 0) / aps.length) : null,
      high: all.reduce((n, r) => n + r.sevAgg.critical + r.sevAgg.high, 0),
    };
  }, [rows]);
  const lead = useMemo(() => pickPrimary(projects ?? []), [projects]);

  // Sessions to continue: running or waiting for sign-in; if none is, the newest open one by id.
  const activeSessions = useMemo(() => {
    const own = (sessions ?? []).filter((x) => x.project_id != null && x.status !== 'closed');
    const nameOf = (pid: number | null) => (projects ?? []).find((p) => p.id === pid)?.name || '';
    const live = own.filter((x) => isLive(x.status)).sort((a, b) => b.id - a.id).slice(0, 3);
    const pick = live.length ? live : [...own].sort((a, b) => b.id - a.id).slice(0, 1);
    return pick.map((x) => ({ s: x, live: live.length > 0, project: nameOf(x.project_id) }));
  }, [sessions, projects]);

  const doExport = (id: string) => {
    const out = filtered.map((r) => ({
      项目ID: r.p.id, 项目名: r.p.name, 会话数: r.ps.length, 主档包名: r.primary?.package || '', 壳: packerLabel(r.packerKey), 状态: r.statusKey,
      Critical: r.sevAgg.critical, High: r.sevAgg.high, Medium: r.sevAgg.medium, 进展: r.ap ? `${r.ap.step}/${r.ap.total}` : '', 完成度: `${progOf(r.ap)}%`,
      运行态: r.ap?.running ? 'running' : 'idle', 覆盖包名: r.packages.join(' '), 最近活跃: fmtTime(r.latestTs), 创建时间: fmtTime(r.p.created_at),
      类型: SCOPE_LABEL[r.scope], 公司: r.p.company_name || '', 清单应用: r.apps,
    }));
    const cols = out.length ? Object.keys(out[0])
      : ['项目ID', '项目名', '会话数', '主档包名', '壳', '状态', 'Critical', 'High', 'Medium', '进展', '完成度', '运行态', '覆盖包名', '最近活跃', '创建时间', '类型', '公司', '清单应用'];
    exportDataFile('pentest_projects_summary', id as ExportFormat, out, { columns: cols, title: '项目汇总（当前筛选结果）' });
  };

  // Import creates projects through the existing POST (name required). Rows whose name already exists are skipped.
  const importing = useRef(false);
  const handleImport = async (res: UniversalImportResult) => {
    if (importing.current) return;
    importing.current = true;
    try {
      const existing = new Set((projects ?? []).map((p) => (p.name || '').trim()));
      const fresh = res.rows.filter((r) => { const n = String(r.name || '').trim(); return n && !existing.has(n); });
      const skipped = res.rows.length - fresh.length;
      let okN = 0;
      const fails: string[] = [];
      for (const r of fresh) {
        const name = String(r.name).trim();
        const pkg = String(r.package || '').trim();
        const note = [String(r.note || '').trim(), pkg ? `导入包名: ${pkg}` : ''].filter(Boolean).join(' ; ');
        try { await api('/api/pentest/projects', { method: 'POST', body: JSON.stringify({ name, note }) }); okN += 1; }
        catch (e: any) { fails.push(`${name}: ${e?.message || '创建失败'}`); }
      }
      setImportOpen(false);
      if (okN > 0) setProjects((await listProjects()) as ProjectEntity[]);
      const line = `导入完成：新建 ${okN} 个项目，跳过重名或缺名 ${skipped} 行${fails.length ? `，失败 ${fails.length} 个（第一个：${fails[0]}）` : ''}`;
      if (fails.length) toast.err(line); else toast.ok(line);
    } finally { importing.current = false; }
  };

  const loaded = !!projects;
  const ready = !!rows;
  const dash = !!loadErr && !loaded;
  const filtering = !!q.trim() || !!packerF || !!statusF || riskF !== 'all';
  const resetFilters = () => { setQ(''); setPackerF(''); setStatusF(''); setRiskF('all'); };
  const num = (v: React.ReactNode, probe?: string) => <span data-probe={probe}>{!ready ? (dash ? '—' : '…') : v}</span>;
  const none = loaded && !loadErr && (projects?.length ?? 0) === 0;

  return (
    <Page data-projects data-company-projects data-pentest-projects>
      <PageHeader title={moduleLabel('/projects')}
        description="全部项目在这一个索引里：公司级项目维护应用清单和批量评估，单应用项目围绕一个应用的评估会话。"
        actions={(
          <div className="flex flex-wrap items-center gap-2" data-toolbar-actions>
            <Button variant="secondary" icon={<FileUp size={16} aria-hidden />} onClick={() => setImportOpen(true)} data-toolbar-import
              title="从 JSON 或 CSV 文件批量创建项目">导入项目</Button>
            <ExportMenu onExport={doExport} />
            <Button variant="secondary" icon={<RefreshCw size={16} aria-hidden />} loading={refreshing} onClick={() => load(true)}>刷新</Button>
            <Button icon={<Plus size={16} aria-hidden />} onClick={() => setCreateOpen(true)} data-company-create data-newproject-btn data-toolbar-create>新建项目</Button>
          </div>
        )} />

      {!!loadErr && loaded && <StaleNotice reason={'刷新失败：' + (loadErr instanceof Error ? loadErr.message : String(loadErr))} onRefresh={() => load(true)} refreshing={refreshing} />}

      <div data-overview-bar data-company-portfolio>
        <Readout label="项目概况" cells={[
          { label: '项目', value: num(kpi.total, 'stat-projects-total'), title: '项目按编号去重计数。进行中：最近会话未归档；已完成：最近会话已归档。',
            hint: <span data-probe="stat-running-projects">进行中 {kpi.running} · 已完成 {kpi.done}</span> },
          { label: '清单应用', value: num(kpi.apps), title: '全部项目应用清单内的应用数。', hint: `已有清单 ${kpi.withApps}/${kpi.total}` },
          { label: '会话', value: num(kpi.sessions, 'stat-sessions-total'), title: '项目关联的会话数。完成率：各项目最近会话的步骤完成度平均值。',
            hint: `平均完成率 ${kpi.avgProg == null ? '—' : kpi.avgProg + '%'}` },
          { label: '会话覆盖应用', value: num(kpi.pkgUnion, 'stat-covered-apps'), title: '全部项目会话的包名去重计数。已加固：最近会话识别到加固的项目数。', hint: `已加固项目 ${kpi.packed}` },
          { label: '在线设备', value: <span data-probe="stat-devices">{devices.length}</span>, title: `在线设备：${devices.map((d) => d.serial).join(', ') || '无'}。数量与导航栏的设备入口一致。` },
          { label: '高危风险发现', value: num(kpi.high, 'stat-high-sev'), title: '各会话严重与高危的未关闭风险发现合计，包含待确认项。', hint: '未关闭' },
        ]} />
      </div>

      <Tabs<Scope> label="项目范围" value={scope} onChange={setScope}
        items={SCOPES.map((s) => ({ key: s, label: SCOPE_LABEL[s], count: ready ? scopeCount[s] : null, dataAttrs: { 'data-project-scope-tab': s } }))} />

      <section className="jz-pane overflow-hidden rounded-card" aria-label="项目列表">
        {activeSessions.length > 0 && (
          <div className="border-b border-jz-border" data-active-sessions>
            <h2 className="jz-eyebrow px-4 pt-2.5">{activeSessions[0].live ? '进行中的会话' : '最近创建的会话'}</h2>
            <ul>
              {activeSessions.map((a) => (
                <li key={a.s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
                  <span className="font-mono text-mono tnum text-jz-muted">#{a.s.id}</span>
                  <span className="min-w-0 flex-1 basis-40 truncate text-label text-jz-ink" title={a.s.package}>{a.s.app_name || a.s.package}</span>
                  {a.project && <span className="min-w-0 max-w-xs truncate text-meta text-jz-muted">{a.project}</span>}
                  <StatusBadge status={a.s.status} />
                  <Button size="sm" variant="secondary" onClick={() => nav(PATHS.session(a.s.project_id ?? 0, a.s.id))} aria-label={`打开会话 #${a.s.id} 的工作台`} data-active-session={a.s.id}>
                    打开 <ArrowRight size={14} aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2.5 border-b border-jz-border px-4 py-3" data-toolbar="projects" data-company-toolbar>
          <div className="flex flex-wrap items-center gap-3" data-toolbar-main>
            <SearchField value={q} onValueChange={setQ} label="搜索项目、公司、品牌、包名或编号" className="min-w-0 flex-1 basis-64 desktop:max-w-md"
              data-probe="proj-search" data-toolbar-search />
            <span className="mr-auto whitespace-nowrap text-label text-jz-muted" aria-live="polite">{ready ? `${total} 个项目` : ''}</span>
            <div className="w-32 flex-none">
              <Select aria-label="排序" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} data-toolbar-sort>
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
              </Select>
            </div>
            <div data-view-toggle>
              <SegmentedControl label="视图" value={view} onChange={setView} items={[
                { key: 'table', label: <><Table2 size={14} aria-hidden /> 表格</>, dataAttrs: { 'data-view-btn': 'table', 'data-active': view === 'table' ? '1' : '' } },
                { key: 'cards', label: <><LayoutGrid size={14} aria-hidden /> 卡片</>, dataAttrs: { 'data-view-btn': 'cards', 'data-active': view === 'cards' ? '1' : '' } },
              ]} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2" data-filter-bar>
            <FilterGroup label="风险发现" data-toolbar-filters>
              {RISKS.map((f) => (
                <FilterChip key={f.key} active={riskF === f.key} onClick={() => setRiskF(f.key)} title={f.title} count={riskCounts[f.key]}
                  dataAttrs={{ 'data-toolbar-filter': f.key }}>{f.label}</FilterChip>
              ))}
            </FilterGroup>
            <FilterGroup label="加固">
              <FilterChip active={!packerF} onClick={() => setPackerF('')} count={scoped.length}>全部</FilterChip>
              {packerOptions.map(([k, n]) => (
                <FilterChip key={k} active={packerF === k} onClick={() => setPackerF(packerF === k ? '' : k)} count={n}
                  title={`最近会话的加固类型：${k}`} dataAttrs={{ 'data-probe': `packer-chip-${k}` }}>{packerText(k)}</FilterChip>
              ))}
            </FilterGroup>
            <FilterGroup label="状态">
              <FilterChip active={!statusF} onClick={() => setStatusF('')} count={scoped.length}>全部</FilterChip>
              {statusOptions.map(([k, n]) => (
                <FilterChip key={k} active={statusF === k} onClick={() => setStatusF(statusF === k ? '' : k)} count={n}
                  title={`最近会话的状态：${k}`} dataAttrs={{ 'data-probe': `status-chip-${k}` }}>{k === 'unknown' ? '没有会话' : stateOf(k).label}</FilterChip>
              ))}
            </FilterGroup>
          </div>
        </div>

        <AsyncBoundary loading={!ready && !loadErr} error={loaded ? null : loadErr} onRetry={() => load()} skeleton="table"
          empty={ready && !sorted.length}
          emptyState={none ? (
            <div className="grid gap-x-8 gap-y-5 px-5 py-6 desktop:grid-cols-12" data-empty-projects data-company-start>
              <div className="flex min-w-0 flex-col items-start gap-2 desktop:col-span-5" data-state="empty" data-company-start-next>
                <h2 className="text-section font-semibold text-jz-ink">还没有项目</h2>
                <p className="text-label text-jz-ink-2">项目列表加载成功，结果为空。可以直接新建；不确定范围时，先看证据里尚未归属的应用，或者从一次新建评估开始。</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Button icon={<Plus size={16} aria-hidden />} onClick={() => setCreateOpen(true)} data-company-start-create>新建项目</Button>
                  <Button variant="secondary" onClick={() => nav(PATHS.newAssessment)} data-goto-new-audit>新建评估</Button>
                  <Link to={PATHS.evidence} className={textLink} data-company-discovery>先看证据 <ArrowRight size={14} aria-hidden /></Link>
                </div>
              </div>
              <ol className="grid min-w-0 gap-4 tablet:grid-cols-3 desktop:col-span-7 desktop:border-l desktop:border-jz-border desktop:pl-8">
                {STEPS.map(([t, d], i) => (
                  <li key={t} className="flex min-w-0 flex-col gap-1 border-t border-jz-border pt-2.5">
                    <span className="font-mono text-mono text-jz-muted">0{i + 1}</span>
                    <span className="text-label font-semibold text-jz-ink">{t}</span>
                    <span className="text-label text-jz-ink-2">{d}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div data-empty-filtered>
              <EmptyState icon={filtering ? SearchX : FolderKanban} title={filtering ? '没有匹配的项目' : `还没有${SCOPE_LABEL[scope]}项目`}
                cause={filtering ? (q.trim() ? `没有项目匹配“${q.trim()}”和当前筛选。` : '当前的风险发现、加固与状态筛选组合没有结果。') : '换一个范围查看，或者新建一个这种类型的项目。'}
                action={filtering
                  ? <Button variant="secondary" onClick={resetFilters} data-reset-filters>清除筛选</Button>
                  : <Button variant="secondary" icon={<Plus size={16} aria-hidden />} onClick={() => setCreateOpen(true)}>新建项目</Button>} />
            </div>
          )}>
          <ProjectTable rows={paged} view={view} leadId={lead?.id}
            onOpenSession={(r) => { if (r.primary) nav(PATHS.session(r.p.id, r.primary.id)); }}
            onReport={(r) => nav(`${PATHS.project(r.p.id)}?tab=reports`)}
            onNewSession={(r) => setWizardPid(r.p.id)} />
        </AsyncBoundary>
        {ready && total > 0 && (
          <div className="border-t border-jz-border px-2">
            <DataToolbar probe="projects-pager" pager={{ total, page: safePage, pageSize, onPage: setPage, onPageSize: setPageSize }} />
          </div>
        )}
      </section>

      {/* With a single project the index would end right under one row: say what to do next instead. */}
      {ready && !loadErr && projects!.length === 1 && lead && (
        <section data-company-next="solo" aria-label="接下来" className="jz-pane grid rounded-card tablet:grid-cols-2">
          <div className="min-w-0 px-4 py-3">
            <h2 className="text-label font-semibold text-jz-ink">接下来</h2>
            <p className="mt-1 text-label text-jz-ink-2">
              {(rows![0]?.apps ?? 0) === 0 && rows![0]?.scope === 'company' ? '这个项目的应用清单还是空的，评估和报告都要从导入应用开始。'
                : rows![0]?.ps.length ? '项目里已有会话，可以继续评估并生成报告。' : '项目里还没有会话，新建会话后进入评估工作台。'}
            </p>
            <Link to={PATHS.project(lead.id)} className={cx(textLink, '-ml-2 mt-1')} data-company-next-project>进入项目 <ArrowRight size={14} aria-hidden /></Link>
          </div>
          <div className="min-w-0 border-t border-jz-border px-4 py-3 tablet:border-l tablet:border-t-0">
            <h2 className="text-label font-semibold text-jz-ink">扩大范围</h2>
            <p className="mt-1 text-label text-jz-ink-2">证据页列出了尚未归属到任何项目的应用，可以从中确认归属，或为另一家公司新建项目。</p>
            <Link to={PATHS.evidence} className={cx(textLink, '-ml-2 mt-1')} data-company-discovery>查看证据 <ArrowRight size={14} aria-hidden /></Link>
          </div>
        </section>
      )}

      <ProjectCreateDialog open={createOpen} initialKind={scope === 'single' ? 'single' : 'company'} onClose={() => setCreateOpen(false)}
        onCreated={(id, kind) => { setCreateOpen(false); nav(kind === 'company' ? PATHS.project(id) : `${PATHS.project(id)}?tab=runs&new=1`); }} />
      {wizardPid != null && (
        <NewProjectWizard pid={wizardPid} hostName={(projects ?? []).find((p) => p.id === wizardPid)?.name}
          onClose={(sid, newPid) => { const pid = newPid ?? wizardPid; setWizardPid(null); if (sid) nav(PATHS.session(pid, sid)); }} />
      )}
      <UniversalImportModal open={importOpen} title="导入项目（JSON 或 CSV）"
        hint="字段：name（必填）、note（可选）；package 列会写入备注。已存在的同名项目会跳过，不会被覆盖。"
        validateRow={(r) => (String(r.name || '').trim() ? '' : '缺少 name 字段（项目名称）')}
        onClose={() => setImportOpen(false)} onImportSuccess={handleImport} />
    </Page>
  );
};

/** Export menu: CSV / JSON / Markdown summary of the filtered result set. */
const ExportMenu: React.FC<{ onExport: (id: string) => void }> = ({ onExport }) => {
  const items: Array<{ id: ExportFormat; label: string; icon: React.ElementType }> = [
    { id: 'csv', label: 'CSV 汇总', icon: FileSpreadsheet }, { id: 'json', label: 'JSON 汇总', icon: FileJson }, { id: 'md', label: 'Markdown 汇总', icon: FileText },
  ];
  return (
    <span data-toolbar-export className="inline-flex">
      <Popover label="导出" role="menu"
        trigger={(p) => <Button variant="secondary" icon={<Download size={16} aria-hidden />} {...p} data-toolbar-export-toggle>导出</Button>}>
        {(close) => (
          <div data-toolbar-export-panel>
            {items.map((it) => (
              <MenuItem key={it.id} icon={<it.icon size={16} aria-hidden />} onClick={() => { onExport(it.id); close(); }} data-toolbar-export-item={it.id}>{it.label}</MenuItem>
            ))}
          </div>
        )}
      </Popover>
    </span>
  );
};

export default ProjectsPage;
