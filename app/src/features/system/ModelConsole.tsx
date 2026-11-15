import React, { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Plug } from 'lucide-react';
import {
  Button, Panel, StatusBadge, Tag, SkeletonLoader, EmptyState, Field, Input, Select, Checkbox, Drawer, ConfirmDialog, InlineAlert, FactRow,
} from '@/components/ui';
import { api } from '@/services/api';

/** R52 P0-1: G2 模型路由控制台 —— 供应商卡片矩阵 + 配置抽屉(脱敏 key) + 三段式连通性探针 + 分流规则。
 *  纪律: 明文 key 永不落 localStorage/回显,仅经请求体传后端 600 存储。 */

type ProbeStage = { stage: string; ok?: boolean; rtt_ms?: number; http?: number; tps?: number; tokens?: number; error?: string };
type Probe = { error_class?: string; stages?: ProbeStage[]; tps?: number } | null;

// 模型选择目录：value 必须是厂商真实 API model id；label 仅做友好展示。
const MODEL_CATALOG: Record<string, { value: string; label: string; tag?: string }[]> = {
  deepseek: [
    { value: 'deepseek-flash', label: 'DeepSeek-V4.1-Flash', tag: '最新' },
    { value: 'deepseek-v4-pro', label: 'DeepSeek-V4-Pro', tag: '强推理' },
    { value: 'deepseek-chat', label: 'DeepSeek Chat', tag: '兼容旧版' },
    { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner', tag: '兼容旧版' },
  ],
  glm: [
    { value: 'glm-4-plus', label: 'GLM-4 Plus', tag: '主力' },
    { value: 'glm-4-flash', label: 'GLM-4 Flash', tag: '快速' },
  ],
  qwen: [
    { value: 'qwen-plus', label: 'Qwen Plus', tag: '通用' },
    { value: 'qwen-max', label: 'Qwen Max', tag: '强推理' },
    { value: 'qwen-turbo', label: 'Qwen Turbo', tag: '快速' },
  ],
  openai_compat: [
    { value: 'gpt-4o-mini', label: 'GPT-4o mini', tag: '通用' },
    { value: 'gpt-4o', label: 'GPT-4o', tag: '强推理' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', tag: '通用' },
    { value: 'claude-opus-4-1', label: 'Claude Opus 4.1', tag: '强推理' },
  ],
  ollama: [
    { value: 'qwen2.5:7b', label: 'Qwen2.5 7B', tag: '本地' },
    { value: 'llama3.1:8b', label: 'Llama 3.1 8B', tag: '本地' },
  ],
};
const REASONING_OPTIONS = [
  { value: 'fast', label: 'Fast · 快速' },
  { value: 'balanced', label: 'Balanced · 均衡' },
  { value: 'max', label: 'Max · 深入' },
];

const VENDORS = [
  { key: 'openai_compat', label: 'OpenAI 兼容', hint: '任意 OpenAI 协议端点' },
  { key: 'anthropic', label: 'Anthropic', hint: 'api.anthropic.com · OpenAI 兼容层' },
  { key: 'qwen', label: '通义千问', hint: 'DashScope 兼容模式' },
  { key: 'glm', label: '智谱 GLM', hint: 'open.bigmodel.cn' },
  { key: 'deepseek', label: 'DeepSeek', hint: 'api.deepseek.com' },
  { key: 'ollama', label: 'Ollama 本地', hint: '127.0.0.1:11434' },
];

export const ModelConsole: React.FC = () => {
  const [data, setData] = useState<{ providers: any[]; active_id: string | null; active_model?: string } | null>(null);
  const [routing, setRouting] = useState<{ inference?: string | null; cleaning?: string | null; report?: string | null; fallback?: string | null } | null>(null);
  const [drawer, setDrawer] = useState<null | { mode: 'add'; vendor: string } | { mode: 'edit'; provider: any }>(null);
  const [probes, setProbes] = useState<Record<string, Probe>>({});
  const [probing, setProbing] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [confirmDel, setConfirmDel] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(() => {
    api<any>('/api/models/providers').then((r) => { setData(r); setLoadFailed(false); }).catch(() => { setData({ providers: [], active_id: null }); setLoadFailed(true); });
    api<any>('/api/models/routing').then((r) => setRouting(r.routing)).catch(() => setRouting(null));
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const runProbe = async (pid: string) => {
    setProbing(pid);
    try {
      const r = await api<any>('/api/models/handshake', { method: 'POST', body: JSON.stringify({ provider_id: pid }) });
      setProbes((p) => ({ ...p, [pid]: r }));
    } catch (e: any) {
      setProbes((p) => ({ ...p, [pid]: { error_class: 'NETWORK', stages: [{ stage: 'DNS+TLS', ok: false, error: String(e).slice(0, 80) }] } }));
    } finally {
      setProbing(null);
    }
  };

  const saveRouting = async (key: string, pid: string) => {
    const next = { ...(routing || {}), [key]: pid || null };
    setRouting(next);
    await api('/api/models/routing', { method: 'PUT', body: JSON.stringify({ routing: next }) });
    setToast('分流规则已保存');
    setTimeout(() => setToast(''), 2000);
  };

  const activate = async (pid: string) => {
    await api(`/api/models/providers/${pid}/activate`, { method: 'POST' });
    reload();
  };

  const remove = async (pid: string) => {
    await api(`/api/models/providers/${pid}`, { method: 'DELETE' });
    reload();
  };

  if (!data) return <Panel title="模型服务"><SkeletonLoader variant="card" rows={2} /></Panel>;
  const ps = data.providers || [];

  return (
    <div className="flex flex-col gap-6">
      {toast && <div data-toast role="status" className="fixed right-6 top-14 z-50 rounded-control border border-jz-teal bg-jz-surface px-3 py-1.5 text-label text-jz-teal shadow-card">{toast}</div>}

      {/* Health first: what is working right now, read from data this console already loaded. Settings follow. */}
      <section aria-label="模型服务健康" className="overflow-hidden rounded-panel border border-jz-border bg-jz-surface shadow-card" data-model-health>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-jz-border px-5 py-3.5">
          <h2 className="text-section font-semibold text-jz-ink">健康状态</h2>
          <p className="text-meta text-jz-muted">探针结果只来自本次打开页面后手动运行的探针。</p>
        </div>
        {(() => {
          const slots = ['inference', 'cleaning', 'report', 'fallback'];
          const routed = slots.filter((k) => (routing as any)?.[k]).length;
          const keyed = ps.filter((p) => p.key_masked).length;
          const probed = ps.filter((p) => probes[p.id]);
          const okN = probed.filter((p) => probes[p.id]?.error_class === 'OK').length;
          return (
            <FactRow className="px-5 py-4" facts={[
              { label: '供应商', value: ps.length, hint: `已启用 ${ps.filter((p) => p.enabled !== false).length}` },
              { label: '主力模型', value: <span className="text-body font-medium">{(() => { const a = ps.find((p) => p.id === data.active_id); return a ? `${a.label || a.vendor || a.name || a.id} · ${a.model || '—'}` : data.active_model || '未设置'; })()}</span> },
              { label: '已配置 Key', value: `${keyed}/${ps.length}`, tone: ps.length && keyed < ps.length ? 'attention' : 'default' },
              { label: '分流规则', value: `${routed}/${slots.length}`, tone: routed < slots.length ? 'attention' : 'success', hint: routed < slots.length ? '有任务类型未配置模型' : '全部已配置' },
              { label: '探针', value: probed.length ? `${okN}/${probed.length}` : '—', tone: probed.length && okN < probed.length ? 'danger' : probed.length ? 'success' : 'default', hint: probed.length ? '通过 / 已探测' : '尚未探测' },
            ]} />
          );
        })()}
        {ps.length > 0 && (
          <ul className="divide-y divide-jz-border border-t border-jz-border">
            {ps.map((p) => {
              const pr = probes[p.id];
              const ms = pr ? (pr.stages || []).reduce((n: number, st: ProbeStage) => n + (st.rtt_ms || 0), 0) : 0;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-label" data-health-row={p.id}>
                  <span className="min-w-0 flex-1 basis-40 truncate font-medium text-jz-ink">{p.label || p.vendor || p.name || p.id}<span className="ml-2 font-mono text-meta text-jz-muted">{p.model || '—'}</span></span>
                  {data.active_id === p.id && <StatusBadge tone="brand">主力</StatusBadge>}
                  {p.enabled === false && <StatusBadge tone="neutral">已停用</StatusBadge>}
                  <StatusBadge tone={p.key_masked ? 'success' : 'attention'}>{p.key_masked ? 'Key 已配置' : 'Key 未配置'}</StatusBadge>
                  <StatusBadge tone={!pr ? 'neutral' : pr.error_class === 'OK' ? 'success' : 'danger'}>
                    {!pr ? '未探测' : pr.error_class === 'OK' ? `探针通过${ms ? ` · ${ms}ms` : ''}` : `探针失败 · ${pr.error_class || '未知'}`}
                  </StatusBadge>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <h2 className="jz-section -mb-2 text-jz-ink" data-model-settings>设置</h2>
      <Panel title="分流规则" description="主模型返回 429 或超出限额时自动改用兜底模型,并在时间线上标记。">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 desktop:grid-cols-4">
          {[['inference', '推理任务(逆向、因果分析)'], ['cleaning', '清洗任务(流量、日志)'], ['report', '报告生成'], ['fallback', '兜底模型']].map(([k, label]) => (
            <Field key={k} label={label}>
              {(ids) => (
                <Select ids={ids} value={(routing as any)?.[k] || ''} onChange={(e) => saveRouting(k, e.target.value)}>
                  <option value="">未配置</option>
                  {ps.map((p) => <option key={p.id} value={p.id}>{p.label || p.vendor || p.name || p.id} · {p.model}</option>)}
                </Select>
              )}
            </Field>
          ))}
        </div>
      </Panel>

      <Panel title={`供应商(${ps.length})`} description="模型服务的连接配置。连通性探针依次检查 DNS 与 TLS、鉴权和一次生成请求。">
        {loadFailed && <InlineAlert tone="danger" className="mb-3" action={<Button size="sm" variant="secondary" onClick={reload}>重试</Button>}>供应商列表没有加载成功,下面的内容可能不完整。</InlineAlert>}
        {ps.length === 0 ? (
          <EmptyState compact icon={Plug} title="还没有配置供应商" cause="从下方“添加供应商”选择一种开始。" />
        ) : (
          <div className="grid grid-cols-1 gap-3 desktop:grid-cols-2">
            {ps.map((p) => {
              const pr = probes[p.id];
              const active = data.active_id === p.id;
              const ms = pr ? (pr.stages || []).reduce((n: number, s: ProbeStage) => n + (s.rtt_ms || 0), 0) : 0;
              return (
                <div key={p.id} data-provider-card={p.id}
                  className={`flex min-w-0 flex-col gap-2 rounded-card border bg-jz-surface p-4 ${active ? 'border-jz-brand' : 'border-jz-border'}`}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate text-body font-semibold text-jz-ink">{p.label || p.vendor || p.name || p.id}</span>
                    {active && <StatusBadge tone="brand">主力</StatusBadge>}
                    {p.enabled === false && <StatusBadge tone="neutral">已停用</StatusBadge>}
                    <span className="ml-auto flex-none font-mono text-meta tnum text-jz-muted">并发 {p.concurrency ?? 2}</span>
                  </div>
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-label">
                    <dt className="text-jz-muted">端点</dt><dd className="truncate font-mono text-jz-ink-2" title={p.base_url}>{p.base_url || '—'}</dd>
                    <dt className="text-jz-muted">模型</dt><dd className="truncate font-mono text-jz-ink-2">{p.model || '—'}</dd>
                    <dt className="text-jz-muted">推理等级</dt><dd className="text-jz-ink-2">{p.reasoning || 'balanced'}</dd>
                    <dt className="text-jz-muted">Key</dt><dd className="truncate font-mono text-jz-ink-2">{p.key_masked || '未配置'}</dd>
                  </dl>
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-jz-border pt-2">
                    <Button size="sm" variant="secondary" onClick={() => setDrawer({ mode: 'edit', provider: p })}>配置</Button>
                    <Button size="sm" variant="subtle" onClick={() => runProbe(p.id)} disabled={probing === p.id}>
                      {probing === p.id
                        ? <span data-probe-busy className="inline-flex items-center gap-1.5">
                            <span aria-hidden className="inline-block h-2.5 w-2.5 animate-spin rounded-pill border border-current border-t-transparent" />探测中…
                          </span>
                        : '连通性探针'}
                    </Button>
                    {!active && <Button size="sm" variant="subtle" onClick={() => activate(p.id)}>设为主力</Button>}
                    <Button size="sm" variant="ghost" className="ml-auto text-jz-red" onClick={() => setConfirmDel(p)}>删除</Button>
                  </div>
                  {pr && (
                    <div data-probe-result role="status"
                      className={`space-y-0.5 rounded-control border p-2 font-mono text-meta ${pr.error_class === 'OK' ? 'border-jz-teal bg-jz-surface-2 text-jz-teal' : 'border-jz-red bg-jz-surface-2 text-jz-red'}`}>
                      <div>分类: {pr.error_class || '—'}{ms ? ` · 总时延 ${ms}ms` : ''}{pr.tps ? ` · TPS ${pr.tps}` : ''}</div>
                      {(pr.stages || []).map((s, i) => (
                        <div key={i}>{s.ok ? '✓' : '✗'} {s.stage}{s.rtt_ms != null ? ` · ${s.rtt_ms}ms` : ''}{s.http ? ` · HTTP ${s.http}` : ''}{s.tokens ? ` · ${s.tokens} tokens` : ''}{s.error ? ` · ${s.error}` : ''}</div>
                      ))}
                      {pr.error_class === 'AUTH_ERROR' && <div className="font-sans text-jz-ink-2">API Key 无效或已过期。到供应商控制台重新签发后更新。</div>}
                      {pr.error_class === 'NETWORK' && <div className="font-sans text-jz-ink-2">网络不可达。检查代理和 DNS 配置。</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="添加供应商">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 desktop:grid-cols-3 wide:grid-cols-6">
          {VENDORS.map((v) => (
            <button key={v.key} type="button" onClick={() => setDrawer({ mode: 'add', vendor: v.key })}
              className="min-w-0 rounded-card border border-jz-border bg-jz-surface-2 p-3 text-left transition-colors duration-hover hover:border-jz-brand">
              <div className="text-label font-semibold text-jz-ink">{v.label}</div>
              <div className="truncate text-meta text-jz-muted">{v.hint}</div>
            </button>
          ))}
        </div>
      </Panel>

      {drawer && (
        <ConfigDrawer
          drawer={drawer}
          onClose={() => setDrawer(null)}
          onSaved={() => { setDrawer(null); reload(); }}
        />
      )}

      <ConfirmDialog open={!!confirmDel} title="删除这个供应商?" destructive busy={deleting} confirmLabel="删除"
        outcome="删除后这条连接配置和保存的 Key 都会移除;分流规则里引用它的位置会变成未配置。需要时可以重新添加。"
        onCancel={() => setConfirmDel(null)}
        onConfirm={async () => { setDeleting(true); try { await remove(confirmDel.id); } finally { setDeleting(false); setConfirmDel(null); } }}>
        <span className="font-mono">{confirmDel ? `${confirmDel.label || confirmDel.vendor || confirmDel.name || confirmDel.id} · ${confirmDel.model}` : ''}</span>
      </ConfirmDialog>
    </div>
  );
};

function ConfigDrawer({ drawer, onClose, onSaved }: {
  drawer: { mode: 'add'; vendor: string } | { mode: 'edit'; provider: any };
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = drawer.mode === 'edit';
  const p = isEdit ? (drawer as any).provider : null;
  const vendor = isEdit ? (p?.vendor || 'custom') : (drawer as any).vendor;
  const modelPresets = MODEL_CATALOG[vendor] || [];
  const [baseUrl, setBaseUrl] = useState(p?.base_url || '');
  const [model, setModel] = useState(p?.model || '');
  const [reasoning, setReasoning] = useState(p?.reasoning || 'balanced');
  const [remoteModels, setRemoteModels] = useState<{ value: string; label: string; tag?: string }[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);   // R117-9②: masked by default
  const [concurrency, setConcurrency] = useState<number>(p?.concurrency ?? 2);
  const [enabled, setEnabled] = useState<boolean>(p?.enabled !== false);
  const [label, setLabel] = useState(p?.label || '');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setErr('');
    setSaving(true);
    const body: any = { base_url: baseUrl, model, concurrency, enabled, label, reasoning };
    if (apiKey) body.api_key = apiKey;
    try {
      const r = await api<any>(
        isEdit ? `/api/models/providers/${p.id}` : '/api/models/providers',
        { method: isEdit ? 'POST' : 'POST', body: JSON.stringify(body) },
      );
      if (r && r.status === 'ok') onSaved();
      else setErr(r?.detail || '保存失败');
    } catch (e: any) {
      setErr(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const all = [...modelPresets, ...remoteModels];
  const custom = !all.some((m) => m.value === model);

  return (
    <Drawer open title={isEdit ? '编辑供应商' : '新增供应商'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button onClick={save} loading={saving}>保存</Button></>}>
      <div data-config-drawer className="flex flex-col gap-4">
        <Field label="显示名">{(ids) => <Input ids={ids} value={label} onChange={(e) => setLabel(e.target.value)} />}</Field>
        <Field label="Base URL">{(ids) => <Input ids={ids} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://..." className="font-mono" />}</Field>
        <Field label={<>API Key {isEdit && p?.key_masked ? <span className="font-mono font-normal text-jz-muted">(当前 {p.key_masked})</span> : null}</>}
          hint="明文只放在请求体里发给后端保存,前端不写入本地存储,列表只显示脱敏后的值。">
          {(ids) => (
            <div className="relative">
              <Input ids={ids} type={showKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder={isEdit && p?.has_key ? '留空则保留原来的 Key' : 'sk-...'} autoComplete="off" className="pr-10 font-mono" />
              <button type="button" onClick={() => setShowKey(!showKey)} data-key-toggle
                title={showKey ? '隐藏 API Key' : '显示 API Key 明文(共享屏幕时请保持隐藏)'}
                aria-label={showKey ? '隐藏 API Key' : '显示 API Key'} aria-pressed={showKey}
                className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-control text-jz-muted hover:bg-jz-surface-2 hover:text-jz-ink">
                {showKey ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
              </button>
            </div>
          )}
        </Field>
        <Field label="模型" hint="填写厂商的 API model id;切换后从下一次评估开始生效。">
          {(ids) => (
            <div className="flex flex-col gap-2">
              <Select ids={ids} value={custom ? '__custom' : model} onChange={(e) => { const v = e.target.value; if (v !== '__custom') setModel(v); }}>
                <option value="__custom">自定义模型…</option>
                {all.map((m) => <option key={m.value} value={m.value}>{m.label}{m.tag ? ` · ${m.tag}` : ''}</option>)}
              </Select>
              {custom && (
                <Input value={model} onChange={(e) => setModel(e.target.value)} aria-label="自定义模型 id"
                  placeholder="deepseek-chat / deepseek-reasoner / glm-4-plus" className="font-mono" />
              )}
              {isEdit && (
                <div>
                  <Button size="sm" variant="subtle" loading={loadingModels} disabled={loadingModels}
                    onClick={async () => {
                      setLoadingModels(true);
                      try {
                        const r = await api<any>(`/api/models/providers/${p.id}/models`);
                        const ms = (r?.models || []).map((m: string) => ({ value: m, label: m, tag: 'API' }));
                        setRemoteModels(ms);
                      } finally { setLoadingModels(false); }
                    }}>
                    {loadingModels ? '拉取中…' : '拉取模型列表'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </Field>
        <Field label="推理等级" hint="Fast 60、Balanced 120、Max 240 条 L3 候选预算(这是本系统的预算,不是厂商 API 参数)。">
          {(ids) => (
            <Select ids={ids} value={reasoning} onChange={(e) => setReasoning(e.target.value)}>
              {REASONING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 items-end gap-4">
          <Field label="并发上限">{(ids) => <Input ids={ids} type="number" min={1} max={32} value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))} className="tnum" />}</Field>
          <div className="pb-2"><Checkbox label="启用" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /></div>
        </div>
        {err && <InlineAlert tone="danger">{err}</InlineAlert>}
      </div>
    </Drawer>
  );
}
