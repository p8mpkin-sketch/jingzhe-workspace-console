import React, { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Badge, Button, Skeleton } from '@/components/ui';
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
  { value: 'max', label: 'Max · 深审' },
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

  const reload = useCallback(() => {
    api<any>('/api/models/providers').then(setData).catch(() => setData({ providers: [], active_id: null }));
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

  if (!data) return <div className="p-3"><Skeleton className="h-24" /></div>;
  const ps = data.providers || [];

  return (
    <div className="space-y-4 relative">
      {toast && <div data-toast className="fixed top-14 right-6 z-50 px-3 py-1.5 rounded bg-vuln-safe/15 border border-vuln-safe/40 text-vuln-safe text-xs">{toast}</div>}

      {/* 分流规则 */}
      <section className="rounded-2xl bg-jz-surface shadow-jz-card p-4">
        <div className="text-xs font-semibold text-jz-text-primary mb-2">模型分流规则 <span className="text-jz-text-muted font-normal">主模型 429/超限时自动降级至兜底并在时间线标记回退</span></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[['inference', '推理任务(逆向/因果)'], ['cleaning', '清洗任务(流量/日志)'], ['report', '报告生成'], ['fallback', '兜底模型']].map(([k, label]) => (
            <label key={k} className="text-xs text-jz-text-muted space-y-1 block">
              {label}
              <select value={(routing as any)?.[k] || ''} onChange={(e) => saveRouting(k, e.target.value)}
                className="w-full bg-jz-elevated border border-transparent rounded px-2 py-1.5 text-xs text-jz-text-primary">
                <option value="">未配置</option>
                {ps.map((p) => <option key={p.id} value={p.id}>{p.label || p.vendor} · {p.model}</option>)}
              </select>
            </label>
          ))}
        </div>
      </section>

      {/* 供应商卡片 */}
      <section>
        <div className="text-xs font-semibold text-jz-text-primary mb-2">供应商({ps.length})</div>
        {ps.length === 0 && <div className="text-xs text-jz-text-muted p-3 rounded-lg border border-dashed border-jz-border/60 bg-jz-elevated">尚未配置供应商——点下方卡片开始</div>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {ps.map((p) => {
            const pr = probes[p.id];
            return (
              <div key={p.id} data-provider-card={p.id}
                className={`rounded-xl p-3 bg-jz-surface shadow-jz-card space-y-2 ring-1 ${data.active_id === p.id ? 'ring-neon-accent/60' : 'ring-transparent hover:ring-jz-border'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-jz-text-primary">{p.label || p.vendor}</span>
                  {data.active_id === p.id && <Badge level="safe">主力</Badge>}
                  {p.enabled === false && <Badge level="medium">已停用</Badge>}
                  <span className="ml-auto text-xs font-mono text-jz-text-muted">并发 {p.concurrency ?? 2}</span>
                </div>
                <div className="text-xs font-mono text-jz-text-muted truncate">{p.base_url} · {p.model}</div>
                <div className="text-[11px] text-jz-text-muted">推理等级: <span className="text-jz-text-secondary">{p.reasoning || 'balanced'}</span></div>
                <div className="text-xs font-mono text-jz-text-muted">key: {p.key_masked || '未配置'}</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setDrawer({ mode: 'edit', provider: p })}>配置</Button>
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => runProbe(p.id)}>
                    {probing === p.id
                      ? <span data-probe-busy className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full border border-current border-t-transparent animate-spin inline-block" />探测中…
                        </span>
                      : '连通性探针'}
                  </Button>
                  {data.active_id !== p.id && <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => activate(p.id)}>设为主力</Button>}
                  <Button variant="ghost" className="px-2 py-1 text-xs text-vuln-critical" onClick={() => remove(p.id)}>删除</Button>
                </div>
                  {pr && (
                  <div data-probe-result className={`rounded border p-2 text-xs font-mono space-y-0.5 ${pr.error_class === 'OK' ? 'border-vuln-safe/40 bg-vuln-safe/10 text-vuln-safe' : 'border-vuln-critical/40 bg-vuln-critical/10 text-vuln-critical'}`}>
                    <div>
                      分类: {pr.error_class || '—'}
                      {(() => { const ms = (pr.stages || []).reduce((n: number, s: ProbeStage) => n + (s.rtt_ms || 0), 0); return ms ? ` · 总时延 ${ms}ms` : ''; })()}
                      {pr.tps ? ` · TPS ${pr.tps}` : ''}
                    </div>
                    {(pr.stages || []).map((s, i) => (
                      <div key={i}>{s.ok ? '✓' : '✗'} {s.stage}{s.rtt_ms != null ? ` · ${s.rtt_ms}ms` : ''}{s.http ? ` · HTTP ${s.http}` : ''}{s.tokens ? ` · ${s.tokens} tokens` : ''}{s.error ? ` · ${s.error}` : ''}</div>
                    ))}
                    {pr.error_class === 'AUTH_ERROR' && <div className="text-jz-text-muted">API Key 无效/过期——到供应商控制台重新签发后更新</div>}
                    {pr.error_class === 'NETWORK' && <div className="text-jz-text-muted">网络不可达——检查代理/DNS 配置</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 新增入口 */}
      <section>
        <div className="text-xs font-semibold text-jz-text-primary mb-2">添加供应商</div>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
          {VENDORS.map((v) => (
            <button key={v.key} onClick={() => setDrawer({ mode: 'add', vendor: v.key })}
              className="rounded-xl bg-jz-elevated p-3 text-left hover:bg-jz-elevated/70 hover:ring-1 hover:ring-neon-accent/50 transition-all">
              <div className="text-xs font-semibold text-jz-text-primary">{v.label}</div>
              <div className="text-xs text-jz-text-muted truncate">{v.hint}</div>
            </button>
          ))}
        </div>
      </section>

      {drawer && (
        <ConfigDrawer
          drawer={drawer}
          onClose={() => setDrawer(null)}
          onSaved={() => { setDrawer(null); reload(); }}
        />
      )}
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
  const [showKey, setShowKey] = useState(false);   // R117-9②: 密文遮罩+零依赖眼睛显隐(默认圆点掩码防投屏泄露)
  const [concurrency, setConcurrency] = useState<number>(p?.concurrency ?? 2);
  const [enabled, setEnabled] = useState<boolean>(p?.enabled !== false);
  const [label, setLabel] = useState(p?.label || '');
  const [err, setErr] = useState('');

  const save = async () => {
    setErr('');
    const body: any = { base_url: baseUrl, model, concurrency, enabled, label, reasoning };
    if (apiKey) body.api_key = apiKey;
    const r = await api<any>(
      isEdit ? `/api/models/providers/${p.id}` : '/api/models/providers',
      { method: isEdit ? 'POST' : 'POST', body: JSON.stringify(body) },
    );
    if (r && r.status === 'ok') onSaved();
    else setErr(r?.detail || '保存失败');
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose} data-config-drawer>
      <div className="w-[380px] h-full bg-jz-surface shadow-jz-card p-4 space-y-3 overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-jz-text-primary">{isEdit ? '编辑供应商' : '新增供应商'}</span>
          <button onClick={onClose} className="text-jz-text-muted hover:text-jz-text-primary text-xs">关闭</button>
        </div>
        <label className="block text-xs text-jz-text-muted space-y-1">显示名
          <input value={label} onChange={(e) => setLabel(e.target.value)}
            className="w-full bg-jz-elevated border border-transparent rounded px-2 py-1.5 text-xs text-jz-text-primary" /></label>
        <label className="block text-xs text-jz-text-muted space-y-1">Base URL
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://..."
            className="w-full bg-jz-elevated border border-transparent rounded px-2 py-1.5 text-xs text-jz-text-primary font-mono" /></label>
        <label className="block text-xs text-jz-text-muted space-y-1">
          API Key {isEdit && p?.key_masked ? <span className="font-mono">(当前 {p.key_masked})</span> : ''}
          <div className="relative">
            <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={isEdit && p?.has_key ? '留空保留旧 key' : 'sk-...'}
              autoComplete="off"
              className="w-full bg-jz-elevated border border-transparent rounded px-2 py-1.5 pr-9 text-xs text-jz-text-primary font-mono" />
            {/* R117-9②: 纯 SVG 眼睛切换(默认 password 掩码;明文仅点按期间呈现) */}
            <button type="button" onClick={() => setShowKey(!showKey)} data-key-toggle
              title={showKey ? '隐藏 API Key(回到密文)' : '显示 API Key 明文(投屏时请保持隐藏)'}
              aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-jz-text-muted hover:text-neon-accent transition-colors">
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </label>
        <label className="block text-xs text-jz-text-muted space-y-1">模型
          <select
            value={[...modelPresets, ...remoteModels].some(m => m.value === model) ? model : '__custom'}
            onChange={(e) => {
              const v = e.target.value;
              if (v !== '__custom') setModel(v);
            }}
            className="w-full bg-jz-elevated border border-transparent rounded px-2 py-1.5 text-xs text-jz-text-primary">
            <option value="__custom">自定义模型…</option>
            {[...modelPresets, ...remoteModels].map(m => <option key={m.value} value={m.value}>{m.label}{m.tag ? ` · ${m.tag}` : ''}</option>)}
          </select>
          {![...modelPresets, ...remoteModels].some(m => m.value === model) && (
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-chat / deepseek-reasoner / glm-4-plus"
              className="w-full mt-1 bg-jz-elevated border border-transparent rounded px-2 py-1.5 text-xs text-jz-text-primary font-mono" />
          )}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-jz-text-muted">实际 API model id；切换后下一条审计生效</span>
            {isEdit && <button type="button" disabled={loadingModels}
              onClick={async () => {
                setLoadingModels(true);
                try {
                  const r = await api<any>(`/api/models/providers/${p.id}/models`);
                  const ms = (r?.models || []).map((m: string) => ({ value: m, label: m, tag: 'API' }));
                  setRemoteModels(ms);
                } finally { setLoadingModels(false); }
              }}
              className="ml-auto text-[11px] text-neon-accent hover:underline disabled:opacity-40">
              {loadingModels ? '拉取中…' : '拉取模型列表'}
            </button>}
          </div>
        </label>
        <label className="block text-xs text-jz-text-muted space-y-1">推理等级
          <select value={reasoning} onChange={(e) => setReasoning(e.target.value)}
            className="w-full bg-jz-elevated border border-transparent rounded px-2 py-1.5 text-xs text-jz-text-primary">
            {REASONING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="text-[11px] text-jz-text-muted">Fast 60 / Balanced 120 / Max 240 条 L3 候选预算（不是厂商 API 参数）</span>
        </label>
        <div className="flex gap-3">
          <label className="block text-xs text-jz-text-muted space-y-1 flex-1">并发上限
            <input type="number" min={1} max={32} value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))}
              className="w-full bg-jz-elevated border border-transparent rounded px-2 py-1.5 text-xs text-jz-text-primary" /></label>
          <label className="flex items-end gap-1.5 text-xs text-jz-text-muted pb-1.5">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />启用
          </label>
        </div>
        {err && <div className="text-xs text-vuln-critical">{err}</div>}
        <Button className="w-full" onClick={save}>保存</Button>
        <div className="text-xs text-jz-text-muted leading-4">key 明文仅经请求体传后端 600 权限文件存储;前端不落 localStorage,列表只回显脱敏形。</div>
      </div>
    </div>
  );
}
