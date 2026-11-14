import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
/** R56: Cmd+K 全局指令面板(本地规则匹配;LLM 兜底待 key)。 */
const CMDS = [
  { label: '态势仪表盘', to: '/dashboard' },
  { label: 'AI自动化渗透', to: '/pentest' },
  { label: '任务中心', to: '/tasks' },
  { label: '新建审计', to: '/new-audit' },
  { label: '报告中心', to: '/reports' },
  { label: 'Agent 工作台', to: '/agent' },
  { label: '系统设置', to: '/system' },
];
export const CmdPalette: React.FC = () => {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  const list = useMemo(() => CMDS.filter((c) => c.label.includes(q)), [q]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-start justify-center pt-24" onClick={() => setOpen(false)} data-cmdk>
      <div className="w-[460px] rounded-lg border border-jz-border bg-jz-bg shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="输入命令或页面名…"
          className="w-full px-4 py-3 bg-jz-bg text-xs text-jz-text-primary outline-none border-b border-jz-border" />
        <div className="max-h-64 overflow-auto">
          {list.map((c) => (
            <button key={c.to} onClick={() => { nav(c.to); setOpen(false); }}
              className="w-full text-left px-4 py-2 text-xs text-jz-text-secondary hover:bg-jz-elevated/60">{c.label}</button>
          ))}
          {!list.length && <div className="px-4 py-3 text-[11px] text-jz-text-muted">无匹配(LLM 兜底待 key)</div>}
        </div>
      </div>
    </div>
  );
};
