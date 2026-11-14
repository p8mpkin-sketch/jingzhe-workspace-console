// SystemPage.tsx — system administration: models, users, audit log, resource usage, API tokens and webhooks.
// Requests, payloads and data-* hooks are unchanged; only the presentation is new.
import React, { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { useAuth } from '@/stores/auth';
import {
  Page, PageHeader, Panel, Metric, MetricGrid, Tabs, DataTable, Pagination, Button, IconButton, Field, Input, Select, SearchField,
  StatusBadge, Tag, Dialog, ConfirmDialog, Drawer, EmptyState, ErrorState, PermissionState, InlineAlert, SkeletonLoader, cx,
} from '@/components/ui';
import type { Column, TabItem } from '@/components/ui';
import { Copy, KeyRound, Plus, ScrollText, Trash2, Users, Webhook } from 'lucide-react';
import { moduleLabel } from '@/layout/navigation';
import { ModelConsole } from './ModelConsole';

type Tab = 'models' | 'users' | 'audit' | 'resources' | 'tokens';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'models', label: '模型服务' },
  { key: 'users', label: '用户与权限' },
  { key: 'audit', label: '审计日志' },
  { key: 'resources', label: '资源用量' },
  { key: 'tokens', label: 'API Token' },
];

export const SystemPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('models');
  const role = useAuth((s) => s.me?.role) || '';
  const isAdmin = role === 'admin' || role === 'super_admin' || role === 'org_admin';
  // Non-admins get no admin tabs at all (direct links included).
  if (!isAdmin) {
    return (
      <Page data-system-page>
        <PageHeader title={moduleLabel('/system')} />
        <Panel data-system-noauth>
          <PermissionState title="需要管理员权限"
            message={<>系统管理(模型服务、用户与权限、审计日志)只对管理员开放。当前角色:<span className="font-mono">{role || '未知'}</span>。</>} />
        </Panel>
      </Page>
    );
  }
  const items: TabItem<Tab>[] = TABS.map((t) => ({ key: t.key, label: t.label, dataAttrs: { 'data-system-tab': t.key } }));
  return (
    <Page data-system-page>
      <PageHeader title={moduleLabel('/system')} description="模型服务、账号、审计记录、资源用量和开放接口。" />
      <Tabs items={items} value={tab} onChange={setTab} label="系统设置" />
      <div className="space-y-6" role="tabpanel" aria-label={TABS.find((t) => t.key === tab)?.label}>
        {tab === 'models' && <ModelsTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'audit' && <AuditTab />}
        {tab === 'resources' && <ResourceStatsTab />}
        {tab === 'tokens' && <TokensTab />}
        {tab === 'tokens' && <WebhookPanel />}
      </div>
    </Page>
  );
};

// ─── Resource usage: tokens in the last 30 days, disk, concurrency (GET /api/system/resource-stats) ───
function ResourceStatsTab() {
  const [stats, setStats] = useState<any>(null);
  const [err, setErr] = useState('');
  const load = () => { setErr(''); api<any>('/api/system/resource-stats').then(setStats).catch((e) => setErr(e.message || String(e))); };
  useEffect(() => { load(); }, []);
  if (err && !stats) return <Panel><ErrorState title="资源用量加载失败" message={err} onRetry={load} /></Panel>;
  if (!stats) return <MetricGrid><Metric label="已用 Token(近 30 天)" value="" loading /><Metric label="磁盘占用" value="" loading /><Metric label="并发" value="" loading /></MetricGrid>;
  const fmtTok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));
  const diskTotalMb = stats.disk.runs_mb + stats.disk.apk_pool_mb + stats.disk.db_mb;
  const quotaMb = stats.disk.quota_storage_mb;
  const full = stats.slots.running >= stats.slots.quota_concurrent;
  return (
    <div className="space-y-4" data-resource-stats>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 desktop:gap-4">
        <Metric label="已用 Token(近 30 天)"
          title="近 30 天所有模型调用回传的输入和输出 Token 合计。没有回传用量的调用不计入。"
          value={fmtTok(stats.llm.prompt_tokens_30d + stats.llm.completion_tokens_30d)}
          hint={<>输入 {fmtTok(stats.llm.prompt_tokens_30d)} · 输出 {fmtTok(stats.llm.completion_tokens_30d)} · <span className="tnum">{stats.llm.calls_30d}</span> 次调用</>} />
        <Metric label="磁盘占用"
          title={`任务产物、安装包池和数据库三处的占用。后台每 10 分钟重新计算一次${stats.disk.computed_at ? `,当前数据计算于 ${stats.disk.computed_at}` : ''}。${quotaMb >= 0 ? `组织配额 ${quotaMb}MB。` : '组织没有设置配额。'}`}
          value={stats.disk.computing ? <span className="text-section text-jz-muted" data-disk-computing>正在计算</span> : `${diskTotalMb} MB`}
          hint={stats.disk.computing ? '后台计算中,约 1–2 分钟后刷新查看'
            : <>产物 {stats.disk.runs_mb} · 安装包 {stats.disk.apk_pool_mb} · 数据库 {stats.disk.db_mb}{quotaMb >= 0 ? ` · 配额 ${quotaMb}MB` : ''}</>} />
        <Metric label="并发" tone={full ? 'attention' : 'default'}
          title="正在运行和排队的任务数,对比组织允许的最大并发数。达到上限后新任务会被拒绝。"
          value={`${stats.slots.running}/${stats.slots.quota_concurrent}`}
          hint={full ? '已达上限,新任务会被拒绝' : '运行中和排队的任务 / 最大并发'} />
      </div>
      <p className="text-meta text-jz-muted">
        Token 和并发是请求时的实时数值;磁盘是后台每 10 分钟计算一次的结果{stats.disk.computed_at ? `(计算于 ${stats.disk.computed_at})` : ''}。
      </p>
    </div>
  );
}

