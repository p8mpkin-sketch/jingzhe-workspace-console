import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, SearchX, Sparkles } from 'lucide-react';
import { api } from '@/services/api';
import { AsyncBoundary, BulkBar, Button, Checkbox, DataTable, EmptyState, Field, Input, Pagination, Panel, SearchField, Select, StatusBadge, Textarea } from '@/components/ui';
import type { Column } from '@/components/ui';
import type { ProjectCtx } from '../ProjectDetailPage';
import { candText, pagesOf, slice, tone } from '../projectModel';
import type { CandidateRow } from '../projectModel';

/** App candidates: apps that may belong to this project. A project-scope entity of its own, not evidence. */
export const CandidatesTab: React.FC<{ ctx: ProjectCtx }> = ({ ctx }) => {
  const { id, project, brands, candidates, apps, busy, setBusy, say } = ctx;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [seed, setSeed] = useState('');
  const [catalog, setCatalog] = useState('');
  const [aptoide, setAptoide] = useState(true);
  const [play, setPlay] = useState(true);
  const [ai, setAi] = useState(false);
  const all = candidates.data ?? [];
  const filtered = useMemo(() => {
    const v = q.trim().toLowerCase();
    return all.filter((c) => (!v || ((c.app_name || '') + ' ' + c.package + ' ' + (c.developer || '')).toLowerCase().includes(v)) && (status === 'all' || c.status === status));
  }, [all, q, status]);
  const shown = slice(filtered, Math.min(page, pagesOf(filtered.length, 8)), 8);
  useEffect(() => { setPage(1); }, [q, status]);

  const discover = async () => {
    setBusy('discover');
    try {
      const r = await api<any>(`/api/pentest/projects/${id}/discover`, { method: 'POST', body: JSON.stringify({
        company_name: project.company_name || project.name || '', brands, packages: seed, catalog_text: catalog, use_aptoide: aptoide, use_play: play, use_ai: ai }) });
      say(`发现完成：${r.stats?.total || 0} 个候选。`);
      await candidates.reload();
    } catch (e: any) { say('发现失败：' + (e?.message || e), true); } finally { setBusy(''); }
  };
  const batch = async (kind: 'verify' | 'download' | 'import') => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBusy(kind);
    try {
      const r = await api<any>(`/api/pentest/projects/${id}/candidates/${kind}`, { method: 'POST', body: JSON.stringify({ ids }) });
      say(kind === 'verify' ? `核验完成：可下载 ${r.verified}，待人工 ${r.manual}。` : kind === 'download' ? `下载完成 ${r.ok}，失败 ${r.failed}。` : `已导入 ${r.imported} 个应用。`);
      await Promise.all([candidates.reload(), ...(kind === 'import' ? [apps.reload()] : [])]);
    } catch (e: any) { say('操作失败：' + (e?.message || e), true); } finally { setBusy(''); }
  };
  const toggle = (key: string | number) => setSelected((p) => { const n = new Set(p); if (n.has(Number(key))) n.delete(Number(key)); else n.add(Number(key)); return n; });
  const toggleAll = (keys: Array<string | number>, allOn: boolean) => setSelected((p) => { const n = new Set(p); keys.forEach((k) => { if (allOn) n.delete(Number(k)); else n.add(Number(k)); }); return n; });

  const cols: Column<CandidateRow>[] = [
    { key: 'app', header: '应用', card: 'title', cell: (c) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-jz-ink">{c.app_name || '—'}</div>
        <div className="break-all font-mono text-meta font-normal text-jz-muted">{c.package}</div>
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

  return (
    <>
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
          <Button icon={<Sparkles size={16} aria-hidden />} loading={busy === 'discover'} disabled={!!busy && busy !== 'discover'} onClick={discover}>发现候选应用</Button>
        </div>
      </Panel>
      <Panel flush title="候选应用" description={candidates.data ? `${filtered.length} / ${all.length} 个` : undefined}
        actions={<>
          <SearchField value={q} onValueChange={setQ} label="搜索候选应用" className="w-56 max-w-full" />
          <div className="w-32 flex-none">
            <Select aria-label="按状态筛选" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">全部状态</option>
              {(Array.from(new Set(all.map((c) => c.status).filter(Boolean))) as string[]).map((s) => <option key={s} value={s}>{candText(s)}</option>)}
            </Select>
          </div>
        </>}>
        <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
          <Button size="sm" variant="secondary" disabled={!!busy} loading={busy === 'verify'} onClick={() => batch('verify')}>核验</Button>
          <Button size="sm" variant="secondary" disabled={!!busy} loading={busy === 'download'} onClick={() => batch('download')}>下载</Button>
          <Button size="sm" disabled={!!busy} loading={busy === 'import'} onClick={() => batch('import')}>导入项目</Button>
        </BulkBar>
        <AsyncBoundary loading={candidates.loading} error={candidates.error} stale={candidates.stale} onRetry={candidates.reload}
          empty={!shown.length}
          emptyState={all.length ? <EmptyState compact icon={SearchX} title="没有匹配的候选应用" /> : <EmptyState compact icon={Sparkles} title="还没有候选应用" cause="在上方选择来源，然后发现候选应用。" />}>
          <DataTable stickyHeader={false} minTableWidth={820} label="候选应用" columns={cols} rows={shown} rowKey={(c) => c.id}
            selected={selected as Set<string | number>} onToggle={toggle} onToggleAll={toggleAll} />
          <Pagination page={page} pageSize={8} total={filtered.length} onPage={setPage} />
        </AsyncBoundary>
      </Panel>
    </>
  );
};
