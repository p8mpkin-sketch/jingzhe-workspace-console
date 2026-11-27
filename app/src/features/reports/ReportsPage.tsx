// ReportsPage.tsx — the report list (/reports without ?taskId=): scope tabs on ?scope=, search, and per scope
// either the session hub (会话报告: risk filter, sort, three views, batch CSV) or the shared report table
// (全部, 项目报告, 单应用报告). It lists, filters and downloads; generating stays in the project's 报告 tab.
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSearch, FolderOpen, Lock, Plus, RefreshCw, SearchX } from 'lucide-react';
import {
  Button, EmptyState, ErrorState, PageHeader, Pagination, Panel, PermissionState, SearchField, SkeletonLoader, StatusGlyph, Tabs,
} from '@/components/ui';
import type { TabItem } from '@/components/ui';
import { moduleLabel } from '@/layout/navigation';
import { isDenied } from '@/features/dashboard/readout';
import { HubView } from './HubView';
import type { HubState } from './HubView';
import { ReportTable } from './ReportTable';
import { SCOPES, SCOPE_LABEL, byTime, matches, projectItem, projectProgress, sessionItem } from './reportScopes';
import type { ProjectReport, ProjectReportsRead, ReportItem, Scope } from './reportScopes';
import type { HubEntry } from './types';

type Count = { n: number | null; note?: string; word?: '未读取' | '无权限' };

