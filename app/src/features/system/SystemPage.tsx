import React, { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { Button, Drawer, Modal, Skeleton, StatusBadge } from '@/components/ui';
import { LockKeyhole } from 'lucide-react';
import { ModelConsole } from './ModelConsole';

type Tab = 'models' | 'users' | 'audit' | 'resources' | 'tokens';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'models', label: '模型服务' },
  { key: 'users', label: '用户与权限' },
  { key: 'audit', label: '审计日志' },
  { key: 'resources', label: '资源计量' },
  { key: 'tokens', label: 'API Token' },
];

export const SystemPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('models');
  const role = useAuth((s) => s.me?.role) || '';
  const isAdmin = role === 'admin' || role === 'super_admin' || role === 'org_admin';
  // R97-2: 非 admin 三管理页签不渲染(路由直达 hash 亦无内容可挂),系统页落自服务占位
  if (!isAdmin) {
    return (
      <div className="p-4 h-full overflow-auto grid place-items-center" data-system-noauth>
        <div className="w-full max-w-sm rounded-2xl bg-jz-surface shadow-jz-card p-8 text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-jz-elevated grid place-items-center">
            <LockKeyhole className="w-5 h-5 text-jz-text-muted" />
          </div>
          <div className="text-sm font-semibold text-jz-text-primary mb-1.5">需要管理员权限</div>
          <div className="text-xs text-jz-text-muted leading-relaxed">系统管理(模型服务/用户与权限/审计日志)仅管理员可见——当前角色 <span className="font-mono">{role || '未知'}</span> 无权限访问。</div>
        </div>
      </div>
    );
  }
  return (
    <div className="p-4 h-full overflow-auto space-y-3">
      <div className="flex gap-1 pb-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors
              ${tab === t.key ? 'bg-neon-accent/20 text-neon-accent' : 'text-jz-text-muted hover:text-jz-text-primary'}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'models' && <ModelsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'resources' && <ResourceStatsTab />}
      {tab === 'tokens' && <TokensTab />}
      {tab === 'tokens' && <WebhookPanel />}
    </div>
  );
};

// R118-2(方案9.4 字面落地): 资源计量 Tab——LLM token 月度真值 + 磁盘占用真算 + 并发槽位,
// 数据源=GET /api/system/resource-stats(admin/org_admin 闸,后端现算零缓存零 mock)。
function ResourceStatsTab() {
  const [stats, setStats] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api<any>('/api/system/resource-stats').then(setStats).catch((e) => setErr(e.message || String(e)));
  }, []);
  if (err) return <div className="text-xs text-vuln-critical p-3">加载失败: {err}</div>;
  if (!stats) return <div className="p-3"><Skeleton className="h-24" /></div>;
  const fmtTok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));
  const diskTotalMb = stats.disk.runs_mb + stats.disk.apk_pool_mb + stats.disk.db_mb;
  const quotaMb = stats.disk.quota_storage_mb;
  return (
    <div className="space-y-3" data-resource-stats>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* LLM Token 月度计量(方案9.4 字面) */}
        <div className="rounded-2xl bg-jz-surface shadow-jz-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-jz-text-muted">已用 Token(近 30 天)</span>
            <StatusBadge
              tone="info"
              title="统计口径: 本自然滚动月(近30天)平台全部已集成大模型任务经 task_llm_usage 计量的 Prompt 与 Completion Token 累计真值;模型未回传 usage 的调用不计量,如实呈现计数而非估算">
              真值计量
            </StatusBadge>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-jz-text-primary tnum">{fmtTok(stats.llm.prompt_tokens_30d + stats.llm.completion_tokens_30d)}</div>
          <div className="mt-1 text-xs text-jz-text-muted font-mono tnum">
            prompt {fmtTok(stats.llm.prompt_tokens_30d)} · completion {fmtTok(stats.llm.completion_tokens_30d)} · {stats.llm.calls_30d} 次调用
          </div>
        </div>
        {/* 磁盘占用 */}
        <div className="rounded-2xl bg-jz-surface shadow-jz-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-jz-text-muted">磁盘占用</span>
            <StatusBadge
              tone="info"
              title={`统计口径: 任务产物池(data/runs)+ APK 下载池(output/apk_pool)+ 数据库文件三处逐字节 du 真算;runs 池文件量巨大(450万+),后台线程低频重算(10 分钟)返回缓存真值${stats.disk.computed_at ? `,数据时点 ${stats.disk.computed_at}` : ''}${quotaMb >= 0 ? `;组织存储配额 ${quotaMb}MB` : ';组织未配置存储配额(-1=不限)'}`}>
              {stats.disk.computed_at ? `缓存 · ${stats.disk.computed_at}` : '点算中'}
            </StatusBadge>
          </div>
          {stats.disk.computing ? (
            <div className="mt-2 text-xs text-jz-text-muted" data-disk-computing>磁盘点算中(runs 池文件量大,后台进行,约 1-2 分钟后刷新呈现)…</div>
          ) : (
            <>
              <div className="mt-2 text-2xl font-bold font-mono text-jz-text-primary tnum">{diskTotalMb} MB</div>
              <div className="mt-1 text-xs text-jz-text-muted font-mono tnum">
                runs {stats.disk.runs_mb} · pool {stats.disk.apk_pool_mb} · db {stats.disk.db_mb}{quotaMb >= 0 ? ` / 配额 ${quotaMb}MB` : ''}
              </div>
            </>
          )}
        </div>
        {/* 并发槽位 */}
        <div className="rounded-2xl bg-jz-surface shadow-jz-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-jz-text-muted">并发执行槽位</span>
            <StatusBadge
              tone="info"
              title="统计口径: 当前正在执行或排队的审计任务数(running+queued 真值) / 组织套餐允许的最大并发审计数(quota_concurrent)。达到上限时新建任务被后端 429 拒绝(M4 配额闸)">
              真值闸口
            </StatusBadge>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-jz-text-primary tnum">
            {stats.slots.running}/{stats.slots.quota_concurrent}
          </div>
          <div className="mt-1 text-xs text-jz-text-muted">
            {stats.slots.running >= stats.slots.quota_concurrent
              ? '⚠ 已达并发上限——新建任务将被 429 拒绝'
              : '运行中+排队任务数 / 最大并发审计容量'}
          </div>
        </div>
      </div>
      <div className="text-xs text-jz-text-muted">
        口径注: Token 与并发槽位为请求时现算真值;磁盘为后台线程低频重算(10 分钟)的缓存真值,数据时点见卡片角标;Token 仅计量模型回传 usage 的调用,未回传者如实不计量、零估算。
      </div>
    </div>
  );
}

