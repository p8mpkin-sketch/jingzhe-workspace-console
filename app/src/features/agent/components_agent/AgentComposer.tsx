import React, { useEffect, useRef, useState } from 'react';
import { Lock, Send, Square, Zap } from 'lucide-react';
import { api } from '@/services/api';

export const AgentComposer: React.FC<{
  running: boolean;
  disabled?: boolean;
  mode: 'agent' | 'quick';
  modeLocked?: boolean;
  onModeChange: (m: 'agent' | 'quick') => void;
  onSend: (text: string, model: string) => void;
  onStop: () => void;
  placeholder?: string;
}> = ({ running, disabled, mode, modeLocked, onModeChange, onSend, onStop, placeholder }) => {
  const [text, setText] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // 不再硬编码 deepseek-chat：读取系统设置里的 active provider 与模型，
  // 让 Agent 和 Harness 客户端使用同一个最新模型目录。
  useEffect(() => {
    const fallback = () => api<any>('/api/models/providers').then((d) => {
      const ps = (d?.providers || []).filter((p: any) => p.enabled !== false && p.model);
      const active = d?.active_id;
      return ps.map((p: any) => ({ value: p.model,
        label: `${p.label || p.vendor} · ${p.catalog_name || p.model}${p.badge ? ` ${p.badge}` : ''}${p.tier ? ` ${p.tier}` : ''} · ${p.model}${p.id === active ? ' · 主力' : ''}` }));
    }).catch(() => []);
    api<any>('/api/models/catalog').then((d) => {
      const rows = (d?.models || []).map((m: any) => ({
        value: m.value,
        label: `${m.provider_label || 'DeepSeek'} · ${m.catalog_name || m.value}${m.badge ? ` ${m.badge}` : ''}${m.tier ? ` ${m.tier}` : ''} · ${m.value}${m.value === d?.active_model ? ' · 主力' : ''}`,
      }));
      if (rows.length) setModels(rows);
      else void fallback().then(setModels);
    }).catch(() => { void fallback().then(setModels); });
  }, []);
  const fit = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(180, Math.max(56, ta.scrollHeight)) + 'px';
  };
  const submit = () => {
    const q = text.trim();
    if (!q || running || disabled) return;
    setText('');
    if (taRef.current) taRef.current.style.height = '56px';
    onSend(q, model);
  };
  return (
    <div className="rounded-2xl bg-jz-surface px-3 py-2 shadow-jz-card" data-agent-composer>
      <div className="flex items-center gap-2 mb-1.5">
        {modeLocked ? (
          <span className={`flex items-center gap-1 px-2 py-1 rounded-lg bg-jz-elevated/60 text-[11px] font-semibold ${mode === 'quick' ? 'text-vuln-safe' : 'text-neon-accent'}`} data-agent-mode-locked>
            <Lock size={10} /> {mode === 'quick' ? <><Zap size={10} /> 快速问答</> : '审计 Agent'}
          </span>
        ) : (
          <div className="flex items-center rounded-lg bg-jz-elevated/60 p-0.5" data-agent-mode>
            <button onClick={() => onModeChange('agent')} data-agent-mode-agent
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${mode === 'agent' ? 'bg-jz-surface text-neon-accent shadow-sm' : 'text-jz-text-muted'}`}>
              审计 Agent
            </button>
            <button onClick={() => onModeChange('quick')} data-agent-mode-quick
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold flex items-center gap-0.5 ${mode === 'quick' ? 'bg-jz-surface text-vuln-safe shadow-sm' : 'text-jz-text-muted'}`}>
              <Zap size={10} /> 快速问答
            </button>
          </div>
        )}
        <span className="text-[11px] text-jz-text-muted/60">
          {modeLocked ? '模式随会话固定' : (mode === 'quick' ? '仅查本地 KB，不跑工具/写操作' : '工具循环 + 审批 + 证据')}
        </span>
      </div>
      <textarea ref={taRef} value={text} onChange={(e) => { setText(e.target.value); fit(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        }}
        rows={1} data-agent-input
        placeholder={placeholder || (running ? 'Agent 正在执行，可停止…' : (mode === 'quick' ? '问一个本地知识库问题，例如：证书锁定有哪些结论？' : '问一个 APK 审计问题，例如：任务 #100367 有哪些高危发现？'))}
        className="block w-full resize-none bg-transparent text-[13px] leading-[1.6] text-jz-text-primary placeholder:text-jz-text-muted/60 outline-none"
        style={{ minHeight: 56, maxHeight: 180 }} />
      <div className="flex items-center gap-2 mt-1 pt-1.5">
        <select value={model} onChange={(e) => setModel(e.target.value)} data-agent-model
          className="px-1.5 py-0.5 rounded-md bg-jz-elevated/60 text-[11px] font-mono text-jz-text-muted outline-none">
          <option value="">跟随路由</option>
          {models.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <span className="text-[11px] text-jz-text-muted/60">Enter 发送 · Shift+Enter 换行</span>
        <span className="flex-1" />
        {running ? (
          <button onClick={onStop} data-agent-stop title="停止当前 Agent"
            className="flex-none h-8 px-3 rounded-full bg-vuln-critical/15 text-vuln-critical flex items-center gap-1 text-xs font-semibold hover:bg-vuln-critical/25">
            <Square size={11} /> 停止
          </button>
        ) : (
          <button onClick={submit} disabled={!text.trim() || disabled} data-agent-send
            className="flex-none w-9 h-9 rounded-full bg-gradient-to-br from-neon-accent to-vuln-safe text-white grid place-items-center disabled:opacity-30 hover:shadow-neon-glow transition-shadow">
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

export default AgentComposer;