function ModelsTab() {
  return (
    <>
      <ModelConsole />
      <FeedbackStats />
    </>
  );
}

// Feedback on assistant suggestions (GET /api/feedback).
function FeedbackStats() {
  const [items, setItems] = useState<Array<any>>([]);
  useEffect(() => {
    const t = localStorage.getItem('token') || '';
    fetch('/api/feedback', { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => r.json()).then((d) => setItems(d.items || [])).catch(() => {});
  }, []);
  const up = items.filter((i) => i.verdict === 'up').length;
  const down = items.filter((i) => i.verdict === 'down').length;
  return (
    <Panel title="建议反馈" description="用户对智能体建议的评价" data-feedback-stats>
      <div className="flex flex-wrap items-center gap-2 text-label">
        <StatusBadge tone="success">有用 <span className="tnum">{up}</span></StatusBadge>
        <StatusBadge tone="neutral">没用 <span className="tnum">{down}</span></StatusBadge>
      </div>
      {items.length ? (
        <ul className="mt-3 space-y-1 text-label">
          {items.slice(-3).map((i, k) => (
            <li key={k} className="truncate text-jz-ink-2"><span className="font-mono text-meta text-jz-muted">{i.card_id}</span> · {i.verdict === 'up' ? '有用' : i.verdict === 'down' ? '没用' : i.verdict} · {i.note || '没有备注'}</li>
          ))}
        </ul>
      ) : <p className="mt-3 text-meta text-jz-muted">还没有反馈。</p>}
    </Panel>
  );
}

// ─── Users and roles ───
const ROLE_TONE: Record<string, 'brand' | 'neutral' | 'attention' | 'danger'> = {
  super_admin: 'attention', org_admin: 'brand', analyst: 'brand', service: 'neutral', viewer: 'neutral', disabled: 'danger',
};
// Static capability matrix: mirrors the backend role checks; there is no matrix endpoint.
const CAP_MATRIX: Array<{ cap: string; allow: string[]; note?: string }> = [
  { cap: '查看和管理模型服务', allow: ['org_admin', 'super_admin'] },
  { cap: '管理用户与权限', allow: ['org_admin', 'super_admin'] },
  { cap: '检索审计日志', allow: ['org_admin', 'super_admin'] },
  { cap: '组织设置', allow: ['org_admin'], note: 'super_admin 可以看到所有组织' },
  { cap: '创建评估和脱壳任务', allow: ['viewer', 'analyst', 'org_admin', 'super_admin', 'service'] },
  { cap: '操作自己范围内的渗透会话', allow: ['viewer', 'analyst', 'org_admin', 'super_admin', 'service'] },
];
const ALL_ROLES = ['viewer', 'analyst', 'org_admin', 'super_admin', 'service'];

function UsersTab() {
  const [users, setUsers] = useState<any[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [msg, setMsg] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [nu, setNu] = useState({ username: '', password: '', role: 'viewer' });
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<any | null>(null);
  const [disableTarget, setDisableTarget] = useState<any | null>(null);
  const load = () => api<any[]>('/api/users').then((u) => { setUsers(u); setLoadErr(false); }).catch(() => { setUsers([]); setLoadErr(true); });
  useEffect(() => { load(); }, []);
  const create = async () => {
    setMsg('');
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify(nu) });
      setNu({ username: '', password: '', role: 'viewer' });
      setDrawer(false);
      load();
    } catch (e: any) { setMsg(e?.message || '创建失败'); }
  };
  const setRole = async (uid: number, role: string) => {
    await api(`/api/users/${uid}`, { method: 'PATCH', body: JSON.stringify({ role }) });
    load();
  };
  // Disable revokes every token and blocks sign-in; enable returns the account as analyst. Guards live in the backend.
  const toggleActive = async (u: any) => {
    setMsg('');
    try {
      await api(`/api/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ disabled: u.role !== 'disabled' }) });
      load();
    } catch (e: any) { setMsg(e?.message || '操作失败'); }
  };
  const remove = async (uid: number) => {
    await api(`/api/users/${uid}`, { method: 'DELETE' });
    load();
  };
  const submitReset = async () => {
    if (!resetTarget) return;
    if (resetPw.length < 6) { setMsg('密码至少 6 位'); return; }
    try {
      await api(`/api/users/${resetTarget.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'reset_password', password: resetPw }) });
      setMsg(`用户 #${resetTarget.id} 的密码已重置`);
      setResetTarget(null); setResetPw('');
    } catch (e: any) { setMsg(e?.message || '重置失败'); }
  };
  const list = users || [];
  const activeCnt = list.filter((u) => u.role !== 'disabled').length;
  const adminCnt = list.filter((u) => (u.role || '').includes('admin')).length;
  const fmtLast = (u: any) => u.last_login_at
    ? `${new Date(u.last_login_at * 1000).toLocaleString('zh-CN', { hour12: false })} · ${u.last_login_ip || '?'}`
    : '从未登录';

  const cols: Column<any>[] = [
    { key: 'user', header: '用户', card: 'title', cell: (u) => (
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-pill bg-jz-brand-soft text-meta font-semibold text-jz-brand">{(u.username || 'U').slice(0, 1).toUpperCase()}</span>
        <span className="truncate text-jz-ink">{u.username}</span>
      </span>
    ) },
    { key: 'role', header: '角色', cell: (u) => (
      <span className="w-36 inline-block">
        <Select value={ALL_ROLES.includes(u.role) ? u.role : ''} onChange={(e) => setRole(u.id, e.target.value)} aria-label={`${u.username} 的角色`}
          title={u.role === 'disabled' ? '账号已停用,请先启用再调整角色' : '调整角色'} disabled={u.role === 'disabled'} className="!h-8 font-mono text-label">
          <option value="">已停用</option>
          {ALL_ROLES.map((r) => <option key={r}>{r}</option>)}
        </Select>
      </span>
    ) },
    { key: 'last', header: '最后登录', mono: true, cell: (u) => <span className="text-jz-muted">{fmtLast(u)}</span> },
    { key: 'status', header: '状态', cell: (u) => (
      <span className="inline-flex items-center gap-2">
        <StatusBadge tone={ROLE_TONE[u.role] === 'danger' ? 'danger' : 'success'}>{u.role === 'disabled' ? '已停用' : '启用'}</StatusBadge>
        <Button size="sm" variant="ghost" data-user-toggle={u.role === 'disabled' ? 'off' : 'on'}
          title="停用会吊销该账号的全部 Token 并阻止登录;启用后角色为 analyst,可再调整。不能操作自己,也不能停用 super_admin。"
          onClick={() => (u.role === 'disabled' ? toggleActive(u) : setDisableTarget(u))}>{u.role === 'disabled' ? '启用' : '停用'}</Button>
      </span>
    ) },
    { key: 'act', header: <span className="sr-only">操作</span>, label: '操作', align: 'right', card: 'action', cell: (u) => (
      <span className="inline-flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={() => { setResetTarget(u); setResetPw(''); }} data-reset-btn>重置密码</Button>
        <IconButton size="sm" label={`删除 ${u.username}`} onClick={() => setDelTarget(u)} data-user-del={u.id}><Trash2 size={16} aria-hidden /></IconButton>
      </span>
    ) },
  ];

  return (
    <div className="space-y-6">
      <div data-user-stats>
        <MetricGrid>
          <Metric label="用户" value={users ? list.length : ''} loading={!users} />
          <Metric label="启用 / 停用" value={users ? <>{activeCnt}<span className="text-section text-jz-muted"> / {list.length - activeCnt}</span></> : ''} loading={!users} />
          <Metric label="管理员" value={users ? adminCnt : ''} loading={!users} />
        </MetricGrid>
      </div>

      {msg && <InlineAlert tone="info" action={<Button size="sm" variant="ghost" onClick={() => setMsg('')}>知道了</Button>}>{msg}</InlineAlert>}

      <Panel flush title="账号" data-user-table
        actions={(
          <>
            <Button variant="ghost" onClick={() => setMatrixOpen(!matrixOpen)} aria-expanded={matrixOpen} data-matrix-toggle>角色权限</Button>
            <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setDrawer(true)} data-create-user-btn>创建用户</Button>
          </>
        )}>
        {matrixOpen && (
          <div className="overflow-x-auto border-b border-jz-border p-4" data-cap-matrix>
            <table className="w-full min-w-[36rem] text-label">
              <caption className="sr-only">各角色可用的功能</caption>
              <thead>
                <tr className="text-left text-meta text-jz-muted">
                  <th scope="col" className="py-1.5 pr-3 font-medium">功能</th>
                  {ALL_ROLES.map((r) => <th key={r} scope="col" className="px-2 py-1.5 text-center font-mono font-medium">{r}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-jz-border">
                {CAP_MATRIX.map(({ cap, allow, note }) => (
                  <tr key={cap}>
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-jz-ink-2" title={note}>{cap}{note ? ' *' : ''}</th>
                    {ALL_ROLES.map((r) => (
                      <td key={r} className={cx('px-2 py-1.5 text-center', allow.includes(r) ? 'text-jz-teal' : 'text-jz-muted')}>
                        {allow.includes(r) ? <><span aria-hidden>✓</span><span className="sr-only">可用</span></> : <><span aria-hidden>—</span><span className="sr-only">不可用</span></>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-meta text-jz-muted">依据后端的角色检查整理,不是可配置的权限矩阵。* super_admin 可以看到所有组织。</p>
          </div>
        )}
        <DataTable<any> label="账号" columns={cols} rows={list} rowKey={(u) => u.id} stickyHeader={false}
          rowDataAttrs={(u) => ({ 'data-user-row': u.id })}
          state={!users ? <div className="p-4"><SkeletonLoader variant="table" rows={4} /></div>
            : loadErr ? <ErrorState title="账号列表加载失败" onRetry={load} />
            : list.length === 0 ? <EmptyState icon={Users} title="还没有账号" cause="创建的账号会显示在这里。" /> : undefined} />
      </Panel>

      <Drawer open={drawer} title="创建用户" onClose={() => setDrawer(false)}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDrawer(false)}>取消</Button>
            <Button variant="primary" onClick={create} data-nu-submit>创建</Button>
          </>
        )}>
        <div className="space-y-4" data-create-drawer>
          <Field label="用户名" required>{(ids) => <Input ids={ids} value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })} data-nu-username autoComplete="off" />}</Field>
          <Field label="初始密码" hint="至少 6 位,不能是弱口令。" required>
            {(ids) => <Input ids={ids} type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} className="font-mono" data-nu-password autoComplete="new-password" />}
          </Field>
          <Field label="角色" hint="org_admin 只能把用户加入自己的组织;只有 super_admin 能授予 super_admin。">
            {(ids) => (
              <Select ids={ids} value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
                {ALL_ROLES.map((r) => <option key={r}>{r}</option>)}
              </Select>
            )}
          </Field>
        </div>
      </Drawer>

      <Dialog open={!!resetTarget} title={`重置密码:${resetTarget?.username || ''}`} onClose={() => setResetTarget(null)}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setResetTarget(null)}>取消</Button>
            <Button variant="primary" onClick={submitReset} data-reset-submit>重置</Button>
          </>
        )}>
        <Field label="新密码" hint="至少 6 位,不能是弱口令。密码不会写入日志。">
          {(ids) => <Input ids={ids} type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} autoComplete="new-password" className="font-mono" data-reset-pw-input />}
        </Field>
      </Dialog>

      <ConfirmDialog open={!!disableTarget} destructive title={`停用 ${disableTarget?.username || ''}`} confirmLabel="停用"
        outcome="可以随时重新启用,启用后角色为 analyst。"
        onCancel={() => setDisableTarget(null)} onConfirm={() => { const u = disableTarget; setDisableTarget(null); if (u) toggleActive(u); }}>
        该账号的全部 Token 会被吊销,并且不能再登录。
      </ConfirmDialog>
      <ConfirmDialog open={!!delTarget} destructive title={`删除 ${delTarget?.username || ''}`} confirmLabel="删除"
        outcome="删除后无法恢复。只想暂时阻止登录时,请改用停用。"
        onCancel={() => setDelTarget(null)} onConfirm={() => { const u = delTarget; setDelTarget(null); if (u) remove(u.id); }}>
        账号 #{delTarget?.id} 将被删除。
      </ConfirmDialog>
    </div>
  );
}

