import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building2, CheckCircle2, ChevronDown, ChevronRight, FolderKanban,
  Layers3, Loader2, Plus, RefreshCw, Search, X, Boxes, SlidersHorizontal,
} from 'lucide-react';
import { api } from '@/services/api';

const inputCls = 'w-full rounded-card border border-jz-border/70 bg-jz-surface px-3.5 py-2.5 text-body text-jz-ink outline-none transition-colors placeholder:text-jz-muted focus:border-jz-brand/70 focus:ring-2 focus:ring-jz-brand/10';
const btn = 'inline-flex items-center justify-center gap-1.5 rounded-card px-3.5 py-2.5 text-meta font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none';
const btnPrimary = btn + ' bg-jz-brand text-jz-canvas shadow-card hover:brightness-110';
const btnGhost = btn + ' border border-jz-border/70 bg-jz-surface text-jz-ink-2 hover:border-jz-brand/40 hover:text-jz-ink';

type Project = {
  id: number; name: string; company_name?: string; kind?: string; brands?: string;
  source?: string; status?: string; app_count?: number; inventory_count?: number;
};

const parseBrands = (s?: string): string[] => {
  try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
const appCount = (p: Project) => Number(p.inventory_count ?? p.app_count ?? 0) || 0;
const kindLabel = (p: Project) => p.kind === 'company' ? '公司级' : p.kind === 'single' ? '单 APP' : '项目';
const sourceLabel = (s?: string) => s === 'public' ? '公开渠道' : s === 'upload' ? '人工上传' : s === 'device' ? '设备提取' : s === 'client' ? '客户提供' : '未标注';

const StatCard: React.FC<{ label: string; value: React.ReactNode; hint: string; icon: React.ReactNode; tone: string }> = ({ label, value, hint, icon, tone }) => (
  <div className="rounded-panel border border-jz-border/70 bg-jz-surface p-4 shadow-card">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-meta font-medium text-jz-muted">{label}</div>
        <div className="mt-1.5 text-title font-semibold tracking-tight text-jz-ink">{value}</div>
        <div className="mt-1 text-meta text-jz-muted">{hint}</div>
      </div>
      <div className={'grid h-9 w-9 place-items-center rounded-card border ' + tone}>{icon}</div>
    </div>
  </div>
);

const ProjectCard: React.FC<{ p: Project }> = ({ p }) => {
  const brands = parseBrands(p.brands);
  const count = appCount(p);
  const isCompany = p.kind === 'company';
  return (
    <Link
      to={'/company/projects/' + p.id}
      className="group flex min-h-[196px] flex-col overflow-hidden rounded-panel border border-jz-border/70 bg-jz-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-jz-brand/50 hover:shadow-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className={'grid h-10 w-10 place-items-center rounded-card border ' + (isCompany ? 'border-jz-brand/25 bg-jz-brand/10 text-jz-brand' : 'border-jz-border/70 bg-jz-surface-2/30 text-jz-ink-2')}>
          {isCompany ? <Building2 size={18} /> : <Boxes size={18} />}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={'rounded-control border px-1.5 py-0.5 text-meta font-medium ' + (isCompany ? 'border-jz-brand/25 bg-jz-brand/10 text-jz-brand' : 'border-jz-border/60 bg-jz-surface-2/30 text-jz-muted')}>{kindLabel(p)}</span>
          <span className="rounded-control border border-jz-border/60 bg-jz-surface-2/20 px-1.5 py-0.5 font-mono text-meta text-jz-muted">#{p.id}</span>
        </div>
      </div>
      <div className="mt-3 min-w-0">
        <h3 className="line-clamp-2 text-body font-semibold leading-snug text-jz-ink group-hover:text-jz-brand">{p.name}</h3>
        <div className="mt-1 truncate text-meta text-jz-muted">{p.company_name || '未填写公司 / 集团'}</div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-meta text-jz-muted">
        <span className="inline-flex items-center gap-1"><Layers3 size={12} />{count} APP</span>
        <span className="h-3 w-px bg-jz-border/70" />
        <span className="truncate">{sourceLabel(p.source)}</span>
        {count === 0 && <span className="ml-auto rounded-control bg-jz-amber/10 px-1.5 py-0.5 text-jz-amber">待导入</span>}
      </div>
      {brands.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {brands.slice(0, 4).map((b) => <span key={b} className="rounded-control bg-jz-surface-2/40 px-1.5 py-0.5 text-meta text-jz-ink-2">{b}</span>)}
          {brands.length > 4 && <span className="px-1 text-meta text-jz-muted">+{brands.length - 4}</span>}
        </div>
      )}
      <div className="mt-auto flex items-center justify-between border-t border-jz-border/50 pt-3">
        <span className="text-meta text-jz-muted">{count > 0 ? '清单与报告已就绪' : '进入项目导入 APP'}</span>
        <span className="inline-flex items-center gap-1 text-meta font-semibold text-jz-brand">进入项目 <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" /></span>
      </div>
    </Link>
  );
};

