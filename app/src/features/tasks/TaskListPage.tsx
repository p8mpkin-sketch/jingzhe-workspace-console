// Task list (V3). One list of assessment and unpack tasks: scope tabs, a toolbar of filters, a two-line table with
// selection across pages, and the bulk bar. A row opens the task detail (/tasks/:id); session and artifacts are
// buttons in the row. Requests, payloads and query parameters are the ones the previous task page used.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardList, Download, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '@/services/api';
import { usePentest } from '@/stores/pentest';
import {
  Page, PageHeader, Pagination, BulkBar, Tabs, Button, IconButton, Select, Checkbox, SearchField, Dialog, ConfirmDialog, Popover, MenuItem,
  EmptyState, ErrorState, PermissionState, StaleNotice, InlineAlert, SkeletonLoader, exportDataFile, useMediaQuery, toast,
} from '@/components/ui';
import type { TabItem } from '@/components/ui';
import { PATHS, moduleLabel } from '@/layout/navigation';
import { ArtifactsModal } from './ArtifactsModal';
import { RerunTaskModal } from './RerunTaskModal';
import { BatchUnpackSummary } from './BatchUnpackSummary';
import { TaskTable } from './TaskTable';
import type { RowHandlers } from './TaskRow';
import { PAGE_SIZES, PACKER_NAMES, SMOKE_FAIL_S, ST_CN, whenFull } from './taskParts';
import {
  KIND_CN, SCOPES, exportRows, filterTasks, isPartial, isScope, isSmokeFail, kindOf, nameOf, rerunBody, type Scope, type TaskItem,
} from './taskModel';
import { errText, useNowSeconds, useSessionLinks, useTaskCounts, useTaskList } from './useTasks';

const taskLine = (t: TaskItem) => `#${t.id} ${t.app_name || t.package || ''} [${ST_CN[t.status] || t.status}]`;
const Mono: React.FC<{ children: React.ReactNode } & React.HTMLAttributes<HTMLSpanElement>> = ({ children, ...rest }) => <span className="font-mono tnum text-jz-ink" {...rest}>{children}</span>;

