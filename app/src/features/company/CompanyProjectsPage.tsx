import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, FolderKanban, Plus, RefreshCw, SearchX } from 'lucide-react';
import { api } from '@/services/api';
import {
  AsyncBoundary, Button, Dialog, EmptyState, Field, InlineAlert, Input, Metric, MetricGrid, ObjectCard, Page, PageHeader,
  SearchField, SegmentedControl, Select, SkeletonLoader, StatusBadge, Tag,
} from '@/components/ui';
import { moduleLabel } from '@/layout/navigation';

type Project = {
  id: number; name: string; company_name?: string; kind?: string; brands?: string;
  source?: string; status?: string; app_count?: number; inventory_count?: number;
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

const ProjectCard: React.FC<{ p: Project }> = ({ p }) => {
  const brands = parseBrands(p.brands);
  const count = appCount(p);
  return (
    <ObjectCard data-company-project={p.id}
      title={<Link to={'/company/projects/' + p.id} className="hover:text-jz-brand">{p.name}</Link>}
      subtitle={p.company_name || '未填写公司或集团'}
      badge={<Tag>{kindLabel(p)}</Tag>}
      footer={<>
        <span className="font-mono text-meta text-jz-muted">#{p.id}</span>
        <Link to={'/company/projects/' + p.id} aria-label={`打开项目 ${p.name}`}
          className="inline-flex h-8 items-center gap-1 rounded-control px-2 text-label font-medium text-jz-brand hover:bg-jz-brand-soft">
          打开项目 <ArrowRight size={14} aria-hidden />
        </Link>
      </>}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-label text-jz-ink-2">
        <span><span className="font-mono tnum font-semibold text-jz-ink">{count}</span> 个应用</span>
        <span className="text-jz-muted">{sourceLabel(p.source)}</span>
        {count === 0 && <StatusBadge tone="attention">待导入应用</StatusBadge>}
      </div>
      {brands.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {brands.slice(0, 4).map((b) => <Tag key={b}>{b}</Tag>)}
          {brands.length > 4 && <span className="text-meta text-jz-muted">+{brands.length - 4}</span>}
        </div>
      )}
    </ObjectCard>
  );
};

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
    return { total: rows.length, company, totalApps, withApps };
  }, [rows]);

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

  const dash = !!loadErr && !loaded;
  const openCreate = () => { setFormErr(''); setOpen(true); };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Page data-company-projects>
      <PageHeader title={moduleLabel('/company')}
        description="以公司或集团为范围维护应用清单，批量执行评估，并生成单应用报告与合集报告。"
        actions={<>
          <Button variant="secondary" icon={<RefreshCw size={16} aria-hidden />} loading={refreshing} onClick={() => load(true)}>刷新</Button>
          <Button icon={<Plus size={16} aria-hidden />} onClick={openCreate} data-company-create>新建公司项目</Button>
        </>} />

      <MetricGrid>
        <Metric label="项目" value={dash ? '—' : stats.total} hint="公司级与单应用项目" loading={loading} />
        <Metric label="公司级项目" value={dash ? '—' : stats.company} hint="按公司或集团维护" loading={loading} />
        <Metric label="应用" value={dash ? '—' : stats.totalApps} hint="全部项目清单内的应用数" loading={loading} />
        <Metric label="已有清单的项目" value={dash ? '—' : stats.withApps} hint="至少导入 1 个应用" loading={loading} />
      </MetricGrid>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3" data-company-toolbar>
          <SearchField value={query} onValueChange={setQuery} label="搜索项目、公司或品牌" className="min-w-0 flex-1 basis-64" />
          <SegmentedControl label="项目类型" value={kind} onChange={setKind}
            items={[{ key: 'all', label: '全部' }, { key: 'company', label: '公司级' }, { key: 'single', label: '单应用' }]} />
          <div className="w-36 flex-none">
            <Select aria-label="排序" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="recent">最近创建</option>
              <option value="apps">应用最多</option>
              <option value="name">按名称</option>
            </Select>
          </div>
          <span className="whitespace-nowrap text-label text-jz-muted" aria-live="polite">{visible.length} 个项目</span>
        </div>

        <AsyncBoundary loading={loading} error={loadErr} stale={!!loadErr && loaded} onRetry={() => load(loaded)}
          skeleton={<SkeletonLoader variant="cards" rows={6} className={GRID} />}
          empty={visible.length === 0}
          emptyState={rows.length
            ? <EmptyState icon={SearchX} title="没有匹配的项目" cause="当前的关键词或类型筛选没有结果。"
                action={<Button variant="secondary" onClick={() => { setQuery(''); setKind('all'); }}>清除筛选</Button>} />
            : <EmptyState icon={FolderKanban} title="还没有公司项目" cause="新建一个公司项目，然后在项目内导入应用清单。"
                action={<Button icon={<Plus size={16} aria-hidden />} onClick={openCreate}>新建公司项目</Button>} />}>
          <div className={GRID}>
            {visible.map((p) => <ProjectCard key={p.id} p={p} />)}
          </div>
        </AsyncBoundary>
      </div>

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
