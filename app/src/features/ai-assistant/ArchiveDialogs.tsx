// ArchiveDialogs.tsx — the AI assistant archive's confirm and rename dialogs (they were the browser's confirm and
// prompt). Requests are the ones the page sent before: PATCH /api/chat/sessions/{id} {title: first 40 chars},
// DELETE /api/chat/sessions/{id} (one, or each selected); 真跑一次 calls back into the page. Cancel sends nothing.
import React, { useState } from 'react';
import { api } from '@/services/api';
import { Button, ConfirmDialog, Dialog, Field, Input } from '@/components/ui';
import type { ChatSession } from './components_ai/SessionSidebar';

export type ArchiveAsk = { kind: 'run' } | { kind: 'rename'; s: ChatSession } | { kind: 'del'; s: ChatSession } | { kind: 'batch'; ids: string[] };

const ArchiveDialogs: React.FC<{ ask: ArchiveAsk; onClose: () => void; onRun: () => void; onDone: (removed: string[]) => void }> = ({ ask, onClose, onRun, onDone }) => {
  const [text, setText] = useState(ask.kind === 'rename' ? ask.s.title || '' : '');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, removed: string[]) => { setBusy(true); try { await fn(); } catch { /* the reloaded list shows the real state */ } setBusy(false); onDone(removed); };
  if (ask.kind === 'run') return (
    <ConfirmDialog open destructive={false} confirmLabel="真跑一次" title="真跑一次提示词?"
      outcome="将当前组装原样真跑一次 LLM,消耗一次 API 调用(与会话隔离,不落历史)。" onCancel={onClose} onConfirm={() => { onClose(); onRun(); }} />
  );
  if (ask.kind === 'rename') {
    const save = () => run(() => api(`/api/chat/sessions/${ask.s.id}`, { method: 'PATCH', body: JSON.stringify({ title: text.slice(0, 40) }) }), []);
    return (
      <Dialog open onClose={onClose} title="重命名会话" dataAttrs={{ 'data-ai-rename-dialog': '' }}
        footer={<><Button variant="secondary" onClick={onClose} data-ai-rename-cancel>取消</Button><Button variant="primary" loading={busy} onClick={() => { void save(); }} data-ai-rename-ok>保存</Button></>}>
        <Field label="会话名称" hint="最多保存 40 个字">{(f) => (
          <Input id={f.id} value={text} data-autofocus onChange={(e) => setText(e.target.value)} data-ai-rename-input
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void save(); } }} />
        )}</Field>
      </Dialog>
    );
  }
  if (ask.kind === 'del') return (
    <ConfirmDialog open busy={busy} confirmLabel="删除" title={`删除会话「${ask.s.title || ask.s.id}」?`} outcome="会话和其中的消息会被删除。"
      onCancel={onClose} onConfirm={() => { void run(() => api(`/api/chat/sessions/${ask.s.id}`, { method: 'DELETE' }), [ask.s.id]); }} />
  );
  return (
    <ConfirmDialog open busy={busy} confirmLabel="批量删除" title={`批量删除所选 ${ask.ids.length} 个会话?`} outcome="不可恢复。"
      onCancel={onClose} onConfirm={() => { void run(() => Promise.allSettled(ask.ids.map((id) => api(`/api/chat/sessions/${id}`, { method: 'DELETE' }))), ask.ids); }} />
  );
};

export default ArchiveDialogs;