export const TaskListPage: React.FC = () => {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const focusParam = params.get('focus');
  const rawStatus = params.get('status') || '';
  // `status=done&partial=1` is the V3 spelling of the former pseudo-status `degraded` (layout/redirects.tsx rewrites old links).
  const scope: Scope = isScope(rawStatus) ? rawStatus : '';
  const partial = params.get('partial') === '1';

  const list = useTaskList();
  const { map: sess } = useSessionLinks();
  const now = useNowSeconds();
  const liveDevices = usePentest((s) => s.devices);

  const [search, setSearch] = useState('');
  const [searchDeb, setSearchDeb] = useState('');
  const [kindF, setKindF] = useState('');
  const [packerF, setPackerF] = useState('all');
  const [operatorF, setOperatorF] = useState('');
  const [hideSmoke, setHideSmoke] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [delAsk, setDelAsk] = useState<TaskItem | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [retryOpen, setRetryOpen] = useState(false);
  const [cleanOpen, setCleanOpen] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMsg, setBatchMsg] = useState<string | null>(null);
  const [artTask, setArtTask] = useState<number | null>(null);
  const [rerunTask, setRerunTask] = useState<TaskItem | null>(null);

  // Width tiers: owner column from 1600, the report button inline from 1440, a table from 1024, record cards below.
  const showOwner = useMediaQuery('(min-width: 1600px)');
  const wide = useMediaQuery('(min-width: 1440px)');
  const table = useMediaQuery('(min-width: 1024px)');

  useEffect(() => { const t = window.setTimeout(() => setSearchDeb(search), 200); return () => window.clearTimeout(t); }, [search]);
  useEffect(() => { setPage(1); }, [searchDeb, pageSize, scope, partial, kindF, packerF, operatorF, hideSmoke]);

  // `/` focuses the search field (not while typing, not with a modifier).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      document.querySelector<HTMLInputElement>('[data-task-search]')?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const reload = list.reload;
  // A new ?focus= (a notification, a rerun, the way back from a detail) reads the list again: the task may be newer than the list on screen.
  const firstFocus = useRef(true);
  useEffect(() => { if (firstFocus.current) { firstFocus.current = false; return; } void reload(); }, [focusParam, reload]);

  const all = useMemo(() => list.data ?? [], [list.data]);
  // Selection follows the list: a task that is gone is no longer selected.
  useEffect(() => {
    if (!list.data) return;
    setSel((prev) => { const ids = new Set(list.data!.map((t) => t.id)); const nx = new Set([...prev].filter((id) => ids.has(id))); return nx.size === prev.size ? prev : nx; });
  }, [list.data]);

  // The focused task goes first, so paging never hides it.
  const ordered = useMemo(() => (focusParam ? [...all].sort((a, b) => (String(b.id) === focusParam ? 1 : 0) - (String(a.id) === focusParam ? 1 : 0)) : all), [all, focusParam]);

  const setScope = (k: Scope) => {
    const next = new URLSearchParams(params);
    if (k) next.set('status', k); else next.delete('status');
    if (k !== 'done') next.delete('partial');
    setParams(next);
  };
  const setPartial = (on: boolean) => {
    const next = new URLSearchParams(params);
    if (on) { next.set('status', 'done'); next.set('partial', '1'); } else next.delete('partial');
    setParams(next);
  };

  const [usersSeen, setUsersSeen] = useState<Record<string, string>>({});
  const filtered = useMemo(
    () => filterTasks(ordered, { scope, partial, search: searchDeb, kind: kindF, packer: packerF, operator: operatorF, hideSmoke }, usersSeen),
    [ordered, scope, partial, searchDeb, kindF, packerF, operatorF, hideSmoke, usersSeen],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => filtered.slice((safePage - 1) * pageSize, safePage * pageSize), [filtered, safePage, pageSize]);
  const pageIds = useMemo(() => pageRows.map((t) => t.id), [pageRows]);
  const counts = useTaskCounts(pageIds);
  useEffect(() => { setUsersSeen((p) => (Object.keys(counts.users).every((k) => p[k] === counts.users[k]) ? p : { ...p, ...counts.users })); }, [counts.users]);

  // Concurrency: `GET /api/org` (running + queued against the organisation's limit), read once on load as before.
  const [slots, setSlots] = useState<{ running: number; quota: number } | null | 'unread'>(null);
  useEffect(() => { api<any>('/api/org').then((o) => setSlots({ running: o?.usage?.running ?? 0, quota: o?.usage?.quota_concurrent ?? -1 })).catch(() => setSlots('unread')); }, []);
  const slotInfo = slots && slots !== 'unread' ? (() => {
    const unlim = slots.quota == null || slots.quota < 0;
    const load = !unlim && slots.quota > 0 ? Math.round((slots.running / slots.quota) * 100) : null;
    return { used: slots.running, quota: slots.quota, unlim, load, free: unlim ? null : Math.max(0, slots.quota - slots.running) };
  })() : null;

  // Focus goes to the row named by ?focus= once it is on screen: the way back from a task detail lands on its row.
  const focusedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!focusParam || focusedFor.current === focusParam || !pageRows.some((t) => String(t.id) === focusParam)) return;
    const a = document.activeElement as HTMLElement | null;
    if (a && a !== document.body && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.closest('[role="dialog"], [role="alertdialog"]'))) return;
    focusedFor.current = focusParam;
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-task-row="${focusParam}"]`)?.focus());
  }, [focusParam, pageRows, table]);

  const selTasks = useMemo(() => all.filter((t) => sel.has(t.id)), [all, sel]);
  const selPages = useMemo(() => {
    const pages = new Set<number>();
    filtered.forEach((t, i) => { if (sel.has(t.id)) pages.add(Math.floor(i / pageSize)); });
    const hidden = selTasks.filter((t) => !filtered.includes(t)).length;
    return { pages: pages.size, hidden };
  }, [filtered, sel, selTasks, pageSize]);
  const allPageSel = pageIds.length > 0 && pageIds.every((id) => sel.has(id));
  const toggleRow = (id: number) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAllPage = () => setSel((p) => { const n = new Set(p); pageIds.forEach((id) => (allPageSel ? n.delete(id) : n.add(id))); return n; });
  // Exactly two selected tasks that both have a session: compare their reports.
  const cmpPair = useMemo(() => {
    if (sel.size !== 2) return null;
    const [x, y] = [...sel];
    const a = sess[x], b = sess[y];
    return a && b ? { a: a.sid, b: b.sid } : null;
  }, [sel, sess]);
  const failedInView = useMemo(() => filtered.filter((t) => t.status === 'failed'), [filtered]);

  const later = (ms: number) => window.setTimeout(() => { void reload(); }, ms);
  const removeTask = async (t: TaskItem) => {
    try { await api(`/api/tasks/${t.id}`, { method: 'DELETE' }); setBatchMsg(`已删除任务 #${t.id}`); later(600); }
    catch (e) { toast.err(`任务 #${t.id} 没有删除：${errText(e) || '服务端拒绝了这个操作'}`); }
  };
  const batchRetry = async () => {
    if (batchBusy) return;
    setRetryOpen(false); setBatchBusy(true);
    let ok = 0, fail = 0;
    try {
      for (const t of selTasks) { try { await api('/api/tasks', { method: 'POST', body: JSON.stringify(rerunBody(t)) }); ok++; } catch { fail++; } }
      setBatchMsg(`已重新运行 ${ok} 个任务${fail ? `,${fail} 个没有成功` : ''}`); setSel(new Set()); later(800);
    } finally { setBatchBusy(false); }
  };
  const batchDelete = async () => {
    if (batchBusy) return;
    setDelOpen(false); setBatchBusy(true);
    let ok = 0, skip = 0;
    try {
      for (const t of selTasks) { try { await api(`/api/tasks/${t.id}`, { method: 'DELETE' }); ok++; } catch { skip++; } }
      setBatchMsg(`已删除 ${ok} 个任务${skip ? `,跳过 ${skip} 个(运行中或排队中的任务不能删除)` : ''}`); setSel(new Set()); void reload();
    } finally { setBatchBusy(false); }
  };
  const cleanFailed = async () => {
    if (batchBusy) return;
    setCleanOpen(false); setBatchBusy(true);
    let ok = 0, skip = 0;
    try {
      for (const t of failedInView) { try { await api(`/api/tasks/${t.id}`, { method: 'DELETE' }); ok++; } catch { skip++; } }
      setBatchMsg(`已删除 ${ok} 个失败任务${skip ? `,跳过 ${skip} 个(服务端拒绝)` : ''}`); void reload();
    } finally { setBatchBusy(false); }
  };
  const doExport = (rows: TaskItem[], fmt: 'csv' | 'json', what: string) => {
    exportDataFile('tasks_export', fmt, exportRows(rows, counts.items, usersSeen, now));
    setBatchMsg(`已导出${what} ${rows.length} 行(${fmt.toUpperCase()})`);
  };

  const on: RowHandlers = useMemo(() => ({
    openSession: (hit) => nav(PATHS.session(hit.pid, hit.sid)),
    openArtifacts: (t) => setArtTask(t.id),
    openReport: (t) => nav(`${PATHS.reports}?taskId=${t.id}`),
    openDetail: (t) => nav(PATHS.task(t.id)),
    rerun: (t) => setRerunTask(t),
    ask: (t) => nav(`${PATHS.agent}?task=${t.id}`),
    remove: (t) => setDelAsk(t),
  }), [nav]);

  const count = useCallback((k: Scope) => (k ? ordered.filter((t) => t.status === k).length : ordered.length), [ordered]);
  const read = list.data != null;
  const tabs: TabItem<Scope>[] = SCOPES.map((s) => ({
    key: s.key, label: s.label, count: read ? count(s.key) : null,
    dataAttrs: { 'data-toolbar-filter': s.key, 'data-active': scope === s.key ? '1' : '' },
  }));
  const partialCount = useMemo(() => ordered.filter(isPartial).length, [ordered]);
  const smokeCount = useMemo(() => ordered.filter(isSmokeFail).length, [ordered]);
  const kinds = useMemo(() => [...new Set(all.map(kindOf))].sort(), [all]);
  const packerOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of all) if (t.packer && t.packer !== 'none') m.set(t.packer, (m.get(t.packer) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);
  const operatorOptions = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of all) if (t.user_id != null) { const k = String(t.user_id); m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);
  const filtersOn = !!scope || partial || !!searchDeb || !!kindF || packerF !== 'all' || !!operatorF || hideSmoke;
  const clearFilters = () => { const next = new URLSearchParams(params); next.delete('status'); next.delete('partial'); setParams(next); setSearch(''); setKindF(''); setPackerF('all'); setOperatorF(''); setHideSmoke(false); };

  const state: React.ReactNode = (() => {
    if (list.loading) {
      return (
        <div className="p-4" aria-busy="true" data-state={list.slow ? 'slow' : 'loading'} data-task-state={list.slow ? 'slow' : 'loading'}>
          {list.slow && <p className="mb-3 text-label text-jz-ink-2" role="status">任务列表还在读取，比平时慢。读到之后会直接显示在这里，不需要刷新。</p>}
          <SkeletonLoader variant="table" rows={8} />
        </div>
      );
    }
    if (list.forbidden) {
      return <div data-task-state="forbidden"><PermissionState title="没有权限读取任务列表" message="当前账号不能读取任务，所以这里没有任务可显示。需要查看时，请管理员开通任务的读取权限。" /></div>;
    }
    if (list.failed) {
      return <div data-task-state="error"><ErrorState title="任务列表没有读到" message={errText(list.error) || '服务端没有返回任务列表。'} onRetry={() => { void reload(); }} /></div>;
    }
    if (filtered.length === 0) {
      return all.length === 0
        ? <div data-task-state="empty"><EmptyState icon={ClipboardList} title="还没有任务" cause="创建评估后,任务会出现在这里。"
            action={<Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => nav(PATHS.newAssessment)}>新建评估</Button>} /></div>
        : <div data-task-state="filtered-empty"><EmptyState icon={ClipboardList} title="没有符合条件的任务" cause="当前的搜索或筛选条件下没有任务。"
            action={filtersOn ? <Button variant="secondary" onClick={clearFilters} data-clear-filters>清除筛选</Button> : undefined} /></div>;
    }
    return undefined;
  })();
  const usable = read && !list.forbidden;

  return (
    <Page data-tasks-page data-task-list-state={list.loading ? (list.slow ? 'slow' : 'loading') : list.forbidden ? 'forbidden' : list.failed ? 'error' : list.stale ? 'stale' : 'ok'}>
      <PageHeader title={moduleLabel('/tasks')} description="评估和脱壳任务的状态、结果与产物。"
        meta={(
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1" data-situation-pods aria-label="队列">
            <span data-slot-pod={slotInfo ? '' : undefined} data-slot-state={slotInfo ? 'ok' : slots === 'unread' ? 'unread' : 'loading'}
              title="正在运行和排队的任务数,对比组织的最大并发数。达到上限后新任务会被拒绝。">
              并发 {slotInfo ? <><Mono>{slotInfo.used}/{slotInfo.unlim ? '∞' : slotInfo.quota}</Mono>
                <span className="ml-1.5" data-slot-indicator>空闲 {slotInfo.unlim ? '不限' : `${slotInfo.free} 个`}{slotInfo.load != null ? ` · 负载 ${slotInfo.load}%` : ''}</span></>
                : <span className="text-jz-ink-2">{slots === 'unread' ? '未读取' : '…'}</span>}
            </span>
            <span data-fact-running>运行中 {read ? <Mono>{count('running')}</Mono> : <span className="text-jz-ink-2">{list.loading ? '…' : '未读取'}</span>}</span>
            <span data-fact-queued>排队中 {read ? <Mono>{count('queued')}</Mono> : <span className="text-jz-ink-2">{list.loading ? '…' : '未读取'}</span>}</span>
            <span data-fact-devices title="与顶栏的设备状态一致">在线设备 <Mono>{liveDevices.length}</Mono></span>
          </span>
        )}
        actions={(
          <div className="flex flex-wrap items-center gap-2" data-toolbar-actions>
            <IconButton label="刷新任务列表" variant="secondary" onClick={() => { void reload(); }} data-tasks-refresh><RefreshCw size={16} aria-hidden /></IconButton>
            <span data-toolbar-export>
              <Popover role="menu" align="end" label="导出任务列表"
                trigger={(tp) => <Button variant="secondary" icon={<Download size={16} aria-hidden />} disabled={!usable} data-toolbar-export-toggle {...tp}>导出</Button>}>
                {(close) => (
                  <div data-toolbar-export-panel>
                    {(['csv', 'json'] as const).map((id) => (
                      <MenuItem key={id} data-toolbar-export-item={id} onClick={() => { doExport(filtered, id, '当前筛选结果'); close(); }}>导出为 {id.toUpperCase()}</MenuItem>
                    ))}
                  </div>
                )}
              </Popover>
            </span>
            <Button variant="secondary" onClick={() => setCleanOpen(true)} disabled={batchBusy || failedInView.length === 0} data-clean-failed
              title="删除当前筛选结果里的全部失败任务,会先请你确认">清理失败任务{read ? ` (${failedInView.length})` : ''}</Button>
            <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => nav(PATHS.newAssessment)} data-toolbar-create>新建评估</Button>
          </div>
        )} />

      {list.stale && (
        <StaleNotice onRefresh={() => { void reload(); }} refreshing={list.refreshing} since={list.at ? whenFull(list.at / 1000) : undefined}
          reason="最近一次刷新没有成功，下面是上一次读到的任务。" />
      )}

      <section aria-label="任务" className="min-w-0 border border-jz-border bg-jz-surface" data-tasks-list>
        <div className="flex items-end gap-2 px-4 pt-2" data-toolbar-filters {...(scope ? { 'data-filter-chip-row': `status=${partial ? 'degraded' : scope}` } : {})}>
          <Tabs<Scope> className="min-w-0 flex-1" label="按状态筛选" items={tabs} value={scope} onChange={setScope} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-jz-border px-4 py-3" data-toolbar="tasks" data-toolbar-main>
          <SearchField className="min-w-56 flex-1 max-[760px]:basis-full" value={search} onValueChange={setSearch} label="搜索任务"
            placeholder="搜索应用名、包名、任务 ID、负责人或失败原因" data-task-search="" data-toolbar-search />
          <div className="w-32 flex-none max-[760px]:w-auto max-[760px]:min-w-32 max-[760px]:flex-1">
            <Select value={kindF} onChange={(e) => setKindF(e.target.value)} data-kind-filter aria-label="按任务类型筛选">
              <option value="">全部类型</option>
              {kinds.map((k) => <option key={k} value={k}>{KIND_CN[k] || k}</option>)}
            </Select>
          </div>
          <div className="w-40 flex-none max-[760px]:w-auto max-[760px]:min-w-32 max-[760px]:flex-1">
            <Select value={packerF} onChange={(e) => setPackerF(e.target.value)} data-packer-filter aria-label="按加固类型筛选">
              <option value="all">全部加固类型</option>
              {packerOptions.length > 0 && <option value="__packed">有加固</option>}
              {all.some((t) => t.packer === 'none') && <option value="none">无加固</option>}
              {packerOptions.map(([v, n]) => <option key={v} value={v}>{PACKER_NAMES[v] || v} ({n})</option>)}
            </Select>
          </div>
          <div className="w-40 flex-none max-[760px]:w-auto max-[760px]:min-w-32 max-[760px]:flex-1">
            <Select value={operatorF} onChange={(e) => setOperatorF(e.target.value)} data-operator-filter aria-label="按负责人筛选">
              <option value="">全部负责人</option>
              {operatorOptions.map(([uid, n]) => <option key={uid} value={uid}>{usersSeen[uid] ? `${usersSeen[uid]} (#${uid})` : `#${uid}`} · {n}</option>)}
            </Select>
          </div>
          <span data-partial-toggle data-active={partial ? '1' : ''} title="只看已完成但有加固且业务代码没有脱出的任务">
            <Checkbox checked={partial} onChange={() => setPartial(!partial)} label={<>仅部分完成{read && <> (<span className="font-mono tnum">{partialCount}</span>)</>}</>} />
          </span>
          <span data-smoke-toggle data-active={hideSmoke ? '1' : ''} title={`隐藏在 ${SMOKE_FAIL_S} 秒内就失败的任务。这类任务通常没有真正开始。`}>
            <Checkbox checked={hideSmoke} onChange={() => setHideSmoke((v) => !v)} label={<>隐藏即时失败{read && <> (<span className="font-mono tnum">{smokeCount}</span>)</>}</>} />
          </span>
        </div>

        <div data-batch-bar={sel.size > 0 ? '' : undefined}>
          <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
            <span className="text-meta text-jz-ink-2" data-sel-pages={selPages.pages}>
              {selPages.pages > 1 ? `跨 ${selPages.pages} 页` : '在 1 页内'}{selPages.hidden > 0 ? `，其中 ${selPages.hidden} 个不在当前筛选结果里` : ''}
            </span>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} aria-hidden />} onClick={() => setRetryOpen(true)} disabled={batchBusy} data-batch-retry
              title={batchBusy ? '批量操作进行中' : '重新运行选中的任务,会先请你确认'}>重新运行</Button>
            <Popover role="menu" label="导出选中的任务"
              trigger={(tp) => <Button size="sm" variant="secondary" icon={<Download size={14} aria-hidden />} disabled={batchBusy} data-batch-export {...tp}>导出</Button>}>
              {(close) => (
                <>
                  <MenuItem onClick={() => { doExport(selTasks, 'csv', '选中的'); close(); }} data-batch-csv>导出为 CSV</MenuItem>
                  <MenuItem onClick={() => { doExport(selTasks, 'json', '选中的'); close(); }} data-batch-json>导出为 JSON</MenuItem>
                </>
              )}
            </Popover>
            {cmpPair && (
              <Button size="sm" variant="secondary" onClick={() => nav(`${PATHS.reports}?sid=${cmpPair.a}&cmp=${cmpPair.b}`)} data-batch-compare
                title={`在报告页对比会话 #${cmpPair.a} 和 #${cmpPair.b}`}>对比报告</Button>
            )}
            <Button size="sm" variant="danger" icon={<Trash2 size={14} aria-hidden />} onClick={() => setDelOpen(true)} disabled={batchBusy} data-batch-del
              title={batchBusy ? '批量操作进行中' : '删除选中的任务,会先请你确认'}>删除</Button>
          </BulkBar>
        </div>
        {batchMsg && (
          <div className="px-4 pt-3">
            <InlineAlert tone="info" data-batch-msg action={<Button size="sm" variant="ghost" onClick={() => setBatchMsg(null)}>知道了</Button>}>{batchMsg}</InlineAlert>
          </div>
        )}

        <TaskTable rows={pageRows} sess={sess} counts={counts} users={usersSeen} now={now} focusId={focusParam} selected={sel} onToggle={toggleRow} onToggleAll={toggleAllPage}
          table={table} showOwner={showOwner} wide={wide} on={on} state={state} />
        {usable && (
          <Pagination total={filtered.length} page={safePage} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} pageSizes={PAGE_SIZES} jump
            dataAttrs={{ 'data-v3-pagination': '', 'data-jump-input': 'present' }} />
        )}
      </section>

      <BatchUnpackSummary />

      <Dialog open={retryOpen} onClose={() => setRetryOpen(false)} title={`重新运行 ${sel.size} 个任务`}
        description="会为每个任务新建一个任务,原任务和它的报告保持不变。" dataAttrs={{ 'data-batch-retry-modal': '' }}
        footer={<><Button variant="secondary" onClick={() => setRetryOpen(false)}>取消</Button><Button variant="primary" onClick={batchRetry} disabled={batchBusy} data-batch-retry-confirm>重新运行</Button></>}>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-control bg-jz-surface-2 p-3 font-mono text-meta text-jz-ink-2">{selTasks.map(taskLine).join('\n')}</pre>
      </Dialog>

      <Dialog open={delOpen} onClose={() => setDelOpen(false)} title={`删除 ${sel.size} 个任务`} role="alertdialog"
        description="删除后无法恢复。运行中和排队中的任务不会被删除,结果里会说明跳过了几个。" dataAttrs={{ 'data-batch-del-modal': '' }}
        footer={<><Button variant="secondary" onClick={() => setDelOpen(false)}>取消</Button><Button variant="danger-solid" onClick={batchDelete} disabled={batchBusy} data-batch-del-confirm>删除</Button></>}>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-control bg-jz-surface-2 p-3 font-mono text-meta text-jz-ink-2">{selTasks.map(taskLine).join('\n')}</pre>
      </Dialog>

      <Dialog open={cleanOpen} onClose={() => setCleanOpen(false)} title={`删除 ${failedInView.length} 个失败任务`} role="alertdialog"
        description="范围是当前搜索和筛选结果里的失败任务。删除后无法恢复,运行中和排队中的任务不受影响。" dataAttrs={{ 'data-clean-failed-modal': '' }}
        footer={<><Button variant="secondary" onClick={() => setCleanOpen(false)}>取消</Button><Button variant="danger-solid" onClick={cleanFailed} disabled={batchBusy} data-clean-failed-confirm>删除</Button></>}>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-control bg-jz-surface-2 p-3 font-mono text-meta text-jz-ink-2">
          {failedInView.slice(0, 12).map((t) => `#${t.id} ${t.app_name || t.package || ''} ${(t.error_msg || '').slice(0, 40)}`).join('\n')}
          {failedInView.length > 12 ? `\n… 共 ${failedInView.length} 个` : ''}
        </pre>
      </Dialog>

      <ConfirmDialog open={!!delAsk} destructive title={`删除任务 #${delAsk?.id ?? ''}`} confirmLabel="删除" outcome="删除后无法恢复。"
        onCancel={() => setDelAsk(null)} onConfirm={() => { const t = delAsk; setDelAsk(null); if (t) void removeTask(t); }}>
        {delAsk ? nameOf(delAsk) : ''} 的任务记录将被删除。
      </ConfirmDialog>

      {artTask != null && (
        <ArtifactsModal taskId={artTask} taskName={(() => { const t = all.find((x) => x.id === artTask); return t ? nameOf(t) : `任务 #${artTask}`; })()}
          linked={sess[artTask] ?? null} onClose={() => setArtTask(null)} />
      )}
      {rerunTask && (
        <RerunTaskModal task={rerunTask} devices={liveDevices || []} onClose={() => setRerunTask(null)}
          onDone={(nt: number) => { setRerunTask(null); setParams({ focus: String(nt) }, { replace: false }); later(600); }} />
      )}
    </Page>
  );
};
