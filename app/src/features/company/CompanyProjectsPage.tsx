import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, FolderKanban, Plus, RefreshCw, SearchX } from 'lucide-react';
import { api } from '@/services/api';
import {
  AsyncBoundary, Button, Dialog, EmptyState, Field, FeatureBand, InlineAlert, Input, ObjectCard, Page, PageHeader,
  SearchField, SegmentedControl, Select, SkeletonLoader, StatusBadge, Tag, DataTable, ViewToggle, useViewPreference, cx,
} from '@/components/ui';
import type { Column, ViewMode } from '@/components/ui';
import { moduleLabel } from '@/layout/navigation';

type Project = {
  id: number; name: string; company_name?: string; kind?: string; brands?: string;
  source?: string; status?: string; app_count?: number; inventory_count?: number;
  /** Optional in `types/pentest.ts`; the live list response has not been verified to carry it (see pickPrimary). */
  created_at?: number;
};
type Kind = 'all' | 'company' | 'single';
type Sort = 'recent' | 'apps' | 'name';

const parseBrands = (s?: string): string[] => {
  try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
const appCount = (p: Project) => Number(p.inventory_count ?? p.app_count ?? 0) || 0;
const kindLabel = (p: Project) => p.kind === 'company' ? '公司级' : p.kind === 'single' ? '单应用' : '项目';
const sourceLabel = (s?: string) => s === 'public' ? '公开渠道' : s === 'upload' ? '人工上传' : s === 'device' ? '设备提取' : s === 'client' ? '客户提供' : '来源未标注';

const GRID = 'grid grid-cols-1 gap-4 table:grid-cols-2 desktop:grid-cols-3';

const openLink = 'inline-flex h-8 items-center gap-1 rounded-control px-2 text-label font-medium text-jz-brand hover:bg-jz-brand-soft max-[760px]:h-jz-touch';

/** Compact card for scanning: name, scope, app count; the open link sits in the title row, so there is no footer bar. */
const ProjectCard: React.FC<{ p: Project }> = ({ p }) => {
  const brands = parseBrands(p.brands);
  const count = appCount(p);
  return (
    <ObjectCard compact data-company-project={p.id}
      title={<Link to={'/company/projects/' + p.id} className="hover:text-jz-brand">{p.name}</Link>}
      subtitle={p.company_name || '未填写公司或集团'}
      badge={<Link to={'/company/projects/' + p.id} aria-label={`打开项目 ${p.name}`} className={cx(openLink, '-mr-2 -mt-1')}>
        打开 <ArrowRight size={14} aria-hidden />
      </Link>}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
        <span className="font-display text-section font-semibold tnum text-jz-ink">{count}</span>
        <span className="text-label text-jz-ink-2">个应用</span>
        {count === 0 && <StatusBadge tone="attention">待导入应用</StatusBadge>}
        <span className="ml-auto text-meta text-jz-muted">{kindLabel(p)} · {sourceLabel(p.source)} · <span className="font-mono">#{p.id}</span></span>
      </div>
      {brands.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {brands.slice(0, 4).map((b) => <Tag key={b}>{b}</Tag>)}
          {brands.length > 4 && <span className="text-meta text-jz-muted">+{brands.length - 4}</span>}
        </div>
      )}
    </ObjectCard>
  );
};

const STEPS = [
  ['确定范围', '新建公司项目，填写公司、品牌和授权范围。'],
  ['建立清单', '在项目内导入应用清单，或从候选应用中确认归属。'],
  ['评估与报告', '批量执行评估，再生成单应用报告与合集报告。'],
] as const;

const nextLink = 'inline-flex h-8 items-center gap-1 rounded-control px-2 text-label font-medium text-jz-brand hover:bg-jz-brand-soft max-[760px]:h-jz-touch';

/** Fills the last row when the list is short, so the index never ends in an unexplained gap. */
const NextStepCard: React.FC<{ span: number }> = ({ span }) => (
  <div data-company-next className={cx('flex min-w-0 flex-col justify-between gap-3 rounded-panel border border-jz-border bg-jz-surface-2/50 p-4',
    span === 2 ? 'desktop:col-span-2' : span === 3 ? 'table:col-span-2 desktop:col-span-3' : '')}>
    <div>
      <h3 className="text-body font-semibold text-jz-ink">接下来</h3>
      <ol className="mt-1.5 space-y-1 text-label text-jz-ink-2">
        {STEPS.map(([t, d], i) => <li key={t}>{i + 1}. {d}</li>)}
      </ol>
    </div>
  </div>
);