// ─── Audit log: keyword, action prefix, user, date range, paging (GET /api/audit-log) ───
function AuditTab() {
  const [logs, setLogs] = useState<any[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [username, setUsername] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preset, setPreset] = useState<'' | 'today' | '7d'>('');
  const [detailRow, setDetailRow] = useState<any | null>(null);
  const PAGE = 50;
  const actTone = (a: string): 'success' | 'brand' | 'danger' | 'neutral' =>
    a.startsWith('login') ? 'success' : a.startsWith('pentest') || a.startsWith('vuln_export') ? 'brand' : a.startsWith('delete') ? 'danger' : 'neutral';
  const ACTION_CHIPS = ['login', 'user_', 'task_', 'model_', 'chat_', 'pentest_', 'feedback_', 'delete_'];
  const applyPreset = (p: 'today' | '7d') => {
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const now = new Date();
    if (p === 'today') { setFrom(fmt(now)); setTo(fmt(now)); }
    else { const s = new Date(now.getTime() - 6 * 86400000); setFrom(fmt(s)); setTo(fmt(now)); }
    setPreset(p); setPage(0);
  };
  const clearPreset = () => { setPreset(''); setFrom(''); setTo(''); setPage(0); };
  // Parameters are passed explicitly so a stale closure cannot send old filters.
  const load = (p: number, ov: Record<string, string> = {}) => {
    const Q = ov.q ?? q, A = ov.action ?? action, U = ov.username ?? username,
          F = ov.from ?? from, T = ov.to ?? to;
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(p * PAGE) });
    if (Q.trim()) params.set('q', Q.trim());
    if (A) params.set('action', A);
    if (U.trim()) params.set('username', U.trim());
    if (F) params.set('ts_from', String(new Date(F).getTime() / 1000));
    if (T) params.set('ts_to', String(new Date(T).getTime() / 1000 + 86399));
    api<any>(`/api/audit-log?${params}`).then((d) => {
      setLoadErr(false);
      setLogs(d.logs || []);
      setTotal(d.total || 0);
      if ((d.logs || []).length === 0 && p > 0) { setPage(0); }   // past the last page: back to the first
    }).catch(() => { setLogs([]); setTotal(0); setLoadErr(true); });
  };
  useEffect(() => { load(page); }, [q, action, username, from, to, page]);   // eslint-disable-line
  const pretty = (s: string) => {
    if (s == null || s === '') return '(空)';
    try { const v = JSON.parse(s); return typeof v === 'string' ? s : JSON.stringify(v, null, 2); } catch { return s; }
  };
  const fmtTs = (ts: number) => new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
  const presetBtn = (on: boolean) => cx('h-8 rounded-pill border px-3 text-label transition-colors duration-hover',
    on ? 'border-jz-brand bg-jz-brand-soft font-semibold text-jz-ink' : 'border-jz-border text-jz-ink-2 hover:bg-jz-surface-2');
  const filtersOn = !!(q || action || username || from || to);

  const cols: Column<any>[] = [
    { key: 'ts', header: '时间', mono: true, cell: (l) => <span className="whitespace-nowrap">{fmtTs(l.ts)}</span> },
    { key: 'action', header: '动作', card: 'title', cell: (l) => <StatusBadge tone={actTone(l.action)}><span className="font-mono">{l.action}</span></StatusBadge> },
    { key: 'user', header: '用户', cell: (l) => l.username || '—' },
    { key: 'ip', header: 'IP', mono: true, cell: (l) => l.ip || '—' },
    { key: 'detail', header: '详情', cell: (l) => <span className="block max-w-md truncate text-jz-ink-2" title={l.detail || ''}>{l.detail || ''}</span> },
  ];

  return (
    <Panel flush title="审计日志" description="点一行查看完整详情" data-audit-tab>
      <div className="space-y-3 border-b border-jz-border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1.5" role="group" aria-label="时间范围" data-audit-presets>
            <button type="button" aria-pressed={preset === 'today'} onClick={() => applyPreset('today')} className={presetBtn(preset === 'today')}>今天</button>
            <button type="button" aria-pressed={preset === '7d'} onClick={() => applyPreset('7d')} className={presetBtn(preset === '7d')}>近 7 天</button>
            <button type="button" aria-pressed={preset === ''} onClick={clearPreset} className={presetBtn(preset === '')}>自定义</button>
          </div>
          <SearchField className="min-w-48 flex-1" value={q} onValueChange={setQ} label="搜索详情" placeholder="搜索详情中的关键字"
            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') { setPage(0); load(0); } }} data-audit-q />
          <div className="w-36"><Input value={action} onChange={(e) => { setAction(e.target.value); setPreset(''); setPage(0); }} placeholder="动作前缀" aria-label="动作前缀" className="font-mono" data-audit-action /></div>
          <div className="w-32"><Input value={username} onChange={(e) => { setUsername(e.target.value); setPage(0); }} placeholder="用户名" aria-label="用户名" data-audit-user /></div>
          <div className="flex items-center gap-1.5">
            <div className="w-40"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset(''); setPage(0); }} aria-label="开始日期" data-audit-from /></div>
            <span className="text-jz-muted" aria-hidden>–</span>
            <div className="w-40"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset(''); setPage(0); }} aria-label="结束日期" data-audit-to /></div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="常用动作" data-audit-chips>
          <span className="mr-1 text-meta text-jz-muted">常用动作</span>
          {ACTION_CHIPS.map((c) => (
            <button type="button" key={c} aria-pressed={action === c} onClick={() => { setAction(action === c ? '' : c); setPage(0); }} data-audit-chip={c}
              className={cx(presetBtn(action === c), 'h-7 px-2.5 font-mono text-meta')}>{c}*</button>
          ))}
        </div>
      </div>
      <DataTable<any> label="审计日志" columns={cols} rows={logs || []} rowKey={(l) => l.id} stickyHeader={false}
        onRowClick={(l) => setDetailRow(l)} rowDataAttrs={(l) => ({ 'data-audit-row': l.id })}
        state={logs === null ? <div className="p-4"><SkeletonLoader variant="table" rows={6} /></div>
          : loadErr ? <ErrorState title="审计日志加载失败" onRetry={() => load(page)} />
          : logs.length === 0 ? <EmptyState icon={ScrollText} title={filtersOn ? '没有符合条件的记录' : '还没有审计记录'} cause={filtersOn ? '调整关键字、动作、用户或时间范围再试。' : '账号和任务的操作会记录在这里。'}
              action={filtersOn ? <Button variant="secondary" onClick={() => { setQ(''); setAction(''); setUsername(''); clearPreset(); }}>清除筛选</Button> : undefined} />
          : undefined} />
      <Pagination total={total} page={page + 1} pageSize={PAGE} onPage={(p) => setPage(p - 1)}
        summary={<>共 <span className="tnum text-jz-ink-2">{total}</span> 条</>}
        controlAttrs={{ prev: { 'data-audit-prev': '' }, next: { 'data-audit-next': '' } }} />
      <Drawer open={!!detailRow} title={`审计记录 #${detailRow?.id ?? ''}`} onClose={() => setDetailRow(null)}>
        {detailRow && (
          <div className="space-y-4" data-audit-drawer>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-label">
              <dt className="text-jz-muted">动作</dt><dd><StatusBadge tone={actTone(detailRow.action)}><span className="font-mono">{detailRow.action}</span></StatusBadge></dd>
              <dt className="text-jz-muted">用户</dt><dd className="text-jz-ink">{detailRow.username || '—'}</dd>
              <dt className="text-jz-muted">IP</dt><dd className="font-mono text-jz-ink">{detailRow.ip || '—'}</dd>
              <dt className="text-jz-muted">时间</dt><dd className="font-mono text-jz-ink">{fmtTs(detailRow.ts)}</dd>
            </dl>
            <section>
              <h3 className="text-label font-semibold text-jz-ink">详情</h3>
              <pre data-detail-pre className="mt-1.5 max-h-[52vh] overflow-auto whitespace-pre-wrap break-all rounded-control bg-jz-surface-2 p-3 font-mono text-meta text-jz-ink-2">{pretty(detailRow.detail)}</pre>
            </section>
            <p className="text-meta text-jz-muted">审计记录只保存元数据和详情摘要,不保存请求和响应内容。</p>
          </div>
        )}
      </Drawer>
    </Panel>
  );
}