// R52 P0-1: ModelsTab 升级为 G2 模型路由控制台(ModelConsole.tsx)
function ModelsTab() {
  return (
    <div className="space-y-3">
      <ModelConsole />
      <FeedbackStats />
    </div>
  );
}

// R66 指令2: 反馈统计卡(赞/踩/近期备注,读 GET /api/feedback)
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
    <div data-feedback-stats className="rounded-2xl bg-jz-surface shadow-jz-card p-3 text-xs space-y-1">
      <div className="font-semibold text-jz-text-primary">AI 建议反馈统计</div>
      <div className="font-mono text-jz-text-muted">👍 {up} · 👎 {down} · 近期备注:</div>
      {items.slice(-3).map((i, k) => (
        <div key={k} className="text-jz-text-muted truncate">{i.card_id} → {i.verdict} ({i.note || '无备注'})</div>
      ))}
      {!items.length && <div className="text-jz-text-muted">暂无反馈记录</div>}
    </div>
  );
}

// R55 G9: 用户权限 CRUD;R103-3: 高密表格(头像/金紫蓝徽章/最后登录/状态开关)+创建抽屉+静态能力矩阵+重置密码 Modal
const ROLE_BADGE: Record<string, string> = {
  super_admin: 'bg-vuln-medium/15 text-vuln-medium',                 // 金
  org_admin: 'bg-neon-accent/15 text-neon-accent',                   // 紫
  analyst: 'bg-jz-accent-cyan/15 text-jz-accent-cyan',         // 蓝
  service: 'bg-jz-elevated/60 text-jz-text-muted',
  viewer: 'bg-jz-elevated/60 text-jz-text-muted',
  disabled: 'bg-vuln-critical/15 text-vuln-critical',
};
// R103-3③: 静态能力矩阵——按后端真实闸(require_admin/require_role/current_user,亲核 app.py)如实呈现,不造后端矩阵端点
const CAP_MATRIX: Array<{ cap: string; allow: string[]; note?: string }> = [
  { cap: '模型网关查看/管理', allow: ['org_admin', 'super_admin'] },
  { cap: '用户与权限管理', allow: ['org_admin', 'super_admin'] },
  { cap: '审计日志检索', allow: ['org_admin', 'super_admin'] },
  { cap: '组织设置', allow: ['org_admin'], note: 'super_admin 持全组织视角' },
  { cap: '审计/脱壳任务创建', allow: ['viewer', 'analyst', 'org_admin', 'super_admin', 'service'] },
  { cap: '渗透会话操作(自有范围)', allow: ['viewer', 'analyst', 'org_admin', 'super_admin', 'service'] },
];
const ALL_ROLES = ['viewer', 'analyst', 'org_admin', 'super_admin', 'service'];

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [nu, setNu] = useState({ username: '', password: '', role: 'viewer' });
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [matrixOpen, setMatrixOpen] = useState(false);
  const load = () => api<any[]>('/api/users').then(setUsers).catch(() => setUsers([]));
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
  // R103-3②: 状态开关——复用既有 PATCH {disabled} 契约(R97 布尔契约:禁用=role→disabled+吊销全部 token;
  // 启用=disabled→analyst 后可再调角色)。守卫链(R96 防自变更/防禁 super_admin)全在后端,零新列零双轨。
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
  // R103-3④: 重置密码 window.prompt → Modal(后端 R96 守卫零改动: ≥6 位非弱口令/防锁死/越权)
  const submitReset = async () => {
    if (!resetTarget) return;
    if (resetPw.length < 6) { setMsg('密码至少 6 位'); return; }
    try {
      await api(`/api/users/${resetTarget.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'reset_password', password: resetPw }) });
      setMsg(`用户 #${resetTarget.id} 密码已重置(不入日志)`);
      setResetTarget(null); setResetPw('');
    } catch (e: any) { setMsg(e?.message || '重置失败'); }
  };
  const activeCnt = users.filter((u) => u.role !== 'disabled').length;
  const adminCnt = users.filter((u) => (u.role || '').includes('admin')).length;
  const fmtLast = (u: any) => u.last_login_at
    ? `${new Date(u.last_login_at * 1000).toLocaleString('zh-CN', { hour12: false })} · ${u.last_login_ip || '?'}`
    : '—';
  return (
    <div className="space-y-2">
      {/* R103-3①: 角色统计卡(按 users 列表真算,不造端点) */}
      <div className="grid grid-cols-3 gap-2" data-user-stats>
        <div className="rounded-2xl bg-jz-elevated p-3"><div className="text-xs text-jz-text-muted">总用户</div><div className="text-lg font-semibold text-jz-text-primary tnum">{users.length}</div></div>
        <div className="rounded-2xl bg-jz-elevated p-3"><div className="text-xs text-jz-text-muted">活跃/禁用</div><div className="text-lg font-semibold text-vuln-safe tnum">{activeCnt}<span className="text-jz-text-muted text-xs"> / {users.length - activeCnt}</span></div></div>
        <div className="rounded-2xl bg-jz-elevated p-3"><div className="text-xs text-jz-text-muted">管理员</div><div className="text-lg font-semibold text-vuln-medium tnum">{adminCnt}</div></div>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={() => setDrawer(true)} data-create-user-btn>+ 创建用户</Button>
        <Button variant="ghost" onClick={() => setMatrixOpen(!matrixOpen)} data-matrix-toggle>角色能力矩阵</Button>
        {msg && <span className="text-xs text-vuln-critical">{msg}</span>}
      </div>
      {/* R103-3③: 静态能力矩阵(前端呈现后端真实闸;细粒度 RBAC=挂账) */}
      {matrixOpen && (
        <div className="rounded-2xl bg-jz-surface shadow-jz-card p-3 space-y-1.5" data-cap-matrix>
          <div className="grid grid-cols-6 gap-1 text-xs font-semibold text-jz-text-muted">
            <span>能力项</span>{ALL_ROLES.map((r) => <span key={r} className="text-center font-mono">{r}</span>)}
          </div>
          {CAP_MATRIX.map(({ cap, allow, note }) => (
            <div key={cap} className="grid grid-cols-6 gap-1 items-center text-xs pt-1">
              <span className="text-jz-text-secondary truncate" title={note || cap}>{cap}{note ? ' *' : ''}</span>
              {ALL_ROLES.map((r) => (
                <span key={r} className={`text-center font-mono ${allow.includes(r) ? 'text-vuln-safe' : 'text-jz-text-muted/40'}`}>{allow.includes(r) ? '✓' : '—'}</span>
              ))}
            </div>
          ))}
          <div className="text-xs text-jz-text-muted pt-1">按后端真实闸如实呈现(require_admin/require_role/current_user);细粒度 RBAC=挂账。与渗透 Agent 角色(roles_meta)无关。* 组织设置: super_admin 持全组织视角。</div>
        </div>
      )}
      {/* R103-3②: 高密用户表 */}
      <div className="rounded-2xl bg-jz-surface shadow-jz-card overflow-hidden">
        <table className="w-full text-xs" data-user-table>
          <thead>
            <tr className="bg-jz-surface text-xs text-jz-text-muted text-left">
              <th className="px-2.5 py-1.5 font-medium">用户</th>
              <th className="px-2.5 py-1.5 font-medium">角色</th>
              <th className="px-2.5 py-1.5 font-medium">最后登录(IP · 时间)</th>
              <th className="px-2.5 py-1.5 font-medium">状态</th>
              <th className="px-2.5 py-1.5 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id} data-user-row={u.id} className="hover:bg-jz-elevated/30">
                <td className="px-2.5 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-gradient-to-br from-neon-accent to-vuln-safe flex items-center justify-center text-xs font-bold text-white flex-none">
                      {(u.username || 'U').slice(0, 1).toUpperCase()}
                    </span>
                    <span className="text-jz-text-primary truncate">{u.username}</span>
                  </div>
                </td>
                <td className="px-2.5 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-mono ${ROLE_BADGE[u.role] || ROLE_BADGE.viewer}`}>{u.role}</span>
                </td>
                <td className="px-2.5 py-1.5 font-mono text-xs text-jz-text-muted tnum">{fmtLast(u)}</td>
                <td className="px-2.5 py-1.5">
                  <button onClick={() => toggleActive(u)}
                    title="禁用=吊销全部 token 并拒登录;启用后默认 analyst 角色可再调;不能操作自己/不能禁用 super_admin"
                    data-user-toggle={u.role === 'disabled' ? 'off' : 'on'}
                    className={`relative w-9 h-[18px] rounded-full transition-colors ${u.role === 'disabled' ? 'bg-jz-elevated' : 'bg-vuln-safe/60'}`}>
                    <span className={`absolute top-[2px] w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${u.role === 'disabled' ? 'left-[2px]' : 'left-[18px]'}`} />
                  </button>
                </td>
                <td className="px-2.5 py-1.5 text-right space-x-2 whitespace-nowrap">
                  <select value={ALL_ROLES.includes(u.role) ? u.role : ''} onChange={(e) => setRole(u.id, e.target.value)}
                    title="调整角色(disabled 状态请先用左侧开关启用)"
                    className="bg-jz-elevated/60 rounded-lg px-1 py-0.5 text-xs text-jz-text-primary">
                    <option value="">(禁用中)</option>
                    {ALL_ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                  <button onClick={() => { setResetTarget(u); setResetPw(''); }} className="text-xs text-neon-accent hover:underline" data-reset-btn>重置密码</button>
                  <button onClick={() => remove(u.id)} className="text-xs text-vuln-critical hover:underline">删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* R103-3③: 创建用户抽屉(原内联表单抽屉化) */}
      {drawer && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={() => setDrawer(false)} data-create-drawer>
          <div className="w-[340px] h-full bg-jz-surface p-4 space-y-3 overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-jz-text-primary">创建用户</span>
              <button onClick={() => setDrawer(false)} className="text-jz-text-muted hover:text-jz-text-primary text-xs">关闭</button>
            </div>
            <label className="block text-xs text-jz-text-muted space-y-1">用户名
              <input value={nu.username} onChange={(e) => setNu({ ...nu, username: e.target.value })}
                className="w-full bg-jz-elevated/60 rounded-lg px-2 py-1.5 text-xs text-jz-text-primary" data-nu-username /></label>
            <label className="block text-xs text-jz-text-muted space-y-1">初始密码(≥6 位)
              <input type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })}
                className="w-full bg-jz-elevated/60 rounded-lg px-2 py-1.5 text-xs text-jz-text-primary font-mono" data-nu-password /></label>
            <label className="block text-xs text-jz-text-muted space-y-1">角色
              <select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}
                className="w-full bg-jz-elevated/60 rounded-lg px-2 py-1.5 text-xs text-jz-text-primary">
                {ALL_ROLES.map((r) => <option key={r}>{r}</option>)}
              </select></label>
            <Button className="w-full" onClick={create} data-nu-submit>创建</Button>
            <div className="text-xs text-jz-text-muted leading-4">org_admin 只能加入自己组织;仅 super_admin 可授予 super_admin 角色。</div>
          </div>
        </div>
      )}
      {/* R103-3④: 重置密码 Modal(替代 window.prompt;密码不入日志) */}
      <Modal open={!!resetTarget} title={`重置密码 — ${resetTarget?.username || ''} (#${resetTarget?.id ?? ''})`} onClose={() => setResetTarget(null)}>
        <input type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="新密码(≥6 位,非弱口令)"
          autoComplete="new-password" data-reset-pw-input
          className="w-full bg-jz-elevated/60 rounded-lg px-2 py-1.5 text-xs text-jz-text-primary font-mono" />
        <div className="text-xs text-jz-text-muted">仅本次使用;密码不落日志(后端 R96 守卫: 弱口令拒/防锁死/越权拒)。</div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setResetTarget(null)}>取消</Button>
          <Button onClick={submitReset} data-reset-submit>确认重置</Button>
        </div>
      </Modal>
    </div>
  );
}

