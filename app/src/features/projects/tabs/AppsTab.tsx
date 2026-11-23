import React, { useEffect, useMemo, useState } from 'react';
import { Layers3, SearchX, Upload } from 'lucide-react';
import { api } from '@/services/api';
import { AsyncBoundary, Button, DataTable, EmptyState, Pagination, Panel, SearchField, Select, StatusBadge } from '@/components/ui';
import type { Column } from '@/components/ui';
import type { ProjectCtx } from '../ProjectDetailPage';
import { pagesOf, reportStatus, slice, statusText, tone } from '../projectModel';
import type { AppRow } from '../projectModel';

/** The project's app inventory, with a single-app report per finished app. */
export const AppsTab: React.FC<{ ctx: ProjectCtx }> = ({ ctx }) => {
  const { id, apps, reports, busy, setBusy, say, template, useLlm, download } = ctx;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [tier, setTier] = useState('all');
  const [page, setPage] = useState(1);
  const all = apps.data ?? [];
  const filtered = useMemo(() => {
    const v = q.trim().toLowerCase();
    return all.filter((a) => (!v || ((a.app_name || '') + ' ' + a.package + ' ' + (a.version || '')).toLowerCase().includes(v))
      && (status === 'all' || a.status === status) && (tier === 'all' || a.ownership_tier === tier));
  }, [all, q, status, tier]);
  const shown = slice(filtered, Math.min(page, pagesOf(filtered.length, 10)), 10);
  useEffect(() => { setPage(1); }, [q, status, tier]);

  const gen = async (appId: number) => {
    setBusy('report:app:' + appId);
    try {
      const r = await api<any>(`/api/pentest/projects/${id}/reports`, { method: 'POST', body: JSON.stringify({ kind: 'app', app_id: appId, template, use_llm: useLlm }) });
      say(`报告已生成：${r.pages || '-'} 页。`);
      await Promise.all([reports.reload(), apps.reload()]);
      if (r.id) await download(r.id, 'pdf');
    } catch (e: any) { say('生成失败：' + (e?.message || e), true); } finally { setBusy(''); }
  };

  const cols: Column<AppRow>[] = [
    { key: 'app', header: '应用', card: 'title', cell: (a) => <span className="font-medium text-jz-ink">{a.app_name || '—'}</span> },
    { key: 'package', header: '包名', mono: true, cell: (a) => <span className="break-all">{a.package}</span> },
    { key: 'version', header: '版本', mono: true, cell: (a) => a.version || '—' },
    { key: 'brand', header: '品牌', cell: (a) => a.brand || '—' },
    { key: 'tier', header: '归属', cell: (a) => a.ownership_tier || '—' },
    { key: 'status', header: '状态', cell: (a) => <StatusBadge tone={tone(a.status)}>{statusText(a.status)}</StatusBadge> },
    { key: 'report', header: '报告', cell: (a) => (a.report_status ? reportStatus(a.report_status) : '未生成') },
    { key: 'actions', header: '操作', align: 'right', card: 'action', cell: (a) => (
      <Button size="sm" variant="secondary" disabled={!!busy || a.status !== 'done'} loading={busy === 'report:app:' + a.id} onClick={() => gen(a.id)}
        title={a.status !== 'done' ? '应用评估完成后才能生成报告' : undefined}>生成报告</Button>
    ) },
  ];
  const opts = (vals: (string | undefined)[]) => Array.from(new Set(vals.filter(Boolean))) as string[];

  return (
    <Panel flush title="应用" description={apps.data ? `${filtered.length} / ${all.length} 个` : undefined}
      actions={<>
        <SearchField value={q} onValueChange={setQ} label="搜索应用或包名" className="w-56 max-w-full" />
        <div className="w-32 flex-none">
          <Select aria-label="按状态筛选" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">全部状态</option>
            {opts(all.map((a) => a.status)).map((s) => <option key={s} value={s}>{statusText(s)}</option>)}
          </Select>
        </div>
        <div className="w-32 flex-none">
          <Select aria-label="按归属筛选" value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="all">全部归属</option>
            {opts(all.map((a) => a.ownership_tier)).map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
      </>}>
      <AsyncBoundary loading={apps.loading} error={apps.error} stale={apps.stale} onRetry={apps.reload}
        empty={!shown.length}
        emptyState={all.length ? <EmptyState compact icon={SearchX} title="没有匹配的应用" />
          : <EmptyState compact icon={Layers3} title="清单里还没有应用" cause="导入 APK，或在“候选应用”里发现并导入。单应用项目可以直接在“执行”标签里新建会话。"
              action={<Button variant="secondary" icon={<Upload size={16} aria-hidden />} onClick={ctx.pickFiles}>导入 APK</Button>} />}>
        <DataTable stickyHeader={false} minTableWidth={860} label="应用" columns={cols} rows={shown} rowKey={(a) => a.id} />
        <Pagination page={page} pageSize={10} total={filtered.length} onPage={setPage} />
      </AsyncBoundary>
    </Panel>
  );
};