// ─── API tokens (GET/POST /api/tokens, DELETE /api/tokens/{id}). The plain token lives only in this component's state. ───
function TokensTab() {
  const role = useAuth((s) => s.me?.role) || '';
  const canManage = role === 'admin' || role === 'super_admin';
  const [items, setItems] = useState<any[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'read' | 'write'>('read');
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ token: string; name: string; scope: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<any | null>(null);
  const load = () => api<any>('/api/tokens').then((d) => { setItems(d?.items || []); setLoadErr(false); }).catch(() => { setItems([]); setLoadErr(true); });
  useEffect(() => { if (canManage) load(); }, [canManage]);
  const issue = async () => {
    setMsg(''); setBusy(true);
    try {
      const r = await api<any>('/api/tokens', { method: 'POST', body: JSON.stringify({ name: name || 'ci-token', scope }) });
      setIssued({ token: r?.token || '', name: r?.name || '', scope: r?.scope || scope });
      setCopied(false);
      setName(''); load();
    } catch (e: any) { setMsg(e?.message || '签发失败'); }
    setBusy(false);
  };
  const revoke = async (tid: number) => {
    try { await api(`/api/tokens/${tid}`, { method: 'DELETE' }); } catch { /* the reloaded list shows the real state */ }
    setRevokeTarget(null); load();
  };
  if (!canManage) {
    return (
      <Panel title="API Token" data-tokens-noauth>
        <PermissionState title="需要 admin 或 super_admin" message={<>当前角色:<span className="font-mono">{role || '未知'}</span>。Token 接口对这个角色返回 403。</>} />
      </Panel>
    );
  }
  const cols: Column<any>[] = [
    { key: 'id', header: '#', mono: true, width: 'w-12', cell: (t) => t.id },
    { key: 'name', header: '名称', card: 'title', cell: (t) => t.name },
    { key: 'scope', header: '范围', cell: (t) => <StatusBadge tone={t.scope === 'write' ? 'attention' : 'neutral'} title="read 只能查询;write 还能执行写操作">{t.scope}</StatusBadge> },
    { key: 'state', header: '状态', cell: (t) => (t.revoked_at ? <StatusBadge tone="neutral">已吊销</StatusBadge> : <StatusBadge tone="success">有效</StatusBadge>) },
    { key: 'created', header: '创建时间', mono: true, cell: (t) => <span className="text-jz-muted">{t.created_at ? new Date(t.created_at * 1000).toLocaleString('zh-CN', { hour12: false }) : '—'}</span> },
    { key: 'act', header: <span className="sr-only">操作</span>, label: '操作', align: 'right', card: 'action', cell: (t) => (
      !t.revoked_at ? <Button size="sm" variant="danger" onClick={() => setRevokeTarget(t)} data-probe={`token-revoke-${t.id}`}>吊销</Button> : null
    ) },
  ];
  return (
    <div className="space-y-6" data-tokens-panel>
      <Panel title="签发 Token" description="read 只能查询;write 可以从外部系统驱动完整流程(创建评估、发起渗透、运行、取报告)。Token 明文只显示一次,吊销立即生效。">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="名称" className="w-56">{(ids) => <Input ids={ids} value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 ci-pipeline" data-probe="token-name" />}</Field>
          <Field label="范围" className="w-48">
            {(ids) => (
              <Select ids={ids} value={scope} onChange={(e) => setScope(e.target.value as 'read' | 'write')} data-probe="token-scope">
                <option value="read">read(只读)</option>
                <option value="write">write(可写)</option>
              </Select>
            )}
          </Field>
          <Button variant="primary" icon={<KeyRound size={16} aria-hidden />} onClick={issue} loading={busy} data-probe="token-issue">{busy ? '签发中…' : '签发'}</Button>
        </div>
        {msg && <InlineAlert tone="danger" className="mt-3">{msg}</InlineAlert>}
      </Panel>
      <Panel flush title="已签发的 Token">
        <DataTable<any> label="已签发的 Token" columns={cols} rows={items || []} rowKey={(t) => t.id} stickyHeader={false}
          rowDataAttrs={(t) => ({ 'data-probe': `token-row-${t.id}` })}
          state={items === null ? <div className="p-4"><SkeletonLoader variant="table" rows={3} /></div>
            : loadErr ? <ErrorState title="Token 列表加载失败" onRetry={load} />
            : items.length === 0 ? <EmptyState compact icon={KeyRound} title="还没有 Token" cause="签发后会显示在这里。" /> : undefined} />
      </Panel>
      <Dialog open={!!issued} title={`Token 已签发:${issued?.name || ''}`} description={`范围 ${issued?.scope || ''}。关闭后无法再次查看,服务端只保存哈希。`}
        onClose={() => setIssued(null)}
        footer={<Button variant="primary" onClick={() => setIssued(null)}>我已保存</Button>}>
        <div className="flex items-start gap-2">
          <code className="min-w-0 flex-1 select-all break-all rounded-control bg-jz-surface-2 px-3 py-2 font-mono text-label text-jz-ink" data-probe="token-once">{issued?.token}</code>
          <IconButton label={copied ? '已复制' : '复制'} variant="secondary"
            onClick={() => { navigator.clipboard?.writeText(issued?.token || '').then(() => setCopied(true)).catch(() => {}); }}><Copy size={16} aria-hidden /></IconButton>
        </div>
      </Dialog>
      <Dialog open={!!revokeTarget} role="alertdialog" dismissible={false} title={`吊销 Token:${revokeTarget?.name || ''}`} onClose={() => setRevokeTarget(null)}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setRevokeTarget(null)}>取消</Button>
            <Button variant="danger-solid" onClick={() => revoke(revokeTarget?.id)} data-probe="token-revoke-confirm">吊销</Button>
          </>
        )}>
        <p className="text-label text-jz-ink-2">吊销后,使用这个 Token(范围 {revokeTarget?.scope})的请求会立即返回 401,使用方需要重新签发。无法撤销。</p>
      </Dialog>
    </div>
  );
}