export const ReportsPage: React.FC<{
  scope: Scope;
  onScope: (s: Scope) => void;
  tasksLoading: boolean;
  tasksError: unknown;
  onRetryTasks: () => void;
  /** Header 刷新: the task list and the projects that did not answer. */
  onRefresh: () => void;
  entries: HubEntry[];
  filtered: HubEntry[];
  paged: HubEntry[];
  hub: HubState;
  patch: (p: Partial<HubState>) => void;
  agg: { done: number; total: number };
  onOpen: (tid: number, key: string) => void;
  onExportOne: (tid: number) => void;
  onExportBatch: () => void;
  batchBusy: boolean;
  projects: ProjectReportsRead;
  onDownload: (r: ProjectReport, format: 'pdf' | 'docx') => void;
}> = (p) => {
  const nav = useNavigate();
  const { scope, projects, hub } = p;
  const sessionCount: Count = p.tasksLoading ? { n: null } : p.tasksError && !p.entries.length ? { n: null, word: isDenied(p.tasksError) ? '无权限' : '未读取' } : { n: p.entries.length };
  const settled = projects.total != null && projects.read + projects.failed + projects.denied + projects.stale === projects.total;
  const missing = projects.failed + projects.denied;
  const kindCount = (k: 'project' | 'app'): Count => {
    if (projects.state === 'permission') return { n: null, word: '无权限' };
    if (projects.state === 'unread') return { n: null, word: '未读取' };
    if (!settled) return { n: null };
    return { n: projects.rows.filter((r) => projectItem(r).type === k).length, note: missing ? `${missing} 个项目未读取` : undefined };
  };
  const counts: Record<Scope, Count> = {
    session: sessionCount, project: kindCount('project'), app: kindCount('app'),
    all: (() => {
      const a = sessionCount, b = kindCount('project'), c = kindCount('app');
      if (a.n == null || b.n == null || c.n == null) return { n: null };
      return { n: a.n + b.n + c.n, note: b.note };
    })(),
  };
  const tabs: TabItem<Scope>[] = SCOPES.map((s) => {
    const c = counts[s];
    return {
      key: s, dataAttrs: { 'data-scope-tab': s, 'data-scope-count': c.n ?? c.word ?? '' },
      label: (
        <span className="inline-flex items-center gap-1.5">
          {SCOPE_LABEL[s]}
          {c.n != null && <span className="font-mono text-meta tnum text-jz-muted" data-scope-n>{c.n}{c.note ? `，${c.note}` : ''}</span>}
          {c.word && <span className="inline-flex items-center gap-1 text-meta text-jz-muted" data-scope-word>{c.word === '无权限' ? <Lock size={11} aria-hidden /> : <StatusGlyph kind="failed" />}{c.word}</span>}
        </span>
      ),
    };
  });

  // Rows of the shared table for 全部 / 项目报告 / 单应用报告.
  const items: ReportItem[] = useMemo(() => {
    if (scope === 'session') return [];
    const fromProjects = projects.rows.map(projectItem).filter((it) => scope === 'all' || it.type === scope);
    const fromSessions = scope === 'all' ? p.entries.map(sessionItem) : [];
    return [...fromSessions, ...fromProjects].filter((it) => matches(it, hub.q)).sort(byTime);
  }, [scope, projects.rows, p.entries, hub.q]);
  const pages = Math.max(1, Math.ceil(items.length / hub.pageSize));
  const page = Math.min(hub.page, pages);
  const shown = items.slice((page - 1) * hub.pageSize, page * hub.pageSize);

  const progress = projectProgress(projects);
  const projectNote = scope !== 'session' && (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-jz-border px-4 py-2 text-label text-jz-muted" data-project-progress>
      {projects.state === 'loading' ? <span>正在读取项目列表…</span>
        : projects.state === 'permission' ? <span className="inline-flex items-center gap-1 text-jz-ink-2" data-project-note="permission"><Lock size={12} aria-hidden />项目报告：无权限。当前账号不能读取项目列表。</span>
        : projects.state === 'unread' ? <span className="inline-flex items-center gap-2 text-jz-ink-2" data-project-note="unread"><StatusGlyph kind="failed" />项目报告：项目列表没有读到。<Button size="sm" variant="secondary" icon={<RefreshCw size={14} aria-hidden />} onClick={() => projects.reload()}>重试</Button></span>
        : <span className="tnum" data-project-note={settled ? 'settled' : 'loading'}>{progress}{!settled ? '，其余的读到后会并入列表' : ''}</span>}
      {(projects.state === 'stale' || projects.stale > 0) && <span className="text-jz-amber-ink" data-state="stale" data-project-note="stale">项目报告：最近一次刷新未成功，显示的是上次读到的报告。</span>}
      {projects.failed > 0 && <Button size="sm" variant="secondary" icon={<RefreshCw size={14} aria-hidden />} onClick={() => projects.reload()} data-project-retry>重试未读取的项目</Button>}
      {scope === 'all' && p.tasksError != null && (p.entries.length > 0 ? (
        <span className="text-jz-amber-ink" data-state="stale" data-session-note="stale">会话报告：最近一次刷新未成功，显示的是上次读到的列表。</span>
      ) : (
        <span className="inline-flex items-center gap-2 text-jz-ink-2" data-session-note={isDenied(p.tasksError) ? 'permission' : 'unread'}>
          {isDenied(p.tasksError) ? <><Lock size={12} aria-hidden />会话报告：无权限。</> : <><StatusGlyph kind="failed" />会话报告：任务列表没有读到。<Button size="sm" variant="secondary" icon={<RefreshCw size={14} aria-hidden />} onClick={p.onRetryTasks}>重试</Button></>}
        </span>
      ))}
    </div>
  );

  // Whole-list states for the shared table.
  const sessionsDown = scope === 'all' ? p.tasksError != null && p.entries.length === 0 : true;
  const projectsDown = projects.state === 'unread' || projects.state === 'permission';
  const bothDenied = (scope === 'all' ? isDenied(p.tasksError) : true) && projects.state === 'permission';
  const tableState = (() => {
    if (scope === 'session') return null;
    if (sessionsDown && projectsDown) {
      if (bothDenied) return <PermissionState message={scope === 'all' ? '当前账号不能读取任务列表和项目列表。' : '当前账号不能读取项目列表。'} />;
      return <ErrorState title="报告列表没有读到" message={scope === 'all' ? '任务列表和项目列表的请求都没有成功。' : '项目列表的请求没有成功。'} onRetry={() => { projects.reload(); if (scope === 'all') p.onRetryTasks(); }} />;
    }
    const waiting = (scope === 'all' ? p.tasksLoading : false) || projects.state === 'loading' || (!settled && projects.state === 'value');
    if (items.length === 0 && waiting) return <div className="p-4" data-state="loading"><SkeletonLoader variant="table" rows={5} /></div>;
    if (items.length === 0 && hub.q.trim()) return (
      <div data-reports-empty="search"><EmptyState icon={SearchX} title="没有符合条件的报告" cause="当前的搜索词没有匹配结果。"
        action={<Button variant="secondary" onClick={() => p.patch({ q: '', page: 1 })} data-clear-search>清除搜索</Button>} /></div>
    );
    if (items.length === 0) return (
      <div data-reports-empty={scope}>
        {scope === 'all'
          ? <EmptyState icon={FileSearch} title="还没有报告" cause="评估任务完成后会出现会话报告；项目报告在项目的报告标签里生成。"
              action={<Button icon={<Plus size={16} aria-hidden />} onClick={() => nav('/new-assessment')}>新建评估</Button>} />
          : <EmptyState icon={FolderOpen} title={scope === 'project' ? '还没有项目报告' : '还没有单应用报告'}
              cause={scope === 'project' ? '项目报告在项目的报告标签里生成。' : '单应用报告在项目的应用标签里生成。'}
              action={<Button variant="secondary" onClick={() => nav('/projects')}>去项目里生成</Button>} />}
      </div>
    );
    return null;
  })();

  return (
    <>
      <PageHeader title={moduleLabel('/reports')}
        actions={<Button variant="secondary" icon={<RefreshCw size={16} aria-hidden />} onClick={p.onRefresh} data-reports-refresh>刷新</Button>}
        description="会话报告、项目报告和单应用报告。打开会话报告可以查看鉴权矩阵、合规域分布、发现明细，并导出报告；项目报告可以下载。"
        meta={scope !== 'project' && scope !== 'app' && p.agg.done < p.agg.total && p.agg.total > 0
          ? <span role="status" data-agg-progress className="tnum">正在汇总各任务的会话指标 {p.agg.done}/{p.agg.total}</span> : undefined} />
      <div data-scope-tabs><Tabs items={tabs} value={scope} onChange={p.onScope} label="报告范围" /></div>
      {scope === 'session' ? (
        <HubView loading={p.tasksLoading} error={p.tasksError} onRetry={p.onRetryTasks} onCreate={() => nav('/new-assessment')}
          entries={p.entries} filtered={p.filtered} paged={p.paged}
          hub={hub} patch={p.patch} onOpen={(tid) => p.onOpen(tid, `hub-${tid}`)} onExportOne={p.onExportOne} onExportBatch={p.onExportBatch} batchBusy={p.batchBusy} />
      ) : (
        <Panel flush data-reports-list={scope}>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3" data-hub-toolbar>
            <SearchField className="min-w-56 flex-1" value={hub.q} onValueChange={(v) => p.patch({ q: v, page: 1 })}
              label="搜索报告" placeholder={scope === 'all' ? '搜索任务编号、包名、应用名或报告编号' : '搜索报告编号、项目、模板或状态'} data-hub-search />
            <span className="text-label text-jz-muted">按时间排列，最新的在前</span>
          </div>
          {projectNote}
          <div className="border-t border-jz-border">
            <ReportTable rows={shown} label={SCOPE_LABEL[scope]} context="global" onOpen={p.onOpen} onExportOne={p.onExportOne} onDownload={p.onDownload}
              state={tableState ?? undefined} />
          </div>
          {items.length > 0 && (
            <Pagination page={page} pageSize={hub.pageSize} total={items.length} onPage={(n) => p.patch({ page: n })}
              onPageSize={(n) => p.patch({ pageSize: n, page: 1 })} pageSizes={[12, 24, 48]} jump dataAttrs={{ 'data-hub-pager': '' }}
              controlAttrs={{ prev: { 'data-hub-page-prev': '' }, next: { 'data-hub-page-next': '' }, jump: { 'data-hub-page-jump': '' }, size: (n) => ({ 'data-hub-pagesize': n }) }} />
          )}
        </Panel>
      )}
    </>
  );
};