export const CompanyProjectsPage: React.FC = () => {
  const nav = useNavigate();
  const [rows, setRows] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'company' | 'single'>('all');
  const [sort, setSort] = useState<'recent' | 'apps' | 'name'>('recent');
  const [form, setForm] = useState({ name: '', company_name: '', brands: 'TECNO,Infinix,itel', source: 'device', note: '' });

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      setRows(await api<Project[]>('/api/pentest/projects'));
      setMsg('');
    } catch (e: any) {
      setMsg('加载失败：' + (e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim()) { setMsg('项目名称必填'); return; }
    setBusy(true); setMsg('');
    try {
      const brands = form.brands.split(',').map((x) => x.trim()).filter(Boolean);
      const r = await api<{ id: number }>('/api/pentest/projects', {
        method: 'POST',
        body: JSON.stringify({ ...form, kind: 'company', status: 'draft', brands }),
      });
      nav('/company/projects/' + r.id);
    } catch (e: any) {
      setMsg('创建失败：' + (e?.message || e));
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

  return (
    <div className="min-h-full w-full p-4 md:p-6 lg:p-8 xl:p-10" data-company-projects>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-meta font-mono text-jz-brand">
            <FolderKanban size={13} /> COMPANY / GROUP
          </div>
          <h1 className="mt-2 text-title font-semibold tracking-tight text-jz-ink md:text-page">公司级 APK 评估项目</h1>
          <p className="mt-1.5 max-w-2xl text-body leading-6 text-jz-muted">以公司 / 集团为范围，统一维护 APP 清单、执行批量评估、生成单 APP 与合集报告。</p>
        </div>
        <div className="flex items-center gap-2">
          <button className={btnGhost} onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />刷新
          </button>
          <button className={btnPrimary} onClick={() => { setMsg(''); setOpen(true); }}>
            <Plus size={15} />新建公司项目
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="项目总数" value={stats.total} hint="公司级 + 单 APP 项目" icon={<FolderKanban size={16} />} tone="border-jz-brand/25 bg-jz-brand/10 text-jz-brand" />
        <StatCard label="公司级项目" value={stats.company} hint="按公司 / 集团维护" icon={<Building2 size={16} />} tone="border-jz-brand/25 bg-jz-brand/10 text-jz-brand" />
        <StatCard label="覆盖 APP" value={stats.totalApps} hint="项目清单内 APP 总数" icon={<Layers3 size={16} />} tone="border-jz-teal/25 bg-jz-teal/10 text-jz-teal" />
        <StatCard label="已有清单" value={stats.withApps} hint="至少导入 1 个 APP" icon={<CheckCircle2 size={16} />} tone="border-jz-amber/25 bg-jz-amber/10 text-jz-amber" />
      </div>

      {msg && <div className="mt-4 flex items-start gap-2 rounded-card border border-jz-red/30 bg-jz-red/10 px-3.5 py-2.5 text-meta text-jz-red"><span className="mt-0.5">●</span><span>{msg}</span></div>}

      <div className="mt-6 flex flex-col gap-3 rounded-panel border border-jz-border/70 bg-jz-surface p-3 shadow-card lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-jz-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} className={inputCls + ' pl-9'} placeholder="搜索项目、公司或品牌…" />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          <SlidersHorizontal size={14} className="shrink-0 text-jz-muted" />
          {([['all', '全部'], ['company', '公司级'], ['single', '单 APP']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setKind(v)} className={'shrink-0 rounded-control px-2.5 py-1.5 text-meta font-semibold transition-colors ' + (kind === v ? 'bg-jz-brand/15 text-jz-brand' : 'text-jz-muted hover:bg-jz-surface-2/40 hover:text-jz-ink')}>{label}</button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 lg:justify-end">
          <span className="whitespace-nowrap text-meta text-jz-muted">{visible.length} 个结果</span>
          <div className="relative">
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="appearance-none rounded-control border border-jz-border/70 bg-jz-surface py-1.5 pl-2.5 pr-7 text-meta text-jz-ink-2 outline-none">
              <option value="recent">最近创建</option>
              <option value="apps">APP 最多</option>
              <option value="name">名称排序</option>
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-jz-muted" />
          </div>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-[196px] animate-pulse rounded-panel border border-jz-border/60 bg-jz-surface/60" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="grid min-h-[280px] place-items-center rounded-panel border border-dashed border-jz-border/80 bg-jz-surface/40 px-6 text-center">
            <div>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-panel border border-jz-border/70 bg-jz-surface-2/30 text-jz-muted"><FolderKanban size={22} /></div>
              <div className="mt-3 text-body font-semibold text-jz-ink">{rows.length ? '没有匹配的项目' : '还没有公司项目'}</div>
              <div className="mt-1 text-meta text-jz-muted">{rows.length ? '换个关键词或清除筛选条件。' : '新建一个公司项目，开始导入 APP 清单。'}</div>
              <button className={btnPrimary + ' mt-4'} onClick={() => { if (rows.length) { setQuery(''); setKind('all'); } else setOpen(true); }}>{rows.length ? '清除筛选' : '新建公司项目'}</button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.map((p) => <ProjectCard key={p.id} p={p} />)}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-jz-scrim/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="w-full max-w-2xl overflow-hidden rounded-t-dialog border border-jz-border/80 bg-jz-surface shadow-dialog sm:rounded-dialog">
            <div className="flex items-start justify-between border-b border-jz-border/60 px-5 py-4">
              <div>
                <div className="text-meta font-mono text-jz-brand">NEW COMPANY PROJECT</div>
                <h2 className="mt-1 text-section font-semibold text-jz-ink">新建公司项目</h2>
                <p className="mt-1 text-meta text-jz-muted">先建范围，再导入 APP；后续可在项目内发现/上传/执行。</p>
              </div>
              <button className="grid h-8 w-8 place-items-center rounded-control text-jz-muted hover:bg-jz-surface-2/50 hover:text-jz-ink" onClick={() => setOpen(false)}><X size={17} /></button>
            </div>
            <div className="grid max-h-[70vh] gap-3 overflow-y-auto p-5 md:grid-cols-2">
              <label className="text-meta text-jz-muted md:col-span-2">项目名称 <span className="text-jz-brand">*</span><input autoFocus className={inputCls + ' mt-1'} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：传音控股 2026 APK 批量评估" /></label>
              <label className="text-meta text-jz-muted">公司 / 集团<input className={inputCls + ' mt-1'} value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="Transsion Holdings" /></label>
              <label className="text-meta text-jz-muted">来源<select className={inputCls + ' mt-1'} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}><option value="device">设备提取</option><option value="public">公开渠道</option><option value="client">客户提供</option></select></label>
              <label className="text-meta text-jz-muted md:col-span-2">品牌（逗号分隔）<input className={inputCls + ' mt-1'} value={form.brands} onChange={(e) => setForm({ ...form, brands: e.target.value })} placeholder="TECNO,Infinix,itel" /></label>
              <label className="text-meta text-jz-muted md:col-span-2">备注 / 授权范围<input className={inputCls + ' mt-1'} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="例如：仅评估公司自有应用，授权编号…" /></label>
            </div>
            <div className="flex items-center justify-between border-t border-jz-border/60 px-5 py-4">
              <span className="text-meta text-jz-muted">创建后进入项目详情，可继续导入 APP。</span>
              <div className="flex gap-2">
                <button className={btnGhost} onClick={() => setOpen(false)}>取消</button>
                <button className={btnPrimary} disabled={busy} onClick={create}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}创建项目</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