/**
 * One project: the next step follows from that project's own list fields (no extra request).
 * An empty inventory points to importing apps; otherwise to reports in the project, with discovery as the way to widen scope.
 */
const SoloNext: React.FC<{ p: Project }> = ({ p }) => {
  const empty = appCount(p) === 0;
  return (
    <section data-company-next="solo" aria-labelledby="company-solo-next"
      className="grid min-w-0 gap-4 rounded-panel border border-jz-border bg-jz-surface-2/50 p-4 tablet:grid-cols-2">
      <div className="min-w-0">
        <h3 id="company-solo-next" className="text-body font-semibold text-jz-ink">接下来</h3>
        <p className="mt-1 text-label text-jz-ink-2">
          {empty ? '这个项目的应用清单还是空的，评估和报告都要从导入应用开始。' : `清单里有 ${appCount(p)} 个应用，可以在项目里执行评估并生成项目总报告。`}
        </p>
        <Link to={'/company/projects/' + p.id} className={cx(nextLink, '-ml-2 mt-1')} data-company-next-project>
          {empty ? '进入项目导入应用' : '进入项目生成报告'} <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
      <div className="min-w-0 tablet:border-l tablet:border-jz-border tablet:pl-4">
        <h3 className="text-body font-semibold text-jz-ink">扩大范围</h3>
        <p className="mt-1 text-label text-jz-ink-2">候选发现列出了尚未归属到任何项目的应用，可以从中确认归属，或为另一家公司新建项目。</p>
        <Link to="/discovery" className={cx(nextLink, '-ml-2 mt-1')} data-company-discovery>查看候选发现 <ArrowRight size={14} aria-hidden /></Link>
      </div>
    </section>
  );
};

/** Shown in place of the lead band when there are no projects: what a company project is and how it proceeds. */
const StartBand: React.FC = () => (
  <section className="min-w-0 border-y border-jz-border" data-band="editorial" data-company-start>
    <div className="grid gap-x-10 gap-y-6 py-6 desktop:grid-cols-12">
      <div className="flex min-w-0 flex-col gap-4 desktop:col-span-5">
        <div className="text-label font-medium text-jz-brand">开始一个公司项目</div>
        <h2 className="font-display text-page font-semibold text-jz-ink">以公司为范围整理应用和报告</h2>
        <p className="text-body text-jz-ink-2">一个公司项目对应一家公司或集团，按右侧三步推进。</p>
      </div>
      <ol className="grid min-w-0 gap-4 tablet:grid-cols-3 desktop:col-span-7 desktop:border-l desktop:border-jz-border desktop:pl-10">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="flex min-w-0 flex-col gap-1.5 border-t border-jz-border pt-3">
            <span className="font-mono text-label text-jz-muted">0{i + 1}</span>
            <span className="text-body font-semibold text-jz-ink">{t}</span>
            <span className="text-label text-jz-ink-2">{d}</span>
          </li>
        ))}
      </ol>
    </div>
  </section>
);

/** Ends the empty index with the decision to make: create now, or look at unassigned apps first. */
const StartNext: React.FC<{ onCreate: () => void }> = ({ onCreate }) => (
  <section data-company-start-next aria-labelledby="company-start-next"
    className="flex min-w-0 flex-wrap items-center justify-between gap-4 rounded-panel border border-jz-border bg-jz-surface p-5 shadow-card">
    <div className="min-w-0 flex-1 basis-80">
      <h3 id="company-start-next" className="text-body font-semibold text-jz-ink">还没有公司项目</h3>
      <p className="mt-1 text-label text-jz-ink-2">项目列表加载成功，结果为空。可以直接新建；不确定范围时，先看候选发现里尚未归属的应用。</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Link to="/discovery" className="inline-flex h-jz-control items-center gap-1.5 rounded-control border border-jz-border bg-jz-surface px-3 text-label font-medium text-jz-ink hover:bg-jz-surface-2" data-company-discovery>
        先看候选发现
      </Link>
      <Button icon={<Plus size={16} aria-hidden />} onClick={onCreate} data-company-start-create>新建公司项目</Button>
    </div>
  </section>
);