function AuditTab() {
  // R97-1(D-3): 审计检索——搜索框/action 前缀/用户名/时间窗/分页,空结果与超页码兜底(契约不动)
  // R103-4: SOC 化——动作四色前缀映射/IP 列/30px 行高/行右滑抽屉/时间预设+动作快选 chips
  const [logs, setLogs] = useState<any[]>([]);
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
  // R103-4①: 动作四色前缀映射(login 绿/pentest* 天蓝/vuln_export 紫/delete* 红,其余灰;双模 accent token)
  const ACT_COL: Array<[string, string]> = [
    ['login', 'text-jz-accent-emerald bg-jz-accent-emerald/10'],
    ['pentest', 'text-jz-accent-cyan bg-jz-accent-cyan/10'],
    ['vuln_export', 'bg-neon-accent/10 text-neon-accent'],
    ['delete', 'text-vuln-critical bg-vuln-critical/10'],
  ];
  const actClass = (a: string) => (ACT_COL.find(([p]) => a.startsWith(p))?.[1] || 'text-jz-text-muted bg-jz-elevated/50');
  // R103-4④: 动作快选 chips(单选快选=既有单前缀语义零后端改动;真多选需 action 参数扩展=挂账)
  const ACTION_CHIPS = ['login', 'user_', 'task_', 'model_', 'chat_', 'pentest_', 'feedback_', 'delete_'];
  // R103-4④: 时间预设(今日/近7天;自定义=清空预设走手输)
  const applyPreset = (p: 'today' | '7d') => {
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const now = new Date();
    if (p === 'today') { setFrom(fmt(now)); setTo(fmt(now)); }
    else { const s = new Date(now.getTime() - 6 * 86400000); setFrom(fmt(s)); setTo(fmt(now)); }
    setPreset(p); setPage(0);
  };
  const clearPreset = () => { setPreset(''); setFrom(''); setTo(''); setPage(0); };
  // R98-1①: stale 闭包修——参数显式传入(不捕旧闭包), useEffect 态驱动(契约不动)
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
      setLogs(d.logs || []);
      setTotal(d.total || 0);
      if ((d.logs || []).length === 0 && p > 0) { setPage(0); }   // 超页码兜底: 回首页
    }).catch(() => { setLogs([]); setTotal(0); });
  };
  useEffect(() => { load(page); }, [q, action, username, from, to, page]);   // eslint-disable-line
  const pages = Math.max(1, Math.ceil(total / PAGE));
  // R103-4③: detail 美化(JSON 则 pretty print,失败原样;空值显「(空)」不显字面量 null)
  const pretty = (s: string) => {
    if (s == null || s === '') return '(空)';
    try { const v = JSON.parse(s); return typeof v === 'string' ? s : JSON.stringify(v, null, 2); } catch { return s; }
  };
  const fmtTs = (ts: number) => new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
  return (
    <div className="space-y-2" data-audit-tab>
      <div className="flex gap-2 items-center flex-wrap rounded-2xl bg-jz-elevated p-2">
        <span className="flex gap-1" data-audit-presets>
          <button onClick={() => applyPreset('today')}
            className={`px-3 py-1 rounded-full text-xs transition-colors ${preset === 'today' ? 'bg-neon-accent/10 text-neon-accent font-semibold' : 'text-jz-text-muted hover:bg-jz-elevated/50'}`}>今日</button>
          <button onClick={() => applyPreset('7d')}
            className={`px-3 py-1 rounded-full text-xs transition-colors ${preset === '7d' ? 'bg-neon-accent/10 text-neon-accent font-semibold' : 'text-jz-text-muted hover:bg-jz-elevated/50'}`}>近7天</button>
          <button onClick={clearPreset}
            className={`px-3 py-1 rounded-full text-xs transition-colors ${preset === '' ? 'bg-neon-accent/10 text-neon-accent font-semibold' : 'text-jz-text-muted hover:bg-jz-elevated/50'}`}>自定义</button>
        </span>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { setPage(0); load(0); } }}
          placeholder="关键字(detail)…" className="w-40 bg-jz-elevated/60 rounded-lg px-2 py-1 text-xs text-jz-text-primary" data-audit-q />
        <input value={action} onChange={(e) => { setAction(e.target.value); setPreset(''); setPage(0); }}
          placeholder="action(前缀)" className="w-28 bg-jz-elevated/60 rounded-lg px-2 py-1 text-xs text-jz-text-primary font-mono" data-audit-action />
        <input value={username} onChange={(e) => { setUsername(e.target.value); setPage(0); }}
          placeholder="用户名" className="w-24 bg-jz-elevated/60 rounded-lg px-2 py-1 text-xs text-jz-text-primary" data-audit-user />
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset(''); setPage(0); }}
          className="bg-jz-elevated/60 rounded-lg px-2 py-1 text-xs text-jz-text-primary" data-audit-from />
        <span className="text-xs text-jz-text-muted">→</span>
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset(''); setPage(0); }}
          className="bg-jz-elevated/60 rounded-lg px-2 py-1 text-xs text-jz-text-primary" data-audit-to />
        <Button variant="ghost" onClick={() => { setPage(0); }}>搜索</Button>
        <span className="flex-1" />
        {/* R117-9④(方案9.4 功能等价落位): 方案所述「已用 Token/磁盘占用」资源面板在本平台不存在
            (系统页 Tab=模型/用户/审计),映射到本页核心计数器=审计命中总数,补三段式口径注 */}
        <span className="text-xs text-jz-text-muted"
          title="统计口径: 满足当前过滤条件(关键字/动作前缀/用户/时间范围)的 audit_log 追加流条目总数,分页 50 条/页——审计留痕为追加流不清零">共 {total} 条 · 第 {page + 1}/{pages} 页</span>
      </div>
      <div className="flex gap-1.5 flex-wrap items-center" data-audit-chips>
        <span className="text-xs text-jz-text-muted">动作快选:</span>
        {ACTION_CHIPS.map((c) => (
          <button key={c} onClick={() => { setAction(action === c ? '' : c); setPage(0); }}
            data-audit-chip={c}
            className={`px-2.5 py-0.5 rounded-full text-xs font-mono transition-colors ${action === c ? 'bg-neon-accent/10 text-neon-accent font-semibold' : 'text-jz-text-muted hover:bg-jz-elevated/50'}`}>{c}*</button>
        ))}
      </div>
      {logs.length === 0 && <div className="text-xs text-jz-text-muted p-3">无匹配审计记录(调整过滤条件)</div>}
      <div className="space-y-0.5">
        {logs.map((l: any) => (
          <div key={l.id} onClick={() => setDetailRow(l)} data-audit-row={l.id}
            className="h-[30px] flex items-center gap-2 px-2 text-xs hover:bg-jz-elevated/30 rounded cursor-pointer">
            <span className="font-mono text-jz-text-muted flex-none w-40">{fmtTs(l.ts)}</span>
            <span className={`px-1.5 py-0.5 rounded font-mono flex-none ${actClass(l.action)}`}>{l.action}</span>
            <span className="w-20 flex-none text-jz-text-muted">{l.username}</span>
            <span className="w-28 flex-none font-mono text-jz-text-muted">{l.ip || '—'}</span>
            <span className="flex-1 truncate text-jz-text-secondary">{l.detail || ''}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <button disabled={page <= 0} onClick={() => setPage(page - 1)}
          className="px-2 py-1 rounded-md bg-jz-elevated/60 text-jz-text-muted disabled:opacity-30" data-audit-prev>‹ 上一页</button>
        <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}
          className="px-2 py-1 rounded-md bg-jz-elevated/60 text-jz-text-muted disabled:opacity-30" data-audit-next>下一页 ›</button>
        <span className="text-jz-text-muted">点击行查看完整 detail</span>
      </div>
      {/* R103-4③: 行右滑抽屉(detail 美化;载荷不留存如实标注) */}
      <Drawer open={!!detailRow} title={`审计详情 #${detailRow?.id ?? ''}`} onClose={() => setDetailRow(null)}>
        {detailRow && (
          <div className="text-xs space-y-2 font-mono" data-audit-drawer>
            <div className="grid grid-cols-[64px_1fr] gap-1 text-jz-text-muted">
              <span>动作</span><span><span className={`px-1.5 py-0.5 rounded ${actClass(detailRow.action)}`}>{detailRow.action}</span></span>
              <span>用户</span><span className="text-jz-text-secondary">{detailRow.username || '—'}</span>
              <span>来源 IP</span><span className="text-jz-text-secondary">{detailRow.ip || '—'}</span>
              <span>时间</span><span className="text-jz-text-secondary">{fmtTs(detailRow.ts)}</span>
            </div>
            <div className="text-jz-text-muted">detail:</div>
            <pre data-detail-pre className="whitespace-pre-wrap break-all bg-jz-elevated/60 rounded-lg p-2 text-xs text-jz-text-secondary max-h-[52vh] overflow-auto">{pretty(detailRow.detail)}</pre>
            <div className="text-xs text-vuln-critical/80 leading-4">注: 审计仅存元数据与 detail 摘要,请求/响应载荷不留存(载荷级存储=挂账)。</div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

// R353: API Token 管理面板——R351 write scope 的 UI 消费面(此前前端零消费,签发只能 curl)。
// 后端三端点既有: GET/POST /api/tokens + DELETE /api/tokens/{tid}(admin/super_admin 闸,audit 留痕)。
// 签发响应的 token 明文只在本组件 issued 状态内存中,不落 localStorage/不进日志;Modal 关闭即弃。
function TokensTab() {
  const role = useAuth((s) => s.me?.role) || '';
  const canManage = role === 'admin' || role === 'super_admin';
  const [items, setItems] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'read' | 'write'>('read');
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ token: string; name: string; scope: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<any | null>(null);
  const load = () => api<any>('/api/tokens').then((d) => setItems(d?.items || [])).catch(() => setItems([]));
  useEffect(() => { if (canManage) load(); }, [canManage]);
  const issue = async () => {
    setMsg(''); setBusy(true);
    try {
      const r = await api<any>('/api/tokens', { method: 'POST', body: JSON.stringify({ name: name || 'ci-token', scope }) });
      setIssued({ token: r?.token || '', name: r?.name || '', scope: r?.scope || scope });
      setName(''); load();
    } catch (e: any) { setMsg(e?.message || '签发失败'); }
    setBusy(false);
  };
  const revoke = async (tid: number) => {
    try { await api(`/api/tokens/${tid}`, { method: 'DELETE' }); } catch { /* 行内不报错刷屏,列表态即真值 */ }
    setRevokeTarget(null); load();
  };
  if (!canManage) {
    return (
      <div className="rounded-2xl bg-jz-surface shadow-jz-card p-6 text-center" data-tokens-noauth>
        <div className="text-xs text-jz-text-muted">API Token 管理仅 admin/super_admin 可用——当前角色 {role || '未知'}(后端三端点对该角色 403,此为权限语义非故障)。</div>
      </div>
    );
  }
  return (
    <div className="space-y-3" data-tokens-panel>
      <div className="rounded-2xl bg-jz-surface shadow-jz-card p-3">
        <div className="text-xs text-jz-text-muted mb-2">
          开放 API 凭据(V2 开放 API 化):read=只读查询;write=可驱动 onekey 全流程(建审计→发渗透→启动 autopilot→收报告)。
          签发后 token 明文<b className="text-neon-accent">仅显示一次</b>(GitHub PAT 同款语义),吊销立即生效。
        </div>
        <div className="flex items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="名称(如 ci-pipeline)"
            className="px-2 py-1 text-xs rounded bg-jz-elevated/60 text-jz-text-primary w-44" data-probe="token-name" />
          <select value={scope} onChange={(e) => setScope(e.target.value as 'read' | 'write')}
            className="px-2 py-1 text-xs rounded bg-jz-elevated/60 text-jz-text-primary" data-probe="token-scope">
            <option value="read">read(只读)</option>
            <option value="write">write(可驱动全流程)</option>
          </select>
          <Button onClick={issue} disabled={busy} data-probe="token-issue">{busy ? '签发中…' : '签发 Token'}</Button>
          {msg && <span className="text-xs text-red-400">{msg}</span>}
        </div>
      </div>
      <div className="rounded-2xl bg-jz-surface shadow-jz-card overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-jz-elevated text-jz-text-muted">
            <tr>
              <th className="text-left px-3 py-2">#</th>
              <th className="text-left px-3 py-2">名称</th>
              <th className="text-left px-3 py-2">scope</th>
              <th className="text-left px-3 py-2">状态</th>
              <th className="text-left px-3 py-2">创建时间</th>
              <th className="text-right px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="" data-probe={`token-row-${t.id}`}>
                <td className="px-3 py-2 font-mono">{t.id}</td>
                <td className="px-3 py-2">{t.name}</td>
                <td className="px-3 py-2">
                  <StatusBadge tone={t.scope === 'write' ? 'high' : 'medium'} title="R351: read=GET only;write=GET+写操作(外部系统驱动 onekey 全流程)">{t.scope}</StatusBadge>
                </td>
                <td className="px-3 py-2">{t.revoked_at ? <StatusBadge tone="critical">已吊销</StatusBadge> : <StatusBadge tone="info">active</StatusBadge>}</td>
                <td className="px-3 py-2 text-jz-text-muted">{t.created_at ? new Date(t.created_at * 1000).toLocaleString() : '—'}</td>
                <td className="px-3 py-2 text-right">
                  {!t.revoked_at && <button onClick={() => setRevokeTarget(t)} data-probe={`token-revoke-${t.id}`}
                    className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">吊销</button>}
                </td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-jz-text-muted">暂无 Token</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={!!issued} title={`Token 已签发 — ${issued?.name || ''}(${issued?.scope || ''})`} onClose={() => setIssued(null)}>
        <div className="space-y-3 w-[520px]">
          <div className="text-xs text-jz-text-muted">请立即复制保存——关闭后将<b className="text-neon-accent">无法再次查看</b>(服务端只存哈希,此为安全设计)。</div>
          <div className="px-3 py-2 rounded bg-jz-elevated/60 font-mono text-xs break-all select-all" data-probe="token-once">{issued?.token}</div>
          <div className="text-right"><Button onClick={() => setIssued(null)}>我已保存</Button></div>
        </div>
      </Modal>
      <Modal open={!!revokeTarget} title={`吊销 Token — ${revokeTarget?.name || ''}(#${revokeTarget?.id ?? ''})`} onClose={() => setRevokeTarget(null)}>
        <div className="space-y-3 w-[420px]">
          <div className="text-xs text-jz-text-secondary">吊销后该 Token 的所有请求立即 401(scope={revokeTarget?.scope});使用方需重新签发。确定吊销?</div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setRevokeTarget(null)}>取消</Button>
            <Button onClick={() => revoke(revokeTarget?.id)} data-probe="token-revoke-confirm">确认吊销</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// R354: Webhook 外推管理区块(与 Token 同 Tab——V2 开放 API 化配置面聚焦)。
// 消费 GET/POST/DELETE /api/webhooks + POST /api/webhooks/test(R354 四端点),
// 文件语义与 db._webhook_push(R180/R221 订阅过滤)同源,UI 零新契约。
function WebhookPanel() {
  const [hooks, setHooks] = useState<any[]>([]);
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
      setMsg('已触发测试推送(kind=system)——外推为异步,请查接收端是否收到并验签');
    } catch (e: any) { setMsg(e?.message || '触发失败'); }
  };
  const del = async (idx: number) => {
    try { await api(`/api/webhooks/${idx}`, { method: 'DELETE' }); } catch { /* 列表态即真值 */ }
    setDelTarget(null); load();
  };
  return (
    <div className="space-y-2" data-webhook-panel>
      <div className="flex items-center gap-2 text-xs text-jz-text-muted">
        <span className="font-medium text-jz-text-primary">Webhook 外推</span>
        <span title="R180: 通知异步 POST+HMAC-SHA256 签验;R221: kinds/levels 订阅白名单(未配置=全推)">事件外推到外部系统(CI/IM)</span>
      </div>
      <div className="rounded-2xl bg-jz-surface shadow-jz-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ci.example.com/hook(http(s):// 开头)"
            className="px-2 py-1 text-xs rounded bg-jz-elevated/60 text-jz-text-primary flex-1" data-probe="wh-url" />
          <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="签名 secret(可空=不签)"
            className="px-2 py-1 text-xs rounded bg-jz-elevated/60 text-jz-text-primary w-40" data-probe="wh-secret" type="password" />
        </div>
        <div className="flex items-center gap-2">
          <input value={kinds} onChange={(e) => setKinds(e.target.value)} placeholder="订阅 kinds 白名单(逗号分隔,空=全推;如 task,ai)"
            className="px-2 py-1 text-xs rounded bg-jz-elevated/60 text-jz-text-primary flex-1" data-probe="wh-kinds" />
          <Button onClick={add} disabled={busy || !url.trim()} data-probe="wh-add">{busy ? '添加中…' : '添加'}</Button>
        </div>
        {msg && <div className="text-xs text-jz-accent-cyan" data-probe="wh-msg">{msg}</div>}
      </div>
      {hooks.length > 0 && (
        <div className="rounded-2xl bg-jz-surface shadow-jz-card overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-jz-elevated text-jz-text-muted">
              <tr>
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">URL</th>
                <th className="text-left px-3 py-2">secret</th>
                <th className="text-left px-3 py-2">kinds 订阅</th>
                <th className="text-right px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {hooks.map((h) => (
                <tr key={h.idx} className="" data-probe={`wh-row-${h.idx}`}>
                  <td className="px-3 py-2 font-mono">{h.idx}</td>
                  <td className="px-3 py-2 break-all" title={h.url}>{h.url.length > 46 ? h.url.slice(0, 46) + '…' : h.url}</td>
                  <td className="px-3 py-2 text-jz-text-muted">{h.secret_masked || '未配置'}</td>
                  <td className="px-3 py-2">{(h.kinds || []).length ? h.kinds.join(', ') : '全推'}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setDelTarget(h)} data-probe={`wh-del-${h.idx}`}
                      className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors mr-1">删除</button>
                    <button onClick={test} data-probe={`wh-test-${h.idx}`}
                      className="px-2 py-0.5 rounded-md bg-jz-elevated/60 text-jz-text-secondary hover:text-neon-accent transition-colors">测试推送</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!delTarget} title={`删除 Webhook — #${delTarget?.idx ?? ''}`} onClose={() => setDelTarget(null)}>
        <div className="space-y-3 w-[420px]">
          <div className="text-xs text-jz-text-secondary break-all">{delTarget?.url}</div>
          <div className="text-xs text-jz-text-muted">删除后该接收端不再收到任何事件外推。确定?</div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDelTarget(null)}>取消</Button>
            <Button onClick={() => del(delTarget?.idx)} data-probe="wh-del-confirm">确认删除</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
