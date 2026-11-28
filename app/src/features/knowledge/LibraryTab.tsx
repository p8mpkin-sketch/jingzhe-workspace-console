// LibraryTab.tsx — the knowledge list: category, search, sort, paging, the table (record cards below 900 px) and the
// entry detail on the right. Local entries (apksec-skills-local) are listed with the backend rows and marked.
import React, { useEffect, useMemo, useState } from 'react';
import { Braces, FolderOpen, RefreshCw } from 'lucide-react';
import { Button, DataTable, DataToolbar, Drawer, EmptyState, ErrorState, PermissionState, SkeletonLoader, StaleNotice, StatusBadge, cx } from '@/components/ui';
import type { Column } from '@/components/ui';
import { STALE_WORD, useSlow } from '@/features/dashboard/readout';
import type { Read } from '@/features/dashboard/readout';
import { categoriesOf, filterSkills, fmtTime, formatSkillPath, isLocal, kindOf, SORTS, STATUS_LABEL } from './knowledgeModel';
import type { SkillRow, SortKey } from './knowledgeModel';
import { SkillDetail } from './SkillDetail';
import type { TaskOption } from './useKnowledgeReads';

export const LibraryTab: React.FC<{
  read: Read<SkillRow[]>; local: SkillRow[]; isAdmin: boolean; tasks: TaskOption[] | null;
  q: string; onQ: (q: string) => void; cat: string; onCat: (c: string) => void; sort: SortKey; onSort: (s: SortKey) => void;
  onScan: () => void; scanning: boolean; onImport: () => void;
  onStatus: (s: SkillRow, status: 'active' | 'disabled') => Promise<void>;
  onDelete: (s: SkillRow) => void;
  /** Rows after category and search, for the page's export. */
  onShown: (rows: SkillRow[]) => void;
}> = ({ read, local, isAdmin, tasks, q, onQ, cat, onCat, sort, onSort, onScan, scanning, onImport, onStatus, onDelete, onShown }) => {
  const backend = read.value;
  const rows = useMemo<SkillRow[]>(() => [...(backend || []), ...local], [backend, local]);
  const cats = useMemo(() => categoriesOf(rows), [rows]);
  const shown = useMemo(() => filterSkills(rows, cat, q, sort), [rows, cat, q, sort]);
  useEffect(() => { onShown(shown); }, [shown, onShown]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  useEffect(() => { setPage(1); }, [q, cat, sort, pageSize]);
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const safePage = Math.min(page, pages);
  const paged = shown.slice((safePage - 1) * pageSize, safePage * pageSize);
  const [mountTid, setMountTid] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const open = openId == null ? null : rows.find((s) => s.id === openId) || null;
  const slow = useSlow(read.state === 'loading');

  const cols: Column<SkillRow>[] = [
    { key: 'name', header: '名称', card: 'title', cell: (s) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-jz-ink" title={s.name}>{s.name}</span>
        {s.description && <span className="truncate text-meta text-jz-muted" title={s.description}>{s.description}</span>}
      </span>
    ) },
    { key: 'kind', header: '来源分类', cell: (s) => <span className="text-jz-ink-2">{kindOf(s).tab}{isLocal(s) && <span className="ml-1 text-jz-muted">· 本地</span>}</span> },
    { key: 'status', header: '状态', cell: (s) => <StatusBadge tone={s.status === 'disabled' ? 'neutral' : s.status === 'draft' ? 'attention' : 'success'}>{STATUS_LABEL[s.status || 'active'] || s.status}</StatusBadge> },
    { key: 'uses', header: '实战', align: 'right', mono: true, width: 'w-20', cell: (s) => ((s.uses || 0) > 0 ? s.uses : <span className="text-jz-muted">—</span>) },
    { key: 'rate', header: '成功率', align: 'right', mono: true, width: 'w-24', cell: (s) => ((s.uses || 0) > 0 ? `${Math.round(((s.wins || 0) / (s.uses || 1)) * 100)}%` : <span className="text-jz-muted" title="没有任务结果记录,不按 0% 计">—</span>) },
    { key: 'path', header: '注册路径', mono: true, cell: (s) => <span className="block max-w-[18rem] truncate text-jz-ink-2" title={s.source_path}>{formatSkillPath(s.source_path).label}</span> },
    { key: 'verified', header: '最近验证', mono: true, width: 'w-28', cell: (s) => fmtTime(s.last_verified_at) },
  ];

  // ↑ ↓ between rows; Enter opens the row (DataTable's row activation).
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-skill-row]');
    if (!el || el !== e.target) return;
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-skill-row][tabindex]')];
    const next = all[all.indexOf(el) + (e.key === 'ArrowDown' ? 1 : -1)];
    if (next) { e.preventDefault(); next.focus(); }
  };

  let state: React.ReactNode = null;
  if (read.state === 'loading') state = (
    <div data-state="loading" data-skills-loading>
      <SkeletonLoader variant="table" rows={5} />
      {slow && <p role="status" className="px-4 pb-3 text-label text-jz-muted" data-slow>仍在读取知识列表,接口响应较慢。</p>}
    </div>
  );
  else if (read.state === 'permission') state = <div data-skills-error><PermissionState title="无权限" message="当前账号不能读取知识列表(接口返回 403)。如需访问,请联系管理员。" /></div>;
  else if (read.state === 'unread') state = <div data-skills-error><ErrorState title="知识列表未读取" message={(read.error as any)?.message || '接口没有返回列表。'} onRetry={read.reload} /></div>;
  else if (rows.length === 0) state = (
    <div data-skills-empty>
      <EmptyState icon={FolderOpen} title="还没有知识条目"
        cause="重新扫描会收编已有的技能目录、项目规则和平台模块;也可以导入技能包或新建本地条目。"
        action={<div className="flex flex-wrap justify-center gap-2">
          <Button variant="secondary" icon={<RefreshCw size={16} aria-hidden />} onClick={onScan} loading={scanning} data-skills-empty-rescan>重新扫描</Button>
          <Button variant="secondary" onClick={onImport} data-skills-empty-import>导入技能包</Button>
        </div>} />
    </div>
  );
  else if (shown.length === 0) state = (
    <div data-skills-tab-empty><div data-skill-search-empty>
      <EmptyState icon={Braces} title="没有符合条件的条目"
        cause={q ? `“${q}”在“${cat}”中没有匹配项,共 ${rows.length} 条。` : `“${cat}”下没有条目。`}
        action={<Button variant="secondary" onClick={() => { onCat('全部'); onQ(''); }} data-skills-reset-tab>清除筛选</Button>} />
    </div></div>
  );

  return (
    <div className="space-y-3" data-knowledge-library>
      {read.state === 'stale' && <StaleNotice reason={`${STALE_WORD},下面是上次读到的列表。`} onRefresh={read.reload} />}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-scene-tabs role="group" aria-label="来源分类">
          {[['全部', rows.length] as [string, number], ...cats].map(([k, n]) => (
            <button key={k} type="button" onClick={() => onCat(k)} data-scene-tab={k} aria-pressed={cat === k}
              className={cx('inline-flex h-8 items-center gap-1.5 rounded-control border px-2.5 text-label transition-colors duration-hover max-[760px]:h-jz-touch',
                cat === k ? 'border-jz-brand bg-jz-brand-soft font-medium text-jz-ink' : 'border-jz-border text-jz-ink-2 hover:bg-jz-hover')}>
              {k}<span className="font-mono text-mono tnum text-jz-muted">{n}</span>
            </button>
          ))}
        </div>
      )}
      <DataToolbar probe="skills"
        search={q} onSearch={onQ} searchPlaceholder="搜索名称、说明、来源、标签…" searchDataAttrs={{ 'data-skill-search': '' }}
        sortOptions={SORTS} sort={sort} onSort={(id) => onSort(id as SortKey)} sortDataAttrs={{ 'data-skill-sort': '' }}
        pager={read.state === 'value' || read.state === 'stale' ? { total: shown.length, page: safePage, pageSize, onPage: setPage, onPageSize: setPageSize } : undefined} />
      <div onKeyDown={onKeyDown} data-skill-grid>
        <DataTable<SkillRow> stickyHeader={false} label="知识条目" columns={cols} rows={state ? [] : paged} rowKey={(s) => s.id} state={state}
          onRowClick={(s) => setOpenId(s.id)}
          rowDataAttrs={(s) => ({ 'data-skill-row': s.id, 'data-skill-card': s.name, 'data-skill-local': isLocal(s) ? '' : undefined })} />
      </div>
      <Drawer open={!!open} width={640} title={open ? open.name : ''} onClose={() => setOpenId(null)}>
        {open && <SkillDetail s={open} isAdmin={isAdmin} tasks={tasks} mountTid={mountTid} onMountTid={setMountTid}
          onStatus={onStatus} onDelete={(s) => { onDelete(s); }} />}
      </Drawer>
    </div>
  );
};