const projectColumns: Column<Project>[] = [
  { key: 'name', header: '项目', card: 'title', cell: (p) => (
    <div className="min-w-0">
      <Link to={'/company/projects/' + p.id} className="font-medium text-jz-ink hover:text-jz-brand">{p.name}</Link>
      <div className="truncate text-meta text-jz-muted">{p.company_name || '未填写公司或集团'}</div>
    </div>
  ) },
  { key: 'kind', header: '类型', width: 'w-24', cell: (p) => <Tag>{kindLabel(p)}</Tag> },
  { key: 'brands', header: '品牌', cell: (p) => {
    const b = parseBrands(p.brands);
    return b.length ? <span className="text-label text-jz-ink-2">{b.slice(0, 3).join(' / ')}{b.length > 3 ? ` +${b.length - 3}` : ''}</span> : <span className="text-meta text-jz-muted">—</span>;
  } },
  { key: 'source', header: '来源', width: 'w-28', cell: (p) => <span className="text-label text-jz-ink-2">{sourceLabel(p.source)}</span> },
  { key: 'apps', header: '应用', align: 'right', width: 'w-24', cell: (p) => {
    const n = appCount(p);
    return n ? <span className="font-mono tnum">{n}</span> : <StatusBadge tone="attention">待导入</StatusBadge>;
  } },
  { key: 'id', header: '编号', mono: true, width: 'w-20', card: 'hidden', cell: (p) => <span className="text-jz-muted">#{p.id}</span> },
  { key: 'open', header: <span className="sr-only">操作</span>, label: '操作', align: 'right', width: 'w-24', card: 'action', cell: (p) => (
    <Link to={'/company/projects/' + p.id} aria-label={`打开项目 ${p.name}`} className={openLink}>打开 <ArrowRight size={14} aria-hidden /></Link>
  ) },
];

/**
 * The lead project: the most recently created company-level project.
 * Ordered by `created_at` only when every candidate carries a finite value; otherwise by id, which grows with creation.
 * TODO(api): confirm GET /api/pentest/projects returns created_at for every row. Until then the id order is what
 * production uses; the frontend never derives or displays a date it was not given.
 */
const byRecency = (list: Project[]): Project[] => {
  const timed = list.length > 0 && list.every((p) => typeof p.created_at === 'number' && Number.isFinite(p.created_at) && p.created_at > 0);
  return [...list].sort((a, b) => (timed ? (b.created_at as number) - (a.created_at as number) : 0) || b.id - a.id);
};
const pickPrimary = (rows: Project[]): Project | undefined =>
  byRecency(rows.filter((p) => p.kind === 'company'))[0] ?? byRecency(rows)[0];

export const CompanyProjectsPage: React.FC = () => {
  const nav = useNavigate();
  const [rows, setRows] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [form, setForm] = useState({ name: '', company_name: '', brands: 'TECNO,Infinix,itel', source: 'device', note: '' });

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      setRows(await api<Project[]>('/api/pentest/projects'));
      setLoadErr(null);
      setLoaded(true);
    } catch (e: any) {
      setLoadErr(e ?? new Error('加载失败'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim()) { setFormErr('请填写项目名称'); return; }
    setBusy(true); setFormErr('');
    try {
      const brands = form.brands.split(',').map((x) => x.trim()).filter(Boolean);
      const r = await api<{ id: number }>('/api/pentest/projects', {
        method: 'POST',
        body: JSON.stringify({ ...form, kind: 'company', status: 'draft', brands }),
      });
      nav('/company/projects/' + r.id);
    } catch (e: any) {
      setFormErr('创建失败：' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const stats = useMemo(() => {
    const company = rows.filter((p) => p.kind === 'company').length;
    const totalApps = rows.reduce((n, p) => n + appCount(p), 0);
    const withApps = rows.filter((p) => appCount(p) > 0).length;
    return { total: rows.length, company, single: rows.length - company, totalApps, withApps };
  }, [rows]);
  const primary = useMemo(() => pickPrimary(rows), [rows]);
  const filtering = !!query.trim() || kind !== 'all';

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows.filter((p) => {
      const text = p.name + ' ' + (p.company_name || '') + ' ' + (p.brands || '');
      return (!q || text.toLowerCase().includes(q)) && (kind === 'all' || p.kind === kind);
    });
    if (sort === 'apps') list = [...list].sort((a, b) => appCount(b) - appCount(a) || b.id - a.id);
    else if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    else list = [...list].sort((a, b) => b.id - a.id);
    return list;
  }, [rows, query, kind, sort]);
  // Without filters the active project leads in the band, so the list holds the others; a search lists every match.
  const listed = filtering || !primary ? visible : visible.filter((p) => p.id !== primary.id);
  const [view, setView] = useViewPreference<ViewMode>('company-projects', 'cards', ['cards', 'table']);

  const dash = !!loadErr && !loaded;
  const openCreate = () => { setFormErr(''); setOpen(true); };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const fill = view === 'cards' && !filtering ? (3 - (listed.length % 3)) % 3 || (listed.length < 3 ? 3 : 0) : 0;

  const primaryBrands = primary ? parseBrands(primary.brands) : [];
  const portfolio = (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 tablet:grid-cols-3 desktop:grid-cols-1" data-company-portfolio>
      {[
        ['项目', stats.total, `公司级 ${stats.company} · 单应用 ${stats.single}`],
        ['应用', stats.totalApps, '全部项目清单内的应用数'],
        ['已有清单', `${stats.withApps}/${stats.total}`, '至少导入 1 个应用的项目'],
      ].map(([l, v, h]) => (
        <div key={l as string} className="flex min-w-0 items-baseline justify-between gap-3 desktop:border-b desktop:border-jz-border desktop:pb-3 desktop:last:border-0 desktop:last:pb-0">
          <div className="min-w-0"><dt className="text-label font-medium text-jz-ink-2">{l}</dt><dd className="truncate text-meta text-jz-muted">{h}</dd></div>
          <dd className="flex-none font-display text-title font-semibold tnum text-jz-ink">{dash ? '—' : v}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <Page data-company-projects>
      <PageHeader title={moduleLabel('/company')}
        description="以公司或集团为范围维护应用清单，批量执行评估，并生成单应用报告与合集报告。"
        actions={<>
          <Button variant="secondary" icon={<RefreshCw size={16} aria-hidden />} loading={refreshing} onClick={() => load(true)}>刷新</Button>
          <Button icon={<Plus size={16} aria-hidden />} onClick={openCreate} data-company-create>新建公司项目</Button>
        </>} />

      {!loading && loaded && !loadErr && rows.length === 0 && <><StartBand /><StartNext onCreate={openCreate} /></>}
      {loading && <div className="h-56 rounded-panel border border-jz-border bg-jz-surface motion-safe:animate-pulse" role="status" aria-label="加载中" />}
      {!loading && primary && (
        <FeatureBand variant="editorial" data-company-primary={primary.id}
          eyebrow={primary.kind === 'company' ? '最近创建的公司项目' : '最近创建的项目'}
          title={<Link to={'/company/projects/' + primary.id} className="hover:text-jz-brand">{primary.name}</Link>}
          subtitle={<>{primary.company_name || '未填写公司或集团'}<span className="text-jz-muted"> · {kindLabel(primary)} · <span className="font-mono">#{primary.id}</span></span></>}
          tags={primaryBrands.length ? primaryBrands.slice(0, 8).map((b) => <Tag key={b}>{b}</Tag>) : undefined}
          facts={[
            { label: '清单内应用', value: appCount(primary), tone: appCount(primary) ? 'default' : 'attention', hint: appCount(primary) ? undefined : '待导入应用' },
            { label: '品牌', value: primaryBrands.length || '—' },
            { label: '来源', value: primary.source ? sourceLabel(primary.source) : '未标注' },
          ]}
          actions={<Link to={'/company/projects/' + primary.id} data-company-primary-open
            className="inline-flex h-jz-control-lg items-center gap-2 rounded-control bg-jz-brand px-4 text-body font-medium text-jz-on-brand hover:bg-jz-brand/90">
            打开项目 <ArrowRight size={16} aria-hidden />
          </Link>}
          aside={portfolio} />
      )}

      {loaded && !loadErr && rows.length === 1 && primary && <SoloNext p={primary} />}
      {!(loaded && !loadErr && rows.length <= 1) && <section className="flex flex-col gap-3" aria-label="项目列表">
        <div className="flex flex-wrap items-center gap-3" data-company-toolbar>
          <h2 className="jz-section mr-auto text-jz-ink">{dash ? '项目列表' : filtering ? '筛选结果' : primary ? <>其他项目 <span className="font-mono text-jz-muted">· {listed.length}</span></> : '全部项目'}</h2>
          {(rows.length > 1 || filtering) && <>
          <SearchField value={query} onValueChange={setQuery} label="搜索项目、公司或品牌" className="min-w-0 flex-1 basis-64 desktop:max-w-md" />
          <SegmentedControl label="项目类型" value={kind} onChange={setKind}
            items={[{ key: 'all', label: '全部' }, { key: 'company', label: '公司级' }, { key: 'single', label: '单应用' }]} />
          <div className="w-36 flex-none">
            <Select aria-label="排序" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="recent">最近创建</option>
              <option value="apps">应用最多</option>
              <option value="name">按名称</option>
            </Select>
          </div>
          <ViewToggle value={view} onChange={setView} />
          </>}
          {loaded && <span className="whitespace-nowrap text-label text-jz-muted" aria-live="polite">共 {visible.length} 个项目</span>}
        </div>

        <AsyncBoundary loading={loading} error={loadErr} stale={!!loadErr && loaded} onRetry={() => load(loaded)}
          skeleton={<SkeletonLoader variant="cards" rows={6} className={GRID} />}
          empty={visible.length === 0}
          emptyState={rows.length
            ? <EmptyState icon={SearchX} title="没有匹配的项目" cause="当前的关键词或类型筛选没有结果。"
                action={<Button variant="secondary" onClick={() => { setQuery(''); setKind('all'); }}>清除筛选</Button>} />
            : <EmptyState icon={FolderKanban} title="还没有公司项目" cause="新建一个公司项目，然后在项目内导入应用清单。"
                action={<Button icon={<Plus size={16} aria-hidden />} onClick={openCreate}>新建公司项目</Button>} />}>
          {view === 'table'
            ? <div className="overflow-hidden rounded-panel border border-jz-border bg-jz-surface shadow-card">
                <DataTable label="公司项目" columns={projectColumns} rows={listed} rowKey={(p) => p.id} rowDataAttrs={(p) => ({ 'data-company-project': p.id })}
                  footer={!filtering && listed.length < 4 ? <p className="px-4 py-3 text-meta text-jz-muted">{primary ? '最近创建的公司项目在上方单独列出。' : ''}共 {visible.length} 个项目。</p> : undefined} />
              </div>
            : <div className={GRID}>
                {listed.map((p) => <ProjectCard key={p.id} p={p} />)}
                {fill > 0 && listed.length > 0 && <NextStepCard span={fill} />}
              </div>}
        </AsyncBoundary>
      </section>}

      <Dialog open={open} onClose={() => setOpen(false)} title="新建公司项目"
        description="先确定范围，创建后进入项目，再导入应用。"
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>取消</Button>
          <Button icon={<Plus size={16} aria-hidden />} loading={busy} onClick={create}>创建项目</Button>
        </>}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="项目名称" required className="md:col-span-2" error={formErr && !form.name.trim() ? formErr : undefined}>
            {(ids) => <Input ids={ids} data-autofocus value={form.name} onChange={set('name')} placeholder="例如：某集团 2026 应用批量评估" />}
          </Field>
          <Field label="公司或集团">
            {(ids) => <Input ids={ids} value={form.company_name} onChange={set('company_name')} />}
          </Field>
          <Field label="来源">
            {(ids) => (
              <Select ids={ids} value={form.source} onChange={set('source')}>
                <option value="device">设备提取</option><option value="public">公开渠道</option><option value="client">客户提供</option>
              </Select>
            )}
          </Field>
          <Field label="品牌" hint="多个品牌用英文逗号分隔" className="md:col-span-2">
            {(ids) => <Input ids={ids} value={form.brands} onChange={set('brands')} />}
          </Field>
          <Field label="备注与授权范围" className="md:col-span-2">
            {(ids) => <Input ids={ids} value={form.note} onChange={set('note')} placeholder="例如：仅评估公司自有应用，授权编号" />}
          </Field>
        </div>
        {formErr && form.name.trim() && <InlineAlert tone="danger">{formErr}</InlineAlert>}
      </Dialog>
    </Page>
  );
};