// ─── Webhooks (GET/POST/DELETE /api/webhooks, POST /api/webhooks/test) ───
function WebhookPanel() {
  const [hooks, setHooks] = useState<any[] | null>(null);
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [kinds, setKinds] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState<any | null>(null);
  const load = () => api<any>('/api/webhooks').then((d) => setHooks(d?.items || [])).catch(() => setHooks([]));
  useEffect(() => { load(); }, []);
  const add = async () => {
    setMsg(''); setBusy(true);
    try {
      await api('/api/webhooks', { method: 'POST', body: JSON.stringify({ url: url.trim(), secret: secret.trim(), kinds: kinds.trim() ? kinds.split(/[,，\s]+/).filter(Boolean) : [] }) });
      setUrl(''); setSecret(''); setKinds(''); load();
    } catch (e: any) { setMsg(e?.message || '添加失败'); }
    setBusy(false);
  };
  const test = async () => {
    setMsg('');
    try {
      await api('/api/webhooks/test', { method: 'POST' });
      setMsg('已发出测试推送(kind=system)。推送是异步的,请在接收端确认是否收到并校验签名。');
    } catch (e: any) { setMsg(e?.message || '测试推送失败'); }
  };
  const del = async (idx: number) => {
    try { await api(`/api/webhooks/${idx}`, { method: 'DELETE' }); } catch { /* the reloaded list shows the real state */ }
    setDelTarget(null); load();
  };
  const cols: Column<any>[] = [
    { key: 'idx', header: '#', mono: true, width: 'w-12', cell: (h) => h.idx },
    { key: 'url', header: '地址', card: 'title', cell: (h) => <span className="block max-w-md truncate font-mono text-meta" title={h.url}>{h.url}</span> },
    { key: 'secret', header: '签名', cell: (h) => <span className="text-jz-muted">{h.secret_masked || '未配置'}</span> },
    { key: 'kinds', header: '订阅', cell: (h) => ((h.kinds || []).length ? <span className="flex flex-wrap gap-1">{h.kinds.map((k: string) => <Tag key={k} mono>{k}</Tag>)}</span> : <span className="text-jz-muted">全部事件</span>) },
    { key: 'act', header: <span className="sr-only">操作</span>, label: '操作', align: 'right', card: 'action', cell: (h) => (
      <span className="inline-flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={test} data-probe={`wh-test-${h.idx}`}>测试推送</Button>
        <Button size="sm" variant="danger" onClick={() => setDelTarget(h)} data-probe={`wh-del-${h.idx}`}>删除</Button>
      </span>
    ) },
  ];
  return (
    <Panel title={<span className="flex items-center gap-2"><Webhook size={16} aria-hidden className="text-jz-muted" />Webhook</span>}
      description="把通知异步推送到外部系统(CI、即时通讯),可用 HMAC-SHA256 签名。不填订阅时推送全部事件。" data-webhook-panel>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field label="地址" hint="以 http:// 或 https:// 开头">{(ids) => <Input ids={ids} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ci.example.com/hook" data-probe="wh-url" />}</Field>
        <Field label="签名密钥" hint="留空则不签名">{(ids) => <Input ids={ids} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" data-probe="wh-secret" />}</Field>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Field label="订阅的事件类型" hint="逗号分隔,例如 task, ai;留空推送全部" className="min-w-56 flex-1">
          {(ids) => <Input ids={ids} value={kinds} onChange={(e) => setKinds(e.target.value)} data-probe="wh-kinds" />}
        </Field>
        <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={add} disabled={!url.trim()} loading={busy} data-probe="wh-add" className="mb-6">{busy ? '添加中…' : '添加'}</Button>
      </div>
      {msg && <InlineAlert tone="info" className="mt-3" data-probe="wh-msg">{msg}</InlineAlert>}
      <div className="-mx-4 mt-4 border-t border-jz-border">
        <DataTable<any> label="Webhook" columns={cols} rows={hooks || []} rowKey={(h) => h.idx} stickyHeader={false}
          rowDataAttrs={(h) => ({ 'data-probe': `wh-row-${h.idx}` })}
          state={hooks === null ? <div className="p-4"><SkeletonLoader variant="table" rows={2} /></div>
            : hooks.length === 0 ? <EmptyState compact icon={Webhook} title="还没有 Webhook" cause="添加后会显示在这里。" /> : undefined} />
      </div>
      <Dialog open={!!delTarget} role="alertdialog" dismissible={false} title={`删除 Webhook #${delTarget?.idx ?? ''}`} onClose={() => setDelTarget(null)}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDelTarget(null)}>取消</Button>
            <Button variant="danger-solid" onClick={() => del(delTarget?.idx)} data-probe="wh-del-confirm">删除</Button>
          </>
        )}>
        <p className="break-all font-mono text-meta text-jz-ink-2">{delTarget?.url}</p>
        <p className="mt-2 text-label text-jz-ink-2">删除后这个地址不再收到任何推送。</p>
      </Dialog>
    </Panel>
  );
}
